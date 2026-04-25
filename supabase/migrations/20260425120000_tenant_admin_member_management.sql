-- Allow tenant admins to add and remove members from their own tenant.
-- Super admins can also call these functions.

CREATE OR REPLACE FUNCTION public.tenant_admin_add_member(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  existing_tenant_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    SELECT tm.role::text INTO caller_role
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid();

    IF caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only tenant admins can add members to this tenant';
    END IF;
  END IF;

  IF COALESCE(public.get_user_role(p_user_id)::text, '') = 'super_admin' THEN
    RAISE EXCEPTION 'Super admins cannot be assigned to tenants';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT public.user_primary_tenant_id(p_user_id) INTO existing_tenant_id;
  IF existing_tenant_id IS NOT NULL AND existing_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'User is already assigned to another tenant';
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (p_tenant_id, p_user_id, 'member')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
END;
$$;

-- Allow tenant admins to remove non-admin members from their own tenant.
CREATE OR REPLACE FUNCTION public.tenant_admin_remove_member(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  target_role text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    SELECT tm.role::text INTO caller_role
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid();

    IF caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only tenant admins can remove members from this tenant';
    END IF;
  END IF;

  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Cannot remove yourself from a tenant';
  END IF;

  SELECT tm.role::text INTO target_role
  FROM public.tenant_members tm
  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id;

  IF target_role = 'admin' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Tenant admins cannot remove other admins';
  END IF;

  DELETE FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_admin_add_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_admin_remove_member(uuid, uuid) TO authenticated;
