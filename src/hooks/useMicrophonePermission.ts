import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { isNativeApp, MicrophonePermissionPlugin } from '@/services/nativePlugins';

export const useMicrophonePermission = () => {
  const { toast } = useToast();

  useEffect(() => {
    const requestMicrophonePermission = async () => {
      try {
        if (isNativeApp()) {
          const nativeStatus = await MicrophonePermissionPlugin.checkMicrophonePermission();

          if (nativeStatus.microphone !== 'granted') {
            const nativeRequest = await MicrophonePermissionPlugin.requestMicrophonePermission();

            if (nativeRequest.microphone !== 'granted') {
              toast({
                title: 'Microphone Access Denied',
                description: 'Enable microphone permission in Android app settings to use ARIA voice commands.',
                variant: 'destructive',
              });
              try {
                await MicrophonePermissionPlugin.openAppSettings();
              } catch (settingsError) {
                console.warn('⚠️ Could not open app settings:', settingsError);
              }
              return;
            }
          }

          console.log('✅ Native microphone permission granted');
          return;
        }

        // Check if we have the Permissions API available
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            console.log('🎤 Microphone permission status:', result.state);

            if (result.state === 'denied') {
              toast({
                title: 'Microphone Access Denied',
                description: 'Please enable microphone permission in your device settings to use voice commands.',
                variant: 'destructive',
              });
            } else if (result.state === 'prompt') {
              // Permission is yet to be prompted, this is good
              console.log('🎤 Microphone permission will be prompted on first use');
            } else if (result.state === 'granted') {
              console.log('✅ Microphone permission already granted');
            }

            // Listen for permission changes
            result.addEventListener('change', () => {
              console.log('🎤 Microphone permission status changed:', result.state);
              if (result.state === 'denied') {
                toast({
                  title: 'Microphone Access Denied',
                  description: 'Microphone permission was revoked. Please enable it in settings.',
                  variant: 'destructive',
                });
              }
            });
          } catch (error) {
            console.warn('⚠️ Permissions API query failed:', error);
          }
        } else {
          console.warn('⚠️ Permissions API not available');
        }

        // For browsers/Capacitor that support getUserMedia, we don't need to explicitly request
        // The permission will be requested when the user tries to use voice input
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          console.log('✅ getUserMedia is available');
        } else {
          console.warn('⚠️ getUserMedia not available');
        }
      } catch (error) {
        console.error('❌ Error checking microphone permission:', error);
      }
    };

    requestMicrophonePermission();
  }, [toast]);
};
