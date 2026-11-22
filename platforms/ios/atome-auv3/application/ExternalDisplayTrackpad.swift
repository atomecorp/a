import UIKit

/// Connected screens (R-212): the Trackpad. The device's whole screen drives the connected screen's pointer
/// (design validated by the user, 19 Nov. 2026): no text on it; the page keeps two of its cells, Atome's logo (bottom
/// left, still the assistant's: its touches go through to the page) and the usual Close of Atome (bottom right, a little
/// faded: a veil of the pad's colour over it). The page draws the Close, the pad takes its touch: in that cell the
/// page's band would answer it (eVe/domains/rendering/external_display_trackpad.js).
///
/// The fingers: one moves the pointer; a tap is a click, two quick taps a double click (user, 19 Nov. 2026: « le double
/// clic est ignoré »); a tap then a finger that comes back and slides drags (the button held until it lifts); a tap of
/// two fingers is a right click; two fingers scroll (the wheel), or pinch (zoom: the wheel with Ctrl, as a trackpad's pinch reaches a
/// web page); one finger held still presses the button and keeps it down while it stays (a long press, as a finger
/// gives one: the Mystic opens, the finger slides to a tool, lifting picks it — user, 19 Nov. 2026: « clic long
/// maintenu, je drague, quand je relâche, ça lance l'outil »; a right click let go at once and froze the pointer). Once two fingers touched, the pointer stays still until every finger has lifted: the
/// last finger up never moves it (user, 19 Nov. 2026: « quand je relâche, la souris saute un peu »).
///
/// A first tap's click waits the time a finger has to come back (`dragWait`), as a trackpad's tap does when it may drag:
/// sliding, the finger drags and the click never comes — a click on one of several selected objects keeps only that one
/// (user, 19 Nov. 2026: two texts lassoed, « ça drague qu'un seul… et ça le désélectionne »); tapping again, both clicks go.
///
/// A mouse works with the pad open, on the screen only. Under AssistiveTouch its button is a tap of the system's
/// pointer on the device, here: taken for a finger, a click-and-drag moved the pointer twice (the mouse's moves, and the
/// "finger") and held no button (user, 19 Nov. 2026: « la souris est à la fois sur le trackpad et sur l'écran », no drag,
/// no lasso). A touch that starts under the system's pointer is the mouse's button: it presses, holds and releases it,
/// and its travel is left to the mouse's own moves.
final class ExternalDisplayTrackpad: UIView {
    struct Hole { let rect: CGRect; let veil: CGFloat; let closes: Bool }

    /// The pad's colour: the page's dark ground.
    private static let ground = UIColor(red: 0.125, green: 0.13, blue: 0.15, alpha: 1)
    /// Past this travel (points) a finger moves the pointer; under it, it may still be a tap or a hold.
    private static let slop: CGFloat = 8
    private static let tapTime: TimeInterval = 0.3
    /// After a tap, the time a finger has to come back down: then it drags if it slides, or clicks again if it taps.
    private static let dragWait: TimeInterval = 0.35
    private static let holdTime: TimeInterval = 0.4
    /// A held button lifted sooner than this after it went down, still, is let go then: the page's long press
    /// (external_display_pointer.js `RIGHT_CLICK_HOLD_MS`) has lasted.
    private static let longPress: TimeInterval = 0.8
    /// Two fingers' travel (points) to the wheel's pixels.
    private static let scrollGain: CGFloat = 2
    /// The travel (points) after which two fingers are known to scroll or to pinch, for the rest of the gesture.
    private static let twoFingerSlop: CGFloat = 10
    /// A pinch's spread, as a ratio, to the wheel's Ctrl pixels (a page's zoom reads exp(-deltaY / 100)).
    private static let pinchGain: CGFloat = 100

    var holes: [Hole] { didSet { setNeedsDisplay() } }
    private let move: (CGVector) -> Void
    private let press: (Int, Bool) -> Void
    private let wheel: (CGVector, Bool) -> Void
    private let close: () -> Void
    /// Whether a touch is the mouse's button (the system's pointer), and that button pressed or released.
    private let isMouse: (UITouch) -> Bool
    private let mousePress: (Bool) -> Void
    /// The finger down on the Close's cell.
    private var closing = false
    /// The mouse's button held, by this touch.
    private var mouseTouch: ObjectIdentifier?

    private var fingers: [ObjectIdentifier: CGPoint] = [:]
    private var began = Date.distantPast
    private var origin = CGPoint.zero
    private var moved = false
    private var several = false
    private var held = false
    /// When the held finger pressed the button, and whether the pointer has moved since.
    private var heldAt = Date.distantPast
    private var heldMoved = false
    private var heldOrigin = CGPoint.zero
    /// The held button's late release, waiting for the page's long press to have lasted.
    private var heldRelease: DispatchWorkItem?
    private var dragging = false
    private var lastTap = Date.distantPast
    /// A first tap's click, waiting to know whether the finger comes back to drag; its timer, stopped while the finger is
    /// back down (it decides then: sliding drops it, lifting sends it).
    private var tapWaiting = false
    private var tapTimer: DispatchWorkItem?
    /// The finger came back right after a tap: sliding, it drags.
    private var dragArmed = false
    private var hold: DispatchWorkItem?
    private enum TwoFingers { case undecided(spread: CGFloat, travel: CGFloat), scroll, pinch }
    private var twoFingers = TwoFingers.undecided(spread: 0, travel: 0)

    init(holes: [Hole], move: @escaping (CGVector) -> Void, press: @escaping (Int, Bool) -> Void,
         wheel: @escaping (CGVector, Bool) -> Void, close: @escaping () -> Void,
         isMouse: @escaping (UITouch) -> Bool, mousePress: @escaping (Bool) -> Void) {
        self.holes = holes
        self.isMouse = isMouse
        self.mousePress = mousePress
        self.move = move
        self.press = press
        self.wheel = wheel
        self.close = close
        super.init(frame: .zero)
        isOpaque = false
        backgroundColor = .clear
        isMultipleTouchEnabled = true
        contentMode = .redraw
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func draw(_ rect: CGRect) {
        let path = UIBezierPath(rect: bounds)
        holes.forEach { path.append(UIBezierPath(rect: $0.rect)) }
        path.usesEvenOddFillRule = true
        Self.ground.setFill()
        path.fill()
        for hole in holes where hole.veil > 0 {
            Self.ground.withAlphaComponent(hole.veil).setFill()
            UIBezierPath(rect: hole.rect).fill()
        }
    }

    /// The logo's cell takes its own touches.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if holes.contains(where: { !$0.closes && $0.rect.contains(point) }) { return nil }
        return super.hitTest(point, with: event)
    }

    /// Faster fingers carry the pointer further, as a trackpad does.
    private static func gain(_ delta: CGVector) -> CGFloat {
        1.5 + min(hypot(delta.dx, delta.dy) / 12, 2.5)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        if fingers.isEmpty, mouseTouch == nil, let touch = touches.first, touches.count == 1,
           !onClose(touch.location(in: self)), isMouse(touch) {
            mouseTouch = ObjectIdentifier(touch)
            mousePress(true)
            return
        }
        let own = touches.filter { ObjectIdentifier($0) != mouseTouch }
        guard !own.isEmpty else { return }
        flushHeldRelease()
        own.forEach { fingers[ObjectIdentifier($0)] = $0.location(in: self) }
        if fingers.count == 1, let touch = own.first, onClose(touch.location(in: self)) {
            closing = true
            return
        }
        if fingers.count == 1, let touch = own.first {
            began = Date()
            origin = touch.location(in: self)
            moved = false
            several = false
            held = false
            dragArmed = began.timeIntervalSince(lastTap) < Self.dragWait
            if dragArmed {
                tapTimer?.cancel()
                tapTimer = nil
            } else {
                let item = DispatchWorkItem { [weak self] in self?.holdReached() }
                hold = item
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.holdTime, execute: item)
            }
        } else if fingers.count > 1 {
            settleTap(send: true)
            if !several { twoFingers = .undecided(spread: 0, travel: 0) }
            several = true
            hold?.cancel()
        }
    }

    private func holdReached() {
        guard fingers.count == 1, !moved, !several, !dragging else { return }
        held = true
        heldAt = Date()
        heldMoved = false
        heldOrigin = fingers.values.first ?? origin
        press(0, true)
    }

    private func click() {
        press(0, true)
        press(0, false)
    }

    /// The first tap's click, sent now (`send`) or dropped (the finger came back to drag).
    private func settleTap(send: Bool) {
        tapTimer?.cancel()
        tapTimer = nil
        guard tapWaiting else { return }
        tapWaiting = false
        if send { click() }
    }

    /// A late release still waiting goes now (a new touch has come).
    private func flushHeldRelease() {
        guard let item = heldRelease else { return }
        heldRelease = nil
        item.cancel()
        press(0, false)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        let touches = touches.filter { ObjectIdentifier($0) != mouseTouch }
        if closing || touches.isEmpty { return }
        if fingers.count >= 2 {
            let keys = Array(fingers.keys.prefix(2))
            let before = keys.compactMap { fingers[$0] }
            for touch in touches where fingers[ObjectIdentifier(touch)] != nil { fingers[ObjectIdentifier(touch)] = touch.location(in: self) }
            let after = keys.compactMap { fingers[$0] }
            guard before.count == 2, after.count == 2 else { return }
            twoFingersMoved(before, after)
            return
        }
        // A finger left of two: still until it lifts too.
        guard !several else { return }
        guard let touch = touches.first, let last = fingers[ObjectIdentifier(touch)] else { return }
        let now = touch.location(in: self)
        fingers[ObjectIdentifier(touch)] = now
        if held {
            // The button held: the finger carries the pointer, pressed (over the Mystic's tools).
            // Still until the page's long press has lasted (a finger's tremor would undo it).
            if !heldMoved, Date().timeIntervalSince(heldAt) < Self.longPress,
               hypot(now.x - heldOrigin.x, now.y - heldOrigin.y) < Self.slop { return }
            let delta = CGVector(dx: now.x - last.x, dy: now.y - last.y)
            if delta.dx != 0 || delta.dy != 0 { heldMoved = true; move(CGVector(dx: delta.dx * Self.gain(delta), dy: delta.dy * Self.gain(delta))) }
            return
        }
        if !moved {
            guard hypot(now.x - origin.x, now.y - origin.y) > Self.slop else { return }
            moved = true
            hold?.cancel()
            if dragArmed {
                // Tapped, then back and sliding: the button goes down where the pointer is and the finger drags; the
                // tap's click is dropped.
                settleTap(send: false)
                dragArmed = false
                dragging = true
                press(0, true)
            }
            let delta = CGVector(dx: now.x - origin.x, dy: now.y - origin.y)
            move(CGVector(dx: delta.dx * Self.gain(delta), dy: delta.dy * Self.gain(delta)))
            return
        }
        let delta = CGVector(dx: now.x - last.x, dy: now.y - last.y)
        move(CGVector(dx: delta.dx * Self.gain(delta), dy: delta.dy * Self.gain(delta)))
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { lift(touches, cancelled: false) }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { lift(touches, cancelled: true) }

    /// Two fingers: their middle's travel scrolls, their spread zooms; the first to pass its slop decides the gesture.
    private func twoFingersMoved(_ before: [CGPoint], _ after: [CGPoint]) {
        let middle = { (points: [CGPoint]) in CGPoint(x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2) }
        let distance = { (points: [CGPoint]) in max(1, hypot(points[0].x - points[1].x, points[0].y - points[1].y)) }
        let from = middle(before), to = middle(after)
        let travel = CGVector(dx: to.x - from.x, dy: to.y - from.y)
        let ratio = distance(after) / distance(before)
        switch twoFingers {
        case .undecided(let spread, let moved):
            let nextSpread = spread + abs(distance(after) - distance(before)), nextTravel = moved + hypot(travel.dx, travel.dy)
            if nextSpread > Self.twoFingerSlop && nextSpread > nextTravel { twoFingers = .pinch }
            else if nextTravel > Self.twoFingerSlop { twoFingers = .scroll }
            else { twoFingers = .undecided(spread: nextSpread, travel: nextTravel) }
        case .scroll:
            if travel.dx != 0 || travel.dy != 0 { wheel(CGVector(dx: -travel.dx * Self.scrollGain, dy: -travel.dy * Self.scrollGain), false) }
        case .pinch:
            if ratio != 1 { wheel(CGVector(dx: 0, dy: -log(ratio) * Self.pinchGain), true) }
        }
    }

    private func onClose(_ point: CGPoint) -> Bool { holes.contains { $0.closes && $0.rect.contains(point) } }

    private func lift(_ touches: Set<UITouch>, cancelled: Bool) {
        if let mouse = mouseTouch, touches.contains(where: { ObjectIdentifier($0) == mouse }) {
            mouseTouch = nil
            mousePress(false)
        }
        let touches = touches.filter { fingers[ObjectIdentifier($0)] != nil }
        guard !touches.isEmpty else { return }
        let place = touches.first?.location(in: self)
        touches.forEach { fingers[ObjectIdentifier($0)] = nil }
        guard fingers.isEmpty else { return }
        if closing {
            closing = false
            if !cancelled, let place, onClose(place) { close() }
            return
        }
        hold?.cancel()
        let armed = dragArmed
        dragArmed = false
        let quick = !cancelled && Date().timeIntervalSince(began) < Self.tapTime
        if held {
            held = false
            let left = Self.longPress - Date().timeIntervalSince(heldAt)
            if heldMoved || left <= 0 || cancelled {
                press(0, false)
            } else {
                let item = DispatchWorkItem { [weak self] in self?.heldRelease = nil; self?.press(0, false) }
                heldRelease = item
                DispatchQueue.main.asyncAfter(deadline: .now() + left, execute: item)
            }
        } else if dragging {
            dragging = false
            press(0, false)
        } else if quick, several, case .undecided = twoFingers {
            // Two fingers tapped together: the right click.
            press(2, true)
            press(2, false)
        } else if quick, !several, !moved, !held {
            // A tap: the click; the page counts close clicks (external_display_pointer.js). A first tap's waits.
            lastTap = Date()
            if armed {
                settleTap(send: true)
                click()
            } else {
                settleTap(send: true)
                tapWaiting = true
                let item = DispatchWorkItem { [weak self] in self?.settleTap(send: true) }
                tapTimer = item
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.dragWait, execute: item)
            }
        } else {
            // Any other end (back but still, a hold, a scroll): the first tap was a click.
            settleTap(send: true)
        }
    }

    /// The pad going away: a button it holds is released.
    func release() {
        hold?.cancel()
        settleTap(send: false)
        flushHeldRelease()
        if held { held = false; press(0, false) }
        if dragging { dragging = false; press(0, false) }
        if mouseTouch != nil { mouseTouch = nil; mousePress(false) }
        fingers.removeAll()
    }
}
