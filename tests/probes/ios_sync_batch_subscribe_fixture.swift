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
    let ready = DispatchSemaphore(value: 0)
    var projections: [[String: Any]] = []
    func handleFastifySyncMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if message["type"] as? String == "sync:status", let status = message["data"] as? [String: Any],
           status["connection_state"] as? String == "connected", status["restore_state"] as? String == "ready" { ready.signal() }
        guard message["type"] as? String == "sync:projection-ready" else { return }
        projections.append(message)
        announced.signal()
    }
}
let db = try AiSRuntime.openDatabase()
// Transactions opened by inbound runs: `persistRemoteSyncEnvelopes` is their only BEGIN IMMEDIATE here.
var runTransactions = 0
if CommandLine.arguments.last == "run" {
    sqlite3_trace_v2(db, UInt32(SQLITE_TRACE_STMT), { _, _, statement, _ in
        if let statement, let sql = sqlite3_sql(OpaquePointer(statement)), String(cString: sql) == "BEGIN IMMEDIATE" { runTransactions += 1 }
        return 0
    }, nil)
}
try AiSRuntime.execute(db, "INSERT INTO auth_local_grants (grant_id,local_principal,remote_principal,key_id,key_scope,generation,locked) VALUES ('grant','local','remote','device','app',0,0)")
let result = FastifySyncClient.configureRemote(["remote_user_id":"remote", "remote_token":"fixture-token",
    "remote_url":CommandLine.arguments[2], "environment_fingerprint":"fixture"], localUserId:"local")
precondition(result["success"] as? Bool == true)
if CommandLine.arguments.last == "health" {
    precondition(LocalHTTPServer.shared.ready.wait(timeout: .now() + 15) == .success)
    FastifySyncClient.shared.connectIfConfigured()
    FastifySyncClient.shared.connectIfConfigured()
    // Each foreground check republishes the current (still ready) status: only a status
    // published after these two counts as the reconnection.
    Thread.sleep(forTimeInterval: 1)
    while LocalHTTPServer.shared.ready.wait(timeout: .now()) == .success {}
    precondition(LocalHTTPServer.shared.ready.wait(timeout: .now() + 20) == .success, "silent OPEN connection must reconnect after its single bounded ping probe")
} else {
precondition(LocalHTTPServer.shared.announced.wait(timeout: .now() + 15) == .success, "a batch replay that applied an event must be announced")
// The empty batches that follow must not announce anything.
Thread.sleep(forTimeInterval: 1.5)
}
FastifySyncClient.shared.disconnect()
if CommandLine.arguments.last == "run" {
    let stored = try AiSRuntime.query(db, "SELECT (SELECT COUNT(*) FROM events WHERE stream_id = 'stream-1') AS events, (SELECT COUNT(*) FROM remote_sync_rejected_events WHERE stream_id = 'stream-1') AS rejected, (SELECT last_sequence FROM remote_sync_stream_cursors WHERE stream_id = 'stream-1') AS cursor").first ?? [:]
    let stats: [String: Any] = ["transactions":runTransactions, "events":stored["events"] ?? 0, "rejected":stored["rejected"] ?? 0, "cursor":stored["cursor"] ?? 0]
    print(String(decoding: try JSONSerialization.data(withJSONObject: stats), as: UTF8.self))
}
UserDefaults(suiteName:SharedBus.appGroupSuite)?.removePersistentDomain(forName:SharedBus.appGroupSuite)
let output = try JSONSerialization.data(withJSONObject: LocalHTTPServer.shared.projections)
print(String(decoding: output, as: UTF8.self))
