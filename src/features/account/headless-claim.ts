/**
 * headless 领取任务。
 *
 * 跑起来的时机很窄：闹钟到点、但 App 进程已经被系统回收 —— 原生
 * （`native/android/player/VipClaimService.kt`）会拉一个前台服务，把 JS 运行时
 * 冷启动起来，然后调用这里。**不显示任何界面**。
 *
 * ## 为什么必须等流程跑完
 *
 * 这个 JS 运行时是原生为「这一发」临时拉起来的，任务一返回，进程随时会被系统回收。
 * 如果发起请求就 return，请求还没发出去进程就没了 —— 等于白拉一次，还留下一个
 * 「今天试过了」的标记。所以这里要 `waitForSilentVipClaim()` 等到真正有结论。
 *
 * ## 与正常路径的关系
 *
 * 用的是**同一个** `runSilentVipClaim`（同一套闸门、同一份按天记录）：
 * 不会因为多了一条入口就多领一次。没领到的原因（未登录、24h 未满、SVIP 还在有效期）
 * 都会在这里安静退出，只留日志。
 */
import { bootstrapMobileApi } from '@/lib/kugou-api';

import { alarmSilentVipClaim, waitForSilentVipClaim } from './vip-silent-claim';

/** 必须与 `VipClaimService.TASK_NAME` 一致（在 `index.js` 里注册同名任务）。 */
export default async function headlessVipClaim(): Promise<void> {
  try {
    // 会话（token/userid）是异步 hydrate 的；不先等它，领取会直接以「未登录」早返回
    await bootstrapMobileApi();

    const started = alarmSilentVipClaim();
    if (!started) {
      console.log('[vip] headless：已有流程在飞或未登录，本次不领');
      return;
    }

    await waitForSilentVipClaim(75_000);
    console.log('[vip] headless：本次领取流程结束');
  } catch (error) {
    // headless 里抛异常会让系统认为任务失败；吞掉并留日志，绝不向上抛
    console.warn('[vip] headless 领取异常:', error);
  }
}
