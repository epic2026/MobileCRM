import { registerPlugin } from '@capacitor/core';

export interface CallLogEntry {
  id: string;
  phone: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed' | 'unknown';
  timestamp: string;
  duration: number;
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

// Register native plugins
export const CallLogPlugin = registerPlugin<CallLogPlugin>('CallLogPlugin');
export const CallRecordingPlugin = registerPlugin<CallRecordingPlugin>('CallRecordingPlugin');

// Helper to check if running in native app
export const isNativeApp = (): boolean => {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor !== 'undefined' && 
         (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
};
