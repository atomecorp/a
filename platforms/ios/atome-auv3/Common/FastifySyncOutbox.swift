import Foundation

// Single serialized delivery consumer of the durable AiS outbox.
extension FastifySyncClient {
    func drainOutbox() {
        guard outboxTask == nil, let config = configuration, resolveConfiguration() == config else { return }
        outboxRetry?.cancel(); outboxRetry = nil
        do {
            let rows = try AiSRuntime.pendingRemoteSync(principalId: config.principalId, localPrincipalId: config.localPrincipalId)
            guard !rows.isEmpty else { return }
            let events = try rows.map { try AiSRuntime.outboundSyncEvent($0, localPrincipalId: config.localPrincipalId, principalId: config.principalId) }
            let requestId = UUID().uuidString.lowercased()
            let data = try JSONSerialization.data(withJSONObject: [
                "type":"sync", "action":"push", "requestId":requestId, "token":config.token,
                "source":deviceSource(), "events":events
            ])
            let session = URLSession(configuration: .ephemeral)
            let task = session.webSocketTask(with: config.apiURL)
            task.maximumMessageSize = 28_000_000
            outboxSession = session; outboxTask = task; outboxRows = rows
            task.resume()
            // A missing receipt must release the socket and retry the same durable IDs.
            queue.asyncAfter(deadline: .now() + 30) { [weak self] in
                guard let self, self.outboxTask === task else { return }
                self.finishOutbox(task, config: config, error: "sync_receipt_timeout")
            }
            task.send(.data(data)) { [weak self] error in
                self?.queue.async {
                    guard let self, self.outboxTask === task else { return }
                    if error != nil { self.finishOutbox(task, config: config, error: "sync_send_failed") }
                    else { self.receiveOutbox(task, requestId: requestId, config: config) }
                }
            }
        } catch {
            notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription])
        }
    }

    private func receiveOutbox(_ task: URLSessionWebSocketTask, requestId: String, config: Configuration) {
        task.receive { [weak self] result in
            self?.queue.async {
                guard let self, self.outboxTask === task else { return }
                guard self.configuration == config else { self.cancelOutbox(); return }
                do {
                    let message = try result.get()
                    let data: Data
                    switch message {
                    case .data(let bytes): data = bytes
                    case .string(let text): data = Data(text.utf8)
                    @unknown default: throw AiSError("sync_receipt_invalid")
                    }
                    guard let response = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AiSError("sync_receipt_invalid") }
                    // /ws/api may announce its welcome before the correlated command reply.
                    guard response["requestId"] as? String == requestId else {
                        self.receiveOutbox(task, requestId: requestId, config: config); return
                    }
                    guard response["success"] as? Bool == true,
                          let changes = response["changes"] as? [[String: Any]] else {
                        throw AiSError(response["error"] as? String ?? "sync_push_refused")
                    }
                    let expected = Set(self.outboxRows.map { $0["event_id"] as? String ?? "" })
                    let received = Set(changes.compactMap { $0["id"] as? String })
                    guard expected == received else { throw AiSError("sync_receipt_incomplete") }
                    for change in changes {
                        guard let stream = (change["stream_id"] ?? change["stream"]) as? String else { throw AiSError("sync_receipt_stream_missing") }
                        try AiSRuntime.registerRemoteSyncStream(principalId: config.principalId, streamId: stream)
                    }
                    self.finishOutbox(task, config: config, error: nil)
                    if let persistent = self.syncTask { self.subscribeAvailableStreams(persistent) }
                } catch {
                    self.finishOutbox(task, config: config, error: error.localizedDescription)
                }
            }
        }
    }

    private func finishOutbox(_ task: URLSessionWebSocketTask, config: Configuration, error: String?) {
        guard outboxTask === task else { return }
        let delay = min(pow(2, Double(min((outboxRows.map { AiSRuntime.intValue($0["attempts"], defaultValue: 0) }.max() ?? 0) + 1, 6))), 60)
        do { try AiSRuntime.finishRemoteSync(outboxRows, localPrincipalId: config.localPrincipalId, error: error) }
        catch { notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription]) }
        cancelOutbox()
        if let error {
            notifyLocal(["type":"sync:delivery-error", "error":error])
            let retry = DispatchWorkItem { [weak self] in self?.drainOutbox() }
            outboxRetry = retry
            queue.asyncAfter(deadline: .now() + delay, execute: retry)
        } else {
            notifyLocal(["type":"sync:delivery-complete"])
            drainOutbox()
        }
    }

    func cancelOutbox() {
        outboxRetry?.cancel(); outboxRetry = nil
        outboxTask?.cancel(with: .goingAway, reason: nil); outboxTask = nil
        outboxSession?.invalidateAndCancel(); outboxSession = nil
        outboxRows.removeAll()
    }
}
