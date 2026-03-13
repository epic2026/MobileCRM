import { Phone, Mail, MessageSquare, Building, Calendar, Edit, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Contact } from '@/types/crm';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
} from '@/components/ui/sheet';

interface ContactDetailSheetProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onCall: (contact: Contact) => void;
}

const statusColors = {
  lead: 'bg-warning/20 text-warning border-warning/30',
  prospect: 'bg-primary/20 text-primary border-primary/30',
  customer: 'bg-success/20 text-success border-success/30',
  churned: 'bg-destructive/20 text-destructive border-destructive/30',
};

const ContactDetailSheet = ({ contact, isOpen, onClose, onCall }: ContactDetailSheetProps) => {
  if (!contact) return null;

  const initials = contact.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const formatDate = (date?: Date) => {
    if (!date) return 'Never';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85%] bg-background rounded-t-3xl">
        <SheetHeader className="pb-4">
          <div className="flex flex-col items-center pt-4">
            <Avatar className="w-20 h-20 bg-gradient-to-br from-primary to-accent mb-4">
              <AvatarFallback className="bg-transparent text-primary-foreground text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold text-foreground">{contact.name}</h2>
            <p className="text-muted-foreground">{contact.company}</p>
            <span className={`mt-2 px-3 py-1 rounded-full text-sm border ${statusColors[contact.status]}`}>
              {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
            </span>
          </div>
        </SheetHeader>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => onCall(contact)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-success/20"
          >
            <Phone className="w-6 h-6 text-success" />
            <span className="text-xs text-success">Call</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-primary/20"
          >
            <Mail className="w-6 h-6 text-primary" />
            <span className="text-xs text-primary">Email</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-accent/20"
          >
            <MessageSquare className="w-6 h-6 text-accent" />
            <span className="text-xs text-accent">Message</span>
          </motion.button>
        </div>

        {/* Contact Details */}
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground">{contact.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground">{contact.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground">{contact.company}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground">Last contact: {formatDate(contact.lastContact)}</span>
              </div>
            </div>
          </div>

          {contact.source && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Source</h3>
              <p className="text-foreground">
                Synced from <span className="text-primary font-medium">{contact.source}</span>
              </p>
            </div>
          )}

          {contact.notes && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Notes</h3>
              <p className="text-foreground">{contact.notes}</p>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="absolute bottom-6 left-4 right-4 flex gap-3">
          <Button variant="secondary" className="flex-1 gap-2">
            <Edit className="w-4 h-4" />
            Edit
          </Button>
          <Button variant="destructive" size="icon">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactDetailSheet;
