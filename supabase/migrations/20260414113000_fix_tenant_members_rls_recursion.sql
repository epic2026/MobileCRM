-- Fix infinite recursion in tenant_members RLS policies.
-- Root cause: policies queried tenant_members inside tenant_members policy expressions.

-- Remove recursive policies
DROP POLICY IF EXISTS "Users can view members of their tenants" ON public.tenant_members;
DROP POLICY IF EXISTS "Admins and owners can manage members" ON public.tenant_members;

-- Non-recursive SELECT policy:
-- - users can always see their own membership rows
-- - tenant owners can see all members in tenants they own
CREATE POLICY "Users can view tenant memberships safely"
ON public.tenant_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
);

-- Non-recursive INSERT policy (owners only)
CREATE POLICY "Owners can insert tenant members"
ON public.tenant_members
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
);

-- Non-recursive UPDATE policy (owners only)
CREATE POLICY "Owners can update tenant members"
ON public.tenant_members
FOR UPDATE
TO authenticated
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
);

-- Non-recursive DELETE policy (owners only)
CREATE POLICY "Owners can delete tenant members"
ON public.tenant_members
FOR DELETE
TO authenticated
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
);
