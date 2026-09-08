.class public Lcom/moekoe/music/KgmDecodeRunnable;
.super Ljava/lang/Object;
.source "KgmDecodeRunnable.java"

# interfaces
.implements Ljava/lang/Runnable;


# instance fields
.field public final activity:Lcom/moekoe/music/MainActivity;

.field public final callbackId:Ljava/lang/String;

.field public final inputPath:Ljava/lang/String;

.field public final outputPath:Ljava/lang/String;


# direct methods
.method public constructor <init>(Lcom/moekoe/music/MainActivity;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .locals 0

    iput-object p1, p0, Lcom/moekoe/music/KgmDecodeRunnable;->activity:Lcom/moekoe/music/MainActivity;

    iput-object p2, p0, Lcom/moekoe/music/KgmDecodeRunnable;->inputPath:Ljava/lang/String;

    iput-object p3, p0, Lcom/moekoe/music/KgmDecodeRunnable;->outputPath:Ljava/lang/String;

    iput-object p4, p0, Lcom/moekoe/music/KgmDecodeRunnable;->callbackId:Ljava/lang/String;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 4

    :try_start_0
    iget-object v0, p0, Lcom/moekoe/music/KgmDecodeRunnable;->activity:Lcom/moekoe/music/MainActivity;

    iget-object v1, p0, Lcom/moekoe/music/KgmDecodeRunnable;->inputPath:Ljava/lang/String;

    iget-object v2, p0, Lcom/moekoe/music/KgmDecodeRunnable;->outputPath:Ljava/lang/String;

    invoke-virtual {v0, v1, v2}, Lcom/moekoe/music/MainActivity;->decodeKgm(Ljava/lang/String;Ljava/lang/String;)I

    move-result v3
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception v0

    const/4 v3, -0x1

    :goto_0
    iget-object v0, p0, Lcom/moekoe/music/KgmDecodeRunnable;->activity:Lcom/moekoe/music/MainActivity;

    iget-object v1, p0, Lcom/moekoe/music/KgmDecodeRunnable;->callbackId:Ljava/lang/String;

    iget-object v2, p0, Lcom/moekoe/music/KgmDecodeRunnable;->inputPath:Ljava/lang/String;

    invoke-virtual {v0, v1, v3, v2}, Lcom/moekoe/music/MainActivity;->postKgmResult(Ljava/lang/String;ILjava/lang/String;)V

    return-void
.end method
