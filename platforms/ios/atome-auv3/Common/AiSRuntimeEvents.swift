import Foundation
import SQLite3

// Journal and projection share one transaction, including inside remote sync.
extension AiSRuntime {
    private static func eventPatchObject(_ event: [String: Any]) -> [String: Any]? {
        let payload = event["payload"] as? [String: Any]
        return (event["props"] ?? event["properties"] ?? payload?["props"] ?? payload?["properties"]) as? [String: Any]
    }

    // Autorise un evenement emis par le WebView pour le compte du jeton, avec le meme contrat
    // qu'Axum (`authorize_event`) : ecrire un atome existant exige d'en etre proprietaire ou
    // createur et ne change jamais son proprietaire ; creer exige que le proprietaire demande
    // soit le compte lui-meme et que le parent (ou projet) existant lui appartienne. L'acteur
    // est toujours celui du jeton. Tous les comptes de l'appareil partagent une seule base.
    private static func authorizedWebViewEvent(_ raw: [String: Any], db: OpaquePointer?, actorId: String, createdInBatch: Set<String> = []) throws -> [String: Any] {
        let atomeId = stringValue(raw["atome_id"] ?? raw["atomeId"])
        let patch = eventPatchObject(raw)
        let requestedOwner = normalizedOptionalString(raw["owner_id"] ?? raw["ownerId"] ?? raw["owner"]
            ?? patch?["owner_id"] ?? patch?["ownerId"] ?? patch?["owner"])
        if !atomeId.isEmpty, let record = try findAnyAtomeMeta(db, atomeId: atomeId) {
            guard canWrite(record: record, userId: actorId) else { throw AiSError("Access denied") }
            // Seule exception : un atome herite sans proprietaire, cree par ce compte, peut etre revendique.
            if let requestedOwner, requestedOwner != record.ownerId, !(record.ownerId.isEmpty && requestedOwner == actorId) {
                throw AiSError("owner_change_denied")
            }
        } else {
            if let requestedOwner, requestedOwner != actorId { throw AiSError("create_owner_mismatch") }
            let payload = raw["payload"] as? [String: Any]
            let parentId = normalizedOptionalString(raw["parent_id"] ?? raw["parentId"] ?? payload?["parent_id"] ?? payload?["parentId"]
                ?? patch?["parent_id"] ?? patch?["parentId"] ?? raw["project_id"] ?? raw["projectId"])
            if let parentId, parentId != atomeId, !createdInBatch.contains(parentId),
               let parent = try findAnyAtomeMeta(db, atomeId: parentId),
               !canWrite(record: parent, userId: actorId) {
                throw AiSError("parent_create_denied")
            }
        }
        var event = raw
        event["actor"] = ["type": "user", "id": actorId]
        return event
    }


    private static func resolveEventUserId(_ message: [String: Any]) -> String? {
        let token = stringValue(message["token"])
        if !token.isEmpty, let claims = try? verifyToken(token) {
            let sub = normalizedOptionalString(claims["sub"])
            if let sub, !sub.isEmpty { return sub }
        }
        return nil
    }

    static func handleEventCommit(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        guard let actorId = resolveEventUserId(message) else {
            return eventsResponse(requestId: requestId, success: false, error: "Access denied")
        }
        guard let rawEvent = message["event"] as? [String: Any] else {
            return eventsResponse(requestId: requestId, success: false, error: "Invalid event payload")
        }
        let authorized: [String: Any]
        do { authorized = try authorizedWebViewEvent(rawEvent, db: db, actorId: actorId) }
        catch { return eventsResponse(requestId: requestId, success: false, error: error.localizedDescription) }
        let event = try normalizeEventInput(authorized, defaultActorId: actorId)
        try appendEvent(db, event: event, enqueueRemote: true)
        return eventsResponse(requestId: requestId, success: true, event: event)
    }

    static func handleEventCommitBatch(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        guard let defaultActorId = resolveEventUserId(message) else {
            return eventsResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let txId = stringValue(message["tx_id"] ?? message["txId"])
        guard let rawEvents = message["events"] as? [[String: Any]] else {
            return eventsResponse(requestId: requestId, success: false, error: "Missing events array")
        }
        // Un parent cree plus tot dans le meme lot est autorise (contrat Axum `batch_create_ids`).
        var createdInBatch = Set<String>()
        let events: [[String: Any]]
        do {
            events = try rawEvents.map { raw -> [String: Any] in
                var event = try authorizedWebViewEvent(raw, db: db, actorId: defaultActorId, createdInBatch: createdInBatch)
                let atomeId = stringValue(raw["atome_id"] ?? raw["atomeId"])
                if !atomeId.isEmpty, try findAnyAtomeMeta(db, atomeId: atomeId) == nil { createdInBatch.insert(atomeId) }
                if !txId.isEmpty, event["tx_id"] == nil, event["txId"] == nil {
                    event["tx_id"] = txId
                }
                return try normalizeEventInput(event, defaultActorId: defaultActorId)
            }
        } catch {
            return eventsResponse(requestId: requestId, success: false, error: error.localizedDescription)
        }
        try appendEvents(db, events: events, enqueueRemote: true)
        return eventsResponse(requestId: requestId, success: true, events: events)
    }


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
        var payload = (resolveEventPayload(event) as? [String: Any]) ?? [:]
        if let parentId = normalizedOptionalString(event["parent_id"] ?? event["parentId"]) {
            // Membership is event-envelope metadata. Keep it beside `props` in
            // the persisted payload so batch normalization cannot discard it.
            payload["parent_id"] = parentId
            normalized["parent_id"] = parentId
        }
        if globalScope {
            payload["scope"] = "global"
            normalized["payload"] = payload
        } else if !payload.isEmpty {
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
        if kind == "restore" { return ["__deleted": false, "deleted_at": NSNull()] }
        guard let payloadObj = payload as? [String: Any] else { return nil }
        if let patch = payloadObj["props"] as? [String: Any] { return patch }
        if let patch = payloadObj["properties"] as? [String: Any] { return patch }
        if let patch = payloadObj["patch"] as? [String: Any] { return patch }
        if let patch = payloadObj["delta"] as? [String: Any] { return patch }
        if payloadObj["delete_keys"] is [String] { return [:] }
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

    static func appendEvent(_ db: OpaquePointer?, event incoming: [String: Any], enqueueRemote: Bool = false, projectionEvent: [String: Any]? = nil) throws {
        let eventId = stringValue(incoming["id"])
        let existing = try query(db, "SELECT id FROM events WHERE id = ? LIMIT 1", [.text(eventId)])
        if !existing.isEmpty { return }
        // Remote history must retain the server's exact intent; localization is projection-only.
        guard let event = enqueueRemote ? try withoutUnchangedProperties(db, event: incoming) : incoming else { return }
        try execute(db, "SAVEPOINT ais_event")
        var committed = false
        defer {
            if !committed {
                _ = try? execute(db, "ROLLBACK TO ais_event")
                _ = try? execute(db, "RELEASE ais_event")
            }
        }
        if enqueueRemote, let payload = incoming["payload"] as? [String: Any], let expected = payload["expected_versions"] as? [String: Any] {
            let atomeId = stringValue(incoming["atome_id"])
            for (key, value) in expected {
                let current = try query(db, "SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?",
                    [.text(atomeId), .text(key)]).first?["version"] as? Int64 ?? 0
                guard let version = value as? NSNumber, version.doubleValue == Double(current) else {
                    throw AiSError("property_version_conflict")
                }
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
        try applyEventToStateCurrent(db, event: projectionEvent ?? event)
        if enqueueRemote { try enqueueSyncEvent(db, event: event) }
        try execute(db, "RELEASE ais_event")
        committed = true
    }

    // A property rewritten identically is not a change (Fastify `adole_event_mutation`):
    // a profile save used to re-emit its unchanged photo in every event. Dropping
    // such keys is neutral for replay, conflicts and the projected state. Identity keys
    // equal to the stored identity are no change either. A `set` of an existing Atome
    // left with nothing to change returns nil: it is not an event, since it would be
    // queued, delivered and replayed by every device of the account for nothing (whole
    // records rewritten by imports and registries, profile saves at session renewals).
    // A delivered echo of an event this device already holds is classified the same way.
    static func withoutUnchangedProperties(_ db: OpaquePointer?, event: [String: Any]) throws -> [String: Any]? {
        guard stringValue(event["kind"]) == "set", let atomeId = normalizedOptionalString(event["atome_id"]),
              var payload = event["payload"] as? [String: Any],
              let patchKey = ["props", "properties", "patch", "delta"].first(where: { payload[$0] is [String: Any] }),
              let patch = payload[patchKey] as? [String: Any],
              let identity = try query(db, "SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?", [.text(atomeId)]).first
        else { return event }
        let stored = try query(db, "SELECT particle_key, particle_value FROM particles WHERE atome_id = ?", [.text(atomeId)])
        var storedByKey: [String: String] = [:]
        for row in stored {
            if let key = row["particle_key"] as? String, let value = row["particle_value"] as? String { storedByKey[key] = value }
        }
        let projected = try query(db, "SELECT json_extract(properties, '$.kind') AS kind, project_id FROM state_current WHERE atome_id = ?",
                                  [.text(atomeId)]).first
        let projectedKind = projected?["kind"] as? String
        func unchanged(_ key: String, _ value: Any) throws -> Bool {
            switch key {
            case "type", "atome_type": return normalizedOptionalString(value) == normalizedOptionalString(identity["atome_type"])
            case "kind": return projectedKind != nil && normalizedOptionalString(value) == projectedKind
            case "parent_id", "parentId": return normalizedOptionalString(value) == normalizedOptionalString(identity["parent_id"])
            default: return try !eventMetaParticleKeys.contains(key) && storedByKey[key] == jsonString(value)
            }
        }
        let kept = try patch.filter { key, value in try !unchanged(key, value) }
        let deletes = payload["delete_keys"] as? [Any] ?? []
        let expected = payload["expected_versions"] as? [String: Any] ?? [:]
        // The envelope may also move it: a parent or project it does not have yet is a change.
        let parent = normalizedOptionalString(event["parent_id"] ?? event["parentId"] ?? payload["parent_id"] ?? payload["parentId"])
        let project = normalizedOptionalString(event["project_id"] ?? event["projectId"])
        let moves = (parent != nil && parent != normalizedOptionalString(identity["parent_id"]))
            || (project != nil && project != normalizedOptionalString(projected?["project_id"]))
        if kept.isEmpty && deletes.isEmpty && expected.isEmpty && !moves { return nil }
        if kept.count == patch.count { return event }
        payload[patchKey] = kept
        var reduced = event
        reduced["payload"] = payload
        return reduced
    }

    static func appendEvents(_ db: OpaquePointer?, events: [[String: Any]], enqueueRemote: Bool = false) throws {
        try execute(db, "SAVEPOINT ais_event_batch")
        do {
            for event in events { try appendEvent(db, event: event, enqueueRemote: enqueueRemote) }
            try execute(db, "RELEASE ais_event_batch")
        } catch {
            try execute(db, "ROLLBACK TO ais_event_batch")
            try execute(db, "RELEASE ais_event_batch")
            throw error
        }
    }

    static func applyEventToStateCurrent(_ db: OpaquePointer?, event: [String: Any]) throws {
        let atomeId = stringValue(event["atome_id"])
        if atomeId.isEmpty { return }
        let ts = normalizedOptionalString(event["ts"]) ?? isoNow()
        let kind = stringValue(event["kind"])
        guard let patch = extractEventPatch(kind: kind, payload: event["payload"], ts: ts) else { return }

        let actorId = resolveActorId(event["actor"])
        let patchOwnerId = normalizedOptionalString(patch["owner_id"] ?? patch["ownerId"] ?? patch["owner"])
        let eventOwnerId = normalizedOptionalString(event["owner_id"] ?? event["ownerId"] ?? event["owner"])
        let patchType = resolveEventType(patch)
        let payloadObject = event["payload"] as? [String: Any]
        let patchParentId = normalizedOptionalString(
            event["parent_id"] ?? event["parentId"]
            ?? payloadObject?["parent_id"] ?? payloadObject?["parentId"]
        ) ?? resolveEventParentId(patch)
        let deleted: Bool? = patch["__deleted"].map { boolValue($0) }
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
        for key in (payloadObject?["delete_keys"] as? [String] ?? []) {
            nextProps.removeValue(forKey: key)
            try upsertParticle(db, atomeId: atomeId, key: key, value: NSNull(), changedBy: changedBy, now: ts)
            try execute(db, "DELETE FROM particles WHERE atome_id = ? AND particle_key = ?", [.text(atomeId), .text(key)])
        }
        if nextProps["type"] == nil, let patchType { nextProps["type"] = patchType }
        if nextProps["type"] == nil, let existingType = existingMeta?.atomeType, !existingType.isEmpty { nextProps["type"] = existingType }
        // Structural parentage lives in `atomes.parent_id`; remove stale legacy
        // copies before storing state_current. Serialization projects the current
        // metadata back for callers that still read it from `properties`.
        nextProps.removeValue(forKey: "parent_id")
        nextProps.removeValue(forKey: "parentId")
        let globalScope = normalizedOptionalString(payloadObject?["scope"]) == "global"
        let projectId = globalScope ? nil : firstNonEmptyString([
            normalizedOptionalString(event["project_id"] ?? event["projectId"]),
            normalizedOptionalString(patch["project_id"] ?? patch["projectId"]),
            existingState?.projectId
        ])
        if globalScope { nextProps.removeValue(forKey: "project_id"); nextProps.removeValue(forKey: "projectId") }
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

    private static func upsertAtomeFromEvent(_ db: OpaquePointer?, atomeId: String, atomeType: String?, parentId: String?, ownerId: String?, creatorId: String?, deleted: Bool?, now: String) throws {
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
                deleted == true ? .text(now) : .null
            ])
            return
        }

        var updates: [String] = ["updated_at = ?", "sync_status = 'local'"]
        var bindings: [SQLiteBinding] = [.text(now)]
        if let deleted {
            updates.append("deleted_at = ?")
            bindings.append(deleted ? .text(now) : .null)
        }
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
