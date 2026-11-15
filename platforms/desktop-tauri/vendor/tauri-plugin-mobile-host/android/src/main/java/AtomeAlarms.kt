package one.atome.mobile

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.time.Instant
import java.util.Calendar

// The phone's own alarms on Android: the same commands and descriptors as the iOS host (NativeCalendarAlarm.swift,
// eVe/intuition/tools/calendar_alarm_native.js). Each atome alarm is armed with AlarmManager.setAlarmClock, so it
// rings exactly at its time with atome closed, the phone asleep or restarted (AtomeAlarmReceiver re-arms them):
// `fixed` at its instant, `relative` at its local time on its weekdays (Foundation numbering, 1 = Sunday, as
// java.util.Calendar's). The set the page gave last is kept here; AtomeAlarmService rings it.
object AtomeAlarms {
    const val ACTION_FIRE = "one.atome.mobile.ALARM_FIRE"
    const val EXTRA_ID = "atome.alarm.id"
    const val EXTRA_STOP = "atome.alarm.stop"
    const val EXTRA_OPENED = "atome.alarm.opened"
    private const val STORE = "atome.alarms"
    private const val SET = "set"
    private const val OPENED = "opened"
    private const val SOUNDS = "alarm_sounds"
    private val NAME = Regex("^alarm_media_[A-Za-z0-9_]{1,80}$")
    private val EXTENSION = Regex("^[a-z0-9]{2,5}$")
    private var page: WeakReference<WebView>? = null

    fun handle(context: Context, command: String, payload: JSONObject): JSONObject = when (command) {
        "calendar_alarm_platform" -> JSONObject().put("ok", true).put("platform", "alarm_manager").put("available", true).put("fallback", false)
        "calendar_alarm_authorization" -> authorization(context)
        "calendar_alarm_schedule" -> schedule(context, JSONArray().put(payload.getJSONObject("alarm")), false)
        "calendar_alarm_sync" -> schedule(context, payload.optJSONArray("alarms") ?: JSONArray(), true)
        "calendar_alarm_cancel" -> cancel(context, payload.optJSONArray("ids") ?: JSONArray())
        "calendar_alarm_list" -> JSONObject().put("ok", true).put("platform", "alarm_manager").put("ids", JSONArray(stored(context).keys().asSequence().sorted().toList()))
        "calendar_alarm_opened_take" -> takeOpened(context)
        "calendar_alarm_sound_has" -> soundsHeld(context, payload.optJSONArray("names") ?: JSONArray())
        "calendar_alarm_sound_store" -> storeSound(context, payload)
        else -> JSONObject().put("ok", false).put("error", "calendar_alarm_command_unsupported")
    }

    private fun prefs(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    private fun stored(context: Context) = JSONObject(prefs(context).getString(SET, null) ?: "{}")
    private fun save(context: Context, set: JSONObject) { prefs(context).edit().putString(SET, set.toString()).apply() }
    fun descriptor(context: Context, id: String): JSONObject? = stored(context).optJSONObject(id)

    private fun authorization(context: Context): JSONObject {
        val alerts = context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
        val exact = Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
        val granted = alerts && exact
        return JSONObject().put("ok", true).put("platform", "alarm_manager").put("status", if (granted) "authorized" else "denied")
            .put("granted", granted).put("notifications", alerts).put("exact", exact)
    }

    // The next time an alarm rings after `now`, or null when it never will again.
    fun nextTrigger(descriptor: JSONObject, now: Long): Long? {
        if (descriptor.optString("mode") == "relative" && descriptor.has("hour") && descriptor.has("minute")) {
            val weekdays = descriptor.optJSONArray("weekdays")?.let { list -> (0 until list.length()).map { list.getInt(it) } } ?: emptyList()
            for (day in 0..7) {
                val at = Calendar.getInstance().apply {
                    timeInMillis = now; add(Calendar.DAY_OF_YEAR, day)
                    set(Calendar.HOUR_OF_DAY, descriptor.getInt("hour")); set(Calendar.MINUTE, descriptor.getInt("minute"))
                    set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                }
                if (at.timeInMillis > now && (weekdays.isEmpty() || weekdays.contains(at.get(Calendar.DAY_OF_WEEK)))) return at.timeInMillis
            }
            return null
        }
        val at = runCatching { Instant.parse(descriptor.optString("fireAt")).toEpochMilli() }.getOrNull() ?: return null
        return if (at > now) at else null
    }

    private fun fireIntent(context: Context, id: String): PendingIntent = PendingIntent.getBroadcast(context, 0,
        Intent(context, AtomeAlarmReceiver::class.java).setAction(ACTION_FIRE).setData(Uri.parse("atome-alarm://${Uri.encode(id)}")).putExtra(EXTRA_ID, id),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    // The app opened from an alarm (its notification, « Ouvrir »): `extras` say what it carries.
    fun appIntent(context: Context, data: String, extras: Intent.() -> Unit): PendingIntent {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: error("calendar_alarm_activity_unavailable")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).setData(Uri.parse("atome-alarm-open://$data")).extras()
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun arm(context: Context, id: String, at: Long) {
        val manager = context.getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) error("calendar_alarm_exact_not_allowed")
        val show = appIntent(context, "show/${Uri.encode(id)}") {}
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), fireIntent(context, id))
    }

    private fun disarm(context: Context, id: String) {
        val intent = fireIntent(context, id)
        context.getSystemService(AlarmManager::class.java).cancel(intent)
        intent.cancel()
    }

    private fun schedule(context: Context, desired: JSONArray, cancelStale: Boolean): JSONObject {
        val set = stored(context)
        val now = System.currentTimeMillis()
        val wanted = mutableSetOf<String>()
        val scheduled = JSONArray(); val skipped = JSONArray(); val failed = JSONObject()
        for (index in 0 until desired.length()) {
            val descriptor = desired.getJSONObject(index)
            val id = descriptor.optString("id")
            if (id.isEmpty()) continue
            wanted.add(id)
            val at = nextTrigger(descriptor, now)
            if (at == null) { skipped.put(id); disarm(context, id); set.remove(id); continue }
            try { arm(context, id, at); set.put(id, descriptor); scheduled.put(id) }
            catch (error: Exception) { failed.put(id, error.message ?: "calendar_alarm_schedule_failed") }
        }
        val canceled = JSONArray()
        if (cancelStale) for (id in set.keys().asSequence().toList()) if (id !in wanted) { disarm(context, id); set.remove(id); canceled.put(id) }
        save(context, set)
        return JSONObject().put("ok", failed.length() == 0).put("platform", "alarm_manager").put("scheduled", scheduled)
            .put("skipped", skipped).put("failed", failed).put("canceled", canceled)
    }

    private fun cancel(context: Context, ids: JSONArray): JSONObject {
        val set = stored(context)
        for (index in 0 until ids.length()) { val id = ids.getString(index); disarm(context, id); set.remove(id) }
        save(context, set)
        return JSONObject().put("ok", true).put("platform", "alarm_manager").put("canceled", ids)
    }

    // An alarm rang: a weekly one is armed for its next time, a one-shot one is done.
    fun fired(context: Context, id: String): JSONObject? {
        val set = stored(context)
        val descriptor = set.optJSONObject(id) ?: return null
        val next = if (descriptor.optString("mode") == "relative" && (descriptor.optJSONArray("weekdays")?.length() ?: 0) > 0)
            nextTrigger(descriptor, System.currentTimeMillis() + 60_000) else null
        if (next != null) arm(context, id, next) else { set.remove(id); save(context, set) }
        return descriptor
    }

    // After a restart, an update or a clock change: every alarm kept is armed again.
    fun rearm(context: Context) {
        val set = stored(context)
        val now = System.currentTimeMillis()
        for (id in set.keys().asSequence().toList()) {
            val at = nextTrigger(set.getJSONObject(id), now)
            if (at == null) set.remove(id) else runCatching { arm(context, id, at) }
        }
        save(context, set)
    }

    // The app brought forward by an alarm's notification: its ring stops; « Ouvrir » is kept for the page to take.
    fun noteIntent(context: Context, intent: Intent?, webView: WebView? = null) {
        if (webView != null) page = WeakReference(webView)
        if (intent == null) return
        if (intent.getBooleanExtra(EXTRA_STOP, false)) context.startService(Intent(context, AtomeAlarmService::class.java).setAction(AtomeAlarmService.ACTION_STOP))
        val opened = intent.getStringExtra(EXTRA_OPENED) ?: return
        intent.removeExtra(EXTRA_OPENED)
        prefs(context).edit().putString(OPENED, opened).apply()
        Handler(Looper.getMainLooper()).post {
            page?.get()?.evaluateJavascript("window.dispatchEvent(new CustomEvent('eve:calendar-alarm-opened'));", null)
        }
    }

    private fun takeOpened(context: Context): JSONObject {
        val opened = prefs(context).getString(OPENED, null)
        prefs(context).edit().remove(OPENED).apply()
        return JSONObject().put("ok", true).put("opened", opened?.let { JSONObject(it) } ?: JSONObject.NULL)
    }

    // The person's sounds (calendar_alarm_sound.js), kept under their name; AtomeAlarmService plays them as they are.
    private fun soundsDir(context: Context) = File(context.filesDir, SOUNDS).apply { mkdirs() }
    fun soundFile(context: Context, name: String): File? =
        if (NAME.matches(name)) soundsDir(context).listFiles()?.firstOrNull { it.nameWithoutExtension == name } else null

    private fun soundsHeld(context: Context, names: JSONArray): JSONObject {
        val held = JSONArray()
        for (index in 0 until names.length()) { val name = names.getString(index); if (soundFile(context, name) != null) held.put(name) }
        return JSONObject().put("ok", true).put("names", held)
    }

    private fun storeSound(context: Context, payload: JSONObject): JSONObject {
        val name = payload.optString("name")
        val extension = payload.optString("extension").lowercase()
        if (!NAME.matches(name)) return JSONObject().put("ok", false).put("error", "alarm_sound_name_invalid")
        if (!EXTENSION.matches(extension)) return JSONObject().put("ok", false).put("error", "alarm_sound_kind_invalid")
        val bytes = runCatching { Base64.decode(payload.optString("data"), Base64.DEFAULT) }.getOrNull()
        if (bytes == null || bytes.isEmpty()) return JSONObject().put("ok", false).put("error", "alarm_sound_data_invalid")
        soundFile(context, name)?.delete()
        val partial = File(soundsDir(context), "$name.partial")
        partial.writeBytes(bytes)
        if (!partial.renameTo(File(soundsDir(context), "$name.$extension"))) { partial.delete(); return JSONObject().put("ok", false).put("error", "alarm_sound_unwritable") }
        return JSONObject().put("ok", true).put("name", name)
    }
}
