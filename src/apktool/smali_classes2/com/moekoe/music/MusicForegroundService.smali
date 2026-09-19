.class public Lcom/moekoe/music/MusicForegroundService;
.super Landroid/app/Service;
.source "MusicForegroundService.java"


# static fields
.field public static final ACTION_NEXT:Ljava/lang/String; = "com.moekoe.music.action.NEXT"

.field public static final ACTION_PREV:Ljava/lang/String; = "com.moekoe.music.action.PREV"

.field public static final ACTION_TOGGLE:Ljava/lang/String; = "com.moekoe.music.action.TOGGLE"

.field private static final CHANNEL_ID:Ljava/lang/String; = "moekoe_playback"

.field private static artworkUrl:Ljava/lang/String;

.field private static final NOTIFICATION_ID:I = 0x1979

.field private static final TAG:Ljava/lang/String; = "MoeKoeService"

.field private static volatile instance:Lcom/moekoe/music/MusicForegroundService;


# instance fields
.field private appKeeper:Lcom/moekoe/music/MusicAppKeeper;

.field private lastNotificationPlaying:Z

.field private lastNotificationTitle:Ljava/lang/String;

.field private mediaSession:Landroid/media/session/MediaSession;

.field private wakeLock:Landroid/os/PowerManager$WakeLock;


# direct methods
.method public constructor <init>()V
    .locals 0

    .line 20
    invoke-direct {p0}, Landroid/app/Service;-><init>()V

    return-void
.end method

.method private acquireWakeLock()V
    .locals 4

    .line 221
    const-string v0, "power"

    invoke-virtual {p0, v0}, Lcom/moekoe/music/MusicForegroundService;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/os/PowerManager;

    .line 222
    .local v0, "pm":Landroid/os/PowerManager;
    if-nez v0, :cond_0

    return-void

    .line 223
    :cond_0
    const/4 v1, 0x1

    const-string v2, "MoeKoeMusic::Playback"

    invoke-virtual {v0, v1, v2}, Landroid/os/PowerManager;->newWakeLock(ILjava/lang/String;)Landroid/os/PowerManager$WakeLock;

    move-result-object v1

    iput-object v1, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    .line 224
    iget-object v1, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    const/4 v2, 0x0

    invoke-virtual {v1, v2}, Landroid/os/PowerManager$WakeLock;->setReferenceCounted(Z)V

    .line 225
    iget-object v1, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    const-wide/32 v2, 0x5265c00

    invoke-virtual {v1, v2, v3}, Landroid/os/PowerManager$WakeLock;->acquire(J)V

    .line 226
    return-void
.end method

.method private buildNotification(Ljava/lang/String;Ljava/lang/String;Z)Landroid/app/Notification;
    .locals 16
    .param p1, "title"    # Ljava/lang/String;
    .param p2, "text"    # Ljava/lang/String;
    .param p3, "playing"    # Z

    .line 112
    move-object/from16 v0, p0

    new-instance v1, Landroid/content/Intent;

    const-class v2, Lcom/moekoe/music/MainActivity;

    invoke-direct {v1, v0, v2}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const-string v7, "from_notif"

    const/4 v8, 0x1

    invoke-virtual {v1, v7, v8}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Z)Landroid/content/Intent;

    .line 113
    .local v1, "openIntent":Landroid/content/Intent;
    const/4 v2, 0x0

    const/high16 v3, 0xc000000

    invoke-static {v0, v2, v1, v3}, Landroid/app/PendingIntent;->getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v4

    .line 117
    .local v4, "contentIntent":Landroid/app/PendingIntent;
    new-instance v5, Landroid/content/Intent;

    const-class v6, Lcom/moekoe/music/MusicForegroundService;

    invoke-direct {v5, v0, v6}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const-string v7, "com.moekoe.music.action.TOGGLE"

    invoke-virtual {v5, v7}, Landroid/content/Intent;->setAction(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v5

    .line 118
    .local v5, "toggleIntent":Landroid/content/Intent;
    const/4 v7, 0x1

    invoke-static {v0, v7, v5, v3}, Landroid/app/PendingIntent;->getService(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v8

    .line 122
    .local v8, "togglePi":Landroid/app/PendingIntent;
    new-instance v9, Landroid/content/Intent;

    invoke-direct {v9, v0, v6}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const-string v10, "com.moekoe.music.action.NEXT"

    invoke-virtual {v9, v10}, Landroid/content/Intent;->setAction(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v9

    .line 123
    .local v9, "nextIntent":Landroid/content/Intent;
    const/4 v10, 0x2

    invoke-static {v0, v10, v9, v3}, Landroid/app/PendingIntent;->getService(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v11

    .line 127
    .local v11, "nextPi":Landroid/app/PendingIntent;
    new-instance v12, Landroid/content/Intent;

    invoke-direct {v12, v0, v6}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const-string v6, "com.moekoe.music.action.PREV"

    invoke-virtual {v12, v6}, Landroid/content/Intent;->setAction(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v6

    .line 128
    .local v6, "prevIntent":Landroid/content/Intent;
    const/4 v12, 0x3

    invoke-static {v0, v12, v6, v3}, Landroid/app/PendingIntent;->getService(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v3

    .line 132
    .local v3, "prevPi":Landroid/app/PendingIntent;
    sget v12, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v13, 0x1a

    if-lt v12, v13, :cond_0

    .line 133
    new-instance v12, Landroid/app/Notification$Builder;

    const-string v13, "moekoe_playback"

    invoke-direct {v12, v0, v13}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    goto :goto_0

    .line 134
    :cond_0
    new-instance v12, Landroid/app/Notification$Builder;

    invoke-direct {v12, v0}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;)V

    :goto_0
    nop

    .line 136
    .local v12, "builder":Landroid/app/Notification$Builder;
    move-object/from16 v13, p1

    invoke-virtual {v12, v13}, Landroid/app/Notification$Builder;->setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object v13

    .line 137
    move-object/from16 v14, p2

    invoke-virtual {v13, v14}, Landroid/app/Notification$Builder;->setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object v13

    .line 138
    const v14, 0x1080024

    invoke-virtual {v13, v14}, Landroid/app/Notification$Builder;->setSmallIcon(I)Landroid/app/Notification$Builder;

    move-result-object v13

    .line 139
    invoke-virtual {v13, v4}, Landroid/app/Notification$Builder;->setContentIntent(Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    move-result-object v13

    .line 140
    invoke-virtual {v13, v7}, Landroid/app/Notification$Builder;->setOngoing(Z)Landroid/app/Notification$Builder;

    move-result-object v13

    .line 141
    const v15, 0x1080025

    const-string v2, "\u4e0a\u4e00\u9996"

    invoke-virtual {v13, v15, v2, v3}, Landroid/app/Notification$Builder;->addAction(ILjava/lang/CharSequence;Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    move-result-object v2

    .line 142
    const-string v13, "\u64ad\u653e/\u6682\u505c"

    if-eqz p3, :cond_1

    const v14, 0x1080023

    goto :goto_1

    :cond_1
    const v14, 0x1080024

    :goto_1
    invoke-virtual {v2, v14, v13, v8}, Landroid/app/Notification$Builder;->addAction(ILjava/lang/CharSequence;Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    move-result-object v2

    .line 143
    const v13, 0x1080022

    const-string v14, "\u4e0b\u4e00\u9996"

    invoke-virtual {v2, v13, v14, v11}, Landroid/app/Notification$Builder;->addAction(ILjava/lang/CharSequence;Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    .line 145
    iget-object v2, v0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    if-eqz v2, :cond_2

    .line 146
    new-instance v2, Landroid/app/Notification$MediaStyle;

    invoke-direct {v2}, Landroid/app/Notification$MediaStyle;-><init>()V

    iget-object v13, v0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    .line 147
    invoke-virtual {v13}, Landroid/media/session/MediaSession;->getSessionToken()Landroid/media/session/MediaSession$Token;

    move-result-object v13

    invoke-virtual {v2, v13}, Landroid/app/Notification$MediaStyle;->setMediaSession(Landroid/media/session/MediaSession$Token;)Landroid/app/Notification$MediaStyle;

    move-result-object v2

    const/4 v13, 0x0

    filled-new-array {v13, v7, v10}, [I

    move-result-object v7

    .line 148
    invoke-virtual {v2, v7}, Landroid/app/Notification$MediaStyle;->setShowActionsInCompactView([I)Landroid/app/Notification$MediaStyle;

    move-result-object v2

    .line 146
    invoke-virtual {v12, v2}, Landroid/app/Notification$Builder;->setStyle(Landroid/app/Notification$Style;)Landroid/app/Notification$Builder;

    .line 150
    :cond_2
    invoke-virtual {v12}, Landroid/app/Notification$Builder;->build()Landroid/app/Notification;

    move-result-object v2

    return-object v2
.end method

.method private createChannel()V
    .locals 4

    .line 154
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1a

    if-lt v0, v1, :cond_0

    .line 155
    new-instance v0, Landroid/app/NotificationChannel;

    const-string v1, "\u97f3\u4e50\u64ad\u653e"

    const/4 v2, 0x4

    const-string v3, "moekoe_playback"

    invoke-direct {v0, v3, v1, v2}, Landroid/app/NotificationChannel;-><init>(Ljava/lang/String;Ljava/lang/CharSequence;I)V

    .line 157
    .local v0, "channel":Landroid/app/NotificationChannel;
    const-string v1, "MoeKoe \u540e\u53f0\u97f3\u4e50\u670d\u52a1\u901a\u77e5"

    invoke-virtual {v0, v1}, Landroid/app/NotificationChannel;->setDescription(Ljava/lang/String;)V

    .line 158
    const-class v1, Landroid/app/NotificationManager;

    invoke-virtual {p0, v1}, Lcom/moekoe/music/MusicForegroundService;->getSystemService(Ljava/lang/Class;)Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Landroid/app/NotificationManager;

    .line 159
    .local v1, "nm":Landroid/app/NotificationManager;
    if-eqz v1, :cond_0

    invoke-virtual {v1, v0}, Landroid/app/NotificationManager;->createNotificationChannel(Landroid/app/NotificationChannel;)V

    .line 161
    .end local v0    # "channel":Landroid/app/NotificationChannel;
    .end local v1    # "nm":Landroid/app/NotificationManager;
    :cond_0
    return-void
.end method

.method private createMediaSession()Landroid/media/session/MediaSession;
    .locals 6

    .line 164
    new-instance v0, Landroid/media/session/MediaSession;

    const-string v1, "MoeKoeMusic"

    invoke-direct {v0, p0, v1}, Landroid/media/session/MediaSession;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    .line 165
    .local v0, "session":Landroid/media/session/MediaSession;
    new-instance v1, Lcom/moekoe/music/MusicForegroundService$2;

    invoke-direct {v1, p0}, Lcom/moekoe/music/MusicForegroundService$2;-><init>(Lcom/moekoe/music/MusicForegroundService;)V

    invoke-virtual {v0, v1}, Landroid/media/session/MediaSession;->setCallback(Landroid/media/session/MediaSession$Callback;)V

    .line 186
    new-instance v1, Landroid/media/session/PlaybackState$Builder;

    invoke-direct {v1}, Landroid/media/session/PlaybackState$Builder;-><init>()V

    .line 187
    const-wide/16 v2, 0x236

    invoke-virtual {v1, v2, v3}, Landroid/media/session/PlaybackState$Builder;->setActions(J)Landroid/media/session/PlaybackState$Builder;

    move-result-object v1

    .line 192
    const/4 v2, 0x0

    const-wide/16 v3, 0x0

    const/4 v5, 0x0

    invoke-virtual {v1, v2, v3, v4, v5}, Landroid/media/session/PlaybackState$Builder;->setState(IJF)Landroid/media/session/PlaybackState$Builder;

    move-result-object v1

    .line 193
    .local v1, "initial":Landroid/media/session/PlaybackState$Builder;
    invoke-virtual {v1}, Landroid/media/session/PlaybackState$Builder;->build()Landroid/media/session/PlaybackState;

    move-result-object v2

    invoke-virtual {v0, v2}, Landroid/media/session/MediaSession;->setPlaybackState(Landroid/media/session/PlaybackState;)V

    .line 194
    const/4 v2, 0x1

    invoke-virtual {v0, v2}, Landroid/media/session/MediaSession;->setActive(Z)V

    .line 195
    return-object v0
.end method

.method private onWebViewPlaybackChanged(ZJJLjava/lang/String;)V
    .locals 7
    .param p1, "playing"    # Z
    .param p2, "position"    # J
    .param p4, "duration"    # J
    .param p6, "title"    # Ljava/lang/String;

    .line 199
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    if-nez v0, :cond_0

    return-void

    .line 200
    :cond_0
    if-eqz p1, :cond_1

    const/4 v0, 0x3

    goto :goto_0

    :cond_1
    const/4 v0, 0x2

    .line 201
    .local v0, "state":I
    :goto_0
    const-wide/16 v1, 0x236

    .line 206
    .local v1, "actions":J
    new-instance v3, Landroid/media/session/PlaybackState$Builder;

    invoke-direct {v3}, Landroid/media/session/PlaybackState$Builder;-><init>()V

    .line 207
    invoke-virtual {v3, v1, v2}, Landroid/media/session/PlaybackState$Builder;->setActions(J)Landroid/media/session/PlaybackState$Builder;

    move-result-object v3

    .line 208
    if-eqz p1, :cond_2

    const/high16 v4, 0x3f800000    # 1.0f

    goto :goto_1

    :cond_2
    const/4 v4, 0x0

    :goto_1
    invoke-virtual {v3, v0, p2, p3, v4}, Landroid/media/session/PlaybackState$Builder;->setState(IJF)Landroid/media/session/PlaybackState$Builder;

    move-result-object v3

    .line 209
    .local v3, "playbackBuilder":Landroid/media/session/PlaybackState$Builder;
    iget-object v4, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    invoke-virtual {v3}, Landroid/media/session/PlaybackState$Builder;->build()Landroid/media/session/PlaybackState;

    move-result-object v5

    invoke-virtual {v4, v5}, Landroid/media/session/MediaSession;->setPlaybackState(Landroid/media/session/PlaybackState;)V

    .line 211
    if-eqz p6, :cond_5

    invoke-virtual {p6}, Ljava/lang/String;->isEmpty()Z

    move-result v4

    if-nez v4, :cond_5

    .line 212
    new-instance v4, Landroid/media/MediaMetadata$Builder;

    invoke-direct {v4}, Landroid/media/MediaMetadata$Builder;-><init>()V

    .line 213
    const-string v6, " - "

    invoke-virtual {p6, v6}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v6

    array-length v3, v6

    const/4 v0, 0x1

    if-le v3, v0, :cond_3

    const/4 v3, 0x0

    aget-object v5, v6, v3

    const/4 v3, 0x1

    aget-object v0, v6, v3

    goto :goto_2

    :cond_3
    move-object v5, p6

    const-string v0, "MoeKoe Music"

    :goto_2
    move-object v1, v5

    const-string v3, "android.media.metadata.TITLE"

    invoke-virtual {v4, v3, v5}, Landroid/media/MediaMetadata$Builder;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/media/MediaMetadata$Builder;

    move-result-object v4

    .line 214
    const-string v3, "android.media.metadata.ARTIST"

    invoke-virtual {v4, v3, v0}, Landroid/media/MediaMetadata$Builder;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/media/MediaMetadata$Builder;

    move-result-object v4

    .line 215
    const-string v5, "android.media.metadata.DURATION"

    invoke-virtual {v4, v5, p4, p5}, Landroid/media/MediaMetadata$Builder;->putLong(Ljava/lang/String;J)Landroid/media/MediaMetadata$Builder;

    move-result-object v4

    .line 215
    .local v4, "metadataBuilder":Landroid/media/MediaMetadata$Builder;
    iget-object v5, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    invoke-virtual {v4}, Landroid/media/MediaMetadata$Builder;->build()Landroid/media/MediaMetadata;

    move-result-object v6

    invoke-virtual {v5, v6}, Landroid/media/session/MediaSession;->setMetadata(Landroid/media/MediaMetadata;)V

    sget-object v3, Lcom/moekoe/music/MusicForegroundService;->artworkUrl:Ljava/lang/String;

    if-eqz v3, :cond_cover_call

    invoke-virtual {v3}, Ljava/lang/String;->isEmpty()Z

    move-result v6

    if-nez v6, :cond_cover_call

    invoke-static {v5, v3, p6, p4, p5}, Lcom/moekoe/music/CoverArtLoader;->load(Landroid/media/session/MediaSession;Ljava/lang/String;Ljava/lang/String;J)V

    :cond_cover_call
    move-object v6, v1

    move-object v5, v0

    move v4, p1

    iget-object v3, p0, Lcom/moekoe/music/MusicForegroundService;->lastNotificationTitle:Ljava/lang/String;

    if-eqz v3, :cond_4

    iget-boolean v2, p0, Lcom/moekoe/music/MusicForegroundService;->lastNotificationPlaying:Z

    if-ne v2, v4, :cond_4

    invoke-virtual {v6, v3}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    if-nez v2, :cond_4

    goto :goto_3

    :cond_4
    invoke-direct {p0, v6, v5, v4}, Lcom/moekoe/music/MusicForegroundService;->updateNotification(Ljava/lang/String;Ljava/lang/String;Z)V

    iput-object v6, p0, Lcom/moekoe/music/MusicForegroundService;->lastNotificationTitle:Ljava/lang/String;

    iput-boolean v4, p0, Lcom/moekoe/music/MusicForegroundService;->lastNotificationPlaying:Z

    .line 217
    .end local v4    # "metadataBuilder":Landroid/media/MediaMetadata$Builder;
    :cond_5
    :goto_3
    iget-object v4, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    const/4 v5, 0x1

    invoke-virtual {v4, v5}, Landroid/media/session/MediaSession;->setActive(Z)V

    .line 218
    return-void
.end method

.method private releaseWakeLock()V
    .locals 1

    .line 229
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    if-eqz v0, :cond_0

    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    invoke-virtual {v0}, Landroid/os/PowerManager$WakeLock;->isHeld()Z

    move-result v0

    if-eqz v0, :cond_0

    .line 230
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    invoke-virtual {v0}, Landroid/os/PowerManager$WakeLock;->release()V

    .line 232
    :cond_0
    const/4 v0, 0x0

    iput-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->wakeLock:Landroid/os/PowerManager$WakeLock;

    .line 233
    return-void
.end method

.method private startAsForeground()V
    .locals 4

    .line 102
    const-string v0, "MoeKoe Music"

    const-string v1, "\u672c\u5730 API \u670d\u52a1\u8fd0\u884c\u4e2d"

    const/4 v2, 0x0

    invoke-direct {p0, v0, v1, v2}, Lcom/moekoe/music/MusicForegroundService;->buildNotification(Ljava/lang/String;Ljava/lang/String;Z)Landroid/app/Notification;

    move-result-object v0

    .line 103
    .local v0, "notification":Landroid/app/Notification;
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v2, 0x1d

    const/16 v3, 0x1979

    if-lt v1, v2, :cond_0

    .line 104
    const/4 v1, 0x2

    invoke-virtual {p0, v3, v0, v1}, Lcom/moekoe/music/MusicForegroundService;->startForeground(ILandroid/app/Notification;I)V

    goto :goto_0

    .line 107
    :cond_0
    invoke-virtual {p0, v3, v0}, Lcom/moekoe/music/MusicForegroundService;->startForeground(ILandroid/app/Notification;)V

    .line 109
    :goto_0
    return-void
.end method

.method private updateNotification(Ljava/lang/String;Ljava/lang/String;Z)V
    .locals 4
    .param p1, "title"    # Ljava/lang/String;
    .param p2, "text"    # Ljava/lang/String;
    .param p3, "playing"    # Z

    move v3, p3

    invoke-direct {p0, p1, p2, v3}, Lcom/moekoe/music/MusicForegroundService;->buildNotification(Ljava/lang/String;Ljava/lang/String;Z)Landroid/app/Notification;

    move-result-object v0

    const-string v1, "notification"

    invoke-virtual {p0, v1}, Lcom/moekoe/music/MusicForegroundService;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Landroid/app/NotificationManager;

    const/16 v2, 0x1979

    invoke-virtual {v1, v2, v0}, Landroid/app/NotificationManager;->notify(ILandroid/app/Notification;)V

    return-void
.end method

.method public static updatePlaybackState(ZJJLjava/lang/String;)V
    .locals 8
    .param p0, "playing"    # Z
    .param p1, "position"    # J
    .param p3, "duration"    # J
    .param p5, "title"    # Ljava/lang/String;

    .line 36
    sget-object v7, Lcom/moekoe/music/MusicForegroundService;->instance:Lcom/moekoe/music/MusicForegroundService;

    .line 37
    .local v7, "service":Lcom/moekoe/music/MusicForegroundService;
    if-eqz v7, :cond_0

    .line 38
    move-object v0, v7

    move v1, p0

    move-wide v2, p1

    move-wide v4, p3

    move-object v6, p5

    invoke-direct/range {v0 .. v6}, Lcom/moekoe/music/MusicForegroundService;->onWebViewPlaybackChanged(ZJJLjava/lang/String;)V

    .line 40
    :cond_0
    return-void
.end method

.method public static updatePlaybackStateEx(ZJJLjava/lang/String;Ljava/lang/String;)V
    .locals 9
    .param p0, "playing"    # Z
    .param p1, "position"    # J
    .param p3, "duration"    # J
    .param p5, "title"    # Ljava/lang/String;
    .param p6, "artwork"    # Ljava/lang/String;

    sput-object p6, Lcom/moekoe/music/MusicForegroundService;->artworkUrl:Ljava/lang/String;

    sget-object v8, Lcom/moekoe/music/MusicForegroundService;->instance:Lcom/moekoe/music/MusicForegroundService;

    if-eqz v8, :cond_0

    move-object v1, v8

    move v2, p0

    move-wide v3, p1

    move-wide v5, p3

    move-object v7, p5

    invoke-direct/range {v1 .. v7}, Lcom/moekoe/music/MusicForegroundService;->onWebViewPlaybackChanged(ZJJLjava/lang/String;)V

    :cond_0
    return-void
.end method


# virtual methods
.method public onBind(Landroid/content/Intent;)Landroid/os/IBinder;
    .locals 1
    .param p1, "intent"    # Landroid/content/Intent;

    .line 85
    const/4 v0, 0x0

    return-object v0
.end method

.method public onCreate()V
    .locals 1

    .line 44
    invoke-super {p0}, Landroid/app/Service;->onCreate()V

    .line 45
    sput-object p0, Lcom/moekoe/music/MusicForegroundService;->instance:Lcom/moekoe/music/MusicForegroundService;

    .line 46
    invoke-direct {p0}, Lcom/moekoe/music/MusicForegroundService;->createChannel()V

    .line 47
    invoke-direct {p0}, Lcom/moekoe/music/MusicForegroundService;->createMediaSession()Landroid/media/session/MediaSession;

    move-result-object v0

    iput-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    .line 48
    invoke-direct {p0}, Lcom/moekoe/music/MusicForegroundService;->startAsForeground()V

    .line 50
    invoke-direct {p0}, Lcom/moekoe/music/MusicForegroundService;->acquireWakeLock()V

    .line 52
    new-instance v0, Lcom/moekoe/music/MusicForegroundService$1;

    invoke-direct {v0, p0}, Lcom/moekoe/music/MusicForegroundService$1;-><init>(Lcom/moekoe/music/MusicForegroundService;)V

    invoke-static {p0, v0}, Lcom/moekoe/music/NodeEngine;->start(Landroid/content/Context;Lcom/moekoe/music/NodeEngine$Listener;)V

    .line 64
    new-instance v0, Lcom/moekoe/music/MusicAppKeeper;

    invoke-direct {v0, p0}, Lcom/moekoe/music/MusicAppKeeper;-><init>(Landroid/content/Context;)V

    iput-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->appKeeper:Lcom/moekoe/music/MusicAppKeeper;

    .line 65
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->appKeeper:Lcom/moekoe/music/MusicAppKeeper;

    invoke-virtual {v0}, Lcom/moekoe/music/MusicAppKeeper;->start()V

    .line 66
    return-void
.end method

.method public onDestroy()V
    .locals 3

    .line 90
    sget-object v0, Lcom/moekoe/music/MusicForegroundService;->instance:Lcom/moekoe/music/MusicForegroundService;

    const/4 v1, 0x0

    if-ne v0, p0, :cond_0

    sput-object v1, Lcom/moekoe/music/MusicForegroundService;->instance:Lcom/moekoe/music/MusicForegroundService;

    .line 91
    :cond_0
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->appKeeper:Lcom/moekoe/music/MusicAppKeeper;

    if-eqz v0, :cond_1

    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->appKeeper:Lcom/moekoe/music/MusicAppKeeper;

    invoke-virtual {v0}, Lcom/moekoe/music/MusicAppKeeper;->stop()V

    .line 92
    :cond_1
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    if-eqz v0, :cond_2

    .line 93
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    const/4 v2, 0x0

    invoke-virtual {v0, v2}, Landroid/media/session/MediaSession;->setActive(Z)V

    .line 94
    iget-object v0, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    invoke-virtual {v0}, Landroid/media/session/MediaSession;->release()V

    .line 95
    iput-object v1, p0, Lcom/moekoe/music/MusicForegroundService;->mediaSession:Landroid/media/session/MediaSession;

    .line 97
    :cond_2
    invoke-direct {p0}, Lcom/moekoe/music/MusicForegroundService;->releaseWakeLock()V

    .line 98
    invoke-super {p0}, Landroid/app/Service;->onDestroy()V

    .line 99
    return-void
.end method

.method public onStartCommand(Landroid/content/Intent;II)I
    .locals 2
    .param p1, "intent"    # Landroid/content/Intent;
    .param p2, "flags"    # I
    .param p3, "startId"    # I

    .line 70
    if-nez p1, :cond_0

    const/4 v0, 0x0

    goto :goto_0

    :cond_0
    invoke-virtual {p1}, Landroid/content/Intent;->getAction()Ljava/lang/String;

    move-result-object v0

    .line 71
    .local v0, "action":Ljava/lang/String;
    :goto_0
    const-string v1, "com.moekoe.music.action.TOGGLE"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_1

    .line 72
    const-string v1, "toggle"

    invoke-static {v1}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    goto :goto_1

    .line 73
    :cond_1
    const-string v1, "com.moekoe.music.action.NEXT"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_2

    .line 74
    const-string v1, "next"

    invoke-static {v1}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    goto :goto_1

    .line 75
    :cond_2
    const-string v1, "com.moekoe.music.action.PREV"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_3

    .line 76
    const-string v1, "prev"

    invoke-static {v1}, Lcom/moekoe/music/MainActivity;->sendMediaCommand(Ljava/lang/String;)V

    goto :goto_1

    .line 78
    :cond_3
    invoke-direct {p0}, Lcom/moekoe/music/MusicForegroundService;->startAsForeground()V

    .line 80
    :goto_1
    const/4 v1, 0x1

    return v1
.end method
