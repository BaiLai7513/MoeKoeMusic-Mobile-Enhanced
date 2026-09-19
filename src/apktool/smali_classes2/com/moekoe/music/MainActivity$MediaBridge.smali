.class Lcom/moekoe/music/MainActivity$MediaBridge;
.super Ljava/lang/Object;
.source "MainActivity.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingClass;
    value = Lcom/moekoe/music/MainActivity;
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x2
    name = "MediaBridge"
.end annotation


# instance fields
.field final synthetic this$0:Lcom/moekoe/music/MainActivity;


# direct methods
.method private constructor <init>(Lcom/moekoe/music/MainActivity;)V
    .locals 0

    .line 171
    iput-object p1, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method

.method synthetic constructor <init>(Lcom/moekoe/music/MainActivity;Lcom/moekoe/music/MainActivity$MediaBridge-IA;)V
    .locals 0

    invoke-direct {p0, p1}, Lcom/moekoe/music/MainActivity$MediaBridge;-><init>(Lcom/moekoe/music/MainActivity;)V

    return-void
.end method


# virtual methods
.method public canDrawOverlays()Z
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0}, Lcom/moekoe/music/MainActivity;->canDrawOverlays()Z

    move-result v0

    return v0
.end method

.method public decodeKgm(Ljava/lang/String;Ljava/lang/String;)I
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1, p2}, Lcom/moekoe/music/MainActivity;->decodeKgm(Ljava/lang/String;Ljava/lang/String;)I

    move-result v0

    return v0
.end method

.method public decodeKgmAsync(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1, p2, p3}, Lcom/moekoe/music/MainActivity;->decodeKgmAsync(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method public download(Ljava/lang/String;Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1, p2}, Lcom/moekoe/music/MainActivity;->download(Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method public exitApp()V
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    const/4 v1, 0x1

    invoke-virtual {v0, v1}, Landroid/app/Activity;->moveTaskToBack(Z)Z

    return-void
.end method

.method public hideFloatLyrics()V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0}, Lcom/moekoe/music/MainActivity;->hideFloatLyrics()V

    return-void
.end method

.method public isAllFilesGranted()Z
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0}, Lcom/moekoe/music/MainActivity;->isAllFilesGranted()Z

    move-result v0

    return v0
.end method

.method public listSubdirs(Ljava/lang/String;)Ljava/lang/String;
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1}, Lcom/moekoe/music/MainActivity;->listSubdirs(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public onPreloadDone()V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    const/4 v0, 0x1

    sput-boolean v0, Lcom/moekoe/music/MainActivity;->preloadDone:Z

    return-void
.end method

.method public onState(ZDDLjava/lang/String;)V
    .locals 6
    .param p1, "playing"    # Z
    .param p2, "position"    # D
    .param p4, "duration"    # D
    .param p6, "title"    # Ljava/lang/String;
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    .line 174
    double-to-long v1, p2

    double-to-long v3, p4

    move v0, p1

    move-object v5, p6

    invoke-static/range {v0 .. v5}, Lcom/moekoe/music/MusicForegroundService;->updatePlaybackState(ZJJLjava/lang/String;)V

    .line 175
    return-void
.end method

.method public onStateEx(ZDDLjava/lang/String;Ljava/lang/String;)V
    .locals 7
    .param p1, "playing"    # Z
    .param p2, "position"    # D
    .param p4, "duration"    # D
    .param p6, "title"    # Ljava/lang/String;
    .param p7, "artwork"    # Ljava/lang/String;
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    double-to-long v1, p2

    double-to-long v3, p4

    move v0, p1

    move-object v5, p6

    move-object v6, p7

    invoke-static/range {v0 .. v6}, Lcom/moekoe/music/MusicForegroundService;->updatePlaybackStateEx(ZJJLjava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method public openAllFilesSettings()V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0}, Lcom/moekoe/music/MainActivity;->openAllFilesSettings()V

    return-void
.end method

.method public openOverlaySettings()V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0}, Lcom/moekoe/music/MainActivity;->openOverlaySettings()V

    return-void
.end method

.method public playLocal(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1}, Lcom/moekoe/music/MainActivity;->playLocal(Ljava/lang/String;)V

    return-void
.end method

.method public scanLocalMusic(Ljava/lang/String;)Ljava/lang/String;
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1}, Lcom/moekoe/music/MainActivity;->scanLocalMusic(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public setStatusBarDark(Z)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1}, Lcom/moekoe/music/MainActivity;->setStatusBarDark(Z)V

    return-void
.end method

.method public showFloatLyrics(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1}, Lcom/moekoe/music/MainActivity;->showFloatLyrics(Ljava/lang/String;)V

    return-void
.end method

.method public startNativeRecord(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0, p1}, Lcom/moekoe/music/MainActivity;->startNativeRecord(Ljava/lang/String;)V

    return-void
.end method

.method public stopLocal()V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$MediaBridge;->this$0:Lcom/moekoe/music/MainActivity;

    invoke-virtual {v0}, Lcom/moekoe/music/MainActivity;->stopLocal()V

    return-void
.end method

.method public updateFloatLyrics(Ljava/lang/String;)V
    .locals 0
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    invoke-static {p1}, Lcom/moekoe/music/MainActivity;->updateFloatLyrics(Ljava/lang/String;)V

    return-void
.end method
