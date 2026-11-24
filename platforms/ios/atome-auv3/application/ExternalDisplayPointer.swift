import GameController
import OSLog
import UIKit
import WebKit

/// A mouse on an iPhone (R-212, user, 19 Nov. 2026: « la souris doit passer de l'un à l'autre », choice A: the
/// pointer crosses the screen's edge, as between two screens of a Mac). An iPhone shows no pointer of its own and
/// iOS gives a connected screen's scene no input at all (`externalNonInteractive`): the app reads the mouse itself
/// (GameController), moves its own pointer over the device's page or the connected screen's page, draws it there,
/// and hands each move, button and wheel turn to the page under it (eVe/domains/rendering/external_display_pointer.js).
///
/// Which side the screen lies on is not asked: the first time the pointer is pushed hard past an edge of the device,
/// that edge leads to the screen, for the whole session (user: « une fois que la direction est établie, elle reste
/// fixe pendant toute la session »). The screen's opposite edge leads back.
///
/// An iPhone hands an app its mouse only while AssistiveTouch is on (iOS 27: a mouse without it is announced, its
/// moves are not), and AssistiveTouch draws its own pointer, which taps the device's page itself. On the device the
/// system's pointer works alone: this pointer follows it (its hover), draws nothing and sends nothing there. On the
/// screen this pointer works. AssistiveTouch keeps the mouse's buttons for itself (the app gets the moves and the
/// wheel, never a button): a click is a tap of the system's pointer, held against the device's edge. While this
/// pointer is on the screen, the device's page is shielded and each of those taps is this pointer's click there.
///
/// An iPad (R-212, 20 Nov. 2026) has a system pointer of its own, mouse or trackpad, and hands the app its moves and its
/// buttons; it stays on the iPad's screen (the screen's scene takes no input). The same crossing applies: on the iPad the
/// system's pointer works alone; past the edge this pointer works on the screen, the system's one, held at the iPad's
/// edge, locked (ExternalDisplayPointerHold.swift: unlocked, pinned at the edge, it hands the app no move any more and the
/// pointer froze on the screen, user 24 Nov. 2026), else hidden by the shield, which takes its clicks. A button reaching
/// the screen's page twice (the mouse's button, the shield's tap) is pressed once.
final class ExternalDisplayPointer {
    static let shared = ExternalDisplayPointer()

    private enum Side { case device, display }
    /// The push past an edge (in points) that names it the screen's side, when no side is named yet.
    private static let namingPush: CGFloat = 60
    /// A wheel step in CSS pixels.
    private static let wheelStep: CGFloat = 8
    /// The mouse's raw moves, slowed to a Mac's pointer speed (user, 19 Nov. 2026: « un peu rapide »).
    private static let speed: CGFloat = 0.5

    private let log = Logger(subsystem: "atome", category: "ExternalDisplay")
    private var side: Side = .device {
        // A button still down is released on the side the pointer leaves.
        willSet { if newValue != side { releaseButtons() } }
        didSet { holdSystemPointer() }
    }
    private var point = CGPoint(x: 40, y: 120)
    private var displayEdge: UIRectEdge?
    private var push: (edge: UIRectEdge, amount: CGFloat)?
    private weak var display: WKWebView?
    private var cursors: [Side: CAShapeLayer] = [:]
    private var pendingMove = false
    private var frame: CADisplayLink?
    private var mice = 0 { didSet { holdSystemPointer() } }
    private var started = false
    /// The system's pointer (AssistiveTouch) seen over the device's page: it works there alone.
    private var systemPointer = false
    /// Where the system's pointer was last seen over the device's page (its hover), on either side.
    private var systemPointerAt: CGPoint?
    /// A touch this close (points) to the system's pointer is its tap: the mouse's button.
    private static let systemPointerReach: CGFloat = 6
    private var shieldPressed = false
    /// The buttons down on the screen's page: a press reaches it once, whichever way it came.
    private var pressedButtons: Set<Int> = []
    /// The Trackpad (ExternalDisplayTrackpad.swift), while it is open over the device's page.
    private var trackpad: ExternalDisplayTrackpad?
    private lazy var shield = DevicePageShield(
        active: { [weak self] point in self?.side == .display && self?.trackpad == nil && self?.underSystemPointer(point) == true },
        press: { [weak self] pressed in self?.shieldPress(pressed) }
    )

    /// An iPad's pointer is locked while a mouse drives this pointer on the screen (ExternalDisplayPointerHold.swift).
    private func holdSystemPointer() { ExternalDisplayPointerLock.shared.want(side == .display && mice > 0) }

    /// A tap of the system's pointer while this pointer is on the screen: its click there.
    private func shieldPress(_ pressed: Bool) {
        guard pressed != shieldPressed, side == .display || !pressed else { return }
        shieldPressed = pressed
        trace("tap", "\(pressed)")
        press(button: 0, pressed)
    }

    private init() {}

    private var traced: [String: Int] = [:]
    private func trace(_ kind: String, _ value: String) {
        let count = (traced[kind] ?? 0) + 1
        traced[kind] = count
        if count <= 5 || count % 200 == 0 { print("[pointer] \(kind) #\(count): \(value)") }
    }

    /// Once per app run: the mice connected now and later.
    func start() {
        guard !started else { return }
        started = true
        let center = NotificationCenter.default
        center.addObserver(forName: .GCMouseDidConnect, object: nil, queue: .main) { [weak self] note in
            if let mouse = note.object as? GCMouse { self?.adopt(mouse) }
        }
        center.addObserver(forName: .GCMouseDidDisconnect, object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }
            self.mice = max(0, self.mice - 1)
            if self.mice == 0 && self.trackpad == nil { self.hideCursors() }
        }
        GCMouse.mice().forEach(adopt)
        center.addObserver(forName: .externalDisplayPageMessage, object: nil, queue: .main) { [weak self] note in
            self?.pageMessage(note.userInfo as? [String: Any] ?? [:])
        }
        let page = AppPageHost.shared.webView
        let hover = UIHoverGestureRecognizer(target: self, action: #selector(onSystemPointer(_:)))
        hover.cancelsTouchesInView = false
        page.addGestureRecognizer(hover)
        shield.frame = page.bounds
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        page.addSubview(shield)
    }

    /// The system's pointer over the device's page: this pointer is where it is, while it is on the device.
    @objc private func onSystemPointer(_ recognizer: UIHoverGestureRecognizer) {
        guard let view = recognizer.view else { return }
        let location = recognizer.location(in: view)
        systemPointerAt = location
        guard side == .device else { return }
        trace("hover", "\(Int(location.x)) \(Int(location.y))")
        if !systemPointer { systemPointer = true; showCursor() }
        point = location
    }

    func attach(display webView: WKWebView) {
        display = webView
        tellScreen()
    }

    /// The screen gone: the pointer comes back to the device, at the edge it had left by.
    func detachDisplay() {
        closeTrackpad(tellPage: true)
        if side == .display { cross(to: .device, along: 0.5) }
        cursors[.display]?.removeFromSuperlayer()
        cursors[.display] = nil
        display = nil
        tellScreen()
    }

    // MARK: the trackpad

    /// The device's page: `{ type: 'screen' }` asks whether a screen is connected; `{ type: 'trackpad', open, holes }`
    /// opens or closes the Trackpad (eVe/domains/rendering/external_display_trackpad.js).
    private func pageMessage(_ message: [String: Any]) {
        switch message["type"] as? String {
        case "screen": tellScreen()
        case "trackpad":
            if message["open"] as? Bool == true { openTrackpad(holes: Self.holes(message["holes"])) } else { closeTrackpad(tellPage: false) }
        // Extended (R-212, external_display_mode.js): the screen goes on past the device's right edge, so that edge leads
        // to it; mirror leaves the side to the first push.
        case "screen-edge":
            if message["edge"] as? String == "right" { displayEdge = .right }
        default: break
        }
    }

    private func tellScreen() {
        guard started else { return }
        let connected = display != nil
        AppPageHost.shared.webView.evaluateJavaScript(
            "window.__eveExternalDisplayScreen?.({ connected: \(connected), trackpad: \(connected) });") { [log] _, error in
            if let error { log.error("external display screen not told: \(error.localizedDescription, privacy: .public)") }
        }
    }

    private static func holes(_ value: Any?) -> [ExternalDisplayTrackpad.Hole] {
        (value as? [[String: Any]] ?? []).compactMap { hole in
            let number = { (key: String) in CGFloat((hole[key] as? NSNumber)?.doubleValue ?? 0) }
            let rect = CGRect(x: number("x"), y: number("y"), width: number("width"), height: number("height"))
            return rect.width > 0 && rect.height > 0 ? .init(rect: rect, veil: number("veil"), closes: hole["close"] as? Bool == true) : nil
        }
    }

    private func openTrackpad(holes: [ExternalDisplayTrackpad.Hole]) {
        if let trackpad { trackpad.holes = holes; return }
        guard let display else { tellTrackpadClosed(); return }
        let page = AppPageHost.shared.webView
        if side == .device {
            side = .display
            point = CGPoint(x: display.bounds.midX, y: display.bounds.midY)
        }
        let pad = ExternalDisplayTrackpad(
            holes: holes,
            move: { [weak self] delta in self?.trackpadMove(by: delta) },
            press: { [weak self] button, pressed in self?.press(button: button, pressed, pad: true) },
            wheel: { [weak self] delta, ctrl in self?.send(["phase": "wheel", "dx": delta.dx, "dy": delta.dy, "ctrl": ctrl]) },
            close: { [weak self] in self?.closeTrackpad(tellPage: true) },
            isMouse: { [weak self] touch in self?.isSystemPointer(touch) ?? false },
            mousePress: { [weak self] pressed in self?.shieldPress(pressed) }
        )
        pad.frame = page.bounds
        pad.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        page.addSubview(pad)
        trackpad = pad
        showCursor()
        send(["phase": "move"])
    }

    /// `tellPage`: the pad closed by the app (the screen gone), not by the page.
    private func closeTrackpad(tellPage: Bool) {
        guard let pad = trackpad else { return }
        pad.release()
        pad.removeFromSuperview()
        trackpad = nil
        // The pad closed, the device's page is touched again, a mouse connected or not (user, 19 Nov. 2026: « quand je
        // ferme le trackpad, il continue d'être actif »: a connected mouse kept the pointer on the screen and the device's
        // page shielded). A mouse brings the pointer back to the screen by pushing past the device's edge.
        if side == .display { send(["phase": "leave"]) }
        if shieldPressed { shieldPress(false) }
        side = .device
        point = CGPoint(x: bounds(.device).midX, y: bounds(.device).midY)
        cursors[.display]?.isHidden = true
        showCursor()
        if tellPage { tellTrackpadClosed() }
    }

    /// A touch of the system's pointer (a mouse under AssistiveTouch): an indirect one, or one under its hover. Its
    /// taps reach the app as a finger's (direct: the device's journal, 19 Nov. 2026), only their place tells them apart.
    private func isSystemPointer(_ touch: UITouch) -> Bool {
        if touch.type == .indirectPointer || touch.type == .indirect { return true }
        return underSystemPointer(touch.location(in: AppPageHost.shared.webView))
    }

    private func underSystemPointer(_ place: CGPoint) -> Bool {
        guard mice > 0, let at = systemPointerAt else { return false }
        return hypot(place.x - at.x, place.y - at.y) <= Self.systemPointerReach
    }

    private func tellTrackpadClosed() {
        AppPageHost.shared.webView.evaluateJavaScript("window.__eveExternalDisplayTrackpad?.({ open: false });", completionHandler: nil)
    }

    /// The pad's finger: the pointer moves on the screen only, held inside it.
    private func trackpadMove(by delta: CGVector) {
        guard side == .display else { return }
        let area = bounds(.display)
        guard area.width > 0, area.height > 0 else { return }
        point = CGPoint(x: min(max(point.x + delta.dx, 0), area.width - 1), y: min(max(point.y + delta.dy, 0), area.height - 1))
        scheduleMove()
        showCursor()
    }

    private func adopt(_ mouse: GCMouse) {
        guard let input = mouse.mouseInput else { return }
        mice += 1
        log.notice("external display pointer: mouse connected (\(self.mice))")
        // On stdout too (`devicectl … --console`): what iOS hands the app, the first events of each kind.
        print("[pointer] mouse connected: \(mouse.vendorName ?? "?"), \(mice) in all")
        input.mouseMovedHandler = { [weak self] _, dx, dy in
            self?.trace("move", "\(dx) \(dy)")
            self?.move(by: CGVector(dx: CGFloat(dx) * Self.speed, dy: CGFloat(-dy) * Self.speed))
        }
        input.leftButton.pressedChangedHandler = { [weak self] _, _, pressed in self?.trace("left", "\(pressed)"); self?.press(button: 0, pressed) }
        input.rightButton?.pressedChangedHandler = { [weak self] _, _, pressed in self?.trace("right", "\(pressed)"); self?.press(button: 2, pressed) }
        input.scroll.valueChangedHandler = { [weak self] _, x, y in
            self?.trace("wheel", "\(x) \(y)")
            self?.send(["phase": "wheel", "dx": -CGFloat(x) * Self.wheelStep, "dy": -CGFloat(y) * Self.wheelStep])
        }
        showCursor()
    }

    // MARK: moving

    private func page(_ side: Side) -> WKWebView? { side == .device ? AppPageHost.shared.webView : display }

    private func bounds(_ side: Side) -> CGRect { page(side)?.bounds ?? .zero }

    private func move(by delta: CGVector) {
        let area = bounds(side)
        guard area.width > 0, area.height > 0 else { return }
        let wanted = CGPoint(x: point.x + delta.dx, y: point.y + delta.dy)
        point = CGPoint(x: min(max(wanted.x, 0), area.width - 1), y: min(max(wanted.y, 0), area.height - 1))
        if let edge = Self.edge(passed: wanted, in: area) { pushed(edge, by: Self.overshoot(wanted, edge, area)) } else { push = nil }
        showCursor()
        scheduleMove()
    }

    private func pushed(_ edge: UIRectEdge, by amount: CGFloat) {
        guard display != nil else { return }
        let along = Self.fraction(point, along: edge, in: bounds(side))
        if side == .device {
            if let displayEdge {
                if edge == displayEdge { cross(to: .display, along: along) }
                return
            }
            let total = (push?.edge == edge ? push!.amount : 0) + amount
            push = (edge, total)
            if total >= Self.namingPush {
                displayEdge = edge
                log.notice("external display pointer: the screen lies past the device's \(Self.name(edge), privacy: .public) edge")
                cross(to: .display, along: along)
            }
        } else if trackpad == nil, let displayEdge, edge == Self.opposite(displayEdge) {
            // The Trackpad open, the mouse stays on the screen: the device's page is the pad's.
            cross(to: .device, along: along)
        }
    }

    /// Enters the other side by its edge that faces this one, at the same fraction along it.
    private func cross(to target: Side, along: CGFloat) {
        guard let displayEdge else { return }
        if shieldPressed { shieldPress(false) }
        send(["phase": "leave"])
        flushMove()
        let entry = target == .display ? Self.opposite(displayEdge) : displayEdge
        side = target
        push = nil
        point = Self.point(along: along, on: entry, in: bounds(target))
        showCursor()
        scheduleMove()
    }

    /// `pad`: a press of the Trackpad, whose taps the page counts one fewer (external_display_pointer.js).
    private func press(button: Int, _ pressed: Bool, pad: Bool = false) {
        // On the device the system's pointer clicks itself; a press reaches the screen's page once.
        if side == .device && systemPointer { return }
        guard pressedButtons.contains(button) != pressed else { return }
        if pressed { pressedButtons.insert(button) } else { pressedButtons.remove(button) }
        flushMove()
        send(["phase": pressed ? "down" : "up", "button": button, "pad": pad])
    }

    /// The buttons still down where the pointer was: released there before it goes (or the pad closes).
    private func releaseButtons() {
        let held = pressedButtons
        pressedButtons = []
        held.forEach { send(["phase": "up", "button": $0]) }
    }

    // MARK: the page

    private func scheduleMove() {
        pendingMove = true
        if frame == nil {
            let link = CADisplayLink(target: self, selector: #selector(onFrame))
            link.add(to: .main, forMode: .common)
            frame = link
        }
    }

    @objc private func onFrame() {
        flushMove()
        frame?.invalidate()
        frame = nil
    }

    private func flushMove() {
        guard pendingMove else { return }
        pendingMove = false
        send(["phase": "move"])
    }

    private func send(_ event: [String: Any]) {
        if side == .device && systemPointer { return }
        guard let webView = page(side) else { return }
        var body = event
        body["x"] = point.x
        body["y"] = point.y
        // ⌘, ⌥ and ⇧ held on the keyboard: ⌘ + drag scales an object, ⌥ + drag turns it, ⌘ + wheel scales it
        // (surface_pinch_runtime.js), as with a computer's mouse.
        let keys = Self.modifierKeys()
        body["meta"] = keys.meta
        body["alt"] = keys.alt
        body["shift"] = keys.shift
        guard let data = try? JSONSerialization.data(withJSONObject: body),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.__eveVirtualPointer?.(\(json));") { [log] _, error in
            if let error { log.error("external display pointer not delivered: \(error.localizedDescription, privacy: .public)") }
        }
    }

    /// The modifiers held on a keyboard connected to the device, read at the moment of the event.
    private static func modifierKeys() -> (meta: Bool, alt: Bool, shift: Bool) {
        guard let keyboard = GCKeyboard.coalesced?.keyboardInput else { return (false, false, false) }
        let held = { (codes: [GCKeyCode]) in codes.contains { keyboard.button(forKeyCode: $0)?.isPressed == true } }
        return (held([.leftGUI, .rightGUI]), held([.leftAlt, .rightAlt]), held([.leftShift, .rightShift]))
    }

    // MARK: the drawn pointer

    private func showCursor() {
        guard mice > 0 || trackpad != nil else { return }
        for candidate in [Side.device, .display] {
            guard let webView = page(candidate) else { continue }
            let layer = cursors[candidate] ?? Self.makeCursor()
            if layer.superlayer !== webView.layer { webView.layer.addSublayer(layer) }
            cursors[candidate] = layer
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.isHidden = candidate != side || (candidate == .device && systemPointer)
            layer.position = point
            layer.zPosition = 10_000
            CATransaction.commit()
        }
    }

    private func hideCursors() { cursors.values.forEach { $0.isHidden = true } }

    /// The usual arrow: white, outlined in black, its tip on the point.
    private static func makeCursor() -> CAShapeLayer {
        let path = UIBezierPath()
        path.move(to: .zero)
        path.addLine(to: CGPoint(x: 0, y: 17))
        path.addLine(to: CGPoint(x: 4.5, y: 13))
        path.addLine(to: CGPoint(x: 7.5, y: 20))
        path.addLine(to: CGPoint(x: 10.5, y: 18.7))
        path.addLine(to: CGPoint(x: 7.6, y: 12))
        path.addLine(to: CGPoint(x: 13, y: 12))
        path.close()
        let layer = CAShapeLayer()
        layer.path = path.cgPath
        layer.fillColor = UIColor.white.cgColor
        layer.strokeColor = UIColor.black.cgColor
        layer.lineWidth = 1.2
        layer.lineJoin = .round
        layer.bounds = CGRect(x: 0, y: 0, width: 14, height: 21)
        layer.anchorPoint = .zero
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowRadius = 1.5
        layer.shadowOffset = CGSize(width: 0, height: 1)
        return layer
    }

    // MARK: edges

    private static func edge(passed wanted: CGPoint, in area: CGRect) -> UIRectEdge? {
        if wanted.x < 0 { return .left }
        if wanted.x > area.width - 1 { return .right }
        if wanted.y < 0 { return .top }
        if wanted.y > area.height - 1 { return .bottom }
        return nil
    }

    private static func overshoot(_ wanted: CGPoint, _ edge: UIRectEdge, _ area: CGRect) -> CGFloat {
        switch edge {
        case .left: return -wanted.x
        case .right: return wanted.x - (area.width - 1)
        case .top: return -wanted.y
        default: return wanted.y - (area.height - 1)
        }
    }

    private static func opposite(_ edge: UIRectEdge) -> UIRectEdge {
        switch edge {
        case .left: return .right
        case .right: return .left
        case .top: return .bottom
        default: return .top
        }
    }

    private static func fraction(_ point: CGPoint, along edge: UIRectEdge, in area: CGRect) -> CGFloat {
        edge == .left || edge == .right ? point.y / max(area.height, 1) : point.x / max(area.width, 1)
    }

    private static func point(along fraction: CGFloat, on edge: UIRectEdge, in area: CGRect) -> CGPoint {
        let f = min(max(fraction, 0), 1)
        switch edge {
        case .left: return CGPoint(x: 0, y: f * (area.height - 1))
        case .right: return CGPoint(x: area.width - 1, y: f * (area.height - 1))
        case .top: return CGPoint(x: f * (area.width - 1), y: 0)
        default: return CGPoint(x: f * (area.width - 1), y: area.height - 1)
        }
    }

    private static func name(_ edge: UIRectEdge) -> String {
        switch edge {
        case .left: return "left"
        case .right: return "right"
        case .top: return "top"
        default: return "bottom"
        }
    }
}
