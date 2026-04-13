import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export type CallType = 'incoming' | 'outgoing' | 'missed';

export interface CallLogEntry {
  id: string;
  tenant_id: string | null;
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

interface UseCallLogsOptions {
  fetchLogs?: boolean;
  realtime?: boolean;
}

export const useCallLogs = ({ fetchLogs = true, realtime = true }: UseCallLogsOptions = {}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;

  const { data: callLogs = [], isLoading, error } = useQuery({
    queryKey: ['call_logs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CallLogEntry[];
    },
    enabled: !!user && !!tenantId && fetchLogs,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!user || !realtime || !tenantId) return;

    const channel = supabase
      .channel('call_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['call_logs', tenantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, realtime, tenantId, user]);

  const createCallLog = useMutation({
    mutationFn: async (callLog: Omit<CallLogEntry, 'id' | 'created_at' | 'user_id' | 'tenant_id'>) => {
      if (!user) throw new Error('Not authenticated');
      if (!tenantId) throw new Error('No tenant selected');
      
      const { data, error } = await supabase
        .from('call_logs')
        .insert({ ...callLog, user_id: user.id, tenant_id: tenantId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call_logs', tenantId] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateCallLog = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CallLogEntry> & { id: string }) => {
      if (!tenantId) throw new Error('No tenant selected');
      const { data, error } = await supabase
        .from('call_logs')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call_logs', tenantId] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { callLogs, isLoading, error, createCallLog, updateCallLog };
};
