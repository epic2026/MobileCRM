import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface LeadTask {
  id: string;
  lead_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export const useLeadTasks = (leadId: string | null) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ['lead_tasks', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadTask[];
    },
    enabled: !!leadId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const createTask = useMutation({
    mutationFn: async (task: Omit<LeadTask, 'id' | 'created_at' | 'updated_at'> & { user_id?: string }) => {
      const { data, error } = await supabase
        .from('lead_tasks')
        .insert(task)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', leadId] });
      toast({ title: 'Task Created', description: 'New task has been added.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadTask> & { id: string }) => {
      const { data, error } = await supabase
        .from('lead_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', leadId] });
      toast({ title: 'Task Updated', description: 'Task has been updated.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', leadId] });
      toast({ title: 'Task Deleted', description: 'Task has been removed.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { tasks, isLoading, error, createTask, updateTask, deleteTask };
};
