import { useState, useEffect, useCallback, useRef } from 'react';
import { CallRecordingPlugin, isNativeApp } from '@/services/nativePlugins';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CallEvent {
  phoneNumber: string;
  callType: string;
  state?: 'ringing' | 'active';
  recorded?: boolean;
  duration?: number;
  filePath?: string;
  timestamp?: number;
  audioSource?: number;
  audioSourceName?: string;
}

export interface DebugTraceEntry {
  timestamp: number;
  source: string;
  message: string;
}

export const useCallRecordingService = () => {
  const [isServiceRunning, setIsServiceRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [permissionState, setPermissionState] = useState<{
    microphone: 'granted' | 'denied';
    phoneState: 'granted' | 'denied';
    callLog: 'granted' | 'denied';
    mediaAudio?: 'granted' | 'denied';
    allGranted: boolean;
  } | null>(null);
  const [lastCallEvent, setLastCallEvent] = useState<CallEvent | null>(null);
  const [debugTrace, setDebugTrace] = useState<DebugTraceEntry[]>([]);
  const [speakerAssistEnabled, setSpeakerAssistEnabled] = useState(false);
  const listenerRefs = useRef<Array<{ remove: () => void }>>([]);
  const isSyncingPendingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();

  const refreshDebugTrace = useCallback(async () => {
    if (!isNativeApp()) {
      return;
    }

    try {
      const result = await CallRecordingPlugin.getDebugTrace();
      setDebugTrace(result.entries);
    } catch (error) {
      console.error('Error loading debug trace:', error);
    }
  }, []);

  const clearDebugTrace = useCallback(async () => {
    if (!isNativeApp()) {
      return;
    }

    try {
      await CallRecordingPlugin.clearDebugTrace();
      const result = await CallRecordingPlugin.getDebugTrace();
      setDebugTrace(result.entries);
    } catch (error) {
      console.error('Error clearing debug trace:', error);
    }
  }, []);

  const refreshSpeakerAssistStatus = useCallback(async () => {
    if (!isNativeApp()) return false;

    try {
      const result = await CallRecordingPlugin.getSpeakerAssistEnabled();
      setSpeakerAssistEnabled(result.enabled);
      return result.enabled;
    } catch (error) {
      console.error('Error loading speaker assist status:', error);
      return false;
    }
  }, []);

  const updateSpeakerAssist = useCallback(async (enabled: boolean) => {
    if (!isNativeApp()) return false;

    try {
      const result = await CallRecordingPlugin.setSpeakerAssistEnabled({ enabled });
      setSpeakerAssistEnabled(result.enabled);
      toast({
        title: 'Speaker Assist Updated',
        description: result.enabled
          ? 'Speakerphone will turn on during active call recording.'
          : 'Speakerphone assist is disabled.',
      });
      return result.enabled;
    } catch (error) {
      console.error('Error updating speaker assist:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Speaker Assist setting',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Check permissions on mount
  useEffect(() => {
    if (isNativeApp()) {
      checkPermissions();
      refreshDebugTrace();
      refreshSpeakerAssistStatus();
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    if (!isNativeApp()) {
      return false;
    }

    try {
      const result = await CallRecordingPlugin.checkRecordingPermissions();
      setPermissionState(result);
      setHasPermissions(result.allGranted);
      return result.allGranted;
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    if (!isNativeApp()) {
      toast({
        title: 'Not Available',
        description: 'Call recording requires the native Android app',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const result = await CallRecordingPlugin.requestRecordingPermissions();
      setPermissionState(result);
      setHasPermissions(result.allGranted);

      if (!result.allGranted) {
        toast({
          title: 'Permissions Required',
          description: 'Please grant all permissions for call recording to work',
          variant: 'destructive',
        });
      }

      return result.allGranted;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to request permissions',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Find lead by phone number
  const findLeadByPhone = useCallback(async (phone: string): Promise<string | null> => {
    if (!user) return null;

    // Normalize phone number for matching
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    const variants = [
      normalizedPhone,
      normalizedPhone.replace(/^\+91/, ''),
      `+91${normalizedPhone.replace(/^\+/, '')}`,
    ];

    try {
      const { data } = await supabase
        .from('leads')
        .select('id, phone')
        .or(variants.map(v => `phone.ilike.%${v.slice(-10)}`).join(','))
        .limit(1);

      return data?.[0]?.id || null;
    } catch (error) {
      console.error('Error finding lead:', error);
      return null;
    }
  }, [user]);

  // Handle recording saved event
  const handleRecordingSaved = useCallback(async (event: CallEvent) => {
    if (!user || !event.filePath) return;

    setIsProcessing(true);

    try {
      // Get the file data from native plugin
      const fileData = await CallRecordingPlugin.getRecordingFile({
        filePath: event.filePath,
      });

      if (!fileData.exists || !fileData.base64) {
        throw new Error('Recording file not found');
      }

      // Convert base64 to blob
      const byteCharacters = atob(fileData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: fileData.mimeType });

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `call_${event.callType}_${timestamp}.m4a`;

      // Upload to storage
      const storagePath = await uploadRecording(blob, filename);

      if (!storagePath) {
        throw new Error('Failed to upload recording');
      }

      // Find matching lead
      const leadId = await findLeadByPhone(event.phoneNumber);

      // Create call log entry
      const { data: callLog } = await supabase
        .from('call_logs')
        .insert({
          phone: event.phoneNumber,
          duration: event.duration || 0,
          type: event.callType === 'incoming' ? 'incoming' : 'outgoing',
          lead_id: leadId,
          user_id: user.id,
          contact_name: null,
          notes: 'Auto-recorded call',
          outcome: null,
        })
        .select()
        .single();

      // Create recording entry
      const recordingData = await createRecording.mutateAsync({
        file_path: storagePath,
        file_url: null,
        duration: event.duration || 0,
        lead_id: leadId,
        call_log_id: callLog?.id || null,
        user_id: user.id,
        ai_summary: null,
        ai_next_actions: null,
        transcription: null,
      });

      // Create activity for lead
      if (leadId) {
        await supabase.from('lead_activities').insert({
          lead_id: leadId,
          type: 'call',
          title: `${event.callType === 'incoming' ? 'Incoming' : 'Outgoing'} call recorded`,
          description: `Call duration: ${Math.floor((event.duration || 0) / 60)}:${((event.duration || 0) % 60).toString().padStart(2, '0')}`,
          metadata: {
            recording_id: recordingData.id,
            duration: event.duration,
            call_type: event.callType,
          },
          user_id: user.id,
        });
      }

      // Trigger AI analysis
      if (recordingData) {
        analyzeRecording.mutate({
          recordingId: recordingData.id,
          callDetails: {
            duration: event.duration || 0,
            callType: event.callType,
          },
        });
      }

      // Delete local file after successful upload
      await CallRecordingPlugin.deleteRecordingFile({ filePath: event.filePath });

      toast({
        title: 'Call Recorded',
        description: `${event.callType === 'incoming' ? 'Incoming' : 'Outgoing'} call saved (${Math.floor((event.duration || 0) / 60)}:${((event.duration || 0) % 60).toString().padStart(2, '0')})`,
      });

    } catch (error) {
      console.error('Error processing recording:', error);
      toast({
        title: 'Recording Error',
        description: 'Failed to save call recording',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [user, uploadRecording, createRecording, analyzeRecording, findLeadByPhone, toast]);

  // Set up event listeners
  const setupEventListeners = useCallback(async () => {
    if (!isNativeApp()) return;

    try {
      // Remove existing listeners
      await removeEventListeners();

      // Call started event
      const callStartedListener = await CallRecordingPlugin.addListener(
        'callStarted',
        (event) => {
          setLastCallEvent(event);
          
          if (event.state === 'active') {
            toast({
              title: 'Recording',
              description: 'Call recording started',
            });
          }
        }
      );
      listenerRefs.current.push(callStartedListener);

      // Call ended event
      const callEndedListener = await CallRecordingPlugin.addListener(
        'callEnded',
        (event) => {
          setLastCallEvent(event);
        }
      );
      listenerRefs.current.push(callEndedListener);

      // Recording saved event
      const recordingSavedListener = await CallRecordingPlugin.addListener(
        'recordingSaved',
        (event) => {
          setLastCallEvent(event);
          handleRecordingSaved(event);
        }
      );
      listenerRefs.current.push(recordingSavedListener);

      // Recording error event
      const recordingErrorListener = await CallRecordingPlugin.addListener(
        'recordingError',
        (event) => {
          console.error('Recording error:', event.error);
          toast({
            title: 'Recording Error',
            description: event.error,
            variant: 'destructive',
          });
        }
      );
      listenerRefs.current.push(recordingErrorListener);

      const debugTraceListener = await CallRecordingPlugin.addListener(
        'debugTrace',
        (event) => {
          setDebugTrace((prev) => [...prev, event].slice(-40));
        }
      );
      listenerRefs.current.push(debugTraceListener);

    } catch (error) {
      console.error('Error setting up listeners:', error);
    }
  }, [handleRecordingSaved, toast]);

  // Remove event listeners
  const removeEventListeners = useCallback(async () => {
    for (const listener of listenerRefs.current) {
      try {
        listener.remove();
      } catch (error) {
        console.error('Error removing listener:', error);
      }
    }
    listenerRefs.current = [];
  }, []);

  // Start the recording service
  const startService = useCallback(async () => {
    if (!isNativeApp()) {
      toast({
        title: 'Not Available',
        description: 'Call recording requires the native Android app',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Re-check actual Android permission state before asking again.
      let granted = hasPermissions;

      if (!granted) {
        granted = await checkPermissions();
      }

      if (!granted) {
        console.warn('Call recording permission check did not report granted; attempting service start anyway for native-device validation.');
      }

      // Enable the native recording workflow first.
      const result = await CallRecordingPlugin.startService();
      setIsServiceRunning(result.status === 'started');

      // Listener wiring should not block enabling the feature.
      try {
        await setupEventListeners();
      } catch (listenerError) {
        console.error('Call recording listeners could not be attached:', listenerError);
      }

      toast({
        title: 'Call Recording Active',
        description: 'Calls will be automatically recorded',
      });

      return true;
    } catch (error) {
      console.error('Error starting service:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start call recording service',
        variant: 'destructive',
      });
      return false;
    }
  }, [checkPermissions, hasPermissions, setupEventListeners, toast]);

  // Stop the recording service
  const stopService = useCallback(async () => {
    if (!isNativeApp()) return false;

    try {
      await CallRecordingPlugin.stopService();
      setIsServiceRunning(false);
      await removeEventListeners();

      toast({
        title: 'Call Recording Stopped',
        description: 'Calls will no longer be recorded',
      });

      return true;
    } catch (error) {
      console.error('Error stopping service:', error);
      toast({
        title: 'Error',
        description: 'Failed to stop call recording service',
        variant: 'destructive',
      });
      return false;
    }
  }, [removeEventListeners, toast]);

  // Check service status
  const checkServiceStatus = useCallback(async () => {
    if (!isNativeApp()) return false;

    try {
      const result = await CallRecordingPlugin.isServiceRunning();
      setIsServiceRunning(result.running);
      
      // If service is running, ensure listeners are set up
      if (result.running) {
        await setupEventListeners();
      }
      
      return result.running;
    } catch (error) {
      console.error('Error checking service status:', error);
      return false;
    }
  }, [setupEventListeners]);

  // Check service status once on mount. This avoids repeated plugin calls
  // caused by callback identity changes during normal React re-renders.
  useEffect(() => {
    if (!isNativeApp()) return;
    if (hasInitializedRef.current) return;

    hasInitializedRef.current = true;
    checkServiceStatus();
  }, [checkServiceStatus]);

  useEffect(() => {
    return () => {
      removeEventListeners();
    };
  }, [removeEventListeners]);

  // On app resume, scan for any local recordings that were saved while the
  // WebView was suspended (e.g. during an active phone call) and upload them.
  const processPendingRecordings = useCallback(async () => {
    if (!isNativeApp() || !user) return;
    if (isSyncingPendingRef.current) return;

    isSyncingPendingRef.current = true;

    try {
      const { recordings: localFiles } = await CallRecordingPlugin.listRecordings();
      if (!localFiles || localFiles.length === 0) return;

      for (const localFile of localFiles) {
        // Skip tiny/corrupt files (< 1 KB)
        if (localFile.size < 1024) continue;

        const filename = localFile.fileName;
        const storagePath = `${user.id}/${filename}`;

        // De-dupe using DB first; storage listing can be flaky on mobile/webview.
        const { data: existingRows, error: existingRowsError } = await supabase
          .from('call_recordings')
          .select('id')
          .eq('user_id', user.id)
          .eq('file_path', storagePath)
          .limit(1);

        if (existingRowsError) {
          console.error('processPendingRecordings: db dedupe lookup failed', existingRowsError);
        }

        if (existingRows && existingRows.length > 0) {
          await CallRecordingPlugin.deleteRecordingFile({ filePath: localFile.filePath });
          continue;
        }

        const fileData = await CallRecordingPlugin.getRecordingFile({ filePath: localFile.filePath });
        if (!fileData.exists || !fileData.base64) continue;

        const byteCharacters = atob(fileData.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: fileData.mimeType || 'audio/mp4' });

        const uploadedStoragePath = await uploadRecording(blob, filename);
        if (!uploadedStoragePath) {
          console.error('processPendingRecordings: upload failed', filename);
          continue;
        }

        // Estimate duration from file age (lastModified vs file name timestamp)
        const tsMatch = filename.match(/call_(\d+)\./);
        const startTs = tsMatch ? parseInt(tsMatch[1]) : localFile.lastModified;
        const durationSec = Math.round((localFile.lastModified - startTs) / 1000);

        // Try to associate this recording to the nearest existing call log
        // created around the same call window. This allows rendering the
        // recording inline under the lead activity call item.
        const windowStartIso = new Date(startTs - 10 * 60 * 1000).toISOString();
        const windowEndIso = new Date(localFile.lastModified + 10 * 60 * 1000).toISOString();

        const { data: nearbyCallLogs, error: nearbyCallLogsError } = await supabase
          .from('call_logs')
          .select('id, lead_id, created_at')
          .eq('user_id', user.id)
          .gte('created_at', windowStartIso)
          .lte('created_at', windowEndIso)
          .order('created_at', { ascending: false })
          .limit(20);

        if (nearbyCallLogsError) {
          console.error('processPendingRecordings: call log lookup failed', nearbyCallLogsError);
        }

        const matchedCallLog = (nearbyCallLogs || []).reduce<{
          id: string;
          lead_id: string | null;
          created_at: string;
        } | null>((best, current) => {
          if (!best) return current;
          const bestDiff = Math.abs(new Date(best.created_at).getTime() - startTs);
          const currentDiff = Math.abs(new Date(current.created_at).getTime() - startTs);
          const bestScore = bestDiff + (best.lead_id ? 0 : 3 * 60 * 1000);
          const currentScore = currentDiff + (current.lead_id ? 0 : 3 * 60 * 1000);
          return currentScore < bestScore ? current : best;
        }, null);

        const recordingData = await createRecording.mutateAsync({
          file_path: uploadedStoragePath,
          file_url: null,
          duration: durationSec > 0 ? durationSec : 0,
          lead_id: matchedCallLog?.lead_id ?? null,
          call_log_id: matchedCallLog?.id ?? null,
          user_id: user.id,
          ai_summary: null,
          ai_next_actions: null,
          transcription: null,
        });

        if (matchedCallLog?.lead_id) {
          await supabase.from('lead_activities').insert({
            lead_id: matchedCallLog.lead_id,
            type: 'call',
            title: 'Auto-recorded call synced',
            description: `Recovered local recording (${durationSec > 0 ? durationSec : 0}s)`,
            metadata: {
              recording_id: recordingData.id,
              call_log_id: matchedCallLog.id,
              source: 'pending-sync',
            },
            user_id: user.id,
          });
        }

        if (recordingData) {
          analyzeRecording.mutate({
            recordingId: recordingData.id,
            callDetails: { duration: durationSec, callType: 'unknown' },
          });
        }

        await CallRecordingPlugin.deleteRecordingFile({ filePath: localFile.filePath });

        toast({
          title: 'Call Recorded',
          description: `Missed recording uploaded (${durationSec}s)`,
        });
      }
    } catch (err) {
      console.error('processPendingRecordings error:', err);
    } finally {
      isSyncingPendingRef.current = false;
    }
  }, [user, uploadRecording, createRecording, analyzeRecording, toast]);

  useEffect(() => {
    if (!isNativeApp() || !user) return;

    // Session restoration can complete slightly after focus; run a delayed pass.
    const timer = window.setTimeout(() => {
      processPendingRecordings();
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [user, processPendingRecordings]);

  useEffect(() => {
    if (!isNativeApp() || !user) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        processPendingRecordings();
      }
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user, processPendingRecordings]);

  useEffect(() => {
    if (!isNativeApp()) return;

    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return;
      checkPermissions();
      refreshDebugTrace();
      // Upload any recordings that were saved while the WebView was suspended
      processPendingRecordings();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [checkPermissions, refreshDebugTrace, processPendingRecordings]);

  return {
    isServiceRunning,
    isProcessing,
    hasPermissions,
    permissionState,
    lastCallEvent,
    debugTrace,
    speakerAssistEnabled,
    isNative: isNativeApp(),
    startService,
    stopService,
    checkServiceStatus,
    requestPermissions,
    checkPermissions,
    refreshDebugTrace,
    clearDebugTrace,
    refreshSpeakerAssistStatus,
    updateSpeakerAssist,
  };
};
