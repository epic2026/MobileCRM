import { useState, useEffect, useCallback } from 'react';
import { CallLogPlugin, CallLogEntry, isNativeApp } from '@/services/nativePlugins';
import { useToast } from '@/hooks/use-toast';

export const useNativeCallLogs = () => {
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

  const checkPermission = useCallback(async () => {
    if (!isNativeApp()) {
      setHasPermission(false);
      return false;
    }

    try {
      const result = await CallLogPlugin.checkCallLogPermissions();
      const granted = result.callLog === 'granted';
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('Error checking call log permission:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isNativeApp()) {
      toast({
        title: 'Not Available',
        description: 'Call log access requires the native Android app',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const result = await CallLogPlugin.requestCallLogPermissions();
      const granted = result.callLog === 'granted';
      setHasPermission(granted);
      
      if (!granted) {
        toast({
          title: 'Permission Denied',
          description: 'Call log access was denied. Please enable in Settings.',
          variant: 'destructive',
        });
      }
      
      return granted;
    } catch (error) {
      console.error('Error requesting call log permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to request permission',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const fetchCallLogs = useCallback(async (limit = 50) => {
    if (!isNativeApp()) {
      return [];
    }

    setIsLoading(true);
    try {
      const hasAccess = hasPermission ?? await checkPermission();
      
      if (!hasAccess) {
        const granted = await requestPermission();
        if (!granted) return [];
      }

      const result = await CallLogPlugin.getCallLogs({ limit });
      setCallLogs(result.logs);
      return result.logs;
    } catch (error) {
      console.error('Error fetching call logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch call logs',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [hasPermission, checkPermission, requestPermission, toast]);

  // Initial permission check
  useEffect(() => {
    if (isNativeApp()) {
      checkPermission();
    }
  }, [checkPermission]);

  return {
    callLogs,
    isLoading,
    hasPermission,
    isNative: isNativeApp(),
    fetchCallLogs,
    requestPermission,
    checkPermission,
  };
};
