// android/app/src/main/java/app/lovable/callflow/CallLogPlugin.kt
package app.lovable.callflow

import android.Manifest
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.CallLog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.text.SimpleDateFormat
import java.util.*

@CapacitorPlugin(
    name = "CallLogPlugin",
    permissions = [
        Permission(
            alias = "callLog",
            strings = [
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.WRITE_CALL_LOG
            ]
        ),
        Permission(
            alias = "phoneState",
            strings = [
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.PROCESS_OUTGOING_CALLS
            ]
        )
    ]
)
class CallLogPlugin : Plugin() {

    @PluginMethod
    fun getCallLogs(call: PluginCall) {
        if (!hasCallLogPermission()) {
            requestPermissionForAlias("callLog", call, "callLogPermsCallback")
            return
        }

        fetchCallLogs(call)
    }

    @PermissionCallback
    private fun callLogPermsCallback(call: PluginCall) {
        if (hasCallLogPermission()) {
            fetchCallLogs(call)
        } else {
            call.reject("Permission denied for call log access")
        }
    }

    private fun hasCallLogPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun fetchCallLogs(call: PluginCall) {
        val limit = call.getInt("limit", 50) ?: 50
        val logs = JSArray()

        try {
            val cursor: Cursor? = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls._ID,
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.CACHED_NAME,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION
                ),
                null,
                null,
                "${CallLog.Calls.DATE} DESC LIMIT $limit"
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val logEntry = JSObject()
                    logEntry.put("id", it.getLong(0).toString())
                    logEntry.put("phone", it.getString(1) ?: "")
                    logEntry.put("name", it.getString(2) ?: "")
                    
                    val callType = when (it.getInt(3)) {
                        CallLog.Calls.INCOMING_TYPE -> "incoming"
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE -> "missed"
                        CallLog.Calls.REJECTED_TYPE -> "missed"
                        else -> "unknown"
                    }
                    logEntry.put("type", callType)
                    
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                    dateFormat.timeZone = TimeZone.getTimeZone("UTC")
                    logEntry.put("timestamp", dateFormat.format(Date(it.getLong(4))))
                    
                    logEntry.put("duration", it.getLong(5))
                    
                    logs.put(logEntry)
                }
            }

            val result = JSObject()
            result.put("logs", logs)
            call.resolve(result)

        } catch (e: Exception) {
            call.reject("Error fetching call logs: ${e.message}")
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        if (!hasCallLogPermission()) {
            requestPermissionForAlias("callLog", call, "callLogPermsCallback")
        } else {
            val result = JSObject()
            result.put("callLog", "granted")
            call.resolve(result)
        }
    }

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        val result = JSObject()
        result.put(
            "callLog",
            if (hasCallLogPermission()) "granted" else "denied"
        )
        call.resolve(result)
    }
}
