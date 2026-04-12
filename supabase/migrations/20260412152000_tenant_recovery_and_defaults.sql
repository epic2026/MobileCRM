-- Recovery migration for tenant rollout regressions:
-- 1) preserve legacy single-workspace behavior by assigning existing data to a default tenant
-- 2) auto-populate tenant_id on inserts when app payload does not provide it
-- 3) add missing write policies for tenant-scoped tables

-- Create a fallback/default tenant if none exists
DO $$
DECLARE
  v_owner_id uuid;
  v_owner_email text;
  v_tenant_id uuid;
  v_slug text;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT u.id, u.email
    INTO v_owner_id, v_owner_email
    FROM auth.users u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    ORDER BY CASE WHEN ur.role = 'admin' THEN 0 ELSE 1 END, u.created_at ASC
    LIMIT 1;

    IF v_owner_id IS NOT NULL THEN
      v_slug := regexp_replace(lower(split_part(coalesce(v_owner_email, 'workspace'), '@', 1)), '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from v_slug);
      IF v_slug = '' THEN
        v_slug := 'workspace';
      END IF;

      INSERT INTO public.tenants (name, slug, owner_id, subscription_plan, active)
      VALUES (
        coalesce(initcap(split_part(v_owner_email, '@', 1)), 'Workspace') || ' Workspace',
        v_slug || '-default',
        v_owner_id,
        'enterprise',
        true
      )
      RETURNING id INTO v_tenant_id;
    END IF;
  END IF;

  -- Add all users to fallback tenant to preserve prior all-data-visible behavior
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    SELECT v_tenant_id, u.id, 'member'::public.tenant_role
    FROM auth.users u
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- Ensure owner is marked owner in member table too
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    SELECT v_tenant_id, t.owner_id, 'owner'::public.tenant_role
    FROM public.tenants t
    WHERE t.id = v_tenant_id
    ON CONFLICT (tenant_id, user_id)
    DO UPDATE SET role = 'owner';

    UPDATE public.leads SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.call_logs SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.lead_tasks SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.lead_activities SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.call_recordings SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_tenant_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
    RETURN v_tenant_id;
  END IF;

  SELECT t.id
  INTO v_tenant_id
  FROM public.tenants t
  WHERE t.owner_id = p_user_id
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT tm.tenant_id
    INTO v_tenant_id
    FROM public.tenant_members tm
    WHERE tm.user_id = p_user_id
    ORDER BY tm.joined_at ASC
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  END IF;

  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_tenant_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    v_user_id := COALESCE(NEW.user_id, auth.uid());
    NEW.tenant_id := public.resolve_tenant_id_for_user(v_user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_leads_tenant_id_before_insert ON public.leads;
CREATE TRIGGER set_leads_tenant_id_before_insert
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_default_tenant_id_on_insert();

DROP TRIGGER IF EXISTS set_call_logs_tenant_id_before_insert ON public.call_logs;
CREATE TRIGGER set_call_logs_tenant_id_before_insert
BEFORE INSERT ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.set_default_tenant_id_on_insert();

DROP TRIGGER IF EXISTS set_lead_tasks_tenant_id_before_insert ON public.lead_tasks;
CREATE TRIGGER set_lead_tasks_tenant_id_before_insert
BEFORE INSERT ON public.lead_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_default_tenant_id_on_insert();

DROP TRIGGER IF EXISTS set_lead_activities_tenant_id_before_insert ON public.lead_activities;
CREATE TRIGGER set_lead_activities_tenant_id_before_insert
BEFORE INSERT ON public.lead_activities
FOR EACH ROW EXECUTE FUNCTION public.set_default_tenant_id_on_insert();

DROP TRIGGER IF EXISTS set_call_recordings_tenant_id_before_insert ON public.call_recordings;
CREATE TRIGGER set_call_recordings_tenant_id_before_insert
BEFORE INSERT ON public.call_recordings
FOR EACH ROW EXECUTE FUNCTION public.set_default_tenant_id_on_insert();

-- Missing write policies for lead_activities
CREATE POLICY "Users can insert activities in their tenant"
ON public.lead_activities
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update activities in their tenant"
ON public.lead_activities
FOR UPDATE
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete activities in their tenant"
ON public.lead_activities
FOR DELETE
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Missing write policies for call_recordings
CREATE POLICY "Users can insert recordings in their tenant"
ON public.call_recordings
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update recordings in their tenant"
ON public.call_recordings
FOR UPDATE
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete recordings in their tenant"
ON public.call_recordings
FOR DELETE
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Missing delete policy for lead_tasks
CREATE POLICY "Users can delete tasks in their tenant"
ON public.lead_tasks
FOR DELETE
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);
