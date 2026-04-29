import { Lead } from '@/hooks/useLeads';
import { CallRecording } from '@/hooks/useCallRecordings';
import { supabase } from '@/integrations/supabase/client';
import { CallRecordingPlugin, CallLogPlugin, CallLogEntry } from '@/services/nativePlugins';

export type MatchConfidence = 'high' | 'medium' | 'low';
export type CallDirection = 'incoming' | 'outgoing';

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
  direction: CallDirection;
}

// Returns direction from filename keywords, or null if no keyword found.
// Never defaults — caller decides what to do with null.
const detectDirectionFromFilename = (fileName: string, relativePath: string): CallDirection | null => {
  const text = `${fileName} ${relativePath}`.toLowerCase();
  if (/incoming|inbound|received|_in[_.\s]|[\s_]in[_.\s]|call.?from/.test(text)) return 'incoming';
  if (/outgoing|outbound|dialed|_out[_.\s]|[\s_]out[_.\s]/.test(text)) return 'outgoing';
  return null;
};

// Resolution order:
//   1. Android system call log (phone + ±2min timestamp) — 100% accurate
//   2. DB outbound call log (app-initiated call with same phone + ±10min) — confident outgoing
//   3. Filename keywords — semi-reliable
//   4. Conservative fallback: 'incoming' (never inflate outbound count with guesses)
const resolveDirection = (
  lastModified: number,
  fileName: string,
  relativePath: string,
  targetLast10: string | null,
  systemLogs: CallLogEntry[],
  dbOutboundLogs: { phone: string; created_at: string }[],
): CallDirection => {
  if (targetLast10) {
    // 1. System call log — most authoritative
    const sysMatch = systemLogs.find(
      (log) =>
        toLast10(log.phone) === targetLast10 &&
        Math.abs(log.timestamp - lastModified) < 2 * 60 * 1000,
    );
    if (sysMatch) return sysMatch.type === 'outgoing' ? 'outgoing' : 'incoming';

    // 2. DB outbound log (app created it when rep tapped Call)
    const dbMatch = dbOutboundLogs.find(
      (log) =>
        toLast10(log.phone) === targetLast10 &&
        Math.abs(new Date(log.created_at).getTime() - lastModified) < 10 * 60 * 1000,
    );
    if (dbMatch) return 'outgoing';
  }

  // 3. Filename keywords
  const filenameDir = detectDirectionFromFilename(fileName, relativePath);
  if (filenameDir) return filenameDir;

  // 4. Conservative default — unknown recordings are treated as incoming so we never
  //    inflate a rep's outbound call count with unmatched files.
  return 'incoming';
};

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
  tenantId: string;
  leads?: Lead[];
}

interface ImportSystemRecordingParams {
  recording: ImportedSystemRecording;
  userId: string;
  tenantId: string;
  uploadRecording: (file: Blob, filename: string) => Promise<string | null>;
  createRecording: (recording: Omit<CallRecording, 'id' | 'created_at' | 'processed_at' | 'tenant_id'>) => Promise<CallRecording>;
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
    if (normalized.length >= 10) return normalized;
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
  const { phoneMatched, timeDiffMs, recordingDuration, callLogDuration, fileName, relativePath } = params;
  let score = 0;

  if (phoneMatched) score += 60;

  if (timeDiffMs <= 3 * 60 * 1000) score += 30;
  else if (timeDiffMs <= 10 * 60 * 1000) score += 20;
  else if (timeDiffMs <= 30 * 60 * 1000) score += 10;

  if (recordingDuration > 0 && callLogDuration > 0) {
    if (Math.abs(recordingDuration - callLogDuration) <= 20) score += 15;
  }

  if (/(call|record|rec|phone|voice)/i.test(`${fileName} ${relativePath}`)) score += 5;

  if (!phoneMatched) return 'low';
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
};

export const ensureMediaAudioPermission = async () => {
  const permission = await CallRecordingPlugin.checkMediaAudioPermission();
  if (permission.mediaAudio === 'granted') return true;
  const requested = await CallRecordingPlugin.requestMediaAudioPermission();
  return requested.mediaAudio === 'granted';
};

export const ensureCallLogPermission = async (): Promise<boolean> => {
  const check = await CallLogPlugin.checkCallLogPermissions().catch(() => ({ callLog: 'denied' as const }));
  if (check.callLog === 'granted') return true;
  const requested = await CallLogPlugin.requestCallLogPermissions().catch(() => ({ callLog: 'denied' as const }));
  return requested.callLog === 'granted';
};

const fetchSystemCallLog = async (): Promise<CallLogEntry[]> => {
  try {
    const perm = await CallLogPlugin.checkCallLogPermissions();
    if (perm.callLog !== 'granted') return [];
    const { logs } = await CallLogPlugin.getCallLogs({ limit: 500 });
    return logs || [];
  } catch {
    return [];
  }
};

export const performSystemRecordingScan = async ({
  userId,
  tenantId,
  leads = [],
}: PerformSystemRecordingScanParams): Promise<ImportedSystemRecording[]> => {
  const [{ recordings }, dbResult, systemLogs] = await Promise.all([
    CallRecordingPlugin.listSystemRecordings(),
    supabase
      .from('call_logs')
      .select('id, lead_id, phone, created_at, duration, type')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(400),
    fetchSystemCallLog(),
  ]);

  if (dbResult.error) throw dbResult.error;
  const callLogs = dbResult.data || [];
  const dbOutboundLogs = callLogs.filter((l) => l.type === 'outgoing');

  const mapped = (recordings || []).map((recording) => {
    const combinedText = `${recording.fileName || ''} ${recording.relativePath || ''}`;
    const detectedPhone = extractPhoneFromText(combinedText);
    const targetLast10 = detectedPhone ? toLast10(detectedPhone) : null;
    const recordedAt = recording.lastModified || Date.now();

    // Match against DB call logs (for lead + confidence scoring)
    let best: CallLogMatch | null = null;
    const closeTimeLogs: CallLogMatch[] = [];
    const timestampWindowMs = 1 * 60 * 1000;

    for (const log of callLogs) {
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

      if (!best || score > best.score) best = match;
      if (timeDiffMs <= timestampWindowMs) closeTimeLogs.push(match);
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

    const direction = resolveDirection(
      recordedAt,
      recording.fileName || '',
      recording.relativePath || '',
      targetLast10,
      systemLogs,
      dbOutboundLogs,
    );

    return {
      ...recording,
      detectedPhone,
      matchedCallLogId,
      matchedLeadId,
      matchedPhone,
      confidence,
      direction,
    } as ImportedSystemRecording;
  });

  return mapped.slice(0, 30);
};

export const importSystemRecording = async ({
  recording,
  userId,
  tenantId,
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
    .eq('tenant_id', tenantId)
    .eq('file_path', storagePathCandidate)
    .limit(1);

  if (dedupeError) throw dedupeError;
  if (existingRows && existingRows.length > 0) return false;

  const fileData = await CallRecordingPlugin.getSystemRecordingFile({ contentUri: recording.contentUri });
  if (!fileData.base64) throw new Error('Imported file is empty');

  const byteCharacters = atob(fileData.base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }

  const blob = new Blob([new Uint8Array(byteNumbers)], { type: fileData.mimeType || 'audio/mp4' });
  const uploadedPath = await uploadRecording(blob, filename);
  if (!uploadedPath) throw new Error('Upload failed');

  let callLogId = recording.confidence === 'low' ? null : recording.matchedCallLogId;
  if (!callLogId) {
    const { data: insertedCallLog, error: callLogInsertError } = await supabase
      .from('call_logs')
      .insert({
        tenant_id: tenantId,
        phone: recording.detectedPhone || recording.matchedPhone || 'Unknown',
        duration: recording.duration || 0,
        type: recording.direction,
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
      tenant_id: tenantId,
      lead_id: leadId,
      type: 'call',
      title: `${recording.direction === 'incoming' ? 'Inbound' : 'Outbound'} call recording imported`,
      description: `${recording.direction === 'incoming' ? 'Incoming' : 'Outgoing'} call (${recording.duration || 0}s) imported from device recorder`,
      metadata: {
        recording_id: recordingData.id,
        call_log_id: callLogId,
        source: 'device-call-recorder',
        matched_confidence: recording.confidence,
        direction: recording.direction,
      },
      user_id: userId,
    });
  }

  analyzeRecording({
    recordingId: recordingData.id,
    callDetails: { duration: recording.duration || 0, callType: recording.direction },
  });

  return true;
};

// Syncs missed calls from the Android system call log into call_logs + lead_activities.
// Recordings don't exist for missed calls — this is the only way to capture them.
export const syncMissedCalls = async ({
  userId,
  tenantId,
  leads,
}: {
  userId: string;
  tenantId: string;
  leads: Lead[];
}): Promise<number> => {
  const systemLogs = await fetchSystemCallLog();
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000; // last 30 days
  const missedLogs = systemLogs.filter((l) => l.type === 'missed' && l.timestamp > cutoffMs);
  if (missedLogs.length === 0) return 0;

  const cutoffIso = new Date(cutoffMs).toISOString();
  const { data: existingMissed } = await supabase
    .from('call_logs')
    .select('phone, created_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('type', 'missed')
    .gte('created_at', cutoffIso);

  let synced = 0;
  for (const log of missedLogs) {
    const alreadyExists = existingMissed?.some(
      (existing) =>
        toLast10(existing.phone) === toLast10(log.phone) &&
        Math.abs(new Date(existing.created_at).getTime() - log.timestamp) < 2 * 60 * 1000,
    );
    if (alreadyExists) continue;

    const matchedLead = leads.find((lead) => toLast10(lead.phone) === toLast10(log.phone));

    const { data: insertedLog, error } = await supabase
      .from('call_logs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        phone: log.phone,
        contact_name: log.name || null,
        duration: 0,
        type: 'missed',
        lead_id: matchedLead?.id || null,
        notes: 'Missed call synced from device',
        outcome: null,
        created_at: new Date(log.timestamp).toISOString(),
      })
      .select('id')
      .single();

    if (error) continue;

    if (matchedLead && insertedLog) {
      await supabase.from('lead_activities').insert({
        tenant_id: tenantId,
        lead_id: matchedLead.id,
        user_id: userId,
        type: 'call',
        title: `Missed call from ${log.name || log.phone}`,
        description: `Lead called back but the call was not answered`,
        metadata: {
          source: 'system-call-log',
          call_type: 'missed',
          call_log_id: insertedLog.id,
        },
      });
    }

    synced++;
  }

  return synced;
};
