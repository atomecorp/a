package one.atome.mobile

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.webkit.WebView
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

// A mouse on an Android phone with a connected screen (R-212, as on the iPhone, user 19 Nov. 2026: « la souris doit
// passer de l'un à l'autre », choice A): the pointer crosses the phone's edge to the screen and back, as between two
// screens of a Mac. A Presentation takes no input, so on the phone the system's pointer works alone; pushed hard past an
// edge, that edge leads to the screen for the whole session, the mouse is captured (`requestPointerCapture`, on the input
// sink, ExternalDisplayKeyboard.kt) and this pointer, drawn on the screen, hands each move, button and wheel turn to the
// screen's page (eVe/domains/rendering/external_display_pointer.js). The screen's opposite edge brings it back.
// Coordinates are the pages' CSS pixels.
object ExternalDisplayPointer {
    private enum class Side { DEVICE, DISPLAY }
    // The push past an edge (CSS pixels) that names it the screen's side, when no side is named yet.
    private const val NAMING_PUSH = 60f
    // The mouse's raw counts to CSS pixels (the iPhone's speed, user 19 Nov. 2026: « un peu rapide »).
    private const val SPEED = 0.5f
    private const val WHEEL_STEP = 8f

    private var side = Side.DEVICE
    private var x = 0f
    private var y = 0f
    private var edge: Int? = null
    private var pushEdge: Int? = null
    private var pushed = 0f
    private val buttons = mutableSetOf<Int>()
    private var host: WebView? = null
    private var display: WebView? = null
    private var cursor: CursorView? = null
    private var trackpad = false

    private const val LEFT = 0
    private const val TOP = 1
    private const val RIGHT = 2
    private const val BOTTOM = 3

    fun attach(host: WebView) {
        this.host = host
        // The system's pointer over the phone's page: its pushes past an edge.
        host.setOnHoverListener { view, event -> onDeviceHover(view, event); false }
        ExternalDisplayKeyboard.sink(host.context).setOnCapturedPointerListener { _, event -> onCaptured(event) }
    }

    fun attachDisplay(page: WebView, cursor: CursorView) {
        display = page
        this.cursor = cursor
        cursor.visibility = View.GONE
    }

    // The screen gone: the pointer comes back to the phone.
    fun detachDisplay() {
        trackpad = false
        if (side == Side.DISPLAY) toDevice()
        display = null
        cursor = null
    }

    val onDisplay get() = side == Side.DISPLAY

    // The mouse's capture lost (the app left the foreground): the pointer is the phone's again, unless the pad drives it.
    fun captureLost() {
        if (side == Side.DISPLAY && !trackpad) toDevice()
    }

    // The Trackpad open: the pointer works on the screen only, from its middle.
    fun openTrackpad() {
        val area = area(display) ?: return
        trackpad = true
        if (side == Side.DEVICE) { side = Side.DISPLAY; x = area.first / 2; y = area.second / 2 }
        showCursor()
        send(JSONObject().put("phase", "move"))
    }

    fun closeTrackpad() {
        if (!trackpad) return
        trackpad = false
        if (side == Side.DISPLAY) toDevice()
    }

    fun padMove(dx: Float, dy: Float) {
        val area = area(display) ?: return
        if (side != Side.DISPLAY) return
        x = min(max(x + dx, 0f), area.first - 1)
        y = min(max(y + dy, 0f), area.second - 1)
        showCursor()
        send(JSONObject().put("phase", "move"))
    }

    // `pad`: a press of the Trackpad, whose taps the page counts one fewer (external_display_pointer.js#padCount).
    fun press(button: Int, pressed: Boolean, pad: Boolean = false, meta: Int = 0) {
        if (side != Side.DISPLAY) return
        if (pressed == buttons.contains(button)) return
        if (pressed) buttons.add(button) else buttons.remove(button)
        send(JSONObject().put("phase", if (pressed) "down" else "up").put("button", button).put("pad", pad), meta)
    }

    fun wheel(dx: Float, dy: Float, ctrl: Boolean, meta: Int = 0) {
        if (side == Side.DISPLAY) send(JSONObject().put("phase", "wheel").put("dx", dx).put("dy", dy).put("ctrl", ctrl), meta)
    }

    // MARK: the phone's side

    private fun onDeviceHover(view: View, event: MotionEvent) {
        if (side != Side.DEVICE || display == null || !event.isFromSource(android.view.InputDevice.SOURCE_MOUSE)) return
        val density = view.resources.displayMetrics.density
        val width = view.width / density
        val height = view.height / density
        x = event.x / density
        y = event.y / density
        val dx = event.getAxisValue(MotionEvent.AXIS_RELATIVE_X) / density
        val dy = event.getAxisValue(MotionEvent.AXIS_RELATIVE_Y) / density
        val at = when {
            x <= 0.5f && dx < 0 -> LEFT to -dx
            x >= width - 1.5f && dx > 0 -> RIGHT to dx
            y <= 0.5f && dy < 0 -> TOP to -dy
            y >= height - 1.5f && dy > 0 -> BOTTOM to dy
            else -> null
        }
        if (at == null) { pushEdge = null; pushed = 0f; return }
        val along = if (at.first == LEFT || at.first == RIGHT) y / max(height, 1f) else x / max(width, 1f)
        val named = edge
        if (named != null) { if (at.first == named) toDisplay(along); return }
        pushed = (if (pushEdge == at.first) pushed else 0f) + at.second
        pushEdge = at.first
        if (pushed >= NAMING_PUSH) { edge = at.first; toDisplay(along) }
    }

    private fun toDisplay(along: Float) {
        val area = area(display) ?: return
        val entry = opposite(edge ?: return)
        side = Side.DISPLAY
        pushEdge = null
        pushed = 0f
        place(entry, along, area)
        val sink = ExternalDisplayKeyboard.sink(host?.context ?: return)
        sink.requestFocus()
        sink.requestPointerCapture()
        showCursor()
        send(JSONObject().put("phase", "move"))
    }

    private fun toDevice() {
        buttons.toList().forEach { press(it, false) }
        send(JSONObject().put("phase", "leave"))
        side = Side.DEVICE
        cursor?.visibility = View.GONE
        host?.let { page ->
            val sink = ExternalDisplayKeyboard.sink(page.context)
            if (sink.hasPointerCapture()) sink.releasePointerCapture()
            if (!ExternalDisplayKeyboard.open) page.requestFocus()
        }
    }

    // The captured mouse (relative counts) while the pointer is on the screen.
    private fun onCaptured(event: MotionEvent): Boolean {
        if (side != Side.DISPLAY) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE, MotionEvent.ACTION_HOVER_MOVE -> moveBy(event.x * SPEED, event.y * SPEED)
            MotionEvent.ACTION_BUTTON_PRESS -> button(event.actionButton)?.let { press(it, true, meta = event.metaState) }
            MotionEvent.ACTION_BUTTON_RELEASE -> button(event.actionButton)?.let { press(it, false, meta = event.metaState) }
            MotionEvent.ACTION_SCROLL -> wheel(-event.getAxisValue(MotionEvent.AXIS_HSCROLL) * WHEEL_STEP,
                -event.getAxisValue(MotionEvent.AXIS_VSCROLL) * WHEEL_STEP, false, event.metaState)
        }
        return true
    }

    private fun button(code: Int) = when (code) {
        MotionEvent.BUTTON_PRIMARY -> 0
        MotionEvent.BUTTON_SECONDARY -> 2
        else -> null
    }

    private fun moveBy(dx: Float, dy: Float) {
        val area = area(display) ?: return
        val wantedX = x + dx
        val wantedY = y + dy
        x = min(max(wantedX, 0f), area.first - 1)
        y = min(max(wantedY, 0f), area.second - 1)
        val named = edge
        val passed = when {
            wantedX < 0 -> LEFT
            wantedX > area.first - 1 -> RIGHT
            wantedY < 0 -> TOP
            wantedY > area.second - 1 -> BOTTOM
            else -> null
        }
        // The Trackpad open, the mouse stays on the screen.
        if (!trackpad && named != null && passed == opposite(named)) {
            toDevice()
            return
        }
        showCursor()
        send(JSONObject().put("phase", "move"))
    }

    // MARK: the screen's page

    private fun area(page: WebView?): Pair<Float, Float>? {
        val view = page ?: return null
        val density = view.resources.displayMetrics.density
        return if (view.width > 0 && view.height > 0) view.width / density to view.height / density else null
    }

    private fun place(entry: Int, along: Float, area: Pair<Float, Float>) {
        val f = min(max(along, 0f), 1f)
        when (entry) {
            LEFT -> { x = 0f; y = f * (area.second - 1) }
            RIGHT -> { x = area.first - 1; y = f * (area.second - 1) }
            TOP -> { x = f * (area.first - 1); y = 0f }
            else -> { x = f * (area.first - 1); y = area.second - 1 }
        }
    }

    private fun opposite(edge: Int) = (edge + 2) % 4

    private fun showCursor() {
        val view = cursor ?: return
        val density = view.resources.displayMetrics.density
        view.visibility = View.VISIBLE
        view.translationX = x * density
        view.translationY = y * density
    }

    private fun send(event: JSONObject, meta: Int = 0) {
        if (side != Side.DISPLAY) return
        val page = display ?: return
        // ⌘ (Meta), ⌥ (Alt) and ⇧ held on a keyboard: ⌘ + drag scales, ⌥ + drag turns (surface_pinch_runtime.js).
        event.put("x", x.toDouble()).put("y", y.toDouble())
            .put("meta", meta and KeyEvent.META_META_ON != 0 || meta and KeyEvent.META_CTRL_ON != 0)
            .put("alt", meta and KeyEvent.META_ALT_ON != 0).put("shift", meta and KeyEvent.META_SHIFT_ON != 0)
        page.evaluateJavascript("window.__eveVirtualPointer?.($event);", null)
    }

    // The usual arrow: white, outlined in black, its tip on the point.
    class CursorView(context: Context) : View(context) {
        private val density = context.resources.displayMetrics.density
        private val path = Path().apply {
            moveTo(0f, 0f); lineTo(0f, 17f); lineTo(4.5f, 13f); lineTo(7.5f, 20f); lineTo(10.5f, 18.7f); lineTo(7.6f, 12f); lineTo(13f, 12f); close()
        }
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.FILL; setShadowLayer(1.5f, 0f, 1f, 0x4D000000) }
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; style = Paint.Style.STROKE; strokeWidth = 1.2f; strokeJoin = Paint.Join.ROUND }

        init { setLayerType(LAYER_TYPE_SOFTWARE, null) }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) =
            setMeasuredDimension((16 * density).toInt(), (23 * density).toInt())

        override fun onDraw(canvas: Canvas) {
            canvas.scale(density, density)
            canvas.drawPath(path, fill)
            canvas.drawPath(path, stroke)
        }
    }
}
