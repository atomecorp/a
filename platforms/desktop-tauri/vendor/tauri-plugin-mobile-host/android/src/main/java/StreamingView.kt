package one.atome.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Outline
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject

// Android twin of AtomeStreamingView.m (iOS, Tauri macOS): the internal page of a service
// (eVe/domains/media/streaming_view.js) in a web view of its own, laid BEHIND the app page,
// which turns clear while it is open: the canvas cut-out shows it, Mystic and the menus stay
// above. `streaming_view_front` raises it while the person acts in it (signing in).
// Android web views share one cookie store: a sign-in is kept between launches, but the
// services are not kept apart from each other as on Apple platforms. Playback is read and
// driven on the page's largest video (Android has no media control of its own for a web view).
object StreamingView {
    private var host: WebView? = null
    private var view: WebView? = null
    private var service = ""
    private var front = false

    fun attach(webView: WebView) { host = webView }

    private fun failure(error: String) = JSONObject().put("ok", false).put("error", error)
    private fun ok() = JSONObject().put("ok", true)

    fun handle(activity: Activity, command: String, payload: JSONObject, reply: (JSONObject) -> Unit) {
        activity.runOnUiThread {
            when (command) {
                "streaming_view_open" -> reply(open(activity, payload))
                "streaming_view_place" -> reply(place(payload))
                "streaming_view_front" -> reply(raise(payload))
                "streaming_view_media" -> media(payload, reply)
                "streaming_view_close" -> { close(); reply(ok()) }
                else -> reply(failure("streaming_view_command_invalid"))
            }
        }
    }

    // Page pixels (CSS pixels are density-independent pixels) to the parent of the app page.
    private fun frame(payload: JSONObject): FloatArray? {
        val host = host ?: return null
        val rect = payload.optJSONObject("rect") ?: return null
        val values = listOf("x", "y", "width", "height").map { if (rect.opt(it) is Number) rect.getDouble(it) else return null }
        if (values[2] <= 0 || values[3] <= 0) return null
        val density = host.resources.displayMetrics.density
        return floatArrayOf(host.x + values[0].toFloat() * density, host.y + values[1].toFloat() * density,
            values[2].toFloat() * density, values[3].toFloat() * density)
    }

    private fun lay(view: WebView, frame: FloatArray) {
        view.layoutParams = FrameLayout.LayoutParams(frame[2].toInt(), frame[3].toInt())
        view.x = frame[0]
        view.y = frame[1]
    }

    private fun order() {
        val host = host ?: return
        val view = view ?: return
        val parent = host.parent as ViewGroup
        (view.parent as? ViewGroup)?.removeView(view)
        parent.addView(view, parent.indexOfChild(host) + if (front) 1 else 0)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun makeView(activity: Activity, radius: Float): WebView {
        val view = WebView(activity)
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.mediaPlaybackRequiresUserGesture = false
        view.setBackgroundColor(Color.BLACK)
        // The web stays inside; another app's scheme (`intent:`, a service's own) is never opened.
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(webView: WebView, request: WebResourceRequest): Boolean =
                request.url.scheme?.lowercase() !in setOf("https", "http", "about", "blob", "data")
        }
        val corner = radius * activity.resources.displayMetrics.density
        view.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(target: View, outline: Outline) { outline.setRoundRect(0, 0, target.width, target.height, corner) }
        }
        view.clipToOutline = true
        return view
    }

    private fun open(activity: Activity, payload: JSONObject): JSONObject {
        val host = host ?: return failure("streaming_view_host_missing")
        if (host.parent !is FrameLayout) return failure("streaming_view_host_missing")
        val key = payload.optString("service")
        val url = payload.optString("url")
        val frame = frame(payload)
        if (key.isEmpty() || !url.startsWith("https://") || frame == null) return failure("streaming_view_request_invalid")
        if (view == null || key != service) {
            close()
            view = makeView(activity, payload.optDouble("radius", 0.0).toFloat())
            service = key
            front = false
            host.setBackgroundColor(Color.TRANSPARENT)
        }
        val view = view!!
        order()
        lay(view, frame)
        view.visibility = View.VISIBLE
        view.loadUrl(url)
        return ok()
    }

    // `visible` false hides it (its Atome off screen, another scene shown); `rect` then may lack.
    private fun place(payload: JSONObject): JSONObject {
        val view = view ?: return failure("streaming_view_closed")
        if (payload.opt("visible") !is Boolean) return failure("streaming_view_request_invalid")
        val visible = payload.getBoolean("visible")
        if (visible) lay(view, frame(payload) ?: return failure("streaming_view_request_invalid"))
        view.visibility = if (visible) View.VISIBLE else View.INVISIBLE
        return ok()
    }

    private fun raise(payload: JSONObject): JSONObject {
        if (view == null) return failure("streaming_view_closed")
        if (payload.opt("front") !is Boolean) return failure("streaming_view_request_invalid")
        front = payload.getBoolean("front")
        order()
        return ok().put("front", front)
    }

    private fun media(payload: JSONObject, reply: (JSONObject) -> Unit) {
        val view = view ?: return reply(failure("streaming_view_closed"))
        val action = payload.optString("action")
        if (action !in setOf("state", "play", "pause")) return reply(failure("streaming_view_request_invalid"))
        val script = "(() => { const video = [...document.querySelectorAll('video')]" +
            ".sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];" +
            " if (!video) return { ok: true, has_media: false, playing: false };" +
            " if ('$action' === 'pause') video.pause();" +
            " if ('$action' === 'play') video.play().catch(() => {});" +
            " return { ok: true, has_media: true, playing: !video.paused && !video.ended }; })()"
        view.evaluateJavascript(script) { value ->
            reply(if (value != null && value.startsWith("{")) JSONObject(value) else failure("streaming_view_media_unreadable"))
        }
    }

    private fun close() {
        val view = view ?: return
        view.stopLoading()
        (view.parent as? ViewGroup)?.removeView(view)
        view.destroy()
        this.view = null
        service = ""
        front = false
        // An Android web view draws white until told otherwise.
        host?.setBackgroundColor(Color.WHITE)
    }
}
