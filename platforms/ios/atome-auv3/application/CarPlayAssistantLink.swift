import AVFoundation
import CarPlay
import UIKit

/// CarPlay scene of the app: a voice surface whose one control is the Atom.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        CarPlayAssistantLink.shared.connect(interfaceController)
    }

    // A voice app launches straight into voice: being active on the car screen starts listening.
    func sceneDidBecomeActive(_ scene: UIScene) {
        CarPlayJournal.shared.write("carplay_scene", "did_become_active")
        CarPlayAssistantLink.shared.activate()
    }

    func sceneWillResignActive(_ scene: UIScene) { CarPlayJournal.shared.write("carplay_scene", "will_resign_active") }
    func sceneDidEnterBackground(_ scene: UIScene) { CarPlayJournal.shared.write("carplay_scene", "did_enter_background") }
    func sceneWillEnterForeground(_ scene: UIScene) { CarPlayJournal.shared.write("carplay_scene", "will_enter_foreground") }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        CarPlayAssistantLink.shared.disconnect()
    }
}

/// Native half of the CarPlay voice surface. It owns only CarPlay templates: the
/// assistant (conversation, tools, audio) runs in the shared page, which this link
/// asks to open or close through `AssistantRequestInbox` and whose phase it mirrors
/// (assistant_native_link.js). The Atom's pictures come from the page
/// (assistant_carplay_pictures.js). One Atom only on the voice surface (user, 18 Nov. 2026):
/// it breathes while she listens, its dot speaks while she speaks. From iOS 26.4 the voice surface
/// is CarPlay's root (user, 19 Nov. 2026, mockup validated): no ✕, no grid, no « atome » caption;
/// a microphone beside the Atom cuts her listening (she hangs up) and gives it back, and from
/// iOS 27 atome's standard wallpaper lies behind. Before iOS 26.4 the surface is presented over a
/// grid: she hangs up when asked to aloud, or with CarPlay's own close; the grid's Atom calls her back.
final class CarPlayAssistantLink: NSObject, CPInterfaceControllerDelegate {
    static let shared = CarPlayAssistantLink()
    private static let stateCommand = "carplay_assistant_state"
    private static let journalCommand = "carplay_journal"
    private static let liveLock = NSLock()
    private static var voiceLive = false
    /// Any thread: the car holds an open conversation, which keeps the app running behind a locked phone
    /// (background audio). The local vault's work then goes on without background time (AppBackgroundLifecycle).
    static var carVoiceLive: Bool {
        liveLock.lock()
        defer { liveLock.unlock() }
        return voiceLive
    }
    private static func setCarVoiceLive(_ value: Bool) {
        liveLock.lock()
        voiceLive = value
        liveLock.unlock()
    }
    private static let phases = ["connecting", "listening", "responding", "speaking", "error", "muted"]
    // The template's states: the Atom still while she connects, breathing while she listens or
    // thinks, its dot speaking while she speaks, still under an error.
    private static let stateOfPhase = ["connecting": "rest", "listening": "listening", "responding": "listening",
                                       "speaking": "speaking", "error": "error", "muted": "rest"]
    private static let gridSide: CGFloat = 80
    /// The root surface's state with her microphone cut (`muted`, the conversation open) or once she hung up:
    /// the Atom at its stopped opacity, the microphone shown cut.
    private static let stoppedState = "stopped"
    private static let mutedTint = UIColor(red: 1, green: 0.36, blue: 0.48, alpha: 1)

    private struct Pictures {
        let rest: UIImage
        let stopped: UIImage
        let listening: UIImage
        let talking: UIImage
        let wallpaper: UIImage?
    }

    private var pictures: Pictures?
    private var interface: CPInterfaceController?
    private var grid: CPGridTemplate?
    private var voiceTemplate: CPVoiceControlTemplate?
    private var voiceTemplateMessage = ""
    private var voiceTemplatePresented = false
    private var activeState = ""
    private var active = false
    /// iOS 26.4 and later: the voice template is the root template (see the class note); before, the grid is.
    private var voiceIsRoot = false
    /// The car's screen is connected: the page must live even behind a locked phone (AppBackgroundLifecycle).
    private(set) var isConnected = false

    private override init() { super.init() }

    static func canHandle(command: String) -> Bool { command == stateCommand || command == journalCommand }

    func connect(_ interfaceController: CPInterfaceController) {
        interface = interfaceController
        interfaceController.delegate = self
        isConnected = true
        CarPlayJournal.shared.start()
        // While the car is connected the phone does not lock itself: a page shown on the phone plays what she
        // opens (TV, video), which a locked phone's hidden page cannot (user, 18 Nov. 2026: BFMTV failed once the
        // phone's screen went black). The person can still lock it; the voice session goes on then.
        UIApplication.shared.isIdleTimerDisabled = true
        AppPageHost.shared.start(windowless: true)
        if #available(iOS 26.4, *) {
            voiceIsRoot = true
            guard pictures != nil else {
                // Until the page sends the Atom's pictures, the surface waits empty.
                setVoiceRoot(CPVoiceControlTemplate(voiceControlStates: [
                    CPVoiceControlState(identifier: "rest", titleVariants: nil, image: nil, repeats: false)
                ]))
                return
            }
            let template = makeVoiceTemplate(message: "")
            voiceTemplate = template
            voiceTemplateMessage = ""
            activeState = Self.stoppedState
            setVoiceRoot(template)
            return
        }
        showGrid()
    }

    private func showGrid() {
        guard let interface else { return }
        let grid = CPGridTemplate(title: Self.displayName(), gridButtons: [])
        self.grid = grid
        interface.setRootTemplate(grid, animated: false, completion: nil)
        showGridButton()
    }

    /// The voice template as CarPlay's root. No fallback: a refusal is a defect, journaled and logged as one.
    private func setVoiceRoot(_ template: CPVoiceControlTemplate) {
        guard let interface else { return }
        interface.setRootTemplate(template, animated: false) { [weak self] done, error in
            guard let self, self.interface === interface else { return }
            guard done else {
                let code = (error as NSError?)?.code ?? 0
                CarPlayJournal.shared.write("carplay", "carplay_voice_root_refused", ["code": code])
                NSLog("[carplay] carplay_voice_root_refused code=%d", code)
                return
            }
            guard self.voiceTemplate === template else { return }
            self.voiceTemplatePresented = true
            template.activateVoiceControlState(withIdentifier: self.activeState)
        }
    }

    /// Opens the assistant without a tap; the Atom on the grid listens again after a stop.
    func activate() { request("open") }

    /// The page was reloaded (iOS reclaimed it): an assistant open in the car is called back in the new page.
    func pageReloaded() {
        CarPlayJournal.shared.write("page", "reloaded", ["assistant_open": active])
        guard isConnected, active else { return }
        request("open")
    }

    func disconnect() {
        // Leaving the car ends the conversation: the microphone never outlives the surface.
        request("close")
        isConnected = false
        UIApplication.shared.isIdleTimerDisabled = false
        Self.setCarVoiceLive(false)
        CarPlayJournal.shared.stop()
        interface?.delegate = nil
        interface = nil
        grid = nil
        voiceIsRoot = false
        voiceTemplate = nil
        voiceTemplateMessage = ""
        voiceTemplatePresented = false
        activeState = ""
        active = false
    }

    // CarPlay's close (✕) took the voice surface away: she hangs up, the grid's Atom calls her back.
    // A template this link dismisses itself is no longer `voiceTemplate` when it disappears.
    func templateDidDisappear(_ aTemplate: CPTemplate, animated: Bool) {
        guard !voiceIsRoot, let voiceTemplate, aTemplate === voiceTemplate, voiceTemplatePresented else { return }
        CarPlayJournal.shared.write("carplay", "voice_template_closed_by_car")
        self.voiceTemplate = nil
        voiceTemplateMessage = ""
        voiceTemplatePresented = false
        activeState = ""
        request("close")
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        if command == Self.journalCommand {
            CarPlayJournal.shared.write("page", payload["line"] as? String ?? "")
            completion(["ok": true], nil)
            return
        }
        DispatchQueue.main.async {
            let phase = payload["phase"] as? String ?? ""
            CarPlayJournal.shared.write("carplay", "state", ["phase": phase, "with_message": !(payload["message"] as? String ?? "").isEmpty])
            guard phase == "closed" || Self.phases.contains(phase) else {
                completion([:], "carplay_assistant_state_invalid")
                return
            }
            if let painted = payload["pictures"] as? [String: Any] {
                guard let pictures = Self.pictures(from: painted) else {
                    completion([:], "carplay_assistant_pictures_invalid")
                    return
                }
                self.pictures = pictures
                // The grid's Atom is drawn as soon as its pictures exist, whatever the phase they come with.
                self.showGridButton()
            }
            guard self.pictures != nil else {
                completion([:], "carplay_assistant_pictures_missing")
                return
            }
            self.show(phase: phase, message: payload["message"] as? String ?? "")
            completion(["ok": true], nil)
        }
    }

    private func request(_ action: String) {
        CarPlayJournal.shared.write("carplay", "request", ["action": action])
        AssistantRequestInbox.shared.request(action: action, source: "carplay", surface: "voice")
    }

    private static func displayName() -> String {
        guard let name = Bundle.main.localizedInfoDictionary?["CFBundleDisplayName"] as? String
                ?? Bundle.main.infoDictionary?["CFBundleDisplayName"] as? String else {
            preconditionFailure("CFBundleDisplayName missing from Info.plist")
        }
        return name
    }

    /// The Atom on the grid: lit while the assistant is open, at its stopped opacity once she hung up.
    private func showGridButton() {
        guard let grid, let pictures else { return }
        let image = Self.resized(active ? pictures.rest : pictures.stopped, side: Self.gridSide)
        let button = CPGridButton(titleVariants: [Self.displayName()], image: image) { [weak self] _ in
            self?.request("open")
        }
        grid.updateGridButtons([button])
    }

    private func show(phase: String, message: String) {
        guard let interface else { return }
        let opened = phase != "closed"
        if opened != active { active = opened; showGridButton() }
        Self.setCarVoiceLive(opened && isConnected)
        if voiceIsRoot {
            // The root surface stays: muted or closed, the Atom rests dimmed and the microphone shows cut.
            if phase == "muted" {
                activeState = Self.stoppedState
            } else if opened {
                guard let state = Self.stateOfPhase[phase] else { preconditionFailure("carplay phase without state: \(phase)") }
                activeState = state
            } else {
                activeState = Self.stoppedState
            }
            if let voiceTemplate, message == voiceTemplateMessage {
                if voiceTemplatePresented { voiceTemplate.activateVoiceControlState(withIdentifier: activeState) }
                return
            }
            let template = makeVoiceTemplate(message: message)
            voiceTemplate = template
            voiceTemplateMessage = message
            voiceTemplatePresented = false
            setVoiceRoot(template)
            return
        }
        if !opened {
            guard let template = voiceTemplate else { return }
            let presented = voiceTemplatePresented
            voiceTemplate = nil
            voiceTemplateMessage = ""
            activeState = ""
            voiceTemplatePresented = false
            if presented, interface.presentedTemplate === template { interface.dismissTemplate(animated: true, completion: nil) }
            return
        }
        guard let state = Self.stateOfPhase[phase] else { preconditionFailure("carplay phase without state: \(phase)") }
        activeState = state
        if let voiceTemplate, message == voiceTemplateMessage {
            if voiceTemplatePresented { voiceTemplate.activateVoiceControlState(withIdentifier: state) }
            return
        }
        // States are fixed at creation: a new error message rebuilds the template.
        let template = makeVoiceTemplate(message: message)
        let replacing = voiceTemplatePresented
        voiceTemplate = template
        voiceTemplateMessage = message
        voiceTemplatePresented = false
        let present = { [weak self] in
            interface.presentTemplate(template, animated: !replacing) { presented, _ in
                guard let self, presented, self.voiceTemplate === template else { return }
                self.voiceTemplatePresented = true
                template.activateVoiceControlState(withIdentifier: self.activeState)
            }
        }
        if replacing { interface.dismissTemplate(animated: false) { _, _ in present() } } else { present() }
    }

    private func makeVoiceTemplate(message: String) -> CPVoiceControlTemplate {
        guard let pictures else { preconditionFailure("carplay_assistant_pictures_missing") }
        // The Atom alone, no caption but an error's; on the root surface, its microphone beside it.
        var states = [
            Self.state("rest", nil, pictures.rest, pictures.wallpaper, false),
            Self.state("listening", nil, pictures.listening, pictures.wallpaper, true),
            Self.state("speaking", nil, pictures.talking, pictures.wallpaper, true),
            Self.state("error", [message], pictures.rest, pictures.wallpaper, false)
        ]
        if voiceIsRoot {
            states.append(Self.state(Self.stoppedState, nil, pictures.stopped, pictures.wallpaper, false))
            if #available(iOS 26.4, *), CPVoiceControlState.maximumActionButtonCount > 0 {
                for state in states { state.actionButtons = [microphoneButton(listening: state.identifier != Self.stoppedState)] }
            }
        }
        return CPVoiceControlTemplate(voiceControlStates: states)
    }

    private static func state(_ identifier: String, _ titles: [String]?, _ image: UIImage, _ wallpaper: UIImage?,
                              _ repeats: Bool) -> CPVoiceControlState {
        if #available(iOS 27.0, *), let wallpaper {
            return CPVoiceControlState(identifier: identifier, titleVariants: titles, image: image, backgroundImage: wallpaper, repeats: repeats)
        }
        return CPVoiceControlState(identifier: identifier, titleVariants: titles, image: image, repeats: repeats)
    }

    /// Listening, the microphone cuts her listening (`mute`: the runtime's own switch, the conversation stays);
    /// cut, it gives it back (`listen`), or calls her back once she hung up (`open`).
    @available(iOS 26.4, *)
    private func microphoneButton(listening: Bool) -> CPButton {
        let glyph = UIImage.SymbolConfiguration(pointSize: 30, weight: .semibold)
        guard let symbol = UIImage(systemName: listening ? "mic.fill" : "mic.slash.fill", withConfiguration: glyph) else {
            preconditionFailure("carplay_microphone_symbol_missing")
        }
        let image = symbol.withTintColor(listening ? .white : Self.mutedTint, renderingMode: .alwaysOriginal)
        return CPButton(image: image) { [weak self] _ in
            guard let self else { return }
            CarPlayJournal.shared.write("carplay", "microphone", ["listening": !listening])
            self.request(listening ? "mute" : (self.active ? "listen" : "open"))
        }
    }

    private static func pictures(from painted: [String: Any]) -> Pictures? {
        guard let scale = painted["scale"] as? Double, let stoppedOpacity = painted["stoppedOpacity"] as? Double,
              let rest = image(painted["rest"], scale: scale),
              let listening = loop(painted["listening"], scale: scale),
              let talking = loop(painted["talking"], scale: scale) else { return nil }
        // The wallpaper, when sent, must be one: a broken one is refused, never dropped silently.
        let wallpaper = painted["wallpaper"].flatMap { image($0, scale: 1) }
        if painted["wallpaper"] != nil, wallpaper == nil { return nil }
        return Pictures(rest: rest, stopped: rest.withAlpha(CGFloat(stoppedOpacity)), listening: listening, talking: talking,
                        wallpaper: wallpaper)
    }

    /// `{ loopMs, frames }` painted by the page: one animated image that comes back to its first frame.
    private static func loop(_ value: Any?, scale: Double) -> UIImage? {
        guard let painted = value as? [String: Any], let loopMs = painted["loopMs"] as? Double, loopMs > 0,
              let encoded = painted["frames"] as? [Any], !encoded.isEmpty else { return nil }
        let frames = encoded.compactMap { image($0, scale: scale) }
        guard frames.count == encoded.count else { return nil }
        return UIImage.animatedImage(with: frames, duration: loopMs / 1000)
    }

    private static func image(_ value: Any?, scale: Double) -> UIImage? {
        guard let base64 = value as? String, let data = Data(base64Encoded: base64) else { return nil }
        return UIImage(data: data, scale: CGFloat(scale))
    }

    private static func resized(_ image: UIImage, side: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }
    }
}

/// The car's black box (user, 18 Nov. 2026: « quand l'iPhone devient noir, il peut plus parler, il perd la
/// connexion »). While CarPlay is connected, what the app and its page live through is written, one line per
/// event, to Documents/carplay_journal.log (Files › On My iPhone › Atome); the previous journal is kept as
/// carplay_journal.previous.log. A failure in the car is then read, not guessed. A heartbeat every 10 s: a gap
/// in it is the app suspended by iOS.
final class CarPlayJournal {
    static let shared = CarPlayJournal()
    private static let maxBytes: UInt64 = 2_000_000
    private static let heartbeatSeconds: TimeInterval = 10
    private let queue = DispatchQueue(label: "one.atome.carplay.journal")
    private let lock = NSLock()
    private var recording = false
    private var observers: [NSObjectProtocol] = []
    private var heartbeat: Timer?
    private let url: URL
    private let previousURL: URL
    private let stamp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private init() {
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            preconditionFailure("documents directory missing")
        }
        url = documents.appendingPathComponent("carplay_journal.log")
        previousURL = documents.appendingPathComponent("carplay_journal.previous.log")
    }

    private var isRecording: Bool {
        lock.lock()
        defer { lock.unlock() }
        return recording
    }

    /// Main thread: CarPlay connected.
    func start() {
        dispatchPrecondition(condition: .onQueue(.main))
        guard !isRecording else { return }
        queue.async { [self] in
            // One journal per drive: the last one is kept beside it.
            try? FileManager.default.removeItem(at: previousURL)
            try? FileManager.default.moveItem(at: url, to: previousURL)
        }
        lock.lock()
        recording = true
        lock.unlock()
        write("journal", "carplay_connected", appSnapshot())
        observe()
        heartbeat = Timer.scheduledTimer(withTimeInterval: Self.heartbeatSeconds, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.write("app", "heartbeat", self.appSnapshot())
        }
    }

    /// Main thread: CarPlay disconnected.
    func stop() {
        dispatchPrecondition(condition: .onQueue(.main))
        guard isRecording else { return }
        write("journal", "carplay_disconnected", appSnapshot())
        heartbeat?.invalidate()
        heartbeat = nil
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers = []
        lock.lock()
        recording = false
        lock.unlock()
    }

    /// Any thread; nothing is written while CarPlay is not connected.
    func write(_ source: String, _ event: String, _ detail: [String: Any] = [:]) {
        guard isRecording else { return }
        var line = "\(stamp.string(from: Date())) \(source) \(event)"
        if !detail.isEmpty, JSONSerialization.isValidJSONObject(detail),
           let data = try? JSONSerialization.data(withJSONObject: detail, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            line += " " + text
        }
        queue.async { [self] in append(line + "\n") }
    }

    private func append(_ line: String) {
        let manager = FileManager.default
        if let size = (try? manager.attributesOfItem(atPath: url.path))?[.size] as? UInt64, size > Self.maxBytes {
            try? manager.removeItem(at: previousURL)
            try? manager.moveItem(at: url, to: previousURL)
        }
        if !manager.fileExists(atPath: url.path) { manager.createFile(atPath: url.path, contents: nil) }
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: Data(line.utf8))
    }

    /// Main thread.
    private func appSnapshot() -> [String: Any] {
        let application = UIApplication.shared
        let session = AVAudioSession.sharedInstance()
        let state: String
        switch application.applicationState {
        case .active: state = "active"
        case .inactive: state = "inactive"
        case .background: state = "background"
        @unknown default: state = "unknown"
        }
        let remaining = application.backgroundTimeRemaining
        return [
            "app_state": state,
            "background_time_s": remaining > 100_000 ? -1 : Int(remaining),
            "protected_data": application.isProtectedDataAvailable,
            "audio_category": session.category.rawValue,
            "audio_mode": session.mode.rawValue,
            "other_audio": session.isOtherAudioPlaying,
            "route_in": session.currentRoute.inputs.map { $0.portType.rawValue },
            "route_out": session.currentRoute.outputs.map { $0.portType.rawValue },
            "car_voice_live": CarPlayAssistantLink.carVoiceLive
        ]
    }

    private func observe() {
        let center = NotificationCenter.default
        let app: [(Notification.Name, String)] = [
            (UIApplication.didEnterBackgroundNotification, "did_enter_background"),
            (UIApplication.willEnterForegroundNotification, "will_enter_foreground"),
            (UIApplication.didBecomeActiveNotification, "did_become_active"),
            (UIApplication.willResignActiveNotification, "will_resign_active"),
            // The phone locked (or unlocked) with a passcode.
            (UIApplication.protectedDataWillBecomeUnavailableNotification, "phone_locking"),
            (UIApplication.protectedDataDidBecomeAvailableNotification, "phone_unlocked"),
            (UIApplication.didReceiveMemoryWarningNotification, "memory_warning")
        ]
        observers = app.map { name, event in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                self.write("app", event, self.appSnapshot())
            }
        }
        let session = AVAudioSession.sharedInstance()
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] note in
            let info = note.userInfo ?? [:]
            self?.write("audio", "interruption", [
                "type": (info[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue ? "began" : "ended",
                "reason": info[AVAudioSessionInterruptionReasonKey] as? UInt ?? 0,
                "options": info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            ])
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
            guard let self else { return }
            var detail = self.appSnapshot()
            detail["reason"] = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
            self.write("audio", "route_change", detail)
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main) { [weak self] _ in
            self?.write("audio", "media_services_reset")
        })
    }
}

private extension UIImage {
    func withAlpha(_ alpha: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: size, format: imageRendererFormat).image { _ in draw(at: .zero, blendMode: .normal, alpha: alpha) }
    }
}
