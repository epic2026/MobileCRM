import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Users,
  Settings,
  LogOut,
  Plus,
  UserCheck,
  UserX,
  Pencil,
  Trash2,
  Upload,
  LayoutDashboard,
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  Filter,
  MessageSquare,
  Phone,
  PhoneCall,
  Link2,
  Search,
  RefreshCw,
  SendHorizontal,
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  Download,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import LeadImport from '@/components/admin/LeadImport';
import LeadAssignment from '@/components/admin/LeadAssignment';
import type { Database } from '@/integrations/supabase/types';

type AdminSection = 'overview' | 'leads' | 'call-activity' | 'marketplace' | 'settings';
type SettingsTab = 'users' | 'activity';
type Lead = Database['public']['Tables']['leads']['Row'];
type LeadActivity = Database['public']['Tables']['lead_activities']['Row'];
type CallLog = Database['public']['Tables']['call_logs']['Row'];
type LeadTask = Database['public']['Tables']['lead_tasks']['Row'];

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface UserWithRole extends Profile {
  role: 'admin' | 'sales' | null;
}

type ZohoConnectorState = {
  apiDomain: string;
  accountsServer: string;
};

type ZohoConnectionStatus = {
  connected: boolean;
  apiDomain: string;
  accountsServer: string;
  scope: string | null;
  expiresAt: string | null;
};

type SyncLogItem = {
  id: string;
  time: string;
  mode: 'tasks' | 'activities' | 'manual';
  success: number;
  failed: number;
  status: 'success' | 'warning' | 'error';
  details?: Array<{ id: string; reason: string }>;
};

const AdminDashboard = () => {
  const { user, role, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('users');

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string; mode: 'deactivate' | 'delete' } | null>(null);

  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'sales' as 'admin' | 'sales',
  });

  const [editUserData, setEditUserData] = useState({
    id: '',
    email: '',
    fullName: '',
    role: 'sales' as 'admin' | 'sales',
    isActive: true,
  });

  const [zohoConnector, setZohoConnector] = useState<ZohoConnectorState>({
    apiDomain: 'https://www.zohoapis.com',
    accountsServer: 'https://accounts.zoho.com',
  });
  const [zohoSyncState, setZohoSyncState] = useState<{ tasks: boolean; activities: boolean }>({
    tasks: false,
    activities: false,
  });
  const [callReportView, setCallReportView] = useState<'overview' | 'user' | 'logs'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<'all' | 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'>('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadDetailId, setLeadDetailId] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const usersPageSize = 10;

  useEffect(() => {
    if (!isLoading && (!user || role !== 'admin')) {
      navigate('/admin/login');
    }
  }, [isLoading, navigate, role, user]);

  useEffect(() => {
    const saved = window.localStorage.getItem('admin-zoho-connector');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as ZohoConnectorState;
      if (parsed?.apiDomain && parsed?.accountsServer) {
        setZohoConnector(parsed);
      }
    } catch {
      // Ignore invalid cache.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('admin-zoho-connector', JSON.stringify(zohoConnector));
  }, [zohoConnector]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const rolesMap = new Map(roles?.map((item) => [item.user_id, item.role]) || []);

      return (profiles || []).map((profile) => ({
        ...profile,
        role: rolesMap.get(profile.id) || null,
      })) as UserWithRole[];
    },
    enabled: role === 'admin',
  });

  const {
    data: zohoStatus,
    isLoading: zohoStatusLoading,
    refetch: refetchZohoStatus,
  } = useQuery({
    queryKey: ['zoho-oauth-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('zoho_oauth', {
        body: { action: 'status' },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch Zoho connection status');
      }

      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to fetch Zoho connection status');
      }

      return data as ZohoConnectionStatus;
    },
    enabled: role === 'admin',
  });

  useEffect(() => {
    if (!zohoStatus) return;
    setZohoConnector((prev) => ({
      ...prev,
      apiDomain: zohoStatus.apiDomain || prev.apiDomain,
      accountsServer: zohoStatus.accountsServer || prev.accountsServer,
    }));
  }, [zohoStatus]);

  const { data: leads = [] } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: role === 'admin',
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['admin-activity-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: role === 'admin',
  });

  const { data: callLogs = [] } = useQuery({
    queryKey: ['admin-call-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as CallLog[];
    },
    enabled: role === 'admin',
  });

  const { data: leadTasks = [] } = useQuery({
    queryKey: ['admin-lead-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as LeadTask[];
    },
    enabled: role === 'admin',
  });

  const leadMap = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const userMap = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users]);
  const salesUsers = useMemo(
    () => users.filter((entry) => entry.role === 'sales' && entry.is_active),
    [users],
  );

  const filteredCallLogs = useMemo(() => callLogs, [callLogs]);

  const filteredActivities = useMemo(() => activities, [activities]);

  const filteredLeads = useMemo(() => leads, [leads]);

  const dashboardInsights = useMemo(() => {
    const connectedCalls = filteredCallLogs.filter((entry) => (entry.duration || 0) > 0).length;
    const connectRate = filteredCallLogs.length
      ? Math.round((connectedCalls / filteredCallLogs.length) * 100)
      : 0;

    const overdueTasks = leadTasks.filter((task) => {
      if (!task.due_date || task.status === 'completed') return false;
      return new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0);
    });

    const taskLeadIds = new Set(
      leadTasks
        .filter((task) => task.lead_id)
        .map((task) => task.lead_id as string),
    );

    const unattendedCalls = filteredCallLogs.filter((entry) =>
      entry.type === 'missed'
      || ((entry.type === 'outgoing') && (entry.duration || 0) === 0)
      || ((entry.outcome || '').toLowerCase().includes('no answer')),
    );

    const callsWithoutFollowup = unattendedCalls.filter((entry) =>
      !entry.lead_id || !taskLeadIds.has(entry.lead_id),
    );

    const staleLeads = filteredLeads.filter((lead) => {
      const updatedAt = new Date(lead.updated_at).getTime();
      if (Number.isNaN(updatedAt)) return false;
      const fourteenDaysAgo = subDays(new Date(), 14).getTime();
      return updatedAt < fourteenDaysAgo;
    });

    const userCalls = new Map<string, { user: string; calls: number }>();
    filteredCallLogs.forEach((entry) => {
      const key = entry.user_id || 'unassigned';
      const label = entry.user_id
        ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'Assigned user'
        : 'System/Unassigned';
      const current = userCalls.get(key) || { user: label, calls: 0 };
      current.calls += 1;
      userCalls.set(key, current);
    });

    const topUser = Array.from(userCalls.values()).sort((a, b) => b.calls - a.calls)[0] || null;

    return {
      connectRate,
      overdueTasks: overdueTasks.length,
      callsWithoutFollowup: callsWithoutFollowup.length,
      staleLeads: staleLeads.length,
      topUser,
      connectedCalls,
    };
  }, [filteredCallLogs, filteredLeads, leadTasks, userMap]);

  const leadRows = useMemo(() => {
    const searchText = leadSearch.trim().toLowerCase();
    return filteredLeads
      .filter((lead) => leadStatusFilter === 'all' || lead.status === leadStatusFilter)
      .filter((lead) => {
        if (!searchText) return true;
        const haystack = `${lead.name} ${lead.email || ''} ${lead.phone || ''} ${lead.company || ''}`.toLowerCase();
        return haystack.includes(searchText);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filteredLeads, leadSearch, leadStatusFilter]);

  const selectedLeadRows = useMemo(
    () => leadRows.filter((lead) => selectedLeadIds.includes(lead.id)),
    [leadRows, selectedLeadIds],
  );

  const leadDetail = useMemo(
    () => leads.find((entry) => entry.id === leadDetailId) || null,
    [leadDetailId, leads],
  );

  const paginatedUsers = useMemo(() => {
    const start = (usersPage - 1) * usersPageSize;
    return users.slice(start, start + usersPageSize);
  }, [users, usersPage]);

  const usersPageCount = Math.max(1, Math.ceil(users.length / usersPageSize));

  useEffect(() => {
    setUsersPage((current) => Math.min(current, usersPageCount));
  }, [usersPageCount]);

  const formatCallDuration = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  };

  const callActivityReport = useMemo(() => {
    const filtered = filteredCallLogs;

    const byUser = new Map<string, {
      user: string;
      totalCalls: number;
      connectedCalls: number;
      incomingCalls: number;
      outgoingCalls: number;
      missedCalls: number;
      durationSeconds: number;
    }>();

    const byLead = new Map<string, {
      lead: string;
      phone: string;
      owner: string;
      totalCalls: number;
      connectedCalls: number;
      durationSeconds: number;
      lastCallAt: string;
    }>();

    const byCalendar = new Map<string, {
      date: string;
      totalCalls: number;
      connectedCalls: number;
      missedCalls: number;
      outgoingCalls: number;
      incomingCalls: number;
      durationSeconds: number;
    }>();

    filtered.forEach((entry) => {
      const userLabel = entry.user_id
        ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'Assigned user'
        : 'System/Unassigned';
      const userKey = entry.user_id || 'unassigned';
      const userBucket = byUser.get(userKey) || {
        user: userLabel,
        totalCalls: 0,
        connectedCalls: 0,
        incomingCalls: 0,
        outgoingCalls: 0,
        missedCalls: 0,
        durationSeconds: 0,
      };
      userBucket.totalCalls += 1;
      userBucket.durationSeconds += entry.duration || 0;
      if ((entry.duration || 0) > 0) userBucket.connectedCalls += 1;
      if (entry.type === 'incoming') userBucket.incomingCalls += 1;
      if (entry.type === 'outgoing') userBucket.outgoingCalls += 1;
      if (entry.type === 'missed') userBucket.missedCalls += 1;
      byUser.set(userKey, userBucket);

      const leadLabel = entry.lead_id
        ? leadMap.get(entry.lead_id)?.name || entry.contact_name || entry.phone
        : entry.contact_name || entry.phone;
      const leadOwner = entry.lead_id && leadMap.get(entry.lead_id)?.user_id
        ? userMap.get(leadMap.get(entry.lead_id)?.user_id || '')?.full_name
          || userMap.get(leadMap.get(entry.lead_id)?.user_id || '')?.email
          || 'Assigned user'
        : userLabel;
      const leadKey = entry.lead_id || entry.phone;
      const leadBucket = byLead.get(leadKey) || {
        lead: leadLabel,
        phone: entry.phone,
        owner: leadOwner,
        totalCalls: 0,
        connectedCalls: 0,
        durationSeconds: 0,
        lastCallAt: entry.created_at,
      };
      leadBucket.totalCalls += 1;
      leadBucket.durationSeconds += entry.duration || 0;
      if ((entry.duration || 0) > 0) leadBucket.connectedCalls += 1;
      if (new Date(entry.created_at).getTime() > new Date(leadBucket.lastCallAt).getTime()) {
        leadBucket.lastCallAt = entry.created_at;
      }
      byLead.set(leadKey, leadBucket);

      const dayKey = format(new Date(entry.created_at), 'yyyy-MM-dd');
      const dayBucket = byCalendar.get(dayKey) || {
        date: dayKey,
        totalCalls: 0,
        connectedCalls: 0,
        missedCalls: 0,
        outgoingCalls: 0,
        incomingCalls: 0,
        durationSeconds: 0,
      };
      dayBucket.totalCalls += 1;
      dayBucket.durationSeconds += entry.duration || 0;
      if ((entry.duration || 0) > 0) dayBucket.connectedCalls += 1;
      if (entry.type === 'missed') dayBucket.missedCalls += 1;
      if (entry.type === 'outgoing') dayBucket.outgoingCalls += 1;
      if (entry.type === 'incoming') dayBucket.incomingCalls += 1;
      byCalendar.set(dayKey, dayBucket);
    });

    const totalDurationSeconds = filtered.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const totalConnectedCalls = filtered.filter((entry) => (entry.duration || 0) > 0).length;

    return {
      invalidRange: false,
      filtered,
      totals: {
        totalCalls: filtered.length,
        totalConnectedCalls,
        totalMissedCalls: filtered.filter((entry) => entry.type === 'missed').length,
        totalDurationSeconds,
      },
      byUser: Array.from(byUser.values()).sort((a, b) => b.totalCalls - a.totalCalls),
      byLead: Array.from(byLead.values()).sort((a, b) => b.totalCalls - a.totalCalls),
      byCalendar: Array.from(byCalendar.values()).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [filteredCallLogs, leadMap, userMap]);

  const createUser = useMutation({
    mutationFn: async (data: { email: string; password: string; fullName: string; role: 'admin' | 'sales' }) => {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.fullName },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: authData.user.id,
        role: data.role,
      });

      if (roleError) throw roleError;
      return authData.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Created', description: 'User has been created successfully.' });
      setIsCreateDialogOpen(false);
      setNewUserData({ email: '', password: '', fullName: '', role: 'sales' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Create User', description: error.message, variant: 'destructive' });
    },
  });

  const updateUser = useMutation({
    mutationFn: async (data: { id: string; fullName: string; role: 'admin' | 'sales'; isActive: boolean }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: data.fullName, is_active: data.isActive })
        .eq('id', data.id);

      if (profileError) throw profileError;

      const { data: existingRole, error: roleFetchError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', data.id)
        .maybeSingle();

      if (roleFetchError) throw roleFetchError;

      if (existingRole) {
        const { error: roleUpdateError } = await supabase
          .from('user_roles')
          .update({ role: data.role })
          .eq('user_id', data.id);

        if (roleUpdateError) throw roleUpdateError;
      } else {
        const { error: roleInsertError } = await supabase
          .from('user_roles')
          .insert({ user_id: data.id, role: data.role });

        if (roleInsertError) throw roleInsertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Updated', description: 'User details have been saved.' });
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Update User', description: error.message, variant: 'destructive' });
    },
  });

  const removeUserAccess = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', userId);

      if (profileError) throw profileError;

      const { error: roleDeleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (roleDeleteError) throw roleDeleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Deactivated', description: 'User access has been removed and account deactivated.' });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Deactivate User', description: error.message, variant: 'destructive' });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke('delete_user', {
        body: { userId },
      });
      if (error) throw new Error(error.message || 'Delete failed');
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Deleted', description: 'User has been permanently deleted.' });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Delete Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const handleEditUser = (selectedUser: UserWithRole) => {
    setEditUserData({
      id: selectedUser.id,
      email: selectedUser.email,
      fullName: selectedUser.full_name || '',
      role: selectedUser.role || 'sales',
      isActive: selectedUser.is_active,
    });
    setIsEditDialogOpen(true);
  };

  const zohoSyncMutation = useMutation({
    mutationFn: async ({ mode }: { mode: 'tasks' | 'activities' }) => {
      if (!zohoStatus?.connected) {
        throw new Error('Connect Zoho CRM first.');
      }

      const tasksPayload = leadTasks.slice(0, 100).map((task) => {
        const lead = leadMap.get(task.lead_id || '');
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          status: task.status,
          lead: lead
            ? {
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
              }
            : null,
        };
      });

      const activitiesPayload = activities.slice(0, 100).map((activity) => {
        const lead = leadMap.get(activity.lead_id || '');
        return {
          id: activity.id,
          type: activity.type,
          title: activity.title,
          description: activity.description,
          created_at: activity.created_at,
          lead: lead
            ? {
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
              }
            : null,
        };
      });

      const { data, error } = await supabase.functions.invoke('zoho_connector', {
        body: {
          mode,
          records: mode === 'tasks' ? tasksPayload : activitiesPayload,
        },
      });

      if (error) {
        throw new Error(error.message || 'Zoho sync failed');
      }

      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Zoho sync failed');
      }

      return data as { success: number; failed: number; details?: Array<{ id: string; reason: string }> };
    },
    onSuccess: (result, variables) => {
      setSyncLogs((prev) => [
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          mode: variables.mode,
          success: result.success,
          failed: result.failed,
          status: result.failed > 0 ? 'warning' : 'success',
          details: result.details,
        },
        ...prev,
      ].slice(0, 20));
      toast({
        title: variables.mode === 'tasks' ? 'Zoho task sync complete' : 'Zoho activity sync complete',
        description: `${result.success} pushed, ${result.failed} failed.`,
      });
    },
    onError: (error: Error) => {
      setSyncLogs((prev) => [
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          mode: 'manual',
          success: 0,
          failed: 0,
          status: 'error',
          details: [{ id: 'sync-error', reason: error.message }],
        },
        ...prev,
      ].slice(0, 20));
      toast({ title: 'Zoho sync failed', description: error.message, variant: 'destructive' });
    },
    onSettled: (_data, _error, variables) => {
      if (!variables) return;
      setZohoSyncState((prev) => ({ ...prev, [variables.mode]: false }));
    },
  });

  const zohoAuthorizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('zoho_oauth', {
        body: {
          action: 'authorize_url',
          apiDomain: zohoConnector.apiDomain,
          accountsServer: zohoConnector.accountsServer,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to start Zoho OAuth');
      }

      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to start Zoho OAuth');
      }

      return data as { authUrl: string };
    },
  });

  const zohoDisconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('zoho_oauth', {
        body: { action: 'disconnect' },
      });

      if (error) {
        throw new Error(error.message || 'Failed to disconnect Zoho');
      }

      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to disconnect Zoho');
      }
    },
    onSuccess: async () => {
      await refetchZohoStatus();
      toast({ title: 'Zoho disconnected', description: 'Server-side OAuth credentials were removed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Disconnect failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleConnectZoho = async () => {
    try {
      const { authUrl } = await zohoAuthorizeMutation.mutateAsync();
      const popup = window.open(authUrl, 'zoho-oauth', 'width=560,height=760');

      if (!popup) {
        toast({
          title: 'Popup blocked',
          description: 'Allow popups for this site and retry Zoho connect.',
          variant: 'destructive',
        });
        return;
      }

      let closedCheck = 0;
      let pollTimer: number | null = null;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        if (pollTimer) {
          window.clearInterval(pollTimer);
        }
      };

      const onMessage = async (event: MessageEvent) => {
        if (!event?.data || event.data.type !== 'ZOHO_OAUTH_RESULT') return;
        cleanup();
        if (event.data.ok) {
          await refetchZohoStatus();
          toast({ title: 'Zoho connected', description: 'OAuth credentials are now stored securely on server.' });
        } else {
          toast({ title: 'Zoho connect failed', description: event.data.message || 'OAuth callback failed', variant: 'destructive' });
        }
      };

      window.addEventListener('message', onMessage);

      pollTimer = window.setInterval(async () => {
        if (!popup.closed) return;
        closedCheck += 1;
        if (closedCheck < 1) return;
        cleanup();
        await refetchZohoStatus();
      }, 1000);
    } catch (error) {
      toast({ title: 'Zoho connect failed', description: error instanceof Error ? error.message : 'Failed to start OAuth', variant: 'destructive' });
    }
  };

  const exportCsv = (filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
    const escapeValue = (value: string | number | null | undefined) => {
      const stringValue = String(value ?? '');
      if (/[,"\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => escapeValue(cell)).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportCurrentView = () => {
    if (activeSection === 'leads') {
      exportCsv(
        'admin-leads.csv',
        ['Name', 'Company', 'Status', 'Owner', 'Phone', 'Email', 'Created'],
        leadRows.map((lead) => [
          lead.name,
          lead.company || '',
          lead.status,
          lead.user_id ? userMap.get(lead.user_id)?.full_name || userMap.get(lead.user_id)?.email || 'Assigned user' : 'Unassigned',
          lead.phone,
          lead.email || '',
          format(new Date(lead.created_at), 'yyyy-MM-dd HH:mm'),
        ]),
      );
      return;
    }

    if (activeSection === 'call-activity') {
      exportCsv(
        'admin-call-activity.csv',
        ['Time', 'User', 'Lead/Contact', 'Type', 'Duration Seconds', 'Outcome'],
        callActivityReport.filtered.map((entry) => [
          format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm'),
          entry.user_id ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'User' : 'System',
          entry.lead_id ? leadMap.get(entry.lead_id)?.name || entry.contact_name || entry.phone : entry.contact_name || entry.phone,
          entry.type,
          entry.duration || 0,
          entry.outcome || '',
        ]),
      );
      return;
    }

    if (activeSection === 'settings') {
      if (settingsTab === 'users') {
        exportCsv(
          'admin-users.csv',
          ['Name', 'Email', 'Role', 'Status', 'Created'],
          users.map((entry) => [
            entry.full_name || 'No name',
            entry.email,
            entry.role || 'No role',
            entry.is_active ? 'Active' : 'Inactive',
            format(new Date(entry.created_at), 'yyyy-MM-dd'),
          ]),
        );
      } else {
        exportCsv(
          'admin-activity-log.csv',
          ['Time', 'Activity', 'Lead', 'User'],
          filteredActivities.map((entry) => [
            format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm'),
            entry.title,
            entry.lead_id ? leadMap.get(entry.lead_id)?.name || 'Lead' : 'N/A',
            entry.user_id ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'User' : 'System',
          ]),
        );
      }
      return;
    }

    exportCsv(
      'admin-overview.csv',
      ['Metric', 'Value'],
      [
        ['Connect Rate', `${dashboardInsights.connectRate}%`],
        ['Overdue Tasks', dashboardInsights.overdueTasks],
        ['Calls Without Follow-up', dashboardInsights.callsWithoutFollowup],
        ['Stale Leads', dashboardInsights.staleLeads],
        ['Connected Calls', dashboardInsights.connectedCalls],
      ],
    );
  };

  const navigationItems: Array<{ id: AdminSection; label: string; caption: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Overview', caption: 'Workspace pulse', icon: LayoutDashboard },
    { id: 'leads', label: 'Manage Leads', caption: 'Lead pipeline', icon: Users },
    { id: 'call-activity', label: 'Reports', caption: 'Call insights', icon: Activity },
    { id: 'marketplace', label: 'Integrations', caption: 'CRM sync', icon: Link2 },
    { id: 'settings', label: 'Settings', caption: 'Access control', icon: Settings },
  ];

  const activeSectionTitle =
    activeSection === 'overview'
      ? 'Admin Dashboard'
      : activeSection === 'leads'
        ? 'Manage Leads'
        : activeSection === 'call-activity'
          ? 'Reports'
          : activeSection === 'marketplace'
            ? 'Integrations'
            : 'Settings';

  const activeSectionDescription =
    activeSection === 'overview'
      ? 'Operational visibility across leads, calls, integrations, and user governance.'
      : activeSection === 'leads'
        ? 'Browse, filter, import, and assign lead records from one workspace.'
        : activeSection === 'call-activity'
          ? 'Inspect team calling performance, quality, and raw logs.'
          : activeSection === 'marketplace'
            ? 'Manage CRM connectivity, sync jobs, and connector health.'
            : 'Control user lifecycle, permissions, and audit visibility.';

  const activeSectionCount =
    activeSection === 'overview'
      ? `${leads.length + users.length + callLogs.length} records monitored`
      : activeSection === 'leads'
        ? `${leadRows.length} leads visible`
        : activeSection === 'call-activity'
          ? `${callActivityReport.filtered.length} calls in report`
          : activeSection === 'marketplace'
            ? `${syncLogs.length} sync runs tracked`
            : settingsTab === 'users'
              ? `${users.length} users managed`
              : `${filteredActivities.length} activity events`;

  const primaryActionLabel =
    activeSection === 'settings'
      ? 'Add User'
      : activeSection === 'marketplace'
        ? (zohoStatus?.connected ? 'Reconnect CRM' : 'Connect CRM')
        : activeSection === 'call-activity'
          ? 'Open Logs'
          : 'Quick Actions';

  const handlePrimaryAction = () => {
    if (activeSection === 'settings') {
      setIsCreateDialogOpen(true);
      setSettingsTab('users');
      return;
    }

    if (activeSection === 'marketplace') {
      void handleConnectZoho();
      return;
    }

    if (activeSection === 'call-activity') {
      setCallReportView('logs');
      return;
    }

    setCommandOpen(true);
  };

  const getLeadProgressValue = (status: string | null) => {
    switch ((status || '').toLowerCase()) {
      case 'new':
        return 18;
      case 'contacted':
        return 34;
      case 'qualified':
        return 56;
      case 'proposal':
        return 74;
      case 'negotiation':
        return 86;
      case 'won':
        return 100;
      case 'lost':
        return 12;
      default:
        return 24;
    }
  };

  const getLeadStatusClasses = (status: string | null) => {
    switch ((status || '').toLowerCase()) {
      case 'won':
        return {
          badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          progress: 'bg-emerald-200',
          tail: 'bg-emerald-50',
        };
      case 'lost':
        return {
          badge: 'bg-rose-100 text-rose-700 border-rose-200',
          progress: 'bg-rose-200',
          tail: 'bg-rose-50',
        };
      case 'proposal':
      case 'negotiation':
        return {
          badge: 'bg-violet-100 text-violet-700 border-violet-200',
          progress: 'bg-violet-100',
          tail: 'bg-violet-50',
        };
      case 'qualified':
        return {
          badge: 'bg-sky-100 text-sky-700 border-sky-200',
          progress: 'bg-sky-100',
          tail: 'bg-emerald-50',
        };
      default:
        return {
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
          progress: 'bg-sky-50',
          tail: 'bg-emerald-50',
        };
    }
  };

  const renderOverview = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b bg-card">
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" />
            Executive Overview
          </CardTitle>
          <CardDescription>High-level operational status for leads, calls, and team execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Leads Created</p>
                <p className="text-2xl font-semibold">{filteredLeads.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Calls</p>
                <p className="text-2xl font-semibold">{filteredCallLogs.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Connect Rate</p>
                <p className="text-2xl font-semibold">{dashboardInsights.connectRate}%</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Overdue Tasks</p>
                <p className="text-2xl font-semibold">{dashboardInsights.overdueTasks}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Activities Logged</p>
                <p className="text-2xl font-semibold">{filteredActivities.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top Performer</p>
                <p className="truncate text-sm font-semibold">{dashboardInsights.topUser?.user || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">{dashboardInsights.topUser?.calls || 0} calls</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Action Center</CardTitle>
                <CardDescription>Priority operational issues from the selected filter scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(dashboardInsights.callsWithoutFollowup > 25 || dashboardInsights.overdueTasks > 12 || dashboardInsights.staleLeads > 20) && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <p className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Critical attention needed
                    </p>
                    <p className="mt-1 text-xs">At least one key metric crossed a high-risk threshold in current filter scope.</p>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <CircleAlert className="h-4 w-4 text-amber-600" />
                      Missed/Unanswered Without Follow-up
                    </p>
                    <p className="text-xs text-muted-foreground">Calls needing immediate task creation.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold">{dashboardInsights.callsWithoutFollowup}</p>
                    <Badge variant={dashboardInsights.callsWithoutFollowup > 25 ? 'destructive' : 'secondary'}>
                      {dashboardInsights.callsWithoutFollowup > 25 ? 'High' : 'Medium'}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setActiveSection('call-activity')}>Review</Button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <CircleAlert className="h-4 w-4 text-orange-600" />
                      Overdue Tasks
                    </p>
                    <p className="text-xs text-muted-foreground">Pending items past due date.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold">{dashboardInsights.overdueTasks}</p>
                    <Badge variant={dashboardInsights.overdueTasks > 12 ? 'destructive' : 'secondary'}>
                      {dashboardInsights.overdueTasks > 12 ? 'High' : 'Medium'}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setActiveSection('settings')}>Open</Button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <CircleCheck className="h-4 w-4 text-emerald-600" />
                      Stale Leads
                    </p>
                    <p className="text-xs text-muted-foreground">Leads with no update in the last 14 days.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold">{dashboardInsights.staleLeads}</p>
                    <Badge variant={dashboardInsights.staleLeads > 20 ? 'secondary' : 'outline'}>
                      {dashboardInsights.staleLeads > 20 ? 'Watch' : 'Normal'}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setActiveSection('leads')}>Act</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Team Call Snapshot</CardTitle>
                <CardDescription>Top users by call volume in the selected date range.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[320px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Calls</TableHead>
                        <TableHead>Connected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callActivityReport.byUser.slice(0, 8).map((entry) => (
                        <TableRow key={`overview-${entry.user}`}>
                          <TableCell className="font-medium">{entry.user}</TableCell>
                          <TableCell>{entry.totalCalls}</TableCell>
                          <TableCell>{entry.connectedCalls}</TableCell>
                        </TableRow>
                      ))}
                      {callActivityReport.byUser.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">No call data in selected range.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderLeads = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4">
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads by name, email, phone, company"
                  className="pl-9"
                  value={leadSearch}
                  onChange={(event) => setLeadSearch(event.target.value)}
                />
              </div>
              <Select value={leadStatusFilter} onValueChange={(value: typeof leadStatusFilter) => setLeadStatusFilter(value)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { setLeadStatusFilter('all'); setLeadSearch(''); }}>
                <Filter className="mr-2 h-4 w-4" />
                Clear
              </Button>
              <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="whitespace-nowrap">
                    <Upload className="mr-2 h-4 w-4" />
                    Import Leads
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Import Leads</DialogTitle>
                    <DialogDescription>Upload CSV/Excel and import leads for assignment.</DialogDescription>
                  </DialogHeader>
                  <LeadImport />
                </DialogContent>
              </Dialog>
            </div>

            {selectedLeadIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                <Badge variant="secondary">{selectedLeadIds.length} selected</Badge>
                <Button size="sm" variant="outline">Assign</Button>
                <Button size="sm" variant="outline">
                  <PhoneCall className="mr-1 h-3 w-3" />
                  Call
                </Button>
                <Button size="sm" variant="outline">
                  <MessageSquare className="mr-1 h-3 w-3" />
                  Message
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedLeadIds([])}>Clear selection</Button>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <input
                          type="checkbox"
                          checked={leadRows.length > 0 && selectedLeadIds.length === leadRows.length}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedLeadIds(leadRows.map((lead) => lead.id));
                            } else {
                              setSelectedLeadIds([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadRows.map((lead) => {
                      const owner = lead.user_id
                        ? userMap.get(lead.user_id)?.full_name || userMap.get(lead.user_id)?.email || 'Assigned user'
                        : 'Unassigned';
                      return (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.includes(lead.id)}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedLeadIds((prev) => [...prev, lead.id]);
                                } else {
                                  setSelectedLeadIds((prev) => prev.filter((id) => id !== lead.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{lead.name}</p>
                            <p className="text-xs text-muted-foreground">{lead.phone}</p>
                            {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                          </TableCell>
                          <TableCell>{lead.company || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={lead.status === 'won' ? 'default' : lead.status === 'lost' ? 'destructive' : 'secondary'}>
                              {lead.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{owner}</TableCell>
                          <TableCell>{format(new Date(lead.created_at), 'dd MMM yyyy')}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setLeadDetailId(lead.id)}>Open</Button>
                              <Button size="sm" variant="outline"><PhoneCall className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline"><MessageSquare className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {leadRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No leads match current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignment Workspace</p>
              <LeadAssignment />
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!leadDetailId} onOpenChange={(open) => !open && setLeadDetailId(null)}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{leadDetail?.name || 'Lead Details'}</SheetTitle>
            <SheetDescription>Quick detail panel for rapid lead actions.</SheetDescription>
          </SheetHeader>
          {leadDetail ? (
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Contact</p>
                <p className="font-medium">{leadDetail.phone}</p>
                {leadDetail.email && <p className="text-muted-foreground">{leadDetail.email}</p>}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Company</p>
                <p className="font-medium">{leadDetail.company || '-'}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <Badge>{leadDetail.status}</Badge>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{leadDetail.notes || 'No notes available.'}</p>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );

  const renderCallActivity = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-2 border-b bg-card">
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Activity Reports
          </CardTitle>
          <CardDescription>Actionable call reporting by user, by lead, and by calendar day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total Calls</p>
                <p className="text-2xl font-semibold">{callActivityReport.totals.totalCalls}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Connected Calls</p>
                <p className="text-2xl font-semibold">{callActivityReport.totals.totalConnectedCalls}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Missed Calls</p>
                <p className="text-2xl font-semibold">{callActivityReport.totals.totalMissedCalls}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Talk Time</p>
                <p className="text-xl font-semibold">{formatCallDuration(callActivityReport.totals.totalDurationSeconds)}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={callReportView} onValueChange={(value) => setCallReportView(value as typeof callReportView)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="user">User Performance</TabsTrigger>
              <TabsTrigger value="logs">Call Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="border-border/70 xl:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Calls vs Connected Trend</CardTitle>
                    <CardDescription>Daily momentum of activity and outcomes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {callActivityReport.byCalendar.slice(0, 10).map((entry) => {
                        const total = Math.max(entry.totalCalls, 1);
                        const connectedWidth = `${Math.round((entry.connectedCalls / total) * 100)}%`;
                        return (
                          <div key={`trend-${entry.date}`}>
                            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{format(new Date(entry.date), 'dd MMM')}</span>
                              <span>{entry.connectedCalls}/{entry.totalCalls}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted">
                              <div className="h-2 rounded-full bg-primary" style={{ width: connectedWidth }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-base">Leaderboard</CardTitle>
                    <CardDescription>Top call performers by volume.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {callActivityReport.byUser.slice(0, 5).map((entry, index) => (
                      <div key={`lb-${entry.user}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span className="font-medium">#{index + 1} {entry.user}</span>
                        <Badge variant="secondary">{entry.totalCalls}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="user">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">User Performance View</CardTitle>
                <CardDescription>Measure each user's call load, connect quality, and direction mix.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[460px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Calls</TableHead>
                        <TableHead>Connected</TableHead>
                        <TableHead>Incoming</TableHead>
                        <TableHead>Outgoing</TableHead>
                        <TableHead>Missed</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callActivityReport.byUser.map((entry) => (
                        <TableRow key={entry.user}>
                          <TableCell className="font-medium">{entry.user}</TableCell>
                          <TableCell>{entry.totalCalls}</TableCell>
                          <TableCell>{entry.connectedCalls}</TableCell>
                          <TableCell>{entry.incomingCalls}</TableCell>
                          <TableCell>{entry.outgoingCalls}</TableCell>
                          <TableCell>{entry.missedCalls}</TableCell>
                          <TableCell>{formatCallDuration(entry.durationSeconds)}</TableCell>
                        </TableRow>
                      ))}
                      {callActivityReport.byUser.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">No call data in selected range.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="logs">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Call Logs</CardTitle>
                <CardDescription>Detailed logs for QA, coaching, and audit.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[460px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Lead / Contact</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Outcome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callActivityReport.filtered.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{format(new Date(entry.created_at), 'dd MMM yyyy, h:mm a')}</TableCell>
                          <TableCell>{entry.user_id ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'User' : 'System'}</TableCell>
                          <TableCell>{entry.lead_id ? leadMap.get(entry.lead_id)?.name || entry.contact_name || entry.phone : entry.contact_name || entry.phone}</TableCell>
                          <TableCell><Badge variant="secondary">{entry.type}</Badge></TableCell>
                          <TableCell>{formatCallDuration(entry.duration || 0)}</TableCell>
                          <TableCell>{entry.outcome || '-'}</TableCell>
                        </TableRow>
                      ))}
                      {callActivityReport.filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">No call logs in selected range.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );

  const renderMarketplace = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connect Your CRM
          </CardTitle>
          <CardDescription>Enterprise CRM synchronization workspace for secure OAuth, auditability, and controlled sync actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Zoho CRM</p>
                <p className="text-xs text-muted-foreground">Push lead activities and tasks from MobileCRM to Zoho CRM records.</p>
              </div>
              {zohoStatus?.connected ? <Badge className="bg-emerald-600 text-white">Connected</Badge> : <Badge variant="secondary">Not Connected</Badge>}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Zoho API Domain</Label>
                <Input
                  value={zohoConnector.apiDomain}
                  onChange={(event) => setZohoConnector((prev) => ({ ...prev, apiDomain: event.target.value.trim() }))}
                  placeholder="https://www.zohoapis.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Zoho Accounts Server</Label>
                <Input
                  value={zohoConnector.accountsServer}
                  onChange={(event) => setZohoConnector((prev) => ({ ...prev, accountsServer: event.target.value.trim() }))}
                  placeholder="https://accounts.zoho.com"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Required scopes: ZohoCRM.modules.tasks.CREATE, ZohoCRM.modules.calls.CREATE, ZohoCRM.modules.leads.READ, ZohoSearch.securesearch.READ
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={handleConnectZoho}
                disabled={zohoAuthorizeMutation.isPending || zohoStatusLoading}
              >
                {zohoAuthorizeMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                {zohoStatus?.connected ? 'Reconnect Zoho CRM' : 'Connect Zoho CRM'}
              </Button>
              <Button
                variant="outline"
                onClick={() => zohoDisconnectMutation.mutate()}
                disabled={!zohoStatus?.connected || zohoDisconnectMutation.isPending}
              >
                {zohoDisconnectMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                Disconnect
              </Button>
            </div>

            {zohoStatus?.connected && (
              <p className="mt-2 text-xs text-muted-foreground">
                Connected. Token expiry: {zohoStatus.expiresAt ? format(new Date(zohoStatus.expiresAt), 'dd MMM yyyy, h:mm a') : 'managed automatically'}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">How this works (Zoho Integration)</p>
            <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <p>1. Click Connect Zoho CRM and complete OAuth in the popup.</p>
              <p>2. OAuth tokens are stored securely on the server, not in the browser.</p>
              <p>3. During sync, MobileCRM matches each record to a Zoho lead by email, then phone, then name.</p>
              <p>4. Matched records are pushed to Zoho: tasks go to Tasks, call activities go to Calls.</p>
              <p>5. The sync summary reports pushed vs failed records, and skipped lead matches.</p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">Sync Actions</p>
            <p className="mb-3 text-xs text-muted-foreground">Push records against matched Zoho leads (matched by email, then phone, then name).</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setZohoSyncState((prev) => ({ ...prev, tasks: true }));
                  zohoSyncMutation.mutate({ mode: 'tasks' });
                }}
                disabled={zohoSyncState.tasks || zohoSyncMutation.isPending || !zohoStatus?.connected}
              >
                {zohoSyncState.tasks ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizontal className="mr-2 h-4 w-4" />}
                Push Tasks to Zoho
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setZohoSyncState((prev) => ({ ...prev, activities: true }));
                  zohoSyncMutation.mutate({ mode: 'activities' });
                }}
                disabled={zohoSyncState.activities || zohoSyncMutation.isPending || !zohoStatus?.connected}
              >
                {zohoSyncState.activities ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizontal className="mr-2 h-4 w-4" />}
                Push Activities to Zoho
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Integration Health</CardTitle>
                <CardDescription>Current CRM connector status and token lifecycle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>Connection</span>
                  <Badge variant={zohoStatus?.connected ? 'default' : 'secondary'}>{zohoStatus?.connected ? 'Connected' : 'Disconnected'}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>API Domain</span>
                  <span className="truncate text-muted-foreground">{zohoConnector.apiDomain}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>Accounts Server</span>
                  <span className="truncate text-muted-foreground">{zohoConnector.accountsServer}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>Token Expires</span>
                  <span className="text-muted-foreground">{zohoStatus?.expiresAt ? format(new Date(zohoStatus.expiresAt), 'dd MMM yyyy, h:mm a') : 'Managed by server'}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Recent Sync Runs</CardTitle>
                <CardDescription>Last 20 manual sync operations with outcomes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[260px] overflow-auto space-y-2">
                  {syncLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{log.mode}</span>
                        <Badge variant={log.status === 'error' ? 'destructive' : log.status === 'warning' ? 'secondary' : 'default'}>{log.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{format(new Date(log.time), 'dd MMM yyyy, h:mm:ss a')}</p>
                      <p className="text-xs text-muted-foreground">Success: {log.success} | Failed: {log.failed}</p>
                    </div>
                  ))}
                  {syncLogs.length === 0 && (
                    <p className="rounded-lg border p-3 text-sm text-muted-foreground">No sync logs yet. Trigger a push action to populate run history.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Administration & Access</CardTitle>
          <CardDescription>Manage user lifecycle, role governance, and activity auditing.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="inline-flex rounded-lg border bg-card p-1">
            <button
              onClick={() => setSettingsTab('users')}
              className={`rounded-md px-4 py-2 text-sm ${settingsTab === 'users' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              User
            </button>
            <button
              onClick={() => setSettingsTab('activity')}
              className={`rounded-md px-4 py-2 text-sm ${settingsTab === 'activity' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              Activity
            </button>
          </div>
        </CardContent>
      </Card>

      {settingsTab === 'users' && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
            <div>
              <CardTitle>User Settings</CardTitle>
              <CardDescription>Create, edit, and manage role/access for sales users.</CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Sales User</DialogTitle>
                  <DialogDescription>Add a new user account and role.</DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    createUser.mutate(newUserData);
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input
                      value={newUserData.fullName}
                      onChange={(event) => setNewUserData((prev) => ({ ...prev, fullName: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={newUserData.email}
                      onChange={(event) => setNewUserData((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      minLength={6}
                      value={newUserData.password}
                      onChange={(event) => setNewUserData((prev) => ({ ...prev, password: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={newUserData.role}
                      onValueChange={(value: 'admin' | 'sales') => setNewUserData((prev) => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={createUser.isPending}>
                    {createUser.isPending ? 'Creating...' : 'Create User'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-semibold">Permissions Matrix</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">Admin</p>
                  <p className="text-muted-foreground">Full control: users, integrations, settings, analytics, and exports.</p>
                </div>
                <div className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">Sales</p>
                  <p className="text-muted-foreground">Lead and activity operations only. No admin configuration access.</p>
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.full_name || 'No name'}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.email}</TableCell>
                      <TableCell>
                        <Badge variant={entry.role === 'admin' ? 'default' : 'secondary'}>{entry.role || 'No role'}</Badge>
                      </TableCell>
                      <TableCell>
                        {entry.is_active ? (
                          <Badge variant="outline" className="border-green-500 text-green-600">
                            <UserCheck className="mr-1 h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500 text-red-600">
                            <UserX className="mr-1 h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{format(new Date(entry.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditUser(entry)}>
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive/40 text-destructive"
                                disabled={entry.id === user?.id}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel>User actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteConfirm({ userId: entry.id, email: entry.email, mode: 'deactivate' })}
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Deactivate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteConfirm({ userId: entry.id, email: entry.email, mode: 'delete' })}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {(usersPage - 1) * usersPageSize + (paginatedUsers.length > 0 ? 1 : 0)}-
                {(usersPage - 1) * usersPageSize + paginatedUsers.length} of {users.length}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={usersPage <= 1}
                  onClick={() => setUsersPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={usersPage >= usersPageCount}
                  onClick={() => setUsersPage((page) => Math.min(usersPageCount, page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {settingsTab === 'activity' && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Settings Log
            </CardTitle>
            <CardDescription>Audit activity feed across lead actions for admin visibility.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{entry.title}</p>
                        {entry.description && <p className="text-xs text-muted-foreground">{entry.description}</p>}
                      </TableCell>
                      <TableCell>{entry.lead_id ? leadMap.get(entry.lead_id)?.name || 'Lead' : 'N/A'}</TableCell>
                      <TableCell>
                        {entry.user_id ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'User' : 'System'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredActivities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No activity logs yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (isLoading || usersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)]">
          <div className="animate-pulse text-sm font-medium text-slate-500">Loading admin panel...</div>
        </div>
      </div>
    );
  }

  if (!user || role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto w-full max-w-[1540px] px-4 py-4 lg:px-5">
        <div className={`grid grid-cols-1 gap-4 ${sidebarCollapsed ? 'lg:grid-cols-[78px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'}`}>
          <aside className="relative rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.28)] backdrop-blur">
            <button
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="absolute -right-3 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#2d54b5] text-white shadow-lg transition hover:bg-[#23459a] lg:flex"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <div className={`mb-8 flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f64d6] via-[#2854c5] to-[#173785] text-white shadow-[0_18px_35px_-18px_rgba(37,99,235,0.9)]">
                <Shield className="h-6 w-6" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold tracking-tight text-slate-900">Admin Dashboard</p>
                  <p className="truncate text-xs font-medium uppercase tracking-[0.24em] text-slate-400">Control Center</p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <div className="mb-4 px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Navigation
              </div>
            )}

            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`flex w-full items-center rounded-2xl px-3 py-3 text-left transition ${sidebarCollapsed ? 'justify-center' : 'gap-3'} ${isActive ? 'bg-[#2d54b5] text-white shadow-[0_18px_35px_-22px_rgba(37,99,235,0.95)]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white/16 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    {!sidebarCollapsed && (
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className={`block truncate text-xs ${isActive ? 'text-white/72' : 'text-slate-400'}`}>{item.caption}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {!sidebarCollapsed && (
              <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Workspace</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">Manager Console</p>
                  </div>
                  <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Live
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-500">
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                    <span>Leads</span>
                    <span className="font-semibold text-slate-900">{leads.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                    <span>Users</span>
                    <span className="font-semibold text-slate-900">{users.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                    <span>Connect Rate</span>
                    <span className="font-semibold text-slate-900">{dashboardInsights.connectRate}%</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-4">
            <main className="min-w-0 lg:max-h-[calc(100vh-56px)] lg:overflow-y-auto lg:pr-1">
              {activeSection === 'overview' && renderOverview()}
              {activeSection === 'leads' && renderLeads()}
              {activeSection === 'call-activity' && renderCallActivity()}
              {activeSection === 'marketplace' && renderMarketplace()}
              {activeSection === 'settings' && renderSettings()}
            </main>
          </div>
        </div>
      </div>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search sections, users, and actions..." />
        <CommandList>
          <CommandEmpty>No quick actions found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => { setActiveSection('overview'); setCommandOpen(false); }}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Overview
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('leads'); setCommandOpen(false); }}>
              <Users className="mr-2 h-4 w-4" />
              Manage Leads
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('call-activity'); setCommandOpen(false); }}>
              <Phone className="mr-2 h-4 w-4" />
              Reports
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('marketplace'); setCommandOpen(false); }}>
              <Link2 className="mr-2 h-4 w-4" />
              Integrations
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('settings'); setCommandOpen(false); }}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { setIsCreateDialogOpen(true); setActiveSection('settings'); setSettingsTab('users'); setCommandOpen(false); }}>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and access settings.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateUser.mutate({
                id: editUserData.id,
                fullName: editUserData.fullName,
                role: editUserData.role,
                isActive: editUserData.isActive,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={editUserData.email} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={editUserData.fullName}
                onChange={(event) => setEditUserData((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editUserData.role}
                onValueChange={(value: 'admin' | 'sales') => setEditUserData((prev) => ({ ...prev, role: value }))}
                disabled={editUserData.id === user?.id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active User</p>
                <p className="text-xs text-muted-foreground">Inactive users cannot access the app.</p>
              </div>
              <Switch
                checked={editUserData.isActive}
                onCheckedChange={(checked) => setEditUserData((prev) => ({ ...prev, isActive: checked }))}
                disabled={editUserData.id === user?.id}
              />
            </div>
            <Button type="submit" className="w-full" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.mode === 'delete' ? 'Delete User Permanently' : 'Deactivate User'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.mode === 'delete'
                ? `This will permanently delete ${deleteConfirm?.email} and remove all data associated with this account. This action cannot be undone.`
                : `This will deactivate ${deleteConfirm?.email} and remove app access. The auth account remains but the user cannot log in until their role is restored.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteConfirm) return;
                if (deleteConfirm.mode === 'delete') {
                  deleteUser.mutate({ userId: deleteConfirm.userId });
                } else {
                  removeUserAccess.mutate({ userId: deleteConfirm.userId });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUser.isPending || removeUserAccess.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteConfirm?.mode === 'delete' ? 'Delete Permanently' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
