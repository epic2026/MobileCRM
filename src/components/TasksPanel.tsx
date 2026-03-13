import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, AlertCircle, Calendar, User, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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

const TasksPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

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

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  const overdueTasks = filteredTasks.filter(task => {
    if (!task.due_date || task.status === 'completed' || task.status === 'cancelled') return false;
    return new Date(task.due_date) < new Date();
  });

  const upcomingTasks = filteredTasks.filter(task => {
    if (!task.due_date || task.status === 'completed' || task.status === 'cancelled') return false;
    return new Date(task.due_date) >= new Date();
  });

  const completedTasks = filteredTasks.filter(task => task.status === 'completed');
  const otherTasks = filteredTasks.filter(task => !task.due_date && task.status !== 'completed' && task.status !== 'cancelled');

  const TaskCard = ({ task, index }: { task: Task; index: number }) => {
    const config = statusConfig[task.status];
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
        className={`glass-card p-4 ${isOverdue ? 'border-destructive/50' : ''}`}
      >
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
          <Select value={task.status} onValueChange={(v) => updateTaskStatus(task.id, v as TaskStatus)}>
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
        </div>
      </motion.div>
    );
  };

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-xl z-10 px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground">{tasks.length} total tasks</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-warning">{tasks.filter(t => t.status === 'pending').length}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-primary">{tasks.filter(t => t.status === 'in_progress').length}</p>
            <p className="text-[10px] text-muted-foreground">In Progress</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-destructive">{overdueTasks.length}</p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </div>
          <div className="glass-card p-3 text-center">
            <p className="text-lg font-bold text-success">{completedTasks.length}</p>
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
                  {overdueTasks.map((task, index) => (
                    <TaskCard key={task.id} task={task} index={index} />
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
                  {upcomingTasks.map((task, index) => (
                    <TaskCard key={task.id} task={task} index={index} />
                  ))}
                </div>
              </div>
            )}

            {otherTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">No Due Date ({otherTasks.length})</h2>
                <div className="space-y-2">
                  {otherTasks.map((task, index) => (
                    <TaskCard key={task.id} task={task} index={index} />
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
                  {completedTasks.slice(0, 5).map((task, index) => (
                    <TaskCard key={task.id} task={task} index={index} />
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
