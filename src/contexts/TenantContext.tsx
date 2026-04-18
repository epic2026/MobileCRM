import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type TenantRole = 'owner' | 'admin' | 'member';

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

  // Fetch user's tenants
  const fetchUserTenants = useCallback(async (userId: string) => {
    try {
      setIsLoadingTenants(true);

      if (role === 'super_admin') {
        const { data: allTenants, error: allTenantsError } = await supabase
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: true });

        if (allTenantsError) {
          console.error('Error fetching all tenants for super admin:', allTenantsError);
          return [];
        }

        return allTenants || [];
      }

      // Get tenants where user is owner or member.
      const [ownedResult, memberLinksResult] = await Promise.all([
        supabase.from('tenants').select('*').eq('owner_id', userId),
        supabase.from('tenant_members').select('tenant_id').eq('user_id', userId),
      ]);

      const ownedTenants = ownedResult.data || [];
      const ownedError = ownedResult.error;
      const memberLinks = memberLinksResult.data || [];
      const memberLinksError = memberLinksResult.error;

      if (ownedError) {
        console.error('Error fetching owned tenants:', ownedError);
        return [];
      }

      if (memberLinksError) {
        console.error('Error fetching tenant membership links:', memberLinksError);
      }

      const memberTenantIds = (memberLinks as Array<{ tenant_id: string }> || []).map((m) => m.tenant_id);
      const uniqueMemberTenantIds = Array.from(new Set(memberTenantIds));

      const { data: memberTenants, error: memberError } = uniqueMemberTenantIds.length > 0
        ? await supabase.from('tenants').select('*').in('id', uniqueMemberTenantIds)
        : { data: [], error: null };

      if (memberError) {
        console.error('Error fetching member tenants:', memberError);
      }

      const allTenants = [
        ...ownedTenants,
        ...(memberTenants || []).filter(
          (t: Tenant) => !ownedTenants.some((o: Tenant) => o.id === t.id)
        ),
      ];

      return allTenants;
    } catch (error) {
      console.error('Error fetching tenants:', error);
      return [];
    }
  }, [role]);

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
        .maybeSingle();

      if (error) {
        console.error('Error fetching tenant member role:', error);
        return null;
      }

      if (data?.role) {
        return data.role as TenantRole;
      }

      // User is not a member, check if they're the owner
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('owner_id')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError) {
        console.error('Error fetching tenant owner:', tenantError);
        return null;
      }

      if (tenantData?.owner_id === userId) {
        return 'owner' as TenantRole;
      }
      return null;
    } catch (error) {
      console.error('Error fetching tenant role:', error);
      return null;
    }
  }, []);

  const ensureAdminTenantUserBinding = useCallback(async () => {
    try {
      const adminEmail = 'ap79020@gmail.com';
      const { data: adminTenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', 'admin-tenant')
        .maybeSingle();

      if (tenantError || !adminTenant) {
        if (tenantError) console.error('Error fetching admin-tenant:', tenantError);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, tenant_id')
        .eq('email', adminEmail)
        .maybeSingle();

      if (profileError || !profile) {
        if (profileError) console.error('Error fetching admin user profile:', profileError);
        return;
      }

      if (profile.tenant_id !== adminTenant.id) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ tenant_id: adminTenant.id })
          .eq('id', profile.id);

        if (updateError) {
          console.error('Error updating admin user tenant assignment:', updateError);
        }
      }

      const { data: existingMember, error: memberError } = await supabase
        .from('tenant_members')
        .select('id')
        .eq('tenant_id', adminTenant.id)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (memberError) {
        console.error('Error checking admin tenant membership:', memberError);
        return;
      }

      if (!existingMember) {
        const { error: insertError } = await supabase.from('tenant_members').insert({
          tenant_id: adminTenant.id,
          user_id: profile.id,
          role: 'admin',
          joined_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error('Error inserting admin tenant membership:', insertError);
        }
      }
    } catch (error) {
      console.error('Error ensuring admin tenant user binding:', error);
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
        let candidateTenantId: string | null = null;

        if (storedTenantId && userTenants.some((tenant) => tenant.id === storedTenantId)) {
          candidateTenantId = storedTenantId;
        } else if (userTenants.length > 0) {
          candidateTenantId = userTenants[0].id;
        }

        if (candidateTenantId) {
          await switchTenant(candidateTenantId);
        }

        void ensureAdminTenantUserBinding();
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

        // Fetch role and members in parallel to reduce load time.
        const [role, members] = await Promise.all([
          fetchTenantRole(tenantId, user.id),
          fetchTenantMembers(tenantId),
        ]);

        setTenantRole(role);
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
      if (role !== 'super_admin') throw new Error('Only super admins can create tenants');

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
    [role, user, tenants, switchTenant]
  );

  // Update tenant
  const updateTenant = useCallback(
    async (tenantId: string, updates: Partial<Tenant>) => {
      if (role !== 'super_admin') throw new Error('Only super admins can update tenants');

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
    [currentTenant, role, tenants]
  );

  // Invite member
  const inviteMember = useCallback(
    async (tenantId: string, email: string, inviteRole: TenantRole) => {
      if (!user) throw new Error('User not authenticated');
      if (role !== 'super_admin') throw new Error('Only super admins can invite tenant users');

      try {
        const token = Math.random().toString(36).substring(2, 15);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

        const { error } = await supabase
          .from('tenant_invites')
          .insert({
            tenant_id: tenantId,
            email,
            role: inviteRole,
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
    [user, role]
  );

  // Remove member
  const removeMember = useCallback(async (tenantId: string, userId: string) => {
    if (role !== 'super_admin') throw new Error('Only super admins can remove tenant users');

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
  }, [role, tenantMembers]);

  // Update member role
  const updateMemberRole = useCallback(
    async (tenantId: string, userId: string, nextRole: TenantRole) => {
      if (role !== 'super_admin') throw new Error('Only super admins can update tenant user roles');

      try {
        const { error } = await supabase
          .from('tenant_members')
          .update({ role: nextRole })
          .eq('tenant_id', tenantId)
          .eq('user_id', userId);

        if (error) throw error;

        const updatedMembers = tenantMembers.map((m) =>
          m.user_id === userId ? { ...m, role: nextRole } : m
        );
        setTenantMembers(updatedMembers);
      } catch (error) {
        console.error('Error updating member role:', error);
        throw error;
      }
    },
    [role, tenantMembers]
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

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};
