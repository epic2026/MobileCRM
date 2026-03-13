import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link2, RefreshCw, Settings, Check, AlertCircle } from 'lucide-react';

interface CRMProvider {
  id: string;
  name: string;
  logo: string;
  description: string;
  connected: boolean;
  lastSync?: Date;
  leadsCount?: number;
}

const crmProviders: CRMProvider[] = [
  {
    id: 'salesforce',
    name: 'Salesforce',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
    description: 'Connect to Salesforce CRM to import and sync leads',
    connected: false,
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    logo: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
    description: 'Sync leads from HubSpot CRM',
    connected: false,
  },
  {
    id: 'zoho',
    name: 'Zoho CRM',
    logo: 'https://www.zohowebstatic.com/sites/zweb/images/zoho_general_pages/zoho-logo-512.png',
    description: 'Import leads from Zoho CRM',
    connected: false,
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    logo: 'https://www.pipedrive.com/favicon.ico',
    description: 'Connect Pipedrive to sync your sales pipeline',
    connected: false,
  },
  {
    id: 'freshsales',
    name: 'Freshsales',
    logo: 'https://www.freshworks.com/favicon.ico',
    description: 'Import leads from Freshsales CRM',
    connected: false,
  },
];

const CRMConnect = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [providers, setProviders] = useState<CRMProvider[]>(crmProviders);
  const [selectedProvider, setSelectedProvider] = useState<CRMProvider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setSyncing] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!selectedProvider || !apiKey) return;

    setIsConnecting(true);
    
    // Simulate connection (in production, this would validate with actual CRM API)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setProviders((prev) =>
      prev.map((p) =>
        p.id === selectedProvider.id
          ? { ...p, connected: true, lastSync: new Date(), leadsCount: Math.floor(Math.random() * 500) + 50 }
          : p
      )
    );

    toast({
      title: 'CRM Connected',
      description: `Successfully connected to ${selectedProvider.name}`,
    });

    setIsConnecting(false);
    setSelectedProvider(null);
    setApiKey('');
    setApiUrl('');
  };

  const handleDisconnect = (providerId: string) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId
          ? { ...p, connected: false, lastSync: undefined, leadsCount: undefined }
          : p
      )
    );

    toast({
      title: 'CRM Disconnected',
      description: 'The CRM integration has been removed.',
    });
  };

  const handleSync = async (provider: CRMProvider) => {
    setSyncing(provider.id);

    // Simulate sync
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // In production, this would fetch leads from the CRM API and insert them
    const mockLeadsCount = Math.floor(Math.random() * 20) + 5;

    setProviders((prev) =>
      prev.map((p) =>
        p.id === provider.id
          ? { ...p, lastSync: new Date(), leadsCount: (p.leadsCount || 0) + mockLeadsCount }
          : p
      )
    );

    queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });

    toast({
      title: 'Sync Complete',
      description: `Imported ${mockLeadsCount} new leads from ${provider.name}`,
    });

    setSyncing(null);
  };

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never';
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const connectedProviders = providers.filter((p) => p.connected);
  const availableProviders = providers.filter((p) => !p.connected);

  return (
    <div className="space-y-6">
      {/* Connected CRMs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Connected CRMs
          </CardTitle>
          <CardDescription>
            Manage your connected CRM integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectedProviders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No CRMs connected yet</p>
              <p className="text-sm">Connect a CRM below to start importing leads</p>
            </div>
          ) : (
            <div className="space-y-4">
              {connectedProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center gap-4 p-4 border rounded-lg bg-card"
                >
                  <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center p-2">
                    <img
                      src={provider.logo}
                      alt={provider.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{provider.name}</h3>
                      <Badge className="bg-green-500/20 text-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {provider.leadsCount?.toLocaleString()} leads • Last sync: {formatLastSync(provider.lastSync)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(provider)}
                      disabled={isSyncing === provider.id}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing === provider.id ? 'animate-spin' : ''}`} />
                      {isSyncing === provider.id ? 'Syncing...' : 'Sync Now'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(provider.id)}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available CRMs */}
      <Card>
        <CardHeader>
          <CardTitle>Available Integrations</CardTitle>
          <CardDescription>
            Connect additional CRM platforms to import leads
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableProviders.map((provider) => (
              <div
                key={provider.id}
                className="p-4 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedProvider(provider)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center p-1.5">
                    <img
                      src={provider.logo}
                      alt={provider.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
                      }}
                    />
                  </div>
                  <h3 className="font-semibold">{provider.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{provider.description}</p>
                <Button variant="outline" size="sm" className="mt-3 w-full">
                  <Settings className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Connection Dialog */}
      <Dialog open={!!selectedProvider} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Connect to {selectedProvider?.name}
            </DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect and import leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You can find this in your {selectedProvider?.name} settings
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiUrl">API URL (Optional)</Label>
              <Input
                id="apiUrl"
                type="url"
                placeholder="https://api.example.com"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleConnect}
              disabled={!apiKey || isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CRMConnect;
