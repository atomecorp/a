import JavaScriptCore
// The production GPS controller compiled against a seam of its one store owner, the local
// server (atome_server::local, `LocalServer.swift`); the GPS engine runs in JavaScriptCore.
// The trip's versions and access are the local host's (Rust test
// `local_atome_native_contract_tests::a_gps_trip_keeps_its_revision_and_refuses_a_stale_version`).
final class LocalServer {
    static let shared = LocalServer()
    func answer(_ frame: [String: Any]) -> [String: Any] { fatalError("No store call in this test") }
    func verifiedUser(_ token: String) -> String? { nil }
}
func verifyGpsNativeContracts() throws {
    let context = JSContext()!
    let source = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
    context.evaluateScript(source)
    precondition(context.exception == nil)
    let route: [String: Any] = ["shape": CommandLine.arguments[2], "distance_m": 150, "duration_s": 20,
        "provider": "valhalla", "calculated_at": "2026-10-14T12:00:00.000Z",
        "maneuvers": [["instruction": "Continue", "begin": 0, "end": 2, "distance_m": 150, "duration_s": 20]]]
    let engine = context.objectForKeyedSubscript("AtomeGpsEngine")!.objectForKeyedSubscript("createGpsNavigationEngine")!.call(withArguments: [route])!
    let first = engine.invokeMethod("update", withArguments: [["lat": 48, "lon": 2, "accuracy": 5, "timestamp": 1000]])!.toDictionary()!
    precondition((first["intents"] as? [[String: Any]])?.first?["type"] as? String == "speak")
    let next = engine.invokeMethod("update", withArguments: [["lat": 48, "lon": 2.0005, "accuracy": 5, "timestamp": 2000]])!.toDictionary()!
    precondition((next["progress_m"] as? Double ?? 0) > 30)
    precondition((next["intents"] as? [[String: Any]])?.isEmpty == true)
    precondition(context.exception == nil)
    precondition(AppNativeGpsController.canHandle(command: "gps_invoke"))
    print("GPS JavaScriptCore contracts passed")
}
try verifyGpsNativeContracts()
