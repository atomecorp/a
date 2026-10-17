package one.atome.mobile

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import org.json.JSONObject

class AtomeCallForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val data = try { JSONObject(intent?.getStringExtra("atome") ?: "{}") } catch (_: Exception) {
            stopSelf(); return START_NOT_STICKY
        }
        if (!NativeCommunication.valid(this, data) || !NativeCommunication.hasCall(data.optString("room_id"))) {
            stopSelf(); return START_NOT_STICKY
        }
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        // Media permissions come from the existing WebView capture path, after
        // user answer. Incoming ringing never activates camera or microphone.
        if (android.os.Build.VERSION.SDK_INT >= 30 && intent?.getBooleanExtra("media", false) == true) {
            types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (data.optString("call_mode") == "visio") types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        }
        try {
            startForeground(NativeCallNotifications.CALL_ID, NativeCallNotifications.call(this, data, intent?.getBooleanExtra("ongoing", false) == true), types)
        } catch (_: Exception) {
            NativeCommunication.report("notifications_presentation_unavailable")
            NativeCommunication.enqueue(this, data, "end")
            NativeCommunication.end(data.getString("room_id"), android.telecom.DisconnectCause.ERROR); stopSelf()
        }
        return START_NOT_STICKY
    }
}
