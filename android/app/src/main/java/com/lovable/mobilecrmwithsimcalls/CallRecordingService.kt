package com.lovable.mobilecrmwithsimcalls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File

class CallRecordingService : Service() {

    private var recorder: MediaRecorder? = null
    private var outputFile: String? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("CallRecorder", "Service started")

        promoteToForeground()
        startRecording()

        return START_STICKY
    }

    override fun onDestroy() {
        Log.d("CallRecorder", "Service destroyed")
        stopRecording()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun promoteToForeground() {

        val channelId = "call_rec"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Call Recording",
                NotificationManager.IMPORTANCE_LOW
            )

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Call recording active")
            .setContentText("Recording phone call")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                1,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            )
        } else {
            startForeground(1, notification)
        }
    }

    private fun startRecording() {

        try {

            val dir = File(getExternalFilesDir(null), "recordings")
            if (!dir.exists()) dir.mkdirs()

            outputFile = "${dir.absolutePath}/call_${System.currentTimeMillis()}.mp4"

            recorder = MediaRecorder().apply {

                // better source during phone calls
                setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)

                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)

                setOutputFile(outputFile)

                prepare()
                start()
            }

            Log.d("CallRecorder", "Recording started: $outputFile")

        } catch (e: Exception) {

            Log.e("CallRecorder", "Recording failed", e)
        }
    }

    private fun stopRecording() {

        try {

            recorder?.stop()
            recorder?.release()

            Log.d("CallRecorder", "Recording stopped")

        } catch (e: Exception) {

            Log.e("CallRecorder", "Stop failed", e)
        }

        recorder = null
    }
}