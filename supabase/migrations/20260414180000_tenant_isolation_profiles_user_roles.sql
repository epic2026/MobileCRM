-- 20260414_tenant_isolation_profiles_user_roles.sql
-- Enforce strict tenant isolation for profiles and user_roles

-- Remove old policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- Enable RLS if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only super_admins or users in the same tenant can view profiles
CREATE POLICY "Tenant users can view profiles in their tenant"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    OR id = auth.uid()
  );

-- Only super_admins or users in the same tenant can update profiles
CREATE POLICY "Tenant users can update profiles in their tenant"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    OR id = auth.uid()
  );

-- Only super_admins or users in the same tenant can view user_roles
CREATE POLICY "Tenant users can view roles in their tenant"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- Only super_admins or users in the same tenant can insert/delete user_roles
CREATE POLICY "Tenant users can insert roles in their tenant"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Tenant users can delete roles in their tenant"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );
