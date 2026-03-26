import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useToast } from '@/hooks/use-toast';
import {
  ensureMediaAudioPermission,
  importSystemRecording,
  performSystemRecordingScan,
} from '@/lib/callRecordingImport';
import { isNativeApp } from '@/services/nativePlugins';

const CallRecordingStartup = () => {
  const hasRunRef = useRef(false);
  const { user } = useAuth();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();
  const { toast } = useToast();

  useEffect(() => {
    if (!isNativeApp() || !user || hasRunRef.current) return;
    hasRunRef.current = true;

    const runStartupImport = async () => {
      try {
        const granted = await ensureMediaAudioPermission();
        if (!granted) {
          toast({
            title: 'Auto-import complete',
            description: '0 recordings imported on app start (media permission not granted).',
          });
          return;
        }

        const scanned = await performSystemRecordingScan({ userId: user.id });
        const autoImportCandidates = scanned.filter((recording) => recording.confidence !== 'low');

        let importedCount = 0;
        for (const recording of autoImportCandidates) {
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
            console.error('Startup auto-import failed for', recording.fileName, error);
          }
        }

        toast({
          title: 'Auto-import complete',
          description: `${importedCount} recording${importedCount === 1 ? '' : 's'} imported on app start.`,
        });
      } catch (error) {
        console.error('Startup recording sync failed:', error);
        toast({
          title: 'Auto-import failed',
          description: error instanceof Error ? error.message : 'Unable to scan device recordings on app start.',
          variant: 'destructive',
        });
      }
    };

    void runStartupImport();
  }, [analyzeRecording.mutate, createRecording.mutateAsync, toast, uploadRecording, user]);

  return null;
};

export default CallRecordingStartup;