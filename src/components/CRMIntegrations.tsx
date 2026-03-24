import { useState } from 'react';
import { RefreshCw, Check, Link2, Unlink, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { mockIntegrations } from '@/data/mockData';
import { CRMIntegration } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';

const CRMIntegrations = () => {
  const [integrations, setIntegrations] = useState(mockIntegrations);
  const [syncing, setSyncing] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSync = async (id: string) => {
    setSyncing(id);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIntegrations((prev) =>
      prev.map((int) =>
        int.id === id ? { ...int, lastSync: new Date() } : int
      )
    );
    setSyncing(null);
    toast({
      title: 'Sync Complete',
      description: 'Contacts have been updated.',
    });
  };

  const handleConnect = (integration: CRMIntegration) => {
    setIntegrations((prev) =>
      prev.map((int) =>
        int.id === integration.id
          ? { ...int, connected: !int.connected, contactsCount: int.connected ? undefined : 234 }
          : int
      )
    );
    toast({
      title: integration.connected ? 'Disconnected' : 'Connected',
      description: `${integration.name} has been ${integration.connected ? 'disconnected' : 'connected'}.`,
    });
  };

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never';
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="pb-20">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">CRM Integrations</h1>
        <p className="text-sm text-muted-foreground">Connect your sales tools</p>
      </div>

      {/* Connected CRMs */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Connected</h2>
        <div className="space-y-3">
          {integrations
            .filter((int) => int.connected)
            .map((integration, index) => (
              <div
                key={integration.id}
                className="glass-card p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center p-2">
                    <img
                      src={integration.logo}
                      alt={integration.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                      }}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{integration.name}</h3>
                      <span className="w-2 h-2 rounded-full bg-success" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {integration.contactsCount?.toLocaleString()} contacts
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Last sync: {formatLastSync(integration.lastSync)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSync(integration.id)}
                      disabled={syncing === integration.id}
                      className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"
                    >
                      <RefreshCw
                        className={`w-4 h-4 text-primary ${
                          syncing === integration.id ? 'animate-spin' : ''
                        }`}
                      />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleConnect(integration)}
                      className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center"
                    >
                      <Unlink className="w-4 h-4 text-destructive" />
                    </motion.button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Available CRMs */}
      <div className="px-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Available to Connect</h2>
        <div className="space-y-3">
          {integrations
            .filter((int) => !int.connected)
            .map((integration, index) => (
              <div
                key={integration.id}
                onClick={() => handleConnect(integration)}
                className="glass-card p-4 cursor-pointer active:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center p-2">
                    <img
                      src={integration.logo}
                      alt={integration.name}
                      className="w-full h-full object-contain opacity-50"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                      }}
                    />
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground">Tap to connect</p>
                  </div>

                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default CRMIntegrations;
