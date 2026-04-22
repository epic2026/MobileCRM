-- Production tenant rebuild
-- Canonical model:
-- 1. Exactly one tenant per non-super-admin user.
-- 2. Exactly one tenant manager per tenant, and that manager must be an app-level admin.
-- 3. Tenant membership is the source of truth for user tenancy.
-- 4. CRM operational tables must always carry a tenant_id.

CREATE SEQUENCE IF NOT EXISTS public.tenant_code_seq;

CREATE OR REPLACE FUNCTION public.generate_tenant_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_code bigint;
BEGIN
  next_code := nextval('public.tenant_code_seq');
  RETURN 'TEN-' || lpad(next_code::text, 4, '0');
END;
$$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_code text;

ALTER TABLE public.tenants
  ALTER COLUMN tenant_code SET DEFAULT public.generate_tenant_code();

DO $$
DECLARE
  rec record;
  next_code bigint := 1;
  max_existing bigint;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.tenants
    WHERE tenant_code IS NULL OR btrim(tenant_code) = ''
    ORDER BY created_at, id
  LOOP
    UPDATE public.tenants
    SET tenant_code = 'TEN-' || lpad(next_code::text, 4, '0')
    WHERE id = rec.id;

    next_code := next_code + 1;
  END LOOP;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(tenant_code, '[^0-9]', '', 'g'), '')::bigint), 0)
  INTO max_existing
  FROM public.tenants;

  PERFORM setval('public.tenant_code_seq', GREATEST(max_existing, 1), true);
END;
$$;

ALTER TABLE public.tenants
  ALTER COLUMN tenant_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_code_key
  ON public.tenants (tenant_code);

UPDATE public.tenant_members
SET role = 'admin'
WHERE role::text = 'manager';

UPDATE public.tenant_invites
SET role = 'admin'
WHERE role::text = 'manager';

CREATE OR REPLACE FUNCTION public.user_primary_tenant_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  WHERE tm.user_id = p_user_id
  ORDER BY CASE tm.role::text
    WHEN 'admin' THEN 0
    WHEN 'owner' THEN 1
    ELSE 2
  END, tm.joined_at, tm.id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_user_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.user_id = p_user_id
        AND tm.tenant_id = p_tenant_id
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_primary_tenant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid, uuid) TO authenticated;

DELETE FROM public.tenant_members tm
USING public.user_roles ur
WHERE ur.user_id = tm.user_id
  AND ur.role::text = 'super_admin';

DO $$
DECLARE
  default_owner_id uuid;
  user_record record;
  chosen_tenant_id uuid;
  recovery_tenant_id uuid;
  desired_role public.tenant_role;
  safe_name text;
  safe_slug text;
BEGIN
  SELECT ur.user_id
  INTO default_owner_id
  FROM public.user_roles ur
  WHERE ur.role::text = 'super_admin'
  ORDER BY ur.created_at, ur.user_id
  LIMIT 1;

  IF default_owner_id IS NULL THEN
    SELECT id
    INTO default_owner_id
    FROM auth.users
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  FOR user_record IN
    SELECT
      p.id,
      COALESCE(NULLIF(btrim(p.full_name), ''), split_part(p.email, '@', 1), 'Workspace') AS display_name,
      p.email,
      public.get_user_role(p.id) AS app_role,
      p.tenant_id AS profile_tenant_id
    FROM public.profiles p
    WHERE COALESCE(public.get_user_role(p.id)::text, '') <> 'super_admin'
    ORDER BY p.created_at, p.id
  LOOP
    SELECT COALESCE(
      (
        SELECT tm.tenant_id
        FROM public.tenant_members tm
        WHERE tm.user_id = user_record.id
        ORDER BY CASE tm.role::text
          WHEN 'admin' THEN 0
          WHEN 'owner' THEN 1
          ELSE 2
        END, tm.joined_at, tm.id
        LIMIT 1
      ),
      user_record.profile_tenant_id,
      (
        SELECT ur.tenant_id
        FROM public.user_roles ur
        WHERE ur.user_id = user_record.id
          AND ur.tenant_id IS NOT NULL
        ORDER BY ur.created_at, ur.id
        LIMIT 1
      ),
      (
        SELECT src.tenant_id
        FROM (
          SELECT tenant_id, count(*) AS row_count
          FROM public.leads
          WHERE user_id = user_record.id AND tenant_id IS NOT NULL
          GROUP BY tenant_id
          UNION ALL
          SELECT tenant_id, count(*) AS row_count
          FROM public.call_logs
          WHERE user_id = user_record.id AND tenant_id IS NOT NULL
          GROUP BY tenant_id
          UNION ALL
          SELECT tenant_id, count(*) AS row_count
          FROM public.lead_tasks
          WHERE user_id = user_record.id AND tenant_id IS NOT NULL
          GROUP BY tenant_id
          UNION ALL
          SELECT tenant_id, count(*) AS row_count
          FROM public.lead_activities
          WHERE user_id = user_record.id AND tenant_id IS NOT NULL
          GROUP BY tenant_id
          UNION ALL
          SELECT tenant_id, count(*) AS row_count
          FROM public.call_recordings
          WHERE user_id = user_record.id AND tenant_id IS NOT NULL
          GROUP BY tenant_id
        ) src
        GROUP BY src.tenant_id
        ORDER BY sum(src.row_count) DESC, src.tenant_id
        LIMIT 1
      )
    )
    INTO chosen_tenant_id;

    IF chosen_tenant_id IS NULL THEN
      safe_name := user_record.display_name || ' Workspace';
      safe_slug := lower(regexp_replace(user_record.display_name, '[^a-zA-Z0-9]+', '-', 'g'));
      safe_slug := trim(both '-' from safe_slug);
      IF safe_slug = '' THEN
        safe_slug := 'workspace';
      END IF;
      safe_slug := safe_slug || '-' || substr(replace(user_record.id::text, '-', ''), 1, 8);

      INSERT INTO public.tenants (name, slug, owner_id, active)
      VALUES (safe_name, safe_slug, default_owner_id, true)
      RETURNING id INTO recovery_tenant_id;

      chosen_tenant_id := recovery_tenant_id;
    END IF;

    desired_role := CASE
      WHEN user_record.app_role::text = 'admin'
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_members tm
          WHERE tm.tenant_id = chosen_tenant_id
            AND tm.role::text = 'admin'
            AND tm.user_id <> user_record.id
        )
      THEN 'admin'::public.tenant_role
      ELSE 'member'::public.tenant_role
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = chosen_tenant_id
        AND tm.user_id = user_record.id
    ) THEN
      INSERT INTO public.tenant_members (tenant_id, user_id, role)
      VALUES (chosen_tenant_id, user_record.id, desired_role);
    END IF;
  END LOOP;
END;
$$;

DELETE FROM public.tenant_members tm
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY CASE role::text
        WHEN 'admin' THEN 0
        WHEN 'owner' THEN 1
        ELSE 2
      END, joined_at, id
    ) AS tenant_rank
  FROM public.tenant_members
) ranked
WHERE tm.id = ranked.id
  AND ranked.tenant_rank > 1;

UPDATE public.profiles p
SET tenant_id = CASE
  WHEN COALESCE(public.get_user_role(p.id)::text, '') = 'super_admin' THEN NULL
  ELSE public.user_primary_tenant_id(p.id)
END;

UPDATE public.user_roles ur
SET tenant_id = CASE
  WHEN ur.role::text = 'super_admin' THEN NULL
  ELSE public.user_primary_tenant_id(ur.user_id)
END;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_single_membership_per_user
  ON public.tenant_members (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_single_manager_per_tenant
  ON public.tenant_members (tenant_id)
  WHERE role = 'admin';

CREATE OR REPLACE FUNCTION public.validate_tenant_member_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_role public.app_role;
BEGIN
  IF COALESCE(public.get_user_role(NEW.user_id)::text, '') = 'super_admin' THEN
    RAISE EXCEPTION 'Super admins cannot be assigned to tenants';
  END IF;

  SELECT public.get_user_role(NEW.user_id)
  INTO app_role;

  IF NEW.role::text = 'admin' AND COALESCE(app_role::text, '') <> 'admin' THEN
    RAISE EXCEPTION 'Tenant manager must be an app-level admin';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = NEW.user_id
      AND tm.tenant_id <> NEW.tenant_id
      AND (TG_OP = 'INSERT' OR tm.id <> OLD.id)
  ) THEN
    RAISE EXCEPTION 'A user can belong to only one tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_tenant_member_assignment_trigger ON public.tenant_members;
CREATE TRIGGER validate_tenant_member_assignment_trigger
BEFORE INSERT OR UPDATE OF tenant_id, user_id, role
ON public.tenant_members
FOR EACH ROW
EXECUTE FUNCTION public.validate_tenant_member_assignment();

CREATE OR REPLACE FUNCTION public.sync_user_tenant_columns_from_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user_id uuid;
  next_tenant_id uuid;
BEGIN
  affected_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF affected_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF COALESCE(public.get_user_role(affected_user_id)::text, '') = 'super_admin' THEN
    UPDATE public.profiles
    SET tenant_id = NULL
    WHERE id = affected_user_id;

    UPDATE public.user_roles
    SET tenant_id = NULL
    WHERE user_id = affected_user_id;

    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT public.user_primary_tenant_id(affected_user_id)
  INTO next_tenant_id;

  UPDATE public.profiles
  SET tenant_id = next_tenant_id
  WHERE id = affected_user_id;

  UPDATE public.user_roles
  SET tenant_id = next_tenant_id
  WHERE user_id = affected_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_user_tenant_columns_from_membership_trigger ON public.tenant_members;
CREATE TRIGGER sync_user_tenant_columns_from_membership_trigger
AFTER INSERT OR UPDATE OR DELETE
ON public.tenant_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_tenant_columns_from_membership();

UPDATE public.leads l
SET tenant_id = COALESCE(l.tenant_id, public.user_primary_tenant_id(l.user_id))
WHERE l.tenant_id IS NULL;

UPDATE public.call_logs cl
SET tenant_id = COALESCE(
  ld.tenant_id,
  cl.tenant_id,
  public.user_primary_tenant_id(cl.user_id)
)
FROM public.leads ld
WHERE cl.lead_id = ld.id
  AND cl.tenant_id IS DISTINCT FROM COALESCE(ld.tenant_id, cl.tenant_id, public.user_primary_tenant_id(cl.user_id));

UPDATE public.call_logs cl
SET tenant_id = public.user_primary_tenant_id(cl.user_id)
WHERE cl.tenant_id IS NULL;

UPDATE public.lead_tasks lt
SET tenant_id = COALESCE(
  ld.tenant_id,
  lt.tenant_id,
  public.user_primary_tenant_id(lt.user_id)
)
FROM public.leads ld
WHERE lt.lead_id = ld.id
  AND lt.tenant_id IS DISTINCT FROM COALESCE(ld.tenant_id, lt.tenant_id, public.user_primary_tenant_id(lt.user_id));

UPDATE public.lead_tasks lt
SET tenant_id = public.user_primary_tenant_id(lt.user_id)
WHERE lt.tenant_id IS NULL;

UPDATE public.lead_activities la
SET tenant_id = COALESCE(
  ld.tenant_id,
  la.tenant_id,
  public.user_primary_tenant_id(la.user_id)
)
FROM public.leads ld
WHERE la.lead_id = ld.id
  AND la.tenant_id IS DISTINCT FROM COALESCE(ld.tenant_id, la.tenant_id, public.user_primary_tenant_id(la.user_id));

UPDATE public.lead_activities la
SET tenant_id = public.user_primary_tenant_id(la.user_id)
WHERE la.tenant_id IS NULL;

UPDATE public.call_recordings cr
SET tenant_id = COALESCE(
  ld.tenant_id,
  cl.tenant_id,
  cr.tenant_id,
  public.user_primary_tenant_id(cr.user_id)
)
FROM public.leads ld
LEFT JOIN public.call_logs cl ON cl.id = cr.call_log_id
WHERE cr.lead_id = ld.id
  AND cr.tenant_id IS DISTINCT FROM COALESCE(ld.tenant_id, cl.tenant_id, cr.tenant_id, public.user_primary_tenant_id(cr.user_id));

UPDATE public.call_recordings cr
SET tenant_id = COALESCE(
  cl.tenant_id,
  public.user_primary_tenant_id(cr.user_id)
)
FROM public.call_logs cl
WHERE cr.call_log_id = cl.id
  AND cr.tenant_id IS DISTINCT FROM COALESCE(cl.tenant_id, public.user_primary_tenant_id(cr.user_id));

UPDATE public.call_recordings cr
SET tenant_id = public.user_primary_tenant_id(cr.user_id)
WHERE cr.tenant_id IS NULL;

DO $$
DECLARE
  default_owner_id uuid;
  orphan_tenant_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leads WHERE tenant_id IS NULL
    UNION ALL
    SELECT 1 FROM public.call_logs WHERE tenant_id IS NULL
    UNION ALL
    SELECT 1 FROM public.lead_tasks WHERE tenant_id IS NULL
    UNION ALL
    SELECT 1 FROM public.lead_activities WHERE tenant_id IS NULL
    UNION ALL
    SELECT 1 FROM public.call_recordings WHERE tenant_id IS NULL
  ) THEN
    SELECT ur.user_id
    INTO default_owner_id
    FROM public.user_roles ur
    WHERE ur.role::text = 'super_admin'
    ORDER BY ur.created_at, ur.user_id
    LIMIT 1;

    IF default_owner_id IS NULL THEN
      SELECT id
      INTO default_owner_id
      FROM auth.users
      ORDER BY created_at, id
      LIMIT 1;
    END IF;

    INSERT INTO public.tenants (name, slug, owner_id, active)
    VALUES ('Legacy Orphans', 'legacy-orphans', default_owner_id, true)
    ON CONFLICT (slug) DO UPDATE SET updated_at = now()
    RETURNING id INTO orphan_tenant_id;

    UPDATE public.leads SET tenant_id = orphan_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.call_logs SET tenant_id = orphan_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.lead_tasks SET tenant_id = orphan_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.lead_activities SET tenant_id = orphan_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.call_recordings SET tenant_id = orphan_tenant_id WHERE tenant_id IS NULL;
  END IF;
END;
$$;

ALTER TABLE public.leads
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.call_logs
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.lead_tasks
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.lead_activities
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.call_recordings
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_lead_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_tenant_id uuid;
  owner_tenant_id uuid;
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  owner_tenant_id := public.user_primary_tenant_id(NEW.user_id);
  actor_tenant_id := public.user_primary_tenant_id(auth.uid());

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := COALESCE(owner_tenant_id, actor_tenant_id);
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF owner_tenant_id IS NOT NULL AND owner_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Lead user must belong to the same tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_lead_tenant_scope_trigger ON public.leads;
CREATE TRIGGER apply_lead_tenant_scope_trigger
BEFORE INSERT OR UPDATE OF tenant_id, user_id
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.apply_lead_tenant_scope();

CREATE OR REPLACE FUNCTION public.apply_related_record_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_tenant_id uuid;
  call_log_tenant_id uuid;
  owner_tenant_id uuid;
  actor_tenant_id uuid;
BEGIN
  IF TG_TABLE_NAME <> 'call_recordings' AND NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    owner_tenant_id := public.user_primary_tenant_id(NEW.user_id);
  END IF;

  actor_tenant_id := public.user_primary_tenant_id(auth.uid());

  IF NEW.lead_id IS NOT NULL THEN
    SELECT tenant_id INTO lead_tenant_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;

  IF TG_TABLE_NAME = 'call_recordings' AND NEW.call_log_id IS NOT NULL THEN
    SELECT tenant_id INTO call_log_tenant_id FROM public.call_logs WHERE id = NEW.call_log_id;
  END IF;

  NEW.tenant_id := COALESCE(lead_tenant_id, call_log_tenant_id, NEW.tenant_id, owner_tenant_id, actor_tenant_id);

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF owner_tenant_id IS NOT NULL AND owner_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Record user must belong to the same tenant';
  END IF;

  IF lead_tenant_id IS NOT NULL AND lead_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Record must match the lead tenant';
  END IF;

  IF call_log_tenant_id IS NOT NULL AND call_log_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Recording must match the call log tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_call_log_tenant_scope_trigger ON public.call_logs;
CREATE TRIGGER apply_call_log_tenant_scope_trigger
BEFORE INSERT OR UPDATE OF tenant_id, user_id, lead_id
ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.apply_related_record_tenant_scope();

DROP TRIGGER IF EXISTS apply_lead_task_tenant_scope_trigger ON public.lead_tasks;
CREATE TRIGGER apply_lead_task_tenant_scope_trigger
BEFORE INSERT OR UPDATE OF tenant_id, user_id, lead_id
ON public.lead_tasks
FOR EACH ROW
EXECUTE FUNCTION public.apply_related_record_tenant_scope();

DROP TRIGGER IF EXISTS apply_lead_activity_tenant_scope_trigger ON public.lead_activities;
CREATE TRIGGER apply_lead_activity_tenant_scope_trigger
BEFORE INSERT OR UPDATE OF tenant_id, user_id, lead_id
ON public.lead_activities
FOR EACH ROW
EXECUTE FUNCTION public.apply_related_record_tenant_scope();

DROP TRIGGER IF EXISTS apply_call_recording_tenant_scope_trigger ON public.call_recordings;
CREATE TRIGGER apply_call_recording_tenant_scope_trigger
BEFORE INSERT OR UPDATE OF tenant_id, user_id, lead_id, call_log_id
ON public.call_recordings
FOR EACH ROW
EXECUTE FUNCTION public.apply_related_record_tenant_scope();

CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  p_name text,
  p_slug text,
  p_manager_user_id uuid
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_tenant public.tenants;
  manager_role public.app_role;
  existing_tenant_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can create tenants';
  END IF;

  SELECT public.get_user_role(p_manager_user_id)
  INTO manager_role;

  IF COALESCE(manager_role::text, '') <> 'admin' THEN
    RAISE EXCEPTION 'Tenant manager must be an active admin user';
  END IF;

  SELECT public.user_primary_tenant_id(p_manager_user_id)
  INTO existing_tenant_id;

  IF existing_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Selected manager is already assigned to another tenant';
  END IF;

  INSERT INTO public.tenants (name, slug, owner_id, active)
  VALUES (btrim(p_name), lower(btrim(p_slug)), auth.uid(), true)
  RETURNING * INTO created_tenant;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (created_tenant.id, p_manager_user_id, 'admin');

  RETURN created_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_user_to_tenant(
  p_user_id uuid,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_tenant_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can assign tenant users';
  END IF;

  IF COALESCE(public.get_user_role(p_user_id)::text, '') = 'super_admin' THEN
    RAISE EXCEPTION 'Super admins cannot be assigned to tenants';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT public.user_primary_tenant_id(p_user_id)
  INTO existing_tenant_id;

  IF existing_tenant_id IS NOT NULL AND existing_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Selected user is already assigned to another tenant';
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (p_tenant_id, p_user_id, 'member')
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = CASE
    WHEN public.tenant_members.role = 'admin' THEN 'admin'::public.tenant_role
    ELSE 'member'::public.tenant_role
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_user_tenant(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can clear tenant assignments';
  END IF;

  DELETE FROM public.tenant_members
  WHERE user_id = p_user_id
    AND role <> 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_manager(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_tenant_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can update tenant managers';
  END IF;

  IF COALESCE(public.get_user_role(p_user_id)::text, '') <> 'admin' THEN
    RAISE EXCEPTION 'Tenant manager must be an admin user';
  END IF;

  SELECT public.user_primary_tenant_id(p_user_id)
  INTO existing_tenant_id;

  IF existing_tenant_id IS NOT NULL AND existing_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Selected manager is already assigned to another tenant';
  END IF;

  UPDATE public.tenant_members
  SET role = 'member'
  WHERE tenant_id = p_tenant_id
    AND role = 'admin'
    AND user_id <> p_user_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (p_tenant_id, p_user_id, 'admin')
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = 'admin';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_user_to_tenant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_user_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_manager(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view their own tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can create tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can delete tenants" ON public.tenants;

CREATE POLICY "Super admins and tenant users can view tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.user_has_tenant_access(auth.uid(), id)
);

CREATE POLICY "Super admins can create tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) AND owner_id = auth.uid());

CREATE POLICY "Super admins can update tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete tenants"
ON public.tenants
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view tenant memberships" ON public.tenant_members;
DROP POLICY IF EXISTS "Super admins can insert tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Super admins can update tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Super admins can delete tenant members" ON public.tenant_members;

CREATE POLICY "Tenant users can view memberships"
ON public.tenant_members
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.user_has_tenant_access(auth.uid(), tenant_id)
);

CREATE POLICY "Super admins can insert tenant members"
ON public.tenant_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update tenant members"
ON public.tenant_members
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete tenant members"
ON public.tenant_members
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view invites for their tenants" ON public.tenant_invites;
DROP POLICY IF EXISTS "Super admins can manage invites" ON public.tenant_invites;

CREATE POLICY "Super admins and tenant users can view invites"
ON public.tenant_invites
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.user_has_tenant_access(auth.uid(), tenant_id)
);

CREATE POLICY "Super admins can manage invites"
ON public.tenant_invites
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant users can view profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Tenant users can update profiles in their tenant" ON public.profiles;

CREATE POLICY "Tenant users can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(auth.uid(), tenant_id)
  )
);

CREATE POLICY "Tenant users can update profiles in their tenant"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(auth.uid(), tenant_id)
  )
)
WITH CHECK (
  id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(auth.uid(), tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant users can view roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant users can insert roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant users can delete roles in their tenant" ON public.user_roles;

CREATE POLICY "Tenant users can view roles in their tenant"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(auth.uid(), tenant_id)
  )
);

CREATE POLICY "Super admins can insert user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));
