import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { track } from '@/services/analytics';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Lead {
  id: string;
  tenant_id: string | null;
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  value: number | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

export const useLeads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ['leads', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!user && !!tenantId,
  });

  const createLead = useMutation({
    mutationFn: async (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'tenant_id'>) => {
      if (!user) throw new Error('Not authenticated');
      if (!tenantId) throw new Error('No tenant selected');
      
      const { data, error } = await supabase
        .from('leads')
        .insert({ ...lead, user_id: user.id, tenant_id: tenantId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads', tenantId] });
      toast({ title: 'Lead Created', description: 'New lead has been added.' });
      track({ event: 'lead_created', props: { status: data.status, has_email: !!data.email, has_company: !!data.company } });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      if (!tenantId) throw new Error('No tenant selected');
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', tenantId] });
      toast({ title: 'Lead Updated', description: 'Lead has been updated.' });
      track({ event: 'lead_updated', props: { field: 'details' } });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('No tenant selected');
      const { error } = await supabase.from('leads').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', tenantId] });
      toast({ title: 'Lead Deleted', description: 'Lead has been removed.' });
      track({ event: 'lead_deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { leads, isLoading, error, createLead, updateLead, deleteLead };
};
