import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type TenantRole = 'owner' | 'admin' | 'manager' | 'member';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
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

export interface TenantInvite {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  token: string;
  expires_at: string;
  accepted: boolean;
  created_at: string;
  created_by: string;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  tenantRole: TenantRole | null;
  tenantMembers: TenantMember[];
  isLoadingTenants: boolean;
  switchTenant: (tenantId: string) => Promise<void>;
  createTenant: (name: string, slug: string) => Promise<Tenant>;
  updateTenant: (tenantId: string, updates: Partial<Tenant>) => Promise<void>;
  inviteMember: (tenantId: string, email: string, role: TenantRole) => Promise<void>;
  removeMember: (tenantId: string, userId: string) => Promise<void>;
  updateMemberRole: (tenantId: string, userId: string, role: TenantRole) => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantRole, setTenantRole] = useState<TenantRole | null>(null);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);

  // Fetch user's tenants
  const fetchUserTenants = useCallback(async (userId: string) => {
    try {
      setIsLoadingTenants(true);

      // Get tenants where user is owner or member
      const { data: ownedTenants, error: ownError } = await supabase
        .from('tenants')
        .select('*')
        .eq('owner_id', userId);

      const { data: memberTenants, error: memberError } = await supabase
        .from('tenants')
        .select('*')
        .in(
          'id',
          (
            await supabase
              .from('tenant_members')
              .select('tenant_id')
              .eq('user_id', userId)
          ).data?.map((m: any) => m.tenant_id) || []
        );

      if (ownError) {
        console.error('Error fetching owned tenants:', ownError);
        return [];
      }

      if (memberError) {
        console.error('Error fetching member tenants:', memberError);
      }

      const allTenants = [
        ...(ownedTenants || []),
        ...(memberTenants || []).filter(
          (t: Tenant) => !ownedTenants?.some((o: Tenant) => o.id === t.id)
        ),
      ];

      return allTenants;
    } catch (error) {
      console.error('Error fetching tenants:', error);
      return [];
    }
  }, []);

  // Fetch tenant members
  const fetchTenantMembers = useCallback(async (tenantId: string) => {
    try {
      const { data: members, error: membersError } = await supabase
        .from('tenant_members')
        .select('id, tenant_id, user_id, role, joined_at')
        .eq('tenant_id', tenantId);

      if (membersError) {
        console.error('Error fetching tenant members:', membersError);
        return [];
      }

      const userIds = (members || []).map((member) => member.user_id).filter(Boolean);

      let profileMap = new Map<string, { email: string; full_name: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles for tenant members:', profilesError);
        } else {
          profileMap = new Map(
            (profiles || []).map((profile) => [
              profile.id,
              { email: profile.email, full_name: profile.full_name },
            ])
          );
        }
      }

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
    } catch (error) {
      console.error('Error fetching tenant members:', error);
      return [];
    }
  }, []);

  // Get user's role in current tenant
  const fetchTenantRole = useCallback(async (tenantId: string, userId: string) => {
    try {
      const { data, error } = await supabase
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .single();

      if (error) {
        // User is not a member, check if they're the owner
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('owner_id')
          .eq('id', tenantId)
          .single();

        if (tenantData?.owner_id === userId) {
          return 'owner' as TenantRole;
        }
        return null;
      }

      return data?.role as TenantRole || null;
    } catch (error) {
      console.error('Error fetching tenant role:', error);
      return null;
    }
  }, []);

  // Initialize tenants on user login
  useEffect(() => {
    if (!user) {
      setCurrentTenant(null);
      setTenants([]);
      setTenantRole(null);
      setTenantMembers([]);
      setIsLoadingTenants(false);
      return;
    }

    const initializeTenants = async () => {
      try {
        const userTenants = await fetchUserTenants(user.id);
        setTenants(userTenants);

        // Restore tenant selection when available
        const storedTenantId = sessionStorage.getItem('currentTenantId');

        // Set selected tenant or fallback to first available tenant
        if (userTenants.length > 0) {
          const candidateTenantId =
            storedTenantId && userTenants.some((tenant) => tenant.id === storedTenantId)
              ? storedTenantId
              : userTenants[0].id;

          await switchTenant(candidateTenantId);
        }
      } catch (error) {
        console.error('Error initializing tenants:', error);
      } finally {
        setIsLoadingTenants(false);
      }
    };

    initializeTenants();
  }, [user, fetchUserTenants]);

  // Switch current tenant
  const switchTenant = useCallback(
    async (tenantId: string) => {
      if (!user) return;

      try {
        const tenant = tenants.find((t) => t.id === tenantId);
        if (!tenant) {
          console.error('Tenant not found');
          return;
        }

        setCurrentTenant(tenant);

        // Fetch role and members
        const role = await fetchTenantRole(tenantId, user.id);
        setTenantRole(role);

        const members = await fetchTenantMembers(tenantId);
        setTenantMembers(members);

        // Update component state so queries use this tenant_id
        sessionStorage.setItem('currentTenantId', tenantId);
      } catch (error) {
        console.error('Error switching tenant:', error);
      }
    },
    [tenants, user, fetchTenantRole, fetchTenantMembers]
  );

  // Create new tenant
  const createTenant = useCallback(
    async (name: string, slug: string): Promise<Tenant> => {
      if (!user) throw new Error('User not authenticated');

      try {
        const { data, error } = await supabase
          .from('tenants')
          .insert({
            name,
            slug,
            owner_id: user.id,
            active: true,
          })
          .select()
          .single();

        if (error) throw error;

        const newTenant = data as Tenant;

        const { error: ownerMemberError } = await supabase
          .from('tenant_members')
          .insert({
            tenant_id: newTenant.id,
            user_id: user.id,
            role: 'owner',
          });

        if (ownerMemberError) {
          console.error('Error adding tenant owner as member:', ownerMemberError);
        }

        setTenants([...tenants, newTenant]);
        await switchTenant(newTenant.id);

        return newTenant;
      } catch (error) {
        console.error('Error creating tenant:', error);
        throw error;
      }
    },
    [user, tenants, switchTenant]
  );

  // Update tenant
  const updateTenant = useCallback(
    async (tenantId: string, updates: Partial<Tenant>) => {
      try {
        const { error } = await supabase
          .from('tenants')
          .update(updates)
          .eq('id', tenantId);

        if (error) throw error;

        if (currentTenant?.id === tenantId) {
          setCurrentTenant({ ...currentTenant, ...updates });
        }

        const updatedTenants = tenants.map((t) =>
          t.id === tenantId ? { ...t, ...updates } : t
        );
        setTenants(updatedTenants);
      } catch (error) {
        console.error('Error updating tenant:', error);
        throw error;
      }
    },
    [currentTenant, tenants]
  );

  // Invite member
  const inviteMember = useCallback(
    async (tenantId: string, email: string, role: TenantRole) => {
      if (!user) throw new Error('User not authenticated');

      try {
        const token = Math.random().toString(36).substring(2, 15);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

        const { error } = await supabase
          .from('tenant_invites')
          .insert({
            tenant_id: tenantId,
            email,
            role,
            token,
            expires_at: expiresAt,
            created_by: user.id,
          });

        if (error) throw error;

        // TODO: Send invitation email with link to accept invite
        console.log(`Invite sent to ${email} with token: ${token}`);
      } catch (error) {
        console.error('Error inviting member:', error);
        throw error;
      }
    },
    [user]
  );

  // Remove member
  const removeMember = useCallback(async (tenantId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('tenant_members')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);

      if (error) throw error;

      setTenantMembers(tenantMembers.filter((m) => m.user_id !== userId));
    } catch (error) {
      console.error('Error removing member:', error);
      throw error;
    }
  }, [tenantMembers]);

  // Update member role
  const updateMemberRole = useCallback(
    async (tenantId: string, userId: string, role: TenantRole) => {
      try {
        const { error } = await supabase
          .from('tenant_members')
          .update({ role })
          .eq('tenant_id', tenantId)
          .eq('user_id', userId);

        if (error) throw error;

        const updatedMembers = tenantMembers.map((m) =>
          m.user_id === userId ? { ...m, role } : m
        );
        setTenantMembers(updatedMembers);
      } catch (error) {
        console.error('Error updating member role:', error);
        throw error;
      }
    },
    [tenantMembers]
  );

  // Accept invite
  const acceptInvite = useCallback(async (token: string) => {
    try {
      const { data, error } = await supabase.rpc('accept_tenant_invite', {
        invite_token: token,
      });

      if (error) throw error;

      // Refresh tenants list
      if (user) {
        const userTenants = await fetchUserTenants(user.id);
        setTenants(userTenants);

        if (userTenants.length > 0) {
          await switchTenant(userTenants[0].id);
        }
      }

      return data as string; // Returns tenant_id
    } catch (error) {
      console.error('Error accepting invite:', error);
      throw error;
    }
  }, [user, fetchUserTenants, switchTenant]);

  // Refresh tenants
  const refreshTenants = useCallback(async () => {
    if (!user) return;

    try {
      const userTenants = await fetchUserTenants(user.id);
      setTenants(userTenants);

      if (currentTenant && !userTenants.find((t) => t.id === currentTenant.id)) {
        if (userTenants.length > 0) {
          await switchTenant(userTenants[0].id);
        } else {
          setCurrentTenant(null);
        }
      }
    } catch (error) {
      console.error('Error refreshing tenants:', error);
    }
  }, [user, currentTenant, fetchUserTenants, switchTenant]);

  const value: TenantContextType = {
    currentTenant,
    tenants,
    tenantRole,
    tenantMembers,
    isLoadingTenants,
    switchTenant,
    createTenant,
    updateTenant,
    inviteMember,
    removeMember,
    updateMemberRole,
    acceptInvite,
    refreshTenants,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
