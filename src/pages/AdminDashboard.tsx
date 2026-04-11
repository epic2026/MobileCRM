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
  Activity,
  Phone,
  Link2,
  RefreshCw,
  SendHorizontal,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import LeadImport from '@/components/admin/LeadImport';
import LeadAssignment from '@/components/admin/LeadAssignment';
import type { Database } from '@/integrations/supabase/types';

type AdminSection = 'leads' | 'call-activity' | 'marketplace' | 'settings';
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

const AdminDashboard = () => {
  const { user, role, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<AdminSection>('leads');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('users');

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string } | null>(null);

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
  const [callDateFrom, setCallDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [callDateTo, setCallDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

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

  const formatCallDuration = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  };

  const callActivityReport = useMemo(() => {
    const from = new Date(`${callDateFrom}T00:00:00`);
    const to = new Date(`${callDateTo}T23:59:59`);
    const invalidRange = Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime();

    const filtered = invalidRange
      ? []
      : callLogs.filter((entry) => {
          const createdAt = new Date(entry.created_at);
          const time = createdAt.getTime();
          if (Number.isNaN(time)) return false;
          return time >= from.getTime() && time <= to.getTime();
        });

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
      invalidRange,
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
  }, [callDateFrom, callDateTo, callLogs, leadMap, userMap]);

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
      toast({ title: 'User Removed', description: 'User access has been removed and account deactivated.' });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Remove User', description: error.message, variant: 'destructive' });
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
      toast({
        title: variables.mode === 'tasks' ? 'Zoho task sync complete' : 'Zoho activity sync complete',
        description: `${result.success} pushed, ${result.failed} failed.`,
      });
    },
    onError: (error: Error) => {
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

  const renderLeads = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
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
      <LeadAssignment />
    </div>
  );

  const renderCallActivity = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Activity Reports
          </CardTitle>
          <CardDescription>Actionable call reporting by user, by lead, and by calendar day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={callDateFrom} onChange={(event) => setCallDateFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={callDateTo} onChange={(event) => setCallDateTo(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCallDateFrom(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
                  setCallDateTo(format(new Date(), 'yyyy-MM-dd'));
                }}
              >
                Reset to Last 30 Days
              </Button>
            </div>
          </div>

          {callActivityReport.invalidRange && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Invalid date range. Ensure From date is not later than To date.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Calls</p>
                <p className="text-2xl font-semibold">{callActivityReport.totals.totalCalls}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Connected Calls</p>
                <p className="text-2xl font-semibold">{callActivityReport.totals.totalConnectedCalls}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Missed Calls</p>
                <p className="text-2xl font-semibold">{callActivityReport.totals.totalMissedCalls}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Talk Time</p>
                <p className="text-xl font-semibold">{formatCallDuration(callActivityReport.totals.totalDurationSeconds)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">By User</CardTitle>
                <CardDescription>Who is handling and connecting the most calls.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Calls</TableHead>
                        <TableHead>Connected</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callActivityReport.byUser.map((entry) => (
                        <TableRow key={entry.user}>
                          <TableCell className="font-medium">{entry.user}</TableCell>
                          <TableCell>{entry.totalCalls}</TableCell>
                          <TableCell>{entry.connectedCalls}</TableCell>
                          <TableCell>{formatCallDuration(entry.durationSeconds)}</TableCell>
                        </TableRow>
                      ))}
                      {callActivityReport.byUser.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">No call data in selected range.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">By Lead</CardTitle>
                <CardDescription>Lead-level call intensity, ownership, and recency.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead / Contact</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Calls</TableHead>
                        <TableHead>Last Call</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callActivityReport.byLead.map((entry) => (
                        <TableRow key={`${entry.lead}-${entry.phone}`}>
                          <TableCell>
                            <p className="font-medium">{entry.lead}</p>
                            <p className="text-xs text-muted-foreground">{entry.phone}</p>
                          </TableCell>
                          <TableCell>{entry.owner}</TableCell>
                          <TableCell>{entry.totalCalls}</TableCell>
                          <TableCell>{format(new Date(entry.lastCallAt), 'dd MMM yyyy, h:mm a')}</TableCell>
                        </TableRow>
                      ))}
                      {callActivityReport.byLead.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">No lead call data in selected range.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">By Calendar</CardTitle>
                <CardDescription>Daily call trend for planning and monitoring.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Connected</TableHead>
                        <TableHead>Missed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callActivityReport.byCalendar.map((entry) => (
                        <TableRow key={entry.date}>
                          <TableCell className="font-medium">{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{entry.totalCalls}</TableCell>
                          <TableCell>{entry.connectedCalls}</TableCell>
                          <TableCell>{entry.missedCalls}</TableCell>
                        </TableRow>
                      ))}
                      {callActivityReport.byCalendar.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">No daily call trend data in selected range.</TableCell>
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

  const renderMarketplace = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connect Your CRM
          </CardTitle>
          <CardDescription>Zoho CRM connector is available now. Additional CRM integrations will be added later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border p-4">
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
        </CardContent>
      </Card>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-4">
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

      {settingsTab === 'users' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
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
          <CardContent>
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
                {users.map((entry) => (
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                          onClick={() => setDeleteConfirm({ userId: entry.id, email: entry.email })}
                          disabled={entry.id === user?.id}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {settingsTab === 'activity' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Settings Log
            </CardTitle>
            <CardDescription>Audit activity feed across lead actions for admin visibility.</CardDescription>
          </CardHeader>
          <CardContent>
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
                {activities.map((entry) => (
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
                {activities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No activity logs yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (isLoading || usersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading admin panel...</div>
      </div>
    );
  }

  if (!user || role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="h-8 w-8 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-foreground">Admin Control Center</h1>
              <p className="truncate text-sm text-muted-foreground">Web-first workspace for reports, leads, CRM sync, and settings</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:h-[calc(100vh-110px)] md:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border bg-card p-3 md:sticky md:top-24">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveSection('leads')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'leads' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Users className="h-4 w-4" />
              Manage Leads
            </button>
            <button
              onClick={() => setActiveSection('call-activity')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'call-activity' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Phone className="h-4 w-4" />
              Call Activity
            </button>
            <button
              onClick={() => setActiveSection('marketplace')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'marketplace' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Link2 className="h-4 w-4" />
              Connect CRM
            </button>
            <button
              onClick={() => setActiveSection('settings')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'settings' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </nav>
        </aside>

        <main className="min-w-0 md:overflow-y-auto md:pr-2">
          {activeSection === 'leads' && renderLeads()}
          {activeSection === 'call-activity' && renderCallActivity()}
          {activeSection === 'marketplace' && renderMarketplace()}
          {activeSection === 'settings' && renderSettings()}
        </main>
      </div>

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
            <AlertDialogTitle>Remove User Access</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {deleteConfirm?.email} and remove app access. The auth account remains, but the user cannot access the app until role assignment is restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && removeUserAccess.mutate({ userId: deleteConfirm.userId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
