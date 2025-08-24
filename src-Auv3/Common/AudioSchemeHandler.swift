import Foundation
import WebKit

// WKURLSchemeHandler to serve local audio (Alive.m4a) and HTML via custom scheme
class AudioSchemeHandler: NSObject, WKURLSchemeHandler {
    // Root search paths: Documents + App Group (if any)
    private let fileManager = FileManager.default
    private lazy var documentsURL: URL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    private lazy var appGroupURL: URL? = {
        // Replace with actual App Group identifier if configured
        let possibleIds = ["group.atome.one", "group.com.atomecorp.atome"]
        for id in possibleIds {
            if let url = fileManager.containerURL(forSecurityApplicationGroupIdentifier: id) {
                return url
            }
        }
        return nil
    }()
    
    private let scheme = "atome" // <SCHEME>
    
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        let path = url.path
        print("[AudioSchemeHandler] start request url=\(url.absoluteString) path=\(path) range=\(urlSchemeTask.request.value(forHTTPHeaderField: "Range") ?? "<none>")")
        let host = url.host
        if host != nil { print("[AudioSchemeHandler] host=\(host!)") }
        
        if path == "/" || path == "/index.html" {
            print("[AudioSchemeHandler] Serving index.html")
            serveIndexHTML(task: urlSchemeTask)
            return
        }
        
        // Support two URL forms:
        // 1) atome:///audio/Alive.m4a   -> path starts with /audio/
        // 2) atome://audio/Alive.m4a    -> host == "audio", path == "/Alive.m4a"
        if path.hasPrefix("/audio/") {
            let fileName = String(path.dropFirst("/audio/".count))
            print("[AudioSchemeHandler] Audio request (triple-slash form) fileName=\(fileName)")
            serveAudio(fileName: fileName, task: urlSchemeTask)
            return
        }
        if host == "audio" && path.count > 1 { // path like /Alive.m4a
            let fileName = String(path.dropFirst())
            print("[AudioSchemeHandler] Audio request (host form) fileName=\(fileName)")
            serveAudio(fileName: fileName, task: urlSchemeTask)
            return
        }
        
        if path.hasPrefix("/audio/") {
            let fileName = String(path.dropFirst("/audio/".count))
            print("[AudioSchemeHandler] Audio request fileName=\(fileName)")
            serveAudio(fileName: fileName, task: urlSchemeTask)
            return
        }
        
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
    
    private func serveAudio(fileName: String, task: WKURLSchemeTask) {
        let candidates: [URL] = {
            var arr: [URL] = []
            arr.append(documentsURL.appendingPathComponent(fileName))
            if let appGroup = appGroupURL { arr.append(appGroup.appendingPathComponent(fileName)) }
            return arr
        }()
        print("[AudioSchemeHandler] Candidate paths: \(candidates.map{ $0.path })")
        guard let fileURL = candidates.first(where: { fileManager.fileExists(atPath: $0.path) }) else {
            print("[AudioSchemeHandler] File not found in any candidate path")
            respond404(task: task)
            return
        }
        print("[AudioSchemeHandler] Found file at path=\(fileURL.path)")
        
        do {
            let attr = try fileManager.attributesOfItem(atPath: fileURL.path)
            let fileSize = (attr[.size] as? NSNumber)?.int64Value ?? 0
            let mime = mimeType(for: fileURL.pathExtension.lowercased())
            print("[AudioSchemeHandler] fileSize=\(fileSize) mime=\(mime)")
            
            // Check for Range header
            if let rangeHeader = task.request.value(forHTTPHeaderField: "Range"),
               let range = parseRange(rangeHeader: rangeHeader, fileLength: fileSize) {
                print("[AudioSchemeHandler] Handling Range request header=\(rangeHeader) resolved=\(range.lowerBound)-\(range.upperBound - 1)")
                // Partial response
                let handle = try FileHandle(forReadingFrom: fileURL)
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
            let data = try Data(contentsOf: fileURL)
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
}
