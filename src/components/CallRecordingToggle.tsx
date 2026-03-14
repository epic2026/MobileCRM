import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mic, MicOff, Loader2, ShieldCheck, Upload, Download } from 'lucide-react';
import { useCallRecordingService } from '@/hooks/useCallRecordingService';
import { useNativeAudioRecorder } from '@/hooks/useNativeAudioRecorder';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useLeads } from '@/hooks/useLeads';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { CallRecordingPlugin } from '@/services/nativePlugins';
import { supabase } from '@/integrations/supabase/client';

type MatchConfidence = 'high' | 'medium' | 'low';

interface ImportedSystemRecording {
  contentUri: string;
  fileName: string;
  size: number;
  duration: number;
  lastModified: number;
  relativePath: string;
  detectedPhone: string | null;
  matchedCallLogId: string | null;
  matchedLeadId: string | null;
  matchedPhone: string | null;
  confidence: MatchConfidence;
}

const IMPORT_ONLY_MODE = true;

export const CallRecordingToggle = () => {
  const [isUploadingDebugRecording, setIsUploadingDebugRecording] = useState(false);
  const [isScanningSystemRecordings, setIsScanningSystemRecordings] = useState(false);
  const [importingContentUri, setImportingContentUri] = useState<string | null>(null);
  const [systemRecordings, setSystemRecordings] = useState<ImportedSystemRecording[]>([]);
  const [manualLeadByRecording, setManualLeadByRecording] = useState<Record<string, string>>({});
  const {
    isServiceRunning,
    isProcessing,
    hasPermissions,
    permissionState,
    lastCallEvent,
    debugTrace,
    isNative,
    startService,
    stopService,
    requestPermissions,
    checkPermissions,
    refreshDebugTrace,
    clearDebugTrace,
    speakerAssistEnabled,
    updateSpeakerAssist,
  } = useCallRecordingService();
  const {
    isRecording,
    duration,
    filePath,
    startRecording,
    stopRecording,
  } = useNativeAudioRecorder();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();
  const { leads } = useLeads();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!IMPORT_ONLY_MODE) return;
    if (!isServiceRunning) return;

    void stopService();
  }, [isServiceRunning, stopService]);

  const normalizePhone = (value: string) => value.replace(/\D/g, '');

  const toLast10 = (value: string) => normalizePhone(value).slice(-10);

  const extractPhoneFromText = (input: string): string | null => {
    const candidates = input.match(/\+?\d[\d\s\-()]{7,}\d/g) || [];
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      if (normalized.length >= 10) {
        return normalized;
      }
    }
    return null;
  };

  const computeMatchConfidence = (params: {
    phoneMatched: boolean;
    timeDiffMs: number;
    recordingDuration: number;
    callLogDuration: number;
    fileName: string;
    relativePath: string;
  }): MatchConfidence => {
    const {
      phoneMatched,
      timeDiffMs,
      recordingDuration,
      callLogDuration,
      fileName,
      relativePath,
    } = params;

    let score = 0;

    if (phoneMatched) {
      score += 60;
    }

    if (timeDiffMs <= 3 * 60 * 1000) {
      score += 30;
    } else if (timeDiffMs <= 10 * 60 * 1000) {
      score += 20;
    } else if (timeDiffMs <= 30 * 60 * 1000) {
      score += 10;
    }

    if (recordingDuration > 0 && callLogDuration > 0) {
      const durationDiff = Math.abs(recordingDuration - callLogDuration);
      if (durationDiff <= 20) {
        score += 15;
      }
    }

    if (/(call|record|rec|phone|voice)/i.test(`${fileName} ${relativePath}`)) {
      score += 5;
    }

    if (!phoneMatched) {
      return 'low';
    }

    if (score >= 75) {
      return 'high';
    }

    if (score >= 45) {
      return 'medium';
    }

    return 'low';
  };

  const performScan = async (): Promise<ImportedSystemRecording[]> => {
    const permission = await CallRecordingPlugin.checkMediaAudioPermission();
    if (permission.mediaAudio !== 'granted') {
      const requested = await CallRecordingPlugin.requestMediaAudioPermission();
      if (requested.mediaAudio !== 'granted') {
        throw new Error('Media audio permission denied');
      }
    }

    const [{ recordings }, { data: callLogs, error: callLogError }] = await Promise.all([
      CallRecordingPlugin.listSystemRecordings(),
      supabase
        .from('call_logs')
        .select('id, lead_id, phone, created_at, duration')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(400),
    ]);

    if (callLogError) throw callLogError;

    const mapped = (recordings || []).map((recording) => {
      const combinedText = `${recording.fileName || ''} ${recording.relativePath || ''}`;
      const detectedPhone = extractPhoneFromText(combinedText);
      const targetLast10 = detectedPhone ? toLast10(detectedPhone) : null;
      const recordedAt = recording.lastModified || Date.now();

      let best: {
        id: string;
        lead_id: string | null;
        phone: string;
        created_at: string;
        duration: number;
        score: number;
        phoneMatched: boolean;
        timeDiffMs: number;
      } | null = null;

      for (const log of callLogs || []) {
        const logTime = new Date(log.created_at).getTime();
        const timeDiffMs = Math.abs(logTime - recordedAt);
        if (timeDiffMs > 6 * 60 * 60 * 1000) continue;

        const logLast10 = toLast10(log.phone || '');
        const phoneMatched = !!targetLast10 && !!logLast10 && targetLast10 === logLast10;
        const score = (phoneMatched ? 1000 : 0) - Math.floor(timeDiffMs / 1000);

        if (!best || score > best.score) {
          best = {
            id: log.id,
            lead_id: log.lead_id,
            phone: log.phone,
            created_at: log.created_at,
            duration: log.duration,
            score,
            phoneMatched,
            timeDiffMs,
          };
        }
      }

      const confidence: MatchConfidence = best
        ? computeMatchConfidence({
            phoneMatched: best.phoneMatched,
            timeDiffMs: best.timeDiffMs,
            recordingDuration: recording.duration || 0,
            callLogDuration: best.duration || 0,
            fileName: recording.fileName || '',
            relativePath: recording.relativePath || '',
          })
        : 'low';

      return {
        ...recording,
        detectedPhone,
        matchedCallLogId: confidence !== 'low' ? best?.id || null : null,
        matchedLeadId: confidence !== 'low' ? best?.lead_id || null : null,
        matchedPhone: confidence !== 'low' ? best?.phone || null : null,
        confidence,
      } as ImportedSystemRecording;
    });

    return mapped.slice(0, 30);
  };

  const autoImportEligibleRecordings = async (recordings: ImportedSystemRecording[]) => {
    const autoImportCandidates = recordings.filter((recording) => recording.confidence !== 'low');
    let importedCount = 0;

    for (const recording of autoImportCandidates) {
      try {
        const imported = await importSystemRecording(recording);
        if (imported) {
          importedCount += 1;
        }
      } catch (error) {
        console.error('Auto-import failed for', recording.fileName, error);
      }
    }

    return importedCount;
  };

  const scanSystemRecordings = async () => {
    if (!user) return;
    setIsScanningSystemRecordings(true);

    try {
      const shortlisted = await performScan();
      const lowConfidenceOnly = shortlisted.filter((recording) => recording.confidence === 'low');
      setSystemRecordings(lowConfidenceOnly);

      const importedCount = await autoImportEligibleRecordings(shortlisted);

      if (shortlisted.length === 0) {
        toast({
          title: 'No device recordings found',
          description: 'No call-like recordings were detected in shared storage. Your OEM recorder may store files privately.',
        });
      } else {
        toast({
          title: 'Scan complete',
          description: `Auto-imported ${importedCount}. ${lowConfidenceOnly.length} need manual lead assignment.`,
        });
      }
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


  const importSystemRecording = async (recording: ImportedSystemRecording) => {
    if (!user) return false;

    const fallbackLeadId = manualLeadByRecording[recording.contentUri] || null;
    const leadId = recording.confidence === 'low'
      ? fallbackLeadId
      : recording.matchedLeadId || fallbackLeadId;

    if (recording.confidence === 'low' && !leadId) {
      return false;
    }

    setImportingContentUri(recording.contentUri);
    try {
      const safeName = recording.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filename = `system_${recording.lastModified}_${safeName}`;
      const storagePathCandidate = `${user.id}/${filename}`;

      const { data: existingRows, error: dedupeError } = await supabase
        .from('call_recordings')
        .select('id')
        .eq('user_id', user.id)
        .eq('file_path', storagePathCandidate)
        .limit(1);

      if (dedupeError) throw dedupeError;
      if (existingRows && existingRows.length > 0) {
        setSystemRecordings((prev) => prev.filter((r) => r.contentUri !== recording.contentUri));
        return false;
      }

      const fileData = await CallRecordingPlugin.getSystemRecordingFile({ contentUri: recording.contentUri });
      if (!fileData.base64) {
        throw new Error('Imported file is empty');
      }

      const byteCharacters = atob(fileData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: fileData.mimeType || 'audio/mp4' });

      const uploadedPath = await uploadRecording(blob, filename);
      if (!uploadedPath) {
        throw new Error('Upload failed');
      }

      let callLogId = recording.confidence === 'low' ? null : recording.matchedCallLogId;
      if (!callLogId) {
        const { data: insertedCallLog, error: callLogInsertError } = await supabase
          .from('call_logs')
          .insert({
            phone: recording.detectedPhone || recording.matchedPhone || 'Unknown',
            duration: recording.duration || 0,
            type: 'outgoing',
            lead_id: leadId,
            user_id: user.id,
            contact_name: null,
            notes: 'Imported from device call recorder',
            outcome: null,
          })
          .select('id')
          .single();

        if (callLogInsertError) throw callLogInsertError;
        callLogId = insertedCallLog.id;
      }

      const recordingData = await createRecording.mutateAsync({
        file_path: uploadedPath,
        file_url: null,
        duration: recording.duration || 0,
        lead_id: leadId,
        call_log_id: callLogId,
        user_id: user.id,
        ai_summary: null,
        ai_next_actions: null,
        transcription: `Imported from device recorder (${recording.fileName})`,
      });

      if (leadId) {
        await supabase.from('lead_activities').insert({
          lead_id: leadId,
          type: 'call',
          title: 'Imported call recording',
          description: `Imported from built-in device recorder (${recording.duration || 0}s)`,
          metadata: {
            recording_id: recordingData.id,
            call_log_id: callLogId,
            source: 'device-call-recorder',
            matched_confidence: recording.confidence,
          },
          user_id: user.id,
        });
      }

      analyzeRecording.mutate({
        recordingId: recordingData.id,
        callDetails: {
          duration: recording.duration || 0,
          callType: 'unknown',
        },
      });

      setSystemRecordings((prev) => prev.filter((r) => r.contentUri !== recording.contentUri));
      return true;
    } catch (error) {
      console.error('System recording import failed:', error);
      return false;
    } finally {
      setImportingContentUri(null);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      await startService();
    } else {
      await stopService();
    }
  };

  const handleDebugRecording = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (!result?.filePath || !user) return;

      try {
        setIsUploadingDebugRecording(true);
        const fileData = await CallRecordingPlugin.getRecordingFile({ filePath: result.filePath });
        if (!fileData.exists || !fileData.base64) {
          throw new Error('Debug recording file was not found on device');
        }

        const byteCharacters = atob(fileData.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: fileData.mimeType });
        const filename = `debug_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.m4a`;
        const storagePath = await uploadRecording(blob, filename);
        if (!storagePath) {
          throw new Error('Upload failed');
        }

        await createRecording.mutateAsync({
          file_path: storagePath,
          file_url: null,
          duration: result.duration || 0,
          lead_id: null,
          call_log_id: null,
          user_id: user.id,
          ai_summary: null,
          ai_next_actions: null,
          transcription: 'Manual debug recording',
        });
      } catch (error) {
        console.error('Debug recording upload failed:', error);
      } finally {
        setIsUploadingDebugRecording(false);
      }
      return;
    }

    await startRecording(`debug_recording_${Date.now()}.m4a`);
  };

  if (!isNative) {
    return (
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <MicOff className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">Auto Call Recording</p>
            <p className="text-xs text-muted-foreground">
              Available only on native Android app
            </p>
          </div>
        </div>
        <Badge variant="outline">Web Only</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Permission status */}
      {!hasPermissions && (
        <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-sm">Permissions Required</p>
              <p className="text-xs text-muted-foreground">
                Grant permissions for call recording
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={requestPermissions}
          >
            Grant
          </Button>
        </div>
      )}

      {!hasPermissions && permissionState && (
        <div className="px-4 py-3 text-xs text-muted-foreground bg-muted/30 rounded-lg border">
          <p>Microphone: {permissionState.microphone}</p>
          <p>Phone: {permissionState.phoneState}</p>
          <p>Call log: {permissionState.callLog}</p>
          {permissionState.mediaAudio && <p>Media audio: {permissionState.mediaAudio}</p>}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 px-2 text-xs"
            onClick={checkPermissions}
          >
            Refresh permission status
          </Button>
        </div>
      )}

      <div className="p-4 border rounded-lg bg-amber-500/10 border-amber-500/30 space-y-3">
        <p className="text-sm font-medium text-foreground">Recommended On This Device</p>
        <p className="text-xs text-muted-foreground">
          Use <strong>Import Device Call Recordings</strong> for reliable audio. Keep Auto Call Recording off to avoid blank files.
        </p>
        {isServiceRunning && !IMPORT_ONLY_MODE && (
          <Button size="sm" variant="outline" onClick={() => handleToggle(false)}>
            Turn Off Auto Recording
          </Button>
        )}
      </div>

      {/* Recording toggle */}
      <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-3">
          {isServiceRunning ? (
            <div className="relative">
              <Mic className="h-5 w-5 text-green-500" />
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            </div>
          ) : (
            <MicOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label htmlFor="call-recording" className="font-medium">
              Auto Call Recording
            </Label>
            <p className="text-xs text-muted-foreground">
              {IMPORT_ONLY_MODE
                ? 'Disabled on this phone. Use Import Device Call Recordings below.'
                : isServiceRunning
                  ? 'Recording all incoming & outgoing calls'
                  : 'Enable to automatically record calls'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="call-recording"
            checked={isServiceRunning}
            onCheckedChange={handleToggle}
            disabled={isProcessing || IMPORT_ONLY_MODE}
          />
        </div>
      </div>

      {/* Status indicator */}
      {isServiceRunning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          <p className="text-xs text-green-600 dark:text-green-400">
            Call recording service is active in background
          </p>
        </div>
      )}

      <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Speaker Assist (Opt-in)</p>
            <p className="text-xs text-muted-foreground">
              Turns speakerphone ON only during active call recording, then restores previous audio route.
            </p>
          </div>
          <Switch
            checked={speakerAssistEnabled}
            onCheckedChange={updateSpeakerAssist}
          />
        </div>
      </div>

      <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Import Device Call Recordings</p>
            <p className="text-xs text-muted-foreground">
              Pull recordings from your phone&apos;s built-in call recorder, upload to Supabase, and attach to lead activity.
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
            No imported candidates yet. Tap Scan Device to load built-in call recordings.
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
                    <Badge variant={recording.confidence === 'high' ? 'default' : 'secondary'}>
                      {recording.confidence === 'high' ? 'Auto-match ready' : 'Manual lead required'}
                    </Badge>
                  </div>

                  {recording.confidence === 'high' && (
                    <p className="text-[11px] text-muted-foreground">
                      Matched by timestamp + phone {recording.matchedPhone ? `(${recording.matchedPhone})` : ''}
                    </p>
                  )}

                  {recording.confidence === 'low' && (
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
                  )}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => importSystemRecording(recording)}
                      disabled={isImporting || (recording.confidence === 'low' && !manualLeadId)}
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

      <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Manual Recording Test</p>
          <p className="text-xs text-muted-foreground">
            Use this to verify native audio capture and Supabase upload without relying on phone-state broadcasts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isRecording ? 'destructive' : 'secondary'}
            onClick={handleDebugRecording}
            disabled={isUploadingDebugRecording}
          >
            {isRecording ? (
              <>
                <MicOff className="w-4 h-4 mr-2" />
                Stop Test Recording
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                Start Test Recording
              </>
            )}
          </Button>
          {isUploadingDebugRecording && (
            <div className="flex items-center text-xs text-muted-foreground">
              <Upload className="w-3 h-3 mr-1" />
              Uploading debug file...
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isRecording
            ? `Recording in progress: ${duration}s`
            : filePath
              ? `Last local debug file: ${filePath}`
              : 'No debug recording captured yet'}
        </p>
      </div>

      <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Native Call-State Debug Trace</p>
            <p className="text-xs text-muted-foreground">
              This shows whether Android delivered the phone-state broadcast and what the native receiver/service did next.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={refreshDebugTrace}>
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={clearDebugTrace}>
              Clear
            </Button>
          </div>
        </div>

        {lastCallEvent && (
          <div className="rounded-md border bg-background/60 p-3 text-xs text-muted-foreground">
            Last JS call event: {lastCallEvent.callType} {lastCallEvent.state ?? 'ended'}
            {lastCallEvent.phoneNumber ? ` • ${lastCallEvent.phoneNumber}` : ''}
            {typeof lastCallEvent.duration === 'number' ? ` • ${lastCallEvent.duration}s` : ''}
            {(typeof lastCallEvent.audioSource === 'number' && lastCallEvent.audioSource >= 0) && (
              <div className="mt-2">
                <Badge variant="secondary" className="text-[10px]">
                  Audio Source: {lastCallEvent.audioSourceName || 'unknown'} ({lastCallEvent.audioSource})
                </Badge>
              </div>
            )}
          </div>
        )}

        <div className="max-h-64 overflow-auto rounded-md border bg-background/60">
          {debugTrace.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              No native trace entries yet. If this stays empty after a real phone call, the receiver is likely not firing on this device.
            </div>
          ) : (
            <div className="divide-y">
              {[...debugTrace].reverse().map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{entry.source}</span>
                    <span className="text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallRecordingToggle;
