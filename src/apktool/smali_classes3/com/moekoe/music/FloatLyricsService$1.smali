.class Lcom/moekoe/music/FloatLyricsService$1;
.super Ljava/lang/Object;
.source "FloatLyricsService.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/FloatLyricsService;->update(Ljava/lang/String;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic val$text:Ljava/lang/String;


# direct methods
.method constructor <init>(Ljava/lang/String;)V
    .locals 0
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 43
    iput-object p1, p0, Lcom/moekoe/music/FloatLyricsService$1;->val$text:Ljava/lang/String;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 2

    .line 44
    invoke-static {}, Lcom/moekoe/music/FloatLyricsService;->access$000()Lcom/moekoe/music/FloatLyricsService;

    move-result-object v0

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService$1;->val$text:Ljava/lang/String;

    if-nez v1, :cond_0

    const-string v1, ""

    :cond_0
    invoke-static {v0, v1}, Lcom/moekoe/music/FloatLyricsService;->access$100(Lcom/moekoe/music/FloatLyricsService;Ljava/lang/String;)V

    return-void
.end method
