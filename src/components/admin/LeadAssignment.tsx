import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Users, UserPlus, Filter, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import LeadImport from '@/components/admin/LeadImport';
import { useTenant } from '@/contexts/TenantContext';

type Lead = Database['public']['Tables']['leads']['Row'];
type LeadStatus = Database['public']['Enums']['lead_status'];

interface SalesUser {
  id: string;
  email: string;
  full_name: string | null;
}

const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-600',
  contacted: 'bg-yellow-500/20 text-yellow-600',
  qualified: 'bg-purple-500/20 text-purple-600',
  proposal: 'bg-orange-500/20 text-orange-600',
  negotiation: 'bg-pink-500/20 text-pink-600',
  won: 'bg-green-500/20 text-green-600',
  lost: 'bg-red-500/20 text-red-600',
};

interface LeadAssignmentProps {
  onLeadClick?: (lead: Lead) => void;
}

const LeadAssignment = ({ onLeadClick }: LeadAssignmentProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedSalesUser, setSelectedSalesUser] = useState<string>('');
  const [isImportOpen, setIsImportOpen] = useState(false);

  const downloadTemplate = () => {
    const rows = [
      { name: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com', company: 'Acme Pvt Ltd', source: 'Website', notes: 'Interested in enterprise plan', value: 50000 },
      { name: 'Priya Mehta',  phone: '9123456789', email: 'priya@example.com', company: 'Beta Corp',    source: 'Referral', notes: '',                              value: 25000 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['name', 'phone', 'email', 'company', 'source', 'notes', 'value'],
    });
    ws['!cols'] = [18, 14, 26, 20, 14, 30, 10].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'leads_import_template.xlsx');
  };

  // Fetch all leads (admin sees all)
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
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
    enabled: !!currentTenant,
  });

  // Fetch sales users
  const { data: salesUsers = [] } = useQuery({
    queryKey: ['sales-users', currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'sales')
        .eq('tenant_id', currentTenant.id);

      if (rolesError) throw rolesError;

      const userIds = roles?.map((r) => r.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
        .eq('is_active', true);

      if (profilesError) throw profilesError;
      return profiles as SalesUser[];
    },
    enabled: !!currentTenant,
  });

  // Create a map of user_id to user info
  const userMap = new Map(salesUsers.map((u) => [u.id, u]));

  // Assign leads mutation
  const assignLeads = useMutation({
    mutationFn: async ({ leadIds, userId }: { leadIds: string[]; userId: string | null }) => {
      const { error } = await supabase
        .from('leads')
        .update({ user_id: userId })
        .in('id', leadIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads', currentTenant?.id] });
      toast({
        title: 'Leads Updated',
        description: `${selectedLeads.length} leads have been ${selectedSalesUser ? 'assigned' : 'unassigned'}.`,
      });
      setSelectedLeads([]);
      setSelectedSalesUser('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Assignment Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.includes(searchQuery) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;

    // A lead is "assigned" only when its user_id maps to an active user in the system.
    // Leads whose assigned user was deleted or deactivated show "Unassigned" in the table
    // and must also appear under the Unassigned filter, not the Assigned one.
    const isAssigned = Boolean(lead.user_id) && userMap.has(lead.user_id!);
    const matchesAssigned =
      assignedFilter === 'all' ||
      (assignedFilter === 'assigned' && isAssigned) ||
      (assignedFilter === 'unassigned' && !isAssigned);

    return matchesSearch && matchesStatus && matchesAssigned;
  });

  const toggleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (leadId: string) => {
    setSelectedLeads((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const handleAssign = () => {
    if (selectedLeads.length === 0) return;
    // "unassign" is the sentinel value from the Select — must become null in the DB
    const userId = selectedSalesUser === 'unassign' ? null : (selectedSalesUser || null);
    assignLeads.mutate({ leadIds: selectedLeads, userId });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Lead Assignment
            </CardTitle>
            <CardDescription className="mt-1">
              View all leads and assign them to sales users
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
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
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus | 'all')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v as 'all' | 'assigned' | 'unassigned')}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {selectedLeads.length > 0 && (
          <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-lg">
            <span className="text-sm font-medium">
              {selectedLeads.length} lead(s) selected
            </span>
            <Select value={selectedSalesUser} onValueChange={setSelectedSalesUser}>
              <SelectTrigger className="w-[200px]">
                <UserPlus className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Assign to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassign">Unassign</SelectItem>
                {salesUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssign} disabled={assignLeads.isPending}>
              {assignLeads.isPending ? 'Assigning...' : 'Apply'}
            </Button>
            <Button variant="outline" onClick={() => setSelectedLeads([])}>
              Clear
            </Button>
          </div>
        )}

        {/* Leads Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading leads...
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => {
                  const assignedUser = lead.user_id ? userMap.get(lead.user_id) : null;
                  return (
                    <TableRow
                      key={lead.id}
                      className={onLeadClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                      onClick={() => onLeadClick?.(lead)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={() => toggleSelectLead(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell>{lead.phone}</TableCell>
                      <TableCell>{lead.company || '-'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[lead.status]}>
                          {statusLabels[lead.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {assignedUser ? (
                          <span className="text-sm">
                            {assignedUser.full_name || assignedUser.email}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lead.created_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          Showing {filteredLeads.length} of {leads.length} leads
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadAssignment;
