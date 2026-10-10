package com.moekoe.music.player

import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors

/**
 * RN 侧的播放控制入口（改造清单 §2.1 的 PlayerManager 原生实现）。
 *
 * ## 为什么用 MediaController 而不是 startForegroundService
 *
 * 最初版本直接 `startForegroundService(Intent(this, MusicPlayerService::class.java))`
 * 去拉 media3 的 MediaSessionService，结果被系统杀掉：
 *
 * ```
 * RemoteServiceException$ForegroundServiceDidNotStartInTimeException:
 *   Context.startForegroundService() did not then call Service.startForeground()
 * ```
 *
 * 原因：media3 的 MediaSessionService 只在它判断该进前台时才调 startForeground()，
 * 时机由播放状态驱动，未必在系统要求的 5 秒内。
 *
 * 正确姿势是用 [MediaController] 连接会话（`MediaController.Builder(...).buildAsync()`）：
 * 连接动作本身会拉起服务，前台切换与媒体通知全部由 media3 托管。
 *
 * ## 职责边界
 *
 * JS 只传「一首歌的直链 + 元数据」，队列/播放模式由 JS 侧维护，原生不做队列。
 * 状态经 `MoeKoePlayer:state` 事件回流，实现 MiniPlayer / 通知栏 / 锁屏读同一套状态。
 *
 * 线程：MediaController 只能在主线程访问，所有操作都 post 到 UI 线程。
 */
class PlayerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var mediaController: MediaController? = null

    override fun getName(): String = NAME

    init {
        Log.i(TAG, "PlayerModule 已创建")
        // 会话收到的「上/下一首」命令（来自通知栏/锁屏/耳机）转发给 JS，
        // 由 JS 解析下一首的播放地址后再下发播放。
        MusicPlayerService.commandListener = { command ->
            Log.i(TAG, "切歌命令转发到 JS: $command")
            emit(EVENT_COMMAND, command)
        }
    }

    /**
     * 统一的 JS 事件出口。
     *
     * 必须包 try/catch：播放服务可能比 React 上下文活得更久
     * （例如 JS 侧重载、Activity 销毁后服务仍在后台播放），
     * 此时 emitDeviceEvent 会抛异常并导致进程崩溃。
     */
    private fun emit(event: String, payload: Any?) {
        try {
            reactContext.emitDeviceEvent(event, payload)
        } catch (error: Throwable) {
            Log.w(TAG, "emitDeviceEvent($event) 失败（React 上下文可能已销毁）", error)
        }
    }

    // ---------------------------------------------------------------- 状态回流

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            emitState()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            emitState()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            emitState()
        }

        override fun onPlayerError(error: PlaybackException) {
            Log.e(TAG, "播放出错: ${error.errorCodeName} ${error.message}")
            emitState(error.message ?: error.errorCodeName)
        }
        // 刻意不监听 onEvents：播放中会被高频触发，每次 emit 都过一次 RN 桥。
        // 播放进度由 JS 侧按需轮询 getState()（且仅在播放中轮询）。
    }

    private fun emitState(error: String? = null) {
        val controller = mediaController ?: return
        val payload = Arguments.createMap().apply {
            putBoolean("playing", controller.isPlaying)
            putBoolean(
                "buffering",
                controller.playbackState == Player.STATE_BUFFERING
            )
            putDouble("positionMs", controller.currentPosition.coerceAtLeast(0L).toDouble())
            val duration = controller.duration
            putDouble("durationMs", if (duration > 0) duration.toDouble() else 0.0)
            putString("mediaId", controller.currentMediaItem?.mediaId)
            putInt("index", controller.currentMediaItemIndex)
            // 随机模式下「下一首」是乱序的，JS 必须知道 ExoPlayer 认定的下一首是谁，
            // 才能提前把直链解析好；否则会撞上占位符、表现为「一首放完卡住」。
            putInt("nextIndex", controller.nextMediaItemIndex)
            putInt("previousIndex", controller.previousMediaItemIndex)
            putString("error", error)
        }
        emit(EVENT_STATE, payload)
    }

    // ---------------------------------------------------------------- 连接管理

    /**
     * 拿到可用的 [MediaController]，没有就先发起连接。
     *
     * [retriesLeft] 必须递减：早先的版本在「等待连接」分支里递归时没递减，
     * 一旦服务连不上就会每 50ms 无限递归（CPU 空转 + 内存增长），
     * 属于必须堵死的稳定性问题。现在最多等 [CONNECT_TIMEOUT_TICKS] × 50ms 后报错。
     */
    private fun withController(
        promise: Promise?,
        retriesLeft: Int = CONNECT_TIMEOUT_TICKS,
        block: (MediaController) -> Unit,
    ) {
        mediaController?.let { controller ->
            block(controller)
            return
        }

        val pending = controllerFuture
        if (pending != null && !pending.isDone) {
            if (retriesLeft <= 0) {
                Log.w(TAG, "连接播放服务超时")
                promise?.reject("E_CONTROLLER_TIMEOUT", "连接播放服务超时")
                return
            }
            mainHandler.postDelayed({ withController(promise, retriesLeft - 1, block) }, 50L)
            return
        }

        // 走到这里说明没有连接、且没有在途连接（或上一次已失败）→ 重建
        if (pending != null) {
            controllerFuture = null
        }

        Log.i(TAG, "连接 MusicPlayerService (MediaController.buildAsync)")
        val token = SessionToken(
            reactContext,
            ComponentName(reactContext, MusicPlayerService::class.java)
        )

        val future = try {
            MediaController.Builder(reactContext, token).buildAsync()
        } catch (error: Throwable) {
            Log.e(TAG, "创建 MediaController 失败", error)
            promise?.reject("E_CONTROLLER_FAILED", error.message, error)
            return
        }
        controllerFuture = future

        future.addListener(
            {
                try {
                    val controller = future.get()
                    mediaController = controller
                    controller.addListener(playerListener)
                    Log.i(TAG, "MediaController 已连接")
                    emitState()
                    block(controller)
                } catch (error: Throwable) {
                    Log.e(TAG, "MediaController 连接失败", error)
                    controllerFuture = null
                    promise?.reject("E_CONTROLLER_FAILED", error.message, error)
                }
            },
            MoreExecutors.directExecutor()
        )
    }

    // ---------------------------------------------------------------- methods

    /** 用 JS 传来的元数据构造一个 MediaItem。 */
    private fun buildMediaItem(uri: String, metadata: ReadableMap): MediaItem {
        val mediaMetadata = MediaMetadata.Builder()
            .setTitle(metadata.getString("title"))
            .setArtist(metadata.getString("artist"))
            .setAlbumTitle(metadata.getString("albumTitle"))
            .setArtworkUri(metadata.getString("artworkUrl")?.let { android.net.Uri.parse(it) })
            .build()

        val mediaId = metadata.getString("mediaId") ?: uri

        return MediaItem.Builder()
            .setUri(uri)
            .setMediaId(mediaId)
            /*
             * 播放缓存的键用**歌曲 hash**，不用 URI。
             *
             * 酷狗直链里带时间戳（/202610101256/…），同一首歌每次解析出的 URL 都不同；
             * 若以 URI 为键，缓存永远命中不了。PlayerController 里的 CacheKeyFactory
             * 读的就是这个 key，所以这里必须给稳定值。
             */
            .setCustomCacheKey(mediaId)
            .setMediaMetadata(mediaMetadata)
            .build()
    }

    /**
     * 用整条队列建立 ExoPlayer 播放列表。
     *
     * 为什么必须这么做（而不是单曲 setMediaItem）：
     * 系统媒体卡片上的「上一首/下一首」按钮**是否可点**，取决于
     * `Player.hasNextMediaItem()/hasPreviousMediaItem()`。单曲模式下这两个恒为 false，
     * 按钮就是灰的；只在 `MediaSession.Callback.onConnect` 里声明命令可用没有用 ——
     * media3 会把声明出的命令与 Player 的真实能力取交集，结果仍是不可用。
     *
     * [items] 里每项的 `url` 允许先给占位符（未解析直链的曲目），
     * JS 侧会用 [replaceItem] 提前把「当前 + 后面几首」换成真实直链。
     */
    @ReactMethod
    fun setPlaylist(items: ReadableArray, startIndex: Double, promise: Promise) {
        Log.i(TAG, "setPlaylist() 收到 ${items.size()} 首，startIndex=$startIndex")
        mainHandler.post {
            withController(promise) { controller ->
                try {
                    val mediaItems = (0 until items.size()).mapNotNull { i ->
                        val map = items.getMap(i) ?: return@mapNotNull null
                        val url = map.getString("url") ?: return@mapNotNull null
                        buildMediaItem(url, map)
                    }

                    if (mediaItems.isEmpty()) {
                        promise.reject("E_EMPTY_PLAYLIST", "播放列表为空")
                        return@withController
                    }

                    val start = startIndex.toInt().coerceIn(0, mediaItems.size - 1)
                    controller.setMediaItems(mediaItems, start, 0L)
                    controller.prepare()
                    controller.play()
                    Log.i(TAG, "setPlaylist() 已下发：${mediaItems.size} 首，从 $start 开始")
                    promise.resolve(true)
                } catch (error: Throwable) {
                    Log.e(TAG, "setPlaylist() 失败", error)
                    promise.reject("E_SET_PLAYLIST_FAILED", error.message, error)
                }
            }
        }
    }

    /** 把某一项替换成已解析直链的版本（JS 预解析后调用）。 */
    @ReactMethod
    fun replaceItem(index: Double, url: String, metadata: ReadableMap, promise: Promise) {
        mainHandler.post {
            val controller = mediaController
            if (controller == null) {
                promise.resolve(false)
                return@post
            }
            try {
                val position = index.toInt()
                if (position < 0 || position >= controller.mediaItemCount) {
                    promise.resolve(false)
                    return@post
                }
                controller.replaceMediaItem(position, buildMediaItem(url, metadata))
                Log.i(TAG, "replaceItem($position) 已更新直链")
                promise.resolve(true)
            } catch (error: Throwable) {
                Log.e(TAG, "replaceItem() 失败", error)
                promise.reject("E_REPLACE_ITEM_FAILED", error.message, error)
            }
        }
    }

    /** 按播放列表下标跳转（JS 已确保该下标已解析出直链）。 */
    @ReactMethod
    fun seekToIndex(index: Double, promise: Promise) {
        mainHandler.post {
            withController(promise) { controller ->
                try {
                    controller.seekToDefaultPosition(index.toInt())
                    controller.play()
                    promise.resolve(true)
                } catch (error: Throwable) {
                    promise.reject("E_SEEK_INDEX_FAILED", error.message, error)
                }
            }
        }
    }

    /**
     * 同步播放模式到 ExoPlayer。
     * 有了原生播放列表后，曲目由 ExoPlayer 自己推进，所以循环/随机必须交给它：
     * - single（单曲循环）→ REPEAT_MODE_ONE
     * - sequence（列表循环）→ REPEAT_MODE_ALL
     * - shuffle（随机）→ REPEAT_MODE_ALL + shuffleModeEnabled
     */
    @ReactMethod
    fun setPlaybackMode(repeatMode: Double, shuffleEnabled: Boolean, promise: Promise) {
        mainHandler.post {
            withController(promise) { controller ->
                try {
                    controller.repeatMode = repeatMode.toInt().coerceIn(0, 2)
                    controller.shuffleModeEnabled = shuffleEnabled
                    Log.i(TAG, "setPlaybackMode repeat=$repeatMode shuffle=$shuffleEnabled")
                    promise.resolve(true)
                } catch (error: Throwable) {
                    promise.reject("E_SET_MODE_FAILED", error.message, error)
                }
            }
        }
    }

    // 注意：下面这些方法必须用「块体」而不是表达式体 `= mainHandler.post { }`。
    // Handler.post 返回 Boolean，表达式体会让方法签名变成 `Boolean xxx(Promise)`，
    // 而 TurboModule interop 的规则是「返回非 void ⇒ 同步方法」，
    // 于是出现：Unable to parse @ReactMethod annotations ...
    // TurboModule system assumes returnType == void iff the method is synchronous。

    @ReactMethod
    fun pause(promise: Promise) {
        mainHandler.post {
            withController(promise) { it.pause(); promise.resolve(true) }
        }
    }

    @ReactMethod
    fun resume(promise: Promise) {
        mainHandler.post {
            withController(promise) { it.play(); promise.resolve(true) }
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        mainHandler.post {
            withController(promise) { it.stop(); it.clearMediaItems(); promise.resolve(true) }
        }
    }

    @ReactMethod
    fun seekTo(positionMs: Double, promise: Promise) {
        mainHandler.post {
            withController(promise) { it.seekTo(positionMs.toLong()); promise.resolve(true) }
        }
    }

    /** 主动拉一次当前状态（JS 冷启对齐 / 进度轮询用）。 */
    @ReactMethod
    fun getState(promise: Promise) {
        mainHandler.post {
            val controller = mediaController
            if (controller == null) {
                promise.resolve(null)
                return@post
            }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("playing", controller.isPlaying)
                putBoolean("buffering", controller.playbackState == Player.STATE_BUFFERING)
                putDouble("positionMs", controller.currentPosition.coerceAtLeast(0L).toDouble())
                val duration = controller.duration
                putDouble("durationMs", if (duration > 0) duration.toDouble() else 0.0)
                putString("mediaId", controller.currentMediaItem?.mediaId)
                putInt("index", controller.currentMediaItemIndex)
                putInt("nextIndex", controller.nextMediaItemIndex)
                putInt("previousIndex", controller.previousMediaItemIndex)
                putString("error", null)
            })
        }
    }

    /** RN 侧 NativeEventEmitter 的约定方法（Android 上无操作）。 */
    @ReactMethod
    fun addListener(eventName: String) {
        // no-op
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        // no-op
    }

    override fun invalidate() {
        MusicPlayerService.commandListener = null

        // 全部包 try/catch：invalidate 可能在任意时刻被调用，
        // 半个连接状态或已释放的 controller 都不该让进程崩掉。
        try {
            mediaController?.removeListener(playerListener)
            mediaController?.release()
        } catch (error: Throwable) {
            Log.w(TAG, "释放 MediaController 失败", error)
        }
        mediaController = null

        try {
            controllerFuture?.let { future ->
                if (!future.isDone) {
                    MediaController.releaseFuture(future)
                }
            }
        } catch (error: Throwable) {
            Log.w(TAG, "释放 MediaController future 失败", error)
        }
        controllerFuture = null
        super.invalidate()
    }

    companion object {
        const val NAME = "MoeKoePlayer"
        const val EVENT_STATE = "MoeKoePlayer:state"

        /** 来自通知栏/锁屏/耳机的切歌命令，值为 "next" 或 "previous"。 */
        const val EVENT_COMMAND = "MoeKoePlayer:command"

        /** 等待 MediaController 连接的最长时间 = 该值 × 50ms（当前 5 秒）。 */
        private const val CONNECT_TIMEOUT_TICKS = 100

        private const val TAG = "MoeKoePlayer"
    }
}
