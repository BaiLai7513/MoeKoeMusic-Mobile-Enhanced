.class public final Lcom/moekoe/music/CoverArtLoader;
.super Ljava/lang/Object;
.source "CoverArtLoader.java"


# static fields
.field private static final MAIN:Landroid/os/Handler;

.field private static lastBitmap:Landroid/graphics/Bitmap;

.field private static lastUrl:Ljava/lang/String;

.field private static loadingUrl:Ljava/lang/String;


# direct methods
.method static constructor <clinit>()V
    .locals 2

    .line 19
    new-instance v0, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->MAIN:Landroid/os/Handler;

    .line 20
    const-string v0, ""

    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->lastUrl:Ljava/lang/String;

    .line 22
    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    return-void
.end method

.method private constructor <init>()V
    .locals 0

    .line 24
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    .line 25
    return-void
.end method

.method static synthetic access$002(Ljava/lang/String;)Ljava/lang/String;
    .locals 0

    .line 18
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->lastUrl:Ljava/lang/String;

    return-object p0
.end method

.method static synthetic access$102(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;
    .locals 0

    .line 18
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->lastBitmap:Landroid/graphics/Bitmap;

    return-object p0
.end method

.method static synthetic access$202(Ljava/lang/String;)Ljava/lang/String;
    .locals 0

    .line 18
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    return-object p0
.end method

.method static synthetic access$300(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V
    .locals 0

    .line 18
    invoke-static {p0, p1, p2, p3, p4}, Lcom/moekoe/music/CoverArtLoader;->apply(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V

    return-void
.end method

.method static synthetic access$400()Landroid/os/Handler;
    .locals 1

    .line 18
    sget-object v0, Lcom/moekoe/music/CoverArtLoader;->MAIN:Landroid/os/Handler;

    return-object v0
.end method

.method private static apply(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V
    .locals 3

    .line 92
    if-eqz p0, :cond_3

    if-nez p1, :cond_0

    goto :goto_1

    .line 96
    :cond_0
    const-string v0, ""

    if-nez p2, :cond_1

    move-object p2, v0

    .line 97
    :cond_1
    nop

    .line 98
    :try_start_0
    const-string v1, " - "

    invoke-virtual {p2, v1}, Ljava/lang/String;->indexOf(Ljava/lang/String;)I

    move-result v1

    .line 99
    if-lez v1, :cond_2

    .line 100
    add-int/lit8 v0, v1, 0x3

    invoke-virtual {p2, v0}, Ljava/lang/String;->substring(I)Ljava/lang/String;

    move-result-object v0

    .line 101
    const/4 v2, 0x0

    invoke-virtual {p2, v2, v1}, Ljava/lang/String;->substring(II)Ljava/lang/String;

    move-result-object p2

    .line 103
    :cond_2
    new-instance v1, Landroid/media/MediaMetadata$Builder;

    invoke-direct {v1}, Landroid/media/MediaMetadata$Builder;-><init>()V

    const-string v2, "android.media.metadata.TITLE"

    .line 104
    invoke-virtual {v1, v2, p2}, Landroid/media/MediaMetadata$Builder;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string v1, "android.media.metadata.ARTIST"

    .line 105
    invoke-virtual {p2, v1, v0}, Landroid/media/MediaMetadata$Builder;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string v0, "android.media.metadata.DURATION"

    .line 106
    invoke-virtual {p2, v0, p3, p4}, Landroid/media/MediaMetadata$Builder;->putLong(Ljava/lang/String;J)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string p3, "android.media.metadata.ALBUM_ART"

    .line 107
    invoke-virtual {p2, p3, p1}, Landroid/media/MediaMetadata$Builder;->putBitmap(Ljava/lang/String;Landroid/graphics/Bitmap;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string p3, "android.media.metadata.ART"

    .line 108
    invoke-virtual {p2, p3, p1}, Landroid/media/MediaMetadata$Builder;->putBitmap(Ljava/lang/String;Landroid/graphics/Bitmap;)Landroid/media/MediaMetadata$Builder;

    move-result-object p1

    .line 109
    invoke-virtual {p1}, Landroid/media/MediaMetadata$Builder;->build()Landroid/media/MediaMetadata;

    move-result-object p1

    invoke-virtual {p0, p1}, Landroid/media/session/MediaSession;->setMetadata(Landroid/media/MediaMetadata;)V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 111
    goto :goto_0

    .line 110
    :catchall_0
    move-exception p0

    .line 112
    :goto_0
    return-void

    .line 93
    :cond_3
    :goto_1
    return-void
.end method

.method public static load(Landroid/media/session/MediaSession;Ljava/lang/String;Ljava/lang/String;J)V
    .locals 7

    .line 29
    if-nez p0, :cond_0

    .line 30
    return-void

    .line 32
    :cond_0
    if-nez p1, :cond_1

    const-string p1, ""

    goto :goto_0

    :cond_1
    invoke-virtual {p1}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object p1

    :goto_0
    move-object v1, p1

    .line 33
    invoke-virtual {v1}, Ljava/lang/String;->length()I

    move-result p1

    if-nez p1, :cond_2

    .line 34
    return-void

    .line 36
    :cond_2
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->lastUrl:Ljava/lang/String;

    invoke-virtual {v1, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-eqz p1, :cond_3

    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->lastBitmap:Landroid/graphics/Bitmap;

    if-eqz p1, :cond_3

    .line 37
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->lastBitmap:Landroid/graphics/Bitmap;

    invoke-static {p0, p1, p2, p3, p4}, Lcom/moekoe/music/CoverArtLoader;->apply(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V

    .line 38
    return-void

    .line 40
    :cond_3
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    invoke-virtual {v1, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-eqz p1, :cond_4

    .line 41
    return-void

    .line 43
    :cond_4
    sput-object v1, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    .line 44
    new-instance p1, Ljava/lang/Thread;

    new-instance v6, Lcom/moekoe/music/CoverArtLoader$1;

    move-object v0, v6

    move-object v2, p0

    move-object v3, p2

    move-wide v4, p3

    invoke-direct/range {v0 .. v5}, Lcom/moekoe/music/CoverArtLoader$1;-><init>(Ljava/lang/String;Landroid/media/session/MediaSession;Ljava/lang/String;J)V

    const-string p0, "MoeCoverArtLoader"

    invoke-direct {p1, v6, p0}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;Ljava/lang/String;)V

    .line 87
    invoke-virtual {p1}, Ljava/lang/Thread;->start()V

    .line 88
    return-void
.end method
