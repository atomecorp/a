package one.atome.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONObject
import java.time.Instant

// An alarm ringing (AtomeAlarmReceiver): its sound on the alarm stream — a built-in ringtone (res/raw, the same
// files as the page's and iOS's), a sound of the person's (AtomeAlarms.soundFile, its first 30 s in passes, as iOS
// keeps them), or the phone's alarm sound for an alarm that names none — until Stop, the notification opened or
// 60 s, as a ring nobody stops in the page (calendar_alarm_launch.js). Its notification says what rings.
class AtomeAlarmService : Service() {
    companion object {
        const val ACTION_RING = "one.atome.mobile.ALARM_RING"
        const val ACTION_STOP = "one.atome.mobile.ALARM_STOP"
        const val EXTRA_DESCRIPTOR = "atome.alarm.descriptor"
        private const val CHANNEL = "atome.alarms"
        private const val NOTIFICATION_ID = 2007
        private const val RING_LIMIT_MS = 60_000L
        private const val PASS_MS = 30_000
    }
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_RING) { stop(); return START_NOT_STICKY }
        val descriptor = JSONObject(intent.getStringExtra(EXTRA_DESCRIPTOR) ?: "{}")
        startForeground(NOTIFICATION_ID, notification(descriptor), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        ring(soundOf(descriptor.optString("sound")), descriptor.optString("sound").startsWith("alarm_media_"))
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ stop() }, RING_LIMIT_MS)
        return START_NOT_STICKY
    }

    private fun soundOf(name: String): Uri = when {
        name.startsWith("alarm_media_") -> AtomeAlarms.soundFile(this, name)?.let { Uri.fromFile(it) }
        name.isNotEmpty() -> resources.getIdentifier(name, "raw", packageName).takeIf { it != 0 }?.let { Uri.parse("android.resource://$packageName/$it") }
        else -> null
    } ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)

    private fun ring(sound: Uri, passes: Boolean) {
        player?.release()
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            setDataSource(this@AtomeAlarmService, sound)
            isLooping = true
            prepare()
            start()
        }
        // A person's sound longer than a pass starts again from its beginning every 30 s.
        if (passes && (player?.duration ?: 0) > PASS_MS) handler.postDelayed(object : Runnable {
            override fun run() { player?.seekTo(0); handler.postDelayed(this, PASS_MS.toLong()) }
        }, PASS_MS.toLong())
    }

    private fun stop() {
        handler.removeCallbacksAndMessages(null)
        player?.release(); player = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun notification(descriptor: JSONObject): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.atome_alarm_channel), NotificationManager.IMPORTANCE_HIGH)
            .apply { setSound(null, null); enableVibration(true); lockscreenVisibility = Notification.VISIBILITY_PUBLIC })
        val id = descriptor.optString("id")
        val stop = PendingIntent.getService(this, 0, Intent(this, AtomeAlarmService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(descriptor.optString("title").ifBlank { "Atome" }).setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setOngoing(true).setDeleteIntent(stop)
            .setContentIntent(AtomeAlarms.appIntent(this, "ring/${Uri.encode(id)}") { putExtra(AtomeAlarms.EXTRA_STOP, true) })
            .addAction(Notification.Action.Builder(null, getString(R.string.atome_alarm_stop), stop).build())
        val open = descriptor.optString("open")
        if (open.isNotBlank()) {
            val opened = JSONObject().put("eventId", descriptor.optString("eventId")).put("alarmId", id).put("openedAt", Instant.now().toString())
            builder.addAction(Notification.Action.Builder(null, open, AtomeAlarms.appIntent(this, "opened/${Uri.encode(id)}") {
                putExtra(AtomeAlarms.EXTRA_STOP, true); putExtra(AtomeAlarms.EXTRA_OPENED, opened.toString())
            }).build())
        }
        return builder.build()
    }
}
