import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock3,
  Edit2,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTaskModule } from '@/hooks/useTaskModule';
import { useTaskStore } from '@/stores/useTaskStore';
import type { CRMTask, CreateTaskPayload } from '@/types/tasks';
import { useLeads } from '@/hooks/useLeads';

const statusConfig = {
  pending: { color: 'bg-amber-500/20 text-amber-600 border-amber-500/40', label: 'Pending' },
  completed: { color: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40', label: 'Done' },
};

const sectionLabel = {
  today: 'Today',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  completed: 'Completed',
};

const sectionTone = {
  today: 'text-foreground',
  upcoming: 'text-amber-600',
  overdue: 'text-rose-600',
  completed: 'text-emerald-600',
};

const TaskCard = ({
  task,
  onComplete,
  onSnooze,
  onOpen,
}: {
  task: CRMTask;
  onComplete: (taskId: string) => void;
  onSnooze: (taskId: string, option: '10m' | '1h' | 'tomorrow') => void;
  onOpen: (taskId: string) => void;
}) => {
  const config = statusConfig[task.status];
  const isOverdue = task.status !== 'completed' && new Date(task.due_at) < new Date();
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [showActions, setShowActions] = useState(false);

  const handleTouchStart = (x: number) => {
    setTouchStartX(x);
  };

  const handleTouchEnd = (x: number) => {
    if (touchStartX === null) return;
    const delta = touchStartX - x;
    if (delta > 45) setShowActions(true);
    if (delta < -45) setShowActions(false);
    setTouchStartX(null);
  };

  return (
    <div className={`relative rounded-2xl border bg-card p-3 ${isOverdue ? 'border-rose-400/50' : 'border-border'}`}>
      <div
        className="cursor-pointer"
        onClick={() => onOpen(task.id)}
        onTouchStart={(event) => handleTouchStart(event.changedTouches[0].clientX)}
        onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
            {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {task.lead?.name && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                  <User className="h-3 w-3" />
                  {task.lead.name}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-rose-600' : ''}`}>
                <Calendar className="h-3 w-3" />
                {format(new Date(task.due_at), 'MMM d, h:mm a')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" />
                {task.priority}
              </span>
            </div>
          </div>
          <Badge className={config.color}>{config.label}</Badge>
        </div>
      </div>

      <div className={`mt-3 grid grid-cols-2 gap-2 ${showActions ? '' : 'hidden'}`}>
        <Button size="sm" className="h-8" onClick={() => onComplete(task.id)}>
          Mark Complete
        </Button>
        <Select onValueChange={(value: '10m' | '1h' | 'tomorrow') => onSnooze(task.id, value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Snooze" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10m">10 min</SelectItem>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="tomorrow">Tomorrow 9 AM</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!showActions && <p className="mt-2 text-[10px] text-muted-foreground/70">Swipe left for quick actions</p>}
    </div>
  );
};

const TaskForm = ({
  title,
  setTitle,
  description,
  setDescription,
  leadId,
  setLeadId,
  dueAt,
  setDueAt,
  priority,
  setPriority,
  reminderOption,
  setReminderOption,
  customReminder,
  setCustomReminder,
  leads,
}: {
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  leadId: string;
  setLeadId: (value: string) => void;
  dueAt: string;
  setDueAt: (value: string) => void;
  priority: 'low' | 'medium' | 'high';
  setPriority: (value: 'low' | 'medium' | 'high') => void;
  reminderOption: '10m' | '1h' | 'custom';
  setReminderOption: (value: '10m' | '1h' | 'custom') => void;
  customReminder: string;
  setCustomReminder: (value: string) => void;
  leads: Array<{ id: string; name: string }>;
}) => (
  <div className="space-y-3">
    <div>
      <p className="mb-1 text-xs font-semibold text-foreground">Title</p>
      <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" />
    </div>
    <div>
      <p className="mb-1 text-xs font-semibold text-foreground">Description</p>
      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Details" rows={2} />
    </div>
    <div>
      <p className="mb-1 text-xs font-semibold text-foreground">Lead (optional)</p>
      <Select value={leadId} onValueChange={setLeadId}>
        <SelectTrigger>
          <SelectValue placeholder="Select lead" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No lead</SelectItem>
          {leads.map((lead) => (
            <SelectItem key={lead.id} value={lead.id}>
              {lead.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="mb-1 text-xs font-semibold text-foreground">Due date/time</p>
        <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-foreground">Priority</p>
        <Select value={priority} onValueChange={(value: 'low' | 'medium' | 'high') => setPriority(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="mb-1 text-xs font-semibold text-foreground">Reminder</p>
        <Select value={reminderOption} onValueChange={(value: '10m' | '1h' | 'custom') => setReminderOption(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10m">10 min before</SelectItem>
            <SelectItem value="1h">1 hour before</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {reminderOption === 'custom' && (
        <div>
          <p className="mb-1 text-xs font-semibold text-foreground">Custom reminder</p>
          <Input type="datetime-local" value={customReminder} onChange={(event) => setCustomReminder(event.target.value)} />
        </div>
      )}
    </div>
  </div>
);

const TasksPanel = () => {
  const { toast } = useToast();
  const { leads } = useLeads();
  const { tasks, sections, meta, isLoading, createTask, updateTask, completeTask, snoozeTask } = useTaskModule();
  const {
    filters,
    selectedTaskId,
    isCreateOpen,
    setSearch,
    setPriority,
    setStatus,
    setBucket,
    setAssigned,
    selectTask,
    setCreateOpen,
  } = useTaskStore((state) => ({
    filters: state.filters,
    selectedTaskId: state.selectedTaskId,
    isCreateOpen: state.isCreateOpen,
    setSearch: state.setSearch,
    setPriority: state.setPriority,
    setStatus: state.setStatus,
    setBucket: state.setBucket,
    setAssigned: state.setAssigned,
    selectTask: state.selectTask,
    setCreateOpen: state.setCreateOpen,
  }));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState('none');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriorityLocal] = useState<'low' | 'medium' | 'high'>('medium');
  const [reminderOption, setReminderOption] = useState<'10m' | '1h' | 'custom'>('1h');
  const [customReminder, setCustomReminder] = useState('');
  const [note, setNote] = useState('');

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const dueSoon = [...sections.overdue, ...sections.today]
      .filter((task) => task.status !== 'completed')
      .slice(0, 3);

    for (const task of dueSoon) {
      const key = `task_notified_${task.id}`;
      if (sessionStorage.getItem(key)) {
        continue;
      }

      sessionStorage.setItem(key, '1');
      toast({
        title: new Date(task.due_at).getTime() < Date.now() ? 'Overdue task alert' : 'Task reminder',
        description: task.title,
      });

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('CRM Task Reminder', { body: task.title });
      }
    }
  }, [sections.overdue, sections.today, toast]);

  const toReminderAt = (dueAtValue: string) => {
    const due = new Date(dueAtValue);
    if (Number.isNaN(due.getTime())) return null;

    if (reminderOption === '10m') {
      return new Date(due.getTime() - 10 * 60 * 1000).toISOString();
    }
    if (reminderOption === '1h') {
      return new Date(due.getTime() - 60 * 60 * 1000).toISOString();
    }
    if (customReminder) {
      return new Date(customReminder).toISOString();
    }
    return null;
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLeadId('none');
    setDueAt('');
    setPriorityLocal('medium');
    setReminderOption('1h');
    setCustomReminder('');
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: 'Missing title', description: 'Task title is required.', variant: 'destructive' });
      return;
    }
    if (!dueAt) {
      toast({ title: 'Missing due date', description: 'Due date/time is required.', variant: 'destructive' });
      return;
    }
    if (new Date(dueAt).getTime() < Date.now()) {
      toast({ title: 'Invalid due date', description: 'Please choose a future date/time.', variant: 'destructive' });
      return;
    }

    const payload: CreateTaskPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      lead_id: leadId === 'none' ? null : leadId,
      due_at: new Date(dueAt).toISOString(),
      priority,
      reminder_at: toReminderAt(dueAt),
    };

    await createTask.mutateAsync(payload);
    setCreateOpen(false);
    resetForm();
  };

  const handleCompleteAndNote = async (taskId: string) => {
    await completeTask.mutateAsync({ task_id: taskId, note: note.trim() || undefined });
    setNote('');
  };

  const renderSection = (key: 'today' | 'upcoming' | 'overdue' | 'completed', items: CRMTask[]) => {
    if (filters.bucket !== 'all' && filters.bucket !== key) {
      return null;
    }

    return (
      <div key={key} className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={`text-sm font-semibold ${sectionTone[key]}`}>{sectionLabel[key]}</p>
          <p className="text-xs text-muted-foreground">{items.length}</p>
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No tasks</div>
        ) : (
          <div className="space-y-2">
            {items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={(taskId) => void completeTask.mutateAsync({ task_id: taskId })}
                onSnooze={(taskId, option) => void snoozeTask.mutateAsync({ task_id: taskId, option })}
                onOpen={selectTask}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background px-4 pb-4 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground">{meta?.total ?? tasks.length} tracked tasks</p>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks"
            className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Priority</p>
            <Select value={filters.priority} onValueChange={(value: 'all' | 'low' | 'medium' | 'high') => setPriority(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Status</p>
            <Select value={filters.status} onValueChange={(value: 'all' | 'pending' | 'completed') => setStatus(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {(['all', 'today', 'upcoming', 'overdue', 'completed'] as const).map((bucket) => (
            <button
              key={bucket}
              onClick={() => setBucket(bucket)}
              className={`h-8 rounded-full text-[11px] font-medium ${
                filters.bucket === bucket ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'
              }`}
            >
              {bucket === 'all' ? 'All' : sectionLabel[bucket]}
            </button>
          ))}
        </div>

        <div className="mt-2">
          <Select value={filters.assigned} onValueChange={(value: 'me' | 'team' | 'all') => setAssigned(value)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">My tasks</SelectItem>
              <SelectItem value="team">Team tasks</SelectItem>
              <SelectItem value="all">All visible tasks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((skeleton) => (
              <div key={skeleton} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/35" />
            ))}
          </div>
        ) : (
          <>
            {renderSection('today', sections.today)}
            {renderSection('upcoming', sections.upcoming)}
            {renderSection('overdue', sections.overdue)}
            {renderSection('completed', sections.completed)}
          </>
        )}
      </div>

      <button
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl"
        aria-label="Create task"
      >
        <Plus className="h-6 w-6" />
      </button>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={() => setCreateOpen(false)}>
          <div className="max-h-[90vh] w-full rounded-t-3xl bg-background p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
            <h3 className="mb-3 text-lg font-semibold text-foreground">Create Task</h3>
            <TaskForm
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              leadId={leadId}
              setLeadId={setLeadId}
              dueAt={dueAt}
              setDueAt={setDueAt}
              priority={priority}
              setPriority={setPriorityLocal}
              reminderOption={reminderOption}
              setReminderOption={setReminderOption}
              customReminder={customReminder}
              setCustomReminder={setCustomReminder}
              leads={leads.map((lead) => ({ id: lead.id, name: lead.name }))}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={createTask.isPending}>
                {createTask.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={() => selectTask(null)}>
          <div className="max-h-[92vh] w-full rounded-t-3xl bg-background" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" />
            <div className="max-h-[76vh] overflow-y-auto p-4 pb-28">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-foreground">{selectedTask.title}</h3>
                <Button size="icon" variant="ghost" onClick={() => selectTask(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Badge className={statusConfig[selectedTask.status].color}>{statusConfig[selectedTask.status].label}</Badge>
                <Badge variant="outline">{selectedTask.priority}</Badge>
                <Badge variant="outline">Due {format(new Date(selectedTask.due_at), 'MMM d, h:mm a')}</Badge>
              </div>

              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm text-foreground">{selectedTask.description || 'No description added.'}</p>
                <p className="text-xs text-muted-foreground">Linked lead: {selectedTask.lead?.name || 'None'}</p>
                <p className="text-xs text-muted-foreground">
                  Assigned to: {selectedTask.assignee?.full_name || selectedTask.assignee?.email || selectedTask.assigned_to}
                </p>
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Quick Snooze</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" onClick={() => void snoozeTask.mutateAsync({ task_id: selectedTask.id, option: '10m' })}>
                    10m
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void snoozeTask.mutateAsync({ task_id: selectedTask.id, option: '1h' })}>
                    1h
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void snoozeTask.mutateAsync({ task_id: selectedTask.id, option: 'tomorrow' })}>
                    Tomorrow
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Edit Task</p>
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <Input
                  defaultValue={selectedTask.title}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== selectedTask.title) {
                      void updateTask.mutateAsync({ task_id: selectedTask.id, title: value });
                    }
                  }}
                />
                <Textarea
                  defaultValue={selectedTask.description || ''}
                  rows={2}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value !== (selectedTask.description || '')) {
                      void updateTask.mutateAsync({ task_id: selectedTask.id, description: value || null });
                    }
                  }}
                />
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Activity Timeline</p>
                <div className="space-y-2">
                  {[...selectedTask.events, ...selectedTask.comments.map((comment) => ({
                    id: `comment-${comment.id}`,
                    event_type: 'comment_added',
                    created_at: comment.created_at,
                    metadata: { body: comment.body },
                  }))]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 12)
                    .map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/60 p-2">
                        <p className="text-xs font-medium text-foreground">{item.event_type.replace('_', ' ')}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {typeof item.metadata?.body === 'string' ? item.metadata.body : JSON.stringify(item.metadata)}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground/80">{format(new Date(item.created_at), 'MMM d, h:mm a')}</p>
                      </div>
                    ))}
                </div>
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Complete & Add Note</p>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add completion notes"
                />
              </div>
            </div>

            <div className="fixed bottom-16 left-0 right-0 z-50 mx-auto w-full max-w-md border-t border-border bg-background p-3">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => selectTask(null)}>
                  Close
                </Button>
                <Button onClick={() => void handleCompleteAndNote(selectedTask.id)} disabled={completeTask.isPending}>
                  {completeTask.isPending ? 'Saving...' : 'Mark Complete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPanel;
