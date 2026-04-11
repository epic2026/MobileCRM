-- Task Module v2: production-ready task management
-- Adds tasks, task_comments, task_reminders, task_events, and team visibility for managers.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.task_module_status AS ENUM ('pending', 'completed');
CREATE TYPE public.task_event_type AS ENUM ('created', 'updated', 'status_changed', 'comment_added', 'snoozed', 'completed');

CREATE TABLE IF NOT EXISTS public.user_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manager_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.task_module_status NOT NULL DEFAULT 'pending',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  due_at TIMESTAMPTZ NOT NULL,
  reminder_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,
  ai_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_due_at_not_past CHECK (due_at > now() - interval '5 minutes')
);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL DEFAULT 'push',
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.task_event_type NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_due ON public.tasks (assigned_to, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON public.tasks (status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks (lead_id);
CREATE INDEX IF NOT EXISTS idx_task_reminders_pending ON public.task_reminders (status, remind_at);
CREATE INDEX IF NOT EXISTS idx_task_events_task_created ON public.task_events (task_id, created_at DESC);

ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tasks_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_set_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_set_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_set_updated_at();

CREATE OR REPLACE FUNCTION public.can_manage_member_tasks(_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_teams ut
    WHERE ut.manager_id = auth.uid()
      AND ut.member_id = _member_id
  );
$$;

CREATE OR REPLACE FUNCTION public.task_log_event(_task_id UUID, _event_type public.task_event_type, _metadata JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_events (task_id, actor_id, event_type, metadata)
  VALUES (_task_id, auth.uid(), _event_type, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reminder_at IS NULL THEN
    NEW.reminder_at = NEW.due_at - interval '1 hour';
  END IF;

  INSERT INTO public.task_reminders (task_id, remind_at, channel)
  VALUES (NEW.id, NEW.reminder_at, 'push');

  PERFORM public.task_log_event(NEW.id, 'created', jsonb_build_object('title', NEW.title, 'due_at', NEW.due_at));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_default_reminder ON public.tasks;
CREATE TRIGGER trg_task_default_reminder
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.create_default_reminder();

CREATE OR REPLACE FUNCTION public.auto_create_task_on_lead_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  should_create BOOLEAN := FALSE;
  task_title TEXT;
  task_description TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_create := TRUE;
    task_title := 'First follow-up with ' || NEW.name;
    task_description := 'Auto-generated follow-up for newly created lead.';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    should_create := TRUE;
    task_title := 'Status follow-up: ' || NEW.name;
    task_description := 'Lead status changed to ' || NEW.status || '. Add context and next action.';
  END IF;

  IF should_create THEN
    INSERT INTO public.tasks (
      title,
      description,
      lead_id,
      assigned_to,
      created_by,
      due_at,
      priority,
      ai_score
    ) VALUES (
      task_title,
      task_description,
      NEW.id,
      NEW.user_id,
      NEW.user_id,
      now() + interval '1 day',
      'medium',
      CASE WHEN NEW.status IN ('negotiation', 'proposal') THEN 80 ELSE 55 END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_on_lead_insert ON public.leads;
CREATE TRIGGER trg_auto_task_on_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_task_on_lead_event();

DROP TRIGGER IF EXISTS trg_auto_task_on_lead_status_update ON public.leads;
CREATE TRIGGER trg_auto_task_on_lead_status_update
AFTER UPDATE OF status ON public.leads
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.auto_create_task_on_lead_event();

DROP POLICY IF EXISTS "Managers can view team links" ON public.user_teams;
CREATE POLICY "Managers can view team links"
  ON public.user_teams FOR SELECT
  TO authenticated
  USING (
    manager_id = auth.uid()
    OR member_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins manage team links" ON public.user_teams;
CREATE POLICY "Admins manage team links"
  ON public.user_teams FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view visible tasks" ON public.tasks;
CREATE POLICY "Users can view visible tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
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
  );

DROP POLICY IF EXISTS "Users can delete visible tasks" ON public.tasks;
CREATE POLICY "Users can delete visible tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
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
      )
    )
  );

-- Sample seed (idempotent-ish, can be deleted in production)
INSERT INTO public.tasks (title, description, lead_id, assigned_to, created_by, status, priority, due_at, reminder_at, ai_score)
SELECT
  'Call high-value lead',
  'Review proposal blockers and close next step.',
  l.id,
  l.user_id,
  l.user_id,
  'pending',
  'high',
  now() + interval '3 hours',
  now() + interval '2 hours 50 minutes',
  92
FROM public.leads l
WHERE l.user_id IS NOT NULL
LIMIT 1
ON CONFLICT DO NOTHING;
