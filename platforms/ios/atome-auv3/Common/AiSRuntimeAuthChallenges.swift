import Foundation
import Security
import SQLite3

extension AiSRuntime {
    private static func authNonce() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw AiSError("auth_random_unavailable") }
        return base64url(Data(bytes))
    }

    static func localAuthChallenge(_ message: [String: Any], db: OpaquePointer?) throws -> [String: Any] {
        let grant = stringValue(message["grantId"]), purpose = stringValue(message["purpose"])
        guard ["local-resume", "local-lock"].contains(purpose),
              let row = try query(db, "SELECT key_id,generation FROM auth_local_grants WHERE grant_id=? AND locked=0", [.text(grant)]).first else { throw AiSError("local_session_locked") }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let nonce = try authNonce(), id = try authNonce()
        let reference = "\(grant):\(intValue(row["generation"], defaultValue: 0))"
        try execute(db, "DELETE FROM auth_local_challenges WHERE expires_ms<=?", [.int(now)])
        try execute(db, "INSERT INTO auth_local_challenges VALUES (?,?,?,?,?,?,?,NULL)",
            [.text(id),.text(grant),.text(purpose),.text(reference),.text(nonce),.int(now),.int(now + 60000)])
        return ["challenge":["purpose":purpose,"reference":reference,"keyId":stringValue(row["key_id"]),"challenge":id,"nonce":nonce,"issuedAt":now]]
    }

    static func consumeLocalAuthChallenge(_ message: [String: Any], db: OpaquePointer?) throws -> [String: Any] {
        let locking = stringValue(message["action"]) == "local-session-lock"
        let purpose = locking ? "local-lock" : "local-resume"
        let grant = stringValue(message["grantId"]), challenge = stringValue(message["challengeId"])
        try execute(db, "BEGIN IMMEDIATE", [])
        do {
            guard let row = try query(db, "SELECT * FROM auth_local_grants WHERE grant_id=? AND locked=0", [.text(grant)]).first else { throw AiSError("local_session_locked") }
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            let generation = intValue(row["generation"], defaultValue: 0)
            let reference = "\(grant):\(generation)"
            guard let proof = try query(db, "SELECT nonce,issued_ms FROM auth_local_challenges WHERE challenge_id=? AND grant_id=? AND purpose=? AND reference_id=? AND expires_ms>? AND consumed_ms IS NULL",
                [.text(challenge),.text(grant),.text(purpose),.text(reference),.int(now)]).first,
                let signature = base64urlDecode(stringValue(message["signature"])) else { throw AiSError("auth_proof_invalid") }
            let context: [Any] = ["atome.phone-link.v1", "https://atome.one", purpose, reference, challenge,
                stringValue(proof["nonce"]), stringValue(row["key_id"]), intValue(proof["issued_ms"], defaultValue: 0)]
            let data = try JSONSerialization.data(withJSONObject: context, options: [.withoutEscapingSlashes])
            guard let signed = String(data: data, encoding: .utf8),
                try AuthDeviceKey.verify(scope: stringValue(row["key_scope"]), message: signed, signature: signature) else { throw AiSError("auth_proof_invalid") }
            try execute(db, "UPDATE auth_local_challenges SET consumed_ms=? WHERE challenge_id=?", [.int(now),.text(challenge)])
            if locking { try execute(db, "UPDATE auth_local_grants SET locked=1,generation=generation+1 WHERE grant_id=?", [.text(grant)]) }
            try execute(db, "COMMIT", [])
            return locking ? [:] : try localAuthSession(db, principal: stringValue(row["local_principal"]), grant: grant, generation: generation)
        } catch {
            if sqlite3_get_autocommit(db) == 0 { try execute(db, "ROLLBACK", []) }
            throw error
        }
    }
}
