import { useState, useRef, useEffect } from 'react';
import { X, Sparkles, CheckCircle2, Mic, MicOff, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAgent, AgentActionType } from '@/hooks/useAIAgent';
import { cn } from '@/lib/utils';
import { isNativeApp, MicrophonePermissionPlugin, NativeSpeechRecognitionPlugin } from '@/services/nativePlugins';

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// TypeScript declaration for speech recognition
declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

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

const AI_ACTIONS = [
  'Call a lead (native dialer)',
  'Create a task for a lead',
  'Add activity on a lead',
  'Update lead status/details',
  'Add notes to a lead',
  'Open WhatsApp for a lead',
  'Open email for a lead',
  'Import call recordings',
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
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceDraftRef = useRef('');
  const voiceBaseInputRef = useRef('');
  const shouldAutoSendVoiceRef = useRef(false);
  const isVoiceStartPendingRef = useRef(false);
  const autoPromptedThisOpenRef = useRef(false);

  const { messages, isLoading, sendMessage, clearConversation } = useAIAgent({
    onCall,
    onWhatsApp,
    onImportRecordings,
  });
  const sendMessageRef = useRef(sendMessage);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    isLoadingRef.current = isLoading;
  }, [isLoading, sendMessage]);

  // Scroll to newest message
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when sheet opens
  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 320);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      autoPromptedThisOpenRef.current = false;
      isVoiceStartPendingRef.current = false;
      return;
    }

    if (autoPromptedThisOpenRef.current || isLoading || isListening) {
      return;
    }

    autoPromptedThisOpenRef.current = true;
    const timer = window.setTimeout(() => {
      void handleVoiceStart(true);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [isListening, isLoading, isOpen]);

  const hasBrowserSpeechSupport = Boolean(window.webkitSpeechRecognition || window.SpeechRecognition);

  // Initialize speech recognition once
  useEffect(() => {
    if (isNativeApp()) {
      return;
    }

    const SpeechRecog = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecog) {
      console.warn('Speech Recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecog();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Indian English for better context

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError('');
      voiceDraftRef.current = '';
      isVoiceStartPendingRef.current = false;
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      voiceDraftRef.current = `${voiceDraftRef.current} ${finalTranscript}`.trim();
      const combinedTranscript = [voiceDraftRef.current, interimTranscript.trim()].filter(Boolean).join(' ').trim();
      const nextValue = [voiceBaseInputRef.current.trim(), combinedTranscript].filter(Boolean).join(' ').trim();
      setInputText(nextValue);
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') {
        setIsListening(false);
        isVoiceStartPendingRef.current = false;
        return;
      }
      const errorMsg =
        event.error === 'no-speech'
          ? 'No speech detected. Try again.'
          : event.error === 'network'
            ? 'Network error. Check connection.'
            : event.error === 'not-allowed'
              ? 'Microphone permission denied.'
              : `Voice error: ${event.error}`;
      setVoiceError(errorMsg);
      setIsListening(false);
      shouldAutoSendVoiceRef.current = false;
      isVoiceStartPendingRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);
      isVoiceStartPendingRef.current = false;
      const spokenText = [voiceBaseInputRef.current.trim(), voiceDraftRef.current.trim()].filter(Boolean).join(' ').trim();
      setInputText(spokenText);

      if (shouldAutoSendVoiceRef.current && spokenText && !isLoadingRef.current) {
        sendMessageRef.current(spokenText);
        setInputText('');
      }

      shouldAutoSendVoiceRef.current = false;
      voiceDraftRef.current = '';
      voiceBaseInputRef.current = '';
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleVoiceStart = async (silentIfAlreadyRunning = false) => {
    if (!isNativeApp() && !recognitionRef.current) {
      setVoiceError('Speech recognition not available on your device.');
      return;
    }

    if (isListening || isVoiceStartPendingRef.current) {
      if (!silentIfAlreadyRunning) {
        setVoiceError('Voice capture is already running.');
      }
      return;
    }

    isVoiceStartPendingRef.current = true;

    if (isNativeApp()) {
      try {
        const permission = await MicrophonePermissionPlugin.checkMicrophonePermission();
        if (permission.microphone !== 'granted') {
          const requested = await MicrophonePermissionPlugin.requestMicrophonePermission();
          if (requested.microphone !== 'granted') {
            setVoiceError('Microphone permission denied. Enable it in Android app settings.');
            try {
              await MicrophonePermissionPlugin.openAppSettings();
            } catch (settingsError) {
              console.warn('⚠️ Could not open app settings:', settingsError);
            }
            isVoiceStartPendingRef.current = false;
            return;
          }
        }
      } catch (error) {
        console.error('🔴 Native microphone permission check failed:', error);
        setVoiceError('Unable to verify microphone permission on this device.');
        isVoiceStartPendingRef.current = false;
        return;
      }
    }

    if (!isNativeApp()) {
      // Browser speech recognition usually needs a quick getUserMedia preflight.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('🔴 Microphone access failed:', error);
        if (error.toLowerCase().includes('permission')) {
          setVoiceError('Microphone permission denied. Enable in browser/app settings.');
        } else if (error.toLowerCase().includes('notfound')) {
          setVoiceError('No microphone device found.');
        } else {
          setVoiceError(`Microphone error: ${error.slice(0, 60)}`);
        }
        isVoiceStartPendingRef.current = false;
        return;
      }
    }

    setVoiceError('');
    voiceBaseInputRef.current = inputText.trim();
    voiceDraftRef.current = '';
    shouldAutoSendVoiceRef.current = true;

    if (isNativeApp()) {
      try {
        setIsListening(true);
        const result = await NativeSpeechRecognitionPlugin.startListening({
          prompt: 'Speak your CRM command',
          language: 'en-IN',
        });
        const transcript = result.transcript?.trim();
        if (transcript) {
          handleSend([voiceBaseInputRef.current.trim(), transcript].filter(Boolean).join(' ').trim());
        }
      } catch (error) {
        shouldAutoSendVoiceRef.current = false;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes('cancelled')) {
          setVoiceError('Unable to capture voice command on this device.');
        }
      } finally {
        setIsListening(false);
        isVoiceStartPendingRef.current = false;
      }
      return;
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      shouldAutoSendVoiceRef.current = false;
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('already started')) {
        if (!silentIfAlreadyRunning) {
          setVoiceError('Voice capture is already running.');
        }
      } else if (!silentIfAlreadyRunning) {
        setVoiceError('Unable to start voice capture on this device.');
      } else {
        console.warn('Voice autostart failed:', message);
      }
    } finally {
      isVoiceStartPendingRef.current = false;
    }
  };

  const handleVoiceStop = () => {
    if (recognitionRef.current) {
      shouldAutoSendVoiceRef.current = true;
      isVoiceStartPendingRef.current = false;
      recognitionRef.current.stop();
    }
  };

  const handleSend = (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInputText('');
    voiceDraftRef.current = '';
    voiceBaseInputRef.current = '';
    shouldAutoSendVoiceRef.current = false;
    isVoiceStartPendingRef.current = false;
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

                    <div className="w-full rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
                      <p className="text-[11px] font-semibold tracking-wide text-violet-600 mb-2">AI Actions</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {AI_ACTIONS.map((action) => (
                          <div key={action} className="text-[11px] text-violet-700/90 leading-snug">
                            • {action}
                          </div>
                        ))}
                      </div>
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

              {/* Voice action bar */}
              <div className="flex-shrink-0 px-4 pt-2 pb-3 border-t border-border">
                {/* Voice error alert */}
                {voiceError && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 mb-2"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <p className="text-xs text-rose-500">{voiceError}</p>
                  </motion.div>
                )}

                <div className="flex justify-center">
                  <button
                    onClick={isListening ? handleVoiceStop : () => void handleVoiceStart(false)}
                    disabled={isLoading}
                    className={cn(
                      'h-16 w-16 rounded-full border transition-all flex items-center justify-center',
                      isListening
                        ? 'border-violet-500 bg-violet-600 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]'
                        : 'border-violet-300/50 bg-violet-50 hover:bg-violet-100 text-violet-700',
                      isLoading && 'cursor-not-allowed opacity-60',
                    )}
                    aria-label={isListening ? 'Stop listening' : 'Tap to speak'}
                  >
                    {isListening ? (
                      <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                        <MicOff className="h-6 w-6" />
                      </motion.div>
                    ) : (
                      <Mic className="h-6 w-6" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AIAgentSheet;
