//
//  LocalHTTPServer.swift
//  atome AUv3
//
//  Lightweight in‑process HTTP 1.1 server dedicated to serving local audio files
//  to the WKWebView (workaround for custom scheme media limitations inside AUv3).
//  Focus: minimal dependencies, small memory footprint, Range support, M4A only (extensible).
//
//  NOTE: This is intentionally ultra‑compact; not a general purpose server.
//
import Foundation
import Network
import AVFoundation
import CryptoKit
import SQLite3

final class LocalHTTPServer {
    static let shared = LocalHTTPServer()

    private var listener: NWListener?
    private let queue = DispatchQueue(label: "local.http.server.queue")
    private(set) var port: UInt16?
    private var started = false

    // Simple cache of file lengths to avoid stat() every range chunk
    private var lengthCache: [String: UInt64] = [:]
    private var faststartCache: [String: URL] = [:] // original path -> optimized path
    private var faststartInFlight: Set<String> = []
    private var faststartFailed: Set<String> = []
    private let faststartQueue = DispatchQueue(label: "local.http.server.faststart", qos: .utility)
    private let allowedAudioExtensions: Set<String> = ["m4a", "mp3", "wav"]
    private var activeAudioKeys: Set<String> = []
    private var pendingAudioWork: [String: [() -> Void]] = [:]
    private var cancelledConnections: Set<ObjectIdentifier> = []
    private var wsConnections: [ObjectIdentifier: NWConnection] = [:]
    private var wsStates: [ObjectIdentifier: WebSocketState] = [:]
    private var httpStates: [ObjectIdentifier: HTTPRequestState] = [:]

    private struct WebSocketState {
        var buffer = Data()
        var clientId: String
    }

    private struct HTTPRequestState {
        var buffer = Data()
        var expectedLength: Int?
    }

    func start(preferredPort: UInt16? = nil) {
        guard !started else { return }
        started = true
        queue.async { [weak self] in
            guard let self = self else { return }
            do {
                let params = NWParameters.tcp
                params.allowLocalEndpointReuse = true
                if let p = preferredPort, let nwPort = NWEndpoint.Port(rawValue: p) {
                    self.listener = try NWListener(using: params, on: nwPort)
                } else {
                    self.listener = try NWListener(using: params)
                }
                self.listener?.newConnectionHandler = { [weak self] connection in
                    self?.handle(connection: connection)
                }
                self.listener?.stateUpdateHandler = { [weak self] state in
                    guard let self = self else { return }
                    switch state {
                    case .ready:
                        if let port = self.listener?.port?.rawValue { self.port = port }
                        print("🌐 LocalHTTPServer ready on 127.0.0.1:\(self.port ?? 0)")
                    case .failed(let error):
                        print("❌ LocalHTTPServer failed: \(error)")
                    case .cancelled:
                        print("ℹ️ LocalHTTPServer cancelled")
                    default: break
                    }
                }
                self.listener?.start(queue: self.queue)
            } catch {
                print("❌ LocalHTTPServer listener error: \(error)")
            }
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        started = false
        port = nil
    }

    private func handle(connection: NWConnection) {
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                self.clearConnectionState(connection)
                self.receive(on: connection)
            case .failed(let error):
                if self.shouldLogConnectionFailure(error) {
                    print("❌ Conn failed: \(error)")
                }
                self.clearConnectionState(connection)
            case .cancelled:
                self.clearConnectionState(connection)
                break
            default: break
            }
        }
        connection.start(queue: queue)
    }

    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 32 * 1024) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            let isWs = self.isWebSocketConnection(connection)
            if let data = data, !data.isEmpty {
                if isWs {
                    print("🔌 WS recv: \(data.count) bytes on connection")
                    self.processWebSocketData(data, on: connection)
                } else {
                    self.processRequestChunk(data, on: connection)
                }
            } else if isWs {
                print("🔌 WS recv: empty/nil data, isComplete=\(isComplete), error=\(String(describing: error))")
            }
            if let error = error {
                if isWs { print("🔌 WS recv error: \(error)") }
                // Peer already closed/reset the socket: avoid extra cancel() noise.
                self.clearConnectionState(connection)
                return
            }
            // Do not close WebSocket connections on isComplete; the HTTP request
            // may be "complete" while the upgraded WS connection must stay alive.
            if isComplete && !isWs {
                self.requestCancel(connection)
                return
            }
            if isComplete && isWs {
                print("🔌 WS recv: isComplete=true on WS connection — continuing receive loop")
            }
            self.receive(on: connection) // keep reading pipelined data (simple)
        }
    }

    private func processRequestChunk(_ data: Data, on connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        var state = httpStates[id] ?? HTTPRequestState()
        state.buffer.append(data)
        if state.expectedLength == nil,
           let headerEnd = state.buffer.range(of: Data("\r\n\r\n".utf8))?.upperBound,
           let headerString = String(data: state.buffer.prefix(headerEnd), encoding: .utf8) {
            state.expectedLength = headerEnd + httpContentLength(from: headerString)
        }
        httpStates[id] = state
        guard let expectedLength = state.expectedLength, state.buffer.count >= expectedLength else {
            return
        }

        let requestData = Data(state.buffer.prefix(expectedLength))
        httpStates.removeValue(forKey: id)
        processRequest(requestData, on: connection)
    }

    private func processRequest(_ data: Data, on connection: NWConnection) {
        guard let headerRange = data.range(of: Data("\r\n\r\n".utf8)) else { requestCancel(connection); return }
        let headerData = Data(data[..<headerRange.lowerBound])
        let bodyData = Data(data[headerRange.upperBound...])
        guard let request = String(data: headerData, encoding: .utf8) else { requestCancel(connection); return }
        let lines = request.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let requestLine = lines.first else { requestCancel(connection); return }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else { requestCancel(connection); return }
        let method = String(parts[0]).uppercased()
        let rawPath = String(parts[1])
        let routePath = URLComponents(string: "http://127.0.0.1\(rawPath)")?.path
            ?? rawPath.split(separator: "?", maxSplits: 1).first.map(String.init)
            ?? rawPath
        let queryItems = httpQueryItems(from: rawPath)
        print("📥 HTTP req: \(method) \(rawPath)")
        var headers: [String: String] = [:]
        var rangeHeader: String? = nil
        for line in lines.dropFirst() {
            if line.isEmpty { continue }
            if let idx = line.firstIndex(of: ":") {
                let key = String(line[..<idx]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                let value = String(line[line.index(after: idx)...]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !key.isEmpty { headers[key] = value }
                if key == "range" { rangeHeader = value }
            }
        }
        if let rh = rangeHeader { print("   ↪︎ Range hdr: \(rh)") }
        if !headers.isEmpty { print("   ↪︎ Headers count=\(headers.count)") }
        if routePath == "/ws/sync" || routePath == "/ws/api" {
            print("   ↪︎ WS upgrade check: upgrade='\(headers["upgrade"] ?? "<nil>")' connection='\(headers["connection"] ?? "<nil>")' sec-websocket-key='\(headers["sec-websocket-key"] ?? "<nil>")'")
        }
        if method == "OPTIONS" {
            sendRaw(status: 204, reason: "No Content", headers: [
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Filename, X-Atome-Id, X-Atome-Type, X-Mime-Type, X-Original-Name, X-User-Id, X-Username, X-Phone, X-File-Path, X-File-Name",
                "Access-Control-Max-Age": "86400"
            ], body: Data(), on: connection)
            return
        }
        if (routePath == "/ws/sync" || routePath == "/ws/api") && isWebSocketUpgrade(headers: headers) {
            handleWebSocketUpgrade(connection, headers: headers)
            return
        }
        if (routePath == "/ws/sync" || routePath == "/ws/api") && !isWebSocketUpgrade(headers: headers) {
            print("⚠️ WS path requested but upgrade headers missing; attempting upgrade anyway")
            // WKWebView may strip standard upgrade headers; try upgrading if sec-websocket-key is present
            if headers["sec-websocket-key"] != nil {
                handleWebSocketUpgrade(connection, headers: headers)
                return
            }
            sendSimple(status: 400, reason: "Bad Request", body: "WebSocket upgrade headers missing", on: connection)
            return
        }
        if method == "POST" {
            if routePath == "/api/events/commit",
               let body = parseJsonObjectBody(from: bodyData) {
                var message = body
                message["type"] = "events"
                message["action"] = "commit"
                message["event"] = body
                if let token = bearerToken(from: headers) { message["token"] = token }
                let response = AiSRuntime.handleEventsMessage(message)
                sendJsonResponse(response, status: responseSuccess(response) ? 200 : 400, on: connection)
                return
            }
            if routePath == "/api/events/commit-batch",
               let body = parseJsonObjectBody(from: bodyData) {
                var message = body
                message["type"] = "events"
                message["action"] = "commit-batch"
                if let token = bearerToken(from: headers) { message["token"] = token }
                let response = AiSRuntime.handleEventsMessage(message)
                sendJsonResponse(response, status: responseSuccess(response) ? 200 : 400, on: connection)
                return
            }
            if routePath == "/api/snapshots",
               let body = parseJsonObjectBody(from: bodyData) {
                var message = body
                message["type"] = "snapshot"
                message["action"] = "create"
                if let token = bearerToken(from: headers) { message["token"] = token }
                let response = AiSRuntime.handleSnapshotMessage(message)
                sendJsonResponse(response, status: responseSuccess(response) ? 200 : 400, on: connection)
                return
            }
            if routePath == "/api/uploads" {
                print("[UPLOAD] ── POST /api/uploads received ── bodySize=\(bodyData.count)")
                handleUploadsPost(headers: headers, body: bodyData, on: connection)
                return
            }
            if routePath == "/api/user-recordings" {
                handleUserRecordingsPost(headers: headers, body: bodyData, on: connection)
                return
            }
            if (routePath == "/api/auth/login" || routePath == "/api/auth/register" || routePath == "/api/auth/bootstrap"),
               let body = parseJsonObjectBody(from: bodyData) {
                var message = body
                message["type"] = "auth"
                let action: String
                if routePath == "/api/auth/register" {
                    action = "register"
                } else if routePath == "/api/auth/bootstrap" {
                    action = "bootstrap"
                } else {
                    action = "login"
                }
                message["action"] = action
                print("[AUTH-HTTP] POST \(routePath) action=\(action)")
                let response = AiSRuntime.handleAuthMessage(message)
                let success = (response["success"] as? Bool) == true || (response["ok"] as? Bool) == true
                print("[AUTH-HTTP] result success=\(success) userId=\(response["user_id"] ?? response["userId"] ?? "nil")")
                sendJsonResponse(response, status: success ? 200 : 401, on: connection)
                return
            }
            if routePath == "/api/auth/me" {
                let token = bearerToken(from: headers)
                var message: [String: Any] = ["type": "auth", "action": "me"]
                if let token { message["token"] = token }
                let response = AiSRuntime.handleAuthMessage(message)
                let success = (response["success"] as? Bool) == true || (response["ok"] as? Bool) == true
                sendJsonResponse(response, status: success ? 200 : 401, on: connection)
                return
            }
            sendSimple(status: 404, reason: "Not Found", body: "Not Found", on: connection)
            return
        }
        if method != "GET" {
            sendSimple(status: 405, reason: "Method Not Allowed", body: "Method Not Allowed", on: connection)
            return
        }
    // Opportunistic sync trigger (throttled inside coordinator)
    FileSyncCoordinator.shared.syncAll()

    if routePath.hasPrefix("/text/") {
            let name = String(routePath.dropFirst("/text/".count))
            serveText(named: name, on: connection)
        } else if routePath.hasPrefix("/audio_meta/") {
            let name = String(routePath.dropFirst("/audio_meta/".count))
            serveMetadata(named: name, on: connection)
        } else if routePath.hasPrefix("/audio_head/") {
            let name = String(routePath.dropFirst("/audio_head/".count))
            serveAudioHead(named: name, on: connection)
        } else if routePath.hasPrefix("/audio/") {
            let rawName = String(routePath.dropFirst("/audio/".count))
            // Decode any percent-encoded characters (spaces etc.) so underlying file with plain spaces is found
            let decodedName = rawName.removingPercentEncoding ?? rawName
            if rawName != decodedName { print("🧪 Decoded audio name raw=\(rawName) decoded=\(decodedName)") }
            serveAudio(named: decodedName, rangeHeader: rangeHeader, on: connection)
        } else if routePath.hasPrefix("/file/") {
            let raw = String(routePath.dropFirst("/file/".count))
            let decoded = raw.removingPercentEncoding ?? raw
            serveUnified(named: decoded, rangeHeader: rangeHeader, on: connection)
        } else if routePath == "/health" {
            serveHealth(on: connection)
        } else if routePath == "/tree" {
            serveTree(on: connection)
        } else if routePath == "/sync_now" {
            serveSyncNow(on: connection)
        } else if routePath == "/api/server-info" {
            serveServerInfo(on: connection)
        } else if routePath.hasPrefix("/api/state_current/") {
            let atomeId = String(routePath.dropFirst("/api/state_current/".count)).removingPercentEncoding ?? String(routePath.dropFirst("/api/state_current/".count))
            var message: [String: Any] = [
                "type": "state-current",
                "action": "get",
                "atome_id": atomeId
            ]
            if let token = bearerToken(from: headers) { message["token"] = token }
            let response = AiSRuntime.handleStateCurrentMessage(message)
            sendJsonResponse(response, status: responseSuccess(response) ? 200 : 404, on: connection)
        } else if routePath == "/api/state_current" {
            var message: [String: Any] = [
                "type": "state-current",
                "action": "list"
            ]
            for (key, value) in queryItems { message[key] = value }
            if let token = bearerToken(from: headers) { message["token"] = token }
            let response = AiSRuntime.handleStateCurrentMessage(message)
            sendJsonResponse(response, status: responseSuccess(response) ? 200 : 400, on: connection)
        } else if routePath == "/api/events" {
            var message: [String: Any] = [
                "type": "events",
                "action": "list"
            ]
            for (key, value) in queryItems { message[key] = value }
            if let token = bearerToken(from: headers) { message["token"] = token }
            let response = AiSRuntime.handleEventsMessage(message)
            sendJsonResponse(response, status: responseSuccess(response) ? 200 : 400, on: connection)
        } else if routePath == "/api/uploads" {
            handleUploadsList(headers: headers, on: connection)
        } else if routePath.hasPrefix("/api/uploads/") {
            let raw = String(routePath.dropFirst("/api/uploads/".count))
            let fileName = raw.removingPercentEncoding ?? raw
            handleUploadsGet(fileName: fileName, headers: headers, on: connection)
        } else if routePath.hasPrefix("/api/recordings/") {
            let raw = String(routePath.dropFirst("/api/recordings/".count))
            let fileName = raw.removingPercentEncoding ?? raw
            handleRecordingGet(fileName: fileName, headers: headers, on: connection)
        } else if routePath == "/api/auth/me" {
            var message: [String: Any] = ["type": "auth", "action": "me"]
            if let token = bearerToken(from: headers) { message["token"] = token }
            let response = AiSRuntime.handleAuthMessage(message)
            let success = (response["success"] as? Bool) == true || (response["ok"] as? Bool) == true
            sendJsonResponse(response, status: success ? 200 : 401, on: connection)
        } else {
            sendSimple(status: 404, reason: "Not Found", body: "Not Found", on: connection)
        }
    }

    private func isWebSocketUpgrade(headers: [String: String]) -> Bool {
        let upgrade = headers["upgrade"]?.lowercased() ?? ""
        let connection = headers["connection"]?.lowercased() ?? ""
        let hasUpgradeHeader = upgrade.contains("websocket")
        let hasConnectionUpgrade = connection.contains("upgrade")
        let hasWebSocketKey = headers["sec-websocket-key"] != nil
        // Some WebKit builds omit Connection: Upgrade but still send sec-websocket-key
        return (hasUpgradeHeader && hasConnectionUpgrade) || (hasUpgradeHeader && hasWebSocketKey)
    }

    private func isWebSocketConnection(_ connection: NWConnection) -> Bool {
        return wsConnections[ObjectIdentifier(connection)] != nil
    }

    private func websocketAcceptKey(_ key: String) -> String? {
        let guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        let source = key.trimmingCharacters(in: .whitespacesAndNewlines) + guid
        let digest = Insecure.SHA1.hash(data: Data(source.utf8))
        return Data(digest).base64EncodedString()
    }

    private func handleWebSocketUpgrade(_ connection: NWConnection, headers: [String: String]) {
        guard let key = headers["sec-websocket-key"], let accept = websocketAcceptKey(key) else {
            print("❌ WS upgrade: missing sec-websocket-key")
            sendSimple(status: 400, reason: "Bad Request", body: "missing websocket key", on: connection)
            return
        }
        print("🔌 WS upgrade: sec-websocket-key found, generating accept key")

        let response = [
            "HTTP/1.1 101 Switching Protocols",
            "Upgrade: websocket",
            "Connection: Upgrade",
            "Sec-WebSocket-Accept: \(accept)",
            "\r\n"
        ].joined(separator: "\r\n")

        let clientId = "ais_" + UUID().uuidString
        let id = ObjectIdentifier(connection)
        wsConnections[id] = connection
        wsStates[id] = WebSocketState(buffer: Data(), clientId: clientId)
        print("🔌 WS upgrade: connection registered, clientId=\(clientId)")

        let payload: [String: Any] = [
            "type": "welcome",
            "clientId": clientId,
            "server": "ais",
            "version": "1.0.0",
            "capabilities": ["events", "sync_request", "file-events", "atome-events", "account-events"],
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]

        connection.send(content: Data(response.utf8), completion: .contentProcessed { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                print("❌ WS upgrade: 101 send failed: \(error)")
                return
            }
            print("🔌 WS upgrade: 101 sent OK, sending welcome")
            self.sendWebSocketJson(payload, on: connection)
            FastifySyncRelay.shared.connectIfConfigured()
        })
    }

    private func processWebSocketData(_ data: Data, on connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        guard var state = wsStates[id] else { return }
        state.buffer.append(data)

        while true {
            if state.buffer.count < 2 { break }
            let b0 = state.buffer[state.buffer.startIndex]
            let b1 = state.buffer[state.buffer.startIndex + 1]
            let opcode = b0 & 0x0f
            let masked = (b1 & 0x80) != 0
            var payloadLen = Int(b1 & 0x7f)
            var index = 2

            if payloadLen == 126 {
                if state.buffer.count < index + 2 { break }
                let lenBytes = state.buffer[index..<(index + 2)]
                payloadLen = Int(lenBytes.reduce(0) { ($0 << 8) | Int($1) })
                index += 2
            } else if payloadLen == 127 {
                if state.buffer.count < index + 8 { break }
                let lenBytes = state.buffer[index..<(index + 8)]
                payloadLen = lenBytes.reduce(0) { ($0 << 8) | UInt64($1) }.asIntSafe()
                index += 8
            }

            var maskKey: [UInt8] = []
            if masked {
                if state.buffer.count < index + 4 { break }
                maskKey = Array(state.buffer[index..<(index + 4)])
                index += 4
            }

            if state.buffer.count < index + payloadLen { break }
            var payload = Data(state.buffer[index..<(index + payloadLen)])
            if masked {
                for i in 0..<payload.count {
                    payload[i] ^= maskKey[i % 4]
                }
            }
            state.buffer.removeSubrange(0..<(index + payloadLen))
            handleWebSocketFrame(opcode: opcode, payload: payload, on: connection)
        }

        wsStates[id] = state
    }

    private func handleWebSocketFrame(opcode: UInt8, payload: Data, on connection: NWConnection) {
        switch opcode {
        case 0x1:
            if let text = String(data: payload, encoding: .utf8) {
                handleWebSocketText(text, on: connection)
            }
        case 0x8:
            sendWebSocketClose(on: connection)
            requestCancel(connection)
        case 0x9:
            sendWebSocketPong(payload, on: connection)
        case 0xA:
            break
        default:
            break
        }
    }

    private func handleWebSocketText(_ text: String, on connection: NWConnection) {
        print("🔌 WS text received: \(text.prefix(200))")
        guard let data = text.data(using: .utf8) else { print("❌ WS text: invalid UTF-8"); return }
        guard let obj = try? JSONSerialization.jsonObject(with: data, options: []),
              let payload = obj as? [String: Any] else { print("❌ WS text: invalid JSON"); return }
        let type = (payload["type"] as? String) ?? ""
        print("🔌 WS message type: \(type)")
        if type == "register" {
            if let provided = payload["clientId"] as? String {
                let id = ObjectIdentifier(connection)
                if var state = wsStates[id] {
                    state.clientId = provided
                    wsStates[id] = state
                }
            }
            let clientId = wsStates[ObjectIdentifier(connection)]?.clientId ?? "unknown"
            let welcome: [String: Any] = [
                "type": "welcome",
                "clientId": clientId,
                "server": "ais",
                "version": "1.0.0",
                "capabilities": ["events", "sync_request", "file-events", "atome-events", "account-events"],
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ]
            sendWebSocketJson(welcome, on: connection)
            return
        }

        if type == "ping" {
            let pong: [String: Any] = [
                "type": "pong",
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ]
            sendWebSocketJson(pong, on: connection)
            return
        }

        if type == "auth" {
            let response = AiSRuntime.handleAuthMessage(payload)
            sendWebSocketJson(response, on: connection)
            return
        }

        if type == "atome" {
            let response = AiSRuntime.handleAtomeMessage(payload)
            sendWebSocketJson(response, on: connection)
            return
        }

        if type == "events" {
            let response = AiSRuntime.handleEventsMessage(payload)
            sendWebSocketJson(response, on: connection)
            return
        }

        if type == "state-current" {
            let response = AiSRuntime.handleStateCurrentMessage(payload)
            sendWebSocketJson(response, on: connection)
            return
        }

        if type == "snapshot" {
            let response = AiSRuntime.handleSnapshotMessage(payload)
            sendWebSocketJson(response, on: connection)
            return
        }

        if type == "sync_request" {
            FileSyncCoordinator.shared.syncAll(force: true)
            let response: [String: Any] = [
                "type": "sync_started",
                "mode": "local",
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ]
            sendWebSocketJson(response, on: connection)
            FastifySyncRelay.shared.send(text: text)
            return
        }

        if shouldBroadcastLocalEvent(payload: payload) {
            broadcastWebSocketText(text, excluding: connection)
        }

        FastifySyncRelay.shared.send(text: text)
    }

    private func shouldBroadcastLocalEvent(payload: [String: Any]) -> Bool {
        let type = (payload["type"] as? String) ?? ""
        if type == "event" { return true }
        if type.hasPrefix("atome:") || type.hasPrefix("sync:") { return true }
        if type == "file-event" || type == "atome-sync" { return true }
        return false
    }

    private func sendWebSocketJson(_ payload: [String: Any], on connection: NWConnection) {
        guard JSONSerialization.isValidJSONObject(payload) else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else { return }
        sendWebSocketText(String(decoding: data, as: UTF8.self), on: connection)
    }

    private func sendWebSocketText(_ text: String, on connection: NWConnection) {
        let payload = Data(text.utf8)
        let frame = buildWebSocketFrame(opcode: 0x1, payload: payload)
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    private func sendWebSocketPong(_ payload: Data, on connection: NWConnection) {
        let frame = buildWebSocketFrame(opcode: 0xA, payload: payload)
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    private func sendWebSocketClose(on connection: NWConnection) {
        let frame = buildWebSocketFrame(opcode: 0x8, payload: Data())
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    private func buildWebSocketFrame(opcode: UInt8, payload: Data) -> Data {
        var frame = Data()
        frame.append(0x80 | opcode)
        let length = payload.count
        if length < 126 {
            frame.append(UInt8(length))
        } else if length <= 0xffff {
            frame.append(126)
            frame.append(UInt8((length >> 8) & 0xff))
            frame.append(UInt8(length & 0xff))
        } else {
            frame.append(127)
            let len64 = UInt64(length)
            for shift in stride(from: 56, through: 0, by: -8) {
                frame.append(UInt8((len64 >> UInt64(shift)) & 0xff))
            }
        }
        frame.append(payload)
        return frame
    }

    private func broadcastWebSocketText(_ text: String, excluding: NWConnection? = nil) {
        let payload = Data(text.utf8)
        let frame = buildWebSocketFrame(opcode: 0x1, payload: payload)
        for (id, connection) in wsConnections {
            if let excluded = excluding, ObjectIdentifier(excluded) == id { continue }
            connection.send(content: frame, completion: .contentProcessed { _ in })
        }
    }

    fileprivate func handleFastifyRelayMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        guard let obj = try? JSONSerialization.jsonObject(with: data, options: []),
              let payload = obj as? [String: Any] else {
            return
        }
        if shouldBroadcastLocalEvent(payload: payload) {
            broadcastWebSocketText(text)
        }
    }

    // Unified file serving (any extension) via /file/<path>
    private func serveUnified(named name: String, rangeHeader: String?, on connection: NWConnection) {
        let lower = name.lowercased()
        // Audio fast path → reuse audio pipeline (range, faststart)
        if lower.hasSuffix(".m4a") { serveAudio(named: name, rangeHeader: rangeHeader, on: connection); return }
        // For small text-like types reuse text (preserves existing candidate enumeration)
        if lower.hasSuffix(".txt") || lower.hasSuffix(".json") || lower.hasSuffix(".svg") || lower.hasSuffix(".md") {
            serveText(named: name, on: connection); return
        }
        // Generic binary/text fallback: locate file using existing candidate logic (without text-only filtering)
        let candidates = candidateFileURLs(for: name)
        guard let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            sendSimple(status: 404, reason: "Not Found", body: "file missing", on: connection); return
        }
        let ext = url.pathExtension.lowercased()
        let mime: String = {
            switch ext {
            case "png": return "image/png"
            case "jpg", "jpeg": return "image/jpeg"
            case "gif": return "image/gif"
            case "webp": return "image/webp"
            case "svg": return "image/svg+xml"
            case "json": return "application/json"
            case "txt", "log", "md", "csv": return "text/plain; charset=utf-8"
            case "mp3": return "audio/mpeg"
            case "wav": return "audio/wav"
            case "mp4", "m4v": return "video/mp4"
            case "pdf": return "application/pdf"
            case "woff": return "font/woff"
            case "woff2": return "font/woff2"
            case "ttf": return "font/ttf"
            case "otf": return "font/otf"
            default: return "application/octet-stream"
            }
        }()
        do {
            let data = try Data(contentsOf: url)
            sendRaw(status: 200, reason: "OK", headers: ["Content-Type": mime], body: data, on: connection)
            print("🗂 Served unified file: \(url.lastPathComponent) bytes=\(data.count) mime=\(mime)")
        } catch {
            sendSimple(status: 500, reason: "Internal Server Error", body: "read fail", on: connection)
        }
    }

    private func candidateFileURLs(for name: String) -> [URL] {
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(name) else {
            return []
        }
        var ordered: [URL] = []
        let roots = SandboxPathValidator.allowedRoots()
        for root in roots {
            let url = sanitized.isEmpty ? root : root.appendingPathComponent(sanitized)
            if FileManager.default.fileExists(atPath: url.path) {
                ordered.append(url)
            }
        }
        if ordered.isEmpty, let materialized = SandboxAssetManager.shared.materializeAssetIfNeeded(relativePath: sanitized) {
            ordered.append(materialized)
        }
        return ordered
    }

    private func serveSyncNow(on connection: NWConnection) {
        let start = Date()
        let result = FileSyncCoordinator.shared.blockingSync()
        let duration = Int(Date().timeIntervalSince(start) * 1000)
        let json: [String: Any] = [
            "status": "done",
            "startedAt": Int(start.timeIntervalSince1970),
            "durationMs": duration,
            "roots": result.roots,
            "changed": result.changed,
            "deleted": result.deleted
        ]
        if let data = try? JSONSerialization.data(withJSONObject: json, options: []) {
            sendRaw(status: 200, reason: "OK", headers: ["Content-Type": "application/json", "Cache-Control": "no-store"], body: data, on: connection)
        } else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "JSON encode failed", on: connection)
        }
    }

    private func serveAudio(named name: String, rangeHeader: String?, on connection: NWConnection) {
        guard let fileURL = candidateFileURLs(for: name).first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            sendSimple(status: 404, reason: "Not Found", body: "Missing file", on: connection)
            return
        }
        let ext = fileURL.pathExtension.lowercased()
        if !allowedAudioExtensions.contains(ext) {
            sendSimple(status: 415, reason: "Unsupported Media Type", body: "Extension not allowed", on: connection)
            return
        }
        enqueueAudioWork(key: fileURL.path) { [weak self] in
            guard let self = self else { return }
            self.processAudioStream(fileURL: fileURL, name: name, rangeHeader: rangeHeader, connection: connection)
        }
    }

    private func processAudioStream(fileURL: URL, name: String, rangeHeader: String?, connection: NWConnection) {
        let key = fileURL.path
        defer { completeAudioWork(key: key) }
        // If file is inside bundle (read-only), copy once to Documents to help AVFoundation in extension context
        let effectiveURL = ensureLocalReadableCopy(for: fileURL)
        // Header diagnostics
        if let headData = try? Data(contentsOf: effectiveURL, options: [.mappedIfSafe]) {
            let prefix = headData.prefix(64)
            let hex = prefix.map { String(format: "%02x", $0) }.joined(separator: " ")
            if let ftypRange = headData.range(of: Data("ftyp".utf8)) { print("🔍 ftyp at offset \(ftypRange.lowerBound)") } else { print("⚠️ ftyp not found in first bytes") }
            print("🧾 Header[0..63] hex=\(hex)")
        }
        // Faststart async: serve original immediately; schedule optimization if needed
        let optimizedURL: URL = {
            if let cached = faststartCache[effectiveURL.path] { return cached }
            if faststartInFlight.contains(effectiveURL.path) { return effectiveURL }
            if faststartFailed.contains(effectiveURL.path) { return effectiveURL }
            let force = name.lowercased() == "alive.m4a"
            let needsOpt = force || !isLikelyFastStart(url: effectiveURL)
            if needsOpt {
                faststartInFlight.insert(effectiveURL.path)
                faststartQueue.async { [weak self] in
                    guard let self = self else { return }
                    let remux = self.performFaststartRemux(original: effectiveURL)
                    let finalURL = remux ?? self.reencodeM4A(original: effectiveURL)
                    self.queue.async { [weak self] in
                        guard let self = self else { return }
                        if let final = finalURL {
                            self.faststartCache[effectiveURL.path] = final
                            print("✅ Faststart (async) ready: \(final.lastPathComponent)")
                        } else {
                            self.faststartFailed.insert(effectiveURL.path)
                            print("⚠️ Faststart (async) failed: \(effectiveURL.lastPathComponent)")
                        }
                        self.faststartInFlight.remove(effectiveURL.path)
                    }
                }
            } else {
                faststartCache[effectiveURL.path] = effectiveURL
            }
            return effectiveURL
        }()
        let servingOriginal = (optimizedURL.path == fileURL.path)
        if servingOriginal {
            print("🎧 Serving original file: \(fileURL.lastPathComponent)")
        } else {
            print("🎧 Serving faststart optimized file: \(optimizedURL.lastPathComponent) (from \(fileURL.lastPathComponent))")
        }
        let path = optimizedURL.path
        let fileHandle: FileHandle
        do { fileHandle = try FileHandle(forReadingFrom: optimizedURL) } catch {
            sendSimple(status: 500, reason: "Internal Server Error", body: "Open failed", on: connection)
            return
        }
        defer { try? fileHandle.close() }
        let totalLen: UInt64
        if let cached = lengthCache[path] { totalLen = cached } else {
            do {
                let attrs = try FileManager.default.attributesOfItem(atPath: path)
                totalLen = (attrs[.size] as? NSNumber)?.uint64Value ?? 0
                lengthCache[path] = totalLen
            } catch { totalLen = 0 }
        }
        if totalLen == 0 { sendSimple(status: 500, reason: "Internal Server Error", body: "Empty file", on: connection); return }

        var rangeStart: UInt64 = 0
        var rangeEnd:   UInt64 = totalLen - 1
        var isPartial = false
        if let rangeHeader = rangeHeader?.lowercased(),
           let bytesPart = rangeHeader.split(separator: ":").dropFirst().first?.trimmingCharacters(in: .whitespaces),
           bytesPart.hasPrefix("bytes=") {
            let spec = bytesPart.dropFirst("bytes=".count)
            let comps = spec.split(separator: "-")
            if let first = comps.first, let start = UInt64(first) { rangeStart = start }
            if comps.count > 1, let lastStr = comps.last, !lastStr.isEmpty, let last = UInt64(lastStr) { rangeEnd = min(last, totalLen - 1) }
            if rangeStart >= totalLen { rangeStart = 0 }
            // Only partial if not the whole file
            if !(rangeStart == 0 && rangeEnd == totalLen - 1) { isPartial = true }
        }
        let readLen = Int(rangeEnd - rangeStart + 1)
        do {
            try fileHandle.seek(toOffset: rangeStart)
            let chunk = fileHandle.readData(ofLength: readLen)
            sendAudioResponse(data: chunk, totalLength: totalLen, start: rangeStart, end: rangeEnd, partial: isPartial, on: connection)
            print("📤 Sent bytes [\(rangeStart)-\(rangeEnd)]/\(totalLen) partial=\(isPartial) file=\(optimizedURL.lastPathComponent)")
        } catch {
            sendSimple(status: 500, reason: "Internal Server Error", body: "Read failed", on: connection)
        }
    }

    // Provide raw header info for diagnostics without streaming whole file
    private func serveAudioHead(named name: String, on connection: NWConnection) {
        guard let fileURL = candidateFileURLs(for: name).first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            sendSimple(status: 404, reason: "Not Found", body: "Missing file", on: connection); return
        }
        let effectiveURL = ensureLocalReadableCopy(for: fileURL)
        var lines: [String] = []
        lines.append("file=\(effectiveURL.lastPathComponent)")
        if let attrs = try? FileManager.default.attributesOfItem(atPath: effectiveURL.path), let size = attrs[.size] as? NSNumber { lines.append("size=\(size)" )}
        if let fh = try? FileHandle(forReadingFrom: effectiveURL) {
            let head = (try? fh.read(upToCount: 256)) ?? Data()
            let hex = head.map { String(format: "%02x", $0) }.joined(separator: " ")
            lines.append("head256_hex=\(hex)")
            if let ascii = String(data: head, encoding: .ascii) {
                let allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ._"
                let filtered = String(ascii.filter { allowed.contains($0) })
                lines.append("head_ascii=\(filtered)")
            }
            try? fh.close()
            if let ftypIndex = head.range(of: Data("ftyp".utf8)) { lines.append("ftyp_offset=\(ftypIndex.lowerBound)") } else { lines.append("ftyp_offset=-1") }
        }
        // Try AVAsset track count
        let asset = AVURLAsset(url: effectiveURL)
        var trackCount = 0
        if #available(iOS 16.0, *) {
            // Charger les pistes audio de façon synchrone via sémaphore (pas d'async dans cette méthode)
            let sem = DispatchSemaphore(value: 0)
            var loaded: [AVAssetTrack]? = nil
            Task.detached {
                if let t = try? await asset.loadTracks(withMediaType: .audio) { loaded = t }
                sem.signal()
            }
            _ = sem.wait(timeout: .now() + 2)
            trackCount = loaded?.count ?? 0
        } else {
            trackCount = asset.tracks.count
        }
        lines.append("av_asset_audio_tracks=\(trackCount)")
        let body = lines.joined(separator: "\n")
        let payload = Data(body.utf8)
        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(payload.count)\r\nConnection: close\r\n\r\n"
        var data = Data(head.utf8); data.append(payload)
        connection.send(content: data, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
    }

    // Copy bundle resource to Documents for sandbox-friendly AVAsset usage (once)
    private func ensureLocalReadableCopy(for url: URL) -> URL {
        let path = url.path
        if !path.contains(".app/") { return url }
        guard let docs = SandboxPathValidator.allowedRoots().last else { return url }
        let target = docs.appendingPathComponent(url.lastPathComponent)
        if FileManager.default.fileExists(atPath: target.path) { return target }
        do { try FileManager.default.copyItem(at: url, to: target); print("📄 Copied bundle resource to Documents: \(target.lastPathComponent)") } catch { print("⚠️ Copy failed: \(error)") }
        return target
    }

    private func serveMetadata(named name: String, on connection: NWConnection) {
        guard let fileURL = candidateFileURLs(for: name).first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            sendSimple(status: 404, reason: "Not Found", body: "Missing file", on: connection)
            return
        }
        var lines: [String] = []
        lines.append("file=\(fileURL.lastPathComponent)")
        if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path), let size = attrs[.size] as? NSNumber {
         
            lines.append("filesize=\(size.intValue)")
        }
        lines.append("note=metadata simplified (deprecated AVAsset sync APIs removed)")
        if let fh = try? FileHandle(forReadingFrom: fileURL) { let head = try? fh.read(upToCount: 64) ?? Data(); let hex = (head ?? Data()).map { String(format:"%02x", $0) }.joined(separator: " "); lines.append("first64=\(hex)"); try? fh.close() }
        let body = lines.joined(separator: "\n")
        let payload = Data(body.utf8)
        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(payload.count)\r\nConnection: close\r\n\r\n"
        var data = Data(head.utf8); data.append(payload)
        connection.send(content: data, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
    }

    private func sendAudioResponse(data: Data, totalLength: UInt64, start: UInt64, end: UInt64, partial: Bool, on connection: NWConnection) {
        var headers: [String] = []
        let statusLine: String
        if partial {
            statusLine = "HTTP/1.1 206 Partial Content"
            headers.append("Content-Range: bytes \(start)-\(end)/\(totalLength)")
        } else {
            statusLine = "HTTP/1.1 200 OK"
        }
        headers.append("Content-Type: audio/mp4")
        headers.append("Accept-Ranges: bytes")
        headers.append("Content-Length: \(data.count)")
        headers.append("Access-Control-Allow-Origin: *")
        headers.append("Access-Control-Allow-Headers: *")
        headers.append("Connection: close")
        let headerStr = statusLine + "\r\n" + headers.joined(separator: "\r\n") + "\r\n\r\n"
        var response = Data(headerStr.utf8)
        response.append(data)
        connection.send(content: response, completion: .contentProcessed { [weak self] _ in
            self?.requestCancel(connection)
        })
    }

    private func sendSimple(status: Int, reason: String, body: String, on connection: NWConnection) {
        let payload = Data(body.utf8)
    let head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(payload.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        var data = Data(head.utf8)
        data.append(payload)
        connection.send(content: data, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
    }

    private func sendRaw(status: Int, reason: String, headers: [String:String], body: Data, on connection: NWConnection) {
        var headerLines: [String] = []
        var hasCT = false
        var hasCL = false
        var hasACOrigin = false
        var hasACHeaders = false
        let lowerKeys = Set(headers.keys.map { $0.lowercased() })
        if lowerKeys.contains("access-control-allow-origin") { hasACOrigin = true }
        if lowerKeys.contains("access-control-allow-headers") { hasACHeaders = true }
        for (k,v) in headers { headerLines.append("\(k): \(v)"); if k.lowercased()=="content-type" { hasCT=true }; if k.lowercased()=="content-length" { hasCL=true } }
        if !hasCT { headerLines.append("Content-Type: application/octet-stream") }
        if !hasCL { headerLines.append("Content-Length: \(body.count)") }
        if !hasACOrigin { headerLines.append("Access-Control-Allow-Origin: *") }
        if !hasACHeaders { headerLines.append("Access-Control-Allow-Headers: *") }
        headerLines.append("Connection: close")
        let head = "HTTP/1.1 \(status) \(reason)\r\n" + headerLines.joined(separator: "\r\n") + "\r\n\r\n"
        var out = Data(head.utf8); out.append(body)
        connection.send(content: out, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
    }

    private func sendJsonResponse(_ payload: [String: Any], status: Int = 200, on connection: NWConnection) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "JSON encode failed", on: connection)
            return
        }
        sendRaw(status: status, reason: status == 200 ? "OK" : "Error", headers: [
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        ], body: data, on: connection)
    }

    private func parseJsonObjectBody(from body: Data) -> [String: Any]? {
        guard !body.isEmpty,
              let value = try? JSONSerialization.jsonObject(with: body, options: []),
              let object = value as? [String: Any] else {
            return nil
        }
        return object
    }

    private func httpContentLength(from requestHeaders: String) -> Int {
        let lines = requestHeaders.split(separator: "\r\n", omittingEmptySubsequences: false)
        for line in lines.dropFirst() {
            guard let idx = line.firstIndex(of: ":") else { continue }
            let key = String(line[..<idx]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if key != "content-length" { continue }
            let value = String(line[line.index(after: idx)...]).trimmingCharacters(in: .whitespacesAndNewlines)
            return max(0, Int(value) ?? 0)
        }
        return 0
    }

    private func bearerToken(from headers: [String: String]) -> String? {
        let raw = headers["authorization"] ?? headers["Authorization"] ?? ""
        guard raw.lowercased().hasPrefix("bearer ") else { return nil }
        let token = String(raw.dropFirst("Bearer ".count)).trimmingCharacters(in: .whitespacesAndNewlines)
        return token.isEmpty ? nil : token
    }

    private func httpQueryItems(from rawPath: String) -> [String: String] {
        guard let components = URLComponents(string: "http://127.0.0.1\(rawPath)") else { return [:] }
        var out: [String: String] = [:]
        for item in components.queryItems ?? [] {
            out[item.name] = item.value ?? ""
        }
        return out
    }

    private func responseSuccess(_ payload: [String: Any]) -> Bool {
        if let success = payload["success"] as? Bool { return success }
        if let ok = payload["ok"] as? Bool { return ok }
        return true
    }

    private func handleUploadsPost(headers: [String: String], body: Data, on connection: NWConnection) {
        handleBinaryUpload(headers: headers, body: body, preferredFolder: nil, on: connection)
    }

    private func handleUserRecordingsPost(headers: [String: String], body: Data, on connection: NWConnection) {
        handleBinaryUpload(headers: headers, body: body, preferredFolder: "Recordings", on: connection)
    }

    private func handleBinaryUpload(headers: [String: String], body: Data, preferredFolder: String?, on connection: NWConnection) {
        print("[UPLOAD] ── handleBinaryUpload START ──")
        print("[UPLOAD] body.count=\(body.count) preferredFolder=\(preferredFolder ?? "nil")")
        print("[UPLOAD] headers: \(headers.filter { ["x-filename","x-original-name","x-atome-type","x-mime-type","x-file-path","x-user-id","x-phone","authorization","content-type"].contains($0.key.lowercased()) })")
        guard !body.isEmpty else {
            print("[UPLOAD] ❌ Empty body → 400")
            sendJsonResponse(["success": false, "error": "Empty upload body"], status: 400, on: connection)
            return
        }
        guard let userId = resolveUploadUserId(from: headers) else {
            print("[UPLOAD] ❌ resolveUploadUserId returned nil → 401 (token=\(headers["authorization"]?.prefix(20) ?? "nil") x-user-id=\(headers["x-user-id"] ?? "nil") x-phone=\(headers["x-phone"] ?? "nil"))")
            sendJsonResponse(["success": false, "error": "Access denied"], status: 401, on: connection)
            return
        }
        print("[UPLOAD] ✅ userId resolved: \(userId)")
        let rawName = headers["x-filename"] ?? headers["x-original-name"] ?? ""
        let decodedName = (rawName.removingPercentEncoding ?? rawName).trimmingCharacters(in: .whitespacesAndNewlines)
        let pathHeader = (headers["x-file-path"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let atomeType = (headers["x-atome-type"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mimeType = (headers["x-mime-type"] ?? headers["content-type"] ?? "application/octet-stream").trimmingCharacters(in: .whitespacesAndNewlines)
        print("[UPLOAD] decodedName=\(decodedName) pathHeader=\(pathHeader) atomeType=\(atomeType) mimeType=\(mimeType)")

        let relativePath = resolveUploadRelativePath(
            userId: userId,
            fileName: decodedName,
            pathHeader: pathHeader,
            atomeType: atomeType,
            preferredFolder: preferredFolder
        )
        print("[UPLOAD] relativePath=\(relativePath ?? "nil")")
        guard let safeRelativePath = relativePath,
              let root = iCloudFileManager.shared.getCurrentStorageURL() else {
            print("[UPLOAD] ❌ path or root nil → 400 (relativePath=\(relativePath ?? "nil"), root=\(iCloudFileManager.shared.getCurrentStorageURL()?.path ?? "nil"))")
            sendJsonResponse(["success": false, "error": "Invalid upload path"], status: 400, on: connection)
            return
        }
        let fileURL = root.appendingPathComponent(safeRelativePath)
        print("[UPLOAD] storageRoot=\(root.path)")
        print("[UPLOAD] fileURL=\(fileURL.path)")
        print("[UPLOAD] parentDir=\(fileURL.deletingLastPathComponent().path)")
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            print("[UPLOAD] ✅ directory created/exists")
            try body.write(to: fileURL, options: .atomic)
            print("[UPLOAD] ✅ file written (\(body.count) bytes)")
            let fileExists = FileManager.default.fileExists(atPath: fileURL.path)
            print("[UPLOAD] fileExists after write: \(fileExists)")
            FileSyncCoordinator.shared.syncAll(force: true)
            let response: [String: Any] = [
                "success": true,
                "file": fileURL.lastPathComponent,
                "file_name": fileURL.lastPathComponent,
                "owner_id": userId,
                "path": safeRelativePath,
                "file_path": safeRelativePath,
                "mime_type": mimeType,
                "size": body.count
            ]
            print("[UPLOAD] ── handleBinaryUpload SUCCESS ── response=\(response)")
            sendJsonResponse(response, status: 200, on: connection)
        } catch {
            print("[UPLOAD] ❌ write error: \(error)")
            sendJsonResponse(["success": false, "error": error.localizedDescription], status: 500, on: connection)
        }
    }

    private func handleUploadsList(headers: [String: String], on connection: NWConnection) {
        guard let userId = resolveUploadUserId(from: headers) else {
            sendJsonResponse(["success": false, "error": "Access denied"], status: 401, on: connection)
            return
        }
        guard let root = iCloudFileManager.shared.getCurrentStorageURL() else {
            sendJsonResponse(["success": false, "error": "Storage unavailable"], status: 500, on: connection)
            return
        }
        let downloadsURL = root.appendingPathComponent("data/users/\(userId)/Downloads", isDirectory: true)
        do {
            let files = try listUploadEntries(in: downloadsURL, userId: userId)
            sendJsonResponse(["success": true, "files": files], status: 200, on: connection)
        } catch {
            sendJsonResponse(["success": false, "error": error.localizedDescription], status: 500, on: connection)
        }
    }

    private func handleUploadsGet(fileName: String, headers: [String: String], on connection: NWConnection) {
        let userId = resolveUploadUserId(from: headers)
        guard let fileURL = resolveUploadFileURL(fileName: fileName, userId: userId, folderHints: ["Downloads", "Recordings"]) else {
            sendJsonResponse(["success": false, "error": "File not found"], status: 404, on: connection)
            return
        }
        do {
            let data = try Data(contentsOf: fileURL)
            sendRaw(status: 200, reason: "OK", headers: [
                "Content-Type": mimeType(for: fileURL.lastPathComponent)
            ], body: data, on: connection)
        } catch {
            sendJsonResponse(["success": false, "error": error.localizedDescription], status: 500, on: connection)
        }
    }

    private func handleRecordingGet(fileName: String, headers: [String: String], on connection: NWConnection) {
        let userId = resolveUploadUserId(from: headers)
        guard let fileURL = resolveUploadFileURL(fileName: fileName, userId: userId, folderHints: ["Recordings", "Downloads"]) else {
            sendJsonResponse(["success": false, "error": "File not found"], status: 404, on: connection)
            return
        }
        do {
            let data = try Data(contentsOf: fileURL)
            sendRaw(status: 200, reason: "OK", headers: [
                "Content-Type": mimeType(for: fileURL.lastPathComponent)
            ], body: data, on: connection)
        } catch {
            sendJsonResponse(["success": false, "error": error.localizedDescription], status: 500, on: connection)
        }
    }

    private func resolveUploadUserId(from headers: [String: String]) -> String? {
        let token = bearerToken(from: headers)
        let userIdHint = headers["x-user-id"]
        let phoneHint = headers["x-phone"]
        print("[UPLOAD] resolveUploadUserId: token=\(token?.prefix(20) ?? "nil") userIdHint=\(userIdHint ?? "nil") phoneHint=\(phoneHint ?? "nil")")
        let result = AiSRuntime.resolveAuthenticatedUserId(token: token, userIdHint: userIdHint, phoneHint: phoneHint)
        print("[UPLOAD] resolveUploadUserId → \(result ?? "nil")")
        return result
    }

    private func resolveUploadRelativePath(userId: String, fileName: String, pathHeader: String, atomeType: String, preferredFolder: String?) -> String? {
        let baseName = sanitizeUploadFileName(fileName.isEmpty ? "upload.bin" : fileName)
        let folderName = preferredFolder ?? ((atomeType == "sound" && baseName.lowercased().hasSuffix(".m4a")) ? "Recordings" : "Downloads")
        print("[UPLOAD] resolveUploadRelativePath: baseName=\(baseName) folderName=\(folderName) pathHeader=\(pathHeader)")
        if !pathHeader.isEmpty,
           let sanitized = SandboxPathValidator.sanitizedRelativePath(pathHeader),
           !sanitized.isEmpty {
            if sanitized.hasSuffix("/") {
                return "data/users/\(userId)/\(sanitized)\(baseName)"
            }
            let looksLikeFile = sanitized.split(separator: "/").last.map { String($0).contains(".") } ?? false
            if looksLikeFile {
                return "data/users/\(userId)/\(sanitized)"
            }
            return "data/users/\(userId)/\(sanitized)/\(baseName)"
        }
        return "data/users/\(userId)/\(folderName)/\(baseName)"
    }

    private func resolveUploadFileURL(fileName: String, userId: String?, folderHints: [String]) -> URL? {
        let safeName = sanitizeUploadFileName(fileName)
        guard !safeName.isEmpty, let root = iCloudFileManager.shared.getCurrentStorageURL() else { return nil }
        var candidates: [URL] = []
        if let userId, !userId.isEmpty {
            for folder in folderHints {
                candidates.append(root.appendingPathComponent("data/users/\(userId)/\(folder)/\(safeName)"))
            }
        }
        if let usersRoot = SandboxPathValidator.sanitizedRelativePath("data/users") {
            let usersURL = root.appendingPathComponent(usersRoot, isDirectory: true)
            if let directories = try? FileManager.default.contentsOfDirectory(at: usersURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) {
                for directory in directories {
                    for folder in folderHints {
                        candidates.append(directory.appendingPathComponent("\(folder)/\(safeName)"))
                    }
                }
            }
        }
        return candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) })
    }

    private func listUploadEntries(in folderURL: URL, userId: String) throws -> [[String: Any]] {
        guard FileManager.default.fileExists(atPath: folderURL.path) else { return [] }
        let urls = try FileManager.default.contentsOfDirectory(
            at: folderURL,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        )
        return urls.compactMap { url in
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
                return nil
            }
            let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
            return [
                "name": url.lastPathComponent,
                "file_name": url.lastPathComponent,
                "file_path": "data/users/\(userId)/Downloads/\(url.lastPathComponent)",
                "mime_type": mimeType(for: url.lastPathComponent),
                "size": values?.fileSize ?? 0,
                "updated_at": ISO8601DateFormatter().string(from: values?.contentModificationDate ?? Date())
            ]
        }.sorted {
            String(describing: $0["updated_at"] ?? "") > String(describing: $1["updated_at"] ?? "")
        }
    }

    private func sanitizeUploadFileName(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let baseName = URL(fileURLWithPath: trimmed).lastPathComponent
        let mapped = baseName.map { character -> Character in
            if character.isLetter || character.isNumber || character == "." || character == "_" || character == "-" {
                return character
            }
            return "_"
        }
        let sanitized = String(mapped).trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return sanitized.isEmpty ? "upload.bin" : sanitized
    }

    private func mimeType(for fileName: String) -> String {
        switch URL(fileURLWithPath: fileName).pathExtension.lowercased() {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "json": return "application/json"
        case "txt", "md", "markdown", "csv", "tsv", "log": return "text/plain; charset=utf-8"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "m4a": return "audio/mp4"
        case "mp4", "m4v": return "video/mp4"
        case "pdf": return "application/pdf"
        default: return "application/octet-stream"
        }
    }

    // MARK: - Health & Tree Endpoints

    private func serveHealth(on connection: NWConnection) {
        let pid = getpid()
        let port = self.port ?? 0
        let obj: [String: Any] = [
            "ok": true,
            "pid": pid,
            "port": port,
            "time": ISO8601DateFormatter().string(from: Date())
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []) else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "json fail", on: connection); return
        }
        let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: \(data.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        var out = Data(head.utf8); out.append(data)
        connection.send(content: out, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
    }

    private func serveServerInfo(on connection: NWConnection) {
        guard let data = ServerInfoProvider.jsonData(source: "local-http") else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "server info unavailable", on: connection)
            return
        }
        sendRaw(status: 200, reason: "OK", headers: [
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        ], body: data, on: connection)
    }

    private struct FileNode: Codable {
        let name: String
        let isDirectory: Bool
        let size: UInt64?
        let children: [FileNode]?
    }

    private func serveTree(on connection: NWConnection) {
        let roots = SandboxPathValidator.allowedRoots()
        guard let root = roots.first else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "no allowed roots", on: connection); return
        }
        let rootNode = buildNode(url: root, depth: 0, maxDepth: 12)
        let obj: [String: Any] = [
            "root": root.lastPathComponent,
            "tree": encodeNodeDict(node: rootNode),
            "allowedRoots": roots.map { $0.path }
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []) else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "json fail", on: connection); return
        }
        let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: \(data.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        var out = Data(head.utf8); out.append(data)
        connection.send(content: out, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
    }

    private func buildNode(url: URL, depth: Int, maxDepth: Int) -> FileNode {
        guard SandboxPathValidator.isAllowed(url: url) else {
            return FileNode(name: url.lastPathComponent, isDirectory: false, size: nil, children: nil)
        }
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
        if !exists { return FileNode(name: url.lastPathComponent, isDirectory: false, size: nil, children: nil) }
        if isDir.boolValue {
            if depth >= maxDepth { return FileNode(name: url.lastPathComponent, isDirectory: true, size: nil, children: []) }
            let childrenURLs = ((try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles])) ?? [])
                .filter { SandboxPathValidator.isAllowed(url: $0) }
            let nodes = childrenURLs.map { buildNode(url: $0, depth: depth + 1, maxDepth: maxDepth) }.sorted { $0.name.lowercased() < $1.name.lowercased() }
            return FileNode(name: url.lastPathComponent, isDirectory: true, size: nil, children: nodes)
        } else {
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.uint64Value
            return FileNode(name: url.lastPathComponent, isDirectory: false, size: size, children: nil)
        }
    }

    private func encodeNodeDict(node: FileNode) -> [String: Any] {
        var dict: [String: Any] = [
            "name": node.name,
            "isDirectory": node.isDirectory
        ]
        if let size = node.size { dict["size"] = size }
        if let children = node.children { dict["children"] = children.map { encodeNodeDict(node: $0) } }
        return dict
    }

    private func requestCancel(_ connection: NWConnection) {
        queue.async { self.cancelConnectionIfNeededLocked(connection) }
    }

    private func cancelConnectionIfNeededLocked(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        if cancelledConnections.contains(id) { return }
        cancelledConnections.insert(id)
        connection.cancel()
    }

    private func clearConnectionState(_ connection: NWConnection) {
        queue.async { self.clearConnectionStateLocked(connection) }
    }

    private func clearConnectionStateLocked(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        cancelledConnections.remove(id)
        wsConnections.removeValue(forKey: id)
        wsStates.removeValue(forKey: id)
        httpStates.removeValue(forKey: id)
    }

    private func shouldLogConnectionFailure(_ error: NWError) -> Bool {
        switch error {
        case .posix(let code):
            // Common/expected socket teardown paths; avoid log spam.
            return code != .ECONNRESET && code != .ENOTCONN && code != .ECANCELED && code != .EPIPE
        default:
            return true
        }
    }

    // MARK: - Text file serving
    private func serveText(named name: String, on connection: NWConnection) {
    let candidates = candidateFileURLs(for: name)
    #if DEBUG
    print("🔍 Text lookup for \(name) candidates=\n" + candidates.map { "  • " + $0.path }.joined(separator: "\n"))
    #endif
    guard let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            sendSimple(status: 404, reason: "Not Found", body: "text file missing", on: connection)
            return
        }
        do {
            let data = try Data(contentsOf: url)
            let head = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(data.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
            var out = Data(head.utf8); out.append(data)
            connection.send(content: out, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
            print("🗎 Served text file: \(url.lastPathComponent) bytes=\(data.count)")
        } catch {
            sendSimple(status: 500, reason: "Internal Server Error", body: "read fail", on: connection)
        }
    }

    // MARK: - Faststart helpers
    // Synchronous ensureFastStartIfNeeded removed (now async to avoid QoS inversion)

    private func isLikelyFastStart(url: URL) -> Bool {
        // Heuristic: look for 'moov' atom before 'mdat' within first 128KB
        guard let fh = try? FileHandle(forReadingFrom: url) else { return true }
        defer { try? fh.close() }
        let window = 128 * 1024
        let data = try? fh.read(upToCount: window) ?? Data()
        guard let d = data else { return true }
        let s = String(decoding: d, as: UTF8.self)
        let moovIndex = s.range(of: "moov")?.lowerBound
        let mdatIndex = s.range(of: "mdat")?.lowerBound
        if let moov = moovIndex, let mdat = mdatIndex { return moov < mdat }
        return true // fallback assume ok if not both found
    }

    private func performFaststartRemux(original: URL) -> URL? {
        print("🚀 Faststart remux begin: \(original.lastPathComponent)")
        let asset = AVURLAsset(url: original)
        if #available(iOS 16.0, *) {
            let semaphoreKeys = DispatchSemaphore(value: 0)
            Task.detached {
                _ = try? await asset.load(.duration)
                _ = try? await asset.load(.isPlayable)
                do { _ = try await asset.loadTracks(withMediaType: .audio) } catch { }
                semaphoreKeys.signal()
            }
            _ = semaphoreKeys.wait(timeout: .now() + 5)
        } else {
            let keys = ["tracks", "duration", "playable"]
            asset.loadValuesAsynchronously(forKeys: keys) {}
            for k in keys { var err: NSError?; if asset.statusOfValue(forKey: k, error: &err) == .failed { print("❌ Key load failed \(k): \(err?.localizedDescription ?? "?")"); return nil } }
        }
        // Use AppleM4A preset to force rewritten container
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            print("❌ Faststart export session failed to create (AppleM4A)")
            return nil
        }
        export.shouldOptimizeForNetworkUse = true
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let outURL = caches.appendingPathComponent(original.deletingPathExtension().lastPathComponent + "_faststart.m4a")
        try? FileManager.default.removeItem(at: outURL)
        export.outputURL = outURL
        export.outputFileType = .m4a
        let semaphore = DispatchSemaphore(value: 0)
        export.exportAsynchronously { semaphore.signal() }
        if semaphore.wait(timeout: .now() + 10) == .timedOut {
            print("❌ Faststart export timeout")
            return nil
        }
        switch export.status {
        case .completed:
            print("✅ Faststart remux success: \(outURL.lastPathComponent)")
            return outURL
        case .failed, .cancelled:
            print("❌ Faststart remux failed: status=\(export.status) error=\(export.error?.localizedDescription ?? "unknown")")
            return nil
        default:
            print("❌ Faststart remux ended unexpected status=\(export.status)")
            return nil
        }
    }

    // Fallback re-encode via AVAssetReader/Writer (AAC) if remux fails
    private func reencodeM4A(original: URL) -> URL? {
        print("🛠 Re-encode attempt: \(original.lastPathComponent)")
        let asset = AVURLAsset(url: original)
    // Obtain first audio track (deprecated API acceptable as fallback inside extension)
        var audioTrack: AVAssetTrack?
        if #available(iOS 16.0, *) {
            let sem = DispatchSemaphore(value: 0)
            Task.detached {
                if let t = try? await asset.loadTracks(withMediaType: .audio) { audioTrack = t.first }
                sem.signal()
            }
            _ = sem.wait(timeout: .now() + 2)
        } else {
            audioTrack = asset.tracks.first
        }
        guard let track = audioTrack else { print("❌ Re-encode: no audio track"); return nil }
        let reader: AVAssetReader
        do { reader = try AVAssetReader(asset: asset) } catch { print("❌ Re-encode reader error: \(error)"); return nil }
        let outputSettings: [String: Any] = [ AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMIsFloatKey: false, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsNonInterleaved: false, AVLinearPCMIsBigEndianKey: false ]
        let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        if reader.canAdd(readerOutput) { reader.add(readerOutput) } else { print("❌ Re-encode cannot add reader output"); return nil }
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let outURL = caches.appendingPathComponent(original.deletingPathExtension().lastPathComponent + "_reencode.m4a")
        try? FileManager.default.removeItem(at: outURL)
        guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .m4a) else { print("❌ Re-encode writer create fail"); return nil }
        let aacSettings: [String: Any] = [ AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 2, AVSampleRateKey: 44100, AVEncoderBitRateKey: 128000 ]
        let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: aacSettings)
        writerInput.expectsMediaDataInRealTime = false
        if writer.canAdd(writerInput) { writer.add(writerInput) } else { print("❌ Re-encode cannot add writer input"); return nil }
        writer.startWriting(); reader.startReading(); writer.startSession(atSourceTime: .zero)
        let inputQueue = DispatchQueue(label: "reencode.writer.queue")
        let semaphore = DispatchSemaphore(value: 0)
        writerInput.requestMediaDataWhenReady(on: inputQueue) {
            while writerInput.isReadyForMoreMediaData {
                if let sample = readerOutput.copyNextSampleBuffer() {
                    if !writerInput.append(sample) { print("❌ Re-encode append fail"); writerInput.markAsFinished(); semaphore.signal(); return }
                } else {
                    writerInput.markAsFinished(); semaphore.signal(); return
                }
            }
        }
        if semaphore.wait(timeout: .now() + 15) == .timedOut { print("❌ Re-encode timeout"); reader.cancelReading(); writer.cancelWriting(); return nil }
        writer.finishWriting { }
        if writer.status == .completed { print("✅ Re-encode success: \(outURL.lastPathComponent)") ; return outURL }
        print("❌ Re-encode failed: status=\(writer.status) error=\(writer.error?.localizedDescription ?? "unknown")")
        return nil
    }
}

final class FastifySyncRelay {
    static let shared = FastifySyncRelay()

    private let queue = DispatchQueue(label: "ais.fastify.relay.queue")
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var reconnectDelay: TimeInterval = 1.0
    private var connecting = false
    private(set) var isConnected = false

    func connectIfConfigured() {
        queue.async { [weak self] in
            guard let self = self else { return }
            guard !self.connecting, !self.isConnected else { return }
            guard let endpoint = self.resolveEndpoint() else { return }
            self.connecting = true
            let session = URLSession(configuration: .default)
            self.session = session
            let task = session.webSocketTask(with: endpoint)
            self.task = task
            task.resume()
            self.isConnected = true
            self.connecting = false
            self.reconnectDelay = 1.0
            self.receiveLoop()
        }
    }

    func send(text: String) {
        queue.async { [weak self] in
            guard let self = self else { return }
            guard let task = self.task, self.isConnected else { return }
            task.send(.string(text)) { _ in }
        }
    }

    private func receiveLoop() {
        guard let task = task else { return }
        task.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    LocalHTTPServer.shared.handleFastifyRelayMessage(text)
                case .data(let data):
                    let text = String(decoding: data, as: UTF8.self)
                    LocalHTTPServer.shared.handleFastifyRelayMessage(text)
                @unknown default:
                    break
                }
                self.receiveLoop()
            case .failure:
                self.scheduleReconnect()
            }
        }
    }

    private func scheduleReconnect() {
        queue.async { [weak self] in
            guard let self = self else { return }
            self.isConnected = false
            self.task?.cancel(with: .goingAway, reason: nil)
            self.task = nil
            let delay = self.reconnectDelay
            self.reconnectDelay = min(self.reconnectDelay * 2, 30)
            self.queue.asyncAfter(deadline: .now() + delay) {
                self.connectIfConfigured()
            }
        }
    }

    private func resolveEndpoint() -> URL? {
        let keys = [
            "SQUIRREL_FASTIFY_WS_SYNC_URL",
            "SQUIRREL_FASTIFY_URL",
            "SQUIRREL_TAURI_FASTIFY_URL"
        ]

        let userDefaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? UserDefaults.standard
        for key in keys {
            if let raw = userDefaults.string(forKey: key), !raw.isEmpty {
                if key == "SQUIRREL_FASTIFY_WS_SYNC_URL" {
                    return URL(string: raw)
                }
                let base = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if base.isEmpty { continue }
                let wsBase = base
                    .replacingOccurrences(of: "https://", with: "wss://")
                    .replacingOccurrences(of: "http://", with: "ws://")
                    .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                return URL(string: wsBase + "/ws/sync")
            }
        }
        return nil
    }
}

private extension UInt64 {
    func asIntSafe() -> Int {
        if self > UInt64(Int.max) { return Int.max }
        return Int(self)
    }
}

extension LocalHTTPServer {
    private func enqueueAudioWork(key: String, work: @escaping () -> Void) {
        if activeAudioKeys.contains(key) {
            pendingAudioWork[key, default: []].append(work)
            return
        }
        activeAudioKeys.insert(key)
        work()
    }

    private func completeAudioWork(key: String) {
        if var queue = pendingAudioWork[key], !queue.isEmpty {
            let next = queue.removeFirst()
            pendingAudioWork[key] = queue.isEmpty ? nil : queue
            self.queue.async {
                next()
            }
            return
        }
        pendingAudioWork[key] = nil
        activeAudioKeys.remove(key)
    }
}

// (Helper async supprimé; utilisation d'attente sémaphore pour compat non-async)

fileprivate enum AiSRuntime {
    private static let queue = DispatchQueue(label: "ais.runtime.queue")
    private static var db: OpaquePointer?
    private static let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static let tokenSecret = "ais-local-auth-v1"
    private static let userNamespace: [UInt8] = [
        0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1,
        0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8
    ]
    private static let reservedUserParticleKeys: Set<String> = [
        "id", "atome_id", "user_id", "type", "kind", "owner_id", "creator_id",
        "created_at", "updated_at", "deleted_at", "sync_status", "last_sync",
        "password_hash", "phone", "username", "visibility", "access"
    ]
    private static let schemaSQL = """
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS atomes (
        atome_id TEXT PRIMARY KEY,
        atome_type TEXT NOT NULL,
        parent_id TEXT,
        owner_id TEXT,
        creator_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        last_sync TEXT,
        created_source TEXT DEFAULT 'ais',
        sync_status TEXT DEFAULT 'local'
    );
    CREATE INDEX IF NOT EXISTS idx_atomes_type ON atomes(atome_type);
    CREATE INDEX IF NOT EXISTS idx_atomes_parent ON atomes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id);
    CREATE TABLE IF NOT EXISTS particles (
        particle_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        particle_value TEXT,
        value_type TEXT DEFAULT 'string',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(atome_id, particle_key)
    );
    CREATE INDEX IF NOT EXISTS idx_particles_atome ON particles(atome_id);
    CREATE INDEX IF NOT EXISTS idx_particles_key ON particles(particle_key);
    CREATE TABLE IF NOT EXISTS particles_versions (
        version_id INTEGER PRIMARY KEY AUTOINCREMENT,
        particle_id INTEGER NOT NULL,
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS state_current (
        atome_id TEXT PRIMARY KEY,
        owner_id TEXT,
        project_id TEXT,
        properties TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        version INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_state_current_project ON state_current(project_id);
    CREATE INDEX IF NOT EXISTS idx_state_current_owner ON state_current(owner_id);
    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        atome_id TEXT,
        project_id TEXT,
        kind TEXT NOT NULL,
        payload TEXT,
        actor TEXT,
        tx_id TEXT,
        gesture_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_atome ON events(atome_id);
    CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
    CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT,
        project_id TEXT,
        snapshot_data TEXT,
        state_blob TEXT,
        label TEXT,
        snapshot_type TEXT DEFAULT 'manual',
        actor TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """

    static func handleAuthMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            do {
                let db = try openDatabase()
                let response: [String: Any]
                switch action {
                case "register":
                    response = try handleRegister(message, db: db, requestId: requestId)
                case "bootstrap":
                    response = try handleBootstrap(message, db: db, requestId: requestId)
                case "login":
                    response = try handleLogin(message, db: db, requestId: requestId)
                case "me":
                    response = try handleMe(message, db: db, requestId: requestId)
                case "lookup-phone":
                    response = try handleLookupPhone(message, db: db, requestId: requestId)
                case "logout":
                    response = authResponse(requestId: requestId, success: true)
                case "change-password":
                    response = try handleChangePassword(message, db: db, requestId: requestId)
                case "delete":
                    response = try handleDeleteAccount(message, db: db, requestId: requestId)
                default:
                    response = authResponse(requestId: requestId, success: false, error: "Unknown action: \(action)")
                }
                return response
            } catch {
                return authResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    static func handleAtomeMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            do {
                let db = try openDatabase()
                let response: [String: Any]
                switch action {
                case "create":
                    response = try handleAtomeCreate(message, db: db, requestId: requestId)
                case "list":
                    response = try handleAtomeList(message, db: db, requestId: requestId)
                case "get":
                    response = try handleAtomeGet(message, db: db, requestId: requestId)
                case "alter":
                    response = try handleAtomeAlter(message, db: db, requestId: requestId)
                case "delete", "soft-delete":
                    response = try handleAtomeDelete(message, db: db, requestId: requestId)
                default:
                    response = atomeResponse(requestId: requestId, success: false, error: "Unknown action: \(action)")
                }
                return response
            } catch {
                return atomeResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    static func handleEventsMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            do {
                let db = try openDatabase()
                let response: [String: Any]
                switch action {
                case "commit":
                    response = try handleEventCommit(message, db: db, requestId: requestId)
                case "commit-batch":
                    response = try handleEventCommitBatch(message, db: db, requestId: requestId)
                case "list":
                    response = try handleEventList(message, db: db, requestId: requestId)
                default:
                    response = eventsResponse(requestId: requestId, success: false, error: "Unknown action: \(action)")
                }
                return response
            } catch {
                return eventsResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    static func handleStateCurrentMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            do {
                let db = try openDatabase()
                let response: [String: Any]
                switch action {
                case "get":
                    response = try handleStateCurrentGet(message, db: db, requestId: requestId)
                case "list":
                    response = try handleStateCurrentList(message, db: db, requestId: requestId)
                default:
                    response = stateCurrentResponse(requestId: requestId, success: false, error: "Unknown action: \(action)")
                }
                return response
            } catch {
                return stateCurrentResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    static func handleSnapshotMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            do {
                let db = try openDatabase()
                let response: [String: Any]
                switch action {
                case "create":
                    response = try handleSnapshotCreate(message, db: db, requestId: requestId)
                default:
                    response = snapshotResponse(requestId: requestId, success: false, error: "Unknown action: \(action)")
                }
                return response
            } catch {
                return snapshotResponse(requestId: requestId, success: false, error: error.localizedDescription)
            }
        }
    }

    static func resolveAuthenticatedUserId(token: String?, userIdHint: String?, phoneHint: String?) -> String? {
        queue.sync {
            guard let db = try? openDatabase() else { return nil }
            if let token,
               !token.isEmpty,
               let claims = try? verifyToken(token),
               let userId = normalizedOptionalString(claims["sub"]),
               (try? findUserRecordById(db, userId)) != nil {
                return userId
            }
            if let userIdHint = normalizedOptionalString(userIdHint),
               (try? findUserRecordById(db, userIdHint)) != nil {
                return userIdHint
            }
            if let phoneHint = normalizedOptionalString(phoneHint) {
                let normalizedPhone = normalizePhone(phoneHint)
                if let record = try? findUserRecordByPhone(db, normalizedPhone) {
                    return record.userId
                }
            }
            return nil
        }
    }

    private static func handleRegister(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let username = stringValue(message["username"]).trimmingCharacters(in: .whitespacesAndNewlines)
        if username.count < 2 {
            return authResponse(requestId: requestId, success: false, error: "Username must be at least 2 characters")
        }
        return try registerUser(message, db: db, requestId: requestId, username: username)
    }

    private static func handleBootstrap(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let username = stringValue(message["username"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedUsername = username.count >= 2 ? username : "user"
        return try registerUser(message, db: db, requestId: requestId, username: resolvedUsername)
    }

    private static func registerUser(_ message: [String: Any], db: OpaquePointer?, requestId: String?, username: String) throws -> [String: Any] {
        let phone = normalizePhone(stringValue(message["phone"]))
        if phone.count < 6 {
            return authResponse(requestId: requestId, success: false, error: "Phone must be at least 6 characters")
        }
        let password = stringValue(message["password"])
        if password.count < 8 {
            return authResponse(requestId: requestId, success: false, error: "Password must be at least 8 characters")
        }
        let visibility = normalizeVisibility(stringValue(message["visibility"]))
        let optional = normalizeUserOptional(message["optional"] as? [String: Any] ?? [:])
        let userId = generateDeterministicUserId(phone)
        let now = isoNow()
        let passwordHash = hashPassword(password)

        if let existing = try findUserRecordByPhone(db, phone) ?? findUserRecordById(db, userId) {
            if existing.deletedAt != nil {
                try execute(db, """
                    UPDATE atomes
                    SET atome_type = 'user', deleted_at = NULL, updated_at = ?, sync_status = 'local'
                    WHERE atome_id = ?
                    """, [.text(now), .text(existing.userId)])
                try upsertRequiredUserParticles(db, atomeId: existing.userId, username: username, phone: phone, passwordHash: passwordHash, visibility: visibility, now: now)
                try upsertOptionalParticles(db, atomeId: existing.userId, values: optional, changedBy: existing.userId, now: now)
                try upsertStateCurrent(db, atomeId: existing.userId, ownerId: existing.userId, properties: try loadParticles(db, atomeId: existing.userId), now: now)
                let user = try loadUserInfo(db, userId: existing.userId)
                let token = try createToken(userId: existing.userId, username: user["username"] as? String ?? username, phone: user["phone"] as? String ?? phone)
                return authResponse(requestId: requestId, success: true, user: user, token: token)
            }
            let user = try loadUserInfo(db, userId: existing.userId)
            return authResponse(requestId: requestId, success: true, user: user, alreadyExists: true)
        }

        try execute(db, """
            INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at, created_source, sync_status)
            VALUES (?, 'user', ?, ?, ?, ?, 'ais', 'local')
            """, [.text(userId), .text(userId), .text(userId), .text(now), .text(now)])
        try upsertRequiredUserParticles(db, atomeId: userId, username: username, phone: phone, passwordHash: passwordHash, visibility: visibility, now: now)
        try upsertOptionalParticles(db, atomeId: userId, values: optional, changedBy: userId, now: now)
        try upsertStateCurrent(db, atomeId: userId, ownerId: userId, properties: try loadParticles(db, atomeId: userId), now: now)
        let token = try createToken(userId: userId, username: username, phone: phone)
        let user = try loadUserInfo(db, userId: userId)
        return authResponse(requestId: requestId, success: true, user: user, token: token)
    }

    private static func handleLogin(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let phone = normalizePhone(stringValue(message["phone"]))
        let password = stringValue(message["password"])
        if phone.isEmpty || password.isEmpty {
            return authResponse(requestId: requestId, success: false, error: "Phone and password are required")
        }
        guard let existing = try findUserRecordByPhone(db, phone) ?? findUserRecordById(db, generateDeterministicUserId(phone)) else {
            return authResponse(requestId: requestId, success: false, error: "Invalid credentials")
        }
        let storedHash = try loadParticleString(db, atomeId: existing.userId, key: "password_hash") ?? ""
        if !verifyPassword(password, storedHash: storedHash) {
            return authResponse(requestId: requestId, success: false, error: "Invalid credentials")
        }
        let user = try loadUserInfo(db, userId: existing.userId)
        let token = try createToken(userId: existing.userId, username: user["username"] as? String ?? "", phone: user["phone"] as? String ?? phone)
        return authResponse(requestId: requestId, success: true, user: user, token: token)
    }

    private static func handleMe(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return authResponse(requestId: requestId, success: false, error: "Token is required")
        }
        let userId = stringValue(claims["sub"])
        guard let _ = try findUserRecordById(db, userId) else {
            return authResponse(requestId: requestId, success: false, error: "User not found")
        }
        let user = try loadUserInfo(db, userId: userId)
        return authResponse(requestId: requestId, success: true, user: user)
    }

    private static func handleLookupPhone(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let phone = normalizePhone(stringValue(message["phone"]))
        if phone.count < 6 {
            return authResponse(requestId: requestId, success: false, error: "Phone must be at least 6 characters")
        }
        guard let existing = try findUserRecordByPhone(db, phone) else {
            return authResponse(requestId: requestId, success: false, error: "User not found")
        }
        let user = try loadUserInfo(db, userId: existing.userId)
        return authResponse(requestId: requestId, success: true, user: user)
    }

    private static func handleChangePassword(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return authResponse(requestId: requestId, success: false, error: "Token is required")
        }
        let userId = stringValue(claims["sub"])
        let currentPassword = stringValue(message["currentPassword"])
        let newPassword = stringValue(message["newPassword"])
        if newPassword.count < 8 {
            return authResponse(requestId: requestId, success: false, error: "Password must be at least 8 characters")
        }
        let storedHash = try loadParticleString(db, atomeId: userId, key: "password_hash") ?? ""
        if !verifyPassword(currentPassword, storedHash: storedHash) {
            return authResponse(requestId: requestId, success: false, error: "Invalid credentials")
        }
        let now = isoNow()
        try upsertParticle(db, atomeId: userId, key: "password_hash", value: hashPassword(newPassword), changedBy: userId, now: now)
        return authResponse(requestId: requestId, success: true)
    }

    private static func handleDeleteAccount(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return authResponse(requestId: requestId, success: false, error: "Token is required")
        }
        let userId = stringValue(claims["sub"])
        let password = stringValue(message["password"])
        let storedHash = try loadParticleString(db, atomeId: userId, key: "password_hash") ?? ""
        if !verifyPassword(password, storedHash: storedHash) {
            return authResponse(requestId: requestId, success: false, error: "Invalid credentials")
        }
        let now = isoNow()
        try execute(db, "UPDATE atomes SET deleted_at = ?, updated_at = ? WHERE atome_id = ?", [.text(now), .text(now), .text(userId)])
        try execute(db, "DELETE FROM state_current WHERE atome_id = ?", [.text(userId)])
        return authResponse(requestId: requestId, success: true)
    }

    private static func handleAtomeCreate(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let atomeId = stringValue(message["atome_id"] ?? message["id"])
        if atomeId.isEmpty {
            return atomeResponse(requestId: requestId, success: false, error: "Missing atome_id")
        }
        let token = stringValue(message["token"])
        let claims = try verifyToken(token)
        let userId = claims != nil ? stringValue(claims!["sub"]) : stringValue(message["owner_id"] ?? message["ownerId"])
        if userId.isEmpty {
            return atomeResponse(requestId: requestId, success: false, error: "Missing owner_id or token")
        }
        let atomeType = stringValue(message["atome_type"] ?? message["type"])
        let parentId = normalizedOptionalString(message["parent_id"] ?? message["parentId"])
        let now = isoNow()

        // If atome already exists (idempotent), update instead
        if let existing = try findAnyAtomeMeta(db, atomeId: atomeId) {
            if existing.ownerId == userId || existing.creatorId == userId {
                let particles = message["particles"] as? [String: Any] ?? message["properties"] as? [String: Any] ?? [:]
                try execute(db, "UPDATE atomes SET deleted_at = NULL, updated_at = ?, sync_status = 'local' WHERE atome_id = ?", [.text(now), .text(atomeId)])
                for (key, value) in particles {
                    try upsertParticle(db, atomeId: atomeId, key: key, value: value, changedBy: userId, now: now)
                }
                try upsertStateCurrent(db, atomeId: atomeId, ownerId: userId, properties: try loadParticles(db, atomeId: atomeId), now: now)
                return atomeResponse(requestId: requestId, success: true, data: try serializeAtome(db, atomeId: atomeId))
            }
            return atomeResponse(requestId: requestId, success: false, error: "Atome already exists")
        }

        // Insert new atome
        try execute(db, """
            INSERT INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, created_source, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ais', 'local')
            """, [
                .text(atomeId),
                .text(atomeType.isEmpty ? "raw" : atomeType),
                parentId != nil ? .text(parentId!) : .null,
                .text(userId),
                .text(userId),
                .text(now),
                .text(now)
            ])

        // Insert particles/properties
        let particles = message["particles"] as? [String: Any] ?? message["properties"] as? [String: Any] ?? [:]
        for (key, value) in particles {
            try upsertParticle(db, atomeId: atomeId, key: key, value: value, changedBy: userId, now: now)
        }

        // Update state_current
        try upsertStateCurrent(db, atomeId: atomeId, ownerId: userId, properties: try loadParticles(db, atomeId: atomeId), now: now)

        return atomeResponse(requestId: requestId, success: true, data: try serializeAtome(db, atomeId: atomeId))
    }

    private static func handleAtomeList(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let atomeType = stringValue(message["atome_type"])
        let ownerId = stringValue(message["owner_id"])
        let parentId = stringValue(message["parent_id"])
        let limit = intValue(message["limit"], defaultValue: 500)
        let offset = intValue(message["offset"], defaultValue: 0)
        var sql = "SELECT atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, created_source, sync_status FROM atomes WHERE deleted_at IS NULL"
        var bindings: [SQLiteBinding] = []
        if !atomeType.isEmpty {
            sql += " AND atome_type = ?"
            bindings.append(.text(atomeType))
        }
        if !ownerId.isEmpty && ownerId != "*" {
            sql += " AND owner_id = ?"
            bindings.append(.text(ownerId))
        }
        if !parentId.isEmpty {
            sql += " AND parent_id = ?"
            bindings.append(.text(parentId))
        }
        sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
        bindings.append(.int(limit))
        bindings.append(.int(offset))
        let rows = try query(db, sql, bindings)
        let atomes = try rows.map { row in
            let atomeId = stringValue(rowValue(row, "atome_id"))
            return try serializeAtome(db, atomeId: atomeId)
        }
        return atomeResponse(requestId: requestId, success: true, atomes: atomes, count: Int64(atomes.count))
    }

    private static func handleAtomeGet(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let atomeId = stringValue(message["atome_id"] ?? message["id"])
        if atomeId.isEmpty {
            return atomeResponse(requestId: requestId, success: false, error: "Missing atome_id")
        }
        let atome = try serializeAtome(db, atomeId: atomeId)
        return atomeResponse(requestId: requestId, success: true, data: atome)
    }

    private static func handleAtomeAlter(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let atomeId = stringValue(message["atome_id"] ?? message["id"])
        if atomeId.isEmpty {
            return atomeResponse(requestId: requestId, success: false, error: "Missing atome_id")
        }
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return atomeResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let userId = stringValue(claims["sub"])
        guard let record = try findAtomeMeta(db, atomeId: atomeId) else {
            return atomeResponse(requestId: requestId, success: false, error: "Atome not found")
        }
        if !canWrite(record: record, userId: userId) {
            return atomeResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let particles = message["particles"] as? [String: Any] ?? [:]
        let now = isoNow()
        try execute(db, "UPDATE atomes SET updated_at = ?, sync_status = 'pending' WHERE atome_id = ?", [.text(now), .text(atomeId)])
        for (key, value) in particles {
            try upsertParticle(db, atomeId: atomeId, key: key, value: value, changedBy: userId, now: now)
        }
        try upsertStateCurrent(db, atomeId: atomeId, ownerId: record.ownerId, properties: try loadParticles(db, atomeId: atomeId), now: now)
        return atomeResponse(requestId: requestId, success: true, data: try serializeAtome(db, atomeId: atomeId))
    }

    private static func handleAtomeDelete(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let atomeId = stringValue(message["atome_id"] ?? message["id"])
        if atomeId.isEmpty {
            return atomeResponse(requestId: requestId, success: false, error: "Missing atome_id")
        }
        guard let claims = try verifyToken(stringValue(message["token"])) else {
            return atomeResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let userId = stringValue(claims["sub"])
        guard let record = try findAtomeMeta(db, atomeId: atomeId) else {
            return atomeResponse(requestId: requestId, success: false, error: "Atome not found")
        }
        if !canWrite(record: record, userId: userId) {
            return atomeResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let now = isoNow()
        try execute(db, "UPDATE atomes SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE atome_id = ?", [.text(now), .text(now), .text(atomeId)])
        try execute(db, "DELETE FROM state_current WHERE atome_id = ?", [.text(atomeId)])
        return atomeResponse(requestId: requestId, success: true)
    }

    private static func handleEventCommit(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return eventsResponse(requestId: requestId, success: false, error: "Access denied")
        }
        guard let rawEvent = message["event"] as? [String: Any] else {
            return eventsResponse(requestId: requestId, success: false, error: "Invalid event payload")
        }
        let event = try normalizeEventInput(rawEvent, defaultActorId: stringValue(claims["sub"]))
        try appendEvent(db, event: event)
        return eventsResponse(requestId: requestId, success: true, event: event)
    }

    private static func handleEventCommitBatch(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return eventsResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let defaultActorId = stringValue(claims["sub"])
        let txId = stringValue(message["tx_id"] ?? message["txId"])
        guard let rawEvents = message["events"] as? [[String: Any]] else {
            return eventsResponse(requestId: requestId, success: false, error: "Missing events array")
        }
        let events = try rawEvents.map { raw -> [String: Any] in
            var event = raw
            if !txId.isEmpty, event["tx_id"] == nil, event["txId"] == nil {
                event["tx_id"] = txId
            }
            return try normalizeEventInput(event, defaultActorId: defaultActorId)
        }
        try appendEvents(db, events: events)
        return eventsResponse(requestId: requestId, success: true, events: events)
    }

    private static func handleEventList(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard (try verifyToken(token)) != nil else {
            return eventsResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let events = try listEvents(
            db,
            projectId: normalizedOptionalString(message["project_id"] ?? message["projectId"]),
            atomeId: normalizedOptionalString(message["atome_id"] ?? message["atomeId"]),
            txId: normalizedOptionalString(message["tx_id"] ?? message["txId"]),
            gestureId: normalizedOptionalString(message["gesture_id"] ?? message["gestureId"]),
            since: normalizedOptionalString(message["since"]),
            until: normalizedOptionalString(message["until"]),
            limit: intValue(message["limit"], defaultValue: 1000),
            offset: intValue(message["offset"], defaultValue: 0),
            order: normalizedOptionalString(message["order"]) ?? "asc"
        )
        return eventsResponse(requestId: requestId, success: true, events: events)
    }

    private static func handleStateCurrentGet(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let atomeId = stringValue(message["atome_id"] ?? message["id"])
        if atomeId.isEmpty {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Missing atome_id")
        }
        guard let state = try getStateCurrent(db, atomeId: atomeId) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "State not found")
        }
        let userId = stringValue(claims["sub"])
        guard canReadState(state: state, userId: userId) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Access denied")
        }
        return stateCurrentResponse(requestId: requestId, success: true, state: state)
    }

    private static func handleStateCurrentList(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return stateCurrentResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let states = try listStateCurrent(
            db,
            projectId: normalizedOptionalString(message["project_id"] ?? message["projectId"]),
            ownerId: stringValue(claims["sub"]),
            limit: intValue(message["limit"], defaultValue: 1000),
            offset: intValue(message["offset"], defaultValue: 0)
        )
        return stateCurrentResponse(requestId: requestId, success: true, states: states)
    }

    private static func handleSnapshotCreate(_ message: [String: Any], db: OpaquePointer?, requestId: String?) throws -> [String: Any] {
        let token = stringValue(message["token"])
        guard let claims = try verifyToken(token) else {
            return snapshotResponse(requestId: requestId, success: false, error: "Access denied")
        }
        let projectId = normalizedOptionalString(message["project_id"] ?? message["projectId"])
        let atomeId = normalizedOptionalString(message["atome_id"] ?? message["atomeId"])
        if projectId == nil && atomeId == nil {
            return snapshotResponse(requestId: requestId, success: false, error: "Missing project_id or atome_id")
        }
        let actor = (message["actor"] as? [String: Any]) ?? [
            "type": "user",
            "id": stringValue(claims["sub"])
        ]
        let snapshotId = try createStateSnapshot(
            db,
            projectId: projectId,
            atomeId: atomeId,
            label: normalizedOptionalString(message["label"]),
            actor: actor,
            state: message["state"] ?? message["state_blob"] ?? message["stateBlob"],
            snapshotType: normalizedOptionalString(message["snapshot_type"] ?? message["snapshotType"]) ?? "manual",
            createdBy: stringValue(claims["sub"])
        )
        return snapshotResponse(requestId: requestId, success: true, snapshotId: snapshotId)
    }

    private static func openDatabase() throws -> OpaquePointer? {
        if let existing = db {
            return existing
        }
        guard let root = SandboxPathValidator.primaryRoot() ?? SandboxPathValidator.pluginContainerRoot() else {
            throw AiSError("AiS storage root unavailable")
        }
        let databaseURL = root.appendingPathComponent("adole.db", isDirectory: false)
        var handle: OpaquePointer?
        let rc = sqlite3_open_v2(databaseURL.path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
        guard rc == SQLITE_OK, let opened = handle else {
            throw AiSError("Unable to open AiS database")
        }
        sqlite3_busy_timeout(opened, 2000)
        guard sqlite3_exec(opened, schemaSQL, nil, nil, nil) == SQLITE_OK else {
            let message = String(cString: sqlite3_errmsg(opened))
            sqlite3_close(opened)
            throw AiSError(message)
        }
        db = opened
        return opened
    }

    private static func serializeAtome(_ db: OpaquePointer?, atomeId: String) throws -> [String: Any] {
        guard let meta = try findAtomeMeta(db, atomeId: atomeId) else {
            throw AiSError("Atome not found")
        }
        let particles = try loadParticles(db, atomeId: atomeId)
        var payload: [String: Any] = [
            "atome_id": meta.atomeId,
            "id": meta.atomeId,
            "atome_type": meta.atomeType,
            "owner_id": meta.ownerId,
            "creator_id": meta.creatorId,
            "created_at": meta.createdAt,
            "updated_at": meta.updatedAt,
            "created_source": meta.createdSource,
            "sync_status": meta.syncStatus,
            "data": particles,
            "particles": particles
        ]
        payload["parent_id"] = meta.parentId ?? NSNull()
        return payload
    }

    private static func loadUserInfo(_ db: OpaquePointer?, userId: String) throws -> [String: Any] {
        let username = try loadParticleString(db, atomeId: userId, key: "username") ?? ""
        let phone = try loadParticleString(db, atomeId: userId, key: "phone") ?? ""
        let rows = try query(db, "SELECT created_at FROM atomes WHERE atome_id = ? LIMIT 1", [.text(userId)])
        let createdAt = rowString(rows.first, "created_at") ?? isoNow()
        return [
            "user_id": userId,
            "id": userId,
            "username": username,
            "phone": phone,
            "created_at": createdAt
        ]
    }

    private static func findUserRecordByPhone(_ db: OpaquePointer?, _ phone: String) throws -> UserRecord? {
        let rows = try query(db, """
            SELECT a.atome_id, a.atome_type, a.deleted_at
            FROM atomes a
            JOIN particles p ON p.atome_id = a.atome_id AND p.particle_key = 'phone'
            WHERE p.particle_value = ?
            ORDER BY a.updated_at DESC
            LIMIT 1
            """, [.text(try jsonString(phone))])
        guard let row = rows.first else { return nil }
        return UserRecord(
            userId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            deletedAt: rowString(row, "deleted_at")
        )
    }

    private static func findUserRecordById(_ db: OpaquePointer?, _ userId: String) throws -> UserRecord? {
        let rows = try query(db, "SELECT atome_id, atome_type, deleted_at FROM atomes WHERE atome_id = ? LIMIT 1", [.text(userId)])
        guard let row = rows.first else { return nil }
        return UserRecord(
            userId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            deletedAt: rowString(row, "deleted_at")
        )
    }

    private static func findAtomeMeta(_ db: OpaquePointer?, atomeId: String) throws -> AtomeMeta? {
        let rows = try query(db, """
            SELECT atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, created_source, sync_status
            FROM atomes
            WHERE atome_id = ? AND deleted_at IS NULL
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        return AtomeMeta(
            atomeId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            parentId: rowString(row, "parent_id"),
            ownerId: stringValue(rowValue(row, "owner_id")),
            creatorId: stringValue(rowValue(row, "creator_id")),
            createdAt: stringValue(rowValue(row, "created_at")),
            updatedAt: stringValue(rowValue(row, "updated_at")),
            createdSource: stringValue(rowValue(row, "created_source")),
            syncStatus: stringValue(rowValue(row, "sync_status"))
        )
    }

    private static func findAnyAtomeMeta(_ db: OpaquePointer?, atomeId: String) throws -> AtomeMeta? {
        let rows = try query(db, """
            SELECT atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, created_source, sync_status
            FROM atomes
            WHERE atome_id = ?
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        return AtomeMeta(
            atomeId: stringValue(rowValue(row, "atome_id")),
            atomeType: stringValue(rowValue(row, "atome_type")),
            parentId: rowString(row, "parent_id"),
            ownerId: stringValue(rowValue(row, "owner_id")),
            creatorId: stringValue(rowValue(row, "creator_id")),
            createdAt: stringValue(rowValue(row, "created_at")),
            updatedAt: stringValue(rowValue(row, "updated_at")),
            createdSource: stringValue(rowValue(row, "created_source")),
            syncStatus: stringValue(rowValue(row, "sync_status"))
        )
    }

    private static func canWrite(record: AtomeMeta, userId: String) -> Bool {
        if record.ownerId == userId { return true }
        if record.creatorId == userId { return true }
        return false
    }

    private static func upsertRequiredUserParticles(_ db: OpaquePointer?, atomeId: String, username: String, phone: String, passwordHash: String, visibility: String, now: String) throws {
        try upsertParticle(db, atomeId: atomeId, key: "username", value: username, changedBy: atomeId, now: now)
        try upsertParticle(db, atomeId: atomeId, key: "phone", value: phone, changedBy: atomeId, now: now)
        try upsertParticle(db, atomeId: atomeId, key: "password_hash", value: passwordHash, changedBy: atomeId, now: now)
        try upsertParticle(db, atomeId: atomeId, key: "visibility", value: visibility, changedBy: atomeId, now: now)
        try upsertParticle(db, atomeId: atomeId, key: "access", value: visibility, changedBy: atomeId, now: now)
    }

    private static func upsertOptionalParticles(_ db: OpaquePointer?, atomeId: String, values: [String: Any], changedBy: String, now: String) throws {
        for (key, value) in values {
            try upsertParticle(db, atomeId: atomeId, key: key, value: value, changedBy: changedBy, now: now)
        }
    }

    private static func upsertParticle(_ db: OpaquePointer?, atomeId: String, key: String, value: Any, changedBy: String, now: String) throws {
        let newValue = try jsonString(value)
        let previousRows = try query(db, "SELECT particle_id, particle_value, version FROM particles WHERE atome_id = ? AND particle_key = ? LIMIT 1", [.text(atomeId), .text(key)])
        let oldValue = previousRows.first?["particle_value"] as? String
        let particleId = previousRows.first?["particle_id"] as? Int64 ?? 0
        let version = previousRows.first?["version"] as? Int64 ?? 0
        let valueType = sqliteValueType(value)
        try execute(db, """
            INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                particle_value = excluded.particle_value,
                value_type = excluded.value_type,
                version = particles.version + 1,
                updated_at = excluded.updated_at
            """, [.text(atomeId), .text(key), .text(newValue), .text(valueType), .text(now), .text(now)])
        if let oldValue, oldValue != newValue {
            let latestParticleRows = try query(db, "SELECT particle_id, version FROM particles WHERE atome_id = ? AND particle_key = ? LIMIT 1", [.text(atomeId), .text(key)])
            let latestParticleId = latestParticleRows.first?["particle_id"] as? Int64 ?? particleId
            let latestVersion = latestParticleRows.first?["version"] as? Int64 ?? (version + 1)
            try execute(db, """
                INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, [.int(latestParticleId), .text(atomeId), .text(key), .int(latestVersion), .text(oldValue), .text(newValue), .text(changedBy), .text(now)])
        }
    }

    private static func loadParticles(_ db: OpaquePointer?, atomeId: String) throws -> [String: Any] {
        let rows = try query(db, "SELECT particle_key, particle_value FROM particles WHERE atome_id = ?", [.text(atomeId)])
        var out: [String: Any] = [:]
        for row in rows {
            let key = stringValue(row["particle_key"])
            guard !key.isEmpty else { continue }
            if let raw = row["particle_value"] as? String {
                out[key] = parseJSONValue(raw)
            }
        }
        return out
    }

    private static func loadParticleString(_ db: OpaquePointer?, atomeId: String, key: String) throws -> String? {
        let rows = try query(db, "SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ? LIMIT 1", [.text(atomeId), .text(key)])
        guard let raw = rows.first?["particle_value"] as? String else { return nil }
        return stringValue(parseJSONValue(raw))
    }

    private static func upsertStateCurrent(_ db: OpaquePointer?, atomeId: String, ownerId: String, projectId: String? = nil, properties: [String: Any], now: String) throws {
        let encoded = try jsonString(properties)
        try execute(db, """
            INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(atome_id) DO UPDATE SET
                owner_id = excluded.owner_id,
                project_id = COALESCE(excluded.project_id, state_current.project_id),
                properties = excluded.properties,
                updated_at = excluded.updated_at,
                version = state_current.version + 1
            """, [.text(atomeId), .text(ownerId), projectId.map(SQLiteBinding.text) ?? .null, .text(encoded), .text(now)])
    }

    private static func normalizeEventInput(_ event: [String: Any], defaultActorId: String?) throws -> [String: Any] {
        let kind = normalizedOptionalString(event["kind"] ?? event["event"]) ?? ""
        if kind.isEmpty {
            throw AiSError("Missing event kind")
        }
        let atomeId = normalizedOptionalString(event["atome_id"] ?? event["atomeId"] ?? event["id"])
        if kind != "snapshot" && (atomeId == nil || atomeId == "") {
            throw AiSError("Missing event atome_id")
        }
        var normalized: [String: Any] = [
            "id": normalizedOptionalString(event["id"] ?? event["event_id"] ?? event["eventId"]) ?? UUID().uuidString.lowercased(),
            "ts": normalizedOptionalString(event["ts"] ?? event["timestamp"]) ?? isoNow(),
            "kind": kind
        ]
        if let atomeId { normalized["atome_id"] = atomeId }
        if let projectId = normalizedOptionalString(event["project_id"] ?? event["projectId"]) { normalized["project_id"] = projectId }
        if let payload = resolveEventPayload(event) { normalized["payload"] = payload }
        if let txId = normalizedOptionalString(event["tx_id"] ?? event["txId"]) { normalized["tx_id"] = txId }
        if let gestureId = normalizedOptionalString(event["gesture_id"] ?? event["gestureId"]) { normalized["gesture_id"] = gestureId }
        if let ownerId = normalizedOptionalString(event["owner_id"] ?? event["ownerId"] ?? event["owner"]) { normalized["owner_id"] = ownerId }
        if let actor = event["actor"] {
            normalized["actor"] = actor
        } else if let defaultActorId, !defaultActorId.isEmpty {
            normalized["actor"] = ["type": "user", "id": defaultActorId]
        }
        return normalized
    }

    private static func resolveEventPayload(_ event: [String: Any]) -> Any? {
        if let payload = event["payload"] { return payload }
        if let props = event["props"] as? [String: Any] { return ["props": props] }
        if let props = event["properties"] as? [String: Any] { return ["props": props] }
        if let patch = event["patch"] as? [String: Any] { return ["props": patch] }
        if let delta = event["delta"] as? [String: Any] { return ["props": delta] }
        return nil
    }

    private static func extractEventPatch(kind: String, payload: Any?, ts: String) -> [String: Any]? {
        if kind == "delete" {
            return ["__deleted": true, "deleted_at": ts]
        }
        guard let payloadObj = payload as? [String: Any] else { return nil }
        if let patch = payloadObj["props"] as? [String: Any] { return patch }
        if let patch = payloadObj["properties"] as? [String: Any] { return patch }
        if let patch = payloadObj["patch"] as? [String: Any] { return patch }
        if let patch = payloadObj["delta"] as? [String: Any] { return patch }
        return nil
    }

    private static let eventMetaParticleKeys: Set<String> = [
        "type", "atome_type", "kind",
        "parent_id", "parentId",
        "project_id", "projectId",
        "__deleted", "deleted_at"
    ]

    private static func resolveActorId(_ actor: Any?) -> String? {
        guard let actor = actor as? [String: Any] else { return nil }
        return normalizedOptionalString(actor["id"] ?? actor["user_id"] ?? actor["userId"])
    }

    private static func resolveEventType(_ patch: [String: Any]) -> String? {
        normalizedOptionalString(patch["type"] ?? patch["atome_type"] ?? patch["kind"])
    }

    private static func resolveEventParentId(_ patch: [String: Any]) -> String? {
        normalizedOptionalString(patch["parent_id"] ?? patch["parentId"] ?? patch["project_id"] ?? patch["projectId"])
    }

    private static func stripEventMetaPatch(_ patch: [String: Any]) -> [String: Any] {
        var filtered: [String: Any] = [:]
        for (key, value) in patch where !eventMetaParticleKeys.contains(key) {
            filtered[key] = value
        }
        return filtered
    }

    private static func appendEvent(_ db: OpaquePointer?, event: [String: Any]) throws {
        let eventId = stringValue(event["id"])
        let existing = try query(db, "SELECT id FROM events WHERE id = ? LIMIT 1", [.text(eventId)])
        if !existing.isEmpty { return }
        let payloadString = try jsonString(event["payload"] ?? NSNull())
        let actorString = try jsonString(event["actor"] ?? NSNull())
        try execute(db, """
            INSERT INTO events (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
            .text(eventId),
            .text(stringValue(event["ts"])),
            normalizedOptionalString(event["atome_id"]).map(SQLiteBinding.text) ?? .null,
            normalizedOptionalString(event["project_id"]).map(SQLiteBinding.text) ?? .null,
            .text(stringValue(event["kind"])),
            .text(payloadString),
            .text(actorString),
            normalizedOptionalString(event["tx_id"]).map(SQLiteBinding.text) ?? .null,
            normalizedOptionalString(event["gesture_id"]).map(SQLiteBinding.text) ?? .null
        ])
        _ = try applyEventToStateCurrent(db, event: event)
    }

    private static func appendEvents(_ db: OpaquePointer?, events: [[String: Any]]) throws {
        for event in events {
            try appendEvent(db, event: event)
        }
    }

    private static func applyEventToStateCurrent(_ db: OpaquePointer?, event: [String: Any]) throws -> [String: Any]? {
        let atomeId = stringValue(event["atome_id"])
        if atomeId.isEmpty { return nil }
        let ts = normalizedOptionalString(event["ts"]) ?? isoNow()
        let kind = stringValue(event["kind"])
        guard let patch = extractEventPatch(kind: kind, payload: event["payload"], ts: ts) else { return nil }

        let actorId = resolveActorId(event["actor"])
        let patchOwnerId = normalizedOptionalString(patch["owner_id"] ?? patch["ownerId"] ?? patch["owner"])
        let eventOwnerId = normalizedOptionalString(event["owner_id"] ?? event["ownerId"] ?? event["owner"])
        let patchType = resolveEventType(patch)
        let patchParentId = resolveEventParentId(patch)
        let deleted = boolValue(patch["__deleted"])
        let particlePatch = stripEventMetaPatch(patch)
        let existingMeta = try findAnyAtomeMeta(db, atomeId: atomeId)

        let resolvedOwnerId = firstNonEmptyString([
            eventOwnerId,
            patchOwnerId,
            actorId,
            existingMeta?.ownerId
        ]) ?? atomeId
        try upsertAtomeFromEvent(
            db,
            atomeId: atomeId,
            atomeType: patchType,
            parentId: patchParentId,
            ownerId: resolvedOwnerId,
            creatorId: existingMeta?.creatorId ?? resolvedOwnerId,
            deleted: deleted,
            now: ts
        )

        let changedBy = firstNonEmptyString([actorId, resolvedOwnerId]) ?? atomeId
        for (key, value) in particlePatch {
            try upsertParticle(db, atomeId: atomeId, key: key, value: value, changedBy: changedBy, now: ts)
        }

        let existingState = try loadStateCurrentEntry(db, atomeId: atomeId)
        var nextProps = existingState?.properties ?? [:]
        for (key, value) in patch { nextProps[key] = value }
        if nextProps["type"] == nil, let patchType { nextProps["type"] = patchType }
        if nextProps["type"] == nil, let existingType = existingMeta?.atomeType, !existingType.isEmpty { nextProps["type"] = existingType }
        if let parentId = patchParentId ?? existingMeta?.parentId {
            if nextProps["parent_id"] == nil { nextProps["parent_id"] = parentId }
            if nextProps["parentId"] == nil { nextProps["parentId"] = parentId }
        }
        let projectId = firstNonEmptyString([
            normalizedOptionalString(event["project_id"] ?? event["projectId"]),
            normalizedOptionalString(patch["project_id"] ?? patch["projectId"]),
            existingState?.projectId
        ])
        if let projectId {
            if nextProps["project_id"] == nil { nextProps["project_id"] = projectId }
            if nextProps["projectId"] == nil { nextProps["projectId"] = projectId }
        }
        let stateOwnerId = firstNonEmptyString([
            eventOwnerId,
            patchOwnerId,
            existingState?.ownerId,
            resolvedOwnerId
        ]) ?? resolvedOwnerId
        try upsertStateCurrent(db, atomeId: atomeId, ownerId: stateOwnerId, projectId: projectId, properties: nextProps, now: ts)
        return try getStateCurrent(db, atomeId: atomeId)
    }

    private static func upsertAtomeFromEvent(_ db: OpaquePointer?, atomeId: String, atomeType: String?, parentId: String?, ownerId: String?, creatorId: String?, deleted: Bool, now: String) throws {
        let existing = try findAnyAtomeMeta(db, atomeId: atomeId)
        if existing == nil {
            try execute(db, """
                INSERT INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, deleted_at, created_source, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ais', 'local')
                """, [
                .text(atomeId),
                .text(atomeType ?? "generic"),
                parentId.map(SQLiteBinding.text) ?? .null,
                ownerId.map(SQLiteBinding.text) ?? .null,
                (creatorId ?? ownerId).map(SQLiteBinding.text) ?? .null,
                .text(now),
                .text(now),
                deleted ? .text(now) : .null
            ])
            return
        }

        var updates: [String] = ["updated_at = ?", "deleted_at = ?", "sync_status = 'local'"]
        var bindings: [SQLiteBinding] = [.text(now), deleted ? .text(now) : .null]
        if let atomeType, !atomeType.isEmpty {
            updates.append("atome_type = ?")
            bindings.append(.text(atomeType))
        }
        if let parentId, !parentId.isEmpty {
            updates.append("parent_id = ?")
            bindings.append(.text(parentId))
        }
        if let ownerId, !ownerId.isEmpty {
            updates.append("owner_id = ?")
            bindings.append(.text(ownerId))
        }
        if let creatorId, !creatorId.isEmpty {
            updates.append("creator_id = COALESCE(creator_id, ?)")
            bindings.append(.text(creatorId))
        }
        bindings.append(.text(atomeId))
        try execute(db, "UPDATE atomes SET \(updates.joined(separator: ", ")) WHERE atome_id = ?", bindings)
    }

    private static func getStateCurrent(_ db: OpaquePointer?, atomeId: String) throws -> [String: Any]? {
        let rows = try query(db, """
            SELECT atome_id, owner_id, project_id, properties, updated_at, version
            FROM state_current
            WHERE atome_id = ?
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        return try serializeStateCurrentRow(db, row: row)
    }

    private static func listStateCurrent(_ db: OpaquePointer?, projectId: String?, ownerId: String?, limit: Int64, offset: Int64) throws -> [[String: Any]] {
        var sql = """
            SELECT sc.atome_id, sc.owner_id, sc.project_id, sc.properties, sc.updated_at, sc.version
            FROM state_current sc
            LEFT JOIN atomes a ON a.atome_id = sc.atome_id
            """
        var conditions: [String] = []
        var bindings: [SQLiteBinding] = []
        if let projectId, !projectId.isEmpty {
            conditions.append("sc.project_id = ?")
            bindings.append(.text(projectId))
        }
        if let ownerId, !ownerId.isEmpty {
            conditions.append("(COALESCE(sc.owner_id, a.owner_id) = ? OR COALESCE(sc.owner_id, a.owner_id) IS NULL)")
            bindings.append(.text(ownerId))
        }
        if !conditions.isEmpty {
            sql += " WHERE " + conditions.joined(separator: " AND ")
        }
        sql += " ORDER BY sc.updated_at DESC LIMIT ? OFFSET ?"
        bindings.append(.int(limit))
        bindings.append(.int(offset))
        let rows = try query(db, sql, bindings)
        return try rows.map { try serializeStateCurrentRow(db, row: $0) }
    }

    private static func loadStateCurrentEntry(_ db: OpaquePointer?, atomeId: String) throws -> StateCurrentEntry? {
        let rows = try query(db, """
            SELECT atome_id, owner_id, project_id, properties, updated_at, version
            FROM state_current
            WHERE atome_id = ?
            LIMIT 1
            """, [.text(atomeId)])
        guard let row = rows.first else { return nil }
        let properties = (row["properties"] as? String).flatMap { parseJSONValue($0) as? [String: Any] } ?? [:]
        return StateCurrentEntry(
            atomeId: stringValue(row["atome_id"]),
            ownerId: normalizedOptionalString(row["owner_id"]),
            projectId: normalizedOptionalString(row["project_id"]),
            properties: properties,
            updatedAt: stringValue(row["updated_at"]),
            version: intValue(row["version"], defaultValue: 0)
        )
    }

    private static func serializeStateCurrentRow(_ db: OpaquePointer?, row: [String: Any]) throws -> [String: Any] {
        let atomeId = stringValue(row["atome_id"])
        let meta = try findAnyAtomeMeta(db, atomeId: atomeId)
        var properties = (row["properties"] as? String).flatMap { parseJSONValue($0) as? [String: Any] } ?? [:]
        if properties["type"] == nil, let metaType = meta?.atomeType, !metaType.isEmpty {
            properties["type"] = metaType
        }
        if let parentId = meta?.parentId, !parentId.isEmpty {
            if properties["parent_id"] == nil { properties["parent_id"] = parentId }
            if properties["parentId"] == nil { properties["parentId"] = parentId }
        }
        let projectId = normalizedOptionalString(row["project_id"]) ?? normalizedOptionalString(properties["project_id"] ?? properties["projectId"])
        if let projectId {
            if properties["project_id"] == nil { properties["project_id"] = projectId }
            if properties["projectId"] == nil { properties["projectId"] = projectId }
        }
        var state: [String: Any] = [
            "atome_id": atomeId,
            "id": atomeId,
            "properties": properties,
            "particles": properties,
            "data": properties,
            "updated_at": stringValue(row["updated_at"]),
            "version": intValue(row["version"], defaultValue: 0)
        ]
        if let ownerId = normalizedOptionalString(row["owner_id"]) ?? meta?.ownerId {
            state["owner_id"] = ownerId
        }
        if let projectId { state["project_id"] = projectId }
        if let meta {
            state["atome_type"] = meta.atomeType
            state["type"] = meta.atomeType
            if let parentId = meta.parentId { state["parent_id"] = parentId }
        }
        return state
    }

    private static func canReadState(state: [String: Any], userId: String) -> Bool {
        let ownerId = normalizedOptionalString(state["owner_id"] ?? state["ownerId"])
        return ownerId == nil || ownerId == userId
    }

    private static func listEvents(_ db: OpaquePointer?, projectId: String?, atomeId: String?, txId: String?, gestureId: String?, since: String?, until: String?, limit: Int64, offset: Int64, order: String) throws -> [[String: Any]] {
        var sql = "SELECT id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id FROM events"
        var conditions: [String] = []
        var bindings: [SQLiteBinding] = []
        if let projectId, !projectId.isEmpty {
            conditions.append("project_id = ?")
            bindings.append(.text(projectId))
        }
        if let atomeId, !atomeId.isEmpty {
            conditions.append("atome_id = ?")
            bindings.append(.text(atomeId))
        }
        if let txId, !txId.isEmpty {
            conditions.append("tx_id = ?")
            bindings.append(.text(txId))
        }
        if let gestureId, !gestureId.isEmpty {
            conditions.append("gesture_id = ?")
            bindings.append(.text(gestureId))
        }
        if let since, !since.isEmpty {
            conditions.append("ts >= ?")
            bindings.append(.text(since))
        }
        if let until, !until.isEmpty {
            conditions.append("ts <= ?")
            bindings.append(.text(until))
        }
        if !conditions.isEmpty {
            sql += " WHERE " + conditions.joined(separator: " AND ")
        }
        sql += " ORDER BY ts " + (order.lowercased() == "desc" ? "DESC" : "ASC") + " LIMIT ? OFFSET ?"
        bindings.append(.int(limit))
        bindings.append(.int(offset))
        let rows = try query(db, sql, bindings)
        return rows.map { row in
            var event: [String: Any] = [
                "id": stringValue(row["id"]),
                "ts": stringValue(row["ts"]),
                "kind": stringValue(row["kind"])
            ]
            if let atomeId = normalizedOptionalString(row["atome_id"]) { event["atome_id"] = atomeId }
            if let projectId = normalizedOptionalString(row["project_id"]) { event["project_id"] = projectId }
            if let txId = normalizedOptionalString(row["tx_id"]) { event["tx_id"] = txId }
            if let gestureId = normalizedOptionalString(row["gesture_id"]) { event["gesture_id"] = gestureId }
            if let payload = row["payload"] as? String {
                event["payload"] = parseJSONValue(payload)
            }
            if let actor = row["actor"] as? String {
                event["actor"] = parseJSONValue(actor)
            }
            return event
        }
    }

    private static func createStateSnapshot(_ db: OpaquePointer?, projectId: String?, atomeId: String?, label: String?, actor: [String: Any], state: Any?, snapshotType: String, createdBy: String) throws -> Int64 {
        let snapshotAtomeId = firstNonEmptyString([atomeId, projectId]) ?? ""
        let now = isoNow()
        let actorString = try jsonString(actor)
        let statePayload: Any
        if let state {
            statePayload = state
        } else if let projectId, !projectId.isEmpty {
            statePayload = try listStateCurrent(db, projectId: projectId, ownerId: createdBy, limit: 5000, offset: 0)
        } else if let atomeId, !atomeId.isEmpty {
            statePayload = try getStateCurrent(db, atomeId: atomeId) ?? [:]
        } else {
            statePayload = [:]
        }
        let blob = try jsonString(statePayload)
        try execute(db, """
            INSERT INTO snapshots (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
            .text(snapshotAtomeId),
            projectId.map(SQLiteBinding.text) ?? .null,
            .text(blob),
            .text(blob),
            label.map(SQLiteBinding.text) ?? .null,
            .text(snapshotType),
            .text(actorString),
            .text(createdBy),
            .text(now)
        ])
        let rows = try query(db, "SELECT snapshot_id FROM snapshots WHERE atome_id = ? ORDER BY created_at DESC LIMIT 1", [.text(snapshotAtomeId)])
        return rows.first?["snapshot_id"] as? Int64 ?? 0
    }

    private static func execute(_ db: OpaquePointer?, _ sql: String, _ bindings: [SQLiteBinding] = []) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
            throw AiSError(lastError(db))
        }
        defer { sqlite3_finalize(statement) }
        try bind(bindings, to: statement)
        let rc = sqlite3_step(statement)
        guard rc == SQLITE_DONE else {
            throw AiSError(lastError(db))
        }
    }

    private static func query(_ db: OpaquePointer?, _ sql: String, _ bindings: [SQLiteBinding] = []) throws -> [[String: Any]] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
            throw AiSError(lastError(db))
        }
        defer { sqlite3_finalize(statement) }
        try bind(bindings, to: statement)
        var rows: [[String: Any]] = []
        while true {
            let rc = sqlite3_step(statement)
            if rc == SQLITE_DONE { break }
            if rc != SQLITE_ROW {
                throw AiSError(lastError(db))
            }
            var row: [String: Any] = [:]
            let count = sqlite3_column_count(statement)
            for index in 0..<count {
                let name = String(cString: sqlite3_column_name(statement, index))
                switch sqlite3_column_type(statement, index) {
                case SQLITE_INTEGER:
                    row[name] = sqlite3_column_int64(statement, index)
                case SQLITE_FLOAT:
                    row[name] = sqlite3_column_double(statement, index)
                case SQLITE_TEXT:
                    row[name] = String(cString: sqlite3_column_text(statement, index))
                case SQLITE_NULL:
                    row[name] = NSNull()
                default:
                    row[name] = NSNull()
                }
            }
            rows.append(row)
        }
        return rows
    }

    private static func bind(_ bindings: [SQLiteBinding], to statement: OpaquePointer?) throws {
        for (index, binding) in bindings.enumerated() {
            let position = Int32(index + 1)
            let rc: Int32
            switch binding {
            case .text(let value):
                rc = sqlite3_bind_text(statement, position, value, -1, sqliteTransient)
            case .int(let value):
                rc = sqlite3_bind_int64(statement, position, value)
            case .null:
                rc = sqlite3_bind_null(statement, position)
            }
            if rc != SQLITE_OK {
                throw AiSError("SQLite bind failed")
            }
        }
    }

    private static func authResponse(requestId: String?, success: Bool, error: String? = nil, user: [String: Any]? = nil, token: String? = nil, alreadyExists: Bool? = nil) -> [String: Any] {
        var response: [String: Any] = [
            "type": "auth-response",
            "success": success
        ]
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        if let user { response["user"] = user }
        if let token { response["token"] = token }
        if let alreadyExists { response["already_exists"] = alreadyExists }
        return response
    }

    private static func atomeResponse(requestId: String?, success: Bool, error: String? = nil, data: [String: Any]? = nil, atomes: [[String: Any]]? = nil, count: Int64? = nil) -> [String: Any] {
        var response: [String: Any] = [
            "type": "atome-response",
            "success": success
        ]
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        if let data { response["data"] = data }
        if let atomes { response["atomes"] = atomes }
        if let count { response["count"] = count }
        return response
    }

    private static func eventsResponse(requestId: String?, success: Bool, error: String? = nil, event: [String: Any]? = nil, events: [[String: Any]]? = nil) -> [String: Any] {
        var response: [String: Any] = [
            "type": "events-response",
            "success": success
        ]
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        if let event { response["event"] = event }
        if let events { response["events"] = events }
        return response
    }

    private static func stateCurrentResponse(requestId: String?, success: Bool, error: String? = nil, state: [String: Any]? = nil, states: [[String: Any]]? = nil) -> [String: Any] {
        var response: [String: Any] = [
            "type": "state-current-response",
            "success": success
        ]
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        if let state { response["state"] = state }
        if let states { response["states"] = states }
        return response
    }

    private static func snapshotResponse(requestId: String?, success: Bool, error: String? = nil, snapshotId: Int64? = nil) -> [String: Any] {
        var response: [String: Any] = [
            "type": "snapshot-response",
            "success": success
        ]
        if let requestId { response["request_id"] = requestId }
        if let error { response["error"] = error }
        if let snapshotId { response["snapshot_id"] = snapshotId }
        return response
    }

    private static func normalizePhone(_ phone: String) -> String {
        let trimmed = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        let cleaned = trimmed.filter { $0.isNumber || $0 == "+" }
        if cleaned.isEmpty { return "" }
        if cleaned.hasPrefix("+") {
            return "+" + cleaned.dropFirst().replacingOccurrences(of: "+", with: "")
        }
        return cleaned.replacingOccurrences(of: "+", with: "")
    }

    private static func normalizeVisibility(_ value: String) -> String {
        value.lowercased() == "public" ? "public" : "private"
    }

    private static func normalizeUserOptional(_ values: [String: Any]) -> [String: Any] {
        var cleaned: [String: Any] = [:]
        for (key, value) in values {
            let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty || trimmed.hasPrefix("_") || reservedUserParticleKeys.contains(trimmed) { continue }
            cleaned[trimmed] = value
        }
        return cleaned
    }

    private static func hashPassword(_ password: String) -> String {
        let salt = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let digest = SHA256.hash(data: Data("\(salt):\(password)".utf8))
        return "sha256$\(salt)$\(hex(digest))"
    }

    private static func verifyPassword(_ password: String, storedHash: String) -> Bool {
        let parts = storedHash.split(separator: "$")
        guard parts.count == 3, parts[0] == "sha256" else { return false }
        let salt = String(parts[1])
        let expected = String(parts[2])
        let digest = SHA256.hash(data: Data("\(salt):\(password)".utf8))
        return hex(digest) == expected
    }

    private static func createToken(userId: String, username: String, phone: String) throws -> String {
        let header = try base64urlEncoded(["alg": "HS256", "typ": "JWT"])
        let now = Int(Date().timeIntervalSince1970)
        let payload = try base64urlEncoded([
            "sub": userId,
            "username": username,
            "phone": phone,
            "iat": now,
            "exp": now + (7 * 24 * 60 * 60)
        ])
        let message = "\(header).\(payload)"
        let signature = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: SymmetricKey(data: Data(tokenSecret.utf8)))
        return "\(message).\(base64url(Data(signature)))"
    }

    private static func verifyToken(_ token: String) throws -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        let signed = "\(parts[0]).\(parts[1])"
        let expected = HMAC<SHA256>.authenticationCode(for: Data(signed.utf8), using: SymmetricKey(data: Data(tokenSecret.utf8)))
        guard base64url(Data(expected)) == String(parts[2]) else { return nil }
        guard let payloadData = base64urlDecode(String(parts[1])),
              let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
            return nil
        }
        let exp = intValue(payload["exp"], defaultValue: 0)
        if exp > 0 && exp < Int64(Date().timeIntervalSince1970) {
            return nil
        }
        return payload
    }

    private static func generateDeterministicUserId(_ phone: String) -> String {
        let normalized = normalizePhone(phone).lowercased()
        let digest = Insecure.SHA1.hash(data: Data(userNamespace + Array(normalized.utf8)))
        var bytes = Array(digest.prefix(16))
        bytes[6] = (bytes[6] & 0x0f) | 0x50
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        return [
            String(hex.prefix(8)),
            String(hex.dropFirst(8).prefix(4)),
            String(hex.dropFirst(12).prefix(4)),
            String(hex.dropFirst(16).prefix(4)),
            String(hex.dropFirst(20).prefix(12))
        ].joined(separator: "-")
    }

    private static func base64urlEncoded(_ object: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [])
        return base64url(data)
    }

    private static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func base64urlDecode(_ value: String) -> Data? {
        var base = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let padding = 4 - (base.count % 4)
        if padding < 4 {
            base += String(repeating: "=", count: padding)
        }
        return Data(base64Encoded: base)
    }

    private static func parseJSONValue(_ raw: String) -> Any {
        guard let data = raw.data(using: .utf8) else { return raw }
        if let value = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) {
            return value
        }
        return raw
    }

    private static func rowValue(_ row: [String: Any]?, _ key: String) -> Any? {
        guard let raw = row?[key], !(raw is NSNull) else { return nil }
        return raw
    }

    private static func rowString(_ row: [String: Any]?, _ key: String) -> String? {
        guard let value = rowValue(row, key) else { return nil }
        return value as? String
    }

    private static func jsonString(_ value: Any) throws -> String {
        guard JSONSerialization.isValidJSONObject(["value": value]) else {
            if let string = value as? String {
                let data = try JSONSerialization.data(withJSONObject: string, options: [.fragmentsAllowed])
                return String(decoding: data, as: UTF8.self)
            }
            if let number = value as? NSNumber {
                let data = try JSONSerialization.data(withJSONObject: number, options: [.fragmentsAllowed])
                return String(decoding: data, as: UTF8.self)
            }
            if let bool = value as? Bool {
                let data = try JSONSerialization.data(withJSONObject: bool, options: [.fragmentsAllowed])
                return String(decoding: data, as: UTF8.self)
            }
            throw AiSError("Unsupported JSON value")
        }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        return String(decoding: data, as: UTF8.self)
    }

    private static func sqliteValueType(_ value: Any) -> String {
        switch value {
        case is NSNumber:
            if CFGetTypeID(value as CFTypeRef) == CFBooleanGetTypeID() { return "boolean" }
            return "number"
        case is Bool:
            return "boolean"
        case is [Any], is [String: Any]:
            return "json"
        default:
            return "string"
        }
    }

    private static func stringValue(_ value: Any?) -> String {
        if let value = value as? String { return value }
        if let value = value as? NSString { return value as String }
        if let value = value as? NSNumber { return value.stringValue }
        return ""
    }

    private static func normalizedOptionalString(_ value: Any?) -> String? {
        let resolved = stringValue(value).trimmingCharacters(in: .whitespacesAndNewlines)
        return resolved.isEmpty ? nil : resolved
    }

    private static func firstNonEmptyString(_ values: [String?]) -> String? {
        for value in values {
            if let value, !value.isEmpty { return value }
        }
        return nil
    }

    private static func intValue(_ value: Any?, defaultValue: Int64) -> Int64 {
        if let value = value as? Int64 { return value }
        if let value = value as? Int { return Int64(value) }
        if let value = value as? NSNumber { return value.int64Value }
        if let value = value as? String, let parsed = Int64(value) { return parsed }
        return defaultValue
    }

    private static func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private static func hex<D: Digest>(_ digest: D) -> String {
        digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func lastError(_ db: OpaquePointer?) -> String {
        guard let db else { return "SQLite error" }
        return String(cString: sqlite3_errmsg(db))
    }

    private static func boolValue(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        if let value = value as? String { return value == "true" || value == "1" }
        return false
    }

}

fileprivate struct UserRecord {
    let userId: String
    let atomeType: String
    let deletedAt: String?
}

fileprivate struct AtomeMeta {
    let atomeId: String
    let atomeType: String
    let parentId: String?
    let ownerId: String
    let creatorId: String
    let createdAt: String
    let updatedAt: String
    let createdSource: String
    let syncStatus: String
}

fileprivate struct StateCurrentEntry {
    let atomeId: String
    let ownerId: String?
    let projectId: String?
    let properties: [String: Any]
    let updatedAt: String
    let version: Int64
}

fileprivate enum SQLiteBinding {
    case text(String)
    case int(Int64)
    case null
}

fileprivate struct AiSError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
