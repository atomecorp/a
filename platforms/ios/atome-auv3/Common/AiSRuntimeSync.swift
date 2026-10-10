import Foundation
import SQLite3

// SQLite synchronization storage, owned by the canonical AiS database queue.
extension AiSRuntime {
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
                PRIMARY KEY (principal_id, stream_id))
            """)
        let cursors = Set(try query(db, "PRAGMA table_info(remote_sync_stream_cursors)").compactMap { $0["name"] as? String })
        if !cursors.contains("projection_version") {
            // Re-deliver legacy envelopes whose owner metadata was not projected.
            // The immutable event log is retained; only the derived projection is repaired.
            try execute(db, "ALTER TABLE remote_sync_stream_cursors ADD COLUMN projection_version INTEGER NOT NULL DEFAULT 0")
        }
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

    static func pendingRemoteSync(principalId: String, localPrincipalId: String) throws -> [[String: Any]] {
        try queue.sync {
            let db = try openDatabase()
            _ = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            try enqueueLegacySyncEvents(db, localPrincipalId: localPrincipalId)
            let rows = try query(db, """
                SELECT queue_id, event_id, payload, attempts, next_retry_at FROM sync_queue
                WHERE target_server = 'fastify' AND status != 'synced' AND json_extract(payload, '$.actor.id') = ?
                ORDER BY created_at, queue_id LIMIT 50
                """, [.text(localPrincipalId)])
            var batch: [[String: Any]] = [], bytes = 0
            for row in rows {
                if let retry = normalizedOptionalString(row["next_retry_at"]), retry > isoNow() { break }
                let size = stringValue(row["payload"]).utf8.count
                if !batch.isEmpty && bytes + size > 1_000_000 { break }
                batch.append(row); bytes += size
            }
            return batch
        }
    }

    static func finishRemoteSync(_ rows: [[String: Any]], localPrincipalId: String, error: String? = nil) throws {
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
                        """, [.text(error == nil ? "synced" : "failed"), .int(attempts), error == nil ? .null : .text(retry),
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
                INSERT INTO remote_sync_stream_cursors (principal_id, stream_id, last_sequence, updated_at)
                VALUES (?, ?, 0, ?) ON CONFLICT(principal_id, stream_id) DO NOTHING
                """, [.text(principalId), .text(streamId), .text(isoNow())])
        }
    }

    static func remoteSyncCursors(principalId: String) -> [(String, Int64)] {
        (try? queue.sync {
            let db = try openDatabase()
            return try query(db, "SELECT stream_id, CASE WHEN projection_version = 0 THEN 0 ELSE last_sequence END AS cursor FROM remote_sync_stream_cursors WHERE principal_id = ? ORDER BY stream_id", [.text(principalId)]).compactMap { row in
                guard let stream = row["stream_id"] as? String else { return nil }
                return (stream, intValue(row["cursor"], defaultValue: 0))
            }
        }) ?? []
    }

    static func completeRemoteReplay(principalId: String, streamId: String) throws {
        try queue.sync {
            let db = try openDatabase()
            try execute(db, "UPDATE remote_sync_stream_cursors SET projection_version = 1 WHERE principal_id = ? AND stream_id = ?", [.text(principalId), .text(streamId)])
        }
    }

    static func persistRemoteSyncEnvelope(_ envelope: [String: Any], principalId: String, localPrincipalId: String? = nil) throws -> Bool {
        try queue.sync {
            let db = try openDatabase()
            let local = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            let eventId = stringValue(envelope["event_id"] ?? envelope["id"]), streamId = stringValue(envelope["stream"] ?? envelope["stream_id"])
            let sequence = intValue(envelope["sequence"], defaultValue: 0)
            guard !eventId.isEmpty, !streamId.isEmpty, sequence > 0 else { throw AiSError("sync_envelope_invalid") }
            if streamId == "directory.public", stringValue(envelope["kind"]) == "directory.invalidate" {
                try execute(db, """
                    INSERT INTO remote_sync_stream_cursors (principal_id, stream_id, last_sequence, updated_at)
                    VALUES (?, ?, ?, ?) ON CONFLICT(principal_id, stream_id) DO UPDATE SET
                    last_sequence = MAX(remote_sync_stream_cursors.last_sequence, excluded.last_sequence), updated_at = excluded.updated_at
                    """, [.text(principalId), .text(streamId), .int(sequence), .text(isoNow())])
                return true
            }
            guard let vault = normalizedOptionalString(envelope["vault_principal_id"]) else { throw AiSError("sync_vault_owner_missing") }
            var event: [String: Any] = ["id":eventId, "ts":stringValue(envelope["timestamp"] ?? envelope["ts"]),
                "kind":stringValue(envelope["kind"]), "payload":envelope["patch"] ?? [:],
                "actor":["type":"user", "id":principalId], "stream_id":streamId, "sequence":sequence,
                "source":envelope["source"] ?? NSNull(), "lww_decisions":envelope["lww_decisions"] ?? NSNull(),
                "projection":envelope["projection"] ?? NSNull()]
            for key in ["atome_id", "project_id", "tx_id", "gesture_id"] { if let value = envelope[key] { event[key] = value } }
            try execute(db, "BEGIN IMMEDIATE")
            do {
                let duplicate = !(try query(db, "SELECT id FROM events WHERE id = ? LIMIT 1", [.text(eventId)])).isEmpty
                let projected = try localSyncProjection(db, event: event, vault: vault, remote: principalId, local: local)
                if duplicate { try applyEventToStateCurrent(db, event: projected) }
                else { try appendEvent(db, event: event, projectionEvent: projected) }
                try execute(db, """
                    INSERT INTO remote_sync_stream_cursors (principal_id, stream_id, last_sequence, updated_at)
                    VALUES (?, ?, ?, ?) ON CONFLICT(principal_id, stream_id) DO UPDATE SET
                    last_sequence = MAX(remote_sync_stream_cursors.last_sequence, excluded.last_sequence), updated_at = excluded.updated_at
                    """, [.text(principalId), .text(streamId), .int(sequence), .text(isoNow())])
                try execute(db, "COMMIT")
                // A duplicate may repair a legacy projection or reconcile our own committed event.
                return true
            } catch {
                try execute(db, "ROLLBACK"); throw error
            }
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
