package one.atome.health

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.security.MessageDigest

// The raw motion of this phone during an eVe activity session (training, nap, meditation), recorded in
// the sensor recording format (atome/documentations/sensor_recording_format.md). Every motion sensor
// present is kept losslessly on this device (its only copy elsewhere is encrypted by the page, sensor_backup.js): noBackupFilesDir is app-private and excluded from
// Auto Backup. One recording at a time; the page decides when (session start and end) through the
// gated `health_invoke`, which verified the account. Commands, sensor events and the writer share one thread.
// A paired Wear OS watch records the wrist in the same session (WearSensorBridge.kt): its file joins this
// directory when the session ends (WearRecordingReceiver.kt).
internal class HealthSensorRecorder(private val context: Context) {
    private val watch = WearSensorBridge(context)

    private val thread = HandlerThread("atome-health-sensors").apply { start() }
    private val handler = Handler(thread.looper)
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private var writer: SensorRecordingWriter? = null
    private var session: String? = null
    private var origin = 0L
    private val listeners = mutableListOf<SensorEventListener>()

    fun handle(command: String, args: JSONObject, reply: (JSONObject) -> Unit) {
        handler.post { reply(try { run(command, args) } catch (_: Exception) { failure("health_sensors_failed") }) }
    }

    // Page load or context reset: the recording so far is kept, closed.
    fun finishCurrent() {
        handler.post { if (session != null) finish() }
    }

    private fun run(command: String, args: JSONObject): JSONObject {
        val directory = directory(args.optString("account")) ?: return failure("health_sensors_storage_unavailable")
        return when (command) {
            "sensorsStart" -> {
                val id = args.optString("session")
                if (id.isEmpty() || id.length > 300) return failure("health_sensors_invalid")
                if (!enabled(directory)) return JSONObject().put("recording", false).put("reason", "health_sensors_disabled")
                start(id, args.optLong("at", 0L), directory)
            }
            "sensorsStop" -> if (args.optString("session") == session) finish() else JSONObject().put("stopped", false)
            "sensorsStatus" -> {
                val files = files(directory)
                JSONObject().put("enabled", enabled(directory)).put("recording", session ?: JSONObject.NULL)
                    .put("recordings", files.size).put("bytes", files.sumOf { it.length() })
                    .put("sensors", JSONArray(available().map { it.second.id }))
            }
            "sensorsList" -> JSONObject().put("recordings", JSONArray(files(directory).take(LIST_LIMIT).map(::describe)))
            "sensorsDelete" -> delete(args, directory)
            "sensorsEnable" -> {
                if (!args.has("enabled")) return failure("health_sensors_invalid")
                val enabled = args.optBoolean("enabled")
                val marker = File(directory, "disabled")
                if (enabled) marker.delete() else marker.writeText("")
                if (!enabled && session != null) finish()
                JSONObject().put("enabled", enabled)
            }
            "sensorsRead" -> read(args, directory)
            "sensorsRestore" -> restore(args, directory)
            else -> failure("health_command_unknown")
        }
    }

    private fun start(id: String, sessionStartedAt: Long, directory: File): JSONObject {
        if (session == id) return JSONObject().put("recording", true).put("already", true)
        if (session != null) finish()
        val sensors = available()
        val manager = manager
        if (sensors.isEmpty() || manager == null) return JSONObject().put("recording", false).put("reason", "health_sensors_unavailable")
        val startedAt = System.currentTimeMillis()
        origin = SystemClock.elapsedRealtimeNanos()
        val file = File(directory, "$startedAt-phone.asr")
        watch.start(id, startedAt, directory.name)
        val header = JSONObject().put("format", "atome.sensor_recording").put("version", 1).put("session_id", id)
            .put("started_at", startedAt).put("clock", "ns_since_started_at").put("source", source())
        if (sessionStartedAt > 0) header.put("session_started_at", sessionStartedAt)
        val created = SensorRecordingWriter(file, header, sensors.map { (_, spec) ->
            SensorRecordingWriter.Stream(spec.id, spec.id, spec.axes, spec.unit, spec.rateHz) })
        writer = created
        session = id
        sensors.forEachIndexed { index, (sensor, spec) ->
            val listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) = write(index, event, spec.axes.size)
                override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
            }
            manager.registerListener(listener, sensor, spec.periodUs, handler)
            listeners.add(listener)
        }
        return JSONObject().put("recording", true).put("file", file.name).put("streams", JSONArray(sensors.map { it.second.id }))
    }

    private fun finish(): JSONObject {
        listeners.forEach { manager?.unregisterListener(it) }
        listeners.clear()
        session?.let(watch::stop)
        val current = writer
        writer = null
        session = null
        current ?: return JSONObject().put("stopped", false)
        return try {
            val bytes = current.finish()
            val samples = JSONObject()
            current.streams.forEachIndexed { index, stream -> samples.put(stream.id, current.counts[index]) }
            JSONObject().put("stopped", true).put("file", current.file.name).put("bytes", bytes).put("samples", samples)
        } catch (_: Exception) {
            failure("health_sensors_write_failed")
        }
    }

    // Values beyond what a sensor gives (an older rotation vector without its accuracy) are NaN.
    private fun write(stream: Int, event: SensorEvent, axes: Int) {
        val current = writer ?: return
        val sample = DoubleArray(axes) { if (it < event.values.size) event.values[it].toDouble() else Double.NaN }
        try { current.append(stream, event.timestamp - origin, sample) }
        catch (_: Exception) { finish() }
    }

    private fun delete(args: JSONObject, directory: File): JSONObject {
        val recording = writer?.file?.name
        val targets = when {
            args.optBoolean("all") -> files(directory)
            FILE_PATTERN.matches(args.optString("file")) -> listOf(File(directory, args.optString("file"))).filter { it.exists() }
                .ifEmpty { return failure("health_sensors_not_found") }
            else -> return failure("health_sensors_invalid")
        }
        return JSONObject().put("deleted", targets.count { it.name != recording && it.delete() })
    }

    // A piece of a closed recording, for its encrypted copy in the account vault.
    private fun read(args: JSONObject, directory: File): JSONObject {
        val name = args.optString("file")
        val offset = args.optLong("offset", -1L)
        val length = args.optInt("length", 0)
        if (!FILE_PATTERN.matches(name) || offset < 0 || length <= 0 || length > PIECE_LIMIT) return failure("health_sensors_invalid")
        if (name == writer?.file?.name) return failure("health_sensors_busy")
        val file = File(directory, name)
        if (!file.isFile) return failure("health_sensors_not_found")
        val bytes = RandomAccessFile(file, "r").use { input ->
            input.seek(offset)
            val buffer = ByteArray(minOf(length.toLong(), maxOf(0L, input.length() - offset)).toInt())
            input.readFully(buffer)
            buffer
        }
        return JSONObject().put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("size", file.length())
    }

    // A recording brought back from the account vault, piece after piece; it appears only once whole.
    private fun restore(args: JSONObject, directory: File): JSONObject {
        val name = args.optString("file")
        val offset = args.optLong("offset", -1L)
        val data = try { Base64.decode(args.optString("data"), Base64.NO_WRAP) } catch (_: IllegalArgumentException) { null }
        if (!FILE_PATTERN.matches(name) || offset < 0 || data == null || data.size > PIECE_LIMIT) return failure("health_sensors_invalid")
        val file = File(directory, name)
        val part = File(directory, "$name.part")
        if (file.exists()) return failure("health_sensors_exists")
        if (offset == 0L) part.writeBytes(ByteArray(0))
        if (!part.isFile || part.length() != offset) return failure("health_sensors_invalid")
        FileOutputStream(part, true).use { it.write(data) }
        if (args.optBoolean("final") && !part.renameTo(file)) return failure("health_sensors_storage_unavailable")
        return JSONObject().put("size", offset + data.size)
    }

    private fun available(): List<Pair<Sensor, SensorSpec>> {
        val manager = manager ?: return emptyList()
        return SensorRecordingSpecs.MOTION.mapNotNull { spec -> manager.getDefaultSensor(spec.type)?.let { it to spec } }
    }

    // One directory per account, named by a digest.
    private fun directory(account: String): File? {
        if (account.isEmpty()) return null
        val digest = MessageDigest.getInstance("SHA-256").digest(account.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }.take(32)
        return directory(context, digest)
    }

    private fun enabled(directory: File) = !File(directory, "disabled").exists()

    // Newest first.
    private fun files(directory: File): List<File> =
        (directory.listFiles() ?: emptyArray()).filter { FILE_PATTERN.matches(it.name) }
            .sortedByDescending { it.name.substringBefore('-').toLongOrNull() ?: 0L }

    private fun describe(file: File): JSONObject {
        val header = SensorRecordingWriter.readHeader(file) ?: JSONObject()
        val source = header.optJSONObject("source") ?: JSONObject()
        return JSONObject().put("file", file.name).put("session_id", header.opt("session_id") ?: JSONObject.NULL)
            .put("started_at", header.opt("started_at") ?: JSONObject.NULL).put("role", source.opt("role") ?: JSONObject.NULL)
            .put("platform", source.opt("platform") ?: JSONObject.NULL).put("bytes", file.length())
    }

    private fun source(): JSONObject {
        val version = try { context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "" } catch (_: Exception) { "" }
        return JSONObject().put("platform", "android").put("role", "phone").put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("os", Build.VERSION.RELEASE).put("app_version", version)
    }

    private fun failure(code: String) = JSONObject().put("ok", false).put("error", code)

    companion object {
        private const val LIST_LIMIT = 500
        // One piece read or restored at a time: the page encrypts or decrypts it (sensor_backup.js).
        private const val PIECE_LIMIT = 262_144
        private val FILE_PATTERN = Regex("^[0-9]{1,16}-(phone|watch)\\.asr$")

        // An account's directory by its digest (the name a watch recording carries back).
        fun directory(context: Context, digest: String): File? {
            if (!SensorRecordingSpecs.DIRECTORY.matches(digest)) return null
            val directory = File(File(context.noBackupFilesDir, SensorRecordingSpecs.ROOT), digest)
            return if (directory.isDirectory || directory.mkdirs()) directory else null
        }
    }
}
