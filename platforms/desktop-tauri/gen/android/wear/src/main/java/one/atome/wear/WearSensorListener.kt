package one.atome.wear

import android.content.Intent
import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import one.atome.health.SensorRecordingSpecs

// The session the phone records (tauri-plugin-health WearSensorBridge.kt), received as one data item:
// its start opens the recorder (WearSensorService.kt), its end closes it and sends the file back.
class WearSensorListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED || event.dataItem.uri.path != SensorRecordingSpecs.STATE_PATH) continue
            val map = DataMapItem.fromDataItem(event.dataItem).dataMap
            val session = map.getString("session").orEmpty()
            if (session.isEmpty() || session.length > 300) continue
            val intent = Intent(this, WearSensorService::class.java).putExtra("session", session)
                .putExtra("node", event.dataItem.uri.host)
            when (map.getString("state")) {
                "start" -> {
                    val directory = map.getString("directory").orEmpty()
                    val at = map.getLong("at")
                    // A start replayed long after its session is not a session any more.
                    if (!SensorRecordingSpecs.DIRECTORY.matches(directory) || System.currentTimeMillis() - at > STALE_START_MS) continue
                    start(intent.setAction(WearSensorService.START).putExtra("directory", directory))
                }
                "stop" -> start(intent.setAction(WearSensorService.STOP))
            }
        }
    }

    private fun start(intent: Intent) {
        try { startForegroundService(intent) }
        catch (error: IllegalStateException) { Log.e(TAG, "watch recorder not started", error) }
    }

    private companion object {
        const val TAG = "AtomeWearSensors"
        const val STALE_START_MS = 6L * 3600 * 1000
    }
}
