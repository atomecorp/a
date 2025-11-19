import Foundation
import WebKit

// WKURLSchemeHandler to serve local audio and static assets via custom scheme
class AudioSchemeHandler: NSObject, WKURLSchemeHandler {
    private let fileManager = FileManager.default
    private let scheme = "atome"
    private lazy var bundleRoot: URL? = Bundle.main.resourceURL
    
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        let (path, host, hadQuery) = normalize(url: url)
        print("[AudioSchemeHandler] start request url=\(url.absoluteString) sanitizedPath=\(path) range=\(urlSchemeTask.request.value(forHTTPHeaderField: "Range") ?? "<none>")")

        if hadQuery {
            let redirect = buildCleanURLString(path: path, host: host)
            respondRedirect(location: redirect, task: urlSchemeTask)
            return
        }

        if path == "/" || path == "/index.html" {
            print("[AudioSchemeHandler] Serving index.html")
            serveIndexHTML(task: urlSchemeTask)
            return
        }

        if path == "/api/server-info" {
            serveServerInfo(task: urlSchemeTask)
            return
        }
        
        // Support two URL forms:
        // 1) atome:///audio/Alive.m4a   -> path starts with /audio/
        // 2) atome://audio/Alive.m4a    -> host == "audio", path == "/Alive.m4a"
        if path.hasPrefix("/audio/") {
            let relative = String(path.dropFirst("/audio/".count))
            serveAudio(relativePath: relative, task: urlSchemeTask)
            return
        }
        if host == "audio" && path.count > 1 {
            let relative = String(path.dropFirst())
            serveAudio(relativePath: relative, task: urlSchemeTask)
            return
        }
        
        if serveStatic(path: path, task: urlSchemeTask) { return }
        print("[AudioSchemeHandler] 404 for path=\(path)")
        respond404(task: urlSchemeTask)
    }
    
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No-op
    }
    
    private func serveIndexHTML(task: WKURLSchemeTask) {
        // Minimal HTML referencing audio via custom scheme
                let html = """
<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>AUv3 Audio Test</title></head><body>
<h3>Custom Scheme Audio Test</h3>
<!-- Using triple slash so path is /audio/Alive.m4a (empty host) -->
<audio id='player' controls playsinline src='\(scheme):///audio/Alive.m4a'></audio>
<script>
document.getElementById('player').addEventListener('error', e => {
    console.log('AUDIO ERROR', e, document.getElementById('player').error?.code);
});
</script>
</body></html>
"""
        respondData(html.data(using: .utf8)!, mime: "text/html", task: task)
    }
    
    private func serveAudio(relativePath rawPath: String, task: WKURLSchemeTask) {
        let trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(trimmed) else {
            SandboxPathValidator.reportViolation(path: rawPath, context: "AudioSchemeHandler.audio")
            respond404(task: task)
            return
        }
        let candidates = SandboxPathValidator.allowedRoots().map { root -> URL in
            sanitized.isEmpty ? root : root.appendingPathComponent(sanitized)
        }
        let fileURL = candidates.first(where: { fileManager.fileExists(atPath: $0.path) })
            ?? SandboxAssetManager.shared.materializeAssetIfNeeded(relativePath: sanitized)

        guard let locatedURL = fileURL else {
            print("[AudioSchemeHandler] Audio missing for \(sanitized)")
            respond404(task: task)
            return
        }
        print("[AudioSchemeHandler] Found audio at path=\(locatedURL.path)")
        
        do {
            let attr = try fileManager.attributesOfItem(atPath: locatedURL.path)
            let fileSize = (attr[.size] as? NSNumber)?.int64Value ?? 0
            let mime = mimeType(for: locatedURL.pathExtension.lowercased())
            print("[AudioSchemeHandler] fileSize=\(fileSize) mime=\(mime)")
            
            // Check for Range header
            if let rangeHeader = task.request.value(forHTTPHeaderField: "Range"),
               let range = parseRange(rangeHeader: rangeHeader, fileLength: fileSize) {
                print("[AudioSchemeHandler] Handling Range request header=\(rangeHeader) resolved=\(range.lowerBound)-\(range.upperBound - 1)")
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
                task.didReceive(response)
                task.didReceive(data)
                task.didFinish()
                return
            }
            
            // Full file
            print("[AudioSchemeHandler] Serving full file (no Range)")
            let data = try Data(contentsOf: locatedURL)
            let response = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                "Accept-Ranges": "bytes"
            ])!
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            print("[AudioSchemeHandler] Error serving file: \(error)")
            respond404(task: task)
        }
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
        case "m4a", "mp4": return "audio/mp4"
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
        default: return "application/octet-stream"
        }
    }
    
    private func respondData(_ data: Data, mime: String, task: WKURLSchemeTask) {
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            "Accept-Ranges": "bytes"
        ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
    
    private func respond404(task: WKURLSchemeTask) {
    print("[AudioSchemeHandler] Responding 404 for url=\(task.request.url?.absoluteString ?? "<nil>")")
        let data = Data("Not Found".utf8)
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "text/plain",
            "Content-Length": String(data.count)
        ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    // MARK: - Static asset serving from bundle 'src'
    private func serveStatic(path: String, task: WKURLSchemeTask) -> Bool {
        var rel = path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "src/index.html" }
        if !rel.hasPrefix("src/") {
            rel = "src/" + rel
        }
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(rel) else {
            SandboxPathValidator.reportViolation(path: rel, context: "AudioSchemeHandler.static")
            return false
        }

        // Prefer sandboxed copy
        let sandboxURL = SandboxAssetManager.shared.materializeAssetIfNeeded(relativePath: sanitized)

        // Fallback to bundled asset only if copy unavailable
        let finalURL: URL?
        if let sandboxURL {
            finalURL = sandboxURL
        } else if let bundleRoot = bundleRoot {
            finalURL = bundleRoot.appendingPathComponent(sanitized)
        } else {
            finalURL = nil
        }

        guard let resolvedURL = finalURL, fileManager.fileExists(atPath: resolvedURL.path) else {
            return false
        }
        do {
            let data = try Data(contentsOf: resolvedURL)
            let ext = resolvedURL.pathExtension.lowercased()
            let mime = mimeType(for: ext)
            respondData(data, mime: mime, task: task)
            return true
        } catch {
            print("[AudioSchemeHandler] Static serve error for \(resolvedURL.path): \(error)")
            return false
        }
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
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func normalize(url: URL) -> (path: String, host: String?, hasQuery: Bool) {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let hadQuery = (components?.query != nil)
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
        return (adjusted, components?.host ?? url.host, hadQuery)
    }

    private func buildCleanURLString(path: String, host: String?) -> String {
        let targetHost = host ?? ""
        if targetHost.isEmpty {
            return "\(scheme)://\(path)"
        }
        return "\(scheme)://\(targetHost)\(path)"
    }

    private func respondRedirect(location: String, task: WKURLSchemeTask) {
        let headers = [
            "Location": location,
            "Cache-Control": "no-store"
        ]
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 308, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didFinish()
    }
}
