import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, AlertCircle, Calendar, User, Plus, X, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeads } from '@/hooks/useLeads';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface Task {
  id: string;
  lead_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  lead?: {
    name: string;
    company: string | null;
  };
}

const statusConfig: Record<TaskStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="w-4 h-4" />, color: 'bg-warning/20 text-warning border-warning/30', label: 'Pending' },
  in_progress: { icon: <AlertCircle className="w-4 h-4" />, color: 'bg-primary/20 text-primary border-primary/30', label: 'In Progress' },
  completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-success/20 text-success border-success/30', label: 'Completed' },
  cancelled: { icon: <X className="w-4 h-4" />, color: 'bg-muted text-muted-foreground border-muted', label: 'Cancelled' },
};

const TaskCard = ({ task, onStatusChange, onEdit }: { task: Task; onStatusChange: (id: string, status: TaskStatus) => void; onEdit: (task: Task) => void }) => {
  const config = statusConfig[task.status];
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';

  return (
    <div className={`glass-card p-4 ${isOverdue ? 'border-destructive/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate">{task.title}</h3>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
          {task.lead && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span>{task.lead.name}</span>
              {task.lead.company && <span className="text-muted-foreground/70">• {task.lead.company}</span>}
            </div>
          )}
          {task.due_date && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(task.due_date), 'MMM d, yyyy h:mm a')}</span>
              {isOverdue && <span className="font-medium">(Overdue)</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Select value={task.status} onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}>
            <SelectTrigger className={`w-auto h-7 text-xs ${config.color} border`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="h-8 w-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const TasksPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { leads } = useLeads();
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({
    lead_id: '',
    title: '',
    message: '',
    due_date: '',
    status: 'pending' as TaskStatus,
  });

  const resetTaskForm = () => {
    setEditingTask(null);
    setTaskForm({ lead_id: '', title: '', message: '', due_date: '', status: 'pending' });
  };

  const openTaskSheet = (task?: Task | null) => {
    if (task) {
      setEditingTask(task);
      setTaskForm({
        lead_id: task.lead_id,
        title: task.title,
        message: task.description ?? '',
        due_date: task.due_date ?? '',
        status: task.status,
      });
    } else {
      resetTaskForm();
    }
    setIsTaskSheetOpen(true);
  };

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['all_tasks', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('lead_tasks')
        .select(`
          *,
          lead:leads(name, company)
        `)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as Task[];
    },
    enabled: !!user,
  });

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const { error } = await supabase
      .from('lead_tasks')
      .update({ status: newStatus })
      .eq('id', taskId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update task', variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: 'Task status updated' });
      refetch();
    }
  };

  const saveTask = async () => {
    const title = taskForm.title.trim();
    if (!title) {
      toast({ title: 'Missing title', description: 'Please enter a task title.', variant: 'destructive' });
      return;
    }
    if (!taskForm.lead_id) {
      toast({ title: 'Missing lead', description: 'Please select a lead for this task.', variant: 'destructive' });
      return;
    }

    const dueDateIso = taskForm.due_date ? new Date(taskForm.due_date).toISOString() : null;

    if (editingTask) {
      const { error } = await supabase
        .from('lead_tasks')
        .update({
          lead_id: taskForm.lead_id,
          title,
          description: taskForm.message.trim() || null,
          due_date: dueDateIso,
          status: taskForm.status,
        })
        .eq('id', editingTask.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update task.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Task updated', description: 'Task details have been saved.' });
    } else {
      const { error } = await supabase.from('lead_tasks').insert({
        lead_id: taskForm.lead_id,
        title,
        description: taskForm.message.trim() || null,
        due_date: dueDateIso,
        status: taskForm.status,
        user_id: user?.id ?? null,
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to create task.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Task created', description: 'Task saved successfully.' });
    }

    resetTaskForm();
    setIsTaskSheetOpen(false);
    refetch();
  };

  const now = new Date();
  const statusCounts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  const filteredTasks: Task[] = [];
  const overdueTasks: Task[] = [];
  const upcomingTasks: Task[] = [];
  const completedTasks: Task[] = [];
  const otherTasks: Task[] = [];

  for (const task of tasks) {
    statusCounts[task.status] += 1;

    if (filter !== 'all' && task.status !== filter) {
      continue;
    }

    filteredTasks.push(task);

    if (task.status === 'completed') {
      completedTasks.push(task);
      continue;
    }

    if (task.status === 'cancelled') {
      continue;
    }

    if (!task.due_date) {
      otherTasks.push(task);
      continue;
    }

    if (new Date(task.due_date) < now) {
      overdueTasks.push(task);
      continue;
    }

    upcomingTasks.push(task);
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 px-4 pt-6 pb-4 border-b border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground">{tasks.length} total tasks</p>
          </div>
          <Sheet open={isTaskSheetOpen} onOpenChange={setIsTaskSheetOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => openTaskSheet()}>
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85%] bg-background rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>{editingTask ? 'Edit Task' : 'Create Task'}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6 px-1">
                <Select
                  value={taskForm.lead_id || 'none'}
                  onValueChange={(value) => setTaskForm((prev) => ({ ...prev, lead_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select lead</SelectItem>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Task title"
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                />
                <Textarea
                  placeholder="Task description"
                  rows={3}
                  value={taskForm.message}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, message: event.target.value }))}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="datetime-local"
                    value={taskForm.due_date}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, due_date: event.target.value }))}
                  />
                  <Select
                    value={taskForm.status}
                    onValueChange={(value) => setTaskForm((prev) => ({ ...prev, status: value as TaskStatus }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void saveTask()}>
                    {editingTask ? 'Save Changes' : 'Create Task'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    resetTaskForm();
                    setIsTaskSheetOpen(false);
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-warning">{statusCounts.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-primary">{statusCounts.in_progress}</p>
            <p className="text-[10px] text-muted-foreground">In Progress</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-destructive">{overdueTasks.length}</p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-success">{statusCounts.completed}</p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </div>
        </div>

        {/* Filter */}
        <Select value={filter} onValueChange={(v) => setFilter(v as TaskStatus | 'all')}>
          <SelectTrigger className="bg-secondary">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tasks</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task Lists */}
      <div className="px-4 space-y-6">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading tasks...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No tasks found</p>
            <p className="text-sm text-muted-foreground/70">Tasks will appear here when created from leads</p>
          </div>
        ) : (
          <>
            {overdueTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Overdue ({overdueTasks.length})
                </h2>
                <div className="space-y-2">
                  {overdueTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onStatusChange={updateTaskStatus} onEdit={openTaskSheet} />
                  ))}
                </div>
              </div>
            )}

            {upcomingTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Upcoming ({upcomingTasks.length})
                </h2>
                <div className="space-y-2">
                  {upcomingTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onStatusChange={updateTaskStatus} onEdit={openTaskSheet} />
                  ))}
                </div>
              </div>
            )}

            {otherTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">No Due Date ({otherTasks.length})</h2>
                <div className="space-y-2">
                  {otherTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onStatusChange={updateTaskStatus} onEdit={openTaskSheet} />
                  ))}
                </div>
              </div>
            )}

            {completedTasks.length > 0 && filter === 'all' && (
              <div>
                <h2 className="text-sm font-semibold text-success mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed ({completedTasks.length})
                </h2>
                <div className="space-y-2">
                {completedTasks.slice(0, 5).map((task) => (
                  <TaskCard key={task.id} task={task} onStatusChange={updateTaskStatus} onEdit={openTaskSheet} />
                  ))}
                  {completedTasks.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{completedTasks.length - 5} more completed tasks
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TasksPanel;
