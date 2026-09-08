.class Lcom/moekoe/music/MusicAppKeeper$1;
.super Ljava/lang/Object;
.source "MusicAppKeeper.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingClass;
    value = Lcom/moekoe/music/MusicAppKeeper;
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/moekoe/music/MusicAppKeeper;


# direct methods
.method constructor <init>(Lcom/moekoe/music/MusicAppKeeper;)V
    .locals 0
    .param p1, "this$0"    # Lcom/moekoe/music/MusicAppKeeper;

    .line 46
    iput-object p1, p0, Lcom/moekoe/music/MusicAppKeeper$1;->this$0:Lcom/moekoe/music/MusicAppKeeper;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 3

    .line 49
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper$1;->this$0:Lcom/moekoe/music/MusicAppKeeper;

    invoke-static {v0}, Lcom/moekoe/music/MusicAppKeeper;->-$$Nest$mscan(Lcom/moekoe/music/MusicAppKeeper;)V

    .line 50
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper$1;->this$0:Lcom/moekoe/music/MusicAppKeeper;

    invoke-static {v0}, Lcom/moekoe/music/MusicAppKeeper;->-$$Nest$fgethandler(Lcom/moekoe/music/MusicAppKeeper;)Landroid/os/Handler;

    move-result-object v0

    const-wide/16 v1, 0x7530

    invoke-virtual {v0, p0, v1, v2}, Landroid/os/Handler;->postDelayed(Ljava/lang/Runnable;J)Z

    .line 51
    return-void
.end method
