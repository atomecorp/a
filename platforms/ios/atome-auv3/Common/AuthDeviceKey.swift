import Foundation
import Security
import CryptoKit

enum AuthDeviceKey {
    private static let queue = DispatchQueue(label: "one.atome.auth.device")

    private static func key(scope: String) throws -> SecKey {
        let tag = Data("one.atome.auth.device.\(scope)".utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let item = item { return item as! SecKey }
        guard status == errSecItemNotFound else { throw Failure.unavailable }
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .privateKeyUsage, &error) else { throw Failure.unavailable }
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag, kSecAttrAccessControl as String: access]
        ]
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else { throw Failure.unavailable }
        return key
    }

    private enum Failure: Error { case unavailable, invalid }
    private static func base64url(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func identity(scope: String) throws -> String {
        try queue.sync {
            guard scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw Failure.invalid }
            var error: Unmanaged<CFError>?
            guard let publicKey = SecKeyCopyPublicKey(try key(scope: scope)),
                let bytes = SecKeyCopyExternalRepresentation(publicKey, &error) as Data?, bytes.count == 65 else { throw Failure.unavailable }
            let x = base64url(bytes.subdata(in: 1..<33)), y = base64url(bytes.subdata(in: 33..<65))
            let json = "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"\(x)\",\"y\":\"\(y)\"}"
            return SHA256.hash(data: Data(json.utf8)).map { String(format: "%02x", $0) }.joined()
        }
    }

    static func verify(scope: String, message: String, signature: Data) throws -> Bool {
        try queue.sync {
            guard scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                let publicKey = SecKeyCopyPublicKey(try key(scope: scope)) else { throw Failure.invalid }
            var error: Unmanaged<CFError>?
            return SecKeyVerifySignature(publicKey, .ecdsaSignatureMessageX962SHA256,
                Data(message.utf8) as CFData, signature as CFData, &error)
        }
    }

    static func handle(_ payload: [String: Any], completion: @escaping ([String: Any]?, String?) -> Void) {
        queue.async {
            do {
                guard let scope = payload["scope"] as? String, scope.count == 64,
                    scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                    let action = payload["action"] as? String, ["public", "sign"].contains(action) else { throw Failure.invalid }
                let privateKey = try key(scope: scope)
                var error: Unmanaged<CFError>?
                if action == "public" {
                    guard let publicKey = SecKeyCopyPublicKey(privateKey),
                        let encoded = SecKeyCopyExternalRepresentation(publicKey, &error) as Data?,
                        encoded.count == 65, encoded[0] == 4 else { throw Failure.unavailable }
                    completion(["publicKey": ["kty": "EC", "crv": "P-256",
                        "x": base64url(encoded.subdata(in: 1..<33)), "y": base64url(encoded.subdata(in: 33..<65))]], nil)
                    return
                }
                guard let message = payload["message"] as? String, message.utf8.count <= 2048,
                    let context = try JSONSerialization.jsonObject(with: Data(message.utf8)) as? [Any],
                    context.count == 8, context[0] as? String == "atome.phone-link.v1",
                    context[1] as? String == "https://atome.one" else { throw Failure.invalid }
                guard let signature = SecKeyCreateSignature(privateKey, .ecdsaSignatureMessageX962SHA256,
                    Data(message.utf8) as CFData, &error) as Data? else { throw Failure.unavailable }
                completion(["signature": base64url(signature)], nil)
            } catch {
                completion(nil, "auth_protected_device_key_unavailable")
            }
        }
    }
}
