// Test seams for device storage and local notifications; the real native sync client is compiled.
enum SandboxPathValidator {
    static func primaryRoot() -> URL? { URL(fileURLWithPath: CommandLine.arguments[1]) }
    static func pluginContainerRoot() -> URL? { nil }
}
enum SharedBus { static let appGroupSuite = "atome-sync-batch-" + URL(fileURLWithPath: CommandLine.arguments[1]).lastPathComponent }
final class iCloudFileManager {
    static let shared = iCloudFileManager()
    func getCurrentStorageURL() -> URL? { SandboxPathValidator.primaryRoot() }
}
final class LocalHTTPServer {
    static let shared = LocalHTTPServer()
    let announced = DispatchSemaphore(value: 0)
    var projections: [[String: Any]] = []
    func handleFastifySyncMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              message["type"] as? String == "sync:projection-ready" else { return }
        projections.append(message)
        announced.signal()
    }
}
let db = try AiSRuntime.openDatabase()
try AiSRuntime.execute(db, "INSERT INTO auth_local_grants (grant_id,local_principal,remote_principal,key_id,key_scope,generation,locked) VALUES ('grant','local','remote','device','app',0,0)")
let result = FastifySyncClient.configureRemote(["remote_user_id":"remote", "remote_token":"fixture-token",
    "remote_url":CommandLine.arguments[2], "environment_fingerprint":"fixture"], localUserId:"local")
precondition(result["success"] as? Bool == true)
precondition(LocalHTTPServer.shared.announced.wait(timeout: .now() + 15) == .success, "a batch replay that applied an event must be announced")
// The empty batches that follow must not announce anything.
Thread.sleep(forTimeInterval: 1.5)
FastifySyncClient.shared.disconnect()
UserDefaults(suiteName:SharedBus.appGroupSuite)?.removePersistentDomain(forName:SharedBus.appGroupSuite)
let output = try JSONSerialization.data(withJSONObject: LocalHTTPServer.shared.projections)
print(String(decoding: output, as: UTF8.self))
