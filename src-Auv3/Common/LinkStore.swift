// Minimal LinkStore: persist addresses in App Group so App and AUv3 share the same list.
import Foundation

final class LinkStore {
    private static let appGroupIds = ["group.atome.one", "group.com.atomecorp.atome"]
    private static let fileName = "links.json"

    private static func containerURL() -> URL? {
        let fm = FileManager.default
        for id in appGroupIds {
            if let url = fm.containerURL(forSecurityApplicationGroupIdentifier: id) {
                return url
            }
        }
        return nil
    }

    private static func fileURL() -> URL? {
        if let root = containerURL() {
            // Keep data under Documents to be visible and backed-up with the rest
            let docs = root.appendingPathComponent("Documents", isDirectory: true)
            try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
            return docs.appendingPathComponent(fileName, isDirectory: false)
        }
        // Fallback to process-local Documents (still works if App Group not available in simulator)
        if let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            return docs.appendingPathComponent(fileName, isDirectory: false)
        }
        return nil
    }

    private static func loadAll() -> [String] {
        guard let url = fileURL(), let data = try? Data(contentsOf: url) else { return [] }
        do {
            let arr = try JSONDecoder().decode([String].self, from: data)
            return arr
        } catch {
            return []
        }
    }

    private static func saveAll(_ arr: [String]) {
        guard let url = fileURL() else { return }
        do {
            let data = try JSONEncoder().encode(arr)
            try data.write(to: url, options: .atomic)
        } catch {
            print("[LinkStore] save error: \(error)")
        }
    }

    @discardableResult
    static func add(urlStrings: [String]) -> Int {
        var set = Set(loadAll())
        for s in urlStrings { let v = s.trimmingCharacters(in: .whitespacesAndNewlines); if !v.isEmpty { set.insert(v) } }
        let arr = Array(set).sorted()
        saveAll(arr)
        return arr.count
    }

    static func all() -> [String] { loadAll() }
    static func clear() { saveAll([]) }
}
