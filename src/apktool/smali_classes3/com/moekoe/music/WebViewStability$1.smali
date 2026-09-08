.class Lcom/moekoe/music/WebViewStability$1;
.super Ljava/lang/Object;
.source "WebViewStability.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/WebViewStability;->checkAndReload(Landroid/webkit/WebView;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic val$done:[Z

.field final synthetic val$webView:Landroid/webkit/WebView;


# direct methods
.method constructor <init>([ZLandroid/webkit/WebView;)V
    .locals 0
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 10
    iput-object p1, p0, Lcom/moekoe/music/WebViewStability$1;->val$done:[Z

    iput-object p2, p0, Lcom/moekoe/music/WebViewStability$1;->val$webView:Landroid/webkit/WebView;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 3

    .line 12
    iget-object v0, p0, Lcom/moekoe/music/WebViewStability$1;->val$done:[Z

    const/4 v1, 0x0

    aget-boolean v2, v0, v1

    if-eqz v2, :cond_0

    return-void

    :cond_0
    const/4 v2, 0x1

    .line 13
    aput-boolean v2, v0, v1

    .line 14
    :try_start_0
    iget-object v0, p0, Lcom/moekoe/music/WebViewStability$1;->val$webView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->reload()V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    return-void
.end method
