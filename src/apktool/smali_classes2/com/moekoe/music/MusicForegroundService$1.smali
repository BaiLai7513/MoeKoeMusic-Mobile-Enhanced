.class Lcom/moekoe/music/MusicForegroundService$1;
.super Ljava/lang/Object;
.source "MusicForegroundService.java"

# interfaces
.implements Lcom/moekoe/music/NodeEngine$Listener;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/MusicForegroundService;->onCreate()V
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

    .line 52
    iput-object p1, p0, Lcom/moekoe/music/MusicForegroundService$1;->this$0:Lcom/moekoe/music/MusicForegroundService;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onError(Ljava/lang/String;)V
    .locals 2
    .param p1, "message"    # Ljava/lang/String;

    .line 60
    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    const-string v1, "Node engine error: "

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v0

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v0

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    const-string v1, "MoeKoeService"

    invoke-static {v1, v0}, Landroid/util/Log;->e(Ljava/lang/String;Ljava/lang/String;)I

    .line 61
    return-void
.end method

.method public onStarted()V
    .locals 2

    .line 55
    const-string v0, "MoeKoeService"

    const-string v1, "Node engine starting; waiting for port 6521"

    invoke-static {v0, v1}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I

    .line 56
    return-void
.end method
