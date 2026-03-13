import { useState, useCallback, useRef } from 'react';
import { AudioRecorderPlugin, isNativeApp } from '@/services/nativePlugins';
import { useToast } from '@/hooks/use-toast';

export interface RecordingState {
  isRecording: boolean;
  duration: number;
  filePath: string | null;
}

export const useNativeAudioRecorder = () => {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    filePath: null,
  });
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const checkPermission = useCallback(async () => {
    if (!isNativeApp()) {
      setHasPermission(false);
      return false;
    }

    try {
      const result = await AudioRecorderPlugin.checkAudioPermissions();
      const granted = result.microphone === 'granted';
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isNativeApp()) {
      toast({
        title: 'Not Available',
        description: 'Audio recording requires the native Android app',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const result = await AudioRecorderPlugin.requestAudioPermissions();
      const granted = result.microphone === 'granted';
      setHasPermission(granted);
      
      if (!granted) {
        toast({
          title: 'Permission Denied',
          description: 'Microphone access was denied. Please enable in Settings.',
          variant: 'destructive',
        });
      }
      
      return granted;
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to request permission',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const startRecording = useCallback(async (filename?: string) => {
    if (!isNativeApp()) {
      toast({
        title: 'Not Available',
        description: 'Audio recording requires the native Android app',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const hasAccess = hasPermission ?? await checkPermission();
      
      if (!hasAccess) {
        const granted = await requestPermission();
        if (!granted) return null;
      }

      const result = await AudioRecorderPlugin.startRecording({ filename });
      
      setState({
        isRecording: true,
        duration: 0,
        filePath: result.filePath,
      });

      // Start duration timer
      timerRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          duration: prev.duration + 1,
        }));
      }, 1000);

      toast({
        title: 'Recording Started',
        description: 'Microphone is now recording',
      });

      return result;
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Error',
        description: 'Failed to start recording',
        variant: 'destructive',
      });
      return null;
    }
  }, [hasPermission, checkPermission, requestPermission, toast]);

  const stopRecording = useCallback(async () => {
    if (!state.isRecording) {
      return null;
    }

    try {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const result = await AudioRecorderPlugin.stopRecording();
      
      setState({
        isRecording: false,
        duration: result.duration || 0,
        filePath: result.filePath,
      });

      toast({
        title: 'Recording Stopped',
        description: `Saved ${result.duration || 0} seconds of audio`,
      });

      return result;
    } catch (error) {
      console.error('Error stopping recording:', error);
      setState(prev => ({ ...prev, isRecording: false }));
      toast({
        title: 'Error',
        description: 'Failed to stop recording',
        variant: 'destructive',
      });
      return null;
    }
  }, [state.isRecording, toast]);

  return {
    ...state,
    hasPermission,
    isNative: isNativeApp(),
    startRecording,
    stopRecording,
    requestPermission,
    checkPermission,
  };
};
