import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { X, Send, Sparkles, Zap, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAgent, AgentActionType } from '@/hooks/useAIAgent';
import { cn } from '@/lib/utils';

interface AIAgentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCall: (phone: string, name: string, leadId?: string) => void;
  onWhatsApp: (phone: string, name: string, leadId?: string) => void;
  onImportRecordings: () => void;
}

const QUICK_PROMPTS = [
  { label: "Today's overview 📊", prompt: "Give me a quick CRM overview for today" },
  { label: "Pending follow-ups 📞", prompt: "Which leads need follow-up?" },
  { label: "Overdue tasks ✅", prompt: "Show me pending or overdue tasks" },
  { label: "Pipeline value 💰", prompt: "Show me my pipeline value breakdown by stage" },
  { label: "Import recordings 🎙️", prompt: "Import my call recordings" },
  { label: "What can you do? 💡", prompt: "What actions can you do for me?" },
];

const ACTION_LABELS: Partial<Record<AgentActionType, string>> = {
  update_lead: '✏️ Lead updated',
  call_lead: '📞 Opening dialer',
  whatsapp_lead: '💬 Opening WhatsApp',
  email_lead: '📧 Opening email',
  add_activity: '📝 Activity logged',
  add_task: '✅ Task created',
  add_meeting: '📅 Meeting scheduled',
  import_recordings: '🎙️ Importing recordings',
};

const TypingDots = () => (
  <div className="flex items-center gap-1 px-1 py-1">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full bg-muted-foreground/50"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
      />
    ))}
  </div>
);

const AIAgentSheet = ({
  isOpen,
  onClose,
  onCall,
  onWhatsApp,
  onImportRecordings,
}: AIAgentSheetProps) => {
  const [inputText, setInputText] = useState('');
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isLoading, sendMessage, clearConversation } = useAIAgent({
    onCall,
    onWhatsApp,
    onImportRecordings,
  });

  // Scroll to newest message
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when sheet opens
  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 320);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInputText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChip = (prompt: string) => {
    if (isLoading) return;
    sendMessage(prompt);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
          >
            <div
              className="w-full max-w-md bg-background rounded-t-3xl flex flex-col overflow-hidden pointer-events-auto"
              style={{
                height: '88vh',
                maxHeight: 700,
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                >
                  <Sparkles className="w-4 h-4 text-white" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">ARIA</p>
                  <p className="text-[10px] text-muted-foreground">AI CRM Assistant • GPT-4o</p>
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="text-[10px] text-muted-foreground px-2.5 py-1 rounded-full border border-border hover:bg-muted transition-colors mr-1"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-muted/60 flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Messages scroll area */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 overscroll-contain">

                {/* Welcome / empty state */}
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-col items-center pt-2 pb-2 gap-4"
                  >
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                      style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                    >
                      <Sparkles className="w-7 h-7 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-foreground">Hi, I'm ARIA 👋</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[230px] mx-auto">
                        Your AI CRM copilot. I can update leads, call, WhatsApp, log activities, create tasks, and give insights.
                      </p>
                    </div>

                    {/* Quick action chips */}
                    <div className="w-full flex flex-wrap gap-2 justify-center">
                      {QUICK_PROMPTS.map((qp) => (
                        <button
                          key={qp.label}
                          onClick={() => handleChip(qp.prompt)}
                          className="text-[11px] px-3 py-1.5 rounded-full border border-violet-500/35 bg-violet-500/8 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all"
                        >
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Chat messages */}
                {messages.map((msg) => (
                  <div key={msg.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className={cn('flex items-end gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      {/* Avatar */}
                      {msg.role === 'assistant' && (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
                          style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                        >
                          <Sparkles className="w-3 h-3 text-white" strokeWidth={1.75} />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={cn(
                          'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-violet-600 text-white rounded-br-sm'
                            : 'bg-card border border-border text-foreground rounded-bl-sm',
                        )}
                      >
                        {msg.isLoading ? (
                          <TypingDots />
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </motion.div>

                    {/* Action badge */}
                    {msg.action && msg.action.type !== 'none' && msg.action.executed && (
                      <motion.div
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-1 ml-8 mt-1"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] text-emerald-500 font-medium">
                          {ACTION_LABELS[msg.action.type] ?? 'Action performed'}
                        </span>
                      </motion.div>
                    )}

                    {/* Suggestion chips */}
                    {msg.suggestions && msg.suggestions.length > 0 && !msg.isLoading && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.15 }}
                        className="flex flex-wrap gap-1.5 ml-8 mt-2"
                      >
                        {msg.suggestions.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleChip(s)}
                            className="text-[11px] px-2.5 py-1 rounded-full border border-violet-500/30 bg-violet-500/6 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all"
                          >
                            {s}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                ))}

                <div ref={messagesBottomRef} />
              </div>

              {/* Input bar */}
              <div className="flex-shrink-0 px-4 pt-2 pb-3 border-t border-border">
                <div className="flex items-center gap-2 bg-muted/40 rounded-2xl px-4 py-2.5 border border-border focus-within:border-violet-500/50 transition-colors">
                  {/* Hint icon */}
                  <Zap className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder='Try "Call Rahul" or "Update Priya to Qualified"'
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
                    disabled={isLoading}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                      inputText.trim() && !isLoading
                        ? 'bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]'
                        : 'bg-muted text-muted-foreground',
                    )}
                    aria-label="Send"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[9px] text-muted-foreground/40 text-center mt-1.5">
                  ARIA acts on your behalf — actions are executed immediately
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AIAgentSheet;
