import Foundation
import SQLite3

extension AiSRuntime {
    static func handleStartGuest(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let guestId = stringValue(message["guest_id"] ?? message["guestId"])
        guard let principal = UUID(uuidString: guestId),
              principal.uuidString.lowercased() == guestId.lowercased(),
              principal.uuidString.split(separator: "-").dropFirst(2).first?.first == "4" else {
            return authResponse(requestId: requestId, success: false, error: "Guest principal must be a UUID v4")
        }
        guard try findUserRecordById(db, principal.uuidString.lowercased()) == nil else { throw AiSError("guest_principal_conflict") }
        try execute(db, "INSERT OR IGNORE INTO guest_workspace_principals (guest_principal_id, status) VALUES (?1, 'active')", [.text(principal.uuidString.lowercased())])
        let token = try createToken(userId: principal.uuidString.lowercased(), username: "Guest")
        return authResponse(
            requestId: requestId,
            success: true,
            user: ["id": principal.uuidString.lowercased(), "user_id": principal.uuidString.lowercased(), "username": "Guest"],
            token: token
        )
    }

    static func handleMe(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return authResponse(requestId: requestId, success: false, error: "Token is required")
        }
        let userId = stringValue(claims["sub"])
        guard let _ = try findUserRecordById(db, userId) else {
            return authResponse(requestId: requestId, success: false, error: "User not found")
        }
        let user = try loadUserInfo(db, userId: userId)
        return authResponse(requestId: requestId, success: true, user: user)
    }

    static func loadUserInfo(_ db: OpaquePointer?, userId: String) throws -> [String: Any] {
        let username = try loadParticleString(db, atomeId: userId, key: "username") ?? ""
        let rows = try query(db, "SELECT created_at FROM atomes WHERE atome_id = ? LIMIT 1", [.text(userId)])
        let createdAt = rowString(rows.first, "created_at") ?? isoNow()
        var info: [String: Any] = [
            "user_id": userId,
            "id": userId,
            "username": username,
            "created_at": createdAt
        ]
        // The client refuses a session whose user carries no phone: it cannot
        // tell that account apart from somebody else's. Fastify and the Tauri
        // backend both state it; omitting it here made every real sign-in on
        // iOS fail as `phone_mismatch`, leaving only the guest session usable.
        if let phone = try readVerifiedPhone(db, principalId: userId), !phone.isEmpty {
            info["phone"] = phone
        }
        return info
    }

    static func findUserRecordByPhone(_ db: OpaquePointer?, _ phone: String) throws -> UserRecord? {
        let rows = try query(db, """
            SELECT a.atome_id, a.atome_type, a.deleted_at
            FROM atomes a
            JOIN principal_phone_credentials c ON c.principal_id = a.atome_id
            WHERE c.normalized_phone = ? AND c.revoked_at IS NULL
            ORDER BY a.updated_at DESC
            LIMIT 1
            """, [.text(phone)])
        guard let row = rows.first else { return nil }
        return UserRecord(
            userId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            deletedAt: rowString(row, "deleted_at")
        )
    }

    static func findUserRecordById(_ db: OpaquePointer?, _ userId: String) throws -> UserRecord? {
        let rows = try query(db, "SELECT atome_id, atome_type, deleted_at FROM atomes WHERE atome_id = ? LIMIT 1", [.text(userId)])
        guard let row = rows.first else { return nil }
        return UserRecord(
            userId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            deletedAt: rowString(row, "deleted_at")
        )
    }

    static func assignVerifiedPhone(_ db: OpaquePointer?, principalId: String, phone: String, now: String) throws {
        let existing = try query(db, """
            SELECT principal_id FROM principal_phone_credentials
            WHERE normalized_phone = ? AND revoked_at IS NULL LIMIT 1
            """, [.text(phone)])
        if let owner = rowString(existing.first, "principal_id") {
            if owner == principalId { return }
            throw NSError(domain: "LocalHTTPServer", code: 409, userInfo: [NSLocalizedDescriptionKey: "phone_credential_already_assigned"])
        }
        try execute(db, "UPDATE principal_phone_credentials SET revoked_at=?,updated_at=? WHERE principal_id=? AND normalized_phone!=? AND revoked_at IS NULL", [.text(now),.text(now),.text(principalId),.text(phone)])
        try execute(db, """
            INSERT INTO principal_phone_credentials
            (principal_id, normalized_phone, verified_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """, [.text(principalId), .text(phone), .text(now), .text(now), .text(now)])
    }

    static func readVerifiedPhone(_ db: OpaquePointer?, principalId: String) throws -> String? {
        let rows = try query(db, """
            SELECT normalized_phone FROM principal_phone_credentials
            WHERE principal_id = ? AND revoked_at IS NULL
            ORDER BY credential_id DESC LIMIT 1
            """, [.text(principalId)])
        return rowString(rows.first, "normalized_phone")
    }
}
