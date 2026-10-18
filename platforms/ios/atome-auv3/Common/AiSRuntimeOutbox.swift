import Foundation
import SQLite3

// The durable outbox (`sync_queue`) of this device's events for Fastify, owned by the AiS
// database queue. A row outlives its delivery: it is the ledger the legacy repair reads.
// States: `pending`/`failed` (due), `syncing`, `synced` (acknowledged), `rejected` (refused
// for good, still counted as undelivered) and `unchanged` (a `set` that changes nothing:
// it stays in the history and has nothing to deliver).
extension AiSRuntime {
    // One account's undelivered rows. These terms repeat the WHERE of
    // `idx_sync_queue_undelivered`, which serves every outbox read: decoding the JSON of the
    // whole ledger (540 000 rows on one iPhone) cost about a second per read.
    static let undeliveredOutboxScope = "target_server = 'fastify' AND status NOT IN ('synced', 'unchanged') AND json_extract(payload, '$.actor.id') = ?"

    // A `set` whose patch kept nothing but the Atome's own type, with no deletion, version
    // check or move, while the event before it in the local history is a `create`/`set` of
    // the same type: replaying it changes no state. The import bookkeeping produced 277 000
    // such events in three days; the server needs none of them.
    private static let unchangedSetCondition = """
        json_extract(sync_queue.payload, '$.kind') = 'set'
        AND json_type(sync_queue.payload, '$.payload.props') = 'object'
        AND NOT EXISTS (SELECT 1 FROM json_each(sync_queue.payload, '$.payload.props') WHERE key != 'type')
        AND NOT EXISTS (SELECT 1 FROM json_each(sync_queue.payload, '$.payload') WHERE key NOT IN ('props', 'scope', 'delete_keys', 'expected_versions'))
        AND NOT EXISTS (SELECT 1 FROM json_each(sync_queue.payload, '$.payload.delete_keys'))
        AND NOT EXISTS (SELECT 1 FROM json_each(sync_queue.payload, '$.payload.expected_versions'))
        AND NOT EXISTS (SELECT 1 FROM json_each(sync_queue.payload) WHERE key IN ('parent_id', 'parentId', 'project_id', 'projectId', 'owner', 'owner_id', 'ownerId'))
        AND (SELECT previous.kind IN ('create', 'set') AND json_extract(previous.payload, '$.props.type')
                    = COALESCE(json_extract(sync_queue.payload, '$.payload.props.type'), json_extract(previous.payload, '$.props.type'))
             FROM events current JOIN events previous ON previous.atome_id = current.atome_id AND previous.rowid < current.rowid
             WHERE current.id = sync_queue.event_id ORDER BY previous.rowid DESC LIMIT 1) = 1
        """

    // Rows queued before local commits stopped creating such events (`appendEvent`), and
    // events from before the outbox existed, are walked once per connection in bounded
    // chunks so no outbox read holds the database queue for long. Queue-confined, per local account.
    private struct OutboxPass { var position: (String, Int64) = ("", 0); var done = false }
    private static var unchangedBacklogPasses: [String: OutboxPass] = [:]
    private static var legacyRepairPasses: [String: OutboxPass] = [:]
    private static let outboxPassChunk = 2000

    static func ensureOutboxSchema(_ db: OpaquePointer?) throws {
        let columns = Set(try query(db, "PRAGMA table_info(sync_queue)").compactMap { $0["name"] as? String })
        for column in ["event_id", "next_retry_at", "last_error"] where !columns.contains(column) {
            try execute(db, "ALTER TABLE sync_queue ADD COLUMN \(column) TEXT")
        }
        try execute(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_event_target ON sync_queue(event_id, target_server) WHERE event_id IS NOT NULL")
        try execute(db, """
            CREATE INDEX IF NOT EXISTS idx_sync_queue_undelivered
            ON sync_queue(json_extract(payload, '$.actor.id'), created_at, queue_id)
            WHERE target_server = 'fastify' AND status NOT IN ('synced', 'unchanged')
            """)
    }

    static func undeliveredOutboxCount(_ db: OpaquePointer?, localPrincipalId: String) throws -> Int {
        let rows = try query(db, "SELECT COUNT(*) AS count FROM sync_queue WHERE \(undeliveredOutboxScope)", [.text(localPrincipalId)])
        return Int(intValue(rows.first?["count"], defaultValue: 0))
    }

    static func remoteSyncPendingCount(localPrincipalId: String) throws -> Int {
        try queue.sync { try undeliveredOutboxCount(try openDatabase(), localPrincipalId: localPrincipalId) }
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

    static func prepareRemoteSync(principalId: String, localPrincipalId: String) throws {
        try queue.sync {
            let db = try openDatabase()
            _ = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            try execute(db, "UPDATE sync_queue SET status = 'pending' WHERE target_server = 'fastify' AND status = 'syncing' AND json_extract(payload, '$.actor.id') = ?", [.text(localPrincipalId)])
            // Each connection walks the history again, one chunk per outbox read.
            legacyRepairPasses[localPrincipalId] = nil
            unchangedBacklogPasses[localPrincipalId] = nil
        }
    }

    // One chunk of the repair of the old send-once path, which never replaces history with a
    // snapshot: local events with no outbox row are queued; Fastify deduplicates the ones it
    // already accepted by id. The walk used to cover the whole event log at every outbox read.
    private static func repairLegacyOutbox(_ db: OpaquePointer?, localPrincipalId: String) throws {
        var pass = legacyRepairPasses[localPrincipalId] ?? OutboxPass()
        guard !pass.done else { return }
        let chunk = try query(db, """
            SELECT e.rowid AS position, e.ts, e.id, q.queue_id IS NULL AS unqueued
            FROM events e LEFT JOIN sync_queue q ON q.event_id = e.id AND q.target_server = 'fastify'
            WHERE e.source = 'ais' AND json_extract(e.actor, '$.id') = ? AND (e.ts, e.rowid) > (?, ?)
            ORDER BY e.ts, e.rowid LIMIT ?
            """, [.text(localPrincipalId), .text(pass.position.0), .int(pass.position.1), .int(Int64(outboxPassChunk))])
        for missing in chunk where intValue(missing["unqueued"], defaultValue: 0) == 1 {
            guard var event = try query(db, """
                SELECT id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id FROM events WHERE id = ?
                """, [.text(stringValue(missing["id"]))]).first else { continue }
            event["payload"] = parseJSONValue(stringValue(event["payload"]))
            event["actor"] = parseJSONValue(stringValue(event["actor"]))
            try enqueueSyncEvent(db, event: event)
        }
        if let last = chunk.last { pass.position = (stringValue(last["ts"]), intValue(last["position"], defaultValue: 0)) }
        pass.done = chunk.count < outboxPassChunk
        legacyRepairPasses[localPrincipalId] = pass
    }

    // One chunk of the classification of rows queued before `enqueueSyncEvent` applied
    // `unchangedSetCondition`. Returns true while rows remain to classify.
    private static func classifyUnchangedBacklog(_ db: OpaquePointer?, localPrincipalId: String) throws -> Bool {
        var pass = unchangedBacklogPasses[localPrincipalId] ?? OutboxPass()
        guard !pass.done else { return false }
        let chunkSQL = """
            FROM sync_queue WHERE \(undeliveredOutboxScope) AND status IN ('pending', 'failed')
            AND (created_at, queue_id) > (?, ?) ORDER BY created_at, queue_id LIMIT ?
            """
        let bindings: [SQLiteBinding] = [.text(localPrincipalId), .text(pass.position.0), .int(pass.position.1), .int(Int64(outboxPassChunk))]
        let chunk = try query(db, "SELECT queue_id, created_at \(chunkSQL)", bindings)
        if let last = chunk.last {
            try execute(db, "UPDATE sync_queue SET status = 'unchanged' WHERE queue_id IN (SELECT queue_id \(chunkSQL)) AND \(unchangedSetCondition)", bindings)
            pass.position = (stringValue(last["created_at"]), intValue(last["queue_id"], defaultValue: 0))
        }
        pass.done = chunk.count < outboxPassChunk
        unchangedBacklogPasses[localPrincipalId] = pass
        return !pass.done
    }

    // Due rows only, as Tauri's worker: a row waiting for its retry never holds back the
    // rows behind it. Fastify reconciles out-of-order offline events (`offline-lww`).
    // `classifying`: older rows are still being classified, more may become due right away.
    static func pendingRemoteSync(principalId: String, localPrincipalId: String, limit: Int = 50) throws -> (rows: [[String: Any]], classifying: Bool) {
        try queue.sync {
            let db = try openDatabase()
            _ = try verifiedSyncPrincipal(db, remote: principalId, local: localPrincipalId)
            try repairLegacyOutbox(db, localPrincipalId: localPrincipalId)
            let classifying = try classifyUnchangedBacklog(db, localPrincipalId: localPrincipalId)
            let rows = try query(db, """
                SELECT queue_id, event_id, payload, attempts FROM sync_queue
                WHERE \(undeliveredOutboxScope) AND status != 'rejected'
                  AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday('now'))
                ORDER BY created_at, queue_id LIMIT ?
                """, [.text(localPrincipalId), .int(Int64(max(1, limit)))])
            var batch: [[String: Any]] = [], bytes = 0
            for row in rows {
                let size = stringValue(row["payload"]).utf8.count
                if !batch.isEmpty && bytes + size > 1_000_000 { break }
                batch.append(row); bytes += size
            }
            return (batch, classifying)
        }
    }

    /// Outbox events of these Atomes the server has not acknowledged yet, with the last
    /// delivery error among them.
    static func undeliveredRemoteSync(localPrincipalId: String, atomeIds: [String]) throws -> (count: Int, lastError: String?) {
        let ids = atomeIds.filter { !$0.isEmpty }
        guard !ids.isEmpty else { return (0, nil) }
        return try queue.sync { () throws -> (count: Int, lastError: String?) in
            let db = try openDatabase()
            let marks = Array(repeating: "?", count: ids.count).joined(separator: ",")
            let rows = try query(db, """
                SELECT COUNT(*) AS owed, MAX(last_error) AS last_error FROM sync_queue
                WHERE \(undeliveredOutboxScope) AND atome_id IN (\(marks))
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
}
