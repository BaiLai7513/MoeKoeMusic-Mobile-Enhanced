package com.moekoe.music.player

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log
import kotlin.math.abs

/**
 * 下一次领取的闹钟调度器。
 *
 * ## 主触发器为什么是 AlarmManager
 *
 * 「进入时未到期、停留期间跨过 24 小时」这一条，任何「只在打开 App 时判断」的实现都做不到：
 * 没有任何东西在到期那一刻叫醒它。闹钟是唯一能**精确指定时刻**、且进程被杀也依然存在
 * 的系统能力（定时器会随进程一起死，WorkManager 周期任务最小 15 分钟且会被批处理）。
 *
 * ## 只负责叫醒，不负责领取
 *
 * 这里只排/取消闹钟；到期之后做什么由 [VipAlarmReceiver] 决定（它也只把活交给 JS）。
 * 网络请求在 JS 里 —— 因为酷狗签名只有 JS 有。
 *
 * ## 精确闹钟的降级
 *
 * Android 12+ 用 `SCHEDULE_EXACT_ALARM` + `setExactAndAllowWhileIdle()`；
 * Android 13+ 新装默认**不授予**该权限（`canScheduleExactAlarms()` 返回 false），
 * 此时平滑降级为 `setAndAllowWhileIdle()`（不精确、但允许在 Doze 里触发），
 * 并把档位写进 [VipAlarmStore]，由 JS 侧连同「回前台兜底」一起保证不漏领。
 * 绝不因为权限被拒就静默不排。
 *
 * ## 为什么用 ELAPSED_REALTIME_WAKEUP
 *
 * 用 `RTC_WAKEUP` 的话，用户把系统时间往后调一天，闹钟会立刻触发（判据也是时间）。
 * `ELAPSED_REALTIME_WAKEUP` 走的是「开机以来的单调时钟」，改系统时间不影响它，
 * 而且它包含深睡时间 —— Doze 期间也能按时醒。重启后这条时间轴归零，
 * 由 [VipBootReceiver] 用 epoch 截止时间重新换算。
 */
object VipAlarmScheduler {

    const val ACTION_VIP_CLAIM_DUE = "com.moekoe.music.player.action.VIP_CLAIM_DUE"
    const val EXTRA_DEADLINE_MS = "deadlineMs"

    private const val REQUEST_CODE = 0x56495001 // 'VIP1'
    private const val TAG = "MoeKoeVipAlarm"

    /** 已经到期时也要等一下再响：避免「排到过去 → 立刻触发 → 又排到过去」的紧循环。 */
    private const val MIN_TRIGGER_DELAY_MS = 3_000L

    /** 触发点漂移小于这个值就不重排（回前台/每次开播都会调一次 schedule）。 */
    private const val REARM_TOLERANCE_MS = 120_000L

    /** 按当前 [VipAlarmStore] 里的截止时间排闹钟；返回实际档位（exact / inexact / off）。 */
    fun schedule(context: Context): String {
        val appContext = context.applicationContext
        val store = VipAlarmStore(appContext)
        val alarmManager = alarmManager(appContext)
        val deadlineMs = store.deadlineMs()

        if (deadlineMs <= 0L || alarmManager == null) {
            alarmManager?.cancel(pendingIntent(appContext, 0L))
            store.clearArmed()
            store.setMode(VipAlarmStore.MODE_OFF)
            return VipAlarmStore.MODE_OFF
        }

        val remaining = store.remainingMs()
        val delay = if (remaining > MIN_TRIGGER_DELAY_MS) remaining else MIN_TRIGGER_DELAY_MS
        val triggerElapsed = SystemClock.elapsedRealtime() + delay
        val exactAllowed = canScheduleExact(alarmManager)

        /*
         * 已经为同一个截止时间排过、且触发点没明显漂移 → 不重排。
         *
         * 为什么必须早退：回前台、每次开播、每次写截止时间都会调到这里。
         * 对精确闹钟重排无害，但对**不精确**闹钟，每重排一次系统都会重新挑一个窗口，
         * 反复重排就等于把它一直往后推 —— 那样降级之后反而更容易漏领。
         */
        if (store.isArmed() && store.armedDeadlineMs() == deadlineMs) {
            val drift = abs(store.armedElapsedMs() - triggerElapsed)
            val modeMatches = (store.mode() == VipAlarmStore.MODE_EXACT) == exactAllowed
            if (drift < REARM_TOLERANCE_MS && modeMatches) {
                return store.mode()
            }
        }

        alarmManager.cancel(pendingIntent(appContext, deadlineMs))

        var mode = VipAlarmStore.MODE_OFF
        if (exactAllowed) {
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerElapsed,
                    pendingIntent(appContext, deadlineMs)
                )
                mode = VipAlarmStore.MODE_EXACT
            } catch (error: SecurityException) {
                // 权限可能在运行期被收回（用户去设置里关掉）：不当失败，走降级
                Log.w(TAG, "精确闹钟被系统拒绝，降级为 setAndAllowWhileIdle", error)
            }
        } else {
            Log.w(
                TAG,
                "未获得精确闹钟权限（Android 12+；13+ 新装默认拒绝），降级为 setAndAllowWhileIdle，" +
                    "并由回前台兜底"
            )
        }

        if (mode == VipAlarmStore.MODE_OFF) {
            try {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerElapsed,
                    pendingIntent(appContext, deadlineMs)
                )
                mode = VipAlarmStore.MODE_INEXACT
            } catch (error: Throwable) {
                // 连不精确闹钟都排不上（极少数 ROM）：如实记 off，让 JS 知道只能靠 onResume
                Log.e(TAG, "闹钟排不上，只能靠回前台补领", error)
                store.clearArmed()
                store.setMode(VipAlarmStore.MODE_OFF)
                return VipAlarmStore.MODE_OFF
            }
        }

        store.setArmed(deadlineMs, triggerElapsed)
        store.setMode(mode)
        Log.i(
            TAG,
            "已排下一轮领取 mode=$mode delay=${delay}ms deadline=$deadlineMs"
        )
        return mode
    }

    /** 取消闹钟（不改变截止时间本身）。 */
    fun cancel(context: Context) {
        val appContext = context.applicationContext
        alarmManager(appContext)?.cancel(pendingIntent(appContext, 0L))
        val store = VipAlarmStore(appContext)
        store.clearArmed()
        store.setMode(VipAlarmStore.MODE_OFF)
    }

    private fun alarmManager(context: Context): AlarmManager? =
        context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    private fun canScheduleExact(alarmManager: AlarmManager): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true
        }
        return try {
            alarmManager.canScheduleExactAlarms()
        } catch (error: Throwable) {
            Log.w(TAG, "查询精确闹钟权限失败，按「未授予」处理", error)
            false
        }
    }

    private fun pendingIntent(context: Context, deadlineMs: Long): PendingIntent {
        val intent = Intent(context, VipAlarmReceiver::class.java).apply {
            action = ACTION_VIP_CLAIM_DUE
            putExtra(EXTRA_DEADLINE_MS, deadlineMs)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
    }
}
