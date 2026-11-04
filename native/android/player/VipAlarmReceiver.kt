package com.moekoe.music.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * 闹钟到期的接收者 —— **只负责叫醒，不发起任何网络请求**。
 *
 * 做三件事：
 * 1. 复核「真的到期了吗」（闹钟可能提前到，或者用户在排完之后改了系统时间）；
 * 2. 落「待领取」标记（进程随时可能被回收，这个标记是唯一可靠的交代）；
 * 3. `goAsync()` 把广播挂住，并把活交给 JS（[VipClaimBridge]）。
 *
 * 为什么不在 `onReceive` 里直接领：
 * - 广播接收者的主线程只有 10~60 秒窗口，网络请求一旦超时就会 ANR；
 * - 领取要调酷狗接口，签名实现只有 JS 有（`api/` 是打进 bundle 的 node 模块），
 *   原生没有等价实现 —— 这是 Expo/RN 工程的客观边界，不是偷懒。
 *
 * 没有可用 JS 运行时（进程被回收 / 冷进程）时：**不拉起界面、不拉起 React**，
 * 只留标记，等用户下次打开 App 时 onResume 走同一个领取入口补领。
 */
class VipAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != VipAlarmScheduler.ACTION_VIP_CLAIM_DUE) {
            return
        }

        val appContext = context.applicationContext
        val store = VipAlarmStore(appContext)
        val deadlineMs = store.deadlineMs()

        if (deadlineMs <= 0L) {
            // 截止时间已经被清掉（例如退出登录后 JS 那边写了 0）：把残留闹钟收干净
            VipAlarmScheduler.cancel(appContext)
            return
        }

        if (!store.isDue()) {
            // 提前到了：不领，按剩下的时间重排。绝不「到了就领」——
            // 那会在用户改过系统时间之后打出一次毫无意义的领取请求。
            Log.i(TAG, "闹钟提前触发（未到截止时间），重排")
            VipAlarmScheduler.schedule(appContext)
            return
        }

        val cycleId = store.cycleId()
        // 标记先于交接：即使下面 JS 那边进程被杀，下次回前台也知道「欠着一发」
        store.setPending(true)

        val result = goAsync()
        val handedOff = VipClaimBridge.handoff(appContext, result, cycleId, deadlineMs)
        if (!handedOff) {
            // 没有 JS 运行时：先清掉 armed 快照（这次闹钟已经消费掉了），
            // 但**保留** pending 与 deadline —— onResume 会据它们补领。
            store.clearArmed()
            result.finish()

            /*
             * 再把进程拉起来跑一次 headless 领取（不显示界面）。
             *
             * 这一步是「进程被杀当天也能领到」的唯一机会：不拉起的话只能等用户下次打开。
             * 失败也不影响兜底 —— pending 标记还在，下次打开照样补。
             */
            val started = startHeadlessClaim(appContext)
            Log.i(
                TAG,
                if (started) "没有可用的 JS 运行时：已启动 headless 领取服务"
                else "没有可用的 JS 运行时，且 headless 服务启动失败：等下次回前台补领"
            )
        }
    }

    /** 冷进程里把 JS 拉起来（前台服务 + headless 任务），见 [VipClaimService]。 */
    private fun startHeadlessClaim(context: Context): Boolean {
        return try {
            val intent = Intent(context, VipClaimService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            true
        } catch (error: Throwable) {
            Log.w(TAG, "启动 headless 领取服务失败", error)
            false
        }
    }

    companion object {
        private const val TAG = "MoeKoeVipAlarm"
    }
}
