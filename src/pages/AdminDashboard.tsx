import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  Building,
  Mail,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Star,
  User,
} from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartLegend } from '@/components/ui/chart';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Brush,
  ReferenceLine,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, subDays } from 'date-fns';
import LeadImport from '@/components/admin/LeadImport';
import LeadAssignment from '@/components/admin/LeadAssignment';
import type { Database } from '@/integrations/supabase/types';

type AdminSection = 'overview' | 'leads' | 'call-activity' | 'marketplace' | 'activity' | 'tenants' | 'settings';
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
  tenant_id?: string | null;
}

interface UserWithRole extends Profile {
  role: 'super_admin' | 'admin' | 'sales' | null;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  tenant_code: string;
  active: boolean;
  managerId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  memberCount: number;
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
  const {
    currentTenant,
    tenants,
    tenantRole,
    tenantMembers,
    switchTenant,
    createTenant,
    updateTenant,
    deleteTenant,
    assignUserToTenant,
    setTenantManager,
    removeTenantManager,
    removeMember,
    clearUserTenant,
  } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<AdminSection>('leads');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string; mode: 'deactivate' | 'delete' } | null>(null);
  const [tenantDeleteConfirm, setTenantDeleteConfirm] = useState<{ tenantId: string; tenantName: string } | null>(null);

  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'sales' as 'super_admin' | 'admin' | 'sales',
  });

  const [editUserData, setEditUserData] = useState({
    id: '',
    email: '',
    fullName: '',
    role: 'sales' as 'super_admin' | 'admin' | 'sales',
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
  const [callReportView, setCallReportView] = useState<'overview' | 'user' | 'logs' | 'time' | 'hourly' | 'productivity'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<'all' | 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'>('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<'all' | string>('all');
  const [activityUserFilter, setActivityUserFilter] = useState<'all' | 'system' | string>('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [leadDetailId, setLeadDetailId] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const usersPageSize = 10;

  const [reportFilterRange, setReportFilterRange] = useState<'7d' | '30d' | 'month' | 'custom'>('7d');
  const [reportGranularity, setReportGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportCallType, setReportCallType] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [reportUserFilter, setReportUserFilter] = useState<'all' | string>('all');
  const [reportTeamFilter, setReportTeamFilter] = useState<'all' | 'sales' | 'admin'>('all');
  const [reportCompareMode, setReportCompareMode] = useState(false);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [savedViewName, setSavedViewName] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(format(new Date(), 'PPP p'));

  // Tenant management state
  const [selectedTenantUserId, setSelectedTenantUserId] = useState('');
  const [isAssigningTenantUser, setIsAssigningTenantUser] = useState(false);
  const [tenantNameEdit, setTenantNameEdit] = useState(currentTenant?.name || '');
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantManagerId, setNewTenantManagerId] = useState('');

  const isSuperAdmin = role === 'super_admin';
  const canAccessAdminDashboard = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    if (!isLoading && (!user || !canAccessAdminDashboard)) {
      navigate('/admin/login');
    }
  }, [canAccessAdminDashboard, isLoading, navigate, role, user]);

  useEffect(() => {
    if (!isSuperAdmin && activeSection === 'tenants') {
      setActiveSection('overview');
    }
  }, [activeSection, isSuperAdmin]);

  useEffect(() => {
    setTenantNameEdit(currentTenant?.name || '');
  }, [currentTenant]);

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
    enabled: canAccessAdminDashboard,
  });

  const { data: tenantDirectory = [] } = useQuery({
    queryKey: ['tenant-directory', tenants.map((tenant) => tenant.id).join(',')],
    queryFn: async () => {
      if (tenants.length === 0) return [] as TenantSummary[];

      const tenantIds = tenants.map((tenant) => tenant.id);
      const { data: memberships, error: membershipsError } = await supabase
        .from('tenant_members')
        .select('tenant_id, user_id, role')
        .in('tenant_id', tenantIds);

      if (membershipsError) throw membershipsError;

      const uniqueUserIds = Array.from(new Set((memberships || []).map((entry) => entry.user_id)));
      const { data: memberProfiles, error: memberProfilesError } = uniqueUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', uniqueUserIds)
        : { data: [], error: null };

      if (memberProfilesError) throw memberProfilesError;

      const profileMap = new Map((memberProfiles || []).map((entry) => [entry.id, entry]));

      return tenants.map((tenant) => {
        const tenantMemberships = (memberships || []).filter((entry) => entry.tenant_id === tenant.id);
        const manager = tenantMemberships.find((entry) => entry.role === 'admin') || null;
        const managerProfile = manager ? profileMap.get(manager.user_id) : null;

        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          tenant_code: tenant.tenant_code,
          active: tenant.active,
          managerId: manager?.user_id || null,
          managerName: managerProfile?.full_name || null,
          managerEmail: managerProfile?.email || null,
          memberCount: tenantMemberships.length,
        } satisfies TenantSummary;
      });
    },
    enabled: isSuperAdmin,
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
    enabled: canAccessAdminDashboard,
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
    queryKey: ['admin-leads', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: canAccessAdminDashboard && !!currentTenant,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['admin-activity-feed', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: canAccessAdminDashboard && !!currentTenant,
  });

  const { data: callLogs = [], refetch: refetchCallLogs, isFetching: isFetchingCallLogs } = useQuery({
    queryKey: ['admin-call-logs', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as CallLog[];
    },
    enabled: canAccessAdminDashboard && !!currentTenant,
  });

  const { data: leadTasks = [] } = useQuery({
    queryKey: ['admin-lead-tasks', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as LeadTask[];
    },
    enabled: canAccessAdminDashboard && !!currentTenant,
  });

  const leadMap = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const userMap = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users]);
  const currentTenantMemberIds = useMemo(
    () => new Set(tenantMembers.map((member) => member.user_id)),
    [tenantMembers],
  );

  const eligibleTenantManagers = useMemo(
    () => users.filter((entry) =>
      entry.role === 'admin'
      && entry.is_active
      && !currentTenantMemberIds.has(entry.id)
      && !entry.tenant_id,
    ),
    [currentTenantMemberIds, users],
  );

  const currentTenantManager = useMemo(
    () => tenantMembers.find((member) => member.role === 'admin') || null,
    [tenantMembers],
  );

  const availableTenantUsers = useMemo(
    () => users.filter((entry) =>
      entry.is_active
      && entry.role !== 'super_admin'
      && !currentTenantMemberIds.has(entry.id)
      && !entry.tenant_id,
    ),
    [currentTenantMemberIds, users],
  );

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const reportRangeBounds = useMemo(() => {
    const now = new Date();
    let start = subDays(now, 6);
    let end = now;

    if (reportFilterRange === '30d') {
      start = subDays(now, 29);
    }

    if (reportFilterRange === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (reportFilterRange === 'custom') {
      const parsedStart = new Date(customStartDate);
      const parsedEnd = new Date(customEndDate);
      if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())) {
        start = parsedStart;
        end = parsedEnd;
      }
    }

    const rangeStart = new Date(start);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(end);
    rangeEnd.setHours(23, 59, 59, 999);

    return { rangeStart, rangeEnd };
  }, [reportFilterRange, customStartDate, customEndDate]);

  const comparisonRangeBounds = useMemo(() => {
    if (!reportCompareMode) return null;

    const days = Math.round((reportRangeBounds.rangeEnd.getTime() - reportRangeBounds.rangeStart.getTime()) / MS_PER_DAY) + 1;
    const previousEnd = subDays(reportRangeBounds.rangeStart, 1);
    const previousStart = subDays(previousEnd, days - 1);

    const rangeStart = new Date(previousStart);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(previousEnd);
    rangeEnd.setHours(23, 59, 59, 999);

    return { rangeStart, rangeEnd };
  }, [reportCompareMode, reportRangeBounds]);

  const filteredCallLogs = useMemo(() => {
    const isEntryMatch = (entry: CallLog, rangeStart: Date, rangeEnd: Date) => {
      const createdAt = new Date(entry.created_at);
      if (Number.isNaN(createdAt.getTime())) return false;
      if (createdAt < rangeStart || createdAt > rangeEnd) return false;
      if (reportCallType !== 'all' && entry.type !== reportCallType) return false;
      if (reportUserFilter !== 'all' && entry.user_id !== reportUserFilter) return false;
      if (reportTeamFilter !== 'all') {
        const role = entry.user_id ? userMap.get(entry.user_id)?.role : null;
        if (role !== reportTeamFilter) return false;
      }
      return true;
    };

    return callLogs
      .filter((entry) => isEntryMatch(entry, reportRangeBounds.rangeStart, reportRangeBounds.rangeEnd))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [callLogs, reportRangeBounds, reportCallType, reportUserFilter, reportTeamFilter, userMap]);

  const comparisonCallLogs = useMemo(() => {
    if (!comparisonRangeBounds) return [];

    const isEntryMatch = (entry: CallLog, rangeStart: Date, rangeEnd: Date) => {
      const createdAt = new Date(entry.created_at);
      if (Number.isNaN(createdAt.getTime())) return false;
      if (createdAt < rangeStart || createdAt > rangeEnd) return false;
      if (reportCallType !== 'all' && entry.type !== reportCallType) return false;
      if (reportUserFilter !== 'all' && entry.user_id !== reportUserFilter) return false;
      if (reportTeamFilter !== 'all') {
        const role = entry.user_id ? userMap.get(entry.user_id)?.role : null;
        if (role !== reportTeamFilter) return false;
      }
      return true;
    };

    return callLogs
      .filter((entry) => isEntryMatch(entry, comparisonRangeBounds.rangeStart, comparisonRangeBounds.rangeEnd))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [callLogs, comparisonRangeBounds, reportCallType, reportUserFilter, reportTeamFilter, userMap]);

  const computeReportTotals = (logs: CallLog[]) => {
    const totalCalls = logs.length;
    const totalConnectedCalls = logs.filter((entry) => (entry.duration || 0) > 0).length;
    const totalDurationSeconds = logs.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const totalOutboundCalls = logs.filter((entry) => entry.type === 'outgoing').length;
    const totalInboundCalls = logs.filter((entry) => entry.type === 'incoming').length;
    const uniqueNumbersCalled = new Set(logs.map((entry) => entry.phone || entry.contact_name || '')).size;

    return {
      totalCalls,
      totalConnectedCalls,
      totalDurationSeconds,
      totalOutboundCalls,
      totalInboundCalls,
      answerRate: totalCalls ? Math.round((totalConnectedCalls / totalCalls) * 100) : 0,
      uniqueNumbersCalled,
      avgOutboundDurationSeconds: totalOutboundCalls ? Math.round(logs.filter((entry) => entry.type === 'outgoing').reduce((sum, entry) => sum + (entry.duration || 0), 0) / totalOutboundCalls) : 0,
      avgInboundDurationSeconds: totalInboundCalls ? Math.round(logs.filter((entry) => entry.type === 'incoming').reduce((sum, entry) => sum + (entry.duration || 0), 0) / totalInboundCalls) : 0,
    };
  };

  const comparisonTotals = useMemo(() => {
    if (!reportCompareMode || !comparisonCallLogs.length) return null;
    return computeReportTotals(comparisonCallLogs);
  }, [comparisonCallLogs, reportCompareMode]);

  const handleRefreshReports = async () => {
    try {
      await refetchCallLogs();
      setLastUpdatedAt(format(new Date(), 'PPP p'));
    } catch (error) {
      toast({
        title: 'Refresh failed',
        description: error instanceof Error ? error.message : 'Unable to refresh call activity.',
        variant: 'destructive',
      });
    }
  };

  const activityTypeOptions = useMemo(
    () => Array.from(new Set(activities.map((entry) => entry.type).filter(Boolean))).sort(),
    [activities],
  );

  const activityUserOptions = useMemo(() => {
    const seen = new Set<string>();
    return activities.reduce<Array<{ id: string; label: string }>>((list, entry) => {
      if (!entry.user_id || seen.has(entry.user_id)) return list;
      seen.add(entry.user_id);
      const label = userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || 'User';
      list.push({ id: entry.user_id, label });
      return list;
    }, []);
  }, [activities, userMap]);

  const filteredActivities = useMemo(() => {
    const searchTerm = activitySearch.trim().toLowerCase();

    return activities.filter((entry) => {
      const matchesSearch = !searchTerm || [
        entry.title,
        entry.description || '',
        entry.type || '',
        entry.lead_id ? leadMap.get(entry.lead_id)?.name || '' : '',
        entry.user_id ? userMap.get(entry.user_id)?.full_name || userMap.get(entry.user_id)?.email || '' : 'system',
      ].some((value) => value.toLowerCase().includes(searchTerm));

      const matchesType = activityTypeFilter === 'all' || entry.type === activityTypeFilter;
      const matchesUser = activityUserFilter === 'all'
        || (activityUserFilter === 'system' && !entry.user_id)
        || entry.user_id === activityUserFilter;

      return matchesSearch && matchesType && matchesUser;
    });
  }, [activities, activitySearch, activityTypeFilter, activityUserFilter, leadMap, userMap]);

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

    const uniqueNumbers = new Set<string>();
    let totalOutboundSeconds = 0;
    let totalInboundSeconds = 0;

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
      const leadKey = entry.lead_id || entry.phone || entry.contact_name || `unknown-${entry.id}`;
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

      if (entry.phone) {
        uniqueNumbers.add(entry.phone);
      } else if (entry.contact_name) {
        uniqueNumbers.add(entry.contact_name);
      }

      if (entry.type === 'outgoing') {
        totalOutboundSeconds += entry.duration || 0;
      }
      if (entry.type === 'incoming') {
        totalInboundSeconds += entry.duration || 0;
      }
    });

    const totalCalls = filtered.length;
    const totalDurationSeconds = filtered.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const totalConnectedCalls = filtered.filter((entry) => (entry.duration || 0) > 0).length;
    const totalOutboundCalls = filtered.filter((entry) => entry.type === 'outgoing').length;
    const totalInboundCalls = filtered.filter((entry) => entry.type === 'incoming').length;

    const byUserValues = Array.from(byUser.values());

    return {
      invalidRange: false,
      filtered,
      totals: {
        totalCalls,
        totalConnectedCalls,
        totalMissedCalls: filtered.filter((entry) => entry.type === 'missed').length,
        totalDurationSeconds,
        totalOutboundCalls,
        totalInboundCalls,
        answerRate: totalCalls ? Math.round((totalConnectedCalls / totalCalls) * 100) : 0,
        uniqueNumbersCalled: uniqueNumbers.size,
        avgOutboundDurationSeconds: totalOutboundCalls ? Math.round(totalOutboundSeconds / totalOutboundCalls) : 0,
        avgInboundDurationSeconds: totalInboundCalls ? Math.round(totalInboundSeconds / totalInboundCalls) : 0,
      },
      byUser: byUserValues.sort((a, b) => b.totalCalls - a.totalCalls),
      topOutboundUsers: [...byUserValues]
        .sort((a, b) => b.outgoingCalls - a.outgoingCalls)
        .filter((entry) => entry.outgoingCalls > 0)
        .slice(0, 5),
      topInboundUsers: [...byUserValues]
        .sort((a, b) => b.incomingCalls - a.incomingCalls)
        .filter((entry) => entry.incomingCalls > 0)
        .slice(0, 5),
      topDurationUsers: [...byUserValues]
        .sort((a, b) => b.durationSeconds - a.durationSeconds)
        .slice(0, 5),
      byLead: Array.from(byLead.values()).sort((a, b) => b.totalCalls - a.totalCalls),
      byCalendar: Array.from(byCalendar.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [filteredCallLogs, leadMap, userMap]);

  const hourlyDistribution = useMemo(() => {
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      calls: 0,
    }));
    callActivityReport.filtered.forEach((entry) => {
      const h = new Date(entry.created_at).getHours();
      byHour[h].calls += 1;
    });
    return byHour;
  }, [callActivityReport.filtered]);

  const durationBuckets = useMemo(() => [
    { label: '0-1m',  count: callActivityReport.filtered.filter(e => (e.duration || 0) > 0 && (e.duration || 0) < 60).length },
    { label: '1-3m',  count: callActivityReport.filtered.filter(e => (e.duration || 0) >= 60 && (e.duration || 0) < 180).length },
    { label: '3-5m',  count: callActivityReport.filtered.filter(e => (e.duration || 0) >= 180 && (e.duration || 0) < 300).length },
    { label: '5-10m', count: callActivityReport.filtered.filter(e => (e.duration || 0) >= 300 && (e.duration || 0) < 600).length },
    { label: '10m+',  count: callActivityReport.filtered.filter(e => (e.duration || 0) >= 600).length },
  ], [callActivityReport.filtered]);

  const createUser = useMutation({
    mutationFn: async (data: { email: string; password: string; fullName: string; role: 'super_admin' | 'admin' | 'sales' }) => {
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
    mutationFn: async (data: { id: string; fullName: string; role: 'super_admin' | 'admin' | 'sales'; isActive: boolean }) => {
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

  const bulkDeactivateUsers = useMutation({
    mutationFn: async (userIds: string[]) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .in('id', userIds);
      if (error) throw error;
      await supabase.from('user_roles').delete().in('user_id', userIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Users Deactivated', description: `${selectedUserIds.length} users have been deactivated.` });
      setSelectedUserIds([]);
    },
    onError: (error: Error) => {
      toast({ title: 'Bulk Deactivate Failed', description: error.message, variant: 'destructive' });
    },
  });

  const bulkActivateUsers = useMutation({
    mutationFn: async (userIds: string[]) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: true })
        .in('id', userIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Users Activated', description: `${selectedUserIds.length} users have been activated.` });
      setSelectedUserIds([]);
    },
    onError: (error: Error) => {
      toast({ title: 'Bulk Activate Failed', description: error.message, variant: 'destructive' });
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
      return;
    }

    if (activeSection === 'activity') {
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
    { id: 'leads', label: 'Manage Leads', caption: 'Lead pipeline', icon: Users },
    { id: 'call-activity', label: 'Reports', caption: 'Call insights', icon: Activity },
    { id: 'activity', label: 'Activity', caption: 'Audit trail', icon: Activity },
    { id: 'marketplace', label: 'Integrations', caption: 'CRM sync', icon: Link2 },
    { id: 'settings', label: 'Users', caption: 'Platform users', icon: Settings },
    ...(isSuperAdmin
      ? [
          { id: 'tenants', label: 'Tenants', caption: 'Organization settings', icon: Building },
        ]
      : []),
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
            : activeSection === 'activity'
              ? 'Activity'
              : activeSection === 'tenants'
                ? 'Tenant Settings'
                : 'Users';

  const activeSectionDescription =
    activeSection === 'overview'
      ? 'Operational visibility across leads, calls, integrations, and user governance.'
      : activeSection === 'leads'
        ? 'Browse, filter, import, and assign lead records from one workspace.'
        : activeSection === 'call-activity'
          ? 'Inspect team calling performance, quality, and raw logs.'
          : activeSection === 'marketplace'
            ? 'Manage CRM connectivity, sync jobs, and connector health.'
            : activeSection === 'activity'
              ? 'Audit activity feed across lead actions for admin visibility.'
              : activeSection === 'tenants'
                ? 'Manage organization settings, branding, and subscription.'
                : 'Create, edit, and manage role/access for sales users.';

  const activeSectionCount =
    activeSection === 'overview'
      ? `${leads.length + users.length + callLogs.length} records monitored`
      : activeSection === 'leads'
        ? `${leadRows.length} leads visible`
        : activeSection === 'call-activity'
          ? `${callActivityReport.filtered.length} calls in report`
          : activeSection === 'marketplace'
            ? `${syncLogs.length} sync runs tracked`
            : activeSection === 'activity'
              ? `${filteredActivities.length} activity events`
              : activeSection === 'tenants'
                ? currentTenant ? `${tenants.length} tenant(s)` : 'No tenant selected'
                : `${users.length} users managed`;

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
      return;
    }

    if (activeSection === 'marketplace') {
      void handleConnectZoho();
      return;
    }
  };

  const getLeadProgressValue = (status: string | null) => {
    switch ((status || '').toLowerCase()) {
      case 'won': return 100;
      case 'negotiation': return 80;
      case 'proposal': return 60;
      case 'qualified': return 40;
      case 'contacted': return 24;
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

  const renderCallActivity = () => (
    <div className="space-y-4">
      {/* Minimalist Control Strip */}
      <Card className="border-border/50 bg-gradient-to-r from-slate-50 to-white shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left: Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={reportFilterRange} onValueChange={(value) => setReportFilterRange(value as typeof reportFilterRange)}>
                <SelectTrigger className="h-8 w-32 border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reportCallType} onValueChange={(value) => setReportCallType(value as typeof reportCallType)}>
                <SelectTrigger className="h-8 w-28 border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All calls</SelectItem>
                  <SelectItem value="incoming">Incoming</SelectItem>
                  <SelectItem value="outgoing">Outgoing</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reportUserFilter} onValueChange={(value) => setReportUserFilter(value)}>
                <SelectTrigger className="h-8 w-32 border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {users.map((userProfile) => (
                    <SelectItem key={userProfile.id} value={userProfile.id}>
                      {userProfile.full_name || userProfile.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={reportTeamFilter} onValueChange={(value) => setReportTeamFilter(value as typeof reportTeamFilter)}>
                <SelectTrigger className="h-8 w-28 border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Middle: Compare Mode & Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 px-2 py-1">
                <Switch checked={reportCompareMode} onCheckedChange={setReportCompareMode} className="h-4 w-8" />
                <span className="text-[11px] font-medium text-slate-600">Compare</span>
              </div>
              <Button size="sm" onClick={handleRefreshReports} disabled={isFetchingCallLogs} className="h-8 gap-1 px-2 text-xs">
                <RefreshCw className="h-3 w-3" />
                {isFetchingCallLogs ? 'Refreshing' : 'Refresh'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReportFilterRange('7d');
                  setReportCallType('all');
                  setReportUserFilter('all');
                  setReportTeamFilter('all');
                  setReportCompareMode(false);
                  setCustomStartDate(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
                  setCustomEndDate(format(new Date(), 'yyyy-MM-dd'));
                }}
                className="h-8 px-2 text-xs"
              >
                Reset
              </Button>
            </div>

            {/* Right: KPI Metrics */}
            <div className="flex flex-wrap items-center gap-3 border-l border-slate-200 pl-4">
              <div className="flex flex-col gap-0.5 min-w-fit">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Calls</p>
                <p className="text-lg font-bold text-slate-900">{callActivityReport.totals.totalCalls}</p>
              </div>
              <div className="flex flex-col gap-0.5 min-w-fit">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Connect</p>
                <p className="text-lg font-bold text-blue-600">{callActivityReport.totals.answerRate}%</p>
              </div>
              <div className="flex flex-col gap-0.5 min-w-fit">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Duration</p>
                <p className="text-lg font-bold text-slate-900">{formatCallDuration(callActivityReport.totals.totalDurationSeconds)}</p>
              </div>
              <div className="flex flex-col gap-0.5 min-w-fit">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Users</p>
                <p className="text-lg font-bold text-slate-900">{callActivityReport.byUser.length}</p>
              </div>
              <div className="text-[10px] text-slate-400 border-l border-slate-200 pl-3">
                <p>Updated: {lastUpdatedAt}</p>
              </div>
            </div>
          </div>

          {reportFilterRange === 'custom' && (
            <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
              <div className="space-y-1">
                <Label htmlFor="custom-start" className="text-xs">Start</Label>
                <Input
                  id="custom-start"
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="custom-end" className="text-xs">End</Label>
                <Input
                  id="custom-end"
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-6 pt-4">
          {reportCompareMode && comparisonTotals && comparisonRangeBounds ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/70">
                <CardContent className="pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Calls vs prior period</p>
                  <p className="text-2xl font-semibold">{callActivityReport.totals.totalCalls}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={callActivityReport.totals.totalCalls >= comparisonTotals.totalCalls ? 'secondary' : 'destructive'}>
                      {callActivityReport.totals.totalCalls - comparisonTotals.totalCalls >= 0 ? '+' : ''}
                      {callActivityReport.totals.totalCalls - comparisonTotals.totalCalls}
                    </Badge>
                    <p className="text-xs text-muted-foreground">vs {format(comparisonRangeBounds.rangeStart, 'MMM d')}–{format(comparisonRangeBounds.rangeEnd, 'MMM d')}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70">
                <CardContent className="pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Answer rate change</p>
                  <p className="text-2xl font-semibold">{callActivityReport.totals.answerRate}%</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={callActivityReport.totals.answerRate >= comparisonTotals.answerRate ? 'secondary' : 'destructive'}>
                      {callActivityReport.totals.answerRate - comparisonTotals.answerRate >= 0 ? '+' : ''}
                      {callActivityReport.totals.answerRate - comparisonTotals.answerRate}%
                    </Badge>
                    <p className="text-xs text-muted-foreground">previous {comparisonTotals.totalCalls} calls</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70">
                <CardContent className="pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Talk time change</p>
                  <p className="text-2xl font-semibold">{formatCallDuration(callActivityReport.totals.totalDurationSeconds)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={callActivityReport.totals.totalDurationSeconds >= comparisonTotals.totalDurationSeconds ? 'secondary' : 'destructive'}>
                      {callActivityReport.totals.totalDurationSeconds - comparisonTotals.totalDurationSeconds >= 0 ? '+' : ''}
                      {formatCallDuration(Math.abs(callActivityReport.totals.totalDurationSeconds - comparisonTotals.totalDurationSeconds))}
                    </Badge>
                    <p className="text-xs text-muted-foreground">previous period</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70">
                <CardContent className="pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unique numbers change</p>
                  <p className="text-2xl font-semibold">{callActivityReport.totals.uniqueNumbersCalled}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={callActivityReport.totals.uniqueNumbersCalled >= comparisonTotals.uniqueNumbersCalled ? 'secondary' : 'destructive'}>
                      {callActivityReport.totals.uniqueNumbersCalled - comparisonTotals.uniqueNumbersCalled >= 0 ? '+' : ''}
                      {callActivityReport.totals.uniqueNumbersCalled - comparisonTotals.uniqueNumbersCalled}
                    </Badge>
                    <p className="text-xs text-muted-foreground">previous set: {comparisonTotals.uniqueNumbersCalled}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Tabs value={callReportView} onValueChange={(value) => setCallReportView(value as typeof callReportView)}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="user">User Performance</TabsTrigger>
              <TabsTrigger value="logs">Call Logs</TabsTrigger>
              <TabsTrigger value="time">Time Analytics</TabsTrigger>
              <TabsTrigger value="hourly">Hourly Pattern</TabsTrigger>
              <TabsTrigger value="productivity">Agent Productivity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="border-border/70 xl:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Calls vs Connected Trend</CardTitle>
                    <CardDescription>Daily momentum of activity and outcomes.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {callActivityReport.byCalendar.slice(-10).map((entry) => {
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
                    <CardTitle className="text-base">Duration Trend</CardTitle>
                    <CardDescription>Talk time volume by day.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {callActivityReport.byCalendar.slice(-10).map((entry) => {
                        const maxDuration = Math.max(...callActivityReport.byCalendar.map((item) => item.durationSeconds), 1);
                        const durationWidth = `${Math.round((entry.durationSeconds / maxDuration) * 100)}%`;
                        return (
                          <div key={`duration-${entry.date}`}>
                            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{format(new Date(entry.date), 'dd MMM')}</span>
                              <span>{formatCallDuration(entry.durationSeconds)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted">
                              <div className="h-2 rounded-full bg-emerald-500" style={{ width: durationWidth }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-base">Outbound Leaders</CardTitle>
                    <CardDescription>Top outbound callers by volume.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {callActivityReport.topOutboundUsers.map((entry, index) => (
                      <div key={`outbound-${entry.user}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span className="font-medium">#{index + 1} {entry.user}</span>
                        <Badge variant="secondary">{entry.outgoingCalls}</Badge>
                      </div>
                    ))}
                    {callActivityReport.topOutboundUsers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No outbound activity yet.</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-base">Inbound Leaders</CardTitle>
                    <CardDescription>Top inbound callers by volume.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {callActivityReport.topInboundUsers.map((entry, index) => (
                      <div key={`inbound-${entry.user}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span className="font-medium">#{index + 1} {entry.user}</span>
                        <Badge variant="secondary">{entry.incomingCalls}</Badge>
                      </div>
                    ))}
                    {callActivityReport.topInboundUsers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No inbound activity yet.</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-base">Talk Time Leaders</CardTitle>
                    <CardDescription>Users with the highest total call duration.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {callActivityReport.topDurationUsers.map((entry, index) => (
                      <div key={`duration-${entry.user}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span className="font-medium">#{index + 1} {entry.user}</span>
                        <span className="text-slate-700">{formatCallDuration(entry.durationSeconds)}</span>
                      </div>
                    ))}
                    {callActivityReport.topDurationUsers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No duration data yet.</p>
                    )}
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

            {/* ── TIME ANALYTICS ── */}
            <TabsContent value="time">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Call Volume Trends (Daily)
                    </CardTitle>
                    <CardDescription>Total calls vs connected calls over time.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {callActivityReport.byCalendar.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">No data in selected range.</p>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={callActivityReport.byCalendar} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradConnected" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'dd MMM')} tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <RechartsTooltip formatter={(val, name) => [val, name === 'totalCalls' ? 'Total Calls' : 'Connected']} labelFormatter={(d) => format(new Date(d), 'dd MMM yyyy')} />
                            <Legend formatter={(val) => val === 'totalCalls' ? 'Total Calls' : 'Connected'} />
                            <Area type="monotone" dataKey="totalCalls" stroke="#6366f1" strokeWidth={2} fill="url(#gradTotal)" dot={{ r: 3 }} />
                            <Area type="monotone" dataKey="connectedCalls" stroke="#22c55e" strokeWidth={2} fill="url(#gradConnected)" dot={{ r: 3 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-indigo-50 p-3 text-center">
                            <p className="text-xs text-muted-foreground">Peak Day</p>
                            <p className="mt-1 text-sm font-bold text-indigo-600">
                              {callActivityReport.byCalendar.length > 0
                                ? format(new Date([...callActivityReport.byCalendar].sort((a, b) => b.totalCalls - a.totalCalls)[0].date), 'dd MMM')
                                : '—'}
                            </p>
                            <p className="text-xs text-indigo-500">
                              ({[...callActivityReport.byCalendar].sort((a, b) => b.totalCalls - a.totalCalls)[0]?.totalCalls ?? 0} calls)
                            </p>
                          </div>
                          <div className="rounded-lg bg-green-50 p-3 text-center">
                            <p className="text-xs text-muted-foreground">Avg Daily Calls</p>
                            <p className="mt-1 text-sm font-bold text-green-600">
                              {callActivityReport.byCalendar.length > 0
                                ? Math.round(callActivityReport.totals.totalCalls / callActivityReport.byCalendar.length)
                                : 0}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 text-primary" />
                      Call Duration Distribution
                    </CardTitle>
                    <CardDescription>Connected calls grouped by talk time length.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={durationBuckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <RechartsTooltip formatter={(val) => [val, 'Calls']} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {durationBuckets.map((_, i) => (
                            <Cell key={i} fill={['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'][i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {durationBuckets.map((b, i) => (
                        <div key={b.label} className="rounded-lg border p-2 text-center">
                          <p className="text-xs text-muted-foreground">{b.label}</p>
                          <p className="mt-0.5 font-bold" style={{ color: ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'][i] }}>{b.count}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── HOURLY PATTERN ── */}
            <TabsContent value="hourly">
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4 text-primary" />
                    Hourly Call Distribution (24-Hour Pattern)
                  </CardTitle>
                  <CardDescription>Call volume by hour of day across the selected period.</CardDescription>
                </CardHeader>
                <CardContent>
                  {callActivityReport.filtered.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No data in selected range.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={hourlyDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradHourly" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <RechartsTooltip formatter={(val) => [val, 'Calls']} />
                          <Area type="monotone" dataKey="calls" stroke="#06b6d4" strokeWidth={2} fill="url(#gradHourly)" dot={{ r: 3, fill: '#06b6d4' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                      {(() => {
                        const peak = [...hourlyDistribution].sort((a, b) => b.calls - a.calls)[0];
                        const activeHours = hourlyDistribution.filter(h => h.calls > 0);
                        const totalCalls = hourlyDistribution.reduce((s, h) => s + h.calls, 0);
                        const avgPerHour = activeHours.length > 0 ? Math.round(totalCalls / activeHours.length) : 0;
                        const morningCalls = hourlyDistribution.slice(6, 12).reduce((s, h) => s + h.calls, 0);
                        const afternoonCalls = hourlyDistribution.slice(12, 18).reduce((s, h) => s + h.calls, 0);
                        const eveningCalls = hourlyDistribution.slice(18, 24).reduce((s, h) => s + h.calls, 0);
                        const nightCalls = hourlyDistribution.slice(0, 6).reduce((s, h) => s + h.calls, 0);
                        const periods = [['Morning', morningCalls], ['Afternoon', afternoonCalls], ['Evening', eveningCalls], ['Night', nightCalls]] as const;
                        const mostActive = [...periods].sort((a, b) => (b[1] as number) - (a[1] as number))[0][0];
                        return (
                          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-lg bg-cyan-50 p-3 text-center">
                              <p className="text-xs text-muted-foreground">Peak Hour</p>
                              <p className="mt-1 text-sm font-bold text-cyan-700">{peak.label}</p>
                              <p className="text-xs text-cyan-500">({peak.calls} calls)</p>
                            </div>
                            <div className="rounded-lg bg-indigo-50 p-3 text-center">
                              <p className="text-xs text-muted-foreground">Avg Per Hour</p>
                              <p className="mt-1 text-sm font-bold text-indigo-600">{avgPerHour} calls</p>
                            </div>
                            <div className="rounded-lg bg-green-50 p-3 text-center">
                              <p className="text-xs text-muted-foreground">Most Active Period</p>
                              <p className="mt-1 text-sm font-bold text-green-600">{mostActive}</p>
                            </div>
                            <div className="rounded-lg bg-violet-50 p-3 text-center">
                              <p className="text-xs text-muted-foreground">Total Hours Active</p>
                              <p className="mt-1 text-sm font-bold text-violet-600">{activeHours.length}/24</p>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── AGENT PRODUCTIVITY ── */}
            <TabsContent value="productivity">
              <div className="space-y-4">
                {/* Stat cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'TOTAL CALLS', value: callActivityReport.totals.totalCalls.toString(), sub: '100% of activity', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'CONNECTED', value: callActivityReport.totals.totalConnectedCalls.toString(), sub: `${callActivityReport.totals.answerRate}% success rate`, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'TOTAL TALK TIME', value: formatCallDuration(callActivityReport.totals.totalDurationSeconds), sub: 'Combined duration', color: 'text-cyan-600', bg: 'bg-cyan-50' },
                    { label: 'AVG DURATION', value: formatCallDuration(callActivityReport.totals.totalConnectedCalls > 0 ? Math.round(callActivityReport.totals.totalDurationSeconds / callActivityReport.totals.totalConnectedCalls) : 0), sub: 'Per connected call', color: 'text-violet-600', bg: 'bg-violet-50' },
                  ].map((s) => (
                    <Card key={s.label} className={`border-border/60 ${s.bg}`}>
                      <CardContent className="p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                        <p className={`mt-2 text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Agent call distribution horizontal bar */}
                  <Card className="border-border/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <User className="h-4 w-4 text-primary" />
                        Agent Call Distribution (Top 10)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {callActivityReport.byUser.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">No agent data.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={Math.max(180, Math.min(callActivityReport.byUser.slice(0, 10).length * 40, 400))}>
                          <BarChart
                            layout="vertical"
                            data={callActivityReport.byUser.slice(0, 10)}
                            margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="user" tick={{ fontSize: 11 }} width={110} />
                            <RechartsTooltip formatter={(val) => [val, 'Calls']} />
                            <Bar dataKey="totalCalls" fill="#6366f1" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  {/* Call type donut */}
                  <Card className="border-border/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4 text-primary" />
                        Call Type Breakdown
                      </CardTitle>
                      <CardDescription>Outbound vs inbound vs missed distribution.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      {callActivityReport.totals.totalCalls === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">No data in selected range.</p>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Outbound', value: callActivityReport.totals.totalOutboundCalls },
                                  { name: 'Inbound', value: callActivityReport.totals.totalInboundCalls },
                                  { name: 'Missed', value: callActivityReport.totals.totalMissedCalls },
                                ].filter(d => d.value > 0)}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={85}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {['#6366f1', '#22c55e', '#ef4444'].map((color, i) => (
                                  <Cell key={i} fill={color} />
                                ))}
                              </Pie>
                              <RechartsTooltip formatter={(val, name) => [val, name]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="mt-2 flex flex-wrap justify-center gap-4 text-sm">
                            {[
                              { label: 'Outbound', val: callActivityReport.totals.totalOutboundCalls, color: '#6366f1' },
                              { label: 'Inbound', val: callActivityReport.totals.totalInboundCalls, color: '#22c55e' },
                              { label: 'Missed', val: callActivityReport.totals.totalMissedCalls, color: '#ef4444' },
                            ].map((item) => (
                              <div key={item.label} className="flex items-center gap-1.5">
                                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
                                <span className="text-muted-foreground">{item.label}</span>
                                <span className="font-semibold">{item.val}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );

  const renderMarketplace = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
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

  const renderActivity = () => (
    <div className="space-y-4">
      <div className="sticky top-0 bg-background z-10 px-4 pt-6 pb-4 border-b border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Activity</h1>
            <p className="text-sm text-muted-foreground">{filteredActivities.length} total activities logged</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search activity, lead, or user"
            value={activitySearch}
            onChange={(e) => setActivitySearch(e.target.value)}
          />
          <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activityUserFilter} onValueChange={setActivityUserFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setActivitySearch('');
              setActivityTypeFilter('all');
              setActivityUserFilter('all');
            }}
          >
            <Filter className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>
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
                <TableCell colSpan={4} className="text-center text-muted-foreground">No activities found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderLeads = () => (
    <div className="space-y-4">
      <div className="sticky top-0 bg-background z-10 px-4 pt-6 pb-4 border-b border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Leads</h1>
            <p className="text-sm text-muted-foreground">{leadRows.length} leads available</p>
          </div>
        </div>
      </div>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4">
          <LeadAssignment />
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

  const renderTenants = () => (
    <div className="space-y-4">
      {!isSuperAdmin ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">Super admin only</p>
                <p className="text-sm text-amber-700">Only super admins can access tenant management.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isSuperAdmin ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle>Create Tenant</CardTitle>
            <CardDescription>Create a new tenant and assign its manager.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="new-tenant-name">Tenant Name</Label>
                <Input
                  id="new-tenant-name"
                  value={newTenantName}
                  placeholder="Acme India"
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setNewTenantName(nextName);
                    if (!newTenantSlug) {
                      setNewTenantSlug(
                        nextName
                          .toLowerCase()
                          .trim()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '')
                      );
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-tenant-slug">Tenant Slug</Label>
                <Input
                  id="new-tenant-slug"
                  value={newTenantSlug}
                  placeholder="acme-india"
                  onChange={(e) => setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-tenant-manager">Tenant Manager (Admin only)</Label>
                <Select
                  value={newTenantManagerId}
                  onValueChange={setNewTenantManagerId}
                >
                  <SelectTrigger id="new-tenant-manager">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTenantManagers.length === 0 && (
                      <SelectItem value="no-admin-users" disabled>No unassigned admin users available</SelectItem>
                    )}
                    {eligibleTenantManagers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.email} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={async () => {
                if (!newTenantName.trim() || !newTenantSlug.trim() || !newTenantManagerId) {
                  toast({ title: 'Missing details', description: 'Tenant name, slug, and manager are required', variant: 'destructive' });
                  return;
                }
                try {
                  await createTenant(newTenantName.trim(), newTenantSlug.trim(), newTenantManagerId);
                  toast({ title: 'Success', description: 'Tenant created successfully.' });
                  setNewTenantName('');
                  setNewTenantSlug('');
                  setNewTenantManagerId('');
                } catch (error: any) {
                  toast({ title: 'Error', description: error.message || 'Failed to create tenant', variant: 'destructive' });
                }
              }}
            >
              Create Tenant
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Tenants</CardTitle>
          <CardDescription>List of tenants and their managers.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tenant ID</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantDirectory.map((tenant) => (
                  <TableRow key={tenant.id} className={currentTenant?.id === tenant.id ? 'bg-muted/30' : ''}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell>{tenant.tenant_code}</TableCell>
                    <TableCell>{tenant.managerName || tenant.managerEmail || 'No manager assigned'}</TableCell>
                    <TableCell>{tenant.memberCount}</TableCell>
                    <TableCell>
                      <Badge variant={tenant.active ? 'default' : 'destructive'}>
                        {tenant.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => void switchTenant(tenant.id)}>
                          Manage
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                          disabled={tenants.length <= 1}
                          onClick={() => setTenantDeleteConfirm({ tenantId: tenant.id, tenantName: tenant.name })}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {tenantDirectory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No tenants found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {currentTenant ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
            <div>
              <CardTitle>Tenant Settings</CardTitle>
              <CardDescription>Manage organization information and manager assignment.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditingTenant(!isEditingTenant)}>
              <Pencil className="mr-1 h-4 w-4" />
              {isEditingTenant ? 'Cancel' : 'Edit'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                {isEditingTenant ? (
                  <Input
                    value={tenantNameEdit}
                    onChange={(e) => setTenantNameEdit(e.target.value)}
                    placeholder="Enter organization name"
                  />
                ) : (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm">{currentTenant.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{currentTenant.slug}</p>
              </div>
              <div className="space-y-2">
                <Label>Tenant ID</Label>
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">{currentTenant.tenant_code}</p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Badge className="w-fit" variant={currentTenant.active ? 'default' : 'destructive'}>
                  {currentTenant.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tenant Manager</Label>
                <Select
                  value={currentTenantManager?.user_id || ''}
                  onValueChange={async (value) => {
                    try {
                      await setTenantManager(currentTenant.id, value);
                      toast({ title: 'Manager updated', description: 'Tenant manager has been updated.' });
                    } catch (error: any) {
                      toast({ title: 'Error', description: error.message || 'Failed to update tenant manager', variant: 'destructive' });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assign manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((entry) => entry.is_active && entry.role === 'admin')
                      .map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.full_name || entry.email} ({entry.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {isEditingTenant && (
                <Button
                  onClick={async () => {
                    try {
                      await updateTenant(currentTenant.id, { name: tenantNameEdit });
                      setIsEditingTenant(false);
                      toast({ title: 'Success', description: 'Tenant updated successfully' });
                    } catch (error) {
                      toast({ title: 'Error', description: 'Failed to update tenant', variant: 'destructive' });
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Check className="mr-1 h-4 w-4" />
                  Save Changes
                </Button>
              )}
              <Button
                variant="outline"
                disabled={!currentTenantManager}
                onClick={async () => {
                  try {
                    await removeTenantManager(currentTenant.id);
                    toast({ title: 'Manager removed', description: 'Tenant manager has been removed.' });
                  } catch (error: any) {
                    toast({ title: 'Error', description: error.message || 'Failed to remove tenant manager', variant: 'destructive' });
                  }
                }}
              >
                Remove Manager
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  const renderTeam = () => {
    if (!isSuperAdmin) {
      return (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">Super admin only</p>
                <p className="text-sm text-amber-700">Tenant users can only be managed by super admins.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!currentTenant) {
      return (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">No tenant selected</p>
                <p className="text-sm text-amber-700">Select a tenant from the list to manage team members.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {/* Add Existing User */}
        <Card className="border-border/80 shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="tenant-user-select">Add Existing User</Label>
                <Select value={selectedTenantUserId} onValueChange={setSelectedTenantUserId}>
                  <SelectTrigger id="tenant-user-select">
                    <SelectValue placeholder="Select an unassigned user" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTenantUsers.length === 0 && (
                      <SelectItem value="no-tenant-users" disabled>No unassigned users available</SelectItem>
                    )}
                    {availableTenantUsers.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.full_name || entry.email} ({entry.role || 'No role'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={async () => {
                if (!selectedTenantUserId) {
                  toast({ title: 'Error', description: 'Select a user to assign to this tenant.' });
                  return;
                }
                try {
                  setIsAssigningTenantUser(true);
                  await assignUserToTenant(currentTenant.id, selectedTenantUserId);
                  toast({
                    title: 'User assigned',
                    description: 'User has been linked to this tenant.',
                  });
                  setSelectedTenantUserId('');
                } catch (error: any) {
                  toast({
                    title: 'Error',
                    description: error.message || 'Failed to assign tenant user',
                    variant: 'destructive',
                  });
                } finally {
                  setIsAssigningTenantUser(false);
                }
              }}
              disabled={isAssigningTenantUser || !selectedTenantUserId}
              className="w-full"
            >
              <Mail className="mr-2 h-4 w-4" />
              {isAssigningTenantUser ? 'Assigning...' : 'Add User To Tenant'}
            </Button>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle>Team Members</CardTitle>
            <CardDescription>{tenantMembers.length} member(s) in this organization</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {tenantMembers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No team members yet. Invite someone to get started.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.user?.user_metadata?.full_name || 'No name'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{member.user?.email || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(member.joined_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="flex justify-end gap-2">
                          {tenantRole === 'admin' || tenantRole === 'owner' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline">
                                  Manage
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {member.role !== 'admin' && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await setTenantManager(currentTenant.id, member.user_id);
                                        toast({ title: 'Manager updated', description: 'Tenant manager has been updated.' });
                                      } catch (error: any) {
                                        toast({ title: 'Error', description: error.message || 'Failed to update tenant manager', variant: 'destructive' });
                                      }
                                    }}
                                  >
                                    <Shield className="mr-2 h-4 w-4" />
                                    Make Manager
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  disabled={member.user_id === user?.id || member.role === 'admin'}
                                  onClick={async () => {
                                    try {
                                      await removeMember(currentTenant.id, member.user_id);
                                      toast({ title: 'Success', description: 'Member removed from team' });
                                    } catch (error) {
                                      toast({ title: 'Error', description: 'Failed to remove member', variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove Member
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">No actions available</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const handleAssignTenant = async (userId: string, tenantId: string) => {
    try {
      if (tenantId) {
        await assignUserToTenant(tenantId, userId);
        toast({ title: 'Tenant assigned', description: 'User has been assigned to the selected tenant.' });
      } else {
        await clearUserTenant(userId);
        toast({ title: 'Tenant cleared', description: 'User is no longer assigned to a tenant.' });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error: any) {
      toast({ title: 'Failed to update tenant', description: error.message || 'Unable to update tenant assignment.', variant: 'destructive' });
    }
  };

  const renderSettings = () => (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
          <CardContent className="pt-4">
            <div className="mb-4 flex flex-row items-center justify-between">
              <div>
                <h3 className="font-semibold">User Settings</h3>
                <p className="text-sm text-muted-foreground">Create, edit, and manage role/access for sales users.</p>
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
                      onValueChange={(value: 'super_admin' | 'admin' | 'sales') => setNewUserData((prev) => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {isSuperAdmin ? <SelectItem value="super_admin">Super Admin</SelectItem> : null}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={createUser.isPending}>
                    {createUser.isPending ? 'Creating...' : 'Create User'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
            {selectedUserIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                <Badge variant="secondary">{selectedUserIds.length} selected</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-500 text-green-600"
                  disabled={bulkActivateUsers.isPending}
                  onClick={() => bulkActivateUsers.mutate(selectedUserIds)}
                >
                  <UserCheck className="mr-1 h-3 w-3" />
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500 text-amber-600"
                  disabled={bulkDeactivateUsers.isPending}
                  onClick={() => bulkDeactivateUsers.mutate(selectedUserIds.filter((id) => id !== user?.id))}
                >
                  <UserX className="mr-1 h-3 w-3" />
                  Deactivate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedUserIds([])}>Clear</Button>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={paginatedUsers.length > 0 && selectedUserIds.length >= paginatedUsers.length && paginatedUsers.every((u) => selectedUserIds.includes(u.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds((prev) => Array.from(new Set([...prev, ...paginatedUsers.map((u) => u.id)])));
                          } else {
                            setSelectedUserIds((prev) => prev.filter((id) => !paginatedUsers.map((u) => u.id).includes(id)));
                          }
                        }}
                      />
                    </TableHead>
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
                    <TableRow key={entry.id} className={selectedUserIds.includes(entry.id) ? 'bg-muted/30' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer"
                          checked={selectedUserIds.includes(entry.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserIds((prev) => [...prev, entry.id]);
                            } else {
                              setSelectedUserIds((prev) => prev.filter((id) => id !== entry.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{entry.full_name || 'No name'}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.email}</TableCell>
                      <TableCell>
                        <Badge variant={entry.role === 'super_admin' ? 'default' : entry.role === 'admin' ? 'default' : 'secondary'}>
                          {entry.role || 'No role'}
                        </Badge>
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
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
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

  if (!user || !canAccessAdminDashboard) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="w-full h-screen lg:h-auto">
        <div className={`grid grid-cols-1 gap-0 h-full ${sidebarCollapsed ? 'lg:grid-cols-[78px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'}`}>
          <aside className="relative rounded-none border-r border-slate-200/80 bg-white/95 p-4 shadow-none backdrop-blur overflow-y-auto">
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

            <div className="mt-4 border-t border-slate-200 pt-4">
              <Button
                variant="outline"
                className={`w-full justify-center border-slate-200 text-slate-600 hover:text-slate-900 ${sidebarCollapsed ? 'px-0' : 'justify-start gap-2'}`}
                onClick={() => void handleSignOut()}
              >
                <LogOut className="h-4 w-4" />
                {!sidebarCollapsed && 'Logout'}
              </Button>
            </div>
          </aside>

          <div className="min-w-0 space-y-4 overflow-hidden p-4 lg:p-5">
            <main className="min-w-0 h-[calc(100vh-env(safe-area-inset-top))] lg:h-[calc(100vh-env(safe-area-inset-top)-32px)] overflow-y-auto pr-0">
              {activeSection === 'leads' && renderLeads()}
              {activeSection === 'call-activity' && renderCallActivity()}
              {activeSection === 'marketplace' && renderMarketplace()}
              {activeSection === 'activity' && renderActivity()}
              {activeSection === 'tenants' && renderTenants()}
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
            <CommandItem onSelect={() => { setActiveSection('leads'); setCommandOpen(false); }}>
              <Users className="mr-2 h-4 w-4" />
              Manage Leads
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('call-activity'); setCommandOpen(false); }}>
              <Phone className="mr-2 h-4 w-4" />
              Reports
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('activity'); setCommandOpen(false); }}>
              <Activity className="mr-2 h-4 w-4" />
              Activity
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('marketplace'); setCommandOpen(false); }}>
              <Link2 className="mr-2 h-4 w-4" />
              Integrations
            </CommandItem>
            <CommandItem onSelect={() => { setActiveSection('settings'); setCommandOpen(false); }}>
              <Settings className="mr-2 h-4 w-4" />
              Users
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { setIsCreateDialogOpen(true); setActiveSection('settings'); setCommandOpen(false); }}>
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
                onValueChange={(value: 'super_admin' | 'admin' | 'sales') => setEditUserData((prev) => ({ ...prev, role: value }))}
                disabled={editUserData.id === user?.id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin ? <SelectItem value="super_admin">Super Admin</SelectItem> : null}
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

      <AlertDialog open={!!tenantDeleteConfirm} onOpenChange={() => setTenantDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              {tenantDeleteConfirm
                ? `This will delete ${tenantDeleteConfirm.tenantName}. Any users and tenant data linked to it will be moved to Handover before deletion.`
                : 'Delete the selected tenant.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!tenantDeleteConfirm) return;
                try {
                  await deleteTenant(tenantDeleteConfirm.tenantId);
                  toast({ title: 'Tenant deleted', description: 'Tenant has been deleted and moved into Handover.' });
                  setTenantDeleteConfirm(null);
                } catch (error: any) {
                  toast({ title: 'Error', description: error.message || 'Failed to delete tenant', variant: 'destructive' });
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
