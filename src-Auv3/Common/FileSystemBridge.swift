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
        case "listFiles":
            handleListFiles(body: body, webView: message.webView)
        case "deleteFile":
            handleDeleteFile(body: body, webView: message.webView)
        case "getStorageInfo":
            handleGetStorageInfo(webView: message.webView)
        case "showStorageSettings":
            handleShowStorageSettings()
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
        
        let fileData = Data(data.utf8)
        iCloudFileManager.shared.saveFile(data: fileData, to: path) { success, error in
            DispatchQueue.main.async {
                if success {
                    self.sendSuccessResponse(to: webView, data: ["message": "File saved successfully"])
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
        guard let folder = body["folder"] as? String else {
            sendErrorResponse(to: webView, error: "Invalid folder parameter")
            return
        }
        
        guard let storageURL = iCloudFileManager.shared.getCurrentStorageURL() else {
            sendErrorResponse(to: webView, error: "Storage not available")
            return
        }
        
        let folderURL = storageURL.appendingPathComponent(folder)
        
        do {
            let fileURLs = try FileManager.default.contentsOfDirectory(at: folderURL, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey], options: .skipsHiddenFiles)
            
            let files = fileURLs.compactMap { url -> [String: Any]? in
                guard let resourceValues = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]),
                      let isFile = resourceValues.isRegularFile, isFile else {
                    return nil
                }
                
                return [
                    "name": url.lastPathComponent,
                    "size": resourceValues.fileSize ?? 0,
                    "modified": resourceValues.contentModificationDate?.timeIntervalSince1970 ?? 0
                ]
            }
            
            sendSuccessResponse(to: webView, data: ["files": files])
        } catch {
            sendErrorResponse(to: webView, error: "Failed to list files: \(error.localizedDescription)")
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
}
