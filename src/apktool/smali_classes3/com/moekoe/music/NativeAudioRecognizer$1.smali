.class Lcom/moekoe/music/NativeAudioRecognizer$1;
.super Ljava/lang/Object;
.source "NativeAudioRecognizer.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/NativeAudioRecognizer;->start(Ljava/lang/String;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic val$callbackId:Ljava/lang/String;


# direct methods
.method constructor <init>(Ljava/lang/String;)V
    .locals 0
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 11
    iput-object p1, p0, Lcom/moekoe/music/NativeAudioRecognizer$1;->val$callbackId:Ljava/lang/String;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 13

    const/16 v0, 0x10

    const/4 v1, 0x2

    const/16 v8, 0x1f40

    .line 16
    :try_start_0
    invoke-static {v8, v0, v1}, Landroid/media/AudioRecord;->getMinBufferSize(III)I

    move-result v0

    const/16 v2, 0x3e80

    if-gtz v0, :cond_0

    const/16 v0, 0x3e80

    .line 18
    :cond_0
    invoke-static {v0, v2}, Ljava/lang/Math;->max(II)I

    move-result v0

    .line 19
    new-instance v9, Landroid/media/AudioRecord;

    const/16 v5, 0x10

    const/4 v6, 0x2

    const/4 v3, 0x1

    move-object v2, v9

    move v4, v8

    move v7, v0

    invoke-direct/range {v2 .. v7}, Landroid/media/AudioRecord;-><init>(IIIII)V

    .line 21
    invoke-virtual {v9}, Landroid/media/AudioRecord;->getState()I

    move-result v2

    const/4 v3, 0x1

    if-eq v2, v3, :cond_1

    .line 22
    iget-object v0, p0, Lcom/moekoe/music/NativeAudioRecognizer$1;->val$callbackId:Ljava/lang/String;

    const-string v1, "ERR:INIT_FAILED"

    invoke-static {v0, v1}, Lcom/moekoe/music/NativeAudioRecognizer;->access$000(Ljava/lang/String;Ljava/lang/String;)V

    return-void

    .line 25
    :cond_1
    invoke-virtual {v9}, Landroid/media/AudioRecord;->startRecording()V

    .line 26
    new-instance v2, Ljava/io/ByteArrayOutputStream;

    invoke-direct {v2}, Ljava/io/ByteArrayOutputStream;-><init>()V

    .line 27
    new-array v3, v0, [B

    .line 28
    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J

    move-result-wide v4

    .line 29
    :cond_2
    :goto_0
    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J

    move-result-wide v6

    sub-long/2addr v6, v4

    const-wide/16 v10, 0x1770

    cmp-long v12, v6, v10

    if-gez v12, :cond_3

    const/4 v6, 0x0

    .line 30
    invoke-virtual {v9, v3, v6, v0}, Landroid/media/AudioRecord;->read([BII)I

    move-result v7

    if-lez v7, :cond_2

    .line 31
    invoke-virtual {v2, v3, v6, v7}, Ljava/io/ByteArrayOutputStream;->write([BII)V

    goto :goto_0

    .line 33
    :cond_3
    invoke-virtual {v9}, Landroid/media/AudioRecord;->stop()V

    .line 34
    invoke-virtual {v9}, Landroid/media/AudioRecord;->release()V

    .line 35
    invoke-virtual {v2}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B

    move-result-object v0

    invoke-static {v0, v8}, Lcom/moekoe/music/NativeAudioRecognizer;->access$100([BI)[B

    move-result-object v0

    .line 36
    invoke-static {v0, v1}, Landroid/util/Base64;->encodeToString([BI)Ljava/lang/String;

    move-result-object v0
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    goto :goto_2

    :catchall_0
    move-exception v0

    .line 38
    new-instance v1, Ljava/lang/StringBuilder;

    const-string v2, "ERR:"

    invoke-direct {v1, v2}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v0}, Ljava/lang/Throwable;->getMessage()Ljava/lang/String;

    move-result-object v2

    if-nez v2, :cond_4

    invoke-virtual {v0}, Ljava/lang/Object;->getClass()Ljava/lang/Class;

    move-result-object v0

    invoke-virtual {v0}, Ljava/lang/Class;->getSimpleName()Ljava/lang/String;

    move-result-object v0

    goto :goto_1

    :cond_4
    invoke-virtual {v0}, Ljava/lang/Throwable;->getMessage()Ljava/lang/String;

    move-result-object v0

    :goto_1
    invoke-virtual {v1, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    .line 40
    :goto_2
    iget-object v1, p0, Lcom/moekoe/music/NativeAudioRecognizer$1;->val$callbackId:Ljava/lang/String;

    invoke-static {v1, v0}, Lcom/moekoe/music/NativeAudioRecognizer;->access$000(Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method
