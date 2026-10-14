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
        _ = try persistRemoteSyncEnvelope(envelope, principalId:"cloud-account", localPrincipalId:"local-account")
        let visible = try listStateCurrent(db, projectId:nil, ownerId:"local-account", limit:100, offset:0)
        check(visible.count == 1 && visible[0]["id"] as? String == "project-restored", "restored own project must be visible locally")
        let journal = try query(db, "SELECT atome_id,actor,payload FROM events WHERE id = 'cloud-event'").first!
        check(journal["atome_id"] as? String == "project-restored", "object identity must be retained")
        check((parseJSONValue(stringValue(journal["actor"])) as? [String:Any])?["id"] as? String == "cloud-account", "remote history must retain its principal")
        _ = try persistRemoteSyncEnvelope(envelope, principalId:"cloud-account")
        check(try query(db, "SELECT id FROM events").count == 1, "duplicate delivery must not duplicate history")
        var shared = envelope
        shared["event_id"] = "shared-event"; shared["stream"] = "foreign-stream"; shared["atome_id"] = "shared-project"
        shared["vault_principal_id"] = "foreign-account"
        _ = try persistRemoteSyncEnvelope(shared, principalId:"cloud-account")
        check(try getStateCurrent(db, atomeId:"shared-project")?["owner_id"] as? String == "foreign-account", "foreign vault ownership must survive")
        check(try listStateCurrent(db, projectId:nil, ownerId:"local-account", limit:100, offset:0).count == 1, "foreign state must not acquire local write rights")
        var profile = envelope
        profile["event_id"] = "profile-event"; profile["atome_id"] = "cloud-account"; profile["sequence"] = 2
        profile["patch"] = ["scope":"global", "props":["type":"user", "nickname":"Restored profile"]]
        _ = try persistRemoteSyncEnvelope(profile, principalId:"cloud-account")
        check(try getStateCurrent(db, atomeId:"local-account")?["properties"] as? [String:Any] != nil, "profile must use the local identity binding")
        do {
            _ = try persistRemoteSyncEnvelope(envelope, principalId:"cloud-account", localPrincipalId:"someone-else")
            fatalError("wrong binding must be rejected")
        } catch { check(error.localizedDescription == "sync_identity_binding_unavailable", "binding failure must be explicit") }
        func event(_ id: String, _ target: String, _ ts: String = "2026-10-10T01:00:00Z") throws -> [String:Any] {
            try normalizeEventInput(["id":id, "atome_id":target, "ts":ts, "kind":"set", "props":["type":"project", "name":"Local"]], defaultActorId:"local-account")
        }
        let local = try event("offline-event", "offline-project")
        try appendEvent(db, event:local, enqueueRemote:true)
        try appendEvent(db, event:local, enqueueRemote:true)
        var pending = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        check(pending.count == 1, "offline commit must queue once atomically")
        let outgoing = try outboundSyncEvent(pending[0], localPrincipalId:"local-account", principalId:"cloud-account")
        check(outgoing["id"] as? String == "offline-event" && resolveActorId(outgoing["actor"]) == "cloud-account", "outbound normalization must retain event identity")
        try finishRemoteSync(pending, localPrincipalId:"local-account", error:"network_down")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").isEmpty, "failed head must respect its retry time")
        try execute(db, "UPDATE sync_queue SET next_retry_at = NULL")
        pending = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        check(pending.count == 1 && pending[0]["event_id"] as? String == "offline-event", "retry must retain the same durable ID")
        try finishRemoteSync(pending, localPrincipalId:"wrong-account")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").count == 1, "another account cannot acknowledge the queue")
        try finishRemoteSync(pending, localPrincipalId:"local-account")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").isEmpty, "confirmed receipt must retire the queue row")
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
        pending = try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        check(pending.count == 1 && pending[0]["event_id"] as? String == "old-unsent", "legacy send-once history must be requeued without recreating events")
        try prepareRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account")
        check(try pendingRemoteSync(principalId:"cloud-account", localPrincipalId:"local-account").count == 1, "requeue must be idempotent")
        var older = envelope
        older["event_id"] = "older-cloud"; older["sequence"] = 3; older["atome_id"] = "offline-project"
        _ = try persistRemoteSyncEnvelope(older, principalId:"cloud-account")
        let offline = try getStateCurrent(db, atomeId:"offline-project")?["properties"] as? [String:Any]
        check(offline?["name"] as? String == "Local", "older replay must preserve newer offline edits")
        var removal = local
        removal["id"] = "remove-name"; removal["ts"] = "2026-10-10T02:00:00Z"
        removal["payload"] = ["delete_keys":["name"]]
        try appendEvent(db, event:removal, enqueueRemote:true)
        older["event_id"] = "older-after-removal"; older["sequence"] = 4
        _ = try persistRemoteSyncEnvelope(older, principalId:"cloud-account")
        check((try getStateCurrent(db, atomeId:"offline-project")?["properties"] as? [String:Any])?["name"] == nil, "older replay must not resurrect a removed property")
        var deletion = local
        deletion["id"] = "local-delete"; deletion["kind"] = "delete"; deletion["ts"] = "2026-10-10T03:00:00Z"
        try appendEvent(db, event:deletion, enqueueRemote:true)
        older["event_id"] = "old-set-after-delete"; older["sequence"] = 5
        _ = try persistRemoteSyncEnvelope(older, principalId:"cloud-account")
        check(try query(db, "SELECT atome_id FROM atomes WHERE atome_id='offline-project' AND deleted_at IS NOT NULL").count == 1, "ordinary replay must preserve tombstones")
        older["event_id"] = "old-restore"; older["sequence"] = 6; older["kind"] = "restore"
        _ = try persistRemoteSyncEnvelope(older, principalId:"cloud-account")
        check(try query(db, "SELECT atome_id FROM atomes WHERE atome_id='offline-project' AND deleted_at IS NOT NULL").count == 1, "older restore must not beat a newer local deletion")
        older["event_id"] = "new-restore"; older["sequence"] = 7; older["timestamp"] = "2026-10-10T04:00:00Z"
        _ = try persistRemoteSyncEnvelope(older, principalId:"cloud-account")
        check(try query(db, "SELECT atome_id FROM atomes WHERE atome_id='offline-project' AND deleted_at IS NULL").count == 1, "newer winning restore must clear the tombstone")
        try execute(db, "UPDATE remote_sync_stream_cursors SET projection_version=0 WHERE stream_id='own-stream'")
        check(remoteSyncCursors(principalId:"cloud-account").contains { $0.0 == "own-stream" && $0.1 == 0 }, "legacy projections must request replay")
        try completeRemoteReplay(principalId:"cloud-account", streamIds:["own-stream"])
        check(remoteSyncCursors(principalId:"cloud-account").contains { $0.0 == "own-stream" && $0.1 == 7 }, "successful replay must retain the durable cursor")
        print("AiS sync recovery checks passed")
    }
}
try AiSRuntime.verifySyncRecovery()
