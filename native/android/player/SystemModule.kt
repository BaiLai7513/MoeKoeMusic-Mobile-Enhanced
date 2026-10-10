package com.moekoe.music.player

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 与「后台能不能活下去」相关的系统设置桥接。
 *
 * ## 为什么需要它
 *
 * `问题.TXT` 里「容易没后台」的核心成因是 Android 的电池优化：
 * 长时间后台运行的应用会被系统冻结甚至清理，音乐播放首当其冲。
 * manifest 里声明 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 只是**允许申请**，
 * 真正加入白名单必须运行时拉起系统授权页 —— 官方 RN 版本没做这一步。
 *
 * 另外，本模块只做「查询 + 拉起设置页」，不做任何静默修改系统设置的行为
 * （那需要系统权限，也不该做）。
 */
class SystemModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * 当前是否已加入「忽略电池优化」白名单。
     * Android 6.0 以下没有这个机制，直接返回 true。
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val powerManager =
                reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val ignoring =
                powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) == true
            promise.resolve(ignoring)
        } catch (error: Throwable) {
            Log.w(TAG, "查询电池优化白名单失败", error)
            promise.reject("E_BATTERY_CHECK_FAILED", error.message, error)
        }
    }

    /**
     * 拉起系统的「是否忽略电池优化」授权页。
     *
     * 国产 ROM（ColorOS / MIUI / EMUI 等）常拦截这个 Intent，
     * 失败时回退到「应用详情页」，至少让用户能手动找到省电设置。
     * resolve 的布尔值表示是否成功拉起了**标准的**授权页（false = 走了回退）。
     */
    @SuppressLint("BatteryLife")
    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(false)
            return
        }

        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.w(TAG, "标准授权页拉起失败，回退到应用详情页", error)
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallback)
                promise.resolve(false)
            } catch (fallbackError: Throwable) {
                Log.e(TAG, "应用详情页也拉不起来", fallbackError)
                promise.reject("E_BATTERY_REQUEST_FAILED", fallbackError.message, fallbackError)
            }
        }
    }

    companion object {
        const val NAME = "MoeKoeSystem"
        private const val TAG = "MoeKoeSystem"
    }
}
