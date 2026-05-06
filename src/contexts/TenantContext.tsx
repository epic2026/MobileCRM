import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type TenantRole = 'owner' | 'admin' | 'member';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tenant_code: string;
  logo_url: string | null;
  subscription_plan: 'free' | 'pro' | 'enterprise';
  owner_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  joined_at: string;
  user?: {
    email: string;
    full_name?: string | null;
    user_metadata?: { full_name?: string | null };
  };
}

interface TenantContextType {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  tenantRole: TenantRole | null;
  tenantMembers: TenantMember[];
  isLoadingTenants: boolean;
  switchTenant: (tenantId: string) => Promise<void>;
  createTenant: (name: string, slug: string, managerUserId?: string) => Promise<Tenant>;
  updateTenant: (tenantId: string, updates: Partial<Tenant>) => Promise<void>;
  deleteTenant: (tenantId: string) => Promise<void>;
  assignUserToTenant: (tenantId: string, userId: string) => Promise<void>;
  setTenantManager: (tenantId: string, userId: string) => Promise<void>;
  removeTenantManager: (tenantId: string) => Promise<void>;
  removeMember: (tenantId: string, userId: string) => Promise<void>;
  clearUserTenant: (userId: string) => Promise<void>;
  updateMemberRole: (tenantId: string, userId: string, role: TenantRole) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const parseRpcTenant = (payload: unknown): Tenant => {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return row as Tenant;
};

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user, role } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantRole, setTenantRole] = useState<TenantRole | null>(null);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);

  const isSuperAdmin = role === 'super_admin';

  const fetchUserTenants = useCallback(async (userId: string) => {
    if (isSuperAdmin) {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Tenant[];
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) throw membershipError;

    const tenantId = memberships?.[0]?.tenant_id;
    if (!tenantId) {
      return [];
    }

    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantError) throw tenantError;
    return tenantData ? [tenantData as Tenant] : [];
  }, [isSuperAdmin]);

  const fetchTenantMembers = useCallback(async (tenantId: string) => {
    const { data: members, error: membersError } = await supabase
      .from('tenant_members')
      .select('id, tenant_id, user_id, role, joined_at')
      .eq('tenant_id', tenantId)
      .order('joined_at', { ascending: true });

    if (membersError) throw membersError;

    const userIds = (members || []).map((member) => member.user_id);
    if (userIds.length === 0) {
      return [] as TenantMember[];
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    const profileMap = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        { email: profile.email, full_name: profile.full_name },
      ]),
    );

    return (members || []).map((member) => {
      const profile = profileMap.get(member.user_id);
      return {
        ...member,
        user: {
          email: profile?.email || 'Unknown',
          full_name: profile?.full_name || null,
          user_metadata: { full_name: profile?.full_name || null },
        },
      } as TenantMember;
    });
  }, []);

  const fetchTenantRole = useCallback(async (tenantId: string, userId: string) => {
    if (isSuperAdmin) {
      return 'owner' as TenantRole;
    }

    const { data, error } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return (data?.role as TenantRole | null) || null;
  }, [isSuperAdmin]);

  const switchTenant = useCallback(async (tenantId: string) => {
    if (!user) return;

    const tenant = tenants.find((entry) => entry.id === tenantId);
    if (!tenant) return;

    setCurrentTenant(tenant);
    sessionStorage.setItem('currentTenantId', tenantId);

    const [nextRole, nextMembers] = await Promise.all([
      fetchTenantRole(tenantId, user.id),
      fetchTenantMembers(tenantId),
    ]);

    setTenantRole(nextRole);
    setTenantMembers(nextMembers);
  }, [fetchTenantMembers, fetchTenantRole, tenants, user]);

  const refreshTenants = useCallback(async () => {
    if (!user) {
      return;
    }

    const nextTenants = await fetchUserTenants(user.id);
    setTenants(nextTenants);

    const storedTenantId = sessionStorage.getItem('currentTenantId');
    const preferredTenantId = storedTenantId && nextTenants.some((tenant) => tenant.id === storedTenantId)
      ? storedTenantId
      : nextTenants[0]?.id;

    if (!preferredTenantId) {
      setCurrentTenant(null);
      setTenantRole(null);
      setTenantMembers([]);
      return;
    }

    await switchTenant(preferredTenantId);
  }, [fetchUserTenants, switchTenant, user]);

  useEffect(() => {
    if (!user) {
      setCurrentTenant(null);
      setTenants([]);
      setTenantRole(null);
      setTenantMembers([]);
      setIsLoadingTenants(false);
      return;
    }

    setIsLoadingTenants(true);
    refreshTenants()
      .catch((error) => {
        console.error('Error initializing tenants:', error);
      })
      .finally(() => {
        setIsLoadingTenants(false);
      });
  }, [refreshTenants, user]);

  const createTenant = useCallback(async (name: string, slug: string, managerUserId?: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!isSuperAdmin) throw new Error('Only super admins can create tenants');

    const { data, error } = await supabase.rpc('admin_create_tenant', {
      p_name: name.trim(),
      p_slug: slug.trim().toLowerCase(),
      p_manager_user_id: managerUserId ?? null,
    });

    if (error) throw error;

    const createdTenant = parseRpcTenant(data);
    await refreshTenants();
    await switchTenant(createdTenant.id);
    return createdTenant;
  }, [isSuperAdmin, refreshTenants, switchTenant, user]);

  const updateTenant = useCallback(async (tenantId: string, updates: Partial<Tenant>) => {
    if (!isSuperAdmin) throw new Error('Only super admins can update tenants');

    const payload: Partial<Tenant> = {};
    if (typeof updates.name === 'string') payload.name = updates.name.trim();
    if (typeof updates.active === 'boolean') payload.active = updates.active;

    const { error } = await supabase
      .from('tenants')
      .update(payload)
      .eq('id', tenantId);

    if (error) throw error;
    await refreshTenants();
  }, [isSuperAdmin, refreshTenants]);

  const deleteTenant = useCallback(async (tenantId: string) => {
    if (!isSuperAdmin) throw new Error('Only super admins can delete tenants');

    const { error } = await supabase.rpc('admin_delete_tenant', {
      p_tenant_id: tenantId,
    });

    if (error) throw error;
    await refreshTenants();
  }, [isSuperAdmin, refreshTenants]);

  const assignUserToTenant = useCallback(async (tenantId: string, userId: string) => {
    if (isSuperAdmin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('admin_assign_user_to_tenant', {
        p_user_id: userId,
        p_tenant_id: tenantId,
      });
      if (error) throw error;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('tenant_admin_add_member', {
        p_tenant_id: tenantId,
        p_user_id: userId,
      });
      if (error) throw error;
    }
    await refreshTenants();
  }, [isSuperAdmin, refreshTenants]);

  const setTenantManager = useCallback(async (tenantId: string, userId: string) => {
    if (!isSuperAdmin) throw new Error('Only super admins can update tenant managers');

    const { error } = await supabase.rpc('admin_set_tenant_manager', {
      p_tenant_id: tenantId,
      p_user_id: userId,
    });

    if (error) throw error;
    await refreshTenants();
  }, [isSuperAdmin, refreshTenants]);

  const removeTenantManager = useCallback(async (tenantId: string) => {
    if (!isSuperAdmin) throw new Error('Only super admins can remove tenant managers');

    const { error } = await supabase.rpc('admin_remove_tenant_manager', {
      p_tenant_id: tenantId,
    });

    if (error) throw error;
    await refreshTenants();
  }, [isSuperAdmin, refreshTenants]);

  const clearUserTenant = useCallback(async (userId: string) => {
    if (!isSuperAdmin) throw new Error('Only super admins can clear tenant assignments');

    const { error } = await supabase.rpc('admin_clear_user_tenant', {
      p_user_id: userId,
    });

    if (error) throw error;
    await refreshTenants();
  }, [isSuperAdmin, refreshTenants]);

  const removeMember = useCallback(async (tenantId: string, userId: string) => {
    if (isSuperAdmin) {
      await clearUserTenant(userId);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('tenant_admin_remove_member', {
        p_tenant_id: tenantId,
        p_user_id: userId,
      });
      if (error) throw error;
      await refreshTenants();
    }
  }, [clearUserTenant, isSuperAdmin, refreshTenants]);

  const updateMemberRole = useCallback(async (tenantId: string, userId: string, nextRole: TenantRole) => {
    if (nextRole === 'admin') {
      await setTenantManager(tenantId, userId);
      return;
    }

    await assignUserToTenant(tenantId, userId);
  }, [assignUserToTenant, setTenantManager]);

  const acceptInvite = useCallback(async (_token: string) => {
    throw new Error('Tenant invites are disabled. Assign existing users from Tenant Management.');
  }, []);

  const value = useMemo<TenantContextType>(() => ({
    currentTenant,
    tenants,
    tenantRole,
    tenantMembers,
    isLoadingTenants,
    switchTenant,
    createTenant,
    updateTenant,
    deleteTenant,
    assignUserToTenant,
    setTenantManager,
    removeTenantManager,
    removeMember,
    clearUserTenant,
    updateMemberRole,
    acceptInvite,
    refreshTenants,
  }), [
    acceptInvite,
    assignUserToTenant,
    clearUserTenant,
    createTenant,
    currentTenant,
    deleteTenant,
    isLoadingTenants,
    refreshTenants,
    removeMember,
    removeTenantManager,
    setTenantManager,
    switchTenant,
    tenantMembers,
    tenantRole,
    tenants,
    updateMemberRole,
    updateTenant,
  ]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};
