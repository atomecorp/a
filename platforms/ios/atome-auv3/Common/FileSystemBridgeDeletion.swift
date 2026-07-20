import Foundation
import WebKit

extension FileSystemBridge {
    private func deletionTransaction() -> FileSystemDeletionTransaction {
        let files = FileManager.default
        return FileSystemDeletionTransaction(
            coordinate: { url, accessor in
                var coordinationError: NSError?
                NSFileCoordinator(filePresenter: nil).coordinate(
                    writingItemAt: url,
                    options: .forDeleting,
                    error: &coordinationError,
                    byAccessor: accessor
                )
                return coordinationError
            },
            removeItem: { try files.removeItem(at: $0) },
            fileExists: { files.fileExists(atPath: $0) },
            markDeleted: { FileSyncCoordinator.shared.markDeleted(url: $0) },
            sync: { FileSyncCoordinator.shared.syncAll(force: true) }
        )
    }

    func handleDeleteFile(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid path parameter")
            return
        }
        guard let url = resolveURL(for: path, isDirectory: false) else {
            sendErrorResponse(to: webView, error: "Invalid path")
            return
        }
        do {
            try deletionTransaction().delete(FileSystemDeletionTarget(url: url))
            sendSuccessResponse(to: webView, data: ["message": "File deleted successfully"])
        } catch {
            sendErrorResponse(to: webView, error: "Failed to delete file: \(error.localizedDescription)")
        }
    }

    func handleDeleteDirectory(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid path parameter")
            return
        }
        guard let url = resolveURL(for: path, isDirectory: true) else {
            sendErrorResponse(to: webView, error: "Invalid path")
            return
        }
        do {
            try deletionTransaction().delete(FileSystemDeletionTarget(url: url))
            sendSuccessResponse(to: webView, data: ["message": "Directory deleted successfully"])
        } catch {
            sendErrorResponse(to: webView, error: "Failed to delete directory: \(error.localizedDescription)")
        }
    }

    func handleDeleteMultiple(body: [String: Any], webView: WKWebView?) {
        guard let paths = body["paths"] as? [String], !paths.isEmpty else {
            sendErrorResponse(to: webView, error: "Invalid paths parameter")
            return
        }
        let files = FileManager.default
        let targets = paths.compactMap { path -> FileSystemDeletionTarget? in
            guard let directoryURL = resolveURL(for: path, isDirectory: true) else { return nil }
            var isDirectory: ObjCBool = false
            if files.fileExists(atPath: directoryURL.path, isDirectory: &isDirectory), isDirectory.boolValue {
                return FileSystemDeletionTarget(url: directoryURL)
            }
            guard let fileURL = resolveURL(for: path, isDirectory: false) else { return nil }
            return FileSystemDeletionTarget(url: fileURL)
        }
        guard !targets.isEmpty else {
            sendSuccessResponse(to: webView, data: ["message": "Nothing to delete"])
            return
        }
        let failures = deletionTransaction().deleteAll(targets)
        if failures.isEmpty {
            sendSuccessResponse(to: webView, data: ["message": "Deleted \(targets.count) item(s)"])
        } else {
            sendErrorResponse(
                to: webView,
                error: "Failed: \(failures.map(\.lastPathComponent).joined(separator: ", "))"
            )
        }
    }
}
