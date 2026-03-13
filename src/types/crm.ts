export interface Contact {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  avatar?: string;
  status: 'lead' | 'prospect' | 'customer' | 'churned';
  lastContact?: Date;
  notes?: string;
  source?: string;
}

export interface CallLog {
  id: string;
  contactId: string;
  contactName: string;
  phone: string;
  duration: number;
  type: 'incoming' | 'outgoing' | 'missed';
  timestamp: Date;
  notes?: string;
}

export interface CRMIntegration {
  id: string;
  name: string;
  logo: string;
  connected: boolean;
  contactsCount?: number;
  lastSync?: Date;
}
