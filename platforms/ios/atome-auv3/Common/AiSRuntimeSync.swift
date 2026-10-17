import Foundation
import SQLite3

// SQLite synchronization storage, owned by the canonical AiS database queue.
extension AiSRuntime {
    // A read-only transport snapshot, never an authority for project contents.
    final class SyncProgress {
        private let lock = NSLock()
        private var value: [String: Any] = [:]
        func replace(_ next: [String: Any]) { lock.lock(); defer { lock.unlock() }; value = next }
        func read(localPrincipal: String) -> [String: Any] {
            lock.lock(); defer { lock.unlock() }
            return value["principal_id"] as? String == localPrincipal ? value : [:]
        }
    }

    static let syncProgress = SyncProgress()

    static func remoteSyncPendingCount(localPrincipalId: String) throws -> Int {
        try queue.sync {
            let db = try openDatabase()
            let rows = try query(db, "SELECT COUNT(*) AS count FROM sync_queue WHERE target_server = 'fastify' AND status != 'synced' AND json_extract(payload, '$.actor.id') = ?", [.text(localPrincipalId)])
            return Int(intValue(rows.first?["count"], defaultValue: 0))
        }
    }
    static func ensureSyncSchema(_ db: OpaquePointer?) throws {
        let existing = Set(try query(db, "PRAGMA table_info(events)").compactMap { $0["name"] as? String })
        for (column, type) in [("stream_id", "TEXT"), ("sequence", "INTEGER"), ("source", "TEXT"),
                               ("lww_decisions", "TEXT"), ("projection", "TEXT")] where !existing.contains(column) {
            try execute(db, "ALTER TABLE events ADD COLUMN \(column) \(type)")
        }
        try execute(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_events_stream_sequence ON events(stream_id, sequence) WHERE stream_id IS NOT NULL AND sequence IS NOT NULL")
        try execute(db, """
            CREATE TABLE IF NOT EXISTS remote_sync_stream_cursors (
                principal_id TEXT NOT NULL, stream_id TEXT NOT NULL,
                last_sequence INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
                projection_version INTEGER NOT NULL DEFAULT 1,
                repair_sequence INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (principal_id, stream_id))
            """)
        let cursors = Set(try query(db, "PRAGMA table_info(remote_sync_stream_cursors)").compactMap { $0["name"] as? String })
        if !cursors.contains("projection_version") {
            // Re-deliver legacy envelopes whose owner metadata was not projected.
            // The immutable event log is retained; only the derived projection is repaired.
            try execute(db, "ALTER TABLE remote_sync_stream_cursors ADD COLUMN projection_version INTEGER NOT NULL DEFAULT 0")
        }
        if !cursors.contains("repair_sequence") {
            try execute(db, "ALTER TABLE remote_sync_stream_cursors ADD COLUMN repair_sequence INTEGER NOT NULL DEFAULT 0")
        }
        // Delivered envelopes this device cannot project, kept whole for audit and repair.
        try execute(db, """
            CREATE TABLE IF NOT EXISTS remote_sync_rejected_events (
                principal_id TEXT NOT NULL, stream_id TEXT NOT NULL, sequence INTEGER NOT NULL,
                event_id TEXT NOT NULL, error TEXT NOT NULL, envelope TEXT NOT NULL, rejected_at TEXT NOT NULL,
                PRIMARY KEY (principal_id, stream_id, sequence))
            """)
        let columns = Set(try query(db, "PRAGMA table_info(sync_queue)").compactMap { $0["name"] as? String })
        for column in ["event_id", "next_retry_at", "last_error"] where !columns.contains(column) {
            try execute(db, "ALTER TABLE sync_queue ADD COLUMN \(column) TEXT")
        }
        try execute(db, "CREATE INDEX IF NOT EXISTS idx_events_source_actor_ts ON events(source, json_extract(actor, '$.id'), ts)")
        try execute(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_event_target ON sync_queue(event_id, target_server) WHERE event_id IS NOT NULL")
    }

    static func enqueueSyncEvent(_ db: OpaquePointer?, event: [String: Any]) throws {
        let id = stringValue(event["id"]), atomeId = stringValue(event["atome_id"])
        guard !id.isEmpty, !atomeId.isEmpty else { return }
        guard !atomeId.lowercased().hasPrefix("tool.ui."), !atomeId.lowercased().hasPrefix("tool_ui.") else { return }
        try execute(db, """
            INSERT OR IGNORE INTO sync_queue (event_id, atome_id, operation, payload, target_server, status)
            VALUES (?, ?, 'events:commit', ?, 'fastify', 'pending')
            """, [.text(id), .text(atomeId), .text(try jsonString(event))])
    }

    private static func verifiedSyncPrincipal(_ db: OpaquePointer?, remote: String, local: String?) throws -> String {
        let rows = try query(db, "SELECT DISTINCT local_principal FROM auth_local_grants WHERE remote_principal = ? AND locked = 0", [.text(remote)])
        guard rows.count == 1, let principal = normalizedOptionalString(rows.first?["local_principal"]),
              local == nil || local == principal else { throw AiSError("sync_identity_binding_unavailable") }
        return principal
    }

    static func prepareRemoteSync(principalId: String, localPrincipalId: String) throws {
        try queue.sync {
            let db = try openDatabase()
            _ = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            try execute(db, "SAVEPOINT ais_sync_prepare")
            do {
                try execute(db, "UPDATE sync_queue SET status = 'pending' WHERE target_server = 'fastify' AND status = 'syncing' AND json_extract(payload, '$.actor.id') = ?", [.text(localPrincipalId)])
                try enqueueLegacySyncEvents(db, localPrincipalId: localPrincipalId)
                try execute(db, "RELEASE ais_sync_prepare")
            } catch {
                try execute(db, "ROLLBACK TO ais_sync_prepare"); try execute(db, "RELEASE ais_sync_prepare")
                throw error
            }
        }
    }

    private static func enqueueLegacySyncEvents(_ db: OpaquePointer?, localPrincipalId: String) throws {
        // Repair the old send-once path without replacing history with a snapshot.
        // Already accepted events retain their IDs and are deduplicated by Fastify.
        let rows = try query(db, """
            SELECT e.id, e.ts, e.atome_id, e.project_id, e.kind, e.payload, e.actor, e.tx_id, e.gesture_id
            FROM events e LEFT JOIN sync_queue q ON q.event_id = e.id AND q.target_server = 'fastify'
            WHERE e.source = 'ais' AND json_extract(e.actor, '$.id') = ? AND q.queue_id IS NULL
              AND e.atome_id IS NOT NULL AND lower(e.atome_id) NOT LIKE 'tool.ui.%'
              AND lower(e.atome_id) NOT LIKE 'tool_ui.%' ORDER BY e.ts, e.rowid LIMIT 50
            """, [.text(localPrincipalId)])
        for row in rows {
            var event = row
            event["payload"] = parseJSONValue(stringValue(row["payload"]))
            event["actor"] = parseJSONValue(stringValue(row["actor"]))
            try enqueueSyncEvent(db, event: event)
        }
    }

    // Due rows only, as Tauri's worker: a row waiting for its retry never holds back the
    // rows behind it. Fastify reconciles out-of-order offline events (`offline-lww`).
    static func pendingRemoteSync(principalId: String, localPrincipalId: String, limit: Int = 50) throws -> [[String: Any]] {
        try queue.sync {
            let db = try openDatabase()
            _ = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            try enqueueLegacySyncEvents(db, localPrincipalId: localPrincipalId)
            let rows = try query(db, """
                SELECT queue_id, event_id, payload, attempts FROM sync_queue
                WHERE target_server = 'fastify' AND status NOT IN ('synced', 'rejected') AND json_extract(payload, '$.actor.id') = ?
                  AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday('now'))
                ORDER BY created_at, queue_id LIMIT ?
                """, [.text(localPrincipalId), .int(Int64(max(1, limit)))])
            var batch: [[String: Any]] = [], bytes = 0
            for row in rows {
                let size = stringValue(row["payload"]).utf8.count
                if !batch.isEmpty && bytes + size > 1_000_000 { break }
                batch.append(row); bytes += size
            }
            return batch
        }
    }

    /// Outbox events of these Atomes the server has not acknowledged yet, with the last
    /// delivery error among them.
    static func undeliveredRemoteSync(localPrincipalId: String, atomeIds: [String]) throws -> (count: Int, lastError: String?) {
        let ids = atomeIds.filter { !$0.isEmpty }
        guard !ids.isEmpty else { return (0, nil) }
        return try queue.sync { () throws -> (count: Int, lastError: String?) in
            let db = try openDatabase()
            try enqueueLegacySyncEvents(db, localPrincipalId: localPrincipalId)
            let marks = Array(repeating: "?", count: ids.count).joined(separator: ",")
            let rows = try query(db, """
                SELECT COUNT(*) AS owed, MAX(last_error) AS last_error FROM sync_queue
                WHERE target_server = 'fastify' AND status != 'synced' AND json_extract(payload, '$.actor.id') = ?
                AND json_extract(payload, '$.atome_id') IN (\(marks))
                """, [.text(localPrincipalId)] + ids.map { .text($0) })
            return (Int(intValue(rows.first?["owed"], defaultValue: 0)), normalizedOptionalString(rows.first?["last_error"]))
        }
    }

    // `rejected` is terminal: Fastify refuses this exact event, so a retry cannot change the
    // outcome. The row stays in the queue (counted as undelivered) instead of looping.
    static func finishRemoteSync(_ rows: [[String: Any]], localPrincipalId: String, error: String? = nil, rejected: Bool = false) throws {
        try queue.sync {
            let db = try openDatabase()
            try execute(db, "SAVEPOINT ais_sync_receipt")
            do {
                for row in rows {
                    let attempts = intValue(row["attempts"], defaultValue: 0) + 1
                    let retry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(min(pow(2, Double(min(attempts, 6))), 60)))
                    try execute(db, """
                        UPDATE sync_queue SET status = ?, attempts = ?, next_retry_at = ?, last_error = ?
                        WHERE queue_id = ? AND event_id = ? AND json_extract(payload, '$.actor.id') = ?
                        """, [.text(error == nil ? "synced" : (rejected ? "rejected" : "failed")), .int(attempts),
                              error == nil || rejected ? .null : .text(retry),
                              error.map(SQLiteBinding.text) ?? .null, .int(intValue(row["queue_id"], defaultValue: -1)),
                              .text(stringValue(row["event_id"])), .text(localPrincipalId)])
                }
                try execute(db, "RELEASE ais_sync_receipt")
            } catch {
                try execute(db, "ROLLBACK TO ais_sync_receipt"); try execute(db, "RELEASE ais_sync_receipt")
                throw error
            }
        }
    }

    static func outboundSyncEvent(_ row: [String: Any], localPrincipalId: String, principalId: String) throws -> [String: Any] {
        guard var event = parseJSONValue(stringValue(row["payload"])) as? [String: Any],
              resolveActorId(event["actor"]) == localPrincipalId else { throw AiSError("sync_event_principal_mismatch") }
        event["actor"] = ["type":"user", "id":principalId]
        if stringValue(event["atome_id"]) == localPrincipalId { event["atome_id"] = principalId }
        let identityKeys = ["owner", "ownerId", "owner_id", "creator", "creatorId", "creator_id", "_pending_owner_id"]
        for key in identityKeys { event.removeValue(forKey: key) }
        if var payload = event["payload"] as? [String: Any] {
            for key in identityKeys { payload.removeValue(forKey: key) }
            for key in ["parent_id", "parentId"] where stringValue(payload[key]) == localPrincipalId { payload[key] = principalId }
            if var props = payload["props"] as? [String: Any] {
                for key in identityKeys { props.removeValue(forKey: key) }
                payload["props"] = props
            }
            event["payload"] = payload
        }
        return event
    }

    static func registerRemoteSyncStream(principalId: String, streamId: String) throws {
        try queue.sync {
            let db = try openDatabase()
            try execute(db, """
                INSERT INTO remote_sync_stream_cursors (principal_id, stream_id, last_sequence, updated_at, projection_version)
                VALUES (?, ?, 0, ?, 1) ON CONFLICT(principal_id, stream_id) DO NOTHING
                """, [.text(principalId), .text(streamId), .text(isoNow())])
        }
    }

    static func remoteSyncCursors(principalId: String) throws -> [(String, Int64)] {
        try queue.sync {
            let db = try openDatabase()
            return try query(db, "SELECT stream_id, CASE WHEN projection_version = 0 THEN repair_sequence ELSE last_sequence END AS cursor FROM remote_sync_stream_cursors WHERE principal_id = ? ORDER BY stream_id", [.text(principalId)]).compactMap { row in
                guard let stream = row["stream_id"] as? String else { return nil }
                return (stream, intValue(row["cursor"], defaultValue: 0))
            }
        }
    }

    static func completeRemoteReplay(principalId: String, streamIds: [String], cursors: [String: Int64] = [:]) throws {
        guard !streamIds.isEmpty else { return }
        try queue.sync {
            let db = try openDatabase()
            try execute(db, "SAVEPOINT ais_sync_replay")
            do {
                for streamId in streamIds {
                    guard let cursor = cursors[streamId], cursor >= 0 else { continue }
                    try execute(db, "UPDATE remote_sync_stream_cursors SET last_sequence = MAX(repair_sequence, ?), projection_version = 1 WHERE principal_id = ? AND stream_id = ? AND projection_version = 0", [.int(cursor), .text(principalId), .text(streamId)])
                }
                try execute(db, "RELEASE ais_sync_replay")
            } catch {
                try execute(db, "ROLLBACK TO ais_sync_replay"); try execute(db, "RELEASE ais_sync_replay")
                throw error
            }
        }
    }

    enum RemoteSyncDelivery: Equatable { case applied, unchanged, rejected(String) }

    // Storage conditions a later attempt can overcome. Any other failure belongs to the
    // envelope itself and repeats identically on every replay of it.
    private static let transientSQLiteCodes: Set<Int32> = [SQLITE_BUSY, SQLITE_LOCKED, SQLITE_NOMEM,
        SQLITE_READONLY, SQLITE_IOERR, SQLITE_FULL, SQLITE_CANTOPEN, SQLITE_INTERRUPT]

    // A transient storage failure is thrown and the cursor stays put for a later delivery.
    // An envelope this device cannot project is recorded whole and its sequence passed, so
    // one poisoned event no longer turns every reconnection into the same failing replay.
    static func persistRemoteSyncEnvelope(_ envelope: [String: Any], principalId: String, localPrincipalId: String? = nil) throws -> RemoteSyncDelivery {
        try queue.sync {
            let db = try openDatabase()
            let local = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            let eventId = stringValue(envelope["event_id"] ?? envelope["id"]), streamId = stringValue(envelope["stream"] ?? envelope["stream_id"])
            let sequence = intValue(envelope["sequence"], defaultValue: 0)
            guard !streamId.isEmpty, sequence > 0 else { throw AiSError("sync_envelope_invalid") }
            func reject(_ reason: String) throws -> RemoteSyncDelivery {
                try rejectRemoteSyncEnvelope(db, envelope, principalId: principalId, streamId: streamId,
                                             sequence: sequence, eventId: eventId, reason: reason)
                return .rejected(reason)
            }
            if streamId == "directory.public", stringValue(envelope["kind"]) == "directory.invalidate" {
                try advanceRemoteSyncCursor(db, principalId: principalId, streamId: streamId, sequence: sequence)
                return .applied
            }
            guard !eventId.isEmpty else { return try reject("sync_envelope_invalid") }
            guard let vault = normalizedOptionalString(envelope["vault_principal_id"]) else { return try reject("sync_vault_owner_missing") }
            var event: [String: Any] = ["id":eventId, "ts":stringValue(envelope["timestamp"] ?? envelope["ts"]),
                "kind":stringValue(envelope["kind"]), "payload":envelope["patch"] ?? [:],
                "actor":["type":"user", "id":principalId], "stream_id":streamId, "sequence":sequence,
                "source":envelope["source"] ?? NSNull(), "lww_decisions":envelope["lww_decisions"] ?? NSNull(),
                "projection":envelope["projection"] ?? NSNull()]
            for key in ["atome_id", "project_id", "tx_id", "gesture_id"] { if let value = envelope[key] { event[key] = value } }
            try execute(db, "BEGIN IMMEDIATE")
            let applied: Bool
            do {
                applied = try applyRemoteSyncEvent(db, event: event, vault: vault, remote: principalId, local: local)
            } catch {
                let code = sqlite3_errcode(db) & 0xff
                try execute(db, "ROLLBACK")
                if transientSQLiteCodes.contains(code) { throw error }
                return try reject(error.localizedDescription)
            }
            do { try execute(db, "COMMIT") } catch { try execute(db, "ROLLBACK"); throw error }
            return applied ? .applied : .unchanged
        }
    }

    // Runs inside the caller's transaction. A duplicate may repair a legacy projection or
    // reconcile our own committed event; one already projected at this cursor is unchanged.
    private static func applyRemoteSyncEvent(_ db: OpaquePointer?, event: [String: Any], vault: String, remote: String, local: String) throws -> Bool {
        let eventId = stringValue(event["id"]), streamId = stringValue(event["stream_id"])
        let sequence = intValue(event["sequence"], defaultValue: 0)
        let duplicate = !(try query(db, "SELECT id FROM events WHERE id = ? LIMIT 1", [.text(eventId)])).isEmpty
        let checkpoint = try query(db, "SELECT last_sequence, projection_version FROM remote_sync_stream_cursors WHERE principal_id = ? AND stream_id = ?", [.text(remote), .text(streamId)]).first
        if duplicate && intValue(checkpoint?["projection_version"], defaultValue: 0) == 1
            && intValue(checkpoint?["last_sequence"], defaultValue: 0) >= sequence {
            return false
        }
        let projected = try localSyncProjection(db, event: event, vault: vault, remote: remote, local: local)
        if duplicate { try applyEventToStateCurrent(db, event: projected) }
        else { try appendEvent(db, event: event, projectionEvent: projected) }
        try advanceRemoteSyncCursor(db, principalId: remote, streamId: streamId, sequence: sequence)
        return true
    }

    private static func advanceRemoteSyncCursor(_ db: OpaquePointer?, principalId: String, streamId: String, sequence: Int64) throws {
        try execute(db, """
            INSERT INTO remote_sync_stream_cursors (principal_id, stream_id, last_sequence, updated_at, projection_version)
            VALUES (?, ?, ?, ?, 1) ON CONFLICT(principal_id, stream_id) DO UPDATE SET
            last_sequence = MAX(remote_sync_stream_cursors.last_sequence, excluded.last_sequence), updated_at = excluded.updated_at,
            repair_sequence = CASE WHEN remote_sync_stream_cursors.projection_version = 0
                THEN MAX(remote_sync_stream_cursors.repair_sequence, excluded.last_sequence)
                ELSE remote_sync_stream_cursors.repair_sequence END
            """, [.text(principalId), .text(streamId), .int(sequence), .text(isoNow())])
    }

    private static func rejectRemoteSyncEnvelope(_ db: OpaquePointer?, _ envelope: [String: Any], principalId: String,
                                                 streamId: String, sequence: Int64, eventId: String, reason: String) throws {
        try execute(db, "SAVEPOINT ais_sync_reject")
        do {
            try execute(db, """
                INSERT OR REPLACE INTO remote_sync_rejected_events
                (principal_id, stream_id, sequence, event_id, error, envelope, rejected_at) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, [.text(principalId), .text(streamId), .int(sequence), .text(eventId), .text(reason),
                      .text(try jsonString(envelope)), .text(isoNow())])
            try advanceRemoteSyncCursor(db, principalId: principalId, streamId: streamId, sequence: sequence)
            try execute(db, "RELEASE ais_sync_reject")
        } catch {
            try execute(db, "ROLLBACK TO ais_sync_reject"); try execute(db, "RELEASE ais_sync_reject")
            throw error
        }
    }

    private static func localSyncProjection(_ db: OpaquePointer?, event: [String: Any], vault: String, remote: String, local: String) throws -> [String: Any] {
        var result = event
        let owned = vault == remote
        let atomeId = stringValue(event["atome_id"])
        result["owner_id"] = owned ? local : vault
        if owned && atomeId == remote { result["atome_id"] = local }
        var payload = event["payload"] as? [String: Any] ?? [:]
        var props = payload["props"] as? [String: Any] ?? [:]
        if owned {
            for key in ["owner", "ownerId", "owner_id", "creator", "creatorId", "creator_id"] where stringValue(props[key]) == remote { props[key] = local }
            for key in ["parent_id", "parentId"] where stringValue(payload[key]) == remote { payload[key] = local }
        }
        let decisions = event["lww_decisions"] as? [String: [String: Any]]
        let target = stringValue(result["atome_id"])
        let timestamps = try query(db, "SELECT particle_key, updated_at FROM particles WHERE atome_id = ?", [.text(target)])
        var byKey = Dictionary(uniqueKeysWithValues: timestamps.map { (stringValue($0["particle_key"]), stringValue($0["updated_at"])) })
        // Removed particles retain their clock in the existing version history.
        for row in try query(db, "SELECT particle_key, MAX(changed_at) AS ts FROM particles_versions WHERE atome_id = ? AND new_value = 'null' GROUP BY particle_key", [.text(target)]) {
            let key = stringValue(row["particle_key"]), time = stringValue(row["ts"])
            if syncTimestamp(time) > syncTimestamp(byKey[key] ?? "") { byKey[key] = time }
        }
        let incomingTime = syncTimestamp(stringValue(event["ts"]))
        func accepts(_ key: String) -> Bool {
            if let decision = decisions?[key], decision["winner"] as? Bool != true { return false }
            return syncTimestamp(byKey[key] ?? "") <= incomingTime
        }
        props = props.filter { accepts($0.key) }
        payload["props"] = props
        payload["delete_keys"] = (payload["delete_keys"] as? [String] ?? []).filter(accepts)
        let kind = stringValue(event["kind"])
        if ["delete", "restore"].contains(kind) {
            let previous = try query(db, "SELECT id, ts FROM events WHERE atome_id IN (?, ?) AND kind IN ('delete', 'restore') AND id != ? AND (json_extract(lww_decisions, '$.__lifecycle__.winner') IS NULL OR json_extract(lww_decisions, '$.__lifecycle__.winner') = 1) ORDER BY ts DESC, id DESC LIMIT 1", [.text(target), .text(atomeId), .text(stringValue(event["id"]))]).first
            let previousTime = syncTimestamp(stringValue(previous?["ts"]))
            let losesLocally = previous != nil && (previousTime > incomingTime || (previousTime == incomingTime && stringValue(previous?["id"]) > stringValue(event["id"])))
            if losesLocally || (decisions?["__lifecycle__"]?["winner"] as? Bool == false) { result["kind"] = "set" }
        }
        result["payload"] = payload
        return result
    }

    private static func syncTimestamp(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value) ?? .distantPast
    }
}
