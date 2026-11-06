import ActivityKit
import AppIntents
import Foundation

// eVe's Live Activity (lot D13, validated « tel quel » by the user on 2026-11-04, temp/d18_native/mockups/d13_live_activity_*.png),
// shared by the app (application/LiveActivityHost.swift starts, updates and ends it) and its widget extension
// (liveactivitywidget/ draws it). The page describes, iOS shows (eVe/domains/live_activity/live_activity_link.js): every value
// here comes from it, the look included (eVe/elements/skin/live_activity_skin.js).

struct EveSessionAttributes: ActivityAttributes {
    // What changes while the session runs: the step's name, the disc's figure and ring, the pulse, the session's active time,
    // and its look, so a change of the person's visual settings (colours, sizes) reaches the running activity.
    struct ContentState: Codable, Hashable {
        let stage: String
        let figure: EveSessionFigure?
        let ring: EveSessionRing?
        let heart: Double?
        let time: EveSessionFigure
        let paused: Bool
        let theme: EveSessionTheme
    }

    let kind: String
    let id: String
    let title: String
}

// A figure as the page gives it: a count (and its word), or a clock running from the instant it ends (`ends_at`) or began
// (`since`), in ms since 1970; iOS counts it, the app is not woken for it.
struct EveSessionFigure: Codable, Hashable {
    let count: String?
    let word: String?
    let ends_at: Double?
    let since: Double?
}

// The ring of the step under way: `progress` at `at_ms`, moving by `rate` each second (0: it stands).
struct EveSessionRing: Codable, Hashable {
    let progress: Double
    let rate: Double
    let at_ms: Double?

    // The instants it reads 1 and 0 while it moves, for iOS to run it alone; nil while it stands.
    var interval: ClosedRange<Date>? {
        guard rate != 0, let at_ms else { return nil }
        let at = at_ms / 1000, span = 1 / abs(rate)
        let start = rate < 0 ? at - (1 - progress) * span : at - progress * span
        return Date(timeIntervalSince1970: start)...Date(timeIntervalSince1970: start + span)
    }
}

struct EveSessionTheme: Codable, Hashable {
    let colors: [String: [Double]]
    let metrics: [String: Double]
}

// The activity's two tools. The system runs them in the app's process (they are in both targets): each target gives its
// own `perform` (application/LiveActivityHost.swift, liveactivitywidget/EveSessionIntentsWidget.swift).
struct EveSessionPauseIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pause or resume the session"
    static let isDiscoverable = false
    init() {}
}

struct EveSessionStopIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Stop the session"
    static let isDiscoverable = false
    init() {}
}
