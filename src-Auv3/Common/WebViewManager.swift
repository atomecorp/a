////
////  WebViewManager.swift
////  atome
////
////  Created by jeezs on 26/04/2022.
////

import WebKit

public class WebViewManager: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = WebViewManager()
    static var webView: WKWebView?
    static weak var audioController: AudioControllerProtocol?

    static func setupWebView(for webView: WKWebView, audioController: AudioControllerProtocol? = nil) {
        self.webView = webView
        self.audioController = audioController
        webView.navigationDelegate = WebViewManager.shared

        let scriptSource = """
        window.onerror = function(m, s, l, c, e) {
            var msg = "Error: " + m + " at " + s + ":" + l + ":" + c + (e && e.stack ? " stack: " + e.stack : "");
            try {
                window.webkit.messageHandlers.console.postMessage(msg);
            } catch(x) {
                console.warn("Error sending to Swift:", x);
            }
        };
        window.addEventListener("unhandledrejection", function(e) {
            var msg = "Unhandled Promise: " + e.reason + (e.reason && e.reason.stack ? " stack: " + e.reason.stack : "");
            try {
                window.webkit.messageHandlers.console.postMessage(msg);
            } catch(x) {
                console.warn("Error sending to Swift:", x);
            }
        });
        """

        let contentController = webView.configuration.userContentController
        let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        contentController.addUserScript(userScript)
        contentController.add(WebViewManager.shared, name: "console")
        contentController.add(WebViewManager.shared, name: "swiftBridge")

        webView.configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView.configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        
        let myProjectBundle: Bundle = Bundle.main
        if let myUrl = myProjectBundle.url(forResource: "src/index", withExtension: "html") {
            webView.loadFileURL(myUrl, allowingReadAccessTo: myUrl)
        }
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "console":
            if let messageBody = message.body as? String {
                print("WebView Log: \(messageBody)")
            }
            
        case "swiftBridge":
            if let body = message.body as? [String: Any],
               let type = body["type"] as? String,
               let data = body["data"] {
                handleSwiftBridgeMessage(type: type, data: data)
            }
            
        default:
            break
        }
    }
    
    private func handleSwiftBridgeMessage(type: String, data: Any) {
        switch type {
        case "log":
            if let message = data as? String {
                print("JS Log: \(message)")
            }
            
        case "toggleMute":
            WebViewManager.audioController?.toggleMute()
            sendMuteStateToJS()
            
        case "audioTest":
            if let testData = data as? [String: Any],
               let isPlaying = testData["isPlaying"] as? Bool,
               let frequency = testData["frequency"] as? Double {
                WebViewManager.audioController?.handleTestToneState(isPlaying: isPlaying, frequency: frequency)
                sendTestStateToJS() // AJOUT: Envoi de l'état mis à jour
            }
            
        case "updateTestFrequency":
            if let frequency = data as? Double {
                WebViewManager.audioController?.setTestFrequency(frequency)
                sendTestStateToJS() // AJOUT: Envoi de l'état mis à jour
            }
            
        case "performCalculation":
            if let numbers = data as? [Int] {
                performCalculation(numbers)
            }
            
        default:
            print("Message non géré - Type: \(type), Data: \(data)")
        }
    }
    
    // MARK: - MIDI Communication
    
    /// Send MIDI data to JavaScript
    static func sendMIDIToJS(data1: UInt8, data2: UInt8, data3: UInt8, timestamp: Double = 0) {
        let jsCode = """
        if (typeof window.midiUtilities !== 'undefined' && typeof window.midiUtilities.receiveMidiData === 'function') {
            window.midiUtilities.receiveMidiData(\(data1), \(data2), \(data3), \(timestamp));
        } else if (typeof window.Lyrix !== 'undefined' && typeof window.Lyrix.midiUtilities !== 'undefined' && typeof window.Lyrix.midiUtilities.receiveMidiData === 'function') {
            window.Lyrix.midiUtilities.receiveMidiData(\(data1), \(data2), \(data3), \(timestamp));
        } else {
            console.log('🎹 MIDI received but no handler available:', \(data1), \(data2), \(data3));
        }
        """
        
        webView?.evaluateJavaScript(jsCode) { result, error in
            if let error = error {
                print("❌ MIDI JS Error: \(error.localizedDescription)")
            }
        }
    }

    private func sendMuteStateToJS() {
        if let isMuted = WebViewManager.audioController?.isMuted {
            let state = ["muted": isMuted]
            if let jsonData = try? JSONSerialization.data(withJSONObject: state),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                WebViewManager.sendToJS(jsonString, "updateAudioState")
            }
        }
    }
    
    private func sendTestStateToJS() {
        guard let audioController = WebViewManager.audioController else { return }
        
        let state: [String: Any] = [
            "isTestActive": audioController.isTestActive,
            "frequency": audioController.currentTestFrequency
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: state),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            WebViewManager.sendToJS(jsonString, "updateTestState")
        }
    }
    
    // MARK: - Transport Data Communication
    
    public static func sendTransportDataToJS(isPlaying: Bool, playheadPosition: Double, sampleRate: Double) {
        let transportData: [String: Any] = [
            "isPlaying": isPlaying,
            "playheadPosition": playheadPosition,
            "sampleRate": sampleRate
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: transportData),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            sendToJS(jsonString, "updateTransportFromSwift")
        }
    }

    public static func sendToJS(_ message: Any, _ function: String) {
        var jsValue: String
        if let stringValue = message as? String {
             jsValue = "\"" + stringValue.replacingOccurrences(of: "\"", with: "\\\"") + "\""
        } else if let jsonData = try? JSONSerialization.data(withJSONObject: message, options: []),
                  let jsonString = String(data: jsonData, encoding: .utf8) {
             jsValue = jsonString
        } else {
             jsValue = "\(message)"
        }

        let jsCode = """
        if (typeof \(function) === 'function') {
            //console.log("\(function) is defined, calling it with:", \(jsValue));
            \(function)(\(jsValue));
        } else {
            console.error("\(function) is not defined!");
        }
        """

        webView?.evaluateJavaScript(jsCode) { result, error in
            if let error = error {
                print("JS Error (\(function)): \(error.localizedDescription)")
            }
        }
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("Page web chargée avec succès")
        WebViewManager.sendToJS("test", "creerDivRouge")
        // AJOUT: Envoyer les états initiaux après le chargement de la page
        sendMuteStateToJS()
        sendTestStateToJS()
    }
    
    private func performCalculation(_ numbers: [Int]) {
        print("Calcul avec les nombres: \(numbers)")
    }
}
