package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Long-lived foreground service that monitors phone call state and records calls.
 *
 * It is started once (from [CallRecordingPlugin.startService] while the app is
 * in the foreground) and keeps running until the user disables the toggle.
 * Listening for call state changes happens *inside* the service via
 * TelephonyCallback / PhoneStateListener, so no further startForegroundService()
 * call is needed from a BroadcastReceiver — which Android 12+ would block.
 */
class CallRecordingService : Service() {

    companion object {
        /** Intent action used by [CallStateReceiver] to forward call metadata. */
        const val ACTION_UPDATE_CALL_INFO = "com.lovable.mobilecrmwithsimcalls.UPDATE_CALL_INFO"
        const val EXTRA_PHONE_NUMBER = "phoneNumber"
        const val EXTRA_CALL_TYPE = "callType"

        private const val CHANNEL_ID = "call_rec"
        private const val NOTIFICATION_ID = 1

        private val AUDIO_SOURCE_PROBE_ORDER = listOf(
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.CAMCORDER,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            MediaRecorder.AudioSource.VOICE_CALL
        )
    }

    private var recorder: MediaRecorder? = null
    private var outputFile: String? = null
    private var lastWorkingAudioSource = MediaRecorder.AudioSource.MIC
    private var currentRecordingAudioSource: Int? = null
    private var sourceProbeIndex = 0

    private var audioManager: AudioManager? = null
    private var speakerAssistApplied = false
    private var previousSpeakerphoneOn: Boolean? = null
    private var previousAudioMode: Int? = null

    private var telephonyManager: TelephonyManager? = null
    private var telephonyCallback: TelephonyCallback? = null   // API 31+
    private var phoneStateListener: PhoneStateListener? = null  // pre-31

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        trace("Service created (API ${Build.VERSION.SDK_INT})")
        promoteToForeground()
        registerTelephonyListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        trace("onStartCommand action=${intent?.action}")

        // The BroadcastReceiver sends us call metadata (number + type) via a
        // regular startService() call on an already-running foreground service.
        // This is always allowed regardless of background restrictions.
        if (intent?.action == ACTION_UPDATE_CALL_INFO) {
            val number = intent.getStringExtra(EXTRA_PHONE_NUMBER) ?: ""
            val type = intent.getStringExtra(EXTRA_CALL_TYPE) ?: "unknown"
            if (number.isNotBlank()) CallRecordingState.currentPhoneNumber = number
            if (type != "unknown") CallRecordingState.currentCallType = type
            trace("Received call info update: number=$number type=$type")
        }

        return START_STICKY
    }

    override fun onDestroy() {
        trace("Service destroyed")
        unregisterTelephonyListener()
        stopRecording()
        restoreSpeakerAssistAudioRoute()
        CallRecordingState.clearRuntimeState()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // -------------------------------------------------------------------------
    // Foreground notification
    // -------------------------------------------------------------------------

    private fun promoteToForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Call Recording",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Call recording active")
            .setContentText("Monitoring calls for automatic recording")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // FOREGROUND_SERVICE_TYPE_MICROPHONE (API 30+) requires only RECORD_AUDIO.
            // FOREGROUND_SERVICE_TYPE_PHONE_CALL requires the app to be the default
            // dialer / hold MANAGE_OWN_CALLS — which crashes on API 35+.
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        CallRecordingState.isServiceRunning = true
        trace("Promoted to foreground service")
    }

    // -------------------------------------------------------------------------
    // Telephony listener — runs inside the service so we never need to call
    // startForegroundService() from a background BroadcastReceiver.
    // -------------------------------------------------------------------------

    @Suppress("DEPRECATION")
    private fun registerTelephonyListener() {
        telephonyManager = getSystemService(TELEPHONY_SERVICE) as TelephonyManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    trace("TelephonyCallback state=$state")
                    handleCallState(state)
                }
            }
            telephonyManager?.registerTelephonyCallback(mainExecutor, cb)
            telephonyCallback = cb
        } else {
            val listener = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    if (!phoneNumber.isNullOrBlank()) {
                        CallRecordingState.currentPhoneNumber = phoneNumber
                    }
                    trace("PhoneStateListener state=$state number=$phoneNumber")
                    handleCallState(state)
                }
            }
            @Suppress("DEPRECATION")
            telephonyManager?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
            phoneStateListener = listener
        }

        trace("Telephony listener registered")
    }

    @Suppress("DEPRECATION")
    private fun unregisterTelephonyListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { telephonyManager?.unregisterTelephonyCallback(it) }
            telephonyCallback = null
        } else {
            phoneStateListener?.let {
                @Suppress("DEPRECATION")
                telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
            }
            phoneStateListener = null
        }
    }

    // -------------------------------------------------------------------------
    // Call state handling
    // -------------------------------------------------------------------------

    private fun handleCallState(state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                trace("RINGING — incoming call pending")
                CallRecordingState.currentCallType = "incoming"
                CallRecordingPlugin.sendEvent(
                    "callStarted",
                    mapOf(
                        "phoneNumber" to CallRecordingState.currentPhoneNumber,
                        "callType" to "incoming",
                        "state" to "ringing"
                    )
                )
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                trace("OFFHOOK — call active, starting recording")
                if (CallRecordingState.currentCallType != "incoming") {
                    CallRecordingState.currentCallType = "outgoing"
                }
                startRecording()
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                trace("IDLE — call ended, stopping recording")
                stopRecordingAndNotify()
                CallRecordingState.currentCallType = "unknown"
                CallRecordingState.currentPhoneNumber = ""
            }
        }
    }

    // -------------------------------------------------------------------------
    // Recording
    // -------------------------------------------------------------------------

    private fun startRecording() {
        if (recorder != null) {
            trace("Recording already active — skipping duplicate start")
            return
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            trace("Missing RECORD_AUDIO permission — cannot record")
            CallRecordingPlugin.sendEvent("recordingError", mapOf("error" to "Missing microphone permission"))
            return
        }

        try {
            applySpeakerAssistIfEnabled()
            val dir = File(getExternalFilesDir(null), "recordings").also { it.mkdirs() }
            val ts = System.currentTimeMillis()
            outputFile = "${dir.absolutePath}/call_${ts}.mp4"
            CallRecordingState.currentFilePath = outputFile
            CallRecordingState.recordingStartedAt = ts

            // Probe one source per call by rotating priority. This helps quickly
            // identify which source is actually audible on a given OEM/device.
            val prioritizedProbeOrder = AUDIO_SOURCE_PROBE_ORDER.drop(sourceProbeIndex) +
                AUDIO_SOURCE_PROBE_ORDER.take(sourceProbeIndex)

            val candidateSources = (prioritizedProbeOrder + listOf(lastWorkingAudioSource)).distinct()
            trace(
                "Audio source probe start index=$sourceProbeIndex first=${audioSourceName(prioritizedProbeOrder.firstOrNull())} " +
                    "order=${candidateSources.joinToString(",") { audioSourceName(it) }}"
            )

            var started = false
            var lastError: Exception? = null

            for (source in candidateSources) {
                try {
                    val mediaRecorder = MediaRecorder().apply {
                        setAudioSource(source)
                        setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                        setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                        setAudioChannels(1)
                        setAudioSamplingRate(16000)
                        setAudioEncodingBitRate(64000)
                        setOutputFile(outputFile)
                        prepare()
                        start()
                    }

                    recorder = mediaRecorder
                    lastWorkingAudioSource = source
                    currentRecordingAudioSource = source
                    sourceProbeIndex = (sourceProbeIndex + 1) % AUDIO_SOURCE_PROBE_ORDER.size
                    trace("Recording started using audioSource=$source path=$outputFile")
                    started = true
                    break
                } catch (sourceError: Exception) {
                    lastError = sourceError
                    trace("Audio source $source failed: ${sourceError.message}")
                }
            }

            if (!started) {
                throw lastError ?: IllegalStateException("No audio source could start recording")
            }

            trace("Recording started: $outputFile")
            CallRecordingPlugin.sendEvent(
                "callStarted",
                mapOf(
                    "phoneNumber" to CallRecordingState.currentPhoneNumber,
                    "callType" to CallRecordingState.currentCallType,
                    "state" to "active"
                )
            )
        } catch (e: Exception) {
            trace("startRecording failed: ${e.message}")
            CallRecordingPlugin.sendEvent("recordingError", mapOf("error" to (e.message ?: "Unknown error")))
            recorder = null
            outputFile = null
            CallRecordingState.currentFilePath = null
            CallRecordingState.recordingStartedAt = 0L
            restoreSpeakerAssistAudioRoute()
        }
    }

    private fun stopRecordingAndNotify() {
        val filePath = outputFile
        val duration = if (CallRecordingState.recordingStartedAt > 0L) {
            ((System.currentTimeMillis() - CallRecordingState.recordingStartedAt) / 1000L).toInt()
        } else 0

        stopRecording()

        // Notify JS regardless of whether a file was produced
        CallRecordingPlugin.sendEvent(
            "callEnded",
            mapOf(
                "phoneNumber" to CallRecordingState.currentPhoneNumber,
                "callType" to CallRecordingState.currentCallType,
                "recorded" to (filePath != null),
                "duration" to duration,
                "filePath" to (filePath ?: ""),
                "audioSource" to (currentRecordingAudioSource ?: -1),
                "audioSourceName" to audioSourceName(currentRecordingAudioSource)
            )
        )

        if (filePath != null) {
            trace("Notifying JS of saved recording: $filePath duration=${duration}s")
            CallRecordingPlugin.sendEvent(
                "recordingSaved",
                mapOf(
                    "filePath" to filePath,
                    "duration" to duration,
                    "phoneNumber" to CallRecordingState.currentPhoneNumber,
                    "callType" to CallRecordingState.currentCallType,
                    "timestamp" to System.currentTimeMillis(),
                    "audioSource" to (currentRecordingAudioSource ?: -1),
                    "audioSourceName" to audioSourceName(currentRecordingAudioSource)
                )
            )
        }

        CallRecordingState.currentFilePath = null
        CallRecordingState.recordingStartedAt = 0L
    }

    private fun stopRecording() {
        try {
            recorder?.stop()
            recorder?.release()
        } catch (e: Exception) {
            trace("stopRecording error (may be harmless if call was very short): ${e.message}")
        } finally {
            restoreSpeakerAssistAudioRoute()
        }
        recorder = null
        outputFile = null
        currentRecordingAudioSource = null
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    @Suppress("DEPRECATION")
    private fun applySpeakerAssistIfEnabled() {
        if (!CallRecordingState.isSpeakerAssistEnabled(this)) return
        val manager = audioManager ?: return
        if (speakerAssistApplied) return

        try {
            previousSpeakerphoneOn = manager.isSpeakerphoneOn
            previousAudioMode = manager.mode

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // API 31+: use setCommunicationDevice — isSpeakerphoneOn is ignored
                val speakerDevice = manager.availableCommunicationDevices.firstOrNull {
                    it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                }
                if (speakerDevice != null) {
                    val ok = manager.setCommunicationDevice(speakerDevice)
                    speakerAssistApplied = ok
                    trace("Speaker Assist setCommunicationDevice(SPEAKER): $ok")
                } else {
                    trace("Speaker Assist: built-in speaker not in availableCommunicationDevices")
                }
            } else {
                manager.mode = AudioManager.MODE_IN_COMMUNICATION
                manager.isSpeakerphoneOn = true
                speakerAssistApplied = true
                trace("Speaker Assist enabled via isSpeakerphoneOn (legacy)")
            }
        } catch (e: Exception) {
            trace("Speaker Assist enable failed: ${e.message}")
        }
    }

    @Suppress("DEPRECATION")
    private fun restoreSpeakerAssistAudioRoute() {
        if (!speakerAssistApplied) return
        val manager = audioManager ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                manager.clearCommunicationDevice()
                trace("Speaker Assist communication device cleared (API 31+)")
            } else {
                previousSpeakerphoneOn?.let { manager.isSpeakerphoneOn = it }
                previousAudioMode?.let { manager.mode = it }
                trace("Speaker Assist audio route restored (legacy)")
            }
        } catch (e: Exception) {
            trace("Speaker Assist restore failed: ${e.message}")
        } finally {
            speakerAssistApplied = false
            previousSpeakerphoneOn = null
            previousAudioMode = null
        }
    }

    private fun trace(message: String) {
        Log.d("CallRecordingService", message)
        CallRecordingPlugin.trace(this, "service", message)
    }

    private fun audioSourceName(source: Int?): String {
        return when (source) {
            MediaRecorder.AudioSource.MIC -> "MIC"
            MediaRecorder.AudioSource.CAMCORDER -> "CAMCORDER"
            MediaRecorder.AudioSource.VOICE_RECOGNITION -> "VOICE_RECOGNITION"
            MediaRecorder.AudioSource.VOICE_COMMUNICATION -> "VOICE_COMMUNICATION"
            MediaRecorder.AudioSource.VOICE_CALL -> "VOICE_CALL"
            null -> "unknown"
            else -> "source_$source"
        }
    }
}
