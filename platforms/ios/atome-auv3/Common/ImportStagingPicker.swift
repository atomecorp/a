import Foundation
import UIKit
import UniformTypeIdentifiers

// The import panel's Ouvrir on iOS (R-205, user 17 Nov. 2026: « un seul Ouvrir », what is chosen decides): one Files
// window where a file or a folder is chosen (a Loopy Pro `.lpproj`, a `.fcpxmld` bundle). What is chosen is copied into
// the app group's `Documents/imports/<id>/`, and its files are answered as paths under the `atome:///file/` scheme
// (AudioSchemeHandler.serveSandboxFile), each with its path inside the folder chosen: no byte crosses the bridge as
// base64, so a bundle of a gigabyte is read from disk by the page, never held twice in memory.
final class ImportStagingPicker: NSObject, UIDocumentPickerDelegate {
    private static let folderName = "imports"
    // A staged import older than this is removed when the next one begins: its page has read it long since.
    private static let keepSeconds: TimeInterval = 24 * 3600
    private static var current: ImportStagingPicker?

    private let completion: (Bool, [[String: Any]], Error?) -> Void

    private init(completion: @escaping (Bool, [[String: Any]], Error?) -> Void) {
        self.completion = completion
    }

    static func present(multiple: Bool, from controller: UIViewController, completion: @escaping (Bool, [[String: Any]], Error?) -> Void) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item, .folder])
        let delegate = ImportStagingPicker(completion: completion)
        current = delegate
        picker.delegate = delegate
        picker.allowsMultipleSelection = multiple
        picker.shouldShowFileExtensions = true
        picker.modalPresentationStyle = .fullScreen
        DispatchQueue.main.async { controller.present(picker, animated: true) }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        DispatchQueue.global(qos: .userInitiated).async {
            let staged = Result { try Self.stage(urls) }
            DispatchQueue.main.async {
                Self.current = nil
                switch staged {
                case .success(let files) where !files.isEmpty: self.completion(true, files, nil)
                case .success: self.completion(false, [], NSError(domain: "ImportStaging", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"]))
                case .failure(let error): self.completion(false, [], error)
                }
            }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        Self.current = nil
        completion(false, [], NSError(domain: "ImportStaging", code: -1, userInfo: [NSLocalizedDescriptionKey: "User cancelled"]))
    }

    // Each item chosen copied under a fresh folder, then every regular file in it listed: `name`, `relative_path` (its
    // path from the item chosen's own name: `Song.lpproj/Resources/a.aiff`, or the file's name), `path` (under the app
    // group's Documents, as `atome:///file/` serves it), `size`.
    // Also the staging of a file the system hands to atome (SharedFileInbox.swift).
    static func stage(_ urls: [URL]) throws -> [[String: Any]] {
        guard let documents = SandboxPathValidator.appGroupDocumentsRoot() else {
            throw NSError(domain: "ImportStaging", code: -2, userInfo: [NSLocalizedDescriptionKey: "import_staging_root_missing"])
        }
        let fm = FileManager.default
        let root = documents.appendingPathComponent(folderName, isDirectory: true)
        removeOldImports(in: root)
        let id = UUID().uuidString
        let target = root.appendingPathComponent(id, isDirectory: true)
        try fm.createDirectory(at: target, withIntermediateDirectories: true)
        var files: [[String: Any]] = []
        for url in urls {
            let started = url.startAccessingSecurityScopedResource()
            defer { if started { url.stopAccessingSecurityScopedResource() } }
            let copy = target.appendingPathComponent(url.lastPathComponent)
            var coordinated: NSError?
            var copyError: Error?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinated) { readable in
                do { try fm.copyItem(at: readable, to: copy) } catch { copyError = error }
            }
            if let error = coordinated ?? copyError { throw error }
            files.append(contentsOf: try listed(copy, base: target, path: "\(folderName)/\(id)"))
        }
        return files
    }

    private static func listed(_ item: URL, base: URL, path: String) throws -> [[String: Any]] {
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey]
        let entry = { (file: URL) -> [String: Any] in
            let relative = String(file.standardizedFileURL.path.dropFirst(base.standardizedFileURL.path.count + 1))
            let size = (try? file.resourceValues(forKeys: Set(keys)).fileSize) ?? 0
            return ["name": file.lastPathComponent, "relative_path": relative, "path": "\(path)/\(relative)", "size": size]
        }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: item.path, isDirectory: &isDirectory), isDirectory.boolValue else { return [entry(item)] }
        guard let walker = FileManager.default.enumerator(at: item, includingPropertiesForKeys: keys) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }.map(entry)
    }

    private static func removeOldImports(in root: URL) {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.creationDateKey]) else { return }
        let limit = Date().addingTimeInterval(-keepSeconds)
        for entry in entries where ((try? entry.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast) < limit {
            try? fm.removeItem(at: entry)
        }
    }
}
