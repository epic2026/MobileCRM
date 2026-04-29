import { Capacitor, registerPlugin } from '@capacitor/core';

export interface CallLogEntry {
  id: string;
  phone: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed' | 'unknown';
  timestamp: number; // epoch ms from CallLog.Calls.DATE
  duration: number;  // seconds
}

export interface CallLogPlugin {
  getCallLogs(options?: { limit?: number }): Promise<{ logs: CallLogEntry[] }>;
  requestCallLogPermissions(): Promise<{ callLog: 'granted' | 'denied' }>;
  checkCallLogPermissions(): Promise<{ callLog: 'granted' | 'denied' }>;
}

export interface CallRecordingPlugin {
  requestMediaAudioPermission(): Promise<{ mediaAudio: 'granted' | 'denied' }>;
  checkMediaAudioPermission(): Promise<{ mediaAudio: 'granted' | 'denied' }>;
  listSystemRecordings(): Promise<{
    recordings: Array<{
      contentUri: string;
      fileName: string;
      size: number;
      duration: number;
      lastModified: number;
      relativePath: string;
    }>;
  }>;
  getSystemRecordingFile(options: { contentUri: string }): Promise<{
    contentUri: string;
    fileName: string;
    size: number;
    base64: string;
    mimeType: string;
  }>;
}

export interface MicrophonePermissionPlugin {
  requestMicrophonePermission(): Promise<{ microphone: 'granted' | 'denied' }>;
  checkMicrophonePermission(): Promise<{ microphone: 'granted' | 'denied' }>;
  openAppSettings(): Promise<{ opened: boolean }>;
}

export interface NativeSpeechRecognitionPlugin {
  startListening(options?: { prompt?: string; language?: string }): Promise<{
    transcript: string;
    matches: string[];
  }>;
}

// Register native plugins
export const CallLogPlugin = registerPlugin<CallLogPlugin>('CallLogPlugin');
export const CallRecordingPlugin = registerPlugin<CallRecordingPlugin>('CallRecordingPlugin');
export const MicrophonePermissionPlugin = registerPlugin<MicrophonePermissionPlugin>('MicrophonePermissionPlugin');
export const NativeSpeechRecognitionPlugin = registerPlugin<NativeSpeechRecognitionPlugin>('NativeSpeechRecognitionPlugin');

// Helper to check if running in native app
export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};
