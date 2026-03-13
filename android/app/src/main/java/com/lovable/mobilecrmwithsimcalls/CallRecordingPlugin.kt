package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import java.io.File

@CapacitorPlugin(
    name = "CallRecordingPlugin",
    permissions = [
        Permission(alias = "mic", strings = [Manifest.permission.RECORD_AUDIO]),
        Permission(alias = "phone", strings = [Manifest.permission.READ_PHONE_STATE]),
        Permission(alias = "callLog", strings = [Manifest.permission.READ_CALL_LOG])
    ]
)
class CallRecordingPlugin : Plugin() {

    companion object {
        private var instance: CallRecordingPlugin? = null
        private const val LOG_TAG = "CallRecording"

        fun sendEvent(name: String, data: Map<String, Any>) {
            val obj = JSObject()
            data.forEach { (k, v) -> obj.put(k, v) }
            instance?.notifyListeners(name, obj)
        }

        fun trace(context: Context, source: String, message: String) {
            val fullMessage = "[$source] $message"
            Log.d(LOG_TAG, fullMessage)
            CallRecordingState.appendDebugTrace(context, source, message)
            sendEvent(
                "debugTrace",
                mapOf(
                    "source" to source,
                    "message" to message,
                    "timestamp" to System.currentTimeMillis()
                )
            )
        }
    }

    override fun load() {
        instance = this
        trace(context, "plugin", "CallRecordingPlugin loaded")
    }

    @PluginMethod
    fun startService(call: PluginCall) {
        CallRecordingState.setAutoRecordingEnabled(context, true)
        trace(context, "plugin", "Auto call recording enabled from JS")
        call.resolve(
            JSObject()
                .put("status", "started")
                .put("message", "Automatic call recording enabled")
        )
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        CallRecordingState.setAutoRecordingEnabled(context, false)
        context.stopService(Intent(context, CallRecordingService::class.java))
        trace(context, "plugin", "Auto call recording disabled from JS")
        call.resolve(
            JSObject()
                .put("status", "stopped")
                .put("message", "Automatic call recording disabled")
        )
    }

    @PluginMethod
    fun isServiceRunning(call: PluginCall) {
        val running = CallRecordingState.isServiceRunning
        val enabled = CallRecordingState.isAutoRecordingEnabled(context)
        trace(
            context,
            "plugin",
            "Service running check -> $running, enabled=$enabled"
        )
        call.resolve(
            JSObject()
                .put("running", running)
                .put("enabled", enabled)
        )
    }

    @PluginMethod
    fun requestRecordingPermissions(call: PluginCall) {
        if (hasAllRuntimePermissions()) {
            trace(context, "plugin", "Permission request skipped; all permissions already granted")
            call.resolve(buildPermissionStatus())
            return
        }
        trace(context, "plugin", "Requesting runtime permissions from Android")
        requestAllPermissions(call, "permissionsCallback")
    }

    @PluginMethod
    fun checkRecordingPermissions(call: PluginCall) {
        trace(context, "plugin", "Checking runtime permissions")
        call.resolve(buildPermissionStatus())
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        trace(context, "plugin", "Android permission callback returned")
        call.resolve(buildPermissionStatus())
    }

    @PluginMethod
    fun getDebugTrace(call: PluginCall) {
        val traces = JSArray()
        CallRecordingState.getDebugTrace(context).forEach { entry ->
            val parts = entry.split("|", limit = 3)
            val timestamp = parts.getOrNull(0)?.toLongOrNull() ?: 0L
            val source = parts.getOrNull(1).orEmpty()
            val message = parts.getOrNull(2).orEmpty()
            traces.put(
                JSObject()
                    .put("timestamp", timestamp)
                    .put("source", source)
                    .put("message", message)
            )
        }
        call.resolve(JSObject().put("entries", traces))
    }

    @PluginMethod
    fun clearDebugTrace(call: PluginCall) {
        CallRecordingState.clearDebugTrace(context)
        trace(context, "plugin", "Cleared native debug trace")
        call.resolve(JSObject().put("cleared", true))
    }

    @PluginMethod
    fun getRecordingFile(call: PluginCall) {
        val filePath = call.getString("filePath")
        if (filePath.isNullOrBlank()) {
            call.reject("filePath is required")
            return
        }

        val file = File(filePath)
        val result = JSObject()
            .put("filePath", file.absolutePath)
            .put("fileName", file.name)
            .put("size", if (file.exists()) file.length() else 0)
            .put("exists", file.exists())
            .put("mimeType", mimeTypeFor(file))

        if (file.exists()) {
            val bytes = file.readBytes()
            result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        } else {
            result.put("base64", "")
        }

        call.resolve(result)
    }

    @PluginMethod
    fun deleteRecordingFile(call: PluginCall) {
        val filePath = call.getString("filePath")
        if (filePath.isNullOrBlank()) {
            call.reject("filePath is required")
            return
        }

        val deleted = File(filePath).let { file -> !file.exists() || file.delete() }
        call.resolve(JSObject().put("deleted", deleted))
    }

    @PluginMethod
    fun listRecordings(call: PluginCall) {
        val dir = recordingDirectory()
        val recordings = JSArray()

        dir.listFiles()
            ?.sortedByDescending { it.lastModified() }
            ?.forEach { file ->
                recordings.put(
                    JSObject()
                        .put("filePath", file.absolutePath)
                        .put("fileName", file.name)
                        .put("size", file.length())
                        .put("lastModified", file.lastModified())
                )
            }

        call.resolve(JSObject().put("recordings", recordings))
    }

    private fun buildPermissionStatus(): JSObject {
        val microphoneGranted = permissionGranted(Manifest.permission.RECORD_AUDIO)
        val phoneGranted = permissionGranted(Manifest.permission.READ_PHONE_STATE)
        val callLogGranted = permissionGranted(Manifest.permission.READ_CALL_LOG)

        return JSObject()
            .put("microphone", if (microphoneGranted) "granted" else "denied")
            .put("phoneState", if (phoneGranted) "granted" else "denied")
            .put("callLog", if (callLogGranted) "granted" else "denied")
            .put("allGranted", microphoneGranted && phoneGranted && callLogGranted)
    }

    private fun permissionGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasAllRuntimePermissions(): Boolean =
        permissionGranted(Manifest.permission.RECORD_AUDIO) &&
            permissionGranted(Manifest.permission.READ_PHONE_STATE) &&
            permissionGranted(Manifest.permission.READ_CALL_LOG)

    private fun recordingDirectory(): File =
        File(context.getExternalFilesDir(null), "recordings").apply {
            if (!exists()) {
                mkdirs()
            }
        }

    private fun mimeTypeFor(file: File): String =
        when (file.extension.lowercase()) {
            "m4a", "mp4" -> "audio/mp4"
            "aac" -> "audio/aac"
            else -> "application/octet-stream"
        }
}
