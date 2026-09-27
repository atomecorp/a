import Foundation
import CryptoKit
import Security

extension AiSRuntime {
    private static func localTokenKey() throws -> SymmetricKey {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "one.atome.auth.local", kSecAttrAccount as String: "token-key"]
        var read = query
        read[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, data.count == 32 { return SymmetricKey(data: data) }
        guard status == errSecItemNotFound else { throw AiSError("local_auth_key_unavailable") }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw AiSError("local_auth_key_unavailable") }
        var write = query
        write[kSecValueData as String] = Data(bytes)
        write[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(write as CFDictionary, nil) == errSecSuccess else { throw AiSError("local_auth_key_unavailable") }
        return SymmetricKey(data: Data(bytes))
    }

    static func createToken(userId: String, username: String, grant: String? = nil, generation: Int64? = nil) throws -> String {
        let now = Int(Date().timeIntervalSince1970)
        var claims: [String: Any] = ["sub": userId, "username": username, "iat": now, "exp": now + 900]
        if let grant, let generation { claims["grant"] = grant; claims["generation"] = generation }
        let header = try base64urlEncoded(["alg": "HS256", "typ": "JWT"])
        let payload = try base64urlEncoded(claims)
        let message = "\(header).\(payload)"
        let signature = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: try localTokenKey())
        return "\(message).\(base64url(Data(signature)))"
    }

    // Called on the canonical database queue by every protected local API.
    static func verifyToken(_ token: String) throws -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count == 3, let signature = base64urlDecode(String(parts[2])),
              let data = base64urlDecode(String(parts[1])),
              let claims = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              HMAC<SHA256>.isValidAuthenticationCode(signature, authenticating: Data("\(parts[0]).\(parts[1])".utf8), using: try localTokenKey()),
              intValue(claims["exp"], defaultValue: 0) > Int64(Date().timeIntervalSince1970) else { return nil }
        let db = try openDatabase()
        let principal = stringValue(claims["sub"])
        let rows: [[String: Any]]
        if let grant = claims["grant"] as? String {
            rows = try query(db, "SELECT 1 FROM auth_local_grants WHERE grant_id=? AND local_principal=? AND generation=? AND locked=0",
                [.text(grant), .text(principal), .int(intValue(claims["generation"], defaultValue: -1))])
        } else {
            rows = try query(db, "SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id=? AND status='active'", [.text(principal)])
        }
        return rows.isEmpty ? nil : claims
    }
    static func base64urlEncoded(_ object: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [])
        return base64url(data)
    }

    static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func base64urlDecode(_ value: String) -> Data? {
        var base = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let padding = 4 - (base.count % 4)
        if padding < 4 {
            base += String(repeating: "=", count: padding)
        }
        return Data(base64Encoded: base)
    }
}
