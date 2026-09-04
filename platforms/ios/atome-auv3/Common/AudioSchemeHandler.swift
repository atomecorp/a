import Foundation
import WebKit
import OSLog
import QuartzCore

// WKURLSchemeHandler to serve local audio and static assets via custom scheme
class AudioSchemeHandler: NSObject, WKURLSchemeHandler {
    private let fileManager = FileManager.default
    private let scheme = "atome"
    private lazy var bundleRoot: URL? = Bundle.main.resourceURL
    private let ioQueue = DispatchQueue(label: "atome.scheme.io", qos: .userInitiated, attributes: .concurrent)
    private let log = Logger(subsystem: "atome", category: "URLScheme")
    private static let metricsQueue = DispatchQueue(label: "atome.scheme.metrics")
    private static var requestCount = 0
    private static var byteCount: Int64 = 0
    private static var missingCount = 0
    private static var recentPaths: [String] = []
    private static let recentPathLimit = 64
    private static var startedAt = CACurrentMediaTime()
    private static let streamThreshold = 512 * 1024
    private static let streamChunkSize = 256 * 1024
    private let taskLock = NSLock()
    private var closedTaskIds = Set<ObjectIdentifier>()

    static func resetBootMetrics() {
        metricsQueue.sync {
            requestCount = 0
            byteCount = 0
            missingCount = 0
            recentPaths.removeAll(keepingCapacity: true)
            startedAt = CACurrentMediaTime()
        }
    }

    static func bootMetrics() -> [String: Any] {
        metricsQueue.sync {
            [
                "request_count": requestCount,
                "byte_count": byteCount,
                "missing_count": missingCount,
                "elapsed_ms": Int((CACurrentMediaTime() - startedAt) * 1_000),
                "recent_paths": recentPaths
            ]
        }
    }

    private static func recordRequest(path: String) {
        metricsQueue.async {
            requestCount += 1
            recentPaths.append(path)
            if recentPaths.count > recentPathLimit {
                recentPaths.removeFirst(recentPaths.count - recentPathLimit)
            }
        }
    }

    private static func recordResponse(bytes: Int) {
        metricsQueue.async { byteCount += Int64(bytes) }
    }

    private static func recordMissing() {
        metricsQueue.async { missingCount += 1 }
    }

    private func taskId(_ task: WKURLSchemeTask) -> ObjectIdentifier {
        ObjectIdentifier(task as AnyObject)
    }

    private func register(_ task: WKURLSchemeTask) {
        taskLock.lock()
        closedTaskIds.remove(taskId(task))
        taskLock.unlock()
    }

    private func close(_ task: WKURLSchemeTask) {
        taskLock.lock()
        closedTaskIds.insert(taskId(task))
        taskLock.unlock()
    }

    private func deliver(_ task: WKURLSchemeTask, _ body: () -> Void) -> Bool {
        taskLock.lock()
        let isOpen = !closedTaskIds.contains(taskId(task))
        taskLock.unlock()
        guard isOpen else { return false }
        body()
        return true
    }

    private func complete(_ task: WKURLSchemeTask, response: URLResponse, data: Data) -> Bool {
        taskLock.lock()
        let id = taskId(task)
        let isOpen = !closedTaskIds.contains(id)
        if isOpen { closedTaskIds.insert(id) }
        taskLock.unlock()
        guard isOpen else { return false }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
        return true
    }

    private func finish(_ task: WKURLSchemeTask) -> Bool {
        taskLock.lock()
        let id = taskId(task)
        let isOpen = !closedTaskIds.contains(id)
        if isOpen { closedTaskIds.insert(id) }
        taskLock.unlock()
        guard isOpen else { return false }
        task.didFinish()
        return true
    }
    
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        register(urlSchemeTask)
        guard let url = urlSchemeTask.request.url else { return }
        let (requestedPath, host) = normalize(url: url)
        let path = (requestedPath == "/" || requestedPath == "/index.html")
            ? "/src/index.html"
            : requestedPath
        Self.recordRequest(path: path)

        if path == "/api/server-info" {
            serveServerInfo(task: urlSchemeTask)
            return
        }
        
        // Support two URL forms:
        // 1) atome:///audio/Alive.m4a   -> path starts with /audio/
        // 2) atome://audio/Alive.m4a    -> host == "audio", path == "/Alive.m4a"
        if path.hasPrefix("/audio/") {
            let relative = String(path.dropFirst("/audio/".count))
            serveSandboxFile(relativePath: relative, label: "audio", task: urlSchemeTask)
            return
        }
        if host == "audio" && path.count > 1 {
            let relative = String(path.dropFirst())
            serveSandboxFile(relativePath: relative, label: "audio", task: urlSchemeTask)
            return
        }
        if path.hasPrefix("/file/") {
            let relative = String(path.dropFirst("/file/".count))
            serveSandboxFile(relativePath: relative, label: "file", task: urlSchemeTask)
            return
        }
        if path.hasPrefix("/api/recordings/") {
            serveRecording(url: url, path: path, task: urlSchemeTask)
            return
        }
        
        ioQueue.async { [weak self] in
            guard let self else { return }
            if self.serveStatic(path: path, task: urlSchemeTask) { return }
            self.log.error("Missing atome resource: \(path, privacy: .public)")
            self.respond404(task: urlSchemeTask)
        }
    }
    
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        close(urlSchemeTask)
    }
    
    private func serveSandboxFile(relativePath rawPath: String, label: String, task: WKURLSchemeTask) {
        let trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(trimmed) else {
            SandboxPathValidator.reportViolation(path: rawPath, context: "AudioSchemeHandler.\(label)")
            respond404(task: task)
            return
        }
        let candidates = SandboxPathValidator.allowedRoots().map { root -> URL in
            sanitized.isEmpty ? root : root.appendingPathComponent(sanitized)
        }
        let fileURL = candidates.first(where: { fileManager.fileExists(atPath: $0.path) })
            ?? SandboxAssetManager.shared.materializeAssetIfNeeded(relativePath: sanitized)

        guard let locatedURL = fileURL else {
            print("[AudioSchemeHandler] \(label) missing for \(sanitized)")
            respond404(task: task)
            return
        }
        do {
            let attr = try fileManager.attributesOfItem(atPath: locatedURL.path)
            let fileSize = (attr[.size] as? NSNumber)?.int64Value ?? 0
            let mime = mimeType(for: locatedURL.pathExtension.lowercased())
            // Check for Range header
            if let rangeHeader = task.request.value(forHTTPHeaderField: "Range"),
               let range = parseRange(rangeHeader: rangeHeader, fileLength: fileSize) {
                // Partial response
                let handle = try FileHandle(forReadingFrom: locatedURL)
                try handle.seek(toOffset: UInt64(range.lowerBound))
                let length = range.count
                let data = handle.readData(ofLength: length)
                handle.closeFile()
                
                let response = HTTPURLResponse(url: task.request.url!, statusCode: 206, httpVersion: "HTTP/1.1", headerFields: [
                    "Content-Type": mime,
                    "Content-Length": String(data.count),
                    "Content-Range": "bytes \(range.lowerBound)-\(range.upperBound - 1)/\(fileSize)",
                    "Accept-Ranges": "bytes"
                ])!
                if complete(task, response: response, data: data) {
                    Self.recordResponse(bytes: data.count)
                }
                return
            }
            try respondFile(locatedURL, fileSize: fileSize, mime: mime, immutable: false, task: task)
        } catch {
            log.error("File response failed for \(label, privacy: .public): \(error.localizedDescription, privacy: .public)")
            respond404(task: task)
        }
    }

    private func serveRecording(url: URL, path: String, task: WKURLSchemeTask) {
        let fileName = String(path.dropFirst("/api/recordings/".count))
        let userId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "media_user_id" })?
            .value ?? ""
        guard let safeFileName = SandboxPathValidator.sanitizedRelativePath(fileName),
              !safeFileName.contains("/"),
              let safeUserId = SandboxPathValidator.sanitizedRelativePath(userId),
              !safeUserId.isEmpty,
              !safeUserId.contains("/") else {
            SandboxPathValidator.reportViolation(path: path, context: "AudioSchemeHandler.recording")
            respond404(task: task)
            return
        }
        serveSandboxFile(
            relativePath: "data/users/\(safeUserId)/recordings/\(safeFileName)",
            label: "recording",
            task: task
        )
    }
    
    private func parseRange(rangeHeader: String, fileLength: Int64) -> Range<Int>? {
        // Example: bytes=0-1023
        let cleaned = rangeHeader.replacingOccurrences(of: "bytes=", with: "")
        let parts = cleaned.split(separator: "-")
        guard parts.count == 2 else { return nil }
        let start = Int(parts[0]) ?? 0
        let endPart = String(parts[1])
        let end = Int(endPart.isEmpty ? String(fileLength - 1) : endPart) ?? (Int(fileLength) - 1)
        if start >= end || start < 0 { return nil }
        return start..<min(end + 1, Int(fileLength))
    }
    
    private func mimeType(for ext: String) -> String {
        switch ext {
        case "m4a": return "audio/mp4"
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
    case "js": return "application/javascript"
    case "mjs": return "application/javascript"
    case "json": return "application/json"
    case "css": return "text/css"
    case "html", "htm": return "text/html"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "wasm": return "application/wasm"
        default: return "application/octet-stream"
        }
    }
    
    private func respond404(task: WKURLSchemeTask) {
        let data = Data("Not Found".utf8)
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "text/plain",
            "Content-Length": String(data.count)
        ])!
        if complete(task, response: response, data: data) {
            Self.recordMissing()
        }
    }

    // MARK: - Static asset serving from bundled source roots
    private func serveStatic(path: String, task: WKURLSchemeTask) -> Bool {
        var rel = path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "src/index.html" }
        if rel.hasPrefix("atome/") {
            rel = String(rel.dropFirst("atome/".count))
        } else if rel.hasPrefix("chunks/") || rel.hasPrefix("vendor/") {
            // Bundled ESM chunks and third-party runtime packages live at the
            // deterministic runtime root.
        } else if rel == "server_config.json" || rel == "version.txt" {
            // Keep bundle-root files unprefixed.
        } else if !rel.hasPrefix("src/") && !rel.hasPrefix("eVe/") && !rel.hasPrefix("atome/") {
            rel = "src/" + rel
        }
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(rel) else {
            SandboxPathValidator.reportViolation(path: rel, context: "AudioSchemeHandler.static")
            return false
        }

        guard let root = bundleRoot else { return false }
        // New packages have one deterministic runtime root. The second candidate
        // keeps development builds made before the packaging migration readable.
        let candidates = [
            root.appendingPathComponent("atome_runtime", isDirectory: true).appendingPathComponent(sanitized),
            root.appendingPathComponent(sanitized)
        ]
        guard let resolvedURL = candidates.first(where: { fileManager.fileExists(atPath: $0.path) }) else {
            return false
        }
        do {
            let attrs = try fileManager.attributesOfItem(atPath: resolvedURL.path)
            let fileSize = (attrs[.size] as? NSNumber)?.int64Value ?? 0
            let ext = resolvedURL.pathExtension.lowercased()
            let mime = mimeType(for: ext)
            try respondFile(resolvedURL, fileSize: fileSize, mime: mime, immutable: true, task: task)
            return true
        } catch {
            log.error("Static response failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func respondFile(_ fileURL: URL,
                             fileSize: Int64,
                             mime: String,
                             immutable: Bool,
                             task: WKURLSchemeTask) throws {
        var headers = [
            "Content-Type": mime,
            "Content-Length": String(fileSize),
            "Accept-Ranges": "bytes"
        ]
        if immutable { headers["Cache-Control"] = "public, max-age=31536000, immutable" }
        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )!
        // WebAssembly.instantiateStreaming expects one coherent module body.
        // Feeding WKWebView dozens of didReceive fragments for the 13 MiB Bevy
        // module reproducibly terminated WebContent on physical iOS. Mapping it
        // keeps native copying bounded while media files still use true chunks.
        if fileSize <= Int64(Self.streamThreshold) || mime == "application/wasm" {
            let data = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
            if complete(task, response: response, data: data) {
                Self.recordResponse(bytes: data.count)
            }
            return
        }

        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        guard deliver(task, { task.didReceive(response) }) else { return }
        var sent = 0
        while true {
            let data = try handle.read(upToCount: Self.streamChunkSize) ?? Data()
            if data.isEmpty { break }
            guard deliver(task, { task.didReceive(data) }) else { return }
            sent += data.count
        }
        if finish(task) { Self.recordResponse(bytes: sent) }
    }

    private func serveServerInfo(task: WKURLSchemeTask) {
        guard let data = ServerInfoProvider.jsonData(source: "scheme") else {
            respond404(task: task)
            return
        }
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "application/json",
            "Content-Length": String(data.count),
            "Cache-Control": "no-store"
        ])!
        if complete(task, response: response, data: data) {
            Self.recordResponse(bytes: data.count)
        }
    }

    private func normalize(url: URL) -> (path: String, host: String?) {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.query = nil
        components?.percentEncodedQuery = nil
        var path = components?.percentEncodedPath ?? url.path
        if path.isEmpty { path = "/" }
        let decodedPath = path.removingPercentEncoding ?? path
        var adjusted = decodedPath
        if let host = components?.host, !host.isEmpty {
            if adjusted == "/" { adjusted = "/" + host }
            else if !host.contains(".") && !adjusted.hasPrefix("/audio/") { adjusted = "/" + host + adjusted }
        }
        return (adjusted, components?.host ?? url.host)
    }
}
