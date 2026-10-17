package one.atome.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import org.json.JSONObject

object NativeCallNotifications {
    const val CALL_ID = 2006
    private const val CALL_CHANNEL = "atome.calls"
    private const val ACTIVE_CHANNEL = "atome.calls.active"
    private const val MESSAGE_CHANNEL = "atome.messages"
    private fun channels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CALL_CHANNEL, context.getString(R.string.atome_call_channel),
            NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            enableVibration(true); lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
        manager.createNotificationChannel(NotificationChannel(ACTIVE_CHANNEL, context.getString(R.string.atome_call_channel),
            NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
        manager.createNotificationChannel(NotificationChannel(MESSAGE_CHANNEL, context.getString(R.string.atome_message_channel),
            NotificationManager.IMPORTANCE_DEFAULT))
    }
    private fun action(context: Context, data: JSONObject, action: String): PendingIntent {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: error("notifications_activity_unavailable")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse("atome-notification://${data.getString("notification_id")}/$action"))
            .putExtra("atome.notification", data.toString()).putExtra("atome.action", action)
        if (action == "answer" || action == "end") {
            intent.putExtra("atome.interaction", NativeCommunication.interactionToken(data.getString("room_id"))
                ?: error("notifications_call_unavailable"))
        }
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun call(context: Context, data: JSONObject, ongoing: Boolean): Notification {
        channels(context)
        val title = context.getString(if (ongoing) R.string.atome_active_call else R.string.atome_incoming_call)
        val end = action(context, data, "end")
        val builder = Notification.Builder(context, if (ongoing) ACTIVE_CHANNEL else CALL_CHANNEL)
            .setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle(title)
            .setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setOngoing(true).setContentIntent(action(context, data, "open"))
        if (Build.VERSION.SDK_INT >= 31) {
            val person = Person.Builder().setName(title).setImportant(true).build()
            builder.setStyle(if (ongoing) Notification.CallStyle.forOngoingCall(person, end)
                else Notification.CallStyle.forIncomingCall(person, end, action(context, data, "answer")))
        } else {
            if (!ongoing) builder.addAction(Notification.Action.Builder(null, context.getString(R.string.atome_answer),
                action(context, data, "answer")).build())
            builder.addAction(Notification.Action.Builder(null, context.getString(if (ongoing) R.string.atome_end else R.string.atome_decline), end).build())
        }
        if (!ongoing) {
            builder.setFullScreenIntent(action(context, data, "open"), true)
                .setTimeoutAfter(maxOf(1, data.optLong("expires_at") - System.currentTimeMillis()))
        }
        return builder.build().also { if (!ongoing) it.flags = it.flags or Notification.FLAG_INSISTENT }
    }
    fun update(context: Context, data: JSONObject, ongoing: Boolean, media: Boolean = false) {
        context.startForegroundService(Intent(context, AtomeCallForegroundService::class.java)
            .putExtra("atome", data.toString()).putExtra("ongoing", ongoing).putExtra("media", media))
    }
    fun message(context: Context, data: JSONObject): Notification {
        channels(context)
        return Notification.Builder(context, MESSAGE_CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Atome").setContentText(context.getString(R.string.atome_notification))
            .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(action(context, data, "open")).build()
    }
}
