import Foundation

// Subscription settlement belongs to the native delivery owner; SQLite owns checkpoints.
extension FastifySyncClient {
    func subscribeAvailableStreams(
        _ task: URLSessionWebSocketTask, announced: [String] = []
    ) {
        guard !activePrincipalId.isEmpty else { return }
        var cursors: [(String, Int64)]
        do { cursors = try AiSRuntime.remoteSyncCursors(principalId: activePrincipalId) }
        catch { replayFailed = true; notifyLocal(["type":"sync:persistence-error", "error":"sync_cursor_read_failed"]); return }
        if !cursors.contains(where: { $0.0 == "directory.public" }) { cursors.append(("directory.public", 0)) }
        var known: [String: Int64] = [:]
        for (stream, cursor) in cursors { known[stream] = cursor }
        cursors.append(contentsOf: announced.map { ($0, known[$0] ?? 0) })
        var pending: [[String: Any]] = []
        for (stream, cursor) in cursors where !subscribedStreams.contains(stream) {
            pending.append(["stream":stream, "cursor":cursor])
            subscribedStreams.insert(stream)
        }
        let size = batchSubscribe ? Self.subscribeBatchSize : 1
        for start in stride(from: 0, to: pending.count, by: size) {
            let batch = Array(pending[start..<min(start + size, pending.count)])
            var message: [String: Any] = batchSubscribe
                ? ["type":"subscribe", "streams":batch]
                : batch[0].merging(["type":"subscribe"]) { $1 }
            if batchSubscribe && batchSettlement {
                let id = UUID().uuidString.lowercased()
                message["subscription_id"] = id; pendingSubscriptions.insert(id)
            }
            sendJSON(message, task: task)
            pendingReplays += 1
        }
    }

    func settleReplay() {
        pendingReplays = max(0, pendingReplays - 1)
        if pendingReplays == 0 { reconnectDelay = 1 }
    }


    func completeSubscription(_ payload: [String: Any]) {
        if batchSubscribe && batchSettlement && payload["subscription_id"] == nil { return }
        if let id = payload["subscription_id"] as? String, pendingSubscriptions.remove(id) == nil { return }
        let entries = (payload["settled_streams"] ?? payload["streams"]) as? [[String: Any]]
        let streams = entries?.compactMap { $0["stream"] as? String }
            ?? [payload["stream"] as? String].compactMap { $0 }
        let checkpoints = entries ?? [payload]
        var cursors: [String: Int64] = [:]
        for entry in checkpoints {
            if let stream = entry["stream"] as? String, let cursor = entry["cursor"] as? NSNumber { cursors[stream] = cursor.int64Value }
        }
        do { try AiSRuntime.completeRemoteReplay(principalId: activePrincipalId, streamIds: streams, cursors: cursors) }
        catch { replayFailed = true; notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription]) }
        let delivered = streams.filter { replayDeliveredStreams.remove($0) != nil }
        if !delivered.isEmpty { notifyLocal(["type":"sync:projection-ready", "streams":delivered, "replay":true]) }
        settleReplay()
        if pendingReplays == 0 && !replayFailed { lastSyncError = nil }
        publishProgress()
    }
}
