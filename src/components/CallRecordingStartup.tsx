import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CallRecordingPlugin, isNativeApp } from '@/services/nativePlugins';

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

const CallRecordingStartup = () => {
  const hasRunRef = useRef(false);
  const { user } = useAuth();
  const { uploadRecording, createRecording, analyzeRecording } = useCallRecordings();
  const { toast } = useToast();

  const performScan = async (): Promise<ImportedSystemRecording[]> => {
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

  const importSystemRecording = async (recording: ImportedSystemRecording) => {
    if (!user || recording.confidence === 'low') return false;

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

    const callLogId = recording.matchedCallLogId;
    const leadId = recording.matchedLeadId;

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

    return true;
  };

  useEffect(() => {
    if (!isNativeApp() || !user || hasRunRef.current) return;
    hasRunRef.current = true;

    const runStartupImport = async () => {
      try {
        await CallRecordingPlugin.requestRecordingPermissions();

        const mediaPermission = await CallRecordingPlugin.checkMediaAudioPermission();
        if (mediaPermission.mediaAudio !== 'granted') {
          await CallRecordingPlugin.requestMediaAudioPermission();
        }

        const recheck = await CallRecordingPlugin.checkMediaAudioPermission();
        if (recheck.mediaAudio !== 'granted') {
          toast({
            title: 'Auto-import complete',
            description: '0 recordings imported on app start (media permission not granted).',
          });
          return;
        }

        const scanned = await performScan();
        const autoImportCandidates = scanned.filter((recording) => recording.confidence !== 'low');

        let importedCount = 0;
        for (const recording of autoImportCandidates) {
          try {
            const imported = await importSystemRecording(recording);
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
      }
    };

    void runStartupImport();
  }, [analyzeRecording, createRecording, toast, uploadRecording, user]);

  return null;
};

export default CallRecordingStartup;