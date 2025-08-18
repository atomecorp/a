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
        case "getStorageInfo":
            handleGetStorageInfo(webView: message.webView)
        case "showStorageSettings":
            handleShowStorageSettings()
        case "saveFileWithDocumentPicker":
            handleSaveFileWithDocumentPicker(body: body, webView: message.webView)
        case "loadFileWithDocumentPicker":
            handleLoadFileWithDocumentPicker(body: body, webView: message.webView)
        case "loadFilesWithDocumentPicker":
            handleLoadFilesWithDocumentPicker(body: body, webView: message.webView)
        case "saveProjectInternal":
            handleSaveProjectInternal(body: body, webView: message.webView)
        case "copyToIOSLocal":
            handleCopyToIOSLocal(body: body, webView: message.webView)
        case "copyMultipleToIOSLocal":
            handleCopyMultipleToIOSLocal(body: body, webView: message.webView)
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
                print("💾 handleSaveFile: décodage base64 (")
            } else {
                print("⚠️ handleSaveFile: échec décodage base64, sauvegarde en UTF-8 brut")
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
        print("📂 SWIFT:listFiles folder/path=\(folder) requestId=\(String(describing: requestId))")
        if folder.isEmpty { sendErrorResponse(to: webView, error: "Invalid folder/path parameter"); return }
        guard let storageURL = iCloudFileManager.shared.getCurrentStorageURL() else { sendErrorResponse(to: webView, error: "Storage not available"); return }
        let folderURL = storageURL.appendingPathComponent(folder, isDirectory: true)
        print("📂 SWIFT:listFiles storageURL=\(storageURL.path) folderURL=\(folderURL.path)")
        do {
            let fileURLs = try FileManager.default.contentsOfDirectory(at: folderURL, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey], options: .skipsHiddenFiles)
            let files = fileURLs.compactMap { url -> [String: Any]? in
                guard let resourceValues = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey]) else { return nil }
                let isFile = resourceValues.isRegularFile ?? false
                let isDirectory = resourceValues.isDirectory ?? false
                
                if isFile || isDirectory {
                    print("📄 SWIFT:listFiles found \(isDirectory ? "directory" : "file")=\(url.lastPathComponent)")
                    return [
                        "name": url.lastPathComponent,
                        "isDirectory": isDirectory,
                        "size": resourceValues.fileSize ?? 0,
                        "modified": resourceValues.contentModificationDate?.timeIntervalSince1970 ?? 0
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
            print("❌ SWIFT:listFiles error=\(error.localizedDescription)")
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
        
        guard let storageURL = iCloudFileManager.shared.getCurrentStorageURL() else {
            sendErrorResponse(to: webView, error: "Storage not available")
            return
        }
        
        let fileURL = storageURL.appendingPathComponent(path)
        
        do {
            try FileManager.default.removeItem(at: fileURL)
            sendSuccessResponse(to: webView, data: ["message": "File deleted successfully"])
            // Immediate sync to propagate tombstone
            FileSyncCoordinator.shared.syncAll(force: true)
        } catch {
            sendErrorResponse(to: webView, error: "Failed to delete file: \(error.localizedDescription)")
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
                print("❌ Impossible de trouver le view controller pour afficher les paramètres")
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
            webView.evaluateJavaScript(js)
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
        webView.evaluateJavaScript(js)
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
        print("🔥 SWIFT: handleSaveFileWithDocumentPicker appelé")
        print("🔥 SWIFT: body = \(body)")
        
        guard let fileName = body["fileName"] as? String,
              let dataString = body["data"] as? String,
              let data = dataString.data(using: .utf8),
              let webView = webView else {
            print("❌ SWIFT: Paramètres invalides pour Document Picker")
            sendErrorResponse(to: webView, error: "Invalid parameters for Document Picker")
            return
        }
        
        print("🔥 SWIFT: Paramètres OK - fileName: \(fileName), data.count: \(data.count)")
        
        // Trouver le view controller pour présenter le Document Picker
        guard let viewController = findViewController(from: webView) else {
            print("❌ SWIFT: Cannot find view controller for Document Picker")
            sendErrorResponse(to: webView, error: "Cannot find view controller for Document Picker")
            return
        }
        
        print("� SWIFT: View controller trouvé: \(type(of: viewController))")
        print("�📄 Sauvegarde avec Document Picker: \(fileName)")
        
        iCloudFileManager.shared.saveFileWithDocumentPicker(
            data: data,
            fileName: fileName,
            from: viewController
        ) { [weak self] success, error in
            guard self != nil else { return }
            print("🔥 SWIFT: Callback Document Picker reçu - success: \(success), error: \(String(describing: error))")
            DispatchQueue.main.async {
                if success {
                    print("✅ SWIFT: Notifying JavaScript of success")
                    // Notifier JavaScript du succès
                    let js = "if (window.documentPickerResult) window.documentPickerResult(true, null);"
                    webView.evaluateJavaScript(js) { (result, error) in
                        if let error = error {
                            print("❌ SWIFT: Erreur JavaScript success: \(error)")
                        } else {
                            print("✅ SWIFT: JavaScript success notifié")
                        }
                    }
                } else {
                    let errorMessage = error?.localizedDescription ?? "Unknown error"
                    print("❌ SWIFT: Notifying JavaScript of error: \(errorMessage)")
                    // Notifier JavaScript de l'erreur
                    let js = "if (window.documentPickerResult) window.documentPickerResult(false, '\(errorMessage)');"
                    webView.evaluateJavaScript(js) { (result, error) in
                        if let error = error {
                            print("❌ SWIFT: Erreur JavaScript error: \(error)")
                        } else {
                            print("✅ SWIFT: JavaScript error notifié")
                        }
                    }
                }
            }
        }
        print("🔥 SWIFT: Appel à saveFileWithDocumentPicker terminé")
    }
    
    private func handleLoadFileWithDocumentPicker(body: [String: Any], webView: WKWebView?) {
        print("🔥 SWIFT: handleLoadFileWithDocumentPicker appelé")
        print("🔥 SWIFT: body = \(body)")
        
        guard let webView = webView else {
            print("❌ SWIFT: WebView invalide pour Document Picker Load")
            sendErrorResponse(to: webView, error: "Invalid webView for Document Picker Load")
            return
        }
        
        let fileTypes = body["fileTypes"] as? [String] ?? ["atome", "json"]
        print("🔥 SWIFT: Types de fichiers acceptés: \(fileTypes)")
        
        // Trouver le view controller pour présenter le Document Picker
        guard let viewController = findViewController(from: webView) else {
            print("❌ SWIFT: Cannot find view controller for Document Picker Load")
            sendErrorResponse(to: webView, error: "Cannot find view controller for Document Picker Load")
            return
        }
        
        print("📂 SWIFT: View controller trouvé: \(type(of: viewController))")
        print("📂 Chargement avec Document Picker pour les types: \(fileTypes)")
        
        iCloudFileManager.shared.loadFileWithDocumentPicker(
            fileTypes: fileTypes,
            from: viewController
        ) { [weak self] success, data, fileName, error in
            guard self != nil else { return }
            print("🔥 SWIFT: Callback Document Picker Load reçu - success: \(success), fileName: \(fileName ?? "nil"), error: \(String(describing: error))")
            DispatchQueue.main.async {
                if success, let data = data, let content = String(data: data, encoding: .utf8) {
                    print("✅ SWIFT: Notifying JavaScript of load success")
                    // Échapper les caractères spéciaux pour JavaScript
                    let escapedContent = content.replacingOccurrences(of: "\\", with: "\\\\")
                                              .replacingOccurrences(of: "'", with: "\\'")
                                              .replacingOccurrences(of: "\n", with: "\\n")
                                              .replacingOccurrences(of: "\r", with: "\\r")
                    
                    // Notifier JavaScript du succès avec les données
                    let js = "if (window.documentPickerLoadResult) window.documentPickerLoadResult(true, '\(escapedContent)', null);"
                    webView.evaluateJavaScript(js) { (result, error) in
                        if let error = error {
                            print("❌ SWIFT: Erreur JavaScript load success: \(error)")
                        } else {
                            print("✅ SWIFT: JavaScript load success notifié")
                        }
                    }
                } else {
                    let errorMessage = error?.localizedDescription ?? "Unknown error or no file selected"
                    print("❌ SWIFT: Notifying JavaScript of load error: \(errorMessage)")
                    // Notifier JavaScript de l'erreur
                    let js = "if (window.documentPickerLoadResult) window.documentPickerLoadResult(false, null, '\(errorMessage)');"
                    webView.evaluateJavaScript(js) { (result, error) in
                        if let error = error {
                            print("❌ SWIFT: Erreur JavaScript load error: \(error)")
                        } else {
                            print("✅ SWIFT: JavaScript load error notifié")
                        }
                    }
                }
            }
        }
        print("🔥 SWIFT: Appel à loadFileWithDocumentPicker terminé")
    }

    private func handleLoadFilesWithDocumentPicker(body: [String: Any], webView: WKWebView?) {
        print("🔥 SWIFT: handleLoadFilesWithDocumentPicker (multiple) appelé")
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
            print("❌ SWIFT:saveProjectInternal no storage URL")
            sendBridgeResult(to: webView, payload: ["action":"saveProjectInternalResult","requestId":requestId,"success":false,"error":"No storage URL"]) ; return }
        let projectsURL = storageURL.appendingPathComponent("Projects", isDirectory: true)
        try? FileManager.default.createDirectory(at: projectsURL, withIntermediateDirectories: true)
        let fileURL = projectsURL.appendingPathComponent(fileName)
        print("💾 SWIFT:saveProjectInternal writing file=\(fileURL.path)")
        let data = Data(dataString.utf8)
        do {
            try data.write(to: fileURL, options: .atomic)
            let relPath = "Projects/" + fileName
            print("✅ SWIFT:saveProjectInternal success relPath=\(relPath)")
            sendBridgeResult(to: webView, payload: ["action":"saveProjectInternalResult","requestId":requestId,"success":true,"fileName":fileName,"path":relPath])
        } catch {
            print("❌ SWIFT:saveProjectInternal error=\(error.localizedDescription)")
            sendBridgeResult(to: webView, payload: ["action":"saveProjectInternalResult","requestId":requestId,"success":false,"error":error.localizedDescription])
        }
    }

    private func handleCopyToIOSLocal(body: [String: Any], webView: WKWebView?) {
        print("📥 SWIFT: handleCopyToIOSLocal body=\(body)")
        guard let webView = webView else { return }
        let requestedDestPath = (body["requestedDestPath"] as? String) ?? "./"
        let fileTypes = body["fileTypes"] as? [String] ?? ["m4a","mp3","wav","atome","json"]
        guard let vc = findViewController(from: webView) else { sendErrorResponse(to: webView, error: "No VC"); return }
        iCloudFileManager.shared.importFileToRelativePath(fileTypes: fileTypes, requestedDestPath: requestedDestPath, from: vc) { [weak self] success, relPath, error in
            DispatchQueue.main.async {
                if success, let relPath = relPath {
                    self?.sendSuccessResponse(to: webView, data: ["path": relPath])
                } else {
                    self?.sendErrorResponse(to: webView, error: error?.localizedDescription ?? "Import failed")
                }
            }
        }
    }

    private func handleCopyMultipleToIOSLocal(body: [String: Any], webView: WKWebView?) {
        print("📥 SWIFT: handleCopyMultipleToIOSLocal body=\(body)")
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
        webView.evaluateJavaScript(js)
    }
}
