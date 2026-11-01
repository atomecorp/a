import Foundation
import SQLite3

// Explicit `snapshot` messages (create, list, get, restore) on the one local SQLite base, with the
// message contract and error strings of Fastify (`server/wsAtomeOperations.js#handleSnapshot`,
// `database/adole_state_snapshots.js`) and Axum (`local_atome_extended.rs#handle_snapshot_message`).
// A restore writes `set` events through the WebView commit path (`handleEventCommitBatch`): history
// stays append-only, each event is authorized and passes the type gate, and it is queued for sync.
extension AiSRuntime {
    static func handleSnapshotMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            guard ["create", "list", "get", "restore"].contains(action) else {
                return snapshotResponse(requestId: requestId, success: false, error: "Unknown snapshot action: \(action.isEmpty ? "missing" : action)")
            }
            do {
                let db = try openDatabase()
                guard let claims = try verifyToken(stringValue(message["token"])),
                      let userId = normalizedOptionalString(claims["sub"]) else {
                    return snapshotResponse(requestId: requestId, success: false, error: "Access denied")
                }
                switch action {
                case "create":
                    return try handleSnapshotCreate(message, db: db, requestId: requestId, userId: userId)
                case "list":
                    return try handleSnapshotList(message, db: db, requestId: requestId, userId: userId)
                default:
                    return try handleSnapshotRead(message, db: db, requestId: requestId, userId: userId, restore: action == "restore")
                }
            } catch {
                return snapshotResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    private static func handleSnapshotCreate(_ message: [String: Any], db: OpaquePointer?, requestId: String?, userId: String) throws -> [String: Any] {
        let projectId = normalizedOptionalString(message["project_id"] ?? message["projectId"])
        let atomeId = normalizedOptionalString(message["atome_id"] ?? message["atomeId"])
        guard let targetId = projectId ?? atomeId else {
            return snapshotResponse(requestId: requestId, success: false, error: "Missing project_id or atome_id")
        }
        guard try canWriteSnapshotTarget(db, targetId: targetId, userId: userId) else {
            return snapshotResponse(requestId: requestId, success: false, error: "Access denied")
        }
        // Fastify `createStateSnapshotOnce`: a snapshot asked once (its event id names it; a resend gets the same
        // snapshot), its record, then its `snapshot` event `{ snapshot_id, label }` on its object through the event
        // commit, in one savepoint: a refused event leaves no record.
        let eventId = normalizedOptionalString(message["event_id"] ?? message["eventId"])
        if let eventId, let known = try query(db, "SELECT kind, actor, payload FROM events WHERE id = ? LIMIT 1", [.text(eventId)]).first {
            guard stringValue(known["kind"]) == "snapshot", resolveActorId(rowString(known, "actor").map(parseJSONValue)) == userId else {
                return snapshotResponse(requestId: requestId, success: false, error: "event_id_conflict")
            }
            let payload = rowString(known, "payload").map(parseJSONValue) as? [String: Any]
            return snapshotResponse(requestId: requestId, success: true, fields: ["snapshot_id": payload?["snapshot_id"] ?? NSNull()])
        }
        let label = normalizedOptionalString(message["label"])
        try execute(db, "SAVEPOINT ais_snapshot")
        do {
            let snapshotId = try createStateSnapshot(
                db,
                projectId: projectId,
                atomeId: atomeId,
                label: label,
                actor: ["type": "user", "id": userId],
                state: message["state"] ?? message["state_blob"] ?? message["stateBlob"],
                snapshotType: normalizedOptionalString(message["snapshot_type"] ?? message["snapshotType"]) ?? "manual",
                createdBy: userId
            )
            var event: [String: Any] = ["kind": "snapshot", "atome_id": atomeId ?? targetId,
                                        "payload": ["snapshot_id": snapshotId, "label": label.map { $0 as Any } ?? NSNull()]]
            if let projectId { event["project_id"] = projectId }
            if let eventId { event["id"] = eventId }
            if let ts = normalizedOptionalString(message["ts"]) { event["ts"] = ts }
            let committed = try handleEventCommit(["token": message["token"] ?? "", "event": event], db: db, requestId: requestId)
            guard (committed["success"] as? Bool) == true else {
                try execute(db, "ROLLBACK TO ais_snapshot")
                try execute(db, "RELEASE ais_snapshot")
                return snapshotResponse(requestId: requestId, success: false, error: stringValue(committed["error"]))
            }
            try execute(db, "RELEASE ais_snapshot")
            // `event` lets the WS dispatch drain the outbox, as after an `events` commit.
            return snapshotResponse(requestId: requestId, success: true, fields: ["snapshot_id": snapshotId, "event": committed["event"] ?? NSNull()])
        } catch {
            try execute(db, "ROLLBACK TO ais_snapshot")
            try execute(db, "RELEASE ais_snapshot")
            throw error
        }
    }

    private static func handleSnapshotList(_ message: [String: Any], db: OpaquePointer?, requestId: String?, userId: String) throws -> [String: Any] {
        guard let projectId = normalizedOptionalString(message["project_id"] ?? message["projectId"]) else {
            return snapshotResponse(requestId: requestId, success: false, error: "Missing project_id")
        }
        guard try canReadSnapshotTarget(db, targetId: projectId, userId: userId) else {
            return snapshotResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let rows = try query(db, "SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", [
            .text(projectId),
            .int(intValue(message["limit"], defaultValue: 0) > 0 ? intValue(message["limit"], defaultValue: 0) : 20),
            .int(intValue(message["offset"], defaultValue: 0))
        ])
        return snapshotResponse(requestId: requestId, success: true, fields: ["snapshots": rows.map(snapshotRecord)])
    }

    // A snapshot named with its object must be that object's (Fastify vault rule); read access to
    // its object lets it be read, write access lets it be restored.
    private static func handleSnapshotRead(_ message: [String: Any], db: OpaquePointer?, requestId: String?, userId: String, restore: Bool) throws -> [String: Any] {
        let snapshotId = intValue(message["snapshot_id"] ?? message["snapshotId"] ?? message["id"], defaultValue: 0)
        let named = normalizedOptionalString(message["project_id"] ?? message["projectId"] ?? message["atome_id"] ?? message["atomeId"])
        guard let row = try query(db, "SELECT * FROM snapshots WHERE snapshot_id = ? LIMIT 1", [.int(snapshotId)]).first else {
            return snapshotResponse(requestId: requestId, success: false, error: "Snapshot not found")
        }
        let snapshot = snapshotRecord(row)
        let projectId = normalizedOptionalString(snapshot["project_id"])
        let targetId = projectId ?? stringValue(snapshot["atome_id"])
        if let named, named != projectId, named != stringValue(snapshot["atome_id"]) {
            return snapshotResponse(requestId: requestId, success: false, error: "Snapshot not found")
        }
        let allowed = restore
            ? try canWriteSnapshotTarget(db, targetId: targetId, userId: userId)
            : try canReadSnapshotTarget(db, targetId: targetId, userId: userId)
        guard allowed else { return snapshotResponse(requestId: requestId, success: false, error: "Access denied") }
        if !restore { return snapshotResponse(requestId: requestId, success: true, fields: ["snapshot": snapshot]) }

        let events = snapshotRestoreEvents(snapshot, projectId: projectId, userId: userId)
        for event in events {
            let atomeId = stringValue(event["atome_id"])
            if let record = try findAnyAtomeMeta(db, atomeId: atomeId), !canWrite(record: record, userId: userId) {
                return snapshotResponse(requestId: requestId, success: false, error: "Access denied for \(atomeId)")
            }
        }
        let committed = try handleEventCommitBatch([
            "token": message["token"] ?? "",
            "tx_id": normalizedOptionalString(message["tx_id"] ?? message["txId"]) ?? "snapshot_restore_\(snapshotId)",
            "events": events
        ], db: db, requestId: requestId)
        guard (committed["success"] as? Bool) == true else {
            return snapshotResponse(requestId: requestId, success: false, error: stringValue(committed["error"]))
        }
        return snapshotResponse(requestId: requestId, success: true, fields: ["snapshot_id": snapshotId, "events": committed["events"] ?? []])
    }

    // `buildStateSnapshotRestoreEvents` (database/state_snapshot_restore.js): one `set` of its stored
    // properties per record. A record list is the blob itself or its `records` / `states` /
    // `state_current`; an atome snapshot created here holds its one record.
    private static func snapshotRestoreEvents(_ snapshot: [String: Any], projectId: String?, userId: String) -> [[String: Any]] {
        let records: [Any]
        if let list = snapshot["state_blob"] as? [Any] {
            records = list
        } else if let container = snapshot["state_blob"] as? [String: Any] {
            records = [container["records"], container["states"], container["state_current"]].lazy.compactMap { $0 as? [Any] }.first
                ?? (normalizedOptionalString(container["atome_id"]) == nil ? [] : [container])
        } else {
            records = []
        }
        return records.compactMap { entry -> [String: Any]? in
            guard let record = entry as? [String: Any],
                  let atomeId = normalizedOptionalString(record["atome_id"] ?? record["atomeId"] ?? record["id"]) else { return nil }
            var event: [String: Any] = [
                "kind": "set",
                "atome_id": atomeId,
                "actor": ["type": "user", "id": userId],
                "payload": ["props": record["properties"] as? [String: Any] ?? [:]]
            ]
            if let project = normalizedOptionalString(record["project_id"] ?? record["projectId"]) ?? projectId { event["project_id"] = project }
            return event
        }
    }

    // A stored row with its JSON columns read back, as Fastify `getStateSnapshot` answers it.
    private static func snapshotRecord(_ row: [String: Any]) -> [String: Any] {
        var record = row
        let blob = rowString(row, "state_blob") ?? rowString(row, "snapshot_data")
        record["state_blob"] = blob.map(parseJSONValue) ?? NSNull()
        record["actor"] = rowString(row, "actor").map(parseJSONValue) ?? NSNull()
        return record
    }

    private static func canWriteSnapshotTarget(_ db: OpaquePointer?, targetId: String, userId: String) throws -> Bool {
        guard let record = try findAnyAtomeMeta(db, atomeId: targetId) else { return false }
        return canWrite(record: record, userId: userId)
    }

    private static func canReadSnapshotTarget(_ db: OpaquePointer?, targetId: String, userId: String) throws -> Bool {
        if try canWriteSnapshotTarget(db, targetId: targetId, userId: userId) { return true }
        guard let state = try getStateCurrent(db, atomeId: targetId) else { return false }
        return canReadState(db, state: state, userId: userId)
    }

    private static func createStateSnapshot(_ db: OpaquePointer?, projectId: String?, atomeId: String?, label: String?, actor: [String: Any], state: Any?, snapshotType: String, createdBy: String) throws -> Int64 {
        let snapshotAtomeId = firstNonEmptyString([atomeId, projectId]) ?? ""
        let now = isoNow()
        let actorString = try jsonString(actor)
        let statePayload: Any
        if let state {
            statePayload = state
        } else if let projectId, !projectId.isEmpty {
            statePayload = try listStateCurrent(db, projectId: projectId, ownerId: createdBy, limit: 5000, offset: 0)
        } else if let atomeId, !atomeId.isEmpty {
            statePayload = try getStateCurrent(db, atomeId: atomeId) ?? [:]
        } else {
            statePayload = [:]
        }
        let blob = try jsonString(statePayload)
        try execute(db, """
            INSERT INTO snapshots (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
            .text(snapshotAtomeId),
            projectId.map(SQLiteBinding.text) ?? .null,
            .text(blob),
            .text(blob),
            label.map(SQLiteBinding.text) ?? .null,
            .text(snapshotType),
            .text(actorString),
            .text(createdBy),
            .text(now)
        ])
        // The row just inserted (two snapshots in the same second share their `created_at`).
        return sqlite3_last_insert_rowid(db)
    }

    private static func snapshotResponse(requestId: String?, success: Bool, error: String? = nil, fields: [String: Any] = [:]) -> [String: Any] {
        var response = fields
        response["type"] = "snapshot-response"
        response["success"] = success
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        return response
    }
}
