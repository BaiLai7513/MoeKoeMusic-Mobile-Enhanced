package com.moekoe.music.player

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 调用**系统下载器**（[DownloadManager]）下载歌曲。
 *
 * ## 为什么用系统下载器而不是自己在 JS 里写 HTTP
 *
 * - 下载由系统进程负责，**App 被切后台或杀掉都不会中断**（自己写就做不到）
 * - 自带通知栏进度、失败重试、Wi-Fi/流量策略
 * - 文件直接落到**公共音乐目录**，第三方播放器与我们后续的「本地扫描」都能扫到
 *
 * JS 侧只负责解析出真实直链与文件名，其余交给系统。
 */
class DownloadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * 入队一个下载。
     *
     * @param subPath 相对公共音乐目录的路径，例如 `MoeKoe/周杰伦 - 晴天.flac`
     * @return 系统分配的下载 id（> 0 表示成功入队）
     */
    @ReactMethod
    fun enqueue(url: String, subPath: String, title: String, description: String, promise: Promise) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(title)
                setDescription(description)
                // 完成时在通知栏提示一次；下载中系统也会显示进度
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
                setMimeType(guessMimeType(subPath))
                setDestinationInExternalPublicDir(Environment.DIRECTORY_MUSIC, subPath)
            }

            val manager =
                reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val id = manager.enqueue(request)
            Log.i(TAG, "已入队下载 id=$id path=$subPath")
            promise.resolve(id.toDouble())
        } catch (error: Throwable) {
            Log.e(TAG, "入队下载失败", error)
            promise.reject("E_DOWNLOAD_ENQUEUE_FAILED", error.message, error)
        }
    }

    /** 按扩展名给系统一个 MIME，便于它选对通知图标与后续打开方式。 */
    private fun guessMimeType(subPath: String): String =
        when (subPath.substringAfterLast('.', "").lowercase()) {
            "flac" -> "audio/flac"
            "m4a" -> "audio/mp4"
            "aac" -> "audio/aac"
            "ogg" -> "audio/ogg"
            "wav" -> "audio/wav"
            else -> "audio/mpeg"
        }

    companion object {
        const val NAME = "MoeKoeDownload"
        private const val TAG = "MoeKoeDownload"
    }
}
