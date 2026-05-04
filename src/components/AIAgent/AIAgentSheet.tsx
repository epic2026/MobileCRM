import { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Mic, MicOff, AlertCircle, Send, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAgent, AgentActionType } from '@/hooks/useAIAgent';
import { cn } from '@/lib/utils';
import { isNativeApp, MicrophonePermissionPlugin, NativeSpeechRecognitionPlugin } from '@/services/nativePlugins';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

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

const pickFemaleVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null =>
  voices.find((v) => /female/i.test(v.name)) ??
  voices.find((v) => /\b(samantha|victoria|karen|moira|veena|fiona|tessa|zira|google us english)\b/i.test(v.name)) ??
  voices.find((v) => v.lang.startsWith('en')) ??
  voices[0] ??
  null;

const speakAriaResponse = (text: string): void => {
  if (isNativeApp()) {
    void TextToSpeech.speak({ text, lang: 'en-US', rate: 1.0, pitch: 1.1, volume: 1.0, category: 'ambient' });
    return;
  }
  if (!('speechSynthesis' in window)) return;
  const doSpeak = (voices: SpeechSynthesisVoice[]) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickFemaleVoice(voices);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.pitch = 1.1;
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak(voices);
  } else {
    const onVoicesChanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;
    window.setTimeout(() => {
      if (window.speechSynthesis.onvoiceschanged === onVoicesChanged) window.speechSynthesis.onvoiceschanged = null;
      doSpeak(window.speechSynthesis.getVoices());
    }, 500);
  }
};

const stopSpeaking = (): void => {
  if (isNativeApp()) { void TextToSpeech.stop(); } else { window.speechSynthesis?.cancel(); }
};

const QUICK_PROMPTS = [
  { label: "Today's overview", prompt: "Give me a quick CRM overview for today" },
  { label: "Pending follow-ups", prompt: "Which leads need follow-up?" },
  { label: "Overdue tasks", prompt: "Show me pending or overdue tasks" },
  { label: "Pipeline value", prompt: "Show me my pipeline value breakdown by stage" },
  { label: "Import recordings", prompt: "Import my call recordings" },
  { label: "What can you do?", prompt: "What actions can you do for me?" },
];

const ACTION_LABELS: Partial<Record<AgentActionType, string>> = {
  add_lead:          'Lead created',
  update_lead:       'Lead updated',
  call_lead:         'Call started',
  whatsapp_lead:     'WhatsApp opened',
  email_lead:        'Email opened',
  add_activity:      'Activity logged',
  add_task:          'Task created',
  add_meeting:       'Meeting scheduled',
  import_recordings: 'Recordings imported',
};

// Fixed heights for deterministic waveform rendering
const WAVE_HEIGHTS = [8, 16, 12, 22, 14, 20, 10, 18, 12, 8];

const VoiceWaveform = ({ isActive }: { isActive: boolean }) => (
  <div className="flex items-end gap-[3px] h-7">
    {WAVE_HEIGHTS.map((h, i) => (
      <motion.div
        key={i}
        className="w-[3px] rounded-full flex-shrink-0"
        style={{ background: 'rgba(167,139,250,0.75)' }}
        animate={isActive
          ? { height: [`${Math.max(4, h * 0.35)}px`, `${h}px`, `${Math.max(4, h * 0.35)}px`] }
          : { height: '4px' }
        }
        transition={{
          duration: 0.35 + (i % 3) * 0.12,
          repeat: isActive ? Infinity : 0,
          delay: i * 0.06,
          ease: 'easeInOut',
        }}
      />
    ))}
  </div>
);

const AIAgentSheet = ({ isOpen, onClose, onCall, onWhatsApp, onImportRecordings }: AIAgentSheetProps) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceDraftRef = useRef('');
  const voiceBaseInputRef = useRef('');
  const shouldAutoSendVoiceRef = useRef(false);
  const isVoiceStartPendingRef = useRef(false);
  const spokenMsgIdRef = useRef<string | null>(null);
  const autoPromptedThisOpenRef = useRef(false);

  const { messages, isLoading, sendMessage, clearConversation } = useAIAgent({ onCall, onWhatsApp, onImportRecordings });
  const sendMessageRef = useRef(sendMessage);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => { sendMessageRef.current = sendMessage; isLoadingRef.current = isLoading; }, [isLoading, sendMessage]);

  useEffect(() => { messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 320);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isLoading) return;
    if (spokenMsgIdRef.current === lastMsg.id) return;
    spokenMsgIdRef.current = lastMsg.id;
    speakAriaResponse(lastMsg.content);
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      autoPromptedThisOpenRef.current = false;
      isVoiceStartPendingRef.current = false;
      stopSpeaking();
      spokenMsgIdRef.current = null;
      return;
    }
    if (autoPromptedThisOpenRef.current || isLoading || isListening) return;
    autoPromptedThisOpenRef.current = true;
    const timer = window.setTimeout(() => { void handleVoiceStart(true); }, 450);
    return () => window.clearTimeout(timer);
  }, [isListening, isLoading, isOpen]);

  useEffect(() => {
    if (isNativeApp()) return;
    const SpeechRecog = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecog) return;
    const recognition = new SpeechRecog();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.onstart = () => { setIsListening(true); setVoiceError(''); voiceDraftRef.current = ''; isVoiceStartPendingRef.current = false; };
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t; else interimTranscript += t;
      }
      voiceDraftRef.current = `${voiceDraftRef.current} ${finalTranscript}`.trim();
      const combined = [voiceDraftRef.current, interimTranscript.trim()].filter(Boolean).join(' ').trim();
      setInputText([voiceBaseInputRef.current.trim(), combined].filter(Boolean).join(' ').trim());
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') { setIsListening(false); isVoiceStartPendingRef.current = false; return; }
      const msg = event.error === 'no-speech' ? 'No speech detected. Try again.'
        : event.error === 'network' ? 'Network error. Check connection.'
        : event.error === 'not-allowed' ? 'Microphone permission denied.'
        : `Voice error: ${event.error}`;
      setVoiceError(msg);
      setIsListening(false);
      shouldAutoSendVoiceRef.current = false;
      isVoiceStartPendingRef.current = false;
    };
    recognition.onend = () => {
      setIsListening(false);
      isVoiceStartPendingRef.current = false;
      const spoken = [voiceBaseInputRef.current.trim(), voiceDraftRef.current.trim()].filter(Boolean).join(' ').trim();
      setInputText(spoken);
      if (shouldAutoSendVoiceRef.current && spoken && !isLoadingRef.current) {
        sendMessageRef.current(spoken);
        setInputText('');
      }
      shouldAutoSendVoiceRef.current = false;
      voiceDraftRef.current = '';
      voiceBaseInputRef.current = '';
    };
    recognitionRef.current = recognition;
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const handleVoiceStart = async (silentIfAlreadyRunning = false) => {
    if (!isNativeApp() && !recognitionRef.current) { setVoiceError('Speech recognition not available.'); return; }
    if (isListening || isVoiceStartPendingRef.current) { if (!silentIfAlreadyRunning) setVoiceError('Voice capture already running.'); return; }
    isVoiceStartPendingRef.current = true;
    if (isNativeApp()) {
      try {
        const perm = await MicrophonePermissionPlugin.checkMicrophonePermission();
        if (perm.microphone !== 'granted') {
          const req = await MicrophonePermissionPlugin.requestMicrophonePermission();
          if (req.microphone !== 'granted') {
            setVoiceError('Microphone permission denied.');
            try { await MicrophonePermissionPlugin.openAppSettings(); } catch {}
            isVoiceStartPendingRef.current = false;
            return;
          }
        }
      } catch { setVoiceError('Unable to verify microphone permission.'); isVoiceStartPendingRef.current = false; return; }
    }
    if (!isNativeApp()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setVoiceError(msg.toLowerCase().includes('permission') ? 'Microphone permission denied.' : msg.toLowerCase().includes('notfound') ? 'No microphone found.' : `Microphone error: ${msg.slice(0, 60)}`);
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
        const result = await NativeSpeechRecognitionPlugin.startListening({ prompt: 'Speak your CRM command', language: 'en-IN' });
        const transcript = result.transcript?.trim();
        if (transcript) handleSend([voiceBaseInputRef.current.trim(), transcript].filter(Boolean).join(' ').trim());
      } catch (error) {
        shouldAutoSendVoiceRef.current = false;
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.toLowerCase().includes('cancelled')) setVoiceError('Unable to capture voice command.');
      } finally { setIsListening(false); isVoiceStartPendingRef.current = false; }
      return;
    }
    try {
      recognitionRef.current!.start();
    } catch (error) {
      shouldAutoSendVoiceRef.current = false;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('already started')) { if (!silentIfAlreadyRunning) setVoiceError('Voice capture already running.'); }
      else if (!silentIfAlreadyRunning) setVoiceError('Unable to start voice capture.');
      else console.warn('Voice autostart failed:', msg);
    } finally { isVoiceStartPendingRef.current = false; }
  };

  const handleVoiceStop = () => {
    if (recognitionRef.current) { shouldAutoSendVoiceRef.current = true; isVoiceStartPendingRef.current = false; recognitionRef.current.stop(); }
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

  const handleChip = (prompt: string) => { if (!isLoading) sendMessage(prompt); };

  const statusLabel = isListening ? 'Listening...' : isLoading ? 'Working on it...' : 'Ready · Talk to me';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
          style={{ background: 'linear-gradient(160deg, #0f0a1e 0%, #130d28 60%, #0d0a1e 100%)' }}
        >
          {/* Subtle dot grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.06) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* Soft radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 80% 55% at 50% 40%, rgba(88,28,135,0.2) 0%, transparent 100%)' }}
          />

          {/* ── HEADER ── */}
          <div className="relative flex-shrink-0 px-5 pt-12 pb-4">
            <div className="flex items-center justify-between">
              {/* Orb + name */}
              <div className="flex items-center gap-3">
                <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))' }}
                    animate={{ scale: [1, 1.15, 1], opacity: [0.7, 0.4, 0.7] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)' }}
                  />
                  <Sparkles className="w-4 h-4 relative z-10" style={{ color: '#a78bfa' }} strokeWidth={1.5} />
                </div>

                <div>
                  <p
                    className="font-bold text-xl tracking-wide"
                    style={{ background: 'linear-gradient(135deg, #c4b5fd, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  >
                    ARIA
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: isListening ? '#a78bfa' : isLoading ? '#f59e0b' : '#8b5cf6' }}
                      animate={{ opacity: [1, 0.35, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    />
                    <p className="text-xs" style={{ color: 'rgba(167,139,250,0.65)' }}>
                      {statusLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.22)', color: 'rgba(167,139,250,0.65)' }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full transition-all"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: 'rgba(167,139,250,0.55)' }}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              className="mt-4 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.28), transparent)' }}
            />
          </div>

          {/* ── MESSAGES ── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 overscroll-contain" style={{ scrollbarWidth: 'none' }}>

            {/* Welcome / empty state */}
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex flex-col items-center pt-4 gap-6"
              >
                {/* Breathing orb */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `rgba(139,92,246,${0.07 - i * 0.02})`,
                        border: `1px solid rgba(139,92,246,${0.18 - i * 0.04})`,
                      }}
                      animate={{ scale: [1, 1.3 + i * 0.22], opacity: [0.6, 0] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.65, ease: 'easeOut' }}
                    />
                  ))}
                  <div
                    className="relative w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(99,102,241,0.18))',
                      border: '1.5px solid rgba(139,92,246,0.45)',
                      boxShadow: '0 0 40px rgba(139,92,246,0.28), inset 0 0 20px rgba(139,92,246,0.07)',
                    }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="w-9 h-9" style={{ color: 'rgba(167,139,250,0.85)' }} strokeWidth={1.25} />
                    </motion.div>
                  </div>
                </div>

                <div className="text-center">
                  <p
                    className="font-bold text-2xl"
                    style={{ background: 'linear-gradient(135deg, #e9d5ff, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  >
                    Hey, I'm ARIA
                  </p>
                  <p className="text-sm mt-1.5" style={{ color: 'rgba(167,139,250,0.55)' }}>
                    Your AI CRM co-pilot
                  </p>
                  <p className="text-xs mt-2 max-w-[240px] mx-auto leading-relaxed" style={{ color: 'rgba(139,92,246,0.4)' }}>
                    Update leads · Call & WhatsApp · Log activities · Create tasks
                  </p>
                </div>

                {/* Quick prompts */}
                <div className="w-full flex flex-wrap gap-2 justify-center">
                  {QUICK_PROMPTS.map((qp) => (
                    <motion.button
                      key={qp.label}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleChip(qp.prompt)}
                      className="text-xs px-3.5 py-2 rounded-full transition-all"
                      style={{
                        background: 'rgba(139,92,246,0.07)',
                        border: '1px solid rgba(139,92,246,0.25)',
                        color: 'rgba(196,181,253,0.75)',
                      }}
                    >
                      {qp.label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Chat messages */}
            {messages.map((msg) => (
              <div key={msg.id}>
                <motion.div
                  initial={{ opacity: 0, x: msg.role === 'user' ? 16 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22 }}
                  className={cn('flex items-end gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {/* ARIA avatar */}
                  {msg.role === 'assistant' && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-1"
                      style={{
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.22))',
                        border: '1px solid rgba(139,92,246,0.38)',
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} strokeWidth={1.5} />
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={cn(
                      'max-w-[78%] px-4 py-2.5 text-sm leading-relaxed rounded-3xl',
                      msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                    )}
                    style={
                      msg.role === 'user'
                        ? {
                            background: 'linear-gradient(135deg, rgba(109,40,217,0.48), rgba(67,56,202,0.42))',
                            border: '1px solid rgba(139,92,246,0.32)',
                            color: '#ede9fe',
                          }
                        : {
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(139,92,246,0.18)',
                            color: 'rgba(233,213,255,0.88)',
                          }
                    }
                  >
                    {msg.isLoading ? (
                      <div className="flex items-center gap-1.5 py-0.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-2 h-2 rounded-full"
                            style={{ background: 'rgba(167,139,250,0.65)' }}
                            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25 }}
                          />
                        ))}
                      </div>
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
                    transition={{ delay: 0.1 }}
                    className="flex items-center gap-1.5 ml-10 mt-1"
                  >
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: '#a78bfa' }}
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="text-[10px]" style={{ color: 'rgba(167,139,250,0.6)' }}>
                      ✓ {ACTION_LABELS[msg.action.type] ?? 'Action executed'}
                    </span>
                  </motion.div>
                )}

                {/* Suggestion chips */}
                {msg.suggestions && msg.suggestions.length > 0 && !msg.isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap gap-1.5 ml-10 mt-2"
                  >
                    {msg.suggestions.map((s, idx) => (
                      <motion.button
                        key={idx}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleChip(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full transition-all"
                        style={{
                          background: 'rgba(139,92,246,0.07)',
                          border: '1px solid rgba(139,92,246,0.2)',
                          color: 'rgba(196,181,253,0.7)',
                        }}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </div>
            ))}

            <div ref={messagesBottomRef} />
          </div>

          {/* ── BOTTOM PANEL ── */}
          <div className="flex-shrink-0 pb-10 pt-2">
            <div
              className="h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.22), transparent)' }}
            />

            {/* Voice error */}
            <AnimatePresence>
              {voiceError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 mx-5 mt-3 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                  <p className="text-xs text-red-400">{voiceError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mic + waveform */}
            <div className="flex flex-col items-center mt-5 mb-4 gap-3">
              <div style={{ height: 28, opacity: isListening ? 1 : 0, transition: 'opacity 0.3s ease' }}>
                <VoiceWaveform isActive={isListening} />
              </div>

              <button
                onClick={isListening ? handleVoiceStop : () => void handleVoiceStart(false)}
                disabled={isLoading}
                aria-label={isListening ? 'Stop listening' : 'Tap to speak'}
                className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all"
                style={{
                  background: isListening
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.65), rgba(79,70,229,0.55))'
                    : 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(99,102,241,0.17))',
                  border: isListening
                    ? '2px solid rgba(167,139,250,0.72)'
                    : '2px solid rgba(139,92,246,0.32)',
                  boxShadow: isListening
                    ? '0 0 32px rgba(139,92,246,0.45), 0 8px 28px rgba(109,40,217,0.4)'
                    : '0 0 18px rgba(139,92,246,0.18)',
                  opacity: isLoading ? 0.45 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {/* Pulse rings when listening */}
                {isListening && [0, 1].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{ border: '1.5px solid rgba(167,139,250,0.5)' }}
                    animate={{ scale: [1, 1.65 + i * 0.3], opacity: [0.55, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.42, ease: 'easeOut' }}
                  />
                ))}

                {/* Loading spinner */}
                {isLoading && (
                  <motion.div
                    className="absolute inset-1 rounded-full pointer-events-none"
                    style={{ border: '1.5px solid transparent', borderTopColor: 'rgba(167,139,250,0.55)' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}

                {isListening ? (
                  <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
                    <MicOff className="w-7 h-7" style={{ color: '#c4b5fd' }} />
                  </motion.div>
                ) : (
                  <Mic className="w-7 h-7" style={{ color: isLoading ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.78)' }} />
                )}
              </button>

              <p className="text-xs" style={{ color: 'rgba(139,92,246,0.45)' }}>
                {isListening ? 'tap to stop' : isLoading ? 'processing...' : 'tap to speak'}
              </p>
            </div>

            {/* Text input */}
            <div className="flex items-center gap-2 mx-4">
              <div
                className="flex-1 flex items-center rounded-2xl overflow-hidden"
                style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
                  style={{ color: '#e9d5ff', caretColor: '#a78bfa' }}
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSend()}
                disabled={!inputText.trim() || isLoading}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: inputText.trim() && !isLoading
                    ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                    : 'rgba(139,92,246,0.1)',
                  boxShadow: inputText.trim() && !isLoading ? '0 4px 16px rgba(139,92,246,0.38)' : 'none',
                }}
              >
                <Send
                  className="w-4 h-4"
                  style={{ color: inputText.trim() && !isLoading ? 'white' : 'rgba(139,92,246,0.28)' }}
                />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAgentSheet;
