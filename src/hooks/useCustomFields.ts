import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';

export interface CustomFieldDefinition {
  id: string;
  tenant_id: string;
  entity_type: string;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  options: string[];
  required: boolean;
  position: number;
  created_at: string;
}

export const useCustomFields = (entityType = 'lead') => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const qk = ['custom-field-definitions', currentTenant?.id, entityType] as const;

  const { data: fields = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from('custom_field_definitions')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .eq('entity_type', entityType)
        .order('position');
      if (error) throw error;
      return (data ?? []) as CustomFieldDefinition[];
    },
    enabled: !!currentTenant,
  });

  const createField = useMutation({
    mutationFn: async (
      field: Pick<CustomFieldDefinition, 'field_key' | 'field_label' | 'field_type' | 'options' | 'required' | 'position'>
    ) => {
      const { error } = await (supabase as any)
        .from('custom_field_definitions')
        .insert({ ...field, tenant_id: currentTenant!.id, entity_type: entityType });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
  });

  const updateField = useMutation({
    mutationFn: async (updates: Partial<CustomFieldDefinition> & { id: string }) => {
      const { id, ...rest } = updates;
      const { error } = await (supabase as any)
        .from('custom_field_definitions')
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('custom_field_definitions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
  });

  return { fields, isLoading, createField, updateField, deleteField };
};
