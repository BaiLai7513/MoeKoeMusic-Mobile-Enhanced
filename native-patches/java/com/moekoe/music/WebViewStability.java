package com.moekoe.music;

import android.webkit.ValueCallback;
import android.webkit.WebView;

public class WebViewStability {
    public static void checkAndReload(final WebView webView) {
        if (webView == null) return;
        final boolean[] done = {false};
        webView.postDelayed(new Runnable() {
            @Override public void run() {
                if (done[0]) return;
                done[0] = true;
                try { webView.reload(); } catch (Exception ignored) {}
            }
        }, 3000);
        try {
            webView.evaluateJavascript("(function(){var a=document.querySelector('#app'); return (a && a.children.length > 0) ? 'ok' : 'bad'})()", new ValueCallback<String>() {
                @Override public void onReceiveValue(String value) {
                    if (done[0]) return;
                    done[0] = true;
                    if (value == null || !value.contains("ok")) {
                        try { webView.reload(); } catch (Exception ignored) {}
                    }
                }
            });
        } catch (Exception ignored) {}
    }
}
