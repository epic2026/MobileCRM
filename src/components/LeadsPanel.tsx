import { useDeferredValue, useState } from 'react';
import { Search, Plus, Phone, MessageCircle, Building2, IndianRupee } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLeads, Lead, LeadStatus } from '@/hooks/useLeads';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LeadDetailSheet from '@/components/LeadDetailSheet';
import { useCustomFields } from '@/hooks/useCustomFields';

const allStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

interface LeadsPanelProps {
  onCall: (phone: string, name: string, leadId?: string) => void;
  onWhatsApp: (phone: string, name: string, leadId?: string) => void;
}

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  contacted: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30',
  qualified: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  proposal: 'bg-violet-500/15 text-violet-600 border-violet-500/30',
  negotiation: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  won: 'bg-green-500/15 text-green-600 border-green-500/30',
  lost: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
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

const LeadsPanel = ({ onCall, onWhatsApp }: LeadsPanelProps) => {
  const { leads, isLoading, createLead, updateLead, deleteLead } = useLeads();
  const { fields: customFieldDefs } = useCustomFields('lead');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | LeadStatus>('all');
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    source: '',
    notes: '',
    value: '',
    status: 'new' as LeadStatus,
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});

  const resetForm = () => {
    setFormData({
      name: '',
      company: '',
      phone: '',
      email: '',
      source: '',
      notes: '',
      value: '',
      status: 'new',
    });
    setCustomFieldValues({});
    setEditingLead(null);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.phone) return;

    const leadData = {
      name: formData.name,
      company: formData.company || null,
      phone: formData.phone,
      email: formData.email || null,
      source: formData.source || null,
      notes: formData.notes || null,
      value: formData.value ? parseFloat(formData.value) : null,
      status: formData.status,
      custom_fields: customFieldValues,
    };

    if (editingLead) {
      updateLead.mutate({ id: editingLead.id, ...leadData });
    } else {
      createLead.mutate(leadData);
    }

    resetForm();
    setIsAddSheetOpen(false);
  };

  const handleEdit = (lead: Lead, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFormData({
      name: lead.name,
      company: lead.company || '',
      phone: lead.phone,
      email: lead.email || '',
      source: lead.source || '',
      notes: lead.notes || '',
      value: lead.value?.toString() || '',
      status: lead.status,
    });
    setCustomFieldValues(lead.custom_fields ?? {});
    setEditingLead(lead);
    setIsAddSheetOpen(true);
  };

  const statusCounts = leads.reduce<Record<'all' | LeadStatus, number>>((counts, lead) => {
    counts.all += 1;
    counts[lead.status] += 1;
    return counts;
  }, {
    all: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    proposal: 0,
    negotiation: 0,
    won: 0,
    lost: 0,
  });

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      deferredSearchQuery.length === 0 ||
      lead.name.toLowerCase().includes(deferredSearchQuery) ||
      (lead.company?.toLowerCase().includes(deferredSearchQuery) ?? false) ||
      lead.phone.includes(deferredSearchQuery);

    const matchesStatus = selectedStatus === 'all' || lead.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const sortedLeads = filteredLeads
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const handleStatusChange = (leadId: string, newStatus: LeadStatus) => {
    updateLead.mutate({ id: leadId, status: newStatus });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="pb-24 h-full flex flex-col overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 px-4 pt-5 pb-3 border-b border-border/60">
        {/* Search + Add */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-border h-11"
            />
          </div>
          <Sheet open={isAddSheetOpen} onOpenChange={setIsAddSheetOpen}>
            <SheetTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => resetForm()}
                className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/25"
              >
                <Plus className="w-5 h-5 text-primary-foreground" />
              </motion.button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85%] bg-background rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>{editingLead ? 'Edit Lead' : 'Add New Lead'}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6 overflow-y-auto">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Acme Inc"
                  />
                </div>
                <div>
                  <Label>Phone *</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@acme.com"
                  />
                </div>
                <div>
                  <Label>Source</Label>
                  <Input
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    placeholder="Website, Referral..."
                  />
                </div>
                <div>
                  <Label>Value (₹)</Label>
                  <Input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="50000"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: LeadStatus) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add notes about this lead..."
                    rows={3}
                  />
                </div>

                {/* Custom fields */}
                {customFieldDefs.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Fields</p>
                    {customFieldDefs.map((def) => {
                      const val = customFieldValues[def.field_key];
                      const onChange = (newVal: unknown) =>
                        setCustomFieldValues((p) => ({ ...p, [def.field_key]: newVal }));
                      return (
                        <div key={def.id}>
                          <Label>
                            {def.field_label}
                            {def.required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                          {def.field_type === 'checkbox' ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border accent-primary"
                                checked={Boolean(val)}
                                onChange={(e) => onChange(e.target.checked)}
                              />
                              <span className="text-sm text-muted-foreground">{Boolean(val) ? 'Yes' : 'No'}</span>
                            </div>
                          ) : def.field_type === 'select' ? (
                            <Select
                              value={String(val ?? '')}
                              onValueChange={(v) => onChange(v)}
                            >
                              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                              <SelectContent>
                                {def.options.map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : def.field_type === 'textarea' ? (
                            <Textarea
                              value={String(val ?? '')}
                              onChange={(e) => onChange(e.target.value)}
                              placeholder={`Enter ${def.field_label.toLowerCase()}…`}
                              rows={2}
                            />
                          ) : (
                            <Input
                              type={def.field_type === 'number' ? 'number' : def.field_type === 'date' ? 'date' : 'text'}
                              value={String(val ?? '')}
                              onChange={(e) => onChange(def.field_type === 'number' ? Number(e.target.value) : e.target.value)}
                              placeholder={`Enter ${def.field_label.toLowerCase()}…`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button onClick={handleSubmit} className="w-full" disabled={!formData.name || !formData.phone}>
                  {editingLead ? 'Update Lead' : 'Create Lead'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="mt-3 -mx-1 px-1 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 h-10 rounded-full border text-xs font-medium transition-colors ${
                selectedStatus === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              All ({statusCounts.all})
            </button>
            {allStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-3 h-10 rounded-full border text-xs font-medium transition-colors ${
                  selectedStatus === status
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border'
                }`}
              >
                  {statusLabels[status]} ({statusCounts[status]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
        {isLoading ? (
          <div className="space-y-3 pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-28" />
                    <div className="flex gap-2 mt-2">
                      <Skeleton className="h-9 w-16 rounded-lg" />
                      <Skeleton className="h-9 w-24 rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium text-foreground">No leads found</p>
            <p className="text-xs text-muted-foreground mt-1">Try changing search or status filters.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {sortedLeads.map((lead) => {
              const initials = lead.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <div
                  key={lead.id}
                  className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm"
                  onClick={() => setSelectedLead(lead)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-11 h-11 bg-gradient-to-br from-primary to-accent flex-shrink-0">
                      <AvatarFallback className="bg-transparent text-primary-foreground text-sm font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-foreground truncate">{lead.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                            <Building2 className="w-3 h-3" />
                            {lead.company || 'No company'}
                          </p>
                        </div>
                        <Badge className={`${statusColors[lead.status]} border text-xs font-medium`}>
                          {statusLabels[lead.status]}
                        </Badge>
                      </div>

                      <p className="text-sm text-foreground mt-2">{lead.phone}</p>

                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-muted-foreground">
                          Updated {new Date(lead.updated_at).toLocaleDateString()}
                        </p>
                        {lead.value ? (
                          <p className="text-sm font-semibold text-foreground flex items-center gap-0.5">
                            <IndianRupee className="w-3 h-3" />
                            {formatCurrency(lead.value)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No value</p>
                        )}
                      </div>

                      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onCall(lead.phone, lead.name, lead.id)}
                          className="h-9 px-3 rounded-lg bg-green-500/15 text-green-600 text-xs font-medium flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Call
                        </button>
                        <button
                          onClick={() => onWhatsApp(lead.phone, lead.name, lead.id)}
                          className="h-9 px-3 rounded-lg bg-emerald-500/15 text-emerald-600 text-xs font-medium flex items-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lead Detail Sheet */}
      <LeadDetailSheet
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onCall={onCall}
        onWhatsApp={onWhatsApp}
        onStatusChange={(leadId, newStatus) => {
          updateLead.mutate({ id: leadId, status: newStatus });
        }}
        onEdit={(lead) => {
          setSelectedLead(null);
          handleEdit(lead);
        }}
        onDelete={(leadId) => {
          setSelectedLead(null);
          deleteLead.mutate(leadId);
        }}
      />
    </div>
  );
};

export default LeadsPanel;
