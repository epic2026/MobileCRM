-- Ensure Admin Tenant is visible to all users now and in future.
-- 1) Backfill membership for all current auth users.
-- 2) Auto-attach newly created users to Admin Tenant.

DO $$
DECLARE
  v_admin_tenant_id uuid;
BEGIN
  SELECT id INTO v_admin_tenant_id
  FROM public.tenants
  WHERE slug = 'admin-tenant'
  LIMIT 1;

  IF v_admin_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    SELECT v_admin_tenant_id, u.id, 'member'::public.tenant_role
    FROM auth.users u
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.attach_new_user_to_admin_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_tenant_id uuid;
BEGIN
  SELECT id INTO v_admin_tenant_id
  FROM public.tenants
  WHERE slug = 'admin-tenant'
  LIMIT 1;

  IF v_admin_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_admin_tenant_id, NEW.id, 'member')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attach_new_user_to_admin_tenant ON auth.users;
CREATE TRIGGER trg_attach_new_user_to_admin_tenant
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.attach_new_user_to_admin_tenant();
