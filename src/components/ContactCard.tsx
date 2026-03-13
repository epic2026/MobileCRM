import { Phone, MessageSquare, MoreVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import { Contact } from '@/types/crm';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface ContactCardProps {
  contact: Contact;
  onCall: (contact: Contact) => void;
  onClick: (contact: Contact) => void;
}

const statusColors = {
  lead: 'bg-warning/20 text-warning',
  prospect: 'bg-primary/20 text-primary',
  customer: 'bg-success/20 text-success',
  churned: 'bg-destructive/20 text-destructive',
};

const ContactCard = ({ contact, onCall, onClick }: ContactCardProps) => {
  const initials = contact.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(contact)}
      className="glass-card p-4 mb-3 cursor-pointer active:bg-secondary/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <Avatar className="w-12 h-12 bg-gradient-to-br from-primary to-accent">
          <AvatarFallback className="bg-transparent text-primary-foreground font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{contact.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[contact.status]}`}>
              {contact.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{contact.company}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{contact.phone}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCall(contact);
            }}
            className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center transition-all hover:bg-success hover:text-success-foreground active:scale-95"
          >
            <Phone className="w-4 h-4 text-success" />
          </button>
        </div>
      </div>

      {contact.source && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">
            Synced from <span className="text-primary">{contact.source}</span>
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default ContactCard;
