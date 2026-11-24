import ObjectiveC
import OSLog
import UIKit

/// What holds the system's pointer on the device while the app's pointer works on the connected screen
/// (ExternalDisplayPointer.swift, R-212).
///
/// An iPad's pointer, left unlocked, stops at the iPad's edge, where the app's pointer crosses to the screen. Pinned
/// there, it hands the app no move any more: iPadOS gives an unlocked pointer's deltas only while it can move, and
/// pushing it on against the edge raises the menu bar or the Dock (user, 24 Nov. 2026: « la souris connectée à l'iPad
/// se bloque dès qu'elle entre dans le moniteur externe »). So while the app's pointer is on the screen the iPad's pointer
/// is locked (UIKit's pointer lock, the documented way to read a mouse's moves past every edge): hidden and still, every
/// move reaching GameController. Back on the iPad, it is let go and works alone again. An iPhone has no pointer lock
/// (its pointer is AssistiveTouch's): there the shield below takes the system's pointer's taps instead.
/// Main thread only, as the pointer that asks it.
final class ExternalDisplayPointerLock {
    static let shared = ExternalDisplayPointerLock()
    private let log = Logger(subsystem: "atome", category: "ExternalDisplay")
    private var wanted = false
    /// The root controller classes asked for the lock (the app's window's root is SwiftUI's hosting controller, which
    /// gives UIKit no way to ask it: no child for the pointer lock, no preference of its own).
    private var installed: Set<ObjectIdentifier> = []
    private var observing = false

    private init() {}

    /// `locked`: the app's pointer works on the screen with a mouse. Only an iPad locks its pointer.
    func want(_ locked: Bool) {
        guard UIDevice.current.userInterfaceIdiom == .pad, locked != wanted else { return }
        wanted = locked
        guard let root = Self.appRoot else {
            log.error("external display pointer lock: the app's window has no root controller")
            return
        }
        install(on: root)
        observe()
        root.setNeedsUpdateOfPrefersPointerLocked()
    }

    /// The app's own window's root controller (its page's window, never a Follow window).
    private static var appRoot: UIViewController? { AppPageHost.shared.webView.window?.rootViewController }

    /// UIKit asks the root controller of a scene's window whether the pointer is to be locked; SwiftUI's root never
    /// asks the app. Its class is given the app's answer, for the app's own window only.
    private func install(on root: UIViewController) {
        let type: AnyClass = object_getClass(root) ?? UIViewController.self
        guard installed.insert(ObjectIdentifier(type)).inserted else { return }
        let answer: @convention(block) (UIViewController) -> Bool = { controller in
            ExternalDisplayPointerLock.shared.wanted && controller === ExternalDisplayPointerLock.appRoot
        }
        let selector = #selector(getter: UIViewController.prefersPointerLocked)
        if !class_addMethod(type, selector, imp_implementationWithBlock(answer), "B@:") {
            log.error("external display pointer lock: \(NSStringFromClass(type), privacy: .public) answers the lock itself")
        }
    }

    /// What iPadOS grants, in the device's log: a lock asked is only a request (it is refused to a window that does not
    /// fill its screen, as in Stage Manager), and the shield then takes the pointer's taps as before.
    private func observe() {
        guard !observing else { return }
        observing = true
        NotificationCenter.default.addObserver(forName: UIPointerLockState.didChangeNotification, object: nil, queue: .main) { [log] note in
            guard let scene = note.userInfo?[UIPointerLockState.sceneUserInfoKey] as? UIScene else { return }
            let locked = scene.pointerLockState?.isLocked == true
            log.notice("external display pointer lock: \(locked ? "locked" : "free", privacy: .public)")
            print("[pointer] lock \(locked ? "locked" : "free")")
        }
    }
}

/// Over the device's page while the pointer is on the connected screen: the taps of the system's pointer (the mouse's
/// buttons, under AssistiveTouch) become the pointer's clicks there. Transparent to every other touch: a finger on the
/// device keeps its page (user, 19 Nov. 2026: the Trackpad's case « ça clique sur le moniteur à la place »).
/// While the pointer works on the screen, the system's pointer left on the device (held at its edge, where its taps are
/// the clicks) is hidden there (user, 20 Nov. 2026: « un pointeur circulaire qui continue de pointer sur l'écran du
/// téléphone »): the shield is the view under it then, and asks iOS for no pointer over it.
final class DevicePageShield: UIView, UIPointerInteractionDelegate {
    private let active: (CGPoint) -> Bool
    private let press: (Bool) -> Void

    init(active: @escaping (CGPoint) -> Bool, press: @escaping (Bool) -> Void) {
        self.active = active
        self.press = press
        super.init(frame: .zero)
        backgroundColor = .clear
        isMultipleTouchEnabled = false
        addInteraction(UIPointerInteraction(delegate: self))
    }

    func pointerInteraction(_ interaction: UIPointerInteraction, styleFor region: UIPointerRegion) -> UIPointerStyle? {
        .hidden()
    }

    required init?(coder: NSCoder) { nil }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        bounds.contains(point) && active(convert(point, to: superview)) ? self : nil
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        print("[pointer] shielded touch, type \(touches.first?.type.rawValue ?? -1)")
        press(true)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { press(false) }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { press(false) }
}
