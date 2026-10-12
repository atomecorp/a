import CarPlay
import UIKit

/// CarPlay scene of the app: a voice surface with one button, the assistant.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        CarPlayAssistantLink.shared.connect(interfaceController)
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        CarPlayAssistantLink.shared.disconnect()
    }
}

/// Native half of the CarPlay voice surface. It owns only CarPlay templates: the
/// assistant (conversation, tools, audio) runs in the shared page, which this link
/// asks to open or close through `AssistantRequestInbox` and whose phase it mirrors
/// (assistant_native_link.js).
final class CarPlayAssistantLink {
    static let shared = CarPlayAssistantLink()
    private static let stateCommand = "carplay_assistant_state"
    private static let phases = ["connecting", "listening", "responding", "error"]

    private var interface: CPInterfaceController?
    private var voiceTemplate: CPVoiceControlTemplate?
    private var voiceTemplateKey = ""
    private var voiceTemplatePresented = false
    private var activePhase = ""

    private init() {}

    static func canHandle(command: String) -> Bool { command == stateCommand }

    func connect(_ interfaceController: CPInterfaceController) {
        interface = interfaceController
        AppPageHost.shared.start(windowless: true)
        guard let name = Bundle.main.localizedInfoDictionary?["CFBundleDisplayName"] as? String
                ?? Bundle.main.infoDictionary?["CFBundleDisplayName"] as? String else {
            preconditionFailure("CFBundleDisplayName missing from Info.plist")
        }
        let button = CPGridButton(titleVariants: [name], image: Self.icon(side: 80)) { [weak self] _ in
            self?.request("open")
        }
        interfaceController.setRootTemplate(CPGridTemplate(title: name, gridButtons: [button]), animated: false, completion: nil)
    }

    func disconnect() {
        // Leaving the car ends the conversation: the microphone never outlives the surface.
        request("close")
        interface = nil
        voiceTemplate = nil
        voiceTemplateKey = ""
        voiceTemplatePresented = false
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            let phase = payload["phase"] as? String ?? ""
            guard phase == "closed" || Self.phases.contains(phase),
                  let labels = payload["labels"] as? [String: String] else {
                completion([:], "carplay_assistant_state_invalid")
                return
            }
            self.show(phase: phase, message: payload["message"] as? String ?? "", labels: labels)
            completion(["ok": true], nil)
        }
    }

    private func request(_ action: String) {
        AssistantRequestInbox.shared.request(action: action, source: "carplay", surface: "voice")
    }

    private func show(phase: String, message: String, labels: [String: String]) {
        guard let interface else { return }
        if phase == "closed" {
            guard voiceTemplate != nil else { return }
            voiceTemplate = nil
            voiceTemplateKey = ""
            if voiceTemplatePresented { interface.dismissTemplate(animated: true, completion: nil) }
            voiceTemplatePresented = false
            return
        }
        activePhase = phase
        let key = Self.phases.map { labels[$0] ?? "" }.joined(separator: "|") + "|" + message + "|" + (labels["end"] ?? "")
        if let voiceTemplate, key == voiceTemplateKey {
            if voiceTemplatePresented { voiceTemplate.activateVoiceControlState(withIdentifier: phase) }
            return
        }
        // States are fixed at creation: a new error message or language rebuilds the template.
        let template = makeVoiceTemplate(message: message, labels: labels)
        let replacing = voiceTemplatePresented
        voiceTemplate = template
        voiceTemplateKey = key
        voiceTemplatePresented = false
        let present = { [weak self] in
            interface.presentTemplate(template, animated: !replacing) { presented, _ in
                guard let self, presented, self.voiceTemplate === template else { return }
                self.voiceTemplatePresented = true
                template.activateVoiceControlState(withIdentifier: self.activePhase)
            }
        }
        if replacing { interface.dismissTemplate(animated: false) { _, _ in present() } } else { present() }
    }

    private func makeVoiceTemplate(message: String, labels: [String: String]) -> CPVoiceControlTemplate {
        let icon = Self.icon(side: 150)
        let pulse = UIImage.animatedImage(with: [icon, icon.withAlpha(0.45)], duration: 1.2) ?? icon
        let states = Self.phases.map { phase in
            CPVoiceControlState(identifier: phase, titleVariants: [phase == "error" ? message : labels[phase] ?? ""],
                                image: phase == "listening" ? pulse : icon, repeats: phase == "listening")
        }
        let template = CPVoiceControlTemplate(voiceControlStates: states)
        if #available(iOS 26.4, *), let end = labels["end"], !end.isEmpty {
            template.leadingNavigationBarButtons = [CPBarButton(title: end) { [weak self] _ in self?.request("close") }]
        }
        return template
    }

    /// The assistant mark, black in light car themes and white in dark ones.
    private static func icon(side: CGFloat) -> UIImage {
        guard let mark = UIImage(named: "CarPlayAssistant") else { preconditionFailure("CarPlayAssistant asset missing") }
        let render = { (color: UIColor) in
            UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in
                mark.withTintColor(color, renderingMode: .alwaysOriginal)
                    .draw(in: CGRect(x: 0, y: 0, width: side, height: side))
            }
        }
        let asset = UIImageAsset()
        let dark = render(.white)
        asset.register(render(.black), with: UITraitCollection(userInterfaceStyle: .light))
        asset.register(dark, with: UITraitCollection(userInterfaceStyle: .dark))
        return asset.image(with: UITraitCollection(userInterfaceStyle: .dark))
    }
}

private extension UIImage {
    func withAlpha(_ alpha: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { _ in draw(at: .zero, blendMode: .normal, alpha: alpha) }
    }
}
