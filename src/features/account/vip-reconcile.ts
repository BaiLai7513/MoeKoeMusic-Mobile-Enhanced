import { getApiSession } from '@/lib/kugou-api';
import { readCache, writeCache } from '@/lib/offline-cache';

import { trustedNow } from './vip-deadline';
import { vipDayKey } from './vip-day';
import {
  readReconcileRecord,
  readVipTierExpiry,
  rememberReconcileRecord,
  rememberVipStatusSnapshot,
  type VipTierExpiry,
} from './vip-local-state';
import { fetchVipStatus, type VipStatus } from './vip-api';

/**
 * 领取/升级成功之后的**二次核对（reconciliation）**：重新问一次服务端「现在到底有什么权益」。
 *
 * ## 为什么必须核对（而不是把本地状态直接改成「已生效」）
 *
 * 「请求返回成功」与「服务端的权益已经可见」是两件事：发放可能落在异步任务里、可能被风控
 * 拦在「成功但未入账」的中间态、也可能只是这次响应与随后查询之间有秒级延迟。本地若凭
 * `status === 1` 就断言「已生效」，后果是**它自己把后续判断锁死**：`svipDay` 写着有效 →
 * 当天再也不会重试 → 用户看着有 VIP 的界面却听不了歌，而且日志里什么异常都没有。
 *
 * 所以规则是硬的：**只有 `/user/vip/detail` 真的能看到这次权益，才算生效**。
 * 核对不成功就记「待核对」并打日志，绝不把本地判成已生效。
 *
 * ## 有界重试（最多 3 次，不会无限轮询）
 *
 * | 第几次 | 何时发 | 用途 |
 * |---|---|---|
 * | 1 | 立即 | 绝大多数情况应答得已经入账 |
 * | 2 | +1.5s | 发放落库/缓存刷新需要一点时间 |
 * | 3 | +4s | 最后一次机会；再没有就收手 |
 *
 * 三次之间是**有界**的：`RECONCILE_RETRY_DELAYS_MS` 就是全部计划，没有指数退避、没有循环。
 * 这条链路上最坏只多花约 5.5 秒 —— 而闹钟交接给 JS 的窗口是 45 秒（`VipClaimBridge`），
 * 留得下。
 *
 * ## 请求量上界（必须计入每日上界）
 *
 * 核对打的是 `/user/vip/detail`，属于「读」类请求，但它仍然是请求。上界分三层：
 *
 * 1. **每个发放事件最多 3 次**（见上表）；
 * 2. **一天最多 4 个发放事件**：自动领取、自动升级、手动领取、手动升级 —— 每个都有自己的
 *    按天闸门（见 vip-silent-claim），所以事件数天然有界；
 * 3. **每天最多 `MAX_RECONCILE_REQUESTS_PER_DAY` = 8 次核对请求**（按「账号 + 自然日」
 *    计数，**先记账再请求**）。这是硬上界：理论最坏 4×3 = 12 次，被它截断到 8 次。
 *
 * 典型情况远低于上界：自动领取 + 自动升级各一次就确认，共 **2 次/天**。
 * 计数与请求同一条规矩：**先记账再发**（否则一个持续失败的账号能把日上限绕过去），
 * 标记写不进去就不发请求。
 *
 * ## 核对确认后写什么
 *
 * 写服务端**真实**到期时间（`rememberVipStatusSnapshot`）：
 * - `tierExpiry`：畅听 / 概念版**各自**的到期时间；
 * - `endTimeMs`：两档取大（展示口径「还能听多久」）；
 * - `svipDay`：今天有没有概念版；
 * - 清掉「待核对」标记。
 *
 * 刻意**不**写「下次可领取时间」：那个时间戳只有 vip-deadline 能写（唯一时间基准）。
 * 尤其不能拿核对到的到期时间来当它 —— 那正是「晚上领成功、第二天整天不领」那个线上故障
 * 的形状（到期时间 ≈ 现在 + 24h，跨过了零点）。
 */

/** 三次核对的间隔（毫秒，从「现在」起算）。**全部计划都在这里**，没有别处再排重试。 */
export const RECONCILE_RETRY_DELAYS_MS = [0, 1_500, 4_000] as const;

/** 每天最多发几次核对请求（按账号 + 自然日）。见文件头的三层上界。 */
export const MAX_RECONCILE_REQUESTS_PER_DAY = 8;

/**
 * 核对计数前缀。
 */
const RECONCILE_COUNT_PREFIX = 'vipReconcile.count.';

/** 内存镜像：同一天内不必每次都去读存储（跨天/换账号时键变了会重新读）。 */
let counterKey = '';
let counterValue = 0;

function counterKeyOf(day: string): string {
  return `${RECONCILE_COUNT_PREFIX}${getApiSession().userid || 'guest'}.${day}`;
}

/**
 * 取「本次核对将是今天的第几次」并**立刻**记账。
 *
 * 读失败按 0 起算、写失败也照样把这次算进内存计数（读写在 `offline-cache` 里都是
 * 不抛错的）：宁可少一次核对，也不冒超出日上限的风险。
 *
 * 为什么先记账再请求：上限的意义是「就算每次都失败也不能无限发」。
 * 与 vip-silent-claim 的「标记写在请求之前」同一条规矩。
 */
async function nextReconcileCount(day: string): Promise<number> {
  const key = counterKeyOf(day);

  if (key !== counterKey) {
    counterKey = key;
    const stored = await readCache<number>(key);
    counterValue =
      typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  }

  counterValue += 1;
  // 写失败不退回去：本地这次仍然按「已经用过一次」走，宁可少一次核对，也不冒超出日上限的风险
  await writeCache(key, counterValue);
  return counterValue;
}

export type ReconcileKind = 'claim' | 'upgrade';

/** 核对为什么没确认。会原样进日志与「待核对」记录，便于排查。 */
export type ReconcileReason = 'confirmed' | 'no-change' | 'error' | 'budget' | 'not-logged-in';

export type ReconcileResult = {
  /** true = 服务端已经能看到这次权益（此时本地权威值已落盘）。 */
  confirmed: boolean;
  /** 实际发了几次查询。 */
  attempts: number;
  reason: ReconcileReason;
  /** 最后一次拿到的状态；一次都没成功时为 null。 */
  status: VipStatus | null;
};

/**
 * 这次权益在服务端「看得见」了吗。
 *
 * ## 两种语义必须分开（这是 `expectChange` 的作用）
 *
 * - `expectChange = true`（接口回 `claimed`）：**这次应该多出一点东西**。所以除了「现在有效」
 *   还要求到期时间确实往后走了 —— 否则很可能只是旧的、还没过期的记录被查了回来
 *   （比如上一轮领的畅听还没到期，这一次发放其实没生效）。这种「看起来有效但没变化」正是
 *   最容易被误判成成功的情形。
 * - `expectChange = false`（接口回 `already`，今天本来就领过/升过）：这次本就没有新发放，
 *   所以只要求「此刻确实有这一档权益」，不要求变化。
 *
 * `no-change` 不是错误：它代表「服务端还没看到」，交给下一轮重试，最后由调用方记「待核对」。
 */
function isGrantVisible(params: {
  kind: ReconcileKind;
  expectChange: boolean;
  baseline: VipTierExpiry;
  status: VipStatus;
  now: number;
}): boolean {
  const { kind, expectChange, baseline, status, now } = params;

  const flag = kind === 'claim' ? status.isVip : status.conceptValid;
  if (!flag) {
    return false;
  }

  /*
   * 这里读分档到期时间是**核对**用途（判断这次发放有没有让对应的那一档变长），
   * 不是调度决策：调度只看 vip-deadline 的那一个时间戳，「能不能升级」看 claimDay。
   * 所以 `svipExpiresAt` 用在这里是合适的 —— 它需要概念版那一份自己的时间线。
   */
  const current = kind === 'claim' ? status.vipExpiresAt : status.svipExpiresAt;
  const before = kind === 'claim' ? baseline.vipExpiresAt : baseline.svipExpiresAt;

  if (current <= 0) {
    /*
     * 服务端说有效、却没给这一档的到期时间（字段缺失/格式没见过）。
     *
     * `already` 只要求「现在有效」，这个回答就够；`claimed` 要求「真的变长了」，
     * 缺字段时无从判断 —— 宁可当作还没可见（重试/待核对），也不猜一个到期时间写下去。
     */
    return !expectChange;
  }

  // 到期时间已经过去 = 这条记录根本不算「此刻有效」
  if (current <= now) {
    return false;
  }

  if (!expectChange) {
    return true;
  }

  // 基线未知（从没核对过）或基线本身已经过期 → 只要现在有效，就是这次发放带来的
  return before <= 0 || before <= now || current > before;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 记一条「待核对」并打日志（不动任何权威值）。 */
async function markPending(
  kind: ReconcileKind,
  attempts: number,
  reason: ReconcileReason,
  detail: string
): Promise<void> {
  console.warn(
    `[vip] 本轮${kind === 'claim' ? '领取' : '升级'}未能核对（${reason}，${attempts} 次查询）：${detail}`
  );
  await rememberReconcileRecord({ kind, state: 'pending', attempts, reason });
}

/**
 * 核对一次「领取/升级之后权益是否真的生效」，必要时有界重试。
 *
 * 调用约定（顺序很重要）：
 * 1. 调用方在**发请求之前**抓一份 `baseline`（`readVipTierExpiry()`），再发领取/升级请求；
 * 2. 请求回 `claimed`/`already` 之后调用本函数；
 * 3. 只看返回的 `confirmed`：true 才认为「已生效」，并且本地权威值已经由本函数写好。
 *
 * @param params.kind 领取还是升级之后
 * @param params.expectChange 见 `isGrantVisible`；`claimed` 传 true，`already` 传 false
 * @param params.baseline 请求之前的基线（不传则现读，调用方应尽量传：请求之后再读会被污染）
 * @param params.sleep 重试之间怎么等。自动领取路径传 vip-silent-claim 的 `waitDelay`，
 *   这样「中途用户被 VIP 挡住」能提前把等待收掉（`claimDailyVipNow` 的既有能力）
 */
export async function reconcileVipGrant(params: {
  kind: ReconcileKind;
  expectChange: boolean;
  baseline?: VipTierExpiry;
  sleep?: (ms: number) => Promise<void>;
  now?: number;
}): Promise<ReconcileResult> {
  const { kind, expectChange } = params;
  const sleep = params.sleep ?? defaultSleep;

  if (!getApiSession().token) {
    // 未登录时 fetchVipStatus 会返回空状态，那不是「没有权益」而是「问不到」—— 直接返回，
    // 一次请求都不发，也不记待核对（登录后自然会重新走一遍）
    return { confirmed: false, attempts: 0, reason: 'not-logged-in', status: null };
  }

  // 基线：读请求之前的那一份。读不到（从没核对过）就是「两档都未知」——
  // isGrantVisible 对 `before <= 0` 的处理正是「只要现在有效就算可见」
  const baseline = params.baseline ?? (await readVipTierExpiry());
  const day = vipDayKey();

  /*
   * 上一次核对没成功时留过一条「待核对」记录（见 markPending）：那里刻意**不**把本地
   * 判成已生效，所以今天很可能仍然没有权威值。这一次核对会顺带把它一起确认掉 ——
   * 记一条日志让排查时能看出「这条时间线是从上一次没核对成功延续过来的」。
   */
  const previous = await readReconcileRecord();
  if (previous?.state === 'pending') {
    console.log(
      `[vip] 上一次（${previous.kind === 'claim' ? '领取' : '升级'}）核对仍待确认：` +
        `原因 ${previous.reason} / ${previous.attempts} 次查询，本次一并重试`
    );
  }

  let attempts = 0;
  let lastStatus: VipStatus | null = null;
  let sawError = false;

  for (const delay of RECONCILE_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay);
    }

    // 先记账再请求：记账失败时 nextReconcileCount 内部已经按「用过一次」处理，
    // 这里只关心「今天还剩不剩额度」
    const count = await nextReconcileCount(day);

    if (count > MAX_RECONCILE_REQUESTS_PER_DAY) {
      // 日上界到了：不是错误，只是今天不再为「核对」多花请求。权威值保持原样（未知就未知）
      console.warn(
        `[vip] 今天的核对请求已达上限（${MAX_RECONCILE_REQUESTS_PER_DAY} 次），本轮不再核对`
      );
      await markPending(kind, attempts, 'budget', '今天核对请求已达上限');
      return { confirmed: false, attempts, reason: 'budget', status: lastStatus };
    }

    attempts += 1;

    try {
      const status = await fetchVipStatus();
      lastStatus = status;

      if (
        isGrantVisible({
          kind,
          expectChange,
          baseline,
          status,
          now: params.now !== undefined ? params.now : trustedNow(),
        })
      ) {
        // 只有走到这里才落盘：写的是服务端返回的真实到期时间（不是「本地估算 +24h」）
        await rememberVipStatusSnapshot(status, 'reconcile');
        console.log(
          `[vip] 核对通过（第 ${attempts} 次）：${
            kind === 'claim' ? '畅听' : '概念版'
          }权益服务端已可见`
        );
        return { confirmed: true, attempts, reason: 'confirmed', status };
      }

      console.log(
        `[vip] 核对第 ${attempts} 次：服务端还没看到本次${
          kind === 'claim' ? '畅听' : '概念版'
        }权益，${
          attempts < RECONCILE_RETRY_DELAYS_MS.length ? '稍后重试' : '不再重试'
        }`
      );
    } catch (error) {
      // 查询失败 = 「没问到」，绝不等于「没有权益」：不写任何权威值，继续下一轮
      sawError = true;
      console.warn(`[vip] 核对第 ${attempts} 次查询失败:`, error);
    }
  }

  const reason: ReconcileReason = sawError && lastStatus === null ? 'error' : 'no-change';
  await markPending(
    kind,
    attempts,
    reason,
    reason === 'error' ? '查询一直失败，权益状态未确认' : '查询成功但服务端没有变化'
  );

  return { confirmed: false, attempts, reason, status: lastStatus };
}
