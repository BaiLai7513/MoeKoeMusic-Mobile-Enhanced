.class Lcom/moekoe/music/MusicForegroundService$2;
.super Landroid/media/session/MediaSession$Callback;
.source "MusicForegroundService.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/MusicForegroundService;->createMediaSession()Landroid/media/session/MediaSession;
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/moekoe/music/MusicForegroundService;


# direct methods
.method constructor <init>(Lcom/moekoe/music/MusicForegroundService;)V
    .locals 0
    .param p1, "this$0"    # Lcom/moekoe/music/MusicForegroundService;

    .line 165
    iput-object p1, p0, Lcom/moekoe/music/MusicForegroundService$2;->this$0:Lcom/moekoe/music/MusicForegroundService;

    invoke-direct {p0}, Landroid/media/session/MediaSession$Callback;-><init>()V

    return-void
.end method


# virtual methods
.method public onPause()V
    .locals 1

    .line 173
    const-string v0, "pause"

    invoke-static {v0}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    .line 174
    return-void
.end method

.method public onPlay()V
    .locals 1

    .line 168
    const-string v0, "play"

    invoke-static {v0}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    .line 169
    return-void
.end method

.method public onSkipToNext()V
    .locals 1

    .line 178
    const-string v0, "next"

    invoke-static {v0}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    .line 179
    return-void
.end method

.method public onSkipToPrevious()V
    .locals 1

    .line 183
    const-string v0, "prev"

    invoke-static {v0}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    .line 184
    return-void
.end method
