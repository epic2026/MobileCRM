import { useState } from 'react';
import { Search, Filter, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Contact } from '@/types/crm';
import { mockContacts } from '@/data/mockData';
import ContactCard from './ContactCard';
import { Input } from '@/components/ui/input';

interface ContactsListProps {
  onCall: (contact: Contact) => void;
  onContactClick: (contact: Contact) => void;
}

const ContactsList = ({ onCall, onContactClick }: ContactsListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredContacts = mockContacts.filter((contact) => {
    const matchesSearch =
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery);

    const matchesStatus = !statusFilter || contact.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statuses = ['all', 'lead', 'prospect', 'customer'];

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-xl z-10 px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
            <p className="text-sm text-muted-foreground">{mockContacts.length} total contacts</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center glow-primary"
          >
            <Plus className="w-5 h-5 text-primary-foreground" />
          </motion.button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-border h-11"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status === 'all' ? null : status)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
                (status === 'all' && !statusFilter) || statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts List */}
      <div className="px-4">
        {filteredContacts.map((contact, index) => (
          <motion.div
            key={contact.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <ContactCard contact={contact} onCall={onCall} onClick={onContactClick} />
          </motion.div>
        ))}

        {filteredContacts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No contacts found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactsList;
