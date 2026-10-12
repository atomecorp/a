package one.atome.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.reflect.KClass

// Shared native queries for latest readings and bounded historical reads.
internal class HealthReadQueries {
    private val PAGE_SIZE = 50
    private val HISTORY_WINDOW_MS = 30L * 24 * 3600 * 1000
    private fun coverage(from: Instant, to: Instant): JSONObject {
        // Without READ_HEALTH_DATA_HISTORY, data older than 30 days before the
        // FIRST grant is not readable. The first-grant date is not exposed, so
        // a range reaching further back is flagged as possibly partial.
        val maybeLimited = to.toEpochMilli() - from.toEpochMilli() > HISTORY_WINDOW_MS
        return JSONObject().put("from", from.toEpochMilli()).put("to", to.toEpochMilli())
            .put("partial", maybeLimited).put("reason", if (maybeLimited) "health_connect_history_window" else JSONObject.NULL)
    }

    private fun source(record: Record): JSONObject = JSONObject().put("package", record.metadata.dataOrigin.packageName)

    // Native aggregation applies Health Connect's own dedup / priority rules.
    suspend fun readSum(hc: HealthConnectClient, spec: HealthPlugin.Spec, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
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

    private suspend fun <T : Record> readAll(hc: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, ascending: Boolean, limit: Int = 200): Pair<List<T>, Boolean> {
        val records = mutableListOf<T>()
        var token: String? = null
        var pages = 0
        do {
            val response = hc.readRecords(ReadRecordsRequest(type, range, ascendingOrder = ascending, pageSize = PAGE_SIZE, pageToken = token))
            records.addAll(response.records)
            token = response.pageToken
            pages += 1
        } while (token != null && pages * PAGE_SIZE < limit)
        return records to (token != null)
    }

    private fun sample(value: Double, start: Instant, end: Instant, record: Record): JSONObject =
        JSONObject().put("value", value).put("start", start.toEpochMilli()).put("end", end.toEpochMilli()).put("source", source(record))

    suspend fun readLatest(hc: HealthConnectClient, id: String, spec: HealthPlugin.Spec, range: TimeRangeFilter, from: Instant, to: Instant, history: Boolean = false): JSObject {
        // Newest first; one page is enough for "latest" (records sorted by time).
        val (records, truncated) = if (history) readAll(hc, spec.record, range, ascending = true, limit = 1000)
            else hc.readRecords(ReadRecordsRequest(spec.record, range, ascendingOrder = false, pageSize = 20)).let { it.records to false }
        val samples = JSONArray()
        var pointLimit = false
        val limit = if (history) 1000 else Int.MAX_VALUE
        for (record in records) {
            if (samples.length() >= limit) { pointLimit = true; break }
            when (record) {
                is HeartRateRecord -> {
                    if (record.samples.size > limit - samples.length()) pointLimit = true
                    record.samples.takeLast(limit - samples.length()).forEach { samples.put(sample(it.beatsPerMinute.toDouble(), it.time, it.time, record)) }
                }
                is SkinTemperatureRecord -> {
                    if (record.deltas.size > limit - samples.length()) pointLimit = true
                    record.deltas.takeLast(limit - samples.length()).forEach { samples.put(sample(it.delta.inCelsius, it.time, it.time, record)) }
                }
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
        return JSObject().put("status", "ok").put("samples", samples).put("scale", "percent").put("coverage", coverage(from, to).apply { if (truncated || pointLimit) put("partial", true).put("reason", "read_limit") })
    }

    // One BloodPressureRecord = one measurement: never paired across records.
    suspend fun readPairs(hc: HealthConnectClient, range: TimeRangeFilter, from: Instant, to: Instant, history: Boolean = false): JSObject {
        val (records, truncated) = if (history) readAll(hc, BloodPressureRecord::class, range, ascending = true, limit = 1000)
            else hc.readRecords(ReadRecordsRequest(BloodPressureRecord::class, range, ascendingOrder = false, pageSize = 20)).let { it.records to false }
        val samples = JSONArray()
        records.forEach { record ->
            samples.put(JSONObject().put("systolic", record.systolic.inMillimetersOfMercury).put("diastolic", record.diastolic.inMillimetersOfMercury)
                .put("start", record.time.toEpochMilli()).put("end", record.time.toEpochMilli()).put("source", source(record))
                .put("qualifiers", JSONObject().put("body_position", record.bodyPosition).put("measurement_location", record.measurementLocation)))
        }
        return JSObject().put("status", "ok").put("samples", samples).put("coverage", coverage(from, to).apply { if (truncated) put("partial", true).put("reason", "read_limit") })
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
    suspend fun readSleep(hc: HealthConnectClient, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
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

    suspend fun readSessions(hc: HealthConnectClient, spec: HealthPlugin.Spec, range: TimeRangeFilter, from: Instant, to: Instant): JSObject {
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

}
