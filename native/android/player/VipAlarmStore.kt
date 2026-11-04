package com.moekoe.music.player

import android.content.Context
import android.os.SystemClock
import android.provider.Settings

/**
 * 每日 VIP「下次可领取时间」的**唯一存储**。
 *
 * ## 为什么是 SharedPreferences 而不是 expo-secure-store
 *
 * `BOOT_COMPLETED` 的接收者在**没有 JS 运行时**也要读它（重启后重排闹钟），
 * 而 SecureStore 里的值是加密的、只有 JS 侧能解。这里存的是时间戳与几个开关，
 * 不涉及隐私，放普通 SharedPreferences 是刻意的。
 *
 * ## 为什么要同时存「单调时钟触发点」
 *
 * 截止时间是一个**绝对时间戳**（epoch）。如果直接拿它跟 `System.currentTimeMillis()`
 * 比，用户把系统时间往后调一天就会被判成「已到期」，白白打一次领取请求。
 * 所以排闹钟时把「还有多久」换算成 `SystemClock.elapsedRealtime()`（含深睡、
 * 不受改时间影响）的目标值存下来，判断到期优先用它。
 *
 * 重启后 `elapsedRealtime` 归零，靠存下来的 [Settings.Global.BOOT_COUNT] 判断
 * 「这个触发点是不是本次开机记的」，不是就退回 epoch 比较（此时用服务端时钟偏移校准）。
 */
class VipAlarmStore(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ---------------------------------------------------------------- 截止时间

    fun deadlineMs(): Long = prefs.getLong(KEY_DEADLINE_MS, 0L)

    fun setDeadlineMs(value: Long) {
        prefs.edit().putLong(KEY_DEADLINE_MS, value).apply()
    }

    fun clockOffsetMs(): Long = prefs.getLong(KEY_CLOCK_OFFSET_MS, 0L)

    fun setClockOffsetMs(value: Long) {
        prefs.edit().putLong(KEY_CLOCK_OFFSET_MS, value).apply()
    }

    // ---------------------------------------------------------------- 待领取标记

    /** true = 到点了但没能领成（没有 JS 运行时 / JS 超时）。下次回前台必须补领。 */
    fun pending(): Boolean = prefs.getBoolean(KEY_PENDING, false)

    fun setPending(value: Boolean) {
        prefs.edit().putBoolean(KEY_PENDING, value).apply()
    }

    // ---------------------------------------------------------------- 闹钟排期快照

    fun mode(): String = prefs.getString(KEY_MODE, MODE_OFF) ?: MODE_OFF

    fun setMode(value: String) {
        prefs.edit().putString(KEY_MODE, value).apply()
    }

    fun armedDeadlineMs(): Long = prefs.getLong(KEY_ARMED_DEADLINE_MS, 0L)

    fun armedElapsedMs(): Long = prefs.getLong(KEY_ARMED_ELAPSED_MS, 0L)

    fun armedBootCount(): Int = prefs.getInt(KEY_ARMED_BOOT_COUNT, -1)

    fun setArmed(deadlineMs: Long, triggerElapsedMs: Long) {
        prefs.edit()
            .putLong(KEY_ARMED_DEADLINE_MS, deadlineMs)
            .putLong(KEY_ARMED_ELAPSED_MS, triggerElapsedMs)
            .putInt(KEY_ARMED_BOOT_COUNT, bootCount())
            .apply()
    }

    fun clearArmed() {
        prefs.edit()
            .remove(KEY_ARMED_DEADLINE_MS)
            .remove(KEY_ARMED_ELAPSED_MS)
            .putInt(KEY_ARMED_BOOT_COUNT, -1)
            .apply()
    }

    /**
     * 当前这一次开机里真的排上过闹钟。
     *
     * `bootCount() < 0`（读不到）时按「不知道」处理 —— 宁可退回 epoch 比较，
     * 也不要把上一次开机的 elapsedRealtime 当成这次的目标值。
     */
    fun isArmed(): Boolean =
        armedElapsedMs() > 0L && bootCount() >= 0 && armedBootCount() == bootCount()

    fun bootCount(): Int = try {
        Settings.Global.getInt(appContext.contentResolver, Settings.Global.BOOT_COUNT, -1)
    } catch (error: Throwable) {
        -1
    }

    // ---------------------------------------------------------------- 时间判断

    /**
     * 校准后的「现在」（epoch）。服务端时钟偏移由 JS 在每次写截止时间时一起写进来。
     *
     * 为什么要偏移：用户把手机时间往后调一天，`System.currentTimeMillis()` 会立刻
     * 「越过」截止时间。用服务端时间校准后，改时间不会误触发领取。
     */
    fun trustedNow(): Long = System.currentTimeMillis() + clockOffsetMs()

    /** 距离截止还有多久（毫秒，负数 = 已经到期）。没有截止时间时返回 0。 */
    fun remainingMs(): Long {
        val deadline = deadlineMs()
        if (deadline <= 0L) {
            return 0L
        }
        return if (isArmed()) {
            // 单调时钟：改系统时间不会影响它，而且它包含深睡时间，正是 AlarmManager 用的那条时间轴
            armedElapsedMs() - SystemClock.elapsedRealtime()
        } else {
            deadline - trustedNow()
        }
    }

    fun isDue(): Boolean {
        if (deadlineMs() <= 0L) {
            return false
        }
        return remainingMs() <= 0L
    }

    /** 周期 ID：一个截止时间就是一个领取周期。JS 侧的幂等闸门用它做键。 */
    fun cycleId(): String {
        val deadline = deadlineMs()
        return if (deadline > 0L) deadline.toString() else ""
    }

    companion object {
        private const val PREFS_NAME = "moekoe_vip_alarm"
        private const val KEY_DEADLINE_MS = "deadlineMs"
        private const val KEY_CLOCK_OFFSET_MS = "clockOffsetMs"
        private const val KEY_PENDING = "pending"
        private const val KEY_MODE = "alarmMode"
        private const val KEY_ARMED_DEADLINE_MS = "armedDeadlineMs"
        private const val KEY_ARMED_ELAPSED_MS = "armedElapsedMs"
        private const val KEY_ARMED_BOOT_COUNT = "armedBootCount"

        /** 精确闹钟排上了。 */
        const val MODE_EXACT = "exact"

        /** 精确闹钟权限被拒，降级成 `setAndAllowWhileIdle`（可能晚几分钟到几十分钟）。 */
        const val MODE_INEXACT = "inexact"

        /** 没排上（没有截止时间 / 系统拒绝），只能靠回前台兜底。 */
        const val MODE_OFF = "off"
    }
}
