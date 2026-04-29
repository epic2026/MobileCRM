import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useQueryClient } from '@tanstack/react-query';

export type AgentActionType =
  | 'add_lead'
  | 'update_lead'
  | 'call_lead'
  | 'whatsapp_lead'
  | 'email_lead'
  | 'add_activity'
  | 'add_note'
  | 'add_task'
  | 'add_meeting'
  | 'import_recordings'
  | 'none';

export interface AgentAction {
  type: AgentActionType;
  params: Record<string, unknown>;
  executed?: boolean;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const sanitizeAgentAction = (action: AgentAction | undefined): AgentAction => {
  if (!action) {
    return { type: 'none', params: {} };
  }

  const params = action.params ?? {};

  switch (action.type) {
    case 'add_lead':
      return isNonEmptyString(params.name) && isNonEmptyString(params.phone) ? action : { type: 'none', params: {} };
    case 'update_lead':
      return isNonEmptyString(params.lead_id) && params.updates && typeof params.updates === 'object' && !Array.isArray(params.updates)
        ? action
        : { type: 'none', params: {} };
    case 'call_lead':
    case 'whatsapp_lead':
      return isNonEmptyString(params.phone) ? action : { type: 'none', params: {} };
    case 'email_lead':
      return isNonEmptyString(params.email) ? action : { type: 'none', params: {} };
    case 'add_activity':
    case 'add_meeting':
      return isNonEmptyString(params.lead_id) && isNonEmptyString(params.title) ? action : { type: 'none', params: {} };
    case 'add_note':
      return isNonEmptyString(params.lead_id) && (isNonEmptyString(params.note) || isNonEmptyString(params.title))
        ? action
        : { type: 'none', params: {} };
    case 'add_task':
      return isNonEmptyString(params.lead_id) && isNonEmptyString(params.title) ? action : { type: 'none', params: {} };
    case 'import_recordings':
    case 'none':
    default:
      return action;
  }
};

const normalizeAgentAction = (rawAction: unknown): AgentAction | undefined => {
  if (!rawAction || typeof rawAction !== 'object') return undefined;

  const candidate = rawAction as { type?: unknown; params?: unknown };
  if (typeof candidate.type !== 'string') return undefined;

  const allowedTypes: AgentActionType[] = [
    'add_lead',
    'update_lead',
    'call_lead',
    'whatsapp_lead',
    'email_lead',
    'add_activity',
    'add_note',
    'add_task',
    'add_meeting',
    'import_recordings',
    'none',
  ];

  const type = allowedTypes.includes(candidate.type as AgentActionType)
    ? (candidate.type as AgentActionType)
    : 'none';

  const params =
    candidate.params && typeof candidate.params === 'object' && !Array.isArray(candidate.params)
      ? (candidate.params as Record<string, unknown>)
      : {};

  return { type, params };
};

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: AgentAction;
  suggestions?: string[];
  timestamp: Date;
  isLoading?: boolean;
}

interface UseAIAgentOptions {
  onCall: (phone: string, name: string, leadId?: string) => void;
  onWhatsApp: (phone: string, name: string, leadId?: string) => void;
  onImportRecordings: () => void;
}

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

interface LightweightLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
}

const isLikelyJwt = (token: string | null | undefined) =>
  typeof token === 'string' && token.split('.').length === 3;

const statusAliases: Record<string, LeadStatus> = {
  new: 'new',
  contacted: 'contacted',
  contact: 'contacted',
  qualified: 'qualified',
  proposal: 'proposal',
  negotiation: 'negotiation',
  negotiated: 'negotiation',
  won: 'won',
  closedwon: 'won',
  lost: 'lost',
  closedlost: 'lost',
};

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const findLeadFromMessage = (message: string, leads: LightweightLead[]): LightweightLead | null => {
  const normalizedMessage = normalizeText(message);
  const messageDigits = message.replace(/\D/g, '');

  if (messageDigits.length >= 8) {
    const byPhone = leads.find((lead) => lead.phone.replace(/\D/g, '').endsWith(messageDigits.slice(-10)));
    if (byPhone) return byPhone;
  }

  let bestLead: LightweightLead | null = null;
  let bestScore = 0;

  for (const lead of leads) {
    const tokens = normalizeText(lead.name).split(' ').filter((token) => token.length >= 3);
    const score = tokens.reduce((sum, token) => (normalizedMessage.includes(token) ? sum + 1 : sum), 0);
    if (score > bestScore) {
      bestScore = score;
      bestLead = lead;
    }
  }

  return bestScore > 0 ? bestLead : null;
};

const extractStatusUpdate = (message: string): LeadStatus | null => {
  const normalized = normalizeText(message).replace(/\s+/g, '');
  for (const [alias, status] of Object.entries(statusAliases)) {
    if (normalized.includes(alias)) return status;
  }
  return null;
};

const inferActionLocally = (text: string, leads: LightweightLead[]): AgentAction => {
  const message = text.trim();
  const normalized = normalizeText(message);
  const lead = findLeadFromMessage(message, leads);

  const isCallIntent = /\b(call|dial|ring|phone)\b/.test(normalized);
  if (isCallIntent && lead) {
    return {
      type: 'call_lead',
      params: { lead_id: lead.id, lead_name: lead.name, phone: lead.phone },
    };
  }

  const isTaskIntent = /\b(task|follow up|followup|todo|to do|remind)\b/.test(normalized) && /\b(add|create|set|make)\b/.test(normalized);
  if (isTaskIntent && lead) {
    return {
      type: 'add_task',
      params: {
        lead_id: lead.id,
        lead_name: lead.name,
        title: `Follow up with ${lead.name}`,
        description: message,
        due_date: null,
      },
    };
  }

  const isActivityIntent = /\b(activity|log activity|log interaction|add activity)\b/.test(normalized);
  if (isActivityIntent && lead) {
    return {
      type: 'add_activity',
      params: {
        lead_id: lead.id,
        lead_name: lead.name,
        type: 'note',
        title: `Activity logged for ${lead.name}`,
        description: message,
      },
    };
  }

  const isNotesIntent = /\b(note|notes)\b/.test(normalized) && /\b(add|append|save|update|write)\b/.test(normalized);
  if (isNotesIntent && lead) {
    return {
      type: 'add_note',
      params: {
        lead_id: lead.id,
        lead_name: lead.name,
        title: `Note for ${lead.name}`,
        note: message,
      },
    };
  }

  const isUpdateIntent = /\b(update|change|move|mark)\b/.test(normalized) && /\b(lead|status)\b/.test(normalized);
  if (isUpdateIntent && lead) {
    const status = extractStatusUpdate(normalized);
    if (status) {
      return {
        type: 'update_lead',
        params: {
          lead_id: lead.id,
          lead_name: lead.name,
          updates: { status },
        },
      };
    }
  }

  return { type: 'none', params: {} };
};

export const useAIAgent = ({ onCall, onWhatsApp, onImportRecordings }: UseAIAgentOptions) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;
  const queryClient = useQueryClient();
  // Keep conversation history in a ref to avoid stale closure
  const historyRef = useRef<{ role: string; content: string }[]>([]);

  const getFriendlyErrorDetails = (rawError: string) => {
    const normalizedError = rawError.toLowerCase();

    if (normalizedError.includes('openai_api_key') || normalizedError.includes('not configured')) {
      return {
        message: 'ARIA backend is missing its OpenAI key. Add OPENAI_API_KEY in Supabase Edge Function secrets.',
        suggestions: ['Try again later', 'Check Edge Function secrets'],
      };
    }

    if (normalizedError.includes('unauthorized') || normalizedError.includes('401')) {
      return {
        message: 'Authentication failed. Sign out and log back in before retrying ARIA.',
        suggestions: ['Log in again', 'Try again'],
      };
    }

    if (
      normalizedError.includes('failed to send a request to the edge function') ||
      normalizedError.includes('non-2xx status code') ||
      normalizedError.includes('failed to fetch') ||
      normalizedError.includes('network error') ||
      normalizedError.includes('fetch') ||
      normalizedError.includes('functions/v1/ai-agent')
    ) {
      return {
        message: 'ARIA backend is unreachable right now. Check that the ai-agent Edge Function is deployed and that your internet connection is working.',
        suggestions: ['Try again', 'Check Edge Functions in Supabase'],
      };
    }

    return {
      message: `Error: ${rawError.slice(0, 120)}`,
      suggestions: ['Try again', 'Check browser console'],
    };
  };

  const executeAction = useCallback(
    async (action: AgentAction) => {
      if (!action || action.type === 'none') return;

      const safeParams = (action.params ?? {}) as Record<string, unknown>;

      switch (action.type) {
        case 'add_lead': {
          if (!user || !tenantId) break;
          const { name, phone, email, company, status, value, notes, source } = safeParams as {
            name: string;
            phone: string;
            email?: string;
            company?: string;
            status?: string;
            value?: number;
            notes?: string;
            source?: string;
          };
          await supabase.from('leads').insert({
            name,
            phone,
            email: email ?? null,
            company: company ?? null,
            status: (status ?? 'new') as 'new',
            value: value ?? null,
            notes: notes ?? null,
            source: source ?? null,
            user_id: user.id,
            tenant_id: tenantId,
          });
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          break;
        }

        case 'update_lead': {
          const { lead_id, updates } = safeParams as {
            lead_id: string;
            updates: Record<string, unknown>;
          };
          if (lead_id && updates) {
            await supabase.from('leads').update(updates).eq('id', lead_id);
            queryClient.invalidateQueries({ queryKey: ['leads'] });
          }
          break;
        }

        case 'call_lead': {
          const { phone, lead_name, lead_id } = safeParams as {
            phone: string;
            lead_name: string;
            lead_id: string;
          };
          if (phone) onCall(phone, lead_name ?? '', lead_id);
          break;
        }

        case 'whatsapp_lead': {
          const { phone, lead_name, lead_id } = safeParams as {
            phone: string;
            lead_name: string;
            lead_id: string;
          };
          if (phone) onWhatsApp(phone, lead_name ?? '', lead_id);
          break;
        }

        case 'email_lead': {
          const { email } = safeParams as { email: string };
          if (email) window.location.href = `mailto:${email}`;
          break;
        }

        case 'add_activity':
        case 'add_note':
        case 'add_meeting': {
          const { lead_id, type, title, description } = safeParams as {
            lead_id: string;
            type: string;
            title: string;
            description?: string;
          };
          if (!user || !lead_id) break;

          if (action.type === 'add_note') {
            const noteText = isNonEmptyString((safeParams as { note?: string }).note)
              ? ((safeParams as { note: string }).note)
              : description ?? title ?? 'Note added by ARIA';

            const { data: leadData } = await supabase.from('leads').select('notes').eq('id', lead_id).single();
            const existingNotes = typeof leadData?.notes === 'string' ? leadData.notes.trim() : '';
            const nextNotes = existingNotes ? `${existingNotes}\n${noteText}` : noteText;

            await supabase.from('leads').update({ notes: nextNotes }).eq('id', lead_id);
            queryClient.invalidateQueries({ queryKey: ['leads'] });
          }

          await supabase.from('lead_activities').insert({
            lead_id,
            type: type ?? 'note',
            title: title ?? 'Note',
            description: description ?? null,
            metadata: {},
            user_id: user.id,
            tenant_id: tenantId ?? '',
          });
          queryClient.invalidateQueries({ queryKey: ['lead_activities', lead_id] });
          queryClient.invalidateQueries({ queryKey: ['lead_activities'] });
          break;
        }

        case 'add_task': {
          const { lead_id, title, description, due_date } = safeParams as {
            lead_id: string;
            title: string;
            description?: string;
            due_date?: string;
          };
          if (!user || !lead_id) break;
          await supabase.from('lead_tasks').insert({
            lead_id,
            title: title ?? 'Task',
            description: description ?? null,
            due_date: due_date ?? null,
            status: 'pending',
            user_id: user.id,
            tenant_id: tenantId ?? '',
          });
          queryClient.invalidateQueries({ queryKey: ['lead_tasks', lead_id] });
          queryClient.invalidateQueries({ queryKey: ['lead_tasks'] });
          break;
        }

        case 'import_recordings': {
          onImportRecordings();
          break;
        }
      }
    },
    [user, tenantId, queryClient, onCall, onWhatsApp, onImportRecordings],
  );

  const fetchLeadsForFallback = useCallback(async (): Promise<LightweightLead[]> => {
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, phone, email, notes')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error || !Array.isArray(data)) {
      return [];
    }

    return data as LightweightLead[];
  }, []);

  const getValidAccessToken = useCallback(async () => {
    const {
      data: { session: currentSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('❌ Session lookup failed:', sessionError.message);
      throw new Error('Authentication failed. Unable to read current session.');
    }

    if (!currentSession) {
      throw new Error('Authentication failed. No active session found.');
    }

    if (!isLikelyJwt(currentSession.access_token)) {
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !isLikelyJwt(refreshedData.session?.access_token)) {
        throw new Error('Authentication failed. Invalid session token.');
      }
      return refreshedData.session.access_token;
    }

    const expiresAtMs = (currentSession.expires_at ?? 0) * 1000;
    const shouldRefresh = !expiresAtMs || expiresAtMs - Date.now() < 60_000;
    if (!shouldRefresh) {
      const { data: currentUser, error: userError } = await supabase.auth.getUser();
      if (!userError && currentUser.user) {
        return currentSession.access_token;
      }
    }

    console.warn('⚠️ Session token may be stale, attempting refresh...');
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !isLikelyJwt(refreshedData.session?.access_token)) {
      console.error('❌ Session refresh failed:', refreshError?.message || 'No refreshed session');
      throw new Error('Authentication failed. Sign out and log back in before retrying ARIA.');
    }

    const { data: refreshedUser, error: refreshedUserError } = await supabase.auth.getUser();
    if (refreshedUserError || !refreshedUser.user) {
      console.error('❌ Refreshed session user lookup failed:', refreshedUserError?.message || 'No user');
      throw new Error('Authentication failed. Sign out and log back in before retrying ARIA.');
    }

    console.log('✅ Session refreshed successfully for user:', refreshedUser.user.id);
    return refreshedData.session.access_token;
  }, []);

  const invokeAgent = useCallback(
    async (message: string, conversationHistory: { role: string; content: string }[], accessToken: string) => {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;
      const makeRequest = (token: string) =>
        fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message,
            conversationHistory: conversationHistory.slice(-8),
          }),
        });

      let response = await makeRequest(accessToken);

      if (response.status === 401) {
        const retryToken = await getValidAccessToken();
        if (!isLikelyJwt(retryToken)) {
          throw new Error('Authentication failed. Sign out and log back in before retrying ARIA.');
        }
        response = await makeRequest(retryToken);
      }

      const responseText = await response.text();
      let parsed: unknown = null;

      try {
        parsed = responseText ? JSON.parse(responseText) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const details =
          (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
            ? parsed.message
            : responseText) || response.statusText;
        throw new Error(`AI agent request failed (${response.status}): ${details.slice(0, 200)}`);
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('AI agent returned an invalid response.');
      }

      return parsed as { message?: string; action?: unknown; suggestions?: unknown };
    },
    [getValidAccessToken],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: AgentMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      const loadingId = `a-${Date.now() + 1}`;
      const loadingMsg: AgentMessage = {
        id: loadingId,
        role: 'assistant',
        content: '',
        isLoading: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setIsLoading(true);

      // Snapshot history before the current message for the API call
      const historySnapshot = [...historyRef.current];
      // Update history with user message
      historyRef.current = [...historyRef.current, { role: 'user', content: text.trim() }];

      try {
        const accessToken = await getValidAccessToken();
        console.log('✅ ARIA access token ready');

        console.log('🔄 Invoking ai-agent function...');
        const data = await invokeAgent(text.trim(), historySnapshot, accessToken);

        if (!data) {
          console.error('❌ Empty response from function');
          throw new Error('No response from ARIA. Please try again.');
        }

        console.log('✅ API response received:', {
          hasMessage: !!data?.message,
          hasAction: !!data?.action,
          actionType: normalizeAgentAction(data?.action)?.type,
        });

        let action = sanitizeAgentAction(normalizeAgentAction(data.action));

        if (action.type === 'none') {
          const leads = await fetchLeadsForFallback();
          const inferred = inferActionLocally(text.trim(), leads);
          if (inferred.type !== 'none') {
            action = inferred;
          }
        }

        // Execute side-effect actions
        if (action && action.type !== 'none') {
          await executeAction(action);
        }

        const assistantMsg: AgentMessage = {
          id: loadingId,
          role: 'assistant',
          content: data.message ?? 'Done!',
          action: action ? { ...action, executed: true } : undefined,
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
          timestamp: new Date(),
        };

        // Update history with assistant response
        historyRef.current = [...historyRef.current, { role: 'assistant', content: assistantMsg.content }];

        setMessages((prev) =>
          prev.map((m) => (m.id === loadingId ? assistantMsg : m)),
        );
      } catch (err) {
        const fullError = err instanceof Error ? err.message : String(err);
        console.error('🔴 AI agent error:', fullError);
        console.error('Full error object:', err);
        const friendlyError = getFriendlyErrorDetails(fullError);

        const errorMsg: AgentMessage = {
          id: loadingId,
          role: 'assistant',
          content: `⚠️ ${friendlyError.message}`,
          suggestions: friendlyError.suggestions,
          timestamp: new Date(),
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingId ? errorMsg : m)),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, executeAction, getValidAccessToken, invokeAgent, fetchLeadsForFallback],
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  return { messages, isLoading, sendMessage, clearConversation };
};
