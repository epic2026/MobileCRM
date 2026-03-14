import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface CallRecording {
  id: string;
  call_log_id: string | null;
  lead_id: string | null;
  user_id: string;
  file_path: string;
  file_url: string | null;
  duration: number;
  created_at: string;
  ai_summary: string | null;
  ai_next_actions: { action: string; priority: string; timeframe: string }[] | null;
  transcription: string | null;
  processed_at: string | null;
}

export const useCallRecordings = (leadId?: string | null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recordings = [], isLoading, error } = useQuery({
    queryKey: ['call_recordings', leadId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('call_recordings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (leadId) {
        query = query.eq('lead_id', leadId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as CallRecording[];
    },
    enabled: !!user,
  });

  const createRecording = useMutation({
    mutationFn: async (recording: Omit<CallRecording, 'id' | 'created_at' | 'processed_at'>) => {
      const { data, error } = await supabase
        .from('call_recordings')
        .insert(recording)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call_recordings'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const analyzeRecording = useMutation({
    mutationFn: async ({ recordingId, transcription, callDetails }: {
      recordingId: string;
      transcription?: string;
      callDetails: { contactName?: string; duration: number; callType: string };
    }) => {
      const { data, error } = await supabase.functions.invoke('analyze-call', {
        body: { recordingId, transcription, callDetails }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call_recordings'] });
      toast({ title: 'Analysis Complete', description: 'Call has been analyzed with AI insights' });
    },
    onError: (error) => {
      toast({
        title: 'Analysis Skipped',
        description: 'Recording saved, but AI analysis is currently unavailable.',
      });
      console.warn('AI analysis failed:', error.message);
    },
  });

  const uploadRecording = async (file: Blob, filename: string): Promise<string | null> => {
    if (!user) return null;
    
    const filePath = `${user.id}/${filename}`;
    const uploadFile = new File([file], filename, {
      type: file.type || 'audio/mp4',
      lastModified: Date.now(),
    });

    const { error } = await supabase.storage
      .from('call-recordings')
      .upload(filePath, uploadFile, {
        upsert: true,
        contentType: uploadFile.type,
        cacheControl: '3600',
      });
    
    if (error) {
      console.error('Upload error:', error);
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
      return null;
    }
    
    return filePath;
  };

  const getSignedUrl = async (filePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('call-recordings')
      .createSignedUrl(filePath, 3600); // 1 hour expiry
    
    if (error) {
      console.error('Signed URL error:', error);
      return null;
    }
    
    return data.signedUrl;
  };

  return {
    recordings,
    isLoading,
    error,
    createRecording,
    analyzeRecording,
    uploadRecording,
    getSignedUrl,
  };
};
