import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  Mail,
  MessageSquare,
  Plus,
  Clock,
  CheckCircle2,
  Calendar,
  Sparkles,
  ChevronDown,
  FileText,
  ListTodo,
  Activity,
  X,
  Volume2,
} from 'lucide-react';
import { Lead, LeadStatus } from '@/hooks/useLeads';
import { useLeadTasks, TaskStatus } from '@/hooks/useLeadTasks';
import { useLeadActivities, ActivityType } from '@/hooks/useLeadActivities';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import CallRecordingPlayer from '@/components/CallRecordingPlayer';

const formatDateTimeSafe = (value: string | null | undefined, pattern = 'MMM d, yyyy h:mm a') => {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown time';
  try {
    return format(parsed, pattern);
  } catch {
    return 'Unknown time';
  }
};

interface LeadDetailSheetProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onCall: (phone: string, name: string, leadId?: string) => void;
  onWhatsApp: (phone: string, name: string, leadId?: string) => void;
  onStatusChange?: (leadId: string, newStatus: LeadStatus) => void;
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

const taskStatusColors: Record<TaskStatus, string> = {
  pending: 'bg-warning/20 text-warning',
  in_progress: 'bg-primary/20 text-primary',
  completed: 'bg-success/20 text-success',
  cancelled: 'bg-muted text-muted-foreground',
};

const activityIcons: Record<ActivityType, React.ReactNode> = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
  note: <FileText className="w-4 h-4" />,
  task_created: <ListTodo className="w-4 h-4" />,
  status_change: <Activity className="w-4 h-4" />,
};

const allStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const recordingSourceLabel = (recording: { file_path: string; transcription: string | null }) => {
  if (recording.file_path.includes('/system_') || recording.transcription?.startsWith('Imported from device recorder')) {
    return 'Device Recorder';
  }
  return 'App Recorder';
};

const LeadDetailSheet = ({ lead, isOpen, onClose, onCall, onWhatsApp, onStatusChange }: LeadDetailSheetProps) => {
  const { tasks, createTask } = useLeadTasks(lead?.id ?? null);
  const { activities, createActivity } = useLeadActivities(lead?.id ?? null);
  const { recordings } = useCallRecordings(lead?.id ?? null);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_date: '' });
  const [activityForm, setActivityForm] = useState({ type: 'note' as ActivityType, title: '', description: '' });

  const recordingsByActivityId = useMemo(() => {
    if (!lead) return new Map<string, (typeof recordings)[number]>();

    const map = new Map<string, (typeof recordings)[number]>();
    const usedRecordingIds = new Set<string>();
    const sortedRecordings = [...recordings].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (const activity of activities) {
      if (activity.type !== 'call') continue;

      const activityTs = new Date(activity.created_at).getTime();
      let bestMatch: (typeof recordings)[number] | null = null;
      let bestDiff = Number.MAX_SAFE_INTEGER;

      for (const recording of sortedRecordings) {
        if (usedRecordingIds.has(recording.id)) continue;

        const recordingTs = new Date(recording.created_at).getTime();
        const diff = Math.abs(recordingTs - activityTs);

        if (diff <= 45 * 60 * 1000 && diff < bestDiff) {
          bestMatch = recording;
          bestDiff = diff;
        }
      }

      if (bestMatch) {
        map.set(activity.id, bestMatch);
        usedRecordingIds.add(bestMatch.id);
      }
    }

    return map;
  }, [lead, activities, recordings]);

  if (!lead) return null;

  const initials = lead.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const handleCreateTask = () => {
    if (!taskForm.title) return;
    createTask.mutate({
      lead_id: lead.id,
      title: taskForm.title,
      description: taskForm.description || null,
      due_date: taskForm.due_date || null,
      status: 'pending',
    });
    setTaskForm({ title: '', description: '', due_date: '' });
    setIsAddingTask(false);

    // Log activity
    createActivity.mutate({
      lead_id: lead.id,
      type: 'task_created',
      title: `Task created: ${taskForm.title}`,
      description: null,
      metadata: {},
    });
  };

  const handleCreateActivity = () => {
    if (!activityForm.title) return;
    createActivity.mutate({
      lead_id: lead.id,
      type: activityForm.type,
      title: activityForm.title,
      description: activityForm.description || null,
      metadata: {},
    });
    setActivityForm({ type: 'note', title: '', description: '' });
    setIsAddingActivity(false);
  };

  // Generate AI insights based on activities and lead data
  const generateInsights = () => {
    const callCount = activities.filter((a) => a.type === 'call').length;
    const lastActivity = activities[0];
    const daysSinceLastActivity = lastActivity
      ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const insights = [];

    if (lead.status === 'new' && callCount === 0) {
      insights.push({
        icon: <Phone className="w-4 h-4 text-primary" />,
        text: 'New lead - consider making an introductory call',
        priority: 'high',
      });
    }

    if (daysSinceLastActivity !== null && daysSinceLastActivity > 7) {
      insights.push({
        icon: <Clock className="w-4 h-4 text-warning" />,
        text: `No activity in ${daysSinceLastActivity} days - follow up recommended`,
        priority: 'medium',
      });
    }

    if (lead.value && lead.value > 5000 && lead.status !== 'won') {
      insights.push({
        icon: <Sparkles className="w-4 h-4 text-accent" />,
        text: 'High-value lead - prioritize engagement',
        priority: 'high',
      });
    }

    if (lead.status === 'proposal' || lead.status === 'negotiation') {
      insights.push({
        icon: <CheckCircle2 className="w-4 h-4 text-success" />,
        text: 'Close to conversion - maintain momentum',
        priority: 'high',
      });
    }

    if (tasks.filter((t) => t.status === 'pending').length > 3) {
      insights.push({
        icon: <ListTodo className="w-4 h-4 text-destructive" />,
        text: 'Multiple pending tasks - prioritize completion',
        priority: 'medium',
      });
    }

    return insights.length > 0
      ? insights
      : [
          {
            icon: <Sparkles className="w-4 h-4 text-muted-foreground" />,
            text: 'Keep engaging to generate more insights',
            priority: 'low',
          },
        ];
  };

  const insights = generateInsights();

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90%] bg-background rounded-t-3xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 bg-gradient-to-br from-primary to-accent">
              <AvatarFallback className="bg-transparent text-primary-foreground text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground">{lead.name}</h2>
              <p className="text-sm text-muted-foreground">{lead.company || 'No company'}</p>
              <div className="flex items-center gap-2 mt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 focus:outline-none">
                      <Badge variant="outline" className={`${statusColors[lead.status]} cursor-pointer hover:opacity-80 transition-opacity`}>
                        {statusLabels[lead.status]}
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Badge>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-40">
                    {allStatuses.map((status) => (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => {
                          if (onStatusChange && status !== lead.status) {
                            onStatusChange(lead.id, status);
                          }
                        }}
                        className={`flex items-center gap-2 ${status === lead.status ? 'bg-secondary' : ''}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusColors[status].split(' ')[0]}`} />
                        {statusLabels[status]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {lead.value && (
                  <span className="text-sm font-medium text-success">${lead.value.toLocaleString()}</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-3 mt-4">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onCall(lead.phone, lead.name, lead.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-success/20 text-success"
            >
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium">Call</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (lead.email) {
                  window.location.href = `mailto:${lead.email}`;
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/20 text-primary"
            >
              <Mail className="w-4 h-4" />
              <span className="text-sm font-medium">Email</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onWhatsApp(lead.phone, lead.name, lead.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366]/20 text-[#25D366]"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">WhatsApp</span>
            </motion.button>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs defaultValue="activity" className="w-full h-full flex flex-col">
            <TabsList className="w-full justify-start px-6 pt-4 bg-transparent">
              <TabsTrigger value="activity" className="text-sm">
                Activity
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-sm">
                Tasks ({tasks.length})
              </TabsTrigger>
              <TabsTrigger value="insights" className="text-sm">
                AI Insights
              </TabsTrigger>
            </TabsList>

            {/* Activity Tab */}
            <TabsContent value="activity" className="px-6 pb-6 flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Activity History</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAddingActivity(!isAddingActivity)}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Activity
                </Button>
              </div>

              <AnimatePresence>
                {isAddingActivity && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 p-4 glass-card space-y-3"
                  >
                    <div className="flex gap-2 flex-wrap">
                      {(['call', 'meeting', 'note'] as ActivityType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setActivityForm({ ...activityForm, type })}
                          className={`px-3 py-1.5 rounded-full text-xs capitalize transition-all ${
                            activityForm.type === type
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <Input
                      placeholder="Activity title"
                      value={activityForm.title}
                      onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                    />
                    <Textarea
                      placeholder="Description (optional)"
                      value={activityForm.description}
                      onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleCreateActivity} size="sm" disabled={!activityForm.title}>
                        Add
                      </Button>
                      <Button onClick={() => setIsAddingActivity(false)} size="sm" variant="ghost">
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                {activities.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No activities yet</p>
                ) : (
                  activities.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-3 glass-card"
                    >
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                          {activityIcons[activity.type as ActivityType] || <Activity className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatDateTimeSafe(activity.created_at)}
                          </p>
                        </div>
                      </div>

                      {activity.type === 'call' && recordingsByActivityId.get(activity.id) && (
                        <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
                          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-1">
                            <Volume2 className="w-3 h-3" />
                            Call Recording
                            </div>
                            <Badge variant="secondary" className="text-[10px]">
                              {recordingSourceLabel(recordingsByActivityId.get(activity.id)!)}
                            </Badge>
                          </div>
                          <CallRecordingPlayer recording={recordingsByActivityId.get(activity.id)!} compact />
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="px-6 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Tasks</h3>
                <Button size="sm" variant="outline" onClick={() => setIsAddingTask(!isAddingTask)} className="gap-1">
                  <Plus className="w-3 h-3" />
                  Add Task
                </Button>
              </div>

              <AnimatePresence>
                {isAddingTask && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 p-4 glass-card space-y-3"
                  >
                    <Input
                      placeholder="Task title"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    />
                    <Textarea
                      placeholder="Description (optional)"
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                      rows={2}
                    />
                    <Input
                      type="datetime-local"
                      value={taskForm.due_date}
                      onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleCreateTask} size="sm" disabled={!taskForm.title}>
                        Create Task
                      </Button>
                      <Button onClick={() => setIsAddingTask(false)} size="sm" variant="ghost">
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No tasks yet</p>
                ) : (
                  tasks.map((task, index) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-3 glass-card"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                          )}
                          {task.due_date && (
                            <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Due: {formatDateTimeSafe(task.due_date)}
                            </p>
                          )}
                        </div>
                        <Badge className={`text-[10px] ${taskStatusColors[task.status]}`}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* AI Insights Tab */}
            <TabsContent value="insights" className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-accent" />
                <h3 className="font-semibold text-foreground">AI Insights</h3>
              </div>

              <div className="space-y-3">
                {insights.map((insight, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-4 glass-card border-l-4 ${
                      insight.priority === 'high'
                        ? 'border-l-primary'
                        : insight.priority === 'medium'
                        ? 'border-l-warning'
                        : 'border-l-muted'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{insight.icon}</div>
                      <p className="text-sm text-foreground">{insight.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 p-4 glass-card bg-gradient-to-br from-primary/10 to-accent/10">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">Lead Score</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(
                          100,
                          (lead.status === 'won' ? 100 : lead.status === 'negotiation' ? 80 : lead.status === 'proposal' ? 60 : lead.status === 'qualified' ? 40 : 20) +
                            (activities.length * 2)
                        )}%`,
                      }}
                      transition={{ duration: 1 }}
                      className="h-full bg-gradient-to-r from-primary to-accent"
                    />
                  </div>
                  <span className="text-sm font-bold text-accent">
                    {Math.min(
                      100,
                      (lead.status === 'won' ? 100 : lead.status === 'negotiation' ? 80 : lead.status === 'proposal' ? 60 : lead.status === 'qualified' ? 40 : 20) +
                        (activities.length * 2)
                    )}
                  </span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LeadDetailSheet;
