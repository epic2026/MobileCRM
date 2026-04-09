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

  const executeAction = useCallback(
    async (action: AgentAction) => {
      if (!action || action.type === 'none') return;

      switch (action.type) {
        case 'update_lead': {
          const { lead_id, updates } = action.params as {
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
          const { phone, lead_name, lead_id } = action.params as {
            phone: string;
            lead_name: string;
            lead_id: string;
          };
          if (phone) onCall(phone, lead_name ?? '', lead_id);
          break;
        }

        case 'whatsapp_lead': {
          const { phone, lead_name, lead_id } = action.params as {
            phone: string;
            lead_name: string;
            lead_id: string;
          };
          if (phone) onWhatsApp(phone, lead_name ?? '', lead_id);
          break;
        }

        case 'email_lead': {
          const { email } = action.params as { email: string };
          if (email) window.location.href = `mailto:${email}`;
          break;
        }

        case 'add_activity':
        case 'add_meeting': {
          const { lead_id, type, title, description } = action.params as {
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
          const { lead_id, title, description, due_date } = action.params as {
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
        const { data, error } = await supabase.functions.invoke('ai-agent', {
          body: {
            message: text.trim(),
            conversationHistory: historySnapshot.slice(-8),
          },
        });

        if (error) {
          console.error('❌ Function invocation error:', error.message);
          throw error;
        }

        console.log('✅ API response received:', {
          hasMessage: !!data?.message,
          hasAction: !!data?.action,
          actionType: data?.action?.type,
        });

        const action = data.action as AgentAction | undefined;

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

        const errorDetails =
          fullError.includes('OPENAI_API_KEY') || fullError.includes('not configured')
            ? 'Missing OpenAI API key. Add OPENAI_API_KEY to Supabase Dashboard → Edge Functions → Secrets.'
            : fullError.includes('Unauthorized') || fullError.includes('401')
              ? 'Authentication failed. Check your login.'
              : fullError.includes('fetch')
                ? 'Network error. Check your internet connection.'
                : `Error: ${fullError.slice(0, 80)}`;

        const errorMsg: AgentMessage = {
          id: loadingId,
          role: 'assistant',
          content: `⚠️ ${errorDetails}`,
          suggestions: ['Try again', 'Check logs in browser console'],
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
