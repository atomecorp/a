import Foundation
import Security

// The local server of this process (the app or its AUv3 extension): `atome_server::local` in
// Rust, the host Tauri runs too, on the one app-group vault `adole.db`. Swift only starts it
// (the paths, the keychain's session key, the device key's verifier), rebinds it when iOS took
// its listening socket back during a suspension, and lets the native controllers ask it.
final class LocalServer {
    static let shared = LocalServer()

    private let queue = DispatchQueue(label: "one.atome.local.server")
    private(set) var port: UInt16?
    private var started = false
    // Set when the app went to the background (back through `.inactive` to `.active`), with the
    // background time its vault units then start under.
    private var backgrounded = false
    private var backgroundTime: (AtomeIosBeginBackgroundTime, AtomeIosEndBackgroundTime)?

    private init() {}

    func start() {
        queue.async { [weak self] in
            guard let self, !self.started else { return }
            self.started = true
            do {
                let port = try Self.open()
                self.port = port
                // A launch in the background (a push, a location update) quiesces the vault at once.
                if let time = self.backgroundTime { atome_ios_local_server_quiesce(time.0, time.1) }
                WebViewManager.announceLocalHTTPPort(port)
            } catch {
                // The page works through this server only: its boot fails now, and a retry starts it again.
                self.started = false
                print("❌ LocalServer failed: \(error.localizedDescription)")
                DispatchQueue.main.async { WebViewManager.reportBootFailure(reason: "local_server_failed") }
            }
        }
    }

    // On the way to the background: the vault's units start only under background time from
    // `begin` (the app's), and `done` runs once those under way are over.
    func enterBackground(begin: AtomeIosBeginBackgroundTime, end: AtomeIosEndBackgroundTime,
                         done: @escaping () -> Void) {
        queue.async { [weak self] in
            defer { done() }
            guard let self else { return }
            self.backgrounded = true
            self.backgroundTime = (begin, end)
            if self.port != nil { atome_ios_local_server_quiesce(begin, end) }
        }
    }

    // iOS reclaims the listening socket of a suspended app (opening the SMS link in Messages is
    // enough) and the page, which works offline through this server, finds nothing on its port.
    // Only a real return from the background lost it: rebinding at launch would drop the server
    // exactly while the workspace boots through it.
    func resumeFromBackground() {
        queue.async { [weak self] in
            guard let self, self.backgrounded else { return }
            self.backgrounded = false
            self.backgroundTime = nil
            guard let previous = self.port else { return }
            atome_ios_local_server_resume()
            var error: UnsafeMutablePointer<CChar>?
            let port = atome_ios_local_server_rebind(previous, &error)
            guard port != 0 else {
                print("❌ LocalServer rebind failed: \(Self.take(error) ?? "local_server_rebind_failed")")
                return
            }
            self.port = port
            if port != previous { WebViewManager.announceLocalHTTPPort(port) }
        }
    }

    // One `/ws/api` frame answered as the page's socket would (the native controllers).
    func answer(_ frame: [String: Any]) -> [String: Any] {
        guard let data = try? JSONSerialization.data(withJSONObject: frame),
              let reply = String(data: data, encoding: .utf8).flatMap({ atome_ios_local_server_answer($0) }),
              let text = Self.take(reply),
              let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
            return ["success": false, "error": "local_server_unavailable"]
        }
        return object
    }

    // The person a local session token names, nil when it is not a valid local session.
    func verifiedUser(_ token: String) -> String? {
        guard let text = Self.take(atome_ios_local_server_verify(token)),
              let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              let user = object["user_id"] as? String, !user.isEmpty else { return nil }
        return user
    }

    private static func take(_ text: UnsafeMutablePointer<CChar>?) -> String? {
        guard let text else { return nil }
        defer { atome_ios_audio_string_free(text) }
        return String(cString: text)
    }

    private struct Failure: LocalizedError {
        let errorDescription: String?
    }

    private static func open() throws -> UInt16 {
        // The bundle keeps the project's layout under `atome_runtime` (`src`, `eVe`, `version.txt`).
        guard let staticDir = Bundle.main.resourceURL?.appendingPathComponent("atome_runtime/src", isDirectory: true),
              let storageDir = iCloudFileManager.shared.getCurrentStorageURL(),
              let dataDir = SandboxPathValidator.primaryRoot() ?? SandboxPathValidator.pluginContainerRoot() else {
            throw Failure(errorDescription: "local_server_storage_unavailable")
        }
        // The remote end of the sync, the relays and the device proofs (the app group's choice).
        let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
        let configured = ["SQUIRREL_FASTIFY_URL", "SQUIRREL_TAURI_FASTIFY_URL"].lazy
            .compactMap { defaults.string(forKey: $0)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        setenv("SQUIRREL_FASTIFY_URL", configured ?? "https://atome.one", 1)
        let secret = try sessionKey().map { String(format: "%02x", $0) }.joined()
        var error: UnsafeMutablePointer<CChar>?
        let port = atome_ios_local_server_start(staticDir.path, storageDir.path, dataDir.path, secret,
                                                verifyDeviceSignature, 0, &error)
        guard port != 0 else { throw Failure(errorDescription: take(error) ?? "local_server_start_failed") }
        return port
    }

    // The key that signs the local sessions, kept in the keychain (the app and its extension).
    private static func sessionKey() throws -> Data {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "one.atome.auth.local", kSecAttrAccount as String: "token-key"]
        var read = query
        read[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, data.count == 32 { return data }
        guard status == errSecItemNotFound else {
            throw Failure(errorDescription: "local_auth_key_unavailable: read \(status)")
        }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw Failure(errorDescription: "local_auth_key_unavailable")
        }
        var write = query
        write[kSecValueData as String] = Data(bytes)
        write[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(write as CFDictionary, nil)
        guard added == errSecSuccess else {
            throw Failure(errorDescription: "local_auth_key_unavailable: add \(added)")
        }
        return Data(bytes)
    }
}

// The server's check of a device-key proof (`AuthDeviceKey.verify`): a C function, no context.
private func verifyDeviceSignature(scope: UnsafePointer<CChar>?, message: UnsafePointer<CChar>?,
                                   signature: UnsafePointer<CChar>?) -> Int32 {
    guard let scope, let message, let signature else { return -1 }
    var encoded = String(cString: signature).replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
    encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
    guard let bytes = Data(base64Encoded: encoded) else { return 0 }
    do {
        return try AuthDeviceKey.verify(scope: String(cString: scope), message: String(cString: message),
                                        signature: bytes) ? 1 : 0
    } catch {
        return -1
    }
}
