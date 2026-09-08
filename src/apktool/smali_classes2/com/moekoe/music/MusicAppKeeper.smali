.class public Lcom/moekoe/music/MusicAppKeeper;
.super Ljava/lang/Object;
.source "MusicAppKeeper.java"


# static fields
.field private static final INTERVAL_MS:J = 0x7530L

.field private static final MUSIC_PACKAGES:Ljava/util/Set;
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "Ljava/util/Set<",
            "Ljava/lang/String;",
            ">;"
        }
    .end annotation
.end field

.field private static final TAG:Ljava/lang/String; = "MoeKoeKeeper"


# instance fields
.field private final context:Landroid/content/Context;

.field private final handler:Landroid/os/Handler;

.field private final scanner:Ljava/lang/Runnable;


# direct methods
.method static bridge synthetic -$$Nest$fgethandler(Lcom/moekoe/music/MusicAppKeeper;)Landroid/os/Handler;
    .locals 0

    iget-object p0, p0, Lcom/moekoe/music/MusicAppKeeper;->handler:Landroid/os/Handler;

    return-object p0
.end method

.method static bridge synthetic -$$Nest$mscan(Lcom/moekoe/music/MusicAppKeeper;)V
    .locals 0

    invoke-direct {p0}, Lcom/moekoe/music/MusicAppKeeper;->scan()V

    return-void
.end method

.method static constructor <clinit>()V
    .locals 15

    .line 27
    new-instance v0, Ljava/util/HashSet;

    const-string v1, "com.tencent.qqmusic"

    const-string v2, "com.netease.cloudmusic"

    const-string v3, "com.kugou.android"

    const-string v4, "com.kugou.android.lite"

    const-string v5, "com.kuwo.player"

    const-string v6, "com.migu.audio"

    const-string v7, "com.luna.music"

    const-string v8, "com.spotify.music"

    const-string v9, "com.apple.android.music"

    const-string v10, "com.miui.player"

    const-string v11, "com.huawei.music"

    const-string v12, "com.oppo.music"

    const-string v13, "com.sec.android.app.music"

    const-string v14, "com.vivo.imusic"

    filled-new-array/range {v1 .. v14}, [Ljava/lang/String;

    move-result-object v1

    invoke-static {v1}, Ljava/util/Arrays;->asList([Ljava/lang/Object;)Ljava/util/List;

    move-result-object v1

    invoke-direct {v0, v1}, Ljava/util/HashSet;-><init>(Ljava/util/Collection;)V

    sput-object v0, Lcom/moekoe/music/MusicAppKeeper;->MUSIC_PACKAGES:Ljava/util/Set;

    return-void
.end method

.method public constructor <init>(Landroid/content/Context;)V
    .locals 2
    .param p1, "context"    # Landroid/content/Context;

    .line 54
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    .line 45
    new-instance v0, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    iput-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->handler:Landroid/os/Handler;

    .line 46
    new-instance v0, Lcom/moekoe/music/MusicAppKeeper$1;

    invoke-direct {v0, p0}, Lcom/moekoe/music/MusicAppKeeper$1;-><init>(Lcom/moekoe/music/MusicAppKeeper;)V

    iput-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->scanner:Ljava/lang/Runnable;

    .line 55
    invoke-virtual {p1}, Landroid/content/Context;->getApplicationContext()Landroid/content/Context;

    move-result-object v0

    iput-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->context:Landroid/content/Context;

    .line 56
    return-void
.end method

.method private getForegroundFromUsageStats()Ljava/lang/String;
    .locals 8

    .line 100
    invoke-direct {p0}, Lcom/moekoe/music/MusicAppKeeper;->hasUsageStatsPermission()Z

    move-result v0

    const/4 v1, 0x0

    if-nez v0, :cond_0

    return-object v1

    .line 101
    :cond_0
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->context:Landroid/content/Context;

    const-string v2, "usagestats"

    invoke-virtual {v0, v2}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/usage/UsageStatsManager;

    .line 102
    .local v0, "usm":Landroid/app/usage/UsageStatsManager;
    if-nez v0, :cond_1

    return-object v1

    .line 103
    :cond_1
    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J

    move-result-wide v1

    .line 104
    .local v1, "now":J
    const-wide/32 v3, 0xea60

    sub-long v3, v1, v3

    invoke-virtual {v0, v3, v4, v1, v2}, Landroid/app/usage/UsageStatsManager;->queryEvents(JJ)Landroid/app/usage/UsageEvents;

    move-result-object v3

    .line 105
    .local v3, "events":Landroid/app/usage/UsageEvents;
    new-instance v4, Landroid/app/usage/UsageEvents$Event;

    invoke-direct {v4}, Landroid/app/usage/UsageEvents$Event;-><init>()V

    .line 106
    .local v4, "event":Landroid/app/usage/UsageEvents$Event;
    const/4 v5, 0x0

    .line 107
    .local v5, "lastPackage":Ljava/lang/String;
    :cond_2
    :goto_0
    invoke-virtual {v3}, Landroid/app/usage/UsageEvents;->hasNextEvent()Z

    move-result v6

    if-eqz v6, :cond_4

    .line 108
    invoke-virtual {v3, v4}, Landroid/app/usage/UsageEvents;->getNextEvent(Landroid/app/usage/UsageEvents$Event;)Z

    .line 109
    invoke-virtual {v4}, Landroid/app/usage/UsageEvents$Event;->getEventType()I

    move-result v6

    const/4 v7, 0x1

    if-eq v6, v7, :cond_3

    .line 110
    invoke-virtual {v4}, Landroid/app/usage/UsageEvents$Event;->getEventType()I

    move-result v6

    if-ne v6, v7, :cond_2

    .line 111
    :cond_3
    invoke-virtual {v4}, Landroid/app/usage/UsageEvents$Event;->getPackageName()Ljava/lang/String;

    move-result-object v5

    goto :goto_0

    .line 114
    :cond_4
    return-object v5
.end method

.method private getForegroundMusicPackage()Ljava/lang/String;
    .locals 7

    .line 78
    invoke-direct {p0}, Lcom/moekoe/music/MusicAppKeeper;->getForegroundFromUsageStats()Ljava/lang/String;

    move-result-object v0

    .line 79
    .local v0, "usage":Ljava/lang/String;
    if-eqz v0, :cond_0

    sget-object v1, Lcom/moekoe/music/MusicAppKeeper;->MUSIC_PACKAGES:Ljava/util/Set;

    invoke-interface {v1, v0}, Ljava/util/Set;->contains(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_0

    .line 80
    return-object v0

    .line 84
    :cond_0
    iget-object v1, p0, Lcom/moekoe/music/MusicAppKeeper;->context:Landroid/content/Context;

    const-string v2, "activity"

    invoke-virtual {v1, v2}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Landroid/app/ActivityManager;

    .line 85
    .local v1, "am":Landroid/app/ActivityManager;
    if-eqz v1, :cond_2

    .line 86
    invoke-virtual {v1}, Landroid/app/ActivityManager;->getRunningAppProcesses()Ljava/util/List;

    move-result-object v2

    .line 87
    .local v2, "processes":Ljava/util/List;, "Ljava/util/List<Landroid/app/ActivityManager$RunningAppProcessInfo;>;"
    if-eqz v2, :cond_2

    .line 88
    invoke-interface {v2}, Ljava/util/List;->iterator()Ljava/util/Iterator;

    move-result-object v3

    :goto_0
    invoke-interface {v3}, Ljava/util/Iterator;->hasNext()Z

    move-result v4

    if-eqz v4, :cond_2

    invoke-interface {v3}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v4

    check-cast v4, Landroid/app/ActivityManager$RunningAppProcessInfo;

    .line 89
    .local v4, "info":Landroid/app/ActivityManager$RunningAppProcessInfo;
    iget v5, v4, Landroid/app/ActivityManager$RunningAppProcessInfo;->importance:I

    const/16 v6, 0x64

    if-ne v5, v6, :cond_1

    sget-object v5, Lcom/moekoe/music/MusicAppKeeper;->MUSIC_PACKAGES:Ljava/util/Set;

    iget-object v6, v4, Landroid/app/ActivityManager$RunningAppProcessInfo;->processName:Ljava/lang/String;

    .line 90
    invoke-interface {v5, v6}, Ljava/util/Set;->contains(Ljava/lang/Object;)Z

    move-result v5

    if-eqz v5, :cond_1

    .line 91
    iget-object v3, v4, Landroid/app/ActivityManager$RunningAppProcessInfo;->processName:Ljava/lang/String;

    return-object v3

    .line 93
    .end local v4    # "info":Landroid/app/ActivityManager$RunningAppProcessInfo;
    :cond_1
    goto :goto_0

    .line 96
    .end local v2    # "processes":Ljava/util/List;, "Ljava/util/List<Landroid/app/ActivityManager$RunningAppProcessInfo;>;"
    :cond_2
    const/4 v2, 0x0

    return-object v2
.end method

.method private hasUsageStatsPermission()Z
    .locals 5

    .line 118
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->context:Landroid/content/Context;

    const-string v1, "appops"

    invoke-virtual {v0, v1}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/AppOpsManager;

    .line 119
    .local v0, "appOps":Landroid/app/AppOpsManager;
    const/4 v1, 0x0

    if-nez v0, :cond_0

    return v1

    .line 120
    :cond_0
    nop

    .line 122
    invoke-static {}, Landroid/os/Process;->myUid()I

    move-result v2

    iget-object v3, p0, Lcom/moekoe/music/MusicAppKeeper;->context:Landroid/content/Context;

    .line 123
    invoke-virtual {v3}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v3

    .line 120
    const-string v4, "android:get_usage_stats"

    invoke-virtual {v0, v4, v2, v3}, Landroid/app/AppOpsManager;->checkOpNoThrow(Ljava/lang/String;ILjava/lang/String;)I

    move-result v2

    .line 124
    .local v2, "mode":I
    if-nez v2, :cond_1

    const/4 v1, 0x1

    :cond_1
    return v1
.end method

.method private scan()V
    .locals 3

    .line 68
    invoke-direct {p0}, Lcom/moekoe/music/MusicAppKeeper;->getForegroundMusicPackage()Ljava/lang/String;

    move-result-object v0

    .line 69
    .local v0, "foreground":Ljava/lang/String;
    if-eqz v0, :cond_0

    .line 70
    new-instance v1, Ljava/lang/StringBuilder;

    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V

    const-string v2, "Music app active: "

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    invoke-virtual {v1, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    const-string v2, "MoeKoeKeeper"

    invoke-static {v2, v1}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I

    .line 74
    :cond_0
    return-void
.end method


# virtual methods
.method public start()V
    .locals 4

    .line 59
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->handler:Landroid/os/Handler;

    iget-object v1, p0, Lcom/moekoe/music/MusicAppKeeper;->scanner:Ljava/lang/Runnable;

    invoke-virtual {v0, v1}, Landroid/os/Handler;->removeCallbacks(Ljava/lang/Runnable;)V

    .line 60
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->handler:Landroid/os/Handler;

    iget-object v1, p0, Lcom/moekoe/music/MusicAppKeeper;->scanner:Ljava/lang/Runnable;

    const-wide/16 v2, 0x7530

    invoke-virtual {v0, v1, v2, v3}, Landroid/os/Handler;->postDelayed(Ljava/lang/Runnable;J)Z

    .line 61
    return-void
.end method

.method public stop()V
    .locals 2

    .line 64
    iget-object v0, p0, Lcom/moekoe/music/MusicAppKeeper;->handler:Landroid/os/Handler;

    iget-object v1, p0, Lcom/moekoe/music/MusicAppKeeper;->scanner:Ljava/lang/Runnable;

    invoke-virtual {v0, v1}, Landroid/os/Handler;->removeCallbacks(Ljava/lang/Runnable;)V

    .line 65
    return-void
.end method
