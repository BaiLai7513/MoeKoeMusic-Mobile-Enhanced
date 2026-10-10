import * as SecureStore from 'expo-secure-store';

import { getApiSession } from '@/lib/kugou-api';

import { claimDailyVipSilently, fetchVipStatus } from './vip-api';

/**
 * 每日畅听 VIP 的**静默领取**调度。
 *
 * ## 与官方版的区别
 *
 * | | 官方版 | 这里 |
 * |---|---|---|
 * | 触发 | 用户手动点「签到领取 VIP」 | **检测到 VIP 不在有效期时自动** |
 * | 时机 | 立即 | **随机延时 1–30 秒**（模仿人工节奏，降低风控概率） |
 * | 升级概念版 | 领取后弹窗询问 | **不做**（见 vip-api 的接口隔离） |
 * | 提示 | Toast / Alert | 无 UI，仅日志 |
 *
 * ## 为什么要随机延时
 *
 * 登录后立刻打领取接口，请求特征非常像脚本；实测酷狗对固定节奏的领取会返回 20028（风控）。
 * 官方增强版的做法也是「3 + rand×27 秒」，这里按需求取 1–30 秒。
 */

const LAST_ATTEMPT_KEY = 'moekoe.vip.lastSilentClaim';

/** 延时区间：1–30 秒。 */
const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/** 本次进程是否已经检查过（避免每次页面聚焦都打一次 VIP 接口）。 */
let sessionChecked = false;
/** 正在延时等待中，避免重复排程。 */
let pending = false;

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function readLastAttempt(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(LAST_ATTEMPT_KEY)) ?? '';
  } catch {
    return '';
  }
}

async function writeLastAttempt(day: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_ATTEMPT_KEY, day);
  } catch {
    // 记录失败只会导致明天多试一次，不影响功能
  }
}

function randomDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

export type SilentVipClaimOptions = {
  /**
   * 领取成功后的回调（用于弹 Toast）。
   *
   * 参考实现（Enhanced 移动版）成功后的文案是「概念版每日VIP领取成功」。
   * 但我们**刻意不做概念版升级**，`receive_vip_listen_song` 发的是 1 天畅听 VIP，
   * 所以文案不能照抄，否则会误导用户以为自己拿到了概念版。
   */
  onClaimed?: () => void;
};

/** 领取成功提示文案（集中一处，避免多个调用点写歪）。 */
export const VIP_CLAIMED_TOAST = '已自动领取 1 天畅听 VIP';

/**
 * 排一次静默领取检查。**可以随意重复调用** —— 内部有会话级与按天的双重去重。
 *
 * 未登录时直接返回且**不消耗会话标记**，这样登录成功后再次调用仍能生效。
 */
export function scheduleSilentVipClaim(options?: SilentVipClaimOptions): void {
  if (sessionChecked || pending) {
    return;
  }
  if (!getApiSession().token) {
    return;
  }

  sessionChecked = true;

  void (async () => {
    try {
      const day = todayKey();
      if ((await readLastAttempt()) === day) {
        // 今天已经领过（或已尝试过），不再打扰接口
        return;
      }

      const status = await fetchVipStatus();
      if (status.isVip) {
        // 还在有效期内，不需要补领；不写标记，等真过期时再走一次。
        // 这条日志是排查用的：没有它就无法区分「没触发」和「触发了但不需要领」。
        console.log(
          `[vip] VIP 仍在有效期（${status.vipLabel || 'VIP'}${
            status.endTimeMs ? ` 至 ${new Date(status.endTimeMs).toLocaleDateString()}` : ''
          }），跳过静默领取`
        );
        return;
      }

      const delay = randomDelayMs();
      console.log(`[vip] VIP 不在有效期，${Math.round(delay / 1000)} 秒后静默领取`);
      pending = true;
      await new Promise((resolve) => setTimeout(resolve, delay));

      const outcome = await claimDailyVipSilently();
      await writeLastAttempt(day);
      console.log('[vip] 静默领取结果:', outcome);

      if (outcome === 'claimed') {
        options?.onClaimed?.();
      }
    } catch (error) {
      // 静默领取属于「锦上添花」，任何异常都不该影响主流程
      console.warn('[vip] 静默领取流程异常:', error);
    } finally {
      pending = false;
    }
  })();
}
