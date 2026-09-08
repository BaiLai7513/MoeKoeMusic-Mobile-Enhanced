.class public Lcom/moekoe/music/FloatLyricsService;
.super Landroid/app/Service;
.source "FloatLyricsService.java"


# static fields
.field private static instance:Lcom/moekoe/music/FloatLyricsService;


# instance fields
.field private lyricsView:Landroid/widget/TextView;

.field private params:Landroid/view/WindowManager$LayoutParams;

.field private root:Landroid/widget/LinearLayout;

.field private startTouchX:F

.field private startTouchY:F

.field private startX:F

.field private startY:F

.field private wm:Landroid/view/WindowManager;


# direct methods
.method public constructor <init>()V
    .locals 0

    .line 19
    invoke-direct {p0}, Landroid/app/Service;-><init>()V

    return-void
.end method

.method static synthetic access$000()Lcom/moekoe/music/FloatLyricsService;
    .locals 1

    .line 19
    sget-object v0, Lcom/moekoe/music/FloatLyricsService;->instance:Lcom/moekoe/music/FloatLyricsService;

    return-object v0
.end method

.method static synthetic access$100(Lcom/moekoe/music/FloatLyricsService;Ljava/lang/String;)V
    .locals 0

    .line 19
    invoke-direct {p0, p1}, Lcom/moekoe/music/FloatLyricsService;->setText(Ljava/lang/String;)V

    return-void
.end method

.method static synthetic access$200(Lcom/moekoe/music/FloatLyricsService;)F
    .locals 0

    .line 19
    iget p0, p0, Lcom/moekoe/music/FloatLyricsService;->startX:F

    return p0
.end method

.method static synthetic access$202(Lcom/moekoe/music/FloatLyricsService;F)F
    .locals 0

    .line 19
    iput p1, p0, Lcom/moekoe/music/FloatLyricsService;->startX:F

    return p1
.end method

.method static synthetic access$300(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager$LayoutParams;
    .locals 0

    .line 19
    iget-object p0, p0, Lcom/moekoe/music/FloatLyricsService;->params:Landroid/view/WindowManager$LayoutParams;

    return-object p0
.end method

.method static synthetic access$400(Lcom/moekoe/music/FloatLyricsService;)F
    .locals 0

    .line 19
    iget p0, p0, Lcom/moekoe/music/FloatLyricsService;->startY:F

    return p0
.end method

.method static synthetic access$402(Lcom/moekoe/music/FloatLyricsService;F)F
    .locals 0

    .line 19
    iput p1, p0, Lcom/moekoe/music/FloatLyricsService;->startY:F

    return p1
.end method

.method static synthetic access$500(Lcom/moekoe/music/FloatLyricsService;)F
    .locals 0

    .line 19
    iget p0, p0, Lcom/moekoe/music/FloatLyricsService;->startTouchX:F

    return p0
.end method

.method static synthetic access$502(Lcom/moekoe/music/FloatLyricsService;F)F
    .locals 0

    .line 19
    iput p1, p0, Lcom/moekoe/music/FloatLyricsService;->startTouchX:F

    return p1
.end method

.method static synthetic access$600(Lcom/moekoe/music/FloatLyricsService;)F
    .locals 0

    .line 19
    iget p0, p0, Lcom/moekoe/music/FloatLyricsService;->startTouchY:F

    return p0
.end method

.method static synthetic access$602(Lcom/moekoe/music/FloatLyricsService;F)F
    .locals 0

    .line 19
    iput p1, p0, Lcom/moekoe/music/FloatLyricsService;->startTouchY:F

    return p1
.end method

.method static synthetic access$700(Lcom/moekoe/music/FloatLyricsService;)Landroid/view/WindowManager;
    .locals 0

    .line 19
    iget-object p0, p0, Lcom/moekoe/music/FloatLyricsService;->wm:Landroid/view/WindowManager;

    return-object p0
.end method

.method static synthetic access$800(Lcom/moekoe/music/FloatLyricsService;)Landroid/widget/LinearLayout;
    .locals 0

    .line 19
    iget-object p0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    return-object p0
.end method

.method public static hide(Landroid/content/Context;)V
    .locals 2

    .line 36
    new-instance v0, Landroid/content/Intent;

    const-class v1, Lcom/moekoe/music/FloatLyricsService;

    invoke-direct {v0, p0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    .line 37
    const-string v1, "hide"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setAction(Ljava/lang/String;)Landroid/content/Intent;

    .line 38
    invoke-virtual {p0, v0}, Landroid/content/Context;->startService(Landroid/content/Intent;)Landroid/content/ComponentName;

    return-void
.end method

.method private setText(Ljava/lang/String;)V
    .locals 1

    .line 109
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    if-eqz v0, :cond_0

    invoke-virtual {v0, p1}, Landroid/widget/TextView;->setText(Ljava/lang/CharSequence;)V

    :cond_0
    return-void
.end method

.method public static show(Landroid/content/Context;Ljava/lang/String;)V
    .locals 2

    .line 28
    new-instance v0, Landroid/content/Intent;

    const-class v1, Lcom/moekoe/music/FloatLyricsService;

    invoke-direct {v0, p0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    .line 29
    const-string v1, "show"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setAction(Ljava/lang/String;)Landroid/content/Intent;

    if-nez p1, :cond_0

    .line 30
    const-string p1, ""

    :cond_0
    const-string v1, "text"

    invoke-virtual {v0, v1, p1}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;

    .line 31
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1a

    if-lt p1, v1, :cond_1

    invoke-virtual {p0, v0}, Landroid/content/Context;->startForegroundService(Landroid/content/Intent;)Landroid/content/ComponentName;

    goto :goto_0

    .line 32
    :cond_1
    invoke-virtual {p0, v0}, Landroid/content/Context;->startService(Landroid/content/Intent;)Landroid/content/ComponentName;

    :goto_0
    return-void
.end method

.method private showWindow()V
    .locals 7

    .line 63
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    if-eqz v0, :cond_0

    return-void

    .line 64
    :cond_0
    new-instance v0, Landroid/widget/LinearLayout;

    invoke-direct {v0, p0}, Landroid/widget/LinearLayout;-><init>(Landroid/content/Context;)V

    iput-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    const/4 v1, 0x1

    .line 65
    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setOrientation(I)V

    .line 66
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    const/16 v1, 0x14

    const/16 v2, 0xc

    invoke-virtual {v0, v1, v2, v1, v2}, Landroid/widget/LinearLayout;->setPadding(IIII)V

    .line 67
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    const/high16 v1, -0x56000000

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setBackgroundColor(I)V

    .line 68
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    const/16 v1, 0x11

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setGravity(I)V

    .line 69
    new-instance v0, Landroid/widget/TextView;

    invoke-direct {v0, p0}, Landroid/widget/TextView;-><init>(Landroid/content/Context;)V

    .line 70
    const-string v2, "\u00d7"

    invoke-virtual {v0, v2}, Landroid/widget/TextView;->setText(Ljava/lang/CharSequence;)V

    const/high16 v2, 0x41900000    # 18.0f

    .line 71
    invoke-virtual {v0, v2}, Landroid/widget/TextView;->setTextSize(F)V

    const/4 v2, -0x1

    .line 72
    invoke-virtual {v0, v2}, Landroid/widget/TextView;->setTextColor(I)V

    const/4 v3, 0x5

    .line 73
    invoke-virtual {v0, v3}, Landroid/widget/TextView;->setGravity(I)V

    const/4 v3, 0x4

    const/4 v4, 0x0

    .line 74
    invoke-virtual {v0, v4, v4, v4, v3}, Landroid/widget/TextView;->setPadding(IIII)V

    .line 75
    new-instance v3, Lcom/moekoe/music/FloatLyricsService$2;

    invoke-direct {v3, p0}, Lcom/moekoe/music/FloatLyricsService$2;-><init>(Lcom/moekoe/music/FloatLyricsService;)V

    invoke-virtual {v0, v3}, Landroid/widget/TextView;->setOnClickListener(Landroid/view/View$OnClickListener;)V

    .line 78
    new-instance v3, Landroid/widget/TextView;

    invoke-direct {v3, p0}, Landroid/widget/TextView;-><init>(Landroid/content/Context;)V

    iput-object v3, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    .line 79
    invoke-virtual {v3, v2}, Landroid/widget/TextView;->setTextColor(I)V

    .line 80
    iget-object v3, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    const/high16 v4, 0x41800000    # 16.0f

    invoke-virtual {v3, v4}, Landroid/widget/TextView;->setTextSize(F)V

    .line 81
    iget-object v3, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    invoke-virtual {v3, v1}, Landroid/widget/TextView;->setGravity(I)V

    .line 82
    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    const/16 v3, 0x384

    invoke-virtual {v1, v3}, Landroid/widget/TextView;->setMaxWidth(I)V

    .line 83
    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    new-instance v3, Landroid/widget/LinearLayout$LayoutParams;

    const/4 v4, -0x2

    invoke-direct {v3, v2, v4}, Landroid/widget/LinearLayout$LayoutParams;-><init>(II)V

    invoke-virtual {v1, v0, v3}, Landroid/widget/LinearLayout;->addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V

    .line 84
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    new-instance v2, Landroid/widget/LinearLayout$LayoutParams;

    invoke-direct {v2, v4, v4}, Landroid/widget/LinearLayout$LayoutParams;-><init>(II)V

    invoke-virtual {v0, v1, v2}, Landroid/widget/LinearLayout;->addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V

    .line 85
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1a

    if-lt v0, v1, :cond_1

    const/16 v0, 0x7f6

    const/16 v4, 0x7f6

    goto :goto_0

    :cond_1
    const/16 v0, 0x7d2

    const/16 v4, 0x7d2

    .line 86
    :goto_0
    new-instance v0, Landroid/view/WindowManager$LayoutParams;

    const/16 v5, 0x108

    const/4 v6, -0x3

    const/4 v2, -0x2

    const/4 v3, -0x2

    move-object v1, v0

    invoke-direct/range {v1 .. v6}, Landroid/view/WindowManager$LayoutParams;-><init>(IIIII)V

    iput-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->params:Landroid/view/WindowManager$LayoutParams;

    const/16 v1, 0x31

    .line 88
    iput v1, v0, Landroid/view/WindowManager$LayoutParams;->gravity:I

    .line 89
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->params:Landroid/view/WindowManager$LayoutParams;

    const/16 v1, 0xc8

    iput v1, v0, Landroid/view/WindowManager$LayoutParams;->y:I

    .line 90
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    new-instance v1, Lcom/moekoe/music/FloatLyricsService$3;

    invoke-direct {v1, p0}, Lcom/moekoe/music/FloatLyricsService$3;-><init>(Lcom/moekoe/music/FloatLyricsService;)V

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setOnTouchListener(Landroid/view/View$OnTouchListener;)V

    .line 105
    :try_start_0
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->wm:Landroid/view/WindowManager;

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    iget-object v2, p0, Lcom/moekoe/music/FloatLyricsService;->params:Landroid/view/WindowManager$LayoutParams;

    invoke-interface {v0, v1, v2}, Landroid/view/WindowManager;->addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_1

    :catch_0
    invoke-virtual {p0}, Lcom/moekoe/music/FloatLyricsService;->stopSelf()V

    :goto_1
    return-void
.end method

.method public static update(Ljava/lang/String;)V
    .locals 2

    .line 42
    sget-object v0, Lcom/moekoe/music/FloatLyricsService;->instance:Lcom/moekoe/music/FloatLyricsService;

    if-nez v0, :cond_0

    return-void

    .line 43
    :cond_0
    new-instance v0, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    new-instance v1, Lcom/moekoe/music/FloatLyricsService$1;

    invoke-direct {v1, p0}, Lcom/moekoe/music/FloatLyricsService$1;-><init>(Ljava/lang/String;)V

    invoke-virtual {v0, v1}, Landroid/os/Handler;->post(Ljava/lang/Runnable;)Z

    return-void
.end method


# virtual methods
.method public onBind(Landroid/content/Intent;)Landroid/os/IBinder;
    .locals 0

    const/4 p1, 0x0

    return-object p1
.end method

.method public onCreate()V
    .locals 1

    .line 49
    invoke-super {p0}, Landroid/app/Service;->onCreate()V

    .line 50
    sput-object p0, Lcom/moekoe/music/FloatLyricsService;->instance:Lcom/moekoe/music/FloatLyricsService;

    .line 51
    const-string v0, "window"

    invoke-virtual {p0, v0}, Lcom/moekoe/music/FloatLyricsService;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/view/WindowManager;

    iput-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->wm:Landroid/view/WindowManager;

    return-void
.end method

.method public onDestroy()V
    .locals 2

    .line 113
    iget-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    if-eqz v0, :cond_0

    iget-object v1, p0, Lcom/moekoe/music/FloatLyricsService;->wm:Landroid/view/WindowManager;

    if-eqz v1, :cond_0

    .line 114
    :try_start_0
    invoke-interface {v1, v0}, Landroid/view/WindowManager;->removeView(Landroid/view/View;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    nop

    :cond_0
    :goto_0
    const/4 v0, 0x0

    .line 116
    iput-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->root:Landroid/widget/LinearLayout;

    .line 117
    iput-object v0, p0, Lcom/moekoe/music/FloatLyricsService;->lyricsView:Landroid/widget/TextView;

    .line 118
    sget-object v1, Lcom/moekoe/music/FloatLyricsService;->instance:Lcom/moekoe/music/FloatLyricsService;

    if-ne v1, p0, :cond_1

    sput-object v0, Lcom/moekoe/music/FloatLyricsService;->instance:Lcom/moekoe/music/FloatLyricsService;

    .line 119
    :cond_1
    invoke-super {p0}, Landroid/app/Service;->onDestroy()V

    return-void
.end method

.method public onStartCommand(Landroid/content/Intent;II)I
    .locals 0

    if-eqz p1, :cond_0

    .line 55
    const-string p2, "hide"

    invoke-virtual {p1}, Landroid/content/Intent;->getAction()Ljava/lang/String;

    move-result-object p3

    invoke-virtual {p2, p3}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p2

    if-eqz p2, :cond_0

    invoke-virtual {p0}, Lcom/moekoe/music/FloatLyricsService;->stopSelf()V

    const/4 p1, 0x2

    return p1

    .line 56
    :cond_0
    invoke-direct {p0}, Lcom/moekoe/music/FloatLyricsService;->showWindow()V

    .line 57
    const-string p2, ""

    if-eqz p1, :cond_1

    const-string p3, "text"

    invoke-virtual {p1, p3}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    goto :goto_0

    :cond_1
    move-object p1, p2

    :goto_0
    if-nez p1, :cond_2

    goto :goto_1

    :cond_2
    move-object p2, p1

    .line 58
    :goto_1
    invoke-direct {p0, p2}, Lcom/moekoe/music/FloatLyricsService;->setText(Ljava/lang/String;)V

    const/4 p1, 0x1

    return p1
.end method
