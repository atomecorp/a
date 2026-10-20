import Foundation

// ADOLE event containment — the project an event belongs to (same rule as the Fastify
// owner `database/adole_event_containment.js` and Axum `local_atome_containment.rs`).
// An event's project is a fact of the atome's containment, never of the project the
// writing WebView has open. The client stamps every commit with its current project;
// that stamp only places a NEW atome that has no known container. The resolved project
// drives the event's stream, its outbox delivery and `state_current.project_id`.
extension AiSRuntime {
    private static func isProjectType(_ value: String?) -> Bool {
        value?.lowercased() == "project"
    }

    // `type`/`atome_type` win unless generic, then `kind` (Fastify `resolveEventType`).
    private static func declaredEventType(_ patch: [String: Any]) -> String? {
        let declared = normalizedOptionalString(patch["type"] ?? patch["atome_type"])
        if let declared, declared.lowercased() != "generic" { return declared }
        return normalizedOptionalString(patch["kind"]) ?? declared
    }

    // Nearest project in the atome's parent chain (the atome itself included); an atome
    // with no project ancestor keeps the project it was created in. `nil`: unknown atome.
    private static func projectOfAtome(_ db: OpaquePointer?, atomeId: String) throws -> String?? {
        var visited = Set<String>()
        var id: String? = atomeId
        while let current = id, visited.insert(current).inserted {
            guard let meta = try findAnyAtomeMeta(db, atomeId: current) else { break }
            if isProjectType(meta.atomeType) { return current }
            id = meta.parentId
        }
        guard let state = try loadStateCurrentEntry(db, atomeId: atomeId) else { return nil }
        return .some(state.projectId)
    }

    static func resolveEventProjectId(_ db: OpaquePointer?, event: [String: Any]) throws -> String? {
        let stamped = normalizedOptionalString(event["project_id"] ?? event["projectId"])
        guard let atomeId = normalizedOptionalString(event["atome_id"]) else { return stamped }
        let ts = normalizedOptionalString(event["ts"]) ?? isoNow()
        let patch = extractEventPatch(kind: stringValue(event["kind"]), payload: event["payload"], ts: ts) ?? [:]
        let payload = event["payload"] as? [String: Any]
        let storedType = try findAnyAtomeMeta(db, atomeId: atomeId)?.atomeType
        if isProjectType(declaredEventType(patch)) || isProjectType(storedType) { return atomeId }
        if normalizedOptionalString(payload?["scope"]) == "global" { return nil }
        // A declared parent places the atome (creation or reparent); otherwise it stays where it is.
        let parentId = normalizedOptionalString(event["parent_id"] ?? event["parentId"]
            ?? payload?["parent_id"] ?? payload?["parentId"] ?? patch["parent_id"] ?? patch["parentId"])
        for anchor in [parentId, atomeId].compactMap({ $0 }) {
            if let project = try projectOfAtome(db, atomeId: anchor) { return project }
        }
        return stamped
    }
}
