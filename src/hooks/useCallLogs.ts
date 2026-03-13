import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type CallType = 'incoming' | 'outgoing' | 'missed';

export interface CallLogEntry {
  id: string;
  lead_id: string | null;
  phone: string;
  contact_name: string | null;
  duration: number;
  type: CallType;
  notes: string | null;
  outcome: string | null;
  created_at: string;
  user_id: string | null;
}

export const useCallLogs = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: callLogs = [], isLoading, error } = useQuery({
    queryKey: ['call_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CallLogEntry[];
    },
    enabled: !!user,
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('call_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['call_logs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createCallLog = useMutation({
    mutationFn: async (callLog: Omit<CallLogEntry, 'id' | 'created_at' | 'user_id'>) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('call_logs')
        .insert({ ...callLog, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call_logs'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateCallLog = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CallLogEntry> & { id: string }) => {
      const { data, error } = await supabase
        .from('call_logs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call_logs'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { callLogs, isLoading, error, createCallLog, updateCallLog };
};
