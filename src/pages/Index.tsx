import { startTransition, useState } from 'react';
import { useCallLogs } from '@/hooks/useCallLogs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import MobileLayout from '@/components/MobileLayout';
import BottomNav from '@/components/BottomNav';
import LeadsPanel from '@/components/LeadsPanel';
import TasksPanel from '@/components/TasksPanel';
import CallActivity from '@/components/CallActivity';
import CRMIntegrations from '@/components/CRMIntegrations';
import SettingsPanel from '@/components/SettingsPanel';
import CallRecordingStartup from '@/components/CallRecordingStartup';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import AIAgentButton from '@/components/AIAgent/AIAgentButton';
import AIAgentSheet from '@/components/AIAgent/AIAgentSheet';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [activeTab, setActiveTab] = useState('leads');
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [manualImportTrigger, setManualImportTrigger] = useState(0);
  const { toast } = useToast();

  const handleTabChange = (tab: string) => {
    startTransition(() => {
      setActiveTab(tab);
    });
  };
  const { createCallLog } = useCallLogs({ fetchLogs: false, realtime: false });
  const { user } = useAuth();

  // Format phone for India
  const formatPhone = (phone: string): string => {
    let formattedPhone = phone.replace(/\s+/g, '').replace(/-/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('91') && formattedPhone.length > 10) {
        formattedPhone = '+' + formattedPhone;
      } else if (formattedPhone.length === 10) {
        formattedPhone = '+91' + formattedPhone;
      }
    }
    return formattedPhone;
  };

  // Create activity in database
  const createActivity = async (leadId: string, type: string, title: string, description?: string) => {
    if (!user) return;
    
    try {
      await supabase.from('lead_activities').insert({
        lead_id: leadId,
        type,
        title,
        description: description || null,
        metadata: {},
        user_id: user.id,
      });
    } catch (error) {
      console.error('Failed to create activity:', error);
    }
  };

  const handleCall = (phone: string, name?: string, leadId?: string) => {
    const formattedPhone = formatPhone(phone);
    
    // Log the call to database
    createCallLog.mutate({
      phone: formattedPhone,
      contact_name: name || null,
      duration: 0,
      type: 'outgoing',
      lead_id: leadId || null,
      notes: null,
      outcome: null,
    });

    // Create activity if leadId provided
    if (leadId) {
      createActivity(leadId, 'call', `Outgoing call to ${name || formattedPhone}`, `Called ${formattedPhone}`);
    }

    toast({
      title: 'Opening Phone',
      description: `Calling ${name || formattedPhone}`,
    });
    
    // Open native phone dialer with tel: protocol
    window.location.href = `tel:${formattedPhone}`;
  };

  const handleWhatsApp = (phone: string, name?: string, leadId?: string) => {
    const formattedPhone = formatPhone(phone);
    // Remove + for WhatsApp URL
    const waNumber = formattedPhone.replace('+', '');
    
    // Create activity if leadId provided
    if (leadId) {
      createActivity(leadId, 'message', `WhatsApp chat with ${name || formattedPhone}`, `Opened WhatsApp chat with ${waNumber}`);
    }

    toast({
      title: 'Opening WhatsApp',
      description: `Chatting with ${name || formattedPhone}`,
    });
    
    // Open WhatsApp with phone number
    window.location.href = `https://wa.me/${waNumber}`;
  };

  return (
    <MobileLayout>
      <CallRecordingStartup manualImportTrigger={manualImportTrigger} />
      <AppErrorBoundary key={activeTab} fallbackTitle="Screen failed to load">
        {activeTab === 'leads' && <LeadsPanel onCall={handleCall} onWhatsApp={handleWhatsApp} />}
        {activeTab === 'tasks' && <TasksPanel />}
        {activeTab === 'activity' && <CallActivity onCall={(phone, name) => handleCall(phone, name)} />}
        {activeTab === 'integrations' && <CRMIntegrations />}
        {activeTab === 'settings' && <SettingsPanel />}
      </AppErrorBoundary>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      <AIAgentButton
        onClick={() => setIsAgentOpen(true)}
        isActive={isAgentOpen}
      />
      <AIAgentSheet
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        onCall={handleCall}
        onWhatsApp={handleWhatsApp}
        onImportRecordings={() => {
          setIsAgentOpen(false);
          setManualImportTrigger((n) => n + 1);
        }}
      />
    </MobileLayout>
  );
};

export default Index;
