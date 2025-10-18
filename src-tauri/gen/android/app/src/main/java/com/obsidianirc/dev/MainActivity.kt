package com.obsidianirc.dev

import android.webkit.WebView
import android.annotation.SuppressLint
import android.view.ViewTreeObserver
import android.view.View
import android.graphics.Rect


class MainActivity : TauriActivity() {
  private lateinit var wv: WebView
  private var isKeyboardOpen = false
  
  override fun onWebViewCreate(webView: WebView) {
    wv = webView
    setupKeyboardDetection()
  }
  
  private fun setupKeyboardDetection() {
    val rootView = findViewById<View>(android.R.id.content)
    val globalLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
      val rect = Rect()
      rootView.getWindowVisibleDisplayFrame(rect)
      val screenHeight = rootView.rootView.height
      val keypadHeight = screenHeight - rect.bottom

      if (keypadHeight > screenHeight * 0.15) { // keyboard is opened
        if (!isKeyboardOpen) {
          isKeyboardOpen = true
          // Force immediate layout adjustment
          wv.evaluateJavascript("window.dispatchEvent(new Event('keyboardDidShow'));", null)
        }
      } else { // keyboard is closed
        if (isKeyboardOpen) {
          isKeyboardOpen = false
          wv.evaluateJavascript("window.dispatchEvent(new Event('keyboardDidHide'));", null)
        }
      }
    }
    
    rootView.viewTreeObserver.addOnGlobalLayoutListener(globalLayoutListener)
  }
  
  @SuppressLint("MissingSuperCall", "SetTextI18n")
  @Deprecated("")
  override fun onBackPressed() {
    wv.evaluateJavascript(/* script = */ """
      try {
        window.androidBackCallback()
      } catch (_) {
        true
      }
    """.trimIndent()) { result ->
      if (result == "true") {
        super.onBackPressed();
      }
    }
  }
}