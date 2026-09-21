import Foundation
import SQLite3

// Durable `state_current` storage and its read boundary.
//
// The row serializer stays shared with snapshot creation. Capability projection
// is applied only to the two read responses, so the context-menu resolver finds
// the same access contract as Axum and Fastify. AiS reads are authorized by
// local ownership (`canReadState`); the `permissions` table stays unread until
// iOS serves sharing.
extension AiSRuntime {

    static func handleStateCurrentMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            do {
                let db = try openDatabase()
                let response: [String: Any]
                switch action {
                case "get":
                    response = try handleStateCurrentGet(message, db: db, requestId: requestId)
                case "list":
                    response = try handleStateCurrentList(message, db: db, requestId: requestId)
                default:
                    response = stateCurrentResponse(requestId: requestId, success: false, error: "Unknown action: \(action)")
                }
                return response
            } catch {
                return stateCurrentResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    private static func handleStateCurrentGet(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let atomeId = stringValue(message["atome_id"] ?? message["id"])
        if atomeId.isEmpty {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Missing atome_id")
        }
        guard var state = try getStateCurrent(db, atomeId: atomeId) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "State not found")
        }
        let userId = stringValue(claims["sub"])
        guard canReadState(state: state, userId: userId) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Access denied")
        }
        state["capabilities"] = try projectStateCurrentCapabilities(state, userId: userId)
        return stateCurrentResponse(requestId: requestId, success: true, state: state)
    }

    private static func handleStateCurrentList(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let projectId = normalizedOptionalString(message["project_id"] ?? message["projectId"])
        let atomeType = normalizedOptionalString(message["atome_type"] ?? message["atomeType"])
        let ownerId = stringValue(claims["sub"])
        let excludeSystem = boolValue(message["exclude_system"] ?? message["excludeSystem"])
        let includeTotal = boolValue(message["include_total"] ?? message["includeTotal"])
        let excludedParticleKeys = Set(
            ((message["exclude_particle_keys"] ?? message["excludeParticleKeys"]) as? [Any] ?? [])
                .compactMap { normalizedOptionalString($0) }
        )
        let states = try listStateCurrent(
            db,
            projectId: projectId,
            ownerId: ownerId,
            limit: intValue(message["limit"], defaultValue: 1000),
            offset: intValue(message["offset"], defaultValue: 0),
            excludeSystem: excludeSystem,
            atomeType: atomeType,
            excludingParticleKeys: excludedParticleKeys
        ).map { state in
            var state = state
            state["capabilities"] = try projectStateCurrentCapabilities(state, userId: ownerId)
            return state
        }
        let total = includeTotal
            ? try countStateCurrent(
                db,
                projectId: projectId,
                ownerId: ownerId,
                excludeSystem: excludeSystem,
                atomeType: atomeType
            )
            : nil
        return stateCurrentResponse(requestId: requestId, success: true, states: states, total: total)
    }

    private static func stateCurrentResponse(requestId: String?, success: Bool, error: String? = nil, state: [String: Any]? = nil, states: [[String: Any]]? = nil, total: Int64? = nil) -> [String: Any] {
        var response: [String: Any] = [
            "type": "state-current-response",
            "success": success
        ]
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        if let state { response["state"] = state }
        if let states { response["states"] = states }
        if let total { response["total"] = total }
        return response
    }

    // Access projection of the two read responses, shared with Axum
    // (`project_capabilities_for_read`) and Fastify
    // (`projectAtomeCapabilitiesForRead`). AiS authorizes reads by local
    // ownership only, so a row accepted by `canReadState` carries full rights on
    // every key it exposes. The `permissions` table is not served on iOS yet;
    // when it is, it narrows these grants here and nowhere else.
    private static func projectStateCurrentCapabilities(_ state: [String: Any], userId: String) throws -> [String: Any] {
        guard canReadState(state: state, userId: userId) else {
            throw AiSError("state_current capabilities requested for a non-readable record")
        }
        let properties = state["properties"] as? [String: Any] ?? [:]
        var propertyCapabilities: [String: Any] = [:]
        for key in properties.keys {
            propertyCapabilities[key] = ["write": true, "delete": true, "share": true]
        }
        return [
            "read": true,
            "write": true,
            "create": true,
            "delete": true,
            "share": true,
            "properties": propertyCapabilities
        ]
    }

    static func getStateCurrent(_ db: OpaquePointer?, atomeId: String) throws -> [String: Any]? {
        let rows = try query(db, """
            SELECT atome_id, owner_id, project_id, properties, updated_at, version
            FROM state_current
            WHERE atome_id = ?
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        return try serializeStateCurrentRow(db, row: row)
    }

    static func listStateCurrent(
        _ db: OpaquePointer?,
        projectId: String?,
        ownerId: String?,
        limit: Int64,
        offset: Int64,
        excludeSystem: Bool = false,
        atomeType: String? = nil,
        excludingParticleKeys: Set<String> = []
    ) throws -> [[String: Any]] {
        var sql = """
            SELECT sc.atome_id, sc.owner_id, sc.project_id, sc.properties, sc.updated_at, sc.version
            FROM state_current sc
            LEFT JOIN atomes a ON a.atome_id = sc.atome_id
            """
        var conditions: [String] = []
        var bindings: [SQLiteBinding] = []
        if let projectId, !projectId.isEmpty {
            conditions.append("sc.project_id = ?")
            bindings.append(.text(projectId))
        }
        if let atomeType, !atomeType.isEmpty {
            let normalizedType = atomeType.lowercased()
            conditions.append("(LOWER(COALESCE(a.atome_type, '')) = ? OR LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) = ? OR LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) = ?)")
            bindings.append(.text(normalizedType))
            bindings.append(.text(normalizedType))
            bindings.append(.text(normalizedType))
            if normalizedType == "tool" {
                // Activity-selection tools are derived from the canonical activity
                // list at runtime. Historical builds persisted those derivatives
                // after an unfiltered activity read, recursively creating thousands
                // of `ui.activity.select.*` records. Keep their history intact but
                // never hydrate them as the durable tool catalogue.
                conditions.append("LOWER(sc.atome_id) NOT LIKE 'tool_ui.activity.select.%'")
            }
        }
        if let ownerId, !ownerId.isEmpty {
            conditions.append("(COALESCE(sc.owner_id, a.owner_id) = ? OR COALESCE(sc.owner_id, a.owner_id) IS NULL)")
            bindings.append(.text(ownerId))
        }
        if excludeSystem {
            conditions.append("LOWER(COALESCE(a.atome_type, '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')")
            conditions.append("LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')")
            conditions.append("LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')")
            conditions.append("LOWER(sc.atome_id) NOT LIKE 'tool.ui.%' AND LOWER(sc.atome_id) NOT LIKE 'tool_ui.%'")
        }
        if !conditions.isEmpty {
            sql += " WHERE " + conditions.joined(separator: " AND ")
        }
        sql += " ORDER BY sc.updated_at DESC LIMIT ? OFFSET ?"
        bindings.append(.int(limit))
        bindings.append(.int(offset))
        let rows = try query(db, sql, bindings)
        return try rows.map { try serializeStateCurrentRow(db, row: $0, excludingParticleKeys: excludingParticleKeys) }
    }

    private static func countStateCurrent(
        _ db: OpaquePointer?,
        projectId: String?,
        ownerId: String?,
        excludeSystem: Bool,
        atomeType: String? = nil
    ) throws -> Int64 {
        var sql = "SELECT COUNT(DISTINCT sc.atome_id) AS total FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id"
        var conditions: [String] = []
        var bindings: [SQLiteBinding] = []
        if let projectId, !projectId.isEmpty {
            conditions.append("sc.project_id = ?")
            bindings.append(.text(projectId))
        }
        if let atomeType, !atomeType.isEmpty {
            let normalizedType = atomeType.lowercased()
            conditions.append("(LOWER(COALESCE(a.atome_type, '')) = ? OR LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) = ? OR LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) = ?)")
            bindings.append(.text(normalizedType))
            bindings.append(.text(normalizedType))
            bindings.append(.text(normalizedType))
            if normalizedType == "tool" {
                conditions.append("LOWER(sc.atome_id) NOT LIKE 'tool_ui.activity.select.%'")
            }
        }
        if let ownerId, !ownerId.isEmpty {
            conditions.append("(COALESCE(sc.owner_id, a.owner_id) = ? OR COALESCE(sc.owner_id, a.owner_id) IS NULL)")
            bindings.append(.text(ownerId))
        }
        if excludeSystem {
            conditions.append("LOWER(COALESCE(a.atome_type, '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')")
            conditions.append("LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')")
            conditions.append("LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')")
            conditions.append("LOWER(sc.atome_id) NOT LIKE 'tool.ui.%' AND LOWER(sc.atome_id) NOT LIKE 'tool_ui.%'")
        }
        if !conditions.isEmpty { sql += " WHERE " + conditions.joined(separator: " AND ") }
        return intValue(try query(db, sql, bindings).first?["total"], defaultValue: 0)
    }

    static func loadStateCurrentEntry(_ db: OpaquePointer?, atomeId: String) throws -> StateCurrentEntry? {
        let rows = try query(db, """
            SELECT atome_id, owner_id, project_id, properties, updated_at, version
            FROM state_current
            WHERE atome_id = ?
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        let properties = (row["properties"] as? String).flatMap { parseJSONValue($0) as? [String: Any] } ?? [:]
        return StateCurrentEntry(
            atomeId: stringValue(row["atome_id"]),
            ownerId: normalizedOptionalString(row["owner_id"]),
            projectId: normalizedOptionalString(row["project_id"]),
            properties: properties,
            updatedAt: stringValue(row["updated_at"]),
            version: intValue(row["version"], defaultValue: 0)
        )
    }

    private static func serializeStateCurrentRow(
        _ db: OpaquePointer?,
        row: [String: Any],
        excludingParticleKeys: Set<String> = []
    ) throws -> [String: Any] {
        let atomeId = stringValue(row["atome_id"])
        let meta = try findAnyAtomeMeta(db, atomeId: atomeId)
        var properties = (row["properties"] as? String).flatMap { parseJSONValue($0) as? [String: Any] } ?? [:]
        // `atome:list` has always honoured exclude_particle_keys; state_current did
        // not, so callers asking for metadata-only rows still received avoidable
        // preview or other heavy fields.
        for key in excludingParticleKeys { properties.removeValue(forKey: key) }
        if properties["type"] == nil, let metaType = meta?.atomeType, !metaType.isEmpty {
            properties["type"] = metaType
        }
        if let parentId = meta?.parentId, !parentId.isEmpty {
            if properties["parent_id"] == nil { properties["parent_id"] = parentId }
            if properties["parentId"] == nil { properties["parentId"] = parentId }
        }
        let projectId = normalizedOptionalString(row["project_id"]) ?? normalizedOptionalString(properties["project_id"] ?? properties["projectId"])
        if let projectId {
            if properties["project_id"] == nil { properties["project_id"] = projectId }
            if properties["projectId"] == nil { properties["projectId"] = projectId }
        }
        // `properties` is the single canonical shape for a state_current row. The
        // former `particles`/`data` aliases repeated the same dictionary, so every
        // response carried each atome three times and JSON.parse rebuilt three
        // separate object graphs inside WebContent.
        var state: [String: Any] = [
            "atome_id": atomeId,
            "id": atomeId,
            "properties": properties,
            "updated_at": stringValue(row["updated_at"]),
            "version": intValue(row["version"], defaultValue: 0)
        ]
        if let ownerId = normalizedOptionalString(row["owner_id"]) ?? meta?.ownerId {
            state["owner_id"] = ownerId
        }
        if let projectId { state["project_id"] = projectId }
        if let meta {
            state["atome_type"] = meta.atomeType
            state["type"] = meta.atomeType
            if let parentId = meta.parentId { state["parent_id"] = parentId }
        }
        return state
    }

    private static func canReadState(state: [String: Any], userId: String) -> Bool {
        let ownerId = normalizedOptionalString(state["owner_id"] ?? state["ownerId"])
        return ownerId == nil || ownerId == userId
    }

    static func upsertStateCurrent(_ db: OpaquePointer?, atomeId: String, ownerId: String, projectId: String? = nil, clearProjectId: Bool = false, properties: [String: Any], now: String) throws {
        let encoded = try jsonString(properties)
        try execute(db, """
            INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(atome_id) DO UPDATE SET
                owner_id = excluded.owner_id,
                project_id = CASE WHEN ? THEN NULL ELSE COALESCE(excluded.project_id, state_current.project_id) END,
                properties = excluded.properties,
                updated_at = excluded.updated_at,
                version = state_current.version + 1
            """, [.text(atomeId), .text(ownerId), projectId.map(SQLiteBinding.text) ?? .null, .text(encoded), .text(now), .int(clearProjectId ? 1 : 0)])
    }

    static func findAnyAtomeMeta(_ db: OpaquePointer?, atomeId: String) throws -> AtomeMeta? {
        let rows = try query(db, """
            SELECT atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, created_source, sync_status
            FROM atomes
            WHERE atome_id = ?
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        return AtomeMeta(
            atomeId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            parentId: rowString(row, "parent_id"),
            ownerId: stringValue(rowValue(row, "owner_id")),
            creatorId: stringValue(rowValue(row, "creator_id")),
            createdAt: stringValue(rowValue(row, "created_at")),
            updatedAt: stringValue(rowValue(row, "updated_at")),
            createdSource: stringValue(rowValue(row, "created_source")),
            syncStatus: stringValue(rowValue(row, "sync_status"))
        )
    }
}
