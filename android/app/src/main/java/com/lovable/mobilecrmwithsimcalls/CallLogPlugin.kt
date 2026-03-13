package com.lovable.mobilecrmwithsimcalls

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.*

@CapacitorPlugin(
    name = "CallLogPlugin",
    permissions = [
        Permission(
            alias = "callLog",
            strings = [Manifest.permission.READ_CALL_LOG]
        )
    ]
)
class CallLogPlugin : Plugin() {

    @PluginMethod
    fun getCallLogs(call: PluginCall) {
        if (!hasPermission()) {
            requestPermissionForAlias("callLog", call, "permCb")
            return
        }
        fetch(call)
    }

    @PermissionCallback
    private fun permCb(call: PluginCall) {
        if (hasPermission()) fetch(call)
        else call.reject("Permission denied")
    }

    @PluginMethod
    fun requestCallLogPermissions(call: PluginCall) {
        if (hasPermission()) {
            call.resolve(JSObject().put("callLog", "granted"))
            return
        }
        requestPermissionForAlias("callLog", call, "permissionStatusCallback")
    }

    @PluginMethod
    fun checkCallLogPermissions(call: PluginCall) {
        call.resolve(JSObject().put("callLog", if (hasPermission()) "granted" else "denied"))
    }

    @PermissionCallback
    private fun permissionStatusCallback(call: PluginCall) {
        call.resolve(JSObject().put("callLog", if (hasPermission()) "granted" else "denied"))
    }

    private fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED

    private fun fetch(call: PluginCall) {
        val logs = JSArray()
        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            null,
            null,
            null,
            "${CallLog.Calls.DATE} DESC LIMIT 50"
        )

        cursor?.use {
            while (it.moveToNext()) {
                val obj = JSObject()
                val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER)).orEmpty()
                val date = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))
                val type = when (it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))) {
                    CallLog.Calls.INCOMING_TYPE -> "incoming"
                    CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                    CallLog.Calls.MISSED_TYPE -> "missed"
                    else -> "unknown"
                }
                obj.put("id", "${date}_${number}")
                obj.put("phone", number)
                obj.put("name", it.getString(it.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)) ?: "")
                obj.put("type", type)
                obj.put("timestamp", date)
                obj.put("duration", it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DURATION)))
                logs.put(obj)
            }
        }

        call.resolve(JSObject().put("logs", logs))
    }
}
