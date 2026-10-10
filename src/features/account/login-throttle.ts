import * as SecureStore from 'expo-secure-store';

/**
 * 登录相关的本地节流（防风控）。
 *
 * ## 为什么需要
 *
 * 酷狗对「频繁请求验证码 / 频繁登录」有风控：触发后接口返回 20028，
 * 账号会被要求去官方客户端完成验证才能继续用。
 *
 * 登录页原本已有 60 秒倒计时，但那个 `countdown` 只是 React state ——
 * **杀掉进程重开（或重进页面）就归零**，等于没有跨重启保护。
 * 这里把「冷却截止时间」落到 SecureStore，保证重启后依然受约束。
 *
 * 注意：这只是**降低触发概率**，不是万能的；真正的风控判定在服务端。
 */

const SMS_COOLDOWN_KEY = 'moekoe.login.smsCooldownUntil';

/** 验证码重发间隔（秒），与登录页展示的倒计时一致。 */
export const SMS_COOLDOWN_SECONDS = 60;

/** 剩余冷却秒数；0 表示可以发送。任何异常都返回 0，绝不阻塞登录。 */
export async function readSmsCooldownRemaining(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(SMS_COOLDOWN_KEY);
    if (!raw) {
      return 0;
    }

    const until = Number(raw);
    if (!Number.isFinite(until)) {
      return 0;
    }

    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

/** 记一次验证码发送，写入冷却截止时间。 */
export async function startSmsCooldown(seconds = SMS_COOLDOWN_SECONDS): Promise<void> {
  try {
    await SecureStore.setItemAsync(SMS_COOLDOWN_KEY, String(Date.now() + seconds * 1000));
  } catch {
    // 写入失败只是失去跨重启保护，本次会话的倒计时仍然有效
  }
}
