.class public Lcom/moekoe/music/WebViewStability;
.super Ljava/lang/Object;
.source "WebViewStability.java"


# direct methods
.method public constructor <init>()V
    .locals 0

    .line 6
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method

.method public static checkAndReload(Landroid/webkit/WebView;)V
    .locals 4

    if-nez p0, :cond_0

    return-void

    :cond_0
    const/4 v0, 0x1

    .line 9
    new-array v0, v0, [Z

    const/4 v1, 0x0

    aput-boolean v1, v0, v1

    .line 10
    new-instance v1, Lcom/moekoe/music/WebViewStability$1;

    invoke-direct {v1, v0, p0}, Lcom/moekoe/music/WebViewStability$1;-><init>([ZLandroid/webkit/WebView;)V

    const-wide/16 v2, 0xbb8

    invoke-virtual {p0, v1, v2, v3}, Landroid/webkit/WebView;->postDelayed(Ljava/lang/Runnable;J)Z

    .line 18
    :try_start_0
    const-string v1, "(function(){var a=document.querySelector(\'#app\'); return (a && a.children.length > 0) ? \'ok\' : \'bad\'})()"

    new-instance v2, Lcom/moekoe/music/WebViewStability$2;

    invoke-direct {v2, v0, p0}, Lcom/moekoe/music/WebViewStability$2;-><init>([ZLandroid/webkit/WebView;)V

    invoke-virtual {p0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    return-void
.end method
