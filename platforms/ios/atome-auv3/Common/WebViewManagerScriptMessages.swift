import Foundation
import WebKit
import OSLog
import AudioToolbox

extension WebViewManager {
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
                // Quick path: native audio param messages { type:'param', id:'gain|play|position', value:Number }
                if let t = body["type"] as? String, t == "param" {
                    let id = (body["id"] as? String) ?? ""
                    let value: Float = {
                        if let n = body["value"] as? NSNumber { return n.floatValue }
                        if let d = body["value"] as? Double { return Float(d) }
                        if let f = body["value"] as? Float { return f }
                        if let s = body["value"] as? String, let d = Double(s) { return Float(d) }
                        return 0
                    }()
                    if let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
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
                if let cmd = body["debug"] as? String, let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
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
                        if let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
                            if action == "record_start" {
                                let fileName = (body["fileName"] as? String) ?? "mic.wav"
                                let source = (body["source"] as? String) ?? "mic"
                                let sampleRate = (body["sampleRate"] as? NSNumber)?.doubleValue
                                let channels = (body["channels"] as? NSNumber)?.uint32Value
                                let userId = (body["userId"] as? String) ?? (body["user_id"] as? String)
                                let requireSampleAccurate = (body["requireSampleAccurate"] as? Bool)
                                    ?? (body["require_sample_accurate"] as? Bool)
                                    ?? false
                                let sampleRateText = sampleRate.map { String($0) } ?? "<nil>"
                                let channelsText = channels.map { String($0) } ?? "<nil>"
                                print("[AUV3_RECORD_BRIDGE] record_start session=\(sessionId) file=\(fileName) source=\(source) sampleRate=\(sampleRateText) channels=\(channelsText) exact=\(requireSampleAccurate)")
                                au.recordStart(sessionId: sessionId,
                                               fileName: fileName,
                                               source: source,
                                               sampleRate: sampleRate,
                                               channels: channels,
                                               userId: userId,
                                               requireSampleAccurate: requireSampleAccurate)
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
                           let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
                            au.stopAudioSlot(slotId)
                        }
                        return
                    }
                    if action == "clearAuxSlots" {
                        if let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
                            au.clearAuxSlots()
                        }
                        return
                    }
                    if action == "scrubPreview" {
                        if let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
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
                    if action == "loadLocalPath" || action == "loadAndPlay" {
                        // Accept native media load messages with relativePath.
                        let autoPlay = (action == "loadAndPlay")
                        if let rel = body["relativePath"] as? String, let au = WebViewManager.hostAudioUnit as? NativeAudioUnitControl {
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
}
