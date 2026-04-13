-- Add super_admin role and reserve tenant management writes for super admins.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role::text = 'admin' AND role::text = 'super_admin')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role::text
    WHEN 'super_admin' THEN 0
    WHEN 'admin' THEN 1
    ELSE 2
  END
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

-- Restrict tenant writes to super admins.
DROP POLICY IF EXISTS "Users can create new tenants" ON public.tenants;
DROP POLICY IF EXISTS "Only owners can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Only owners can delete tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owners can insert tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Owners can update tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Owners can delete tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Admins and owners can manage invites" ON public.tenant_invites;

CREATE POLICY "Super admins can create tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  AND auth.uid() = owner_id
);

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

CREATE POLICY "Super admins can manage invites"
ON public.tenant_invites
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
