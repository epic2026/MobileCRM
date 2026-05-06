-- Make p_manager_user_id optional on admin_create_tenant.
-- Super admin can now create a tenant without assigning a manager upfront.
-- Manager is assigned later via the Team tab (add admin → set as tenant manager).

CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  p_name text,
  p_slug text,
  p_manager_user_id uuid DEFAULT NULL
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_tenant public.tenants;
  manager_role   public.app_role;
  existing_tenant_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can create tenants';
  END IF;

  -- Validate manager only when one is supplied
  IF p_manager_user_id IS NOT NULL THEN
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
  END IF;

  INSERT INTO public.tenants (name, slug, owner_id, active)
  VALUES (btrim(p_name), lower(btrim(p_slug)), auth.uid(), true)
  RETURNING * INTO created_tenant;

  -- Add manager as tenant admin member only when provided
  IF p_manager_user_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (created_tenant.id, p_manager_user_id, 'admin');
  END IF;

  RETURN created_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, uuid) TO authenticated;
