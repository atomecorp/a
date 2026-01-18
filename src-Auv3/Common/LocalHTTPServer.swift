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

    private struct WebSocketState {
        var buffer = Data()
        var clientId: String
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
                print("❌ Conn failed: \(error)")
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
            if let data = data, !data.isEmpty {
                if self.isWebSocketConnection(connection) {
                    self.processWebSocketData(data, on: connection)
                } else {
                    self.processRequest(data, on: connection)
                }
            }
            if isComplete || error != nil { self.requestCancel(connection); return }
            self.receive(on: connection) // keep reading pipelined data (simple)
        }
    }

    private func processRequest(_ data: Data, on connection: NWConnection) {
        guard let request = String(data: data, encoding: .utf8) else { requestCancel(connection); return }
        // Very small parser
        let lines = request.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let requestLine = lines.first else { requestCancel(connection); return }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else { requestCancel(connection); return }
        let method = parts[0]
        let path = String(parts[1])
        print("📥 HTTP req: \(method) \(path)")
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
        if method != "GET" {
            sendSimple(status: 405, reason: "Method Not Allowed", body: "Method Not Allowed", on: connection)
            return
        }
        if path == "/ws/sync" && isWebSocketUpgrade(headers: headers) {
            handleWebSocketUpgrade(connection, headers: headers)
            return
        }
    // Opportunistic sync trigger (throttled inside coordinator)
    FileSyncCoordinator.shared.syncAll()

    if path.hasPrefix("/text/") {
            let name = String(path.dropFirst("/text/".count))
            serveText(named: name, on: connection)
        } else if path.hasPrefix("/audio_meta/") {
            let name = String(path.dropFirst("/audio_meta/".count))
            serveMetadata(named: name, on: connection)
        } else if path.hasPrefix("/audio_head/") {
            let name = String(path.dropFirst("/audio_head/".count))
            serveAudioHead(named: name, on: connection)
        } else if path.hasPrefix("/audio/") {
            let rawName = String(path.dropFirst("/audio/".count))
            // Decode any percent-encoded characters (spaces etc.) so underlying file with plain spaces is found
            let decodedName = rawName.removingPercentEncoding ?? rawName
            if rawName != decodedName { print("🧪 Decoded audio name raw=\(rawName) decoded=\(decodedName)") }
            serveAudio(named: decodedName, rangeHeader: rangeHeader, on: connection)
        } else if path.hasPrefix("/file/") {
            let raw = String(path.dropFirst("/file/".count))
            let decoded = raw.removingPercentEncoding ?? raw
            serveUnified(named: decoded, rangeHeader: rangeHeader, on: connection)
        } else if path == "/health" {
            serveHealth(on: connection)
        } else if path == "/tree" {
            serveTree(on: connection)
        } else if path == "/sync_now" {
            serveSyncNow(on: connection)
        } else if path == "/api/server-info" {
            serveServerInfo(on: connection)
        } else {
            sendSimple(status: 404, reason: "Not Found", body: "Not Found", on: connection)
        }
    }

    // MARK: - WebSocket (/ws/sync)

    private func isWebSocketUpgrade(headers: [String: String]) -> Bool {
        let upgrade = headers["upgrade"]?.lowercased() ?? ""
        let connection = headers["connection"]?.lowercased() ?? ""
        return upgrade == "websocket" && connection.contains("upgrade")
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
            sendSimple(status: 400, reason: "Bad Request", body: "missing websocket key", on: connection)
            return
        }

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

        let payload: [String: Any] = [
            "type": "welcome",
            "clientId": clientId,
            "server": "ais",
            "version": "1.0.0",
            "capabilities": ["events", "sync_request", "file-events", "atome-events", "account-events"],
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]

        connection.send(content: Data(response.utf8), completion: .contentProcessed { [weak self] _ in
            guard let self = self else { return }
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
        guard let data = text.data(using: .utf8) else { return }
        guard let obj = try? JSONSerialization.jsonObject(with: data, options: []),
              let payload = obj as? [String: Any] else {
            return
        }

        let type = (payload["type"] as? String) ?? ""
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
        for (k,v) in headers { headerLines.append("\(k): \(v)"); if k.lowercased()=="content-type" { hasCT=true }; if k.lowercased()=="content-length" { hasCL=true } }
        if !hasCT { headerLines.append("Content-Type: application/octet-stream") }
        if !hasCL { headerLines.append("Content-Length: \(body.count)") }
        headerLines.append("Access-Control-Allow-Origin: *")
        headerLines.append("Access-Control-Allow-Headers: *")
        headerLines.append("Connection: close")
        let head = "HTTP/1.1 \(status) \(reason)\r\n" + headerLines.joined(separator: "\r\n") + "\r\n\r\n"
        var out = Data(head.utf8); out.append(body)
        connection.send(content: out, completion: .contentProcessed { [weak self] _ in self?.requestCancel(connection) })
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
        requestCancel(connection)
    }

    private func clearConnectionState(_ connection: NWConnection) {
        queue.async { self.clearConnectionStateLocked(connection) }
    }

    private func clearConnectionStateLocked(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        cancelledConnections.remove(id)
        wsConnections.removeValue(forKey: id)
        wsStates.removeValue(forKey: id)
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
