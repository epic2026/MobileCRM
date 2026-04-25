-- Restrict lead visibility so regular tenant members only see their own leads.
-- super_admin, tenant owners, and tenant admins retain full tenant-wide visibility.

-- Leads
DROP POLICY IF EXISTS "Users can view leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can insert leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads in their tenant" ON public.leads;

CREATE POLICY "Users can view leads in their tenant"
ON public.leads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
  OR (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can insert leads in their tenant"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
  OR (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can update leads in their tenant"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
  OR (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
  OR (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can delete leads in their tenant"
ON public.leads
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
  OR (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
);
