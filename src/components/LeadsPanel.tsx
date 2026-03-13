import { useState, useCallback } from 'react';
import { Search, Plus, Phone, Edit2, Trash2, MessageCircle, ChevronDown, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLeads, Lead, LeadStatus } from '@/hooks/useLeads';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import LeadDetailSheet from '@/components/LeadDetailSheet';

const allStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

interface LeadsPanelProps {
  onCall: (phone: string, name: string, leadId?: string) => void;
  onWhatsApp: (phone: string, name: string, leadId?: string) => void;
}

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted: 'bg-primary/20 text-primary border-primary/30',
  qualified: 'bg-accent/20 text-accent border-accent/30',
  proposal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  negotiation: 'bg-warning/20 text-warning border-warning/30',
  won: 'bg-success/20 text-success border-success/30',
  lost: 'bg-destructive/20 text-destructive border-destructive/30',
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

const columnColors: Record<LeadStatus, string> = {
  new: 'border-t-blue-500',
  contacted: 'border-t-primary',
  qualified: 'border-t-accent',
  proposal: 'border-t-purple-500',
  negotiation: 'border-t-warning',
  won: 'border-t-success',
  lost: 'border-t-destructive',
};

const LeadsPanel = ({ onCall, onWhatsApp }: LeadsPanelProps) => {
  const { leads, isLoading, createLead, updateLead, deleteLead } = useLeads();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);

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
    setEditingLead(lead);
    setIsAddSheetOpen(true);
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.company?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      lead.phone.includes(searchQuery);

    return matchesSearch;
  });

  const getLeadsByStatus = (status: LeadStatus) => {
    return filteredLeads.filter((lead) => lead.status === status);
  };

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === 'new').length,
    qualified: leads.filter((l) => l.status === 'qualified').length,
    won: leads.filter((l) => l.status === 'won').length,
    totalValue: leads.reduce((sum, l) => sum + (l.value || 0), 0),
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
  };

  const handleDragEnd = () => {
    setDraggedLead(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, newStatus: LeadStatus) => {
    e.preventDefault();
    if (draggedLead && draggedLead.status !== newStatus) {
      updateLead.mutate({ id: draggedLead.id, status: newStatus });
    }
    setDraggedLead(null);
    setDragOverColumn(null);
  };

  // Touch handlers for mobile
  const [touchedLead, setTouchedLead] = useState<Lead | null>(null);

  const handleTouchStart = (lead: Lead) => {
    setTouchedLead(lead);
  };

  const handleStatusChange = (leadId: string, newStatus: LeadStatus) => {
    updateLead.mutate({ id: leadId, status: newStatus });
    setTouchedLead(null);
  };

  return (
    <div className="pb-20 h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-xl z-10 px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Leads</h1>
            <p className="text-sm text-muted-foreground">{stats.total} total leads</p>
          </div>
          <Sheet open={isAddSheetOpen} onOpenChange={setIsAddSheetOpen}>
            <SheetTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => resetForm()}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center glow-primary"
              >
                <Plus className="w-5 h-5 text-primary-foreground" />
              </motion.button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85%] bg-background rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>{editingLead ? 'Edit Lead' : 'Add New Lead'}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Phone *</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 555 123 4567"
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Source</Label>
                    <Input
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      placeholder="Website, Referral..."
                    />
                  </div>
                  <div>
                    <Label>Deal Value ($)</Label>
                    <Input
                      type="number"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      placeholder="5000"
                    />
                  </div>
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
                <Button onClick={handleSubmit} className="w-full" disabled={!formData.name || !formData.phone}>
                  {editingLead ? 'Update Lead' : 'Create Lead'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-primary">{stats.new}</p>
            <p className="text-[10px] text-muted-foreground">New</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-accent">{stats.qualified}</p>
            <p className="text-[10px] text-muted-foreground">Qualified</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-success">{stats.won}</p>
            <p className="text-[10px] text-muted-foreground">Won</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-foreground">${(stats.totalValue / 1000).toFixed(0)}k</p>
            <p className="text-[10px] text-muted-foreground">Pipeline</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-border h-11"
          />
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto px-2">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading leads...</p>
          </div>
        ) : (
          <div className="flex gap-3 pb-4 min-w-max">
            {allStatuses.map((status) => {
              const columnLeads = getLeadsByStatus(status);
              const isOver = dragOverColumn === status;
              
              return (
                <div
                  key={status}
                  className={`w-64 flex-shrink-0 bg-secondary/30 rounded-xl border-t-4 ${columnColors[status]} transition-all ${
                    isOver ? 'bg-primary/10 ring-2 ring-primary/30' : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  {/* Column Header */}
                  <div className="p-3 border-b border-border/30">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-foreground">{statusLabels[status]}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {columnLeads.length}
                      </Badge>
                    </div>
                  </div>

                  {/* Column Content */}
                  <ScrollArea className="h-[calc(100vh-340px)]">
                    <div className="p-2 space-y-2">
                      <AnimatePresence>
                        {columnLeads.map((lead) => {
                          const initials = lead.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase();

                          return (
                            <motion.div
                              key={lead.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              draggable
                              onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, lead)}
                              onDragEnd={handleDragEnd}
                              className={`glass-card p-3 cursor-grab active:cursor-grabbing ${
                                draggedLead?.id === lead.id ? 'opacity-50 ring-2 ring-primary' : ''
                              }`}
                              onClick={() => setSelectedLead(lead)}
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-1 cursor-grab">
                                  <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                                </div>
                                <Avatar className="w-8 h-8 bg-gradient-to-br from-primary to-accent flex-shrink-0">
                                  <AvatarFallback className="bg-transparent text-primary-foreground text-xs font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-sm text-foreground truncate">{lead.name}</h4>
                                  <p className="text-xs text-muted-foreground truncate">{lead.company || 'No company'}</p>
                                  <p className="text-[10px] text-muted-foreground/70">{lead.phone}</p>
                                  {lead.value && (
                                    <p className="text-xs font-medium text-success mt-1">${lead.value.toLocaleString()}</p>
                                  )}
                                </div>
                              </div>

                              {/* Quick Actions */}
                              <div className="flex gap-1 mt-2 pt-2 border-t border-border/30">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCall(lead.phone, lead.name, lead.id);
                                  }}
                                  className="flex-1 h-7 rounded bg-success/20 flex items-center justify-center"
                                >
                                  <Phone className="w-3 h-3 text-success" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onWhatsApp(lead.phone, lead.name, lead.id);
                                  }}
                                  className="flex-1 h-7 rounded bg-green-500/20 flex items-center justify-center"
                                >
                                  <MessageCircle className="w-3 h-3 text-green-500" />
                                </button>
                                <button
                                  onClick={(e) => handleEdit(lead, e)}
                                  className="flex-1 h-7 rounded bg-primary/20 flex items-center justify-center"
                                >
                                  <Edit2 className="w-3 h-3 text-primary" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteLead.mutate(lead.id);
                                  }}
                                  className="flex-1 h-7 rounded bg-destructive/20 flex items-center justify-center"
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </button>
                              </div>

                              {/* Mobile: Status Change Dropdown */}
                              <div className="mt-2 md:hidden">
                                <Select
                                  value={lead.status}
                                  onValueChange={(value: LeadStatus) => {
                                    handleStatusChange(lead.id, value);
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allStatuses.map((s) => (
                                      <SelectItem key={s} value={s} className="text-xs">
                                        {statusLabels[s]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>

                      {columnLeads.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-xs">
                          No leads
                        </div>
                      )}
                    </div>
                  </ScrollArea>
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
      />
    </div>
  );
};

export default LeadsPanel;
