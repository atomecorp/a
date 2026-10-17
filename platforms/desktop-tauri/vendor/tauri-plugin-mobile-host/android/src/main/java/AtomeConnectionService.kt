package one.atome.mobile

import android.content.Context
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import org.json.JSONObject

class AtomeConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(account: PhoneAccountHandle?, request: ConnectionRequest): Connection {
        val extras = request.extras
        val encoded = extras?.getString("atome")
            ?: extras?.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS)?.getString("atome")
        val data = try { JSONObject(encoded ?: "{}") } catch (_: Exception) {
            return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
        }
        if (!NativeCommunication.valid(this, data, true) || !NativeCommunication.canAddCall())
            return Connection.createFailedConnection(DisconnectCause(DisconnectCause.CANCELED))
        return AtomeCallConnection(applicationContext, data).also { NativeCommunication.add(this, it) }
    }
    override fun onCreateIncomingConnectionFailed(account: PhoneAccountHandle?, request: ConnectionRequest) {
        NativeCommunication.report("notifications_telecom_rejected")
    }
}

// Ephemeral Telecom projection. No account, room state or media engine is owned here.
class AtomeCallConnection(private val context: Context, val data: JSONObject) : Connection() {
    // Bind immutable OS PendingIntents to this ephemeral system call. An
    // arbitrary external launch Intent cannot impersonate Answer/Decline.
    val interactionNonce = java.util.UUID.randomUUID().toString()
    init {
        connectionProperties = PROPERTY_SELF_MANAGED
        setAudioModeIsVoip(true)
        setCallerDisplayName(context.getString(R.string.atome_incoming_call), TelecomManager.PRESENTATION_ALLOWED)
        setAddress(android.net.Uri.fromParts("sip", data.getString("room_id"), null), TelecomManager.PRESENTATION_RESTRICTED)
        videoState = if (data.optString("call_mode") == "visio") android.telecom.VideoProfile.STATE_BIDIRECTIONAL
            else android.telecom.VideoProfile.STATE_AUDIO_ONLY
        setRinging()
    }
    override fun onShowIncomingCallUi() {
        try { NativeCallNotifications.update(context, data, false) }
        catch (_: Exception) { NativeCommunication.report("notifications_presentation_unavailable"); NativeCommunication.end(data.getString("room_id"), DisconnectCause.ERROR) }
    }
    private fun action(operation: () -> Unit) {
        try { operation() } catch (_: Exception) {
            NativeCommunication.report("notifications_action_unavailable"); NativeCommunication.end(data.getString("room_id"), DisconnectCause.ERROR)
        }
    }
    override fun onAnswer() = action { NativeCommunication.answer(context, this) }
    override fun onAnswer(videoState: Int) { onAnswer() }
    override fun onReject() = action { NativeCommunication.dismiss(context, this) }
    override fun onDisconnect() = action { NativeCommunication.dismiss(context, this) }
    override fun onAbort() = action { NativeCommunication.dismiss(context, this) }
}
