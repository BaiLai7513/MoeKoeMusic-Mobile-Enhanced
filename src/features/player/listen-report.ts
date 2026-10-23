import { mobileApi } from '@/lib/kugou-api';

import { onNativeState, type NativePlayerState } from './PlayerManager';
import {
  getListenSyncEnabled,
  hydrateListenSyncState,
  nextDailyReportCount,
  readListenBaseline,
  subscribeListenSyncState,
  writeListenBaseline,
} from './listen-report-state';

/**
 * 「听歌时长同步」：把**真实播放时间**上报给酷狗，计入听歌等级 / 成长值。
 *
 * 挂载范式照抄 `features/account/vip-play-claim.ts`：**订阅式**，不是组件 ——
 * 只要播放状态变了就会走到这里，锁屏、耳机线控、通知栏切歌都覆盖到。
 *
 * ## 用的是哪个接口：`user_grade_info` 的**上报模式**（只做等级同步）
 *
 * 等级记账走的是 lite v2 协议：`POST userinfo.user.kugou.com/v2/get_grade_info`，
 * 报文里带 `d_sec`（服务端累计秒基线）+ `diff_sec`（本次新增秒）+ `y_type`/`m_type`。
 * `api/module/user_grade_info.js` 里 `isReport` 分支就是这个形态 —— 该模块的注释原文是
 * 「听歌等级查询与时长同步，统一使用 lite v2 协议」，`isReport` 分支要求「token 与
 * `d_sec`/`diff_sec`」。`bootstrap.ts` 里锁定 `platform = 'lite'` 也是为它服务：
 * 只有 lite 平台下 `get_grade_info` 才**接收增量**，标准版 v4 协议只能查询。
 *
 * **刻意不用 `user_listen_report`**（逐首播放流水，CSCC `/v2/post`）：
 *
 * 1. 它的 `start`/`end` 事件是**逐首流水**语义，本次不做；
 * 2. 硬约束：它 `require('zlib')` + `require('net')`，RN 里没有这两个内置模块，
 *    也没有垫片（给 zlib 做垫片等于把 gzip 实现搬进包里），所以生成脚本
 *    （`scripts/generate-mobile-api-entry.mjs`）会跳过它，它压根不在 `mobileApi` 里。
 *
 * 只走 `user_grade_info` 的代价是**拿不到逐首明细**；收益是记账所需的两件事
 * （基线查询 + 增量上报）都由同一个模块、同一种协议完成，报文天然自洽。
 *
 * ## 频率：选择「每首歌播完上报一次」
 *
 * 这个接口虽然是账号级的等级接口，但上报节奏最好与真实听歌节奏同构：
 *
 * 1. 「一次上报对应一首歌」最接近真人客户端的节奏，比定时心跳更难被当成脚本刷接口；
 * 2. 成本：等级上报 + 会话里偶发的设备注册，按歌上报每 3 分钟才一次；
 *    60 秒心跳在一首 3 分钟的歌里就要发 3 次，是纯浪费（错误码 20028 就是这么踩出来的）；
 * 3. 60 秒心跳的下限与「一首歌至少听 60 秒才算有效收听」在这里是同一个数字，
 *    按歌上报天然满足「一次上报间隔 ≥ 60 秒」的约定。
 *
 * 故：**没有定时器**、**没有周期性请求**，只有「一首歌真的播够 60 秒后，在这个
 * 事件结束的那一刻报一次」。不满 60 秒的（疯狂切歌、点了就跳）直接丢弃 ——
 * 那本来就不是「听歌」。
 *
 * ## 防风险约定（逐条对应一个具体的坑）
 *
 * | 约定 | 这里的落地 |
 * | --- | --- |
 * | 开关关闭时一次请求都不发 | 关闭时不挂原生监听（连计时都不做），每个请求入口再查一次开关 |
 * | 不启动即上报 | 上报只在「歌播够 60 秒」后才可能发生；首次查基线还额外加 3–9 秒随机延时 |
 * | 不用定时器高频刷 | 代码里没有任何 `setInterval`；唯一 `setTimeout` 是首启查基线的那一次抖动 |
 * | 失败不重试 | `catch` 只打日志并丢弃这一段；上游明确「接口不自动重试」，重放会重复记账 |
 * | 每小时/每天有上界 | 两次上报墙钟间隔 ≥ 60 秒 + 每日上报调用 ≤ 200 次（按账号 + 日期持久化计数，先计数后发请求） |
 * | 基线必须来自服务端 | 首启（一次会话一次）先查 `user_grade_info` 拿 `d_sec`；拿不到就不报，不发不自洽的 `diff_sec` |
 *
 * ## 已知取舍（写在这里免得后来者当成 bug）
 *
 * - **不逐首记账**：没有 `user_listen_report`，服务端的逐首播放明细不会更新，
 *   只有累计时长/等级会。这是本次的明确范围。
 * - **不需要歌曲 ID**：等级上报是**账号级**的，报文里没有 `mixsongid`。
 *   所以本地文件、拿不到 `albumAudioId` 的曲目**也计入**听歌时长 —— 它们确实是听歌。
 *   （原先按 `mixsongid` 过滤的逻辑随逐首上报一起删掉了。）
 * - **倍速播放按墙钟计**：2 倍速播 60 秒只记 60 秒（真实媒体时长是 120 秒）。
 *   宁可少报不可多报 —— 多报会让 `d_sec` 跑在服务端前面，反而更容易被判异常。
 * - **缓冲不算播放**：只累计 `playing && !buffering` 的时段，与「扣除暂停」的语义一致。
 * - **进程被杀时未结算的那一段会丢**（可能几分钟）：这是「不写定时器」的代价，
 *   换来的是不会在后台偷偷发请求。
 */

/** 一首歌至少要有这么多**真实播放毫秒**才值得上报（同时是上报节奏的下限）。 */
const MIN_REPORT_MS = 60_000;

/** 两次上报之间的墙钟最小间隔：快速切歌时也不会连发。 */
const MIN_REPORT_INTERVAL_MS = 60_000;

/**
 * 每日上报调用硬上限（按账号 + 自然日）。
 * 按歌上报本身就有自然节奏，这个数字是给「挂着播一整夜」兜底的。
 */
const MAX_REPORTS_PER_DAY = 200;

/** 首启查基线的随机延时区间：启动瞬间就打接口是最像脚本的节奏。 */
const BASELINE_DELAY_MIN_MS = 3_000;
const BASELINE_DELAY_MAX_MS = 9_000;

/** 等级上报里「听歌」这一维的类型位：上游默认 0，我们不做任务/活动维度。 */
const LISTEN_Y_TYPE = 0;
const LISTEN_M_TYPE = 0;

/**
 * 本适配层的模块名就是 `api/module/` 的文件名。
 *
 * 用运行时按名字取、而不是直接写 `mobileApi.user_grade_info(...)`：
 * 这是「当前 pin 的子模块是否已经包含它」的唯一判据。按名字取能做到
 * **模块缺失时整条链路自然失效**（不挂订阅、不发请求、设置页不显示开关），
 * 而不是把整个包拖进编译错误。
 */
type ApiCall = (params: Record<string, unknown>) => Promise<unknown>;

function apiCall(name: string): ApiCall | null {
  const candidate = (mobileApi as unknown as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as ApiCall) : null;
}

/**
 * 当前这版 API 生成代码是否具备等级同步能力。
 *
 * 设置页用它决定「要不要显示这个开关」：没有接口时显示一个打开也不会有任何效果的开关，
 * 比不显示更糟。
 *
 * 只认 `user_grade_info` —— 查询基线与增量上报都是它（见文件头）。
 */
export function isListenSyncSupported(): boolean {
  return apiCall('user_grade_info') !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** 秒数容错：服务端有时把数字放成字符串。只接受非负有限值。 */
function asSec(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : null;
}

/** 等级接口返回体：`{ status, error_code, data: { d_sec, p_grade, ... } }`。 */
function gradeSecFrom(body: unknown): number | null {
  return asSec(asRecord(asRecord(body)?.data)?.d_sec);
}

/** 一首歌的计时器：只在「正在播且不在缓冲」的时段累加。 */
type SongSegment = {
  /** 原生侧的曲目标识（= 曲目 hash），用来判断有没有换歌。 */
  mediaId: string;
  /** 已经结算的真实播放毫秒数。 */
  playedMs: number;
  /** 正在播放时 = 这一段的起算时间戳；暂停/缓冲时为 null。 */
  resumeAt: number | null;
};

let attached = false;
let detachNative: (() => void) | null = null;
let segment: SongSegment | null = null;
let lastReportAt = 0;
let baselineSec: number | null = null;
let baselinePromise: Promise<number | null> | null = null;
let baselineScheduled = false;
let baselineTimer: ReturnType<typeof setTimeout> | null = null;
let reporting = false;

/**
 * 首启查基线：**不是立刻查**，而是判断「真的开始在播了」之后，再等 3–9 秒随机延时。
 *
 * 这个延时是本文件唯一的定时器，也只跑一次（`baselineScheduled` 兜住）。
 */
function scheduleBaselineQuery(): void {
  if (baselineScheduled || baselineSec != null) {
    return;
  }

  baselineScheduled = true;
  const delay =
    BASELINE_DELAY_MIN_MS + Math.random() * (BASELINE_DELAY_MAX_MS - BASELINE_DELAY_MIN_MS);

  baselineTimer = setTimeout(() => {
    baselineTimer = null;
    void ensureBaseline();
  }, Math.round(delay));
}

/**
 * 拿服务端累计秒数作为基线。
 *
 * 这一步是**必须**的：`d_sec` 必须 ≥ 服务端当前值，而本地并不知道用户在其他设备上听过多少，
 * 所以每次冷启动的第一次上报之前都要问一次。一次会话只查一次（`baselineSec` 缓存），
 * 之后的 `d_sec` 由「基线 + 本次新增」自行推进。
 *
 * 查询失败**不重试**：宁可这次会话不上报，也不要拿一个可能偏低的基线去撞拒收。
 */
async function ensureBaseline(): Promise<number | null> {
  if (baselineSec != null) {
    return baselineSec;
  }

  if (!getListenSyncEnabled()) {
    return null;
  }

  // 抖动定时器与「第一次够 60 秒的上报」可能同时到达，这里复用同一个查询，
  // 避免为了一个基线值打两次 `/v2/get_grade_info`。
  baselinePromise ??= queryBaseline();

  return baselinePromise;
}

async function queryBaseline(): Promise<number | null> {
  const gradeInfo = apiCall('user_grade_info');
  if (gradeInfo) {
    try {
      const result = await gradeInfo({});
      const sec = gradeSecFrom(asRecord(result)?.body);
      if (sec != null) {
        baselineSec = sec;
        await writeListenBaseline(sec);
        return sec;
      }
    } catch (error) {
      console.warn('[listen] 查询听歌时长基线失败（不重试）:', error);
    }
  }

  // 查询失败才退回本地未过期的基线；过期值会把 d_sec 算小，直接放弃本次。
  const stored = await readListenBaseline();
  if (stored != null) {
    baselineSec = stored;
    return stored;
  }

  return null;
}

/**
 * 上报一首歌的真实播放时长（等级同步）。
 *
 * `d_sec` 与 `diff_sec` 都从**同一个** `playedMs` 推出来，因此天然满足上游
 * 「`diff_sec` 不得超过本次播放秒数」的校验 —— 这也是为什么不满 60 秒的歌直接丢弃而不是
 * 攒起来下次一起报：攒起来就会出现「diff_sec > duration」的自相矛盾报文。
 *
 * 报文里**没有歌曲 ID**：等级是账号级累计值，服务端不关心这 60 秒听的是哪首。
 */
async function reportSong(playedMs: number): Promise<void> {
  if (!getListenSyncEnabled() || reporting) {
    return;
  }

  if (Date.now() - lastReportAt < MIN_REPORT_INTERVAL_MS) {
    return;
  }

  const gradeInfo = apiCall('user_grade_info');
  if (!gradeInfo) {
    return;
  }

  const diffSec = Math.floor(playedMs / 1000);
  if (diffSec <= 0) {
    return;
  }

  // 先占住「有一条在飞」：下面的计数与基线都是 await，不占的话两次结算可能同时进来，
  // 结果是同一段时长报两次（重复记账 + 请求翻倍）。
  reporting = true;

  try {
    // 先计数再发请求：失败也占用额度，否则「一直失败」会把每日上限彻底绕过。
    const count = await nextDailyReportCount();
    if (count > MAX_REPORTS_PER_DAY) {
      return;
    }

    const baseline = await ensureBaseline();
    if (baseline == null) {
      return;
    }

    lastReportAt = Date.now();

    // 传了 d_sec/diff_sec 就走 `user_grade_info` 的 isReport 分支 —— 同一次调用
    // 既是「上报增量」也是「取回最新累计值」，所以下面能直接用返回体刷新基线。
    const result = await gradeInfo({
      d_sec: baseline + diffSec,
      diff_sec: diffSec,
      y_type: LISTEN_Y_TYPE,
      m_type: LISTEN_M_TYPE,
    });

    // 服务端有时不回 d_sec（例如只记账不回显），那就自己推进基线。
    const nextBaseline = gradeSecFrom(asRecord(result)?.body) ?? baseline + diffSec;
    baselineSec = nextBaseline;
    await writeListenBaseline(nextBaseline);
    console.log(`[listen] 已同步听歌时长 ${diffSec}s（累计 ${nextBaseline}s）`);
  } catch (error) {
    // 上游明确「接口不自动重试」：重放可能重复记账，也可能因为节奏异常被判脚本。
    console.warn('[listen] 听歌时长上报失败，本轮丢弃（不重试）:', error);
  } finally {
    reporting = false;
  }
}

/** 结算当前这一首：够 60 秒就报，不够就丢（疯狂切歌不产生请求）。 */
function settleSegment(now: number): void {
  const finished = segment;
  segment = null;

  if (!finished) {
    return;
  }

  const playedMs = finished.playedMs + (finished.resumeAt != null ? now - finished.resumeAt : 0);
  if (playedMs < MIN_REPORT_MS) {
    return;
  }

  void reportSong(playedMs);
}

/**
 * 原生播放状态回调：这里只做**计时**，不发请求。
 *
 * 为什么用 `onNativeState` 而不是 `player/store.ts` 的 `onPlaybackStart`：
 * 后者只通知「开始播」，拿不到「结束」；而一段时长的记账结束点恰恰是切歌/停止/出错那一刻。
 * 原生事件流里这些都有（`mediaId` 变了、`playing` 变 false、`error` 非空）。
 */
function handleNativeState(next: NativePlayerState): void {
  if (!getListenSyncEnabled()) {
    return;
  }

  const now = Date.now();
  const mediaId = next.mediaId ?? null;
  // 缓冲不算播放：与「duration 要扣除暂停」的语义一致。
  const active = next.playing && !next.buffering;
  const broken = Boolean(next.error);

  if (active) {
    scheduleBaselineQuery();
  }

  // 换歌 / 停止 / 出错：结算上一首，再给新曲目起一段。
  if (!segment || segment.mediaId !== mediaId || broken) {
    settleSegment(now);

    segment =
      mediaId && !broken
        ? {
            mediaId,
            playedMs: 0,
            resumeAt: active ? now : null,
          }
        : null;
    return;
  }

  if (active) {
    if (segment.resumeAt == null) {
      segment.resumeAt = now;
    }
    return;
  }

  if (segment.resumeAt != null) {
    segment.playedMs += now - segment.resumeAt;
    segment.resumeAt = null;
  }
}

/**
 * 开关变化时挂上/摘下原生监听。
 *
 * **关闭时必须真的摘掉**：不只是「请求里加个 if」，而是连计时都不做 ——
 * 这样「关闭状态下一次请求都不发」是结构上成立的，不依赖每个分支记得判断。
 */
function syncNativeSubscription(): void {
  if (!isListenSyncSupported()) {
    return;
  }

  const enabled = getListenSyncEnabled();

  if (enabled && !detachNative) {
    const subscription = onNativeState(handleNativeState);
    detachNative = () => {
      subscription.remove();
    };
    return;
  }

  if (!enabled && detachNative) {
    detachNative();
    detachNative = null;
    // 关掉开关就把没结算的那一段丢掉：它只属于「开启期间」的时长
    segment = null;
    if (baselineTimer) {
      clearTimeout(baselineTimer);
      baselineTimer = null;
    }
    baselineScheduled = false;
    baselineSec = null;
    baselinePromise = null;
  }
}

/**
 * 挂到播放器上（在根布局模块作用域调用一次）。
 *
 * 幂等：热重载/重复求值不会挂出两份监听。
 */
export function attachListenReport(): void {
  if (attached) {
    return;
  }
  attached = true;

  if (!isListenSyncSupported()) {
    // 不是「忘了挂」：当前 API 生成代码里没有 user_grade_info（见文件头的说明）。
    console.warn('[listen] 当前 API 生成代码缺少 user_grade_info，听歌时长同步不生效');
    return;
  }

  subscribeListenSyncState(syncNativeSubscription);
  void hydrateListenSyncState()
    .then(syncNativeSubscription)
    .catch(() => undefined);
}
