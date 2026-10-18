import Foundation

// Events delivered by `/ws/sync` are persisted in runs (`AiSRuntime.persistRemoteSyncEnvelopes`).
// A run closes at `inboundRunLimit` events, `inboundRunDelay` after its first event, and
// before any message other than a transport answer (`pong`, `acked`) is handled, so
// `replay-complete` still follows its events. Fastify answers every ack with `acked`: closing
// on it cut replays into runs of ~6 events. The limit bounds how long a run holds the
// database queue the page also reads through (iPad Pro M5: ~0.5 ms per envelope plus ~2 ms
// per COMMIT), and a larger run shares more pages per COMMIT (real owners on a Mac, logical
// writes per envelope: 166 KB alone, 101 KB in runs of 6, 65 KB in runs of 64). Acks follow
// the commit.
// A run lost to a disconnection moved no cursor: the next connection replays it.
extension FastifySyncClient {
    static let inboundRunLimit = 64
    static let inboundRunDelay: TimeInterval = 0.02

    func receiveEvent(_ payload: [String: Any], task: URLSessionWebSocketTask) {
        guard !activePrincipalId.isEmpty, let stream = payload["stream"] as? String, !stream.isEmpty,
              let sequence = number(payload["sequence"]), sequence > 0 else { return }
        inboundRun.append(payload)
        if inboundRun.count >= Self.inboundRunLimit { persistInboundRun(task); return }
        guard inboundFlush == nil else { return }
        let flush = DispatchWorkItem { [weak self, weak task] in
            guard let self, let task else { return }
            self.persistInboundRun(task)
        }
        inboundFlush = flush
        queue.asyncAfter(deadline: .now() + Self.inboundRunDelay, execute: flush)
    }

    func persistInboundRun(_ task: URLSessionWebSocketTask) {
        let run = inboundRun
        dropInboundRun()
        guard !run.isEmpty, syncTask === task else { return }
        do {
            let deliveries = try AiSRuntime.persistRemoteSyncEnvelopes(
                run, principalId: activePrincipalId, localPrincipalId: configuration?.localPrincipalId
            )
            // Fastify acknowledgements are cumulative per stream: the highest sequence covers the run.
            var acknowledged: [String: Int64] = [:]
            for (payload, delivery) in zip(run, deliveries) {
                guard let stream = payload["stream"] as? String, let sequence = number(payload["sequence"]) else { continue }
                if delivery == .applied && payload["replay"] as? Bool == true { stageProjectionNotice(stream) }
                if delivery == .applied && payload["replay"] as? Bool != true && payload["source"] as? String != deviceSource() {
                    notifyLocal(["type":"sync:projection-ready", "stream":stream, "replay":false])
                }
                // Recorded in `remote_sync_rejected_events`; acknowledged so delivery moves on.
                if case .rejected(let reason) = delivery {
                    notifyLocal(["type":"sync:event-rejected", "stream":stream, "sequence":sequence, "error":reason])
                }
                acknowledged[stream] = max(acknowledged[stream] ?? 0, sequence)
            }
            for (stream, sequence) in acknowledged {
                sendJSON(["type":"ack", "stream":stream, "sequence":sequence], task: task)
            }
        } catch {
            notifyLocal(["type":"sync:persistence-error", "stream":run.first?["stream"] as? String ?? "", "error":error.localizedDescription])
            scheduleReconnectLocked()
        }
    }

    func dropInboundRun() {
        inboundFlush?.cancel()
        inboundFlush = nil
        inboundRun.removeAll()
    }
}
