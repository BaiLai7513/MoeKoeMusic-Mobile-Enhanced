package com.moekoe.music.player

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * JS 侧的「下次可领取时间」读写口（名字 `MoeKoeVipAlarm`）。
 *
 * ## 职责边界
 *
 * - **存**：把 JS 算出来的截止时间（以及服务端时钟偏移）写进原生 SharedPreferences，
 *   并顺手把下一次闹钟排好/取消。这是全项目**唯一**写这个时间戳的地方；
 * - **读**：给 JS 返回截止时间、剩余毫秒数、待领取标记、闹钟档位。
 *   剩余毫秒数由原生按单调时钟算，所以用户改系统时间不会让 JS 误判到期；
 * - **释放**：闹钟交接的 `acknowledgeClaim`（见 [VipClaimBridge]）。
 *
 * ## 为什么模块一创建就 attach 到 [VipClaimBridge]
 *
 * 「这个进程里有没有可用的 JS 运行时」是闹钟能否把活交出去的前提。模块实例的存在
 * 恰好等价于「JS 运行时已经起来了」—— 比去碰 `MainApplication.reactHost` 可靠：
 * 后者是懒加载的，在冷进程里访问会把 ReactHost 真的构造出来（连带 dev support 初始化），
 * 而闹钟唤起的冷进程里我们**不想**启动任何 React 相关的东西。
 *
 * ## 注意
 *
 * 方法一律用**块体** `{ }`（不是表达式体 `= ...`）：`@ReactMethod` 的方法会被 RN 的
 * 注解处理当成「返回 void 的异步方法」，表达式体会让它的返回类型变成 Boolean/Double，
 * TurboModule 会把它当同步方法处理并在调用时崩溃。
 */
class VipAlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        VipClaimBridge.attach(reactContext)
        Log.i(TAG, "VipAlarmModule 已创建，闹钟交接通道就绪")
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        VipClaimBridge.detach()
        super.invalidate()
    }

    /**
     * 写入下次可领取时间并重排闹钟。
     *
     * @param deadlineMs 新的截止时间（epoch 毫秒；0 = 清空）
     * @param trustedNowMs JS 侧「服务端校准后的现在」；用它算出并持久化时钟偏移
     * @param clearPending 是否清掉「到期没领成」的标记（成功/失败落定后清，纯同步时不清）
     */
    @ReactMethod
    fun commitDeadline(
        deadlineMs: Double,
        trustedNowMs: Double,
        clearPending: Boolean,
        promise: Promise
    ) {
        try {
            val appContext = reactContext.applicationContext
            val store = VipAlarmStore(appContext)
            val normalizedDeadline =
                if (deadlineMs.isFinite() && deadlineMs > 0.0) deadlineMs.toLong() else 0L
            val trustedNow =
                if (trustedNowMs.isFinite() && trustedNowMs > 0.0) {
                    trustedNowMs.toLong()
                } else {
                    System.currentTimeMillis()
                }

            // 服务端时钟偏移：重启后没有 JS 时，原生也要能用同一套「可信现在」
            store.setClockOffsetMs(trustedNow - System.currentTimeMillis())
            store.setDeadlineMs(normalizedDeadline)
            if (clearPending) {
                store.setPending(false)
            }

            if (normalizedDeadline <= 0L) {
                VipAlarmScheduler.cancel(appContext)
            } else {
                VipAlarmScheduler.schedule(appContext)
            }

            Log.i(
                TAG,
                "commitDeadline deadline=$normalizedDeadline offset=${store.clockOffsetMs()} " +
                    "mode=${store.mode()} pending=${store.pending()}"
            )
            promise.resolve(snapshot(appContext))
        } catch (error: Throwable) {
            Log.e(TAG, "写入下次可领取时间失败", error)
            promise.reject("E_VIP_ALARM_COMMIT", error.message, error)
        }
    }

    /** 读当前状态（截止时间 / 剩余毫秒 / 待领取标记 / 闹钟档位）。 */
    @ReactMethod
    fun getState(promise: Promise) {
        try {
            promise.resolve(snapshot(reactContext.applicationContext))
        } catch (error: Throwable) {
            Log.e(TAG, "读取闹钟状态失败", error)
            promise.reject("E_VIP_ALARM_STATE", error.message, error)
        }
    }

    /**
     * JS 这一轮处理完了：释放广播的 `pendingResult` 与唤醒锁。
     *
     * 必须成功失败都调（调用点在 JS 的 finally 里），否则原生要空等到 45 秒超时。
     */
    @ReactMethod
    fun acknowledgeClaim(cycleId: String, promise: Promise) {
        try {
            promise.resolve(VipClaimBridge.acknowledge(cycleId))
        } catch (error: Throwable) {
            Log.w(TAG, "释放闹钟交接失败", error)
            promise.reject("E_VIP_ALARM_ACK", error.message, error)
        }
    }

    private fun snapshot(appContext: Context): WritableMap {
        val store = VipAlarmStore(appContext)
        return Arguments.createMap().apply {
            putDouble("deadlineMs", store.deadlineMs().toDouble())
            putDouble("clockOffsetMs", store.clockOffsetMs().toDouble())
            putDouble("remainingMs", store.remainingMs().toDouble())
            putBoolean("pending", store.pending())
            putString("cycleId", store.cycleId())
            putBoolean("exactAllowed", isExactAlarmAllowed(appContext))
            putString("alarmMode", store.mode())
            putBoolean("armed", store.isArmed())
        }
    }

    private fun isExactAlarmAllowed(appContext: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true
        }
        val alarmManager =
            appContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
        return try {
            alarmManager.canScheduleExactAlarms()
        } catch (error: Throwable) {
            Log.w(TAG, "查询精确闹钟权限失败，按「未授予」处理", error)
            false
        }
    }

    companion object {
        const val NAME = "MoeKoeVipAlarm"
        private const val TAG = "MoeKoeVipAlarm"
    }
}
