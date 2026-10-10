package com.moekoe.music.player

import android.content.ContentUris
import android.database.Cursor
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * 本地音乐扫描。
 *
 * ## 为什么走 MediaStore 而不是遍历文件夹
 *
 * - Android 10 起的分区存储下，直接 `File.listFiles()` 读公共目录需要额外权限且行为不一致；
 * - MediaStore 是系统媒体库，**元数据（标题/歌手/专辑/时长）由系统解析好**，
 *   不用我们自己读标签；扫描到的文件也一定是系统认可的音频。
 * - 用 `IS_MUSIC != 0` 过滤掉铃声/通知音等非音乐条目。
 *
 * 注意：读取媒体库需要运行时权限（Android 13+ 是 `READ_MEDIA_AUDIO`，
 * 12 及以下是 `READ_EXTERNAL_STORAGE`），由 JS 侧负责申请。
 */
class LocalMusicModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * 扫描本地音乐。
     *
     * @return 曲目数组，每项包含 id / title / artist / album / durationMs / size / uri。
     *         查询失败（多半是没给权限）时 resolve 空数组而不是 reject ——
     *         调用方只需展示「没有本地音乐」，不该因此弹错误。
     */
    @ReactMethod
    fun scan(promise: Promise) {
        try {
            val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DATA,
            )

            // IS_MUSIC != 0 过滤掉铃声与通知音，否则列表里会混进大量非音乐条目
            val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
            val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"

            val result: WritableArray = Arguments.createArray()
            val cursor: Cursor? = reactContext.contentResolver.query(
                collection,
                projection,
                selection,
                null,
                sortOrder
            )

            cursor?.use { rows ->
                val idColumn = rows.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleColumn = rows.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistColumn = rows.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val albumColumn = rows.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val durationColumn = rows.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val sizeColumn = rows.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                val dataColumn = rows.getColumnIndex(MediaStore.Audio.Media.DATA)

                while (rows.moveToNext()) {
                    val id = rows.getLong(idColumn)
                    val title = rows.getString(titleColumn) ?: continue
                    // content:// URI 交给 ExoPlayer 播放，比 file:// 路径在各版本上都稳
                    val contentUri: Uri =
                        ContentUris.withAppendedId(collection, id)

                    result.pushMap(Arguments.createMap().apply {
                        putString("id", id.toString())
                        putString("title", title)
                        // 媒体库对未知歌手会塞 "<unknown>"，统一成空串由 JS 兜底
                        putString("artist", sanitizeUnknown(rows.getString(artistColumn)))
                        putString("album", sanitizeUnknown(rows.getString(albumColumn)))
                        putDouble("durationMs", rows.getLong(durationColumn).toDouble())
                        putDouble("size", rows.getLong(sizeColumn).toDouble())
                        putString("uri", contentUri.toString())
                        putString("path", if (dataColumn >= 0) rows.getString(dataColumn) else null)
                    })
                }
            }

            Log.i(TAG, "本地音乐扫描完成，共 ${result.size()} 首")
            promise.resolve(result)
        } catch (error: Throwable) {
            Log.w(TAG, "扫描本地音乐失败", error)
            // 常见原因是缺少读取媒体库权限；返回空数组让 UI 显示空态即可
            promise.resolve(Arguments.createArray())
        }
    }

    private fun sanitizeUnknown(value: String?): String =
        if (value.isNullOrBlank() || value == MediaStore.UNKNOWN_STRING) "" else value

    companion object {
        const val NAME = "MoeKoeLocalMusic"
        private const val TAG = "MoeKoeLocalMusic"
    }
}
