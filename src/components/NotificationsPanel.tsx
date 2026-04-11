import { Bell, CalendarClock, TriangleAlert } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useTaskModule } from '@/hooks/useTaskModule';

const NotificationsPanel = () => {
  const { sections, isLoading } = useTaskModule();

  const reminders = [...sections.overdue, ...sections.today]
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    .slice(0, 30);

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">Task reminders and overdue alerts</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-xl border border-border bg-muted/35" />
          ))}
        </div>
      ) : reminders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No reminders right now.
        </div>
      ) : (
        <div className="space-y-2">
          {reminders.map((task) => {
            const isOverdue = new Date(task.due_at).getTime() < Date.now();
            return (
              <div key={task.id} className={`rounded-xl border p-3 ${isOverdue ? 'border-rose-400/40 bg-rose-500/5' : 'border-amber-400/40 bg-amber-500/5'}`}>
                <div className="flex items-start gap-2">
                  {isOverdue ? <TriangleAlert className="mt-0.5 h-4 w-4 text-rose-500" /> : <Bell className="mt-0.5 h-4 w-4 text-amber-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.lead?.name ? `Lead: ${task.lead.name}` : 'No linked lead'}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {isOverdue
                        ? `${formatDistanceToNowStrict(new Date(task.due_at), { addSuffix: true })} overdue`
                        : `Due ${formatDistanceToNowStrict(new Date(task.due_at), { addSuffix: true })}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotificationsPanel;
