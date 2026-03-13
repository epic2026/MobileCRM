// android/app/src/main/java/app/lovable/callflow/AudioRecorderPlugin.kt
package app.lovable.callflow

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Environment
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

@CapacitorPlugin(
    name = "AudioRecorderPlugin",
    permissions = [
        Permission(
            alias = "microphone",
            strings = [Manifest.permission.RECORD_AUDIO]
        ),
        Permission(
            alias = "storage",
            strings = [
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.READ_EXTERNAL_STORAGE
            ]
        )
    ]
)
class AudioRecorderPlugin : Plugin() {

    private var mediaRecorder: MediaRecorder? = null
    private var currentFilePath: String? = null
    private var isRecording = false
    private var recordingStartTime: Long = 0

    @PluginMethod
    fun startRecording(call: PluginCall) {
        if (!hasMicrophonePermission()) {
            requestPermissionForAlias("microphone", call, "microphonePermsCallback")
            return
        }

        doStartRecording(call)
    }

    @PermissionCallback
    private fun microphonePermsCallback(call: PluginCall) {
        if (hasMicrophonePermission()) {
            doStartRecording(call)
        } else {
            call.reject("Microphone permission denied")
        }
    }

    private fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun doStartRecording(call: PluginCall) {
        if (isRecording) {
            call.reject("Already recording")
            return
        }

        try {
            val filename = call.getString("filename") 
                ?: "recording_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.m4a"
            
            val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "CallRecordings")
            if (!dir.exists()) dir.mkdirs()
            
            val file = File(dir, filename)
            currentFilePath = file.absolutePath

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            mediaRecorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
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

            val result = JSObject()
            result.put("status", "recording")
            result.put("filePath", currentFilePath)
            call.resolve(result)

        } catch (e: Exception) {
            call.reject("Failed to start recording: ${e.message}")
        }
    }

    @PluginMethod
    fun stopRecording(call: PluginCall) {
        if (!isRecording) {
            call.reject("Not currently recording")
            return
        }

        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            mediaRecorder = null

            val duration = (System.currentTimeMillis() - recordingStartTime) / 1000
            isRecording = false

            val result = JSObject()
            result.put("status", "stopped")
            result.put("filePath", currentFilePath)
            result.put("duration", duration)
            call.resolve(result)

        } catch (e: Exception) {
            isRecording = false
            mediaRecorder?.release()
            mediaRecorder = null
            call.reject("Failed to stop recording: ${e.message}")
        }
    }

    @PluginMethod
    fun isRecording(call: PluginCall) {
        val result = JSObject()
        result.put("isRecording", isRecording)
        if (isRecording) {
            result.put("duration", (System.currentTimeMillis() - recordingStartTime) / 1000)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        if (!hasMicrophonePermission()) {
            requestPermissionForAlias("microphone", call, "microphonePermsCallback")
        } else {
            val result = JSObject()
            result.put("microphone", "granted")
            call.resolve(result)
        }
    }

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        val result = JSObject()
        result.put(
            "microphone",
            if (hasMicrophonePermission()) "granted" else "denied"
        )
        call.resolve(result)
    }
}
