package one.atome.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.PermissionState
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    Permission(strings = [Manifest.permission.READ_CONTACTS], alias = "contacts"),
    Permission(strings = [Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR], alias = "calendar")])
class AtomeHostPlugin(private val activity: Activity) : Plugin(activity) {
    override fun load(webView: WebView) {
        NativeCommunication.attach(activity, webView)
        StreamingView.attach(webView)
        ExternalDisplay.attach(activity, webView)
        AtomeAlarms.noteIntent(activity, activity.intent, webView)
    }
    override fun onResume() { NativeCommunication.signal() }
    override fun onNewIntent(intent: android.content.Intent) {
        AtomeAlarms.noteIntent(activity, intent)
        NativeCommunication.handleIntent(activity, intent)
    }

    @Command fun authDevice(invoke: Invoke) {
        try {
            when (val value = AuthDeviceKey.handle(invoke.getArgs())) {
                is org.json.JSONObject -> invoke.resolve(JSObject(value.toString()))
                is String -> invoke.resolveObject(value)
                is Boolean -> invoke.resolveObject(value)
                else -> invoke.reject("auth_device_result_invalid")
            }
        } catch (_: Exception) { invoke.reject("auth_protected_device_key_unavailable") }
    }

    @Command fun notifications(invoke: Invoke) {
        val args = invoke.getArgs()
        if (args.optString("command") == "notifications_enable" && Build.VERSION.SDK_INT >= 33
            && !NativeCommunication.alertsAuthorized(activity)) {
            requestPermissionForAlias("notifications", invoke, "notificationsPermission"); return
        }
        execute(invoke)
    }
    @Command fun streamingView(invoke: Invoke) {
        val args = invoke.getArgs()
        StreamingView.handle(activity, args.optString("command"), args.optJSONObject("payload") ?: org.json.JSONObject()) { result ->
            invoke.resolve(JSObject(result.toString()))
        }
    }

    @PermissionCallback private fun notificationsPermission(invoke: Invoke) { execute(invoke) }

    // The phone's alarms (AtomeAlarms.kt): the notification permission is asked when the page asks for it.
    @Command fun alarms(invoke: Invoke) {
        val args = invoke.getArgs()
        val payload = args.optJSONObject("payload") ?: org.json.JSONObject()
        if (args.optString("command") == "calendar_alarm_authorization" && payload.optBoolean("request") && Build.VERSION.SDK_INT >= 33
            && !NativeCommunication.alertsAuthorized(activity)) {
            requestPermissionForAlias("notifications", invoke, "alarmsPermission"); return
        }
        runAlarms(invoke)
    }
    @PermissionCallback private fun alarmsPermission(invoke: Invoke) { runAlarms(invoke) }
    private fun runAlarms(invoke: Invoke) = Thread {
        val args = invoke.getArgs()
        try { invoke.resolve(JSObject(AtomeAlarms.handle(activity, args.optString("command"), args.optJSONObject("payload") ?: org.json.JSONObject()).toString())) }
        catch (error: Exception) { invoke.resolve(JSObject().put("ok", false).put("error", error.message ?: "calendar_alarm_host_failed")) }
    }.start()

    // eVe's appointments in the phone's calendar (AtomeDeviceCalendar.kt): its permission asked at the first export.
    @Command fun deviceCalendar(invoke: Invoke) {
        // Nothing of eVe's can lie in a calendar it was never allowed to write: an empty set asks nothing.
        val empty = (invoke.getArgs().optJSONObject("payload")?.optJSONArray("events")?.length() ?: 0) == 0
        if (empty && getPermissionState("calendar") != PermissionState.GRANTED) { invoke.resolve(JSObject().put("ok", true).put("cleared", true)); return }
        when (getPermissionState("calendar")) {
            PermissionState.GRANTED -> runCalendar(invoke)
            PermissionState.DENIED -> invoke.resolve(JSObject().put("ok", false).put("error", "calendar_permission_denied_settings").put("permission", "denied"))
            else -> requestPermissionForAlias("calendar", invoke, "calendarPermission")
        }
    }
    @PermissionCallback private fun calendarPermission(invoke: Invoke) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) runCalendar(invoke)
        else invoke.resolve(JSObject().put("ok", false).put("error", "calendar_permission_denied").put("permission", "denied"))
    }
    private fun runCalendar(invoke: Invoke) = Thread {
        val args = invoke.getArgs()
        try { invoke.resolve(JSObject(AtomeDeviceCalendar.handle(activity, args.optString("command"), args.optJSONObject("payload") ?: org.json.JSONObject()).toString())) }
        catch (error: Exception) { invoke.resolve(JSObject().put("ok", false).put("error", error.message ?: "device_calendar_failed")) }
    }.start()
    // The address book for eVe's contact import, as Apple Contacts on iOS and macOS: asked at its first import.
    // A refusal the system will not ask about again answers `…_settings`, as on iOS: the import opens this app's Settings.
    @Command fun contacts(invoke: Invoke) {
        when (getPermissionState("contacts")) {
            PermissionState.GRANTED -> readContacts(invoke)
            PermissionState.DENIED -> invoke.resolve(JSObject().put("ok", false).put("error", "contacts_permission_denied_settings").put("permission", "denied"))
            else -> requestPermissionForAlias("contacts", invoke, "contactsPermission")
        }
    }
    // This app's page in the system Settings, where a refused permission is granted (a user gesture only).
    @Command fun openAppSettings(invoke: Invoke) {
        activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null)))
        invoke.resolve(JSObject().put("ok", true))
    }
    @PermissionCallback private fun contactsPermission(invoke: Invoke) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) readContacts(invoke)
        else invoke.resolve(JSObject().put("ok", false).put("error", "contacts_permission_denied").put("permission", "denied"))
    }
    private fun readContacts(invoke: Invoke) = Thread {
        try { invoke.resolve(JSObject(NativeContacts.snapshot(activity).toString())) }
        catch (error: Exception) { invoke.resolve(JSObject().put("ok", false).put("error", "android_contacts_read_failed").put("message", error.message ?: "")) }
    }.start()
    private fun execute(invoke: Invoke) {
        try {
            NativeCommunication.handle(activity, invoke.getArgs().getString("command"),
                invoke.getArgs().optJSONObject("payload") ?: org.json.JSONObject()) { result -> invoke.resolve(JSObject(result.toString())) }
        } catch (error: Exception) { invoke.resolve(JSObject().put("ok", false).put("error", error.message ?: "notifications_host_unavailable")) }
    }
}
