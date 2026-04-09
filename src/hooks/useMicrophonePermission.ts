import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

/**
 * Request microphone permission at app startup for voice input.
 * Only requests once per app session.
 */
export const useMicrophonePermission = () => {
  const { toast } = useToast();

  useEffect(() => {
    const requestPermission = async () => {
      // Skip if browser doesn't support permissions API
      if (!navigator.permissions || !navigator.mediaDevices) {
        console.log('Permissions API or Media Devices API not available');
        return;
      }

      try {
        // Check if microphone permission is already granted
        const result = await navigator.permissions.query({ name: 'microphone' });
        console.log('Microphone permission status:', result.state);

        if (result.state === 'granted') {
          console.log('✅ Microphone already permitted');
          return;
        }

        if (result.state === 'denied') {
          console.warn('⚠️ Microphone permission denied. User must enable it in settings.');
          toast({
            title: 'Microphone Access Required',
            description: 'Enable microphone in settings to use voice commands with ARIA.',
            variant: 'destructive',
          });
          return;
        }

        // State is 'prompt' - request permission
        if (result.state === 'prompt') {
          console.log('📍 Requesting microphone permission...');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          console.log('✅ Microphone permission granted');
          toast({
            title: 'Microphone Enabled',
            description: 'You can now use voice commands with ARIA.',
          });
        }
      } catch (error) {
        console.error('❌ Microphone permission error:', error);
        if (error instanceof DOMException) {
          if (error.name === 'NotAllowedError') {
            toast({
              title: 'Permission Denied',
              description: 'Microphone permission was denied. You can enable it in browser/app settings.',
              variant: 'destructive',
            });
          } else if (error.name === 'NotFoundError') {
            toast({
              title: 'No Microphone',
              description: 'No microphone found on this device.',
              variant: 'destructive',
            });
          }
        }
      }
    };

    // Request permission only once on mount
    requestPermission();
  }, [toast]);
};
