import Foundation
import UIKit
import WatchConnectivity
import WatchKit
import os.log

// The watch side of the companion (lots W1-W7, todo/montre_compagnon_plan_2026-10-30.md). The watch holds no truth: it shows
// the model the iPhone's page describes and sends each touch as a request the page carries out with its own commands
// (eVe/domains/watch/watch_link.js). The one WCSession delegate (WatchSensorSession.swift) hands it the model ("link" in the
// context or a live message), the catalog file and the assistant's voice. Without the iPhone at reach, the watch says so.
@MainActor
final class WatchLink: ObservableObject {
    static let shared = WatchLink()
    private static let log = Logger(subsystem: "atome", category: "WatchLink")

    @Published private(set) var catalog: WatchCatalog?
    @Published private(set) var model: WatchModel?
    @Published private(set) var reachable = false
    private(set) var pictures: [String: UIImage] = [:]
    private(set) var atom: UIImage?

    var assistantOn: Bool { (model?.assistant ?? "closed") != "closed" }

    private init() { load() }

    // MARK: - From the iPhone

    // A page that has not been greeted since it started says so (its tiles' version still empty): it is greeted now, once.
    func received(model text: String) {
        let before = model?.catalog
        do { model = try JSONDecoder().decode(WatchModel.self, from: Data(text.utf8)) }
        catch { Self.log.error("Watch model not read: \(error.localizedDescription, privacy: .public)") }
        if !assistantOn { WatchVoice.shared.stop() }
        if model?.catalog == "", before != "" { hello() }
    }

    // The file is already kept (WatchSensorSession moved it): read it as the tiles to show.
    func receivedCatalog() { load() }

    func reachabilityChanged(_ reachable: Bool) {
        self.reachable = reachable
        if reachable { hello() }
    }

    // MARK: - To the iPhone

    // Each time the app shows: the page answers with its model, and its tiles when this watch holds another version.
    func hello() { send(["kind": "hello", "catalog": catalog?.version ?? ""]) }

    func open(_ target: WatchOpen) {
        if target.kind == "series" { return send(["kind": "series", "id": target.id]) }
        send(["kind": "card", "card": target.kind == "brick" ? "brick" : "training", "action": "open", "id": target.id])
    }

    func act(_ action: String, on card: WatchCard, extra: [String: Any] = [:]) {
        var request: [String: Any] = ["kind": "card", "card": card.kind, "action": action, "id": card.id]
        extra.forEach { request[$0.key] = $0.value }
        send(request)
    }

    func film(_ active: Bool) { send(["kind": "film", "active": active]) }

    // The Atom: touched, the assistant listens to this watch (its microphone goes to the iPhone); touched again, she goes.
    func toggleAssistant() {
        if assistantOn {
            WatchVoice.shared.stop()
            return send(["kind": "assistant", "action": "close"])
        }
        WatchVoice.shared.start()
        send(["kind": "assistant", "action": "open"])
    }

    private func send(_ request: [String: Any]) {
        guard WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["link": request], replyHandler: nil) { error in
            Self.log.error("Watch request not sent: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - The kept catalog

    nonisolated static var catalogURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("watch_catalog.json")
    }

    private func load() {
        guard let url = Self.catalogURL, FileManager.default.fileExists(atPath: url.path) else { return }
        do {
            let decoded = try JSONDecoder().decode(WatchCatalog.self, from: Data(contentsOf: url))
            pictures = decoded.pictures.compactMapValues { Data(base64Encoded: $0).flatMap(UIImage.init(data:)) }
            atom = Data(base64Encoded: decoded.atom).flatMap(UIImage.init(data:))
            catalog = decoded
        } catch {
            Self.log.error("Watch catalog not read: \(error.localizedDescription, privacy: .public)")
        }
    }
}
