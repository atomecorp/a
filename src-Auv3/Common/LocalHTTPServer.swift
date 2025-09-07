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
    private let allowedAudioExtensions: Set<String> = ["m4a"]

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
                self.receive(on: connection)
            case .failed(let error):
                print("❌ Conn failed: \(error)")
            case .cancelled:
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
                self.processRequest(data, on: connection)
            }
            if isComplete || error != nil { connection.cancel(); return }
            self.receive(on: connection) // keep reading pipelined data (simple)
        }
    }

    private func processRequest(_ data: Data, on connection: NWConnection) {
        guard let request = String(data: data, encoding: .utf8) else { connection.cancel(); return }
        // Very small parser
        let lines = request.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let requestLine = lines.first else { connection.cancel(); return }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else { connection.cancel(); return }
        let method = parts[0]
        let path = String(parts[1])
        print("📥 HTTP req: \(method) \(path)")
        var rawHeaders: [String] = []
        var rangeHeader: String? = nil
        for line in lines.dropFirst() {
            if line.lowercased().hasPrefix("range:") { rangeHeader = String(line); break }
            if line.contains(":") { rawHeaders.append(String(line)) }
        }
        if let rh = rangeHeader { print("   ↪︎ Range hdr: \(rh)") }
        if !rawHeaders.isEmpty { print("   ↪︎ Headers count=\(rawHeaders.count)") }
        if method != "GET" {
            sendSimple(status: 405, reason: "Method Not Allowed", body: "Method Not Allowed", on: connection)
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
        } else if path == "/health" {
            serveHealth(on: connection)
        } else if path == "/tree" {
            serveTree(on: connection)
        } else if path == "/sync_now" {
            serveSyncNow(on: connection)
        } else {
            sendSimple(status: 404, reason: "Not Found", body: "Not Found", on: connection)
        }
    }

    private func candidateFileURLs(for name: String) -> [URL] {
        var candidates: [URL] = []
        // 1. App Group canonical Documents (Option A) – ensures both processes see same files
        if let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?.appendingPathComponent("Documents", isDirectory: true) {
            candidates.append(group.appendingPathComponent(name))
        }
        // 2. Process-local Documents (mirror)
        if let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            candidates.append(docs.appendingPathComponent(name))
        }
        // 3. Main bundle audio (legacy m4a support)
        if let audioURL = Bundle.main.url(forResource: name.replacingOccurrences(of: ".m4a", with: ""), withExtension: "m4a") {
            candidates.append(audioURL)
        }
    // 4. Bundle text / generic resources (.txt, .json, .svg, .md) — add if request name has such extension (served via /text/*)
        let lower = name.lowercased()
    if lower.hasSuffix(".txt") || lower.hasSuffix(".json") || lower.hasSuffix(".svg") || lower.hasSuffix(".md") {
            let baseName = (name as NSString).deletingPathExtension
            let ext = (name as NSString).pathExtension
            if let txtURL = Bundle.main.url(forResource: baseName, withExtension: ext) {
                candidates.append(txtURL)
            }
            // Try common assets subpaths inside bundle (if structure preserved)
            if let assetsRoot = Bundle.main.url(forResource: "assets", withExtension: nil) {
                candidates.append(assetsRoot.appendingPathComponent(name))
                candidates.append(assetsRoot.appendingPathComponent("texts/").appendingPathComponent(name))
                // Additional generic & audio/text subfolders
                candidates.append(assetsRoot.appendingPathComponent("audios/").appendingPathComponent(name))
                candidates.append(assetsRoot.appendingPathComponent("audio/").appendingPathComponent(name))
                // If name includes a subfolder already (e.g. audios/testing.txt), also try just filename in texts/
                let fileOnly = (name as NSString).lastPathComponent
                candidates.append(assetsRoot.appendingPathComponent("texts/").appendingPathComponent(fileOnly))
                candidates.append(assetsRoot.appendingPathComponent("audios/").appendingPathComponent(fileOnly))
            }
            if let srcRoot = Bundle.main.url(forResource: "src", withExtension: nil) {
                candidates.append(srcRoot.appendingPathComponent("assets/texts/").appendingPathComponent(name))
                candidates.append(srcRoot.appendingPathComponent("assets/").appendingPathComponent(name))
                candidates.append(srcRoot.appendingPathComponent("assets/audios/").appendingPathComponent(name))
                let fileOnly = (name as NSString).lastPathComponent
                candidates.append(srcRoot.appendingPathComponent("assets/audios/").appendingPathComponent(fileOnly))
                candidates.append(srcRoot.appendingPathComponent("assets/texts/").appendingPathComponent(fileOnly))
        candidates.append(srcRoot.appendingPathComponent("assets/images/").appendingPathComponent(name))
        candidates.append(srcRoot.appendingPathComponent("assets/images/icons/").appendingPathComponent((name as NSString).lastPathComponent))
        candidates.append(srcRoot.appendingPathComponent("assets/images/logos/").appendingPathComponent((name as NSString).lastPathComponent))
            }
        }
        // 5. Inside src/ if packaged (e.g., src/audio)
        if let srcRoot = Bundle.main.url(forResource: "src", withExtension: nil) {
            candidates.append(srcRoot.appendingPathComponent(name))
            candidates.append(srcRoot.appendingPathComponent("audio/").appendingPathComponent(name))
            candidates.append(srcRoot.appendingPathComponent("audios/").appendingPathComponent(name))
        }
        return candidates
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
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
    }

    // Copy bundle resource to Documents for sandbox-friendly AVAsset usage (once)
    private func ensureLocalReadableCopy(for url: URL) -> URL {
        let path = url.path
        if !path.contains(".app/") { return url }
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return url }
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
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
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
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func sendSimple(status: Int, reason: String, body: String, on connection: NWConnection) {
        let payload = Data(body.utf8)
    let head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(payload.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        var data = Data(head.utf8)
        data.append(payload)
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
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
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
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
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
    }

    private struct FileNode: Codable {
        let name: String
        let isDirectory: Bool
        let size: UInt64?
        let children: [FileNode]?
    }

    private func serveTree(on connection: NWConnection) {
        // Root preference: App Group canonical Documents (Option A) else fallback to process-local Documents
        let fm = FileManager.default
        let groupRoot = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?.appendingPathComponent("Documents", isDirectory: true)
        let docsRoot = fm.urls(for: .documentDirectory, in: .userDomainMask).first
        guard let root = groupRoot ?? docsRoot else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "no root", on: connection); return
        }
        let rootNode = buildNode(url: root, depth: 0, maxDepth: 12)
        let obj: [String: Any] = [
            "root": root.lastPathComponent,
            "group": groupRoot != nil,
            "tree": encodeNodeDict(node: rootNode)
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []) else {
            sendSimple(status: 500, reason: "Internal Server Error", body: "json fail", on: connection); return
        }
        let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: \(data.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        var out = Data(head.utf8); out.append(data)
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
    }

    private func buildNode(url: URL, depth: Int, maxDepth: Int) -> FileNode {
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
        if !exists { return FileNode(name: url.lastPathComponent, isDirectory: false, size: nil, children: nil) }
        if isDir.boolValue {
            if depth >= maxDepth { return FileNode(name: url.lastPathComponent, isDirectory: true, size: nil, children: []) }
            let childrenURLs = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles])) ?? []
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
            connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
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

// (Helper async supprimé; utilisation d'attente sémaphore pour compat non-async)
