// Device storage and notifications are test seams; the actual native client is compiled.
enum SandboxPathValidator {
    static func primaryRoot() -> URL? { URL(fileURLWithPath: CommandLine.arguments[1]) }
    static func pluginContainerRoot() -> URL? { nil }
}
enum SharedBus { static let appGroupSuite = "atome-provider-fixture-" + URL(fileURLWithPath: CommandLine.arguments[1]).lastPathComponent }
final class iCloudFileManager {
    static let shared = iCloudFileManager()
    func getCurrentStorageURL() -> URL? { SandboxPathValidator.primaryRoot() }
}
final class LocalHTTPServer {
    static let shared = LocalHTTPServer()
    func handleFastifySyncMessage(_ text: String) {}
}
final class ProviderFixture {
    let received = DispatchSemaphore(value: 0)
    var responses: [[String:Any]] = []
    var configuration: [String:Any] = [:]
    let idle = CommandLine.arguments.last == "idle"
    func reply(_ value: [String:Any]) {
        responses.append(value)
        if (value["event"] as? [String:Any])?["type"] as? String == "fixture-config-refresh" {
            _ = FastifySyncClient.configureRemote(configuration, localUserId:"local")
        }
        if value["type"] as? String == "ai-provider-response" || (idle && (value["event"] as? [String:Any])?["type"] as? String == "error") { received.signal() }
    }
}
extension AiSRuntime {
    static func prepareProviderFixture() throws {
        let db = try openDatabase()
        try execute(db, "INSERT INTO auth_local_grants VALUES ('grant','local','remote','device','app',0,0)")
    }
}
try AiSRuntime.prepareProviderFixture()
let client = FastifySyncClient.shared, owner = ProviderFixture()
let configuration: [String:Any] = ["remote_user_id":"remote", "remote_token":"fixture-token",
    "remote_url":CommandLine.arguments[2], "environment_fingerprint":"fixture"]
owner.configuration = configuration
if CommandLine.arguments.last == "refresh" { owner.configuration["remote_token"] = "fixture-token-renewed" }
precondition(FastifySyncClient.configureRemote(configuration, localUserId:"local")["success"] as? Bool == true)
// Wait for serialized configuration, not an arbitrary delay.
client.queue.sync {}
client.queue.sync {}
client.sendProvider(["type":"ai-provider", "action":"realtime-connect", "requestId":"voice-start",
    "payload":["session_id":"voice"]], connectionId:ObjectIdentifier(owner), localUserId:"local", reply:owner.reply)
precondition(owner.received.wait(timeout:.now() + 10) == .success, "the pending voice response must arrive")
client.queue.sync {
    precondition(owner.responses.first(where: { $0["type"] as? String == "ai-provider-response" })?["ok"] as? Bool == true, "sync reconnect must not close the pending voice channel")
}
if owner.idle {
    precondition(owner.received.wait(timeout:.now() + 35) == .success, "an idle provider must retain transport liveness")
    client.queue.sync { precondition(owner.responses.last?["ok"] as? Bool == true, "provider heartbeat must arrive before idle closure") }
} else {
    precondition(FastifySyncClient.configureRemote(owner.configuration, localUserId:"local")["success"] as? Bool == true)
    client.queue.sync {}; client.queue.sync {}
    client.sendProvider(["type":"ai-provider", "action":"credential.status", "requestId":"after-recovery"],
        connectionId:ObjectIdentifier(owner), localUserId:"local", reply:owner.reply)
    precondition(owner.received.wait(timeout:.now() + 5) == .success, "the same channel must still deliver provider replies")
    client.queue.sync {
        precondition(owner.responses.last?["ok"] as? Bool == true, "a repeated same-account configuration must retain voice")
    }
}
if CommandLine.arguments.last == "identity" {
    owner.configuration["environment_fingerprint"] = "another-environment"
    _ = FastifySyncClient.configureRemote(owner.configuration, localUserId:"local")
    client.queue.sync {}; client.queue.sync {}
    client.queue.sync {
        precondition(owner.responses.contains { ($0["event"] as? [String:Any])?["code"] as? String == "provider_connection_closed" },
            "changing the verified environment must close the original voice channel")
    }
}
client.disconnect(); client.queue.sync {}
client.queue.sync {
    precondition(owner.responses.contains { value in
        value["type"] as? String == "ai-realtime-event"
            && (value["event"] as? [String:Any])?["code"] as? String == "provider_connection_closed"
    }, "logout must still close voice and notify the owner")
}
UserDefaults(suiteName:SharedBus.appGroupSuite)?.removePersistentDomain(forName:SharedBus.appGroupSuite)
print("Native provider recovery checks passed")
