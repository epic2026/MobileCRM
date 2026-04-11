# Task Module Blueprint (Production)

## 1) App Architecture
- Client: mobile-first React + Capacitor
- State: Zustand (`src/stores/useTaskStore.ts`)
- Data fetching + optimistic updates + retry: React Query (`src/hooks/useTaskModule.ts`)
- APIs: Supabase Edge Functions
  - `create_task`
  - `update_task`
  - `mark_complete`
  - `snooze_task`
  - `get_tasks`
  - `auto_create_task_on_lead_event`
- Database: Supabase Postgres tables
  - `tasks`
  - `task_comments`
  - `task_reminders`
  - plus timeline table: `task_events`
  - team scope table: `user_teams`

## 2) SQL Schema (Ready to Run)
- Migration file:
  - `supabase/migrations/20260411193000_task_module_upgrade.sql`
- Includes:
  - enums for `task_priority`, `task_module_status`, `task_event_type`
  - tables + indexes + triggers
  - auto-reminder creation trigger
  - auto-create task on lead insert/status-change trigger
  - RLS for sales/admin/manager scope

## 3) Edge Functions (Full Code)
- `supabase/functions/create_task/index.ts`
- `supabase/functions/update_task/index.ts`
- `supabase/functions/mark_complete/index.ts`
- `supabase/functions/snooze_task/index.ts`
- `supabase/functions/get_tasks/index.ts`
- `supabase/functions/auto_create_task_on_lead_event/index.ts`
- shared helper:
  - `supabase/functions/_shared/task-module.ts`

## 4) Mobile UI Code
- Main task screen:
  - `src/components/TasksPanel.tsx`
- Notification/reminder screen:
  - `src/components/NotificationsPanel.tsx`
- Key UX shipped:
  - Sections: Today / Upcoming / Overdue / Completed
  - Search + filters (priority, status, assignment scope)
  - Swipe-left quick actions on cards (Complete, Snooze)
  - Floating `+` button for create task
  - Task detail bottom-sheet with edit, timeline, snooze
  - Sticky action row with `Mark Complete`
  - Quick action `Complete & Add Note`

## 5) Folder Structure
- `src/components/TasksPanel.tsx`
- `src/components/NotificationsPanel.tsx`
- `src/hooks/useTaskModule.ts`
- `src/stores/useTaskStore.ts`
- `src/types/tasks.ts`
- `supabase/functions/*`
- `supabase/migrations/20260411193000_task_module_upgrade.sql`

## 6) Notification Handling Logic
- In-app reminders:
  - from `overdue` + `today` sections
  - toast alerts + browser notification when permission granted
- Reminder persistence:
  - `task_reminders` table
  - `snooze_task` updates reminder rows
- Background scheduling:
  - server-side reminder queue modeled in `task_reminders`
  - push dispatch worker can read pending reminders (`status = pending`) and mark sent

## 7) Sample Data
- Included in migration seed section:
  - inserts one high-priority task against an existing lead

## Bonus Included
- Recurring task fields: `is_recurring`, `recurrence_rule`
- AI prioritization score: `ai_score`
- Daily agenda-ready endpoint output: `get_tasks` sections payload
- Voice-to-task: supported through ARIA voice agent calling task action endpoints
