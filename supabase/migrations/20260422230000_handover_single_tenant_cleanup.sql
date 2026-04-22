-- Collapse the workspace to a single default tenant named Handover
-- and backfill any missing profiles from auth.users so all users appear
-- in the admin user list.

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at, is_active)
SELECT
  au.id,
  COALESCE(au.email, ''),
  COALESCE(au.raw_user_meta_data ->> 'full_name', split_part(COALESCE(au.email, ''), '@', 1), 'User'),
  COALESCE(au.created_at, now()),
  now(),
  true
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

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

  IF TG_TABLE_NAME = 'call_recordings' THEN
    IF NEW.call_log_id IS NOT NULL THEN
      SELECT tenant_id INTO call_log_tenant_id FROM public.call_logs WHERE id = NEW.call_log_id;
    END IF;
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

DO $$
DECLARE
  super_admin_id uuid;
  handover_tenant_id uuid;
  manager_user_id uuid;
BEGIN
  SELECT ur.user_id
  INTO super_admin_id
  FROM public.user_roles ur
  WHERE ur.role::text = 'super_admin'
  ORDER BY ur.created_at, ur.user_id
  LIMIT 1;

  IF super_admin_id IS NULL THEN
    SELECT id
    INTO super_admin_id
    FROM auth.users
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  SELECT t.id
  INTO handover_tenant_id
  FROM public.tenants t
  WHERE lower(t.slug) = 'handover'
     OR lower(t.name) = 'handover'
  ORDER BY t.created_at, t.id
  LIMIT 1;

  IF handover_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug, owner_id, active)
    VALUES ('Handover', 'handover', super_admin_id, true)
    RETURNING id INTO handover_tenant_id;
  ELSE
    UPDATE public.tenants
    SET
      name = 'Handover',
      slug = 'handover',
      owner_id = super_admin_id,
      active = true,
      updated_at = now()
    WHERE id = handover_tenant_id;
  END IF;

  UPDATE public.profiles
  SET tenant_id = CASE
    WHEN COALESCE(public.get_user_role(id)::text, '') = 'super_admin' THEN NULL
    ELSE handover_tenant_id
  END;

  UPDATE public.user_roles
  SET tenant_id = CASE
    WHEN role::text = 'super_admin' THEN NULL
    ELSE handover_tenant_id
  END;

  SELECT ur.user_id
  INTO manager_user_id
  FROM public.user_roles ur
  WHERE ur.role::text = 'admin'
  ORDER BY ur.created_at, ur.user_id
  LIMIT 1;

  IF manager_user_id IS NULL THEN
    SELECT p.id
    INTO manager_user_id
    FROM public.profiles p
    WHERE p.id <> super_admin_id
    ORDER BY p.created_at, p.id
    LIMIT 1;

    IF manager_user_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role, tenant_id)
      VALUES (manager_user_id, 'admin', handover_tenant_id)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  DELETE FROM public.tenant_invites;
  DELETE FROM public.tenant_members;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, joined_at)
  SELECT
    handover_tenant_id,
    p.id,
    CASE
      WHEN p.id = manager_user_id THEN 'admin'::public.tenant_role
      ELSE 'member'::public.tenant_role
    END,
    now()
  FROM public.profiles p
  WHERE COALESCE(public.get_user_role(p.id)::text, '') <> 'super_admin';

  UPDATE public.leads
  SET tenant_id = handover_tenant_id
  WHERE tenant_id IS DISTINCT FROM handover_tenant_id;

  UPDATE public.call_logs
  SET tenant_id = handover_tenant_id
  WHERE tenant_id IS DISTINCT FROM handover_tenant_id;

  UPDATE public.lead_tasks
  SET tenant_id = handover_tenant_id
  WHERE tenant_id IS DISTINCT FROM handover_tenant_id;

  UPDATE public.lead_activities
  SET tenant_id = handover_tenant_id
  WHERE tenant_id IS DISTINCT FROM handover_tenant_id;

  UPDATE public.call_recordings
  SET tenant_id = handover_tenant_id
  WHERE tenant_id IS DISTINCT FROM handover_tenant_id;

  DELETE FROM public.tenants
  WHERE id <> handover_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_tenant_manager(
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can remove tenant managers';
  END IF;

  UPDATE public.tenant_members
  SET role = 'member'
  WHERE tenant_id = p_tenant_id
    AND role = 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_tenant(
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fallback_tenant_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can delete tenants';
  END IF;

  SELECT id
  INTO fallback_tenant_id
  FROM public.tenants
  WHERE lower(slug) = 'handover'
  ORDER BY created_at, id
  LIMIT 1;

  IF fallback_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Default Handover tenant not found';
  END IF;

  IF p_tenant_id = fallback_tenant_id THEN
    IF (SELECT count(*) FROM public.tenants) <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the only remaining tenant';
    END IF;
  END IF;

  IF p_tenant_id <> fallback_tenant_id THEN
    UPDATE public.leads
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id;

    UPDATE public.call_logs
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id;

    UPDATE public.lead_tasks
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id;

    UPDATE public.lead_activities
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id;

    UPDATE public.call_recordings
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id;

    UPDATE public.profiles
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id
      AND COALESCE(public.get_user_role(id)::text, '') <> 'super_admin';

    UPDATE public.user_roles
    SET tenant_id = fallback_tenant_id
    WHERE tenant_id = p_tenant_id
      AND role::text <> 'super_admin';

    UPDATE public.tenant_members
    SET tenant_id = fallback_tenant_id,
        role = CASE WHEN role = 'admin' THEN 'member'::public.tenant_role ELSE role END
    WHERE tenant_id = p_tenant_id;

    DELETE FROM public.tenant_invites
    WHERE tenant_id = p_tenant_id;

    DELETE FROM public.tenant_members
    WHERE tenant_id = p_tenant_id;

    DELETE FROM public.tenants
    WHERE id = p_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_tenant_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_tenant(uuid) TO authenticated;
