import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Clock, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { CallRecording, useCallRecordings } from '@/hooks/useCallRecordings';
import { supabase } from '@/integrations/supabase/client';

interface CallRecordingPlayerProps {
  recording: CallRecording;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const normalizeActionText = (action: string | { action: string; priority?: string; timeframe?: string }) => {
  if (typeof action === 'string') return action;

  const parts = [action.action, action.timeframe ? `(${action.timeframe})` : ''].filter(Boolean);
  return parts.join(' ');
};

const shouldAutoCreateTask = (actions: (string | { action: string; priority?: string; timeframe?: string })[]) => {
  return actions.some((action) => {
    const text = normalizeActionText(action).toLowerCase();
    return text.includes('schedule a call') || text.includes('create a task');
  });
};

const CallRecordingPlayer = ({ recording }: CallRecordingPlayerProps) => {
  const { analyzeRecording } = useCallRecordings();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const alreadyCreatedTaskRef = useRef(false);

  useEffect(() => {
    if (
      alreadyCreatedTaskRef.current ||
      !recording.ai_next_actions?.length ||
      !recording.lead_id ||
      !recording.processed_at ||
      !shouldAutoCreateTask(recording.ai_next_actions)
    ) {
      return;
    }

    alreadyCreatedTaskRef.current = true;

    const createAIRecommendedTask = async () => {
      const normalizedActions = recording.ai_next_actions
        .map(normalizeActionText)
        .filter(Boolean);

      if (!normalizedActions.length) return;

      const description = `AI suggested action items from recording ${recording.id}:\n${normalizedActions.join('\n')}`;

      try {
        const { data: existingTasks } = await supabase
          .from('lead_tasks')
          .select('id')
          .eq('lead_id', recording.lead_id)
          .ilike('description', `%${recording.id}%`)
          .limit(1);

        if (existingTasks?.length) return;

        const { error } = await supabase.from('lead_tasks').insert({
          lead_id: recording.lead_id,
          tenant_id: currentTenant?.id ?? recording.tenant_id,
          title: normalizedActions[0]?.slice(0, 80) || 'Follow up after call',
          description,
          due_date: null,
          status: 'pending',
          user_id: user?.id ?? null,
        });

        if (error) {
          console.error('AI task creation failed:', error);
          return;
        }

        toast({
          title: 'AI Task Created',
          description: 'A follow-up task was created from AI next actions.',
        });
        queryClient.invalidateQueries({ queryKey: ['lead_tasks'] });
      } catch (error) {
        console.error('AI task creation error:', error);
      }
    };

    void createAIRecommendedTask();
  }, [recording.ai_next_actions, recording.lead_id, recording.processed_at, recording.id, queryClient, toast, user?.id]);

  useEffect(() => {
    const loadAudioUrl = async () => {
      if (recording.id && !audioUrl) {
        setIsLoadingUrl(true);
        const { data, error } = await supabase.functions.invoke('get-recording-url', {
          body: { recording_id: recording.id },
        });

        if (error || !data?.signedUrl) {
          console.error('CallRecordingPlayer signed URL error:', error);
          setAudioUrl(null);
        } else {
          setAudioUrl(data.signedUrl);
        }
        setIsLoadingUrl(false);
      }
    };
    loadAudioUrl();
  }, [recording.id, audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isPlaying) {
      audio.pause();
    } else {
      await audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const progress = recording.duration > 0 ? (currentTime / recording.duration) * 100 : 0;
  const hasAiInsights = !!recording.ai_summary || !!recording.ai_next_actions?.length;
  const isAiPending = !recording.processed_at;

  const handleRetryAnalysis = () => {
    if (isRetryingAnalysis) return;

    setIsRetryingAnalysis(true);
    analyzeRecording.mutate(
      {
        recordingId: recording.id,
        callDetails: {
          duration: recording.duration || 0,
          callType: 'unknown',
        },
      },
      {
        onSettled: () => setIsRetryingAnalysis(false),
      }
    );
  };

  return (
    <div className="space-y-2">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      
      {/* Player Controls */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 rounded-full"
          onClick={togglePlay}
          disabled={isLoadingUrl || !audioUrl}
        >
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
        </Button>
        
        <div className="flex-1">
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatDuration(Math.floor(currentTime))}</span>
          <span>/</span>
          <span>{formatDuration(recording.duration)}</span>
        </div>
      </div>

      {/* AI Summary & Actions */}
      <div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Sparkles className="w-3 h-3" />
          <span>AI Summary & Next Actions</span>
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-2"
            >
              {isAiPending && !hasAiInsights && (
                <div className="p-2 bg-muted/40 rounded-lg">
                  <p className="text-xs font-medium text-foreground mb-1">AI Analysis In Progress</p>
                  <p className="text-xs text-muted-foreground">
                    The recording is being read by AI. Summary and next actions will appear here once processing completes.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryAnalysis}
                    disabled={isRetryingAnalysis || analyzeRecording.isPending}
                    className="mt-2 h-7 px-2 text-[11px]"
                  >
                    {isRetryingAnalysis || analyzeRecording.isPending ? 'Retrying...' : 'Retry AI Analysis'}
                  </Button>
                </div>
              )}

              {recording.ai_summary && (
                <div className="p-2 bg-primary/5 rounded-lg">
                  <p className="text-xs font-medium text-primary mb-1">Call Summary</p>
                  <p className="text-xs text-foreground">{recording.ai_summary}</p>
                </div>
              )}

              {recording.ai_next_actions && recording.ai_next_actions.length > 0 && (
                <div className="p-2 bg-accent/5 rounded-lg">
                  <p className="text-xs font-medium text-accent mb-2">Next Action Items</p>
                  <ul className="space-y-1.5 list-disc pl-4">
                    {recording.ai_next_actions.map((action, idx) => (
                      <li key={idx} className="text-xs text-foreground leading-relaxed">
                        {normalizeActionText(action)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!isAiPending && !hasAiInsights && (
                <div className="p-2 bg-muted/40 rounded-lg">
                  <p className="text-xs font-medium text-foreground mb-1">No AI Insights Yet</p>
                  <p className="text-xs text-muted-foreground">
                    AI could not generate a summary for this recording yet. Try refreshing later after processing completes.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryAnalysis}
                    disabled={isRetryingAnalysis || analyzeRecording.isPending}
                    className="mt-2 h-7 px-2 text-[11px]"
                  >
                    {isRetryingAnalysis || analyzeRecording.isPending ? 'Retrying...' : 'Retry AI Analysis'}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CallRecordingPlayer;
