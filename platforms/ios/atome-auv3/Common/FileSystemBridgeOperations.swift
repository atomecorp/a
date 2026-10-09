import Foundation
import UIKit
import WebKit

// File-type tokens the web layer sends instead of file extensions. `photos`
// belongs to `PhotoLibraryImportPicker`; this one asks for the source choice
// under a request that declares no type at all.
private let anySourceImportToken = "*"

extension FileSystemBridge {
    func handleCreateDirectory(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String, !path.isEmpty,
              let url = resolveURL(for: path, isDirectory: true) else {
            sendErrorResponse(to: webView, error: "Invalid path for createDirectory")
            return
        }
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            sendSuccessResponse(to: webView, data: ["message": "Directory created"])
            FileSyncCoordinator.shared.syncAll(force: true)
        } catch {
            sendErrorResponse(to: webView, error: "Failed to create directory: \(error.localizedDescription)")
        }
    }

    func handleRenameItem(body: [String: Any], webView: WKWebView?) {
        guard let oldRel = body["oldPath"] as? String, !oldRel.isEmpty,
              let newRel = body["newPath"] as? String, !newRel.isEmpty else {
            sendErrorResponse(to: webView, error: "Invalid parameters for renameItem")
            return
        }
        let files = FileManager.default
        guard let tentativeOld = resolveURL(for: oldRel, isDirectory: false) else {
            sendErrorResponse(to: webView, error: "Invalid oldPath")
            return
        }
        var isDirectory: ObjCBool = false
        if !files.fileExists(atPath: tentativeOld.path, isDirectory: &isDirectory) {
            isDirectory = false
        }
        guard let oldURL = resolveURL(for: oldRel, isDirectory: isDirectory.boolValue),
              let newURL = resolveURL(for: newRel, isDirectory: isDirectory.boolValue) else {
            sendErrorResponse(to: webView, error: "Invalid parameters for renameItem")
            return
        }
        do {
            let parent = newURL.deletingLastPathComponent()
            if parent.path != oldURL.path {
                try files.createDirectory(at: parent, withIntermediateDirectories: true)
            }
            var finalURL = newURL
            if files.fileExists(atPath: newURL.path) {
                let name = newURL.deletingPathExtension().lastPathComponent
                let ext = newURL.pathExtension
                var index = 2
                while index <= 500 {
                    let candidate = parent.appendingPathComponent(
                        ext.isEmpty ? "\(name) \(index)" : "\(name) \(index).\(ext)"
                    )
                    if !files.fileExists(atPath: candidate.path) {
                        finalURL = candidate
                        break
                    }
                    index += 1
                }
            }
            var coordinationError: NSError?
            var moveError: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(
                writingItemAt: oldURL,
                options: [],
                writingItemAt: finalURL,
                options: [],
                error: &coordinationError
            ) { coordinatedOld, coordinatedNew in
                do { try files.moveItem(at: coordinatedOld, to: coordinatedNew) }
                catch { moveError = error as NSError }
            }
            if let error = moveError ?? coordinationError { throw error }
            FileSyncCoordinator.shared.recordMove(oldURL: oldURL, newURL: finalURL)
            sendSuccessResponse(to: webView, data: ["message": "Renamed"])
            FileSyncCoordinator.shared.syncAll(force: true)
        } catch {
            sendErrorResponse(to: webView, error: "Failed to rename: \(error.localizedDescription)")
        }
    }

    func handleCopyFiles(body: [String: Any], webView: WKWebView?) {
        guard let destination = body["destFolder"] as? String,
              let sources = body["sources"] as? [String], !sources.isEmpty,
              let destinationURL = resolveURL(for: destination, isDirectory: true) else {
            sendErrorResponse(to: webView, error: "Invalid copy parameters")
            return
        }
        try? FileManager.default.createDirectory(at: destinationURL, withIntermediateDirectories: true)

        func uniqueURL(for baseURL: URL) -> URL {
            let files = FileManager.default
            if !files.fileExists(atPath: baseURL.path) { return baseURL }
            let name = baseURL.deletingPathExtension().lastPathComponent
            let ext = baseURL.pathExtension
            for index in 2...500 {
                let copyName = "\(name) copy \(index)"
                let candidate = baseURL.deletingLastPathComponent().appendingPathComponent(
                    ext.isEmpty ? copyName : "\(copyName).\(ext)"
                )
                if !files.fileExists(atPath: candidate.path) { return candidate }
            }
            return baseURL
        }

        var copied: [String] = []
        for source in sources {
            guard let sourceURL = resolveURL(for: source, isDirectory: false) else { continue }
            let finalURL = uniqueURL(for: destinationURL.appendingPathComponent(sourceURL.lastPathComponent))
            do {
                try FileManager.default.copyItem(at: sourceURL, to: finalURL)
                let folder = destination.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                copied.append(destination == "." || destination == "./"
                    ? finalURL.lastPathComponent
                    : folder + "/" + finalURL.lastPathComponent)
            } catch { }
        }
        FileSyncCoordinator.shared.syncAll(force: true)
        if copied.isEmpty {
            sendErrorResponse(to: webView, error: "Copy failed for all sources")
        } else {
            sendSuccessResponse(to: webView, data: ["copied": copied])
        }
    }

    func handleEnsureLocal(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String, !path.isEmpty else {
            sendErrorResponse(to: webView, error: "Invalid path for ensureLocal")
            return
        }
        guard let fileURL = resolveURL(for: path, isDirectory: false) else {
            sendSuccessResponse(to: webView, data: ["message": "Invalid path, assuming local"])
            return
        }
        DispatchQueue.global(qos: .utility).async {
            do {
                let values = try fileURL.resourceValues(forKeys: [
                    .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey
                ])
                if values.isUbiquitousItem != true {
                    DispatchQueue.main.async {
                        self.sendSuccessResponse(to: webView, data: ["message": "Not ubiquitous"])
                    }
                    return
                }
                try? FileManager.default.startDownloadingUbiquitousItem(at: fileURL)
                let deadline = Date().addingTimeInterval(3)
                while Date() < deadline {
                    if let status = try? fileURL.resourceValues(
                        forKeys: [.ubiquitousItemDownloadingStatusKey]
                    ).ubiquitousItemDownloadingStatus, status == .current { break }
                    Thread.sleep(forTimeInterval: 0.1)
                }
                DispatchQueue.main.async {
                    self.sendSuccessResponse(to: webView, data: ["message": "ensureLocal attempted"])
                }
            } catch {
                DispatchQueue.main.async {
                    self.sendSuccessResponse(to: webView, data: [
                        "message": "ensureLocal fallback", "error": error.localizedDescription
                    ])
                }
            }
        }
    }

    func findViewController(from view: UIView) -> UIViewController? {
        var responder: UIResponder? = view
        while let current = responder {
            if let controller = current as? UIViewController { return controller }
            responder = current.next
        }
        return nil
    }

    func handleSaveFileWithDocumentPicker(body: [String: Any], webView: WKWebView?) {
        guard let fileName = body["fileName"] as? String,
              let dataString = body["data"] as? String,
              let data = dataString.data(using: .utf8),
              let webView else {
            sendErrorResponse(to: webView, error: "Invalid parameters for Document Picker")
            return
        }
        guard let controller = findViewController(from: webView) else {
            sendErrorResponse(to: webView, error: "Cannot find view controller for Document Picker")
            return
        }
        iCloudFileManager.shared.saveFileWithDocumentPicker(
            data: data, fileName: fileName, from: controller
        ) { [weak self] success, error in
            DispatchQueue.main.async {
                let message = error?.localizedDescription ?? "Unknown error"
                let js = success
                    ? "if (window.documentPickerResult) window.documentPickerResult(true, null);"
                    : "if (window.documentPickerResult) window.documentPickerResult(false, '\(message)');"
                self?.dispatchJS(js, label: "filesystem.documentPicker", webView: webView)
            }
        }
    }

    func handleLoadFilesWithDocumentPicker(body: [String: Any], webView: WKWebView?) {
        guard let webView else {
            sendErrorResponse(to: webView, error: "Invalid webView")
            return
        }
        let types = body["fileTypes"] as? [String] ?? ["atome", "json", "m4a", "mp3", "wav"]
        let allowsMultiple = body["multiple"] as? Bool ?? true
        guard let controller = findViewController(from: webView) else {
            sendErrorResponse(to: webView, error: "Cannot find view controller")
            return
        }
        // The Media panel's « Ajouter des fichiers externes » sends the sources
        // it wants (files, camera roll, music) for the kinds it accepts: the
        // person always chooses, the bridge never jumps to one of them.
        if let requested = body["sources"] as? [String], !requested.isEmpty {
            let request = ImportSourceRequest(
                sources: requested,
                kinds: body["kinds"] as? [String] ?? [],
                labels: body["labels"] as? [String: String] ?? [:],
                allowsMultiple: allowsMultiple
            )
            presentImportSources(request, controller: controller, webView: webView)
            return
        }
        // A picture request is answered by Apple Photos, not by the file
        // provider that has no access to the library.
        if types.contains(PhotoLibraryImportPicker.fileTypeToken) {
            presentPhotoLibraryPicker(allowsMultiple: allowsMultiple, controller: controller, webView: webView)
            return
        }
        // A request that names no type may be a picture or a document: the
        // person chooses the source instead of the bridge choosing for him.
        if types.contains(anySourceImportToken) {
            presentImportSourceChoice(allowsMultiple: allowsMultiple, controller: controller, webView: webView)
            return
        }
        presentImportDocumentPicker(
            types: types,
            allowsMultiple: allowsMultiple,
            controller: controller,
            webView: webView
        )
    }

    private func presentPhotoLibraryPicker(
        allowsMultiple: Bool,
        controller: UIViewController,
        webView: WKWebView
    ) {
        PhotoLibraryImportPicker.loadImages(
            selectionLimit: allowsMultiple ? 0 : 1,
            from: controller
        ) { [weak self] success, results, error in
            DispatchQueue.main.async {
                self?.sendLoadedFiles(success: success, results: results, error: error, webView: webView)
            }
        }
    }

    private func presentImportDocumentPicker(
        types: [String],
        allowsMultiple: Bool,
        controller: UIViewController,
        webView: WKWebView
    ) {
        iCloudFileManager.shared.loadFilesWithDocumentPicker(
            fileTypes: types,
            multiple: allowsMultiple,
            from: controller
        ) { [weak self] success, results, error in
            DispatchQueue.main.async {
                self?.sendLoadedFiles(success: success, results: results, error: error, webView: webView)
            }
        }
    }

    // The two sources an undeclared import may carry. Cancelling answers the
    // same "User cancelled" the pickers answer, so the web layer keeps reading
    // one cancellation shape.
    private func presentImportSourceChoice(
        allowsMultiple: Bool,
        controller: UIViewController,
        webView: WKWebView
    ) {
        let alert = UIAlertController(title: "Importer depuis", message: nil, preferredStyle: .actionSheet)
        alert.addAction(UIAlertAction(title: "Photos", style: .default) { [weak self] _ in
            self?.presentPhotoLibraryPicker(allowsMultiple: allowsMultiple, controller: controller, webView: webView)
        })
        alert.addAction(UIAlertAction(title: "Fichiers", style: .default) { [weak self] _ in
            self?.presentImportDocumentPicker(
                types: [],
                allowsMultiple: allowsMultiple,
                controller: controller,
                webView: webView
            )
        })
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { [weak self] _ in
            let error = NSError(
                domain: "ImportSource",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "User cancelled"]
            )
            self?.sendLoadedFiles(success: false, results: nil, error: error, webView: webView)
        })
        if let popover = alert.popoverPresentationController {
            popover.sourceView = controller.view
            popover.sourceRect = CGRect(
                x: controller.view.bounds.midX,
                y: controller.view.bounds.midY,
                width: 0,
                height: 0
            )
            popover.permittedArrowDirections = []
        }
        DispatchQueue.main.async { controller.present(alert, animated: true) }
    }

    private struct ImportSourceRequest {
        let sources: [String]
        let kinds: [String]
        let labels: [String: String]
        let allowsMultiple: Bool

        func label(_ key: String, _ fallback: String) -> String {
            let value = labels[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return value.isEmpty ? fallback : value
        }
    }

    // The Music library cannot be presented from an Audio Unit extension
    // (no library entitlement in a host process): the source is left out there.
    private func availableImportSources(_ requested: [String]) -> [String] {
        let known = ["files", "photos", "contacts", "music"]
        return requested.filter { source in
            guard known.contains(source) else { return false }
            return source != "music" || !ExternalDisplayGuards.isRunningInExtension
        }
    }

    private func presentImportSources(_ request: ImportSourceRequest, controller: UIViewController, webView: WKWebView) {
        let sources = availableImportSources(request.sources)
        if sources.count == 1, let only = sources.first {
            presentImportSource(only, request: request, controller: controller, webView: webView)
            return
        }
        let alert = UIAlertController(title: request.label("title", "Ajouter depuis"), message: nil, preferredStyle: .actionSheet)
        let titles = [
            "files": request.label("files", "Fichiers"),
            "photos": request.label("photos", "Pellicule"),
            "contacts": request.label("contacts", "Contacts"),
            "music": request.label("music", "Musique")
        ]
        for source in sources {
            alert.addAction(UIAlertAction(title: titles[source] ?? source, style: .default) { [weak self] _ in
                self?.presentImportSource(source, request: request, controller: controller, webView: webView)
            })
        }
        alert.addAction(UIAlertAction(title: request.label("cancel", "Annuler"), style: .cancel) { [weak self] _ in
            let error = NSError(domain: "ImportSource", code: -1, userInfo: [NSLocalizedDescriptionKey: "User cancelled"])
            self?.sendLoadedFiles(success: false, results: nil, error: error, webView: webView)
        })
        if let popover = alert.popoverPresentationController {
            popover.sourceView = controller.view
            popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        DispatchQueue.main.async { controller.present(alert, animated: true) }
    }

    private func presentImportSource(
        _ source: String,
        request: ImportSourceRequest,
        controller: UIViewController,
        webView: WKWebView
    ) {
        switch source {
        case "photos":
            PhotoLibraryImportPicker.loadMedia(
                kinds: request.kinds,
                selectionLimit: request.allowsMultiple ? 0 : 1,
                from: controller
            ) { [weak self] success, results, error in
                DispatchQueue.main.async {
                    self?.sendLoadedFiles(success: success, results: results, error: error, webView: webView)
                }
            }
        case "contacts":
            // Contact photos already live in the user's library: the web layer
            // lists them itself, the bridge only reports the chosen source.
            sendSuccessResponse(to: webView, data: ["source": "contacts", "files": []])
        case "music":
            MusicLibraryImportPicker.loadTracks(
                allowsMultiple: request.allowsMultiple,
                protectedMessage: request.label("musicProtected", "Ce titre Apple Music est protégé et ne peut pas être importé"),
                from: controller
            ) { [weak self] success, results, error in
                DispatchQueue.main.async {
                    self?.sendLoadedFiles(success: success, results: results, error: error, webView: webView)
                }
            }
        default:
            presentImportDocumentPicker(
                types: Self.documentTypes(for: request.kinds),
                allowsMultiple: request.allowsMultiple,
                controller: controller,
                webView: webView
            )
        }
    }

    // The document picker vocabulary of `iCloudFileManager`: an empty list
    // opens every document; a kind restricts to its family.
    private static func documentTypes(for kinds: [String]) -> [String] {
        let all = ["image", "video", "audio"]
        if kinds.isEmpty || Set(kinds).isSuperset(of: all) { return [] }
        return kinds
    }

    private func sendLoadedFiles(
        success: Bool,
        results: [(String, Data)]?,
        error: Error?,
        webView: WKWebView
    ) {
        if success, let results {
            let files: [[String: Any]] = results.map { pair in
                ["name": pair.0, "base64": pair.1.base64EncodedString()]
            }
            sendSuccessResponse(to: webView, data: ["files": files])
        } else {
            sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Unknown error")
        }
    }

    func handleSaveProjectInternal(body: [String: Any], webView: WKWebView?) {
        guard let fileName = body["fileName"] as? String,
              let dataString = body["data"] as? String,
              let requestId = body["requestId"] as? Int else { return }
        guard let storageURL = iCloudFileManager.shared.getCurrentStorageURL() else {
            sendBridgeResult(to: webView, payload: [
                "action": "saveProjectInternalResult", "requestId": requestId,
                "success": false, "error": "No storage URL"
            ])
            return
        }
        let projectsURL = storageURL.appendingPathComponent("Projects", isDirectory: true)
        try? FileManager.default.createDirectory(at: projectsURL, withIntermediateDirectories: true)
        do {
            try Data(dataString.utf8).write(to: projectsURL.appendingPathComponent(fileName), options: .atomic)
            sendBridgeResult(to: webView, payload: [
                "action": "saveProjectInternalResult", "requestId": requestId, "success": true,
                "fileName": fileName, "path": "Projects/" + fileName
            ])
        } catch {
            sendBridgeResult(to: webView, payload: [
                "action": "saveProjectInternalResult", "requestId": requestId,
                "success": false, "error": error.localizedDescription
            ])
        }
    }

    func handleCopyToIOSLocal(body: [String: Any], webView: WKWebView?) {
        guard let webView, let controller = findViewController(from: webView) else {
            sendErrorResponse(to: webView, error: "No VC")
            return
        }
        let destination = body["requestedDestPath"] as? String ?? "./"
        let types = body["fileTypes"] as? [String] ?? ["m4a", "mp3", "wav", "atome", "json"]
        iCloudFileManager.shared.importFileToRelativePath(
            fileTypes: types, requestedDestPath: destination, from: controller
        ) { [weak self] success, path, error in
            DispatchQueue.main.async {
                if success, let path {
                    self?.sendSuccessResponse(to: webView, data: ["path": path, "paths": [path]])
                } else {
                    self?.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Import failed")
                }
            }
        }
    }

    func handleCopyMultipleToIOSLocal(body: [String: Any], webView: WKWebView?) {
        guard let webView, let controller = findViewController(from: webView) else {
            sendErrorResponse(to: webView, error: "No VC")
            return
        }
        let destination = body["requestedDestPath"] as? String ?? "./"
        let types = body["fileTypes"] as? [String] ?? ["m4a", "mp3", "wav", "atome", "json"]
        iCloudFileManager.shared.importFilesToRelativeFolder(
            fileTypes: types, requestedDestPath: destination, from: controller
        ) { [weak self] success, paths, error in
            DispatchQueue.main.async {
                if success, let paths {
                    self?.sendSuccessResponse(to: webView, data: ["paths": paths])
                } else {
                    self?.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Import failed")
                }
            }
        }
    }

    func sendBridgeResult(to webView: WKWebView?, payload: [String: Any]) {
        guard let webView,
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        dispatchJS(
            "window.AUv3API && AUv3API._receiveFromSwift(\(json));",
            label: "filesystem.bridge",
            webView: webView
        )
    }
}
