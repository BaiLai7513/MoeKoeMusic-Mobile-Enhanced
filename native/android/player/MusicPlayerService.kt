package com.moekoe.music.player

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionResult

/**
 * 后台播放服务。
 *
 * 用 media3 的 [MediaSessionService] 而不是自己写 Service，能白拿这些能力：
 * - 前台服务 + 媒体通知（Android 13+ 的 POST_NOTIFICATIONS、14+ 的 FGS 类型都自动合规）
 * - 锁屏 / 通知栏 / 蓝牙 / 车机的播放控制
 * - **播放进度自动同步给系统**（锁屏与通知栏的进度条无需自己写代码）
 * - Android 14+ 的前台服务生命周期托管
 *
 * 通知渠道由 media3 的 DefaultMediaNotificationProvider 创建，其 importance 为 LOW
 * （无提示音、不震动）—— 符合 `问题.TXT` P0 第 4 点「媒体通知不该响/抖」的结论。
 * 实测通知旗标为 `ONLY_ALERT_ONCE|NO_CLEAR|FOREGROUND_SERVICE`。
 *
 * ## 关于上/下一首：为什么走回调而不是 ExoPlayer 播放列表
 *
 * media3 的常规做法是把整个播放列表 `setMediaItems(...)` 交给 Player，
 * 系统控件就会自动触发 `seekToNext()`。但我们拿不到可预置的 URI：
 * 每首歌的播放地址都要单独调酷狗 `/song/url` 接口、且签名逻辑在 JS 侧
 * （154 首的歌单不可能预先解析出全部直链）。
 *
 * 因此这里：单曲模式播放，并通过 [MediaSession.Callback] 把
 * NEXT / PREVIOUS 命令桥回 JS，由 JS 解析下一首地址后再下发播放。
 * 为了让通知栏真的显示这两个按钮，必须在 [MediaSession.Callback.onConnect]
 * 里显式把对应 player command 声明为可用。
 *
 * 音频焦点由 [PlayerController] 里 ExoPlayer 的 setAudioAttributes(handleAudioFocus = true)
 * 处理，本类不重复实现。
 */
class MusicPlayerService : MediaSessionService() {

    private var controller: PlayerController? = null
    private var mediaSession: MediaSession? = null

    /**
     * 上/下一首的回调，由 [PlayerModule] 注册后转发给 JS。
     * 参数为 "next" 或 "previous"。
     */
    private val sessionCallback = object : MediaSession.Callback {

        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            // 显式声明上/下一首可用，否则系统控件不会渲染这两个按钮
            val playerCommands = MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
                .buildUpon()
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .build()

            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailablePlayerCommands(playerCommands)
                .build()
        }

        override fun onPlayerCommandRequest(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            playerCommand: Int,
        ): Int {
            when (playerCommand) {
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> {
                    Log.i(TAG, "收到「下一首」命令，转发给 JS")
                    commandListener?.invoke("next")
                    return SessionResult.RESULT_SUCCESS
                }

                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> {
                    Log.i(TAG, "收到「上一首」命令，转发给 JS")
                    commandListener?.invoke("previous")
                    return SessionResult.RESULT_SUCCESS
                }
            }
            return super.onPlayerCommandRequest(session, controller, playerCommand)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "onCreate: 创建 ExoPlayer + MediaSession")

        val playerController = PlayerController(this)
        val session = MediaSession.Builder(this, playerController.player)
            .setSessionActivity(openAppPendingIntent())
            .setCallback(sessionCallback)
            .build()

        controller = playerController
        mediaSession = session
        Log.i(TAG, "onCreate: 就绪")
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    /**
     * 用户把任务从最近任务划掉时触发。
     * 正在播放就让 media3 继续托管（通知还在，服务不会被杀）；
     * 已暂停/停止则直接收摊，避免留一个空服务常驻。
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = controller?.player
        if (player == null || !player.isPlaying) {
            Log.i(TAG, "onTaskRemoved: 未在播放，停止服务")
            stopSelf()
        }
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy: 释放 MediaSession 与 ExoPlayer")
        mediaSession?.release()
        mediaSession = null
        controller?.release()
        controller = null
        super.onDestroy()
    }

    /**
     * 点通知回到 App 主界面。
     * `getLaunchIntentForPackage` 理论上可能返回 null，这里给一个兜底 Intent，
     * 保证 MediaSession.Builder.setSessionActivity() 拿到的是非空 PendingIntent。
     */
    private fun openAppPendingIntent(): PendingIntent {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
                setPackage(packageName)
            }
        launchIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        return PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        private const val TAG = "MoeKoePlayerSvc"

        /** 由 PlayerModule 注册：把会话收到的切歌命令转发给 JS。 */
        @Volatile
        var commandListener: ((String) -> Unit)? = null
    }
}
