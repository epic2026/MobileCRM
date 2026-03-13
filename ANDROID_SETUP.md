# Native Android App Setup Guide

This guide explains how to build the native Android app with call log access and microphone recording capabilities.

## Prerequisites

- Node.js 18+
- Android Studio (latest stable)
- JDK 17+

## Step-by-Step Setup

### 1. Export & Clone the Project

1. Click **"Export to GitHub"** in Lovable
2. Clone your repository locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
   cd YOUR_REPO
   ```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Web App

```bash
npm run build
```

### 4. Add Android Platform

```bash
npx cap add android
```

### 5. Add Native Plugins to Android

Copy the Kotlin plugin files from `android-setup/` to your Android project:

```bash
# Create the plugin directory
mkdir -p android/app/src/main/java/app/lovable/callflow/

# Copy the plugins
cp android-setup/CallLogPlugin.kt android/app/src/main/java/app/lovable/callflow/
cp android-setup/AudioRecorderPlugin.kt android/app/src/main/java/app/lovable/callflow/
```

### 6. Update MainActivity

Replace the content of `android/app/src/main/java/.../MainActivity.kt` with:

```kotlin
package app.lovable.callflow

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(CallLogPlugin::class.java)
        registerPlugin(AudioRecorderPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

### 7. Add Permissions to AndroidManifest.xml

Open `android/app/src/main/AndroidManifest.xml` and add these permissions inside `<manifest>` before `<application>`:

```xml
<!-- Call Log Access -->
<uses-permission android:name="android.permission.READ_CALL_LOG" />
<uses-permission android:name="android.permission.WRITE_CALL_LOG" />

<!-- Phone State for detecting calls -->
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.PROCESS_OUTGOING_CALLS" />

<!-- Microphone for recording -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Storage for saving recordings -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />

<!-- Foreground service for call detection -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
```

### 8. Sync and Run

```bash
npx cap sync android
npx cap run android
```

## Usage in Code

### Access Native Call Logs

```typescript
import { useNativeCallLogs } from '@/hooks/useNativeCallLogs';

function MyComponent() {
  const { callLogs, fetchCallLogs, hasPermission, isNative } = useNativeCallLogs();

  useEffect(() => {
    if (isNative) {
      fetchCallLogs(50); // Fetch last 50 calls
    }
  }, [isNative]);

  return (
    <div>
      {callLogs.map(log => (
        <div key={log.id}>
          {log.name || log.phone} - {log.type} - {log.duration}s
        </div>
      ))}
    </div>
  );
}
```

### Record Audio

```typescript
import { useNativeAudioRecorder } from '@/hooks/useNativeAudioRecorder';

function MyComponent() {
  const { isRecording, duration, startRecording, stopRecording, isNative } = useNativeAudioRecorder();

  return (
    <div>
      {isRecording ? (
        <>
          <span>Recording: {duration}s</span>
          <button onClick={stopRecording}>Stop</button>
        </>
      ) : (
        <button onClick={() => startRecording()} disabled={!isNative}>
          Start Recording
        </button>
      )}
    </div>
  );
}
```

## Important Notes

1. **Call Recording Legality**: Call recording laws vary by country/state. Always inform users and get consent.

2. **Android 10+**: Recording phone calls via `MediaRecorder.AudioSource.VOICE_CALL` is restricted. The current implementation records via microphone only.

3. **Permissions**: Users must grant permissions when prompted. The app handles permission requests automatically.

## Troubleshooting

### Permission Denied
- Go to Android Settings → Apps → CallFlow CRM → Permissions
- Enable Call Logs and Microphone

### Plugin Not Found
- Ensure plugins are registered in MainActivity
- Run `npx cap sync android` after any changes

### Build Errors
- Check that package names match in all Kotlin files
- Ensure JDK 17+ is installed
