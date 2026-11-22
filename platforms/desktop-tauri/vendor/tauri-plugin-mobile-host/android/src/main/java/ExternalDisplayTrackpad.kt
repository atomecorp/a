package one.atome.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

// Connected screens (R-212): the Trackpad on Android, the same pad as the iPhone's (ExternalDisplayTrackpad.swift, design
// and gestures validated by the user, 19 Nov. 2026). The phone's whole screen drives the screen's pointer: no text on it;
// the page keeps two of its cells, Atome's logo (its touches go through to the page) and the usual Close (the pad takes
// its touch). One finger moves the pointer; a tap is a click (a first tap waits `DRAG_WAIT` for a finger coming back to
// drag); a finger held still presses the button and keeps it down; two fingers scroll, or pinch (the wheel with Ctrl);
// a tap of two fingers is a right click; once two fingers touched, the pointer stays still until every finger lifted.
// The page's distances are CSS pixels: the pad's are taken in dp.
@SuppressLint("ViewConstructor")
class ExternalDisplayTrackpad(context: Context, holes: List<Hole>, private val close: () -> Unit) : View(context) {
    data class Hole(val rect: RectF, val veil: Float, val closes: Boolean)

    private companion object {
        const val GROUND = 0xFF202126.toInt()
        const val SLOP = 8f
        const val TAP_MS = 300L
        const val DRAG_WAIT_MS = 350L
        const val HOLD_MS = 400L
        // The page's long press (external_display_pointer.js `RIGHT_CLICK_HOLD_MS`).
        const val LONG_PRESS_MS = 800L
        const val SCROLL_GAIN = 2f
        const val TWO_FINGER_SLOP = 10f
        const val PINCH_GAIN = 100f
    }

    private enum class Two { UNDECIDED, SCROLL, PINCH }

    var holes: List<Hole> = holes
        set(value) { field = value; invalidate() }
    private val density = context.resources.displayMetrics.density
    private val main = Handler(Looper.getMainLooper())
    private val ground = Paint().apply { color = GROUND }
    private val fingers = mutableMapOf<Int, Pair<Float, Float>>()
    private var closing = false
    private var began = 0L
    private var origin = 0f to 0f
    private var moved = false
    private var several = false
    private var held = false
    private var heldAt = 0L
    private var heldMoved = false
    private var heldOrigin = 0f to 0f
    private var heldRelease: Runnable? = null
    private var dragging = false
    private var lastTap = 0L
    private var tapWaiting = false
    private var tapTimer: Runnable? = null
    private var dragArmed = false
    private var hold: Runnable? = null
    private var two = Two.UNDECIDED
    private var spread = 0f
    private var travel = 0f

    init { setBackgroundColor(Color.TRANSPARENT) }

    private fun press(button: Int, pressed: Boolean) = ExternalDisplayPointer.press(button, pressed, pad = true)
    private fun click() { press(0, true); press(0, false) }
    private fun now() = SystemClock.uptimeMillis()

    override fun onDraw(canvas: Canvas) {
        // The page shows through both cells (its logo, its Close on the pad's ground); a veil, where one is asked.
        canvas.save()
        holes.forEach { canvas.clipOutRect(it.rect.px()) }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), ground)
        canvas.restore()
        holes.filter { it.veil > 0f }.forEach { hole ->
            canvas.drawRect(hole.rect.px(), Paint().apply { color = GROUND; alpha = (hole.veil * 255).toInt() })
        }
    }

    private fun RectF.px() = RectF(left * density, top * density, right * density, bottom * density)
    private fun onClose(x: Float, y: Float) = holes.any { it.closes && it.rect.contains(x, y) }
    private fun inLogo(x: Float, y: Float) = holes.any { !it.closes && it.rect.contains(x, y) }

    // Faster fingers carry the pointer further, as a trackpad does.
    private fun gain(dx: Float, dy: Float) = 1.5f + min(hypot(dx, dy) / 12f, 2.5f)
    private fun move(dx: Float, dy: Float) { val g = gain(dx, dy); ExternalDisplayPointer.padMove(dx * g, dy * g) }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val index = event.actionIndex
        val id = event.getPointerId(index)
        val x = event.getX(index) / density
        val y = event.getY(index) / density
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // The logo's cell takes its own touches.
                if (inLogo(x, y)) return false
                down(id, x, y)
            }
            MotionEvent.ACTION_POINTER_DOWN -> down(id, x, y)
            MotionEvent.ACTION_MOVE -> moveFingers(event)
            MotionEvent.ACTION_POINTER_UP -> fingers.remove(id)
            MotionEvent.ACTION_UP -> { fingers.remove(id); lift(x, y, cancelled = false) }
            MotionEvent.ACTION_CANCEL -> { fingers.clear(); lift(x, y, cancelled = true) }
        }
        return true
    }

    private fun down(id: Int, x: Float, y: Float) {
        flushHeldRelease()
        fingers[id] = x to y
        if (fingers.size == 1 && onClose(x, y)) { closing = true; return }
        if (fingers.size == 1) {
            began = now()
            origin = x to y
            moved = false
            several = false
            held = false
            dragArmed = began - lastTap < DRAG_WAIT_MS
            if (dragArmed) {
                tapTimer?.let { main.removeCallbacks(it) }
                tapTimer = null
            } else {
                val item = Runnable { holdReached() }
                hold = item
                main.postDelayed(item, HOLD_MS)
            }
        } else {
            settleTap(send = true)
            if (!several) { two = Two.UNDECIDED; spread = 0f; travel = 0f }
            several = true
            hold?.let { main.removeCallbacks(it) }
        }
    }

    private fun holdReached() {
        if (fingers.size != 1 || moved || several || dragging) return
        held = true
        heldAt = now()
        heldMoved = false
        heldOrigin = fingers.values.firstOrNull() ?: origin
        press(0, true)
    }

    // The first tap's click, sent now (`send`) or dropped (the finger came back to drag).
    private fun settleTap(send: Boolean) {
        tapTimer?.let { main.removeCallbacks(it) }
        tapTimer = null
        if (!tapWaiting) return
        tapWaiting = false
        if (send) click()
    }

    private fun flushHeldRelease() {
        val item = heldRelease ?: return
        heldRelease = null
        main.removeCallbacks(item)
        press(0, false)
    }

    private fun moveFingers(event: MotionEvent) {
        if (closing) return
        val before = fingers.toMap()
        for (i in 0 until event.pointerCount) {
            val pid = event.getPointerId(i)
            if (fingers.containsKey(pid)) fingers[pid] = event.getX(i) / density to event.getY(i) / density
        }
        if (fingers.size >= 2) {
            val keys = before.keys.filter { fingers.containsKey(it) }.take(2)
            if (keys.size == 2) twoMoved(keys.map { before.getValue(it) }, keys.map { fingers.getValue(it) })
            return
        }
        // A finger left of two: still until it lifts too.
        if (several) return
        val (pid, now) = fingers.entries.firstOrNull()?.toPair() ?: return
        val last = before[pid] ?: return
        val dx = now.first - last.first
        val dy = now.second - last.second
        if (held) {
            // The button held: the finger carries the pointer, still until the page's long press has lasted.
            if (!heldMoved && now() - heldAt < LONG_PRESS_MS && hypot(now.first - heldOrigin.first, now.second - heldOrigin.second) < SLOP) return
            if (dx != 0f || dy != 0f) { heldMoved = true; move(dx, dy) }
            return
        }
        if (!moved) {
            if (hypot(now.first - origin.first, now.second - origin.second) <= SLOP) return
            moved = true
            hold?.let { main.removeCallbacks(it) }
            if (dragArmed) {
                // Tapped, then back and sliding: the button goes down and the finger drags; the tap's click is dropped.
                settleTap(send = false)
                dragArmed = false
                dragging = true
                press(0, true)
            }
            move(now.first - origin.first, now.second - origin.second)
            return
        }
        move(dx, dy)
    }

    // Two fingers: their middle's travel scrolls, their spread zooms; the first to pass its slop decides the gesture.
    private fun twoMoved(before: List<Pair<Float, Float>>, after: List<Pair<Float, Float>>) {
        fun middle(p: List<Pair<Float, Float>>) = (p[0].first + p[1].first) / 2 to (p[0].second + p[1].second) / 2
        fun distance(p: List<Pair<Float, Float>>) = max(1f, hypot(p[0].first - p[1].first, p[0].second - p[1].second))
        val from = middle(before)
        val to = middle(after)
        val tx = to.first - from.first
        val ty = to.second - from.second
        val ratio = distance(after) / distance(before)
        when (two) {
            Two.UNDECIDED -> {
                spread += abs(distance(after) - distance(before))
                travel += hypot(tx, ty)
                if (spread > TWO_FINGER_SLOP && spread > travel) two = Two.PINCH
                else if (travel > TWO_FINGER_SLOP) two = Two.SCROLL
            }
            Two.SCROLL -> if (tx != 0f || ty != 0f) ExternalDisplayPointer.wheel(-tx * SCROLL_GAIN, -ty * SCROLL_GAIN, false)
            Two.PINCH -> if (ratio != 1f) ExternalDisplayPointer.wheel(0f, -ln(ratio) * PINCH_GAIN, true)
        }
    }

    private fun lift(x: Float, y: Float, cancelled: Boolean) {
        if (fingers.isNotEmpty()) return
        if (closing) {
            closing = false
            if (!cancelled && onClose(x, y)) close()
            return
        }
        hold?.let { main.removeCallbacks(it) }
        val armed = dragArmed
        dragArmed = false
        val quick = !cancelled && now() - began < TAP_MS
        when {
            held -> {
                held = false
                val left = LONG_PRESS_MS - (now() - heldAt)
                if (heldMoved || left <= 0 || cancelled) press(0, false)
                else {
                    val item = Runnable { heldRelease = null; press(0, false) }
                    heldRelease = item
                    main.postDelayed(item, left)
                }
            }
            dragging -> { dragging = false; press(0, false) }
            // Two fingers tapped together: the right click.
            quick && several && two == Two.UNDECIDED -> { press(2, true); press(2, false) }
            quick && !several && !moved -> {
                lastTap = now()
                if (armed) { settleTap(send = true); click() }
                else {
                    settleTap(send = true)
                    tapWaiting = true
                    val item = Runnable { settleTap(send = true) }
                    tapTimer = item
                    main.postDelayed(item, DRAG_WAIT_MS)
                }
            }
            // Any other end (back but still, a hold, a scroll): the first tap was a click.
            else -> settleTap(send = true)
        }
    }

    // The pad going away: a button it holds is released.
    fun release() {
        hold?.let { main.removeCallbacks(it) }
        settleTap(send = false)
        flushHeldRelease()
        if (held) { held = false; press(0, false) }
        if (dragging) { dragging = false; press(0, false) }
        fingers.clear()
    }
}
