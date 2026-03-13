import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { mockCallLogs } from '@/data/mockData';
import { CallLog } from '@/types/crm';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface RecentCallsProps {
  onCall: (phone: string, name: string) => void;
}

const formatDuration = (seconds: number) => {
  if (seconds === 0) return 'Missed';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (date: Date) => {
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CallIcon = ({ type }: { type: CallLog['type'] }) => {
  switch (type) {
    case 'incoming':
      return <PhoneIncoming className="w-4 h-4 text-success" />;
    case 'outgoing':
      return <PhoneOutgoing className="w-4 h-4 text-primary" />;
    case 'missed':
      return <PhoneMissed className="w-4 h-4 text-destructive" />;
  }
};

const RecentCalls = ({ onCall }: RecentCallsProps) => {
  return (
    <div className="pb-20">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Recent Calls</h1>
        <p className="text-sm text-muted-foreground">{mockCallLogs.length} calls today</p>
      </div>

      <div className="px-4 space-y-3">
        {mockCallLogs.map((call, index) => {
          const initials = call.contactName
            .split(' ')
            .map((n) => n[0])
            .join('');

          return (
            <motion.div
              key={call.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onCall(call.phone, call.contactName)}
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
                    <CallIcon type={call.type} />
                    <h3 className="font-semibold text-foreground truncate">{call.contactName}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{call.phone}</p>
                </div>

                <div className="text-right">
                  <p className={`text-sm font-medium ${call.type === 'missed' ? 'text-destructive' : 'text-foreground'}`}>
                    {formatDuration(call.duration)}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    {formatTime(call.timestamp)}
                  </p>
                </div>
              </div>

              {call.notes && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground italic">"{call.notes}"</p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentCalls;
