import Foundation

final class FastifySyncClient {
    static let shared = FastifySyncClient()

    struct Configuration: Equatable {
        let apiURL: URL
        let syncURL: URL
        let token: String
        let principalId: String
        let localPrincipalId: String
        let environmentFingerprint: String
        func sameIdentity(as other: Configuration) -> Bool {
            apiURL == other.apiURL && syncURL == other.syncURL && principalId == other.principalId
                && localPrincipalId == other.localPrincipalId && environmentFingerprint == other.environmentFingerprint
        }
    }

    private final class ProviderChannel {
        let task: URLSessionWebSocketTask
        let session: URLSession
        let configuration: Configuration
        let reply: ([String: Any]) -> Void
        var pending: Set<String> = []
        var voices: Set<String> = []
        init(task: URLSessionWebSocketTask, session: URLSession, configuration: Configuration, reply: @escaping ([String: Any]) -> Void) {
            self.session = session; self.task = task; self.configuration = configuration; self.reply = reply
        }
        func close() {
            task.cancel(with: .goingAway, reason: nil)
            session.invalidateAndCancel()
            for id in pending { reply(["type":"ai-provider-response", "requestId":id, "ok":false,
                "success":false, "error":"provider_connection_closed"]) }
            for id in voices { reply(["type":"ai-realtime-event", "session_id":id,
                "event":["type":"error", "code":"provider_connection_closed"]]) }
            pending.removeAll(); voices.removeAll()
        }
    }
    private var providerChannels: [ObjectIdentifier: ProviderChannel] = [:]
    let queue = DispatchQueue(label: "ais.fastify.sync.queue")
    var session: URLSession?
    var syncTask: URLSessionWebSocketTask?
    var configuration: Configuration?
    private var remoteAccessToken = ""
    var activePrincipalId = ""
    var outboxTask: URLSessionWebSocketTask?
    var outboxSession: URLSession?
    var outboxRows: [[String: Any]] = []
    var outboxRetry: DispatchWorkItem?
    // Media of the next batch is being uploaded: no second drain meanwhile.
    var outboxUploading = false
    // Rows of a refused batch still to be pushed one by one.
    var outboxIsolation = 0
    // Callers waiting for given Atomes to reach the server (`sync` / `flush`).
    var flushWaiters: [(atomeIds: [String], deadline: Date, reply: ([String: Any]) -> Void)] = []
    var subscribedStreams: Set<String> = []
    // Streams whose current replay applied at least one event: only those changed the
    // projection. Every connection replays thousands of per-atome streams, almost all
    // empty, and announcing each one made the Dashboard reload continuously.
    var replayDeliveredStreams: Set<String> = []
    var connecting = false
    var connected = false
    var reconnectDelay: TimeInterval = 1
    // Server limit for one `subscribe` carrying many cursors (`subscribe-batch` capability).
    static let subscribeBatchSize = 500
    var batchSubscribe = false
    // Subscriptions of this connection not yet answered. The backoff resets only once every one
    // is answered, so a server closing right after authentication keeps backing off.
    var pendingReplays = 0
    var batchSettlement = false
    var pendingSubscriptions: Set<String> = []
    var replayFailed = false
    var registeredSession = false
    var lastSyncError: String?
    // Token the current `/ws/sync` socket authenticated with.
    var sessionToken = ""
    let progress = AiSRuntime.syncProgress
    private var reconnectWork: DispatchWorkItem?
    var healthDeadline: DispatchWorkItem?
    var projectionNotice: DispatchWorkItem?

    // The application re-publishes the same remote configuration before every
    // authenticated request. Tearing the client down each time also closed the
    // provider channels, so the socket carrying an assistant request died of the
    // very call that prepared it, and the user read `provider_connection_closed`.
    // Token renewal (every ~14 min, and on each return to the foreground) keeps the same
    // principal: the new token is used from the next connection and outbox push on, and the
    // authenticated socket and in-flight push stay up. Fastify closes the socket itself
    // (`authentication_expired`) when the token it authenticated expires. Only a session
    // still waiting for its authentication restarts with the new token. Account, server or
    // environment changes still disconnect everything, provider channels included.
    func reloadConfiguration() {
        queue.async { [weak self] in
            guard let self else { return }
            let next = self.resolveConfiguration()
            if let next, let current = self.configuration, current.sameIdentity(as: next) {
                self.configuration = next
                if current.token != next.token, !self.registeredSession { self.scheduleReconnectLocked() }
                self.connectLocked(); return
            }
            self.disconnectLocked()
            self.connectLocked()
        }
    }

    func disconnect() {
        queue.async { [weak self] in self?.disconnectLocked() }
    }

    func pushCommittedResponse(_ response: [String: Any]) {
        guard response["success"] as? Bool == true else { return }
        var events: [[String: Any]] = []
        if let event = response["event"] as? [String: Any] { events.append(event) }
        if let batch = response["events"] as? [[String: Any]] { events.append(contentsOf: batch) }
        guard !events.isEmpty else { return }
        queue.async { [weak self] in self?.drainOutbox() }
    }

    func connectLocked() {
        guard !connecting, !connected, let config = resolveConfiguration() else { return }
        do { try AiSRuntime.prepareRemoteSync(principalId: config.principalId, localPrincipalId: config.localPrincipalId) }
        catch { notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription]); return }
        connecting = true
        reconnectWork?.cancel(); reconnectWork = nil
        replayFailed = false
        configuration = config
        activePrincipalId = config.principalId
        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: config.syncURL)
        task.maximumMessageSize = 28_000_000
        self.session = session
        syncTask = task
        task.resume()
        connected = true
        connecting = false
        pendingReplays = 0
        sessionToken = config.token
        sendJSON(["type":"auth", "token":config.token], task: task)
        receiveNext(task)
        publishProgress()
        scheduleHeartbeat(task)
    }

    private func receiveNext(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            self?.queue.async {
                guard let self, self.syncTask === task else { return }
                switch result {
                case .success(let message):
                    let data: Data?
                    switch message {
                    case .string(let text): data = text.data(using: .utf8)
                    case .data(let bytes): data = bytes
                    @unknown default: data = nil
                    }
                    if let data,
                       let value = try? JSONSerialization.jsonObject(with: data),
                       let payload = value as? [String: Any] {
                        self.handle(payload, task: task)
                    }
                    self.receiveNext(task)
                case .failure:
                    self.scheduleReconnectLocked()
                }
            }
        }
    }

    private func handle(_ payload: [String: Any], task: URLSessionWebSocketTask) {
        let type = payload["type"] as? String ?? ""
        if type == "pong" { healthDeadline?.cancel(); healthDeadline = nil; return }
        if type == "welcome" {
            batchSubscribe = (payload["capabilities"] as? [String] ?? []).contains("subscribe-batch")
            batchSettlement = (payload["capabilities"] as? [String] ?? []).contains("subscribe-batch-settlement")
            sendJSON([
                "type":"register", "source":deviceSource(),
                "capabilities":["sqlite-projection", "offline-lww"]
            ], task: task)
            return
        }
        if type == "registered" {
            if let principal = payload["principal_id"] as? String, !principal.isEmpty {
                activePrincipalId = principal
            }
            guard activePrincipalId == configuration?.principalId else { disconnectLocked(); return }
            // An authenticated, registered connection supersedes every error of the previous one.
            lastSyncError = nil
            registeredSession = true
            subscribeAvailableStreams(task, announced: payload["streams"] as? [String] ?? [])
            drainOutbox()
            publishProgress()
            return
        }
        if type == "replay-complete" {
            completeSubscription(payload)
            return
        }
        if type == "stream-available", let stream = payload["stream"] as? String {
            subscribeAvailableStreams(task, announced: [stream])
            return
        }
        if type == "event" {
            persistDeliverAndAcknowledge(payload, task: task)
            return
        }
        if type == "revoked", let stream = payload["stream"] as? String {
            subscribedStreams.remove(stream)
            notifyLocal(payload)
            if !batchSubscribe { settleReplay() }
            return
        }
        if type == "error", let code = payload["code"] as? String {
            let authentication = ["authentication_expired", "authentication_invalid"].contains(code)
            // A revoked stream answers its subscription with a denial at every connection:
            // normal authorization, not a synchronization failure. Neither is the expiry of a
            // token already renewed: the reconnection authenticates with the new one.
            let renewed = authentication && configuration.map { $0.token != sessionToken } == true
            if code != "stream_access_denied" && !renewed { lastSyncError = code }
            if authentication { scheduleReconnectLocked() }
            else if code == "stream_access_denied", payload["stream"] is String, !batchSubscribe { settleReplay() }
            publishProgress()
        }
    }

    private func persistDeliverAndAcknowledge(
        _ payload: [String: Any], task: URLSessionWebSocketTask
    ) {
        guard !activePrincipalId.isEmpty,
              let stream = payload["stream"] as? String,
              let sequence = number(payload["sequence"]), sequence > 0 else { return }
        do {
            let delivery = try AiSRuntime.persistRemoteSyncEnvelope(
                payload, principalId: activePrincipalId, localPrincipalId: configuration?.localPrincipalId
            )
            if delivery == .applied && payload["replay"] as? Bool == true { stageProjectionNotice(stream) }
            if delivery == .applied && payload["replay"] as? Bool != true && payload["source"] as? String != deviceSource() {
                notifyLocal(["type":"sync:projection-ready", "stream":stream, "replay":false])
            }
            // Recorded in `remote_sync_rejected_events`; acknowledged so delivery moves on.
            if case .rejected(let reason) = delivery {
                notifyLocal(["type":"sync:event-rejected", "stream":stream, "sequence":sequence, "error":reason])
            }
            sendJSON(["type":"ack", "stream":stream, "sequence":sequence], task: task)
        } catch {
            notifyLocal(["type":"sync:persistence-error", "stream":stream, "error":error.localizedDescription])
            scheduleReconnectLocked()
        }
    }

    func sendJSON(_ payload: [String: Any], task: URLSessionWebSocketTask) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        task.send(.string(String(decoding: data, as: UTF8.self))) { [weak self] error in
            if error != nil { self?.queue.async { guard let self, self.syncTask === task else { return }; self.scheduleReconnectLocked() } }
        }
    }

    func notifyLocal(_ payload: [String: Any]) {
        let type = payload["type"] as? String ?? ""
        if type == "sync:persistence-error" { replayFailed = true }
        if ["sync:persistence-error", "sync:delivery-error"].contains(type) { lastSyncError = payload["error"] as? String; publishProgress() }
        if type == "sync:delivery-complete" { lastSyncError = nil; publishProgress() }
        var scoped = payload
        scoped["local_user_id"] = configuration?.localPrincipalId
        guard let data = try? JSONSerialization.data(withJSONObject: scoped) else { return }
        LocalHTTPServer.shared.handleFastifySyncMessage(String(decoding: data, as: UTF8.self))
        NotificationCenter.default.post(
            name: Notification.Name("AtomeRemoteSyncEvent"), object: nil, userInfo: payload
        )
    }

    func scheduleReconnectLocked() {
        guard connected || connecting else { return }
        healthDeadline?.cancel(); healthDeadline = nil
        flushProjectionNotice()
        connected = false
        connecting = false
        registeredSession = false
        pendingSubscriptions.removeAll()
        subscribedStreams.removeAll()
        replayDeliveredStreams.removeAll()
        syncTask?.cancel(with: .goingAway, reason: nil)
        syncTask = nil
        session?.invalidateAndCancel()
        session = nil
        publishProgress()
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, 30)
        reconnectWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.connectLocked() }
        reconnectWork = work
        queue.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func disconnectLocked() {
        reconnectWork?.cancel(); reconnectWork = nil
        healthDeadline?.cancel(); healthDeadline = nil
        projectionNotice?.cancel(); projectionNotice = nil
        registeredSession = false; pendingSubscriptions.removeAll(); pendingReplays = 0
        cancelOutbox(); outboxIsolation = 0
        providerChannels.values.forEach { $0.close() }
        providerChannels.removeAll()
        connected = false
        connecting = false
        subscribedStreams.removeAll()
        replayDeliveredStreams.removeAll()
        configuration = nil
        activePrincipalId = ""
        progress.replace([:])
        syncTask?.cancel(with: .normalClosure, reason: nil)
        syncTask = nil
        session?.invalidateAndCancel()
        session = nil
        reconnectDelay = 1
    }

    func resolveConfiguration() -> Configuration? {
        let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
        let base = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_URL", "SQUIRREL_TAURI_FASTIFY_URL"])
        let explicitSync = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_WS_SYNC_URL"])
        defaults.removeObject(forKey: "SQUIRREL_FASTIFY_TOKEN")
        defaults.removeObject(forKey: "SQUIRREL_FASTIFY_AUTH_TOKEN")
        let token = remoteAccessToken
        let principal = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_PRINCIPAL_ID"])
        guard !token.isEmpty, !principal.isEmpty else { return nil }
        let wsBase = base.replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let syncURL = URL(string: explicitSync.isEmpty ? wsBase + "/ws/sync" : explicitSync),
              let apiURL = URL(string: wsBase + "/ws/api") else { return nil }
        return Configuration(apiURL: apiURL, syncURL: syncURL, token: token, principalId: principal,
            localPrincipalId: firstValue(defaults, keys: ["SQUIRREL_FASTIFY_LOCAL_PRINCIPAL_ID"]),
            environmentFingerprint: firstValue(defaults, keys: ["SQUIRREL_SYNC_ENVIRONMENT_FINGERPRINT"]))
    }

    func firstValue(_ defaults: UserDefaults, keys: [String]) -> String {
        for key in keys {
            let value = defaults.string(forKey: key)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !value.isEmpty { return value }
        }
        return ""
    }

    func deviceSource() -> String {
        let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
        let key = "SQUIRREL_SYNC_DEVICE_ID"
        if let current = defaults.string(forKey: key), !current.isEmpty { return "ios:\(current)" }
        let value = UUID().uuidString.lowercased()
        defaults.set(value, forKey: key)
        return "ios:\(value)"
    }

    private func number(_ value: Any?) -> Int64? {
        if let number = value as? NSNumber { return number.int64Value }
        if let text = value as? String { return Int64(text) }
        return nil
    }
    func closeProvider(connectionId: ObjectIdentifier) {
        queue.async { self.providerChannels.removeValue(forKey: connectionId)?.close() }
    }

    func sendProvider(_ payload: [String: Any], connectionId: ObjectIdentifier, localUserId: String,
                      reply: @escaping ([String: Any]) -> Void) {
        queue.async {
            guard let config = self.resolveConfiguration(), config.localPrincipalId == localUserId else {
                reply(["type":"ai-provider-response", "requestId":payload["requestId"] ?? NSNull(),
                       "ok":false, "success":false, "error":"provider_principal_unavailable"])
                return
            }
            if let current = self.providerChannels[connectionId], !current.configuration.sameIdentity(as: config) {
                current.close()
                self.providerChannels.removeValue(forKey: connectionId)
            }
            if self.providerChannels[connectionId] == nil {
                // Sync reconnect invalidates its URLSession. The provider channel owns
                // its session so pending voice/media work survives that recovery.
                let providerSession = URLSession(configuration: .ephemeral)
                let task = providerSession.webSocketTask(with: config.apiURL)
                task.maximumMessageSize = 28_000_000
                let channel = ProviderChannel(task: task, session: providerSession, configuration: config, reply: reply)
                self.providerChannels[connectionId] = channel
                task.resume(); self.receiveProvider(connectionId, channel: channel)
                self.scheduleProviderHeartbeat(connectionId, channel: channel)
            }
            guard let channel = self.providerChannels[connectionId] else { return }
            if let id = payload["requestId"] as? String { channel.pending.insert(id) }
            if let body = payload["payload"] as? [String: Any], let id = body["session_id"] as? String {
                if payload["action"] as? String == "realtime-connect" { channel.voices.insert(id) }
                if payload["action"] as? String == "realtime-close" { channel.voices.remove(id) }
            }
            var request = payload; request["token"] = config.token
            do {
                let data = try JSONSerialization.data(withJSONObject: request)
                channel.task.send(.data(data)) { error in
                    if error != nil { reply(["type":"ai-provider-response", "requestId":payload["requestId"] ?? NSNull(),
                        "ok":false, "success":false, "error":"provider_connection_failed"]) }
                }
            } catch {
                reply(["type":"ai-provider-response", "requestId":payload["requestId"] ?? NSNull(),
                       "ok":false, "success":false, "error":"provider_request_invalid"])
            }
        }
    }

    private func scheduleProviderHeartbeat(_ id: ObjectIdentifier, channel: ProviderChannel) {
        // Realtime audio bypasses this control socket. Keep it alive even while
        // no tool call is pending, just as the application transport does.
        queue.asyncAfter(deadline: .now() + 20) { [weak self, weak channel] in
            guard let self, let channel, self.providerChannels[id] === channel else { return }
            channel.task.sendPing { [weak self, weak channel] error in
                self?.queue.async {
                    guard let self, let channel, self.providerChannels[id] === channel else { return }
                    if error != nil { self.providerChannels.removeValue(forKey: id)?.close(); return }
                    self.scheduleProviderHeartbeat(id, channel: channel)
                }
            }
        }
    }

    private func receiveProvider(_ id: ObjectIdentifier, channel: ProviderChannel) {
        channel.task.receive { [weak self] result in
            self?.queue.async {
                guard let self, self.providerChannels[id]?.task === channel.task else { return }
                guard let config = self.resolveConfiguration(), config.sameIdentity(as: channel.configuration) else {
                    self.providerChannels.removeValue(forKey: id)?.close(); return
                }
                switch result {
                case .success(let message):
                    let data: Data?
                    switch message {
                    case .data(let bytes): data = bytes
                    case .string(let text): data = text.data(using: .utf8)
                    @unknown default: data = nil
                    }
                    guard let data, let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                        self.providerChannels.removeValue(forKey: id)?.close(); return
                    }
                    if ["ai-provider-response", "ai-provider-progress", "ai-realtime-event"].contains(value["type"] as? String ?? "") {
                        if value["type"] as? String == "ai-provider-response", let requestId = value["requestId"] as? String {
                            channel.pending.remove(requestId)
                        }
                        channel.reply(value)
                    }
                    self.receiveProvider(id, channel: channel)
                case .failure:
                    self.providerChannels.removeValue(forKey: id)?.close()
                }
            }
        }
    }

    static func configureRemote(_ message: [String: Any], localUserId: String) -> [String: Any] {
        let requestId = message["requestId"] ?? NSNull()
        let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
        let keys = ["SQUIRREL_FASTIFY_PRINCIPAL_ID", "SQUIRREL_FASTIFY_TOKEN", "SQUIRREL_FASTIFY_URL",
                    "SQUIRREL_SYNC_ENVIRONMENT_FINGERPRINT", "SQUIRREL_FASTIFY_LOCAL_PRINCIPAL_ID"]
        if message["action"] as? String == "clear-remote" {
            keys.forEach { defaults.removeObject(forKey: $0) }
            shared.queue.async { shared.remoteAccessToken = ""; shared.disconnectLocked() }
            return ["type":"sync-response", "requestId":requestId, "success":true, "configured":false]
        }
        let fields: [Any?] = [message["remote_user_id"] ?? message["remoteUserId"],
                      message["remote_token"] ?? message["remoteToken"], message["remote_url"] ?? message["remoteUrl"],
                      message["environment_fingerprint"] ?? message["environmentFingerprint"], localUserId]
        let values = fields.map { ($0 as? String) ?? "" }
        guard values.prefix(3).allSatisfy({ !$0.isEmpty }) else {
            return ["type":"sync-response", "requestId":requestId, "success":false, "error":"Invalid remote sync configuration"]
        }
        zip(keys, values).filter { $0.0 != "SQUIRREL_FASTIFY_TOKEN" }.forEach { defaults.set($0.1, forKey: $0.0) }
        defaults.removeObject(forKey: "SQUIRREL_FASTIFY_TOKEN")
        shared.queue.async { shared.remoteAccessToken = values[1]; shared.reloadConfiguration() }
        return ["type":"sync-response", "requestId":requestId, "success":true, "configured":true]
    }

}
