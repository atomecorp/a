import Foundation

extension FastifySyncClient {
    func publishProgress() {
        guard let config = configuration else { progress.replace([:]); return }
        // An unreadable outbox count describes this snapshot only: storing it in `lastSyncError`
        // kept the failure on screen after the database answered again.
        let pending: Int?
        do { pending = try AiSRuntime.remoteSyncPendingCount(localPrincipalId: config.localPrincipalId) }
        catch { pending = nil }
        let errorCode = pending == nil ? "sync_status_unavailable" : lastSyncError
        let status: [String: Any] = [
            "principal_id":config.localPrincipalId, "environment_fingerprint":config.environmentFingerprint,
            "connection_state":["authentication_expired", "authentication_invalid"].contains(lastSyncError ?? "") ? "auth_required" : (connected ? (registeredSession ? "connected" : "connecting") : "disconnected"),
            "restore_state":replayFailed ? "error" : (!connected ? "unknown" : (pendingReplays > 0 || !registeredSession ? "receiving" : "ready")),
            "pending_replay_count":pendingReplays, "pending_delivery_count":pending.map { $0 as Any } ?? NSNull(),
            "last_error_code":errorCode.map { $0 as Any } ?? NSNull()
        ]
        progress.replace(status)
        notifyLocal(["type":"sync:status", "data":status])
    }
}
