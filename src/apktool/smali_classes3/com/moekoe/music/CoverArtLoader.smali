.class public final Lcom/moekoe/music/CoverArtLoader;
.super Ljava/lang/Object;
.source "CoverArtLoader.java"


# static fields
.field private static final MAIN:Landroid/os/Handler;

.field private static appliedUrl:Ljava/lang/String;

.field private static lastBitmap:Landroid/graphics/Bitmap;

.field private static lastUrl:Ljava/lang/String;

.field private static loadingUrl:Ljava/lang/String;


# direct methods
.method static constructor <clinit>()V
    .locals 2

    .line 22
    new-instance v0, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->MAIN:Landroid/os/Handler;

    .line 23
    const-string v0, ""

    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->lastUrl:Ljava/lang/String;

    .line 25
    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    .line 26
    sput-object v0, Lcom/moekoe/music/CoverArtLoader;->appliedUrl:Ljava/lang/String;

    return-void
.end method

.method private constructor <init>()V
    .locals 0

    .line 28
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    .line 29
    return-void
.end method

.method static synthetic access$000(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;
    .locals 0

    .line 21
    invoke-static {p0}, Lcom/moekoe/music/CoverArtLoader;->sanitize(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;

    move-result-object p0

    return-object p0
.end method

.method static synthetic access$102(Ljava/lang/String;)Ljava/lang/String;
    .locals 0

    .line 21
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->lastUrl:Ljava/lang/String;

    return-object p0
.end method

.method static synthetic access$202(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;
    .locals 0

    .line 21
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->lastBitmap:Landroid/graphics/Bitmap;

    return-object p0
.end method

.method static synthetic access$302(Ljava/lang/String;)Ljava/lang/String;
    .locals 0

    .line 21
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->appliedUrl:Ljava/lang/String;

    return-object p0
.end method

.method static synthetic access$402(Ljava/lang/String;)Ljava/lang/String;
    .locals 0

    .line 21
    sput-object p0, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    return-object p0
.end method

.method static synthetic access$500(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V
    .locals 0

    .line 21
    invoke-static {p0, p1, p2, p3, p4}, Lcom/moekoe/music/CoverArtLoader;->apply(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V

    return-void
.end method

.method static synthetic access$600()Landroid/os/Handler;
    .locals 1

    .line 21
    sget-object v0, Lcom/moekoe/music/CoverArtLoader;->MAIN:Landroid/os/Handler;

    return-object v0
.end method

.method private static apply(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V
    .locals 4

    .line 129
    if-eqz p0, :cond_3

    if-nez p1, :cond_0

    goto :goto_2

    .line 133
    :cond_0
    const-string v0, ""

    if-nez p2, :cond_1

    move-object p2, v0

    .line 134
    :cond_1
    nop

    .line 135
    :try_start_0
    const-string v1, " - "

    invoke-virtual {p2, v1}, Ljava/lang/String;->indexOf(Ljava/lang/String;)I

    move-result v1

    .line 136
    const/4 v2, 0x0

    if-lez v1, :cond_2

    .line 137
    add-int/lit8 v0, v1, 0x3

    invoke-virtual {p2, v0}, Ljava/lang/String;->substring(I)Ljava/lang/String;

    move-result-object v0

    .line 138
    invoke-virtual {p2, v2, v1}, Ljava/lang/String;->substring(II)Ljava/lang/String;

    move-result-object p2

    .line 140
    :cond_2
    new-instance v1, Landroid/media/MediaMetadata$Builder;

    invoke-direct {v1}, Landroid/media/MediaMetadata$Builder;-><init>()V

    const-string v3, "android.media.metadata.TITLE"

    .line 141
    invoke-virtual {v1, v3, p2}, Landroid/media/MediaMetadata$Builder;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string v1, "android.media.metadata.ARTIST"

    .line 142
    invoke-virtual {p2, v1, v0}, Landroid/media/MediaMetadata$Builder;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string v0, "android.media.metadata.DURATION"

    .line 143
    invoke-virtual {p2, v0, p3, p4}, Landroid/media/MediaMetadata$Builder;->putLong(Ljava/lang/String;J)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string p3, "android.media.metadata.ALBUM_ART"

    .line 144
    invoke-virtual {p2, p3, p1}, Landroid/media/MediaMetadata$Builder;->putBitmap(Ljava/lang/String;Landroid/graphics/Bitmap;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string p3, "android.media.metadata.ART"

    .line 145
    invoke-virtual {p2, p3, p1}, Landroid/media/MediaMetadata$Builder;->putBitmap(Ljava/lang/String;Landroid/graphics/Bitmap;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    const-string p3, "android.media.metadata.DISPLAY_ICON"

    .line 146
    invoke-virtual {p2, p3, p1}, Landroid/media/MediaMetadata$Builder;->putBitmap(Ljava/lang/String;Landroid/graphics/Bitmap;)Landroid/media/MediaMetadata$Builder;

    move-result-object p2

    .line 147
    invoke-virtual {p2}, Landroid/media/MediaMetadata$Builder;->build()Landroid/media/MediaMetadata;

    move-result-object p2

    invoke-virtual {p0, p2}, Landroid/media/session/MediaSession;->setMetadata(Landroid/media/MediaMetadata;)V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_1

    .line 149
    :try_start_1
    const-string p0, "com.moekoe.music.MusicForegroundService"

    invoke-static {p0}, Ljava/lang/Class;->forName(Ljava/lang/String;)Ljava/lang/Class;

    move-result-object p0

    .line 150
    const-string p2, "setArtworkBitmap"

    const/4 p3, 0x1

    new-array p4, p3, [Ljava/lang/Class;

    const-class v0, Landroid/graphics/Bitmap;

    aput-object v0, p4, v2

    invoke-virtual {p0, p2, p4}, Ljava/lang/Class;->getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;

    move-result-object p0

    new-array p2, p3, [Ljava/lang/Object;

    aput-object p1, p2, v2

    const/4 p1, 0x0

    invoke-virtual {p0, p1, p2}, Ljava/lang/reflect/Method;->invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    .line 152
    goto :goto_0

    .line 151
    :catchall_0
    move-exception p0

    .line 154
    :goto_0
    goto :goto_1

    .line 153
    :catchall_1
    move-exception p0

    .line 155
    :goto_1
    return-void

    .line 130
    :cond_3
    :goto_2
    return-void
.end method

.method public static load(Landroid/media/session/MediaSession;Ljava/lang/String;Ljava/lang/String;J)V
    .locals 7

    .line 33
    if-nez p0, :cond_0

    .line 34
    return-void

    .line 36
    :cond_0
    if-nez p1, :cond_1

    const-string p1, ""

    goto :goto_0

    :cond_1
    invoke-virtual {p1}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object p1

    :goto_0
    move-object v1, p1

    .line 37
    invoke-virtual {v1}, Ljava/lang/String;->length()I

    move-result p1

    if-nez p1, :cond_2

    .line 38
    return-void

    .line 40
    :cond_2
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->lastUrl:Ljava/lang/String;

    invoke-virtual {v1, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-eqz p1, :cond_4

    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->lastBitmap:Landroid/graphics/Bitmap;

    if-eqz p1, :cond_4

    .line 41
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->appliedUrl:Ljava/lang/String;

    invoke-virtual {v1, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-nez p1, :cond_3

    .line 42
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->lastBitmap:Landroid/graphics/Bitmap;

    invoke-static {p0, p1, p2, p3, p4}, Lcom/moekoe/music/CoverArtLoader;->apply(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V

    .line 43
    sput-object v1, Lcom/moekoe/music/CoverArtLoader;->appliedUrl:Ljava/lang/String;

    .line 45
    :cond_3
    return-void

    .line 47
    :cond_4
    sget-object p1, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    invoke-virtual {v1, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-eqz p1, :cond_5

    .line 48
    return-void

    .line 50
    :cond_5
    sput-object v1, Lcom/moekoe/music/CoverArtLoader;->loadingUrl:Ljava/lang/String;

    .line 51
    new-instance p1, Ljava/lang/Thread;

    new-instance v6, Lcom/moekoe/music/CoverArtLoader$1;

    move-object v0, v6

    move-object v2, p0

    move-object v3, p2

    move-wide v4, p3

    invoke-direct/range {v0 .. v5}, Lcom/moekoe/music/CoverArtLoader$1;-><init>(Ljava/lang/String;Landroid/media/session/MediaSession;Ljava/lang/String;J)V

    const-string p0, "MoeCoverArtLoader"

    invoke-direct {p1, v6, p0}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;Ljava/lang/String;)V

    .line 96
    invoke-virtual {p1}, Ljava/lang/Thread;->start()V

    .line 97
    return-void
.end method

.method private static sanitize(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;
    .locals 8

    .line 100
    const/4 v0, 0x0

    if-nez p0, :cond_0

    .line 101
    return-object v0

    .line 104
    :cond_0
    const/4 v1, 0x0

    :try_start_0
    invoke-virtual {p0}, Landroid/graphics/Bitmap;->getWidth()I

    move-result v2

    .line 105
    invoke-virtual {p0}, Landroid/graphics/Bitmap;->getHeight()I

    move-result v3

    .line 106
    if-lez v2, :cond_2

    if-gtz v3, :cond_1

    goto :goto_0

    .line 109
    :cond_1
    nop

    .line 110
    const/16 v4, 0x200

    int-to-float v4, v4

    invoke-static {v2, v3}, Ljava/lang/Math;->max(II)I

    move-result v5

    int-to-float v5, v5

    div-float/2addr v4, v5

    const/high16 v5, 0x3f800000    # 1.0f

    invoke-static {v5, v4}, Ljava/lang/Math;->min(FF)F

    move-result v4

    .line 111
    int-to-float v2, v2

    mul-float v2, v2, v4

    invoke-static {v2}, Ljava/lang/Math;->round(F)I

    move-result v2

    const/4 v5, 0x1

    invoke-static {v5, v2}, Ljava/lang/Math;->max(II)I

    move-result v2

    .line 112
    int-to-float v3, v3

    mul-float v3, v3, v4

    invoke-static {v3}, Ljava/lang/Math;->round(F)I

    move-result v3

    invoke-static {v5, v3}, Ljava/lang/Math;->max(II)I

    move-result v3

    .line 113
    sget-object v4, Landroid/graphics/Bitmap$Config;->ARGB_8888:Landroid/graphics/Bitmap$Config;

    invoke-static {v2, v3, v4}, Landroid/graphics/Bitmap;->createBitmap(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;

    move-result-object v4

    .line 114
    new-instance v5, Landroid/graphics/Canvas;

    invoke-direct {v5, v4}, Landroid/graphics/Canvas;-><init>(Landroid/graphics/Bitmap;)V

    .line 115
    new-instance v6, Landroid/graphics/Paint;

    const/4 v7, 0x2

    invoke-direct {v6, v7}, Landroid/graphics/Paint;-><init>(I)V

    .line 116
    new-instance v7, Landroid/graphics/Rect;

    invoke-direct {v7, v1, v1, v2, v3}, Landroid/graphics/Rect;-><init>(IIII)V

    invoke-virtual {v5, p0, v0, v7, v6}, Landroid/graphics/Canvas;->drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/Rect;Landroid/graphics/Paint;)V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 117
    return-object v4

    .line 107
    :cond_2
    :goto_0
    return-object p0

    .line 118
    :catchall_0
    move-exception v0

    .line 120
    :try_start_1
    sget-object v0, Landroid/graphics/Bitmap$Config;->ARGB_8888:Landroid/graphics/Bitmap$Config;

    invoke-virtual {p0, v0, v1}, Landroid/graphics/Bitmap;->copy(Landroid/graphics/Bitmap$Config;Z)Landroid/graphics/Bitmap;

    move-result-object p0
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_1

    return-object p0

    .line 121
    :catchall_1
    move-exception v0

    .line 122
    return-object p0
.end method
