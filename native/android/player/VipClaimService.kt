package com.moekoe.music.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * 「闹钟到期，但进程已经被系统回收」时，把 JS 运行时拉起来领取的那一步。
 *
 * ## 为什么需要它
 *
 * [VipAlarmReceiver] 只能把「到期」交给**已经存在**的 JS 运行时（[VipClaimBridge]）。
 * 进程被杀之后，那条路只能落一个 pending 标记，等用户下次打开 App —— 如果用户一整天
 * 没打开，当天那一份就白丢了。
 *
 * 这个服务补的就是缺口：闹钟到点时，即使进程是冷的，也由系统把进程拉起来，
 * 跑一个**不显示界面**的 headless JS 任务，执行同一条领取链路。
 *
 * ## 为什么是 foreground service
 *
 * Android 8+ 对后台启动服务有限制，而闹钟触发的广播属于允许豁免的场景；但从冷进程
 * 启动后必须尽快 `startForeground()`，否则系统会在几秒内把进程收回（也正是
 * `ForegroundServiceDidNotStartInTime` 那个经典崩溃）。这里用 `shortService` 类型：
 * 它就是为「几十秒内跑完的短任务」准备的，不需要额外的前台服务类型权限。
 *
 * ## 与旧路径的关系
 *
 * 拉起失败（例如 ROM 拦截、用户关闭了自启）**不影响**原来的兜底：
 * 接收者仍然会写 pending 标记，下次打开 App 照样补领。这个服务只是把「当天能领到」
 * 的概率再往上抬一截。
 */
class VipClaimService : HeadlessJsTaskService() {

    override fun onCreate() {
        super.onCreate()
        promoteToForeground()
    }

    override fun getTaskConfig(intent: android.content.Intent?): HeadlessJsTaskConfig =
        // 15000ms 只是「JS 侧被挂起」的上限，真正的领取超时在 JS 里（waitForSilentVipClaim）
        HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TASK_TIMEOUT_MS, true)

    /**
     * 转前台。
     *
     * 通知尽量安静：这是半夜可能触发的东西，响一声就是事故。
     * 频道用独立的低优先级，且 `setSound(null)` / `setSilent(true)` 双保险。
     */
    private fun promoteToForeground() {
        try {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager != null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "VIP 自动领取",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    setSound(null, null)
                    enableVibration(false)
                    setShowBadge(false)
                    description = "每日 VIP 到期时后台领取，不需要用户操作"
                }
                manager.createNotificationChannel(channel)
            }

            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("MoeKoe")
                .setContentText("正在领取今日 VIP…")
                .setSmallIcon(applicationInfo.icon)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTI_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
                )
            } else {
                startForeground(NOTI_ID, notification)
            }
        } catch (error: Throwable) {
            // 转前台失败不阻断任务：headless 本身还能跑几十秒，够发一次请求
            Log.w(TAG, "转前台失败（任务照跑，但可能被系统提前回收）", error)
        }
    }

    companion object {
        /** 与 `src/features/account/headless-claim.ts` 里注册的名字必须一致。 */
        const val TASK_NAME = "MoeKoeVipClaimTask"

        private const val CHANNEL_ID = "moekoe_vip_claim"
        private const val NOTI_ID = 0x56495002 // 'VIP2'
        private const val TASK_TIMEOUT_MS = 120_000L
        private const val TAG = "MoeKoeVipAlarm"
    }
}
