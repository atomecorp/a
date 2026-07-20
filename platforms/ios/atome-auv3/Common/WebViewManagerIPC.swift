import Foundation
import WebKit
import OSLog
import QuartzCore

extension WebViewManager {
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

    static func handleNativeInvokeMessage(requestId: String,
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

    static func markPageReady() {
        guard runningInExtension else { return }
        pageReady = true
        flushPendingIPC()
    }

    static func markPageLoading() {
        guard runningInExtension else { return }
        if pageReady {
            pageReady = false
        }
    }

    static func recordInboundMessage(source: String) {
        guard runningInExtension else { return }
        if source == "swiftBridge" || source == "console" { return }
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
}
