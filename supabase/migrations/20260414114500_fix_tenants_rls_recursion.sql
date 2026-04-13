-- Fix infinite recursion between tenants and tenant_members RLS policies.
-- Strategy: use SECURITY DEFINER helper functions and rebuild policies.

CREATE OR REPLACE FUNCTION public.user_is_tenant_owner(p_tenant_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.owner_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_tenant_member(p_tenant_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_tenant_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_member(uuid, uuid) TO authenticated;

-- Drop tenants policies (both old and current names)
DROP POLICY IF EXISTS "Users can view their own tenants" ON public.tenants;
DROP POLICY IF EXISTS "Only owners can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Only owners can delete tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users can create new tenants" ON public.tenants;

-- Recreate tenants policies (non-recursive)
CREATE POLICY "Users can view their own tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR public.user_is_tenant_member(id, auth.uid())
);

CREATE POLICY "Users can create new tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Only owners can update tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Only owners can delete tenants"
ON public.tenants
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- Drop tenant_members policies (both old and current names)
DROP POLICY IF EXISTS "Users can view members of their tenants" ON public.tenant_members;
DROP POLICY IF EXISTS "Admins and owners can manage members" ON public.tenant_members;
DROP POLICY IF EXISTS "Users can view tenant memberships safely" ON public.tenant_members;
DROP POLICY IF EXISTS "Owners can insert tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Owners can update tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Owners can delete tenant members" ON public.tenant_members;

-- Recreate tenant_members policies (non-recursive)
CREATE POLICY "Users can view tenant memberships"
ON public.tenant_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.user_is_tenant_owner(tenant_id, auth.uid())
  OR public.user_is_tenant_member(tenant_id, auth.uid())
);

CREATE POLICY "Owners can insert tenant members"
ON public.tenant_members
FOR INSERT
TO authenticated
WITH CHECK (public.user_is_tenant_owner(tenant_id, auth.uid()));

CREATE POLICY "Owners can update tenant members"
ON public.tenant_members
FOR UPDATE
TO authenticated
USING (public.user_is_tenant_owner(tenant_id, auth.uid()))
WITH CHECK (public.user_is_tenant_owner(tenant_id, auth.uid()));

CREATE POLICY "Owners can delete tenant members"
ON public.tenant_members
FOR DELETE
TO authenticated
USING (public.user_is_tenant_owner(tenant_id, auth.uid()));
