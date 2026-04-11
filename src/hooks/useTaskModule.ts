import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTaskStore } from '@/stores/useTaskStore';
import type {
  CRMTask,
  CreateTaskPayload,
  TaskSections,
  UpdateTaskPayload,
} from '@/types/tasks';

interface GetTasksResponse {
  tasks: CRMTask[];
  sections: TaskSections;
  meta?: {
    total: number;
    role: string;
    visible_users: string[];
  };
}

const emptySections: TaskSections = {
  today: [],
  upcoming: [],
  overdue: [],
  completed: [],
};

const normalizeTask = (raw: unknown): CRMTask | null => {
  if (!raw || typeof raw !== 'object') return null;

  const task = raw as Record<string, unknown>;
  const id = typeof task.id === 'string' && task.id ? task.id : '';
  if (!id) return null;

  const status = typeof task.status === 'string' ? task.status : 'pending';
  const priority = typeof task.priority === 'string' ? task.priority : 'medium';
  const dueAt = typeof task.due_at === 'string' && task.due_at ? task.due_at : new Date().toISOString();
  const comments = Array.isArray(task.comments)
    ? task.comments
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
        .map((entry) => ({
          id: typeof entry.id === 'string' && entry.id ? entry.id : `comment-${Math.random().toString(36).slice(2)}`,
          body: typeof entry.body === 'string' ? entry.body : '',
          user_id: typeof entry.user_id === 'string' ? entry.user_id : 'unknown',
          created_at: typeof entry.created_at === 'string' && entry.created_at ? entry.created_at : new Date().toISOString(),
        }))
    : [];

  const events = Array.isArray(task.events)
    ? task.events
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
        .map((entry) => ({
          id: typeof entry.id === 'string' && entry.id ? entry.id : `event-${Math.random().toString(36).slice(2)}`,
          event_type:
            typeof entry.event_type === 'string' && entry.event_type
              ? (entry.event_type as CRMTask['events'][number]['event_type'])
              : 'updated',
          metadata: entry.metadata && typeof entry.metadata === 'object' ? (entry.metadata as Record<string, unknown>) : {},
          actor_id: typeof entry.actor_id === 'string' ? entry.actor_id : null,
          created_at: typeof entry.created_at === 'string' && entry.created_at ? entry.created_at : new Date().toISOString(),
        }))
    : [];

  return {
    id,
    title: typeof task.title === 'string' && task.title.trim() ? task.title : 'Untitled task',
    description: typeof task.description === 'string' ? task.description : null,
    lead_id: typeof task.lead_id === 'string' ? task.lead_id : null,
    assigned_to: typeof task.assigned_to === 'string' && task.assigned_to ? task.assigned_to : 'me',
    created_by: typeof task.created_by === 'string' && task.created_by ? task.created_by : 'me',
    status: status as CRMTask['status'],
    priority: priority as CRMTask['priority'],
    due_at: dueAt,
    reminder_at: typeof task.reminder_at === 'string' ? task.reminder_at : null,
    snoozed_until: typeof task.snoozed_until === 'string' ? task.snoozed_until : null,
    completed_at: typeof task.completed_at === 'string' ? task.completed_at : null,
    is_recurring: Boolean(task.is_recurring),
    recurrence_rule: typeof task.recurrence_rule === 'string' ? task.recurrence_rule : null,
    ai_score: typeof task.ai_score === 'number' ? task.ai_score : 0,
    created_at: typeof task.created_at === 'string' && task.created_at ? task.created_at : new Date().toISOString(),
    updated_at: typeof task.updated_at === 'string' && task.updated_at ? task.updated_at : new Date().toISOString(),
    lead: task.lead && typeof task.lead === 'object' ? (task.lead as CRMTask['lead']) : undefined,
    assignee: task.assignee && typeof task.assignee === 'object' ? (task.assignee as CRMTask['assignee']) : undefined,
    comments,
    events,
  };
};

const normalizeTaskArray = (value: unknown): CRMTask[] => {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTask).filter((task): task is CRMTask => !!task);
};

const normalizeSections = (sections: unknown): TaskSections => {
  if (!sections || typeof sections !== 'object') return emptySections;
  const raw = sections as Record<string, unknown>;
  return {
    today: normalizeTaskArray(raw.today),
    upcoming: normalizeTaskArray(raw.upcoming),
    overdue: normalizeTaskArray(raw.overdue),
    completed: normalizeTaskArray(raw.completed),
  };
};

const isLikelyJwt = (token: string | null | undefined) =>
  typeof token === 'string' && token.split('.').length === 3;

const getFreshAccessToken = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }

  if (!session) {
    throw new Error('Authentication failed: No active session');
  }

  if (!isLikelyJwt(session.access_token)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !isLikelyJwt(refreshed.session?.access_token)) {
      throw new Error('Authentication failed: Invalid session token');
    }
    return refreshed.session.access_token;
  }

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const shouldRefresh = !expiresAtMs || expiresAtMs - Date.now() < 60_000;
  if (!shouldRefresh) {
    return session.access_token;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !isLikelyJwt(refreshed.session?.access_token)) {
    throw new Error('Authentication failed: Unable to refresh session');
  }

  return refreshed.session.access_token;
};

const invokeTaskFunction = async <T>(fn: string, body: Record<string, unknown>) => {
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`;

  const makeRequest = async (token: string) =>
    fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

  let accessToken = await getFreshAccessToken();
  let response = await makeRequest(accessToken);

  if (response.status === 401) {
    accessToken = await getFreshAccessToken();
    response = await makeRequest(accessToken);
  }

  const responseText = await response.text();
  let parsed: unknown = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const details =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string'
        ? parsed.error
        : responseText || response.statusText;
    throw new Error(`[Supabase] POST ${functionUrl} -> ${response.status} ${details}`);
  }

  return (parsed ?? {}) as T;
};

export const useTaskModule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const {
    filters,
    pendingQueue,
    enqueue,
    clearQueue,
  } = useTaskStore((s) => ({
    filters: s.filters,
    pendingQueue: s.pendingQueue,
    enqueue: s.enqueue,
    clearQueue: s.clearQueue,
  }));
  const replayInProgressRef = useRef(false);

  const taskQueryKey = useMemo(
    () => ['tasks-module', filters.search, filters.priority, filters.status, filters.bucket, filters.assigned],
    [filters],
  );

  const tasksQuery = useQuery({
    queryKey: taskQueryKey,
    queryFn: async () => {
      try {
        const response = await invokeTaskFunction<GetTasksResponse>('get_tasks', {
          search: filters.search,
          priority: filters.priority,
          status: filters.status,
          bucket: filters.bucket,
          assigned_to: filters.assigned,
        });

        const normalizedTasks = normalizeTaskArray(response?.tasks);
        return {
          tasks: normalizedTasks,
          sections: normalizeSections(response?.sections),
          meta: response?.meta,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
          return { tasks: [], sections: emptySections, meta: { total: 0, role: 'sales', visible_users: [] } };
        }
        throw error;
      }
    },
    staleTime: 20_000,
    retry: 2,
  });

  const invalidateTasks = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks-module'] });
  };

  const createTask = useMutation({
    mutationFn: async (payload: CreateTaskPayload) => invokeTaskFunction<{ task: CRMTask }>('create_task', payload as Record<string, unknown>),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: taskQueryKey });
      const previous = queryClient.getQueryData<GetTasksResponse>(taskQueryKey);
      const tempTask: CRMTask = {
        id: `temp-${Date.now()}`,
        title: payload.title,
        description: payload.description ?? null,
        lead_id: payload.lead_id ?? null,
        assigned_to: payload.assigned_to ?? 'me',
        created_by: 'me',
        status: 'pending',
        priority: payload.priority,
        due_at: payload.due_at,
        reminder_at: payload.reminder_at ?? null,
        snoozed_until: null,
        completed_at: null,
        is_recurring: Boolean(payload.is_recurring),
        recurrence_rule: payload.recurrence_rule ?? null,
        ai_score: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        comments: [],
        events: [],
      };

      if (previous) {
        queryClient.setQueryData<GetTasksResponse>(taskQueryKey, {
          ...previous,
          tasks: [tempTask, ...previous.tasks],
        });
      }

      return { previous };
    },
    onError: (error, payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskQueryKey, context.previous);
      }
      enqueue('create_task', payload as Record<string, unknown>);
      toast({
        title: 'Saved offline',
        description: 'Task action queued and will retry when online.',
      });
      console.error('createTask failed', error);
    },
    onSuccess: () => {
      toast({ title: 'Task created', description: 'Task saved successfully.' });
    },
    onSettled: invalidateTasks,
  });

  const updateTask = useMutation({
    mutationFn: async (payload: UpdateTaskPayload) => invokeTaskFunction<{ task: CRMTask }>('update_task', payload as Record<string, unknown>),
    onError: (_error, payload) => {
      enqueue('update_task', payload as Record<string, unknown>);
      toast({
        title: 'Saved offline',
        description: 'Update queued and will retry when online.',
      });
    },
    onSuccess: () => {
      toast({ title: 'Task updated', description: 'Changes have been applied.' });
    },
    onSettled: invalidateTasks,
  });

  const completeTask = useMutation({
    mutationFn: async (payload: { task_id: string; note?: string }) => invokeTaskFunction<{ task: CRMTask }>('mark_complete', payload),
    onError: (_error, payload) => {
      enqueue('mark_complete', payload as Record<string, unknown>);
      toast({
        title: 'Saved offline',
        description: 'Completion queued and will retry when online.',
      });
    },
    onSuccess: () => {
      toast({ title: 'Task completed', description: 'Great job, task marked done.' });
    },
    onSettled: invalidateTasks,
  });

  const snoozeTask = useMutation({
    mutationFn: async (payload: { task_id: string; option: '10m' | '1h' | 'tomorrow' | 'custom'; custom_until?: string }) =>
      invokeTaskFunction<{ task: CRMTask }>('snooze_task', payload),
    onError: (_error, payload) => {
      enqueue('snooze_task', payload as Record<string, unknown>);
      toast({
        title: 'Saved offline',
        description: 'Snooze queued and will retry when online.',
      });
    },
    onSuccess: () => {
      toast({ title: 'Task snoozed', description: 'Reminder moved successfully.' });
    },
    onSettled: invalidateTasks,
  });

  useEffect(() => {
    const replayQueue = async () => {
      if (replayInProgressRef.current || !navigator.onLine || pendingQueue.length === 0) {
        return;
      }

      replayInProgressRef.current = true;

      try {
        for (const action of pendingQueue) {
          try {
            await invokeTaskFunction(action.action, action.payload);
          } catch (error) {
            console.error('Retry failed for queued action', action.action, error);
            return;
          }
        }

        clearQueue();
        await invalidateTasks();
        toast({ title: 'Synced', description: 'Queued task actions are now synced.' });
      } finally {
        replayInProgressRef.current = false;
      }
    };

    void replayQueue();
    const onOnline = () => {
      void replayQueue();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [pendingQueue, clearQueue]);

  return {
    tasks: tasksQuery.data?.tasks ?? [],
    sections: tasksQuery.data?.sections ?? emptySections,
    meta: tasksQuery.data?.meta,
    isLoading: tasksQuery.isLoading,
    isFetching: tasksQuery.isFetching,
    refetch: tasksQuery.refetch,
    createTask,
    updateTask,
    completeTask,
    snoozeTask,
  };
};
