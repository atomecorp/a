import Foundation
import Darwin

// TEMPORARY DIAGNOSTIC (disk-write investigation, 2026-10-08) — remove once the
// writer behind the 30 MB/s diskwrites_resource report is identified.
// Measures the process logical writes (the counter iOS uses for its diskwrites
// report) around every SQLite statement, attributes them to the WebSocket
// request being served, and rewrites a small summary file every 30 s in the
// App Group Documents folder (atome_disk_write_probe.txt).
#if DEBUG
@_silgen_name("proc_pid_rusage")
private func atomeDiagProcPidRusage(_ pid: Int32, _ flavor: Int32, _ buffer: UnsafeMutableRawPointer) -> Int32

enum DiskWriteProbe {
    private struct Stat { var count = 0; var bytes: UInt64 = 0; var ms = 0.0; var maxBytes: UInt64 = 0; var detail = "" }
    private static let lock = NSLock()
    private static var stats: [String: Stat] = [:]
    private static var heavy: [String] = []
    private static var timer: DispatchSourceTimer?
    private static var startWrites: UInt64 = 0
    private static var startDate = Date()
    private static var measuredBytes: UInt64 = 0
    private static let activityKey = "atome.diag.activity"
    private static let detailKey = "atome.diag.detail"

    static func logicalWrites() -> UInt64 {
        var info = rusage_info_v4()
        let rc = withUnsafeMutablePointer(to: &info) {
            atomeDiagProcPidRusage(getpid(), Int32(RUSAGE_INFO_V4), UnsafeMutableRawPointer($0))
        }
        return rc == 0 ? info.ri_logical_writes : 0
    }

    /// Labels every statement run on this thread until `endActivity`.
    static func beginActivity(_ payload: [String: Any]) {
        let type = payload["type"] as? String ?? "?"
        let action = payload["action"] as? String ?? "-"
        let event = payload["event"] as? [String: Any]
        let events = payload["events"] as? [[String: Any]]
        var parts: [String] = []
        for key in ["atome_id", "project_id", "atome_type", "limit", "offset", "order", "since"] {
            if let value = payload[key], !(value is NSNull) { parts.append("\(key)=\(String(describing: value).prefix(40))") }
        }
        if let kind = event?["kind"] { parts.append("kind=\(kind)") }
        if let id = event?["atome_id"] { parts.append("event_atome=\(String(describing: id).prefix(40))") }
        if let events { parts.append("batch=\(events.count)") }
        Thread.current.threadDictionary[activityKey] = "ws:\(type)/\(action)"
        Thread.current.threadDictionary[detailKey] = parts.joined(separator: " ")
    }

    static func setActivity(_ label: String) {
        Thread.current.threadDictionary[activityKey] = label
        Thread.current.threadDictionary[detailKey] = ""
    }

    static func endActivity() {
        Thread.current.threadDictionary.removeObject(forKey: activityKey)
        Thread.current.threadDictionary.removeObject(forKey: detailKey)
    }

    static func measure<T>(_ sql: String, _ body: () throws -> T) rethrows -> T {
        startIfNeeded()
        let before = logicalWrites()
        let started = DispatchTime.now().uptimeNanoseconds
        defer {
            let bytes = logicalWrites() &- before
            let ms = Double(DispatchTime.now().uptimeNanoseconds - started) / 1_000_000
            let activity = Thread.current.threadDictionary[activityKey] as? String ?? "other"
            let detail = Thread.current.threadDictionary[detailKey] as? String ?? ""
            let statement = sql.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(120)
            record(key: "\(activity) | \(statement)", bytes: bytes, ms: ms, detail: detail)
        }
        return try body()
    }

    private static func record(key: String, bytes: UInt64, ms: Double, detail: String) {
        lock.lock(); defer { lock.unlock() }
        var stat = stats[key] ?? Stat()
        stat.count += 1; stat.bytes &+= bytes; stat.ms += ms
        if bytes >= stat.maxBytes { stat.maxBytes = bytes; stat.detail = detail }
        stats[key] = stat
        measuredBytes &+= bytes
        if bytes >= 5 * 1_048_576 && heavy.count < 500 {
            heavy.append("\(ISO8601DateFormatter().string(from: Date())) \(bytes / 1_048_576) MB \(Int(ms)) ms | \(key) | \(detail)")
        }
    }

    private static func startIfNeeded() {
        lock.lock(); defer { lock.unlock() }
        guard timer == nil else { return }
        startWrites = logicalWrites(); startDate = Date()
        let source = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "atome.diag.diskwrites", qos: .utility))
        source.schedule(deadline: .now() + 30, repeating: 30)
        source.setEventHandler { flush() }
        source.resume()
        timer = source
    }

    private static func flush() {
        guard let root = SandboxPathValidator.primaryRoot() else { return }
        lock.lock()
        let total = logicalWrites() &- startWrites
        let elapsed = max(1, Date().timeIntervalSince(startDate))
        var lines = [
            "updated \(ISO8601DateFormatter().string(from: Date())) uptime \(Int(elapsed)) s",
            "process logical writes: \(total / 1_048_576) MB (\(String(format: "%.2f", Double(total) / 1_048_576 / elapsed)) MB/s)",
            "measured inside SQLite statements: \(measuredBytes / 1_048_576) MB",
            "", "MB | count | ms total | max MB | key | detail of the largest call"
        ]
        for (key, stat) in stats.sorted(by: { $0.value.bytes > $1.value.bytes }).prefix(40) {
            lines.append("\(stat.bytes / 1_048_576) | \(stat.count) | \(Int(stat.ms)) | \(stat.maxBytes / 1_048_576) | \(key) | \(stat.detail)")
        }
        lines.append(""); lines.append("most frequent:")
        for (key, stat) in stats.sorted(by: { $0.value.count > $1.value.count }).prefix(15) {
            lines.append("\(stat.count) x | \(stat.bytes / 1_048_576) MB | \(key)")
        }
        lines.append(""); lines.append("statements writing >= 5 MB:")
        lines.append(contentsOf: heavy.suffix(200))
        lock.unlock()
        try? lines.joined(separator: "\n").write(to: root.appendingPathComponent("atome_disk_write_probe.txt"), atomically: true, encoding: .utf8)
    }
}
#endif
