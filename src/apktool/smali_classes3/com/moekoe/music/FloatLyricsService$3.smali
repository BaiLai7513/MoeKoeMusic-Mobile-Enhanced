.class Lcom/moekoe/music/FloatLyricsService$3;
.super Ljava/lang/Object;
.source "FloatLyricsService.java"

# interfaces
.implements Landroid/view/View$OnTouchListener;


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

    .line 90
    iput-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onTouch(Landroid/view/View;Landroid/view/MotionEvent;)Z
    .locals 3

    .line 92
    invoke-virtual {p2}, Landroid/view/MotionEvent;->getAction()I

    move-result p1

    const/4 v0, 0x1

    if-eqz p1, :cond_2

    const/4 v1, 0x2

    if-eq p1, v1, :cond_0

    const/4 p1, 0x0

    return p1

    .line 97
    :cond_0
    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$300(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager$LayoutParams;

    move-result-object p1

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {v1}, Lcom/moekoe/music/FloatLyricsService;->access$200(Lcom/moekoe/music/FloatLyricsService;)F

    move-result v1

    invoke-virtual {p2}, Landroid/view/MotionEvent;->getRawX()F

    move-result v2

    add-float/2addr v1, v2

    iget-object v2, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {v2}, Lcom/moekoe/music/FloatLyricsService;->access$500(Lcom/moekoe/music/FloatLyricsService;)F

    move-result v2

    sub-float/2addr v1, v2

    float-to-int v1, v1

    iput v1, p1, Landroid/view/WindowManager$LayoutParams;->x:I

    .line 98
    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$300(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager$LayoutParams;

    move-result-object p1

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {v1}, Lcom/moekoe/music/FloatLyricsService;->access$400(Lcom/moekoe/music/FloatLyricsService;)F

    move-result v1

    invoke-virtual {p2}, Landroid/view/MotionEvent;->getRawY()F

    move-result p2

    add-float/2addr v1, p2

    iget-object p2, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p2}, Lcom/moekoe/music/FloatLyricsService;->access$600(Lcom/moekoe/music/FloatLyricsService;)F

    move-result p2

    sub-float/2addr v1, p2

    float-to-int p2, v1

    iput p2, p1, Landroid/view/WindowManager$LayoutParams;->y:I

    .line 99
    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$700(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager;

    move-result-object p1

    if-eqz p1, :cond_1

    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$800(Lcom/moekoe/music/FloatLyricsService;)Landroid/widget/LinearLayout;

    move-result-object p1

    if-eqz p1, :cond_1

    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$700(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager;

    move-result-object p1

    iget-object p2, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p2}, Lcom/moekoe/music/FloatLyricsService;->access$800(Lcom/moekoe/music/FloatLyricsService;)Landroid/widget/LinearLayout;

    move-result-object p2

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {v1}, Lcom/moekoe/music/FloatLyricsService;->access$300(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager$LayoutParams;

    move-result-object v1

    invoke-interface {p1, p2, v1}, Landroid/view/WindowManager;->updateViewLayout(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V

    :cond_1
    return v0

    .line 94
    :cond_2
    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$300(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager$LayoutParams;

    move-result-object v1

    iget v1, v1, Landroid/view/WindowManager$LayoutParams;->x:I

    int-to-float v1, v1

    invoke-static {p1, v1}, Lcom/moekoe/music/FloatLyricsService;->access$202(Lcom/moekoe/music/FloatLyricsService;F)F

    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-static {p1}, Lcom/moekoe/music/FloatLyricsService;->access$300(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager$LayoutParams;

    move-result-object v1

    iget v1, v1, Landroid/view/WindowManager$LayoutParams;->y:I

    int-to-float v1, v1

    invoke-static {p1, v1}, Lcom/moekoe/music/FloatLyricsService;->access$402(Lcom/moekoe/music/FloatLyricsService;F)F

    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-virtual {p2}, Landroid/view/MotionEvent;->getRawX()F

    move-result v1

    invoke-static {p1, v1}, Lcom/moekoe/music/FloatLyricsService;->access$502(Lcom/moekoe/music/FloatLyricsService;F)F

    iget-object p1, p0, Lcom/moekoe/music/FloatLyricsService$3;->this$0:Lcom/moekoe/music/FloatLyricsService;

    invoke-virtual {p2}, Landroid/view/MotionEvent;->getRawY()F

    move-result p2

    invoke-static {p1, p2}, Lcom/moekoe/music/FloatLyricsService;->access$602(Lcom/moekoe/music/FloatLyricsService;F)F

    return v0
.end method
