import UIKit

/// Connected screens (R-212): the device's keyboard for the screen's page. iOS gives the screen's scene no input, so a
/// text edited there opened no keyboard (user, 19 Nov. 2026). When the screen's page focuses an editable element it
/// asks for the keyboard (ExternalDisplayRelay, `keyboard`); an invisible key catcher on the device's page then takes
/// the focus, which opens the device's keyboard, and each key goes to the screen's page
/// (eVe/domains/rendering/external_display_keyboard.js). A keyboard connected to the device types there too, while
/// the screen's page keeps a text focused.
final class ExternalDisplayKeyboard {
    static let shared = ExternalDisplayKeyboard()

    private var started = false
    private lazy var catcher = KeyCatcher { key in ExternalDisplayRelay.shared.type(key) }

    private init() {}

    func start() {
        guard !started else { return }
        started = true
        NotificationCenter.default.addObserver(forName: .externalDisplayKeyboard, object: nil, queue: .main) { [weak self] note in
            self?.set(open: (note.userInfo?["open"] as? Bool) == true)
        }
    }

    private func set(open: Bool) {
        if open {
            let page = AppPageHost.shared.webView
            if catcher.superview !== page { page.addSubview(catcher) }
            catcher.becomeFirstResponder()
        } else if catcher.isFirstResponder {
            catcher.resignFirstResponder()
        }
    }
}

/// Takes the keys, shows nothing. Plain keys only (no correction, no suggestion): each one goes as it is typed.
private final class KeyCatcher: UIView, UIKeyInput {
    private let send: ([String: Any]) -> Void

    init(send: @escaping ([String: Any]) -> Void) {
        self.send = send
        super.init(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        isUserInteractionEnabled = false
        alpha = 0
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var canBecomeFirstResponder: Bool { true }

    var autocorrectionType: UITextAutocorrectionType { get { .no } set {} }
    var autocapitalizationType: UITextAutocapitalizationType { get { .sentences } set {} }
    var spellCheckingType: UITextSpellCheckingType { get { .no } set {} }
    var smartQuotesType: UITextSmartQuotesType { get { .no } set {} }
    var smartDashesType: UITextSmartDashesType { get { .no } set {} }
    var smartInsertDeleteType: UITextSmartInsertDeleteType { get { .no } set {} }

    var hasText: Bool { true }

    func insertText(_ text: String) {
        if text == "\n" { send(["key": "Enter"]) } else { send(["insert": text]) }
    }

    func deleteBackward() { send(["delete": true]) }
}
