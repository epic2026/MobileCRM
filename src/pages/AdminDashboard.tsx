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
  BarChart3,
  Activity,
  GripVertical,
  Link2,
  RefreshCw,
  SendHorizontal,
} from 'lucide-react';
import {
  endOfDay,
  format,
  isAfter,
  isBefore,
  startOfDay,
  subDays,
} from 'date-fns';
import LeadImport from '@/components/admin/LeadImport';
import LeadAssignment from '@/components/admin/LeadAssignment';
import type { Database } from '@/integrations/supabase/types';

type AdminSection = 'reports' | 'leads' | 'marketplace' | 'settings';
type SettingsTab = 'users' | 'activity';
type Lead = Database['public']['Tables']['leads']['Row'];
type LeadActivity = Database['public']['Tables']['lead_activities']['Row'];
type CallLog = Database['public']['Tables']['call_logs']['Row'];
type LeadTask = Database['public']['Tables']['lead_tasks']['Row'];
type ReportRow = Record<string, string | number>;

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

type ReportBuilderState = {
  dateRange: '7d' | '30d' | '90d' | 'custom';
  ownerId: string;
  customStartDate: string;
  customEndDate: string;
};

interface ReportPreview {
  title: string;
  description: string;
  callTypeBreakdown: Array<{ label: string; count: number; durationSeconds: number; colorClass: string }>;
  kpis: Array<{ label: string; value: string }>;
  donutSlices: Array<{ label: string; percent: number; color: string }>;
  registerSummaryRows: Array<{
    contact: string;
    phone: string;
    totalCalls: number;
    totalDurationSeconds: number;
    incomingCalls: number;
    incomingDurationSeconds: number;
    outgoingCalls: number;
    outgoingDurationSeconds: number;
    missedCalls: number;
    rejectedCalls: number;
    neverAttended: number;
    neverReceived: number;
  }>;
  columns: string[];
  rows: ReportRow[];
  filename: string;
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

  const [activeSection, setActiveSection] = useState<AdminSection>('reports');
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

  const [reportBuilder, setReportBuilder] = useState<ReportBuilderState>({
    dateRange: '30d',
    ownerId: 'all',
    customStartDate: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
    customEndDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [zohoConnector, setZohoConnector] = useState<ZohoConnectorState>({
    apiDomain: 'https://www.zohoapis.com',
    accountsServer: 'https://accounts.zoho.com',
  });
  const [zohoSyncState, setZohoSyncState] = useState<{ tasks: boolean; activities: boolean }>({
    tasks: false,
    activities: false,
  });

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
        .limit(500);
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

  const salesUsers = useMemo(
    () => users.filter((entry) => entry.role === 'sales' && entry.is_active),
    [users]
  );

  const leadMap = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const userMap = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users]);
  const selectedOwner = reportBuilder.ownerId === 'all' ? null : userMap.get(reportBuilder.ownerId);

  const reportDateWindow = useMemo(() => {
    const today = new Date();
    const fallback = {
      start: startOfDay(subDays(today, 29)),
      end: endOfDay(today),
      label: 'Last 30 days',
      hasInvalidCustomRange: false,
    };

    if (reportBuilder.dateRange === 'custom') {
      if (!reportBuilder.customStartDate || !reportBuilder.customEndDate) {
        return { ...fallback, label: 'Custom range', hasInvalidCustomRange: true };
      }

      const start = startOfDay(new Date(reportBuilder.customStartDate));
      const end = endOfDay(new Date(reportBuilder.customEndDate));

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || isAfter(start, end)) {
        return { ...fallback, label: 'Custom range', hasInvalidCustomRange: true };
      }

      return {
        start,
        end,
        label: `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}`,
        hasInvalidCustomRange: false,
      };
    }

    const days = reportBuilder.dateRange === '7d' ? 6 : reportBuilder.dateRange === '90d' ? 89 : 29;
    return {
      start: startOfDay(subDays(today, days)),
      end: endOfDay(today),
      label: reportBuilder.dateRange === '7d' ? 'Last 7 days' : reportBuilder.dateRange === '90d' ? 'Last 90 days' : 'Last 30 days',
      hasInvalidCustomRange: false,
    };
  }, [reportBuilder.customEndDate, reportBuilder.customStartDate, reportBuilder.dateRange]);

  const reportPreview = useMemo<ReportPreview>(() => {
    const isWithinRange = (value: string | null | undefined) => {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      return !isBefore(date, reportDateWindow.start) && !isAfter(date, reportDateWindow.end);
    };

    const ownerMatches = (userId: string | null) =>
      reportBuilder.ownerId === 'all' || (!!userId && userId === reportBuilder.ownerId);

    const filteredCalls = callLogs
      .filter((call) => isWithinRange(call.created_at) && ownerMatches(call.user_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const formatDuration = (seconds: number) => {
      const safeSeconds = Math.max(0, Math.round(seconds));
      const hours = Math.floor(safeSeconds / 3600);
      const minutes = Math.floor((safeSeconds % 3600) / 60);
      const secs = safeSeconds % 60;
      return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    };

    const hasOutcome = (call: CallLog, keywords: string[]) => {
      const normalized = (call.outcome || '').toLowerCase();
      return keywords.some((keyword) => normalized.includes(keyword));
    };

    const totalDurationSeconds = filteredCalls.reduce((sum, call) => sum + (call.duration ?? 0), 0);
    const connectedCalls = filteredCalls.filter((call) => (call.duration ?? 0) > 0);
    const incomingCalls = filteredCalls.filter((call) => call.type === 'incoming');
    const outgoingCalls = filteredCalls.filter((call) => call.type === 'outgoing');
    const missedCalls = filteredCalls.filter((call) => call.type === 'missed');
    const rejectedCalls = filteredCalls.filter((call) => hasOutcome(call, ['reject']));
    const neverAttendedCalls = filteredCalls.filter((call) => hasOutcome(call, ['never attended', 'unattended']));
    const neverReceivedCalls = filteredCalls.filter((call) => hasOutcome(call, ['never received']));
    const notPickedCalls = filteredCalls.filter((call) =>
      hasOutcome(call, ['not pick', 'not picked', 'no answer', 'unanswered'])
      || (call.type === 'outgoing' && (call.duration ?? 0) === 0)
    );
    const shortCalls = connectedCalls.filter((call) => (call.duration ?? 0) < 30);

    const taskLeadIds = new Set(
      leadTasks
        .filter((task) => task.lead_id)
        .map((task) => task.lead_id as string),
    );
    const callsWithoutTasks = filteredCalls.filter((call) => call.lead_id && !taskLeadIds.has(call.lead_id));
    const followUpRisk = filteredCalls.length ? Math.round((callsWithoutTasks.length / filteredCalls.length) * 100) : 0;

    const scopeLabel = selectedOwner?.full_name || selectedOwner?.email || 'All users';
    const registerMap = new Map<string, {
      contact: string;
      phone: string;
      totalCalls: number;
      totalDurationSeconds: number;
      incomingCalls: number;
      incomingDurationSeconds: number;
      outgoingCalls: number;
      outgoingDurationSeconds: number;
      missedCalls: number;
      rejectedCalls: number;
      neverAttended: number;
      neverReceived: number;
    }>();

    filteredCalls.forEach((call) => {
      const phone = call.phone || 'Unknown';
      const existing = registerMap.get(phone) || {
        contact: call.contact_name || 'Unknown',
        phone,
        totalCalls: 0,
        totalDurationSeconds: 0,
        incomingCalls: 0,
        incomingDurationSeconds: 0,
        outgoingCalls: 0,
        outgoingDurationSeconds: 0,
        missedCalls: 0,
        rejectedCalls: 0,
        neverAttended: 0,
        neverReceived: 0,
      };

      existing.totalCalls += 1;
      existing.totalDurationSeconds += call.duration ?? 0;

      if (call.type === 'incoming') {
        existing.incomingCalls += 1;
        existing.incomingDurationSeconds += call.duration ?? 0;
      }

      if (call.type === 'outgoing') {
        existing.outgoingCalls += 1;
        existing.outgoingDurationSeconds += call.duration ?? 0;
      }

      if (call.type === 'missed') {
        existing.missedCalls += 1;
      }

      if (hasOutcome(call, ['reject'])) {
        existing.rejectedCalls += 1;
      }

      if (hasOutcome(call, ['never attended', 'unattended'])) {
        existing.neverAttended += 1;
      }

      if (hasOutcome(call, ['never received'])) {
        existing.neverReceived += 1;
      }

      if (!existing.contact || existing.contact === 'Unknown') {
        existing.contact = call.contact_name || existing.contact;
      }

      registerMap.set(phone, existing);
    });

    const registerSummaryRows = Array.from(registerMap.values())
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 50);

    const uniqueClients = new Set(filteredCalls.map((call) => call.phone).filter(Boolean)).size;
    const incomingDurationSeconds = incomingCalls.reduce((sum, call) => sum + (call.duration ?? 0), 0);
    const outgoingDurationSeconds = outgoingCalls.reduce((sum, call) => sum + (call.duration ?? 0), 0);

    const totalForDonut = incomingCalls.length + outgoingCalls.length + missedCalls.length + rejectedCalls.length;
    const donutPercent = (value: number) => (totalForDonut ? Number(((value / totalForDonut) * 100).toFixed(1)) : 0);

    return {
      title: 'Detailed Call Activity Report - Summary',
      description: `${scopeLabel} · ${reportDateWindow.label}`,
      callTypeBreakdown: [
        {
          label: 'Incoming',
          count: incomingCalls.length,
          durationSeconds: incomingDurationSeconds,
          colorClass: 'text-emerald-600',
        },
        {
          label: 'Outgoing',
          count: outgoingCalls.length,
          durationSeconds: outgoingDurationSeconds,
          colorClass: 'text-amber-600',
        },
        {
          label: 'Missed',
          count: missedCalls.length,
          durationSeconds: 0,
          colorClass: 'text-rose-600',
        },
        {
          label: 'Rejected',
          count: rejectedCalls.length,
          durationSeconds: 0,
          colorClass: 'text-red-700',
        },
      ],
      kpis: [
        { label: 'Never Attended', value: String(neverAttendedCalls.length) },
        { label: 'Not Pickup by client', value: String(notPickedCalls.length) },
        { label: 'Connected calls', value: String(connectedCalls.length) },
        { label: 'Unique clients', value: String(uniqueClients) },
        { label: 'Working Hours', value: formatDuration(totalDurationSeconds) },
        { label: 'Follow-up risk', value: `${followUpRisk}%` },
      ],
      donutSlices: [
        { label: 'Incoming', percent: donutPercent(incomingCalls.length), color: '#16a34a' },
        { label: 'Outgoing', percent: donutPercent(outgoingCalls.length), color: '#f59e0b' },
        { label: 'Missed', percent: donutPercent(missedCalls.length), color: '#ef4444' },
        { label: 'Rejected', percent: donutPercent(rejectedCalls.length), color: '#991b1b' },
      ],
      registerSummaryRows,
      columns: ['Call Time', 'Owner', 'Lead', 'Contact', 'Direction', 'Duration (s)', 'Outcome', 'Next Action'],
      rows: filteredCalls.slice(0, 200).map((call) => {
        const lead = leadMap.get(call.lead_id || '');
        const owner = userMap.get(call.user_id || '');
        const hasTask = !!(call.lead_id && taskLeadIds.has(call.lead_id));
        return {
          'Call Time': format(new Date(call.created_at), 'dd MMM yyyy, h:mm a'),
          Owner: owner?.full_name || owner?.email || 'System',
          Lead: lead?.name || 'Unlinked lead',
          Contact: call.contact_name || call.phone,
          Direction: call.type,
          'Duration (s)': call.duration ?? 0,
          Outcome: call.outcome || 'Not logged',
          'Next Action': hasTask ? 'Task linked' : 'Create follow-up task',
        };
      }),
      filename: 'detailed-call-activity-report',
    };
  }, [
    callLogs,
    leadMap,
    leadTasks,
    reportBuilder.ownerId,
    reportDateWindow.end,
    reportDateWindow.label,
    reportDateWindow.start,
    selectedOwner,
    userMap,
  ]);

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

  const handleGenerateReport = () => {
    toast({
      title: reportPreview.title,
      description: `Showing ${reportPreview.rows.length} rows for ${reportPreview.description}.`,
    });
  };

  const handleExportReport = () => {
    if (!reportPreview.rows.length) {
      toast({
        title: 'Nothing to export',
        description: 'Adjust the filters or date range to generate report rows first.',
        variant: 'destructive',
      });
      return;
    }

    const csvRows = [
      reportPreview.columns.join(','),
      ...reportPreview.rows.map((row) =>
        reportPreview.columns
          .map((column) => `"${String(row[column] ?? '').replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportPreview.filename}-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'CSV exported',
      description: `${reportPreview.title} downloaded successfully.`,
    });
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

  const renderDashboard = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Detailed Call Activity Report
          </CardTitle>
          <CardDescription>Summary, call quality indicators, and register mobile number breakdown for operations and coaching.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid gap-4 md:grid-cols-2 ${reportBuilder.dateRange === 'custom' ? 'xl:grid-cols-5' : 'xl:grid-cols-3'}`}>

            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select
                value={reportBuilder.dateRange}
                onValueChange={(value: ReportBuilderState['dateRange']) =>
                  setReportBuilder((prev) => ({ ...prev, dateRange: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportBuilder.dateRange === 'custom' && (
              <>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={reportBuilder.customStartDate}
                    onChange={(event) =>
                      setReportBuilder((prev) => ({ ...prev, customStartDate: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={reportBuilder.customEndDate}
                    onChange={(event) =>
                      setReportBuilder((prev) => ({ ...prev, customEndDate: event.target.value }))
                    }
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Owner Scope</Label>
              <Select
                value={reportBuilder.ownerId}
                onValueChange={(value) => setReportBuilder((prev) => ({ ...prev, ownerId: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {salesUsers.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.full_name || entry.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleGenerateReport} disabled={reportDateWindow.hasInvalidCustomRange}>
              Generate Report
            </Button>
            <Button variant="secondary" onClick={handleExportReport} disabled={!reportPreview.rows.length || reportDateWindow.hasInvalidCustomRange}>
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setReportBuilder({
                  dateRange: '30d',
                  ownerId: 'all',
                  customStartDate: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
                  customEndDate: format(new Date(), 'yyyy-MM-dd'),
                })
              }
            >
              Reset Builder
            </Button>
          </div>

          {reportDateWindow.hasInvalidCustomRange && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Choose a valid custom date range before generating the report.
            </div>
          )}

          <div className="space-y-5 rounded-2xl border bg-muted/20 p-4">
            <div className="inline-flex rounded-lg border bg-background p-1">
              <div className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Summary</div>
              <div className="px-3 py-1.5 text-sm text-muted-foreground">Analysis</div>
              <div className="px-3 py-1.5 text-sm text-muted-foreground">Never Attended</div>
              <div className="px-3 py-1.5 text-sm text-muted-foreground">Never Received</div>
              <div className="px-3 py-1.5 text-sm text-muted-foreground">Call History</div>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{reportPreview.title}</h3>
                <p className="text-sm text-muted-foreground">{reportPreview.description}</p>
              </div>
              <Badge variant="secondary">Actionable</Badge>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="overflow-hidden rounded-xl border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Call Type</TableHead>
                      <TableHead>Call</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportPreview.callTypeBreakdown.map((item) => (
                      <TableRow key={item.label}>
                        <TableCell className={`font-medium ${item.colorClass}`}>{item.label}</TableCell>
                        <TableCell>{item.count}</TableCell>
                        <TableCell>{item.durationSeconds > 0 ? `${Math.floor(item.durationSeconds / 3600)}h ${Math.floor((item.durationSeconds % 3600) / 60)}m ${item.durationSeconds % 60}s` : '-'}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="font-semibold">{reportPreview.rows.length}</TableCell>
                      <TableCell className="font-semibold">
                        {`${Math.floor(reportPreview.callTypeBreakdown.reduce((sum, item) => sum + item.durationSeconds, 0) / 3600)}h ${Math.floor((reportPreview.callTypeBreakdown.reduce((sum, item) => sum + item.durationSeconds, 0) % 3600) / 60)}m ${reportPreview.callTypeBreakdown.reduce((sum, item) => sum + item.durationSeconds, 0) % 60}s`}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border bg-background p-4">
                  <div className="space-y-2">
                    {reportPreview.kpis.map((kpi) => (
                      <div key={kpi.label} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{kpi.label}</span>
                        <span className="font-semibold text-foreground">{kpi.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-sm font-medium text-foreground">Calls</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div
                      className="h-40 w-40 rounded-full"
                      style={{
                        background: `conic-gradient(${reportPreview.donutSlices
                          .map((slice, index, array) => {
                            const previous = array
                              .slice(0, index)
                              .reduce((sum, current) => sum + current.percent, 0);
                            const current = previous + slice.percent;
                            return `${slice.color} ${previous}% ${current}%`;
                          })
                          .join(', ')})`,
                      }}
                    >
                      <div className="m-7 flex h-26 w-26 items-center justify-center rounded-full bg-background text-xs font-semibold text-foreground">
                        Calls
                      </div>
                    </div>
                    <div className="space-y-1 text-xs">
                      {reportPreview.donutSlices.map((slice) => (
                        <div key={slice.label} className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                          <span className="text-muted-foreground">{slice.label}</span>
                          <span className="font-medium text-foreground">{slice.percent}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium text-foreground">Register mobile number summary</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sr No.</TableHead>
                    <TableHead>Registered Mobile</TableHead>
                    <TableHead>Total Calls</TableHead>
                    <TableHead>Total Duration</TableHead>
                    <TableHead>Incoming Calls</TableHead>
                    <TableHead>Incoming Duration</TableHead>
                    <TableHead>Outgoing Calls</TableHead>
                    <TableHead>Outgoing Duration</TableHead>
                    <TableHead>Missed Calls</TableHead>
                    <TableHead>Rejected Calls</TableHead>
                    <TableHead>Never Attended</TableHead>
                    <TableHead>Never Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportPreview.registerSummaryRows.length > 0 ? (
                    reportPreview.registerSummaryRows.map((row, index) => (
                      <TableRow key={`${row.phone}-${index}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{row.contact}</div>
                          <div className="text-xs text-muted-foreground">{row.phone}</div>
                        </TableCell>
                        <TableCell>{row.totalCalls}</TableCell>
                        <TableCell>{`${Math.floor(row.totalDurationSeconds / 3600)}h ${Math.floor((row.totalDurationSeconds % 3600) / 60)}m ${row.totalDurationSeconds % 60}s`}</TableCell>
                        <TableCell className="text-emerald-600">{row.incomingCalls}</TableCell>
                        <TableCell className="text-emerald-600">{`${Math.floor(row.incomingDurationSeconds / 3600)}h ${Math.floor((row.incomingDurationSeconds % 3600) / 60)}m ${row.incomingDurationSeconds % 60}s`}</TableCell>
                        <TableCell className="text-amber-600">{row.outgoingCalls}</TableCell>
                        <TableCell className="text-amber-600">{`${Math.floor(row.outgoingDurationSeconds / 3600)}h ${Math.floor((row.outgoingDurationSeconds % 3600) / 60)}m ${row.outgoingDurationSeconds % 60}s`}</TableCell>
                        <TableCell className="text-rose-600">{row.missedCalls}</TableCell>
                        <TableCell className="text-red-700">{row.rejectedCalls}</TableCell>
                        <TableCell>{row.neverAttended}</TableCell>
                        <TableCell>{row.neverReceived}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground">
                        No register summary data available for the selected range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium text-foreground">Detailed call log table</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportPreview.columns.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportPreview.rows.length > 0 ? (
                    reportPreview.rows.map((row, index) => (
                      <TableRow key={`${reportPreview.filename}-${index}`}>
                        {reportPreview.columns.map((column) => (
                          <TableCell key={column}>{String(row[column] ?? '-')}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={reportPreview.columns.length} className="text-center text-muted-foreground">
                        No call rows match this report configuration yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

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

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border bg-card p-3 md:sticky md:top-24">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveSection('reports')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'reports' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <BarChart3 className="h-4 w-4" />
              Reports
            </button>
            <button
              onClick={() => setActiveSection('leads')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'leads' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Users className="h-4 w-4" />
              Manage Leads
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

        <main className="min-w-0">
          {activeSection === 'reports' && renderDashboard()}
          {activeSection === 'leads' && renderLeads()}
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
