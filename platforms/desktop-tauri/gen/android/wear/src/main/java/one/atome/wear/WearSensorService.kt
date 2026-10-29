package one.atome.wear

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import one.atome.health.SensorRecordingSpecs
import one.atome.health.SensorRecordingWriter
import one.atome.health.SensorSpec
import org.json.JSONObject
import java.io.File

// The wrist's raw motion during an eVe session, in the sensor recording format
// (atome/documentations/sensor_recording_format.md), the Wear OS counterpart of the Apple Watch's
// WatchSensorSession.swift. A foreground service of type health keeps the watch recording for the whole
// session; every motion sensor present is kept losslessly, with the heart rate once BODY_SENSORS is granted.
// At the end the file is sent to the phone that named the session (WearRecordingReceiver.kt) and removed
// here once received; a file not sent yet goes with the next one. Commands, sensor events and the writer
// share one thread.
class WearSensorService : Service() {
    private val thread = HandlerThread("atome-wear-sensors").apply { start() }
    private val handler = Handler(thread.looper)
    private val manager by lazy { getSystemService(SENSOR_SERVICE) as SensorManager }
    private val listeners = mutableListOf<SensorEventListener>()
    private var writer: SensorRecordingWriter? = null
    private var session: String? = null
    private var directory = ""
    private var node = ""
    private var origin = 0L
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        foreground()
        val id = intent?.getStringExtra("session").orEmpty()
        val from = intent?.getStringExtra("node").orEmpty()
        when (intent?.action) {
            START -> {
                val digest = intent.getStringExtra("directory").orEmpty()
                handler.post { begin(id, digest, from) }
            }
            STOP -> handler.post { if (id == session) finish() else if (session == null) stopSelf() }
            else -> handler.post { if (session == null) stopSelf() }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.post { if (session != null) finish() }
        thread.quitSafely()
        super.onDestroy()
    }

    // A foreground service must show its notification at once; it says nothing (no text).
    private fun foreground() {
        val notifications = getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannel(NotificationChannel(CHANNEL, "eVe", NotificationManager.IMPORTANCE_LOW))
        val notification = Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
        else startForeground(NOTIFICATION, notification)
    }

    private fun begin(id: String, digest: String, from: String) {
        if (session == id) return
        if (session != null) finish()
        val sensors = available()
        val folder = folder(digest)
        if (sensors.isEmpty() || folder == null || from.isEmpty()) {
            Log.e(TAG, "watch recording unavailable")
            return stopSelf()
        }
        val startedAt = System.currentTimeMillis()
        origin = SystemClock.elapsedRealtimeNanos()
        val header = JSONObject().put("format", "atome.sensor_recording").put("version", 1).put("session_id", id)
            .put("started_at", startedAt).put("clock", "ns_since_started_at").put("source", source())
        writer = SensorRecordingWriter(File(folder, "$startedAt-watch.asr"), header, sensors.map { (_, spec) ->
            SensorRecordingWriter.Stream(spec.id, spec.id, spec.axes, spec.unit, spec.rateHz) })
        session = id
        directory = digest
        node = from
        wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "atome:wear-sensors")
            .apply { acquire(MAX_SESSION_MS) }
        sensors.forEachIndexed { index, (sensor, spec) ->
            val listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) = write(index, event, spec.axes.size)
                override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
            }
            manager.registerListener(listener, sensor, spec.periodUs, handler)
            listeners.add(listener)
        }
    }

    private fun finish() {
        listeners.forEach(manager::unregisterListener)
        listeners.clear()
        wake?.takeIf { it.isHeld }?.release()
        wake = null
        val current = writer
        writer = null
        session = null
        if (current != null) {
            try { current.finish() } catch (error: Exception) { Log.e(TAG, "watch recording not closed", error) }
        }
        folder(directory)?.let(::sendAll)
        stopSelf()
    }

    // Values beyond what a sensor gives are NaN.
    private fun write(stream: Int, event: SensorEvent, axes: Int) {
        val current = writer ?: return
        val sample = DoubleArray(axes) { if (it < event.values.size) event.values[it].toDouble() else Double.NaN }
        try { current.append(stream, event.timestamp - origin, sample) }
        catch (error: Exception) {
            Log.e(TAG, "watch recording write failed", error)
            finish()
        }
    }

    // Every closed recording of this account still here goes to the phone; each is removed once received.
    private fun sendAll(folder: File) {
        val channels = Wearable.getChannelClient(this)
        for (file in folder.listFiles().orEmpty().filter { SensorRecordingSpecs.WATCH_FILE.matches(it.name) }) {
            channels.openChannel(node, "${SensorRecordingSpecs.FILE_PATH}${folder.name}/${file.name}").addOnSuccessListener { channel ->
                channels.registerChannelCallback(channel, object : ChannelClient.ChannelCallback() {
                    override fun onOutputClosed(closed: ChannelClient.Channel, closeReason: Int, appSpecificErrorCode: Int) {
                        if (closed.path != channel.path) return
                        if (closeReason == ChannelClient.ChannelCallback.CLOSE_REASON_NORMAL) file.delete() else Log.e(TAG, "watch recording not sent: $closeReason")
                        channels.unregisterChannelCallback(this)
                    }
                })
                channels.sendFile(channel, Uri.fromFile(file)).addOnFailureListener { Log.e(TAG, "watch recording not sent", it) }
            }.addOnFailureListener { Log.e(TAG, "phone not reachable", it) }
        }
    }

    private fun available(): List<Pair<Sensor, SensorSpec>> {
        val heart = checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
        val specs = SensorRecordingSpecs.MOTION + if (heart) listOf(SensorRecordingSpecs.HEART_RATE) else emptyList()
        return specs.mapNotNull { spec -> manager.getDefaultSensor(spec.type)?.let { it to spec } }
    }

    // noBackupFilesDir: app-private, outside Auto Backup; one folder per account digest, until sent.
    private fun folder(digest: String): File? {
        if (!SensorRecordingSpecs.DIRECTORY.matches(digest)) return null
        val folder = File(File(noBackupFilesDir, SensorRecordingSpecs.ROOT), digest)
        return if (folder.isDirectory || folder.mkdirs()) folder else null
    }

    private fun source(): JSONObject {
        val version = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "" } catch (_: Exception) { "" }
        return JSONObject().put("platform", "wearos").put("role", "watch").put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("os", Build.VERSION.RELEASE).put("app_version", version)
    }

    companion object {
        const val START = "one.atome.wear.START"
        const val STOP = "one.atome.wear.STOP"
        private const val TAG = "AtomeWearSensors"
        private const val CHANNEL = "atome_sensors"
        private const val NOTIFICATION = 1
        // A session never holds the watch awake longer than this.
        private const val MAX_SESSION_MS = 6L * 3600 * 1000
    }
}
