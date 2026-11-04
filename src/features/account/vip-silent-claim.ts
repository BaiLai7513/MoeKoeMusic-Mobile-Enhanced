import * as SecureStore from 'expo-secure-store';

import { getApiSession } from '@/lib/kugou-api';

import {
  readClaimDayRecord,
  readLastClaimAt,
  readVipTierExpiry,
  rememberClaimDay,
  rememberNextUpgradeAt,
  rememberVipStatusSnapshot,
} from './vip-local-state';
import { vipDayKey } from './vip-day';
import {
  acknowledgeAlarmHandoff,
  beginClaimCycle,
  commitVipDeadline,
  cycleIdOf,
  endClaimCycle,
  formatDeadline,
  nextDailyRetryAt,
  readVipDeadlineState,
  trustedNow,
} from './vip-deadline';
import {
  claimDailyVipSilently,
  fetchVipStatus,
  upgradeToConceptVip,
  type VipClaimOutcome,
} from './vip-api';
import { reconcileVipGrant } from './vip-reconcile';

/**
 * 每日畅听 VIP 的**静默领取**调度。
 *
 * ## 与官方版的区别
 *
 * | | 官方版 | 这里 |
 * |---|---|---|
 * | 触发 | 用户手动点「签到领取 VIP」 | **闹钟到期 / 回前台 / 开始播放 / 被 VIP 挡住** |
 * | 第一步 | 领 1 天畅听 VIP | 到下次可领取时间就立即领；结论不明才随机 1–5 秒 |
 * | 第二步 | 领完弹窗问「要不要升级概念版」 | **自动升级**（两步之间随机 1–5 秒，见下） |
 * | 提示 | Toast / Alert | 自动路径无 UI、仅日志（文案由调用方的回调决定） |
 *
 * ## 五个触发点，一个入口
 *
 * 开播、被 VIP 挡住、打开 App / 回前台、闹钟到期、手动点击 —— 全部落到
 * `runSilentVipClaim`（手动那一步是 `claimDailyVipManually`，共用同一发请求与同一个
 * 周期闸门）。这是「没有任何一条新路径能绕过任何一层节流」的结构性保证：
 * 新路径最多只能换个 `trigger` 进来，而 `trigger` 只影响日志与延时，不参与任何闸门判断。
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
 * ## 状态机顺序（每一步都必须按这个次序走）
 *
 * ```
 * 查本地资格/权益 → 可领则领取 → 重新查询 → 可升级则升级 → 重新查询
 *   → 落盘 → 更新 UI → 排下一周期
 * ```
 *
 * 对应到代码：
 *
 * | 步骤 | 落在哪 |
 * |---|---|
 * | 查资格 | `readVipDeadlineState`（下次可领取）+ `readSvipDayRecord`（今天有没有 SVIP）+ 按天标记 |
 * | 领取 | `issueDailyVipClaim` → `claimDailyVipSilently` |
 * | 重新查询 | `reconcileVipGrant({kind:'claim'})` —— 最多 3 次、日上界 8 次 |
 * | 落盘（领取） | `rememberClaimDay` + 核对通过时 `rememberVipStatusSnapshot` + `commitVipDeadline` |
 * | 可升级则升级 | `attemptSvipUpgrade('auto')`（前置条件见下） |
 * | 重新查询（升级） | `reconcileVipGrant({kind:'upgrade'})` |
 * | 落盘（升级） | `rememberNextUpgradeAt` + 核对通过时 `rememberVipStatusSnapshot` |
 * | 更新 UI | `onDailyStep` / `onUpgraded`（vip-play-claim 里登记并弹提示） |
 * | 排下一周期 | `commitVipDeadline`（唯一时间基准 + AlarmManager 重排） |
 *
 * ### 「可升级」的判断依据是什么
 *
 * 服务端的硬要求只有一条：**当天先领过畅听 VIP**。本地的三段证据按可靠性排列：
 *
 * 1. **`moekoe.vip.claimDay`**（`rememberClaimDay`，SecureStore，按账号 + 自然日）——
 *    领取接口回答 `claimed`/`already` 之后立刻写。**跨进程/重启后依然可读**，这是主证据；
 * 2. 内存里的 `dailyClaimed`（vip-claim-state，落盘到「账号 + 日期」的键）= 界面态，
 *    冷启动由 `syncFromStorage` 从同一份 claimDay 记录恢复；
 * 3. 升级自己的按天标记（`UPGRADE_BUDGET_KEYS`）= 「今天那一次额度还在不在」，与
 *    「今天领没领」是**两个**判断，缺一不可。
 *
 * 所以答案是：**它不依赖「刚刚这一秒领到」这个易失的本地状态**。进程在「领到」与
 * 「标记落盘」之间被杀的最坏情况下，界面会退化成「今天还没领」→ 走一次手动领取
 * （按天标记写不进去就不发；发出去的话服务端也只会回 131001/already）→ 拿到
 * `already` 之后照样能继续升级。代价最多是一次幂等请求，不会误发升级请求。
 *
 * 反过来说，**不能**用「`vipExpiresAt` 还有效」当可升级的依据：昨天的畅听往往还有效，
 * 但服务端要的是「**今天**领过了」。这正是「有权益」与「今天已领」必须分开的原因。
 *
 * ## 延时策略
 *
 * 领取这一步**不再等待**：能走到发请求，说明「本 VIP 日还没领过」已经被按天标记确认，
 * 没有任何「说不准」可言。等下去只有两种后果 —— 用户正在听歌却没有 VIP，或者
 * 闹钟挑好的那个点被白白推后。
 *
 * 唯一的例外是**两步之间**那 1–5 秒（领取 → 升级 SVIP）：目的是别让两个请求贴在一起，
 * 而且只在**前台**才等；后台直接跳过，因为后台的 JS 定时器随时会被冻住，等下去就会
 * 把升级整条丢掉（2026-11-04 的事故：日志停在「5 秒后自动升级」，之后没有结果）。
 *
 * ## 判断依据：按天标记，不是时间戳
 *
 * 「该不该领」= 本 VIP 日（东八区零点换日，见 vip-day）的 AutoClaimDay 记录里
 * 有没有结论。早先用的是「下次可领取时间」这个绝对时间戳，问题是那个点**本地只能猜**：
 * 猜早了白打请求（服务端 131001），猜晚了整晚的额度白等，还会和用户的直觉打架
 * （「我 19:17 领的，怎么 00:28 就说今天领过了？」）。
 *
 * 时间戳现在只剩一个用途：给 AlarmManager 排**叫醒**（换日后 5 分钟，见 vip-deadline）。
 * 闹钟早了晚了都不会多领或少领 —— 标记挡住重复，回前台兜底补上漏掉的。
 *
 * ## 三道闸（「一天一次」这条硬上限的实现）
 *
 * 触发点有五个：开播、被 VIP 挡住、打开 App / 回前台、闹钟到期、手动点击。
 * 它们全部走**这一个** `runSilentVipClaim`（手动那一步见 `claimDailyVipManually`），
 * 所以下面三层谁都绕不过去：
 *
 * 1. **一次流程正在飞**（`flowInFlight`，进程内同步变量）：开播/切歌高频，而下面读存储
 *    是异步的，光靠读写在同一个 tick 里的连续调用之间挡不住。
 *    **刻意不再用「今天试过就整体挡掉」**：那条规则会让「进入时未到期、停留期间跨过 24h」
 *    的闹钟在当天被自己挡死 —— 正是这次要修的缺陷。
 * 2. **自动领取一天一次**（`AUTO_BUDGET_KEY` = `{day, status, notified}`，
 *    **成功或失败都算**）：风控层面真正的护栏。记录写在**请求之前**
 *    （`status:'attempted'`），所以不存在「请求发出去了却没记账」的时间洞；
 *    写不进去就不发请求。它同时是**失败提醒**的载体（见下）。
 *
 *    这里**没有例外**：`already`（服务端说今天已领）也是结论 —— 今天这件事完成了，
 *    下一发只可能在下一个 VIP 日（东八区 04:00，见 vip-day）。
 *    以前这里有一条「凌晨 already 可能只是撞早了 → 每 1.5h 再撞一次、最多 5 发」的探测链；
 *    真机实测重置点 00:28、第一发就成功，那条链从未触发过，已整体删除。
 * 3. **周期闸门**（`vip-deadline` 的 `beginClaimCycle`）：同一个截止时间只允许发出一发请求。
 *    闹钟与 onResume 同时被触发时，靠它保证只有一个真的发出去 —— 而且它是
 *    「先记账再请求」，不是「先查有没有领过再决定发不发」（后者在查与发之间有竞态）。
 *
 * 另有一个「跨进程复查冷却」（`LAST_CHECK_KEY`，5 分钟）：它只在「连截止时间都还没有」
 * （刚装、或上一次请求失败到没来得及记账）时才可能生效，只会让领取变慢、不会让请求变多。
 * 要让它彻底不影响体验，删掉这一段即可 —— 另外三层一层都不能少。
 *
 * ## 失败之后：**回前台提示用户手动领取**（不是自动重试）
 *
 * 自动那条一天只有一次，失败也把今天那一次用掉，所以「等它自己重试」是靠不住的。
 * 但也不能就此静默一整天 —— 用户听到的会是「歌一直被跳」，而他并不知道还能自己点一下。
 *
 * 所以失败时把 `status` 写成 `failed`/`risk`（`notified: false`），然后在**进入前台**时
 * 由 vip-play-claim 取一次提醒（`takeAutoClaimFailureReminder`，取到即置 `notified`）：
 * - 失败发生在后台（闹钟在凌晨那种）→ 只落状态，不打扰；用户下次打开 App 时提示；
 * - 失败发生在前台（用户正被 VIP 挡住）→ 立刻提示；
 * - **一天只提示一次**：同一个提示反复弹只会变成噪声。
 *
 * 提示指向的「手动领取」（`claimDailyVipManually`）有**独立**的按天额度，而且**不等待**：
 * 不看截止时间、不走随机延时、也不受任何退避影响 —— 用户点一下就是现在发请求。
 *
 * ## 请求上界（风控暴露面）
 *
 * | 路径 | 领取 `receive_vip_listen_song` | 升级 `upgrade_vip_reward` | 说明 |
 * |---|---|---|---|
 * | 自动（开播 / 被挡住 / 回前台 / 闹钟到期） | ≤1/天 | ≤1/天 | 一天一次，成功或失败都算 |
 * | 手动（SVIP 胶囊点击） | ≤1/天 | ≤1/天 | 各有一份**独立**按天标记，用户不点就不会发生 |
 * | 查状态 `/user/vip/detail`（**核对**） | 不发放就 **0 次** | 每次发放 ≤3 次查询、**一天 ≤8 次/账号** | 见 vip-reconcile；先记账再请求 |
 *
 * 上界合计（最坏一天，含手动）：领取 1 + 1 = **2**，升级 1 + 1 = **2**，核对 **8**
 * —— 共 **12 次**。正常一天仍是 2~4 次（领取 1 + 升级 1 + 各自一次核对就确认）。
 *
 * 两个「独立」是刻意的：自动那一步失败时，用户当天仍然能自己点一次补上（兜底 ——
 * 这也正是失败提示要引导的动作），反过来手动点过也不影响自动那一次。手动那两发
 * 只可能由用户明确点击产生 —— 定时器、每次开播都做不到这一点。
 * （「我的」页自己那次 `/user/vip/detail` 是用户主动打开页面的既有行为，与自动领取无关。）
 *
 * **核对**是新增的第三类请求，但也在上界内：只有「真的发了领取/升级请求且接口说成功」
 * 才会核对，每次最多 3 次查询、一天最多 8 次（按账号 + 自然日计数，先记账再请求）。
 * 没发放的那一天一次都不发。
 *
 * ## 日期口径 / 跨零点
 *
 * `vipDayKey()` 用的是**设备本地时区**的自然日（与 `receive_day` 同一套日历）——
 * 用户明确要求不要改成固定 UTC+8：手机时间与服务器时间本来就是同步的，写死偏移反而会在
 * 设备时区不是东八区时引入偏差。算法与理由见 vip-day 的文件头。
 * 翻页那一瞬间单独处理，见 `runSilentVipClaim` 里「跨过零点就放弃本次」那一段。
 */

/**
 * 自动领取的**按天状态**（JSON：`{day, status, notified}`）。
 *
 * 规则是硬的：**一天一次**（成功或失败都算一次），所以这个记录既是闸门、也是失败提醒的载体。
 *
 * - `status`：`attempted`（请求已发出、结果未知，进程中途被杀就会停在这里）/
 *   `claimed`、`already`（今天这件事成了）/ `failed`、`risk`（失败，需要提示用户手动领）。
 *   **请求之前**就写 `attempted`，所以「请求发出去了却没记账」这个时间洞不存在。
 * - `notified`：失败提醒（「请手动领取」）是否已经弹过。弹过就置真，避免每次切前台都弹。
 *
 * 旧版本这个 key 存过两种格式：**一个日期字符串**（"1 次/天"的标记），以及带
 * 「凌晨重试中」临时状态与计数/服务端排期字段的记录。前者按
 * `{day, status:'claimed', notified:true}` 处理，后者按 `already` 处理 —— 两者都是
 * 「那天这件事已经有过结论」，最坏只是当天不再自动领，绝不会多发一次请求。
 */
const AUTO_BUDGET_KEY = 'moekoe.vip.lastSilentClaim';
/** 手动兜底**独立**的按天标记：手动那一次不该占用（也不该被占用）自动那一次。 */
const LAST_MANUAL_CLAIM_KEY = 'moekoe.vip.lastManualClaim';
const LAST_CHECK_KEY = 'moekoe.vip.lastSilentCheckAt';

/** 跨进程的最小复查间隔，见文件头最后一段。 */
const MIN_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 两次领取之间的最短间隔：**24 小时整**。
 *
 * 依据用户的口径「上次领取满 24 小时才领下一次」，也是唯一在两种服务端规则下都成立的口径：
 * - 服务端若按「每日重置」，每天同一时刻领 = 24h 续上，VIP 连续不断档，没有损失；
 * - 服务端若按「24 小时冷却」，这正是它要的间隔。
 *
 * 用它取代原来那个「本地猜出来的换日时刻」（01:00 / 00:28 / 04:00）——猜错了要么白打
 * 请求（131001），要么整天白等。
 */
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** SVIP 到期前的余量：到期前 5 分钟内就当作「已经过期」，直接领下一份。 */
const SVIP_ALIVE_MARGIN_MS = 5 * 60 * 1000;

/**
 * 是否有一次领取流程正在飞（进程内、同步）。
 *
 * 这是原来 `attemptedDay` 的替代品。旧变量记的是「本进程哪一天试过」，它的副作用是：
 * 今天第一次开播就把当天那次「尝试」用掉了，之后哪怕闹钟在截止时刻叫醒也不会再领。
 * 现在「要不要领」完全由截止时间决定，进程内只需要挡住**并发**这一件事。
 */
let flowInFlight = false;

/**
 * 最近一次领取流程的 Promise。
 *
 * headless 任务（`headless-claim.ts`）跑完必须**等这次流程真的结束**再返回：
 * headless 的 JS 运行时是原生为这一发临时拉起来的，任务一返回进程就可能被回收，
 * 那时请求还没发出去 —— 等于白拉一次。
 */
/** 升级请求是否在飞（进程内）：挡住「冷启动 + 回前台」同一秒的两道入口重复升级。 */
let upgradeInFlight = false;

let lastFlow: Promise<void> | null = null;

/** 等当前/最近一次领取流程结束（没有流程时立刻返回）。 */
export async function waitForSilentVipClaim(timeoutMs = 75_000): Promise<void> {
  const flow = lastFlow;
  if (!flow) {
    return;
  }
  await Promise.race([flow, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * 随机延时期间的「提前结束等待」钩子；null = 当前没有等待中的领取。
 *
 * 只为「用户被 VIP 挡住」这条路径存在（见 `claimDailyVipNow`）：那时再干等纯属伤害体验，
 * 而收掉等待**不会让请求变多** —— 领取请求本来就一定会发出去，这里只是把同一发提前。
 *
 * 现在各触发源都不再按时间戳等待，所以正常路径下它是空转的。
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

// ---------------- 自动领取的按天状态（一天一次 + 失败提醒） ----------------

/** 自动领取当天走到了哪一步，见 `AUTO_BUDGET_KEY` 的说明。 */
type AutoClaimStatus =
  /** 请求已经发出、结果未知（进程中途被杀会停在这里：不提示、也不重试）。 */
  | 'attempted'
  /** 领到了 / 服务端说今天已领 —— 今天这件事成了。 */
  | 'claimed'
  | 'already'
  /** 失败 / 风控 —— 今天不再自动试，回前台时提醒用户手动领。 */
  | 'failed'
  | 'risk';

type AutoClaimDayRecord = {
  /** 属于哪一天（设备本地自然日）。 */
  day: string;
  status: AutoClaimStatus;
  /** 失败提醒是否已经弹过（一天只弹一次）。 */
  notified: boolean;
};

/**
 * 解析自动领取记录；**旧格式（一个日期串 / 凌晨重试记录）一律按「今天已经领过」处理**。
 *
 * 旧标记是在请求**之前**写的（成功失败都算），那天到底领没领到无从知道：
 * 当成「领过了、也不用提醒」= 与升级前的行为一模一样；当成「失败」则可能凭空弹一次
 * 「请手动领取」并让当天多打一次请求 —— 两种都不是升级当天该出现的变化。
 *
 * 旧记录里的「凌晨重试中」临时状态同理按 `already` 读：那条重试链已经删掉，而那天
 * 服务端确实回过「今天已领」，当成「今天这件事已经有过结论」最安全。旧记录里还带着
 * 当时的重试计数与服务端排期字段，这里直接忽略（不迁移、不删除，留着对排查没有坏处）。
 */
function parseAutoClaimDay(raw: string): AutoClaimDayRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as {
        day?: unknown;
        status?: unknown;
        notified?: unknown;
      };
      if (typeof record.day === 'string' && record.day) {
        const status: AutoClaimStatus =
          record.status === 'attempted' ||
          record.status === 'claimed' ||
          record.status === 'already' ||
          record.status === 'failed' ||
          record.status === 'risk'
            ? record.status
            : // 旧版的临时状态与任何没见过的值：那天的结论已经不明，
              // 但它唯一走过的分支就是「服务端说今天已领」，按 already 读最安全
              'already';
        return {
          day: record.day,
          status,
          notified: record.notified === true,
        };
      }
      return null;
    }
  } catch {
    // 不是 JSON → 落到下面的旧格式
  }

  // 旧格式：值本身就是日期串。按「那天已经领过、不提醒」对待（见函数说明）
  return { day: raw, status: 'claimed', notified: true };
}

/** 读自动领取记录；`null` = **读失败**（调用方必须按最坏情况处理，不能当成「今天没试过」）。 */
async function readAutoClaimDay(): Promise<AutoClaimDayRecord | null> {
  try {
    return parseAutoClaimDay((await SecureStore.getItemAsync(AUTO_BUDGET_KEY)) ?? '');
  } catch (error) {
    console.warn('[vip] 读取自动领取记录失败，放弃本次领取（避免同一天重复领取）:', error);
    return null;
  }
}

/** 写自动领取记录；失败返回 false（调用方据此**不发请求**）。 */
async function writeAutoClaimDay(record: AutoClaimDayRecord): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(AUTO_BUDGET_KEY, JSON.stringify(record));
    return true;
  } catch (error) {
    console.warn('[vip] 写入自动领取记录失败:', error);
    return false;
  }
}

/**
 * 取「今天自动领取失败过、还没提示过用户」这条提醒；取到时顺手把 `notified` 置真。
 *
 * 返回文案而不是自己弹 Toast：这一层刻意不依赖任何 UI（否则会形成
 * vip-claim-state ↔ vip-silent-claim 的循环依赖）。弹不弹、什么时候弹由界面层决定
 * （见 vip-play-claim 的前台兜底）。
 *
 * 为什么一天只提示一次：自动领取本来就是一天一次；每次切前台都弹同一个提示，
 * 用户很快就会把它当噪声，那这个提醒就白做了。
 */
export async function takeAutoClaimFailureReminder(): Promise<string | null> {
  const record = await readAutoClaimDay();
  if (!record || record.notified) {
    return null;
  }
  if (record.day !== vipDayKey()) {
    return null;
  }
  if (record.status !== 'failed' && record.status !== 'risk') {
    return null;
  }

  await writeAutoClaimDay({ ...record, notified: true });
  return VIP_MANUAL_CLAIM_HINT_TOAST;
}

/**
 * 手动补领**成功**之后，把自动那条「失败待提示」结掉。
 *
 * 否则用户手动领到了，回前台还会被提示「请手动领取一次」—— 那条提示显然已经过时，
 * 而且会让人怀疑「我到底领到没有」。只动 `notified`，不改 `status`：
 * status 是自动那条自己的历史，改了会让排查时的时间线失真。
 */
async function settleAutoFailureAfterManual(day: string): Promise<void> {
  const record = await readAutoClaimDay();
  if (!record || record.day !== day || record.notified) {
    return;
  }
  if (record.status !== 'failed' && record.status !== 'risk') {
    return;
  }

  await writeAutoClaimDay({ ...record, notified: true });
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
   * 第一步**失败**（风控 / 网络）。
   *
   * 以前自动路径失败只写日志：用户看到的是「歌被跳了、VIP 还是没到，而且不知道为什么」。
   * 而自动那条是**一天一次**，失败了今天就不会再自动试 —— 用户唯一能自救的动作是
   * **手动领取**（独立额度、立即发请求，见 `claimDailyVipManually`）。
   * 所以这里必须把「去手动领一次」这个信息送到用户面前。
   *
   * 弹不弹、怎么弹由调用方决定，与 `onDailyStep` 同一个规矩（后台不弹，回前台再补）。
   */
  onDailyFailed?: (outcome: 'risk' | 'failed') => void;
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

/**
 * 自动领取**失败**后的提示文案：让用户去手动领一次。
 *
 * 为什么必须有它：自动那条是「一天一次」，失败了当天就不会再自动试；而音乐还在被跳。
 * 用户唯一能自救的动作就是手动领（`claimDailyVipManually`，独立额度、立即发请求）。
 * 不提示的话，他只会以为这条链路又坏了 —— 上次「自动领取失效」的抱怨就是这么来的。
 */
export const VIP_MANUAL_CLAIM_HINT_TOAST = '今天的自动领取没成功，请点「我的」页 SVIP 手动领取一次';

/** 第二步（升级概念版）的按天标记：**自动与手动各一份**，互不占用。 */
const UPGRADE_BUDGET_KEYS = {
  /** 自动路径（开播/打开软件/被 VIP 挡住之后跟着做的那一步）。 */
  auto: 'moekoe.vip.lastAutoUpgrade',
  /** 手动路径（SVIP 胶囊点击）。自动失败以后，用户仍然能自己补一次 —— 这是「兜底」。 */
  manual: 'moekoe.vip.lastManualUpgrade',
} as const;

/**
 * 手动兜底的结果：比自动那套多一个「什么都没做」的结论 ——
 * `'blocked'` = 今天的手动额度已经用掉（一次请求都没发）。
 *
 * 凌晨**不再有**单独的结论：服务端回 `already` 就是「今天确实领过」，
 * 与自动那条一样写 claimDay、一样把截止时间排到下一个自然日。
 */
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
  const day = vipDayKey();

  const lastUpgrade = await readDayMarker(budgetKey);
  if (lastUpgrade === null) {
    console.warn('[vip] 读不到升级标记，放弃本次升级（避免同一天重复升级）');
    return 'failed';
  }
  if (lastUpgrade === day) {
    // 今天已经升级过（或已经尝试过）：一个请求都不发。
    // 顺手把「下次可升级时间」对齐 —— 它只是展示/调度用的镜像，闸门仍然是这条按天标记
    await rememberNextUpgradeAt(nextDailyRetryAt());
    return 'blocked';
  }

  /*
   * 标记移到**请求之后**写（见下面 `writeDayMarker`）。
   *
   * 原来写在请求之前，是为了「宁可少升一次，也不重复升级」。代价是：进程在请求途中被杀时，
   * 标记已经写了、结果却未知，`resumeAutoUpgrade` 看到标记就再也不补 —— 这一天的 SVIP
   * 就真的丢了（2026-11-04 那次就是这样）。
   *
   * 现在反过来：请求回不来就没有标记，下次回前台会再试一次。重复的概率极低（需要两次
   * 触发撞在同一个 1 秒窗口里），而服务端对重复升级本来就回 `already`，比丢一整天划算。
   */

  /*
   * 基线要在**发请求之前**读：核对要判断的是「这次发放有没有让概念版变长」。
   * 请求之后再读，读到的就已经是新值了 —— 那样「没有变化」永远判不出来。
   */
  const baseline = await readVipTierExpiry();

  const outcome = await upgradeToConceptVip();
  // 请求有结果了才落标记：没有标记 = 「结果未知」，回前台会补做（见上面的说明）
  if (!(await writeDayMarker(budgetKey, day))) {
    console.warn('[vip] 升级标记写不进去（下次可能重复升级一次）');
  }
  // 如实记录：自动路径不弹 toast，日志就是唯一的痕迹
  console.log(`[vip] ${scope === 'auto' ? '自动' : '手动'}升级概念版结果:`, outcome);

  // 今天的升级额度已经用掉（成功、失败都算）→ 落「下次可升级时间」
  await rememberNextUpgradeAt(nextDailyRetryAt());

  if (outcome === 'claimed' || outcome === 'already') {
    /*
     * ---- 重新查询（核对）----
     *
     * 接口说升级成功，不等于服务端权益已经可见。这里必须再问一次 `/user/vip/detail`：
     * 核对通过才算「已生效」，并且由 `rememberVipStatusSnapshot` 写入**服务端返回的真实
     * 到期时间**（畅听/概念版各一份）。
     *
     * 以前这里写的是 `vipGrantExpiry()`（按「升级那一刻 + 24h」估算）与
     * `rememberSvipValid(true)` —— 那正是「只信接口、不信服务端状态」的写法：
     * 一旦这次升级其实没入账，本地就会带着一份假的「有效」记录过一整天。
     *
     * 核对失败（查询报错 / 多次无变化）时只留「待核对」记录并打日志：本地不会因此判成
     * 已生效，「我的」页下一次拉资料会把它纠正过来。
     */
    const reconcile = await reconcileVipGrant({
      kind: 'upgrade',
      // claimed = 这次应该多出一份概念版；already = 今天本来就有，只核对「此刻有效」
      expectChange: outcome === 'claimed',
      baseline,
      // 复用领取链路的等待器：中途用户被 VIP 挡住时能提前收掉等待（不会多发请求）
      sleep: waitDelay,
    });

    console.log(
      `[vip] 升级后核对：${reconcile.confirmed ? '已确认生效' : `待核对（${reconcile.reason}）`}`
    );
  }

  return outcome;
}

/**
 * 排一次静默领取检查。**可以随意重复调用** —— 内部有闸门（见文件头），
 * 所以「每次开始播放都调一次」是安全的。
 *
 * 返回 `true` = 真的启动了一次领取流程；`false` = 已有流程在飞 / 未登录 /
 * 用户正被挡住时的「只是结束等待」。调用方通常不需要关心这个值。
 *
 * 未登录时直接返回且**不消耗任何标记**，这样登录成功后再次开播仍能生效。
 */
export function scheduleSilentVipClaim(options?: SilentVipClaimOptions): boolean {
  rememberOptions(options);
  return runSilentVipClaim('routine');
}

/**
 * 回前台兜底入口（由 vip-play-claim 挂在 `AppState` 的 active 上）。
 *
 * 与闹钟/开播走**同一个** `runSilentVipClaim`，只是日志标签不同。
 * 它存在的意义是覆盖「闹钟没响成」的所有情况：精确闹钟权限被拒、国产 ROM 清理闹钟、
 * 重启后恢复失败、用户从最近任务里划掉再打开。
 */
export function resumeSilentVipClaim(options?: SilentVipClaimOptions): boolean {
  rememberOptions(options);
  return runSilentVipClaim('resume');
}

/**
 * 闹钟到期入口（由 `VipAlarmReceiver` → 设备事件 → vip-play-claim 调进来）。
 *
 * 原生只负责「准时叫醒 + 把进程按住一会儿」，真正发请求的是这里 ——
 * 和别的触发源共用同一套闸门，所以闹钟与 onResume 同时被触发也不会发两发请求。
 */
export function alarmSilentVipClaim(options?: SilentVipClaimOptions): boolean {
  rememberOptions(options);
  return runSilentVipClaim('alarm');
}

/**
 * 「用户已经被 VIP 挡住」时的即时入口（由 vip-play-claim 挂在 `onVipBlockedPlayback` 上）。
 *
 * 两种情况，**都不会让请求次数变多**：
 *
 * 1. 本次流程正卡在延时里 → 只把等待收掉（领取是同一发请求），新增请求数 = 0。
 * 2. 还没试过 → 走一遍同样的流程。这种情况出现在「冷启动后第一件事就是点一首 VIP 歌」：
 *    播放从未开始过，`onPlaybackStart` 那条路根本没触发。闸门照旧。
 *
 * 其余情况一律什么都不做（未到下次可领取时间、今天已领、间隔还没过）——
 * 尤其是「VIP 有效期内却点到一首需要更高档 VIP 的歌」，那条路会被截止时间挡掉，
 * 一次请求都不会发。
 */
export function claimDailyVipNow(options?: SilentVipClaimOptions): boolean {
  rememberOptions(options);

  if (skipDelay) {
    // 走到这里可能停在第一步之前，也可能停在两步之间的那个延时上 —— 两种都是
    // 「用户现在被 VIP 挡住，别再等了」，所以文案不写具体是哪一步
    console.log('[vip] 当前曲目因缺少 VIP 无法播放，跳过延时立即继续');
    skipDelay();
    return false;
  }

  return runSilentVipClaim('blocked');
}

/** 本次流程是被什么叫起来的：只影响日志与延时策略，不参与任何闸门判断。 */
type ClaimTrigger = 'routine' | 'blocked' | 'alarm' | 'resume';

/**
 * 手动兜底：用户在「我的」页点击触发的每日畅听 VIP 领取。
 *
 * ## 与自动路径的关系：共用「实发请求」，但**额度独立**
 *
 * - 独立的按天标记（`LAST_MANUAL_CLAIM_KEY`，成功失败都算）→ 手动最多 **1 次/天**。
 *   自动那一次已经用掉（哪怕它是失败的）时，手动仍然能再试一次 —— 这正是「兜底」的意义。
 * - 反过来，用户手动点过一次也不会占掉自动当天那一次。
 *
 * 所以领取请求的**总上界是 1 次/天（自动）+ 1 次/天（手动）= 最多 2 次**，而且第二次
 * 只可能由用户**明确点击**产生（不是定时器、不是每次开播都能触发的），
 * 与「自动领取一天只能一次」这条要求不冲突。
 *
 * ## 与自动路径共用的是「发起请求」这一层
 *
 * 实际发请求、周期闸门、「标记先于请求」、成功后的截止时间落盘，全部收在
 * `issueDailyVipClaim` 一个函数里（见它上面的说明）—— 自动与手动**只有前置检查不同**，
 * 不存在第二条实现。自动那一发正在飞的时候用户又点了胶囊，这里会直接返回 `blocked`
 * （不弹提示、不发请求）。
 */
export async function claimDailyVipManually(): Promise<ManualVipClaimOutcome> {
  if (!getApiSession().token) {
    return 'not-logged-in';
  }

  /*
   * 手动路径**刻意不等任何东西**，这是它与自动路径唯一的行为差异：
   *
   * - **不看「下次可领取时间」**：那个时间戳是自动那条的排期（成功后是下一个自然日
   *   的校准时刻，默认 00:05；失败后同样是下一个自然日 —— 自动那条一天只有一次）。
   *   用户手动点胶囊就是要「现在试一次」，被那个排期挡住的话他会以为按钮坏了；
   *   而手动额度本来就是独立的一份（≤1 次/天），不该被自动那条用没用过影响。
   * - **不调 `waitDelay`**：犹豫与随机节奏只属于自动路径，用户点一下就是现在发。
   *
   * 换句话说：自动那条今天已经试过（哪怕刚失败）、截止时间已经推到明天，用户点胶囊
   * **立刻**就会发请求。失败提示要他做的正是这件事（见 `VIP_MANUAL_CLAIM_HINT_TOAST`）。
   *
   * 凌晨点击**也没有任何特殊分支**：服务端回 `already` 就是「今天确实领过」——
   * 与自动那条一样写 claimDay、一样把截止时间排到下一个自然日（按校准偏移）。
   * 以前这里会把凌晨的 already 交回探测链继续撞；那条链在真机实测（重置点 00:28、
   * 首撞即成功）后已删除。
   */
  const day = vipDayKey();
  const state = await readVipDeadlineState();
  const cycleId = cycleIdOf(state);

  const lastManual = await readDayMarker(LAST_MANUAL_CLAIM_KEY);
  if (lastManual === null) {
    console.warn('[vip] 读不到手动领取标记，放弃本次手动领取（避免同一天重复领取）');
    return 'failed';
  }
  if (lastManual === day) {
    // 今天的手动额度已经用掉（成功或失败都算）：直接返回，一次请求都不发
    return 'blocked';
  }

  const attempt = await issueDailyVipClaim({
    scope: 'manual',
    cycleId,
    day,
  });

  if (attempt.kind === 'blocked') {
    // 同一轮已经有请求发出去了（自动那一路正在飞）：什么都不做
    return 'blocked';
  }
  if (attempt.kind === 'marker-failed') {
    // 标记写不进去 = 无法保证「一天一次」，按失败提示用户
    return 'failed';
  }

  // 手动那一发也可能是被闹钟叫醒之后点的：把交接释放掉，别让原生空等到超时
  await acknowledgeAlarmHandoff(cycleId);

  return attempt.result.outcome;
}

/** 一次「发起领取」的结果。`blocked` / `marker-failed` 都表示**没有真发出去**。 */
type DailyClaimAttempt =
  | { kind: 'issued'; result: Awaited<ReturnType<typeof claimDailyVipSilently>> }
  | { kind: 'blocked' }
  | { kind: 'marker-failed' };

/**
 * **真正发起领取请求的唯一实现** —— 自动路径与手动路径共用。
 *
 * 这里负责的是「一旦决定要发，就只发一发、且记账先于请求」：
 *
 * 1. 周期闸门：同一个截止时间只允许一发请求（闹钟与 onResume 同时被触发时靠它去重）；
 * 2. 记账（写在请求之前）：自动路径落 `{day, status:'attempted'}`，手动路径落「今天那次
 *    手动机会用掉了」；写不进去就不发（宁可晚一次，也不冒重复领取的风险）；
 * 3. 请求 → 记「今天领到没」（`rememberClaimDay`，与「权益有没有生效」是两个维度）→
 *    **重新查询核对**（`reconcileVipGrant`，最多 3 次、日上界 8 次）→ 用 `nextClaimAtFrom`
 *    在**一处**算出新的截止时间并落盘（成功/已领/失败三条路都落盘，否则截止时间会停在过去，
 *    闹钟每次排到「现在」反复空转）；
 * 4. 无论走哪条分支都放开进程内闸门。
 *
 * `already` 与 `claimed` 走**同一条落盘路径**：服务端说今天已领 = 今天这件事完成了
 * （写 claimDay、核对、下一自然日排期）。凌晨与否不再区分 —— 「凌晨 already 可能只是撞早了」
 * 那条有界探测链（1.5h 间隔、最多首撞 + 4 次重试）在真机实测后删除，理由见文件头。
 *
 * ## 失败落点：下一个自然日的校准时刻（默认 00:05）+ **回前台提示用户手动领取**
 *
 * 自动领取是**一天一次**（用户明确要求）：失败也把今天那一次用掉，所以截止时间推到下一个
 * 自然日。但「失败后就静默一天」是不能接受的 —— 用户会以为链路死了、歌一直被跳。
 * 所以失败时把 `status: 'failed' | 'risk'` 写进按天记录，**回前台时**由 vip-play-claim
 * 弹一次「请手动领取」的提示：手动那条是独立额度、且**不等待**（立即发请求），
 * 用户点一下就能把今天补上。
 *
 * 顺序刻意是「**领取 → 重新查询 → 落盘 → 排下一周期**」：先落盘再核对，等于在核对之前
 * 就把「今天这件事已经办完」写死了 —— 一旦核对发现权益没生效，下一轮也没机会再确认。
 *
 * 前置检查（按天记录、冷却、延时）留在调用方：自动路径要随机延时，手动路径是用户点击、
 * 不该等；但「怎么算领过、怎么落截止时间」两边必须一模一样，所以收在这里。
 */
async function issueDailyVipClaim(params: {
  scope: 'auto' | 'manual';
  cycleId: string;
  day: string;
}): Promise<DailyClaimAttempt> {
  const { scope, cycleId, day } = params;

  if (!(await beginClaimCycle(cycleId))) {
    console.log(`[vip] 本轮（${cycleId}）已经发起过领取，跳过重复请求（${scope}）`);
    return { kind: 'blocked' };
  }

  try {
    /*
     * 发起时刻要在请求之前抓：领取成功时记的观测是「我们什么时候真的领到的」，
     * 拿响应回来的时刻会让样本系统性偏晚（网络往返 + 落盘开销）。
     */
    const attemptAt = trustedNow();

    /*
     * ---- 记账（写在请求之前）----
     *
     * 自动路径落 `{day, status:'attempted'}`：这一笔既是「今天那一次用掉了」的凭据，
     * 也是「请求已发出、结果未知」的痕迹（进程在请求途中被杀就停在这个状态，
     * 不会提示用户，也不会自动重试）。
     *
     * 手动路径仍然是一个日期串 = 用户今天那一次手动机会已经用掉（≤1 次/天）。
     */
    if (scope === 'auto') {
      if (
        !(await writeAutoClaimDay({
          day,
          status: 'attempted',
          notified: false,
        }))
      ) {
        console.warn('[vip] 领取记录写不进去，放弃本次领取（宁可晚一次，也不重复领取）');
        return { kind: 'marker-failed' };
      }
    } else if (!(await writeDayMarker(LAST_MANUAL_CLAIM_KEY, day))) {
      console.warn('[vip] 领取标记写不进去，放弃本次领取（宁可晚一次，也不重复领取）');
      return { kind: 'marker-failed' };
    }

    /*
     * 基线要在**发请求之前**读：核对要判断「这次发放有没有让畅听那一档变长」。
     * 请求之后再读，读到的就是新值了 —— 那样「没有变化」永远判不出来。
     */
    const baseline = await readVipTierExpiry();

    const result = await claimDailyVipSilently();
    console.log(`[vip] ${scope === 'auto' ? '静默' : '手动'}领取结果:`, result.outcome);

    if (result.outcome === 'not-logged-in') {
      /*
       * 会话在流程中途被清掉（退出登录）：**什么时间都不要写**。
       * 写「下一个自然日」会把登录后那一次补领推迟一整天，而这次请求根本没发出去。
       */
      return { kind: 'issued', result };
    }

    /*
     * ---- `already` 与 `claimed` 同样处理：今天这件事完成了 ----
     *
     * 服务端回 already 就是「今天确实领过」：写 claimDay、核对、把截止时间排到
     * 下一个自然日的校准时刻。以前这里还有一条「凌晨窗口里 already 可能只是撞早了」
     * 的分支（1.5h 后再撞，最多首撞 + 4 次重试，服务端给 next_time 时优先用它）——
     * 真机实测重置点 00:28、第一发就成功，那条链从未触发过，已整体删除。
     *
     * 服务端如果明确下发下次可领时间，仍然由 `nextClaimAtFrom` 优先采用（与 claimed 同口径）；
     * 没给就退回「下一自然日 + 观测偏移」。两条落点都不再受「凌晨/白天」影响。
     */
    if (result.outcome === 'claimed' || result.outcome === 'already') {
      /*
       * 第一步：把「今天领到了」写死。
       *
       * 两件事都要落：
       * - 自动按天记录的 `status`：今天这件事成了（`attempted` → `claimed`/`already`），
       *   回前台也不会再提示「请手动领取」；**手动补领**成功时则要把自动那条的失败提醒
       *   结掉（否则会提示一件用户刚刚已经做过的事）；
       * - `rememberClaimDay`：独立维度，服务端已回答「今天这一份额度用掉了」，不用等核对。
       *
       * 都在核对之前写，是为了「核对期间进程被杀」也不影响判断（重启后靠它们就知道今天不用再领）。
       */
      if (scope === 'auto') {
        await writeAutoClaimDay({
          day,
          status: result.outcome,
          notified: false,
        });
      } else {
        // 手动补领成功：自动那条「请手动领取」的提示已经过时，结掉它（只动 notified）
        await settleAutoFailureAfterManual(day);
      }
      await rememberClaimDay({ outcome: result.outcome, scope }, attemptAt);

      /*
       * 第二步：**重新查询**核对。
       *
       * 接口回 `claimed` 就直接把本地改成「已生效」是隐患：发放可能还没入账。
       * 这里最多查 3 次（立即 / +1.5s / +4s），确认后由 `rememberVipStatusSnapshot`
       * 写入**服务端返回的真实到期时间**；没确认只留一条「待核对」记录 ——
       * 本地不会被判成已生效（见 vip-reconcile）。
       */
      const reconcile = await reconcileVipGrant({
        kind: 'claim',
        // claimed = 这次应该多出一天畅听；already = 今天本来就有，只核对「此刻有效」
        expectChange: result.outcome === 'claimed',
        baseline,
        sleep: waitDelay,
      });
      if (!reconcile.confirmed) {
        console.log(`[vip] 畅听权益待核对（${reconcile.reason}），本地不写「已生效」`);
      }

      /*
       * 第三步：新的截止时间**只在这一处**算（nextClaimAtFrom）：优先服务端下发的值，
       * 没有就按下一个自然日的校准时刻（默认 00:05）。闹钟、回前台、重启恢复三处
       * 从此都只**读**这个时间戳。
       *
       * 核对结果刻意不参与这个计算：尤其不能拿核对到的到期时间当它 —— 那是「现在 + 24h」，
       * 跨过零点就会把第二天的额度整天挡掉（本次线上故障的形状）。
       */
      // 下一次最早要到「这次领取 + 24h」；服务端下发的值更晚就听服务端的
      const deadline = Math.max(result.deadlineMs, attemptAt + CLAIM_COOLDOWN_MS);
      await commitVipDeadline(deadline);
    } else {
      /*
       * 失败/风控（含 `failed` / `risk`）。
       *
       * 自动领取是**一天一次**，所以截止时间仍然推到下一个自然日 —— 今天不再自动试。
       * 但失败必须**留下痕迹**：把 `status` 写成 `failed`/`risk`，回前台时
       * vip-play-claim 会据此提示「请手动领取」一次（`takeAutoClaimFailureReminder`）。
       * 没有这条痕迹的话，用户只会看到「歌被跳过、VIP 没到」，而不知道还能自己点一下。
       */
      if (scope === 'auto') {
        await writeAutoClaimDay({
          day,
          status: result.outcome === 'risk' ? 'risk' : 'failed',
          notified: false,
        });
      }

      const retryAt = nextDailyRetryAt(attemptAt);
      console.log(
        `[vip] 本轮领取未成功（${result.outcome}），下次再试 ${formatDeadline(
          retryAt
        )}；回前台会提示用户手动领取`
      );
      await commitVipDeadline(retryAt);
    }

    return { kind: 'issued', result };
  } finally {
    endClaimCycle(cycleId);
  }
}

/**
 * 登录后 / 冷启动时，**先问一次服务端「现在到底有没有 VIP」**，再决定领不领。
 *
 * 为什么必须补这一步：闸门读的是本地的 `tierExpiry`，而它可能来自**上一个账号**、
 * 或者几天前。刚登录时它大概率是空的（两档都是 0）→ 闸门把它当成「没有权益」→
 * 立刻去领。可用户其实刚在官方客户端开了月卡，这一发纯属白打（服务端只会回 131001）。
 *
 * 反过来，用户明明没 VIP，缓存里却留着昨天的有效记录 → 当天该领的没领。
 *
 * 有 `verifiedAt` 且足够新就不重复问：切前台很频繁，每次一个请求没必要。
 */
const VIP_STATUS_MAX_AGE_MS = 10 * 60 * 1000;

export async function refreshVipStatusIfStale(): Promise<void> {
  if (!getApiSession().token) {
    return;
  }

  const expiry = await readVipTierExpiry();
  if (expiry.verifiedAt > 0 && trustedNow() - expiry.verifiedAt < VIP_STATUS_MAX_AGE_MS) {
    return;
  }

  try {
    const status = await fetchVipStatus();
    // 未登录时 fetchVipStatus 返回空状态：那不是「没有权益」而是「问不到」，不能落盘
    if (!status) {
      return;
    }
    await rememberVipStatusSnapshot(status, 'profile');
  } catch (error) {
    // 问不到就按本地记录走：宁可多等一轮，也不要因为一次网络失败就误判「没有 VIP」
    console.warn('[vip] 登录后刷新 VIP 状态失败，按本地记录继续:', error);
  }
}

/**
 * 自动升级概念版（SVIP）—— 第一步「领到畅听」之后的第二步。
 *
 * ## 为什么单独抽出来、还带 `allowDelay`
 *
 * 原来这两步之间有一个 1–5 秒的随机等待（`await waitDelay(gapMs)`），用的是 JS 定时器。
 * 实测（2026-11-04 05:27 那次）：日志停在「5 秒后自动升级概念版（SVIP）」，之后**整份
 * 日志再没有升级结果** —— 用户切走 / 系统冻结了进程，定时器连同后续代码一起没了；而当天的
 * `autoUpgrade` 标记又还没写，于是这一天的 SVIP 就这么丢了（权威权益里「概念版到 无」）。
 *
 * 现在两条规矩：
 * 1. **不在前台就不等**：后台/锁屏下 JS 定时器随时会被冻住，等 1–5 秒等于主动放弃；
 * 2. **丢了要能补**：`resumeAutoUpgrade()` 在每次回前台时检查「今天领过、但没升级」，
 *    补做一次（调用点见 vip-play-claim 的 handleForeground）。
 *
 * @param allowDelay 只有「刚领完、用户就在前台」这一条路径才需要那 1–5 秒的抗脚本节奏
 */
async function runAutoUpgrade(day: string): Promise<void> {
  /*
   * 并发的两道入口（冷启动的 handleForeground 与 AppState 的 active 常常同一秒各调一次）
   * 会同时走到这里，而 `attemptSvipUpgrade` 的标记是**请求返回之后**才写的 ——
   * 真机实测因此连打了两发升级（一发 30002 失败、一发成功）。用一个进程内闸挡住。
   */
  if (upgradeInFlight) {
    return;
  }
  upgradeInFlight = true;

  try {
    if ((await readDayMarker(UPGRADE_BUDGET_KEYS.auto)) === day) {
      return;
    }

    if (vipDayKey() !== day) {
      console.log('[vip] 升级前跨过换日，本次放弃自动升级（新的一天再走一遍两步）');
      return;
    }

    const upgrade = await attemptSvipUpgrade('auto');
    if (upgrade === 'claimed' || upgrade === 'already') {
      // 自动路径刻意不弹 toast（每一步都弹会变成骚扰），日志是唯一痕迹
      console.log('[vip] 已自动升级为概念版（SVIP）');
      lastOptions?.onUpgraded?.();
      return;
    }

    console.log(`[vip] 自动升级没有完成（${upgrade}），回前台会补做一次`);
  } finally {
    upgradeInFlight = false;
  }
}

/**
 * 补做当天没做成的自动升级。
 *
 * 触发时机：每次回前台 / 冷启动（见 vip-play-claim）。
 *
 * 判定条件全部来自**本地记录**：
 * - 今天确实领过畅听（`claimDay` 或 `autoDay` 记着今天，且不是失败）；
 * - 今天的自动升级标记还没写 —— 说明 `attemptSvipUpgrade` 根本没跑起来，正是
 *   「5 秒定时器被冻住」那种情况；如果已经跑过（标记写了），这里不会重复打接口；
 * - 今天的 SVIP 记录不是有效（已经有效就没必要再请求）。
 *
 * `attemptSvipUpgrade` 自己会在**请求之前**写标记，所以补做最多成功一次，
 * 不会因为反复回前台而反复打接口。
 */
export async function resumeAutoUpgrade(): Promise<void> {
  const day = vipDayKey();

  if ((await readDayMarker(UPGRADE_BUDGET_KEYS.auto)) === day) {
    return;
  }

  // 与领取那道闸同一口径：只有**真的还在有效期内**才跳过（按天的布尔值会把已过期的也算成有效）
  const tierExpiry = await readVipTierExpiry();
  if (tierExpiry.svipExpiresAt > trustedNow() + SVIP_ALIVE_MARGIN_MS) {
    return;
  }

  const claimed = await readClaimDayRecord();
  const auto = await readAutoClaimDay();
  const claimedToday =
    claimed?.day === day ||
    (auto?.day === day && auto.status !== 'failed' && auto.status !== 'risk');
  if (!claimedToday) {
    return;
  }

  console.log('[vip] 今天领过畅听但还没升级概念版，补做一次自动升级');
  await runAutoUpgrade(day);
}

/**
 * 静默领取的实际流程 —— **所有自动触发源唯一的实现**。
 *
 * 闸门、延时、请求、截止时间落盘全在这里。新触发源最多只能换个 `trigger` 进来，
 * 而 `trigger` 只影响日志，不参与任何闸门判断。
 *
 * @returns 是否真的启动了一次流程（false 只是「没启动」，不代表失败）
 */
function runSilentVipClaim(trigger: ClaimTrigger): boolean {
  // 同步挡在最前面：播放/切歌是高频动作，而下面读存储是异步的，
  // 光靠读写在同一个 tick 里的连续调用之间挡不住。
  // **刻意不再按「今天试过」整体挡掉**（见文件头对 flowInFlight 的说明）。
  if (flowInFlight) {
    console.log(`[vip] 已有一次领取流程在进行中，忽略本次触发（${trigger}）`);
    return false;
  }
  if (!getApiSession().token) {
    return false;
  }

  flowInFlight = true;

  lastFlow = (async () => {
    const startedDay = vipDayKey();
    let cycleId = '';

    try {
      /*
       * 闸门：**只看「本 VIP 日领过没有」**，不看任何「下次可领取时间」。
       *
       * 那个时间戳是本地猜的换日点（先后出现过 00:05 / 00:28 / 04:00），猜早了会白打
       * 一次请求（服务端回 131001），猜晚了会让整晚的额度白等 —— 而用户看到的
       * 「可领取时间」还和他自己的直觉打架：「我 19:17 领的，怎么 00:28 就说今天领过了？」
       *
       * 真正的事实只有一条：**今天这一发用过没有**。它由 AutoClaimDay 按天记录回答，
       * 与换日点无关，也不会因为闹钟早晚而误判。
       *
       * 这里仍然读一次 state，只为拿 cycleId（闹钟交接要用）。
       */
      const state = await readVipDeadlineState();
      cycleId = cycleIdOf(state);

      /*
       * ---- 第一道闸：SVIP **还没到期**才跳过 ----
       *
       * 原来读的是 `readSvipDayRecord()` 的按天布尔值：它一旦被写成「今天有效」，
       * 当天就不再更新。于是「05:00 查还有效 → 05:27 到点被跳过 → 19:47 真过期了仍然
       * 被跳过」，白丢一天。现在直接看服务端给的到期时间：`svipExpiresAt` 过了就领。
       *
       * 留 5 分钟余量：到期前 5 分钟内就不必再等，直接领下一份，避免「刚好卡在边界」
       * 导致当天那次被跳过。
       *
       * 下一次尝试 = **max(SVIP 到期时刻, 上次领取 + 24h)** —— 两个条件都得满足，
       * 取较晚的那个，闹钟就只会响一次，不会出现「响了却被另一道闸挡住再重排」。
       */
      const nowMs = trustedNow();
      const lastClaimAt = await readLastClaimAt();
      const eligibleAt = lastClaimAt > 0 ? lastClaimAt + CLAIM_COOLDOWN_MS : 0;

      const tierExpiry = await readVipTierExpiry();
      if (tierExpiry.svipExpiresAt > nowMs + SVIP_ALIVE_MARGIN_MS) {
        // 静默退出：还在有效期内，一个请求都不发
        await commitVipDeadline(Math.max(tierExpiry.svipExpiresAt, eligibleAt));
        return;
      }

      /*
       * ---- 第二道闸：距上次领取满 24 小时 ----
       *
       * 这是「什么时候能领」的唯一口径（见 CLAIM_COOLDOWN_MS）。多天没打开也走这里：
       * `now - lastClaimAt` 早就超过 24h，闸门直接放行 —— 开屏即领，不需要额外的补发逻辑
       * （服务端本来也只给一份，补也补不回来）。
       *
       * 未满 24h 就静默退出，并把闹钟排到 `lastClaimAt + 24h`：到点那一刻如果 App 还活着
       * （前台，或后台听歌），闹钟叫醒它领取；否则等下次打开时立刻补上。
       */
      if (eligibleAt > nowMs) {
        await commitVipDeadline(eligibleAt);
        return;
      }

      /*
       * ---- 第三道闸：自动领取**一天一次**（成功或失败都算）----
       *
       * `attempted` 也算「今天用过了」：请求已经发出去、只是结果未知（进程被杀）。
       * 今天失败的话不再重试 —— 失败一定会被记进这条记录的 `failed`/`risk` 状态，
       * 回前台时由 vip-play-claim 提示用户手动领取（手动那条是独立额度、立即发请求）。
       *
       * 这里**没有例外**：`already` 也是结论（服务端说今天确实领过），所以今天不会再发第二发。
       * 以前那个「凌晨重试中」状态可以按 1.5h 间隔再发，那条链已删除；读到这类旧记录时
       * 按 `already` 处理（见 parseAutoClaimDay）。
       */
      const autoDay = await readAutoClaimDay();
      if (autoDay === null) {
        // 读不到记录就无法保证「一天一次」这条硬上限：宁可这次不领（回前台还会再来）
        return;
      }

      const now = nowMs;

      if (autoDay.day === startedDay) {
        // 今天那一发已经用过（成功 / 失败 / 结果未知）：安静退出。
        // 这条路径每次回前台、每次开播都会走到，打日志只会把真正的事件淹掉。
        await commitVipDeadline(nextDailyRetryAt(now));
        return;
      }

      // ---- 两次流程之间的最小间隔（只有「连截止时间都还没有」时才会真的生效）----
      if (now - (await readLastCheckAt()) < MIN_RECHECK_INTERVAL_MS) {
        // 不推进截止时间：这一轮还没真正发起过请求，下次回前台应该还能再试
        console.log('[vip] 距离上次领取检查不足 5 分钟，本轮先不发请求');
        return;
      }
      await writeLastCheckAt(now);

      console.log(`[vip] 本 VIP 日还没领过，开始领取（触发：${trigger}）`);

      // 跨零点：读取/延时期间可能已经翻了一天。此时领取请求带的 receive_day 是**新的一天**，
      // 而上面「今天已领过」那个判断针对的是旧的一天 —— 直接领下去就成了「旧一天那一发之后
      // 几秒钟又来一发」。两天各一次并没有超上限，但这种两连发正是风控最敏感的形状。
      // 所以放弃本次；新的一天由下一次触发自动就能再走一遍。
      if (vipDayKey() !== startedDay) {
        console.log('[vip] 领取期间跨过零点，本次放弃（新的一天由下一次触发再领）');
        return;
      }

      // ---- 发起领取：周期闸门 / 记账 / 请求 / 落新截止时间都在 issueDailyVipClaim 里 ----
      const attempt = await issueDailyVipClaim({
        scope: 'auto',
        cycleId,
        day: startedDay,
      });

      if (attempt.kind === 'blocked') {
        // 同一轮已经有请求发出去了（例如手动那一路正在飞）：它会把截止时间写好
        console.log('[vip] 本轮已经发起过领取，跳过重复请求');
        return;
      }
      if (attempt.kind === 'marker-failed') {
        // 没真发出去：截止时间保持原样，下次回前台再试
        return;
      }

      const result = attempt.result;

      if (result.outcome === 'claimed' || result.outcome === 'already') {
        // 两种结果对状态的含义一样（今天这一步完成了），所以都通知；
        // 要不要弹 toast 由调用方按结果决定（只有真领到才值得弹）
        lastOptions?.onDailyStep?.(result.outcome);
      } else if (result.outcome === 'risk' || result.outcome === 'failed') {
        /*
         * 失败也要通知：自动那条今天到此为止（一天一次），用户唯一能自救的动作是手动领。
         * 前台会立刻提示；后台只落状态，回前台再由 handleForeground 补提示一次。
         */
        lastOptions?.onDailyFailed?.(result.outcome);
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
       *
       * 这一段与改造前**完全一致**：VIP → SVIP 的逻辑不在这次改造范围内。
       */
      if (result.outcome === 'claimed' || result.outcome === 'already') {
        /*
         * 第二步**立刻**做，不再等 1–5 秒。
         *
         * 那个抖动原本是为了别让两个请求贴得太紧，但实测代价是整个 SVIP：05:27 那次
         * 日志停在「5 秒后自动升级」，之后什么都没有（用户切走 / 进程被冻结），
         * 当天 SVIP 直接丢掉。请求总量一点没变，可靠性却高得多 —— 值。
         */
        await runAutoUpgrade(startedDay);
      }
    } catch (error) {
      // 静默领取属于「锦上添花」，任何异常都不该影响主流程
      console.warn('[vip] 静默领取流程异常:', error);
    } finally {
      flowInFlight = false;
      // 流程已结束，钩子必须失效：留着会让「立即领取」去结束一个早就 resolve 的 Promise
      skipDelay = null;

      if (cycleId) {
        /*
         * 闹钟交接必须**无条件**释放（成功、失败、被挡、异常都要）：
         * 原生攥着唤醒锁和广播的 pendingResult 在等这一发的结果，
         * 不释放的话它要一直等到 45 秒超时才放手。
         * （进程内的周期闸门由 issueDailyVipClaim 自己在 finally 里放开。）
         */
        await acknowledgeAlarmHandoff(cycleId);
      }
    }
  })();

  return true;
}
