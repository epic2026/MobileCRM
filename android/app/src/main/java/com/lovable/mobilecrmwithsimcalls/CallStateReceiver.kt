package com.lovable.mobilecrmwithsimcalls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log

class CallStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action.orEmpty()
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        CallRecordingPlugin.trace(
            context,
            "receiver",
            "onReceive action=$action state=${state ?: "null"} incoming=${incomingNumber ?: "unknown"} enabled=${CallRecordingState.isAutoRecordingEnabled(context)}"
        )

        if (!CallRecordingState.isAutoRecordingEnabled(context)) {
            CallRecordingPlugin.trace(context, "receiver", "Ignoring broadcast because auto recording is disabled")
            return
        }

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                Log.d("CallStateReceiver", "📲 INCOMING CALL RINGING")
                CallRecordingPlugin.trace(context, "receiver", "RINGING -> pending incoming call stored")
                CallRecordingState.setPendingCall(context, incomingNumber, "incoming")
            }

            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                Log.d("CallStateReceiver", "📞 CALL STARTED")
                val (pendingNumber, pendingType) = CallRecordingState.consumePendingCall(context)
                val resolvedType = if (pendingType == "incoming") pendingType else "outgoing"
                CallRecordingPlugin.trace(
                    context,
                    "receiver",
                    "OFFHOOK -> starting service number=${pendingNumber.ifBlank { incomingNumber ?: "" }} type=$resolvedType"
                )
                val serviceIntent = Intent(context, CallRecordingService::class.java).apply {
                    putExtra("phoneNumber", pendingNumber)
                    putExtra("callType", resolvedType)
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                    CallRecordingPlugin.trace(context, "receiver", "Service start request delivered successfully")
                } catch (error: Exception) {
                    CallRecordingPlugin.trace(
                        context,
                        "receiver",
                        "Service start failed: ${error.message ?: error::class.java.simpleName}"
                    )
                }
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                Log.d("CallStateReceiver", "📴 CALL ENDED")
                CallRecordingPlugin.trace(context, "receiver", "IDLE -> stopping service and clearing pending call")
                CallRecordingState.setPendingCall(context, null, null)
                try {
                    context.stopService(
                        Intent(context, CallRecordingService::class.java)
                    )
                    CallRecordingPlugin.trace(context, "receiver", "Service stop request delivered successfully")
                } catch (error: Exception) {
                    CallRecordingPlugin.trace(
                        context,
                        "receiver",
                        "Service stop failed: ${error.message ?: error::class.java.simpleName}"
                    )
                }
            }

            else -> {
                CallRecordingPlugin.trace(context, "receiver", "Received unhandled phone state=${state ?: "null"}")
            }
        }
    }
}
