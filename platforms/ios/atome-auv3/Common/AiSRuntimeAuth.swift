import Foundation
import SQLite3

extension AiSRuntime {
    static func ensureLocalAuthSchema(_ db: OpaquePointer?) throws {
        try execute(db, """
            CREATE TABLE IF NOT EXISTS auth_local_grants (
                grant_id TEXT PRIMARY KEY, local_principal TEXT NOT NULL, remote_principal TEXT NOT NULL,
                key_id TEXT NOT NULL, key_scope TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
                locked INTEGER NOT NULL DEFAULT 0, UNIQUE(remote_principal,key_id))
            """, [])
        try execute(db, """
            CREATE TABLE IF NOT EXISTS auth_local_challenges (
                challenge_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, purpose TEXT NOT NULL,
                reference_id TEXT NOT NULL, nonce TEXT NOT NULL, issued_ms INTEGER NOT NULL,
                expires_ms INTEGER NOT NULL, consumed_ms INTEGER)
            """, [])
    }

    static func authResponse(requestId: String?, success: Bool, error: String? = nil,
                             user: [String: Any]? = nil, token: String? = nil) -> [String: Any] {
        var result: [String: Any] = ["type": "auth-response", "ok": success, "success": success]
        if let requestId { result["requestId"] = requestId; result["request_id"] = requestId }
        if let error { result["error"] = error }
        if let user { result["user"] = user }
        if let token { result["token"] = token }
        return result
    }

    static func handleAuthMessage(_ message: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        let requestId = stringValue(message["requestId"])
        let action = stringValue(message["action"])
        if action == "local-link-challenge" || action == "local-link-complete" {
            Task {
                do {
                    let scope = stringValue(message["scope"])
                    let keyId = try AuthDeviceKey.identity(scope: scope)
                    let challenge = action == "local-link-challenge"
                    let remote = try await remoteAuthProof(["action": challenge ? "session-challenge" : "session-local-bind",
                        "purpose": "local-bind", "sessionId": message["sessionId"] ?? NSNull(),
                        "generation": message["generation"] ?? NSNull(), "challengeId": message["challengeId"] ?? NSNull(),
                        "signature": message["signature"] ?? NSNull()])
                    let result: [String: Any]
                    if challenge {
                        guard let proof = remote["challenge"] as? [String: Any], proof["keyId"] as? String == keyId else { throw AiSError("auth_device_binding_mismatch") }
                        result = ["challenge": proof]
                    } else {
                        guard remote["keyId"] as? String == keyId, let user = remote["user"] as? [String: Any] else { throw AiSError("auth_device_binding_mismatch") }
                        result = try queue.sync { try bindRemoteIdentity(user, scope: scope, keyId: keyId) }
                    }
                    completion(authResponse(requestId: requestId, success: true).merging(result) { _, new in new })
                } catch { completion(authResponse(requestId: requestId, success: false, error: "auth_remote_proof_rejected")) }
            }
            return
        }
        queue.async {
            do {
                let db = try openDatabase()
                var result: [String: Any]
                switch action {
                case "start-guest": result = try handleStartGuest(message, db: db, requestId: requestId)
                case "leave-guest": result = [:]
                case "me": result = try handleMe(message, db: db, requestId: requestId)
                case "local-session-describe": result = try localAuthDescriptor(message, db: db)
                case "local-session-challenge": result = try localAuthChallenge(message, db: db)
                case "local-session-resume", "local-session-lock": result = try consumeLocalAuthChallenge(message, db: db)
                default: throw AiSError("auth_protocol_upgrade_required")
                }
                result = authResponse(requestId: requestId, success: true).merging(result) { _, new in new }
                completion(result)
            } catch { completion(authResponse(requestId: requestId, success: false, error: error.localizedDescription)) }
        }
    }

    // URLSession validates TLS for the fixed authority; renderer input cannot
    // choose the proof server, bypass its response, or inject an account ID.
    private static func remoteAuthProof(_ fields: [String: Any]) async throws -> [String: Any] {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 15
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        let session = URLSession(configuration: configuration)
        let socket = session.webSocketTask(with: URL(string: "wss://atome.one/ws/api")!)
        socket.maximumMessageSize = 65536
        socket.resume()
        defer { socket.cancel(with: .normalClosure, reason: nil); session.invalidateAndCancel() }
        let deadline = Task { try await Task.sleep(nanoseconds: 15_000_000_000); socket.cancel(with: .goingAway, reason: nil) }
        defer { deadline.cancel() }
        var request = fields
        let id = UUID().uuidString
        request["requestId"] = id; request["type"] = "auth"
        try await socket.send(.data(JSONSerialization.data(withJSONObject: request)))
        while true {
            let frame = try await socket.receive()
            let data: Data
            switch frame { case .data(let value): data = value; case .string(let value): data = Data(value.utf8); @unknown default: throw AiSError("auth_remote_response_invalid") }
            guard let response = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AiSError("auth_remote_response_invalid") }
            if response["requestId"] as? String != id { continue }
            guard response["type"] as? String == "auth-response", response["ok"] as? Bool == true else { throw AiSError("auth_remote_proof_rejected") }
            return response
        }
    }

    private static func bindRemoteIdentity(_ remote: [String: Any], scope: String, keyId: String) throws -> [String: Any] {
        let remoteId = stringValue(remote["id"]), phone = stringValue(remote["phone"]), username = stringValue(remote["username"])
        guard !remoteId.isEmpty, !phone.isEmpty else { throw AiSError("auth_remote_response_invalid") }
        let db = try openDatabase()
        try execute(db, "BEGIN IMMEDIATE", [])
        do {
            let previous = try query(db, "SELECT * FROM auth_local_grants WHERE remote_principal=? AND key_id=?", [.text(remoteId), .text(keyId)]).first
            let existing = try findUserRecordByPhone(db, phone)
            guard existing?.deletedAt == nil else { throw AiSError("local_account_unavailable") }
            let principal = rowString(previous, "local_principal") ?? existing?.userId ?? UUID().uuidString.lowercased()
            let conflict = try query(db, "SELECT 1 FROM auth_local_grants WHERE local_principal=? AND remote_principal!=?", [.text(principal), .text(remoteId)])
            let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
            let oldLocal = defaults.string(forKey: "SQUIRREL_FASTIFY_LOCAL_PRINCIPAL_ID")
            let oldRemote = defaults.string(forKey: "SQUIRREL_FASTIFY_PRINCIPAL_ID")
            let oldBindingConflict = oldLocal == principal && oldRemote != nil && oldRemote != remoteId
            guard conflict.isEmpty && !oldBindingConflict else { throw AiSError("local_account_binding_conflict") }
            let grant = rowString(previous, "grant_id") ?? UUID().uuidString.lowercased()
            let generation = previous == nil ? 0 : intValue(previous?["generation"], defaultValue: 0) + 1
            let now = isoNow()
            if try findUserRecordById(db, principal) == nil {
                try execute(db, "INSERT INTO atomes(atome_id,atome_type,owner_id,creator_id,created_at,updated_at,created_source,sync_status) VALUES (?,'user',?,?,?,?,'ais','local')",
                    [.text(principal),.text(principal),.text(principal),.text(now),.text(now)])
                try upsertParticle(db, atomeId: principal, key: "username", value: username, changedBy: principal, now: now)
                try upsertParticle(db, atomeId: principal, key: "visibility", value: "private", changedBy: principal, now: now)
                try upsertStateCurrent(db, atomeId: principal, ownerId: principal, properties: ["type":"user", "username":username, "visibility":"private"], now: now)
            }
            try assignVerifiedPhone(db, principalId: principal, phone: phone, now: now)
            try execute(db, "INSERT INTO auth_local_grants VALUES (?,?,?,?,?,?,0) ON CONFLICT(remote_principal,key_id) DO UPDATE SET locked=0,generation=excluded.generation",
                [.text(grant),.text(principal),.text(remoteId),.text(keyId),.text(scope),.int(generation)])
            try execute(db, "COMMIT", [])
            return try localAuthSession(db, principal: principal, grant: grant, generation: generation)
        } catch {
            if sqlite3_get_autocommit(db) == 0 { try execute(db, "ROLLBACK", []) }
            throw error
        }
    }

    static func localAuthSession(_ db: OpaquePointer?, principal: String, grant: String, generation: Int64) throws -> [String: Any] {
        let user = try loadUserInfo(db, userId: principal)
        let token = try createToken(userId: principal, username: stringValue(user["username"]), grant: grant, generation: generation)
        return ["user":user, "token":token, "localSession":["id":grant, "generation":generation]]
    }
}
