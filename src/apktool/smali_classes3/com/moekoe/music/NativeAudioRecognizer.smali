.class public Lcom/moekoe/music/NativeAudioRecognizer;
.super Ljava/lang/Object;
.source "NativeAudioRecognizer.java"


# direct methods
.method public constructor <init>()V
    .locals 0

    .line 9
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method

.method static synthetic access$000(Ljava/lang/String;Ljava/lang/String;)V
    .locals 0

    .line 9
    invoke-static {p0, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->callResult(Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method static synthetic access$100([BI)[B
    .locals 0
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/lang/Exception;
        }
    .end annotation

    .line 9
    invoke-static {p0, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->createWav([BI)[B

    move-result-object p0

    return-object p0
.end method

.method private static callResult(Ljava/lang/String;Ljava/lang/String;)V
    .locals 7

    .line 47
    :try_start_0
    const-string v0, "com.moekoe.music.MainActivity"

    invoke-static {v0}, Ljava/lang/Class;->forName(Ljava/lang/String;)Ljava/lang/Class;

    move-result-object v0

    .line 48
    const-string v1, "postNativeRecordResult"

    const/4 v2, 0x2

    new-array v3, v2, [Ljava/lang/Class;

    const-class v4, Ljava/lang/String;

    const/4 v5, 0x0

    aput-object v4, v3, v5

    const/4 v6, 0x1

    aput-object v4, v3, v6

    invoke-virtual {v0, v1, v3}, Ljava/lang/Class;->getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;

    move-result-object v0

    new-array v1, v2, [Ljava/lang/Object;

    aput-object p0, v1, v5

    aput-object p1, v1, v6

    const/4 p0, 0x0

    invoke-virtual {v0, p0, v1}, Ljava/lang/reflect/Method;->invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    :catchall_0
    return-void
.end method

.method private static createWav([BI)[B
    .locals 4
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/lang/Exception;
        }
    .end annotation

    .line 55
    array-length v0, p0

    .line 56
    new-instance v1, Ljava/io/ByteArrayOutputStream;

    invoke-direct {v1}, Ljava/io/ByteArrayOutputStream;-><init>()V

    .line 57
    const-string v2, "RIFF"

    invoke-static {v1, v2}, Lcom/moekoe/music/NativeAudioRecognizer;->writeString(Ljava/io/ByteArrayOutputStream;Ljava/lang/String;)V

    add-int/lit8 v2, v0, 0x24

    .line 58
    invoke-static {v1, v2}, Lcom/moekoe/music/NativeAudioRecognizer;->writeInt(Ljava/io/ByteArrayOutputStream;I)V

    .line 59
    const-string v2, "WAVE"

    invoke-static {v1, v2}, Lcom/moekoe/music/NativeAudioRecognizer;->writeString(Ljava/io/ByteArrayOutputStream;Ljava/lang/String;)V

    .line 60
    const-string v2, "fmt "

    invoke-static {v1, v2}, Lcom/moekoe/music/NativeAudioRecognizer;->writeString(Ljava/io/ByteArrayOutputStream;Ljava/lang/String;)V

    const/16 v2, 0x10

    .line 61
    invoke-static {v1, v2}, Lcom/moekoe/music/NativeAudioRecognizer;->writeInt(Ljava/io/ByteArrayOutputStream;I)V

    const/4 v3, 0x1

    .line 62
    invoke-static {v1, v3}, Lcom/moekoe/music/NativeAudioRecognizer;->writeShort(Ljava/io/ByteArrayOutputStream;S)V

    int-to-short v3, v3

    .line 63
    invoke-static {v1, v3}, Lcom/moekoe/music/NativeAudioRecognizer;->writeShort(Ljava/io/ByteArrayOutputStream;S)V

    .line 64
    invoke-static {v1, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->writeInt(Ljava/io/ByteArrayOutputStream;I)V

    mul-int/lit8 p1, p1, 0x10

    .line 65
    div-int/lit8 p1, p1, 0x8

    invoke-static {v1, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->writeInt(Ljava/io/ByteArrayOutputStream;I)V

    const/4 p1, 0x2

    int-to-short p1, p1

    .line 66
    invoke-static {v1, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->writeShort(Ljava/io/ByteArrayOutputStream;S)V

    int-to-short p1, v2

    .line 67
    invoke-static {v1, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->writeShort(Ljava/io/ByteArrayOutputStream;S)V

    .line 68
    const-string p1, "data"

    invoke-static {v1, p1}, Lcom/moekoe/music/NativeAudioRecognizer;->writeString(Ljava/io/ByteArrayOutputStream;Ljava/lang/String;)V

    .line 69
    invoke-static {v1, v0}, Lcom/moekoe/music/NativeAudioRecognizer;->writeInt(Ljava/io/ByteArrayOutputStream;I)V

    .line 70
    invoke-virtual {v1, p0}, Ljava/io/ByteArrayOutputStream;->write([B)V

    .line 71
    invoke-virtual {v1}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B

    move-result-object p0

    return-object p0
.end method

.method public static start(Ljava/lang/String;)V
    .locals 2

    .line 11
    new-instance v0, Ljava/lang/Thread;

    new-instance v1, Lcom/moekoe/music/NativeAudioRecognizer$1;

    invoke-direct {v1, p0}, Lcom/moekoe/music/NativeAudioRecognizer$1;-><init>(Ljava/lang/String;)V

    invoke-direct {v0, v1}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;)V

    .line 42
    invoke-virtual {v0}, Ljava/lang/Thread;->start()V

    return-void
.end method

.method private static writeInt(Ljava/io/ByteArrayOutputStream;I)V
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/lang/Exception;
        }
    .end annotation

    and-int/lit16 v0, p1, 0xff

    .line 80
    invoke-virtual {p0, v0}, Ljava/io/ByteArrayOutputStream;->write(I)V

    shr-int/lit8 v0, p1, 0x8

    and-int/lit16 v0, v0, 0xff

    invoke-virtual {p0, v0}, Ljava/io/ByteArrayOutputStream;->write(I)V

    shr-int/lit8 v0, p1, 0x10

    and-int/lit16 v0, v0, 0xff

    invoke-virtual {p0, v0}, Ljava/io/ByteArrayOutputStream;->write(I)V

    shr-int/lit8 p1, p1, 0x18

    and-int/lit16 p1, p1, 0xff

    invoke-virtual {p0, p1}, Ljava/io/ByteArrayOutputStream;->write(I)V

    return-void
.end method

.method private static writeShort(Ljava/io/ByteArrayOutputStream;S)V
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/lang/Exception;
        }
    .end annotation

    and-int/lit16 v0, p1, 0xff

    .line 84
    invoke-virtual {p0, v0}, Ljava/io/ByteArrayOutputStream;->write(I)V

    shr-int/lit8 p1, p1, 0x8

    and-int/lit16 p1, p1, 0xff

    invoke-virtual {p0, p1}, Ljava/io/ByteArrayOutputStream;->write(I)V

    return-void
.end method

.method private static writeString(Ljava/io/ByteArrayOutputStream;Ljava/lang/String;)V
    .locals 2
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/lang/Exception;
        }
    .end annotation

    .line 75
    const-string v0, "US-ASCII"

    invoke-virtual {p1, v0}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B

    move-result-object p1

    const/4 v0, 0x0

    .line 76
    array-length v1, p1

    invoke-virtual {p0, p1, v0, v1}, Ljava/io/ByteArrayOutputStream;->write([BII)V

    return-void
.end method
