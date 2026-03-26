package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "CallRecordingPlugin",
    permissions = [
        Permission(alias = "mediaAudio", strings = [Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_EXTERNAL_STORAGE])
    ]
)
class CallRecordingPlugin : Plugin() {

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

        context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
        )?.use { cursor ->
            val idIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val nameIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val sizeIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val modifiedIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
            val durationIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val pathIdx = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.RELATIVE_PATH)

            while (cursor.moveToNext()) {
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
                    fallbackRecordings.add(item)
                }
            }
        }

        val output = JSArray()
        val chosen = if (likelyRecordings.isNotEmpty()) likelyRecordings else fallbackRecordings.take(50)
        chosen.forEach { output.put(it) }
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
        } catch (error: Exception) {
            call.reject("Failed to read system recording: ${error.message}")
        }
    }

    private fun permissionGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasMediaAudioPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionGranted(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            permissionGranted(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    private fun mediaAudioPermissionStatus(): String =
        if (hasMediaAudioPermission()) PermissionState.GRANTED.toString().lowercase() else PermissionState.DENIED.toString().lowercase()

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
        val keywordMatches = listOf("call", "record", "rec", "voice", "phone")

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
}