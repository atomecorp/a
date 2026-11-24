package one.atome.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Presentation
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.RectF
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

// Connected screens on Android (R-212, contract validated by the user, 17 Nov. 2026): a presentation display (HDMI,
// USB-C, Cast/Miracast, a screen the system gives the app) shows the screen's page (`?display=follower`,
// eVe/domains/rendering/external_display_follower.js) in a web view of its own, fullscreen at that screen's own size:
// a second view of the same document — never the system's mirror —, and a workspace too (user, 19 Nov. 2026: « c'est
// bidirectionnel »): a Presentation takes no input, so the phone's mouse (ExternalDisplayPointer.kt), its Trackpad
// (ExternalDisplayTrackpad.kt) and its keyboard (ExternalDisplayKeyboard.kt) reach it through the app, as on the iPhone.
// Both pages are of one origin (the app's Axum): they talk through their own channel (external_display_link.js). The
// screen's page gets the app page's runtime identity (local_http_navigation.rs#runtime_init_script, read from the app's
// page) and its session through the app's page (atome/src/squirrel/external_display_device_key.js). Each page speaks to
// this host through `AtomeExternalDisplay.post` (eVe/domains/rendering/external_display_host.js). The screen gone, its
// view closes; the app's page goes on unchanged.
object ExternalDisplay {
    private const val TAG = "atome-external-display"
    private const val BRIDGE = "AtomeExternalDisplay"
    // The app's page is Axum's only once its boot page has been replaced (lib.rs): until then, look again.
    private const val HOST_WAIT_MS = 1000L
    // What the screen's page takes of the app page's runtime identity (local_http_navigation.rs#runtime_init_script):
    // the local server and the account's server. Not the Android bridges the screen's page has not.
    private val IDENTITY = listOf("__SQUIRREL_FORCE_TAURI_RUNTIME__", "__ATOME_LOCAL_HTTP_PORT__", "__SQUIRREL_TAURI_CANONICAL_URL__",
        "__SQUIRREL_TAURI_FASTIFY_URL_PINNED__", "__SQUIRREL_TAURI_FASTIFY_URL__")

    private var activity: Activity? = null
    private var host: WebView? = null
    private var shown: FollowerPresentation? = null
    private var pad: ExternalDisplayTrackpad? = null
    // The screen's page while it is shown (set from its Presentation's onCreate, before `shown` is).
    private var screen: WebView? = null
    private val main = Handler(Looper.getMainLooper())

    private val listener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) = follow()
        override fun onDisplayRemoved(displayId: Int) = follow()
        override fun onDisplayChanged(displayId: Int) = Unit
    }

    // The interface of a page: its messages come on a background thread, handled on the main one.
    private class Bridge(private val fromScreen: Boolean) {
        @JavascriptInterface
        fun post(json: String) {
            val message = runCatching { JSONObject(json) }.getOrNull() ?: return
            main.post { if (fromScreen) screenMessage(message) else pageMessage(message) }
        }
    }

    @SuppressLint("JavascriptInterface")
    fun attach(activity: Activity, webView: WebView) {
        this.activity = activity
        host = webView
        webView.addJavascriptInterface(Bridge(fromScreen = false), BRIDGE)
        ExternalDisplayPointer.attach(webView)
        ExternalDisplayKeyboard.attach(webView, content(activity))
        val displays = activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        displays.registerDisplayListener(listener, main)
        follow()
    }

    private fun content(activity: Activity): ViewGroup = activity.findViewById(android.R.id.content)

    private fun target(): Display? {
        val displays = activity?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager ?: return null
        return displays.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull()
    }

    // The screen's page: the app's own address, its role named.
    private fun followerUrl(): String? {
        val page = host?.url ?: return null
        val uri = Uri.parse(page)
        if (uri.scheme != "http" && uri.scheme != "https") return null
        return uri.buildUpon().clearQuery().appendQueryParameter("display", "follower").fragment(null).build().toString()
    }

    private fun follow() {
        val display = target()
        if (shown?.display?.displayId == display?.displayId && shown?.isShowing == true) return
        shown?.dismiss()
        shown = null
        val activity = activity ?: return
        if (display == null) return
        val url = followerUrl() ?: run { main.postDelayed({ follow() }, HOST_WAIT_MS); return }
        readIdentity { identity ->
            // The screen may have gone while the identity was read.
            if (shown == null && target()?.displayId == display.displayId) {
                shown = FollowerPresentation(activity, display, url, identity).also { it.show() }
            }
        }
    }

    // The app page's runtime identity, as a script for the screen's page.
    private fun readIdentity(then: (String) -> Unit) {
        val names = JSONArray(IDENTITY).toString()
        val read = "(function(){var o={};$names.forEach(function(n){if(window[n]!==undefined)o[n]=window[n];});return JSON.stringify(o);})()"
        val page = host ?: return
        page.evaluateJavascript(read) { value ->
            val values = runCatching { JSONObject(JSONTokener(value).nextValue() as String) }.getOrElse { JSONObject() }
            val script = StringBuilder()
            values.keys().forEach { name ->
                val literal = values.get(name).let { if (it is String) JSONObject.quote(it) else it.toString() }
                script.append("window.").append(name).append('=').append(literal).append(';')
            }
            then(script.toString())
        }
    }

    // MARK: the pages' messages

    // From the app's page: whether a screen is connected (`screen`), its Trackpad opened or closed (`trackpad`).
    private fun pageMessage(message: JSONObject) {
        when (message.optString("type")) {
            "screen" -> tellScreen()
            "trackpad" -> if (message.optBoolean("open")) openTrackpad(holes(message.optJSONArray("holes"))) else closeTrackpad(tellPage = false)
            "screen-edge" -> ExternalDisplayPointer.extendRight(message.optString("edge") == "right")
        }
    }

    // From the screen's page: its focused text asks for the phone's keyboard, or gives it back.
    private fun screenMessage(message: JSONObject) {
        if (message.optString("type") == "keyboard") ExternalDisplayKeyboard.set(message.optBoolean("open"))
    }

    private fun tellScreen() {
        val connected = screen != null
        host?.evaluateJavascript("window.__eveExternalDisplayScreen?.({ connected: $connected, trackpad: $connected });", null)
    }

    private fun holes(value: JSONArray?): List<ExternalDisplayTrackpad.Hole> = (0 until (value?.length() ?: 0)).mapNotNull { index ->
        val hole = value?.optJSONObject(index) ?: return@mapNotNull null
        val x = hole.optDouble("x", 0.0).toFloat()
        val y = hole.optDouble("y", 0.0).toFloat()
        val width = hole.optDouble("width", 0.0).toFloat()
        val height = hole.optDouble("height", 0.0).toFloat()
        if (width <= 0f || height <= 0f) null
        else ExternalDisplayTrackpad.Hole(RectF(x, y, x + width, y + height), hole.optDouble("veil", 0.0).toFloat(), hole.optBoolean("close"))
    }

    private fun openTrackpad(holes: List<ExternalDisplayTrackpad.Hole>) {
        pad?.let { it.holes = holes; return }
        val activity = activity ?: return
        if (screen == null) { tellTrackpadClosed(); return }
        val view = ExternalDisplayTrackpad(activity, holes) { closeTrackpad(tellPage = true) }
        content(activity).addView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        pad = view
        ExternalDisplayPointer.openTrackpad()
    }

    // `tellPage`: the pad closed by the app (its Close, the screen gone), not by the page.
    private fun closeTrackpad(tellPage: Boolean) {
        val view = pad ?: return
        view.release()
        (view.parent as? ViewGroup)?.removeView(view)
        pad = null
        ExternalDisplayPointer.closeTrackpad()
        if (tellPage) tellTrackpadClosed()
    }

    private fun tellTrackpadClosed() {
        host?.evaluateJavascript("window.__eveExternalDisplayTrackpad?.({ open: false });", null)
    }

    private fun shownChanged(page: WebView?, cursor: ExternalDisplayPointer.CursorView?) {
        screen = page
        if (page != null && cursor != null) ExternalDisplayPointer.attachDisplay(page, cursor)
        else { closeTrackpad(tellPage = true); ExternalDisplayPointer.detachDisplay() }
        ExternalDisplayKeyboard.attachDisplay(page)
        tellScreen()
    }

    private class FollowerPresentation(context: Context, display: Display, private val url: String, private val identity: String) :
        Presentation(context, display) {
        private var page: WebView? = null

        @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            // The phone keeps the focus (and the mouse's capture, ExternalDisplayPointer.kt): the screen takes no keys.
            window?.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
            val view = WebView(context)
            page = view
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.mediaPlaybackRequiresUserGesture = false
            view.setBackgroundColor(Color.BLACK)
            view.addJavascriptInterface(Bridge(fromScreen = true), BRIDGE)
            view.webViewClient = object : WebViewClient() {
                // As wry gives the app's page its scripts (RustWebViewClient.onPageStarted): before the page's own.
                override fun onPageStarted(webView: WebView, address: String?, favicon: Bitmap?) {
                    webView.evaluateJavascript(identity, null)
                }
                // Its renderer ended (memory, a crash): the screen's page starts anew rather than staying blank.
                override fun onRenderProcessGone(webView: WebView, detail: RenderProcessGoneDetail): Boolean {
                    Log.w(TAG, "screen page renderer ended: showing it anew")
                    main.post { if (shown === this@FollowerPresentation) { dismiss(); shown = null; follow() } }
                    return true
                }
            }
            // Its console in the device's log (`adb logcat -s atome-follower`).
            view.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    Log.i("atome-follower", message.message().take(2000))
                    return true
                }
            }
            val cursor = ExternalDisplayPointer.CursorView(context)
            val frame = FrameLayout(context)
            frame.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            frame.addView(cursor, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT))
            setContentView(frame)
            Log.i(TAG, "screen connected ${display.mode.physicalWidth}x${display.mode.physicalHeight}")
            view.loadUrl(url)
            shownChanged(view, cursor)
        }

        override fun onStop() {
            Log.i(TAG, "screen disconnected")
            shownChanged(null, null)
            page?.destroy()
            page = null
            super.onStop()
        }
    }
}
