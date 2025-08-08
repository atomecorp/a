////
////  WebViewManager.swift
////  atome
////
////  Created by jeezs on 26/04/2022.
////

import WebKit
import QuartzCore

public class WebViewManager: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = WebViewManager()
    static var webView: WKWebView?
    static weak var audioController: AudioControllerProtocol?
    static var fileSystemBridge: FileSystemBridge?
    // NEW: MIDI controller reference injected from AudioUnitViewController
    static weak var midiController: MIDIController?
    
    // Timers for streaming (host time & transport)
    private static var hostTimeTimer: Timer?
    private static var hostStateTimer: Timer?
    
    // ULTRA AGGRESSIVE: Rate limiting for non-critical JS calls (preserving timecode functionality)
    private static var lastMuteStateUpdate: CFTimeInterval = 0
    private static var lastTestStateUpdate: CFTimeInterval = 0
    private static let nonCriticalUpdateInterval: CFTimeInterval = 0.2 // ULTRA: 5 FPS for non-timecode updates (instead of 10)

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
        
        // Activation de l'API du système de fichiers (local storage)
        addFileSystemAPI(to: webView)
        
        // Initialiser la structure de fichiers avec iCloudFileManager
        iCloudFileManager.shared.initializeFileStructure()

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
            // 🔥 SWIFT: Début du handler swiftBridge
            print("🔥 SWIFT: swiftBridge message reçu")
            print("🔥 SWIFT: message.body type: \(type(of: message.body))")
            print("🔥 SWIFT: message.body content: \(message.body)")
            
            if let body = message.body as? [String: Any] {
                print("🔥 SWIFT: body parsé avec succès: \(body)")
                
                // Vérifier si c'est un message de système de fichiers
                if let action = body["action"] as? String {
                    print("🔥 SWIFT: action trouvée: \(action)")
                    
                    // Router vers FileSystemBridge pour les actions de fichiers
                    let fileSystemActions = ["saveFile", "loadFile", "listFiles", "deleteFile", "getStorageInfo", "showStorageSettings", "saveFileWithDocumentPicker", "loadFileWithDocumentPicker", "saveProjectInternal", "loadFileInternal"]
                    
                    if fileSystemActions.contains(action) {
                        print("🔥 SWIFT: Routage vers FileSystemBridge pour action: \(action)")
                        if let bridge = WebViewManager.fileSystemBridge {
                            print("🔥 SWIFT: FileSystemBridge disponible, envoi du message")
                            bridge.userContentController(userContentController, didReceive: message)
                        } else {
                            print("🔥 SWIFT: ❌ FileSystemBridge est nil!")
                        }
                        return
                    }
                    
                    // NEW: High-level AUv3API actions
                    if action == "sendMidi" {
                        if let bytes = body["bytes"] as? [Int] {
                            let u8 = bytes.compactMap { UInt8(exactly: $0 & 0xFF) }
                            WebViewManager.midiController?.sendRaw(bytes: u8)
                        }
                        return
                    }
                    
                    if action == "requestHostTempo" {
                        let bpm: Double = 120.0 // TODO: Implement real host tempo retrieval if needed
                        let requestId = body["requestId"] as? Int ?? -1
                        WebViewManager.sendBridgeJSON(["action":"hostTempo", "bpm": bpm, "requestId": requestId])
                        return
                    }
                    
                    if action == "startHostTimeStream" {
                        WebViewManager.startHostTimeStream(format: body["format"] as? String)
                        return
                    }
                    if action == "stopHostTimeStream" {
                        WebViewManager.stopHostTimeStream()
                        return
                    }
                    if action == "startHostStateStream" {
                        WebViewManager.startHostStateStream()
                        return
                    }
                    if action == "stopHostStateStream" {
                        WebViewManager.stopHostStateStream()
                        return
                    }
                    if action == "startMidiStream" {
                        // Incoming MIDI already forwarded via midiUtilities.* in existing code.
                        // Could add alternate forwarding path if needed.
                        return
                    }
                    if action == "stopMidiStream" {
                        return
                    }
                }
                
                // Messages audio (ancien format avec "type")
                if let type = body["type"] as? String,
                   let data = body["data"] {
                    print("🔥 SWIFT: message audio avec type: \(type)")
                    handleSwiftBridgeMessage(type: type, data: data)
                } else {
                    print("🔥 SWIFT: ❌ Format de message non reconnu")
                    print("🔥 SWIFT: Clés disponibles: \(body.keys)")
                }
            } else {
                print("🔥 SWIFT: ❌ Impossible de parser message.body en [String: Any]")
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
            
        case "audioNote":
            if let data = data as? [String: Any] {
                handleAudioCommand(command: data["command"] as? String ?? "", data: data)
            }
            
        case "noteCommand":
            if let data = data as? [String: Any] {
                handleAudioCommand(command: data["command"] as? String ?? "", data: data)
            }
            
        case "chordCommand":
            if let data = data as? [String: Any] {
                handleAudioChord(data: data)
            }
            
        case "audioBuffer":
            if let data = data as? [String: Any] {
                handleAudioBuffer(data: data)
            }
            
        case "audioChord":
            if let data = data as? [String: Any] {
                handleAudioChord(data: data)
            }        case "getSampleRate":
            sendSampleRateToJS()
            
        case "performCalculation":
            if let numbers = data as? [Int] {
                performCalculation(numbers)
            }
            
        default:
            print("Message non géré - Type: \(type), Data: \(data)")
        }
    }
    
    // MARK: - Audio Command Handlers
    
    private func handleAudioCommand(command: String, data: [String: Any]) {
        switch command {
        case "playNote":
            if let frequency = data["frequency"] as? Double,
               let note = data["note"] as? String,
               let amplitude = data["amplitude"] as? Double {
                print("🎵 JS->Swift: playNote \(note) at \(frequency)Hz")
                WebViewManager.audioController?.playNote(frequency: frequency, note: note, amplitude: Float(amplitude))
            }
            
        case "stopNote":
            if let note = data["note"] as? String {
                print("🎵 JS->Swift: stopNote \(note)")
                WebViewManager.audioController?.stopNote(note: note)
            }
            
        case "stopAll":
            print("🎵 JS->Swift: stopAll")
            WebViewManager.audioController?.stopAllAudio()
            
        default:
            print("🎵 JS->Swift: Unknown audio command: \(command)")
        }
    }
    
    private func handleAudioBuffer(data: [String: Any]) {
        guard let frequency = data["frequency"] as? Double,
              let sampleRate = data["sampleRate"] as? Double,
              let duration = data["duration"] as? Double,
              let audioDataArray = data["audioData"] as? [Double] else {
            print("❌ Invalid audioBuffer data from JavaScript")
            return
        }
        
        print("🎵 JS->Swift: audioBuffer at \(frequency)Hz (routing to AUv3 audio pipeline)")
        
        // Convert [Double] to [Float] for audio processing
        let audioData = audioDataArray.map { Float($0) }
        
        // Route JavaScript audio directly to AUv3 audio pipeline
        WebViewManager.audioController?.injectJavaScriptAudio(audioData, sampleRate: sampleRate, duration: duration)
        
        print("🔊 JS->Swift: Audio injected - \(audioData.count) samples at \(sampleRate)Hz")
    }
    
    private func handleAudioChord(data: [String: Any]) {
        if let command = data["command"] as? String {
            switch command {
            case "playChord":
                if let frequencies = data["frequencies"] as? [Double],
                   let amplitude = data["amplitude"] as? Double {
                    print("🎼 JS->Swift: playChord \(frequencies)")
                    WebViewManager.audioController?.playChord(frequencies: frequencies, amplitude: Float(amplitude))
                }
                
            case "stopChord":
                print("🎼 JS->Swift: stopChord")
                WebViewManager.audioController?.stopChord()
                
            default:
                break
            }
        }
    }
    
    private func sendSampleRateToJS() {
        // Send sample rate back to JavaScript
        let jsCode = "if (typeof window.updateSampleRate === 'function') { window.updateSampleRate(44100); }"
        Self.webView?.evaluateJavaScript(jsCode, completionHandler: nil)
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
        // Rate limiting for mute state updates (non-critical for timecode)
        let currentTime = CACurrentMediaTime()
        if currentTime - WebViewManager.lastMuteStateUpdate < WebViewManager.nonCriticalUpdateInterval {
            return
        }
        WebViewManager.lastMuteStateUpdate = currentTime
        
        if let isMuted = WebViewManager.audioController?.isMuted {
            let state = ["muted": isMuted]
            if let jsonData = try? JSONSerialization.data(withJSONObject: state),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                WebViewManager.sendToJS(jsonString, "updateAudioState")
            }
        }
    }
    
    private func sendTestStateToJS() {
        // Rate limiting for test state updates (non-critical for timecode)
        let currentTime = CACurrentMediaTime()
        if currentTime - WebViewManager.lastTestStateUpdate < WebViewManager.nonCriticalUpdateInterval {
            return
        }
        WebViewManager.lastTestStateUpdate = currentTime
        
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
        // Direct JavaScript call with proper formatting
        let jsCode = "if (typeof updateTransportFromSwift === 'function') { updateTransportFromSwift({\"isPlaying\": \(isPlaying ? "true" : "false"), \"playheadPosition\": \(Int(playheadPosition)), \"sampleRate\": \(Int(sampleRate))}); }"
        
        webView?.evaluateJavaScript(jsCode, completionHandler: nil)
    }

    public static func sendToJS(_ message: Any, _ function: String) {
        // ULTRA-AGGRESSIVE: Simplified JS execution for maximum performance
        var jsValue: String
        
        // Fast path for strings (most common case)
        if let stringValue = message as? String {
            // Skip escaping for performance - assume clean data
            jsValue = "\"\(stringValue)\""
        } else {
            // For JSON objects, pass as string and parse in JS
            jsValue = "'\(message)'"
        }

        // Minimal JS code without error checking for performance
        let jsCode = "if (typeof \(function) === 'function') { \(function)(\(jsValue)); }"

        webView?.evaluateJavaScript(jsCode, completionHandler: nil) // Skip completion handler for performance
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Silent page loading for performance
        WebViewManager.sendToJS("test", "creerDivRouge")
        // Simplified initialization
    }
    
    private func performCalculation(_ numbers: [Int]) {
        // Silent calculation for performance
    }
    
    // MARK: - File System API
    
    private static func addFileSystemAPI(to webView: WKWebView) {
        print("🔥 SWIFT: addFileSystemAPI appelée")
        fileSystemBridge = FileSystemBridge()
        print("🔥 SWIFT: FileSystemBridge créé: \(fileSystemBridge != nil)")
        fileSystemBridge?.addFileSystemAPI(to: webView)
        print("🔧 FileSystemBridge créé et API ajoutée au WebView")
    }
    
    // MARK: - Bridge JSON helper
    private static func sendBridgeJSON(_ dict: [String: Any]) {
        guard let webView = webView else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else { return }
        // Inject raw JSON object (already valid JS), matching FileSystemBridge usage
        let js = "window.AUv3API && AUv3API._receiveFromSwift(\(json));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
    
    // MARK: - Streams
    private static func startHostTimeStream(format: String?) {
        stopHostTimeStream()
        var position: Double = 0
        hostTimeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            position += 0.5
            let payload: [String: Any] = [
                "action": "hostTimeUpdate",
                "positionSeconds": position,
                "positionSamples": Int(position * 44100),
                "tempo": 120.0,
                "ppq": position * 2.0,
                "playing": true
            ]
            sendBridgeJSON(payload)
        }
    }
    private static func stopHostTimeStream() {
        hostTimeTimer?.invalidate(); hostTimeTimer = nil
    }
    private static func startHostStateStream() {
        stopHostStateStream()
        var playing = true
        var position: Double = 0
        hostStateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            position += 1.0
            playing.toggle()
            let payload: [String: Any] = [
                "action": "hostTransport",
                "playing": playing,
                "positionSeconds": position
            ]
            sendBridgeJSON(payload)
        }
    }
    private static func stopHostStateStream() {
        hostStateTimer?.invalidate(); hostStateTimer = nil
    }
}
