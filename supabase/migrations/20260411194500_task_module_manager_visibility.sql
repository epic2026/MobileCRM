-- Enable manager visibility policies after app_role enum includes manager.

DROP POLICY IF EXISTS "Users can view visible tasks" ON public.tasks;
CREATE POLICY "Users can view visible tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(assigned_to))
  );

DROP POLICY IF EXISTS "Users can create visible tasks" ON public.tasks;
CREATE POLICY "Users can create visible tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      assigned_to = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(assigned_to))
    )
  );

DROP POLICY IF EXISTS "Users can update visible tasks" ON public.tasks;
CREATE POLICY "Users can update visible tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(assigned_to))
  );

DROP POLICY IF EXISTS "Users can delete visible tasks" ON public.tasks;
CREATE POLICY "Users can delete visible tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(assigned_to))
  );

DROP POLICY IF EXISTS "Users can view comments for visible tasks" ON public.task_comments;
CREATE POLICY "Users can view comments for visible tasks"
  ON public.task_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(t.assigned_to))
      )
    )
  );

DROP POLICY IF EXISTS "Users can add comments for visible tasks" ON public.task_comments;
CREATE POLICY "Users can add comments for visible tasks"
  ON public.task_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(t.assigned_to))
      )
    )
  );

DROP POLICY IF EXISTS "Users can view reminders for visible tasks" ON public.task_reminders;
CREATE POLICY "Users can view reminders for visible tasks"
  ON public.task_reminders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_reminders.task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(t.assigned_to))
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage reminders for visible tasks" ON public.task_reminders;
CREATE POLICY "Users can manage reminders for visible tasks"
  ON public.task_reminders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_reminders.task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(t.assigned_to))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_reminders.task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(t.assigned_to))
      )
    )
  );

DROP POLICY IF EXISTS "Users can view events for visible tasks" ON public.task_events;
CREATE POLICY "Users can view events for visible tasks"
  ON public.task_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_events.task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (public.has_role(auth.uid(), 'manager') AND public.can_manage_member_tasks(t.assigned_to))
      )
    )
  );
