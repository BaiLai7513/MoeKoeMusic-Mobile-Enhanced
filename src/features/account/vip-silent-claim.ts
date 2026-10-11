import * as SecureStore from 'expo-secure-store';

import { getApiSession } from '@/lib/kugou-api';

import {
  isVipExpiredLocally,
  readSvipDayRecord,
  readVipEndTimeMs,
  rememberSvipValid,
  rememberVipEndTimeMs,
} from './vip-local-state';
import { localDayKey, vipGrantExpiry } from './vip-day';
import {
  claimDailyVipSilently,
  upgradeToConceptVip,
  type VipClaimOutcome,
} from './vip-api';

/**
 * 每日畅听 VIP 的**静默领取**调度。
 *
 * ## 与官方版的区别
 *
 * | | 官方版 | 这里 |
 * |---|---|---|
 * | 触发 | 用户手动点「签到领取 VIP」 | **打开软件 / 开始播放 / 被 VIP 挡住** |
 * | 第一步 | 领 1 天畅听 VIP | 确认过期就立即领；结论不明才随机 1–5 秒 |
 * | 第二步 | 领完弹窗问「要不要升级概念版」 | **自动升级**（两步之间随机 1–5 秒，见下） |
 * | 提示 | Toast / Alert | 自动路径无 UI、仅日志（文案由调用方的回调决定） |
 *
 * ## 自动路径是两步：领畅听 VIP → （随机 1–5 秒）→ 升级概念版
 *
 * 两步各有**自己**的按天标记，都是「成功或失败都算一次」，所以：
 * - 第一步失败（风控/网络）→ **不打第二步**（服务端要求先领当天畅听 VIP，否则注定失败）；
 * - 第二步一旦发出去过，当天就不再来第二发 —— 否则「升级失败后每次开播都重试」
 *   会变成新的风控诱因。
 *
 * 为什么两步之间也要延时：紧接着领取去打升级接口是最像脚本的形状；而这一步没有
 * 「用户正在白跳歌」的紧迫性（VIP 已经能听了），所以随机 1–5 秒是纯收益。
 *
 * ## 延时策略（只有一处，见 claimDelayMs）
 *
 * | 情形 | 依据 | 延时 |
 * |---|---|---|
 * | 用户点到的歌正因缺 VIP 播不了 | 播放链路（见 claimDailyVipNow） | **0** |
 * | 本地记录明确写着「已过期」 | `moekoe.vip.endTimeMs` | **0** |
 * | 本地没有记录（刚装 / 从没拉到过资料） | — | 随机 1–5 秒 |
 *
 * 为什么不再等：随机延时的目的只是「别让请求挤在同一瞬间」。而前两种情形都意味着
 * **用户正在听歌却没有 VIP**，等下去只是让他一首接一首白跳。原先的 1–30 秒窗口更糟 ——
 * 窗口期内点到的 VIP 歌全部会被判「放不了」，用户却要等半分钟才拿到 VIP。
 *
 * 为什么第三档保留 1–5 秒：那是一种「我们并不确定要不要领」的情形（本地没有任何依据），
 * 让它带一点随机抖动没有体验代价，却能让请求不与开播那一波请求同拍。
 *
 * ## 判断依据全部在本地（不为此发请求）
 *
 * 「过期没有」= 把持久化的 `endTimeMs` 和 `Date.now()` 比一下（见 vip-local-state）。
 * 原实现为此每次开播都可能打一次 `/user/vip/detail`，请求量与收益完全不成比例。
 * 本地记录的来源见 vip-local-state 的文件头（权威值来自「我的」页拉资料，兜底值来自领取成功后的估算）。
 *
 * ## 为什么要三层节流（也就是「一天一次」这条硬上限的实现）
 *
 * 触发点从「启动一次」改成「每次开始播放」之后，这个函数一天会被调到几十次，
 * 而它打的是对节奏最敏感的领取接口，所以必须挡三层：
 *
 * 1. **同一个自然日里只尝试一次**（`attemptedDay`）：开播、切歌、暂停后恢复、
 *    锁屏切歌、被 VIP 挡住都会调进来，不挡的话请求量会放大几十倍。跨天后放开
 *    （应用整天挂后台听歌是常态，否则跨零点那一夜用户永远领不到）。
 * 2. **按天只领取一次**（`LAST_ATTEMPT_KEY`，**成功或失败都算**）：风控层面真正的护栏，
 *    也是「过期状态下一天最多 1 次领取请求」这条上界的实现。标记写在**请求之前**，
 *    所以不存在「请求发出去了却没记账」的时间洞。写不进去就不发请求。
 * 3. **跨进程复查冷却**（`LAST_CHECK_KEY`，5 分钟）：第 1 层在用户反复冷启动时失效
 *    （每次冷启动都是新进程），所以额外持久化一个时间戳。
 *
 * 注意第 3 层在去掉「查状态」之后的地位变化：它原本限制的那个请求已经不存在了，
 * 现在它只是「两次领取流程之间的最小间隔」。它**只会让领取变慢、不会让请求变多**，
 * 所以留着是安全的；要让它彻底不影响体验，删掉这一段即可 —— 这是唯一一处可以删的节流，
 * 另外两层一层都不能少。
 *
 * ## 请求上界（风控暴露面）
 *
 * | 路径 | 领取 `receive_vip_listen_song` | 升级 `upgrade_vip_reward` | 说明 |
 * |---|---|---|---|
 * | 自动（打开软件 / 开播 / 被挡住） | ≤1/天 | ≤1/天 | 一共 **≤2 次/天**；本地记录说 VIP/SVIP 还有效时是 **0 次** |
 * | 手动（SVIP 胶囊点击） | ≤1/天 | ≤1/天 | 各有一份**独立**按天标记，用户不点就不会发生 |
 * | 查状态 `/user/vip/detail` | 自动路径 **0 次** | — | 判断完全本地化 |
 *
 * 两个「独立」是刻意的：自动那一步失败时，用户当天仍然能自己点一次补上（兜底），
 * 反过来手动点过也不影响自动那一次。上界因此是「自动 2 + 手动 2」，而手动那两发
 * 只可能由用户明确点击产生 —— 定时器、每次开播都做不到这一点。
 * （「我的」页自己那次 `/user/vip/detail` 是用户主动打开页面的既有行为，与自动领取无关。）
 *
 * ## 日期口径 / 跨零点
 *
 * `localDayKey()` 用的是**设备本地时区**的自然日（与 `receive_day` 同一套日历）——
 * 用户明确要求不要改成固定 UTC+8：手机时间与服务器时间本来就是同步的，写死偏移反而会在
 * 设备时区不是东八区时引入偏差。算法与理由见 vip-day 的文件头。
 * 翻页那一瞬间单独处理，见 `runSilentVipClaim` 里「跨过零点就放弃本次」那一段。
 */

const LAST_ATTEMPT_KEY = 'moekoe.vip.lastSilentClaim';
/** 手动兜底**独立**的按天标记：手动那一次不该占用（也不该被占用）自动那一次。 */
const LAST_MANUAL_CLAIM_KEY = 'moekoe.vip.lastManualClaim';
const LAST_CHECK_KEY = 'moekoe.vip.lastSilentCheckAt';

/** 随机延时区间：1–5 秒。只用于「结论不明」那一档（见文件头的策略表）。 */
const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5_000;

/** 跨进程的最小复查间隔，见文件头第 3 条。 */
const MIN_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 本进程已经尝试过的那一天（`''` = 还没试过）。
 *
 * 为什么记的是「哪一天」而不是一个布尔：应用整天挂在后台听歌是这个 App 的常态，
 * 跨过零点后如果还拿布尔挡住自己，用户明明已经过期却整夜都等不到补领 —— 而按天标记
 * 本身就能保证「新的一天最多领一次」，所以跨天放开这一层是安全的。
 */
let attemptedDay = '';
/** 正在延时等待中，避免重复排程。 */
let pending = false;

/**
 * 随机延时期间的「提前结束等待」钩子；null = 当前没有等待中的领取。
 *
 * 只为「用户被 VIP 挡住」这条路径存在（见 `claimDailyVipNow`）：那时再干等纯属伤害体验，
 * 而收掉等待**不会让请求变多** —— 领取请求本来就一定会发出去，这里只是把同一发提前。
 *
 * 只在本地记录「过期/未知」时才可能真的等待（见 claimDelayMs），所以正常路径下它是空转的。
 * 留着它是因为**策略一旦放宽**（比如给例行复查加回抖动），被挡住的用户必须仍然能立刻领到。
 */
let skipDelay: (() => void) | null = null;

/**
 * 最近一次排程带进来的回调。
 *
 * 为什么要在模块里记一份：一个进程只允许一次尝试（第 1 层节流），所以后面几个入口
 * （被 VIP 挡住、以及第二步的升级）没有自己的调用点，必须复用排程那次带来的回调 ——
 * 否则那条路补领成功却不会 toast、不会登记状态、更不会触发播放自愈，几条路的表现就分叉了。
 */
let lastOptions: SilentVipClaimOptions | undefined;

/**
 * 读某个「按天标记」（自动领取 / 手动兜底各有一份，见两个 KEY 常量）。
 *
 * 返回 `null` = **读失败**，而不是「今天没试过」。调用方必须按最坏情况处理：
 * 读不到标记就无法保证「一天一次」这条硬上限，而同一天第二次领取请求是实打实的
 * 风控暴露（服务端虽然会回 131001，但那已经是打完的请求了）。
 */
async function readDayMarker(key: string): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(key)) ?? '';
  } catch (error) {
    console.warn('[vip] 读取领取标记失败:', key, error);
    return null;
  }
}

/**
 * 落某个「按天标记」并返回是否成功。
 *
 * 两点都是刻意的：
 * 1. **写在领取请求之前** —— 「成功或失败都算一次」要求记账先于请求；否则
 *    「请求已发出 → 进程被杀/崩溃」这一段没记账，下次冷启动会再打一次领取。
 * 2. **失败就不发请求**（由调用方处理 false）—— 写不进去意味着跨进程的「一天一次」
 *    失去了依据，宁可这一次不领（下一次还会重试），也不冒同一天重复领取的风险。
 */
async function writeDayMarker(key: string, day: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, day);
    return true;
  } catch (error) {
    console.warn('[vip] 写入领取标记失败:', key, error);
    return false;
  }
}

async function readLastCheckAt(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(LAST_CHECK_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function writeLastCheckAt(at: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_CHECK_KEY, String(at));
  } catch {
    // 写不进去只会让「两次流程之间的间隔」失效，不会漏领，也不会多领
  }
}

function randomDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/**
 * 领取前等多久（毫秒）。**这是延时策略的唯一一处**，两个入口共用，见文件头的策略表。
 *
 * @param evidence `blocked` = 用户点到的歌正因缺 VIP 播不了；`expired` = 本地记录明确已过期；
 *   `unknown` = 本地没有任何依据（刚装 / 从没拉到过资料）。
 */
function claimDelayMs(evidence: 'blocked' | 'expired' | 'unknown'): number {
  if (evidence === 'unknown') {
    // 只有「本地毫无依据」时才需要「别像脚本」的随机节奏：1–5 秒足够把领取请求从开播
    // 那一波请求（特权、直链、歌词…）里错开
    return randomDelayMs();
  }

  // 已经能确认用户「正在听歌却没有 VIP」→ 一秒都不等。
  // 防风控靠的是上面的三层节流（请求次数上界一点没变），不是让用户干等。
  return 0;
}

/** 睡满 delay；期间若 `claimDailyVipNow` 判定「用户已经被 VIP 挡住」，睡眠会被提前收掉。 */
function waitDelay(delay: number): Promise<void> {
  if (delay <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      skipDelay = null;
      resolve();
    }, delay);

    skipDelay = () => {
      clearTimeout(timer);
      skipDelay = null;
      resolve();
    };
  });
}

function rememberOptions(options?: SilentVipClaimOptions) {
  if (options) {
    lastOptions = options;
  }
}

export type SilentVipClaimOptions = {
  /**
   * 第一步（领 1 天畅听 VIP）有了结果：`claimed` = 刚领到，`already` = 今天本来就领过。
   *
   * 两种都要告诉调用方，因为它们对状态的含义相同（「今天这一步已经完成」）——
   * 只报 `claimed` 的话，服务端说「今天已领」时界面仍以为没领，用户点SVIP 胶囊就会
   * 白发一次领取请求（虽然被按天标记挡住，但那是白打的）。
   *
   * 提示文案由调用方决定：参考实现（Enhanced 移动版）成功后的文案是「概念版每日VIP领取成功」，
   * 但我们发的是 1 天畅听 VIP，文案不能照抄，否则会误导用户以为自己拿到了概念版。
   */
  onDailyStep?: (outcome: 'claimed' | 'already') => void;
  /**
   * 第二步（升级概念版）成功。
   *
   * **自动路径刻意不弹 toast**（用户只要求领取成功有提示，而每一步都弹会变成骚扰），
   * 但状态必须登记下来，否则胶囊要等到下次拉资料才会变灰 —— 中间用户会以为没成功而再点一次。
   */
  onUpgraded?: () => void;
};

/** 领取成功提示文案（集中一处，避免多个调用点写歪）。 */
export const VIP_CLAIMED_TOAST = '已自动领取 1 天畅听 VIP';

/** 第二步（升级概念版）的按天标记：**自动与手动各一份**，互不占用。 */
const UPGRADE_BUDGET_KEYS = {
  /** 自动路径（开播/打开软件/被 VIP 挡住之后跟着做的那一步）。 */
  auto: 'moekoe.vip.lastAutoUpgrade',
  /** 手动路径（SVIP 胶囊点击）。自动失败以后，用户仍然能自己补一次 —— 这是「兜底」。 */
  manual: 'moekoe.vip.lastManualUpgrade',
} as const;

/** 手动兜底的结果：比自动那套多一个 `'blocked'`（今天那次升级机会已经用掉，什么都没做）。 */
export type ManualVipClaimOutcome = VipClaimOutcome | 'blocked';

/** 第二步（升级概念版）的结果。 */
export type SvipUpgradeOutcome = VipClaimOutcome | 'blocked';

/**
 * 把当天领到的畅听 VIP 升级为概念版 —— **第二步的唯一份实现**，自动与手动两条路共用。
 *
 * ## 为什么必须有按天标记（而且成功失败都算）
 *
 * 服务端允许「今天已升级过」这种回答（`'already'`），也允许因为风控/额度而失败。
 * 没有标记的话，一次失败会让**后面每一次开播都再打一发升级请求** —— 那正是用户最担心的
 * 风控诱因（「失败后连打」最像脚本）。所以只要发出去过，今天就不再试：
 * 标记写在请求**之前**，读不到/写不进就**不发请求**（与第一步同一套规矩）。
 *
 * ## 为什么自动与手动各有一份标记
 *
 * 用户要的是「自动直接拿 SVIP，手动按钮作为兜底」。共用一份的话，自动那一步失败就等于
 * 把用户当天手动补一次的路也堵死了 —— 而手动那次是他自己点的，本来就该有独立额度。
 * 反过来手动点过也不影响自动那一次。
 *
 * ## 前置条件由调用方保证
 *
 * 服务端要求「当天先领过畅听 VIP」。自动路径是紧跟在第一步成功之后调用的；
 * 手动路径（`claimSvip`）会先确保 `dailyClaimed`。这里不再自查 —— 那需要读界面状态，
 * 而这一层刻意不依赖 UI（否则会形成 vip-claim-state ↔ vip-silent-claim 的循环依赖）。
 */
export async function attemptSvipUpgrade(scope: 'auto' | 'manual'): Promise<SvipUpgradeOutcome> {
  if (!getApiSession().token) {
    return 'not-logged-in';
  }

  const budgetKey = UPGRADE_BUDGET_KEYS[scope];
  const day = localDayKey();

  const lastUpgrade = await readDayMarker(budgetKey);
  if (lastUpgrade === null) {
    console.warn('[vip] 读不到升级标记，放弃本次升级（避免同一天重复升级）');
    return 'failed';
  }
  if (lastUpgrade === day) {
    // 今天已经升级过（或已经尝试过）：一个请求都不发
    return 'blocked';
  }

  if (!(await writeDayMarker(budgetKey, day))) {
    console.warn('[vip] 升级标记写不进去，放弃本次升级（宁可晚一次，也不重复升级）');
    return 'failed';
  }

  const outcome = await upgradeToConceptVip();
  // 如实记录：自动路径不弹 toast，日志就是唯一的痕迹
  console.log(`[vip] ${scope === 'auto' ? '自动' : '手动'}升级概念版结果:`, outcome);

  if (outcome === 'claimed' || outcome === 'already') {
    // 升级成功 = 今天有概念版 → 写「今天这一份」SVIP 记录，SVIP 胶囊立刻可以据此变灰
    await rememberSvipValid(true);
    /*
     * 概念版那条记录是**独立的一份**（实测：svip 与 tvip 同时有效、各按自己被发放的时刻
     * 起算 24 小时），而且它总是比刚领的畅听 VIP 稍晚一点。所以这里要把本地到期时间
     * 再往后推一次 —— 推成「升级那一刻 + 24h」，本地判断才与「还能听多久 = 最晚那条」
     * 的口径一致（权威值仍然由「我的」页拉资料时按 max 覆盖）。
     */
    await rememberVipEndTimeMs(vipGrantExpiry());
  }

  return outcome;
}

/**
 * 排一次静默领取检查。**可以随意重复调用** —— 内部有三层去重（见文件头），
 * 所以「每次开始播放都调一次」是安全的。
 *
 * 未登录时直接返回且**不消耗会话标记**，这样登录成功后再次开播仍能生效。
 */
export function scheduleSilentVipClaim(options?: SilentVipClaimOptions): void {
  rememberOptions(options);
  runSilentVipClaim('routine');
}

/**
 * 「用户已经被 VIP 挡住」时的即时入口（由 vip-play-claim 挂在 `onVipBlockedPlayback` 上）。
 *
 * 两种情况，**都不会让请求次数变多**：
 *
 * 1. 本次会话那一次尝试正卡在延时里 → 只把等待收掉（领取是同一发请求），新增请求数 = 0。
 * 2. 本次会话还没试过 → 走一遍同样的流程。这种情况出现在「冷启动后第一件事就是点一首
 *    VIP 歌」：播放从未开始过，`onPlaybackStart` 那条路根本没触发。三层节流照旧，
 *    所以新增请求数 = 这一次尝试本身（它本来就会被下一次开播打出去，这里只是提前）。
 *
 * 其余情况一律什么都不做（第 1 层节流已经用掉、本地记录说 VIP 还有效、今天已领、
 * 间隔还没过）—— 尤其是「VIP 有效期内却点到一首需要更高档 VIP 的歌」，
 * 那条路会直接被本地判断挡掉，一次请求都不会发。
 */
export function claimDailyVipNow(options?: SilentVipClaimOptions): void {
  rememberOptions(options);

  if (skipDelay) {
    // 走到这里可能停在第一步之前，也可能停在两步之间的那个延时上 —— 两种都是
    // 「用户现在被 VIP 挡住，别再等了」，所以文案不写具体是哪一步
    console.log('[vip] 当前曲目因缺少 VIP 无法播放，跳过延时立即继续');
    skipDelay();
    return;
  }

  runSilentVipClaim('blocked');
}

/** 本次流程是被什么叫起来的：例行开播，还是用户正被 VIP 挡住。 */
type ClaimTrigger = 'routine' | 'blocked';

/**
 * 手动兜底：用户在「我的」页点击触发的每日畅听 VIP 领取。
 *
 * ## 与自动路径的关系：共用实现，但**额度独立**
 *
 * - 独立的按天标记（`LAST_MANUAL_CLAIM_KEY`，成功失败都算）→ 手动最多 **1 次/天**。
 *   自动那一次已经用掉（哪怕它是失败的）时，手动仍然能再试一次 —— 这正是「兜底」的意义。
 * - 反过来，用户手动点过一次也不会占掉自动当天那一次。
 *
 * 所以领取请求的**总上界是 1 次/天（自动）+ 1 次/天（手动）= 最多 2 次**，而且第二次
 * 只可能由用户**明确点击**产生（不是定时器、不是每次开播都能触发的），
 * 与「自动领取一天只能一次」这条要求不冲突。
 *
 * ## 与自动路径一致的硬规矩
 *
 * 标记同样是「读失败不发、写不进不发、写在请求之前」；成功后同样把本地到期时间推到
 * 「这次发放的时刻 + 24 小时」（这样后续开播一次请求都不会再发）。
 */
export async function claimDailyVipManually(): Promise<ManualVipClaimOutcome> {
  if (!getApiSession().token) {
    return 'not-logged-in';
  }

  const day = localDayKey();

  const lastManual = await readDayMarker(LAST_MANUAL_CLAIM_KEY);
  if (lastManual === null) {
    console.warn('[vip] 读不到手动领取标记，放弃本次手动领取（避免同一天重复领取）');
    return 'failed';
  }
  if (lastManual === day) {
    // 今天的手动额度已经用掉（成功或失败都算）：直接返回，一次请求都不发
    return 'blocked';
  }

  if (!(await writeDayMarker(LAST_MANUAL_CLAIM_KEY, day))) {
    console.warn('[vip] 手动领取标记写不进去，放弃本次手动领取（宁可晚一次，也不重复领取）');
    return 'failed';
  }

  const outcome = await claimDailyVipSilently();
  console.log('[vip] 手动领取结果:', outcome);

  if (outcome === 'claimed' || outcome === 'already') {
    await rememberVipEndTimeMs(vipGrantExpiry());
  }

  return outcome;
}

/**
 * 静默领取的实际流程。
 *
 * **三层节流 + 按天标记都只在这里**，两个入口共用同一份实现 —— 这是「没有任何一条
 * 新路径能绕过任何一层节流」的结构性保证：新路径最多只能换个 `trigger` 进来。
 * `trigger` 唯一的作用就是决定延时（见 claimDelayMs），不参与任何节流判断。
 */
function runSilentVipClaim(trigger: ClaimTrigger): void {
  const today = localDayKey();

  // 同步挡在最前面：播放是高频动作，而下面读存储是异步的，
  // 光靠标记的读写在同一个 tick 里的连续调用之间挡不住。
  // 只有「同一天」才挡（见 attemptedDay 的说明），跨天后自动放开。
  if (pending || attemptedDay === today) {
    return;
  }
  if (!getApiSession().token) {
    return;
  }

  attemptedDay = today;

  void (async () => {
    try {
      const day = localDayKey();

      // ---- 判断依据：本地记录（纯本地比较，不发任何请求）----
      // 这是「VIP/SVIP 没过期就不领」的唯一判断点，两条入口都走这里，所以：
      // - 本地记录显示还有效 → 立刻退出，一次请求都不发
      // - 过期（或没有记录）→ 继续走下面的「一天一次」
      //
      // 两道闸：① 任何 VIP（畅听或概念版）的有效期；② 今天这一份 SVIP 记录。
      // 第 ② 道是用户明确要求的（「本地记录显示 SVIP 还有效 → 一次请求都不发」）：
      // 概念版有效时，日领的畅听 VIP 对它毫无意义。
      const endTimeMs = await readVipEndTimeMs();
      if (!isVipExpiredLocally(endTimeMs)) {
        // 这条日志是排查用的：没有它就无法区分「没触发」和「触发了但不需要领」
        console.log(
          `[vip] 本地记录 VIP 有效至 ${new Date(endTimeMs).toLocaleString()}，跳过静默领取`
        );
        return;
      }

      const svipRecord = await readSvipDayRecord();
      if (svipRecord?.valid) {
        console.log('[vip] 今天这一份 SVIP 记录写着有效，跳过静默领取');
        return;
      }

      // ---- 第 2 层：按天一次（成功或失败都算）----
      const lastAttempt = await readDayMarker(LAST_ATTEMPT_KEY);
      if (lastAttempt === null) {
        console.warn('[vip] 读不到领取标记，放弃本次静默领取（避免同一天重复领取）');
        return;
      }
      if (lastAttempt === day) {
        // 今天已经领过（或已尝试过），不再打扰接口
        return;
      }

      // ---- 第 3 层：两次流程之间的最小间隔 ----
      const now = Date.now();
      if (now - (await readLastCheckAt()) < MIN_RECHECK_INTERVAL_MS) {
        // 这一条只在「反复冷启动」时才生效（同进程已被第 1 层挡住）
        return;
      }
      await writeLastCheckAt(now);

      // 本地有记录且已过期 = 明确知道「用户正在听歌却没有 VIP」→ 不等；
      // 完全没有记录（刚装/从没拉到过资料）属于「说不准」→ 落到随机 1–5 秒那一档
      const delay = claimDelayMs(
        trigger === 'blocked' ? 'blocked' : endTimeMs > 0 ? 'expired' : 'unknown'
      );
      console.log(
        delay > 0
          ? `[vip] 本地记录显示已过期/没有记录，${Math.round(delay / 1000)} 秒后静默领取`
          : '[vip] 本地记录显示已过期，立即静默领取'
      );
      pending = true;
      await waitDelay(delay);

      // 跨零点：读取/延时期间可能已经翻了一天。此时领取请求带的 receive_day 是**新的一天**，
      // 而上面「今天已领过」那个判断针对的是旧的一天 —— 直接领下去就成了「旧一天那一发之后
      // 几秒钟又来一发」。两天各一次并没有超上限，但这种两连发正是风控最敏感的形状。
      // 所以放弃本次；会话标记记的是「哪一天试过」，新的一天由下一次开播自动就能再走一遍。
      if (localDayKey() !== day) {
        console.log('[vip] 领取期间跨过零点，本次放弃（新的一天由下一次开播再领）');
        return;
      }

      // 记账先于请求，且写不进去就不发（理由见 writeDayMarker）
      if (!(await writeDayMarker(LAST_ATTEMPT_KEY, day))) {
        console.warn('[vip] 领取标记写不进去，放弃本次静默领取（宁可晚一次，也不重复领取）');
        return;
      }

      const outcome = await claimDailyVipSilently();
      console.log('[vip] 静默领取结果:', outcome);

      if (outcome === 'claimed' || outcome === 'already') {
        /*
         * 「领到了」和「本来就有」都说明服务端认为此刻有有效 VIP，所以把本地到期时间
         * 推到**这次发放的时刻 + 24 小时**（实测口径，见 vip-day 的 vipGrantExpiry）：
         * 这样今天后续的所有开播都会被本地判断挡住（0 请求），也和第 2 层的按天标记互相印证。
         */
        await rememberVipEndTimeMs(vipGrantExpiry());
        // 两种结果对状态的含义一样（今天这一步完成了），所以都通知；
        // 要不要弹 toast 由调用方按结果决定（只有真领到才值得弹）
        lastOptions?.onDailyStep?.(outcome);
      }

      /*
       * ---- 第二步：自动升级为概念版（SVIP）----
       *
       * 只有第一步真的成立（领到 / 今天本来就领过）才做：服务端要求「当天先领过畅听 VIP」，
       * 否则这一发注定失败 —— 白打一次请求，还多一次风控暴露。
       *
       * 两步之间也留一个随机 1–5 秒：紧接着领取去打升级接口是最像脚本的形状。
       * 这一步不像第一步那样有「用户正在白跳歌」的紧迫性（VIP 已经能听了），
       * 所以这里的随机延时是纯收益，没有体验代价。
       */
      if (outcome === 'claimed' || outcome === 'already') {
        const gapMs = randomDelayMs();
        console.log(`[vip] ${Math.round(gapMs / 1000)} 秒后自动升级概念版（SVIP）`);
        await waitDelay(gapMs);

        // 与第一步同理：升级请求要求「今天已领过」，跨过零点后这个前提就没了，
        // 直接发只会白打一发 —— 放弃，新的一天由下一次触发把两步重走一遍
        if (localDayKey() !== day) {
          console.log('[vip] 升级前跨过零点，本次放弃自动升级（新的一天再走一遍两步）');
          return;
        }

        const upgrade = await attemptSvipUpgrade('auto');
        if (upgrade === 'claimed' || upgrade === 'already') {
          // 自动路径刻意不弹 toast（每一步都弹会变成骚扰），日志是唯一痕迹
          console.log('[vip] 已自动升级为概念版（SVIP）');
          lastOptions?.onUpgraded?.();
        }
      }
    } catch (error) {
      // 静默领取属于「锦上添花」，任何异常都不该影响主流程
      console.warn('[vip] 静默领取流程异常:', error);
    } finally {
      pending = false;
      // 流程已结束，钩子必须失效：留着会让「立即领取」去结束一个早就 resolve 的 Promise
      skipDelay = null;
    }
  })();
}
