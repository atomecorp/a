package one.atome.health

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import kotlin.reflect.KClass

// Read-only Health Connect bridge. Called ONLY by the app's gated
// `health_invoke` (Rust) after channel + verified-account checks; no
// JavaScript command reaches this class directly. Values are returned in the
// invoke reply; the page is only told "invalidated" (no value) for the live
// step sensor.
@TauriPlugin(
    permissions = [Permission(strings = [Manifest.permission.ACTIVITY_RECOGNITION], alias = "activity")]
)
class HealthPlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var webView: WebView? = null
    private var pendingActivityIds: List<String> = emptyList()

    // Direct step counter (counts since reboot): session delta, re-based on reset.
    private var stepListener: SensorEventListener? = null
    private var stepLast: Float? = null
    private var stepSession = 0.0
    private var stepSince = 0L
    private var lastStepSignal = 0L

    private class Spec(
        val record: KClass<out Record>,
        val permission: String,
        val kind: String,
        val metric: AggregateMetric<*>? = null,
        val feature: Int? = null
    )

    companion object {
        private const val HC = "android.permission.health."
        private const val STEP_SENSOR_ID = "device_steps_session"
        private val SPECS: Map<String, Spec> = mapOf(
            "steps" to Spec(StepsRecord::class, "${HC}READ_STEPS", "sum", StepsRecord.COUNT_TOTAL),
            "distance" to Spec(DistanceRecord::class, "${HC}READ_DISTANCE", "sum", DistanceRecord.DISTANCE_TOTAL),
            "wheelchair_pushes" to Spec(WheelchairPushesRecord::class, "${HC}READ_WHEELCHAIR_PUSHES", "sum", WheelchairPushesRecord.COUNT_TOTAL),
            "floors_climbed" to Spec(FloorsClimbedRecord::class, "${HC}READ_FLOORS_CLIMBED", "sum", FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL),
            "active_energy" to Spec(ActiveCaloriesBurnedRecord::class, "${HC}READ_ACTIVE_CALORIES_BURNED", "sum", ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
            "total_energy" to Spec(TotalCaloriesBurnedRecord::class, "${HC}READ_TOTAL_CALORIES_BURNED", "sum", TotalCaloriesBurnedRecord.ENERGY_TOTAL),
            "hydration" to Spec(HydrationRecord::class, "${HC}READ_HYDRATION", "sum", HydrationRecord.VOLUME_TOTAL),
            "workout_duration" to Spec(ExerciseSessionRecord::class, "${HC}READ_EXERCISE", "sessions"),
            "basal_metabolic_rate" to Spec(BasalMetabolicRateRecord::class, "${HC}READ_BASAL_METABOLIC_RATE", "latest"),
            "heart_rate" to Spec(HeartRateRecord::class, "${HC}READ_HEART_RATE", "latest"),
            "resting_heart_rate" to Spec(RestingHeartRateRecord::class, "${HC}READ_RESTING_HEART_RATE", "latest"),
            "hrv_rmssd" to Spec(HeartRateVariabilityRmssdRecord::class, "${HC}READ_HEART_RATE_VARIABILITY", "latest"),
            "respiratory_rate" to Spec(RespiratoryRateRecord::class, "${HC}READ_RESPIRATORY_RATE", "latest"),
            "oxygen_saturation" to Spec(OxygenSaturationRecord::class, "${HC}READ_OXYGEN_SATURATION", "latest"),
            "blood_pressure" to Spec(BloodPressureRecord::class, "${HC}READ_BLOOD_PRESSURE", "pair"),
            "blood_glucose" to Spec(BloodGlucoseRecord::class, "${HC}READ_BLOOD_GLUCOSE", "latest"),
            "body_temperature" to Spec(BodyTemperatureRecord::class, "${HC}READ_BODY_TEMPERATURE", "latest"),
            "basal_body_temperature" to Spec(BasalBodyTemperatureRecord::class, "${HC}READ_BASAL_BODY_TEMPERATURE", "latest"),
            "skin_temperature_delta" to Spec(SkinTemperatureRecord::class, "${HC}READ_SKIN_TEMPERATURE", "latest", feature = HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE),
            "vo2_max" to Spec(Vo2MaxRecord::class, "${HC}READ_VO2_MAX", "latest"),
            "weight" to Spec(WeightRecord::class, "${HC}READ_WEIGHT", "latest"),
            "height" to Spec(HeightRecord::class, "${HC}READ_HEIGHT", "latest"),
            "body_fat" to Spec(BodyFatRecord::class, "${HC}READ_BODY_FAT", "latest"),
            "lean_body_mass" to Spec(LeanBodyMassRecord::class, "${HC}READ_LEAN_BODY_MASS", "latest"),
            "bone_mass" to Spec(BoneMassRecord::class, "${HC}READ_BONE_MASS", "latest"),
            "body_water_mass" to Spec(BodyWaterMassRecord::class, "${HC}READ_BODY_WATER_MASS", "latest"),
            "sleep" to Spec(SleepSessionRecord::class, "${HC}READ_SLEEP", "sleep")
        )
        private const val PAGE_SIZE = 50
        private const val MAX_PAGES = 4
        private const val HISTORY_WINDOW_MS = 30L * 24 * 3600 * 1000
    }

    override fun load(webView: WebView) {
        this.webView = webView
    }

    // Back from Health Connect or the app settings: access may have changed.
    // Value-less signal; the page re-checks capabilities and re-reads.
    override fun onResume() {
        val view = webView ?: return
        activity.runOnUiThread {
            view.evaluateJavascript("window.dispatchEvent(new CustomEvent('atome:native-health-invalidated',{detail:{access:true}}));", null)
        }
    }

    private fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(activity)
    private fun client(): HealthConnectClient? =
        if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(activity) else null

    private fun ids(invoke: Invoke): List<String> {
        val array = invoke.getArgs().optJSONArray("monitors") ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optString(it).takeIf { id -> SPECS.containsKey(id) || id == STEP_SENSOR_ID } }.distinct().take(32)
    }

    private fun fail(invoke: Invoke, code: String) = invoke.resolve(JSObject().put("ok", false).put("error", code))

    private fun activityGranted(): Boolean = Build.VERSION.SDK_INT < 29 ||
        ContextCompat.checkSelfPermission(activity, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

    private fun stepSensor(): Sensor? =
        (activity.getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    // ---- capabilities (never prompts) ----------------------------------------

    @Command
    fun capabilities(invoke: Invoke) {
        val requested = ids(invoke)
        scope.launch {
            val status = sdkStatus()
            val reason = when (status) {
                HealthConnectClient.SDK_AVAILABLE -> null
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "health_connect_update_required"
                else -> "health_connect_unavailable"
            }
            val monitors = JSObject()
            val hc = client()
            val granted = try { hc?.permissionController?.getGrantedPermissions() ?: emptySet() } catch (_: Exception) { emptySet() }
            for (id in requested) {
                if (id == STEP_SENSOR_ID) {
                    monitors.put(id, if (stepSensor() == null) JSObject().put("supported", false).put("reason", "health_sensor_unavailable")
                        else JSObject().put("supported", true).put("access", if (activityGranted()) "granted" else "not_granted"))
                    continue
                }
                val spec = SPECS[id] ?: continue
                val entry = JSObject()
                if (hc == null) {
                    entry.put("supported", false).put("reason", reason)
                } else if (spec.feature != null &&
                    hc.features.getFeatureStatus(spec.feature) != HealthConnectFeatures.FEATURE_STATUS_AVAILABLE) {
                    entry.put("supported", false).put("reason", "health_feature_unavailable")
                } else {
                    // Health Connect does tell which read permissions are granted.
                    entry.put("supported", true).put("access", if (granted.contains(spec.permission)) "granted" else "not_granted")
                }
                monitors.put(id, entry)
            }
            invoke.resolve(JSObject().put("available", hc != null).put("host", "android").put("reason", reason).put("monitors", monitors))
        }
    }

    // ---- authorization (explicit gesture; the app serializes requests) -------

    @Command
    fun requestAccess(invoke: Invoke) {
        val requested = ids(invoke)
        val hc = client()
        val wanted = requested.mapNotNull { SPECS[it]?.permission }.toSet()
        pendingActivityIds = requested.filter { it == STEP_SENSOR_ID }
        if (hc == null || wanted.isEmpty()) return continueWithActivity(invoke, emptySet())
        scope.launch {
            val granted = try { hc.permissionController.getGrantedPermissions() } catch (_: Exception) { emptySet() }
            val missing = wanted - granted
            if (missing.isEmpty()) return@launch activity.runOnUiThread { continueWithActivity(invoke, granted) }
            activity.runOnUiThread {
                val intent = PermissionController.createRequestPermissionResultContract().createIntent(activity, missing)
                startActivityForResult(invoke, intent, "onHealthPermissions")
            }
        }
    }

    @ActivityCallback
    fun onHealthPermissions(invoke: Invoke, result: ActivityResult) {
        // The result is advisory; effective permissions are re-read below.
        scope.launch {
            val granted = try { client()?.permissionController?.getGrantedPermissions() ?: emptySet() } catch (_: Exception) { emptySet() }
            activity.runOnUiThread { continueWithActivity(invoke, granted) }
        }
    }

    private fun continueWithActivity(invoke: Invoke, granted: Set<String>) {
        if (pendingActivityIds.isNotEmpty() && !activityGranted() && stepSensor() != null) {
            requestPermissionForAlias("activity", invoke, "onActivityPermission")
            return
        }
        resolveAccess(invoke, granted)
    }

    @PermissionCallback
    fun onActivityPermission(invoke: Invoke) {
        scope.launch {
            val granted = try { client()?.permissionController?.getGrantedPermissions() ?: emptySet() } catch (_: Exception) { emptySet() }
            resolveAccess(invoke, granted)
        }
    }

    private fun resolveAccess(invoke: Invoke, granted: Set<String>) {
        val requested = ids(invoke)
        val ok = JSArray(); val refused = JSArray()
        for (id in requested) {
            val has = if (id == STEP_SENSOR_ID) activityGranted() else SPECS[id]?.permission?.let { granted.contains(it) } == true
            if (has) ok.put(id) else refused.put(id)
        }
        pendingActivityIds = emptyList()
        // Each type is independent: a refused type never blocks the others.
        invoke.resolve(JSObject().put("completed", true).put("granted", ok).put("notGranted", refused))
    }

    // ---- settings (explicit gesture) ------------------------------------------
    // Health Connect stops showing its sheet after repeated refusals; access is
    // then only changed in Health Connect itself (or, for the phone step
    // sensor, in this app's system settings). Health Connect missing or out of
    // date: its store page.

    @Command
    fun openSettings(invoke: Invoke) {
        val requested = ids(invoke)
        val intent = when {
            requested.isNotEmpty() && requested.all { it == STEP_SENSOR_ID } ->
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null))
            sdkStatus() == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding"))
            else -> Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        }
        activity.runOnUiThread {
            try {
                activity.startActivity(intent)
                invoke.resolve(JSObject().put("opened", true))
            } catch (_: Exception) {
                fail(invoke, "health_settings_unavailable")
            }
        }
    }

    // ---- reads --------------------------------------------------------------

    @Command
    fun read(invoke: Invoke) {
        val requests = invoke.getArgs().optJSONArray("requests") ?: JSONArray()
        scope.launch {
            val hc = client()
            val granted = try { hc?.permissionController?.getGrantedPermissions() ?: emptySet() } catch (_: Exception) { emptySet() }
            val results = JSObject()
            for (index in 0 until minOf(requests.length(), 32)) {
                val request = requests.optJSONObject(index) ?: continue
                val id = request.optString("id")
                val from = Instant.ofEpochMilli(request.optLong("from"))
                val to = minOf(Instant.ofEpochMilli(request.optLong("to")), Instant.now())
                if (!to.isAfter(from)) continue
                results.put(id, try { readOne(hc, granted, id, from, to) } catch (error: SecurityException) {
                    JSObject().put("status", "permission_required")
                } catch (error: android.os.RemoteException) {
                    JSObject().put("status", "temporarily_unavailable").put("reason", "health_connect_remote")
                } catch (error: IllegalStateException) {
                    JSObject().put("status", "temporarily_unavailable").put("reason", "health_connect_state")
                } catch (error: Exception) {
                    JSObject().put("status", "error").put("reason", error.javaClass.simpleName)
                })
            }
            invoke.resolve(JSObject().put("results", results))
        }
    }

    private fun coverage(from: Instant, to: Instant): JSONObject {
        // Without READ_HEALTH_DATA_HISTORY, data older than 30 days before the
        // FIRST grant is not readable. The first-grant date is not exposed, so
        // a range reaching further back is flagged as possibly partial.
        val maybeLimited = to.toEpochMilli() - from.toEpochMilli() > HISTORY_WINDOW_MS
        return JSONObject().put("from", from.toEpochMilli()).put("to", to.toEpochMilli())
            .put("partial", maybeLimited).put("reason", if (maybeLimited) "health_connect_history_window" else JSONObject.NULL)
    }

    private fun source(record: Record): JSONObject = JSONObject().put("package", record.metadata.dataOrigin.packageName)

    private suspend fun readOne(hc: HealthConnectClient?, granted: Set<String>, id: String, from: Instant, to: Instant): JSObject {
        if (id == STEP_SENSOR_ID) return readStepSensor(from)
        val spec = SPECS[id] ?: return JSObject().put("status", "unsupported")
        if (hc == null) return JSObject().put("status", "unavailable").put("reason", "health_connect_unavailable")
        if (!granted.contains(spec.permission)) return JSObject().put("status", "permission_required")
        val range = TimeRangeFilter.between(from, to)
        return when (spec.kind) {
            "sum" -> readSum(hc, spec, range, from, to)
            "sessions" -> readSessions(hc, spec, range, from, to)
            "sleep" -> readSleep(hc, range, from, to)
            "pair" -> readPairs(hc, range, from, to)
            else -> readLatest(hc, id, spec, range, from, to)
        }
    }

    // Native aggregation applies Health Connect's own dedup / priority rules.
    private suspend fun readSum(hc: HealthConnectClient, spec: Spec, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
        val metric = spec.metric ?: return JSObject().put("status", "error")
        val result = hc.aggregate(AggregateRequest(setOf(metric), range))
        val raw: Any? = result[metric]
        val value: Double? = when (raw) {
            null -> null
            is Long -> raw.toDouble()
            is Double -> raw
            is androidx.health.connect.client.units.Length -> raw.inMeters
            is androidx.health.connect.client.units.Energy -> raw.inKilocalories
            is androidx.health.connect.client.units.Volume -> raw.inMilliliters
            else -> return JSObject().put("status", "error").put("reason", "health_metric_unhandled")
        }
        val out = JSObject().put("status", "ok").put("hasData", value != null).put("from", from.toEpochMilli())
            .put("to", to.toEpochMilli()).put("coverage", coverage(from, to))
        if (value != null) out.put("value", value)
        return out
    }

    private suspend fun <T : Record> readAll(hc: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, ascending: Boolean): Pair<List<T>, Boolean> {
        val records = mutableListOf<T>()
        var token: String? = null
        var pages = 0
        do {
            val response = hc.readRecords(ReadRecordsRequest(type, range, ascendingOrder = ascending, pageSize = PAGE_SIZE, pageToken = token))
            records.addAll(response.records)
            token = response.pageToken
            pages += 1
        } while (token != null && pages < MAX_PAGES)
        return records to (token != null)
    }

    private fun sample(value: Double, start: Instant, end: Instant, record: Record): JSONObject =
        JSONObject().put("value", value).put("start", start.toEpochMilli()).put("end", end.toEpochMilli()).put("source", source(record))

    private suspend fun readLatest(hc: HealthConnectClient, id: String, spec: Spec, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
        // Newest first; one page is enough for "latest" (records sorted by time).
        val response = hc.readRecords(ReadRecordsRequest(spec.record, range, ascendingOrder = false, pageSize = 20))
        val samples = JSONArray()
        for (record in response.records) {
            when (record) {
                is HeartRateRecord -> record.samples.forEach { samples.put(sample(it.beatsPerMinute.toDouble(), it.time, it.time, record)) }
                is SkinTemperatureRecord -> record.deltas.forEach { samples.put(sample(it.delta.inCelsius, it.time, it.time, record)) }
                is WeightRecord -> samples.put(sample(record.weight.inKilograms, record.time, record.time, record))
                is HeightRecord -> samples.put(sample(record.height.inMeters * 100.0, record.time, record.time, record))
                is BodyFatRecord -> samples.put(sample(record.percentage.value, record.time, record.time, record))
                is LeanBodyMassRecord -> samples.put(sample(record.mass.inKilograms, record.time, record.time, record))
                is BoneMassRecord -> samples.put(sample(record.mass.inKilograms, record.time, record.time, record))
                is BodyWaterMassRecord -> samples.put(sample(record.mass.inKilograms, record.time, record.time, record))
                is BasalMetabolicRateRecord -> samples.put(sample(record.basalMetabolicRate.inKilocaloriesPerDay, record.time, record.time, record))
                is RestingHeartRateRecord -> samples.put(sample(record.beatsPerMinute.toDouble(), record.time, record.time, record))
                is HeartRateVariabilityRmssdRecord -> samples.put(sample(record.heartRateVariabilityMillis, record.time, record.time, record))
                is RespiratoryRateRecord -> samples.put(sample(record.rate, record.time, record.time, record))
                is OxygenSaturationRecord -> samples.put(sample(record.percentage.value, record.time, record.time, record))
                is Vo2MaxRecord -> samples.put(sample(record.vo2MillilitersPerMinuteKilogram, record.time, record.time, record)
                    .put("qualifiers", JSONObject().put("measurement_method", record.measurementMethod)))
                is BloodGlucoseRecord -> samples.put(sample(record.level.inMilligramsPerDeciliter, record.time, record.time, record)
                    .put("qualifiers", JSONObject().put("specimen_source", record.specimenSource).put("meal_type", record.mealType).put("relation_to_meal", record.relationToMeal)))
                is BodyTemperatureRecord -> samples.put(sample(record.temperature.inCelsius, record.time, record.time, record)
                    .put("qualifiers", JSONObject().put("measurement_location", record.measurementLocation)))
                is BasalBodyTemperatureRecord -> samples.put(sample(record.temperature.inCelsius, record.time, record.time, record)
                    .put("qualifiers", JSONObject().put("measurement_location", record.measurementLocation)))
                else -> return JSObject().put("status", "error").put("reason", "health_record_unhandled_$id")
            }
        }
        // Health Connect percentages are already percentages (98, not 0.98).
        return JSObject().put("status", "ok").put("samples", samples).put("scale", "percent").put("coverage", coverage(from, to))
    }

    // One BloodPressureRecord = one measurement: never paired across records.
    private suspend fun readPairs(hc: HealthConnectClient, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
        val response = hc.readRecords(ReadRecordsRequest(BloodPressureRecord::class, range, ascendingOrder = false, pageSize = 20))
        val samples = JSONArray()
        response.records.forEach { record ->
            samples.put(JSONObject().put("systolic", record.systolic.inMillimetersOfMercury).put("diastolic", record.diastolic.inMillimetersOfMercury)
                .put("start", record.time.toEpochMilli()).put("end", record.time.toEpochMilli()).put("source", source(record))
                .put("qualifiers", JSONObject().put("body_position", record.bodyPosition).put("measurement_location", record.measurementLocation)))
        }
        return JSObject().put("status", "ok").put("samples", samples).put("coverage", coverage(from, to))
    }

    private fun stageName(type: Int): String = when (type) {
        SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "awake"
        SleepSessionRecord.STAGE_TYPE_SLEEPING -> "asleep_unspecified"
        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> "out_of_bed"
        SleepSessionRecord.STAGE_TYPE_LIGHT -> "asleep_light"
        SleepSessionRecord.STAGE_TYPE_DEEP -> "asleep_deep"
        SleepSessionRecord.STAGE_TYPE_REM -> "asleep_rem"
        else -> "unknown"
    }

    // Provider sessions are kept as sessions; stages are optional and never
    // invented. Grouping / union happen in health_values.js.
    private suspend fun readSleep(hc: HealthConnectClient, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
        val (records, truncated) = readAll(hc, SleepSessionRecord::class, range, ascending = false)
        val sessions = JSONArray()
        records.forEach { record ->
            val stages = JSONArray()
            record.stages.forEach { stage ->
                stages.put(JSONObject().put("stage", stageName(stage.stage)).put("start", stage.startTime.toEpochMilli()).put("end", stage.endTime.toEpochMilli()))
            }
            sessions.put(JSONObject().put("start", record.startTime.toEpochMilli()).put("end", record.endTime.toEpochMilli())
                .put("stages", stages).put("source", source(record)))
        }
        val cover = coverage(from, to)
        if (truncated) cover.put("partial", true).put("reason", "read_limit")
        return JSObject().put("status", "ok").put("sessions", sessions).put("coverage", cover)
    }

    private suspend fun readSessions(hc: HealthConnectClient, spec: Spec, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
        val (records, truncated) = readAll(hc, spec.record, range, ascending = true)
        val sessions = JSONArray()
        records.forEach { record ->
            // IntervalRecord is internal in connect-client 1.1.0; the only
            // "sessions" monitor reads ExerciseSessionRecord.
            if (record is ExerciseSessionRecord) sessions.put(JSONObject().put("start", record.startTime.toEpochMilli()).put("end", record.endTime.toEpochMilli()))
        }
        val cover = coverage(from, to)
        if (truncated) cover.put("partial", true).put("reason", "read_limit")
        return JSObject().put("status", "ok").put("sessions", sessions).put("coverage", cover)
    }

    private fun readStepSensor(from: Instant): JSObject {
        if (stepSensor() == null) return JSObject().put("status", "unavailable").put("reason", "health_sensor_unavailable")
        if (!activityGranted()) return JSObject().put("status", "permission_required")
        if (stepListener == null || stepLast == null) return JSObject().put("status", "ok").put("hasData", false)
        return JSObject().put("status", "ok").put("hasData", true).put("value", stepSession)
            .put("from", stepSince).put("to", System.currentTimeMillis()).put("source", JSONObject().put("device", "this_phone_step_counter"))
    }

    // ---- observation: only the live step sensor needs a native listener -----

    @Command
    fun observe(invoke: Invoke) {
        val started = JSArray()
        if (ids(invoke).contains(STEP_SENSOR_ID) && stepListener == null && activityGranted()) {
            val sensor = stepSensor()
            val manager = activity.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            if (sensor != null && manager != null) {
                stepLast = null; stepSession = 0.0; stepSince = System.currentTimeMillis()
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        val counter = event.values.firstOrNull() ?: return
                        val last = stepLast
                        // Counter since reboot: a smaller value means a reboot.
                        if (last != null) stepSession += if (counter >= last) (counter - last).toDouble() else counter.toDouble()
                        stepLast = counter
                        val now = System.currentTimeMillis()
                        if (now - lastStepSignal >= 5000) { lastStepSignal = now; signal(STEP_SENSOR_ID) }
                    }
                    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
                }
                manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
                stepListener = listener
                started.put(STEP_SENSOR_ID)
            }
        }
        invoke.resolve(JSObject().put("observing", started))
    }

    @Command
    fun unobserve(invoke: Invoke) {
        if (ids(invoke).contains(STEP_SENSOR_ID)) stopStepSensor()
        invoke.resolve(JSObject().put("observing", JSArray()))
    }

    @Command
    fun reset(invoke: Invoke) {
        stopStepSensor()
        invoke.resolve(JSObject().put("reset", true))
    }

    private fun stopStepSensor() {
        val manager = activity.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        stepListener?.let { manager?.unregisterListener(it) }
        stepListener = null; stepLast = null; stepSession = 0.0
    }

    // Value-less invalidation: the page re-reads through its channel.
    private fun signal(id: String) {
        val view = webView ?: return
        activity.runOnUiThread {
            view.evaluateJavascript("window.dispatchEvent(new CustomEvent('atome:native-health-invalidated',{detail:{monitors:['$id']}}));", null)
        }
    }

    // ---- local association device store <-> account --------------------------
    // noBackupFilesDir: excluded from Auto Backup, so the association never
    // travels to another device as a transportable permission.

    private fun linksFile(): File = File(activity.noBackupFilesDir, "atome_health_links.json")

    private fun readLinks(): JSONObject = try { JSONObject(linksFile().readText()) } catch (_: Exception) { JSONObject() }

    @Command
    fun isLinked(invoke: Invoke) {
        val account = invoke.getArgs().optString("account")
        invoke.resolve(JSObject().put("linked", account.isNotEmpty() && readLinks().optBoolean(account, false)))
    }

    @Command
    fun link(invoke: Invoke) {
        val account = invoke.getArgs().optString("account")
        if (account.isEmpty()) return fail(invoke, "health_account_required")
        val links = readLinks().put(account, true)
        linksFile().writeText(links.toString())
        invoke.resolve(JSObject().put("linked", true))
    }
}
