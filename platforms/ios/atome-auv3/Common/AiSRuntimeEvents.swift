import Foundation
import SQLite3

// Journal and projection share one transaction, including inside remote sync.
extension AiSRuntime {
    static func normalizeEventInput(_ event: [String: Any], defaultActorId: String?) throws -> [String: Any] {
        let kind = normalizedOptionalString(event["kind"] ?? event["event"]) ?? ""
        if kind.isEmpty {
            throw AiSError("Missing event kind")
        }
        let atomeId = normalizedOptionalString(event["atome_id"] ?? event["atomeId"] ?? event["id"])
        if kind != "snapshot" && (atomeId == nil || atomeId == "") {
            throw AiSError("Missing event atome_id")
        }
        var normalized: [String: Any] = [
            "id": normalizedOptionalString(event["id"] ?? event["event_id"] ?? event["eventId"]) ?? UUID().uuidString.lowercased(),
            "ts": normalizedOptionalString(event["ts"] ?? event["timestamp"]) ?? isoNow(),
            "kind": kind
        ]
        if let atomeId { normalized["atome_id"] = atomeId }
        let globalScope = normalizedOptionalString(event["scope"]) == "global"
        if !globalScope, let projectId = normalizedOptionalString(event["project_id"] ?? event["projectId"]) { normalized["project_id"] = projectId }
        if globalScope {
            var payload = (resolveEventPayload(event) as? [String: Any]) ?? [:]
            payload["scope"] = "global"
            normalized["payload"] = payload
        } else if let payload = resolveEventPayload(event) {
            normalized["payload"] = payload
        }
        if let txId = normalizedOptionalString(event["tx_id"] ?? event["txId"]) { normalized["tx_id"] = txId }
        if let gestureId = normalizedOptionalString(event["gesture_id"] ?? event["gestureId"]) { normalized["gesture_id"] = gestureId }
        if let ownerId = normalizedOptionalString(event["owner_id"] ?? event["ownerId"] ?? event["owner"]) { normalized["owner_id"] = ownerId }
        if let actor = event["actor"] {
            normalized["actor"] = actor
        } else if let defaultActorId, !defaultActorId.isEmpty {
            normalized["actor"] = ["type": "user", "id": defaultActorId]
        }
        return normalized
    }

    private static func resolveEventPayload(_ event: [String: Any]) -> Any? {
        if let payload = event["payload"] { return payload }
        if let props = event["props"] as? [String: Any] { return ["props": props] }
        if let props = event["properties"] as? [String: Any] { return ["props": props] }
        if let patch = event["patch"] as? [String: Any] { return ["props": patch] }
        if let delta = event["delta"] as? [String: Any] { return ["props": delta] }
        return nil
    }

    private static func extractEventPatch(kind: String, payload: Any?, ts: String) -> [String: Any]? {
        if kind == "delete" {
            return ["__deleted": true, "deleted_at": ts]
        }
        guard let payloadObj = payload as? [String: Any] else { return nil }
        if let patch = payloadObj["props"] as? [String: Any] { return patch }
        if let patch = payloadObj["properties"] as? [String: Any] { return patch }
        if let patch = payloadObj["patch"] as? [String: Any] { return patch }
        if let patch = payloadObj["delta"] as? [String: Any] { return patch }
        return nil
    }

    private static let eventMetaParticleKeys: Set<String> = [
        "type", "atome_type", "kind",
        "parent_id", "parentId",
        "project_id", "projectId",
        "__deleted", "deleted_at"
    ]

    static func resolveActorId(_ actor: Any?) -> String? {
        guard let actor = actor as? [String: Any] else { return nil }
        return normalizedOptionalString(actor["id"] ?? actor["user_id"] ?? actor["userId"])
    }

    private static func resolveEventType(_ patch: [String: Any]) -> String? {
        normalizedOptionalString(patch["type"] ?? patch["atome_type"] ?? patch["kind"])
    }

    private static func resolveEventParentId(_ patch: [String: Any]) -> String? {
        normalizedOptionalString(patch["parent_id"] ?? patch["parentId"] ?? patch["project_id"] ?? patch["projectId"])
    }

    private static func stripEventMetaPatch(_ patch: [String: Any]) -> [String: Any] {
        var filtered: [String: Any] = [:]
        for (key, value) in patch where !eventMetaParticleKeys.contains(key) {
            filtered[key] = value
        }
        return filtered
    }

    static func appendEvent(_ db: OpaquePointer?, event: [String: Any]) throws {
        let eventId = stringValue(event["id"])
        let existing = try query(db, "SELECT id FROM events WHERE id = ? LIMIT 1", [.text(eventId)])
        if !existing.isEmpty { return }
        try execute(db, "SAVEPOINT ais_event")
        var committed = false
        defer {
            if !committed {
                _ = try? execute(db, "ROLLBACK TO ais_event")
                _ = try? execute(db, "RELEASE ais_event")
            }
        }
        let payloadString = try jsonString(event["payload"] ?? NSNull())
        let actorString = try jsonString(event["actor"] ?? NSNull())
        let actorId = resolveActorId(event["actor"]) ?? "local"
        let scopeId = normalizedOptionalString(event["project_id"] ?? event["atome_id"]) ?? "account"
        let streamId = normalizedOptionalString(event["stream_id"] ?? event["stream"])
            ?? "ais:\(actorId):\(scopeId)"
        let sequence = intValue(event["sequence"], defaultValue: 0) > 0
            ? intValue(event["sequence"], defaultValue: 0)
            : ((try query(db,
                "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM events WHERE stream_id = ? AND sequence IS NOT NULL",
                [.text(streamId)]).first?["next_sequence"] as? Int64) ?? 1)
        try execute(db, """
            INSERT INTO events (
                id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id,
                stream_id, sequence, source, lww_decisions, projection
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
            .text(eventId),
            .text(stringValue(event["ts"])),
            normalizedOptionalString(event["atome_id"]).map(SQLiteBinding.text) ?? .null,
            normalizedOptionalString(event["project_id"]).map(SQLiteBinding.text) ?? .null,
            .text(stringValue(event["kind"])),
            .text(payloadString),
            .text(actorString),
            normalizedOptionalString(event["tx_id"]).map(SQLiteBinding.text) ?? .null,
            normalizedOptionalString(event["gesture_id"]).map(SQLiteBinding.text) ?? .null,
            .text(streamId),
            .int(sequence),
            normalizedOptionalString(event["source"]).map(SQLiteBinding.text) ?? .text("ais"),
            .text(try jsonString(event["lww_decisions"] ?? NSNull())),
            .text(try jsonString(event["projection"] ?? NSNull()))
        ])
        try applyEventToStateCurrent(db, event: event)
        try execute(db, "RELEASE ais_event")
        committed = true
    }

    static func appendEvents(_ db: OpaquePointer?, events: [[String: Any]]) throws {
        for event in events {
            try appendEvent(db, event: event)
        }
    }

    private static func applyEventToStateCurrent(_ db: OpaquePointer?, event: [String: Any]) throws {
        let atomeId = stringValue(event["atome_id"])
        if atomeId.isEmpty { return }
        let ts = normalizedOptionalString(event["ts"]) ?? isoNow()
        let kind = stringValue(event["kind"])
        guard let patch = extractEventPatch(kind: kind, payload: event["payload"], ts: ts) else { return }

        let actorId = resolveActorId(event["actor"])
        let patchOwnerId = normalizedOptionalString(patch["owner_id"] ?? patch["ownerId"] ?? patch["owner"])
        let eventOwnerId = normalizedOptionalString(event["owner_id"] ?? event["ownerId"] ?? event["owner"])
        let patchType = resolveEventType(patch)
        let patchParentId = resolveEventParentId(patch)
        let deleted = boolValue(patch["__deleted"])
        let particlePatch = stripEventMetaPatch(patch)
        let existingMeta = try findAnyAtomeMeta(db, atomeId: atomeId)

        let resolvedOwnerId = firstNonEmptyString([
            eventOwnerId,
            patchOwnerId,
            actorId,
            existingMeta?.ownerId
        ]) ?? atomeId
        try upsertAtomeFromEvent(
            db,
            atomeId: atomeId,
            atomeType: patchType,
            parentId: patchParentId,
            ownerId: resolvedOwnerId,
            creatorId: existingMeta?.creatorId ?? resolvedOwnerId,
            deleted: deleted,
            now: ts
        )

        let changedBy = firstNonEmptyString([actorId, resolvedOwnerId]) ?? atomeId
        for (key, value) in particlePatch {
            try upsertParticle(db, atomeId: atomeId, key: key, value: value, changedBy: changedBy, now: ts)
        }

        let existingState = try loadStateCurrentEntry(db, atomeId: atomeId)
        var nextProps = existingState?.properties ?? [:]
        for (key, value) in patch { nextProps[key] = value }
        if nextProps["type"] == nil, let patchType { nextProps["type"] = patchType }
        if nextProps["type"] == nil, let existingType = existingMeta?.atomeType, !existingType.isEmpty { nextProps["type"] = existingType }
        if let parentId = patchParentId ?? existingMeta?.parentId {
            if nextProps["parent_id"] == nil { nextProps["parent_id"] = parentId }
            if nextProps["parentId"] == nil { nextProps["parentId"] = parentId }
        }
        let payloadObject = event["payload"] as? [String: Any]
        let globalScope = normalizedOptionalString(payloadObject?["scope"]) == "global"
        let projectId = globalScope ? nil : firstNonEmptyString([
            normalizedOptionalString(event["project_id"] ?? event["projectId"]),
            normalizedOptionalString(patch["project_id"] ?? patch["projectId"]),
            existingState?.projectId
        ])
        if let projectId {
            if nextProps["project_id"] == nil { nextProps["project_id"] = projectId }
            if nextProps["projectId"] == nil { nextProps["projectId"] = projectId }
        }
        let stateOwnerId = firstNonEmptyString([
            eventOwnerId,
            patchOwnerId,
            existingState?.ownerId,
            resolvedOwnerId
        ]) ?? resolvedOwnerId
        try upsertStateCurrent(db, atomeId: atomeId, ownerId: stateOwnerId, projectId: projectId, clearProjectId: globalScope, properties: nextProps, now: ts)
    }

    private static func upsertAtomeFromEvent(_ db: OpaquePointer?, atomeId: String, atomeType: String?, parentId: String?, ownerId: String?, creatorId: String?, deleted: Bool, now: String) throws {
        let existing = try findAnyAtomeMeta(db, atomeId: atomeId)
        if existing == nil {
            try execute(db, """
                INSERT INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, deleted_at, created_source, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ais', 'local')
                """, [
                .text(atomeId),
                .text(atomeType ?? "generic"),
                parentId.map(SQLiteBinding.text) ?? .null,
                ownerId.map(SQLiteBinding.text) ?? .null,
                (creatorId ?? ownerId).map(SQLiteBinding.text) ?? .null,
                .text(now),
                .text(now),
                deleted ? .text(now) : .null
            ])
            return
        }

        var updates: [String] = ["updated_at = ?", "deleted_at = ?", "sync_status = 'local'"]
        var bindings: [SQLiteBinding] = [.text(now), deleted ? .text(now) : .null]
        if let atomeType, !atomeType.isEmpty {
            updates.append("atome_type = ?")
            bindings.append(.text(atomeType))
        }
        if let parentId, !parentId.isEmpty {
            updates.append("parent_id = ?")
            bindings.append(.text(parentId))
        }
        if let ownerId, !ownerId.isEmpty {
            updates.append("owner_id = ?")
            bindings.append(.text(ownerId))
        }
        if let creatorId, !creatorId.isEmpty {
            updates.append("creator_id = COALESCE(creator_id, ?)")
            bindings.append(.text(creatorId))
        }
        bindings.append(.text(atomeId))
        try execute(db, "UPDATE atomes SET \(updates.joined(separator: ", ")) WHERE atome_id = ?", bindings)
    }

}
