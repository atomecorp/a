package one.atome.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

// The sport sessions of Health Connect, read for their import into eVe
// (atome/src/squirrel/health/health_activity_reader.js, D18 improvement 6). Read only:
// - no anchor: a changes token is taken FIRST (nothing written meanwhile is missed), then
//   the authorized history is read page after page (50 sessions; Health Connect itself
//   limits it to 30 days before the first grant, READ_HEALTH_DATA_HISTORY is not asked);
// - then only the changes since the token (sessions added, changed or deleted). A token
//   unused for 30 days expires: `health_anchor_expired`, the page reads again from its
//   last synchronization;
// - the sessions this app wrote (its training workouts, HealthPlugin.workoutEnd) are skipped;
// - each session's measures come from the app that recorded it, in its time, and only
//   for the categories the person chose AND Health Connect granted; a measure it does
//   not hold is absent.
// The anchor is this class's own JSON, opaque to the page. Values only travel in the reply.
internal class HealthActivityImport(private val ownPackage: String) {
    companion object {
        private const val HC = "android.permission.health."
        private const val PAGE = 50
        private const val HISTORY_MS = 3650L * 86400 * 1000
        private const val ANCHOR_MAX = 8192
        private val SPORTS = mapOf(
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to "running",
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL to "running",
            ExerciseSessionRecord.EXERCISE_TYPE_WALKING to "walking",
            ExerciseSessionRecord.EXERCISE_TYPE_HIKING to "hiking",
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING to "cycling",
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY to "cycling",
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to "swimming",
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER to "swimming",
            ExerciseSessionRecord.EXERCISE_TYPE_ROWING to "rowing",
            ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE to "rowing",
            ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL to "elliptical",
            ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING to "stairs",
            ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE to "stairs",
            ExerciseSessionRecord.EXERCISE_TYPE_YOGA to "yoga",
            ExerciseSessionRecord.EXERCISE_TYPE_PILATES to "pilates",
            ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to "strength",
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING to "strength",
            ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS to "core",
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to "hiit",
            ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP to "cardio",
            ExerciseSessionRecord.EXERCISE_TYPE_DANCING to "dance",
            ExerciseSessionRecord.EXERCISE_TYPE_BOXING to "boxing",
            ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS to "martialArts",
            ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING to "climbing",
            ExerciseSessionRecord.EXERCISE_TYPE_TENNIS to "tennis",
            ExerciseSessionRecord.EXERCISE_TYPE_SOCCER to "soccer",
            ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL to "basketball",
            ExerciseSessionRecord.EXERCISE_TYPE_GOLF to "golf",
            ExerciseSessionRecord.EXERCISE_TYPE_SKIING to "skiing",
            ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING to "snowboarding",
            ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING to "flexibility",
            ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR to "wheelchair"
        )
    }

    private class Measure(val key: String, val category: String, val permission: String, val metric: AggregateMetric<*>)
    private val measures = listOf(
        Measure("heart_avg", "heart_rate", "${HC}READ_HEART_RATE", HeartRateRecord.BPM_AVG),
        Measure("heart_max", "heart_rate", "${HC}READ_HEART_RATE", HeartRateRecord.BPM_MAX),
        Measure("active_kcal", "active_energy", "${HC}READ_ACTIVE_CALORIES_BURNED", ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
        Measure("distance_m", "distance", "${HC}READ_DISTANCE", DistanceRecord.DISTANCE_TOTAL),
        Measure("steps", "steps", "${HC}READ_STEPS", StepsRecord.COUNT_TOTAL)
    )

    private fun fail(code: String): JSObject = JSObject().put("ok", false).put("error", code)

    suspend fun read(hc: HealthConnectClient, granted: Set<String>, args: JSONObject): JSObject {
        val categories = args.optJSONArray("categories")?.let { list -> (0 until list.length()).map { list.optString(it) }.toSet() } ?: emptySet()
        if (!categories.contains("workouts")) return fail("health_activities_invalid")
        if (!granted.contains("${HC}READ_EXERCISE")) return fail("health_permission_required")
        val chosen = measures.filter { categories.contains(it.category) && granted.contains(it.permission) }
        val text = if (args.isNull("anchor")) "" else args.optString("anchor", "")
        if (text.length > ANCHOR_MAX) return fail("health_anchor_invalid")
        return try {
            if (text.isEmpty()) {
                val from = if (args.has("from")) args.optLong("from") else System.currentTimeMillis() - HISTORY_MS
                val token = hc.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))
                history(hc, chosen, token, Instant.ofEpochMilli(maxOf(from, System.currentTimeMillis() - HISTORY_MS)), null)
            } else {
                val anchor = JSONObject(text)
                val token = anchor.getString("token")
                if (anchor.optString("phase") == "history") {
                    history(hc, chosen, token, Instant.ofEpochMilli(anchor.getLong("from")), anchor.getString("page"))
                } else changes(hc, chosen, token)
            }
        } catch (error: org.json.JSONException) {
            fail("health_anchor_invalid")
        } catch (error: SecurityException) {
            fail("health_permission_required")
        } catch (error: android.os.RemoteException) {
            fail("temporarily_unavailable")
        } catch (error: IllegalStateException) {
            fail("temporarily_unavailable")
        }
    }

    private suspend fun history(hc: HealthConnectClient, chosen: List<Measure>, token: String, from: Instant, page: String?): JSObject {
        val response = hc.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.after(from),
            ascendingOrder = true, pageSize = PAGE, pageToken = page))
        val next = response.pageToken
        val anchor = if (next != null) JSONObject().put("phase", "history").put("token", token).put("from", from.toEpochMilli()).put("page", next)
            else JSONObject().put("phase", "changes").put("token", token)
        return reply(hc, chosen, response.records, JSONArray(), anchor, next != null)
    }

    private suspend fun changes(hc: HealthConnectClient, chosen: List<Measure>, token: String): JSObject {
        val response = hc.getChanges(token)
        if (response.changesTokenExpired) return fail("health_anchor_expired")
        val sessions = mutableListOf<ExerciseSessionRecord>()
        val deleted = JSONArray()
        for (change in response.changes) {
            when (change) {
                is UpsertionChange -> (change.record as? ExerciseSessionRecord)?.let { sessions.add(it) }
                is DeletionChange -> deleted.put(change.recordId)
            }
        }
        return reply(hc, chosen, sessions, deleted, JSONObject().put("phase", "changes").put("token", response.nextChangesToken), response.hasMore)
    }

    private suspend fun reply(hc: HealthConnectClient, chosen: List<Measure>, sessions: List<ExerciseSessionRecord>, deleted: JSONArray,
                              anchor: JSONObject, more: Boolean): JSObject {
        val rows = JSONArray()
        for (session in sessions) {
            val origin = session.metadata.dataOrigin
            if (origin.packageName == ownPackage) continue
            val row = JSONObject().put("source_id", session.metadata.id).put("sport", SPORTS[session.exerciseType] ?: "other")
                .put("start", session.startTime.toEpochMilli()).put("end", session.endTime.toEpochMilli()).put("origin", origin.packageName)
            session.metadata.device?.model?.takeIf { it.isNotEmpty() }?.let { row.put("device", it) }
            if (chosen.isNotEmpty()) {
                val result = hc.aggregate(AggregateRequest(chosen.map { it.metric }.toSet(),
                    TimeRangeFilter.between(session.startTime, session.endTime), setOf(origin)))
                for (measure in chosen) {
                    val value: Double? = when (val raw: Any? = result[measure.metric]) {
                        is Long -> raw.toDouble()
                        is Double -> raw
                        is Length -> raw.inMeters
                        is Energy -> raw.inKilocalories
                        else -> null
                    }
                    if (value != null) row.put(measure.key, value)
                }
            }
            rows.put(row)
        }
        return JSObject().put("activities", rows).put("deleted", deleted).put("anchor", anchor.toString()).put("more", more)
    }
}
