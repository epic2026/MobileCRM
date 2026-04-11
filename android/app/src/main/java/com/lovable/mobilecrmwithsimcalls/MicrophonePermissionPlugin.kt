package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "MicrophonePermissionPlugin",
    permissions = [
        Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO])
    ]
)
class MicrophonePermissionPlugin : Plugin() {

    @PluginMethod
    fun requestMicrophonePermission(call: PluginCall) {
        if (hasMicrophonePermission()) {
            call.resolve(JSObject().put("microphone", "granted"))
            return
        }

        requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
    }

    @PluginMethod
    fun checkMicrophonePermission(call: PluginCall) {
        call.resolve(JSObject().put("microphone", microphonePermissionStatus()))
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().put("opened", true))
        } catch (error: Exception) {
            call.reject("Failed to open app settings: ${error.message}")
        }
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        call.resolve(JSObject().put("microphone", microphonePermissionStatus()))
    }

    private fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }

    private fun microphonePermissionStatus(): String {
        return if (hasMicrophonePermission()) {
            PermissionState.GRANTED.toString().lowercase()
        } else {
            PermissionState.DENIED.toString().lowercase()
        }
    }
}