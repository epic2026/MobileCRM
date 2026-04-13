-- Create a default tenant named "Admin Tenant" and place all existing CRM data under it.
-- Idempotent: safe to run multiple times.

DO $$
DECLARE
  v_owner_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Prefer an admin user as owner; fallback to earliest user.
  SELECT u.id
  INTO v_owner_id
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  ORDER BY CASE WHEN ur.role = 'admin' THEN 0 ELSE 1 END, u.created_at ASC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No auth users found; cannot create default tenant.';
  END IF;

  -- Create or reuse a stable default tenant.
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = 'admin-tenant'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug, owner_id, subscription_plan, active)
    VALUES ('Admin Tenant', 'admin-tenant', v_owner_id, 'enterprise', true)
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants
    SET
      name = 'Admin Tenant',
      owner_id = v_owner_id,
      active = true,
      subscription_plan = 'enterprise'
    WHERE id = v_tenant_id;
  END IF;

  -- Ensure owner membership as owner.
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_owner_id, 'owner')
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = 'owner';

  -- Ensure every user is at least a member of Admin Tenant.
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  SELECT v_tenant_id, u.id, 'member'::public.tenant_role
  FROM auth.users u
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- Move all existing operational data to Admin Tenant.
  -- User requested: "Use all the data till now in that tenant".
  UPDATE public.leads SET tenant_id = v_tenant_id;
  UPDATE public.call_logs SET tenant_id = v_tenant_id;
  UPDATE public.lead_tasks SET tenant_id = v_tenant_id;
  UPDATE public.lead_activities SET tenant_id = v_tenant_id;
  UPDATE public.call_recordings SET tenant_id = v_tenant_id;
END $$;
