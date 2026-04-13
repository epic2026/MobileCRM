-- Reinstate strict tenant isolation for CRM operational tables.
-- This replaces emergency open policies introduced for data recovery.

-- Leads policies
DROP POLICY IF EXISTS "Authenticated users can manage leads" ON public.leads;
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
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert leads in their tenant"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update leads in their tenant"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete leads in their tenant"
ON public.leads
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Call logs policies
DROP POLICY IF EXISTS "Authenticated users can manage call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Users can view call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can insert call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can update call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can delete call logs in their tenant" ON public.call_logs;

CREATE POLICY "Users can view call logs in their tenant"
ON public.call_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert call logs in their tenant"
ON public.call_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update call logs in their tenant"
ON public.call_logs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete call logs in their tenant"
ON public.call_logs
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Lead tasks policies
DROP POLICY IF EXISTS "Authenticated users can manage lead tasks" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can view tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can insert tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can update tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can delete tasks in their tenant" ON public.lead_tasks;

CREATE POLICY "Users can view tasks in their tenant"
ON public.lead_tasks
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert tasks in their tenant"
ON public.lead_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update tasks in their tenant"
ON public.lead_tasks
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete tasks in their tenant"
ON public.lead_tasks
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Lead activities policies
DROP POLICY IF EXISTS "Authenticated users can manage lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can view activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can insert activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete activities in their tenant" ON public.lead_activities;

CREATE POLICY "Users can view activities in their tenant"
ON public.lead_activities
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert activities in their tenant"
ON public.lead_activities
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update activities in their tenant"
ON public.lead_activities
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete activities in their tenant"
ON public.lead_activities
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Call recordings policies
DROP POLICY IF EXISTS "Authenticated users can manage call recordings" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can view recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can insert recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can update recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can delete recordings in their tenant" ON public.call_recordings;

CREATE POLICY "Users can view recordings in their tenant"
ON public.call_recordings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert recordings in their tenant"
ON public.call_recordings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update recordings in their tenant"
ON public.call_recordings
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete recordings in their tenant"
ON public.call_recordings
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);
