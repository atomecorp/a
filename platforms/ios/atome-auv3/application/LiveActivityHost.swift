import ActivityKit
import AppIntents
import Foundation
import os.log

/// eVe's Live Activity on the iPhone (lot D13, liveactivity/EveSessionActivity.swift). Native code only carries: the page
/// decides and describes (eVe/domains/live_activity/live_activity_link.js) — it starts the activity when a Sport session
/// starts, updates it as the session moves, ends it with the session. A touch on Pause or Stop waits here until the page
/// takes it (an event says one is waiting), the page then acting as when the card's own tool is touched.
final class LiveActivityHost {
    static let shared = LiveActivityHost()
    private static let log = Logger(subsystem: "atome", category: "LiveActivity")
    private static let commands: Set<String> = ["live_activity_publish", "live_activity_request_take"]
    private var pending: [[String: Any]] = []
    private var activity: Activity<EveSessionAttributes>?

    private init() {}

    static func canHandle(command: String) -> Bool { commands.contains(command) }

    /// Any queue: Pause or Stop touched on the activity. The page starts without a window when the touch launched this app.
    func requested(_ action: String) {
        DispatchQueue.main.async {
            AppPageHost.shared.start(windowless: true)
            self.pending.append(["action": action])
            WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('eve:live-activity-request'));", label: "live_activity.request", priority: .high)
        }
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        if command == "live_activity_request_take" {
            return DispatchQueue.main.async {
                let requests = self.pending
                self.pending = []
                completion(["requests": requests], nil)
            }
        }
        guard let phase = payload["phase"] as? String, let state = Self.decode(EveSessionAttributes.ContentState.self, payload["state"]) else {
            return completion([:], "live_activity_state_required")
        }
        let content = ActivityContent(state: state, staleDate: nil)
        DispatchQueue.main.async {
            switch phase {
            case "start": self.start(payload: payload, content: content, completion: completion)
            case "update":
                guard let activity = self.activity else { return completion([:], "live_activity_not_started") }
                Task { await activity.update(content); completion(["ok": true], nil) }
            case "end":
                guard let activity = self.activity else { return completion([:], "live_activity_not_started") }
                self.activity = nil
                Task { await activity.end(content, dismissalPolicy: .immediate); completion(["ok": true], nil) }
            default: completion([:], "live_activity_phase_unknown")
            }
        }
    }

    // Main thread. One activity at a time: one left from an earlier launch of the app (its session's end never came) ends.
    // Live Activities turned off by the person (or a device without them, an iPad), or the app not in the foreground, is an
    // answer, not a failure.
    private func start(payload: [String: Any], content: ActivityContent<EveSessionAttributes.ContentState>,
                       completion: @escaping ([String: Any], String?) -> Void) {
        guard let attributes = Self.decode(EveSessionAttributes.self, payload["attributes"]) else { return completion([:], "live_activity_attributes_required") }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return completion(["started": false, "reason": "disabled"], nil) }
        let left = Activity<EveSessionAttributes>.activities
        do {
            activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
            Task { for old in left { await old.end(nil, dismissalPolicy: .immediate) } }
            completion(["started": true], nil)
        } catch ActivityAuthorizationError.visibility {
            // iOS starts an activity only from the app in the foreground: a session begun on the watch while the phone's app
            // is in the background shows once the app comes forward (the page asks again at the session's next change).
            completion(["started": false, "reason": "background"], nil)
        } catch {
            Self.log.error("Live Activity not started: \(error.localizedDescription, privacy: .public)")
            completion([:], "live_activity_not_started:\(error.localizedDescription)")
        }
    }

    private static func decode<Value: Decodable>(_ type: Value.Type, _ text: Any?) -> Value? {
        guard let text = text as? String else { return nil }
        do { return try JSONDecoder().decode(type, from: Data(text.utf8)) } catch {
            log.error("Live Activity payload not read: \(String(describing: error), privacy: .public)")
            return nil
        }
    }
}

extension EveSessionPauseIntent {
    func perform() async throws -> some IntentResult {
        LiveActivityHost.shared.requested("pause")
        return .result()
    }
}

extension EveSessionStopIntent {
    func perform() async throws -> some IntentResult {
        LiveActivityHost.shared.requested("stop")
        return .result()
    }
}
