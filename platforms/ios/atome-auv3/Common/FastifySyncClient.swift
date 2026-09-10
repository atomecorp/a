import Foundation

final class FastifySyncClient {
    static let shared = FastifySyncClient()

    private struct Configuration {
        let apiURL: URL
        let syncURL: URL
        let token: String
        let principalId: String
        let localPrincipalId: String
    }

    private final class ProviderChannel {
        let task: URLSessionWebSocketTask
        let principal: String
        let token: String
        let reply: ([String: Any]) -> Void
        var pending: Set<String> = []
        var voices: Set<String> = []
        init(task: URLSessionWebSocketTask, principal: String, token: String, reply: @escaping ([String: Any]) -> Void) {
            self.task = task; self.principal = principal; self.token = token; self.reply = reply
        }
        func close() {
            task.cancel(with: .goingAway, reason: nil)
            for id in pending { reply(["type":"ai-provider-response", "requestId":id, "ok":false,
                "success":false, "error":"provider_connection_closed"]) }
            for id in voices { reply(["type":"ai-realtime-event", "session_id":id,
                "event":["type":"error", "code":"provider_connection_closed"]]) }
            pending.removeAll(); voices.removeAll()
        }
    }
    private var providerChannels: [ObjectIdentifier: ProviderChannel] = [:]
    private let queue = DispatchQueue(label: "ais.fastify.sync.queue")
    private var session: URLSession?
    private var syncTask: URLSessionWebSocketTask?
    private var configuration: Configuration?
    private var activePrincipalId = ""
    private var subscribedStreams: Set<String> = []
    private var connecting = false
    private var connected = false
    private var reconnectDelay: TimeInterval = 1

    func connectIfConfigured() {
        queue.async { [weak self] in self?.connectLocked() }
    }

    func reloadConfiguration() {
        queue.async { [weak self] in
            self?.disconnectLocked()
            self?.connectLocked()
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
        queue.async { [weak self] in self?.pushLocked(events: events) }
    }

    private func connectLocked() {
        guard !connecting, !connected, let config = resolveConfiguration() else { return }
        connecting = true
        configuration = config
        activePrincipalId = config.principalId
        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: config.syncURL)
        self.session = session
        syncTask = task
        task.resume()
        connected = true
        connecting = false
        reconnectDelay = 1
        sendJSON(["type":"auth", "token":config.token], task: task)
        receiveNext(task)
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
        if type == "welcome" {
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
            subscribeAvailableStreams(task, announced: payload["streams"] as? [String] ?? [])
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
            return
        }
        if type == "error",
           let code = payload["code"] as? String,
           ["authentication_expired", "authentication_invalid"].contains(code) {
            scheduleReconnectLocked()
        }
    }

    private func persistDeliverAndAcknowledge(
        _ payload: [String: Any], task: URLSessionWebSocketTask
    ) {
        guard !activePrincipalId.isEmpty,
              let stream = payload["stream"] as? String,
              let sequence = number(payload["sequence"]), sequence > 0 else { return }
        do {
            let inserted = try AiSRuntime.persistRemoteSyncEnvelope(
                payload, principalId: activePrincipalId
            )
            if inserted { notifyLocal(payload) }
            sendJSON(["type":"ack", "stream":stream, "sequence":sequence], task: task)
        } catch {
            notifyLocal(["type":"sync:persistence-error", "stream":stream])
        }
    }

    private func subscribeAvailableStreams(
        _ task: URLSessionWebSocketTask, announced: [String] = []
    ) {
        guard !activePrincipalId.isEmpty else { return }
        var cursors = AiSRuntime.remoteSyncCursors(principalId: activePrincipalId)
        cursors.append(("directory.public", 0))
        var known: [String: Int64] = [:]
        for (stream, cursor) in cursors { known[stream] = cursor }
        cursors.append(contentsOf: announced.map { ($0, known[$0] ?? 0) })
        for (stream, cursor) in cursors where !subscribedStreams.contains(stream) {
            sendJSON(["type":"subscribe", "stream":stream, "cursor":cursor], task: task)
            subscribedStreams.insert(stream)
        }
    }

    private func pushLocked(events: [[String: Any]]) {
        guard let config = resolveConfiguration() else { return }
        let task = URLSession(configuration: .ephemeral).webSocketTask(with: config.apiURL)
        task.resume()
        let requestId = UUID().uuidString.lowercased()
        sendJSON([
            "type":"sync", "action":"push", "requestId":requestId,
            "token":config.token, "source":deviceSource(), "events":events
        ], task: task)
        task.receive { [weak self] result in
            self?.queue.async {
                guard case .success(let message) = result else {
                    task.cancel(with: .goingAway, reason: nil)
                    return
                }
                let data: Data?
                switch message {
                case .string(let text): data = text.data(using: .utf8)
                case .data(let bytes): data = bytes
                @unknown default: data = nil
                }
                if let data,
                   let value = try? JSONSerialization.jsonObject(with: data),
                   let response = value as? [String: Any],
                   response["requestId"] as? String == requestId,
                   response["success"] as? Bool == true,
                   let changes = response["changes"] as? [[String: Any]] {
                    for change in changes {
                        guard let stream = (change["stream_id"] ?? change["stream"]) as? String else { continue }
                        try? AiSRuntime.registerRemoteSyncStream(
                            principalId: config.principalId, streamId: stream
                        )
                    }
                    if let persistent = self?.syncTask { self?.subscribeAvailableStreams(persistent) }
                }
                task.cancel(with: .normalClosure, reason: nil)
            }
        }
    }

    private func sendJSON(_ payload: [String: Any], task: URLSessionWebSocketTask) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        task.send(.string(String(decoding: data, as: UTF8.self))) { [weak self] error in
            if error != nil { self?.queue.async { self?.scheduleReconnectLocked() } }
        }
    }

    private func notifyLocal(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        LocalHTTPServer.shared.handleFastifySyncMessage(String(decoding: data, as: UTF8.self))
        NotificationCenter.default.post(
            name: Notification.Name("AtomeRemoteSyncEvent"), object: nil, userInfo: payload
        )
    }

    private func scheduleHeartbeat(_ task: URLSessionWebSocketTask) {
        queue.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self, self.syncTask === task, self.connected else { return }
            self.sendJSON(["type":"ping"], task: task)
            self.subscribeAvailableStreams(task)
            self.scheduleHeartbeat(task)
        }
    }

    private func scheduleReconnectLocked() {
        guard connected || connecting else { return }
        connected = false
        connecting = false
        subscribedStreams.removeAll()
        syncTask?.cancel(with: .goingAway, reason: nil)
        syncTask = nil
        session?.invalidateAndCancel()
        session = nil
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, 30)
        queue.asyncAfter(deadline: .now() + delay) { [weak self] in self?.connectLocked() }
    }

    private func disconnectLocked() {
        providerChannels.values.forEach { $0.close() }
        providerChannels.removeAll()
        connected = false
        connecting = false
        subscribedStreams.removeAll()
        configuration = nil
        activePrincipalId = ""
        syncTask?.cancel(with: .normalClosure, reason: nil)
        syncTask = nil
        session?.invalidateAndCancel()
        session = nil
        reconnectDelay = 1
    }

    private func resolveConfiguration() -> Configuration? {
        let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
        let base = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_URL", "SQUIRREL_TAURI_FASTIFY_URL"])
        let explicitSync = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_WS_SYNC_URL"])
        let token = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_TOKEN", "SQUIRREL_FASTIFY_AUTH_TOKEN"])
        let principal = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_PRINCIPAL_ID"])
        guard !token.isEmpty, !principal.isEmpty else { return nil }
        let wsBase = base.replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let syncURL = URL(string: explicitSync.isEmpty ? wsBase + "/ws/sync" : explicitSync),
              let apiURL = URL(string: wsBase + "/ws/api") else { return nil }
        return Configuration(apiURL: apiURL, syncURL: syncURL, token: token, principalId: principal,
            localPrincipalId: firstValue(defaults, keys: ["SQUIRREL_FASTIFY_LOCAL_PRINCIPAL_ID"]))
    }

    private func firstValue(_ defaults: UserDefaults, keys: [String]) -> String {
        for key in keys {
            let value = defaults.string(forKey: key)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !value.isEmpty { return value }
        }
        return ""
    }

    private func deviceSource() -> String {
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
            if let current = self.providerChannels[connectionId], current.principal != localUserId || current.token != config.token {
                current.close()
                self.providerChannels.removeValue(forKey: connectionId)
            }
            if self.providerChannels[connectionId] == nil {
                if self.session == nil { self.session = URLSession(configuration: .ephemeral) }
                guard let task = self.session?.webSocketTask(with: config.apiURL) else { return }
                task.maximumMessageSize = 28_000_000
                let channel = ProviderChannel(task: task, principal: localUserId, token: config.token, reply: reply)
                self.providerChannels[connectionId] = channel
                task.resume(); self.receiveProvider(connectionId, channel: channel)
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

    private func receiveProvider(_ id: ObjectIdentifier, channel: ProviderChannel) {
        channel.task.receive { [weak self] result in
            self?.queue.async {
                guard let self, self.providerChannels[id]?.task === channel.task else { return }
                guard let config = self.resolveConfiguration(), config.localPrincipalId == channel.principal,
                      config.token == channel.token else {
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
            keys.forEach { defaults.removeObject(forKey: $0) }; shared.disconnect()
            return ["type":"sync-response", "requestId":requestId, "success":true, "configured":false]
        }
        let fields: [Any?] = [message["remote_user_id"] ?? message["remoteUserId"],
                      message["remote_token"] ?? message["remoteToken"], message["remote_url"] ?? message["remoteUrl"],
                      message["environment_fingerprint"] ?? message["environmentFingerprint"], localUserId]
        let values = fields.map { ($0 as? String) ?? "" }
        guard values.prefix(3).allSatisfy({ !$0.isEmpty }) else {
            return ["type":"sync-response", "requestId":requestId, "success":false, "error":"Invalid remote sync configuration"]
        }
        zip(keys, values).forEach { defaults.set($0.1, forKey: $0.0) }
        shared.reloadConfiguration()
        return ["type":"sync-response", "requestId":requestId, "success":true, "configured":true]
    }

}
