package com.moekoe.music.player

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * 把本项目的原生模块注册进 RN。
 *
 * 目前包含：
 * - [PlayerModule]      —— ExoPlayer 播放控制（名字 `MoeKoePlayer`）
 * - [SystemModule]      —— 电池优化白名单等系统设置（名字 `MoeKoeSystem`）
 * - [DownloadModule]    —— 调用系统下载器下载歌曲（名字 `MoeKoeDownload`）
 * - [LocalMusicModule]  —— 扫描本地音乐库（名字 `MoeKoeLocalMusic`）
 * - [VipAlarmModule]    —— 每日 VIP 的下次可领取时间与闹钟排期（名字 `MoeKoeVipAlarm`）
 *
 * 闹钟相关的两个广播接收者（[VipAlarmReceiver] / [VipBootReceiver]）不在 `getPackages()`
 * 里注册 —— 它们是 manifest 组件，由 `plugins/with-vip-alarm.js` 在 prebuild 时声明。
 *
 * 注册方式：由 `plugins/with-player.js` 在 prebuild 阶段往 MainApplication 的
 * `getPackages()` 里插入 `PlayerPackage()`，保证重跑 prebuild 后不丢。
 */
class PlayerPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(
            PlayerModule(reactContext),
            SystemModule(reactContext),
            DownloadModule(reactContext),
            LocalMusicModule(reactContext),
            VipAlarmModule(reactContext),
        )

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
