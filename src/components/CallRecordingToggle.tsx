import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { useCallRecordingService } from '@/hooks/useCallRecordingService';
import { useNativeAudioRecorder } from '@/hooks/useNativeAudioRecorder';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useAuth } from '@/contexts/AuthContext';
import { CallRecordingPlugin } from '@/services/nativePlugins';

export const CallRecordingToggle = () => {
  const [isUploadingDebugRecording, setIsUploadingDebugRecording] = useState(false);
  const {
    isServiceRunning,
    isProcessing,
    hasPermissions,
    permissionState,
    lastCallEvent,
    debugTrace,
    isNative,
    startService,
    stopService,
    requestPermissions,
    checkPermissions,
    refreshDebugTrace,
    clearDebugTrace,
  } = useCallRecordingService();
  const {
    isRecording,
    duration,
    filePath,
    startRecording,
    stopRecording,
  } = useNativeAudioRecorder();
  const { uploadRecording, createRecording } = useCallRecordings();
  const { user } = useAuth();

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      await startService();
    } else {
      await stopService();
    }
  };

  const handleDebugRecording = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (!result?.filePath || !user) return;

      try {
        setIsUploadingDebugRecording(true);
        const fileData = await CallRecordingPlugin.getRecordingFile({ filePath: result.filePath });
        if (!fileData.exists || !fileData.base64) {
          throw new Error('Debug recording file was not found on device');
        }

        const byteCharacters = atob(fileData.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: fileData.mimeType });
        const filename = `debug_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.m4a`;
        const storagePath = await uploadRecording(blob, filename);
        if (!storagePath) {
          throw new Error('Upload failed');
        }

        await createRecording.mutateAsync({
          file_path: storagePath,
          file_url: null,
          duration: result.duration || 0,
          lead_id: null,
          call_log_id: null,
          user_id: user.id,
          ai_summary: null,
          ai_next_actions: null,
          transcription: 'Manual debug recording',
        });
      } catch (error) {
        console.error('Debug recording upload failed:', error);
      } finally {
        setIsUploadingDebugRecording(false);
      }
      return;
    }

    await startRecording(`debug_recording_${Date.now()}.m4a`);
  };

  if (!isNative) {
    return (
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <MicOff className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">Auto Call Recording</p>
            <p className="text-xs text-muted-foreground">
              Available only on native Android app
            </p>
          </div>
        </div>
        <Badge variant="outline">Web Only</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Permission status */}
      {!hasPermissions && (
        <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-sm">Permissions Required</p>
              <p className="text-xs text-muted-foreground">
                Grant permissions for call recording
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={requestPermissions}
          >
            Grant
          </Button>
        </div>
      )}

      {!hasPermissions && permissionState && (
        <div className="px-4 py-3 text-xs text-muted-foreground bg-muted/30 rounded-lg border">
          <p>Microphone: {permissionState.microphone}</p>
          <p>Phone: {permissionState.phoneState}</p>
          <p>Call log: {permissionState.callLog}</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 px-2 text-xs"
            onClick={checkPermissions}
          >
            Refresh permission status
          </Button>
        </div>
      )}

      {/* Recording toggle */}
      <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-3">
          {isServiceRunning ? (
            <div className="relative">
              <Mic className="h-5 w-5 text-green-500" />
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            </div>
          ) : (
            <MicOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label htmlFor="call-recording" className="font-medium">
              Auto Call Recording
            </Label>
            <p className="text-xs text-muted-foreground">
              {isServiceRunning 
                ? 'Recording all incoming & outgoing calls' 
                : 'Enable to automatically record calls'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="call-recording"
            checked={isServiceRunning}
            onCheckedChange={handleToggle}
            disabled={isProcessing}
          />
        </div>
      </div>

      {/* Status indicator */}
      {isServiceRunning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          <p className="text-xs text-green-600 dark:text-green-400">
            Call recording service is active in background
          </p>
        </div>
      )}

      <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Manual Recording Test</p>
          <p className="text-xs text-muted-foreground">
            Use this to verify native audio capture and Supabase upload without relying on phone-state broadcasts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isRecording ? 'destructive' : 'secondary'}
            onClick={handleDebugRecording}
            disabled={isUploadingDebugRecording}
          >
            {isRecording ? (
              <>
                <MicOff className="w-4 h-4 mr-2" />
                Stop Test Recording
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                Start Test Recording
              </>
            )}
          </Button>
          {isUploadingDebugRecording && (
            <div className="flex items-center text-xs text-muted-foreground">
              <Upload className="w-3 h-3 mr-1" />
              Uploading debug file...
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isRecording
            ? `Recording in progress: ${duration}s`
            : filePath
              ? `Last local debug file: ${filePath}`
              : 'No debug recording captured yet'}
        </p>
      </div>

      <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Native Call-State Debug Trace</p>
            <p className="text-xs text-muted-foreground">
              This shows whether Android delivered the phone-state broadcast and what the native receiver/service did next.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={refreshDebugTrace}>
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={clearDebugTrace}>
              Clear
            </Button>
          </div>
        </div>

        {lastCallEvent && (
          <div className="rounded-md border bg-background/60 p-3 text-xs text-muted-foreground">
            Last JS call event: {lastCallEvent.callType} {lastCallEvent.state ?? 'ended'}
            {lastCallEvent.phoneNumber ? ` • ${lastCallEvent.phoneNumber}` : ''}
            {typeof lastCallEvent.duration === 'number' ? ` • ${lastCallEvent.duration}s` : ''}
          </div>
        )}

        <div className="max-h-64 overflow-auto rounded-md border bg-background/60">
          {debugTrace.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              No native trace entries yet. If this stays empty after a real phone call, the receiver is likely not firing on this device.
            </div>
          ) : (
            <div className="divide-y">
              {[...debugTrace].reverse().map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{entry.source}</span>
                    <span className="text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallRecordingToggle;
