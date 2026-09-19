.class public Lcom/moekoe/music/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/moekoe/music/MainActivity$MediaBridge;
    }
.end annotation


# static fields
.field private static final LOCAL_URL:Ljava/lang/String; = "http://127.0.0.1:6521"

.field private static final MEDIA_OBSERVER_JS:Ljava/lang/String; = "(function(){function report(){var a=document.querySelector(\'audio\');if(!a)return;var title=a.getAttribute(\'data-song-name\')||document.title||\'\';try{var artist=a.getAttribute(\'data-song-author\')||\'\';if(!artist){var ar=document.querySelector(\'.player-container .artist\')||document.querySelector(\'.singer-name\');if(ar&&ar.textContent)artist=ar.textContent.trim();}if(artist)title=title+\' - \'+artist;}catch(e){}AndroidMediaBridge.onState(!a.paused&&!a.ended&&a.currentTime>0,((isFinite(a.currentTime)?a.currentTime:0))*1000,((isFinite(a.duration)?a.duration:0))*1000,title);}setInterval(report,1000);document.addEventListener(\'play\',report,true);document.addEventListener(\'pause\',report,true);document.addEventListener(\'timeupdate\',report,true);})();"

.field private static final TAG:Ljava/lang/String; = "MoeKoeMain"

.field private static preloadDone:Z

.field private static sWebView:Landroid/webkit/WebView;


# instance fields
.field private localPlayer:Landroid/media/MediaPlayer;


# direct methods
.method public static synthetic $r8$lambda$DRyM90bN6eD8ksCov9-Dgtge4PA(Lcom/moekoe/music/MainActivity;Landroid/webkit/WebView;)V
    .locals 0

    invoke-direct {p0, p1}, Lcom/moekoe/music/MainActivity;->lambda$waitForServerAndLoad$2(Landroid/webkit/WebView;)V

    return-void
.end method

.method public constructor <init>()V
    .locals 0

    .line 18
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method public static evaluateJs(Ljava/lang/String;)V
    .locals 2

    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    const/4 v1, 0x0

    invoke-virtual {v0, p0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    :cond_0
    return-void
.end method

.method private isPortOpen(I)Z
    .locals 3
    .param p1, "port"    # I

    .line 108
    :try_start_0
    new-instance v0, Ljava/net/Socket;

    invoke-direct {v0}, Ljava/net/Socket;-><init>()V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    .line 109
    .local v0, "socket":Ljava/net/Socket;
    :try_start_1
    new-instance v1, Ljava/net/InetSocketAddress;

    const-string v2, "127.0.0.1"

    invoke-direct {v1, v2, p1}, Ljava/net/InetSocketAddress;-><init>(Ljava/lang/String;I)V

    const/16 v2, 0x12c

    invoke-virtual {v0, v1, v2}, Ljava/net/Socket;->connect(Ljava/net/SocketAddress;I)V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    .line 110
    nop

    .line 111
    :try_start_2
    invoke-virtual {v0}, Ljava/net/Socket;->close()V
    :try_end_2
    .catch Ljava/lang/Exception; {:try_start_2 .. :try_end_2} :catch_0

    .line 110
    const/4 v1, 0x1

    return v1

    .line 108
    :catchall_0
    move-exception v1

    :try_start_3
    invoke-virtual {v0}, Ljava/net/Socket;->close()V
    :try_end_3
    .catchall {:try_start_3 .. :try_end_3} :catchall_1

    goto :goto_0

    :catchall_1
    move-exception v2

    :try_start_4
    invoke-virtual {v1, v2}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    .end local p1    # "port":I
    :goto_0
    throw v1
    :try_end_4
    .catch Ljava/lang/Exception; {:try_start_4 .. :try_end_4} :catch_0

    .line 111
    .end local v0    # "socket":Ljava/net/Socket;
    .restart local p1    # "port":I
    :catch_0
    move-exception v0

    .line 112
    .local v0, "ignored":Ljava/lang/Exception;
    const/4 v1, 0x0

    return v1
.end method

.method static synthetic lambda$sendMediaCommand$3(Ljava/lang/String;Landroid/webkit/WebView;)V
    .locals 2
    .param p0, "command"    # Ljava/lang/String;
    .param p1, "webView"    # Landroid/webkit/WebView;

    .line 155
    const-string v0, "toggle"

    invoke-virtual {v0, p0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    const/4 v1, 0x0

    if-eqz v0, :cond_0

    .line 156
    const-string v0, "(function(){var a=document.querySelector(\'audio\');if(a){if(a.paused){a.play()}else{a.pause()}}})()"

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    goto :goto_0

    :cond_0
    const-string v0, "play"

    invoke-virtual {v0, p0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_1

    const-string v0, "(function(){var a=document.querySelector(\'audio\');if(a){if(a.paused){a.play()}}})()"

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    goto :goto_0

    :cond_1
    const-string v0, "pause"

    invoke-virtual {v0, p0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_2

    const-string v0, "(function(){var a=document.querySelector(\'audio\');if(a){a.pause()}})()"

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    goto :goto_0

    .line 159
    :cond_2
    const-string v0, "next"

    invoke-virtual {v0, p0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_3

    .line 160
    const-string v0, "(function(){var b=document.querySelectorAll(\'.player-container .control-btn\')[2];if(b)b.click()})()"

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    goto :goto_0

    .line 163
    :cond_3
    const-string v0, "prev"

    invoke-virtual {v0, p0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_4

    .line 164
    const-string v0, "(function(){var b=document.querySelectorAll(\'.player-container .control-btn\')[0];if(b)b.click()})()"

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    .line 168
    :cond_4
    :goto_0
    return-void
.end method

.method static synthetic lambda$waitForServerAndLoad$0(Landroid/webkit/WebView;)V
    .locals 3
    .param p0, "webView"    # Landroid/webkit/WebView;

    .line 91
    invoke-virtual {p0}, Landroid/webkit/WebView;->getContext()Landroid/content/Context;

    move-result-object v0

    check-cast v0, Landroid/app/Activity;

    invoke-virtual {v0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;

    move-result-object v1

    invoke-virtual {v1}, Landroid/view/Window;->getDecorView()Landroid/view/View;

    move-result-object v1

    const/16 v2, 0x2000

    invoke-virtual {v1, v2}, Landroid/view/View;->setSystemUiVisibility(I)V

    const-string v0, "http://127.0.0.1:6521"

    invoke-virtual {p0, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method static synthetic lambda$waitForServerAndLoad$1(Landroid/webkit/WebView;)V
    .locals 1
    .param p0, "webView"    # Landroid/webkit/WebView;

    .line 102
    const-string v0, "http://127.0.0.1:6521"

    invoke-virtual {p0, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method private synthetic lambda$waitForServerAndLoad$2(Landroid/webkit/WebView;)V
    .locals 3
    .param p1, "webView"    # Landroid/webkit/WebView;

    .line 88
    const/4 v0, 0x0

    .local v0, "i":I
    :goto_0
    const/16 v1, 0x3c

    if-ge v0, v1, :cond_2

    .line 89
    const/16 v1, 0x1979

    invoke-direct {p0, v1}, Lcom/moekoe/music/MainActivity;->isPortOpen(I)Z

    move-result v1

    if-eqz v1, :cond_1

    .line 90
    sget-object v1, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-ne p1, v1, :cond_0

    invoke-virtual {p0}, Lcom/moekoe/music/MainActivity;->isFinishing()Z

    move-result v1

    if-nez v1, :cond_0

    .line 91
    const-wide/16 v0, 0xbb8

    :try_start_0
    invoke-static {v0, v1}, Ljava/lang/Thread;->sleep(J)V
    :try_end_0
    .catch Ljava/lang/InterruptedException; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_1

    :catch_0
    move-exception v0

    :goto_1
    nop

    new-instance v1, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda0;

    invoke-direct {v1, p1}, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda0;-><init>(Landroid/webkit/WebView;)V

    invoke-virtual {p0, v1}, Lcom/moekoe/music/MainActivity;->runOnUiThread(Ljava/lang/Runnable;)V

    .line 93
    :cond_0
    return-void

    .line 96
    :cond_1
    const-wide/16 v1, 0x1f4

    :try_start_1
    invoke-static {v1, v2}, Ljava/lang/Thread;->sleep(J)V
    :try_end_1
    .catch Ljava/lang/InterruptedException; {:try_start_1 .. :try_end_1} :catch_1

    .line 99
    nop

    .line 88
    add-int/lit8 v0, v0, 0x1

    goto :goto_0

    .line 97
    :catch_1
    move-exception v1

    .line 98
    .local v1, "ignored":Ljava/lang/InterruptedException;
    return-void

    .line 101
    .end local v0    # "i":I
    .end local v1    # "ignored":Ljava/lang/InterruptedException;
    :cond_2
    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-ne p1, v0, :cond_3

    invoke-virtual {p0}, Lcom/moekoe/music/MainActivity;->isFinishing()Z

    move-result v0

    if-nez v0, :cond_3

    .line 102
    new-instance v0, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda1;

    invoke-direct {v0, p1}, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda1;-><init>(Landroid/webkit/WebView;)V

    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->runOnUiThread(Ljava/lang/Runnable;)V

    .line 104
    :cond_3
    return-void
.end method

.method public static postNativeRecordResult(Ljava/lang/String;Ljava/lang/String;)V
    .locals 5

    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    const-string v1, "window.__moeNativeRecordResult && window.__moeNativeRecordResult(\'"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, p0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, "\', \'"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, "\')"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    new-instance v1, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v2

    invoke-direct {v1, v2}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    new-instance v2, Lcom/moekoe/music/KgmResultRunnable;

    invoke-direct {v2, v0}, Lcom/moekoe/music/KgmResultRunnable;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, v2}, Landroid/os/Handler;->post(Ljava/lang/Runnable;)Z

    return-void
.end method

.method private requestPermissionsIfNeeded()V
    .locals 3

    .line 79
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x21

    if-lt v0, v1, :cond_0

    const-string v0, "android.permission.POST_NOTIFICATIONS"

    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v1

    if-eqz v1, :cond_0

    filled-new-array {v0}, [Ljava/lang/String;

    move-result-object v0

    const/16 v1, 0x3e9

    invoke-virtual {p0, v0, v1}, Lcom/moekoe/music/MainActivity;->requestPermissions([Ljava/lang/String;I)V

    :cond_0
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x21

    if-lt v0, v1, :cond_1

    const-string v0, "android.permission.READ_MEDIA_AUDIO"

    goto :goto_0

    :cond_1
    const-string v0, "android.permission.READ_EXTERNAL_STORAGE"

    :goto_0
    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v1

    if-eqz v1, :cond_2

    filled-new-array {v0}, [Ljava/lang/String;

    move-result-object v0

    const/16 v1, 0x3ea

    invoke-virtual {p0, v0, v1}, Lcom/moekoe/music/MainActivity;->requestPermissions([Ljava/lang/String;I)V

    :cond_2
    const-string v0, "android.permission.RECORD_AUDIO"

    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v1

    if-eqz v1, :cond_3

    filled-new-array {v0}, [Ljava/lang/String;

    move-result-object v0

    const/16 v1, 0x3eb

    invoke-virtual {p0, v0, v1}, Lcom/moekoe/music/MainActivity;->requestPermissions([Ljava/lang/String;I)V

    :cond_3
    return-void
.end method

.method public static sendMediaCommand(Ljava/lang/String;)V
    .locals 2
    .param p0, "command"    # Ljava/lang/String;

    .line 152
    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    .line 153
    .local v0, "webView":Landroid/webkit/WebView;
    if-nez v0, :cond_0

    return-void

    .line 154
    :cond_0
    new-instance v1, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;

    invoke-direct {v1, p0, v0}, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;-><init>(Ljava/lang/String;Landroid/webkit/WebView;)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->post(Ljava/lang/Runnable;)Z

    .line 169
    return-void
.end method

.method private startMusicService()V
    .locals 3

    .line 70
    new-instance v0, Landroid/content/Intent;

    const-class v1, Lcom/moekoe/music/MusicForegroundService;

    invoke-direct {v0, p0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    .line 71
    .local v0, "intent":Landroid/content/Intent;
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v2, 0x1a

    if-lt v1, v2, :cond_0

    .line 72
    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->startForegroundService(Landroid/content/Intent;)Landroid/content/ComponentName;

    goto :goto_0

    .line 74
    :cond_0
    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->startService(Landroid/content/Intent;)Landroid/content/ComponentName;

    .line 76
    :goto_0
    return-void
.end method

.method public static updateFloatLyrics(Ljava/lang/String;)V
    .locals 0

    invoke-static {p0}, Lcom/moekoe/music/FloatLyricsService;->update(Ljava/lang/String;)V

    return-void
.end method

.method private waitForServerAndLoad(Landroid/webkit/WebView;)V
    .locals 3
    .param p1, "webView"    # Landroid/webkit/WebView;

    .line 87
    new-instance v0, Ljava/lang/Thread;

    new-instance v1, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda2;

    invoke-direct {v1, p0, p1}, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda2;-><init>(Lcom/moekoe/music/MainActivity;Landroid/webkit/WebView;)V

    const-string v2, "MoeKoe-PortWait"

    invoke-direct {v0, v1, v2}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;Ljava/lang/String;)V

    .line 104
    invoke-virtual {v0}, Ljava/lang/Thread;->start()V

    .line 105
    return-void
.end method


# virtual methods
.method public canDrawOverlays()Z
    .locals 1

    invoke-static {p0}, Landroid/provider/Settings;->canDrawOverlays(Landroid/content/Context;)Z

    move-result v0

    return v0
.end method

.method public checkWebViewStability()V
    .locals 1

    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    invoke-static {v0}, Lcom/moekoe/music/WebViewStability;->checkAndReload(Landroid/webkit/WebView;)V

    return-void
.end method

.method public native decodeKgm(Ljava/lang/String;Ljava/lang/String;)I
.end method

.method public decodeKgmAsync(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .locals 2

    new-instance v0, Lcom/moekoe/music/KgmDecodeRunnable;

    invoke-direct {v0, p0, p1, p2, p3}, Lcom/moekoe/music/KgmDecodeRunnable;-><init>(Lcom/moekoe/music/MainActivity;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    new-instance v1, Ljava/lang/Thread;

    invoke-direct {v1, v0}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;)V

    invoke-virtual {v1}, Ljava/lang/Thread;->start()V

    return-void
.end method

.method public download(Ljava/lang/String;Ljava/lang/String;)V
    .locals 4

    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v1

    new-instance v0, Landroid/app/DownloadManager$Request;

    invoke-direct {v0, v1}, Landroid/app/DownloadManager$Request;-><init>(Landroid/net/Uri;)V

    const-string v1, "MoeKoe Music"

    invoke-virtual {v0, v1}, Landroid/app/DownloadManager$Request;->setTitle(Ljava/lang/CharSequence;)Landroid/app/DownloadManager$Request;

    move-result-object v0

    invoke-virtual {v0, p2}, Landroid/app/DownloadManager$Request;->setDescription(Ljava/lang/CharSequence;)Landroid/app/DownloadManager$Request;

    move-result-object v0

    const/4 v1, 0x1

    invoke-virtual {v0, v1}, Landroid/app/DownloadManager$Request;->setNotificationVisibility(I)Landroid/app/DownloadManager$Request;

    move-result-object v0

    sget-object v1, Landroid/os/Environment;->DIRECTORY_DOWNLOADS:Ljava/lang/String;

    invoke-virtual {v0, v1, p2}, Landroid/app/DownloadManager$Request;->setDestinationInExternalPublicDir(Ljava/lang/String;Ljava/lang/String;)Landroid/app/DownloadManager$Request;

    move-result-object v0

    const-string v1, "download"

    invoke-virtual {p0, v1}, Landroid/app/Activity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Landroid/app/DownloadManager;

    invoke-virtual {v1, v0}, Landroid/app/DownloadManager;->enqueue(Landroid/app/DownloadManager$Request;)J

    return-void
.end method

.method public hideFloatLyrics()V
    .locals 1

    invoke-static {p0}, Lcom/moekoe/music/FloatLyricsService;->hide(Landroid/content/Context;)V

    return-void
.end method

.method public isAllFilesGranted()Z
    .locals 1

    invoke-static {}, Landroid/os/Environment;->isExternalStorageManager()Z

    move-result v0

    return v0
.end method

.method public listSubdirs(Ljava/lang/String;)Ljava/lang/String;
    .locals 5

    new-instance v0, Lorg/json/JSONArray;

    invoke-direct {v0}, Lorg/json/JSONArray;-><init>()V

    new-instance v1, Ljava/io/File;

    invoke-direct {v1, p1}, Ljava/io/File;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1}, Ljava/io/File;->listFiles()[Ljava/io/File;

    move-result-object v1

    if-eqz v1, :cond_1

    array-length v2, v1

    const/4 v3, 0x0

    :goto_0
    if-ge v3, v2, :cond_1

    aget-object v4, v1, v3

    invoke-virtual {v4}, Ljava/io/File;->isDirectory()Z

    move-result p0

    if-eqz p0, :cond_0

    invoke-virtual {v4}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;

    move-result-object p0

    invoke-virtual {v0, p0}, Lorg/json/JSONArray;->put(Ljava/lang/Object;)Lorg/json/JSONArray;

    :cond_0
    add-int/lit8 v3, v3, 0x1

    goto :goto_0

    :cond_1
    invoke-virtual {v0}, Lorg/json/JSONArray;->toString()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public onBackPressed()V
    .locals 3

    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-nez v0, :cond_0

    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V

    return-void

    :cond_0
    const-string v1, "(function(){if(window.__moeBack){window.__moeBack()}else{AndroidMediaBridge.exitApp()}})()"

    const/4 v2, 0x0

    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .locals 8
    .param p1, "savedInstanceState"    # Landroid/os/Bundle;

    .line 35
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    const-string v1, "androidkgmcodecexample"

    invoke-static {v1}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V

    invoke-static {p0}, Lcom/moekoe/music/BackGestureHelper;->register(Landroid/app/Activity;)V

    .line 37
    new-instance v0, Landroid/webkit/WebView;

    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    .line 38
    .local v0, "webView":Landroid/webkit/WebView;
    sput-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    .line 39
    invoke-virtual {p0, v0}, Lcom/moekoe/music/MainActivity;->setContentView(Landroid/view/View;)V

    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;

    move-result-object v1

    const/4 v2, 0x0

    invoke-virtual {v1, v2}, Landroid/view/Window;->setStatusBarColor(I)V

    invoke-virtual {v1, v2}, Landroid/view/Window;->setNavigationBarColor(I)V

    invoke-virtual {v1}, Landroid/view/Window;->getDecorView()Landroid/view/View;

    move-result-object v1

    const/4 v2, 0x0

    invoke-virtual {v1, v2}, Landroid/view/View;->setSystemUiVisibility(I)V

    const/4 v1, 0x0

    sput-boolean v1, Lcom/moekoe/music/MainActivity;->preloadDone:Z

    .line 41
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object v7

    .line 42
    .local v7, "settings":Landroid/webkit/WebSettings;
    const/4 v1, 0x1

    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V

    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setAllowFileAccessFromFileURLs(Z)V

    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setAllowUniversalAccessFromFileURLs(Z)V

    .line 43
    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    .line 44
    const/4 v2, 0x0

    invoke-virtual {v7, v2}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    .line 45
    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V

    .line 46
    invoke-virtual {v7, v1}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    .line 47
    invoke-virtual {v7, v2}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V

    .line 49
    new-instance v1, Lcom/moekoe/music/MainActivity$MediaBridge;

    const/4 v2, 0x0

    invoke-direct {v1, p0, v2}, Lcom/moekoe/music/MainActivity$MediaBridge;-><init>(Lcom/moekoe/music/MainActivity;Lcom/moekoe/music/MainActivity$MediaBridge-IA;)V

    const-string v2, "AndroidMediaBridge"

    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    .line 50
    new-instance v1, Lcom/moekoe/music/MainActivity$1;

    invoke-direct {v1, p0}, Lcom/moekoe/music/MainActivity$1;-><init>(Lcom/moekoe/music/MainActivity;)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    .line 57
    new-instance v1, Lcom/moekoe/music/MediaWebChromeClient;

    invoke-direct {v1}, Lcom/moekoe/music/MediaWebChromeClient;-><init>()V

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    .line 58
    const/4 v1, 0x0

    const-string v2, "<html><body style=\"background:#000;color:#fff;margin:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center\"><h2 style=\"margin:0\">MoeKoe Music</h2><p style=\"margin:12px 0 0\">   \u6b63\u5728\u542f\u52a8\u672c\u5730\u97f3\u4e50\u670d\u52a1...</p><script>(function(){function done(){try{AndroidMediaBridge.onPreloadDone()}catch(e){}}var urls=[\"/user/playlist?pagesize=100\",\"/user/playlist?pagesize=500&t=\"+encodeURIComponent(localStorage.getItem(\"t\")||\"\"),\"/everyday/recommend\"];function attempt(){if(!(\"caches\" in window)){done();return}caches.open(\"moe-prefetch\").then(function(cache){return Promise.all(urls.map(function(u){return fetch(u,{credentials:\"include\"}).then(function(r){if(r.ok)return cache.put(u,r.clone());throw 0}).catch(function(){throw 0})}))}).then(done).catch(function(){setTimeout(attempt,500)})}attempt()})();</script></body></html>"

    const-string v3, "text/html"

    const-string v4, "UTF-8"

    const-string v5, "http://127.0.0.1:6521"

    invoke-virtual/range {v0 .. v5}, Landroid/webkit/WebView;->loadDataWithBaseURL(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    .line 63
    invoke-direct {p0}, Lcom/moekoe/music/MainActivity;->startMusicService()V

    .line 64
    invoke-direct {p0, v0}, Lcom/moekoe/music/MainActivity;->waitForServerAndLoad(Landroid/webkit/WebView;)V

    .line 66
    invoke-direct {p0}, Lcom/moekoe/music/MainActivity;->requestPermissionsIfNeeded()V

    .line 67
    return-void
.end method

.method protected onDestroy()V
    .locals 1

    .line 131
    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    .line 132
    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    nop

    nop

    nop

    .line 133
    nop

    nop

    nop

    .line 135
    :cond_0
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    .line 136
    return-void
.end method

.method protected onPause()V
    .locals 0

    .line 120
    invoke-super {p0}, Landroid/app/Activity;->onPause()V

    .line 121
    return-void
.end method

.method protected onResume()V
    .locals 4

    .line 125
    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    invoke-virtual {p0}, Landroid/app/Activity;->getIntent()Landroid/content/Intent;

    move-result-object v0

    const-string v1, "from_notif"

    const/4 v2, 0x0

    invoke-virtual {v0, v1, v2}, Landroid/content/Intent;->getBooleanExtra(Ljava/lang/String;Z)Z

    move-result v2

    if-eqz v2, :cond_0

    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    const-string v1, "window.__moeFromNotif=true;if(window.__moeFix9Release){window.__moeFix9Release();}"

    const/4 v2, 0x0

    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    .line 126
    :cond_0
    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    if-eqz v0, :cond_1

    sget-object v0, Lcom/moekoe/music/MainActivity;->sWebView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V

    .line 127
    :cond_1
    invoke-virtual {p0}, Lcom/moekoe/music/MainActivity;->checkWebViewStability()V

    return-void
.end method

.method public openAllFilesSettings()V
    .locals 2

    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    invoke-virtual {p0, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V

    return-void
.end method

.method public openOverlaySettings()V
    .locals 3

    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.settings.action.MANAGE_OVERLAY_PERMISSION"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    new-instance v1, Ljava/lang/StringBuilder;

    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V

    const-string v2, "package:"

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p0}, Landroid/app/Activity;->getPackageName()Ljava/lang/String;

    move-result-object v2

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    invoke-static {v1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setData(Landroid/net/Uri;)Landroid/content/Intent;

    invoke-virtual {p0, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V

    return-void
.end method

.method public playLocal(Ljava/lang/String;)V
    .locals 3

    iget-object v0, p0, Lcom/moekoe/music/MainActivity;->localPlayer:Landroid/media/MediaPlayer;

    if-eqz v0, :cond_0

    invoke-virtual {v0}, Landroid/media/MediaPlayer;->release()V

    :cond_0
    new-instance v0, Ljava/io/File;

    invoke-direct {v0, p1}, Ljava/io/File;-><init>(Ljava/lang/String;)V

    invoke-static {v0}, Landroid/net/Uri;->fromFile(Ljava/io/File;)Landroid/net/Uri;

    move-result-object v0

    invoke-static {p0, v0}, Landroid/media/MediaPlayer;->create(Landroid/content/Context;Landroid/net/Uri;)Landroid/media/MediaPlayer;

    move-result-object v1

    if-eqz v1, :cond_1

    iput-object v1, p0, Lcom/moekoe/music/MainActivity;->localPlayer:Landroid/media/MediaPlayer;

    invoke-virtual {v1}, Landroid/media/MediaPlayer;->start()V

    :cond_1
    return-void
.end method

.method public postKgmResult(Ljava/lang/String;ILjava/lang/String;)V
    .locals 5

    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    const-string v1, "window.__moeKgmResult && window.__moeKgmResult(\'"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, "\', "

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, p2}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;

    const-string v1, ")"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    new-instance v1, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v2

    invoke-direct {v1, v2}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    new-instance v2, Lcom/moekoe/music/KgmResultRunnable;

    invoke-direct {v2, v0}, Lcom/moekoe/music/KgmResultRunnable;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, v2}, Landroid/os/Handler;->post(Ljava/lang/Runnable;)Z

    return-void
.end method

.method public scanLocalMusic(Ljava/lang/String;)Ljava/lang/String;
    .locals 10

    new-instance v0, Lorg/json/JSONArray;

    invoke-direct {v0}, Lorg/json/JSONArray;-><init>()V

    new-instance v1, Ljava/io/File;

    invoke-direct {v1, p1}, Ljava/io/File;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1}, Ljava/io/File;->listFiles()[Ljava/io/File;

    move-result-object v1

    if-eqz v1, :cond_1

    array-length v2, v1

    const/4 v3, 0x0

    :goto_0
    if-ge v3, v2, :cond_1

    aget-object v4, v1, v3

    invoke-virtual {v4}, Ljava/io/File;->isFile()Z

    move-result v5

    if-eqz v5, :cond_0

    invoke-virtual {v4}, Ljava/io/File;->getName()Ljava/lang/String;

    move-result-object v5

    invoke-virtual {v5}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;

    move-result-object v5

    const/4 v6, 0x0

    const-string v7, ".mp3"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".flac"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".m4a"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".aac"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".wav"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".ogg"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".kgm"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".kgma"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".vpr"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".wma"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    const-string v7, ".dff"

    invoke-virtual {v5, v7}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v7

    or-int/2addr v6, v7

    if-eqz v6, :cond_0

    new-instance v6, Lorg/json/JSONObject;

    invoke-direct {v6}, Lorg/json/JSONObject;-><init>()V

    const-string v7, "name"

    invoke-virtual {v6, v7, v5}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    invoke-virtual {v4}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;

    move-result-object v7

    const-string v8, "path"

    invoke-virtual {v6, v8, v7}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    invoke-virtual {v0, v6}, Lorg/json/JSONArray;->put(Ljava/lang/Object;)Lorg/json/JSONArray;

    :cond_0
    add-int/lit8 v3, v3, 0x1

    goto :goto_0

    :cond_1
    invoke-virtual {v0}, Lorg/json/JSONArray;->toString()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public setStatusBarDark(Z)V
    .locals 3

    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1e

    if-lt v0, v1, :cond_1

    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;

    move-result-object v0

    invoke-virtual {v0}, Landroid/view/Window;->getInsetsController()Landroid/view/WindowInsetsController;

    move-result-object v0

    const/16 v1, 0x10

    if-eqz p1, :cond_0

    const/4 v2, 0x0

    invoke-virtual {v0, v2, v1}, Landroid/view/WindowInsetsController;->setSystemBarsAppearance(II)V

    goto :goto_0

    :cond_0
    invoke-virtual {v0, v1, v1}, Landroid/view/WindowInsetsController;->setSystemBarsAppearance(II)V

    goto :goto_0

    :cond_1
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;

    move-result-object v0

    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;

    move-result-object v0

    if-eqz p1, :cond_2

    const/4 v1, 0x0

    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V

    goto :goto_0

    :cond_2
    const/16 v1, 0x2000

    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V

    :goto_0
    return-void
.end method

.method public showFloatLyrics(Ljava/lang/String;)V
    .locals 1

    invoke-static {p0, p1}, Lcom/moekoe/music/FloatLyricsService;->show(Landroid/content/Context;Ljava/lang/String;)V

    return-void
.end method

.method public startNativeRecord(Ljava/lang/String;)V
    .locals 1

    invoke-static {p1}, Lcom/moekoe/music/NativeAudioRecognizer;->start(Ljava/lang/String;)V

    return-void
.end method

.method public stopLocal()V
    .locals 2

    iget-object v0, p0, Lcom/moekoe/music/MainActivity;->localPlayer:Landroid/media/MediaPlayer;

    if-eqz v0, :cond_0

    invoke-virtual {v0}, Landroid/media/MediaPlayer;->stop()V

    invoke-virtual {v0}, Landroid/media/MediaPlayer;->release()V

    const/4 v1, 0x0

    iput-object v1, p0, Lcom/moekoe/music/MainActivity;->localPlayer:Landroid/media/MediaPlayer;

    :cond_0
    return-void
.end method
