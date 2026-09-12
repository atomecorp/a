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
    static func verifyEventTransactions() throws {
        func check(_ condition: Bool) { precondition(condition) }
        let connection = try openDatabase()
        func count(_ table: String) throws -> Int64 {
            (try query(connection, "SELECT count(*) AS n FROM \(table)").first?["n"] as? Int64) ?? -1
        }
        func event(_ id: String, _ object: String) throws -> [String: Any] {
            try normalizeEventInput(["id": id, "atome_id": object, "kind": "set", "props": ["type": "image", "name": "fixture", "width": 40]], defaultActorId: "owner")
        }
        let first = try event("event-1", "object-1")
        try appendEvent(connection, event: first)
        let plan = try query(connection, "EXPLAIN QUERY PLAN SELECT COALESCE(MAX(sequence), 0) + 1 FROM events WHERE stream_id = ? AND sequence IS NOT NULL", [.text("ais:owner:object-1")])
        check(plan.contains { ($0["detail"] as? String)?.contains("USING COVERING INDEX idx_events_stream_sequence") == true })
        let particles = try count("particles")
        check(try count("events") == 1)
        check(try count("state_current") == 1)
        try appendEvent(connection, event: first)
        check(try count("events") == 1)
        check(try count("particles") == particles)
        // Force the last projection write to fail after earlier writes succeeded.
        try execute(connection, "CREATE TRIGGER reject_projection BEFORE INSERT ON state_current WHEN NEW.atome_id = 'broken' BEGIN SELECT RAISE(ABORT, 'projection_rejected'); END")
        do {
            try appendEvent(connection, event: event("event-broken", "broken"))
            fatalError("Projection failure must escape")
        } catch { check(error.localizedDescription.contains("projection_rejected")) }
        check(try count("events") == 1)
        check(try count("atomes") == 1)
        check(try count("particles") == particles)
        check(sqlite3_get_autocommit(connection) == 1)
        // Releasing an event savepoint must not commit the enclosing sync transaction.
        try execute(connection, "BEGIN IMMEDIATE")
        try appendEvent(connection, event: event("event-nested", "nested"))
        check(sqlite3_get_autocommit(connection) == 0)
        try execute(connection, "ROLLBACK")
        check(try count("events") == 1)
        try appendEvent(connection, event: event("event-after", "after"))
        check(try count("events") == 2)
        check(try count("state_current") == 2)
        print("AiS transaction checks passed")
    }
}
try AiSRuntime.verifyEventTransactions()
