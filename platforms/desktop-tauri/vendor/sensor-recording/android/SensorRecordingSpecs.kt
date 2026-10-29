package one.atome.health

import android.hardware.Sensor
import android.hardware.SensorManager

// The Android motion sensors a recording keeps (atome/documentations/sensor_recording_format.md, « Streams by
// platform »), shared by the phone recorder (HealthSensorRecorder.kt) and the Wear OS recorder (WearSensorService.kt).
internal class SensorSpec(val type: Int, val id: String, val axes: List<String>, val unit: String, val rateHz: Double) {
    // The requested sampling period of SensorManager.registerListener, in µs.
    val periodUs: Int get() = if (rateHz > 0) (1_000_000 / rateHz).toInt() else SensorManager.SENSOR_DELAY_NORMAL
}

internal object SensorRecordingSpecs {
    private val XYZ = listOf("x", "y", "z")
    private val UNCALIBRATED = listOf("x", "y", "z", "bias_x", "bias_y", "bias_z")
    // 200 Hz is the highest rate Android grants without HIGH_SAMPLING_RATE_SENSORS.
    val MOTION = listOf(
        SensorSpec(Sensor.TYPE_ACCELEROMETER, "accelerometer", XYZ, "m/s2", 200.0),
        SensorSpec(Sensor.TYPE_ACCELEROMETER_UNCALIBRATED, "accelerometer_uncalibrated", UNCALIBRATED, "m/s2", 200.0),
        SensorSpec(Sensor.TYPE_GYROSCOPE, "gyroscope", XYZ, "rad/s", 200.0),
        SensorSpec(Sensor.TYPE_GYROSCOPE_UNCALIBRATED, "gyroscope_uncalibrated", UNCALIBRATED, "rad/s", 200.0),
        SensorSpec(Sensor.TYPE_MAGNETIC_FIELD, "magnetometer", XYZ, "uT", 100.0),
        SensorSpec(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED, "magnetometer_uncalibrated", UNCALIBRATED, "uT", 100.0),
        SensorSpec(Sensor.TYPE_LINEAR_ACCELERATION, "linear_acceleration", XYZ, "m/s2", 200.0),
        SensorSpec(Sensor.TYPE_GRAVITY, "gravity", XYZ, "m/s2", 200.0),
        SensorSpec(Sensor.TYPE_ROTATION_VECTOR, "rotation_vector", listOf("x", "y", "z", "w", "heading_accuracy"), "unitless|rad", 200.0),
        SensorSpec(Sensor.TYPE_GAME_ROTATION_VECTOR, "game_rotation_vector", listOf("x", "y", "z", "w"), "unitless", 200.0),
        SensorSpec(Sensor.TYPE_PRESSURE, "pressure", listOf("pressure"), "hPa", 0.0)
    )
    // The wrist's heart rate, as the watch's sensor gives it (BODY_SENSORS granted only).
    val HEART_RATE = SensorSpec(Sensor.TYPE_HEART_RATE, "heart_rate", listOf("bpm"), "count/min", 0.0)

    // The data-layer paths between the phone and the watch (WearSensorBridge.kt, WearSensorListener.kt).
    const val STATE_PATH = "/atome/sensors/state"
    const val FILE_PATH = "/atome/sensors/file/"
    val WATCH_FILE = Regex("^[0-9]{1,16}-watch\\.asr$")
    val DIRECTORY = Regex("^[0-9a-f]{32}$")
    const val ROOT = "atome_sensor_recordings"
}
