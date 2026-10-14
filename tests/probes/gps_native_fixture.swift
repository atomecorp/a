import JavaScriptCore
// Only host storage/auth/network seams; actual AiS and GPS production owners are compiled.
enum SandboxPathValidator {
    static func primaryRoot() -> URL? { URL(fileURLWithPath: CommandLine.arguments[1]) }
    static func pluginContainerRoot() -> URL? { nil }
}
final class iCloudFileManager {
    static let shared = iCloudFileManager()
    func getCurrentStorageURL() -> URL? { SandboxPathValidator.primaryRoot() }
}
final class FastifySyncClient {
    static let shared = FastifySyncClient()
    static func configureRemote(_ message: [String: Any], localUserId: String) -> [String: Any] { fatalError("Not used") }
    func relayPublic(_ message: [String: Any], reply: @escaping ([String: Any]) -> Void) { fatalError("No provider call in this test") }
}
func verifyGpsNativeContracts() throws {
    let context = JSContext()!
    let source = try String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8)
    context.evaluateScript(source)
    precondition(context.exception == nil)
    let route: [String: Any] = ["shape": CommandLine.arguments[3], "distance_m": 150, "duration_s": 20,
        "provider": "valhalla", "calculated_at": "2026-10-14T12:00:00.000Z",
        "maneuvers": [["instruction": "Continue", "begin": 0, "end": 2, "distance_m": 150, "duration_s": 20]]]
    let engine = context.objectForKeyedSubscript("AtomeGpsEngine")!.objectForKeyedSubscript("createGpsNavigationEngine")!.call(withArguments: [route])!
    let first = engine.invokeMethod("update", withArguments: [["lat": 48, "lon": 2, "accuracy": 5, "timestamp": 1000]])!.toDictionary()!
    precondition((first["intents"] as? [[String: Any]])?.first?["type"] as? String == "speak")
    let next = engine.invokeMethod("update", withArguments: [["lat": 48, "lon": 2.0005, "accuracy": 5, "timestamp": 2000]])!.toDictionary()!
    precondition((next["progress_m"] as? Double ?? 0) > 30)
    precondition((next["intents"] as? [[String: Any]])?.isEmpty == true)
    precondition(context.exception == nil)

    let create: [String: Any] = ["id": "gps_create", "kind": "set", "atome_id": "gps_trip_native", "scope": "global",
        "payload": ["props": ["type": "gps_trip", "name": "Paris", "revision": 0, "status": "planned", "route": route]]]
    let created = AiSRuntime.handleEventsMessage(["action": "commit", "event": create, "token": "gps_owner"])
    precondition(created["success"] as? Bool == true)
    let update: [String: Any] = ["id": "gps_start", "kind": "set", "atome_id": "gps_trip_native", "scope": "global",
        "payload": ["props": ["revision": 1, "status": "navigating"], "expected_versions": ["revision": 1]]]
    precondition(AiSRuntime.handleEventsMessage(["action": "commit", "event": update, "token": "gps_owner"])["success"] as? Bool == true)
    var stale = update; stale["id"] = "gps_stale"
    let refused = AiSRuntime.handleEventsMessage(["action": "commit", "event": stale, "token": "gps_owner"])
    precondition(refused["success"] as? Bool == false)
    precondition((refused["error"] as? String)?.contains("property_version_conflict") == true)
    let forbidden = AiSRuntime.handleStateCurrentMessage(["action": "get", "atome_id": "gps_trip_native", "token": "other_owner"])
    precondition(forbidden["success"] as? Bool == false)
    let state = AiSRuntime.handleStateCurrentMessage(["action": "get", "atome_id": "gps_trip_native", "token": "gps_owner"])["state"] as! [String: Any]
    precondition(state["project_id"] as? String == nil)
    precondition((state["properties"] as? [String: Any])?["revision"] as? Int == 1)
    print("GPS JavaScriptCore and AiS contracts passed")
}
try verifyGpsNativeContracts()
