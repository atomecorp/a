import Foundation

extension FastifySyncClient {
    func connectIfConfigured() {
        queue.async { [weak self] in
            guard let self else { return }
            // A status published while suspended (unreadable database, heartbeat timeout)
            // would otherwise stay on screen until the next sync event.
            if let task = self.syncTask { self.verifyHealth(task); self.publishProgress() }
            else { self.connectLocked() }
        }
    }

    // One application-level ping probe per socket, including a bounded foreground check.
    func verifyHealth(_ task: URLSessionWebSocketTask) {
        guard syncTask === task, healthDeadline == nil else { return }
        // Shown only until the reconnection registers (`registered` clears it).
        let deadline = DispatchWorkItem { [weak self] in
            guard let self, self.syncTask === task else { return }
            self.lastSyncError = "sync_heartbeat_timeout"
            self.scheduleReconnectLocked()
        }
        healthDeadline = deadline
        queue.asyncAfter(deadline: .now() + 10, execute: deadline)
        sendJSON(["type":"ping"], task: task)
    }

    func scheduleHeartbeat(_ task: URLSessionWebSocketTask) {
        queue.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self, self.syncTask === task, self.connected else { return }
            self.verifyHealth(task)
            self.subscribeAvailableStreams(task)
            self.drainOutbox()
            self.scheduleHeartbeat(task)
        }
    }

    func stageProjectionNotice(_ stream: String) {
        replayDeliveredStreams.insert(stream)
        guard projectionNotice == nil else { return }
        let notice = DispatchWorkItem { [weak self] in self?.flushProjectionNotice() }
        projectionNotice = notice
        queue.asyncAfter(deadline: .now() + 0.5, execute: notice)
    }

    func flushProjectionNotice() {
        projectionNotice?.cancel(); projectionNotice = nil
        let streams = Array(replayDeliveredStreams)
        replayDeliveredStreams.removeAll()
        if !streams.isEmpty { notifyLocal(["type":"sync:projection-ready", "streams":streams, "replay":true]) }
    }
}
