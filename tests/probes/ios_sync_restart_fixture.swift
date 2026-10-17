// Synthetic filesystem and authentication only; real AiS SQLite owners.
enum SandboxPathValidator {
    static func primaryRoot() -> URL? { URL(fileURLWithPath: CommandLine.arguments[1]) }
    static func pluginContainerRoot() -> URL? { nil }
}
enum FastifySyncClient {
    static func configureRemote(_ message: [String: Any], localUserId: String) -> [String: Any] { fatalError("unused") }
}
final class iCloudFileManager {
    static let shared = iCloudFileManager()
    func getCurrentStorageURL() -> URL? { SandboxPathValidator.primaryRoot() }
}
extension AiSRuntime {
    static func verifyRestart() throws {
        func check(_ value: Bool) { precondition(value) }
        let mode = CommandLine.arguments[2]
        if mode == "legacy" {
            var handle: OpaquePointer?
            precondition(sqlite3_open(SandboxPathValidator.primaryRoot()!.appendingPathComponent("adole.db").path, &handle) == SQLITE_OK)
            try execute(handle, "CREATE TABLE remote_sync_stream_cursors (principal_id TEXT NOT NULL, stream_id TEXT NOT NULL, last_sequence INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(principal_id,stream_id))")
            try execute(handle, "INSERT INTO remote_sync_stream_cursors VALUES ('cloud','stream',12,'2026-10-10')")
            sqlite3_close(handle)
        }
        let db = try openDatabase()
        if mode == "fresh" || mode == "legacy" {
            try execute(db, "INSERT INTO auth_local_grants (grant_id,local_principal,remote_principal,key_id,key_scope,generation,locked) VALUES ('grant','local','cloud','key','scope',0,0)")
            let records: [(String, String, [String:Any])] = [
                ("cloud", "user", ["name":"Principal", "eve_profile":["name":"Principal", "preferences":["language":"fr"]]]),
                ("contact", "contact", ["name":"Contact", "phones":[["label":"home", "value":"+33100000000"]]]),
                ("calendar", "calendar", ["name":"Personal calendar"]),
                ("appointment", "calendar_event", ["title":"Appointment", "calendar_scope":"personal", "calendar_id":"calendar", "start":"2026-10-17T09:00:00Z", "end":"2026-10-17T10:00:00Z", "recurrence":["freq":"WEEKLY"], "alarms":[["offsetMinutes":-30]]])
            ]
            for (index, record) in records.enumerated() {
                var props = record.2; props["type"] = record.1
                let remote: [String:Any] = ["event_id":"personal-\(index)", "stream":"personal", "sequence":index + 1,
                    "timestamp":"2026-10-10T00:00:00Z", "atome_id":record.0, "vault_principal_id":"cloud", "kind":"set",
                    "patch":["scope":"global", "props":props]]
                _ = try persistRemoteSyncEnvelope(remote, principalId:"cloud")
                let target = record.0 == "cloud" ? "local" : record.0
                let local = try normalizeEventInput(["id":"offline-\(index)", "atome_id":target, "type":record.1,
                    "ts":"2026-10-11T00:00:00Z", "kind":"set", "scope":"global", "props":["note":"Saved offline"]], defaultActorId:"local")
                try appendEvent(db, event:local, enqueueRemote:true)
            }
        }
        let sequence = mode == "advance" ? 2 : 1
        if ["fresh", "legacy", "advance"].contains(mode) {
            let envelope: [String:Any] = ["event_id":"event-\(sequence)", "stream":"stream", "sequence":sequence,
                "timestamp":"2026-10-10T00:00:0\(sequence)Z", "atome_id":"project", "vault_principal_id":"cloud", "kind":"set",
                "patch":["props":["type":"project", "name":"Version \(sequence)"]]]
            check(try persistRemoteSyncEnvelope(envelope, principalId:"cloud"))
        }
        if mode == "complete" { try completeRemoteReplay(principalId:"cloud", streamIds:["stream"], cursors:["stream":2]) }
        let checkpoint = try remoteSyncCursors(principalId:"cloud").first { $0.0 == "stream" }!.1
        let row = try query(db, "SELECT projection_version, last_sequence FROM remote_sync_stream_cursors WHERE stream_id='stream'").first!
        check(try getStateCurrent(db, atomeId:"project") != nil)
        for target in ["local", "contact", "calendar", "appointment"] {
            let state = try getStateCurrent(db, atomeId:target)!
            let props = state["properties"] as! [String:Any]
            check(props["note"] as? String == "Saved offline")
            check(state["project_id"] == nil || state["project_id"] is NSNull)
        }
        let appointment = try getStateCurrent(db, atomeId:"appointment")!["properties"] as! [String:Any]
        check((appointment["recurrence"] as? [String:Any])?["freq"] as? String == "WEEKLY")
        check((appointment["alarms"] as? [[String:Any]])?.count == 1)
        let contact = try getStateCurrent(db, atomeId:"contact")!["properties"] as! [String:Any]
        check((contact["phones"] as? [[String:Any]])?.first?["value"] as? String == "+33100000000")
        let queued = try pendingRemoteSync(principalId:"cloud", localPrincipalId:"local")
        check(Set(queued.compactMap { $0["event_id"] as? String }) == Set((0..<4).map { "offline-\($0)" }))
        print("cursor=\(checkpoint) version=\(row["projection_version"]!) stored=\(row["last_sequence"]!)")
    }
}
try AiSRuntime.verifyRestart()
