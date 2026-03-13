package app.lovable.mobilecrm.plugins

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * Foreground service that listens for phone call state changes
 * and automatically records calls when they are active.
 */
class CallRecordingService : Service() {
    companion object {
        const val CHANNEL_ID = "call_recording_channel"
        const val NOTIFICATION_ID = 1001
        const val TAG = "CallRecordingService"
        
        // Event names for JavaScript callbacks
        const val EVENT_CALL_STARTED = "callStarted"
        const val EVENT_CALL_ENDED = "callEnded"
        const val EVENT_RECORDING_SAVED = "recordingSaved"
        const val EVENT_RECORDING_ERROR = "recordingError"
    }
    
    private var telephonyManager: TelephonyManager? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var telephonyCallback: TelephonyCallback? = null
    private var mediaRecorder: MediaRecorder? = null
    private var currentFilePath: String? = null
    private var isRecording = false
    private var recordingStartTime: Long = 0
    private var lastPhoneNumber: String? = null
    private var callType: String = "unknown"
    private var outgoingCallReceiver: BroadcastReceiver? = null
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        registerPhoneStateListener()
        registerOutgoingCallReceiver()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service started")
        startForeground(NOTIFICATION_ID, createNotification())
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        unregisterPhoneStateListener()
        unregisterOutgoingCallReceiver()
        stopRecordingIfActive()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Call Recording Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors calls for automatic recording"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Call Recording Active")
            .setContentText("Monitoring calls for automatic recording")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
    
    private fun registerOutgoingCallReceiver() {
        outgoingCallReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == Intent.ACTION_NEW_OUTGOING_CALL) {
                    lastPhoneNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER)
                    callType = "outgoing"
                    Log.d(TAG, "Outgoing call detected to: $lastPhoneNumber")
                }
            }
        }
        
        val filter = IntentFilter(Intent.ACTION_NEW_OUTGOING_CALL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(outgoingCallReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(outgoingCallReceiver, filter)
        }
    }
    
    private fun unregisterOutgoingCallReceiver() {
        outgoingCallReceiver?.let {
            try {
                unregisterReceiver(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering receiver: ${e.message}")
            }
        }
        outgoingCallReceiver = null
    }
    
    private fun registerPhoneStateListener() {
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ uses TelephonyCallback
            telephonyCallback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleCallState(state)
                }
            }
            
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) 
                == PackageManager.PERMISSION_GRANTED) {
                telephonyManager?.registerTelephonyCallback(
                    mainExecutor,
                    telephonyCallback as TelephonyCallback
                )
            }
        } else {
            // Legacy PhoneStateListener for older Android versions
            @Suppress("DEPRECATION")
            phoneStateListener = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    if (phoneNumber != null && phoneNumber.isNotEmpty()) {
                        lastPhoneNumber = phoneNumber
                        if (callType == "unknown") {
                            callType = "incoming"
                        }
                    }
                    handleCallState(state)
                }
            }
            
            @Suppress("DEPRECATION")
            telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
        }
    }
    
    private fun unregisterPhoneStateListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let {
                telephonyManager?.unregisterTelephonyCallback(it)
            }
        } else {
            @Suppress("DEPRECATION")
            phoneStateListener?.let {
                telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
            }
        }
        telephonyManager = null
        phoneStateListener = null
        telephonyCallback = null
    }
    
    private fun handleCallState(state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                Log.d(TAG, "Call ringing - incoming call")
                if (callType == "unknown") {
                    callType = "incoming"
                }
                sendEvent(EVENT_CALL_STARTED, mapOf(
                    "phoneNumber" to (lastPhoneNumber ?: "unknown"),
                    "callType" to callType,
                    "state" to "ringing"
                ))
            }
            
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                Log.d(TAG, "Call active - starting recording")
                startRecording()
                sendEvent(EVENT_CALL_STARTED, mapOf(
                    "phoneNumber" to (lastPhoneNumber ?: "unknown"),
                    "callType" to callType,
                    "state" to "active"
                ))
            }
            
            TelephonyManager.CALL_STATE_IDLE -> {
                Log.d(TAG, "Call ended - stopping recording")
                stopRecordingIfActive()
                callType = "unknown"
            }
        }
    }
    
    private fun startRecording() {
        if (isRecording) {
            Log.d(TAG, "Already recording, skipping")
            return
        }
        
        if (!hasRecordingPermission()) {
            Log.e(TAG, "Missing RECORD_AUDIO permission")
            sendEvent(EVENT_RECORDING_ERROR, mapOf("error" to "Missing microphone permission"))
            return
        }
        
        try {
            val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val filename = "call_${timestamp}.m4a"
            
            val dir = File(getExternalFilesDir(Environment.DIRECTORY_MUSIC), "CallRecordings")
            if (!dir.exists()) dir.mkdirs()
            
            val file = File(dir, filename)
            currentFilePath = file.absolutePath
            
            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            
            // Note: VOICE_CALL audio source requires system-level permissions
            // Using MIC as fallback which captures user's voice
            mediaRecorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(currentFilePath)
                prepare()
                start()
            }
            
            isRecording = true
            recordingStartTime = System.currentTimeMillis()
            Log.d(TAG, "Recording started: $currentFilePath")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting recording: ${e.message}")
            sendEvent(EVENT_RECORDING_ERROR, mapOf("error" to (e.message ?: "Unknown error")))
            cleanupRecorder()
        }
    }
    
    private fun stopRecordingIfActive() {
        if (!isRecording) {
            sendEvent(EVENT_CALL_ENDED, mapOf(
                "phoneNumber" to (lastPhoneNumber ?: "unknown"),
                "callType" to callType,
                "recorded" to false
            ))
            return
        }
        
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            
            val duration = ((System.currentTimeMillis() - recordingStartTime) / 1000).toInt()
            val filePath = currentFilePath
            
            Log.d(TAG, "Recording stopped. Duration: ${duration}s, Path: $filePath")
            
            sendEvent(EVENT_RECORDING_SAVED, mapOf(
                "filePath" to (filePath ?: ""),
                "duration" to duration,
                "phoneNumber" to (lastPhoneNumber ?: "unknown"),
                "callType" to callType,
                "timestamp" to System.currentTimeMillis()
            ))
            
            sendEvent(EVENT_CALL_ENDED, mapOf(
                "phoneNumber" to (lastPhoneNumber ?: "unknown"),
                "callType" to callType,
                "recorded" to true,
                "duration" to duration,
                "filePath" to (filePath ?: "")
            ))
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recording: ${e.message}")
            sendEvent(EVENT_RECORDING_ERROR, mapOf("error" to (e.message ?: "Unknown error")))
        } finally {
            cleanupRecorder()
        }
    }
    
    private fun cleanupRecorder() {
        try {
            mediaRecorder?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing recorder: ${e.message}")
        }
        mediaRecorder = null
        currentFilePath = null
        isRecording = false
        recordingStartTime = 0
    }
    
    private fun hasRecordingPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == 
            PackageManager.PERMISSION_GRANTED
    }
    
    private fun sendEvent(eventName: String, data: Map<String, Any>) {
        // Events are sent via the CallRecordingPlugin bridge
        CallRecordingPlugin.sendEvent(eventName, data)
    }
}
