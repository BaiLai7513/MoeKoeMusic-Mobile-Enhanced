package com.moekoe.music.player

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import java.io.File

/**
 * ExoPlayer 的构造与持有。
 *
 * ## 职责边界（重要）
 *
 * 这里**只负责把 ExoPlayer 按正确姿势建出来**，不对外暴露播放控制 API。
 * 对外的控制与状态回流全部由 [PlayerModule] 通过 media3 的 `MediaController` 完成 ——
 * 那套机制是 media3 官方推荐的桥接方式，能一并托管前台服务与媒体通知。
 *
 * 之所以不再在这里维护一套 `play/pause/snapshot/listener`：早期的实现是
 * 「Module 直接操作全局 ExoPlayer 实例」，改用 MediaController 后那套 API 就全部失去调用方了。
 * 现在本类只暴露 [player]（交给 MediaSession）与 [release]。
 *
 * ## 设计要点
 *
 * - 在线播放的 URL 是 /song/url 返回的普通 HTTP 直链，不是 KGM 加密流，
 *   因此只需要 DefaultHttpDataSource，不需要自定义解密 DataSource。
 * - 音频焦点交给 ExoPlayer 自己处理（`setAudioAttributes(..., handleAudioFocus = true)`），
 *   电话/其他播放器/导航的避让行为不用手写 AudioFocusManager。
 * - 拔耳机（ACTION_AUDIO_BECOMING_NOISY）由 setHandleAudioBecomingNoisy 处理。
 */
class PlayerController(context: Context) {

    private val appContext = context.applicationContext

    private val httpDataSourceFactory = DefaultHttpDataSource.Factory()
        .setUserAgent(USER_AGENT)
        .setConnectTimeoutMs(CONNECT_TIMEOUT_MS)
        .setReadTimeoutMs(READ_TIMEOUT_MS)
        .setAllowCrossProtocolRedirects(true)

    /**
     * 播放缓存数据源：**读缓存优先**，未命中或缓存数据不完整时再回落到网络。
     *
     * 效果就是需求里的「播过的歌自动落盘，之后无论在线离线都优先走本地缓存」：
     * 省流量、起播更快，断网时听过的歌还能重放。
     */
    private val cacheDataSourceFactory: CacheDataSource.Factory
        get() = CacheDataSource.Factory()
            .setCache(playbackCache(appContext))
            .setUpstreamDataSourceFactory(httpDataSourceFactory)
            // 缓存层自身出错（例如缓存被系统清理）时直接走网络，不要因此让播放失败
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
            /*
             * 关键：**不能用默认的「以 URI 为键」**。
             *
             * 酷狗直链里带时间戳（形如 /202610101256/…），每次解析出来的 URL 都不同，
             * 用 URI 当键会永远 miss —— 缓存看着装上了其实一次都不会命中。
             * 这里改用 MediaItem 的自定义缓存键（PlayerModule 里填的是歌曲 hash），
             * 于是同一首歌无论直链怎么变都命中同一份缓存。
             */
            .setCacheKeyFactory { dataSpec -> dataSpec.key ?: dataSpec.uri.toString() }

    /** 交给 [MusicPlayerService] 构建 MediaSession 用；不要在本类之外调它的控制方法。 */
    val player: ExoPlayer = ExoPlayer.Builder(appContext)
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                /*
                 * DefaultDataSource 按 scheme 分流：
                 * - content:// / file:// 等本地地址它自己处理 —— **不经过播放缓存**，
                 *   否则每次播本地文件都会往缓存里再抄一份，纯属浪费；
                 * - http(s) 才落到作为 base 传进来的缓存数据源。
                 */
                DefaultDataSource.Factory(appContext, cacheDataSourceFactory)
            )
                // 未解析直链的占位符一旦被播到，默认策略会退避重试约 7 秒
                // （用户观感就是「一首放完卡住」）。这里对占位符直接不重试，
                // 把错误立刻抛给 JS 的自愈逻辑去解析真链并重播。
                .setLoadErrorHandlingPolicy(object : DefaultLoadErrorHandlingPolicy() {
                    override fun getRetryDelayMsFor(
                        loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo
                    ): Long {
                        // media3 1.11 的 LoadErrorInfo 字段是 loadEventInfo / mediaLoadData /
                        // exception / errorCount，URI 在 loadEventInfo.dataSpec 里。
                        if (loadErrorInfo.loadEventInfo.dataSpec.uri.scheme == PENDING_URI_SCHEME) {
                            return C.TIME_UNSET
                        }
                        return super.getRetryDelayMsFor(loadErrorInfo)
                    }
                })
        )
        // 拔耳机/断开蓝牙时自动暂停
        .setHandleAudioBecomingNoisy(true)
        // 关键：ExoPlayer 默认 WAKE_MODE_NONE，息屏后 CPU 进入休眠，
        // 长音频播放与缓冲会被系统打断（表现为息屏一会儿就断/卡）。
        // 用 WAKE_MODE_NETWORK 让它在播放期间持有 PARTIAL_WAKE_LOCK。
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()
        .apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true
            )
        }

    fun release() {
        player.release()
    }

    companion object {
        private const val USER_AGENT = "MoeKoeMusic"
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000

        /**
         * 未解析直链时的占位 URI scheme。
         * 必须与 JS 侧 `PlayerManager.PENDING_URI_PREFIX` 保持一致。
         */
        const val PENDING_URI_SCHEME = "moekoe-pending"

        /** 播放缓存上限 512MB：音频体积不大，够存几十首无损。超出按 LRU 淘汰。 */
        private const val CACHE_MAX_BYTES = 512L * 1024 * 1024

        @Volatile
        private var sharedCache: SimpleCache? = null

        /**
         * 进程内唯一的播放缓存。
         *
         * **必须单例**：`SimpleCache` 会锁定其目录，同目录创建第二个实例会直接抛异常
         * （播放服务被系统重建时就会踩到）。所以这里做懒初始化 + 双重检查。
         *
         * 目录选 `filesDir` 而不是 `cacheDir`：后者会被系统在存储紧张时清掉，
         * 而我们希望「听过的歌」能长期留着供离线重放。
         */
        fun playbackCache(context: Context): SimpleCache {
            sharedCache?.let { return it }
            return synchronized(this) {
                sharedCache ?: SimpleCache(
                    File(context.applicationContext.filesDir, "media-cache"),
                    LeastRecentlyUsedCacheEvictor(CACHE_MAX_BYTES),
                    StandaloneDatabaseProvider(context.applicationContext)
                ).also { sharedCache = it }
            }
        }
    }
}
