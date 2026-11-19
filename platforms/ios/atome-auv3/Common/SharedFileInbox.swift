import Foundation

// Files the system hands to atome (R-205, AGENTS.md rule 18): « Ouvrir dans atome » or a share sheet's « Copier vers
// atome », a `.atome` touched in Files. Each is staged as the import panel's Ouvrir stages a choice
// (ImportStagingPicker.stage: `Documents/imports/<id>/`, served by `atome:///file/`), held until the page takes it
// (`shared_files_take`), and announced (`atome:shared-files-available`); the page imports it where the person is
// (eVe/intuition/runtime/shared_files_inbox.js). The system's own copy in the app's `Documents/Inbox` is removed once staged.
enum SharedFileInbox {
    private static let queue = DispatchQueue(label: "one.atome.shared.files")
    private static var pending: [[String: Any]] = []
    private static var failures: [String] = []
    // The SwiftUI handler and the scene delegate may both deliver one opening: a path seen this recently is the same one.
    private static var recent: [String: Date] = [:]
    private static let sameOpeningSeconds: TimeInterval = 5

    /// Takes a file URL (staged in the background); answers false for any other URL, left to the links' inbox.
    @discardableResult
    static func receive(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        let fresh = queue.sync { () -> Bool in
            let now = Date()
            recent = recent.filter { now.timeIntervalSince($0.value) < sameOpeningSeconds }
            guard recent[url.path] == nil else { return false }
            recent[url.path] = now
            return true
        }
        guard fresh else { return true }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let files = try ImportStagingPicker.stage([url])
                queue.sync { pending.append(contentsOf: files) }
                if url.path.contains("/Documents/Inbox/") { try FileManager.default.removeItem(at: url) }
            } catch {
                queue.sync { failures.append("shared_file_staging_failed:\(url.lastPathComponent):\(error.localizedDescription)") }
            }
            WebViewManager.evaluateJS("window.dispatchEvent(new Event('atome:shared-files-available'));", label: "shared.files.available", priority: .critical)
        }
        return true
    }

    /// The staged files `{ name, relative_path, path, size }` and the failures, each delivered once.
    static func take() -> [String: Any] {
        queue.sync {
            defer { pending = []; failures = [] }
            return ["files": pending, "errors": failures]
        }
    }
}
