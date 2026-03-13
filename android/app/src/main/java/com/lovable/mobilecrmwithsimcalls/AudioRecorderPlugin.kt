package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Environment
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

@CapacitorPlugin(
    name = "AudioRecorderPlugin",
    permissions = [
        Permission(
            alias = "microphone",
            strings = [Manifest.permission.RECORD_AUDIO]
        )
    ]
)
class AudioRecorderPlugin : Plugin() {

    private var recorder: MediaRecorder? = null
    private var filePath: String? = null
    private var isRecording = false
    private var startTime = 0L

    @PluginMethod
    fun startRecording(call: PluginCall) {
        if (!hasMicPermission()) {
            requestPermissionForAlias("microphone", call, "micPerms")
            return
        }
        start(call)
    }

    @PermissionCallback
    private fun micPerms(call: PluginCall) {
        if (hasMicPermission()) start(call)
        else call.reject("Microphone permission denied")
    }

    @PluginMethod
    fun requestAudioPermissions(call: PluginCall) {
        if (hasMicPermission()) {
            call.resolve(JSObject().put("microphone", "granted"))
            return
        }
        requestPermissionForAlias("microphone", call, "micStatusCallback")
    }

    @PluginMethod
    fun checkAudioPermissions(call: PluginCall) {
        call.resolve(JSObject().put("microphone", if (hasMicPermission()) "granted" else "denied"))
    }

    @PermissionCallback
    private fun micStatusCallback(call: PluginCall) {
        call.resolve(JSObject().put("microphone", if (hasMicPermission()) "granted" else "denied"))
    }

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

    private fun start(call: PluginCall) {
        if (isRecording) {
            call.reject("Already recording")
            return
        }

        val name =
            "audio_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.m4a"
        val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "Recordings")
        if (!dir.exists()) dir.mkdirs()

        val file = File(dir, name)
        filePath = file.absolutePath

        recorder =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context)
            else MediaRecorder()

        recorder?.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setOutputFile(filePath)
            prepare()
            start()
        }

        isRecording = true
        startTime = System.currentTimeMillis()

        call.resolve(
            JSObject()
                .put("status", "recording")
                .put("filePath", filePath)
        )
    }

    @PluginMethod
    fun stopRecording(call: PluginCall) {
        if (!isRecording) {
            call.reject("Not recording")
            return
        }

        recorder?.apply {
            stop()
            release()
        }
        recorder = null
        isRecording = false

        call.resolve(
            JSObject()
                .put("status", "stopped")
                .put("filePath", filePath)
                .put("duration", (System.currentTimeMillis() - startTime) / 1000)
        )
    }

    @PluginMethod
    fun isRecording(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("isRecording", isRecording)
                .put("duration", if (isRecording) (System.currentTimeMillis() - startTime) / 1000 else 0)
        )
    }
}
