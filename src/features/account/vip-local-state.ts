import * as SecureStore from 'expo-secure-store';

import { getApiSession } from '@/lib/kugou-api';

import { vipDayKey } from './vip-day';

/**
 * 「本地 VIP 状态」—— **界面显示**与「服务端权威到期时间」的本地缓存。
 *
 * ## 和「下次可领取时间戳」的分工（重要）
 *
 * 自每日领取改成闹钟驱动之后，**领取判断的唯一依据**是 `vip-deadline` 里的那一个
 * 时间戳（原生 SharedPreferences，重启后也能读）。本文件里的 `endTimeMs` 退居为
 * **展示/参考**用途：
 *
 * - 「我的」页拉资料拿到的权威值仍然写这里（界面要显示还有多久）；
 * - 同一份权威值会顺手喂给 `adoptVipEndTimeFromServer`，由它决定要不要把领取时间往后推；
 * - **领取流程不再读 `endTimeMs` 来决定「要不要领」** —— 那会变成第二个时间基准，
 *   两个基准迟早会打架（一个说还有效、一个说该领了）。
 *
 * ## 为什么不再现查 `/user/vip/detail`
 *
 * 原来判断「过期没有」要现打一次 `/user/vip/detail`，而判断一天要做几十次（每次开播都触发），
 * 请求量与收益完全不成比例 —— 用户要的只是「过期了就补领一次」。到期时间本身是**已知且可
 * 持久化**的，存下来之后判断就退化成一次本地读取 + 一次数字比较，**不发任何网络请求**。
 *
 * 唯一的例外是**发放之后的那一次核对**（领取/升级成功 → 立刻重查一次，最多 3 次、日上界
 * 8 次，见 vip-reconcile）：那里花请求换的是「本地不会把没生效的权益当成已生效」。
 * 日常判断（要不要领、还能听多久）仍然一次请求都不发。
 *
 * ## 这里存了什么（key 都在同一命名空间下，便于一起排查）
 *
 * | key（末尾都会再拼上 `.<账号>`） | 内容 | 谁写 | 谁读 |
 * |---|---|---|---|
 * | `moekoe.vip.endTimeMs` | 任意 VIP 的到期毫秒数（0 = 未知/已过期） | 「我的」页拉资料或核对成功（权威） | 界面显示 |
 * | `moekoe.vip.svipDay` | `{day, valid}` —— SVIP 状态，**一天一份** | 「我的」页拉资料、核对确认 | 胶囊显示 + 自动领取的第二道闸 |
 * | `moekoe.vip.tierExpiry` | `{vipExpiresAt, svipExpiresAt, verifiedAt}` —— **两档各自**的到期时间 | 同上（只接受权威回答） | 显示 + 升级后的核对诊断（调度只看畅听那一份） |
 * | `moekoe.vip.claimDay` | `{day, outcome, scope}` —— **今天这一份领到没** | 领取接口回答 `claimed`/`already` 之后 | 升级前置条件（跨进程可用） |
 * | `moekoe.vip.nextUpgradeAt` | 下次可升级时间戳（毫秒，0 = 现在就可以） | 每次升级尝试之后 | 展示/排查 |
 * | `moekoe.vip.reconcile` | `{day, kind, state, attempts, reason}` —— **待核对**标记 | 核对流程 | 展示/排查（不影响闸门） |
 *
 * ## 「到期时间」与「今天领过没」是两个维度，不要互相推导
 *
 * 这是历史 bug 的来源：拿一个到期时间同时回答「还能听多久」和「今天要不要再领」，
 * 会出现「VIP 到明天还有效 → 今天一次都不领」，而每日额度按**自然日**重置，等于白丢一天。
 * 现在分工是硬的：
 * - **能不能听 / 到什么时候** → `endTimeMs` / `tierExpiry`（服务端权威值）；
 * - **今天还能不能领** → `svipDay` 与自动领取的按天记录（见 vip-silent-claim 的
 *   `AUTO_BUDGET_KEY`：`{day, status, notified}`，一天一次，失败时回前台提示手动领取），
 *   两者都**不看**到期时间；
 * - **今天还能不能升级** → `claimDay`（今天真的领到过）+ 升级自己的按天标记。
 *
 * ## 到期时间写什么
 *
 * 以前是「发放时刻 + 24h」的**估算**（`vipGrantExpiry`）。现在只有在**核对**
 * `/user/vip/detail` 之后才写：写的是服务端返回的真实到期时间（`tierExpiry` 分档、
 * `endTimeMs` 取最晚）。核对没成功时宁可不写 —— 见 vip-reconcile 的「待核对」。
 * 用户在官方客户端领了更长的 VIP 时，下一次「我的」页拉资料会把它纠正过来。
 */

const VIP_END_TIME_KEY = 'moekoe.vip.endTimeMs';
const SVIP_DAY_KEY = 'moekoe.vip.svipDay';
/** 两档（畅听 / 概念版）各自的到期时间。 */
const TIER_EXPIRY_KEY = 'moekoe.vip.tierExpiry';
/** 「今天这一份领到没」—— 与「有没有有效权益」是两个维度（见文件头）。 */
const CLAIM_DAY_KEY = 'moekoe.vip.claimDay';
/** 下次可升级时间（升级额度按自然日重置，所以它总是下一个自然日的校准时刻，默认 00:05）。 */
const NEXT_UPGRADE_KEY = 'moekoe.vip.nextUpgradeAt';
/** 「待核对」标记：领取/升级接口说成功，但服务端权益还没被核对确认。 */
const RECONCILE_KEY = 'moekoe.vip.reconcile';

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
    if (typeof record.day !== 'string' || record.day !== vipDayKey(now)) {
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
 * 只在**有依据**时调用：权威的 `/user/vip/detail` 回答（领取/升级之后的那次**核对**
 * 也属于这一类，见 vip-reconcile）。升级接口返回 `claimed` 本身**不算依据** ——
 * 「接口说成功」到「服务端权益真的可见」之间还有一段窗口，那正是核对要覆盖的东西。
 * 自动路径那条「每日畅听 VIP」不写它 —— 它发的不是概念版，没有资格断言 SVIP 状态。
 */
export async function rememberSvipValid(valid: boolean, now: number = Date.now()): Promise<void> {
  try {
    const record: SvipDayRecord = { day: vipDayKey(now), valid };
    await SecureStore.setItemAsync(scopedKey(SVIP_DAY_KEY), JSON.stringify(record));
  } catch (error) {
    // 写不进去最多让下次冷启动多查一次状态，不影响正确性
    console.warn('[vip] 记录 SVIP 每日状态失败:', error);
  }
}

// ---------------- 通用 JSON 记录读写 ----------------

/** 把非负毫秒值归一化；非法/缺失 → 0（「未知」）。 */
function toPositiveMs(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * 读一条 JSON 记录。读不到、坏数据、异常一律返回 null（= 未知）。
 *
 * 为什么统一走 JSON 记录而不是每个字段一个 key：这些记录都是「同一时刻的一份快照」，
 * 拆成多个 key 会出现「只写进去一半」的中间态（比如新到期时间写好了、`verifiedAt` 没写），
 * 排查时看到的时间线是错乱的。
 */
async function readJsonRecord(base: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await SecureStore.getItemAsync(scopedKey(base));
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    console.warn('[vip] 读取本地 VIP 记录失败:', base, error);
    return null;
  }
}

async function writeJsonRecord(base: string, value: Record<string, unknown>): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(scopedKey(base), JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[vip] 写入本地 VIP 记录失败:', base, error);
    return false;
  }
}

// ---------------- 分层到期时间（畅听 / 概念版各一份） ----------------

/**
 * 两档 VIP 各自的到期时间（服务端**权威值**，不是本地估算）。
 *
 * 「最晚的那个」只用于展示；**调度只认畅听那一份**（实际走 `endTimeMs` 的两档取大，
 * 与 `vipExpiresAt` 只差「领取 → 升级」那 1–5 秒，等价）。
 * `svipExpiresAt` **只用于显示与升级后的核对诊断**，不参与「能不能领 / 能不能升级」的判断：
 * 前者看按天记录，后者看「今天领过畅听 VIP」（`claimDay`），与 SVIP 有没有到期无关。
 * `verifiedAt` = 上次拿到权威回答的时刻，排查时用它区分「时间戳是旧的」与「服务端就这么答的」。
 */
export type VipTierExpiry = {
  /** 畅听（tvip）那一档的最新到期时间；0 = 未知/没有这一档的有效记录。 */
  vipExpiresAt: number;
  /** 概念版（svip）那一档的最新到期时间；0 = 未知/没有这一档的有效记录。 */
  svipExpiresAt: number;
  /** 这份值是什么时候从服务端核对的（毫秒）；0 = 从未核对过。 */
  verifiedAt: number;
};

const EMPTY_TIER_EXPIRY: VipTierExpiry = { vipExpiresAt: 0, svipExpiresAt: 0, verifiedAt: 0 };

/** 读两档到期时间。没有记录 = 两档都未知（0），**不是**「两档都过期」。 */
export async function readVipTierExpiry(): Promise<VipTierExpiry> {
  const record = await readJsonRecord(TIER_EXPIRY_KEY);
  if (!record) {
    return { ...EMPTY_TIER_EXPIRY };
  }

  return {
    vipExpiresAt: toPositiveMs(record.vipExpiresAt),
    svipExpiresAt: toPositiveMs(record.svipExpiresAt),
    verifiedAt: toPositiveMs(record.verifiedAt),
  };
}

/**
 * 写两档到期时间（合并写）。
 *
 * @param input `undefined` = 这一次没问到这一档，**保持原值**；显式 0 才是「服务端说这一档
 *   没有有效记录」。两者必须区分：把「没问到」写成 0，等于凭空断言权益消失。
 */
export async function rememberVipTierExpiry(
  input: { vipExpiresAt?: number; svipExpiresAt?: number },
  now: number = Date.now()
): Promise<void> {
  const current = await readVipTierExpiry();
  await writeJsonRecord(TIER_EXPIRY_KEY, {
    vipExpiresAt:
      input.vipExpiresAt === undefined ? current.vipExpiresAt : toPositiveMs(input.vipExpiresAt),
    svipExpiresAt:
      input.svipExpiresAt === undefined
        ? current.svipExpiresAt
        : toPositiveMs(input.svipExpiresAt),
    verifiedAt: Math.floor(now),
  });
}

// ---------------- 「今天领到没」：与「有没有有效权益」是两回事 ----------------

/**
 * 今天这一份领取记录 —— 只回答「**服务端说过今天已领**」，不回答「权益有没有生效」。
 *
 * 存在的意义（外部意见点出的那个维度）：
 * - 「今日已领取」和「当前仍有有效权益」必须是两个独立维度。用 `endTimeMs` 反推
 *   「今天领过没」在跨零点时必错：昨晚 23:52 领的到期时间是今晚 23:52，**今天**其实
 *   还没领过，而 `endTimeMs` 却是「有效」。
 * - 它也是**升级前置条件**的跨进程证据：服务端要求「当天先领过畅听 VIP」，而内存里的
 *   `dailyClaimed` 会随进程消失。这条记录落在 SecureStore 里，重启后照样读得到。
 */
export type VipClaimDayRecord = {
  /** 哪一天（设备本地自然日）。 */
  day: string;
  /** 服务端当时的回答。 */
  outcome: 'claimed' | 'already';
  /** 谁触发的（自动补领 / 用户点击），排查用。 */
  scope: 'auto' | 'manual';
  /** 记录时刻（毫秒）。 */
  at: number;
};

/**
 * 读「今天领到没」。不是今天的记录一律返回 null —— 每日额度按自然日重置，
 * 昨天的「已领」对今天的判断毫无意义。
 */
export async function readClaimDayRecord(
  now: number = Date.now()
): Promise<VipClaimDayRecord | null> {
  const record = await readJsonRecord(CLAIM_DAY_KEY);
  if (!record) {
    return null;
  }

  const day = typeof record.day === 'string' ? record.day : '';
  if (!day || day !== vipDayKey(now)) {
    return null;
  }

  return {
    day,
    outcome: record.outcome === 'claimed' ? 'claimed' : 'already',
    scope: record.scope === 'manual' ? 'manual' : 'auto',
    at: toPositiveMs(record.at),
  };
}

/**
 * 上一次**成功领取**的时刻（毫秒；0 = 没有记录）。
 *
 * 与 `readClaimDayRecord` 的区别：那个只回答「今天领没领」，跨天就返回 null；
 * 这个不看日期，直接给时间戳 —— 「下次能不能领」现在按 `上次领取 + 24h` 算，
 * 中间可能跨过好几天，所以必须能读到过期的那条记录。
 */
export async function readLastClaimAt(): Promise<number> {
  const record = await readJsonRecord(CLAIM_DAY_KEY);
  return toPositiveMs(record?.at);
}

/**
 * 记下「今天领到了」。
 *
 * 写入时机是**领取接口自己回答 `claimed`/`already` 之后**，不等核对：核对回答的是
 * 「权益生效了没」（另一个维度），而这里记的是「今天这一份额度用掉了」。
 * 两者分开之后，即使核对失败/进程被杀，重启后仍然知道今天不用再打领取请求。
 */
export async function rememberClaimDay(
  input: { outcome: 'claimed' | 'already'; scope: 'auto' | 'manual' },
  now: number = Date.now()
): Promise<void> {
  await writeJsonRecord(CLAIM_DAY_KEY, {
    day: vipDayKey(now),
    outcome: input.outcome,
    scope: input.scope,
    at: Math.floor(now),
  });
}

// ---------------- 下次可升级时间 ----------------

/**
 * 读「下次可升级时间」（毫秒；0 = 没有已知限制，现在就可以试）。
 *
 * 服务端对升级的限制只有一条：**一天一次**（打多了就是风控诱因）。所以这个值永远落在
 * 「下一个自然日的校准时刻」（默认 00:05），由升级尝试之后写入。它只是**调度/展示用的镜像** ——
 * 真正的闸门仍是按天标记（见 vip-silent-claim 的 `UPGRADE_BUDGET_KEYS`），
 * 刻意不做成第二道判断：两个都当闸门，迟早会出现「一个说能升、一个说不能」。
 */
export async function readNextUpgradeAt(): Promise<number> {
  const record = await readJsonRecord(NEXT_UPGRADE_KEY);
  return toPositiveMs(record?.at);
}

export async function rememberNextUpgradeAt(at: number): Promise<void> {
  await writeJsonRecord(NEXT_UPGRADE_KEY, { at: toPositiveMs(at) });
}

// ---------------- 「待核对」标记 ----------------

export type VipReconcileRecord = {
  /** 哪一天（设备本地自然日）：昨天的「待核对」对今天没有意义。 */
  day: string;
  /** 是领取还是升级之后的核对。 */
  kind: 'claim' | 'upgrade';
  /** `pending` = 接口说成功但服务端权益没被确认；`confirmed` = 已确认（一般不用留这条）。 */
  state: 'pending' | 'confirmed';
  /** 本次一共查了几次。 */
  attempts: number;
  /** 人读的原因：`no-change` / `error` / `budget` / `not-logged-in`。 */
  reason: string;
  /** 记录时刻（毫秒）。 */
  at: number;
};

/** 读今天的「待核对」标记；没有或不是今天的 → null。 */
export async function readReconcileRecord(
  now: number = Date.now()
): Promise<VipReconcileRecord | null> {
  const record = await readJsonRecord(RECONCILE_KEY);
  if (!record) {
    return null;
  }

  const day = typeof record.day === 'string' ? record.day : '';
  if (!day || day !== vipDayKey(now)) {
    return null;
  }

  return {
    day,
    kind: record.kind === 'upgrade' ? 'upgrade' : 'claim',
    state: record.state === 'confirmed' ? 'confirmed' : 'pending',
    attempts: Math.max(0, Math.floor(Number(record.attempts) || 0)),
    reason: typeof record.reason === 'string' ? record.reason : '',
    at: toPositiveMs(record.at),
  };
}

/** 记一条「待核对」。它**不参与任何闸门**，只用于排查与展示：本地状态不会因此被判成已生效。 */
export async function rememberReconcileRecord(
  input: Omit<VipReconcileRecord, 'day' | 'at'>,
  now: number = Date.now()
): Promise<void> {
  await writeJsonRecord(RECONCILE_KEY, {
    day: vipDayKey(now),
    kind: input.kind,
    state: input.state,
    attempts: input.attempts,
    reason: input.reason,
    at: Math.floor(now),
  });
}

/**
 * 清掉「待核对」标记 —— 只在**拿到了权威回答**时调用（核对成功，或「我的」页拉资料）。
 * 没拿到回答就清，等于把「还没核对」这件事忘掉。
 */
export async function clearReconcileRecord(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(scopedKey(RECONCILE_KEY));
  } catch (error) {
    console.warn('[vip] 清除待核对标记失败:', error);
  }
}

// ---------------- 「确认后落盘」的唯一入口 ----------------

/** 一次权威 VIP 查询的最小快照（结构上兼容 `vip-api` 的 `VipStatus`，刻意不 import 它）。 */
export type VipStatusSnapshot = {
  isVip: boolean;
  conceptValid: boolean;
  endTimeMs: number;
  vipExpiresAt: number;
  svipExpiresAt: number;
};

/** 日志用：把时间戳写成人类可读（0 = 没有这一档）。 */
function formatMs(at: number): string {
  return at > 0 ? new Date(at).toLocaleString() : '无';
}

/**
 * 上一次真正记过日志的快照。
 *
 * 「我的」页每次拉资料都会走到 `rememberVipStatusSnapshot`（打开 App、切回前台、下拉刷新…），
 * 而绝大多数时候四个值与上次一模一样。每次都打等于用同一句话把日志刷满，
 * 真正的事件（领取、升级、核对结果）反而被埋掉 —— 所以只记**变化**。
 */
let lastLoggedSnapshot = '';

/**
 * 把一次**权威**查询结果整体落盘。领取/升级后的核对、「我的」页拉资料都走这里。
 *
 * 为什么集中成一个函数：这四个值必须来自**同一次回答**。分开写的话，中间任一步失败都会
 * 留下「分档到期时间是新的、svipDay 还是旧的」这种自相矛盾的本地状态，
 * 而后续的闸门判断正是读这些值。
 *
 * @param source 来源，只影响日志（`reconcile` = 领取/升级后的核对；`profile` = 「我的」页）。
 */
export async function rememberVipStatusSnapshot(
  status: VipStatusSnapshot,
  source: 'reconcile' | 'profile'
): Promise<void> {
  await rememberVipTierExpiry({
    vipExpiresAt: status.vipExpiresAt,
    svipExpiresAt: status.svipExpiresAt,
  });
  // 展示口径：两档取大（「还能听多久」）
  await rememberVipEndTimeMs(status.endTimeMs);
  // 「今天有没有概念版」：权威回答才有资格写（见 rememberSvipValid）
  await rememberSvipValid(status.conceptValid);
  // 已经拿到权威回答，「待核对」这件事就算结了
  await clearReconcileRecord();

  const snapshotKey = `${status.vipExpiresAt}|${status.svipExpiresAt}|${status.endTimeMs}|${String(
    status.conceptValid
  )}`;
  if (snapshotKey !== lastLoggedSnapshot) {
    lastLoggedSnapshot = snapshotKey;
    console.log(
      `[vip] 已落盘权威权益（${source}）：畅听到 ${formatMs(status.vipExpiresAt)}，概念版到 ${formatMs(
        status.svipExpiresAt
      )}`
    );
  }
}

