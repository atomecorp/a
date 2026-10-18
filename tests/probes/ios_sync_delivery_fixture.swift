// Test seams for device storage and local notifications; the real native delivery client is compiled.
enum SandboxPathValidator {
    static func primaryRoot() -> URL? { URL(fileURLWithPath: CommandLine.arguments[1]) }
    static func pluginContainerRoot() -> URL? { nil }
}
enum SharedBus { static let appGroupSuite = "atome-sync-fixture-" + URL(fileURLWithPath: CommandLine.arguments[1]).lastPathComponent }
final class iCloudFileManager {
    static let shared = iCloudFileManager()
    func getCurrentStorageURL() -> URL? { SandboxPathValidator.primaryRoot() }
}
final class LocalHTTPServer {
    static let shared = LocalHTTPServer()
    let completed = DispatchSemaphore(value: 0)
    func handleFastifySyncMessage(_ text: String) {
        if let data = text.data(using: .utf8), let message = try? JSONSerialization.jsonObject(with: data) as? [String:Any],
           message["type"] as? String == "sync:delivery-complete" { completed.signal() }
    }
}
extension AiSRuntime {
    static func prepareDeliveryFixture() throws {
        let db = try openDatabase()
        try execute(db, "INSERT INTO auth_local_grants (grant_id,local_principal,remote_principal,key_id,key_scope,generation,locked) VALUES ('grant','local','remote','device','app',0,0)")
        let event = try normalizeEventInput(["id":"durable-event", "atome_id":"offline-project", "kind":"set",
            "props":["type":"project", "name":"Offline"]], defaultActorId:"local")
        try appendEvent(db, event:event, enqueueRemote:true)
    }
}
try AiSRuntime.prepareDeliveryFixture()
let result = FastifySyncClient.configureRemote(["remote_user_id":"remote", "remote_token":"fixture-token",
    "remote_url":CommandLine.arguments[2], "environment_fingerprint":"fixture"], localUserId:"local")
precondition(result["success"] as? Bool == true)
let received = LocalHTTPServer.shared.completed.wait(timeout: .now() + 18)
precondition(received == .success, "a failed/incomplete delivery must retry until the correlated server receipt")
let pendingAfterReceipt = try AiSRuntime.pendingRemoteSync(principalId:"remote", localPrincipalId:"local").rows
precondition(pendingAfterReceipt.isEmpty,
    "only the complete receipt may retire the durable event")
FastifySyncClient.shared.disconnect()
UserDefaults(suiteName:SharedBus.appGroupSuite)?.removePersistentDomain(forName:SharedBus.appGroupSuite)
print("Native WebSocket delivery checks passed")
