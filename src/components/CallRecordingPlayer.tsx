import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Clock, Sparkles, ChevronDown, ChevronUp, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CallRecording } from '@/hooks/useCallRecordings';
import { supabase } from '@/integrations/supabase/client';

interface CallRecordingPlayerProps {
  recording: CallRecording;
  compact?: boolean;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const CallRecordingPlayer = ({ recording, compact = false }: CallRecordingPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const loadAudioUrl = async () => {
      if (recording.file_path && !audioUrl) {
        setIsLoadingUrl(true);
        const { data, error } = await supabase.storage
          .from('call-recordings')
          .createSignedUrl(recording.file_path, 3600);

        if (error) {
          console.error('CallRecordingPlayer signed URL error:', error);
          setAudioUrl(null);
        } else {
          setAudioUrl(data.signedUrl);
        }
        setIsLoadingUrl(false);
      }
    };
    loadAudioUrl();
  }, [recording.file_path, audioUrl]);

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
      {(recording.ai_summary || recording.ai_next_actions) && (
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Sparkles className="w-3 h-3" />
            <span>AI Insights</span>
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
                {recording.ai_summary && (
                  <div className="p-2 bg-primary/5 rounded-lg">
                    <p className="text-xs font-medium text-primary mb-1">Summary</p>
                    <p className="text-xs text-foreground">{recording.ai_summary}</p>
                  </div>
                )}
                
                {recording.ai_next_actions && recording.ai_next_actions.length > 0 && (
                  <div className="p-2 bg-accent/5 rounded-lg">
                    <p className="text-xs font-medium text-accent mb-2">Next Actions</p>
                    <div className="space-y-1.5">
                      {recording.ai_next_actions.map((action, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[9px] shrink-0 ${
                              action.priority === 'high'
                                ? 'border-destructive/30 text-destructive'
                                : action.priority === 'medium'
                                ? 'border-warning/30 text-warning'
                                : 'border-muted text-muted-foreground'
                            }`}
                          >
                            {action.priority}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground">{action.action}</p>
                            <p className="text-[10px] text-muted-foreground">{action.timeframe}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default CallRecordingPlayer;
