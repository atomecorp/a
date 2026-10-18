// Device and auth transport seams only; the persistence and sync owners are production code.
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
    static func verifySyncRecovery() throws {
        func check(_ condition: Bool, _ reason: String) { precondition(condition, reason) }
        let db = try openDatabase()
        try execute(db, "INSERT INTO auth_local_grants (grant_id,local_principal,remote_principal,key_id,key_scope,generation,locked) VALUES ('own-grant','local-account','cloud-account','device','app',0,0)")
        let envelope: [String: Any] = ["event_id":"cloud-event", "stream":"own-stream", "sequence":1,
            "timestamp":"2026-10-10T00:00:00Z", "atome_id":"project-restored", "kind":"set",
            "vault_principal_id":"cloud-account", "patch":["props":["type":"project", "name":"Restored"]]]
        _ = try persistRemoteSyncEnvelopes([envelope], principalId:"cloud-account", localPrincipalId:"local-account")[0]
        let visible = try listStateCurrent(db, projectId:nil, ownerId:"local-account", limit:100, offset:0)
        check(visible.count == 1 && visible[0]["id"] as? String == "project-restored", "restored own project must be visible locally")
        let journal = try query(db, "SELECT atome_id,actor,payload FROM events WHERE id = 'cloud-event'").first!
        check(journal["atome_id"] as? String == "project-restored", "object identity must be retained")
        check((parseJSONValue(stringValue(journal["actor"])) as? [String:Any])?["id"] as? String == "cloud-account", "remote history must retain its principal")
        _ = try persistRemoteSyncEnvelopes([envelope], principalId:"cloud-account")[0]
        check(try query(db, "SELECT id FROM events").count == 1, "duplicate delivery must not duplicate history")
        var shared = envelope
        shared["event_id"] = "shared-event"; shared["stream"] = "foreign-stream"; shared["atome_id"] = "shared-project"
        shared["vault_principal_id"] = "foreign-account"
        _ = try persistRemoteSyncEnvelopes([shared], principalId:"cloud-account")[0]
        check(try getStateCurrent(db, atomeId:"shared-project")?["owner_id"] as? String == "foreign-account", "foreign vault ownership must survive")
        check(try listStateCurrent(db, projectId:nil, ownerId:"local-account", limit:100, offset:0).count == 2, "shared projects must be readable without changing their owner")
        var profile = envelope
        profile["event_id"] = "profile-event"; profile["atome_id"] = "cloud-account"; profile["sequence"] = 2
        profile["patch"] = ["scope":"global", "props":["type":"user", "nickname":"Restored profile"]]
        _ = try persistRemoteSyncEnvelopes([profile], principalId:"cloud-account")[0]
        check(try getStateCurrent(db, atomeId:"local-account")?["properties"] as? [String:Any] != nil, "profile must use the local identity binding")
        var first = envelope, poisoned = envelope, last = envelope
        first["event_id"] = "run-1"; first["stream"] = "run-stream"; first["sequence"] = 1; first["atome_id"] = "run-project-1"
        poisoned["event_id"] = "run-2"; poisoned["stream"] = "run-stream"; poisoned["sequence"] = 2; poisoned.removeValue(forKey: "vault_principal_id")
        last["event_id"] = "run-3"; last["stream"] = "run-stream"; last["sequence"] = 3; last["atome_id"] = "run-project-3"
        let run = try persistRemoteSyncEnvelopes([first, poisoned, last], principalId:"cloud-account")
        check(run == [.applied, .rejected("sync_vault_owner_missing"), .applied], "a rejected envelope must not undo the rest of its run")
        check(try getStateCurrent(db, atomeId:"run-project-3") != nil, "envelopes after a rejected one must be applied")
        check(intValue(try query(db, "SELECT last_sequence FROM remote_sync_stream_cursors WHERE stream_id = 'run-stream'").first?["last_sequence"], defaultValue: 0) == 3, "the run must advance its stream cursor")
        // A storage failure inside a run is transient: the whole run, envelopes before it
        // included, is rolled back and thrown, and no cursor moves until it is replayed.
        let busy: @convention(c) (OpaquePointer?, Int32, UnsafeMutablePointer<OpaquePointer?>?) -> Void = { context, _, _ in
            sqlite3_result_error_code(context, SQLITE_BUSY)
        }
        let interrupt: @convention(c) (OpaquePointer?, Int32, UnsafeMutablePointer<OpaquePointer?>?) -> Void = { context, _, _ in
            sqlite3_interrupt(sqlite3_context_db_handle(context)); sqlite3_result_int(context, 1)
        }
        check(sqlite3_create_function(db, "fixture_busy", 0, SQLITE_UTF8, nil, busy, nil, nil) == SQLITE_OK
              && sqlite3_create_function(db, "fixture_interrupt", 0, SQLITE_UTF8, nil, interrupt, nil, nil) == SQLITE_OK, "fixture storage failures")
        var steady = envelope, failing = envelope
        steady["event_id"] = "transient-1"; steady["stream"] = "transient-stream"; steady["sequence"] = 1; steady["atome_id"] = "steady-project"
        failing["event_id"] = "transient-2"; failing["stream"] = "transient-stream"; failing["sequence"] = 2; failing["atome_id"] = "failing-project"
        func runLeftNothing() throws -> Bool {
            try query(db, "SELECT id FROM events WHERE id IN ('transient-1', 'transient-2')").isEmpty
                && query(db, "SELECT stream_id FROM remote_sync_stream_cursors WHERE stream_id = 'transient-stream'").isEmpty
                && query(db, "SELECT stream_id FROM remote_sync_rejected_events WHERE stream_id = 'transient-stream'").isEmpty
                && getStateCurrent(db, atomeId:"steady-project") == nil
        }
        for failure in ["SELECT fixture_busy()",
                        // SQLite rolls an interrupted write transaction back itself.
                        "SELECT count(*) FROM (WITH RECURSIVE c(x) AS (SELECT fixture_interrupt() UNION ALL SELECT x + 1 FROM c WHERE x < 100) SELECT x FROM c)"] {
            try execute(db, "CREATE TRIGGER failing_event BEFORE INSERT ON events WHEN NEW.atome_id = 'failing-project' BEGIN \(failure); END")
            do {
                _ = try persistRemoteSyncEnvelopes([steady, failing], principalId:"cloud-account")
                fatalError("a transient storage failure must be thrown")
            } catch {
                check(["database is locked", "interrupted"].contains(error.localizedDescription), "the storage failure itself is reported: \(error.localizedDescription)")
            }
            check(sqlite3_get_autocommit(db) != 0, "no transaction is left open")
            check(try runLeftNothing(), "a failed run keeps nothing, not even the envelopes before the failure")
            try execute(db, "DROP TRIGGER failing_event")
        }
        check(try persistRemoteSyncEnvelopes([steady, failing], principalId:"cloud-account") == [.applied, .applied], "the replayed run applies once storage recovers")
        do {
            _ = try persistRemoteSyncEnvelopes([envelope], principalId:"cloud-account", localPrincipalId:"someone-else")[0]
            fatalError("wrong binding must be rejected")
        } catch { check(error.localizedDescription == "sync_identity_binding_unavailable", "binding failure must be explicit") }
        func event(_ id: String, _ target: String, _ ts: String = "2026-10-10T01:00:00Z") throws -> [String:Any] {
            try normalizeEventInput(["id":id, "atome_id":target, "ts":ts, "kind":"set", "props":["type":"project", "name":"Local"]], defaultActorId:"local-account")
        }
        let local = try event("offline-event", "offline-project")
        try appendEvent(db, event:local, enqueueRemote:true)
        try appendEvent(db, event:local, enqueueRemote:true)
        var pending = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows
        check(pending.count == 1, "offline commit must queue once atomically")
        let outgoing = try outboundSyncEvent(pending[0], localPrincipalId:"local-account", principalId:"cloud-account")
        check(outgoing["id"] as? String == "offline-event" && resolveActorId(outgoing["actor"]) == "cloud-account", "outbound normalization must retain event identity")
        try finishRemoteSync(pending, localPrincipalId:"local-account", error:"network_down")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows.isEmpty, "failed head must respect its retry time")
        try execute(db, "UPDATE sync_queue SET next_retry_at = NULL")
        pending = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows
        check(pending.count == 1 && pending[0]["event_id"] as? String == "offline-event", "retry must retain the same durable ID")
        try finishRemoteSync(pending, localPrincipalId:"wrong-account")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows.count == 1, "another account cannot acknowledge the queue")
        try finishRemoteSync(pending, localPrincipalId:"local-account")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows.isEmpty, "confirmed receipt must retire the queue row")
        try execute(db, "CREATE TRIGGER reject_queue BEFORE INSERT ON sync_queue WHEN NEW.atome_id = 'broken' BEGIN SELECT RAISE(ABORT,'outbox_rejected'); END")
        do {
            try appendEvent(db, event:event("broken-event", "broken"), enqueueRemote:true)
            fatalError("outbox failure must roll back journal and projection")
        } catch { check(error.localizedDescription.contains("outbox_rejected"), "outbox failure must escape") }
        check(try query(db, "SELECT id FROM events WHERE id = 'broken-event'").isEmpty, "failed queue must roll back the event")
        check(try getStateCurrent(db, atomeId:"broken") == nil, "failed queue must roll back state")
        do {
            try appendEvents(db, events:[event("batch-prefix", "prefix"), event("batch-broken", "broken")], enqueueRemote:true)
            fatalError("batch must roll back entirely")
        } catch { }
        check(try getStateCurrent(db, atomeId:"prefix") == nil, "failed batch must not retain its prefix")
        try appendEvent(db, event:event("old-unsent", "historical-project"))
        try prepareRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        pending = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows
        check(pending.count == 1 && pending[0]["event_id"] as? String == "old-unsent", "legacy send-once history must be requeued without recreating events")
        try prepareRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows.count == 1, "requeue must be idempotent")
        var older = envelope
        older["event_id"] = "older-cloud"; older["sequence"] = 3; older["atome_id"] = "offline-project"
        _ = try persistRemoteSyncEnvelopes([older], principalId:"cloud-account")[0]
        let offline = try getStateCurrent(db, atomeId:"offline-project")?["properties"] as? [String:Any]
        check(offline?["name"] as? String == "Local", "older replay must preserve newer offline edits")
        var removal = local
        removal["id"] = "remove-name"; removal["ts"] = "2026-10-10T02:00:00Z"
        removal["payload"] = ["delete_keys":["name"]]
        try appendEvent(db, event:removal, enqueueRemote:true)
        older["event_id"] = "older-after-removal"; older["sequence"] = 4
        _ = try persistRemoteSyncEnvelopes([older], principalId:"cloud-account")[0]
        check((try getStateCurrent(db, atomeId:"offline-project")?["properties"] as? [String:Any])?["name"] == nil, "older replay must not resurrect a removed property")
        var deletion = local
        deletion["id"] = "local-delete"; deletion["kind"] = "delete"; deletion["ts"] = "2026-10-10T03:00:00Z"
        try appendEvent(db, event:deletion, enqueueRemote:true)
        older["event_id"] = "old-set-after-delete"; older["sequence"] = 5
        _ = try persistRemoteSyncEnvelopes([older], principalId:"cloud-account")[0]
        check(try query(db, "SELECT atome_id FROM atomes WHERE atome_id='offline-project' AND deleted_at IS NOT NULL").count == 1, "ordinary replay must preserve tombstones")
        older["event_id"] = "old-restore"; older["sequence"] = 6; older["kind"] = "restore"
        _ = try persistRemoteSyncEnvelopes([older], principalId:"cloud-account")[0]
        check(try query(db, "SELECT atome_id FROM atomes WHERE atome_id='offline-project' AND deleted_at IS NOT NULL").count == 1, "older restore must not beat a newer local deletion")
        older["event_id"] = "new-restore"; older["sequence"] = 7; older["timestamp"] = "2026-10-10T04:00:00Z"
        _ = try persistRemoteSyncEnvelopes([older], principalId:"cloud-account")[0]
        check(try query(db, "SELECT atome_id FROM atomes WHERE atome_id='offline-project' AND deleted_at IS NULL").count == 1, "newer winning restore must clear the tombstone")
        try execute(db, "UPDATE remote_sync_stream_cursors SET projection_version=0 WHERE stream_id='own-stream'")
        check(try remoteSyncCursors(principalId:"cloud-account").contains { $0.0 == "own-stream" && $0.1 == 0 }, "legacy projections must request replay")
        try completeRemoteReplay(principalId:"cloud-account", streamIds:["own-stream"], cursors:["own-stream":7])
        check(try remoteSyncCursors(principalId:"cloud-account").contains { $0.0 == "own-stream" && $0.1 == 7 }, "successful replay must retain the durable cursor")
        // A local set that changes nothing is not an event: nothing is written, queued or delivered.
        func originSet(_ id: String, _ props: [String:Any]) throws -> [String:Any] {
            try normalizeEventInput(["id":id, "atome_id":"import-origin", "ts":"2026-10-10T05:00:00Z", "kind":"set", "props":props], defaultActorId:"local-account")
        }
        func outboxStatus(_ id: String) throws -> String? { try query(db, "SELECT status FROM sync_queue WHERE event_id = ?", [.text(id)]).first?["status"] as? String }
        func recorded(_ id: String) throws -> Bool { try !query(db, "SELECT id FROM events WHERE id = ?", [.text(id)]).isEmpty }
        let owedBefore = try remoteSyncPendingCount(localPrincipalId:"local-account")
        try appendEvent(db, event:originSet("origin-create", ["type":"import_origin", "kind":"import_origin", "canonical_id":"contact-1"]), enqueueRemote:true)
        check(try outboxStatus("origin-create") == "pending", "the first event of an Atome is always delivered")
        try appendEvent(db, event:originSet("origin-same", ["type":"import_origin", "kind":"import_origin", "canonical_id":"contact-1"]), enqueueRemote:true)
        try appendEvent(db, event:originSet("origin-empty", [:]), enqueueRemote:true)
        check(try !recorded("origin-same") && outboxStatus("origin-same") == nil, "an identical rewrite, identity included, is not an event")
        check(try !recorded("origin-empty") && outboxStatus("origin-empty") == nil, "an empty set is not an event")
        var moved = try originSet("origin-move", [:])
        moved["parent_id"] = "molecule"
        try appendEvent(db, event:moved, enqueueRemote:true)
        check(try recorded("origin-move") && outboxStatus("origin-move") == "pending", "a move carried by the envelope is a change")
        try appendEvent(db, event:originSet("origin-edit", ["type":"import_origin", "canonical_id":"contact-2"]), enqueueRemote:true)
        let edit = try query(db, "SELECT payload FROM events WHERE id = 'origin-edit'").first
        let editProps = (parseJSONValue(stringValue(edit?["payload"])) as? [String:Any])?["props"] as? [String:Any]
        check(editProps?.keys.sorted() == ["canonical_id"], "a real change keeps only its changed keys")
        try appendEvent(db, event:originSet("origin-retype", ["type":"contact_origin"]), enqueueRemote:true)
        check(try outboxStatus("origin-retype") == "pending", "a type change is delivered")
        // Rows queued before local commits stopped creating them are classified by the outbox reads.
        let legacy = try originSet("origin-backlog", ["type":"contact_origin"])
        try appendEvent(db, event:legacy)
        try enqueueSyncEvent(db, event:legacy)
        try prepareRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        let due = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").rows
        check(try outboxStatus("origin-backlog") == "unchanged", "a queued unchanged set is classified by the outbox")
        check(!due.contains { $0["event_id"] as? String == "origin-backlog" } && due.contains { $0["event_id"] as? String == "origin-retype" },
              "classified rows leave the delivery order, real changes stay in it")
        let owed = try remoteSyncPendingCount(localPrincipalId:"local-account")
        check(owed == owedBefore + 4, "only the four changing events are owed")
        let status = handleSyncMessage(["type":"sync", "action":"get-pending", "token":"local-account", "requestId":"status"])
        check(status["pending_delivery_count"] as? Int == owed && (status["changes"] as? [[String:Any]])?.count == owed, "the page reads the same count")
        // A replay echoes this device's own commits back behind the cursor: projecting one again
        // only where it changes the state, the cursor always moves.
        func ownCommit(_ id: String, _ target: String, _ ts: String) throws {
            try appendEvent(db, event:normalizeEventInput(["id":id, "atome_id":target, "ts":ts, "kind":"set",
                "props":["type":"project", "name":"Mine", "color":"red"]], defaultActorId:"local-account"), enqueueRemote:true)
        }
        func deliver(_ id: String, _ target: String, _ ts: String, stream: String = "echo-stream", sequence: Int, kind: String = "set", patch: [String:Any], decisions: Any = NSNull()) throws -> RemoteSyncDelivery {
            try persistRemoteSyncEnvelopes([["event_id":id, "stream":stream, "sequence":sequence, "timestamp":ts, "atome_id":target, "kind":kind,
                "vault_principal_id":"cloud-account", "patch":patch, "lww_decisions":decisions]], principalId:"cloud-account")[0]
        }
        func echo(_ id: String, _ target: String, _ ts: String, stream: String = "echo-stream", sequence: Int, props: [String:Any] = ["type":"project", "name":"Mine", "color":"red"], decisions: Any = NSNull()) throws -> RemoteSyncDelivery {
            try deliver(id, target, ts, stream:stream, sequence:sequence, patch:["props":props, "expected_versions":["name":0]], decisions:decisions)
        }
        func projection(_ target: String) throws -> [String:Any] { try query(db, "SELECT version, updated_at, properties FROM state_current WHERE atome_id = ?", [.text(target)]).first ?? [:] }
        func echoCursor() throws -> Int64 { intValue(try query(db, "SELECT last_sequence FROM remote_sync_stream_cursors WHERE stream_id = 'echo-stream'").first?["last_sequence"], defaultValue: 0) }
        try ownCommit("echo-own", "echo-project", "2026-10-10T06:00:00Z")
        let committed = try projection("echo-project"), writesBefore = sqlite3_total_changes(db)
        check(try echo("echo-own", "echo-project", "2026-10-10T06:00:00Z", sequence:1) == .unchanged, "an own echo with no server decision changes nothing")
        check(try sqlite3_total_changes(db) - writesBefore == 1 && echoCursor() == 1, "an own echo writes its cursor only")
        check(try projection("echo-project")["version"] as? Int64 == committed["version"] as? Int64
              && projection("echo-project")["updated_at"] as? String == committed["updated_at"] as? String, "state_current is not rewritten")
        // An equal-clock rival applied after the commit took both keys; the server decided the
        // echo lost `name` and won `color`: the echo still reconciles the key it wins.
        try ownCommit("echo-contested", "echo-contested-project", "2026-10-10T07:00:00Z")
        check(try echo("echo-rival", "echo-contested-project", "2026-10-10T07:00:00Z", stream:"rival-stream", sequence:1,
                       props:["name":"Theirs", "color":"blue"]) == .applied, "the rival is applied")
        let lost: [String:Any] = ["type":["winner":true], "color":["winner":true],
                                  "name":["winner":false, "reason":"equal_timestamp_event_id", "compared_event_id":"echo-rival"]]
        check(try echo("echo-contested", "echo-contested-project", "2026-10-10T07:00:00Z", sequence:2, decisions:lost) == .applied, "a losing echo is reconciled")
        let contested = parseJSONValue(stringValue(try projection("echo-contested-project")["properties"])) as? [String:Any]
        check(try contested?["name"] as? String == "Theirs" && contested?["color"] as? String == "red" && echoCursor() == 2, "the server decisions are projected")
        // A winner with a newer clock applied before an own commit: the commit overwrote it here,
        // the server decided its echo lost those keys. The winner is projected again, at its own
        // clock, for each key the commit still holds; a key written since keeps its newer write.
        func lostTo(_ winner: String) -> [String:Any] { ["winner":false, "reason":"older_timestamp", "compared_event_id":winner] }
        check(try deliver("late-winner", "late-project", "2026-10-10T09:00:00Z", stream:"winner-stream", sequence:1,
                          patch:["props":["type":"project", "name":"Theirs", "color":"blue", "label":"Kept"]]) == .applied, "the winner is applied")
        try appendEvent(db, event:normalizeEventInput(["id":"late-own", "atome_id":"late-project", "ts":"2026-10-10T08:00:00Z", "kind":"set",
            "payload":["props":["name":"Mine", "color":"red"], "delete_keys":["label"]]], defaultActorId:"local-account"), enqueueRemote:true)
        try appendEvent(db, event:normalizeEventInput(["id":"late-newer", "atome_id":"late-project", "ts":"2026-10-10T10:00:00Z", "kind":"set",
            "props":["color":"green"]], defaultActorId:"local-account"), enqueueRemote:true)
        check(try deliver("late-own", "late-project", "2026-10-10T08:00:00Z", sequence:3, patch:["props":["name":"Mine", "color":"red"], "delete_keys":["label"]],
                          decisions:["name":lostTo("late-winner"), "color":lostTo("late-winner"), "label":lostTo("late-winner")]) == .applied, "a lost echo reconciles its keys")
        let late = parseJSONValue(stringValue(try projection("late-project")["properties"])) as? [String:Any]
        check(late?["name"] as? String == "Theirs" && late?["label"] as? String == "Kept", "the winner's values replace the lost writes")
        check(late?["color"] as? String == "green", "a key written since the commit keeps its newer write")
        check(try query(db, "SELECT updated_at FROM particles WHERE atome_id = 'late-project' AND particle_key = 'name'").first?["updated_at"] as? String == "2026-10-10T09:00:00Z",
              "the winner is projected at its own clock")
        _ = try deliver("late-between", "late-project", "2026-10-10T08:30:00Z", stream:"winner-stream", sequence:2, patch:["props":["name":"Between"]])
        check((parseJSONValue(stringValue(try projection("late-project")["properties"])) as? [String:Any])?["name"] as? String == "Theirs",
              "an event older than the winner no longer takes the key")
        check(try echoCursor() == 3, "the cursor moves")
        // Same for the lifecycle: an own restore older than a deletion already applied here.
        check(try deliver("gone-create", "gone-project", "2026-10-10T05:00:00Z", stream:"winner-stream", sequence:3, patch:["props":["type":"project", "name":"Gone"]]) == .applied
              && deliver("gone-delete", "gone-project", "2026-10-10T09:00:00Z", stream:"winner-stream", sequence:4, kind:"delete", patch:[:]) == .applied, "the deletion is applied")
        try appendEvent(db, event:normalizeEventInput(["id":"gone-restore", "atome_id":"gone-project", "ts":"2026-10-10T08:00:00Z", "kind":"restore"],
            defaultActorId:"local-account"), enqueueRemote:true)
        func deletedAt() throws -> Any? { try query(db, "SELECT deleted_at FROM atomes WHERE atome_id = 'gone-project'").first?["deleted_at"] }
        check(try deletedAt() is NSNull, "the local restore is applied")
        check(try deliver("gone-restore", "gone-project", "2026-10-10T08:00:00Z", sequence:4, kind:"restore", patch:[:],
                          decisions:["__lifecycle__":lostTo("gone-delete")]) == .applied, "a lost restore echo is reconciled")
        check(try deletedAt() as? String == "2026-10-10T09:00:00Z", "the winning deletion is projected again")
        check(try deliver("gone-restore", "gone-project", "2026-10-10T08:00:00Z", sequence:4, kind:"restore", patch:[:],
                          decisions:["__lifecycle__":lostTo("gone-delete")]) == .unchanged, "a repeated echo at the cursor changes nothing")
        // A legacy cursor still repairs the projection of the events it replays.
        try execute(db, "UPDATE remote_sync_stream_cursors SET projection_version = 0 WHERE stream_id = 'echo-stream'")
        check(try echo("echo-own", "echo-project", "2026-10-10T06:00:00Z", sequence:1) == .applied, "a legacy cursor re-projects its echoes")
        print("AiS sync recovery checks passed")
    }
}
try AiSRuntime.verifySyncRecovery()
