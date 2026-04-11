export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed';
export type TaskBucket = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

export interface TaskLead {
  id: string;
  name: string;
  phone?: string | null;
  company?: string | null;
  status?: string | null;
}

export interface TaskAssignee {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

export interface TaskComment {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
}

export interface TaskEvent {
  id: string;
  event_type: 'created' | 'updated' | 'status_changed' | 'comment_added' | 'snoozed' | 'completed';
  metadata: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

export interface CRMTask {
  id: string;
  title: string;
  description: string | null;
  lead_id: string | null;
  assigned_to: string;
  created_by: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string;
  reminder_at: string | null;
  snoozed_until: string | null;
  completed_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  ai_score: number;
  created_at: string;
  updated_at: string;
  lead?: TaskLead;
  assignee?: TaskAssignee;
  comments: TaskComment[];
  events: TaskEvent[];
}

export interface TaskSections {
  today: CRMTask[];
  upcoming: CRMTask[];
  overdue: CRMTask[];
  completed: CRMTask[];
}

export interface TaskFilterState {
  search: string;
  priority: TaskPriority | 'all';
  status: TaskStatus | 'all';
  bucket: TaskBucket;
  assigned: 'me' | 'team' | 'all';
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  lead_id?: string | null;
  assigned_to?: string;
  due_at: string;
  priority: TaskPriority;
  reminder_at?: string | null;
  note?: string;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
}

export interface UpdateTaskPayload {
  task_id: string;
  title?: string;
  description?: string | null;
  lead_id?: string | null;
  assigned_to?: string;
  due_at?: string;
  priority?: TaskPriority;
  reminder_at?: string | null;
  status?: TaskStatus;
  note?: string;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
}
