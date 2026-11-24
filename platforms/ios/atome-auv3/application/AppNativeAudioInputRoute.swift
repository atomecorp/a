import AVFoundation
import Foundation

/// The physical inputs iPadOS routes (R-286, user 23 Nov. 2026). The engine (cpal) sees one input, « Default Device »:
/// whatever the session routes now. The session's own ports — a USB interface, the built-in microphone, a headset —
/// are listed here by their uid, stable across reconnections, with the channels each exposes, beside the engine's own
/// inputs (« Default Device » keeps the tracks that named it, as before). A program or a take naming a port routes it:
/// the port preferred with its whole channel count, the active route checked to be that port, then the engine told
/// (`audio_input_routed`), which opens its one input for that uid and reads every channel of it. The session's route
/// is the app's; what each track takes from it stays the track's own (`record.channels`). Browsing a list or looking
/// at another track routes nothing: only a program or a take that names a port does.
enum AppNativeAudioInputRoute {
    /// The port the engine was last told is routed (nil: none of a strip's).
    static var routedUid: String?
    /// The channels its route exposed when the engine was told (a change of them reopens the engine's inputs).
    static var routedChannels = 0
    static let changedEvent = "eve:native-audio-inputs-changed"
    /// The session consumer held while the ports are read.
    static let listingConsumerId = "input_listing"
}

extension AppNativeAudioController {
    /// The session's input ports as engine inputs (`{ id, name, channels, backend, routed }`). The routed port reports the
    /// channels its route exposes at most; another, the channels it describes (0 while the system does not say).
    func sessionInputPorts(session: AVAudioSession = .sharedInstance()) -> [[String: Any]] {
        let routed = Set(session.currentRoute.inputs.map(\.uid))
        return (session.availableInputs ?? []).map { port in
            let described = port.channels?.count ?? 0
            let channels = routed.contains(port.uid) ? max(described, session.maximumInputNumberOfChannels) : described
            return ["id": port.uid, "name": port.portName, "channels": channels, "backend": "ios_session_port",
                    "routed": routed.contains(port.uid)]
        }
    }

    /// `audio_mix_devices` (on the audio queue): the engine's inputs, then the session's ports. A session that only
    /// plays lists no USB input (iPadOS names the built-in microphone alone, 23 Nov. 2026, a Digiface USB plugged):
    /// the ports are read while the session can record, held just for that reading.
    func withSessionInputs(_ result: [String: Any]) throws -> [String: Any] {
        var devices = (result["devices"] as? [String: Any]) ?? [:]
        let engine = (devices["inputs"] as? [[String: Any]]) ?? []
        let known = Set(engine.compactMap { $0["id"] as? String })
        let ports: [[String: Any]]
        if AVAudioSession.sharedInstance().category.recordsAudio {
            ports = sessionInputPorts()
        } else {
            try acquireAudioSessionConsumer(AppNativeAudioInputRoute.listingConsumerId, kind: .musicCapture)
            ports = sessionInputPorts()
            releaseAudioSessionConsumer(AppNativeAudioInputRoute.listingConsumerId)
        }
        AppNativeAudioDiagnostics.log("session input_ports \(ports.map { "\($0["name"] ?? ""):\($0["channels"] ?? 0)" })")
        devices["inputs"] = engine + ports.filter { !known.contains(($0["id"] as? String) ?? "") }
        var answer = result
        answer["devices"] = devices
        return answer
    }

    /// A program's live inputs: a strip's IN, an IN module's source (a track's input meter, R-285).
    static func liveAudioSources(of program: [String: Any]) -> [[String: Any]] {
        let strips = (program["strips"] as? [[String: Any]]) ?? []
        return strips.flatMap { strip -> [[String: Any]] in
            let modules = ((strip["chain"] as? [[String: Any]]) ?? []).compactMap { $0["source"] as? [String: Any] }
            return [(strip["input"] as? [String: Any]) ?? [:]] + modules
        }.filter { $0["kind"] as? String == "live_audio" }
    }

    /// The session ports a program's live inputs name.
    func sessionPortsNamed(by program: [String: Any]) -> Set<String> {
        let ports = Set((AVAudioSession.sharedInstance().availableInputs ?? []).map(\.uid))
        let named = Self.liveAudioSources(of: program).compactMap { $0["device_id"] as? String }
        return Set(named.filter { ports.contains($0) || $0 == AppNativeAudioInputRoute.routedUid })
    }

    /// Routes the one port `uids` names (none: nothing changes). iPadOS routes one input at a time: two ports at once
    /// are refused, and a port gone or not taken by the system is an error, never another microphone in its place.
    func routeSessionInput(_ uids: Set<String>) throws {
        guard let uid = uids.first else { return }
        guard uids.count == 1 else { throw routeError("media_input_route_single:\(uids.sorted().joined(separator: ","))") }
        let session = AVAudioSession.sharedInstance()
        // Already the engine's, on the same channels: nothing to open again (a take under way keeps its stream).
        if AppNativeAudioInputRoute.routedUid == uid, session.currentRoute.inputs.contains(where: { $0.uid == uid }),
           session.inputNumberOfChannels == AppNativeAudioInputRoute.routedChannels,
           session.inputNumberOfChannels == session.maximumInputNumberOfChannels { return }
        guard let port = session.availableInputs?.first(where: { $0.uid == uid }) else {
            throw routeError("media_input_unavailable:audio:\(uid)")
        }
        if session.preferredInput?.uid != uid { try session.setPreferredInput(port) }
        guard session.currentRoute.inputs.contains(where: { $0.uid == uid }) else {
            throw routeError("media_input_route_refused:\(uid)")
        }
        // Every channel the interface exposes: each track takes its own among them.
        let most = session.maximumInputNumberOfChannels
        if most > 0, session.preferredInputNumberOfChannels != most { try session.setPreferredInputNumberOfChannels(most) }
        try tellEngineRouted(uid)
        AppNativeAudioDiagnostics.log(
            "session input_routed uid=\(uid) name=\(port.portName) channels=\(session.inputNumberOfChannels)/\(most)"
        )
    }

    private func tellEngineRouted(_ uid: String?) throws {
        let (_, error) = NativeKiraEngine.run("audio_input_routed", ["deviceId": uid ?? ""])
        if let error { throw routeError(error) }
        AppNativeAudioInputRoute.routedUid = uid
        AppNativeAudioInputRoute.routedChannels = AVAudioSession.sharedInstance().inputNumberOfChannels
    }

    private func routeError(_ code: String) -> NSError {
        NSError(domain: "AppNativeAudioInputRoute", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
    }

    /// A device came or went (a card unplugged, plugged back): the page lists its inputs again, and a port the engine
    /// listens to is routed again as soon as it is back, its inputs reopened on its channels. While it is away the
    /// engine keeps its uid: its inputs stay closed (an explicit error), never on the built-in microphone. A category
    /// change (a take, the listing itself) is no device change: listing on it would list again without end.
    func followSessionInputRoute(_ reason: AVAudioSession.RouteChangeReason) {
        guard reason == .newDeviceAvailable || reason == .oldDeviceUnavailable else { return }
        WebViewManager.evaluateJS(
            "window.dispatchEvent(new CustomEvent('\(AppNativeAudioInputRoute.changedEvent)'));",
            label: "audio.inputs_changed", priority: .normal
        )
        guard let uid = AppNativeAudioInputRoute.routedUid else { return }
        let session = AVAudioSession.sharedInstance()
        guard session.availableInputs?.contains(where: { $0.uid == uid }) == true else {
            AppNativeAudioDiagnostics.log("session input_route_lost uid=\(uid)")
            return
        }
        do {
            try routeSessionInput([uid])
        } catch {
            AppNativeAudioDiagnostics.log("session input_reroute_failed uid=\(uid) error=\(error.localizedDescription)")
        }
    }
}
