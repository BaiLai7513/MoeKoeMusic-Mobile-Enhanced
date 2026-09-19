.class Lcom/moekoe/music/CoverArtLoader$1;
.super Ljava/lang/Object;
.source "CoverArtLoader.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/CoverArtLoader;->load(Landroid/media/session/MediaSession;Ljava/lang/String;Ljava/lang/String;J)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic val$durationMs:J

.field final synthetic val$session:Landroid/media/session/MediaSession;

.field final synthetic val$titleWithArtist:Ljava/lang/String;

.field final synthetic val$url:Ljava/lang/String;


# direct methods
.method constructor <init>(Ljava/lang/String;Landroid/media/session/MediaSession;Ljava/lang/String;J)V
    .locals 0
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 51
    iput-object p1, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$url:Ljava/lang/String;

    iput-object p2, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$session:Landroid/media/session/MediaSession;

    iput-object p3, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$titleWithArtist:Ljava/lang/String;

    iput-wide p4, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$durationMs:J

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 5

    .line 54
    nop

    .line 55
    nop

    .line 56
    nop

    .line 58
    const/4 v0, 0x0

    :try_start_0
    new-instance v1, Ljava/net/URL;

    iget-object v2, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$url:Ljava/lang/String;

    invoke-direct {v1, v2}, Ljava/net/URL;-><init>(Ljava/lang/String;)V

    .line 59
    invoke-virtual {v1}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;

    move-result-object v1

    check-cast v1, Ljava/net/HttpURLConnection;
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_4

    .line 60
    const/16 v2, 0x1388

    :try_start_1
    invoke-virtual {v1, v2}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V

    .line 61
    const/16 v2, 0x2710

    invoke-virtual {v1, v2}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V

    .line 62
    const/4 v2, 0x1

    invoke-virtual {v1, v2}, Ljava/net/HttpURLConnection;->setInstanceFollowRedirects(Z)V

    .line 63
    const-string v2, "User-Agent"

    const-string v3, "Mozilla/5.0 (Linux; Android) MoeKoeMusic"

    invoke-virtual {v1, v2, v3}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    .line 64
    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->connect()V

    .line 65
    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->getResponseCode()I

    move-result v2

    .line 66
    const/16 v3, 0xc8

    if-lt v2, v3, :cond_0

    const/16 v3, 0x190

    if-ge v2, v3, :cond_0

    .line 67
    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;

    move-result-object v2
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_3

    .line 68
    :try_start_2
    invoke-static {v2}, Landroid/graphics/BitmapFactory;->decodeStream(Ljava/io/InputStream;)Landroid/graphics/Bitmap;

    move-result-object v0

    .line 69
    invoke-static {v0}, Lcom/moekoe/music/CoverArtLoader;->access$000(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;

    move-result-object v0
    :try_end_2
    .catchall {:try_start_2 .. :try_end_2} :catchall_0

    move-object v4, v2

    move-object v2, v0

    move-object v0, v4

    goto :goto_0

    .line 71
    :catchall_0
    move-exception v3

    move-object v4, v2

    move-object v2, v0

    move-object v0, v4

    goto :goto_4

    .line 74
    :cond_0
    move-object v2, v0

    :goto_0
    if-eqz v0, :cond_1

    :try_start_3
    invoke-virtual {v0}, Ljava/io/InputStream;->close()V
    :try_end_3
    .catchall {:try_start_3 .. :try_end_3} :catchall_1

    goto :goto_1

    .line 75
    :catchall_1
    move-exception v0

    goto :goto_2

    .line 76
    :cond_1
    :goto_1
    nop

    .line 78
    :goto_2
    if-eqz v1, :cond_2

    :try_start_4
    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->disconnect()V
    :try_end_4
    .catchall {:try_start_4 .. :try_end_4} :catchall_2

    goto :goto_3

    .line 79
    :catchall_2
    move-exception v0

    .line 81
    goto :goto_7

    .line 80
    :cond_2
    :goto_3
    goto :goto_7

    .line 71
    :catchall_3
    move-exception v2

    move-object v2, v0

    goto :goto_4

    :catchall_4
    move-exception v1

    move-object v1, v0

    move-object v2, v1

    .line 74
    :goto_4
    if-eqz v0, :cond_3

    :try_start_5
    invoke-virtual {v0}, Ljava/io/InputStream;->close()V
    :try_end_5
    .catchall {:try_start_5 .. :try_end_5} :catchall_5

    goto :goto_5

    .line 75
    :catchall_5
    move-exception v0

    goto :goto_6

    .line 76
    :cond_3
    :goto_5
    nop

    .line 78
    :goto_6
    if-eqz v1, :cond_2

    :try_start_6
    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->disconnect()V
    :try_end_6
    .catchall {:try_start_6 .. :try_end_6} :catchall_2

    goto :goto_3

    .line 82
    :goto_7
    nop

    .line 83
    if-eqz v2, :cond_4

    .line 84
    iget-object v0, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$url:Ljava/lang/String;

    invoke-static {v0}, Lcom/moekoe/music/CoverArtLoader;->access$102(Ljava/lang/String;)Ljava/lang/String;

    .line 85
    invoke-static {v2}, Lcom/moekoe/music/CoverArtLoader;->access$202(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;

    .line 86
    iget-object v0, p0, Lcom/moekoe/music/CoverArtLoader$1;->val$url:Ljava/lang/String;

    invoke-static {v0}, Lcom/moekoe/music/CoverArtLoader;->access$302(Ljava/lang/String;)Ljava/lang/String;

    .line 88
    :cond_4
    const-string v0, ""

    invoke-static {v0}, Lcom/moekoe/music/CoverArtLoader;->access$402(Ljava/lang/String;)Ljava/lang/String;

    .line 89
    invoke-static {}, Lcom/moekoe/music/CoverArtLoader;->access$600()Landroid/os/Handler;

    move-result-object v0

    new-instance v1, Lcom/moekoe/music/CoverArtLoader$1$1;

    invoke-direct {v1, p0, v2}, Lcom/moekoe/music/CoverArtLoader$1$1;-><init>(Lcom/moekoe/music/CoverArtLoader$1;Landroid/graphics/Bitmap;)V

    invoke-virtual {v0, v1}, Landroid/os/Handler;->post(Ljava/lang/Runnable;)Z

    .line 95
    return-void
.end method
