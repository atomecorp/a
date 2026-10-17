package one.atome.mobile

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.webkit.WebView
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.installations.FirebaseInstallations
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID

// Native OS lifecycle only. Durable account/inbox access is always delegated
// to Rust/Axum; real media/room participation belongs to the existing JS tools.
object NativeCommunication {
    private var page = WeakReference<WebView>(null)
    private var currentContext: Context? = null
    private val main = Handler(Looper.getMainLooper())
    private val calls = mutableMapOf<String, AtomeCallConnection>()
    private val deadlines = mutableMapOf<String, Runnable>()
    @Volatile private var registration: String? = null
    @Synchronized fun registered(id: String) {
        if (id == registration) return
        registration = id
        signal()
    }
    @Synchronized fun unregistered(id: String) { if (registration == id) registration = null }
    fun hasCall(id: String) = calls.containsKey(id)
    fun interactionToken(id: String) = calls[id]?.interactionNonce
    fun canAddCall() = calls.isEmpty()
    fun report(code: String) {
        currentContext?.let { AtomeNotificationHost.require(it, "report", JSONObject().put("code", code)) }
        page.get()?.post { page.get()?.evaluateJavascript("window.dispatchEvent(new CustomEvent('squirrel:push-error',{detail:{code:${JSONObject.quote(code)}}}));", null) }
    }
    fun attach(activity: Activity, view: WebView) {
        currentContext = activity.applicationContext; page = WeakReference(view)
        handleIntent(activity, activity.intent); signal()
    }
    fun signal() { page.get()?.post { page.get()?.evaluateJavascript("window.dispatchEvent(new Event('atome:notifications-available'));", null) } }
    fun alertsAuthorized(context: Context) = (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
        && context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    private fun messaging(context: Context): FirebaseMessaging {
        check(BuildConfig.FIREBASE_APP_ID.isNotEmpty() && BuildConfig.FIREBASE_API_KEY.isNotEmpty()
            && BuildConfig.FIREBASE_SENDER_ID.isNotEmpty() && BuildConfig.FIREBASE_PROJECT_ID.isNotEmpty()) { "fcm_configuration_required" }
        check(FirebaseApp.getApps(context).any { it.name == FirebaseApp.DEFAULT_APP_NAME }) { "fcm_configuration_required" }
        return FirebaseMessaging.getInstance().also { it.isAutoInitEnabled = true }
    }
    fun account(context: Context): PhoneAccountHandle {
        val handle = PhoneAccountHandle(android.content.ComponentName(context, AtomeConnectionService::class.java), "atome")
        context.getSystemService(TelecomManager::class.java).registerPhoneAccount(PhoneAccount.builder(handle, "Atome")
            .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED or PhoneAccount.CAPABILITY_VIDEO_CALLING)
            .setSupportedUriSchemes(listOf(PhoneAccount.SCHEME_SIP)).build())
        return handle
    }
    fun valid(context: Context, data: JSONObject, call: Boolean = false): Boolean {
        val owner = AtomeNotificationHost.context(context)?.optString("principal_id") ?: return false
        if (owner.isEmpty() || data.optString("principal_id") != owner || data.optString("notification_id").length !in 1..200) return false
        return !call || (data.optLong("expires_at") > System.currentTimeMillis()
            && data.optString("call_mode") in listOf("audio", "visio")
            && runCatching { UUID.fromString(data.getString("room_id")) }.isSuccess
            && !AtomeNotificationHost.require(context, "blocked", data).optBoolean("blocked"))
    }
    fun receive(context: Context, data: JSONObject, kind: String) {
        currentContext = context.applicationContext
        if (!valid(context, data, kind == "call")) return
        main.post {
          try {
            if (!valid(context, data, kind == "call")) return@post
            if (kind == "call") {
                val room = data.getString("room_id")
                if (calls.containsKey(room)) return@post
                val extras = Bundle().apply {
                    putString("atome", data.toString())
                    putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, Uri.fromParts(PhoneAccount.SCHEME_SIP, room, null))
                }
                val manager = context.getSystemService(TelecomManager::class.java)
                val handle = account(context)
                if (manager.isIncomingCallPermitted(handle)) manager.addNewIncomingCall(handle, extras)
                else report("notifications_telecom_rejected")
            } else if (kind == "call-state") {
                val id = data.optString("room_id")
                if (data.optLong("expires_at") <= System.currentTimeMillis()) return@post
                if (data.optString("status") in listOf("recording", "cancelled")) {
                    enqueue(context, data, "terminal"); end(id)
                }
                else if (data.optString("status") == "live") {
                    val ownKey = AtomeNotificationHost.context(context)?.optString("key_id")
                    if (data.optString("accepted_principal_id") == data.optString("principal_id")
                        && data.optString("accepted_key_id") != ownKey) { enqueue(context, data, "terminal"); end(id) }
                }
            } else if (kind == "alert" && alertsAuthorized(context)) {
                context.getSystemService(NotificationManager::class.java).notify(data.getString("notification_id"), 1,
                    NativeCallNotifications.message(context, data))
            }
          } catch (_: Exception) { report("notifications_delivery_unavailable") }
        }
    }
    fun add(context: Context, call: AtomeCallConnection) {
        val id = call.data.getString("room_id")
        calls[id] = call; currentContext = context.applicationContext
        schedule(id, call.data.optLong("expires_at") - System.currentTimeMillis()) { end(id, android.telecom.DisconnectCause.MISSED) }
    }
    private fun schedule(id: String, delay: Long, action: () -> Unit) {
        deadlines.remove(id)?.let(main::removeCallbacks)
        val runnable = Runnable { try { action() } catch (_: Exception) { report("notifications_action_unavailable") } }; deadlines[id] = runnable
        main.postDelayed(runnable, maxOf(0, delay))
    }
    fun enqueue(context: Context, data: JSONObject, action: String) {
        if (!valid(context, data)) return
        AtomeNotificationHost.require(context, "append", JSONObject(data.toString()).put("action", action)); signal()
    }
    fun answer(context: Context, call: AtomeCallConnection) {
        if (call.state != android.telecom.Connection.STATE_RINGING) return
        if (!valid(context, call.data, true)) { end(call.data.getString("room_id"), android.telecom.DisconnectCause.ERROR); return }
        val id = call.data.getString("room_id")
        enqueue(context, call.data, "answer"); call.setInitializing()
        NativeCallNotifications.update(context, call.data, true)
        schedule(id, 30000) { try { enqueue(context, call.data, "end") } finally { end(id, android.telecom.DisconnectCause.ERROR) } }
        launch(context, call.data, "resume")
    }
    fun end(id: String, reason: Int = android.telecom.DisconnectCause.REMOTE) {
        deadlines.remove(id)?.let(main::removeCallbacks)
        val call = calls.remove(id) ?: return
        call.setDisconnected(android.telecom.DisconnectCause(reason)); call.destroy()
        currentContext?.getSystemService(NotificationManager::class.java)?.cancel(NativeCallNotifications.CALL_ID)
        if (calls.isEmpty()) currentContext?.stopService(Intent(currentContext, AtomeCallForegroundService::class.java))
    }
    fun dismiss(context: Context, call: AtomeCallConnection) {
        enqueue(context, call.data, "terminal"); enqueue(context, call.data, "end")
        end(call.data.getString("room_id"), android.telecom.DisconnectCause.LOCAL)
        // A cold app must run its existing authenticated command path to decline.
        if (page.get() == null) launch(context, call.data, "resume")
    }
    fun launch(context: Context, data: JSONObject, action: String) {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: error("notifications_activity_unavailable")
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("atome.notification", data.toString()).putExtra("atome.action", action))
    }
    fun handleIntent(context: Context, intent: Intent) {
        val encoded = intent.getStringExtra("atome.notification") ?: return
        val action = intent.getStringExtra("atome.action") ?: return
        val interaction = intent.getStringExtra("atome.interaction")
        intent.removeExtra("atome.notification"); intent.removeExtra("atome.action")
        intent.removeExtra("atome.interaction")
        val data = try { JSONObject(encoded) } catch (_: Exception) { report("notifications_payload_invalid"); return }
        if (!valid(context, data)) return
        main.post {
          try {
            if (action in listOf("answer", "end") && (interaction == null
                || calls[data.optString("room_id")]?.interactionNonce != interaction)) return@post
            when (action) {
                "answer" -> calls[data.optString("room_id")]?.let { answer(context, it) }
                "end" -> calls[data.optString("room_id")]?.let { dismiss(context, it) }
                "open" -> enqueue(context, data, "open")
                "resume" -> signal()
            }
          } catch (_: Exception) { report("notifications_action_unavailable") }
        }
    }
    fun handle(context: Context, command: String, payload: JSONObject, complete: (JSONObject) -> Unit) {
        when (command) {
            "notifications_tokens" -> {
                check(AtomeNotificationHost.context(context) != null) { "notifications_account_unavailable" }
                val installation = AtomeNotificationHost.require(context, "installation").getString("id")
                account(context)
                // Register with FCM before reading its SDK-owned FID. Reading
                // an unregistered Installations ID alone cannot receive pushes.
                messaging(context).register().continueWithTask { task ->
                    if (!task.isSuccessful) throw IllegalStateException("fcm_registration_unavailable")
                    FirebaseInstallations.getInstance().id
                }.addOnCompleteListener { task ->
                    if (!task.isSuccessful) complete(JSONObject().put("ok", false).put("error", "fcm_registration_unavailable"))
                    else complete(JSONObject().put("ok", true).put("provider", "fcm").put("environment", "production")
                        .put("installationId", installation).put("tokens", JSONObject().put("voip", task.result)
                            .apply { if (alertsAuthorized(context)) put("alert", task.result) }))
                }
            }
            "notifications_enable" -> { account(context); complete(JSONObject().put("ok", true).put("authorized", alertsAuthorized(context))) }
            "notifications_take" -> complete(AtomeNotificationHost.require(context, "take"))
            "notifications_ack" -> complete(AtomeNotificationHost.require(context, "ack", payload))
            "notifications_call_end" -> { val id = payload.getString("room_id"); main.post { end(id) }; complete(JSONObject().put("ok", true)) }
            "notifications_call_result" -> {
                val id = payload.getString("room_id")
                main.post {
                  try {
                    if (payload.optBoolean("ok")) {
                        deadlines.remove(id)?.let(main::removeCallbacks)
                        calls[id]?.let { call -> call.setActive(); NativeCallNotifications.update(context, call.data, true, true) }
                    } else end(id, android.telecom.DisconnectCause.ERROR)
                  } catch (_: Exception) {
                    report("notifications_presentation_unavailable")
                    try { calls[id]?.let { enqueue(context, it.data, "end") } }
                    finally { end(id, android.telecom.DisconnectCause.ERROR) }
                  }
                }
                complete(JSONObject().put("ok", true))
            }
            "notifications_logout" -> {
                AtomeNotificationHost.require(context, "clear")
                if (FirebaseApp.getApps(context).any { it.name == FirebaseApp.DEFAULT_APP_NAME }) {
                    val firebase = FirebaseMessaging.getInstance()
                    firebase.isAutoInitEnabled = false
                    firebase.unregister().addOnFailureListener { report("notifications_registration_cleanup_failed") }
                }
                main.post { calls.keys.toList().forEach { end(it, android.telecom.DisconnectCause.LOCAL) } }
                complete(JSONObject().put("ok", true))
            }
            else -> error("notifications_command_invalid")
        }
    }
}
