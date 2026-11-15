package one.atome.mobile

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.CalendarContract
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.TimeZone

// eVe's appointments in the phone's own calendar (eVe/intuition/tools/calendar_device_export.js), as on iOS
// (NativeDeviceCalendar.swift): a local calendar of eVe's own, « eVe », kept equal to the set the page gives —
// an appointment new or changed is written again, one the set no longer holds is removed. Which event stands for
// which appointment, and what it was written from, are kept here.
object AtomeDeviceCalendar {
    private const val ACCOUNT = "eVe"
    private const val STORE = "atome.device_calendar"
    private const val MAP = "map"
    private val UTC_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)
    private val DAY_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd")

    fun handle(context: Context, command: String, payload: JSONObject): JSONObject = when (command) {
        "calendar_export_authorization" -> JSONObject().put("ok", true).put("granted", true).put("status", "authorized")
        "calendar_export_sync" -> sync(context, payload.optJSONArray("events") ?: JSONArray())
        else -> JSONObject().put("ok", false).put("error", "calendar_export_command_unsupported")
    }

    private fun asOwner(uri: Uri): Uri = uri.buildUpon().appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT)
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build()

    private fun calendarId(context: Context): Long {
        context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._ID),
            "${CalendarContract.Calendars.ACCOUNT_NAME} = ? AND ${CalendarContract.Calendars.ACCOUNT_TYPE} = ?",
            arrayOf(ACCOUNT, CalendarContract.ACCOUNT_TYPE_LOCAL), null)?.use { if (it.moveToFirst()) return it.getLong(0) }
        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT)
            put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(CalendarContract.Calendars.NAME, ACCOUNT)
            put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, ACCOUNT)
            put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF7F6CF0.toInt())
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
            put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT)
            put(CalendarContract.Calendars.VISIBLE, 1)
            put(CalendarContract.Calendars.SYNC_EVENTS, 1)
            put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
        }
        val created = context.contentResolver.insert(asOwner(CalendarContract.Calendars.CONTENT_URI), values) ?: error("calendar_export_calendar_failed")
        return ContentUris.parseId(created)
    }

    private fun exists(context: Context, native: Long): Boolean = context.contentResolver.query(
        ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, native), arrayOf(CalendarContract.Events._ID),
        "${CalendarContract.Events.DELETED} = 0", null, null)?.use { it.count > 0 } ?: false

    private fun remove(context: Context, native: Long) {
        context.contentResolver.delete(asOwner(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, native)), null, null)
    }

    // Stable whatever the order of its keys: what the appointment was written from.
    private fun signature(descriptor: JSONObject): String =
        descriptor.keys().asSequence().sorted().joinToString("\u0001") { "$it=${descriptor.get(it)}" }

    private fun sync(context: Context, events: JSONArray): JSONObject {
        val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        val map = JSONObject(prefs.getString(MAP, null) ?: "{}")
        val wanted = (0 until events.length()).map { events.getJSONObject(it) }.associateBy { it.optString("id") }.filterKeys { it.isNotEmpty() }
        val written = JSONArray(); val removed = JSONArray(); val failed = JSONObject()
        for (id in map.keys().asSequence().toList()) if (id !in wanted) {
            remove(context, map.getJSONObject(id).getLong("native")); map.remove(id); removed.put(id)
        }
        val calendar = if (wanted.isEmpty()) 0L else calendarId(context)
        for ((id, descriptor) in wanted) {
            val known = map.optJSONObject(id)
            val signature = signature(descriptor)
            if (known != null && known.optString("signature") == signature && exists(context, known.getLong("native"))) continue
            // A changed appointment is written anew, its series' exceptions leaving with the old one.
            if (known != null) remove(context, known.getLong("native"))
            try {
                val created = context.contentResolver.insert(asOwner(CalendarContract.Events.CONTENT_URI), values(descriptor, calendar))
                    ?: error("calendar_export_event_failed")
                map.put(id, JSONObject().put("native", ContentUris.parseId(created)).put("signature", signature)); written.put(id)
            } catch (error: Exception) { map.remove(id); failed.put(id, error.message ?: "calendar_export_event_failed") }
        }
        prefs.edit().putString(MAP, map.toString()).apply()
        return JSONObject().put("ok", failed.length() == 0).put("written", written).put("removed", removed).put("failed", failed)
    }

    private fun values(descriptor: JSONObject, calendar: Long): ContentValues {
        val allDay = descriptor.optBoolean("allDay")
        val zone = descriptor.optString("timezone").takeIf { it.isNotEmpty() && ZoneId.getAvailableZoneIds().contains(it) } ?: TimeZone.getDefault().id
        var start = Instant.parse(descriptor.getString("start")).toEpochMilli()
        var end = maxOf(start, Instant.parse(descriptor.getString("end")).toEpochMilli())
        // An all-day appointment lies on its local days, at UTC midnight, as Android's calendars expect.
        if (allDay) {
            val first = Instant.ofEpochMilli(start).atZone(ZoneId.of(zone)).toLocalDate()
            val last = Instant.ofEpochMilli(end).atZone(ZoneId.of(zone)).toLocalDate().let { if (it.isAfter(first)) it else first.plusDays(1) }
            start = first.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(); end = last.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }
        val rrule = descriptor.optString("rrule")
        return ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, calendar)
            put(CalendarContract.Events.TITLE, descriptor.optString("title"))
            put(CalendarContract.Events.DESCRIPTION, descriptor.optString("notes"))
            put(CalendarContract.Events.EVENT_LOCATION, descriptor.optString("location"))
            put(CalendarContract.Events.DTSTART, start)
            put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
            put(CalendarContract.Events.EVENT_TIMEZONE, if (allDay) "UTC" else zone)
            if (rrule.isEmpty()) put(CalendarContract.Events.DTEND, end)
            else {
                put(CalendarContract.Events.RRULE, rrule)
                put(CalendarContract.Events.DURATION, if (allDay) "P${maxOf(1, (end - start) / 86_400_000)}D" else "P${(end - start) / 1000}S")
                val exdates = descriptor.optJSONArray("exdates")
                if (exdates != null && exdates.length() > 0) put(CalendarContract.Events.EXDATE, (0 until exdates.length()).joinToString(",") {
                    val at = Instant.parse(exdates.getString(it))
                    if (allDay) DAY_STAMP.format(at.atZone(ZoneId.of(zone)).toLocalDate()) else UTC_STAMP.format(at)
                })
            }
        }
    }
}
