import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'task_created' | 'status_change';

export interface LeadActivity {
  id: string;
  tenant_id: string | null;
  lead_id: string;
  user_id: string | null;
  type: string;
  title: string;
  description: string | null;
  metadata: Json | null;
  created_at: string;
}

export const useLeadActivities = (leadId: string | null) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;

  const { data: activities = [], isLoading, error } = useQuery({
    queryKey: ['lead_activities', leadId, tenantId],
    queryFn: async () => {
      if (!leadId || !tenantId) return [];
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!leadId && !!tenantId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!leadId || !tenantId) return;

    const channel = supabase
      .channel(`lead-activities-changes-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_activities',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['lead_activities', leadId, tenantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient, tenantId]);

  const createActivity = useMutation({
    mutationFn: async (activity: Omit<LeadActivity, 'id' | 'created_at' | 'user_id'>) => {
      if (!user) throw new Error('Not authenticated');
      if (!tenantId) throw new Error('No tenant selected');

      const { data, error } = await supabase
        .from('lead_activities')
        .insert([{
          lead_id: activity.lead_id,
          tenant_id: tenantId,
          type: activity.type,
          title: activity.title,
          description: activity.description,
          metadata: activity.metadata,
          user_id: user.id,
        }])
        .select()
        .single();

      if (error) throw error;

      // Update lead's updated_at to reflect the activity
      const { error: updateError } = await supabase
        .from('leads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activity.lead_id);

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_activities', leadId, tenantId] });
      // Invalidate leads query so the list re-sorts by updated_at
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { activities, isLoading, error, createActivity };
};
