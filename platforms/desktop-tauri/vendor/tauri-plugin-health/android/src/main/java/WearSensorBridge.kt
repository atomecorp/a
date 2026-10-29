package one.atome.health

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

// The phone side of the Wear OS motion recording (gen/android/wear, WearSensorListener.kt). When an eVe
// session starts recording this phone (HealthSensorRecorder), the watch is told the session through one data
// item, synced as soon as the watch is reachable (as the Apple Watch's application context); when it ends,
// the watch closes its file and sends it here (WearRecordingReceiver.kt). No sample crosses this bridge.
internal class WearSensorBridge(context: Context) {
    private val data = Wearable.getDataClient(context)

    fun start(session: String, startedAt: Long, directory: String) =
        put("start", session) { it.putLong("at", startedAt); it.putString("directory", directory) }

    fun stop(session: String) = put("stop", session) {}

    private fun put(state: String, session: String, extra: (com.google.android.gms.wearable.DataMap) -> Unit) {
        val request = PutDataMapRequest.create(SensorRecordingSpecs.STATE_PATH)
        request.dataMap.putString("state", state)
        request.dataMap.putString("session", session)
        // A new value every time, so a repeated start or stop still reaches the watch.
        request.dataMap.putLong("sent", System.currentTimeMillis())
        extra(request.dataMap)
        data.putDataItem(request.asPutDataRequest().setUrgent())
            .addOnFailureListener { Log.e(TAG, "watch state not sent", it) }
    }

    private companion object { const val TAG = "AtomeWearSensors" }
}
