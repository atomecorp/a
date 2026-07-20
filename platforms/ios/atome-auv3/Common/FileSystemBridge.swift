//
//  FileSystemBridge.swift
//  atomeAudioUnit
//
//  Created by AI Assistant on 06/08/2025.
//

import Foundation
import WebKit
import UIKit

class FileSystemBridge: NSObject, WKScriptMessageHandler {
    
    private weak var currentWebView: WKWebView?
    
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
    func resolveURL(for path: String, isDirectory: Bool = false) -> URL? {
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

    func dispatchJS(_ js: String,
                    label: String,
                    priority: WebViewManager.IPCPriority = .normal,
                    webView: WKWebView?) {
        guard let webView = webView else { return }
        WebViewManager.evaluateJS(js, label: label, priority: priority, targetWebView: webView)
    }
    
    func sendSuccessResponse(to webView: WKWebView?, data: [String: Any]) {
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
    
    func sendErrorResponse(to webView: WKWebView?, error: String) {
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
    
}
