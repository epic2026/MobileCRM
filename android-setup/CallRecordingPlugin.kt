package app.lovable.mobilecrm.plugins

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File

/**
 * Capacitor plugin for automatic call recording.
 * Manages the CallRecordingService and provides JavaScript interface.
 */
@CapacitorPlugin(
    name = "CallRecordingPlugin",
    permissions = [
        Permission(
            alias = "microphone",
            strings = [Manifest.permission.RECORD_AUDIO]
        ),
        Permission(
            alias = "phoneState",
            strings = [Manifest.permission.READ_PHONE_STATE]
        ),
        Permission(
            alias = "callLog",
            strings = [Manifest.permission.READ_CALL_LOG]
        ),
        Permission(
            alias = "outgoingCalls",
            strings = [Manifest.permission.PROCESS_OUTGOING_CALLS]
        )
    ]
)
class CallRecordingPlugin : Plugin() {
    companion object {
        private const val TAG = "CallRecordingPlugin"
        private var pluginInstance: CallRecordingPlugin? = null
        
        /**
         * Send events from the service to JavaScript
         */
        fun sendEvent(eventName: String, data: Map<String, Any>) {
            pluginInstance?.let { plugin ->
                val jsObject = JSObject()
                data.forEach { (key, value) ->
                    when (value) {
                        is String -> jsObject.put(key, value)
                        is Int -> jsObject.put(key, value)
                        is Long -> jsObject.put(key, value)
                        is Boolean -> jsObject.put(key, value)
                        is Double -> jsObject.put(key, value)
                        else -> jsObject.put(key, value.toString())
                    }
                }
                plugin.notifyListeners(eventName, jsObject)
                Log.d(TAG, "Event sent: $eventName - $data")
            }
        }
    }
    
    private var isServiceRunning = false
    
    override fun load() {
        super.load()
        pluginInstance = this
        Log.d(TAG, "Plugin loaded")
    }
    
    @PluginMethod
    fun startService(call: PluginCall) {
        Log.d(TAG, "startService called")
        
        if (!hasAllPermissions()) {
            requestAllPermissions(call, "servicePermissionsCallback")
            return
        }
        
        doStartService(call)
    }
    
    @PermissionCallback
    private fun servicePermissionsCallback(call: PluginCall) {
        if (hasAllPermissions()) {
            doStartService(call)
        } else {
            call.reject("Required permissions not granted")
        }
    }
    
    private fun doStartService(call: PluginCall) {
        try {
            val serviceIntent = Intent(context, CallRecordingService::class.java)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            
            isServiceRunning = true
            
            val result = JSObject()
            result.put("status", "started")
            result.put("message", "Call recording service started")
            call.resolve(result)
            
            Log.d(TAG, "Service started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting service: ${e.message}")
            call.reject("Failed to start service: ${e.message}")
        }
    }
    
    @PluginMethod
    fun stopService(call: PluginCall) {
        Log.d(TAG, "stopService called")
        
        try {
            val serviceIntent = Intent(context, CallRecordingService::class.java)
            context.stopService(serviceIntent)
            isServiceRunning = false
            
            val result = JSObject()
            result.put("status", "stopped")
            result.put("message", "Call recording service stopped")
            call.resolve(result)
            
            Log.d(TAG, "Service stopped successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping service: ${e.message}")
            call.reject("Failed to stop service: ${e.message}")
        }
    }
    
    @PluginMethod
    fun isServiceRunning(call: PluginCall) {
        val result = JSObject()
        result.put("running", isServiceRunning)
        call.resolve(result)
    }
    
    @PluginMethod
    fun getRecordingFile(call: PluginCall) {
        val filePath = call.getString("filePath")
        
        if (filePath.isNullOrEmpty()) {
            call.reject("File path is required")
            return
        }
        
        try {
            val file = File(filePath)
            
            if (!file.exists()) {
                call.reject("File not found")
                return
            }
            
            val result = JSObject()
            result.put("filePath", file.absolutePath)
            result.put("fileName", file.name)
            result.put("size", file.length())
            result.put("exists", true)
            
            // Read file as base64 for upload
            val bytes = file.readBytes()
            val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
            result.put("base64", base64)
            result.put("mimeType", "audio/mp4")
            
            call.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error reading file: ${e.message}")
            call.reject("Failed to read file: ${e.message}")
        }
    }
    
    @PluginMethod
    fun deleteRecordingFile(call: PluginCall) {
        val filePath = call.getString("filePath")
        
        if (filePath.isNullOrEmpty()) {
            call.reject("File path is required")
            return
        }
        
        try {
            val file = File(filePath)
            val deleted = if (file.exists()) file.delete() else false
            
            val result = JSObject()
            result.put("deleted", deleted)
            call.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting file: ${e.message}")
            call.reject("Failed to delete file: ${e.message}")
        }
    }
    
    @PluginMethod
    fun listRecordings(call: PluginCall) {
        try {
            val dir = File(context.getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC), "CallRecordings")
            
            if (!dir.exists()) {
                val result = JSObject()
                result.put("recordings", emptyArray<JSObject>())
                call.resolve(result)
                return
            }
            
            val files = dir.listFiles { file -> file.extension == "m4a" }
            val recordings = files?.map { file ->
                JSObject().apply {
                    put("filePath", file.absolutePath)
                    put("fileName", file.name)
                    put("size", file.length())
                    put("lastModified", file.lastModified())
                }
            } ?: emptyList()
            
            val result = JSObject()
            result.put("recordings", recordings.toTypedArray())
            call.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error listing recordings: ${e.message}")
            call.reject("Failed to list recordings: ${e.message}")
        }
    }
    
    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        requestAllPermissions(call, "permissionsCallback")
    }
    
    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        val result = JSObject()
        result.put("microphone", if (hasMicrophonePermission()) "granted" else "denied")
        result.put("phoneState", if (hasPhoneStatePermission()) "granted" else "denied")
        result.put("callLog", if (hasCallLogPermission()) "granted" else "denied")
        result.put("allGranted", hasAllPermissions())
        call.resolve(result)
    }
    
    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        val result = JSObject()
        result.put("microphone", if (hasMicrophonePermission()) "granted" else "denied")
        result.put("phoneState", if (hasPhoneStatePermission()) "granted" else "denied")
        result.put("callLog", if (hasCallLogPermission()) "granted" else "denied")
        result.put("allGranted", hasAllPermissions())
        call.resolve(result)
    }
    
    private fun hasAllPermissions(): Boolean {
        return hasMicrophonePermission() && hasPhoneStatePermission() && hasCallLogPermission()
    }
    
    private fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == 
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }
    
    private fun hasPhoneStatePermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == 
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }
    
    private fun hasCallLogPermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == 
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }
}
