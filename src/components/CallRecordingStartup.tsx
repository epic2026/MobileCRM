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

interface CallRecordingStartupProps {
  /** Increment this number to trigger a manual import (independent of startup auto-import). */
  manualImportTrigger?: number;
}

const CallRecordingStartup = ({ manualImportTrigger = 0 }: CallRecordingStartupProps) => {
  const hasRunRef = useRef(false);
  const { user } = useAuth();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();
  const { toast } = useToast();

  useEffect(() => {
    if (!isNativeApp() || !user || hasRunRef.current) return;

    let timeoutId: number | undefined;
    let frameId: number | undefined;
    let cancelled = false;

    const runStartupImport = async () => {
      hasRunRef.current = true;

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
  }, [user?.id]);

  // Manual import trigger (called by AI agent or user action)
  useEffect(() => {
    if (manualImportTrigger === 0 || !isNativeApp() || !user) return;

    let cancelled = false;

    const runManualImport = async () => {
      try {
        const granted = await ensureMediaAudioPermission();
        if (cancelled) return;

        if (!granted) {
          toast({
            title: 'Permission Required',
            description: 'Please grant media audio permission to import recordings.',
            variant: 'destructive',
          });
          return;
        }

        const scanned = await performSystemRecordingScan({ userId: user.id });
        const candidates = scanned.filter((r) => r.confidence !== 'low');

        let importedCount = 0;
        for (const recording of candidates) {
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
          } catch (err) {
            console.error('Manual import failed for', recording.fileName, err);
          }
        }

        toast({
          title: 'Import Complete',
          description: `${importedCount} recording${importedCount === 1 ? '' : 's'} imported.`,
        });
      } catch (err) {
        console.error('Manual recording import failed:', err);
        toast({
          title: 'Import Failed',
          description: err instanceof Error ? err.message : 'Could not import recordings.',
          variant: 'destructive',
        });
      }
    };

    void runManualImport();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualImportTrigger]);

  return null;
};

export default CallRecordingStartup;