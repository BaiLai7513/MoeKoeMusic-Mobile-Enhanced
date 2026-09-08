.class public final Lcom/moekoe/music/NodeEngine;
.super Ljava/lang/Object;
.source "NodeEngine.java"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/moekoe/music/NodeEngine$Listener;
    }
.end annotation


# static fields
.field private static final ASSET_PROJECT:Ljava/lang/String; = "nodejs-project"

.field private static final PROJECT_NAME:Ljava/lang/String; = "nodejs-project"

.field private static final TAG:Ljava/lang/String; = "MoeKoeNode"

.field private static volatile started:Z


# direct methods
.method static constructor <clinit>()V
    .locals 1

    .line 24
    const/4 v0, 0x0

    sput-boolean v0, Lcom/moekoe/music/NodeEngine;->started:Z

    .line 27
    const-string v0, "node"

    invoke-static {v0}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V

    .line 28
    const-string v0, "nodejs-mobile-native-lib"

    invoke-static {v0}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V

    .line 29
    return-void
.end method

.method private constructor <init>()V
    .locals 0

    .line 36
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    .line 37
    return-void
.end method

.method private static copyAssetDirectory(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;)V
    .locals 8
    .param p0, "am"    # Landroid/content/res/AssetManager;
    .param p1, "assetPath"    # Ljava/lang/String;
    .param p2, "targetDir"    # Ljava/io/File;
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    .line 101
    invoke-virtual {p0, p1}, Landroid/content/res/AssetManager;->list(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v0

    .line 102
    .local v0, "children":[Ljava/lang/String;
    if-eqz v0, :cond_5

    array-length v1, v0

    if-nez v1, :cond_0

    goto :goto_3

    .line 107
    :cond_0
    invoke-virtual {p2}, Ljava/io/File;->exists()Z

    move-result v1

    if-nez v1, :cond_2

    invoke-virtual {p2}, Ljava/io/File;->mkdirs()Z

    move-result v1

    if-eqz v1, :cond_1

    goto :goto_0

    .line 108
    :cond_1
    new-instance v1, Ljava/io/IOException;

    new-instance v2, Ljava/lang/StringBuilder;

    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V

    const-string v3, "Cannot create dir "

    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v2

    invoke-virtual {v2, p2}, Ljava/lang/StringBuilder;->append(Ljava/lang/Object;)Ljava/lang/StringBuilder;

    move-result-object v2

    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v2

    invoke-direct {v1, v2}, Ljava/io/IOException;-><init>(Ljava/lang/String;)V

    throw v1

    .line 110
    :cond_2
    :goto_0
    array-length v1, v0

    const/4 v2, 0x0

    :goto_1
    if-ge v2, v1, :cond_4

    aget-object v3, v0, v2

    .line 111
    .local v3, "child":Ljava/lang/String;
    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v4, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    const-string v5, "/"

    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v4

    .line 112
    .local v4, "childAsset":Ljava/lang/String;
    new-instance v5, Ljava/io/File;

    invoke-direct {v5, p2, v3}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 113
    .local v5, "childTarget":Ljava/io/File;
    invoke-virtual {p0, v4}, Landroid/content/res/AssetManager;->list(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v6

    .line 114
    .local v6, "sub":[Ljava/lang/String;
    if-eqz v6, :cond_3

    array-length v7, v6

    if-lez v7, :cond_3

    .line 115
    invoke-static {p0, v4, v5}, Lcom/moekoe/music/NodeEngine;->copyAssetDirectory(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;)V

    goto :goto_2

    .line 117
    :cond_3
    invoke-static {p0, v4, v5}, Lcom/moekoe/music/NodeEngine;->copyAssetFile(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;)V

    .line 110
    .end local v3    # "child":Ljava/lang/String;
    .end local v4    # "childAsset":Ljava/lang/String;
    .end local v5    # "childTarget":Ljava/io/File;
    .end local v6    # "sub":[Ljava/lang/String;
    :goto_2
    add-int/lit8 v2, v2, 0x1

    goto :goto_1

    .line 120
    :cond_4
    return-void

    .line 104
    :cond_5
    :goto_3
    invoke-static {p0, p1, p2}, Lcom/moekoe/music/NodeEngine;->copyAssetFile(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;)V

    .line 105
    return-void
.end method

.method private static copyAssetFile(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;)V
    .locals 6
    .param p0, "am"    # Landroid/content/res/AssetManager;
    .param p1, "assetPath"    # Ljava/lang/String;
    .param p2, "targetFile"    # Ljava/io/File;
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    .line 123
    invoke-virtual {p0, p1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object v0

    .line 124
    .local v0, "in":Ljava/io/InputStream;
    :try_start_0
    new-instance v1, Ljava/io/FileOutputStream;

    invoke-direct {v1, p2}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_2

    .line 125
    .local v1, "out":Ljava/io/OutputStream;
    const/16 v2, 0x2000

    :try_start_1
    new-array v2, v2, [B

    .line 127
    .local v2, "buffer":[B
    :goto_0
    invoke-virtual {v0, v2}, Ljava/io/InputStream;->read([B)I

    move-result v3

    move v4, v3

    .local v4, "read":I
    const/4 v5, -0x1

    if-eq v3, v5, :cond_0

    .line 128
    const/4 v3, 0x0

    invoke-virtual {v1, v2, v3, v4}, Ljava/io/OutputStream;->write([BII)V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    goto :goto_0

    .line 130
    .end local v2    # "buffer":[B
    .end local v4    # "read":I
    :cond_0
    :try_start_2
    invoke-virtual {v1}, Ljava/io/OutputStream;->close()V
    :try_end_2
    .catchall {:try_start_2 .. :try_end_2} :catchall_2

    .end local v1    # "out":Ljava/io/OutputStream;
    if-eqz v0, :cond_1

    invoke-virtual {v0}, Ljava/io/InputStream;->close()V

    .line 131
    .end local v0    # "in":Ljava/io/InputStream;
    :cond_1
    return-void

    .line 123
    .restart local v0    # "in":Ljava/io/InputStream;
    .restart local v1    # "out":Ljava/io/OutputStream;
    :catchall_0
    move-exception v2

    :try_start_3
    invoke-virtual {v1}, Ljava/io/OutputStream;->close()V
    :try_end_3
    .catchall {:try_start_3 .. :try_end_3} :catchall_1

    goto :goto_1

    :catchall_1
    move-exception v3

    :try_start_4
    invoke-virtual {v2, v3}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    .end local v0    # "in":Ljava/io/InputStream;
    .end local p0    # "am":Landroid/content/res/AssetManager;
    .end local p1    # "assetPath":Ljava/lang/String;
    .end local p2    # "targetFile":Ljava/io/File;
    :goto_1
    throw v2
    :try_end_4
    .catchall {:try_start_4 .. :try_end_4} :catchall_2

    .end local v1    # "out":Ljava/io/OutputStream;
    .restart local v0    # "in":Ljava/io/InputStream;
    .restart local p0    # "am":Landroid/content/res/AssetManager;
    .restart local p1    # "assetPath":Ljava/lang/String;
    .restart local p2    # "targetFile":Ljava/io/File;
    :catchall_2
    move-exception v1

    if-eqz v0, :cond_2

    :try_start_5
    invoke-virtual {v0}, Ljava/io/InputStream;->close()V
    :try_end_5
    .catchall {:try_start_5 .. :try_end_5} :catchall_3

    goto :goto_2

    :catchall_3
    move-exception v2

    invoke-virtual {v1, v2}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    :cond_2
    :goto_2
    throw v1
.end method

.method private static copyAssetsIfNeeded(Landroid/content/Context;)Ljava/io/File;
    .locals 9
    .param p0, "context"    # Landroid/content/Context;
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;,
            Landroid/content/pm/PackageManager$NameNotFoundException;
        }
    .end annotation

    .line 72
    invoke-virtual {p0}, Landroid/content/Context;->getFilesDir()Ljava/io/File;

    move-result-object v0

    .line 73
    .local v0, "filesDir":Ljava/io/File;
    new-instance v1, Ljava/io/File;

    const-string v2, "nodejs-project"

    invoke-direct {v1, v0, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 76
    .local v1, "projectDir":Ljava/io/File;
    invoke-virtual {p0}, Landroid/content/Context;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v3

    .line 77
    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v4

    const/4 v5, 0x0

    invoke-virtual {v3, v4, v5}, Landroid/content/pm/PackageManager;->getPackageInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;

    move-result-object v3

    iget-wide v3, v3, Landroid/content/pm/PackageInfo;->lastUpdateTime:J

    .line 79
    .local v3, "apkUpdateTime":J
    new-instance v5, Ljava/io/File;

    const-string v6, "nodejs-project.stamp"

    invoke-direct {v5, v0, v6}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 80
    .local v5, "stamp":Ljava/io/File;
    invoke-virtual {v1}, Ljava/io/File;->exists()Z

    move-result v6

    if-eqz v6, :cond_1

    invoke-virtual {v5}, Ljava/io/File;->exists()Z

    move-result v6

    if-eqz v6, :cond_1

    .line 81
    invoke-virtual {v5}, Ljava/io/File;->exists()Z

    move-result v6

    if-eqz v6, :cond_0

    invoke-static {v5}, Lcom/moekoe/music/NodeEngine;->readStamp(Ljava/io/File;)Ljava/lang/String;

    move-result-object v6

    goto :goto_0

    :cond_0
    const-string v6, "0"

    :goto_0
    invoke-static {v6}, Ljava/lang/Long;->parseLong(Ljava/lang/String;)J

    move-result-wide v6

    cmp-long v6, v6, v3

    if-nez v6, :cond_1

    .line 82
    return-object v1

    .line 85
    :cond_1
    invoke-static {v1}, Lcom/moekoe/music/NodeEngine;->deleteRecursively(Ljava/io/File;)V

    .line 86
    invoke-virtual {v1}, Ljava/io/File;->mkdirs()Z

    move-result v6

    if-eqz v6, :cond_2

    .line 90
    invoke-virtual {p0}, Landroid/content/Context;->getAssets()Landroid/content/res/AssetManager;

    move-result-object v6

    .line 91
    .local v6, "am":Landroid/content/res/AssetManager;
    invoke-static {v6, v2, v1}, Lcom/moekoe/music/NodeEngine;->copyAssetDirectory(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/io/File;)V

    .line 93
    new-instance v2, Ljava/io/FileOutputStream;

    invoke-direct {v2, v5}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    .line 94
    .local v2, "fos":Ljava/io/FileOutputStream;
    :try_start_0
    invoke-static {v3, v4}, Ljava/lang/Long;->toString(J)Ljava/lang/String;

    move-result-object v7

    const-string v8, "UTF-8"

    invoke-virtual {v7, v8}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B

    move-result-object v7

    invoke-virtual {v2, v7}, Ljava/io/FileOutputStream;->write([B)V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 95
    invoke-virtual {v2}, Ljava/io/FileOutputStream;->close()V

    .line 96
    .end local v2    # "fos":Ljava/io/FileOutputStream;
    new-instance v2, Ljava/lang/StringBuilder;

    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V

    const-string v7, "Node project copied to "

    invoke-virtual {v2, v7}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v2

    invoke-virtual {v2, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/Object;)Ljava/lang/StringBuilder;

    move-result-object v2

    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v2

    const-string v7, "MoeKoeNode"

    invoke-static {v7, v2}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I

    .line 97
    return-object v1

    .line 93
    .restart local v2    # "fos":Ljava/io/FileOutputStream;
    :catchall_0
    move-exception v7

    :try_start_1
    invoke-virtual {v2}, Ljava/io/FileOutputStream;->close()V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_1

    goto :goto_1

    :catchall_1
    move-exception v8

    invoke-virtual {v7, v8}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    :goto_1
    throw v7

    .line 87
    .end local v2    # "fos":Ljava/io/FileOutputStream;
    .end local v6    # "am":Landroid/content/res/AssetManager;
    :cond_2
    new-instance v2, Ljava/io/IOException;

    new-instance v6, Ljava/lang/StringBuilder;

    invoke-direct {v6}, Ljava/lang/StringBuilder;-><init>()V

    const-string v7, "Cannot create node project dir: "

    invoke-virtual {v6, v7}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v6

    invoke-virtual {v6, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/Object;)Ljava/lang/StringBuilder;

    move-result-object v6

    invoke-virtual {v6}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v6

    invoke-direct {v2, v6}, Ljava/io/IOException;-><init>(Ljava/lang/String;)V

    throw v2
.end method

.method private static deleteRecursively(Ljava/io/File;)V
    .locals 4
    .param p0, "file"    # Ljava/io/File;

    .line 134
    if-eqz p0, :cond_2

    invoke-virtual {p0}, Ljava/io/File;->exists()Z

    move-result v0

    if-nez v0, :cond_0

    goto :goto_1

    .line 135
    :cond_0
    invoke-virtual {p0}, Ljava/io/File;->isDirectory()Z

    move-result v0

    if-eqz v0, :cond_1

    .line 136
    invoke-virtual {p0}, Ljava/io/File;->listFiles()[Ljava/io/File;

    move-result-object v0

    .line 137
    .local v0, "children":[Ljava/io/File;
    if-eqz v0, :cond_1

    .line 138
    array-length v1, v0

    const/4 v2, 0x0

    :goto_0
    if-ge v2, v1, :cond_1

    aget-object v3, v0, v2

    .local v3, "child":Ljava/io/File;
    invoke-static {v3}, Lcom/moekoe/music/NodeEngine;->deleteRecursively(Ljava/io/File;)V

    .end local v3    # "child":Ljava/io/File;
    add-int/lit8 v2, v2, 0x1

    goto :goto_0

    .line 142
    .end local v0    # "children":[Ljava/io/File;
    :cond_1
    invoke-virtual {p0}, Ljava/io/File;->delete()Z

    .line 143
    return-void

    .line 134
    :cond_2
    :goto_1
    return-void
.end method

.method private static native getCurrentABIName()Ljava/lang/String;
.end method

.method public static isRunning()Z
    .locals 1

    .line 67
    sget-boolean v0, Lcom/moekoe/music/NodeEngine;->started:Z

    return v0
.end method

.method static synthetic lambda$start$0(Landroid/content/Context;Lcom/moekoe/music/NodeEngine$Listener;)V
    .locals 7
    .param p0, "context"    # Landroid/content/Context;
    .param p1, "listener"    # Lcom/moekoe/music/NodeEngine$Listener;

    .line 48
    const-string v0, "MoeKoeNode"

    :try_start_0
    invoke-static {p0}, Lcom/moekoe/music/NodeEngine;->copyAssetsIfNeeded(Landroid/content/Context;)Ljava/io/File;

    move-result-object v1

    .line 49
    .local v1, "projectDir":Ljava/io/File;
    invoke-virtual {v1}, Ljava/io/File;->getAbsolutePath()Ljava/lang/String;

    move-result-object v2

    .line 50
    .local v2, "projectRoot":Ljava/lang/String;
    const/4 v3, 0x3

    new-array v3, v3, [Ljava/lang/String;

    const-string v4, "node"

    const/4 v5, 0x0

    aput-object v4, v3, v5

    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v4, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    const-string v5, "/android.js"

    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v4

    const/4 v5, 0x1

    aput-object v4, v3, v5

    const-string v4, "--platform=lite"

    const/4 v6, 0x2

    aput-object v4, v3, v6

    .line 55
    .local v3, "args":[Ljava/lang/String;
    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    const-string v6, "Starting Node with args: "

    invoke-virtual {v4, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    const-string v6, " "

    invoke-static {v6, v3}, Lcom/moekoe/music/NodeEngine$$ExternalSyntheticBackport0;->m(Ljava/lang/CharSequence;[Ljava/lang/CharSequence;)Ljava/lang/String;

    move-result-object v6

    invoke-virtual {v4, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v4

    invoke-static {v0, v4}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I

    .line 56
    if-eqz p1, :cond_0

    invoke-interface {p1}, Lcom/moekoe/music/NodeEngine$Listener;->onStarted()V

    .line 57
    :cond_0
    invoke-static {v3, v2, v5}, Lcom/moekoe/music/NodeEngine;->startNodeWithArguments([Ljava/lang/String;Ljava/lang/String;Z)I

    .line 58
    const-string v4, "Node process exited."

    invoke-static {v0, v4}, Landroid/util/Log;->w(Ljava/lang/String;Ljava/lang/String;)I
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 62
    nop

    .end local v1    # "projectDir":Ljava/io/File;
    .end local v2    # "projectRoot":Ljava/lang/String;
    .end local v3    # "args":[Ljava/lang/String;
    goto :goto_1

    .line 59
    :catchall_0
    move-exception v1

    .line 60
    .local v1, "t":Ljava/lang/Throwable;
    const-string v2, "Failed to start Node"

    invoke-static {v0, v2, v1}, Landroid/util/Log;->e(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)I

    .line 61
    if-eqz p1, :cond_2

    invoke-virtual {v1}, Ljava/lang/Throwable;->getMessage()Ljava/lang/String;

    move-result-object v0

    if-nez v0, :cond_1

    invoke-virtual {v1}, Ljava/lang/Throwable;->toString()Ljava/lang/String;

    move-result-object v0

    goto :goto_0

    :cond_1
    invoke-virtual {v1}, Ljava/lang/Throwable;->getMessage()Ljava/lang/String;

    move-result-object v0

    :goto_0
    invoke-interface {p1, v0}, Lcom/moekoe/music/NodeEngine$Listener;->onError(Ljava/lang/String;)V

    .line 63
    .end local v1    # "t":Ljava/lang/Throwable;
    :cond_2
    :goto_1
    return-void
.end method

.method private static readStamp(Ljava/io/File;)Ljava/lang/String;
    .locals 4
    .param p0, "stamp"    # Ljava/io/File;

    .line 147
    :try_start_0
    invoke-virtual {p0}, Ljava/io/File;->length()J

    move-result-wide v0

    long-to-int v0, v0

    new-array v0, v0, [B

    .line 148
    .local v0, "data":[B
    new-instance v1, Ljava/io/FileInputStream;

    invoke-direct {v1, p0}, Ljava/io/FileInputStream;-><init>(Ljava/io/File;)V
    :try_end_0
    .catch Ljava/io/IOException; {:try_start_0 .. :try_end_0} :catch_0

    .line 149
    .local v1, "in":Ljava/io/InputStream;
    const/4 v2, 0x0

    .line 150
    .local v2, "off":I
    :goto_0
    :try_start_1
    array-length v3, v0

    if-ge v2, v3, :cond_1

    .line 151
    array-length v3, v0

    sub-int/2addr v3, v2

    invoke-virtual {v1, v0, v2, v3}, Ljava/io/InputStream;->read([BII)I

    move-result v3
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    .line 152
    .local v3, "read":I
    if-gez v3, :cond_0

    goto :goto_1

    .line 153
    :cond_0
    add-int/2addr v2, v3

    .line 154
    .end local v3    # "read":I
    goto :goto_0

    .line 155
    .end local v2    # "off":I
    :cond_1
    :goto_1
    :try_start_2
    invoke-virtual {v1}, Ljava/io/InputStream;->close()V

    .line 156
    .end local v1    # "in":Ljava/io/InputStream;
    new-instance v1, Ljava/lang/String;

    const-string v2, "UTF-8"

    invoke-direct {v1, v0, v2}, Ljava/lang/String;-><init>([BLjava/lang/String;)V

    invoke-virtual {v1}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object v1
    :try_end_2
    .catch Ljava/io/IOException; {:try_start_2 .. :try_end_2} :catch_0

    return-object v1

    .line 148
    .restart local v1    # "in":Ljava/io/InputStream;
    :catchall_0
    move-exception v2

    :try_start_3
    invoke-virtual {v1}, Ljava/io/InputStream;->close()V
    :try_end_3
    .catchall {:try_start_3 .. :try_end_3} :catchall_1

    goto :goto_2

    :catchall_1
    move-exception v3

    :try_start_4
    invoke-virtual {v2, v3}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    .end local p0    # "stamp":Ljava/io/File;
    :goto_2
    throw v2
    :try_end_4
    .catch Ljava/io/IOException; {:try_start_4 .. :try_end_4} :catch_0

    .line 157
    .end local v0    # "data":[B
    .end local v1    # "in":Ljava/io/InputStream;
    .restart local p0    # "stamp":Ljava/io/File;
    :catch_0
    move-exception v0

    .line 158
    .local v0, "e":Ljava/io/IOException;
    const-string v1, "0"

    return-object v1
.end method

.method public static declared-synchronized start(Landroid/content/Context;Lcom/moekoe/music/NodeEngine$Listener;)V
    .locals 4
    .param p0, "context"    # Landroid/content/Context;
    .param p1, "listener"    # Lcom/moekoe/music/NodeEngine$Listener;

    const-class v0, Lcom/moekoe/music/NodeEngine;

    monitor-enter v0

    .line 40
    :try_start_0
    sget-boolean v1, Lcom/moekoe/music/NodeEngine;->started:Z

    if-eqz v1, :cond_1

    .line 41
    if-eqz p1, :cond_0

    invoke-interface {p1}, Lcom/moekoe/music/NodeEngine$Listener;->onStarted()V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 42
    :cond_0
    monitor-exit v0

    return-void

    .line 44
    :cond_1
    const/4 v1, 0x1

    :try_start_1
    sput-boolean v1, Lcom/moekoe/music/NodeEngine;->started:Z

    .line 46
    new-instance v1, Ljava/lang/Thread;

    new-instance v2, Lcom/moekoe/music/NodeEngine$$ExternalSyntheticLambda1;

    invoke-direct {v2, p0, p1}, Lcom/moekoe/music/NodeEngine$$ExternalSyntheticLambda1;-><init>(Landroid/content/Context;Lcom/moekoe/music/NodeEngine$Listener;)V

    const-string v3, "MoeKoe-Node"

    invoke-direct {v1, v2, v3}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;Ljava/lang/String;)V

    .line 63
    invoke-virtual {v1}, Ljava/lang/Thread;->start()V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    .line 64
    monitor-exit v0

    return-void

    .line 39
    .end local p0    # "context":Landroid/content/Context;
    .end local p1    # "listener":Lcom/moekoe/music/NodeEngine$Listener;
    :catchall_0
    move-exception p0

    monitor-exit v0

    throw p0
.end method

.method private static native startNodeWithArguments([Ljava/lang/String;Ljava/lang/String;Z)I
.end method
