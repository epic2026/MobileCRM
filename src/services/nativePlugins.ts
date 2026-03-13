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

export interface RecordingResult {
  status: 'recording' | 'stopped';
  filePath: string;
  duration?: number;
}

export interface AudioRecorderPlugin {
  startRecording(options?: { filename?: string }): Promise<RecordingResult>;
  stopRecording(): Promise<RecordingResult>;
  isRecording(): Promise<{ isRecording: boolean; duration?: number }>;
  requestAudioPermissions(): Promise<{ microphone: 'granted' | 'denied' }>;
  checkAudioPermissions(): Promise<{ microphone: 'granted' | 'denied' }>;
}

// Call Recording Service Plugin (for automatic call recording)
export interface CallRecordingServicePlugin {
  startService(): Promise<{ status: string; message: string }>;
  stopService(): Promise<{ status: string; message: string }>;
  isServiceRunning(): Promise<{ running: boolean }>;
  getRecordingFile(options: { filePath: string }): Promise<{
    filePath: string;
    fileName: string;
    size: number;
    exists: boolean;
    base64: string;
    mimeType: string;
  }>;
  deleteRecordingFile(options: { filePath: string }): Promise<{ deleted: boolean }>;
  listRecordings(): Promise<{
    recordings: Array<{
      filePath: string;
      fileName: string;
      size: number;
      lastModified: number;
    }>;
  }>;
  requestRecordingPermissions(): Promise<{
    microphone: 'granted' | 'denied';
    phoneState: 'granted' | 'denied';
    callLog: 'granted' | 'denied';
    allGranted: boolean;
  }>;
  checkRecordingPermissions(): Promise<{
    microphone: 'granted' | 'denied';
    phoneState: 'granted' | 'denied';
    callLog: 'granted' | 'denied';
    allGranted: boolean;
  }>;
  getDebugTrace(): Promise<{
    entries: Array<{
      timestamp: number;
      source: string;
      message: string;
    }>;
  }>;
  clearDebugTrace(): Promise<{ cleared: boolean }>;
  
  // Event listeners
  addListener(
    eventName: 'callStarted',
    listenerFunc: (event: {
      phoneNumber: string;
      callType: string;
      state: 'ringing' | 'active';
    }) => void
  ): Promise<{ remove: () => void }>;
  
  addListener(
    eventName: 'callEnded',
    listenerFunc: (event: {
      phoneNumber: string;
      callType: string;
      recorded: boolean;
      duration?: number;
      filePath?: string;
    }) => void
  ): Promise<{ remove: () => void }>;
  
  addListener(
    eventName: 'recordingSaved',
    listenerFunc: (event: {
      filePath: string;
      duration: number;
      phoneNumber: string;
      callType: string;
      timestamp: number;
    }) => void
  ): Promise<{ remove: () => void }>;
  
  addListener(
    eventName: 'recordingError',
    listenerFunc: (event: { error: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'debugTrace',
    listenerFunc: (event: {
      timestamp: number;
      source: string;
      message: string;
    }) => void
  ): Promise<{ remove: () => void }>;
  
  removeAllListeners(): Promise<void>;
}

// Register native plugins
export const CallLogPlugin = registerPlugin<CallLogPlugin>('CallLogPlugin');
export const AudioRecorderPlugin = registerPlugin<AudioRecorderPlugin>('AudioRecorderPlugin');
export const CallRecordingPlugin = registerPlugin<CallRecordingServicePlugin>('CallRecordingPlugin');

// Helper to check if running in native app
export const isNativeApp = (): boolean => {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor !== 'undefined' && 
         (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
};
