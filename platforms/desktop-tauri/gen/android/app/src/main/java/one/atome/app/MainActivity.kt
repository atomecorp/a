package one.atome.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : TauriActivity() {
  private var viewportScript: ScriptHandler? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // eVe is one document: once the WebView cannot go back, Tauri's app plugin calls this. Finishing
  // the activity ended the process (a relaunch cost a full boot); the app goes to the background.
  @Deprecated("Called by Tauri's app plugin and WryActivity at the root of the history")
  override fun onBackPressed() {
    moveTaskToBack(true)
  }

  // Edge-to-edge draws the page under the system bars. eVe lays its UI out of them through
  // window.__EVE_NATIVE_VIEWPORT__ (CSS px + safe-area insets), the contract the iOS host publishes too.
  override fun onWebViewCreate(webView: WebView) {
    check(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      "android_webview_document_start_script_unsupported"
    }
    // The page's viewport scale lays every tool at the iPhone's physical size (R-280,
    // eVe/elements/system_ui_physical_scale.js): the WebView reads the page's viewport only in wide mode.
    webView.settings.useWideViewPort = true
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      publishViewport(view as WebView, insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()))
      ViewCompat.onApplyWindowInsets(view, insets)
    }
    webView.addOnLayoutChangeListener { view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
      if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) ViewCompat.requestApplyInsets(view)
    }
  }

  private fun publishViewport(webView: WebView, bars: Insets) {
    if (webView.width <= 0 || webView.height <= 0) return
    val metrics = webView.resources.displayMetrics
    val density = metrics.density
    val payload = "{\"width\":${webView.width / density},\"height\":${webView.height / density}," +
      cssPxPerMm(metrics) +
      "\"safeAreaInsets\":{\"top\":${bars.top / density},\"right\":${bars.right / density}," +
      "\"bottom\":${bars.bottom / density},\"left\":${bars.left / density}}}"
    val script = "(function(){const next=$payload,previous=window.__EVE_NATIVE_VIEWPORT__;" +
      "window.__EVE_NATIVE_VIEWPORT__=next;if(JSON.stringify(previous)!==JSON.stringify(next))" +
      "window.dispatchEvent(new CustomEvent('eve:native-viewport-resize',{detail:next}));})();"
    // The window navigates from the boot page to the local server: every new document gets the current value.
    viewportScript?.remove()
    viewportScript = WebViewCompat.addDocumentStartJavaScript(webView, script, setOf("*"))
    webView.evaluateJavascript(script, null)
  }

  // The screen's dp per millimetre (R-280): its true dots per inch over its density. A screen that reports a false
  // xdpi (some do: a value far from its density bucket) tells nothing, and the page keeps its dp.
  private fun cssPxPerMm(metrics: android.util.DisplayMetrics): String {
    val dpPerInch = (metrics.xdpi + metrics.ydpi) / 2f / metrics.density
    if (dpPerInch !in 120f..200f) return ""
    return "\"cssPxPerMm\":${dpPerInch / 25.4f},"
  }
}
