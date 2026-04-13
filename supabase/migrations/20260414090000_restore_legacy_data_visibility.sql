-- Emergency recovery: restore legacy visibility and write behavior for existing CRM data.
-- Keeps tenant tables, but makes operational tables visible/writable for authenticated users.

-- Leads policies
DROP POLICY IF EXISTS "Users can view leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can insert leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can manage leads" ON public.leads;

CREATE POLICY "Authenticated users can manage leads"
ON public.leads
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Call logs policies
DROP POLICY IF EXISTS "Users can view call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can insert call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can update call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can delete call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Authenticated users can manage call logs" ON public.call_logs;

CREATE POLICY "Authenticated users can manage call logs"
ON public.call_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Lead tasks policies
DROP POLICY IF EXISTS "Users can view tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can insert tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can update tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can delete tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Authenticated users can manage lead tasks" ON public.lead_tasks;

CREATE POLICY "Authenticated users can manage lead tasks"
ON public.lead_tasks
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Lead activities policies
DROP POLICY IF EXISTS "Users can view activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can insert activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Authenticated users can manage lead activities" ON public.lead_activities;

CREATE POLICY "Authenticated users can manage lead activities"
ON public.lead_activities
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Call recordings policies
DROP POLICY IF EXISTS "Users can view recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can insert recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can update recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can delete recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Authenticated users can manage call recordings" ON public.call_recordings;

CREATE POLICY "Authenticated users can manage call recordings"
ON public.call_recordings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
