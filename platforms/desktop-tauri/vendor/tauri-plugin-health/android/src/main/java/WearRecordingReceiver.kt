package one.atome.health

import android.net.Uri
import android.util.Log
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.io.File

// The watch's recording of a session (gen/android/wear, WearSensorService.kt) arrives on a channel named
// /atome/sensors/file/<account digest>/<file>: it is received beside the account's recordings and appears,
// under its own name, only once whole; it then has its encrypted copy like every recording (sensor_backup.js).
class WearRecordingReceiver : WearableListenerService() {
    override fun onChannelOpened(channel: ChannelClient.Channel) {
        val target = targetOf(channel) ?: return
        val part = File(target.parentFile, "${target.name}.part")
        Wearable.getChannelClient(this).receiveFile(channel, Uri.fromFile(part), false)
            .addOnFailureListener { Log.e(TAG, "watch recording not received", it) }
    }

    override fun onInputClosed(channel: ChannelClient.Channel, closeReason: Int, appSpecificErrorCode: Int) {
        val target = targetOf(channel) ?: return
        val part = File(target.parentFile, "${target.name}.part")
        if (closeReason != ChannelClient.ChannelCallback.CLOSE_REASON_NORMAL) {
            part.delete()
            Log.e(TAG, "watch recording interrupted: $closeReason")
            return
        }
        if (target.exists() || !part.renameTo(target)) Log.e(TAG, "watch recording not kept: ${target.name}")
    }

    private fun targetOf(channel: ChannelClient.Channel): File? {
        val path = channel.path
        if (!path.startsWith(SensorRecordingSpecs.FILE_PATH)) return null
        val (digest, name) = path.removePrefix(SensorRecordingSpecs.FILE_PATH).split('/').takeIf { it.size == 2 } ?: return null
        if (!SensorRecordingSpecs.WATCH_FILE.matches(name)) return null
        return HealthSensorRecorder.directory(this, digest)?.let { File(it, name) }
    }

    private companion object { const val TAG = "AtomeWearSensors" }
}
