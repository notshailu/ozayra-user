$buildGradlePath = Join-Path $PSScriptRoot "..\\node_modules\\react-native-webview\\android\\build.gradle"
$wrapperPath = Join-Path $PSScriptRoot "..\\node_modules\\react-native-webview\\android\\src\\main\\java\\com\\reactnativecommunity\\webview\\RNCWebViewWrapper.kt"
$managerPath = Join-Path $PSScriptRoot "..\\node_modules\\react-native-webview\\android\\src\\main\\java\\com\\reactnativecommunity\\webview\\RNCWebViewManagerImpl.kt"

$buildGradlePath = [System.IO.Path]::GetFullPath($buildGradlePath)
$wrapperPath = [System.IO.Path]::GetFullPath($wrapperPath)
$managerPath = [System.IO.Path]::GetFullPath($managerPath)

if (-not (Test-Path -LiteralPath $buildGradlePath) -or -not (Test-Path -LiteralPath $wrapperPath) -or -not (Test-Path -LiteralPath $managerPath)) {
  exit 0
}

$buildGradle = Get-Content -LiteralPath $buildGradlePath -Raw
if (-not $buildGradle.Contains('androidx.swiperefreshlayout:swiperefreshlayout:1.1.0')) {
  $needle = '    implementation "androidx.webkit:webkit:${safeExtGet(''webkitVersion'')}"'
  if (-not $buildGradle.Contains($needle)) {
    Write-Error "Expected WebView Gradle dependency marker not found in $buildGradlePath"
    exit 1
  }

  $replacement = $needle + "`r`n" + '    implementation "androidx.swiperefreshlayout:swiperefreshlayout:1.1.0"'
  $buildGradle = $buildGradle.Replace($needle, $replacement)
  Set-Content -LiteralPath $buildGradlePath -Value $buildGradle -NoNewline
}

$wrapperContent = @'
package com.reactnativecommunity.webview

import android.content.Context
import android.graphics.Color
import android.view.MotionEvent
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class CustomSwipeRefreshLayout(context: Context) : SwipeRefreshLayout(context) {
  private var startY = 0f

  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        startY = ev.y
      }
    }
    if (startY > height * 0.15f) {
      return false
    }
    return super.onInterceptTouchEvent(ev)
  }
}

/**
 * A [FrameLayout] container to hold the [RNCWebView].
 * We need this to prevent WebView crash when the WebView is out of viewport and
 * [com.facebook.react.views.view.ReactViewGroup] clips the canvas.
 * The WebView will then create an empty offscreen surface and NPE.
 */
class RNCWebViewWrapper(context: Context, webView: RNCWebView) : FrameLayout(context) {
  private val swipeRefreshLayout = CustomSwipeRefreshLayout(context)

  init {
    // We make the WebView as transparent on top of the container,
    // and let React Native sets background color for the container.
    webView.setBackgroundColor(Color.TRANSPARENT)
    swipeRefreshLayout.layoutParams = LayoutParams(
      LayoutParams.MATCH_PARENT,
      LayoutParams.MATCH_PARENT
    )
    swipeRefreshLayout.setOnRefreshListener {
      webView.reload()
      swipeRefreshLayout.isRefreshing = false
    }
    swipeRefreshLayout.addView(
      webView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    addView(swipeRefreshLayout)
  }

  val webView: RNCWebView = webView

  fun setPullToRefreshEnabled(enabled: Boolean) {
    swipeRefreshLayout.isEnabled = enabled
  }

  fun setRefreshControlLightMode(enabled: Boolean) {
    swipeRefreshLayout.setColorSchemeColors(
      if (enabled) Color.WHITE else Color.parseColor("#2b9760")
    )
  }

  companion object {
    /**
     * A helper to get react tag id by given WebView
     */
    @JvmStatic
    fun getReactTagFromWebView(webView: WebView): Int {
      // It is expected that the webView is enclosed by [RNCWebViewWrapper] as the first child.
      // Therefore, it must have a parent, and the parent ID is the reactTag.
      // In exceptional cases, such as receiving WebView messaging after the view has been unmounted,
      // the WebView will not have a parent.
      // In this case, we simply return -1 to indicate that it was not found.
      return ((webView.parent as? View)?.parent as? View)?.id
        ?: (webView.parent as? View)?.id
        ?: -1
    }
  }
}
'@
Set-Content -LiteralPath $wrapperPath -Value $wrapperContent -NoNewline

$managerSource = Get-Content -LiteralPath $managerPath -Raw
if (-not $managerSource.Contains('fun setPullToRefreshEnabled(viewWrapper: RNCWebViewWrapper, value: Boolean)')) {
  $needle = @'
    fun setNestedScrollEnabled(viewWrapper: RNCWebViewWrapper, value: Boolean) {
        val view = viewWrapper.webView
        view.nestedScrollEnabled = value
    }
'@
  if (-not $managerSource.Contains($needle)) {
    Write-Error "Expected nested scroll marker not found in $managerPath"
    exit 1
  }

  $replacement = @'
    fun setNestedScrollEnabled(viewWrapper: RNCWebViewWrapper, value: Boolean) {
        val view = viewWrapper.webView
        view.nestedScrollEnabled = value
    }

    fun setPullToRefreshEnabled(viewWrapper: RNCWebViewWrapper, value: Boolean) {
        viewWrapper.setPullToRefreshEnabled(value)
    }

    fun setRefreshControlLightMode(viewWrapper: RNCWebViewWrapper, value: Boolean) {
        viewWrapper.setRefreshControlLightMode(value)
    }
'@
  $managerSource = $managerSource.Replace($needle, $replacement)
  Set-Content -LiteralPath $managerPath -Value $managerSource -NoNewline
}

Write-Output "Applied react-native-webview Android pull-to-refresh fix."
