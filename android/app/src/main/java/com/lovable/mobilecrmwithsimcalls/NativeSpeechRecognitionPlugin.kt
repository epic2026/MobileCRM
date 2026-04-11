package com.lovable.mobilecrmwithsimcalls

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale

@CapacitorPlugin(name = "NativeSpeechRecognitionPlugin")
class NativeSpeechRecognitionPlugin : Plugin() {

    @PluginMethod
    fun startListening(call: PluginCall) {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt") ?: "Speak your CRM command")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language") ?: Locale.getDefault().toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }

        try {
            startActivityForResult(call, intent, "handleSpeechResult")
        } catch (error: Exception) {
            call.reject("Unable to launch speech recognition: ${error.message}")
        }
    }

    @ActivityCallback
    private fun handleSpeechResult(call: PluginCall, result: androidx.activity.result.ActivityResult?) {
        if (result == null) {
            call.reject("Speech recognition returned no result")
            return
        }

        if (result.resultCode != Activity.RESULT_OK) {
            call.reject("Speech recognition cancelled")
            return
        }

        val matches = result.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?: arrayListOf()

        val jsMatches = JSArray()
        matches.forEach { jsMatches.put(it) }

        call.resolve(
            JSObject()
                .put("transcript", matches.firstOrNull() ?: "")
                .put("matches", jsMatches)
        )
    }
}
