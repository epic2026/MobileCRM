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
  LayoutDashboard,
  KanbanSquare,
  Users,
  Puzzle,
  Settings,
  LogOut,
  Plus,
  UserCheck,
  UserX,
  Mail,
  Pencil,
  Trash2,
  Upload,
  BarChart3,
  Activity,
  GripVertical,
} from 'lucide-react';
import {
  differenceInCalendarDays,
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

type AdminSection = 'dashboard' | 'kanban' | 'leads' | 'marketplace' | 'settings';
type SettingsTab = 'users' | 'activity';
type LeadStatus = Database['public']['Enums']['lead_status'];
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

interface ReportStats {
  totalLeads: number;
  totalCalls: number;
  convertedLeads: number;
}

type ReportBuilderState = {
  reportType: 'pipeline' | 'activity' | 'conversion' | 'owner-performance';
  dateRange: '7d' | '30d' | '90d' | 'custom';
  ownerId: string;
  format: 'table' | 'summary';
  customStartDate: string;
  customEndDate: string;
};

interface ReportPreview {
  title: string;
  description: string;
  summaryCards: Array<{ label: string; value: string; hint: string }>;
  insights: string[];
  columns: string[];
  rows: ReportRow[];
  filename: string;
}

type MarketplaceApp = {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
};

const statusOrder: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-600',
  contacted: 'bg-yellow-500/20 text-yellow-700',
  qualified: 'bg-purple-500/20 text-purple-700',
  proposal: 'bg-orange-500/20 text-orange-700',
  negotiation: 'bg-pink-500/20 text-pink-700',
  won: 'bg-green-500/20 text-green-700',
  lost: 'bg-red-500/20 text-red-700',
};

const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const defaultMarketplaceApps: MarketplaceApp[] = [
  {
    id: 'whatsapp-business',
    name: 'WhatsApp Business',
    description: 'Send templates, reminders, and follow-ups directly from lead workflows.',
    category: 'Communication',
    enabled: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync meetings, demos, and reminder tasks for sales users.',
    category: 'Scheduling',
    enabled: false,
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    description: 'Track payment intent and map transaction milestones to lead stages.',
    category: 'Payments',
    enabled: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Push lead and call events into external systems with no-code automations.',
    category: 'Automation',
    enabled: false,
  },
];

const AdminDashboard = () => {
  const { user, role, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('users');
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);

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
    reportType: 'pipeline',
    dateRange: '30d',
    ownerId: 'all',
    format: 'summary',
    customStartDate: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
    customEndDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const [marketplaceApps, setMarketplaceApps] = useState<MarketplaceApp[]>(defaultMarketplaceApps);

  useEffect(() => {
    if (!isLoading && (!user || role !== 'admin')) {
      navigate('/admin/login');
    }
  }, [isLoading, navigate, role, user]);

  useEffect(() => {
    const saved = window.localStorage.getItem('admin-marketplace-apps');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as MarketplaceApp[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMarketplaceApps(parsed);
        }
      } catch {
        // Ignore invalid cache.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('admin-marketplace-apps', JSON.stringify(marketplaceApps));
  }, [marketplaceApps]);

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

  const { data: reportStats } = useQuery({
    queryKey: ['admin-report-stats'],
    queryFn: async () => {
      const [leadsRes, callsRes, wonLeadsRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('call_logs').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'won'),
      ]);

      return {
        totalLeads: leadsRes.count || 0,
        totalCalls: callsRes.count || 0,
        convertedLeads: wonLeadsRes.count || 0,
      } as ReportStats;
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

    const filteredLeads = leads.filter((lead) => ownerMatches(lead.user_id) && isWithinRange(lead.created_at));
    const filteredActivities = activities.filter((activity) => isWithinRange(activity.created_at) && ownerMatches(activity.user_id));
    const filteredCalls = callLogs.filter((call) => isWithinRange(call.created_at) && ownerMatches(call.user_id));
    const filteredTasks = leadTasks.filter((task) => isWithinRange(task.created_at) && ownerMatches(task.user_id));

    const wonLeads = filteredLeads.filter((lead) => lead.status === 'won');
    const lostLeads = filteredLeads.filter((lead) => lead.status === 'lost');
    const openLeads = filteredLeads.filter((lead) => !['won', 'lost'].includes(lead.status));
    const staleLeads = openLeads.filter((lead) => differenceInCalendarDays(new Date(), new Date(lead.updated_at)) >= 5);
    const overdueTasks = filteredTasks.filter(
      (task) => task.status !== 'completed' && task.due_date && isBefore(new Date(task.due_date), new Date()),
    );
    const totalPipelineValue = filteredLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0);
    const averageCallDurationSeconds = filteredCalls.length
      ? Math.round(filteredCalls.reduce((sum, call) => sum + (call.duration ?? 0), 0) / filteredCalls.length)
      : 0;
    const scopeLabel = selectedOwner?.full_name || selectedOwner?.email || 'All users';

    const ownerRows = salesUsers
      .map((salesUser) => {
        const ownerLeads = filteredLeads.filter((lead) => lead.user_id === salesUser.id);
        const ownerCalls = filteredCalls.filter((call) => call.user_id === salesUser.id);
        const ownerTasks = filteredTasks.filter((task) => task.user_id === salesUser.id);
        const ownerWins = ownerLeads.filter((lead) => lead.status === 'won').length;

        return {
          Owner: salesUser.full_name || salesUser.email,
          Leads: ownerLeads.length,
          'Pipeline Value': `Rs ${ownerLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0).toLocaleString('en-IN')}`,
          Calls: ownerCalls.length,
          'Tasks Created': ownerTasks.length,
          Wins: ownerWins,
          'Conversion Rate': ownerLeads.length ? `${Math.round((ownerWins / ownerLeads.length) * 100)}%` : '0%',
        };
      })
      .filter((row) => reportBuilder.ownerId === 'all' || row.Owner === scopeLabel);

    if (reportBuilder.reportType === 'activity') {
      const completedTasks = filteredTasks.filter((task) => task.status === 'completed').length;
      return {
        title: 'Sales Activity Report',
        description: `${scopeLabel} · ${reportDateWindow.label}`,
        summaryCards: [
          { label: 'Calls Logged', value: String(filteredCalls.length), hint: `${averageCallDurationSeconds}s avg duration` },
          { label: 'Activities Logged', value: String(filteredActivities.length), hint: 'Calls, notes, meetings, emails' },
          { label: 'Tasks Created', value: String(filteredTasks.length), hint: `${completedTasks} completed` },
          { label: 'Overdue Tasks', value: String(overdueTasks.length), hint: overdueTasks.length ? 'Needs attention' : 'No overdue work' },
        ],
        insights: [
          filteredCalls.length
            ? `Call volume is ${filteredCalls.length} with an average duration of ${averageCallDurationSeconds} seconds.`
            : 'No calls were logged in this report window.',
          filteredActivities.length
            ? `${filteredActivities.filter((activity) => activity.type === 'meeting').length} meetings and ${filteredActivities.filter((activity) => activity.type === 'call').length} call activities were captured.`
            : 'The team is not logging much activity yet in this range.',
          overdueTasks.length
            ? `${overdueTasks.length} tasks are overdue and should be reviewed today.`
            : 'Task execution is on track with no overdue items.',
        ],
        columns: ['Activity', 'Lead', 'Owner', 'Type', 'Created'],
        rows: filteredActivities.slice(0, 50).map((activity) => ({
          Activity: activity.title,
          Lead: leadMap.get(activity.lead_id)?.name || 'Unknown lead',
          Owner: userMap.get(activity.user_id || '')?.full_name || userMap.get(activity.user_id || '')?.email || 'System',
          Type: activity.type,
          Created: format(new Date(activity.created_at), 'dd MMM yyyy, h:mm a'),
        })),
        filename: 'sales-activity-report',
      };
    }

    if (reportBuilder.reportType === 'conversion') {
      const conversionRateValue = filteredLeads.length ? Math.round((wonLeads.length / filteredLeads.length) * 100) : 0;
      return {
        title: 'Conversion Analysis',
        description: `${scopeLabel} · ${reportDateWindow.label}`,
        summaryCards: [
          { label: 'Leads Created', value: String(filteredLeads.length), hint: `${wonLeads.length} won, ${lostLeads.length} lost` },
          { label: 'Conversion Rate', value: `${conversionRateValue}%`, hint: 'Won vs created leads' },
          { label: 'Revenue Won', value: `Rs ${wonLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0).toLocaleString('en-IN')}`, hint: 'Value from won leads' },
          { label: 'Stale Opportunities', value: String(staleLeads.length), hint: 'Open leads untouched for 5+ days' },
        ],
        insights: [
          conversionRateValue
            ? `${conversionRateValue}% of created leads converted to won in this window.`
            : 'No wins yet in this range, so qualification and follow-up speed need attention.',
          staleLeads.length
            ? `${staleLeads.length} open leads are stale and should be re-engaged first.`
            : 'Open opportunities are fresh with no stale leads over five days.',
          lostLeads.length
            ? `${lostLeads.length} leads moved to lost and should be reviewed for objection patterns.`
            : 'No losses were recorded in this slice.',
        ],
        columns: ['Lead', 'Owner', 'Status', 'Value', 'Updated'],
        rows: filteredLeads.slice(0, 50).map((lead) => ({
          Lead: lead.name,
          Owner: userMap.get(lead.user_id || '')?.full_name || userMap.get(lead.user_id || '')?.email || 'Unassigned',
          Status: statusLabels[lead.status],
          Value: `Rs ${(lead.value ?? 0).toLocaleString('en-IN')}`,
          Updated: format(new Date(lead.updated_at), 'dd MMM yyyy'),
        })),
        filename: 'conversion-analysis-report',
      };
    }

    if (reportBuilder.reportType === 'owner-performance') {
      return {
        title: 'Owner Performance Report',
        description: `${scopeLabel} · ${reportDateWindow.label}`,
        summaryCards: [
          { label: 'Owners Included', value: String(reportBuilder.ownerId === 'all' ? ownerRows.length : 1), hint: 'Active sales users in scope' },
          { label: 'Assigned Leads', value: String(filteredLeads.length), hint: 'Created in selected range' },
          { label: 'Calls Logged', value: String(filteredCalls.length), hint: 'Owner-linked calls' },
          { label: 'Pipeline Value', value: `Rs ${totalPipelineValue.toLocaleString('en-IN')}`, hint: 'Combined opportunity value' },
        ],
        insights: [
          ownerRows.length
            ? `Top calling owner: ${[...ownerRows].sort((a, b) => Number(b.Calls) - Number(a.Calls))[0].Owner}.`
            : 'No owner performance data is available in this window.',
          ownerRows.length
            ? `Highest pipeline owner: ${[...ownerRows].sort((a, b) => Number(String(b['Pipeline Value']).replace(/[^0-9]/g, '')) - Number(String(a['Pipeline Value']).replace(/[^0-9]/g, '')))[0].Owner}.`
            : 'Pipeline is empty for the selected owner scope.',
          overdueTasks.length
            ? `${overdueTasks.length} overdue tasks are currently slowing owner execution.`
            : 'No overdue tasks are blocking the sales team right now.',
        ],
        columns: ['Owner', 'Leads', 'Pipeline Value', 'Calls', 'Tasks Created', 'Wins', 'Conversion Rate'],
        rows: ownerRows,
        filename: 'owner-performance-report',
      };
    }

    return {
      title: 'Pipeline Health Report',
      description: `${scopeLabel} · ${reportDateWindow.label}`,
      summaryCards: [
        { label: 'Open Leads', value: String(openLeads.length), hint: `${wonLeads.length} won, ${lostLeads.length} lost` },
        { label: 'Pipeline Value', value: `Rs ${totalPipelineValue.toLocaleString('en-IN')}`, hint: 'Total opportunity value' },
        { label: 'Stale Leads', value: String(staleLeads.length), hint: staleLeads.length ? 'Follow up now' : 'Fresh pipeline' },
        { label: 'Tasks Due', value: String(filteredTasks.filter((task) => task.status !== 'completed').length), hint: `${overdueTasks.length} overdue` },
      ],
      insights: [
        openLeads.length
          ? `${openLeads.length} leads are actively moving through the pipeline in this window.`
          : 'No open leads were created in the selected window.',
        staleLeads.length
          ? `${staleLeads.length} opportunities have been untouched for at least five days and need fast follow-up.`
          : 'Lead follow-up freshness looks healthy in this range.',
        filteredCalls.length
          ? `${filteredCalls.length} calls were logged against this pipeline slice.`
          : 'Pipeline activity is not yet backed by call logs in this window.',
      ],
      columns: ['Stage', 'Leads', 'Value'],
      rows: statusOrder.map((status) => {
        const stageLeads = filteredLeads.filter((lead) => lead.status === status);
        return {
          Stage: statusLabels[status],
          Leads: stageLeads.length,
          Value: `Rs ${stageLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0).toLocaleString('en-IN')}`,
        };
      }),
      filename: 'pipeline-health-report',
    };
  }, [
    activities,
    callLogs,
    leadMap,
    leadTasks,
    leads,
    reportBuilder.ownerId,
    reportBuilder.reportType,
    reportDateWindow.end,
    reportDateWindow.label,
    reportDateWindow.start,
    salesUsers,
    selectedOwner,
    userMap,
  ]);

  const conversionRate = reportStats?.totalLeads
    ? Math.round((reportStats.convertedLeads / reportStats.totalLeads) * 100)
    : 0;

  const callsPerLead = reportStats?.totalLeads
    ? Number((reportStats.totalCalls / reportStats.totalLeads).toFixed(1))
    : 0;

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

  const updateLeadStatus = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from('leads')
        .update({ status })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      toast({ title: 'Lead moved', description: 'Lead status updated from Kanban board.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Move failed', description: error.message, variant: 'destructive' });
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

  const toggleMarketplaceApp = (appId: string, enabled: boolean) => {
    setMarketplaceApps((prev) => prev.map((item) => (item.id === appId ? { ...item, enabled } : item)));
    toast({
      title: enabled ? 'Integration enabled' : 'Integration disabled',
      description: 'Marketplace setting updated successfully.',
    });
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Leads</CardDescription>
            <CardTitle className="text-3xl">{reportStats?.totalLeads || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Calls</CardDescription>
            <CardTitle className="text-3xl">{reportStats?.totalCalls || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conversion Rate</CardDescription>
            <CardTitle className="text-3xl">{conversionRate}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Calls / Lead</CardDescription>
            <CardTitle className="text-3xl">{callsPerLead}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Dashboard & Reports Builder
          </CardTitle>
          <CardDescription>Create live reports for pipeline, activity, conversion, or owner performance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid gap-4 md:grid-cols-2 ${reportBuilder.dateRange === 'custom' ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}>
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select
                value={reportBuilder.reportType}
                onValueChange={(value: ReportBuilderState['reportType']) =>
                  setReportBuilder((prev) => ({ ...prev, reportType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pipeline">Pipeline Health</SelectItem>
                  <SelectItem value="activity">Sales Activity</SelectItem>
                  <SelectItem value="conversion">Conversion Analysis</SelectItem>
                  <SelectItem value="owner-performance">Owner Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            <div className="space-y-2">
              <Label>Output Format</Label>
              <Select
                value={reportBuilder.format}
                onValueChange={(value: ReportBuilderState['format']) =>
                  setReportBuilder((prev) => ({ ...prev, format: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Executive Summary</SelectItem>
                  <SelectItem value="table">Detailed Table</SelectItem>
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
                  reportType: 'pipeline',
                  dateRange: '30d',
                  ownerId: 'all',
                  format: 'summary',
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{reportPreview.title}</h3>
                <p className="text-sm text-muted-foreground">{reportPreview.description}</p>
              </div>
              <Badge variant="secondary">
                {reportBuilder.format === 'summary' ? 'Executive Summary' : 'Detailed Table'}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {reportPreview.summaryCards.map((card) => (
                <div key={card.label} className="rounded-xl border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{card.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">AI-style Summary</CardTitle>
                  <CardDescription>Quick leadership-ready insights from the selected dataset.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {reportPreview.insights.map((insight) => (
                    <div key={insight} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground">
                      {insight}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Report Scope</CardTitle>
                  <CardDescription>Current filters driving this report.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Type</span>
                    <span className="font-medium capitalize text-foreground">{reportBuilder.reportType.replace('-', ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Date window</span>
                    <span className="font-medium text-foreground">{reportDateWindow.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Owner</span>
                    <span className="font-medium text-foreground">{selectedOwner?.full_name || selectedOwner?.email || 'All users'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Rows available</span>
                    <span className="font-medium text-foreground">{reportPreview.rows.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {(reportBuilder.format === 'table' || reportPreview.rows.length > 0) && (
              <div className="overflow-hidden rounded-xl border bg-background">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium text-foreground">Detailed report table</p>
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
                          No rows match this report configuration yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderKanban = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KanbanSquare className="h-5 w-5" />
            Kanban View (Drag & Drop)
          </CardTitle>
          <CardDescription>Drag leads between status columns to update pipeline stage.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="grid min-w-[1260px] grid-cols-7 gap-3">
            {statusOrder.map((status) => {
              const statusLeads = leads.filter((lead) => lead.status === status);

              return (
                <div
                  key={status}
                  className="rounded-2xl border bg-muted/20 p-3"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragLeadId) {
                      updateLeadStatus.mutate({ leadId: dragLeadId, status });
                      setDragLeadId(null);
                    }
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Badge className={statusColors[status]}>{statusLabels[status]}</Badge>
                    <span className="text-xs text-muted-foreground">{statusLeads.length}</span>
                  </div>

                  <div className="space-y-2">
                    {statusLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDragLeadId(lead.id)}
                        onDragEnd={() => setDragLeadId(null)}
                        className="cursor-grab rounded-xl border bg-background p-3 shadow-sm active:cursor-grabbing"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">{lead.phone}</p>
                        <p className="text-xs text-muted-foreground">{lead.company || 'No company'}</p>
                      </div>
                    ))}
                    {statusLeads.length === 0 && (
                      <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Drop lead here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="h-5 w-5" />
          App Marketplace
        </CardTitle>
        <CardDescription>Enable, disable, and configure integrations available to your sales team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {marketplaceApps.map((app) => (
          <div key={app.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{app.name}</p>
                <p className="text-xs text-muted-foreground">{app.description}</p>
                <Badge variant="secondary" className="text-[10px]">{app.category}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={app.enabled} onCheckedChange={(checked) => toggleMarketplaceApp(app.id, checked)} />
                <Button size="sm" variant="outline" onClick={() => toast({ title: 'Open configuration', description: `${app.name} configuration panel will open here.` })}>
                  Configure
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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
              <p className="truncate text-sm text-muted-foreground">Web-first workspace for leads, pipeline, reports, and settings</p>
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
              onClick={() => setActiveSection('dashboard')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'dashboard' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard & Reports
            </button>
            <button
              onClick={() => setActiveSection('kanban')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${activeSection === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <KanbanSquare className="h-4 w-4" />
              Kanban View
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
              <Puzzle className="h-4 w-4" />
              App Marketplace
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
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'kanban' && renderKanban()}
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
