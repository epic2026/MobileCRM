import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import type { Json } from '@/integrations/supabase/types';

export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'task_created' | 'status_change';

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Json | null;
  created_at: string;
}

export const useLeadActivities = (leadId: string | null) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activities = [], isLoading, error } = useQuery({
    queryKey: ['lead_activities', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!leadId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`lead-activities-changes-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_activities',
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['lead_activities', leadId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  const createActivity = useMutation({
    mutationFn: async (activity: Omit<LeadActivity, 'id' | 'created_at'> & { user_id?: string }) => {
      const { data, error } = await supabase
        .from('lead_activities')
        .insert([{
          lead_id: activity.lead_id,
          type: activity.type,
          title: activity.title,
          description: activity.description,
          metadata: activity.metadata,
          user_id: activity.user_id,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_activities', leadId] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { activities, isLoading, error, createActivity };
};
