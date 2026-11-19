package one.atome.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Presentation
import android.content.Context
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.webkit.WebView
import android.webkit.WebViewClient

// Connected screens on Android (R-212, contract validated by the user, 17 Nov. 2026): a presentation display
// (HDMI, USB-C, Cast/Miracast, a screen the system gives the app) shows the follower page
// (`?display=follower`, eVe/domains/rendering/external_display_follower.js) in a web view of its own,
// fullscreen at that screen's own size: a second view of the same document, no tools, read only — never the
// system's mirror. Same origin as the app's page (Axum), so both talk through their own channel
// (external_display_link.js). The screen gone, its view closes; the app's page goes on unchanged.
object ExternalDisplay {
    private var activity: Activity? = null
    private var host: WebView? = null
    private var shown: Presentation? = null
    private val main = Handler(Looper.getMainLooper())
    // The app's page is Axum's only once its boot page has been replaced (lib.rs): until then, look again.
    private const val HOST_WAIT_MS = 1000L

    private val listener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) = follow()
        override fun onDisplayRemoved(displayId: Int) = follow()
        override fun onDisplayChanged(displayId: Int) = Unit
    }

    fun attach(activity: Activity, webView: WebView) {
        this.activity = activity
        host = webView
        val displays = activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        displays.registerDisplayListener(listener, main)
        follow()
    }

    private fun target(): Display? {
        val displays = activity?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager ?: return null
        return displays.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull()
    }

    // The follower page: the app's own address, its role named.
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
        shown = FollowerPresentation(activity, display, url).also { it.show() }
    }

    private class FollowerPresentation(context: Context, display: Display, private val url: String) : Presentation(context, display) {
        private var page: WebView? = null

        @SuppressLint("SetJavaScriptEnabled")
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            val view = WebView(context)
            page = view
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.mediaPlaybackRequiresUserGesture = false
            view.setBackgroundColor(Color.BLACK)
            view.webViewClient = WebViewClient()
            setContentView(view)
            view.loadUrl(url)
        }

        override fun onStop() {
            page?.destroy()
            page = null
            super.onStop()
        }
    }
}
