import * as SecureStore from 'expo-secure-store';

import { getApiSession } from '@/lib/kugou-api';

import { localDayKey } from './vip-day';

/**
 * 「本地 VIP 状态」—— 界面显示与自动领取判断的**唯一依据**。
 *
 * ## 为什么不再现查 `/user/vip/detail`
 *
 * 原来判断「过期没有」要现打一次 `/user/vip/detail`，而判断一天要做几十次（每次开播都触发），
 * 请求量与收益完全不成比例 —— 用户要的只是「过期了就补领一次」。到期时间本身是**已知且可
 * 持久化**的，存下来之后判断就退化成一次本地读取 + 一次数字比较，**不发任何网络请求**。
 *
 * ## 这里存了两样东西（key 都在同一命名空间下，便于一起排查）
 *
 * | key（末尾都会再拼上 `.<账号>`） | 内容 | 谁写 | 谁读 |
 * |---|---|---|---|
 * | `moekoe.vip.endTimeMs` | 任意 VIP 的到期毫秒数（0 = 未知/已过期） | 「我的」页拉资料（权威）、领取成功后的估算 | 自动领取的「还要不要领」 |
 * | `moekoe.vip.svipDay` | `{day, valid}` —— SVIP 状态，**一天一份** | 「我的」页拉资料、升级成功 | 胶囊显示 + 自动领取的第二道闸 |
 *
 * ## 到期时间写什么
 *
 * 领取/升级成功后按**实测口径**估算：这次发放的时刻 + 24 小时（`vipGrantExpiry`，
 * 依据见 vip-day 与 vip-api 的 `parseVipStatus`）。
 * 「我的」页拉资料时用服务端给的**权威值**覆盖：取所有有效记录里**最晚**的到期时间。
 * 两者是同一个语义 —— 「还能听多久 = 最晚的那条」。
 *
 * ## 已知的残余偏差
 *
 * 用户在官方客户端领了更长的 VIP 时，本地估算会偏短 → 自动路径多打一次领取请求
 * （服务端回 131001，不重复发额度）。只要用户打开过一次「我的」页面，权威值就会纠正它。
 * 这是「不发判断请求」的必然代价，用户明确选择了这个取舍。
 */

const VIP_END_TIME_KEY = 'moekoe.vip.endTimeMs';
const SVIP_DAY_KEY = 'moekoe.vip.svipDay';

/**
 * 「谁的」状态。
 *
 * 到期时间 / SVIP 都是**按账号**算的：同一天换账号登录，前一个账号的结论跟新账号
 * 毫无关系。不区分账号的话，新账号一进来就会看到「SVIP 有效中」而点不动胶囊。
 *
 * 会话还没 hydrate 时是 guest（键仍然稳定，不会与任何真实账号互相污染）；
 * 那种情况下这些读取本来就什么都读不到，属于「未知」，由「我的」页拉资料时写入权威值。
 */
function scopedKey(base: string): string {
  return `${base}.${getApiSession().userid || 'guest'}`;
}

// ---------------- 通用到期时间 ----------------

/** 读本地已知的 VIP 到期时间；`0` = 没有可靠记录（视为过期/未知）。 */
export async function readVipEndTimeMs(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(scopedKey(VIP_END_TIME_KEY));
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (error) {
    // 读失败按「未知」处理（允许领取）：它最多导致一次领取请求，而领取本身还受
    // 「一天一次」约束，不会放大成风暴 —— 比「因为读不到就不领」更符合用户预期
    console.warn('[vip] 读取本地 VIP 到期时间失败:', error);
    return 0;
  }
}

/**
 * 记下「服务端刚回答的到期时间」。`0` 是**合法输入**：服务端明确说没有有效 VIP。
 *
 * 为什么不能忽略 0：这是一次权威回答，忽略它等于让一条过期的旧记录永远把自动领取挡住
 * （用户在官方客户端退订、或换账号时就会出现）。所以调用方只能在**真的拿到了服务端回答**
 * 时调用 —— 请求失败不是「没有 VIP」，而是「没问到」，那时绝不能写。
 */
export async function rememberVipEndTimeMs(endTimeMs: number): Promise<void> {
  try {
    const normalized = Number.isFinite(endTimeMs) && endTimeMs > 0 ? Math.floor(endTimeMs) : 0;
    await SecureStore.setItemAsync(scopedKey(VIP_END_TIME_KEY), String(normalized));
  } catch (error) {
    // 写不进去最多让下次冷启动少一条依据（退化成「未知」→ 领一次），不影响正确性
    console.warn('[vip] 记录本地 VIP 到期时间失败:', error);
  }
}

/** 本地判断是否已过期。刻意做成纯函数：策略要能被一眼看懂，也方便单独验证。 */
export function isVipExpiredLocally(endTimeMs: number, now: number = Date.now()): boolean {
  return !(endTimeMs > now);
}

// ---------------- SVIP（概念版）状态：一天一份 ----------------

export type SvipDayRecord = {
  /** 这份记录属于哪一天（设备本地日期）：不是今天就说明它已经过期，不能拿来当判断依据。 */
  day: string;
  /** 那一天「有没有概念版」。 */
  valid: boolean;
};

/**
 * 读今天这一份 SVIP 记录；不是今天的记录会被丢掉（返回 null），调用方按「未知」处理。
 *
 * 为什么按天失效而不是按到期时间戳：用户要的就是「一天一份」（见文件头）。
 * 概念版的有效期可以跨很多天，但**判断依据只需要精确到今天** —— 今天有就显示有效中、
 * 一次请求都不发；今天没有就允许走「一天一次」的领取。按天存还有个附带好处：
 * 冷启动时首帧就能把胶囊画成正确状态，不必等一次网络往返。
 */
export async function readSvipDayRecord(now: number = Date.now()): Promise<SvipDayRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(scopedKey(SVIP_DAY_KEY));
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as { day?: unknown; valid?: unknown };
    if (typeof record.day !== 'string' || record.day !== localDayKey(now)) {
      return null;
    }

    return { day: record.day, valid: record.valid === true };
  } catch (error) {
    // 读失败按「未知」处理：界面显示「查询中」并让「我的」页去查一次，
    // 比把一条坏记录当成「有效」把用户当天的领取机会堵死要好
    console.warn('[vip] 读取 SVIP 每日记录失败:', error);
    return null;
  }
}

/**
 * 写「今天这一份」SVIP 状态（**一天只留一份**：写入即覆盖，key 里不带日期，
 * 日期放在记录内部 —— 这样即使应用整天挂着跨了零点，也不会留下两份互相打架的记录）。
 *
 * 只在**有依据**时调用：权威的 `/user/vip/detail` 回答，或者刚刚升级成功。
 * 自动路径那条「每日畅听 VIP」不写它 —— 它发的不是概念版，没有资格断言 SVIP 状态。
 */
export async function rememberSvipValid(valid: boolean, now: number = Date.now()): Promise<void> {
  try {
    const record: SvipDayRecord = { day: localDayKey(now), valid };
    await SecureStore.setItemAsync(scopedKey(SVIP_DAY_KEY), JSON.stringify(record));
  } catch (error) {
    // 写不进去最多让下次冷启动多查一次状态，不影响正确性
    console.warn('[vip] 记录 SVIP 每日状态失败:', error);
  }
}
