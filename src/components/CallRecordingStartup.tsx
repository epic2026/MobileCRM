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

    let timeoutId: number | undefined;
    let frameId: number | undefined;
    let cancelled = false;

    const runStartupImport = async () => {
      try {
        const granted = await ensureMediaAudioPermission();
        if (cancelled) return;

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
          if (cancelled) return;

          try {
            const imported = await importSystemRecording({
              recording,
              userId: user.id,
              uploadRecording,
              createRecording: createRecording.mutateAsync,
              analyzeRecording: analyzeRecording.mutate,
            });
            if (imported) importedCount += 1;
            await new Promise((resolve) => {
              timeoutId = window.setTimeout(resolve, 0);
            });
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

    frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (!cancelled) {
          void runStartupImport();
        }
      }, 400);
    });

    return () => {
      cancelled = true;
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [analyzeRecording.mutate, createRecording.mutateAsync, toast, uploadRecording, user]);

  return null;
};

export default CallRecordingStartup;