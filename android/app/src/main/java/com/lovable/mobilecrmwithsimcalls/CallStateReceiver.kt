package com.lovable.mobilecrmwithsimcalls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/**
 * Receives PHONE_STATE broadcasts to capture the caller's phone number and call
 * direction, then forwards that metadata to the already-running
 * [CallRecordingService] via a regular startService() call.
 *
 * ⚠️  This receiver does NOT start or stop the service.  Starting a foreground
 * service from a background BroadcastReceiver is blocked on Android 12+
 * ("mAllowStartForeground false").  The service is started once, while the app is
 * in the foreground, when the user enables the toggle in Settings.  It then
 * listens for call state changes internally via TelephonyCallback so that no
 * further startForegroundService() call is ever needed from the receiver.
 */
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
            CallRecordingPlugin.trace(context, "receiver", "Ignoring broadcast — auto recording is disabled")
            return
        }

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                // Store the incoming number so we can forward it to the service on OFFHOOK.
                CallRecordingState.setPendingCall(context, incomingNumber, "incoming")
                CallRecordingPlugin.trace(context, "receiver", "RINGING -> stored pending incoming number")
            }

            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                val (pendingNumber, pendingType) = CallRecordingState.consumePendingCall(context)
                val resolvedType = if (pendingType == "incoming") "incoming" else "outgoing"
                val resolvedNumber = pendingNumber.ifBlank { incomingNumber ?: "" }

                // Forward call metadata to the already-running service using a
                // plain startService() — this is always allowed on a foreground service.
                try {
                    val updateIntent = Intent(context, CallRecordingService::class.java).apply {
                        setAction(CallRecordingService.ACTION_UPDATE_CALL_INFO)
                        putExtra(CallRecordingService.EXTRA_PHONE_NUMBER, resolvedNumber)
                        putExtra(CallRecordingService.EXTRA_CALL_TYPE, resolvedType)
                    }
                    context.startService(updateIntent)
                    CallRecordingPlugin.trace(
                        context, "receiver",
                        "OFFHOOK -> forwarded call info to service: number=$resolvedNumber type=$resolvedType"
                    )
                } catch (e: Exception) {
                    // Service may not be running (e.g. killed by OS).  The service's own
                    // TelephonyCallback will still handle recording — metadata just won't
                    // include the phone number in this edge case.
                    CallRecordingPlugin.trace(
                        context, "receiver",
                        "OFFHOOK -> could not reach service (${e.message}); recording will proceed without metadata"
                    )
                }
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                CallRecordingState.setPendingCall(context, null, null)
                CallRecordingPlugin.trace(context, "receiver", "IDLE -> cleared pending call")
            }

            else -> {
                CallRecordingPlugin.trace(context, "receiver", "Unhandled state=${state ?: "null"}")
            }
        }
    }
}
