import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useLeads } from '@/hooks/useLeads';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useToast } from '@/hooks/use-toast';
import {
  ensureMediaAudioPermission,
  importSystemRecording,
  ImportedSystemRecording,
  performSystemRecordingScan,
} from '@/lib/callRecordingImport';
import { Download, Loader2 } from 'lucide-react';
import { isNativeApp } from '@/services/nativePlugins';

const CallRecordingToggle = () => {
  const [isScanningSystemRecordings, setIsScanningSystemRecordings] = useState(false);
  const [importingContentUri, setImportingContentUri] = useState<string | null>(null);
  const [systemRecordings, setSystemRecordings] = useState<ImportedSystemRecording[]>([]);
  const [manualLeadByRecording, setManualLeadByRecording] = useState<Record<string, string>>({});

  const { user } = useAuth();
  const { leads } = useLeads();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();
  const { toast } = useToast();

  const handleImport = async (recording: ImportedSystemRecording) => {
    if (!user) return;

    setImportingContentUri(recording.contentUri);
    try {
      const imported = await importSystemRecording({
        recording,
        userId: user.id,
        uploadRecording,
        createRecording: createRecording.mutateAsync,
        analyzeRecording: analyzeRecording.mutate,
        manualLeadId: manualLeadByRecording[recording.contentUri] || null,
      });

      if (!imported) {
        toast({
          title: 'Already imported',
          description: 'This recording was already imported earlier.',
        });
      } else {
        toast({
          title: 'Recording imported',
          description: recording.confidence === 'low'
            ? 'Imported successfully with manual lead assignment.'
            : 'Imported and linked successfully.',
        });
      }

      setSystemRecordings((prev) => prev.filter((item) => item.contentUri !== recording.contentUri));
    } catch (error) {
      console.error('System recording import failed:', error);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unable to import device recording.',
        variant: 'destructive',
      });
    } finally {
      setImportingContentUri(null);
    }
  };

  const scanSystemRecordings = async () => {
    if (!user) return;

    setIsScanningSystemRecordings(true);
    try {
      const granted = await ensureMediaAudioPermission();
      if (!granted) {
        throw new Error('Media audio permission denied');
      }

      const shortlisted = await performSystemRecordingScan({ userId: user.id, leads });
      const lowConfidenceOnly = shortlisted.filter((recording) => recording.confidence === 'low');
      setSystemRecordings(lowConfidenceOnly);

      let importedCount = 0;
      for (const recording of shortlisted.filter((item) => item.confidence !== 'low')) {
        try {
          const imported = await importSystemRecording({
            recording,
            userId: user.id,
            uploadRecording,
            createRecording: createRecording.mutateAsync,
            analyzeRecording: analyzeRecording.mutate,
          });
          if (imported) importedCount += 1;
        } catch (error) {
          console.error('Auto-import failed for', recording.fileName, error);
        }
      }

      if (shortlisted.length === 0) {
        toast({
          title: 'No device recordings found',
          description: 'No call-like recordings were detected in shared storage. Your OEM recorder may store files privately.',
        });
        return;
      }

      toast({
        title: 'Scan complete',
        description: `Auto-imported ${importedCount}. ${lowConfidenceOnly.length} need manual lead assignment.`,
      });
    } catch (error) {
      console.error('System recording scan failed:', error);
      toast({
        title: 'Scan failed',
        description: error instanceof Error ? error.message : 'Unable to scan device recordings.',
        variant: 'destructive',
      });
    } finally {
      setIsScanningSystemRecordings(false);
    }
  };

  if (!isNativeApp()) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Device recording import is available only in the Android app.
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Auto Import and Device Scan</p>
          <p className="text-xs text-muted-foreground">
            Auto-import runs on app start. Use Scan Device to pull remaining call recordings and assign unmatched ones manually.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={scanSystemRecordings}
          disabled={isScanningSystemRecordings}
        >
          {isScanningSystemRecordings ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Scan Device
            </>
          )}
        </Button>
      </div>

      {systemRecordings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No manual import candidates right now. Tap Scan Device to refresh built-in call recordings.
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-auto">
          {systemRecordings.map((recording) => {
            const manualLeadId = manualLeadByRecording[recording.contentUri] || '';
            const isImporting = importingContentUri === recording.contentUri;

            return (
              <div key={recording.contentUri} className="border rounded-md p-3 bg-background/70 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{recording.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {Math.round((recording.size || 0) / 1024)} KB • {recording.duration || 0}s • {new Date(recording.lastModified).toLocaleString()}
                    </p>
                    {recording.detectedPhone && (
                      <p className="text-[11px] text-muted-foreground">Detected phone: {recording.detectedPhone}</p>
                    )}
                  </div>
                  <Badge variant="secondary">Manual lead required</Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    No confident call-log match. Select a lead before import.
                  </p>
                  <Select
                    value={manualLeadId}
                    onValueChange={(value) => {
                      setManualLeadByRecording((prev) => ({ ...prev, [recording.contentUri]: value }));
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Choose lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.name} • {lead.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => handleImport(recording)}
                    disabled={isImporting || !manualLeadId}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      'Import'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CallRecordingToggle;