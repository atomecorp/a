package one.atome.mobile

import android.content.Context
import android.text.InputType
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import org.json.JSONObject

// Connected screens (R-212): the phone's keyboard for the screen's page, as on the iPhone (ExternalDisplayKeyboard.swift).
// A Presentation takes no keys, so a text edited on the screen opened no keyboard. When the screen's page focuses an
// editable element it asks for the keyboard (`AtomeExternalDisplay.post({ type: 'keyboard', open })`); an invisible
// sink on the phone's page then takes the focus and opens the phone's keyboard, and each key goes to the screen's page
// (eVe/domains/rendering/external_display_keyboard.js). A keyboard connected to the phone types there too.
// The same sink holds the mouse's capture while the pointer is on the screen (ExternalDisplayPointer.kt): a capture
// belongs to the focused view, and typing must not take the mouse back.
object ExternalDisplayKeyboard {
    private var sink: Sink? = null
    private var screen: WebView? = null
    private var host: WebView? = null
    var open = false
        private set

    fun sink(context: Context): Sink = sink ?: Sink(context).also { sink = it }

    fun attach(host: WebView, content: ViewGroup) {
        this.host = host
        val view = sink(host.context)
        if (view.parent == null) content.addView(view, ViewGroup.LayoutParams(1, 1))
    }

    fun attachDisplay(page: WebView?) { screen = page; if (page == null) set(false) }

    fun set(open: Boolean) {
        val view = sink ?: return
        this.open = open
        val keyboard = view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        if (open) {
            view.requestFocus()
            keyboard.restartInput(view)
            keyboard.showSoftInput(view, 0)
        } else {
            keyboard.hideSoftInputFromWindow(view.windowToken, 0)
            // The phone's page takes its keys again, unless the mouse works on the screen (the sink holds its capture).
            if (!ExternalDisplayPointer.onDisplay) host?.requestFocus()
        }
    }

    private fun type(key: JSONObject) {
        val page = screen ?: return
        page.evaluateJavascript("window.__eveExternalDisplayKeyboard?.($key);", null)
    }

    // Takes the keys, shows nothing. Plain keys only (no composition, no suggestion): each one goes as it is typed.
    class Sink(context: Context) : View(context) {
        init {
            isFocusable = true
            isFocusableInTouchMode = true
            alpha = 0f
        }

        override fun onCheckIsTextEditor() = open

        override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
            // A visible password: the keyboard sends each character, composing nothing.
            outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN
            return object : BaseInputConnection(this, false) {
                override fun commitText(text: CharSequence, newCursorPosition: Int): Boolean {
                    text.toString().takeIf { it.isNotEmpty() }?.let { insert(it) }
                    return true
                }
                override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
                    repeat(maxOf(beforeLength, 1)) { type(JSONObject().put("delete", true)) }
                    return true
                }
                override fun sendKeyEvent(event: KeyEvent): Boolean = dispatchKeyEvent(event)
            }
        }

        override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
            if (!open) return super.onKeyDown(keyCode, event)
            when (keyCode) {
                KeyEvent.KEYCODE_DEL -> type(JSONObject().put("delete", true))
                KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> type(JSONObject().put("key", "Enter"))
                else -> {
                    val char = event.unicodeChar
                    if (char == 0) return super.onKeyDown(keyCode, event)
                    insert(String(Character.toChars(char)))
                }
            }
            return true
        }

        private fun insert(text: String) {
            if (text == "\n") type(JSONObject().put("key", "Enter")) else type(JSONObject().put("insert", text))
        }

        // The capture lost (the app left, another view focused): the pointer comes back to the phone.
        override fun onPointerCaptureChange(hasCapture: Boolean) {
            if (!hasCapture) ExternalDisplayPointer.captureLost()
        }
    }
}
