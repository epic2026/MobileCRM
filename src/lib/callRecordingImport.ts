import { Lead } from '@/hooks/useLeads';
import { CallRecording } from '@/hooks/useCallRecordings';
import { supabase } from '@/integrations/supabase/client';
import { CallRecordingPlugin } from '@/services/nativePlugins';

export type MatchConfidence = 'high' | 'medium' | 'low';

export interface ImportedSystemRecording {
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

interface CallLogMatch {
  id: string;
  lead_id: string | null;
  phone: string;
  created_at: string;
  duration: number;
  score: number;
  phoneMatched: boolean;
  timeDiffMs: number;
}

interface PerformSystemRecordingScanParams {
  userId: string;
  leads?: Lead[];
}

interface ImportSystemRecordingParams {
  recording: ImportedSystemRecording;
  userId: string;
  uploadRecording: (file: Blob, filename: string) => Promise<string | null>;
  createRecording: (recording: Omit<CallRecording, 'id' | 'created_at' | 'processed_at'>) => Promise<CallRecording>;
  analyzeRecording: (params: {
    recordingId: string;
    transcription?: string;
    callDetails: { contactName?: string; duration: number; callType: string };
  }) => void;
  manualLeadId?: string | null;
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

  if (phoneMatched) score += 60;

  if (timeDiffMs <= 3 * 60 * 1000) {
    score += 30;
  } else if (timeDiffMs <= 10 * 60 * 1000) {
    score += 20;
  } else if (timeDiffMs <= 30 * 60 * 1000) {
    score += 10;
  }

  if (recordingDuration > 0 && callLogDuration > 0) {
    const durationDiff = Math.abs(recordingDuration - callLogDuration);
    if (durationDiff <= 20) score += 15;
  }

  if (/(call|record|rec|phone|voice)/i.test(`${fileName} ${relativePath}`)) {
    score += 5;
  }

  if (!phoneMatched) return 'low';
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
};

export const ensureMediaAudioPermission = async () => {
  const permission = await CallRecordingPlugin.checkMediaAudioPermission();
  if (permission.mediaAudio === 'granted') {
    return true;
  }

  const requested = await CallRecordingPlugin.requestMediaAudioPermission();
  return requested.mediaAudio === 'granted';
};

export const performSystemRecordingScan = async ({
  userId,
  leads = [],
}: PerformSystemRecordingScanParams): Promise<ImportedSystemRecording[]> => {
  const [{ recordings }, { data: callLogs, error: callLogError }] = await Promise.all([
    CallRecordingPlugin.listSystemRecordings(),
    supabase
      .from('call_logs')
      .select('id, lead_id, phone, created_at, duration')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(400),
  ]);

  if (callLogError) throw callLogError;

  const mapped = (recordings || []).map((recording) => {
    const combinedText = `${recording.fileName || ''} ${recording.relativePath || ''}`;
    const detectedPhone = extractPhoneFromText(combinedText);
    const targetLast10 = detectedPhone ? toLast10(detectedPhone) : null;
    const recordedAt = recording.lastModified || Date.now();

    let best: CallLogMatch | null = null;
    const timestampWindowMs = 1 * 60 * 1000;
    const closeTimeLogs: CallLogMatch[] = [];

    for (const log of callLogs || []) {
      const logTime = new Date(log.created_at).getTime();
      const timeDiffMs = Math.abs(logTime - recordedAt);
      if (timeDiffMs > 6 * 60 * 60 * 1000) continue;

      const logLast10 = toLast10(log.phone || '');
      const phoneMatched = !!targetLast10 && !!logLast10 && targetLast10 === logLast10;
      const score = (phoneMatched ? 1000 : 0) - Math.floor(timeDiffMs / 1000);

      const match: CallLogMatch = {
        id: log.id,
        lead_id: log.lead_id,
        phone: log.phone,
        created_at: log.created_at,
        duration: log.duration,
        score,
        phoneMatched,
        timeDiffMs,
      };

      if (!best || score > best.score) {
        best = match;
      }

      if (timeDiffMs <= timestampWindowMs) {
        closeTimeLogs.push(match);
      }
    }

    let confidence: MatchConfidence = best
      ? computeMatchConfidence({
          phoneMatched: best.phoneMatched,
          timeDiffMs: best.timeDiffMs,
          recordingDuration: recording.duration || 0,
          callLogDuration: best.duration || 0,
          fileName: recording.fileName || '',
          relativePath: recording.relativePath || '',
        })
      : 'low';

    let matchedCallLogId = confidence !== 'low' ? best?.id || null : null;
    let matchedLeadId = confidence !== 'low' ? best?.lead_id || null : null;
    let matchedPhone = confidence !== 'low' ? best?.phone || null : null;
    let hasDirectLeadMatch = false;

    if (confidence === 'low' && targetLast10) {
      const directLead = leads.find((lead) => toLast10(lead.phone || '') === targetLast10);
      if (directLead) {
        confidence = 'medium';
        matchedLeadId = directLead.id;
        matchedPhone = directLead.phone;
        matchedCallLogId = null;
        hasDirectLeadMatch = true;
      }
    }

    if (confidence === 'low' && !hasDirectLeadMatch && closeTimeLogs.length === 1) {
      const tsMatch = closeTimeLogs[0];
      confidence = 'medium';
      matchedCallLogId = tsMatch.id;
      matchedLeadId = tsMatch.lead_id;
      matchedPhone = tsMatch.phone;
    }

    return {
      ...recording,
      detectedPhone,
      matchedCallLogId,
      matchedLeadId,
      matchedPhone,
      confidence,
    } as ImportedSystemRecording;
  });

  return mapped.slice(0, 30);
};

export const importSystemRecording = async ({
  recording,
  userId,
  uploadRecording,
  createRecording,
  analyzeRecording,
  manualLeadId,
}: ImportSystemRecordingParams) => {
  const leadId = recording.confidence === 'low'
    ? manualLeadId || null
    : recording.matchedLeadId || manualLeadId || null;

  const safeName = recording.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = `system_${recording.lastModified}_${safeName}`;
  const storagePathCandidate = `${userId}/${filename}`;

  const { data: existingRows, error: dedupeError } = await supabase
    .from('call_recordings')
    .select('id')
    .eq('user_id', userId)
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
  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }

  const blob = new Blob([new Uint8Array(byteNumbers)], {
    type: fileData.mimeType || 'audio/mp4',
  });

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
        user_id: userId,
        contact_name: null,
        notes: 'Imported from device call recorder',
        outcome: null,
      })
      .select('id')
      .single();

    if (callLogInsertError) throw callLogInsertError;
    callLogId = insertedCallLog.id;
  }

  const recordingData = await createRecording({
    file_path: uploadedPath,
    file_url: null,
    duration: recording.duration || 0,
    lead_id: leadId,
    call_log_id: callLogId,
    user_id: userId,
    ai_summary: null,
    ai_next_actions: null,
    transcription: null,
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
      user_id: userId,
    });
  }

  analyzeRecording({
    recordingId: recordingData.id,
    callDetails: {
      duration: recording.duration || 0,
      callType: 'unknown',
    },
  });

  return true;
};