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
    let log = Logger(subsystem: "atome", category: "WebViewManager")
    static var webView: WKWebView?
    static weak var audioController: AudioControllerProtocol?
    static var fileSystemBridge: FileSystemBridge?
    // NEW: MIDI controller reference injected from AudioUnitViewController
    static weak var midiController: MIDIController?
    static weak var hostAudioUnit: AUAudioUnit?
    static var nativeInvokeHandler: NativeInvokeHandler?
    static func setHostAudioUnit(_ au: AUAudioUnit?) { self.hostAudioUnit = au }
    static func setNativeInvokeHandler(_ handler: NativeInvokeHandler?) { self.nativeInvokeHandler = handler }
    static var cachedTempo: Double = 120.0
    static func updateCachedTempo(_ t: Double) { if t > 0 { cachedTempo = t } }
    static var lastPlayheadSeconds: Double = 0
    static var lastIsPlaying: Bool = false
    static func updateTransportCache(isPlaying: Bool, playheadSeconds: Double) { lastIsPlaying = isPlaying; lastPlayheadSeconds = playheadSeconds }
    // NEW: remember last sent transport state to avoid duplicate/unreal logs
    static var lastSentTransportPlaying: Bool? = nil
    static var lastSentTransportPosition: Double = -1

    // Timers for streaming (host time & transport)
    static var hostTimeTimer: Timer?
    static var hostStateTimer: Timer?
    static var hostTimeStreamActiveFlag: Bool = false
    public static func isHostTimeStreamActive() -> Bool { return hostTimeStreamActiveFlag }
    static var hostStateStreamActiveFlag: Bool = false
    public static func isHostTransportStreamActive() -> Bool { return hostStateStreamActiveFlag }
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
    static let throttleQueue = DispatchQueue(label: "webview.ipc.throttle", qos: .userInitiated)
    static var throttleTimestamps: [String: CFTimeInterval] = [:]
    static var throttleWorkItems: [String: DispatchWorkItem] = [:]
    static let inboundQueue = DispatchQueue(label: "webview.ipc.inbound", qos: .utility)
    static var inboundSamples: [CFTimeInterval] = []
    static var pageReady: Bool = false
    struct PendingIPC {
        let label: String
        let priority: IPCPriority
        let block: () -> Void
    }
    static var pendingIPCQueue: [PendingIPC] = []
    static let pendingIPCLimit = 120
    static var safeModeActive: Bool = false
    static var safeModeExitWork: DispatchWorkItem?
    static let inboundLimit: Int = 24

    // Deferred main page load state
    private static var mainLoadDone: Bool = false
    private static var mainLoadAttempts: Int = 0
    private static var mainLoadTimer: Timer?
    private static var storedMainURL: URL?
    static var runningInExtension: Bool = false

    // ULTRA AGGRESSIVE: Rate limiting for non-critical JS calls (preserving timecode functionality)
    static var lastMuteStateUpdate: CFTimeInterval = 0
    static var lastTestStateUpdate: CFTimeInterval = 0
    static let nonCriticalUpdateInterval: CFTimeInterval = 0.2 // ULTRA: 5 FPS for non-timecode updates (instead of 10)

    var terminateRetryCount = 0

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
                (function(){
                    if(window.__ATOME_XCODE_CONSOLE_BRIDGE__) return;
                    window.__ATOME_XCODE_CONSOLE_BRIDGE__ = true;
                    var bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.console;
                    if(!bridge || !window.console) return;
                    function stringify(value, depth) {
                        if(depth > 2) return '[depth-limit]';
                        if(value === null) return 'null';
                        if(value === undefined) return 'undefined';
                        if(value instanceof Error) return value.stack || value.message || String(value);
                        var type = typeof value;
                        if(type === 'string') return value;
                        if(type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
                        if(type === 'function') return '[function ' + (value.name || 'anonymous') + ']';
                        try {
                            return JSON.stringify(value, function(key, item) {
                                if(item instanceof Error) return item.stack || item.message || String(item);
                                if(typeof item === 'function') return '[function ' + (item.name || 'anonymous') + ']';
                                return item;
                            });
                        } catch(error) {
                            try { return String(value); } catch(_) { return '[unserializable]'; }
                        }
                    }
                    function limit(text) {
                        text = String(text || '');
                        return text.length > 4000 ? text.slice(0, 4000) + '…[truncated]' : text;
                    }
                    ['log','info','warn','error','debug'].forEach(function(level) {
                        var original = typeof window.console[level] === 'function'
                            ? window.console[level].bind(window.console)
                            : function(){};
                        window.console[level] = function() {
                            var args = Array.prototype.slice.call(arguments || []);
                            var rendered = args.slice(0, 8).map(function(item) { return limit(stringify(item, 0)); });
                            try {
                                bridge.postMessage({
                                    source: 'js_console',
                                    level: level,
                                    message: rendered.join(' '),
                                    payload: rendered
                                });
                            } catch(_) { }
                            return original.apply(window.console, args);
                        };
                    });
                })();
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
        webView.configuration.setValue(false, forKey: "allowUniversalAccessFromFileURLs")
        
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
                    } else if FeatureFlags.registerCustomScheme, let schemeURL = URL(string: "atome:///src/index.html") {
                        webView.load(URLRequest(url: schemeURL))
                    } else if let fileURL = mainURL {
                        webView.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
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
    private static func attemptMainPageLoad(isExtension _: Bool, mainURL: URL?) -> Bool {
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
        } else if FeatureFlags.registerCustomScheme {
            if let schemeURL = URL(string: "atome:///src/index.html") {
                shared.log.info("Attempt #\(mainLoadAttempts) loading entry atome:///src/index.html")
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

    static func storageModeInfo(requestId: Int) -> [String: Any] {
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

    static func stringifyConsolePayload(_ value: Any) -> String {
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

    static func formatConsoleMessage(_ body: Any) -> String {
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

    // MARK: - File System API
    
    private static func addFileSystemAPI(to webView: WKWebView) {
        fileSystemBridge = FileSystemBridge()
        fileSystemBridge?.addFileSystemAPI(to: webView)
    }
}
