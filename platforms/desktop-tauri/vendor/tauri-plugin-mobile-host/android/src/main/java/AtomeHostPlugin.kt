package one.atome.mobile

import android.Manifest
import android.app.Activity
import android.os.Build
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class AtomeHostPlugin(private val activity: Activity) : Plugin(activity) {
    override fun load(webView: WebView) { NativeCommunication.attach(activity, webView) }
    override fun onResume() { NativeCommunication.signal() }
    override fun onNewIntent(intent: android.content.Intent) { NativeCommunication.handleIntent(activity, intent) }

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
    @PermissionCallback private fun notificationsPermission(invoke: Invoke) { execute(invoke) }
    private fun execute(invoke: Invoke) {
        try {
            NativeCommunication.handle(activity, invoke.getArgs().getString("command"),
                invoke.getArgs().optJSONObject("payload") ?: org.json.JSONObject()) { result -> invoke.resolve(JSObject(result.toString())) }
        } catch (error: Exception) { invoke.resolve(JSObject().put("ok", false).put("error", error.message ?: "notifications_host_unavailable")) }
    }
}
