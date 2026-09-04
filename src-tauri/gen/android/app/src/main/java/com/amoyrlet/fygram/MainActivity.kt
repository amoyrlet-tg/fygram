package com.amoyrlet.fygram

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // after super: the native library is loaded by the lifecycle observer the
    // parent installs, and both of these call into it. Neither asks for the
    // speaker here - that happens when a track actually starts.
    AudioFocus.attach(this)
    MediaNotification.attach(this)
    askToShowNotifications()
  }

  /**
   * Hands the interface the height of the system bars.
   *
   * The window draws edge to edge - from Android 15 an app targeting SDK 35 or
   * later has no say in that - so the status bar stands on the first rows of
   * whatever is on screen. A WebView reports display cutouts through
   * `env(safe-area-inset-*)` but not, dependably, the bars of an edge-to-edge
   * window, so the values are measured here and pushed in as CSS variables.
   * `base.css` prefers them and falls back to `env()`.
   */
  override fun onWebViewCreate(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      val density = view.resources.displayMetrics.density
      lastInsets = Insets(bars.top / density, bars.bottom / density)
      publishInsets(webView)
      // returned rather than consumed: the WebView is not the only thing in the
      // window that may want to know
      insets
    }
    ViewCompat.requestApplyInsets(webView)
    this.webView = webView

    // The page these variables belong to may not have loaded yet, and anything
    // set on the document before a navigation is gone after it. There is no
    // load callback to hang this on - wry owns the WebViewClient - so the first
    // seconds are covered by repeating instead.
    for (delay in RETRY_DELAYS_MS) {
      webView.postDelayed({ publishInsets(webView) }, delay)
    }
  }

  override fun onResume() {
    super.onResume()
    // A reload throws away everything set on document.documentElement, and the
    // insets rarely change afterwards - so they are put back rather than waited
    // for.
    webView?.let { publishInsets(it) }
  }

  private companion object {
    /** Long enough to outlast a cold start, short enough to be invisible. */
    val RETRY_DELAYS_MS = longArrayOf(250, 800, 2000, 5000)
  }

  private data class Insets(val top: Float, val bottom: Float)

  private var webView: WebView? = null
  private var lastInsets: Insets? = null

  private fun publishInsets(webView: WebView) {
    val insets = lastInsets ?: return
    val js = buildString {
      append("(function(){var s=document.documentElement.style;")
      append("s.setProperty('--android-safe-top','${insets.top}px');")
      append("s.setProperty('--android-safe-bottom','${insets.bottom}px');})()")
    }
    webView.post { webView.evaluateJavascript(js, null) }
  }

  /**
   * From Android 13 the media card needs permission like any other
   * notification, and declaring it in the manifest is not enough - it has to be
   * asked for. Without it playback still works, it simply cannot be controlled
   * from the shade or the lock screen.
   */
  private fun askToShowNotifications() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
  }
}
