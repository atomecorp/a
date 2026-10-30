import AVFoundation
import Foundation
import os.log

/// The watch companion's crossing on the iPhone (lots W1-W7, todo/montre_compagnon_plan_2026-10-30.md). Native code only
/// carries: the page decides and describes (eVe/domains/watch/watch_link.js). The watch's requests wait here until the page
/// takes them (an event says some are waiting); what the page sends back — the screen model, the tiles with their pictures,
/// the assistant's voice — goes to the watch through the one WCSession delegate (AppWatchSensorBridge.swift). A request for
/// the assistant says where her voice goes: the headphones on this phone when some are on, else the watch (decision 5).
final class WatchLinkInbox {
    static let shared = WatchLinkInbox()
    private static let log = Logger(subsystem: "atome", category: "WatchLink")
    private static let commands: Set<String> = ["watch_request_take", "watch_link_publish", "watch_link_catalog", "watch_link_voice"]
    private var pending: [[String: Any]] = []

    private init() {}

    static func canHandle(command: String) -> Bool { commands.contains(command) }

    /// Any queue: a request of the watch, for the page. The page starts without a window when the request launched this app.
    func received(_ request: [String: Any]) {
        DispatchQueue.main.async {
            AppPageHost.shared.start(windowless: true)
            var request = request
            if request["kind"] as? String == "assistant" { request["speaker"] = Self.headphonesOnPhone() ? "phone" : "watch" }
            self.pending.append(request)
            WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('eve:watch-request'));", label: "watch.request", priority: .high)
        }
    }

    /// Any queue: a packet of the watch's microphone (16 kHz 16-bit mono PCM), for the page's line (watch_voice.js).
    func heard(_ pcm: Data) {
        let base64 = pcm.base64EncodedString()
        DispatchQueue.main.async {
            WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('eve:watch-voice', { detail: '\(base64)' }));", label: "watch.voice", priority: .high)
        }
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "watch_request_take":
            DispatchQueue.main.async {
                let requests = self.pending
                self.pending = []
                completion(["requests": requests], nil)
            }
        case "watch_link_publish":
            guard let model = payload["model"] as? String else { return completion([:], "watch_model_required") }
            AppWatchSensorBridge.shared.publish(model: model)
            completion(["ok": true], nil)
        case "watch_link_catalog":
            guard let catalog = payload["catalog"] as? String, let version = payload["version"] as? String,
                  version.range(of: "^[0-9a-z]{1,16}$", options: .regularExpression) != nil else { return completion([:], "watch_catalog_required") }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("watch_catalog_\(version).json")
            do {
                try Data(catalog.utf8).write(to: url, options: .atomic)
                AppWatchSensorBridge.shared.sendCatalog(url, version: version)
                completion(["ok": true], nil)
            } catch {
                Self.log.error("Watch catalog not written: \(error.localizedDescription, privacy: .public)")
                completion([:], "watch_catalog_not_written")
            }
        default:
            guard let pcm = (payload["pcm"] as? String).flatMap({ Data(base64Encoded: $0) }) else { return completion([:], "watch_voice_required") }
            AppWatchSensorBridge.shared.sendVoice(pcm)
            completion(["ok": true], nil)
        }
    }

    private static func headphonesOnPhone() -> Bool {
        let worn: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .carAudio]
        return AVAudioSession.sharedInstance().currentRoute.outputs.contains { worn.contains($0.portType) }
    }
}
