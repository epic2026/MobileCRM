-- Restrict lead_tasks, lead_activities, call_logs, call_recordings visibility
-- so regular tenant members only see records linked to their own leads.
-- super_admin, tenant owners, and tenant admins retain full tenant-wide access.

-- ─── HELPER: reusable admin check ────────────────────────────────────────────
-- A user is "elevated" if they are super_admin, tenant owner, or tenant admin.
-- Regular members fall through to the lead_id ownership check.

-- ─── LEAD_TASKS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view tasks in their tenant"   ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can insert tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can update tasks in their tenant" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can delete tasks in their tenant" ON public.lead_tasks;

CREATE POLICY "Users can view tasks for their leads"
ON public.lead_tasks FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can insert tasks for their leads"
ON public.lead_tasks FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can update tasks for their leads"
ON public.lead_tasks FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can delete tasks for their leads"
ON public.lead_tasks FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

-- ─── LEAD_ACTIVITIES ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view activities in their tenant"   ON public.lead_activities;
DROP POLICY IF EXISTS "Users can insert activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update activities in their tenant" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete activities in their tenant" ON public.lead_activities;

CREATE POLICY "Users can view activities for their leads"
ON public.lead_activities FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can insert activities for their leads"
ON public.lead_activities FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can update activities for their leads"
ON public.lead_activities FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can delete activities for their leads"
ON public.lead_activities FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

-- ─── CALL_LOGS ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view call logs in their tenant"   ON public.call_logs;
DROP POLICY IF EXISTS "Users can insert call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can update call logs in their tenant" ON public.call_logs;
DROP POLICY IF EXISTS "Users can delete call logs in their tenant" ON public.call_logs;

CREATE POLICY "Users can view call logs for their leads"
ON public.call_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR user_id = auth.uid()
  OR (
    lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can insert call logs for their leads"
ON public.call_logs FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR user_id = auth.uid()
);

CREATE POLICY "Users can update call logs for their leads"
ON public.call_logs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR user_id = auth.uid()
);

CREATE POLICY "Users can delete call logs for their leads"
ON public.call_logs FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR user_id = auth.uid()
);

-- ─── CALL_RECORDINGS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view recordings in their tenant"   ON public.call_recordings;
DROP POLICY IF EXISTS "Users can insert recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can update recordings in their tenant" ON public.call_recordings;
DROP POLICY IF EXISTS "Users can delete recordings in their tenant" ON public.call_recordings;

CREATE POLICY "Users can view recordings for their leads"
ON public.call_recordings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can insert recordings for their leads"
ON public.call_recordings FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can update recordings for their leads"
ON public.call_recordings FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can delete recordings for their leads"
ON public.call_recordings FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role = 'admin')
  OR (
    lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM public.leads
      WHERE user_id = auth.uid()
      AND tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    )
  )
);
