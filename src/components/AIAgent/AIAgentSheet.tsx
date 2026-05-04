import { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Mic, MicOff, AlertCircle, Send } from 'lucide-react';
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
  add_lead:          'LEAD CREATED',
  update_lead:       'LEAD UPDATED',
  call_lead:         'DIALER OPENED',
  whatsapp_lead:     'WHATSAPP OPENED',
  email_lead:        'EMAIL OPENED',
  add_activity:      'ACTIVITY LOGGED',
  add_task:          'TASK CREATED',
  add_meeting:       'MEETING SCHEDULED',
  import_recordings: 'RECORDINGS IMPORTED',
};

// HUD corner bracket component
const HudCorner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const base = 'absolute w-5 h-5 pointer-events-none';
  const classes = {
    tl: 'top-3 left-3 border-l-2 border-t-2',
    tr: 'top-3 right-3 border-r-2 border-t-2',
    bl: 'bottom-3 left-3 border-l-2 border-b-2',
    br: 'bottom-3 right-3 border-r-2 border-b-2',
  }[pos];
  return <div className={cn(base, classes)} style={{ borderColor: 'rgba(0,212,255,0.45)' }} />;
};

const CyanDivider = () => (
  <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.55), transparent)' }} />
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

  // ─── STATUS ───────────────────────────────────────────────────────────
  const statusLabel = isListening ? 'LISTENING' : isLoading ? 'PROCESSING' : 'STANDBY';
  const statusColor = isListening ? '#00ff88' : isLoading ? '#ffb700' : '#00d4ff';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
          style={{ background: 'linear-gradient(160deg, #000814 0%, #000c20 60%, #000814 100%)' }}
        >
          {/* ── Hex grid background ── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(0,212,255,0.06) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(0,212,255,0.06) 1px, transparent 1px)`,
              backgroundSize: '44px 44px',
            }}
          />

          {/* ── Central radial glow ── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,55,110,0.35) 0%, transparent 100%)' }}
          />

          {/* ── HUD screen corners ── */}
          <HudCorner pos="tl" />
          <HudCorner pos="tr" />
          <HudCorner pos="bl" />
          <HudCorner pos="br" />

          {/* ══════════════════════════════════════════ HEADER */}
          <div className="relative flex-shrink-0 px-5 pt-10 pb-3">
            <div className="flex items-center justify-between">
              {/* Logo + title */}
              <div className="flex items-center gap-3">
                {/* Spinning ring orb */}
                <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: '1.5px solid rgba(0,212,255,0.5)' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  />
                  <motion.div
                    className="absolute inset-1.5 rounded-full"
                    style={{ border: '1px solid rgba(0,150,255,0.35)' }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                  />
                  <Sparkles className="w-4 h-4" style={{ color: '#00d4ff' }} strokeWidth={1.5} />
                </div>

                <div>
                  <p className="font-mono font-bold text-xl tracking-[0.22em]" style={{ color: '#00d4ff' }}>
                    ARIA
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: statusColor }}
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <p className="font-mono text-[9px] tracking-widest" style={{ color: statusColor }}>
                      {statusLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="font-mono text-[10px] tracking-widest px-3 py-1.5 transition-all"
                    style={{ border: '1px solid rgba(0,212,255,0.25)', color: 'rgba(0,212,255,0.5)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,212,255,0.6)'; (e.currentTarget as HTMLButtonElement).style.color = '#00d4ff'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,212,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,212,255,0.5)'; }}
                  >
                    CLEAR
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center transition-all"
                  style={{ border: '1px solid rgba(0,212,255,0.25)', color: 'rgba(0,212,255,0.5)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,60,60,0.6)'; (e.currentTarget as HTMLButtonElement).style.color = '#ff4444'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,212,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,212,255,0.5)'; }}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <CyanDivider />
            </div>
          </div>

          {/* ══════════════════════════════════════════ MESSAGES */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 overscroll-contain" style={{ scrollbarWidth: 'none' }}>

            {/* ── Empty / Welcome state ── */}
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center pt-6 gap-7"
              >
                {/* Central orb */}
                <div className="relative w-36 h-36 flex items-center justify-center">
                  {/* Ambient expanding rings */}
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full"
                      style={{ inset: 0, border: '1px solid rgba(0,212,255,0.2)' }}
                      animate={{ scale: [1, 1.6 + i * 0.25], opacity: [0.5, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.55, ease: 'easeOut' }}
                    />
                  ))}
                  {/* Static rings */}
                  <div className="absolute inset-6 rounded-full" style={{ border: '1px solid rgba(0,212,255,0.35)' }} />
                  <div className="absolute inset-10 rounded-full" style={{ border: '1px solid rgba(0,150,255,0.4)', background: 'radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 70%)' }} />
                  <Sparkles className="w-10 h-10" style={{ color: 'rgba(0,212,255,0.7)' }} strokeWidth={1} />
                </div>

                <div className="text-center">
                  <p className="font-mono font-bold text-2xl tracking-[0.3em]" style={{ color: '#00d4ff' }}>
                    ARIA ONLINE
                  </p>
                  <p className="font-mono text-[10px] tracking-widest mt-1" style={{ color: 'rgba(0,150,255,0.6)' }}>
                    AI CRM ASSISTANT • GPT-4o
                  </p>
                  <p className="font-mono text-[11px] mt-3 max-w-[260px] mx-auto leading-relaxed" style={{ color: 'rgba(0,212,255,0.4)' }}>
                    Update leads · Call · WhatsApp · Log activities<br />Create tasks · Add leads · Insights
                  </p>
                </div>

                {/* Quick prompts */}
                <div className="w-full flex flex-wrap gap-2 justify-center">
                  {QUICK_PROMPTS.map((qp) => (
                    <motion.button
                      key={qp.label}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleChip(qp.prompt)}
                      className="font-mono text-[10px] tracking-wider px-3 py-1.5 transition-all"
                      style={{ border: '1px solid rgba(0,212,255,0.22)', color: 'rgba(0,212,255,0.6)', background: 'rgba(0,212,255,0.04)' }}
                      onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.55)'; el.style.color = '#00d4ff'; el.style.background = 'rgba(0,212,255,0.1)'; }}
                      onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.22)'; el.style.color = 'rgba(0,212,255,0.6)'; el.style.background = 'rgba(0,212,255,0.04)'; }}
                    >
                      {qp.label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Chat messages ── */}
            {messages.map((msg) => (
              <div key={msg.id}>
                <motion.div
                  initial={{ opacity: 0, x: msg.role === 'user' ? 16 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex items-start gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {/* ARIA avatar */}
                  {msg.role === 'assistant' && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ border: '1px solid rgba(0,212,255,0.45)', background: 'rgba(0,212,255,0.08)' }}
                    >
                      <Sparkles className="w-3 h-3" style={{ color: '#00d4ff' }} strokeWidth={1.5} />
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className="max-w-[80%] px-3.5 py-2.5 text-[12.5px] leading-relaxed font-mono relative overflow-hidden"
                    style={
                      msg.role === 'user'
                        ? { border: '1px solid rgba(0,80,200,0.5)', background: 'rgba(0,60,160,0.2)', color: '#a8d4ff' }
                        : { border: '1px solid rgba(0,212,255,0.28)', background: 'rgba(0,212,255,0.05)', color: '#7dd8ff' }
                    }
                  >
                    {/* Scanline shimmer (ARIA bubbles only) */}
                    {msg.role === 'assistant' && !msg.isLoading && (
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,212,255,0.04) 50%, transparent 60%)' }}
                        animate={{ y: ['-100%', '200%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
                      />
                    )}

                    {msg.isLoading ? (
                      <div className="flex items-center gap-1.5 py-0.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: '#00d4ff' }}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25 }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap relative z-10">{msg.content}</p>
                    )}
                  </div>
                </motion.div>

                {/* Action badge */}
                {msg.action && msg.action.type !== 'none' && msg.action.executed && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-center gap-1.5 ml-9 mt-1"
                  >
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: '#00ff88' }}
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="font-mono text-[9px] tracking-widest" style={{ color: '#00ff88' }}>
                      ◈ {ACTION_LABELS[msg.action.type] ?? 'ACTION EXECUTED'}
                    </span>
                  </motion.div>
                )}

                {/* Suggestion chips */}
                {msg.suggestions && msg.suggestions.length > 0 && !msg.isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap gap-1.5 ml-9 mt-2"
                  >
                    {msg.suggestions.map((s, idx) => (
                      <motion.button
                        key={idx}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleChip(s)}
                        className="font-mono text-[10px] tracking-wide px-2.5 py-1 transition-all"
                        style={{ border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.6)', background: 'transparent' }}
                        onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.5)'; el.style.color = '#00d4ff'; el.style.background = 'rgba(0,212,255,0.08)'; }}
                        onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.2)'; el.style.color = 'rgba(0,212,255,0.6)'; el.style.background = 'transparent'; }}
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

          {/* ══════════════════════════════════════════ BOTTOM PANEL */}
          <div className="flex-shrink-0 pb-10 pt-2">
            <CyanDivider />

            {/* Voice error */}
            <AnimatePresence>
              {voiceError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 mx-5 mt-3 px-3 py-2"
                  style={{ border: '1px solid rgba(255,60,60,0.35)', background: 'rgba(255,30,30,0.07)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#ff6060' }} />
                  <p className="font-mono text-[11px]" style={{ color: '#ff6060' }}>{voiceError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Central mic orb ── */}
            <div className="flex flex-col items-center mt-5 mb-4 gap-2">
              <button
                onClick={isListening ? handleVoiceStop : () => void handleVoiceStart(false)}
                disabled={isLoading}
                aria-label={isListening ? 'Stop listening' : 'Tap to speak'}
                className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all"
                style={{
                  border: isListening
                    ? '2px solid rgba(0,212,255,0.9)'
                    : '2px solid rgba(0,212,255,0.3)',
                  background: isListening
                    ? 'radial-gradient(circle, rgba(0,212,255,0.22) 0%, rgba(0,20,50,0.95) 100%)'
                    : 'radial-gradient(circle, rgba(0,212,255,0.07) 0%, rgba(0,8,20,0.98) 100%)',
                  boxShadow: isListening
                    ? '0 0 32px rgba(0,212,255,0.45), 0 0 80px rgba(0,100,255,0.2), inset 0 0 20px rgba(0,212,255,0.12)'
                    : '0 0 16px rgba(0,212,255,0.12)',
                  opacity: isLoading ? 0.5 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {/* Pulsing rings when listening */}
                {isListening && [0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{ border: '1.5px solid rgba(0,212,255,0.5)' }}
                    animate={{ scale: [1, 1.55 + i * 0.3], opacity: [0.7, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.38, ease: 'easeOut' }}
                  />
                ))}

                {/* Loading spinner ring */}
                {isLoading && (
                  <motion.div
                    className="absolute inset-1 rounded-full pointer-events-none"
                    style={{ border: '1.5px solid transparent', borderTopColor: 'rgba(0,212,255,0.6)' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}

                {isListening ? (
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.55, repeat: Infinity }}>
                    <MicOff className="w-7 h-7" style={{ color: '#00d4ff' }} />
                  </motion.div>
                ) : (
                  <Mic className="w-7 h-7" style={{ color: isLoading ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.7)' }} />
                )}
              </button>

              <p className="font-mono text-[9px] tracking-[0.22em]" style={{ color: 'rgba(0,212,255,0.4)' }}>
                {isListening ? '◉  LISTENING' : isLoading ? '◌  PROCESSING' : '○  TAP TO SPEAK'}
              </p>
            </div>

            {/* ── Text input ── */}
            <div
              className="flex items-center mx-5"
              style={{ border: '1px solid rgba(0,212,255,0.22)', background: 'rgba(0,212,255,0.03)' }}
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="TYPE A COMMAND..."
                className="flex-1 bg-transparent px-3.5 py-3 font-mono text-[12px] outline-none"
                style={{ color: '#7dd8ff', caretColor: '#00d4ff' }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSend()}
                disabled={!inputText.trim() || isLoading}
                className="px-4 py-3 transition-all flex items-center justify-center"
                style={{
                  color: inputText.trim() && !isLoading ? '#00d4ff' : 'rgba(0,212,255,0.25)',
                  borderLeft: '1px solid rgba(0,212,255,0.18)',
                }}
              >
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAgentSheet;
