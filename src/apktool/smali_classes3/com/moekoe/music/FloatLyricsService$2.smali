.class Lcom/moekoe/music/FloatLyricsService$2;
.super Ljava/lang/Object;
.source "FloatLyricsService.java"

# interfaces
.implements Landroid/view/View$OnClickListener;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/FloatLyricsService;->showWindow()V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/moekoe/music/FloatLyricsService;


# direct methods
.method constructor <init>(Lcom/moekoe/music/FloatLyricsService;)V
    .locals 0

    .line 75
    iput-object p1, p0, Lcom/moekoe/music/FloatLyricsService$2;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onClick(Landroid/view/View;)V
    .locals 0

    .line 76
    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$2;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-virtual {p1}, Lcom/moekoe/music/FloatLyricsService;->stopSelf()V

    return-void
.end method
