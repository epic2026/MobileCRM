import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface LeadTask {
  id: string;
  tenant_id: string | null;
  lead_id: string;
  user_id: string | null;
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
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ['lead_tasks', leadId, tenantId],
    queryFn: async () => {
      if (!leadId || !tenantId) return [];
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadTask[];
    },
    enabled: !!leadId && !!tenantId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const createTask = useMutation({
    mutationFn: async (task: Omit<LeadTask, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'tenant_id'>) => {
      if (!user) throw new Error('Not authenticated');
      if (!tenantId) throw new Error('No tenant selected');

      const { data, error } = await supabase
        .from('lead_tasks')
        .insert({
          ...task,
          user_id: user.id,
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', leadId, tenantId] });
      toast({ title: 'Task Created', description: 'New task has been added.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadTask> & { id: string }) => {
      if (!tenantId) throw new Error('No tenant selected');
      const { data, error } = await supabase
        .from('lead_tasks')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', leadId, tenantId] });
      toast({ title: 'Task Updated', description: 'Task has been updated.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('No tenant selected');
      const { error } = await supabase.from('lead_tasks').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', leadId, tenantId] });
      toast({ title: 'Task Deleted', description: 'Task has been removed.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { tasks, isLoading, error, createTask, updateTask, deleteTask };
};
