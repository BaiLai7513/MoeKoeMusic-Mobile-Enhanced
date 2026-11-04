import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { pickNumber, pickText, toRecord } from '@/lib/api-parse';
import { adoptServerClockOffset, getServerClockOffsetMs } from '@/lib/kugou-api/server-time';

import type { VipClaimOutcome } from './vip-api';
import { nextVipDayStartMs } from './vip-day';

/**
 * 「下一次换日后的领取闹钟」—— 只负责**叫醒**，不再决定「能不能领」。
 *
 * ## 为什么把「可领取时间」这个概念去掉
 *
 * 早先这条链路的核心是一个绝对时间戳「下次可领取时间」：领取成功后算一次、存一次，
 * 闹钟、回前台、重启恢复三处都读它、跟「现在」比。问题是这个时间戳**本身就是猜的**：
 *
 * - 服务端真正的规则是「每个自然日一次」，本地却要猜「这一天从几点开始」，
 *   于是先后出现过 00:05、观测学出来的 00:28、用户手定的 04:00；
 * - 猜早了 → 服务端回 131001（今天已领）→ 用户看到「已领取今日 VIP」这种莫名其妙的提示；
 * - 猜晚了 → 00:00–04:00 这一段的额度白等一晚；
 * - 它还和用户的直觉冲突：「我上次 19:17 领的，怎么 00:28 就说今天领过了？」
 *
 * 现在「能不能领」只由**按天标记**回答（`vip-silent-claim` 的 `autoDay.day`），
 * 这个时间戳降级成纯粹的**闹钟排期**：换日之后叫醒 App 去领一次。即使闹钟是旧的、
 * 早了或晚了，也不会多领或少领 —— 标记会挡住重复，回前台兜底会补上漏掉的。
 *
 * ## 存在哪、为什么不是 SecureStore
 *
 * 存**原生 SharedPreferences**（见 `native/android/player/VipAlarmStore.kt`）：
 * `BOOT_COMPLETED` 的接收者在**没有 JS 运行时**也要读它（重启后重排闹钟），
 * 而 SecureStore 是加密存储、只有 JS 侧能解。这里存的是时间戳和开关，不敏感。
 *
 * 非 Android / 未经过原生构建（Expo Go、Web）时退回 SecureStore：此时没有闹钟，
 * 但「回前台补领」这条兜底仍然完整可用 —— 这正是「权限被拒也不能静默失效」的同一条底线。
 *
 * ## 换日点与闹钟
 *
 * 换日 = **东八区零点**（见 `vip-day`）。闹钟排在换日之后 5 分钟
 * （`CLAIM_ALARM_OFFSET_MS`），只是为了避开服务端结算的那几秒 —— 它不再是
 * 「可领取时间」，而只是一个叫醒时刻。
 *
 * 观测校准（`vip-reset-calibration`）已整份删除：换日点固定之后它没有用途。
 * 旧设备上残留的 `moekoe.vip.resetCalibration` 键不再被读写，留着不影响任何逻辑。
 *
 * ## 「现在」用哪个时间
 *
 * 一律用 `trustedNow()` = `Date.now() + 服务端时钟偏移`。偏移由 `server-time.js`
 * 从每个响应的 `Date` 头里学（领取响应本身就是一次校准样本）。这样用户把系统时间
 * 往后调一天，也不会被当成「到期了」而白打一次领取请求。
 *
 * 闹钟的准时性还有第二层保护：原生侧按 `SystemClock.elapsedRealtime()`（含深睡、
 * 不受改时间影响）记触发点，所以改时钟既不会让闹钟提前响，也不会让它提前判定到期。
 *
 * ## 周期闸门（幂等）
 *
 * 「一个周期」= 一个截止时间戳。闹钟、回前台、手动点击三条路进来都会先问
 * `beginClaimCycle(cycleId)`：
 * - 进程内用一个同步变量挡住并发（同一 tick 的连续调用也挡得住）；
 * - 跨进程用持久化记录挡住「请求发出去了、进程被杀、重启后又发一次」。
 *
 * 标记**写在请求之前**，并且不是「先查有没有领过再决定发不发」——
 * 那种写法在「查」和「发」之间有竞态，正是要避免的东西。
 */

/** 原生闹钟模块的名字（`native/android/player/VipAlarmModule.kt`）。 */
type NativeVipAlarm = {
  commitDeadline(
    deadlineMs: number,
    trustedNowMs: number,
    clearPending: boolean
  ): Promise<unknown>;
  getState(): Promise<unknown>;
  acknowledgeClaim(cycleId: string): Promise<unknown>;
};

const native: NativeVipAlarm | undefined =
  Platform.OS === 'android'
    ? (NativeModules.MoeKoeVipAlarm as NativeVipAlarm | undefined)
    : undefined;

/** 退回 SecureStore 时用的键（没有原生模块的平台上，它是唯一的存储）。 */
const FALLBACK_KEY = 'moekoe.vip.nextClaimAt';

/** 原生侧「已到期但还没领」的标记对应的 key 在 Kotlin 里；这里只是类型。 */
export type VipDeadlineState = {
  /** 下次可领取时间（毫秒时间戳）；0 = 还不知道（刚装 / 从未领过）。 */
  deadlineMs: number;
  /**
   * 还差多少毫秒到期（负数 = 已经到期）。
   *
   * 由原生按单调时钟算：用户改系统时间不会改变这个值，所以「要不要领」看它，
   * 而不是看 `deadlineMs - Date.now()`。
   */
  remainingMs: number;
  /** 到期时叫醒过、但没能完成领取（没有 JS 运行时 / 超时）：下次回前台必须补领。 */
  pending: boolean;
  /** 本轮的周期 ID（就是截止时间戳的字符串形式，没有截止时间时为空）。 */
  cycleId: string;
  /** 当前闹钟的精度档位；`off` = 没排上（只能靠回前台兜底）。 */
  alarmMode: 'exact' | 'inexact' | 'off';
  /** 是否拿到了精确闹钟权限（Android 12+；13+ 新装默认没有）。 */
  exactAllowed: boolean;
  /** 是否真的排上了闹钟（重启后、被系统清掉时为 false）。 */
  armed: boolean;
  /** 原生持久化的服务端时钟偏移（毫秒）。 */
  clockOffsetMs: number;
  /** 本次状态是否来自原生（false = 非 Android，闹钟不存在）。 */
  native: boolean;
};

const EMPTY_STATE: VipDeadlineState = {
  deadlineMs: 0,
  remainingMs: 0,
  pending: false,
  cycleId: '',
  alarmMode: 'off',
  exactAllowed: false,
  armed: false,
  clockOffsetMs: 0,
  native: false,
};

/** 「可信现在」= 设备时间 + 服务端偏移（见文件头）。 */
export function trustedNow(): number {
  return Date.now() + getServerClockOffsetMs();
}

/** 日志用：把时间戳写成人类可读，排查时不用自己心算。 */
export function formatDeadline(deadlineMs: number): string {
  return deadlineMs > 0 ? new Date(deadlineMs).toLocaleString() : '（未知）';
}

function normalizeState(raw: unknown, fromNative: boolean): VipDeadlineState {
  const record = toRecord(raw);
  const deadlineMs = Math.max(0, Math.floor(pickNumber(record.deadlineMs)));
  const rawRemaining = pickNumber(record.remainingMs);
  // 原生一定给 remainingMs；万一没给（老版本原生模块），就按「可信现在」自己算一次 ——
  // 这仍然只是「读时间戳」，不是另起一套算法
  const remainingMs =
    record.remainingMs === undefined || record.remainingMs === null
      ? deadlineMs > 0
        ? deadlineMs - trustedNow()
        : 0
      : Math.floor(rawRemaining);
  const mode = pickText(record.alarmMode);

  return {
    deadlineMs,
    remainingMs,
    pending: record.pending === true,
    cycleId: pickText(record.cycleId) || (deadlineMs > 0 ? String(deadlineMs) : ''),
    alarmMode: mode === 'exact' || mode === 'inexact' ? mode : 'off',
    exactAllowed: record.exactAllowed === true,
    armed: record.armed === true,
    clockOffsetMs: Math.floor(pickNumber(record.clockOffsetMs)),
    native: fromNative,
  };
}

async function readFallbackState(): Promise<VipDeadlineState> {
  try {
    const raw = await SecureStore.getItemAsync(FALLBACK_KEY);
    const deadlineMs = raw ? Math.max(0, Math.floor(Number(raw) || 0)) : 0;
    return {
      ...EMPTY_STATE,
      deadlineMs,
      remainingMs: deadlineMs > 0 ? deadlineMs - trustedNow() : 0,
      cycleId: deadlineMs > 0 ? String(deadlineMs) : '',
      clockOffsetMs: getServerClockOffsetMs(),
    };
  } catch (error) {
    console.warn('[vip] 读取本地领取截止时间失败:', error);
    return { ...EMPTY_STATE, clockOffsetMs: getServerClockOffsetMs() };
  }
}

async function writeFallbackDeadline(deadlineMs: number): Promise<void> {
  try {
    if (deadlineMs > 0) {
      await SecureStore.setItemAsync(FALLBACK_KEY, String(deadlineMs));
    } else {
      await SecureStore.deleteItemAsync(FALLBACK_KEY);
    }
  } catch (error) {
    console.warn('[vip] 记录本地领取截止时间失败:', error);
  }
}

/** 读当前状态（截止时间 + 待领取标记 + 闹钟档位）。失败时返回「未知」，不会抛出。 */
export async function readVipDeadlineState(): Promise<VipDeadlineState> {
  if (native) {
    try {
      const state = normalizeState(await native.getState(), true);
      // 冷启动时 JS 侧还没有任何 HTTP 样本：先用原生持久化的偏移把「可信现在」支起来。
      // 只在 JS 侧偏移还是 0 时采用 —— 已经有更新的样本就别用旧的覆盖。
      if (getServerClockOffsetMs() === 0 && state.clockOffsetMs !== 0) {
        adoptServerClockOffset(state.clockOffsetMs);
      }
      return state;
    } catch (error) {
      console.warn('[vip] 读取原生闹钟状态失败，退回本地缓存:', error);
    }
  }
  return readFallbackState();
}

/**
 * 上一次真正记过日志的（截止时间 + 说明）。同样的值重复写不再刷日志。
 *
 * 「回前台 → 重排闹钟」是**每次**切前台都会发生的动作，而截止时间通常几天都不变。
 * 不做去重的话，日志里全是同一句话（实测 7 天日志里这类行占绝大多数），
 * 真正要看的东西反而被淹没。
 */
let lastLoggedDeadlineKey = '';

function logDeadlineCommit(deadlineMs: number, detail: string): void {
  const key = `${deadlineMs}|${detail}`;
  if (key === lastLoggedDeadlineKey) {
    return;
  }
  lastLoggedDeadlineKey = key;
  console.log(`[vip] 领取闹钟已排到 ${formatDeadline(deadlineMs)}（${detail}）`);
}

/**
 * 写入「下次可领取时间戳」并让原生重排闹钟 —— **整条链路唯一写它的地方。**
 *
 * @param deadlineMs 新的截止时间（0 = 清空，不再排闹钟）
 * @param clearPending 是否顺手清掉「到期没领成」的标记。默认清：
 *   写截止时间意味着这一轮已经有结论了；而「仅同步服务端权威到期时间」那种调用
 *   不该把真正的待领取标记抹掉，所以它传 false。
 */
export async function commitVipDeadline(
  deadlineMs: number,
  clearPending = true
): Promise<VipDeadlineState> {
  const normalized = Number.isFinite(deadlineMs) && deadlineMs > 0 ? Math.floor(deadlineMs) : 0;
  const trustedNowMs = trustedNow();

  if (native) {
    try {
      const state = normalizeState(
        await native.commitDeadline(normalized, trustedNowMs, clearPending),
        true
      );
      logDeadlineCommit(normalized, `闹钟 ${state.alarmMode}`);
      return state;
    } catch (error) {
      // 原生写失败不能当作「这次领完了」：退回本地存储，至少回前台兜底仍然知道截止时间
      console.warn('[vip] 写原生闹钟状态失败，本轮只靠回前台补领:', error);
    }
  }

  await writeFallbackDeadline(normalized);
  const state = await readFallbackState();
  logDeadlineCommit(normalized, '无原生闹钟');
  return state;
}

/**
 * 用服务端权威的 VIP 到期时间延长下一次领取时间。
 *
 * 「我的」页拉资料时打的 `/user/vip/detail` 是最权威的到期时间（用户在官方客户端
 * 领了更长的 VIP 也反映在这里）。不把这条同步过来的话，本地会按「昨天领的 +24h」
 * 排闹钟，到点发现 VIP 明明还有效 → 白打一次领取请求（服务端回 131001）。
 *
 * 只延长、不缩短：缩短会让「今天已经领过、明天凌晨再试」那种排期被拉回今天，
 * 白打请求；而真正的「还没到期」判断由服务端在领取时给结论，不需要本地提前收紧。
 */
export async function adoptVipEndTimeFromServer(endTimeMs: number): Promise<void> {
  const now = trustedNow();
  if (!(endTimeMs > now)) {
    return;
  }

  /*
   * **上限：下一个本地 04:00（每日固定重置点）。**
   *
   * 服务端给出的到期时间可以比一个自然日远得多（用户在官方客户端领过周卡/月卡，
   * 或者本地估算出的「上次领取 + 24h」本来就跨了零点）。而每日领取的额度是**按自然日**
   * 重置的：把「下次可领取」推到那个到期时间，等于在「现在 → 那天」之间的每一天
   * 都白丢一次领取机会 —— 表现就是用户说的「自动领取再也没动静」。
   *
   * 只采纳「到下一个 04:00 为止」的那一段，两个目的都保住：
   * - 今天不用为一份还没到期的 VIP 白打请求（原来的目的）；
   * - 跨过 04:00 之后第二天照常领，绝不会被一个很远的到期时间永久挡住。
   */
  const target = Math.min(endTimeMs, nextDailyRetryAt(now));

  const state = await readVipDeadlineState();
  if (state.deadlineMs >= target) {
    return;
  }

  console.log(`[vip] 服务端 VIP 覆盖到 ${formatDeadline(target)}，闹钟排到那时之后`);
  // clearPending = false：只是同步展示/排期依据，不该抹掉「到期没领成」的标记
  await commitVipDeadline(target, false);
}

/** 闹钟排在换日之后的偏移：避开服务端结算的那几秒，不代表「到点才能领」。 */
const CLAIM_ALARM_OFFSET_MS = 5 * 60 * 1000;

/**
 * 下一次「换日后的领取闹钟」时刻 = 下一个东八区零点 + 5 分钟。
 *
 * 只喂给闹钟；能不能领由按天标记决定（见文件头）。
 */
export function nextDailyRetryAt(now: number = trustedNow()): number {
  return nextVipDayStartMs(now) + CLAIM_ALARM_OFFSET_MS;
}

/**
 * 失败/风控之后的重试间隔。
 *
 * **当前策略没有用它**（保留是因为它仍然是一种合理的备选）：用户明确要求「自动领取一天
 * 一次」，失败后不再自动重试，而是**回到前台时提示用户手动领取**（手动那条有独立额度、
 * 且立即发请求）。把失败也算成「今天用掉了」，才不会出现「一天里反复自动重试」的风控形状。
 *
 * 如果哪天策略改成「失败后 1 小时自动再试」，`nextFailureRetryAt` 就是现成的落点计算 ——
 * 但那时必须同时把 `vip-silent-claim` 的按天记录从「一次」放宽成「失败计数 + 领到标志」，
 * 否则退避永远走不到第二次（这正是它曾经变成死代码的原因）。
 */
export const CLAIM_FAILURE_BACKOFF_MS = 60 * 60 * 1000;

/**
 * 一天内自动领取最多失败几次（含第一次）。到顶才推到下一个自然日。
 *
 * **同样只在「失败后自动重试」那套策略下才有意义**，当前的一日一次策略用不到它。
 */
export const MAX_DAILY_CLAIM_FAILURES = 3;

/**
 * 失败后下一次重试的时刻 —— 与「成功后的下一个自然日」是**两个不同的落点**。
 *
 * 当前没有调用点（见上面常量上方的说明）；`nextClaimAtFrom` 里保留了一条保守兜底。
 *
 * @param failures 今天已经失败过几次（含刚刚这一次）
 */
export function nextFailureRetryAt(failures: number, now: number = trustedNow()): number {
  if (failures >= MAX_DAILY_CLAIM_FAILURES) {
    // 连续失败到上限：今天先停手，等额度在新的一天重置（也避免把账号推向风控）
    return nextDailyRetryAt(now);
  }
  return now + CLAIM_FAILURE_BACKOFF_MS;
}

/**
 * 领取成功/已领之后算出**新的**截止时间 —— 全项目只有这一处做这个计算。
 *
 * 优先级：
 * 1. 服务端下发的未来时间（返回体里带「下次可领取时间」时它最权威）；
 * 2. 其余情况（`claimed` / `already` 且服务端没给）→
 *    **下一个东八区 04:00**（见 `nextDailyRetryAt`）。
 *
 * `already` 与 `claimed` 在这一点上**没有区别**：服务端说今天已领就是今天这件事完成了，
 * 下一发只可能在下一个自然日。凌晨与否不影响落点 —— 「凌晨 already 可能只是撞早了 →
 * 1.5h 后再撞」那条重试链已删除（真机实测重置点 00:28、首撞即成功，它从未触发过）。
 *
 * 为什么不再用「发放时刻 + 24h」：每日额度按自然日重置，23:52 领到的额度到第二天
 * 凌晨就重新可用；用 +24h 会把第二天整天挡掉（本次线上故障）。
 *
 * 失败/风控**不走这里**：自动那条失败后就是「今天到此为止」（按天记录已经写死），
 * 失败提示会在回前台时引导用户手动领取 —— 见 vip-silent-claim 文件头。
 *
 * ## 与「二次核对」的关系（vip-reconcile）
 *
 * 领取/升级之后的那次核对**不参与**这个计算。两者回答的是不同问题：
 * - 核对：这次权益在服务端**生效了没**（答不上来就记「待核对」，不动本地权威值）；
 * - 这里：**下一次还能不能再领**（自然日口径）。
 *
 * 尤其不能拿核对到的**到期时间**来算它：到期时间 ≈ 发放时刻 + 24h，跨过零点就会把第二天
 * 的额度整天挡掉 —— 那正是「晚上领成功、第二天整天不领」这个线上故障的形状。
 */
export function nextClaimAtFrom(
  outcome: VipClaimOutcome,
  serverDeadlineMs: number,
  now: number = trustedNow()
): number {
  if (serverDeadlineMs > now) {
    return serverDeadlineMs;
  }
  if (outcome === 'claimed' || outcome === 'already') {
    return nextDailyRetryAt(now);
  }
  // 理论上调用方已经按「下一个自然日」处理了失败；留一条保守兜底
  return nextFailureRetryAt(1, now);
}

/** 周期 ID：一个截止时间就是一个周期。未知截止时间时用固定串，避免拿到空 id。 */
export function cycleIdOf(state: VipDeadlineState): string {
  return state.cycleId || (state.deadlineMs > 0 ? String(state.deadlineMs) : 'no-cycle');
}

// ---------------- 周期闸门 ----------------

const CLAIM_GATE_KEY = 'moekoe.vip.claimGate';

/**
 * 闸门的「在飞窗口」。
 *
 * 闸门记录一旦写入就代表「这一轮已经发过请求了」，正常情况下这一轮不会再被触发；
 * 但有两种情况需要允许重来：进程在请求途中被杀（记录还在、请求结果未知），
 * 或者截止时间其实没变但我们提前退出了。超过这个窗口的记录按「上一次的残留」处理。
 *
 * 这只是**补充**，不是主防线：主防线是「按天一次（成功失败都算）」的标记。
 */
const CLAIM_GATE_TTL_MS = 2 * 60 * 1000;

/** 进程内同步闸门：挡住同一 tick 里的并发（SecureStore 是异步的，读写在并发下会互穿）。 */
let claimingCycle = '';

type ClaimGateRecord = { cycleId?: unknown; at?: unknown };

/**
 * 尝试占住这一轮（返回 true = 由本次调用发起领取）。
 *
 * 这是「一次性闸门」：闹钟、回前台、手动点击、播放触发共用它。
 * **标记写在请求之前**，所以不存在「请求发出去了却没记账」的时间洞；
 * 而「先查有没有领过再决定发不发」那种写法在查与发之间有竞态，正是这里刻意避免的。
 */
export async function beginClaimCycle(cycleId: string): Promise<boolean> {
  const id = cycleId || 'no-cycle';

  if (claimingCycle === id) {
    return false;
  }
  // 同步占位：下面的读写都是异步的，两个入口同时进来时只有第一个能走到最后
  claimingCycle = id;

  const now = trustedNow();

  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(CLAIM_GATE_KEY);
  } catch (error) {
    // 读不到闸门就无法保证「同一轮只发一次」→ 宁可晚一次，也不冒重复请求的风险
    console.warn('[vip] 读取领取闸门失败，放弃本次（避免重复领取）:', error);
    claimingCycle = '';
    return false;
  }

  if (raw) {
    try {
      const record = JSON.parse(raw) as ClaimGateRecord;
      const storedId = typeof record.cycleId === 'string' ? record.cycleId : '';
      const storedAt = typeof record.at === 'number' ? record.at : 0;
      if (storedId === id && now - storedAt < CLAIM_GATE_TTL_MS) {
        console.log('[vip] 本轮已经发起过领取，跳过重复请求');
        claimingCycle = '';
        return false;
      }
    } catch {
      // 坏记录当作没写过：它最多让这一轮多一次「先记账再请求」，不会漏领
    }
  }

  try {
    await SecureStore.setItemAsync(CLAIM_GATE_KEY, JSON.stringify({ cycleId: id, at: now }));
  } catch (error) {
    console.warn('[vip] 领取闸门写不进去，放弃本次（宁可晚一次，也不重复领取）:', error);
    claimingCycle = '';
    return false;
  }

  return true;
}

/** 本轮流程结束（无论成功失败）都要放开进程内闸门；跨进程记录留着，用于下一进程判重。 */
export function endClaimCycle(cycleId: string): void {
  if (claimingCycle === (cycleId || 'no-cycle')) {
    claimingCycle = '';
  }
}

// ---------------- 闹钟叫醒 ----------------

/** 原生闹钟到期的设备事件名（与 `VipClaimBridge.EVENT_VIP_CLAIM_DUE` 保持一致）。 */
export const VIP_ALARM_DUE_EVENT = 'MoeKoeVipAlarm:due';

export type VipAlarmDuePayload = {
  cycleId: string;
  deadlineMs: number;
};

/**
 * 订阅「闹钟到点了」。
 *
 * 原生只在**到期**时发这个事件，而且它只负责叫醒：真正的领取由 JS 侧走
 * `runSilentVipClaim`（见 vip-silent-claim）—— 闹钟回调里不做任何网络请求。
 */
export function subscribeVipAlarmDue(
  listener: (payload: VipAlarmDuePayload) => void
): () => void {
  const subscription = DeviceEventEmitter.addListener(VIP_ALARM_DUE_EVENT, (payload: unknown) => {
    const record = toRecord(payload);
    listener({
      cycleId: pickText(record.cycleId),
      deadlineMs: pickNumber(record.deadlineMs),
    });
  });

  return () => subscription.remove();
}

/**
 * 告诉原生「这一轮在 JS 侧处理完了」，释放它攥着的唤醒锁和广播的 pendingResult。
 *
 * 为什么必须成对：闹钟接收者用 `goAsync()` + 唤醒锁把进程按在「广播中」的状态，
 * 好让 JS 能在后台把这一次领取跑完。JS 不回来释放的话，原生要一直等到超时
 * （45s）才放 —— 期间那个广播被视为未结束。失败路径也必须调，所以调用点在 finally 里。
 */
export async function acknowledgeAlarmHandoff(cycleId: string): Promise<void> {
  if (!native) {
    return;
  }
  try {
    await native.acknowledgeClaim(cycleId);
  } catch (error) {
    // 释放失败只会让原生多等一会儿（超时自愈），不该影响领取结果
    console.warn('[vip] 释放闹钟交接失败:', error);
  }
}
