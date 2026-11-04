package com.moekoe.music.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 重启 / 应用更新 / 精确闹钟权限变更之后的恢复入口。
 *
 * ## 为什么必须有它
 *
 * `AlarmManager` 里排的闹钟**在重启后会全部消失**（系统级清理，不是我们能保住的）。
 * 不在这里恢复的话，用户只要重启过一次手机，「到期自动领取」就永远失效了 ——
 * 而 onResume 兜底只能覆盖「用户主动打开 App」的情况。
 *
 * ## 已到期时为什么不在这里领
 *
 * 重启广播到达时进程里**没有 JS 运行时**。领取依赖 JS 侧签名实现，所以这里只落
 * 「待领取」标记，不拉起界面、不拉起 JS —— 用户下次打开 App 时 onResume 走同一个
 * 幂等入口补领。这与需求里「未打开 → 不强行拉起界面，下次打开补领」是同一条策略。
 *
 * ## 为什么连 `MY_PACKAGE_REPLACED` 也听
 *
 * 覆盖安装（升级 App）同样会清掉闹钟。少了这一条，用户升级一次就丢一次调度，
 * 直到下次打开 App 才恢复。
 */
class VipBootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in HANDLED_ACTIONS) {
            return
        }

        val appContext = context.applicationContext
        val store = VipAlarmStore(appContext)

        // 重启后 SystemClock.elapsedRealtime() 归零，上一次开机记的触发点一定失效；
        // 覆盖安装/权限变更时清掉也无害（schedule 会按 epoch 重新算一遍）
        store.clearArmed()

        if (store.deadlineMs() <= 0L) {
            // 没有截止时间（没登录 / 从没领过）：什么都不用排
            VipAlarmScheduler.cancel(appContext)
            return
        }

        if (store.isDue()) {
            store.setPending(true)
            Log.i(TAG, "重启/更新后已过期：不拉起界面，等下次打开由 onResume 走同一个领取入口")
            return
        }

        val mode = VipAlarmScheduler.schedule(appContext)
        Log.i(TAG, "重启/更新后恢复闹钟 mode=$mode action=$action")
    }

    companion object {
        private const val TAG = "MoeKoeVipAlarm"

        /** 部分国产 ROM 在「快速开机」时发的是这个私有广播，顺手一起恢复。 */
        private const val ACTION_QUICKBOOT = "android.intent.action.QUICKBOOT_POWERON"

        /**
         * Android 12+：用户在系统设置里授予/收回了「闹钟和提醒」权限。
         *
         * 收到它就重排一次 —— 授权之后可以从 inexact 平滑升到 exact，
         * 收回之后则降级回去。不监听的话，档位要等到下一次写截止时间才会变。
         */
        private const val ACTION_EXACT_ALARM_PERMISSION_CHANGED =
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"

        private val HANDLED_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            ACTION_QUICKBOOT,
            ACTION_EXACT_ALARM_PERMISSION_CHANGED,
        )
    }
}
