package one.atome.mobile

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

class AtomeMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val encoded = message.data["atome"] ?: return
        val kind = message.data["notification_kind"] ?: return
        if (encoded.length > 8192 || kind !in listOf("call", "alert", "call-state")) return
        try { NativeCommunication.receive(applicationContext, JSONObject(encoded), kind) }
        catch (_: Exception) { NativeCommunication.report("notifications_delivery_unavailable") }
    }
    override fun onRegistered(installationId: String) { NativeCommunication.registered(installationId) }
    override fun onUnregistered(installationId: String) { NativeCommunication.unregistered(installationId) }
    override fun onDeletedMessages() { NativeCommunication.signal() }
}
