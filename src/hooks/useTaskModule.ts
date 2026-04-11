import { useEffect, useMemo } from 'react';
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

const invokeTaskFunction = async <T>(fn: string, body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    throw new Error(error.message || `Failed ${fn}`);
  }
  return data as T;
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

  const taskQueryKey = useMemo(
    () => ['tasks-module', filters.search, filters.priority, filters.status, filters.bucket, filters.assigned],
    [filters],
  );

  const tasksQuery = useQuery({
    queryKey: taskQueryKey,
    queryFn: async () => {
      const response = await invokeTaskFunction<GetTasksResponse>('get_tasks', {
        search: filters.search,
        priority: filters.priority,
        status: filters.status,
        bucket: filters.bucket,
        assigned_to: filters.assigned,
      });
      return response;
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
      if (!navigator.onLine || pendingQueue.length === 0) {
        return;
      }

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
