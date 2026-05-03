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

public class WebViewManager: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    typealias NativeInvokeHandler = (_ command: String, _ payload: [String: Any], _ completion: @escaping ([String: Any], String?) -> Void) -> Void

    static let shared = WebViewManager()
    private let log = Logger(subsystem: "atome", category: "WebViewManager")
    static var webView: WKWebView?
    static weak var audioController: AudioControllerProtocol?
    static var fileSystemBridge: FileSystemBridge?
    // NEW: MIDI controller reference injected from AudioUnitViewController
    static weak var midiController: MIDIController?
    static weak var hostAudioUnit: AUAudioUnit?
    static var nativeInvokeHandler: NativeInvokeHandler?
    static func setHostAudioUnit(_ au: AUAudioUnit?) { self.hostAudioUnit = au }
    static func setNativeInvokeHandler(_ handler: NativeInvokeHandler?) { self.nativeInvokeHandler = handler }
    private static var cachedTempo: Double = 120.0
    static func updateCachedTempo(_ t: Double) { if t > 0 { cachedTempo = t } }
    private static var lastPlayheadSeconds: Double = 0
    private static var lastIsPlaying: Bool = false
    static func updateTransportCache(isPlaying: Bool, playheadSeconds: Double) { lastIsPlaying = isPlaying; lastPlayheadSeconds = playheadSeconds }
    // NEW: remember last sent transport state to avoid duplicate/unreal logs
    private static var lastSentTransportPlaying: Bool? = nil
    private static var lastSentTransportPosition: Double = -1

    private static func normalizedLocalMediaPath(_ rawPath: String) -> String {
        var value = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return value }

        if let url = URL(string: value), let scheme = url.scheme?.lowercased() {
            if scheme == "http" || scheme == "https" || scheme == "atome" {
                value = url.path
                if value.isEmpty, let host = url.host, !host.isEmpty {
                    value = host
                }
            } else if scheme == "file" {
                value = url.path
            }
        }

        if value.hasPrefix("file:///file/") {
            value = String(value.dropFirst("file:///file/".count))
        } else if value.hasPrefix("file:///") {
            value = String(value.dropFirst("file:///".count))
        } else if value.hasPrefix("/file/") {
            value = String(value.dropFirst("/file/".count))
        }

        while value.hasPrefix("/") {
            value = String(value.dropFirst())
        }

        if value.hasPrefix("api/recordings/") {
            return "recordings/" + String(value.dropFirst("api/recordings/".count))
        }
        if value.hasPrefix("api/uploads/") {
            return String(value.dropFirst("api/uploads/".count))
        }
        return value
    }
    
    // Timers for streaming (host time & transport)
    private static var hostTimeTimer: Timer?
    private static var hostStateTimer: Timer?
    private static var hostTimeStreamActiveFlag: Bool = false
    public static func isHostTimeStreamActive() -> Bool { return hostTimeStreamActiveFlag }
    enum IPCPriority {
        case critical
        case high
        case normal
        case low

        var baseInterval: CFTimeInterval {
            switch self {
            case .critical: return 0.08
            case .high: return 0.15
            case .normal: return 0.26
            case .low: return 0.4
            }
        }
    }
    private static let throttleQueue = DispatchQueue(label: "webview.ipc.throttle", qos: .userInitiated)
    private static var throttleTimestamps: [String: CFTimeInterval] = [:]
    private static var throttleWorkItems: [String: DispatchWorkItem] = [:]
    private static let inboundQueue = DispatchQueue(label: "webview.ipc.inbound", qos: .utility)
    private static var inboundSamples: [CFTimeInterval] = []
    private static var pageReady: Bool = false
    private struct PendingIPC {
        let label: String
        let priority: IPCPriority
        let block: () -> Void
    }
    private static var pendingIPCQueue: [PendingIPC] = []
    private static let pendingIPCLimit = 120
    private static var safeModeActive: Bool = false
    private static var safeModeExitWork: DispatchWorkItem?
    private static let inboundLimit: Int = 24

    // Deferred main page load state
    private static var mainLoadDone: Bool = false
    private static var mainLoadAttempts: Int = 0
    private static var mainLoadTimer: Timer?
    private static var storedMainURL: URL?
    private static var runningInExtension: Bool = false

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
        webView.uiDelegate = WebViewManager.shared

        // Detect execution environment (App vs AUv3 extension) and log explicitly
        let isExtension: Bool = {
            let path = Bundle.main.bundlePath
            if path.hasSuffix(".appex") { return true }
            // Fallback: presence of NSExtension dictionary in Info.plist
            if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
            return false
        }()
    WebViewManager.runningInExtension = isExtension
    if isExtension {
        markPageLoading()
        FileSyncCoordinator.shared.setWebViewReady(false)
    } else {
        pageReady = true
    }
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

        let startupLocalPort = FeatureFlags.startLocalHTTPServer ? (LocalHTTPServer.shared.port ?? 0) : 0
        let localPortBootstrap = startupLocalPort > 0
            ? """
                try {
                    window.__ATOME_LOCAL_HTTP_PORT__ = \(startupLocalPort);
                    window.ATOME_LOCAL_HTTP_PORT = \(startupLocalPort);
                    window.__LOCAL_HTTP_PORT = \(startupLocalPort);
                    window.__SQUIRREL_TAURI_LOCAL_PORT__ = \(startupLocalPort);
                } catch(e) { }
                """
            : ""
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
                \(localPortBootstrap)
                (function(){
                    if(window.__ATOME_IOS_NATIVE_INVOKE) return;
                    if(!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge)) return;
                    const nativeInvokePending = new Map();
                    var nativeInvokeSeq = 1;
                    window.__ATOME_NATIVE_INVOKE_RESOLVE = function(requestId, payload, error){
                        const key = String(requestId || '');
                        const entry = nativeInvokePending.get(key);
                        if(!entry) return;
                        nativeInvokePending.delete(key);
                        if(error){
                            entry.reject(new Error(String(error)));
                            return;
                        }
                        entry.resolve(payload);
                    };
                    window.__ATOME_IOS_NATIVE_INVOKE = function(command, payload){
                        return new Promise(function(resolve, reject){
                            const requestId = 'ios_native_invoke_' + String(nativeInvokeSeq++);
                            nativeInvokePending.set(requestId, { resolve: resolve, reject: reject });
                            try {
                                window.webkit.messageHandlers.swiftBridge.postMessage({
                                    action: 'nativeInvoke',
                                    command: String(command || ''),
                                    requestId: requestId,
                                    payload: payload || {}
                                });
                            } catch(error) {
                                nativeInvokePending.delete(requestId);
                                reject(error instanceof Error ? error : new Error(String(error)));
                            }
                        });
                    };
                })();
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
                        webView.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
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
                mainLoadDone = true
                return true
            }
        } else if let fileURL = mainURL {
            shared.log.info("Attempt #\(mainLoadAttempts) loading App entry file URL src/index.html")
            webView.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
            mainLoadDone = true
            return true
        } else if FeatureFlags.registerCustomScheme, let schemeURL = URL(string: "atome:///src/index.html") {
            shared.log.info("Attempt #\(mainLoadAttempts) loading fallback atome:///src/index.html")
            webView.load(URLRequest(url: schemeURL))
            mainLoadDone = true
            return true
        }
        return false
    }

    private static func storageModeInfo(requestId: Int) -> [String: Any] {
        let isExtension = runningInExtension
        let info: [String: Any] = [
            "action": "lyrixStorageHostInfo",
            "requestId": requestId,
            "mode": isExtension ? "auv3" : "app",
            "dataStore": isExtension ? "nonPersistent" : "default",
            "persistent": !isExtension,
            "reason": isExtension ? "AUv3 WKWebViewFactory uses WKWebsiteDataStore.nonPersistent(); recreating the view drops localStorage." : "Main app uses persistent WKWebsiteDataStore.default(), so localStorage survives reloads."
        ]
        return info
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

    private static func stringifyConsolePayload(_ value: Any) -> String {
        if let stringValue = value as? String {
            return stringValue
        }
        if JSONSerialization.isValidJSONObject(value),
           let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            return text
        }
        return String(describing: value)
    }

    private static func formatConsoleMessage(_ body: Any) -> String {
        let scope = runningInExtension ? "AUv3" : "APP"
        if let payload = body as? [String: Any] {
            let component = String(describing: payload["component"] ?? payload["source"] ?? "console")
            let level = String(describing: payload["level"] ?? "info").uppercased()
            let message = String(describing: payload["message"] ?? payload["event"] ?? "event")
            let sessionId = payload["session_id"] ?? payload["run_id"] ?? payload["suite_id"]
            let data = payload["data"] ?? payload["payload"]
            var output = "[\(scope)][\(component)][\(level)] \(message)"
            if let sessionId, !(String(describing: sessionId).isEmpty) {
                output += " session=\(sessionId)"
            }
            if let data {
                output += " data=\(stringifyConsolePayload(data))"
            }
            return output
        }
        if let payload = body as? [Any] {
            return "[\(scope)][console] \(stringifyConsolePayload(payload))"
        }
        let text = stringifyConsolePayload(body)
        if text.contains("[audio_debug]") {
            return "[\(scope)] \(text)"
        }
        return "[\(scope)][console] \(text)"
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        WebViewManager.recordInboundMessage(source: message.name)
        switch message.name {
        case "console":
            print(WebViewManager.formatConsoleMessage(message.body))
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
                    if action == "nativeInvoke" {
                        let requestId = body["requestId"] as? String ?? ""
                        let command = body["command"] as? String ?? ""
                        let payload = body["payload"] as? [String: Any] ?? [:]
                        print("[NATIVE_INVOKE] recv request=\(requestId) command=\(command) payload_keys=\(Array(payload.keys).sorted())")
                        WebViewManager.handleNativeInvokeMessage(requestId: requestId, command: command, payload: payload)
                        return
                    }
                    if action == "record_start" || action == "record_stop" {
                        let sessionId = (body["sessionId"] as? String)
                            ?? (body["session_id"] as? String)
                            ?? ""
                        if let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                            if action == "record_start" {
                                let fileName = (body["fileName"] as? String) ?? "mic.wav"
                                let source = (body["source"] as? String) ?? "mic"
                                let sampleRate = (body["sampleRate"] as? NSNumber)?.doubleValue
                                let channels = (body["channels"] as? NSNumber)?.uint32Value
                                let sampleRateText = sampleRate.map { String($0) } ?? "<nil>"
                                let channelsText = channels.map { String($0) } ?? "<nil>"
                                print("[AUV3_RECORD_BRIDGE] record_start session=\(sessionId) file=\(fileName) source=\(source) sampleRate=\(sampleRateText) channels=\(channelsText)")
                                au.recordStart(sessionId: sessionId,
                                               fileName: fileName,
                                               source: source,
                                               sampleRate: sampleRate,
                                               channels: channels)
                            } else {
                                print("[AUV3_RECORD_BRIDGE] record_stop session=\(sessionId)")
                                au.recordStop(sessionId: sessionId)
                            }
                        } else {
                            print("[AUV3_RECORD_BRIDGE] missing hostAudioUnit action=\(action) session=\(sessionId)")
                        }
                        return
                    }
                    if action == "stopJavaScriptAudio" {
                        WebViewManager.audioController?.stopJavaScriptAudio()
                        return
                    }
                    if action == "stopSlot" {
                        if let slotId = body["slotId"] as? String,
                           let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                            au.stopAudioSlot(slotId)
                        }
                        return
                    }
                    if action == "clearAuxSlots" {
                        if let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                            au.clearAuxSlots()
                        }
                        return
                    }
                    if action == "scrubPreview" {
                        if let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                            let rel = (body["relativePath"] as? String) ?? ""
                            let lookupPath = WebViewManager.normalizedLocalMediaPath(rel)
                            let positionNormalized: Float = {
                                if let n = body["positionNormalized"] as? NSNumber { return n.floatValue }
                                if let d = body["positionNormalized"] as? Double { return Float(d) }
                                if let f = body["positionNormalized"] as? Float { return f }
                                if let s = body["positionNormalized"] as? String, let d = Double(s) { return Float(d) }
                                return 0
                            }()
                            let durationSeconds: Double = {
                                if let n = body["durationSeconds"] as? NSNumber { return n.doubleValue }
                                if let d = body["durationSeconds"] as? Double { return d }
                                if let f = body["durationSeconds"] as? Float { return Double(f) }
                                if let s = body["durationSeconds"] as? String, let d = Double(s) { return d }
                                return 0.12
                            }()
                            var resolvedPath: String? = nil
                            if let sanitized = SandboxPathValidator.sanitizedRelativePath(lookupPath) {
                                let fm = FileManager.default
                                let candidates = SandboxPathValidator.allowedRoots().map { root -> URL in
                                    sanitized.isEmpty ? root : root.appendingPathComponent(sanitized)
                                }
                                resolvedPath = candidates.first(where: { fm.fileExists(atPath: $0.path) })?.path
                            }
                            if resolvedPath == nil {
                                let fileName = (lookupPath as NSString).lastPathComponent
                                if !fileName.isEmpty, let root = iCloudFileManager.shared.getCurrentStorageURL() {
                                    let fm = FileManager.default
                                    let rootCandidates = [
                                        root.appendingPathComponent("recordings/\(fileName)"),
                                        root.appendingPathComponent("Recordings/\(fileName)"),
                                        root.appendingPathComponent("downloads/\(fileName)"),
                                        root.appendingPathComponent("Downloads/\(fileName)")
                                    ]
                                    if let candidate = rootCandidates.first(where: { fm.fileExists(atPath: $0.path) }) {
                                        resolvedPath = candidate.path
                                    }
                                    let folderHints = ["Downloads", "downloads", "Recordings", "recordings"]
                                    if let sanitizedUsers = SandboxPathValidator.sanitizedRelativePath("data/users") {
                                        let usersURL = root.appendingPathComponent(sanitizedUsers, isDirectory: true)
                                        if let directories = try? fm.contentsOfDirectory(at: usersURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) {
                                            for directory in directories {
                                                for folder in folderHints {
                                                    let candidate = directory.appendingPathComponent("\(folder)/\(fileName)")
                                                    if fm.fileExists(atPath: candidate.path) {
                                                        resolvedPath = candidate.path
                                                        break
                                                    }
                                                }
                                                if resolvedPath != nil { break }
                                            }
                                        }
                                    }
                                }
                            }
                            if resolvedPath == nil, let base = iCloudFileManager.shared.getCurrentStorageURL() {
                                resolvedPath = base.appendingPathComponent(lookupPath).path
                            }
                            if let path = resolvedPath {
                                au.scrubLocalFile(path, positionNormalized: positionNormalized, durationSeconds: durationSeconds)
                            }
                        }
                        return
                    }
                    if action == "loadLocalPath" || action == "loadAndPlay" || (body["type"] as? String) == "iplug" {
                        // Accept either { action:'loadLocalPath', relativePath } or { type:'iplug', action:'loadLocalPath', relativePath }
                        let autoPlay = (action == "loadAndPlay")
                        if let rel = body["relativePath"] as? String, let au = WebViewManager.hostAudioUnit as? IPlugAUControl {
                            let startPositionNormalized: Float? = {
                                if let n = body["positionNormalized"] as? NSNumber { return n.floatValue }
                                if let d = body["positionNormalized"] as? Double { return Float(d) }
                                if let f = body["positionNormalized"] as? Float { return f }
                                if let s = body["positionNormalized"] as? String, let d = Double(s) { return Float(d) }
                                return nil
                            }()
                            // Try to resolve relative path using SandboxPathValidator (same as AudioSchemeHandler)
                            let trimmed = WebViewManager.normalizedLocalMediaPath(rel)
                            var resolved = false
                            if let sanitized = SandboxPathValidator.sanitizedRelativePath(trimmed) {
                                let fm = FileManager.default
                                let candidates = SandboxPathValidator.allowedRoots().map { root -> URL in
                                    sanitized.isEmpty ? root : root.appendingPathComponent(sanitized)
                                }
                                if let found = candidates.first(where: { fm.fileExists(atPath: $0.path) }) {
                                    au.loadLocalFile(found.path, startPositionNormalized: startPositionNormalized)
                                    resolved = true
                                    if autoPlay { au.setPlayActive(true) }
                                }
                            }
                            // Fallback: search common recording/download locations by filename.
                            if !resolved {
                                let fileName = (trimmed as NSString).lastPathComponent
                                if !fileName.isEmpty, let root = iCloudFileManager.shared.getCurrentStorageURL() {
                                    let fm = FileManager.default
                                    let rootCandidates = [
                                        root.appendingPathComponent("recordings/\(fileName)"),
                                        root.appendingPathComponent("Recordings/\(fileName)"),
                                        root.appendingPathComponent("Downloads/\(fileName)")
                                    ]
                                    if let candidate = rootCandidates.first(where: { fm.fileExists(atPath: $0.path) }) {
                                        au.loadLocalFile(candidate.path, startPositionNormalized: startPositionNormalized)
                                        resolved = true
                                        if autoPlay { au.setPlayActive(true) }
                                    }
                                    let folderHints = ["Downloads", "downloads", "Recordings", "recordings"]
                                    if let sanitizedUsers = SandboxPathValidator.sanitizedRelativePath("data/users") {
                                        let usersURL = root.appendingPathComponent(sanitizedUsers, isDirectory: true)
                                        if let directories = try? fm.contentsOfDirectory(at: usersURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) {
                                            for directory in directories {
                                                for folder in folderHints {
                                                    let candidate = directory.appendingPathComponent("\(folder)/\(fileName)")
                                                    if fm.fileExists(atPath: candidate.path) {
                                                        au.loadLocalFile(candidate.path, startPositionNormalized: startPositionNormalized)
                                                        resolved = true
                                                        if autoPlay { au.setPlayActive(true) }
                                                        break
                                                    }
                                                }
                                                if resolved { break }
                                            }
                                        }
                                    }
                                }
                            }
                            if !resolved {
                                // Fallback: try iCloud base path
                                if let base = iCloudFileManager.shared.getCurrentStorageURL() {
                                    let full = base.appendingPathComponent(trimmed)
                                    au.loadLocalFile(full.path, startPositionNormalized: startPositionNormalized)
                                } else {
                                    au.loadLocalFile(trimmed, startPositionNormalized: startPositionNormalized) // try normalized path
                                }
                                if autoPlay { au.setPlayActive(true) }
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
                    if action == "lyrixStorageIntegrityReport" {
                        if FeatureFlags.verboseLyrixStorageLogs {
                            if let payload = body["payload"] as? [String: Any] {
                                let payloadDescription = String(describing: payload)
                                WebViewManager.shared.log.info("Lyrix storage report: \(payloadDescription, privacy: .public)")
                            } else {
                                WebViewManager.shared.log.info("Lyrix storage report ping")
                            }
                        }
                        return
                    }
                    if action == "lyrixQueryStorageMode" {
                        let requestId = body["requestId"] as? Int ?? -1
                        let info = WebViewManager.storageModeInfo(requestId: requestId)
                        WebViewManager.sendBridgeJSON(info)
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
                WebViewManager.shared.log.debug("JS Log: \(message, privacy: .public)")
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
                WebViewManager.audioController?.playNote(frequency: frequency, note: note, amplitude: Float(amplitude))
           
            }
            
        case "stopNote":
            if let note = data["note"] as? String {
                WebViewManager.audioController?.stopNote(note: note)
            }
            
        case "stopAll":
            WebViewManager.audioController?.stopAllAudio()
            
        default:
            print("🎵 JS->Swift: Unknown audio command: \(command)")
        }
    }
    
    private func handleAudioBuffer(data: [String: Any]) {
        guard let sampleRate = data["sampleRate"] as? Double,
              let duration = data["duration"] as? Double else {
            return
        }
        let audioDataArray: [Float]
        if let doubles = data["audioData"] as? [Double] {
            audioDataArray = doubles.map { Float($0) }
        } else if let numbers = data["audioData"] as? [NSNumber] {
            audioDataArray = numbers.map { $0.floatValue }
        } else {
            return
        }
        let expectedPeakFrame = (data["expectedPeakFrame"] as? NSNumber)?.intValue
            ?? (data["expected_peak_frame"] as? NSNumber)?.intValue
        WebViewManager.audioController?.setAudioDebugExpectedPeakFrame(expectedPeakFrame)
        WebViewManager.audioController?.injectJavaScriptAudio(audioDataArray, sampleRate: sampleRate, duration: duration)
    }
    
    private func handleAudioChord(data: [String: Any]) {
        if let command = data["command"] as? String {
            switch command {
            case "playChord":
                if let frequencies = data["frequencies"] as? [Double],
                   let amplitude = data["amplitude"] as? Double {
                    WebViewManager.audioController?.playChord(frequencies: frequencies, amplitude: Float(amplitude))
                }
                
            case "stopChord":
                WebViewManager.audioController?.stopChord()
                
            default:
                break
            }
        }
    }
    
    private func sendSampleRateToJS() {
        // Send sample rate back to JavaScript
        let jsCode = "if (typeof window.updateSampleRate === 'function') { window.updateSampleRate(44100); }"
        WebViewManager.evaluateJS(jsCode, label: "sampleRate", priority: .low)
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
        evaluateJS(jsCode, label: "midi", priority: .high)
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
                Self.dispatchToJS(jsonString, function: "updateAudioState", priority: .low)
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
            Self.dispatchToJS(jsonString, function: "updateTestState", priority: .low)
        }
    }
    
    // MARK: - Transport Data Communication
    
    public static func sendTransportDataToJS(isPlaying: Bool, playheadPosition: Double, sampleRate: Double) {
        let playheadSeconds = sampleRate > 0 ? playheadPosition / sampleRate : playheadPosition
        updateTransportCache(isPlaying: isPlaying, playheadSeconds: playheadSeconds)
        let jsCode = "if (typeof updateTransportFromSwift === 'function') { updateTransportFromSwift({\"isPlaying\": \(isPlaying ? "true" : "false"), \"playheadPosition\": \(Int(playheadPosition)), \"sampleRate\": \(Int(sampleRate))}); }"
        evaluateJS(jsCode, label: "transport", priority: .critical)
    }

    public static func sendToJS(_ message: Any, _ function: String) {
        dispatchToJS(message, function: function, priority: .normal)
    }

    private static func dispatchToJS(_ message: Any, function: String, priority: IPCPriority) {
        var jsValue: String
        if let stringValue = message as? String {
            // Escape quotes and backslashes to ensure valid JS string literal
            let escaped = stringValue
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
            jsValue = "\"\(escaped)\""
        } else {
            jsValue = "'\(message)'"
        }
        let jsCode = "if (typeof \(function) === 'function') { \(function)(\(jsValue)); }"
        evaluateJS(jsCode, label: "fn.\(function)", priority: priority)
    }

    // MARK: - WKUIDelegate (media capture)

    // WebKit shows its own per-origin permission prompt on top of the AVFoundation
    // system prompt when the page calls `navigator.mediaDevices.getUserMedia`.
    // We grant immediately: AVFoundation already enforces the underlying iOS
    // permission (driven by Info.plist NSCameraUsageDescription /
    // NSMicrophoneUsageDescription). Without this delegate the user would see
    // a duplicate WebKit dialog whose dismissal is decoupled from the gesture
    // that triggered the request.
    @available(iOS 15.0, *)
    public func webView(_ webView: WKWebView,
                        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                        initiatedByFrame frame: WKFrameInfo,
                        type: WKMediaCaptureType,
                        decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        WebViewManager.markPageLoading()
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // Only run full initialization on the real app page (ignore placeholder page)
    guard let last = webView.url?.lastPathComponent, last == "index.html" else { return }
    WebViewManager.markPageReady()
    log.debug("didFinish; frame=\(String(describing: webView.frame.debugDescription)) bounds=\(String(describing: webView.bounds.debugDescription))")
        // Silent page loading for performance
        WebViewManager.sendToJS("test", "creerDivRouge")
        // Simplified initialization
        if FeatureFlags.startLocalHTTPServer {
            if let p = LocalHTTPServer.shared.port {
                let js = """
                window.__ATOME_LOCAL_HTTP_PORT__=\(p);
                window.ATOME_LOCAL_HTTP_PORT=\(p);
                window.__LOCAL_HTTP_PORT=\(p);
                window.__SQUIRREL_TAURI_LOCAL_PORT__=\(p);
                try { window.dispatchEvent(new CustomEvent('local-server-ready')); } catch(e) {}
                """
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    // Inject AUv3 / App context flag early for JS platform detection
    let isExtension: Bool = Bundle.main.bundlePath.hasSuffix(".appex")
    if isExtension {
        FileSyncCoordinator.shared.setWebViewReady(true)
    }
    let auv3JS = "window.__AUV3_MODE__=" + (isExtension ? "true" : "false") + ";"
    webView.evaluateJavaScript(auv3JS, completionHandler: nil)
    // Inject notch information & class
        let topInset = webView.safeAreaInsets.top
        let hasNotch = UIDevice.current.userInterfaceIdiom == .phone && topInset >= 44
        let notchJS = "window.__HAS_NOTCH__=\(hasNotch ? "true" : "false");(function(){try{if(window.__HAS_NOTCH__){document.documentElement.classList.add('has-notch');}else{document.documentElement.classList.remove('has-notch');} if(window.updateSafeAreaLayout){window.updateSafeAreaLayout();}}catch(e){}})();"
        webView.evaluateJavaScript(notchJS, completionHandler: nil)
        // Auto-restore entitlements to sync JS UI after load (App only; AUv3 can't present auth UI)
        if FeatureFlags.sendPurchaseRestoreOnDidFinish && !isExtension {
            if #available(iOS 15.0, *) {
                Task { await PurchaseManager.shared.restore(requestId: Int(Date().timeIntervalSince1970)) }
            }
        }
    }

    private var terminateRetryCount = 0
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        WebViewManager.markPageLoading()
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
                    wv.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
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
        fileSystemBridge = FileSystemBridge()
        fileSystemBridge?.addFileSystemAPI(to: webView)
    }
    
    // MARK: - Bridge JSON helper
    private static func jsonLiteral(_ value: Any) -> String? {
        if let stringValue = value as? String {
            guard let data = try? JSONSerialization.data(withJSONObject: [stringValue]),
                  let json = String(data: data, encoding: .utf8) else { return nil }
            return String(json.dropFirst().dropLast())
        }
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return json
    }

    private static func sendNativeInvokeResponse(requestId: String,
                                                 payload: [String: Any]? = nil,
                                                 error: String? = nil) {
        print("[NATIVE_INVOKE] resolve request=\(requestId) success=\(error == nil) error=\(error ?? "<none>") payload_keys=\(Array((payload ?? [:]).keys).sorted())")
        guard let requestLiteral = jsonLiteral(requestId) else { return }
        let payloadLiteral = payload.flatMap { jsonLiteral($0) } ?? "null"
        let errorLiteral = error.flatMap { jsonLiteral($0) } ?? "null"
        let js = "window.__ATOME_NATIVE_INVOKE_RESOLVE(\(requestLiteral), \(payloadLiteral), \(errorLiteral));"
        evaluateJS(js, label: "nativeInvoke.resolve", priority: .critical)
    }

    private static func handleNativeInvokeMessage(requestId: String,
                                                  command: String,
                                                  payload: [String: Any]) {
        guard !requestId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard let handler = nativeInvokeHandler else {
            print("[NATIVE_INVOKE] no_handler request=\(requestId) command=\(command)")
            sendNativeInvokeResponse(requestId: requestId, error: "ios_app_native_invoke_handler_unavailable")
            return
        }
        print("[NATIVE_INVOKE] dispatch request=\(requestId) command=\(command) payload_keys=\(Array(payload.keys).sorted())")
        handler(command, payload) { response, error in
            sendNativeInvokeResponse(requestId: requestId, payload: response, error: error)
        }
    }

    public static func sendBridgeJSON(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else { return }
        // Inject raw JSON object (already valid JS), matching FileSystemBridge usage
        let js = "window.AUv3API && AUv3API._receiveFromSwift(\(json));"
        performIPC(label: "bridge.json", priority: .normal) {
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private static func performIPC(label: String, priority: IPCPriority, block: @escaping () -> Void) {
        if runningInExtension && !pageReady {
            enqueuePendingIPC(label: label, priority: priority, block: block)
            return
        }
        executeIPC(label: label, priority: priority, block: block)
    }

    static func evaluateJS(_ js: String,
                           label: String = "js.eval",
                           priority: IPCPriority = .normal,
                           targetWebView: WKWebView? = nil,
                           completion: ((Any?, Error?) -> Void)? = nil) {
        performIPC(label: label, priority: priority) { [weak explicitWebView = targetWebView] in
            guard let webView = explicitWebView ?? self.webView else {
                if runningInExtension {
                    shared.log.error("evaluateJS missing webView for label=\(label, privacy: .public)")
                }
                completion?(nil, nil)
                return
            }
            webView.evaluateJavaScript(js) { result, error in
                if let error = error {
                    let jsSnippet = js.count > 200 ? String(js.prefix(200)) + "..." : js
                    shared.log.error("evaluateJS failed label=\(label, privacy: .public) error=\(error.localizedDescription, privacy: .public) js=\(jsSnippet, privacy: .public)")
                }
                completion?(result, error)
            }
        }
    }

    private static func executeIPC(label: String, priority: IPCPriority, block: @escaping () -> Void) {
        if !runningInExtension {
            DispatchQueue.main.async(execute: block)
            return
        }
        throttleQueue.async {
            let now = CACurrentMediaTime()
            let minGap = priority.baseInterval * (safeModeActive ? 1.8 : 1.0)
            let last = throttleTimestamps[label] ?? 0
            let delta = now - last
            if delta >= minGap {
                throttleTimestamps[label] = now
                DispatchQueue.main.async(execute: block)
            } else {
                let delay = minGap - delta
                throttleWorkItems[label]?.cancel()
                let work = DispatchWorkItem {
                    throttleQueue.async {
                        throttleTimestamps[label] = CACurrentMediaTime()
                    }
                    DispatchQueue.main.async(execute: block)
                }
                throttleWorkItems[label] = work
                DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
            }
        }
    }

    private static func enqueuePendingIPC(label: String, priority: IPCPriority, block: @escaping () -> Void) {
        DispatchQueue.main.async {
            if pendingIPCQueue.count >= pendingIPCLimit {
                pendingIPCQueue.removeFirst(pendingIPCQueue.count - pendingIPCLimit + 1)
            }
            pendingIPCQueue.append(PendingIPC(label: label, priority: priority, block: block))
        }
    }

    private static func flushPendingIPC() {
        DispatchQueue.main.async {
            guard !pendingIPCQueue.isEmpty else { return }
            let queued = pendingIPCQueue
            pendingIPCQueue.removeAll()
            
            func processNext(_ items: [PendingIPC]) {
                guard let first = items.first else { return }
                executeIPC(label: first.label, priority: first.priority, block: first.block)
                
                // Small delay between items to prevent flooding WebKit
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                    processNext(Array(items.dropFirst()))
                }
            }
            
            processNext(queued)
        }
    }

    private static func markPageReady() {
        guard runningInExtension else { return }
        pageReady = true
        flushPendingIPC()
    }

    private static func markPageLoading() {
        guard runningInExtension else { return }
        if pageReady {
            pageReady = false
        }
    }

    private static func recordInboundMessage(source: String) {
        guard runningInExtension else { return }
        let now = CACurrentMediaTime()
        inboundQueue.async {
            inboundSamples.append(now)
            inboundSamples = inboundSamples.filter { now - $0 < 1.0 }
            if inboundSamples.count > inboundLimit {
                DispatchQueue.main.async {
                    enterGlobalSafeMode(reason: source)
                }
            } else if safeModeActive {
                DispatchQueue.main.async {
                    scheduleSafeModeExitCheck()
                }
            }
        }
    }

    private static func enterGlobalSafeMode(reason: String) {
        guard !safeModeActive else { return }
        safeModeActive = true
        FileSyncCoordinator.shared.enterSafeMode()
        shared.log.error("Entering AUv3 safe mode: \(reason)")
        notifyJSSafeMode()
        scheduleSafeModeExitCheck()
    }

    private static func scheduleSafeModeExitCheck() {
        guard safeModeActive else { return }
        safeModeExitWork?.cancel()
        let work = DispatchWorkItem {
            inboundQueue.async {
                let now = CACurrentMediaTime()
                inboundSamples = inboundSamples.filter { now - $0 < 1.0 }
                let calm = inboundSamples.count < max(1, inboundLimit / 4)
                DispatchQueue.main.async {
                    if calm {
                        exitGlobalSafeMode()
                    } else if safeModeActive {
                        scheduleSafeModeExitCheck()
                    }
                }
            }
        }
        safeModeExitWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0, execute: work)
    }

    private static func exitGlobalSafeMode() {
        guard safeModeActive else { return }
        safeModeActive = false
        safeModeExitWork?.cancel(); safeModeExitWork = nil
        inboundSamples.removeAll()
        FileSyncCoordinator.shared.exitSafeMode()
        shared.log.info("AUv3 safe mode cleared")
    }

    private static func notifyJSSafeMode() {
        performIPC(label: "safe-mode", priority: .low) {
            let js = "try{if(window.LowTrafficMode&&typeof window.LowTrafficMode.enterSafeMode==='function'){window.LowTrafficMode.enterSafeMode('swift');}window.__LYRIX_SAFE_MODE__=true;}catch(e){}"
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
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
