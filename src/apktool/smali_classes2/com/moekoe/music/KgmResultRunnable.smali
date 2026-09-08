.class public Lcom/moekoe/music/KgmResultRunnable;
.super Ljava/lang/Object;
.source "KgmResultRunnable.java"

# interfaces
.implements Ljava/lang/Runnable;


# instance fields
.field public final js:Ljava/lang/String;


# direct methods
.method public constructor <init>(Ljava/lang/String;)V
    .locals 0

    iput-object p1, p0, Lcom/moekoe/music/KgmResultRunnable;->js:Ljava/lang/String;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 1

    iget-object v0, p0, Lcom/moekoe/music/KgmResultRunnable;->js:Ljava/lang/String;

    invoke-static {v0}, Lcom/moekoe/music/MainActivity;->evaluateJs(Ljava/lang/String;)V

    return-void
.end method
