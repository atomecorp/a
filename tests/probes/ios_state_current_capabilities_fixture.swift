// Test-only platform seams. Production AiS code above is compiled unchanged.
enum SandboxPathValidator {
    static func primaryRoot() -> URL? { URL(fileURLWithPath: CommandLine.arguments[1]) }
    static func pluginContainerRoot() -> URL? { nil }
}
enum FastifySyncClient {
    static func configureRemote(_ message: [String: Any], localUserId: String) -> [String: Any] { fatalError("Not used") }
}
final class iCloudFileManager {
    static let shared = iCloudFileManager()
    func getCurrentStorageURL() -> URL? { SandboxPathValidator.primaryRoot() }
}
extension AiSRuntime {
    static func verifyStateCurrentCapabilities() throws {
        func check(_ condition: Bool) { precondition(condition) }
        let connection = try openDatabase()
        let ownerToken = try createToken(userId: "owner", username: "owner")
        try upsertStateCurrent(connection, atomeId: "object-1", ownerId: "owner", properties: ["type": "image", "content": "ok", "width": 40], now: isoNow())
        try upsertStateCurrent(connection, atomeId: "object-foreign", ownerId: "someone-else", properties: ["type": "image", "content": "hidden"], now: isoNow())

        let getResponse = handleStateCurrentMessage([
            "type": "state-current", "action": "get", "requestId": "capability-get",
            "token": ownerToken, "atome_id": "object-1"
        ])
        check(getResponse["success"] as? Bool == true)
        let state = getResponse["state"] as? [String: Any] ?? [:]
        check(state["atome_id"] as? String == "object-1")
        let capabilities = state["capabilities"] as? [String: Any] ?? [:]
        check(capabilities["read"] as? Bool == true)
        check(capabilities["write"] as? Bool == true)
        check(capabilities["create"] as? Bool == true)
        check(capabilities["delete"] as? Bool == true)
        check(capabilities["share"] as? Bool == true)
        let propertyCapabilities = capabilities["properties"] as? [String: Any] ?? [:]
        check(propertyCapabilities.keys.sorted() == ["content", "type", "width"])
        let content = propertyCapabilities["content"] as? [String: Any] ?? [:]
        check(content["write"] as? Bool == true)
        check(content["delete"] as? Bool == true)
        check(content["share"] as? Bool == true)
        check((propertyCapabilities["content"] as? [String: Any])?["read"] == nil)

        let listResponse = handleStateCurrentMessage([
            "type": "state-current", "action": "list", "requestId": "capability-list", "token": ownerToken
        ])
        check(listResponse["success"] as? Bool == true)
        let states = listResponse["states"] as? [[String: Any]] ?? []
        check(states.count == 1)
        check(states.first?["atome_id"] as? String == "object-1")
        let listedCapabilities = states.first?["capabilities"] as? [String: Any] ?? [:]
        check(listedCapabilities["write"] as? Bool == true)
        let listedProperties = listedCapabilities["properties"] as? [String: Any] ?? [:]
        check((listedProperties["width"] as? [String: Any])?["write"] as? Bool == true)

        let deniedGet = handleStateCurrentMessage([
            "type": "state-current", "action": "get", "requestId": "capability-denied",
            "token": ownerToken, "atome_id": "object-foreign"
        ])
        check(deniedGet["success"] as? Bool == false)
        check(deniedGet["error"] as? String == "Access denied")
        check(deniedGet["state"] == nil)

        let missingGet = handleStateCurrentMessage([
            "type": "state-current", "action": "get", "requestId": "capability-missing",
            "token": ownerToken, "atome_id": "object-unknown"
        ])
        check(missingGet["success"] as? Bool == false)
        check(missingGet["error"] as? String == "State not found")

        print("AiS state_current capability checks passed")
    }
}
try AiSRuntime.verifyStateCurrentCapabilities()
