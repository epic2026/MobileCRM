import { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, TrendingUp, Phone, Calendar, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallLogs, CallLogEntry, CallType } from '@/hooks/useCallLogs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CallActivityProps {
  onCall: (phone: string, name: string) => void;
}

const formatDuration = (seconds: number) => {
  if (seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) {
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (hours < 48) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const CallIcon = ({ type }: { type: CallType }) => {
  switch (type) {
    case 'incoming':
      return <PhoneIncoming className="w-4 h-4 text-success" />;
    case 'outgoing':
      return <PhoneOutgoing className="w-4 h-4 text-primary" />;
    case 'missed':
      return <PhoneMissed className="w-4 h-4 text-destructive" />;
  }
};

const CallActivity = ({ onCall }: CallActivityProps) => {
  const { callLogs, isLoading } = useCallLogs();
  const [typeFilter, setTypeFilter] = useState<CallType | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');

  const filteredLogs = callLogs.filter((log) => {
    const matchesType = typeFilter === 'all' || log.type === typeFilter;

    let matchesDate = true;
    if (dateFilter !== 'all') {
      const logDate = new Date(log.created_at);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));

      if (dateFilter === 'today') matchesDate = diffDays === 0;
      else if (dateFilter === 'week') matchesDate = diffDays < 7;
      else if (dateFilter === 'month') matchesDate = diffDays < 30;
    }

    return matchesType && matchesDate;
  });

  // Calculate stats
  const todayLogs = callLogs.filter((log) => {
    const logDate = new Date(log.created_at);
    const today = new Date();
    return logDate.toDateString() === today.toDateString();
  });

  const stats = {
    totalCalls: todayLogs.length,
    outgoing: todayLogs.filter((l) => l.type === 'outgoing').length,
    incoming: todayLogs.filter((l) => l.type === 'incoming').length,
    missed: todayLogs.filter((l) => l.type === 'missed').length,
    totalDuration: todayLogs.reduce((sum, l) => sum + l.duration, 0),
    avgDuration: todayLogs.length > 0
      ? Math.round(todayLogs.reduce((sum, l) => sum + l.duration, 0) / todayLogs.filter(l => l.duration > 0).length) || 0
      : 0,
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-xl z-10 px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Call Activity</h1>
            <p className="text-sm text-muted-foreground">{callLogs.length} total calls logged</p>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
        </div>

        {/* Today's Stats */}
        <div className="glass-card p-4 mb-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Today's Activity</h2>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-1">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground">{stats.totalCalls}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-success/20 flex items-center justify-center mb-1">
                <PhoneOutgoing className="w-5 h-5 text-success" />
              </div>
              <p className="text-lg font-bold text-success">{stats.outgoing}</p>
              <p className="text-[10px] text-muted-foreground">Outgoing</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-accent/20 flex items-center justify-center mb-1">
                <PhoneIncoming className="w-5 h-5 text-accent" />
              </div>
              <p className="text-lg font-bold text-accent">{stats.incoming}</p>
              <p className="text-[10px] text-muted-foreground">Incoming</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-destructive/20 flex items-center justify-center mb-1">
                <PhoneMissed className="w-5 h-5 text-destructive" />
              </div>
              <p className="text-lg font-bold text-destructive">{stats.missed}</p>
              <p className="text-[10px] text-muted-foreground">Missed</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{formatTotalDuration(stats.totalDuration)}</p>
                <p className="text-[10px] text-muted-foreground">Total talk time</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{stats.avgDuration > 0 ? formatDuration(stats.avgDuration) : '0:00'}</p>
                <p className="text-[10px] text-muted-foreground">Avg duration</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CallType | 'all')}>
            <SelectTrigger className="flex-1 h-9 bg-secondary">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="outgoing">Outgoing</SelectItem>
              <SelectItem value="incoming">Incoming</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
            <SelectTrigger className="flex-1 h-9 bg-secondary">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Call Logs */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading call logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <Phone className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No calls recorded yet</p>
            <p className="text-sm text-muted-foreground/70">Make a call to see activity here</p>
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const initials = log.contact_name
              ? log.contact_name.split(' ').map((n) => n[0]).join('').toUpperCase()
              : log.phone.slice(-2);

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => onCall(log.phone, log.contact_name || log.phone)}
                className="glass-card p-4 cursor-pointer active:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12 bg-gradient-to-br from-primary/50 to-accent/50">
                    <AvatarFallback className="bg-transparent text-foreground font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CallIcon type={log.type} />
                      <h3 className="font-semibold text-foreground truncate">
                        {log.contact_name || log.phone}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{log.phone}</p>
                    <p className="text-xs text-muted-foreground/70">{formatDate(log.created_at)}</p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-medium ${
                        log.type === 'missed' ? 'text-destructive' : 'text-foreground'
                      }`}
                    >
                      {formatDuration(log.duration)}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] mt-1 ${
                        log.type === 'outgoing'
                          ? 'border-success/30 text-success'
                          : log.type === 'incoming'
                          ? 'border-primary/30 text-primary'
                          : 'border-destructive/30 text-destructive'
                      }`}
                    >
                      {log.type}
                    </Badge>
                  </div>
                </div>

                {(log.notes || log.outcome) && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                    {log.outcome && (
                      <p className="text-xs text-accent">
                        Outcome: {log.outcome}
                      </p>
                    )}
                    {log.notes && (
                      <p className="text-xs text-muted-foreground italic">"{log.notes}"</p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CallActivity;
