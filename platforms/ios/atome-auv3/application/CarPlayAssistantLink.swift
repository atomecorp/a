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
        CarPlayAssistantLink.shared.activate()
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        CarPlayAssistantLink.shared.disconnect()
    }
}

/// Native half of the CarPlay voice surface. It owns only CarPlay templates: the
/// assistant (conversation, tools, audio) runs in the shared page, which this link
/// asks to open or close through `AssistantRequestInbox` and whose phase it mirrors
/// (assistant_native_link.js). The Atom's pictures come from the page
/// (assistant_carplay_pictures.js): touching the Atom on the home grid talks, touching
/// the Atom tool under the voice surface stops it, the Atom fading to its stopped opacity.
final class CarPlayAssistantLink {
    static let shared = CarPlayAssistantLink()
    private static let stateCommand = "carplay_assistant_state"
    private static let phases = ["connecting", "listening", "responding", "speaking", "error"]
    // The template's states: the Atom at rest (connecting, listening, thinking), speaking, an error, and fading off.
    private static let stateOfPhase = ["connecting": "rest", "listening": "rest", "responding": "rest",
                                       "speaking": "speaking", "error": "error"]
    private static let gridSide: CGFloat = 80
    private static let fadeFrames = 8

    private struct Pictures {
        let rest: UIImage
        let speaking: UIImage
        let stopped: UIImage
        let stopping: UIImage
        let stoppingSeconds: Double
    }

    private var pictures: Pictures?
    private var interface: CPInterfaceController?
    private var grid: CPGridTemplate?
    private var voiceTemplate: CPVoiceControlTemplate?
    private var voiceTemplateMessage = ""
    private var voiceTemplatePresented = false
    private var activeState = ""
    private var active = false

    private init() {}

    static func canHandle(command: String) -> Bool { command == stateCommand }

    func connect(_ interfaceController: CPInterfaceController) {
        interface = interfaceController
        AppPageHost.shared.start(windowless: true)
        let grid = CPGridTemplate(title: Self.displayName(), gridButtons: [])
        self.grid = grid
        interfaceController.setRootTemplate(grid, animated: false, completion: nil)
        showGridButton()
    }

    /// Opens the assistant without a tap; the Atom on the grid listens again after a stop.
    func activate() { request("open") }

    func disconnect() {
        // Leaving the car ends the conversation: the microphone never outlives the surface.
        request("close")
        interface = nil
        grid = nil
        voiceTemplate = nil
        voiceTemplateMessage = ""
        voiceTemplatePresented = false
        activeState = ""
        active = false
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            let phase = payload["phase"] as? String ?? ""
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
        AssistantRequestInbox.shared.request(action: action, source: "carplay", surface: "voice")
    }

    private static func displayName() -> String {
        guard let name = Bundle.main.localizedInfoDictionary?["CFBundleDisplayName"] as? String
                ?? Bundle.main.infoDictionary?["CFBundleDisplayName"] as? String else {
            preconditionFailure("CFBundleDisplayName missing from Info.plist")
        }
        return name
    }

    /// The Atom on the grid: lit while the assistant is open, at its stopped opacity once touched off.
    private func showGridButton() {
        guard let grid, let pictures else { return }
        let image = Self.resized(active ? pictures.rest : pictures.stopped, side: Self.gridSide)
        let button = CPGridButton(titleVariants: [Self.displayName()], image: image) { [weak self] _ in
            self?.request("open")
        }
        grid.updateGridButtons([button])
    }

    /// Touched, the Atom fades to its stopped opacity, then the assistant closes.
    private func stop() {
        guard let voiceTemplate, voiceTemplatePresented, let pictures else { return }
        voiceTemplate.activateVoiceControlState(withIdentifier: "stopping")
        activeState = "stopping"
        DispatchQueue.main.asyncAfter(deadline: .now() + pictures.stoppingSeconds) { [weak self] in self?.request("close") }
    }

    private func show(phase: String, message: String) {
        guard let interface else { return }
        let opened = phase != "closed"
        if opened != active { active = opened; showGridButton() }
        if !opened {
            guard voiceTemplate != nil else { return }
            voiceTemplate = nil
            voiceTemplateMessage = ""
            activeState = ""
            if voiceTemplatePresented { interface.dismissTemplate(animated: true, completion: nil) }
            voiceTemplatePresented = false
            return
        }
        guard let state = Self.stateOfPhase[phase] else { preconditionFailure("carplay phase without state: \(phase)") }
        // A stop under way keeps fading until the page closes.
        if activeState == "stopping", voiceTemplate != nil { return }
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
        let states = [
            CPVoiceControlState(identifier: "rest", titleVariants: nil, image: pictures.rest, repeats: false),
            CPVoiceControlState(identifier: "speaking", titleVariants: nil, image: pictures.speaking, repeats: false),
            CPVoiceControlState(identifier: "error", titleVariants: [message], image: pictures.rest, repeats: false),
            CPVoiceControlState(identifier: "stopping", titleVariants: nil, image: pictures.stopping, repeats: false)
        ]
        // The Atom tool under the Atom stops it (CarPlay states are not touchable themselves).
        if #available(iOS 26.4, *) {
            let side = min(CPButtonMaximumImageSize.width, CPButtonMaximumImageSize.height)
            let tool = Self.resized(pictures.rest, side: side)
            for state in states where state.identifier != "stopping" {
                state.actionButtons = [CPButton(image: tool) { [weak self] _ in self?.stop() }]
            }
        }
        return CPVoiceControlTemplate(voiceControlStates: states)
    }

    private static func pictures(from painted: [String: Any]) -> Pictures? {
        guard let scale = painted["scale"] as? Double, let stoppedOpacity = painted["stoppedOpacity"] as? Double,
              let stoppingMs = painted["stoppingMs"] as? Double,
              let rest = image(painted["rest"], scale: scale), let speaking = image(painted["speaking"], scale: scale) else { return nil }
        // The fade eases from the lit Atom to its stopped opacity (the assistant's own smooth step).
        let frames = (0...fadeFrames).map { index -> UIImage in
            let t = Double(index) / Double(fadeFrames), eased = t * t * (3 - 2 * t)
            return rest.withAlpha(CGFloat(1 - (1 - stoppedOpacity) * eased))
        }
        guard let stopping = UIImage.animatedImage(with: frames, duration: stoppingMs / 1000) else { return nil }
        return Pictures(rest: rest, speaking: speaking, stopped: rest.withAlpha(CGFloat(stoppedOpacity)),
                        stopping: stopping, stoppingSeconds: stoppingMs / 1000)
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

private extension UIImage {
    func withAlpha(_ alpha: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: size, format: imageRendererFormat).image { _ in draw(at: .zero, blendMode: .normal, alpha: alpha) }
    }
}
