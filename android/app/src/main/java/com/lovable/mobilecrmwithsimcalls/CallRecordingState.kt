package com.lovable.mobilecrmwithsimcalls

import android.content.Context

object CallRecordingState {
    private const val PREFS_NAME = "call_recording_prefs"
    private const val KEY_ENABLED = "auto_recording_enabled"
    private const val KEY_SPEAKER_ASSIST = "speaker_assist_enabled"
    private const val KEY_PENDING_NUMBER = "pending_number"
    private const val KEY_PENDING_TYPE = "pending_type"
    private const val KEY_DEBUG_TRACE = "debug_trace"
    private const val TRACE_LIMIT = 40

    @Volatile
    var isServiceRunning: Boolean = false

    @Volatile
    var currentFilePath: String? = null

    @Volatile
    var currentPhoneNumber: String = ""

    @Volatile
    var currentCallType: String = "unknown"

    @Volatile
    var recordingStartedAt: Long = 0L

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isAutoRecordingEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ENABLED, false)

    fun setAutoRecordingEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun isSpeakerAssistEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_SPEAKER_ASSIST, false)

    fun setSpeakerAssistEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_SPEAKER_ASSIST, enabled).apply()
    }

    fun setPendingCall(context: Context, phoneNumber: String?, callType: String?) {
        prefs(context).edit()
            .putString(KEY_PENDING_NUMBER, phoneNumber ?: "")
            .putString(KEY_PENDING_TYPE, callType ?: "unknown")
            .apply()
    }

    fun consumePendingCall(context: Context): Pair<String, String> {
        val prefs = prefs(context)
        val phoneNumber = prefs.getString(KEY_PENDING_NUMBER, "") ?: ""
        val callType = prefs.getString(KEY_PENDING_TYPE, "unknown") ?: "unknown"
        prefs.edit()
            .remove(KEY_PENDING_NUMBER)
            .remove(KEY_PENDING_TYPE)
            .apply()
        return phoneNumber to callType
    }

    fun clearRuntimeState() {
        isServiceRunning = false
        currentFilePath = null
        currentPhoneNumber = ""
        currentCallType = "unknown"
        recordingStartedAt = 0L
    }

    fun appendDebugTrace(context: Context, source: String, message: String) {
        val prefs = prefs(context)
        val existing = prefs.getStringSet(KEY_DEBUG_TRACE, emptySet()).orEmpty()
        val traces = existing.toMutableList()
            .sorted()
            .takeLast(TRACE_LIMIT - 1)
            .toMutableList()
        traces.add("${System.currentTimeMillis()}|$source|$message")
        prefs.edit().putStringSet(KEY_DEBUG_TRACE, traces.toSet()).apply()
    }

    fun getDebugTrace(context: Context): List<String> =
        prefs(context).getStringSet(KEY_DEBUG_TRACE, emptySet()).orEmpty().sorted()

    fun clearDebugTrace(context: Context) {
        prefs(context).edit().remove(KEY_DEBUG_TRACE).apply()
    }
}
