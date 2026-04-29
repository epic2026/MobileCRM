import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useLeads } from '@/hooks/useLeads';
import { useToast } from '@/hooks/use-toast';
import {
  ensureMediaAudioPermission,
  ensureCallLogPermission,
  importSystemRecording,
  performSystemRecordingScan,
  syncMissedCalls,
} from '@/lib/callRecordingImport';
import { isNativeApp } from '@/services/nativePlugins';

interface CallRecordingStartupProps {
  /** Increment this number to trigger a manual import (independent of startup auto-import). */
  manualImportTrigger?: number;
  enableAutoImport?: boolean;
}

const CallRecordingStartup = ({ manualImportTrigger = 0, enableAutoImport = true }: CallRecordingStartupProps) => {
  const hasRunRef = useRef(false);
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();
  const { leads } = useLeads();
  const { toast } = useToast();

  useEffect(() => {
    if (!enableAutoImport || !isNativeApp() || !user || !currentTenant || hasRunRef.current) return;

    let timeoutId: number | undefined;
    let frameId: number | undefined;
    let cancelled = false;

    const runStartupImport = async () => {
      hasRunRef.current = true;

      try {
        // Request both permissions upfront — call log permission is needed for missed call
        // sync and accurate inbound/outbound direction detection.
        await ensureCallLogPermission();

        const granted = await ensureMediaAudioPermission();
        if (cancelled) return;

        if (!granted) {
          toast({
            title: 'Auto-import complete',
            description: '0 recordings imported (media permission not granted).',
          });
          return;
        }

        // Run recording import + missed call sync in parallel
        const [scanned, missedCount] = await Promise.all([
          performSystemRecordingScan({ userId: user.id, tenantId: currentTenant.id, leads }),
          syncMissedCalls({ userId: user.id, tenantId: currentTenant.id, leads }),
        ]);

        if (cancelled) return;

        const autoImportCandidates = scanned.filter((r) => r.confidence !== 'low');

        let importedCount = 0;
        for (const recording of autoImportCandidates) {
          if (cancelled) return;
          try {
            const imported = await importSystemRecording({
              recording,
              userId: user.id,
              tenantId: currentTenant.id,
              uploadRecording,
              createRecording: createRecording.mutateAsync,
              analyzeRecording: analyzeRecording.mutate,
            });
            if (imported) importedCount += 1;
            await new Promise((resolve) => { timeoutId = window.setTimeout(resolve, 0); });
          } catch (error) {
            console.error('Startup auto-import failed for', recording.fileName, error);
          }
        }

        const parts: string[] = [];
        if (importedCount > 0) parts.push(`${importedCount} recording${importedCount === 1 ? '' : 's'} imported`);
        if (missedCount > 0) parts.push(`${missedCount} missed call${missedCount === 1 ? '' : 's'} synced`);

        toast({
          title: 'Sync complete',
          description: parts.length > 0 ? parts.join(', ') + '.' : 'Nothing new to import.',
        });
      } catch (error) {
        console.error('Startup recording sync failed:', error);
        toast({
          title: 'Auto-import failed',
          description: error instanceof Error ? error.message : 'Unable to scan device recordings.',
          variant: 'destructive',
        });
      }
    };

    frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (!cancelled) void runStartupImport();
      }, 400);
    });

    return () => {
      cancelled = true;
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [enableAutoImport, currentTenant?.id, user?.id]);

  // Manual import trigger (called by AI agent or user action)
  useEffect(() => {
    if (manualImportTrigger === 0 || !isNativeApp() || !user || !currentTenant) return;

    let cancelled = false;

    const runManualImport = async () => {
      try {
        await ensureCallLogPermission();
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

        const [scanned, missedCount] = await Promise.all([
          performSystemRecordingScan({ userId: user.id, tenantId: currentTenant.id, leads }),
          syncMissedCalls({ userId: user.id, tenantId: currentTenant.id, leads }),
        ]);

        if (cancelled) return;

        const candidates = scanned.filter((r) => r.confidence !== 'low');
        let importedCount = 0;

        for (const recording of candidates) {
          if (cancelled) return;
          try {
            const imported = await importSystemRecording({
              recording,
              userId: user.id,
              tenantId: currentTenant.id,
              uploadRecording,
              createRecording: createRecording.mutateAsync,
              analyzeRecording: analyzeRecording.mutate,
            });
            if (imported) importedCount += 1;
          } catch (err) {
            console.error('Manual import failed for', recording.fileName, err);
          }
        }

        const parts: string[] = [];
        if (importedCount > 0) parts.push(`${importedCount} recording${importedCount === 1 ? '' : 's'} imported`);
        if (missedCount > 0) parts.push(`${missedCount} missed call${missedCount === 1 ? '' : 's'} synced`);

        toast({
          title: 'Import Complete',
          description: parts.length > 0 ? parts.join(', ') + '.' : 'Nothing new to import.',
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

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualImportTrigger, currentTenant?.id, user?.id]);

  return null;
};

export default CallRecordingStartup;
