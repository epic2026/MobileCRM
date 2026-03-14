package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
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
        Permission(alias = "callLog", strings = [Manifest.permission.READ_CALL_LOG]),
        Permission(alias = "mediaAudio", strings = [Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_EXTERNAL_STORAGE])
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

        // Start the foreground service RIGHT NOW while the app is in the foreground.
        // This is the only window where startForegroundService() is permitted on
        // Android 12+.  The service then registers its own TelephonyCallback so it
        // can detect and record calls even after the app is backgrounded, with no
        // further startForegroundService() calls required.
        try {
            val serviceIntent = Intent(context, CallRecordingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            trace(context, "plugin", "Foreground service start requested while app is in foreground")
        } catch (e: Exception) {
            trace(context, "plugin", "Service start failed from plugin: ${e.message}")
        }

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
    fun getSpeakerAssistEnabled(call: PluginCall) {
        val enabled = CallRecordingState.isSpeakerAssistEnabled(context)
        trace(context, "plugin", "Speaker assist status -> $enabled")
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun setSpeakerAssistEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled")
        if (enabled == null) {
            call.reject("enabled is required")
            return
        }

        CallRecordingState.setSpeakerAssistEnabled(context, enabled)
        trace(context, "plugin", "Speaker assist set -> $enabled")
        call.resolve(JSObject().put("enabled", enabled))
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

    @PluginMethod
    fun requestMediaAudioPermission(call: PluginCall) {
        if (hasMediaAudioPermission()) {
            call.resolve(JSObject().put("mediaAudio", "granted"))
            return
        }
        requestPermissionForAlias("mediaAudio", call, "mediaAudioPermissionCallback")
    }

    @PluginMethod
    fun checkMediaAudioPermission(call: PluginCall) {
        call.resolve(JSObject().put("mediaAudio", mediaAudioPermissionStatus()))
    }

    @PermissionCallback
    private fun mediaAudioPermissionCallback(call: PluginCall) {
        call.resolve(JSObject().put("mediaAudio", mediaAudioPermissionStatus()))
    }

    @PluginMethod
    fun listSystemRecordings(call: PluginCall) {
        if (!hasMediaAudioPermission()) {
            call.reject("Media audio permission is required")
            return
        }

        trace(context, "plugin", "Listing system recordings from MediaStore")

        val likelyRecordings = mutableListOf<JSObject>()
        val fallbackRecordings = mutableListOf<JSObject>()
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_MODIFIED,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.RELATIVE_PATH
        )

        val sortOrder = "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
        var scannedCount = 0

        context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            sortOrder
        )?.use { cursor ->
            val idIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val nameIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val sizeIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val modifiedIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
            val durationIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val pathIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.RELATIVE_PATH)

            while (cursor.moveToNext()) {
                scannedCount += 1
                val id = cursor.getLong(idIdx)
                val name = cursor.getString(nameIdx) ?: "recording_$id"
                val size = cursor.getLong(sizeIdx)
                val modifiedSeconds = cursor.getLong(modifiedIdx)
                val durationMs = cursor.getLong(durationIdx)
                val relativePath = cursor.getString(pathIdx) ?: ""

                if (size <= 0L) continue

                val contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
                val item = JSObject()
                    .put("contentUri", contentUri.toString())
                    .put("fileName", name)
                    .put("size", size)
                    .put("duration", durationMs / 1000)
                    .put("lastModified", modifiedSeconds * 1000)
                    .put("relativePath", relativePath)

                if (isLikelyCallRecording(name, relativePath, durationMs)) {
                    likelyRecordings.add(item)
                } else if (durationMs >= 10_000) {
                    // Fallback: include recent long-form audio files in case OEM naming
                    // does not include "call"/"record" patterns.
                    fallbackRecordings.add(item)
                }
            }
        }

        val output = JSArray()
        val chosen = if (likelyRecordings.isNotEmpty()) {
            likelyRecordings
        } else {
            fallbackRecordings.take(50)
        }

        chosen.forEach { output.put(it) }
        trace(
            context,
            "plugin",
            "System recording scan complete: scanned=$scannedCount likely=${likelyRecordings.size} fallback=${fallbackRecordings.size} returned=${chosen.size}"
        )

        call.resolve(JSObject().put("recordings", output))
    }

    @PluginMethod
    fun getSystemRecordingFile(call: PluginCall) {
        if (!hasMediaAudioPermission()) {
            call.reject("Media audio permission is required")
            return
        }

        val contentUriString = call.getString("contentUri")
        if (contentUriString.isNullOrBlank()) {
            call.reject("contentUri is required")
            return
        }

        try {
            val uri = Uri.parse(contentUriString)
            val mimeType = context.contentResolver.getType(uri) ?: "audio/mp4"
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            if (bytes == null) {
                call.reject("Unable to read system recording")
                return
            }

            val name = uri.lastPathSegment ?: "system_call_recording"
            call.resolve(
                JSObject()
                    .put("contentUri", contentUriString)
                    .put("fileName", name)
                    .put("size", bytes.size)
                    .put("mimeType", mimeType)
                    .put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            )
        } catch (e: Exception) {
            call.reject("Failed to read system recording: ${e.message}")
        }
    }

    private fun buildPermissionStatus(): JSObject {
        val microphoneGranted = permissionGranted(Manifest.permission.RECORD_AUDIO)
        val phoneGranted = permissionGranted(Manifest.permission.READ_PHONE_STATE)
        val callLogGranted = permissionGranted(Manifest.permission.READ_CALL_LOG)
        val mediaAudioGranted = hasMediaAudioPermission()

        return JSObject()
            .put("microphone", if (microphoneGranted) "granted" else "denied")
            .put("phoneState", if (phoneGranted) "granted" else "denied")
            .put("callLog", if (callLogGranted) "granted" else "denied")
            .put("mediaAudio", if (mediaAudioGranted) "granted" else "denied")
            .put("allGranted", microphoneGranted && phoneGranted && callLogGranted)
    }

    private fun permissionGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasAllRuntimePermissions(): Boolean =
        permissionGranted(Manifest.permission.RECORD_AUDIO) &&
            permissionGranted(Manifest.permission.READ_PHONE_STATE) &&
            permissionGranted(Manifest.permission.READ_CALL_LOG)

    private fun mediaAudioPermissionStatus(): String = if (hasMediaAudioPermission()) "granted" else "denied"

    private fun hasMediaAudioPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionGranted(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            permissionGranted(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    private fun isLikelyCallRecording(fileName: String, relativePath: String, durationMs: Long): Boolean {
        val name = fileName.lowercase()
        val path = relativePath.lowercase()
        val combined = "$path/$name"

        val strongPathMatches = listOf(
            "callrecord",
            "call_record",
            "call recording",
            "call recordings",
            "call records",
            "sound_recorder/call",
            "sound recorder/call",
            "sound_recorder/call_rec",
            "call_rec",
            "recordings/call",
            "recording/call",
            "miui/sound_recorder",
            "miui/sound recorder",
            "phone record",
            "voice recorder/call"
        )

        val keywordMatches = listOf(
            "call",
            "record",
            "rec",
            "voice",
            "phone"
        )

        val hasStrongPathMatch = strongPathMatches.any { combined.contains(it) }
        val hasKeywordMatch = keywordMatches.any { name.contains(it) || path.contains(it) }
        val hasPhoneNumberPattern = Regex("""(?:\+?\d[\d\s\-()]{8,}\d)|(?:\d{10,})""").containsMatchIn(fileName)
        val hasTimestampStyleName = Regex("""\d{4}[-_]?\d{2}[-_]?\d{2}[-_ ]?\d{2}[-_]?\d{2}[-_]?\d{2}""").containsMatchIn(fileName)
        val durationLooksLikeCall = durationMs in 10_000..10_800_000

        val score =
            (if (hasStrongPathMatch) 4 else 0) +
            (if (hasKeywordMatch) 2 else 0) +
            (if (hasPhoneNumberPattern) 2 else 0) +
            (if (hasTimestampStyleName) 1 else 0) +
            (if (durationLooksLikeCall) 1 else 0)

        return score >= 4
    }

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
