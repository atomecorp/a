////
////  WebViewManager.swift
////  atome
////
////  Created by jeezs on 26/04/2022.
////

import WebKit
import OSLog
import QuartzCore
import AudioToolbox

public class WebViewManager: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = WebViewManager()
    private let log = Logger(subsystem: "atome", category: "WebViewManager")
    // Share the WebContent process across WKWebViews to avoid relaunch cost
    static let sharedProcessPool = WKWebViewFactory.sharedProcessPool
    static var webView: WKWebView?
    static weak var audioController: AudioControllerProtocol?
    static var fileSystemBridge: FileSystemBridge?
    // NEW: MIDI controller reference injected from AudioUnitViewController
    static weak var midiController: MIDIController?
    static weak var hostAudioUnit: AUAudioUnit?
    static func setHostAudioUnit(_ au: AUAudioUnit?) { self.hostAudioUnit = au }
    private static var cachedTempo: Double = 120.0
    static func updateCachedTempo(_ t: Double) { if t > 0 { cachedTempo = t } }
    private static var lastPlayheadSeconds: Double = 0
    private static var lastIsPlaying: Bool = false
    static func updateTransportCache(isPlaying: Bool, playheadSeconds: Double) { lastIsPlaying = isPlaying; lastPlayheadSeconds = playheadSeconds }
    // NEW: remember last sent transport state to avoid duplicate/unreal logs
    private static var lastSentTransportPlaying: Bool? = nil
    private static var lastSentTransportPosition: Double = -1
    
    // Timers for streaming (host time & transport)
    private static var hostTimeTimer: Timer?
    private static var hostStateTimer: Timer?
    private static var hostTimeStreamActiveFlag: Bool = false
    public static func isHostTimeStreamActive() -> Bool { return hostTimeStreamActiveFlag }

    // Deferred main page load state
    private static var mainLoadDone: Bool = false
    private static var mainLoadAttempts: Int = 0
    private static var mainLoadTimer: Timer?
    private static var storedMainURL: URL?

    // ULTRA AGGRESSIVE: Rate limiting for non-critical JS calls (preserving timecode functionality)
    private static var lastMuteStateUpdate: CFTimeInterval = 0
    private static var lastTestStateUpdate: CFTimeInterval = 0
    private static let nonCriticalUpdateInterval: CFTimeInterval = 0.2 // ULTRA: 5 FPS for non-timecode updates (instead of 10)

    static func setupWebView(for webView: WKWebView, audioController: AudioControllerProtocol? = nil) {
        if FeatureFlags.mainThreadPrecondition {
            dispatchPrecondition(condition: .onQueue(.main))
        }
        self.webView = webView
        self.audioController = audioController
        // hostAudioUnit will be set later via setHostAudioUnit from AudioUnitViewController once created
        webView.navigationDelegate = WebViewManager.shared

        // Detect execution environment (App vs AUv3 extension) and log explicitly
        let isExtension: Bool = {
            let path = Bundle.main.bundlePath
            if path.hasSuffix(".appex") { return true }
            // Fallback: presence of NSExtension dictionary in Info.plist
            if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
            return false
        }()
    let execMode = isExtension ? "AUv3" : "APP"
    let poolPtr = Unmanaged.passUnretained(WKWebViewFactory.sharedProcessPool).toOpaque()
    print("[Startup] exec mode: \(execMode); shared WKProcessPool=\(poolPtr)")
    WebViewManager.shared.log.info("Setup webview; mode=\(execMode, privacy: .public) pool=\(String(describing: poolPtr), privacy: .public)")

        // Start lightweight embedded HTTP server (once) to serve audio via standard stack
        if FeatureFlags.startLocalHTTPServer {
            if LocalHTTPServer.shared.port == nil {
                LocalHTTPServer.shared.start()
            }
        }

        // If running in main app (not extension), force black backgrounds to avoid white flash
        if !isExtension {
            webView.isOpaque = false
            webView.backgroundColor = .black
            webView.scrollView.backgroundColor = .black
        }

        let scriptSource = """
                // Pre-paint background black ASAP to avoid white flash (especially on app launch)
                (function(){try{document.documentElement.style.background='#000';}catch(e){}; try{if(document.body){document.body.style.background='#000';}}catch(e){}})();
                // Ensure proper mobile viewport for full edge-to-edge content
                (function(){
                    try {
                        if(!document.querySelector('meta[name=viewport]')) {
                            var m=document.createElement('meta');
                            m.name='viewport';
                            m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
                            document.head.appendChild(m);
                        } else if(!/viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content)) {
                            document.querySelector('meta[name=viewport]').content += ',viewport-fit=cover';
                        }
                        var de=document.documentElement, b=document.body; if(de){de.style.margin='0';de.style.padding='0';de.style.height='100%';de.style.width='100%';}
                        if(b){b.style.margin='0';b.style.padding='0';b.style.height='100%';b.style.width='100%';b.style.position='relative';b.style.overflow='hidden';}
                    } catch(e){ console.log('viewport inject fail', e); }
                })();
                // Inject host environment flag early for UI logic
                try { window.__HOST_ENV = '\(isExtension ? "auv3" : "app")'; } catch(e) { }

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
        // Early helper: prefer local HTTP server if port present
        window.__atomePreferHTTP = function(id, filename){
            try {
                if(!window.__ATOME_LOCAL_HTTP_PORT__) return false;
                var el = document.getElementById(id);
                if(!el) return false;
                var url = 'http://127.0.0.1:'+window.__ATOME_LOCAL_HTTP_PORT__+'/audio/'+filename;
                console.log('[atome http] trying', url);
                el.src = url;
                return true;
            } catch(e){ console.warn('atome http helper error', e); }
            return false;
        };
                // Resize observer to keep body matched to visualViewport height (handles rotation & dynamic bars)
                (function(){
                    function applyVH(){
                        if(!document.body) return;
                        var h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
                        document.body.style.minHeight = h + 'px';
                        document.documentElement.style.minHeight = h + 'px';
                    }
                    ['resize','orientationchange'].forEach(ev=>window.addEventListener(ev, applyVH));
                    if(window.visualViewport) window.visualViewport.addEventListener('resize', applyVH);
                    setTimeout(applyVH,0); setTimeout(applyVH,150); setTimeout(applyVH,600);
                })();
        """

    let contentController = webView.configuration.userContentController
        let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        contentController.addUserScript(userScript)
    // Always capture console for diagnostics
    contentController.add(WebViewManager.shared, name: "console")
    if FeatureFlags.enableJSBridge {
        contentController.add(WebViewManager.shared, name: "swiftBridge")
        // Bridge for URL launching from Squirrel examples
        contentController.add(WebViewManager.shared, name: "squirrel.openURL")
    }
        
        // Activation de l'API du système de fichiers (local storage)
        if FeatureFlags.enableJSBridge {
            addFileSystemAPI(to: webView)
        }
        
        // Initialiser la structure de fichiers avec iCloudFileManager
        iCloudFileManager.shared.initializeFileStructure()

        webView.configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView.configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        
        // Pre-page HTML (black placeholder) to avoid any white flash before main content loads
        let placeholderHTML = """
        <!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'>
        <style>
        html,body{margin:0;padding:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#777;}
        .pulse{animation:pulse 1.6s ease-in-out infinite;opacity:.55;letter-spacing:.08em;font-size:11px;text-transform:uppercase}
        @keyframes pulse{0%,100%{opacity:.25}50%{opacity:.75}}
        </style></head><body><div class=pulse>Loading…</div></body></html>
        """
    webView.loadHTMLString(placeholderHTML, baseURL: nil)
        // Load real app shortly after to ensure WKWebView is on-screen with black already painted
        let myProjectBundle: Bundle = Bundle.main
        let mainURL = myProjectBundle.url(forResource: "src/index", withExtension: "html")
        if FeatureFlags.deferMainLoad {
            WebViewManager.storedMainURL = mainURL
            WebViewManager.mainLoadDone = false
            WebViewManager.mainLoadAttempts = 0
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
                _ = WebViewManager.attemptMainPageLoad(isExtension: isExtension, mainURL: mainURL)
            }
            WebViewManager.scheduleMainLoadRetry(isExtension: isExtension, mainURL: mainURL)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
                if webView.url == nil || webView.url?.lastPathComponent != "index.html" {
                    if FeatureFlags.loadInlineOnly {
                        let inline = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'></head><body style='margin:0;background:#000;color:#9cf;font:14px -apple-system,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>Inline OK</body></html>"
                        webView.loadHTMLString(inline, baseURL: nil)
                    } else if isExtension && FeatureFlags.registerCustomScheme, let schemeURL = URL(string: "atome:///src/index.html") {
                        webView.load(URLRequest(url: schemeURL))
                    } else if let fileURL = mainURL {
                        webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL)
                    } else if FeatureFlags.registerCustomScheme, let schemeURL = URL(string: "atome:///src/index.html") {
                        webView.load(URLRequest(url: schemeURL))
                    }
                }
            }
        }
    }

    private static func scheduleMainLoadRetry(isExtension: Bool, mainURL: URL?) {
        mainLoadTimer?.invalidate(); mainLoadTimer = nil
        mainLoadTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { _ in
            if attemptMainPageLoad(isExtension: isExtension, mainURL: mainURL) {
                mainLoadTimer?.invalidate(); mainLoadTimer = nil
            }
            if mainLoadAttempts > 50 { // ~6 seconds max
                shared.log.error("Main load retry limit reached; giving up timer")
                mainLoadTimer?.invalidate(); mainLoadTimer = nil
            }
        }
    }

    // Returns true if a load was initiated or already done
    @discardableResult
    private static func attemptMainPageLoad(isExtension: Bool, mainURL: URL?) -> Bool {
        guard let webView = webView else { return false }
        if mainLoadDone { return true }
        mainLoadAttempts += 1
        // Defer if not in window or zero-size
        let inWindow = (webView.window != nil)
        let size = webView.bounds.size
        if !inWindow || size.width <= 1 || size.height <= 1 {
            shared.log.debug("Attempt #\(mainLoadAttempts) defer: inWindow=\(inWindow) size=\(String(describing: webView.bounds.debugDescription))")
            return false
        }
        if webView.url != nil && webView.url?.lastPathComponent == "index.html" {
            mainLoadDone = true
            return true
        }
        if FeatureFlags.loadInlineOnly {
            let inline = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'></head><body style='margin:0;background:#000;color:#9cf;font:14px -apple-system,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>Inline OK</body></html>"
            shared.log.info("Attempt #\(mainLoadAttempts) loading inline-only test page")
            webView.loadHTMLString(inline, baseURL: nil)
            mainLoadDone = true
            return true
        } else if isExtension && FeatureFlags.registerCustomScheme {
            if let schemeURL = URL(string: "atome:///src/index.html") {
                shared.log.info("Attempt #\(mainLoadAttempts) loading AUv3 entry atome:///src/index.html")
                webView.load(URLRequest(url: schemeURL))
                return true
            }
        } else if let fileURL = mainURL {
            shared.log.info("Attempt #\(mainLoadAttempts) loading App entry file URL src/index.html")
            webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL)
            return true
        } else if FeatureFlags.registerCustomScheme, let schemeURL = URL(string: "atome:///src/index.html") {
            shared.log.info("Attempt #\(mainLoadAttempts) loading fallback atome:///src/index.html")
            webView.load(URLRequest(url: schemeURL))
            return true
        }
        return false
    }

    // Public trigger from controllers once view is visible and sized
    public static func triggerMainLoadNow() {
        let isExtension: Bool = {
            let path = Bundle.main.bundlePath
            if path.hasSuffix(".appex") { return true }
            if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
            return false
        }()
        _ = attemptMainPageLoad(isExtension: isExtension, mainURL: storedMainURL)
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "console":
            // Forward JS console messages to Xcode console
            if let s = message.body as? String {
                print(s)
            } else if let dict = message.body as? [String: Any] {
                print("[console]", dict)
            } else {
                print("[console] \(message.body)")
            }
            break
        case "squirrel.openURL":
            if let body = message.body as? [String: Any], let urlString = body["url"] as? String {
                // Determine if we're in an extension. If yes, this handler is typically overridden by AUv3 VC.
                let isExtension: Bool = {
                    let path = Bundle.main.bundlePath
                    if path.hasSuffix(".appex") { return true }
                    if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
                    return false
                }()
                if isExtension {
                    // AUv3 path: leave handling to AudioUnitViewController which has the extensionContext.
                    print("ℹ️ squirrel.openURL received in extension; handling is registered in AUv3 controller")
                } else {
                    // App path: call AppURLOpener via Objective-C runtime to avoid static dependency in the AUv3 target
                    var runtimeClass: AnyObject? = NSClassFromString("AppURLOpener")
                    if runtimeClass == nil {
                        // Try with module prefix if needed (Swift sometimes mangles names under module)
                        let module = Bundle.main.infoDictionary?["CFBundleName"] as? String ?? ""
                        if !module.isEmpty {
                            runtimeClass = NSClassFromString("\(module).AppURLOpener")
                        }
                    }
                    if let cls = runtimeClass {
                        let sel = Selector(("openFromJS:"))
                        if cls.responds(to: sel) {
                            _ = cls.perform(sel, with: urlString as NSString)
                        } else {
                            print("⚠️ AppURLOpener found but selector missing")
                        }
                    } else {
                        print("⚠️ AppURLOpener class not found (tried plain and module-qualified)")
                    }
                }
            } else {
                print("⚠️ squirrel.openURL invalid message body: \(message.body)")
            }
            break
        case "swiftBridge":
            if let body = message.body as? [String: Any] {
                // Quick path: iPlug-style param messages { type:'param', id:'gain|play|position', value:Number }
                if let t = body["type"] as? String, t == "param" {
                    let id = (body["id"] as? String) ?? ""
                    let value: Float = {
                        if let n = body["value"] as? NSNumber { return n.floatValue }
                        if let d = body["value"] as? Double { return Float(d) }
                        if let f = body["value"] as? Float { return f }
                        if let s = body["value"] as? String, let d = Double(s) { return Float(d) }
                        return 0
                    }()
                    if let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                        switch id {
                        case "gain": au.setMasterGain(value)
                        case "play": au.setPlayActive(value > 0.5)
                        case "position": au.setPlaybackPositionNormalized(value)
                        case "tone": au.setTestToneActive(value > 0.5)
                        case "cap": au.setDebugCaptureEnabled(value > 0.5)
                        default: break
                        }
                    }
                    return
                }
                // Debug commands
                if let cmd = body["debug"] as? String, let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                    if cmd == "dumpCapture" { au.dumpDebugCapture() }
                    return
                }
                // Vérifier si c'est un message de système de fichiers
                if let action = body["action"] as? String {
                    if action == "loadLocalPath" || (body["type"] as? String) == "iplug" {
                        // Accept either { action:'loadLocalPath', relativePath } or { type:'iplug', action:'loadLocalPath', relativePath }
                        if let rel = body["relativePath"] as? String, let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                            if let base = iCloudFileManager.shared.getCurrentStorageURL() {
                                let full = base.appendingPathComponent(rel)
                                au.loadLocalFile(full.path)
                            } else {
                                au.loadLocalFile(rel) // try raw path
                            }
                        }
                        return
                    }
                    let fileSystemActions = ["saveFile", "loadFile", "listFiles", "deleteFile", "getStorageInfo", "showStorageSettings", "saveFileWithDocumentPicker", "saveProjectInternal", "loadFileInternal"];
                    if fileSystemActions.contains(action) {
                        if let bridge = WebViewManager.fileSystemBridge {
                            bridge.userContentController(userContentController, didReceive: message)
                        }
                        return
                    }
                    if action == "purchaseProduct" || action == "restorePurchases" {
                        let requestId = body["requestId"] as? Int ?? Int(Date().timeIntervalSince1970)
                        if action == "purchaseProduct" {
                            let productId = body["productId"] as? String ?? ""
                            if #available(iOS 15.0, *) {
                                Task { await PurchaseManager.shared.purchase(id: productId, requestId: requestId) }
                            } else { LegacyPurchaseBridge.shared.purchase(productId: productId, requestId: requestId) }
                        } else {
                            if #available(iOS 15.0, *) {
                                Task { await PurchaseManager.shared.restore(requestId: requestId) }
                            } else { LegacyPurchaseBridge.shared.restore(requestId: requestId) }
                        }
                        return
                    }
                    if action == "sendMidi" {
                        if let bytes = body["bytes"] as? [Int] {
                            let u8 = bytes.compactMap { UInt8(exactly: $0 & 0xFF) }
                            WebViewManager.midiController?.sendRaw(bytes: u8)
                        }
                        return
                    }
                    if action == "requestHostTempo" {
                        var bpm: Double = 120.0
                        var source = "fallback"
                        if let au = WebViewManager.hostAudioUnit {
                            if let block = au.musicalContextBlock {
                                var currentTempo: Double = 0
                                if block(&currentTempo, nil, nil, nil, nil, nil), currentTempo > 0 {
                                    bpm = currentTempo; source = "hostBlock"
                                } else {
                                    bpm = WebViewManager.cachedTempo; source = "cached"
                                }
                            } else {
                                bpm = WebViewManager.cachedTempo; source = "cachedNoBlock"
                            }
                        } else {
                            bpm = WebViewManager.cachedTempo; source = "noAU"
                        }
                        let requestId = body["requestId"] as? Int ?? -1
                        WebViewManager.sendBridgeJSON(["action":"hostTempo", "bpm": bpm, "requestId": requestId, "source": source])
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
                        return
                    }
                    if action == "stopMidiStream" {
                        return
                    }
                }
                // Messages audio (ancien format avec "type")
                if let type = body["type"] as? String,
                   let data = body["data"] {
                    handleSwiftBridgeMessage(type: type, data: data)
                }
            }
        default:
            break
        }
    }
    
    private func handleSwiftBridgeMessage(type: String, data: Any) {
        switch type {
        case "audioBuffer_bin":
            // Optimisation : réception ArrayBuffer natif (binaire)
            if let data = data as? Data {
                let sampleCount = data.count / 4
                var floatArray = [Float](repeating: 0, count: sampleCount)
                _ = floatArray.withUnsafeMutableBytes { data.copyBytes(to: $0) }
                let sampleRate: Double = 44100
                let duration: Double = Double(sampleCount) / sampleRate
                DispatchQueue.global(qos: .userInitiated).async {
                    WebViewManager.audioController?.injectJavaScriptAudio(floatArray, sampleRate: sampleRate, duration: duration)
                }
            }
            return
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
            }
        case "getSampleRate":
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
      guard let _ = data["frequency"] as? Double,
          let sampleRate = data["sampleRate"] as? Double,
              let duration = data["duration"] as? Double,
              let audioDataArray = data["audioData"] as? [Double] else {
            return
        }
        // Convert [Double] to [Float] pour audio processing
        let audioData = audioDataArray.map { Float($0) }
        // Injection asynchrone pour ne jamais bloquer le thread principal
        DispatchQueue.global(qos: .userInitiated).async {
            WebViewManager.audioController?.injectJavaScriptAudio(audioData, sampleRate: sampleRate, duration: duration)
        }
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
        updateTransportCache(isPlaying: isPlaying, playheadSeconds: playheadPosition)
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
    // Only run full initialization on the real app page (ignore placeholder page)
    guard let last = webView.url?.lastPathComponent, last == "index.html" else { return }
    // Log geometry to detect external monitor stage/scene issues
    print("[WK] didFinish; webView.frame=\(webView.frame) bounds=\(webView.bounds)")
    log.debug("didFinish; frame=\(String(describing: webView.frame.debugDescription)) bounds=\(String(describing: webView.bounds.debugDescription))")
        // Silent page loading for performance
        WebViewManager.sendToJS("test", "creerDivRouge")
        // Simplified initialization
        if FeatureFlags.startLocalHTTPServer {
            if let p = LocalHTTPServer.shared.port {
                let js = "window.__ATOME_LOCAL_HTTP_PORT__=" + String(p) + ";"
                webView.evaluateJavaScript(js, completionHandler: nil)
                print("🌐 Injected LocalHTTPServer port: \(p). Example: http://127.0.0.1:\(p)/audio/Alive.m4a")
            }
        }
        // Inject notch information & class
        let topInset = webView.safeAreaInsets.top
        let hasNotch = UIDevice.current.userInterfaceIdiom == .phone && topInset >= 44
        let notchJS = "window.__HAS_NOTCH__=\(hasNotch ? "true" : "false");(function(){try{if(window.__HAS_NOTCH__){document.documentElement.classList.add('has-notch');}else{document.documentElement.classList.remove('has-notch');} if(window.updateSafeAreaLayout){window.updateSafeAreaLayout();}}catch(e){}})();"
        webView.evaluateJavaScript(notchJS, completionHandler: nil)
        print("notch info: hasNotch=\(hasNotch) topInset=\(topInset)")
        // Auto-restore entitlements to sync JS UI after load (App only; AUv3 can't present auth UI)
        let isExtension: Bool = Bundle.main.bundlePath.hasSuffix(".appex")
        if FeatureFlags.sendPurchaseRestoreOnDidFinish && !isExtension {
            if #available(iOS 15.0, *) {
                Task { await PurchaseManager.shared.restore(requestId: Int(Date().timeIntervalSince1970)) }
            }
        }
    }

    private var terminateRetryCount = 0
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard FeatureFlags.centralTerminationRetry else { return }
        log.error("WebContent terminated; retryCount=\(self.terminateRetryCount)")
        let backoff = pow(2.0, Double(terminateRetryCount)) * 0.2
        DispatchQueue.main.asyncAfter(deadline: .now() + backoff) { [weak self, weak webView] in
            guard let self = self, let wv = webView else { return }
            if self.terminateRetryCount >= 1 {
                self.log.error("Max retries reached; stopping reload attempts")
                return
            }
            self.terminateRetryCount += 1
            if wv.url != nil {
                self.log.info("Retry reload() after termination; backoff=\(backoff)")
                wv.reload()
            } else {
                let isExtension: Bool = {
                    let path = Bundle.main.bundlePath
                    if path.hasSuffix(".appex") { return true }
                    if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
                    return false
                }()
                if isExtension, let entry = URL(string: "atome:///src/index.html") {
                    self.log.info("Retry load atome:///src/index.html after termination; backoff=\(backoff)")
                    wv.load(URLRequest(url: entry))
                } else if let fileURL = Bundle.main.url(forResource: "src/index", withExtension: "html") {
                    self.log.info("Retry load file src/index.html after termination; backoff=\(backoff)")
                    wv.loadFileURL(fileURL, allowingReadAccessTo: fileURL)
                } else if let entry = URL(string: "atome:///src/index.html") {
                    self.log.info("Retry fallback atome:///src/index.html after termination; backoff=\(backoff)")
                    wv.load(URLRequest(url: entry))
                }
            }
        }
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
    public static func sendBridgeJSON(_ dict: [String: Any]) {
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
        hostTimeStreamActiveFlag = true
        hostTimeTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
            let isPlaying = lastIsPlaying
            let playhead = lastPlayheadSeconds
            let tempo = cachedTempo
            let payload: [String: Any] = [
                "action": "hostTimeUpdate",
                "positionSeconds": playhead,
                "positionSamples": Int(playhead * 44100.0),
                "tempo": tempo,
                "ppq": playhead * (tempo / 60.0),
                "playing": isPlaying
            ]
            sendBridgeJSON(payload)
        }
    }
    private static func stopHostTimeStream() {
        hostTimeTimer?.invalidate(); hostTimeTimer = nil
        hostTimeStreamActiveFlag = false
    }
    private static var hostStateStreamActiveFlag: Bool = false
    public static func isHostTransportStreamActive() -> Bool { return hostStateStreamActiveFlag }
    private static func startHostStateStream() {
        stopHostStateStream()
        hostStateStreamActiveFlag = true
        // Immediately emit current cached state once (real host state)
        let initialPayload: [String: Any] = [
            "action": "hostTransport",
            "playing": lastIsPlaying,
            "positionSeconds": lastPlayheadSeconds
        ]
        sendBridgeJSON(initialPayload)
        lastSentTransportPlaying = lastIsPlaying
        lastSentTransportPosition = lastPlayheadSeconds
        // Poll cached values (updated by auv3 utils) and emit only on changes
        hostStateTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
            let playing = lastIsPlaying
            let pos = lastPlayheadSeconds
            var shouldSend = false
            if lastSentTransportPlaying == nil || playing != lastSentTransportPlaying { shouldSend = true }
            // Optionally also send if position jumps significantly while stopped (e.g. user scrub) (> 0.05s)
            if !playing && abs(pos - lastSentTransportPosition) > 0.05 { shouldSend = true }
            if shouldSend {
                let payload: [String: Any] = [
                    "action": "hostTransport",
                    "playing": playing,
                    "positionSeconds": pos
                ]
                sendBridgeJSON(payload)
                lastSentTransportPlaying = playing
                lastSentTransportPosition = pos
            }
        }
    }
    private static func stopHostStateStream() {
        hostStateTimer?.invalidate(); hostStateTimer = nil
        hostStateStreamActiveFlag = false
    }
}
