.class Lcom/moekoe/music/MainActivity$1;
.super Landroid/webkit/WebViewClient;
.source "MainActivity.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/MainActivity;->onCreate(Landroid/os/Bundle;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/moekoe/music/MainActivity;


# direct methods
.method constructor <init>(Lcom/moekoe/music/MainActivity;)V
    .locals 0
    .param p1, "this$0"    # Lcom/moekoe/music/MainActivity;

    .line 50
    iput-object p1, p0, Lcom/moekoe/music/MainActivity$1;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V

    return-void
.end method


# virtual methods
.method public onPageFinished(Landroid/webkit/WebView;Ljava/lang/String;)V
    .locals 7
    .param p1, "view"    # Landroid/webkit/WebView;
    .param p2, "url"    # Ljava/lang/String;

    .line 53
    invoke-super {p0, p1, p2}, Landroid/webkit/WebViewClient;->onPageFinished(Landroid/webkit/WebView;Ljava/lang/String;)V

    const-string v6, "http://127.0.0.1:6521"

    invoke-virtual {p2, v6}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v6

    if-eqz v6, :cond_0

    invoke-virtual {p1}, Landroid/webkit/WebView;->clearHistory()V

    :cond_0
    iget-object v2, p0, Lcom/moekoe/music/MainActivity$1;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v2}, Landroid/app/Activity;->getIntent()Landroid/content/Intent;

    move-result-object v3

    const-string v4, "from_notif"

    const/4 v5, 0x0

    invoke-virtual {v3, v4, v5}, Landroid/content/Intent;->getBooleanExtra(Ljava/lang/String;Z)Z

    move-result v5

    if-eqz v5, :cond_1

    const-string v0, "window.__moeFromNotif=true;if(window.__moeFix9Release){window.__moeFix9Release();}"

    const/4 v1, 0x0

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    .line 54
    :cond_1
    const-string v0, "(function(){function report(){var a=document.querySelector(\'audio\');if(!a)return;var title=document.title||\'\';try{var t=document.querySelector(\'.song-title\');if(t)title=t.textContent.trim();var ar=document.querySelector(\'.player-container .artist\')||document.querySelector(\'.singer-name\');if(ar&&ar.textContent){var artist=ar.textContent.trim();if(artist)title=title+\' - \'+artist;}catch(e){}AndroidMediaBridge.onState(!a.paused&&!a.ended&&a.currentTime>0,((isFinite(a.currentTime)?a.currentTime:0))*1000,((isFinite(a.duration)?a.duration:0))*1000,title);}setInterval(report,1000);document.addEventListener(\'play\',report,true);document.addEventListener(\'pause\',report,true);document.addEventListener(\'timeupdate\',report,true);})();"

    const/4 v1, 0x0

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    .line 55
    return-void
.end method
