import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

export type AgentActionType =
  | 'update_lead'
  | 'call_lead'
  | 'whatsapp_lead'
  | 'email_lead'
  | 'add_activity'
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
    'update_lead',
    'call_lead',
    'whatsapp_lead',
    'email_lead',
    'add_activity',
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

export const useAIAgent = ({ onCall, onWhatsApp, onImportRecordings }: UseAIAgentOptions) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
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
        case 'add_meeting': {
          const { lead_id, type, title, description } = safeParams as {
            lead_id: string;
            type: string;
            title: string;
            description?: string;
          };
          if (!user || !lead_id) break;
          await supabase.from('lead_activities').insert({
            lead_id,
            type: type ?? 'note',
            title: title ?? 'Note',
            description: description ?? null,
            metadata: {},
            user_id: user.id,
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
    [user, queryClient, onCall, onWhatsApp, onImportRecordings],
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
        // Get current session to ensure auth token is fresh
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.error('❌ Session error:', sessionError?.message || 'No session');
          throw new Error('Not authenticated. Please log in again.');
        }
        console.log('✅ Session valid for user:', session.user.id);

        console.log('🔄 Invoking ai-agent function...');
        const { data, error } = await supabase.functions.invoke('ai-agent', {
          body: {
            message: text.trim(),
            conversationHistory: historySnapshot.slice(-8),
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (error) {
          console.error('❌ Function invocation error:', error.message);
          throw new Error(`Function error: ${error.message}`);
        }

        if (!data) {
          console.error('❌ Empty response from function');
          throw new Error('No response from ARIA. Please try again.');
        }

        console.log('✅ API response received:', {
          hasMessage: !!data?.message,
          hasAction: !!data?.action,
          actionType: data?.action?.type,
        });

        const action = sanitizeAgentAction(normalizeAgentAction(data.action));

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
    [isLoading, executeAction],
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  return { messages, isLoading, sendMessage, clearConversation };
};
