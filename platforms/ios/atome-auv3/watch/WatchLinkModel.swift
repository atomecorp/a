import Foundation
import SwiftUI

// What the iPhone's page sends (eVe/domains/watch/watch_link.js, watch_catalog.js, programs/activity_cards.js): the watch
// decodes and shows it, nothing more. The catalog (tiles, pictures, look) comes as a file; the model with each change.

struct WatchCatalog: Decodable {
    let version: String
    let title: String
    let phone: String
    let theme: WatchTheme
    let tiles: [WatchTile]
    let pictures: [String: String]
    let atom: String
}

struct WatchTheme: Decodable {
    let colors: [String: [Double]]
    let metrics: [String: Double]

    // The page sends every value the watch draws with (watch_skin.js): one missing is a broken catalog, never a guess.
    func color(_ name: String) -> Color {
        guard let rgba = colors[name], rgba.count == 4 else { preconditionFailure("watch_theme_color_missing:\(name)") }
        return Color(.sRGB, red: rgba[0], green: rgba[1], blue: rgba[2], opacity: rgba[3])
    }

    func metric(_ name: String) -> CGFloat {
        guard let value = metrics[name] else { preconditionFailure("watch_theme_metric_missing:\(name)") }
        return CGFloat(value)
    }
}

struct WatchTile: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let picture: String
    let tiles: [WatchTile]?
    let open: WatchOpen?
}

struct WatchOpen: Decodable, Hashable {
    let kind: String
    let id: String
}

struct WatchModel: Decodable {
    let card: WatchCard?
    let assistant: String
    let catalog: String
}

struct WatchCard: Decodable, Equatable {
    let kind: String
    let id: String
    let title: String
    let picture: String
    let levels: [WatchLevel]
    let level: String
    let plan: [String]
    let start: String
    let values: [WatchValue]
    let session: WatchSessionState?
    let film: WatchFilm?
    // « Lancer » waits for an agreement the iPhone's card asks (its words: answer there).
    let asking: String?
}

struct WatchLevel: Decodable, Identifiable, Equatable {
    let id: String
    let label: String
}

struct WatchValue: Decodable, Identifiable, Equatable {
    let key: String
    let label: String
    let unit: String
    let value: Double
    let min: Double
    let max: Double
    let step: Double
    var id: String { key }
}

struct WatchSessionState: Decodable, Equatable {
    let phase: String
    let step: String?
    let line: String?
    let figure: WatchFigure?
    let ring: WatchRing?
    let next: String?
    let heart: Double?
    let caption: String?
    let pause: String?
}

// A figure that runs is counted here: `ends_at` (a time left) or `since` (a time spent), in ms since 1970.
struct WatchFigure: Decodable, Equatable {
    let count: String?
    let word: String?
    let ends_at: Double?
    let since: Double?
}

// The ring as the page's session gives it: `progress` at `at_ms`, moving by `rate` each second.
struct WatchRing: Decodable, Equatable {
    let progress: Double
    let rate: Double
    let at_ms: Double?

    func progress(at date: Date) -> Double {
        guard let at_ms, rate != 0 else { return progress }
        return Swift.min(1, Swift.max(0, progress + rate * (date.timeIntervalSince1970 * 1000 - at_ms) / 1000))
    }
}

struct WatchFilm: Decodable, Equatable {
    let active: Bool
    let at: String
    let label: String
}
