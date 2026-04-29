import { startTransition, useState } from 'react';
import { useCallLogs } from '@/hooks/useCallLogs';
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
import { track } from '@/services/analytics';

const Index = () => {
  const [activeTab, setActiveTab] = useState('leads');
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [manualImportTrigger, setManualImportTrigger] = useState(0);
  const { toast } = useToast();

  const handleTabChange = (tab: string) => {
    startTransition(() => {
      setActiveTab(tab);
    });
    track({ event: 'tab_viewed', props: { tab } });
  };
  const { createCallLog } = useCallLogs({ fetchLogs: false, realtime: false });

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

  const handleCall = (phone: string, name?: string, leadId?: string) => {
    const formattedPhone = formatPhone(phone);

    createCallLog.mutate({
      phone: formattedPhone,
      contact_name: name || null,
      duration: 0,
      type: 'outgoing',
      lead_id: leadId || null,
      notes: null,
      outcome: null,
    });

    toast({
      title: 'Opening Phone',
      description: `Calling ${name || formattedPhone}`,
    });

    track({ event: 'call_initiated' });
    window.location.href = `tel:${formattedPhone}`;
  };

  const handleWhatsApp = (phone: string, name?: string) => {
    const formattedPhone = formatPhone(phone);
    const waNumber = formattedPhone.replace('+', '');

    toast({
      title: 'Opening WhatsApp',
      description: `Chatting with ${name || formattedPhone}`,
    });

    track({ event: 'whatsapp_opened' });
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
        onClick={() => { setIsAgentOpen(true); track({ event: 'aria_opened' }); }}
        isActive={isAgentOpen}
      />
      <AIAgentSheet
        isOpen={isAgentOpen}
        onClose={() => { setIsAgentOpen(false); track({ event: 'aria_closed' }); }}
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
