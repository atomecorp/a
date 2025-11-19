//
//  FileSystemBridge.swift
//  atomeAudioUnit
//
//  Created by AI Assistant on 06/08/2025.
//

import Foundation
import WebKit
import UIKit
import SwiftUI

class FileSystemBridge: NSObject, WKScriptMessageHandler {
    
    private weak var currentWebView: WKWebView?
    private func isAllowedPath(url: URL) -> Bool {
        SandboxPathValidator.isAllowed(url: url)
    }
    
    // Map iCloud downloading status to a concise string for JS/UI
    private func simpleDownloadingStatus(_ status: URLUbiquitousItemDownloadingStatus?) -> String {
    switch status {
    case .some(.current): return "current"
    case .some(.downloaded): return "downloaded"
    case .some(.notDownloaded): return "notDownloaded"
    case .some(_): return ""
    case .none: return ""
    }
    }
    
    // Resolve a string path to a concrete URL, supporting a custom appgroup:/ scheme.
    // Examples:
    //  - "." => current storage root (Documents for local/iCloud choice)
    //  - "Recordings" => <storage>/Recordings
    //  - "appgroup:/Documents" => <AppGroup>/Documents
    //  - "appgroup:/" => <AppGroup>
    private func resolveURL(for path: String, isDirectory: Bool = false) -> URL? {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)

        func buildURL(from base: URL, relative: String) -> URL? {
            guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relative) else {
                SandboxPathValidator.reportViolation(path: relative, context: "FileSystemBridge.resolveURL.sanitize")
                return nil
            }
            let resolved = sanitized.isEmpty ? base : base.appendingPathComponent(sanitized, isDirectory: isDirectory)
            return SandboxPathValidator.enforce(url: resolved, context: "FileSystemBridge.resolveURL") ? resolved : nil
        }

        if trimmed.hasPrefix("appgroup:") {
            var rest = String(trimmed.dropFirst("appgroup:".count))
            if rest.hasPrefix("/") { rest.removeFirst() }
            guard let groupRoot = SandboxPathValidator.allowedRoots().first else { return nil }
            return buildURL(from: groupRoot, relative: rest)
        }

        if trimmed.hasPrefix("temp:") || trimmed.hasPrefix("tmp:") {
            var rest = String(trimmed.dropFirst(trimmed.hasPrefix("temp:") ? 5 : 4))
            while rest.hasPrefix("/") { rest.removeFirst() }
            guard let tempRoot = SandboxPathValidator.temporaryRoot() else { return nil }
            return buildURL(from: tempRoot, relative: rest)
        }

        if trimmed.isEmpty || trimmed == "." || trimmed == "./" || trimmed == "/" {
            let root = SandboxPathValidator.primaryRoot()
            if root == nil {
                SandboxPathValidator.reportViolation(path: trimmed, context: "FileSystemBridge.resolveURL.primaryRootMissing")
            }
            return root
        }

        let preferredBase: URL? = {
            if let storage = iCloudFileManager.shared.getCurrentStorageURL(), SandboxPathValidator.isAllowed(url: storage) {
                return storage
            }
            return SandboxPathValidator.primaryRoot()
        }()

        guard let base = preferredBase else { return nil }
        return buildURL(from: base, relative: trimmed)
    }
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        
        // Garde une référence faible à la WebView pour pouvoir trouver le view controller
        self.currentWebView = message.webView
        
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }
        
        switch action {
        case "saveFile":
            handleSaveFile(body: body, webView: message.webView)
        case "loadFile":
            handleLoadFile(body: body, webView: message.webView)
        case "resetFileAccessPermission":
            iCloudFileManager.shared.resetFileAccessPermission()
            sendSuccessResponse(to: message.webView, data: ["message":"file access permission reset"])        
        case "listFiles":
            handleListFiles(body: body, webView: message.webView)
        case "deleteFile":
            handleDeleteFile(body: body, webView: message.webView)
        case "deleteDirectory":
            handleDeleteDirectory(body: body, webView: message.webView)
        case "getStorageInfo":
            handleGetStorageInfo(webView: message.webView)
        case "showStorageSettings":
            handleShowStorageSettings()
        case "saveFileWithDocumentPicker":
            handleSaveFileWithDocumentPicker(body: body, webView: message.webView)
        case "loadFilesWithDocumentPicker":
            handleLoadFilesWithDocumentPicker(body: body, webView: message.webView)
        case "saveProjectInternal":
            handleSaveProjectInternal(body: body, webView: message.webView)
        case "copyToIOSLocal":
            handleCopyToIOSLocal(body: body, webView: message.webView)
        case "copyMultipleToIOSLocal":
            handleCopyMultipleToIOSLocal(body: body, webView: message.webView)
        case "ensureLocal":
            handleEnsureLocal(body: body, webView: message.webView)
        case "copyFiles":
            handleCopyFiles(body: body, webView: message.webView)
        case "createDirectory":
            handleCreateDirectory(body: body, webView: message.webView)
        case "renameItem":
            handleRenameItem(body: body, webView: message.webView)
        case "deleteMultiple":
            handleDeleteMultiple(body: body, webView: message.webView)
        default:
            sendErrorResponse(to: message.webView, error: "Unknown action: \(action)")
        }
    }

    // MARK: - Coordinated deletion helpers
    private func deleteCoordinated(at url: URL, isDirectory: Bool) throws {
        var coordError: NSError?
        let coordinator = NSFileCoordinator(filePresenter: nil)
        coordinator.coordinate(writingItemAt: url, options: .forDeleting, error: &coordError) { coordinatedURL in
            do {
                if isDirectory {
                    // Best-effort hidden content cleanup
                    if let enumerator = FileManager.default.enumerator(at: coordinatedURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsSubdirectoryDescendants]) {
                        for case let child as URL in enumerator {
                            if child.lastPathComponent.hasPrefix(".") {
                                try? FileManager.default.removeItem(at: child)
                            }
                        }
                    }
                }
                try FileManager.default.removeItem(at: coordinatedURL)
            } catch {
                // Re-throw to outer scope
                do { throw error } catch { }
            }
        }
        if let e = coordError { throw e }
    }
    
    private func handleSaveFile(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String,
              let data = body["data"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid parameters")
            return
        }
    // Support binaire encodé base64 avec marqueur __BASE64__ (ajouté par hmlt_2_ios_local.js)
        let fileData: Data
        if data.hasPrefix("__BASE64__") {
            let b64 = String(data.dropFirst("__BASE64__".count))
            if let decoded = Data(base64Encoded: b64) {
                fileData = decoded
            } else {
                fileData = Data(b64.utf8)
            }
        } else {
            fileData = Data(data.utf8)
        }
        iCloudFileManager.shared.saveFile(data: fileData, to: path) { success, error in
            DispatchQueue.main.async {
                if success {
                    self.sendSuccessResponse(to: webView, data: ["message": "File saved successfully"])
                    // Force immediate sync propagation
                    FileSyncCoordinator.shared.syncAll(force: true)
                } else {
                    self.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Unknown error")
                }
            }
        }
    }
    
    private func handleLoadFile(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid path parameter")
            return
        }
        
        iCloudFileManager.shared.loadFile(from: path) { data, error in
            DispatchQueue.main.async {
                if let data = data, let content = String(data: data, encoding: .utf8) {
                    self.sendSuccessResponse(to: webView, data: ["content": content])
                } else {
                    self.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Failed to load file")
                }
            }
        }
    }
    
    private func handleListFiles(body: [String: Any], webView: WKWebView?) {
        // Accept both 'folder' (legacy) and 'path' (AUv3API)
        let folder = (body["folder"] as? String) ?? (body["path"] as? String) ?? ""
        let requestId = body["requestId"] as? Int
        if folder.isEmpty { sendErrorResponse(to: webView, error: "Invalid folder/path parameter"); return }
        guard let folderURL = resolveURL(for: folder, isDirectory: true) else {
            if let requestId = requestId { sendBridgeResult(to: webView, payload: ["action":"listFilesResult","requestId":requestId,"success":false,"error":"Invalid base URL"]) }
            else { sendErrorResponse(to: webView, error: "Invalid base URL") }
            return
        }
        do {
            // If directory does not exist, return empty listing (success=true) for a smoother UX
            var isDir: ObjCBool = false
            if !FileManager.default.fileExists(atPath: folderURL.path, isDirectory: &isDir) || !isDir.boolValue {
                let empty: [[String:Any]] = []
                if let requestId = requestId {
                    sendBridgeResult(to: webView, payload: ["action":"listFilesResult","requestId":requestId,"success":true,"files":empty])
                } else {
                    sendSuccessResponse(to: webView, data: ["files": empty])
                }
                return
            }
            let fileURLs = try FileManager.default.contentsOfDirectory(at: folderURL, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey, .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey], options: .skipsHiddenFiles)
            let files = fileURLs.compactMap { url -> [String: Any]? in
                guard let resourceValues = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey, .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey]) else { return nil }
                let isFile = resourceValues.isRegularFile ?? false
                let isDirectory = resourceValues.isDirectory ?? false
                let isCloud = resourceValues.isUbiquitousItem ?? false
                let dlStatus: String = simpleDownloadingStatus(resourceValues.ubiquitousItemDownloadingStatus)
                
                if isFile || isDirectory {
                    return [
                        "name": url.lastPathComponent,
                        "isDirectory": isDirectory,
                        "size": resourceValues.fileSize ?? 0,
                        "modified": resourceValues.contentModificationDate?.timeIntervalSince1970 ?? 0,
                        "isCloud": isCloud,
                        "downloadingStatus": dlStatus
                    ]
                }
                return nil
            }
            if let requestId = requestId { // unified AUv3API pathway
                sendBridgeResult(to: webView, payload: ["action":"listFilesResult","requestId":requestId,"success":true,"files":files])
            } else {
                sendSuccessResponse(to: webView, data: ["files": files])
            }
            // After listing (user likely expects freshness) schedule non-forced sync to pick external changes
            FileSyncCoordinator.shared.syncAll()
        } catch {
            if let requestId = requestId {
                sendBridgeResult(to: webView, payload: ["action":"listFilesResult","requestId":requestId,"success":false,"error":error.localizedDescription])
            } else {
                sendErrorResponse(to: webView, error: "Failed to list files: \(error.localizedDescription)")
            }
        }
    }
    
    private func handleDeleteFile(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid path parameter")
            return
        }
        
        guard let fileURL = resolveURL(for: path, isDirectory: false) else {
            sendErrorResponse(to: webView, error: "Invalid path")
            return
        }
        // Pause autosync to avoid resurrection during the operation
        FileSyncCoordinator.shared.stopAutoSync()
        defer {
            // Mark tombstone and resume sync
            FileSyncCoordinator.shared.markDeleted(url: fileURL)
            FileSyncCoordinator.shared.syncAll(force: true)
            // Resume after a short delay allowing UI quiescence
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.6) {
                FileSyncCoordinator.shared.startAutoSync()
            }
        }
        do {
            try deleteCoordinated(at: fileURL, isDirectory: false)
            sendSuccessResponse(to: webView, data: ["message": "File deleted successfully"])
        } catch {
            sendErrorResponse(to: webView, error: "Failed to delete file: \(error.localizedDescription)")
        }
    }

    private func handleDeleteDirectory(body: [String: Any], webView: WKWebView?) {
        guard let path = body["path"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid path parameter")
            return
        }
        guard let dirURL = resolveURL(for: path, isDirectory: true) else {
            sendErrorResponse(to: webView, error: "Invalid path")
            return
        }
        FileSyncCoordinator.shared.stopAutoSync()
        defer {
            FileSyncCoordinator.shared.markDeleted(url: dirURL)
            FileSyncCoordinator.shared.syncAll(force: true)
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.6) {
                FileSyncCoordinator.shared.startAutoSync()
            }
        }
        do {
            try deleteCoordinated(at: dirURL, isDirectory: true)
            sendSuccessResponse(to: webView, data: ["message": "Directory deleted successfully"])
        } catch {
            sendErrorResponse(to: webView, error: "Failed to delete directory: \(error.localizedDescription)")
        }
    }

    private func handleDeleteMultiple(body: [String: Any], webView: WKWebView?) {
        guard let paths = body["paths"] as? [String], !paths.isEmpty else {
            sendErrorResponse(to: webView, error: "Invalid paths parameter")
            return
        }
        // Resolve and classify once
        var items: [(url: URL, isDir: Bool)] = []
        for p in paths {
            // Try dir first; if it doesn't exist as dir, fallback to file
            if let dirURL = resolveURL(for: p, isDirectory: true) {
                var isDir: ObjCBool = false
                if FileManager.default.fileExists(atPath: dirURL.path, isDirectory: &isDir), isDir.boolValue {
                    items.append((dirURL, true)); continue
                }
                // If dir not present, try file path resolution
                if let fileURL = resolveURL(for: p, isDirectory: false) {
                    items.append((fileURL, false))
                }
            }
        }
        if items.isEmpty {
            sendSuccessResponse(to: webView, data: ["message": "Nothing to delete"])
            return
        }
        FileSyncCoordinator.shared.stopAutoSync()
        defer {
            for it in items { FileSyncCoordinator.shared.markDeleted(url: it.url) }
            FileSyncCoordinator.shared.syncAll(force: true)
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.6) { FileSyncCoordinator.shared.startAutoSync() }
        }
        var failures: [String] = []
        for it in items {
            do { try deleteCoordinated(at: it.url, isDirectory: it.isDir) }
            catch { failures.append(it.url.lastPathComponent) }
        }
        if failures.isEmpty {
            sendSuccessResponse(to: webView, data: ["message": "Deleted \(items.count) item(s)"])
        } else {
            sendErrorResponse(to: webView, error: "Failed: \(failures.joined(separator: ", "))")
        }
    }
    
    private func handleGetStorageInfo(webView: WKWebView?) {
        let storageInfo: [String: Any] = [
            "isICloudEnabled": UserDefaults.standard.bool(forKey: "AtomeUseICloud"),
            "isICloudAvailable": iCloudFileManager.shared.iCloudAvailable,
            "storageType": UserDefaults.standard.bool(forKey: "AtomeUseICloud") ? "icloud" : "local",
            "isInitialized": iCloudFileManager.shared.isInitialized
        ]
        
        sendSuccessResponse(to: webView, data: storageInfo)
    }
    
    private func handleShowStorageSettings() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // Pour l'instant, on affiche une alerte simple en attendant que l'interface SwiftUI soit configurée
            // Dans une extension AUv3, on ne peut pas utiliser UIApplication.shared
            // Il faut passer le view controller depuis l'extérieur
        guard let webView = self.currentWebView,
            let viewController = self.findViewController(from: webView) else {
                return
            }
            
            let alert = UIAlertController(
                title: "Paramètres de stockage",
                message: "Cette fonctionnalité sera disponible une fois iCloud configuré dans votre compte développeur Apple.",
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            viewController.present(alert, animated: true)
        }
    }

    private func dispatchJS(_ js: String,
                            label: String,
                            priority: WebViewManager.IPCPriority = .normal,
                            webView: WKWebView?) {
        guard let webView = webView else { return }
        WebViewManager.evaluateJS(js, label: label, priority: priority, targetWebView: webView)
    }
    
    private func sendSuccessResponse(to webView: WKWebView?, data: [String: Any]) {
        guard let webView = webView else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
            let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
            
            let js = """
                window.fileSystemCallback && window.fileSystemCallback({
                    success: true, 
                    data: \(jsonString)
                });
            """
            dispatchJS(js, label: "filesystem.success", webView: webView)
        } catch {
            sendErrorResponse(to: webView, error: "Failed to serialize response")
        }
    }
    
    private func sendErrorResponse(to webView: WKWebView?, error: String) {
        guard let webView = webView else { return }
        
        let escapedError = error.replacingOccurrences(of: "\"", with: "\\\"")
        let js = """
            window.fileSystemCallback && window.fileSystemCallback({
                success: false, 
                error: "\(escapedError)"
            });
        """
        dispatchJS(js, label: "filesystem.error", webView: webView)
    }
    
    func addFileSystemAPI(to webView: WKWebView) {
        webView.configuration.userContentController.add(self, name: "fileSystem")
        
        let jsAPI = """
        window.AtomeFileSystem = {
            saveFile: function(path, data, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'saveFile',
                    path: path,
                    data: data
                });
            },
            
            loadFile: function(path, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'loadFile',
                    path: path
                });
            },
            
            listFiles: function(folder, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'listFiles',
                    folder: folder || ''
                });
            },
            
            deleteFile: function(path, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'deleteFile',
                    path: path
                });
            },
            deleteMultiple: function(paths, callback) {
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'deleteMultiple', paths: Array.isArray(paths)? paths : [] });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            },
            deleteDirectory: function(path, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'deleteDirectory',
                    path: path
                });
            },
            
            getStorageInfo: function(callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'getStorageInfo'
                });
            },
            
            showStorageSettings: function() {
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'showStorageSettings'
                });
            },
            loadFilesWithDocumentPicker: function(fileTypes, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'loadFilesWithDocumentPicker',
                    fileTypes: fileTypes || []
                });
            },
            copy_to_ios_local: function(requestedDestPath, fileTypes, callback){
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'copyToIOSLocal',
                    requestedDestPath: requestedDestPath || './',
                    fileTypes: fileTypes || ['m4a','mp3','wav','atome','json']
                });
            },
            copy_multiple_to_ios_local: function(requestedDestFolder, fileTypes, callback){
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'copyMultipleToIOSLocal',
                    requestedDestPath: requestedDestFolder || './',
                    fileTypes: fileTypes || ['m4a','mp3','wav','atome','json']
                });
            },
            ensureLocal: function(path, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'ensureLocal', path: path || '' });
                } catch(_) {
                    // Fallback immediate success if bridge not available
                    try { callback && callback({ success: true }); } catch(__) {}
                }
            },
            copyFiles: function(destFolder, sources, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'copyFiles', destFolder: destFolder || './', sources: Array.isArray(sources)? sources : [] });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            },
            createDirectory: function(path, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'createDirectory', path: path || '' });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            },
            renameItem: function(oldPath, newPath, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'renameItem', oldPath: oldPath || '', newPath: newPath || '' });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            }
        };
        
        // Convenience methods for easier use
        window.saveProject = function(projectData, name) {
            return new Promise((resolve, reject) => {
                const fileName = name + '.atome';
                const path = 'Projects/' + fileName;
                
                AtomeFileSystem.saveFile(path, JSON.stringify(projectData), (result) => {
                    if (result.success) {
                        resolve(result.data);
                    } else {
                        reject(new Error(result.error));
                    }
                });
            });
        };
        
        window.loadProject = function(name) {
            return new Promise((resolve, reject) => {
                const fileName = name + '.atome';
                const path = 'Projects/' + fileName;
                
                AtomeFileSystem.loadFile(path, (result) => {
                    if (result.success) {
                        try {
                            const projectData = JSON.parse(result.data.content);
                            resolve(projectData);
                        } catch (e) {
                            reject(new Error('Invalid project file format'));
                        }
                    } else {
                        reject(new Error(result.error));
                    }
                });
            });
        };
        
        window.exportAudio = function(audioData, name) {
            return new Promise((resolve, reject) => {
                const fileName = name + '.wav';
                const path = 'Exports/' + fileName;
                
                AtomeFileSystem.saveFile(path, audioData, (result) => {
                    if (result.success) {
                        resolve(result.data);
                    } else {
                        reject(new Error(result.error));
                    }
                });
            });
        };
        """
        
        let script = WKUserScript(source: jsAPI, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(script)
    }

    private func handleCreateDirectory(body: [String: Any], webView: WKWebView?) {
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

    private func handleRenameItem(body: [String: Any], webView: WKWebView?) {
        guard let oldRel = body["oldPath"] as? String, !oldRel.isEmpty,
              let newRel = body["newPath"] as? String, !newRel.isEmpty else {
            sendErrorResponse(to: webView, error: "Invalid parameters for renameItem")
            return
        }

        let fm = FileManager.default

        // First resolve a tentative URL for the old path to detect whether it's a directory
        guard let tentativeOld = resolveURL(for: oldRel, isDirectory: false) else {
            sendErrorResponse(to: webView, error: "Invalid oldPath")
            return
        }

        var isDir: ObjCBool = false
        if !fm.fileExists(atPath: tentativeOld.path, isDirectory: &isDir) {
            // If the item doesn't exist, still attempt with false (treat as file)
            isDir = false
        }

        // Re-resolve URLs using the detected type for better path semantics
        guard let oldURL = resolveURL(for: oldRel, isDirectory: isDir.boolValue),
              let newURL = resolveURL(for: newRel, isDirectory: isDir.boolValue) else {
            sendErrorResponse(to: webView, error: "Invalid parameters for renameItem")
            return
        }

        do {
            // Create parent directories for destination only when they are not the item itself
            let parent = newURL.deletingLastPathComponent()
            if parent.path != oldURL.path {
                try fm.createDirectory(at: parent, withIntermediateDirectories: true)
            }

            // If destination exists, try to find a unique name by appending a numeric suffix
            var finalURL = newURL
            if fm.fileExists(atPath: newURL.path) {
                let name = newURL.deletingPathExtension().lastPathComponent
                let ext = newURL.pathExtension
                var idx = 2
                while true {
                    let candidate = parent.appendingPathComponent(ext.isEmpty ? "\(name) \(idx)" : "\(name) \(idx).\(ext)")
                    if !fm.fileExists(atPath: candidate.path) { finalURL = candidate; break }
                    idx += 1; if idx > 500 { break }
                }
            }

            // Use NSFileCoordinator to perform a coordinated move to avoid races with the sync subsystem
            var coordError: NSError?
            var moveError: NSError?
            let coordinator = NSFileCoordinator(filePresenter: nil)
            coordinator.coordinate(writingItemAt: oldURL, options: [], writingItemAt: finalURL, options: [], error: &coordError) { coordinatedOld, coordinatedNew in
                do {
                    try fm.moveItem(at: coordinatedOld, to: coordinatedNew)
                } catch {
                    // Capture move error separately to avoid overlapping access with coordError inout
                    moveError = error as NSError
                }
            }
            // Prefer moveError if present
            if let m = moveError { coordError = m }
            if let err = coordError {
                throw err
            }
            // Inform sync coordinator about the move to avoid tombstone/resurrection races
            FileSyncCoordinator.shared.recordMove(oldURL: oldURL, newURL: finalURL)
            sendSuccessResponse(to: webView, data: ["message": "Renamed"]) 
            FileSyncCoordinator.shared.syncAll(force: true)
        } catch {
            sendErrorResponse(to: webView, error: "Failed to rename: \(error.localizedDescription)")
        }
    }

    // Copy one or many files/folders into a destination folder within the same storage
    private func handleCopyFiles(body: [String: Any], webView: WKWebView?) {
        guard let destFolder = body["destFolder"] as? String,
              let sources = body["sources"] as? [String], !sources.isEmpty,
              let destURL = resolveURL(for: destFolder, isDirectory: true) else {
            sendErrorResponse(to: webView, error: "Invalid copy parameters")
            return
        }
        do { try FileManager.default.createDirectory(at: destURL, withIntermediateDirectories: true) } catch { /* ignore */ }

        func uniqueURL(for baseURL: URL) -> URL {
            let fm = FileManager.default
            if !fm.fileExists(atPath: baseURL.path) { return baseURL }
            let name = baseURL.deletingPathExtension().lastPathComponent
            let ext = baseURL.pathExtension
            var idx = 2
            while true {
                let newName = "\(name) copy \(idx)"
                let candidate = baseURL.deletingLastPathComponent().appendingPathComponent(ext.isEmpty ? newName : "\(newName).\(ext)")
                if !fm.fileExists(atPath: candidate.path) { return candidate }
                idx += 1
                if idx > 500 { return baseURL } // fallback
            }
        }

        var results: [String] = []
        for rel in sources {
            guard let srcURL = resolveURL(for: rel, isDirectory: false) else { continue }
            let destBase = destURL.appendingPathComponent(srcURL.lastPathComponent)
            let finalURL = uniqueURL(for: destBase)
            do {
                try FileManager.default.copyItem(at: srcURL, to: finalURL)
                let relPath = (destFolder == "." || destFolder == "./") ? finalURL.lastPathComponent : destFolder.trimmingCharacters(in: CharacterSet(charactersIn: "/")).appending("/" + finalURL.lastPathComponent)
                results.append(relPath)
            } catch {
                // Skip failing item; continue with others
            }
        }
        FileSyncCoordinator.shared.syncAll(force: true)
        if results.isEmpty {
            sendErrorResponse(to: webView, error: "Copy failed for all sources")
        } else {
            sendSuccessResponse(to: webView, data: ["copied": results])
        }
    }

    // Attempt to make a ubiquitous file local; no-op for local/App Group files
    private func handleEnsureLocal(body: [String: Any], webView: WKWebView?) {
        guard let relPath = body["path"] as? String, !relPath.isEmpty else {
            sendErrorResponse(to: webView, error: "Invalid path for ensureLocal"); return
        }
        guard let fileURL = resolveURL(for: relPath, isDirectory: false) else {
            sendSuccessResponse(to: webView, data: ["message":"Invalid path, assuming local"]) ; return
        }
        DispatchQueue.global(qos: .utility).async {
            do {
                let keys: Set<URLResourceKey> = [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey]
                let values = try fileURL.resourceValues(forKeys: keys)
                let isCloud = values.isUbiquitousItem ?? false
                if !isCloud {
                    DispatchQueue.main.async { self.sendSuccessResponse(to: webView, data: ["message":"Not ubiquitous"]) }
                    return
                }
                // Try to start download
                do { try FileManager.default.startDownloadingUbiquitousItem(at: fileURL) } catch { /* ignore */ }
                // Poll a little for availability; exit quickly
                let deadline = Date().addingTimeInterval(3.0)
                while Date() < deadline {
                    if let st = try? fileURL.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]).ubiquitousItemDownloadingStatus,
                       st == .current { break }
                    Thread.sleep(forTimeInterval: 0.1)
                }
                DispatchQueue.main.async { self.sendSuccessResponse(to: webView, data: ["message":"ensureLocal attempted"]) }
            } catch {
                DispatchQueue.main.async { self.sendSuccessResponse(to: webView, data: ["message":"ensureLocal fallback", "error": error.localizedDescription]) }
            }
        }
    }
    
    // Méthode helper pour trouver le view controller parent d'une WebView
    // Compatible avec les extensions AUv3
    private func findViewController(from view: UIView) -> UIViewController? {
        var responder: UIResponder? = view
        while responder != nil {
            if let viewController = responder as? UIViewController {
                return viewController
            }
            responder = responder?.next
        }
        return nil
    }
    
    private func handleSaveFileWithDocumentPicker(body: [String: Any], webView: WKWebView?) {
        guard let fileName = body["fileName"] as? String,
              let dataString = body["data"] as? String,
              let data = dataString.data(using: .utf8),
              let webView = webView else {
            sendErrorResponse(to: webView, error: "Invalid parameters for Document Picker")
            return
        }
        // Trouver le view controller pour présenter le Document Picker
        guard let viewController = findViewController(from: webView) else {
            sendErrorResponse(to: webView, error: "Cannot find view controller for Document Picker")
            return
        }
        iCloudFileManager.shared.saveFileWithDocumentPicker(
            data: data,
            fileName: fileName,
            from: viewController
        ) { [weak self] success, error in
            guard self != nil else { return }
            DispatchQueue.main.async {
                if success {
                    // Notifier JavaScript du succès
                    let js = "if (window.documentPickerResult) window.documentPickerResult(true, null);"
                    self?.dispatchJS(js, label: "filesystem.documentPicker", webView: webView)
                } else {
                    let errorMessage = error?.localizedDescription ?? "Unknown error"
                    // Notifier JavaScript de l'erreur
                    let js = "if (window.documentPickerResult) window.documentPickerResult(false, '\(errorMessage)');"
                    self?.dispatchJS(js, label: "filesystem.documentPicker", webView: webView)
                }
            }
        }
    }

    private func handleLoadFilesWithDocumentPicker(body: [String: Any], webView: WKWebView?) {
    guard let webView = webView else { sendErrorResponse(to: webView, error: "Invalid webView"); return }
        let fileTypes = body["fileTypes"] as? [String] ?? ["atome","json","m4a","mp3","wav"]
    guard let viewController = findViewController(from: webView) else { sendErrorResponse(to: webView, error: "Cannot find view controller"); return }
        iCloudFileManager.shared.loadFilesWithDocumentPicker(fileTypes: fileTypes, from: viewController) { [weak self] success, results, error in
            guard self != nil else { return }
            DispatchQueue.main.async {
                if success, let results = results {
                    // Convertir en tableau d'objets {name, content(base64)} pour ne pas casser JSON
                    let mapped: [[String:Any]] = results.map { (name,data) in ["name":name, "base64":data.base64EncodedString()] }
                    self?.sendSuccessResponse(to: webView, data: ["files": mapped])
                } else {
                    self?.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Unknown error")
                }
            }
        }
    }
    
    private func handleSaveProjectInternal(body: [String: Any], webView: WKWebView?) {
        guard let fileName = body["fileName"] as? String, let dataString = body["data"] as? String, let requestId = body["requestId"] as? Int else { return }
        guard let storageURL = iCloudFileManager.shared.getCurrentStorageURL() else {
            sendBridgeResult(to: webView, payload: ["action":"saveProjectInternalResult","requestId":requestId,"success":false,"error":"No storage URL"]) ; return }
        let projectsURL = storageURL.appendingPathComponent("Projects", isDirectory: true)
        try? FileManager.default.createDirectory(at: projectsURL, withIntermediateDirectories: true)
        let fileURL = projectsURL.appendingPathComponent(fileName)
        let data = Data(dataString.utf8)
        do {
            try data.write(to: fileURL, options: .atomic)
            let relPath = "Projects/" + fileName
            sendBridgeResult(to: webView, payload: ["action":"saveProjectInternalResult","requestId":requestId,"success":true,"fileName":fileName,"path":relPath])
        } catch {
            sendBridgeResult(to: webView, payload: ["action":"saveProjectInternalResult","requestId":requestId,"success":false,"error":error.localizedDescription])
        }
    }

    private func handleCopyToIOSLocal(body: [String: Any], webView: WKWebView?) {
        guard let webView = webView else { return }
        let requestedDestPath = (body["requestedDestPath"] as? String) ?? "./"
        let fileTypes = body["fileTypes"] as? [String] ?? ["m4a","mp3","wav","atome","json"]
        guard let vc = findViewController(from: webView) else { sendErrorResponse(to: webView, error: "No VC"); return }
    iCloudFileManager.shared.importFileToRelativePath(fileTypes: fileTypes, requestedDestPath: requestedDestPath, from: vc) { [weak self] success, relPath, error in
            DispatchQueue.main.async {
                if success, let relPath = relPath {
            // Return both a single 'path' and an array 'paths' for compatibility
            self?.sendSuccessResponse(to: webView, data: ["path": relPath, "paths": [relPath]])
                } else {
                    self?.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Import failed")
                }
            }
        }
    }

    private func handleCopyMultipleToIOSLocal(body: [String: Any], webView: WKWebView?) {
        guard let webView = webView else { return }
        let requestedDestPath = (body["requestedDestPath"] as? String) ?? "./"
        let fileTypes = body["fileTypes"] as? [String] ?? ["m4a","mp3","wav","atome","json"]
        guard let vc = findViewController(from: webView) else { sendErrorResponse(to: webView, error: "No VC"); return }
        iCloudFileManager.shared.importFilesToRelativeFolder(fileTypes: fileTypes, requestedDestPath: requestedDestPath, from: vc) { [weak self] success, relPaths, error in
            DispatchQueue.main.async {
                if success, let relPaths = relPaths {
                    self?.sendSuccessResponse(to: webView, data: ["paths": relPaths])
                } else {
                    self?.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Import failed")
                }
            }
        }
    }

    private func sendBridgeResult(to webView: WKWebView?, payload: [String: Any]) {
        guard let webView = webView else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.AUv3API && AUv3API._receiveFromSwift(\(json));"
        dispatchJS(js, label: "filesystem.bridge", webView: webView)
    }
}
