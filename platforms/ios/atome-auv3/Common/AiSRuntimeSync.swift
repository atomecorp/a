import Foundation
import SQLite3

// SQLite synchronization storage, owned by the canonical AiS database queue. The
// outbox of this device's own events lives in AiSRuntimeOutbox.swift.
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
        try execute(db, "CREATE INDEX IF NOT EXISTS idx_events_source_actor_ts ON events(source, json_extract(actor, '$.id'), ts)")
        try ensureOutboxSchema(db)
    }

    static func verifiedSyncPrincipal(_ db: OpaquePointer?, remote: String, local: String?) throws -> String {
        let rows = try query(db, "SELECT DISTINCT local_principal FROM auth_local_grants WHERE remote_principal = ? AND locked = 0", [.text(remote)])
        guard rows.count == 1, let principal = normalizedOptionalString(rows.first?["local_principal"]),
              local == nil || local == principal else { throw AiSError("sync_identity_binding_unavailable") }
        return principal
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

    // A replay delivers events back to back: a run of them is persisted in one
    // transaction, each envelope in its own savepoint. One transaction per envelope wrote
    // about 200 KB each on the iPad (rollback journal and page rewrites at every COMMIT).
    // A transient storage failure rolls the whole run back and is thrown: no cursor moved,
    // the next connection replays it. An envelope this device cannot project is recorded
    // whole and its sequence passed, so one poisoned event no longer turns every
    // reconnection into the same failing replay.
    static func persistRemoteSyncEnvelopes(_ envelopes: [[String: Any]], principalId: String, localPrincipalId: String? = nil) throws -> [RemoteSyncDelivery] {
        try queue.sync {
            let db = try openDatabase()
            let local = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            try execute(db, "BEGIN IMMEDIATE")
            do {
                let deliveries = try envelopes.map { try persistRemoteSyncEnvelope(db, $0, remote: principalId, local: local) }
                try execute(db, "COMMIT")
                return deliveries
            } catch {
                // An interrupt, I/O error or full disk may already have rolled it back.
                if sqlite3_get_autocommit(db) == 0 { try execute(db, "ROLLBACK") }
                throw error
            }
        }
    }

    private static func persistRemoteSyncEnvelope(_ db: OpaquePointer?, _ envelope: [String: Any], remote principalId: String, local: String) throws -> RemoteSyncDelivery {
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
        try execute(db, "SAVEPOINT ais_sync_envelope")
        let applied: Bool
        do {
            applied = try applyRemoteSyncEvent(db, event: event, vault: vault, remote: principalId, local: local)
        } catch {
            // SQLite ended the run's transaction itself: nothing of the run remains to keep.
            guard sqlite3_get_autocommit(db) == 0 else { throw error }
            try execute(db, "ROLLBACK TO ais_sync_envelope")
            try execute(db, "RELEASE ais_sync_envelope")
            // The code of the failing statement: the connection's was reset by the rollbacks.
            if let code = (error as? AiSError)?.sqliteCode, transientSQLiteCodes.contains(code) { throw error }
            return try reject(error.localizedDescription)
        }
        try execute(db, "RELEASE ais_sync_envelope")
        return applied ? .applied : .unchanged
    }

    // Runs inside the caller's savepoint. A duplicate already projected at this cursor is
    // unchanged. Behind the cursor (a replay echoing this device's own commits back) it is
    // projected again only to repair a legacy projection or where it changes the state.
    private static func applyRemoteSyncEvent(_ db: OpaquePointer?, event: [String: Any], vault: String, remote: String, local: String) throws -> Bool {
        let eventId = stringValue(event["id"]), streamId = stringValue(event["stream_id"])
        let sequence = intValue(event["sequence"], defaultValue: 0)
        let duplicate = !(try query(db, "SELECT id FROM events WHERE id = ? LIMIT 1", [.text(eventId)])).isEmpty
        let checkpoint = try query(db, "SELECT last_sequence, projection_version FROM remote_sync_stream_cursors WHERE principal_id = ? AND stream_id = ?", [.text(remote), .text(streamId)]).first
        let legacy = checkpoint.map { intValue($0["projection_version"], defaultValue: 1) == 0 } ?? false
        if duplicate && !legacy && intValue(checkpoint?["last_sequence"], defaultValue: 0) >= sequence {
            return false
        }
        let projected = try localSyncProjection(db, event: event, vault: vault, remote: remote, local: local)
        let changed = try !duplicate || legacy || changesProjection(db, projected)
        let winners = duplicate ? try lostKeyWinners(db, event: event, vault: vault, remote: remote, local: local)
            .filter { try changesProjection(db, $0) } : []
        if !duplicate { try appendEvent(db, event: event, projectionEvent: projected) }
        else if changed { try applyEventToStateCurrent(db, event: projected) }
        for winner in winners { try applyEventToStateCurrent(db, event: winner) }
        try advanceRemoteSyncCursor(db, principalId: remote, streamId: streamId, sequence: sequence)
        return changed || !winners.isEmpty
    }

    // An own commit with an older clock than a winner already applied here overwrites it
    // locally. The server rules that its echo lost those keys (offline LWW), and the echo's
    // projection only leaves them out: the losing value stayed until another edit. For each
    // lost key this commit still holds, the winner it was compared with, held in the log since
    // it was applied before, is projected again for that key only, localized and at its own
    // clock. A key written since by another event is left to that event.
    private static func lostKeyWinners(_ db: OpaquePointer?, event: [String: Any], vault: String, remote: String, local: String) throws -> [[String: Any]] {
        guard let decisions = event["lww_decisions"] as? [String: [String: Any]] else { return [] }
        let own = localizedSyncEvent(event, vault: vault, remote: remote, local: local)
        let target = stringValue(own["atome_id"]), clock = syncTimestamp(stringValue(own["ts"]))
        let payload = own["payload"] as? [String: Any] ?? [:]
        let props = payload["props"] as? [String: Any] ?? [:], deletes = payload["delete_keys"] as? [String] ?? []
        func holds(_ key: String) throws -> Bool {
            if key == "__lifecycle__" {
                guard let atome = try query(db, "SELECT deleted_at FROM atomes WHERE atome_id = ?", [.text(target)]).first else { return false }
                let deletedAt = normalizedOptionalString(atome["deleted_at"])
                switch stringValue(own["kind"]) {
                case "delete": return deletedAt.map { syncTimestamp($0) == clock } ?? false
                case "restore": return deletedAt == nil
                default: return false
                }
            }
            let particle = try query(db, "SELECT particle_value, updated_at FROM particles WHERE atome_id = ? AND particle_key = ?", [.text(target), .text(key)]).first
            if let value = props[key] {
                guard let particle else { return false }
                return try stringValue(particle["particle_value"]) == jsonString(value) && syncTimestamp(stringValue(particle["updated_at"])) == clock
            }
            guard deletes.contains(key), particle == nil else { return false }
            let removed = try query(db, "SELECT MAX(changed_at) AS ts FROM particles_versions WHERE atome_id = ? AND particle_key = ? AND new_value = 'null'", [.text(target), .text(key)]).first
            return syncTimestamp(stringValue(removed?["ts"])) == clock
        }
        var keysByWinner: [String: Set<String>] = [:]
        for (key, decision) in decisions where decision["winner"] as? Bool == false {
            guard let winner = normalizedOptionalString(decision["compared_event_id"]), try holds(key) else { continue }
            keysByWinner[winner, default: []].insert(key)
        }
        return try keysByWinner.keys.sorted().compactMap { winnerId in
            guard var held = try query(db, "SELECT id, ts, atome_id, project_id, kind, payload, actor, lww_decisions FROM events WHERE id = ?", [.text(winnerId)]).first else { return nil }
            for column in ["payload", "actor", "lww_decisions"] { held[column] = parseJSONValue(stringValue(held[column])) }
            let keys = keysByWinner[winnerId] ?? []
            var winner = try localSyncProjection(db, event: held, vault: vault, remote: remote, local: local)
            let projected = winner["payload"] as? [String: Any] ?? [:]
            var restricted: [String: Any] = ["props": (projected["props"] as? [String: Any] ?? [:]).filter { keys.contains($0.key) },
                                             "delete_keys": (projected["delete_keys"] as? [String] ?? []).filter(keys.contains)]
            if let scope = projected["scope"] { restricted["scope"] = scope }
            let lifecycle = keys.contains("__lifecycle__") && ["delete", "restore"].contains(stringValue(winner["kind"]))
            if !lifecycle {
                guard !(restricted["props"] as? [String: Any] ?? [:]).isEmpty || !(restricted["delete_keys"] as? [String] ?? []).isEmpty else { return nil }
                winner["kind"] = "set"
            }
            winner["payload"] = restricted
            return winner
        }
    }

    // Whether projecting a held event again changes anything. Its LWW-filtered projection
    // keeps only the keys this event still wins (server decisions, then local clocks); when
    // the state holds all of them, with its owner and scope, rewriting state_current, atomes
    // and particles changes nothing (1 404 of 1 524 envelopes of an iPad launch replay).
    // It changes the state when an equal-clock event applied after it took a key it wins,
    // or when it was never projected here. Same classifier as a local commit, plus the
    // vault owner and global scope that only a delivery carries.
    private static func changesProjection(_ db: OpaquePointer?, _ projected: [String: Any]) throws -> Bool {
        guard try withoutUnchangedProperties(db, event: projected) == nil else { return true }
        guard let stored = try query(db, """
            SELECT a.owner_id AS atome_owner, s.owner_id AS state_owner, s.project_id
            FROM atomes a JOIN state_current s ON s.atome_id = a.atome_id WHERE a.atome_id = ?
            """, [.text(stringValue(projected["atome_id"]))]).first else { return true }
        let owner = normalizedOptionalString(projected["owner_id"])
        let global = normalizedOptionalString((projected["payload"] as? [String: Any])?["scope"]) == "global"
        return normalizedOptionalString(stored["atome_owner"]) != owner || normalizedOptionalString(stored["state_owner"]) != owner
            || (global && normalizedOptionalString(stored["project_id"]) != nil)
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

    // The event as this device holds it: the account's own vault is the local principal.
    private static func localizedSyncEvent(_ event: [String: Any], vault: String, remote: String, local: String) -> [String: Any] {
        var result = event
        let owned = vault == remote
        result["owner_id"] = owned ? local : vault
        if owned && stringValue(event["atome_id"]) == remote { result["atome_id"] = local }
        var payload = event["payload"] as? [String: Any] ?? [:]
        var props = payload["props"] as? [String: Any] ?? [:]
        if owned {
            for key in ["owner", "ownerId", "owner_id", "creator", "creatorId", "creator_id"] where stringValue(props[key]) == remote { props[key] = local }
            for key in ["parent_id", "parentId"] where stringValue(payload[key]) == remote { payload[key] = local }
        }
        payload["props"] = props
        // A precondition of the original commit, never projected.
        payload.removeValue(forKey: "expected_versions")
        result["payload"] = payload
        return result
    }

    private static func localSyncProjection(_ db: OpaquePointer?, event: [String: Any], vault: String, remote: String, local: String) throws -> [String: Any] {
        var result = localizedSyncEvent(event, vault: vault, remote: remote, local: local)
        let atomeId = stringValue(event["atome_id"])
        var payload = result["payload"] as? [String: Any] ?? [:]
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
        payload["props"] = (payload["props"] as? [String: Any] ?? [:]).filter { accepts($0.key) }
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
