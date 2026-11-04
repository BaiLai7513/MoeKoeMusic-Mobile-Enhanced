package com.moekoe.music.player

import android.content.BroadcastReceiver
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import java.lang.ref.WeakReference

/**
 * 「闹钟到期」→「JS 领取」之间的交接。
 *
 * ## 为什么需要它（而不是在接收者里直接联网）
 *
 * 领取要调酷狗接口，签名实现在 `src/lib/kugou-api`（打进 JS bundle 的 node 模块），
 * 原生没有等价实现。所以接收者只能做三件事：
 *
 * 1. `goAsync()`：让系统知道这次广播「还没处理完」，进程不会在 `onReceive` 返回后立刻被回收；
 * 2. 拿一把 `PARTIAL_WAKE_LOCK`：JS 线程发请求期间别让 CPU 睡下去；
 * 3. 往 JS 发一个 `MoeKoeVipAlarm:due` 事件 —— 真正的领取在 JS 里跑。
 *
 * ## 没有 JS 运行时怎么办
 *
 * 进程被系统回收之后闹钟仍然会响（AlarmManager 是系统级的）。这时 `reactContext`
 * 是空（或者根本没有 module 实例登记过），**不启动任何界面、也不尝试拉起 React**，
 * 只留下「待领取」标记（由接收者写），等用户下次打开 App 时 onResume 走同一个领取入口补领。
 * 这既满足「未打开不强行拉起界面」，也避免为了跑一次领取把整个 RN runtime 在后台拉起来。
 *
 * ## 超时
 *
 * JS 可能因为进程被杀、异常、或者卡在网络里而不回来。45 秒后自动释放（广播超时上限是 60 秒），
 * 标记仍然是 pending，下次回前台补领。JS 正常结束会调 [acknowledge] 立刻释放。
 */
object VipClaimBridge {

    /** 与 `src/features/account/vip-deadline.ts` 的 `VIP_ALARM_DUE_EVENT` 必须一致。 */
    const val EVENT_VIP_CLAIM_DUE = "MoeKoeVipAlarm:due"

    private const val TAG = "MoeKoeVipAlarm"
    private const val WAKE_LOCK_TAG = "MoeKoe:VipClaim"
    private const val HOLD_TIMEOUT_MS = 45_000L
    private const val WAKE_LOCK_TIMEOUT_MS = HOLD_TIMEOUT_MS + 15_000L

    private val mainHandler = Handler(Looper.getMainLooper())
    private val stateLock = Any()

    private var reactContextRef: WeakReference<ReactContext>? = null
    private var pendingResult: BroadcastReceiver.PendingResult? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var activeCycleId: String? = null

    private val timeoutRunnable = Runnable {
        Log.w(TAG, "JS 侧 ${HOLD_TIMEOUT_MS}ms 内没有结束领取，释放唤醒锁；标记仍是 pending，下次回前台补领")
        release("timeout", true)
    }

    /**
     * 由 [VipAlarmModule] 在**模块被创建时**登记。
     *
     * 为什么不从 `Application` 拿 `ReactHost`：`MainApplication.reactHost` 是懒加载的，
     * 在闹钟唤起冷进程时访问它会**真的把 ReactHost 构造出来**（连带初始化 dev support），
     * 那不是我们想要的副作用。模块实例存在 == JS 运行时存在，这个信号最准。
     */
    fun attach(reactContext: ReactContext) {
        synchronized(stateLock) {
            reactContextRef = WeakReference(reactContext)
        }
    }

    fun detach() {
        synchronized(stateLock) {
            reactContextRef = null
        }
    }

    /**
     * 把「到期」交给 JS。
     *
     * @param result 接收者的 `goAsync()` 结果；交接成功时由本对象负责最终 `finish()`
     * @return true = 已经交给 JS（或同一个周期已经交接过）；false = 没有可用的 JS 运行时
     */
    fun handoff(
        context: Context,
        result: BroadcastReceiver.PendingResult,
        cycleId: String,
        deadlineMs: Long
    ): Boolean {
        val reactContext = reactContextRef?.get()
        if (reactContext == null || !reactContext.hasActiveReactInstance()) {
            Log.i(TAG, "没有可用的 JS 运行时：只落待领取标记，下次回前台由 onResume 补领")
            return false
        }

        synchronized(stateLock) {
            if (activeCycleId == cycleId) {
                // 同一个周期已经交接过（系统重复投递）：这次的广播结果直接收掉，
                // 绝不能再 emit 一次 —— JS 会看到两次「到期」
                mainHandler.post { result.finish() }
                return true
            }
            activeCycleId = cycleId
            pendingResult = result
        }

        acquireWakeLock(context)

        return try {
            val payload = Arguments.createMap().apply {
                putString("cycleId", cycleId)
                putDouble("deadlineMs", deadlineMs.toDouble())
            }
            reactContext.emitDeviceEvent(EVENT_VIP_CLAIM_DUE, payload)
            mainHandler.postDelayed(timeoutRunnable, HOLD_TIMEOUT_MS)
            Log.i(TAG, "已把领取交给 JS（cycle=$cycleId）")
            true
        } catch (error: Throwable) {
            Log.w(TAG, "把领取交给 JS 失败（React 上下文可能已销毁）", error)
            // finishBroadcast = false：这次广播由接收者自己收尾，别在这里重复 finish
            release("emit-failed", false)
            false
        }
    }

    /** JS 侧处理完一轮（成功/失败/被挡/异常都必须调）；返回是否真的释放了一次交接。 */
    fun acknowledge(cycleId: String): Boolean {
        synchronized(stateLock) {
            if (activeCycleId != cycleId) {
                return false
            }
        }
        release("acknowledged", true)
        return true
    }

    private fun acquireWakeLock(context: Context) {
        try {
            val powerManager =
                context.applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                    ?: return
            val lock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG)
            lock.setReferenceCounted(false)
            lock.acquire(WAKE_LOCK_TIMEOUT_MS)
            synchronized(stateLock) {
                wakeLock = lock
            }
        } catch (error: Throwable) {
            // 拿不到唤醒锁最多是「设备睡下去、请求慢一点」，不该让交接失败
            Log.w(TAG, "获取唤醒锁失败", error)
        }
    }

    private fun release(reason: String, finishBroadcast: Boolean) {
        var currentResult: BroadcastReceiver.PendingResult? = null
        var currentLock: PowerManager.WakeLock? = null

        synchronized(stateLock) {
            currentResult = pendingResult
            currentLock = wakeLock
            pendingResult = null
            wakeLock = null
            activeCycleId = null
        }

        // 取成不可变局部变量：下面要在嵌套的 lambda 里用，Kotlin 只对 val 做智能转换
        val resultToFinish = currentResult
        val lockToRelease = currentLock

        mainHandler.removeCallbacks(timeoutRunnable)

        if (lockToRelease != null) {
            try {
                if (lockToRelease.isHeld) {
                    lockToRelease.release()
                }
            } catch (error: Throwable) {
                Log.w(TAG, "释放唤醒锁失败", error)
            }
        }

        if (finishBroadcast && resultToFinish != null) {
            // 广播本身是主线程投递的，finish 也回主线程做，避免在 NativeModules 线程上踩到系统内部状态
            mainHandler.post {
                try {
                    resultToFinish.finish()
                } catch (error: Throwable) {
                    Log.w(TAG, "结束广播失败", error)
                }
            }
        }

        Log.i(TAG, "领取交接结束（$reason）")
    }
}
