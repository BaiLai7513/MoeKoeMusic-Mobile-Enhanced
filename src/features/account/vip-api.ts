import { pickNumber, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

import { vipDayKey } from './vip-day';

/**
 * VIP 相关能力。
 *
 * ## 两个接口别搞混
 *
 * | 用途 | 模块 | 真实 endpoint |
 * |---|---|---|
 * | **领取** 1 天畅听 VIP | `youth_day_vip` | `POST /youth/v1/recharge/receive_vip_listen_song` |
 * | 升级为概念版 VIP | `youth_day_vip_upgrade` | `POST /youth/v1/listen_song/upgrade_vip_reward` |
 *
 * ## 自动路径只允许碰 `youth_day_vip`
 *
 * 自动领取（vip-play-claim → vip-silent-claim）**只调 `claimDailyVipSilently`** 领畅听 VIP。
 * 升级那一步有自己的额度闸门（见 vip-silent-claim 的 `attemptSvipUpgrade`），不在这里放行：
 * 升级会消耗用户的额外额度，静默做掉等于替用户花钱，而且用户根本看不出额度去哪了。
 *
 * 隔离点放在**调用方级**：本文件把能力导出来，由调用方保证自动链路的边界。
 *
 * ## 升级接口的调用方
 *
 * `upgradeToConceptVip` 由 vip-claim-state 的 `claimSvip`（「我的」页那颗 `SVIP` 胶囊）
 * 与 vip-silent-claim 的 `attemptSvipUpgrade` 调用。
 */

export type VipStatus = {
  /** 当前是否处于 VIP 有效期内（任意一种 VIP）。 */
  isVip: boolean;
  /** 展示用标签：SVIP / VIP / 空。 */
  vipLabel: string;
  /** VIP 到期时间（毫秒时间戳）；0 表示拿不到或没有记录。 */
  endTimeMs: number;
  /**
   * **概念版**（SVIP）是否在有效期内。
   *
   * 与 `isVip` 的区别是必须存在的：`isVip` 只回答「有没有任意一种 VIP」，而「我的」页面
   * 那颗 `SVIP` 胶囊必须知道**是不是概念版** —— 拿着畅听 VIP 的用户如果被判成「有效中」，
   * 胶囊会灰掉，他当天那次升级机会就被错误地锁死了。
   */
  conceptValid: boolean;
  /**
   * **畅听**（服务端记录里的 `tvip`）那一档的最新到期时间；0 = 没有这一档的有效记录。
   *
   * 为什么必须与 `endTimeMs` 分开存：`endTimeMs` 是「两档里**最晚**的那个」，只回答
   * 「还能听多久」；而想知道「畅听这一档自己还剩多久」时，只有它自己的时间线能回答。
   * **调度也只认这一份**（见下面 `svipExpiresAt` 的说明）。
   */
  vipExpiresAt: number;
  /**
   * **概念版**（`svip`）那一档的最新到期时间；0 = 没有这一档的有效记录。
   *
   * **只用于显示 / 核对诊断，不参与任何调度决策**：真机实测两档的到期时间只差
   * 「领取 → 升级」那 1–5 秒，所以调度看 `vipExpiresAt`（或两档取大的 `endTimeMs`）与看它
   * 效果等价。尤其不能用它判断「今天还能不能领 / 能不能升级」—— 前者看按天记录，
   * 后者看「今天领过畅听 VIP」（`claimDay`），与 SVIP 有没有到期无关。
   */
  svipExpiresAt: number;
};

const EMPTY_VIP_STATUS: VipStatus = {
  isVip: false,
  vipLabel: '',
  endTimeMs: 0,
  conceptValid: false,
  vipExpiresAt: 0,
  svipExpiresAt: 0,
};

/**
 * 解析 `vip_end_time`。
 * 酷狗返回的形态不稳定（秒级时间戳 / 毫秒级时间戳 / "YYYY-MM-DD HH:mm:ss" 字符串都见过），
 * 所以三种都兜住；解析不出来返回 0 而不是抛错。
 */
function parseVipEndTime(value: unknown): number {
  const numeric = pickNumber(value);
  if (numeric > 0) {
    // 10 位是秒，13 位是毫秒
    return numeric > 1e12 ? numeric : numeric * 1000;
  }

  const text = pickText(value);
  if (!text) {
    return 0;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6])
    ).getTime();
  }

  const fallback = Date.parse(text);
  return Number.isFinite(fallback) ? fallback : 0;
}

/**
 * 一条 `busi_vip` 记录是不是概念版。
 *
 * 真机实测 `product_type` 的取值是 `'svip'`（概念版）与 `'tvip'`（畅听版）—— 注意**不是**
 * `'vip'`。这里做大小写归一后比较，`'tvip'` 自然落到「非概念版」，展示成 `VIP`。
 */
function isConceptRecord(record: Record<string, unknown>): boolean {
  return pickText(record.product_type).toLowerCase() === 'svip';
}

/**
 * 一组记录里最晚的到期时间；没有记录（或都解析不出时间）时返回 0。
 *
 * 只在**同一档内部**使用（见 `parseVipStatus`）：两档之间取大是展示口径，不是调度口径。
 */
function latestExpiry(records: Record<string, unknown>[]): number {
  return records.reduce(
    (latest, item) => Math.max(latest, parseVipEndTime(item.vip_end_time)),
    0
  );
}

/**
 * 从 `/user/vip/detail` 的返回体解析 VIP 状态。
 *
 * ## 为什么 `endTimeMs` 取「所有有效记录里最晚的那个」
 *
 * 真机实测（一次领取 + 隔几秒升级之后）：
 *
 * ```
 * [{ t: 'svip', end: '2026-10-12 09:39:04', is: 1 },
 *  { t: 'tvip', end: '2026-10-12 08:52:18', is: 1 }]
 * ```
 *
 * 两条**同时有效、各自独立**：畅听 VIP 与概念版 SVIP 互不转换，谁都是「从自己被发放的
 * 那一刻起 24 小时」（本例差了约 47 分钟，正是领取与升级之间的间隔）。
 * 所以「还能听多久」的正确答案 = **最晚的那条到期时间**。
 *
 * 为什么不能沿用 `activeRecords[0]`：数组顺序不是协议保证的（上面这条注释以前就写过这件事）。
 * 顺序一反就会取到较早的 `tvip` 到期时间 —— 于是「SVIP 明明还有效却被判成过期」，
 * 触发一次无谓的领取请求，用户还可能被本地判断误导。
 *
 * ## 为什么 `vipLabel` 用全表扫描出来的 `conceptValid`
 *
 * 它只是昵称旁边那个展示徽标（`SVIP` / `VIP`），错一次不产生任何行为后果；但既然
 * `conceptValid` 已经为了状态判断把**全部**记录扫过一遍，徽标就顺手复用同一个结论 ——
 * 口径统一，也就不会因为数组顺序翻转而在有 SVIP 时显示成 VIP。
 *
 * ## 为什么还要把两档的到期时间分别带出去
 *
 * 两档是**两条独立的时间线**（真机实测 svip 09:39:04 / tvip 08:52:18，各自从被发放那一刻
 * 起 24 小时），只是差值恰好等于「领取 → 升级」那 1–5 秒。所以：
 * - **调度只认畅听那一份** `vipExpiresAt`（与两档取大的 `endTimeMs` 只差这 1–5 秒，
 *   效果等价）；
 * - `svipExpiresAt` 保留给**显示 / 核对诊断**：胶囊要回答「概念版还剩多久」，升级之后的
 *   核对要判断「这次发放有没有让概念版变长」（见 vip-reconcile 的 `isGrantVisible`）。
 *
 * 三个问题必须分开问，不能都拿「最晚那个到期时间」回答：
 * - 「今天还要不要领」→ 自动领取的按天记录（见 vip-silent-claim），与到期时间无关；
 * - 「今天还能不能升级」→ `claimDay`（今天真的领过畅听 VIP），**不是** SVIP 有没有到期 ——
 *   昨天的畅听往往还有效，但服务端要的是「**今天**领过了」；
 * - 「还能听多久 / 概念版还剩多久」→ 展示口径，两档各自取值。
 */
export function parseVipStatus(body: unknown): VipStatus {
  const records = toRecords(toRecord(toRecord(body).data).busi_vip);

  if (!records.length) {
    return EMPTY_VIP_STATUS;
  }

  const activeRecords = records.filter((item) => pickNumber(item.is_vip) === 1);
  const conceptValid = activeRecords.some(isConceptRecord);

  const active = activeRecords[0];
  if (!active) {
    return EMPTY_VIP_STATUS;
  }

  /*
   * 两档各自算自己的最新到期时间。
   *
   * 真机那两条记录（svip 09:39:04 / tvip 08:52:18）就是两个独立的时间线：升级概念版
   * 并不会把畅听那条改掉，领取畅听也不会延长概念版。所以这里按 `product_type` 分桶，
   * 桶内取最晚（同一档可能残留多条历史记录），两桶**绝不合并**。
   */
  const vipExpiresAt = latestExpiry(activeRecords.filter((item) => !isConceptRecord(item)));
  const svipExpiresAt = latestExpiry(activeRecords.filter(isConceptRecord));

  return {
    isVip: true,
    /*
     * 徽标直接用 conceptValid（全表扫描的结果），而不是看 active 那一条。
     *
     * 概念版与畅听版是**两条同时有效的独立记录**（真机实测：svip 09:39:04 / tvip
     * 08:52:18，各自从被发放那一刻起 24 小时），而 busi_vip 的数组顺序不是协议保证的。
     * 若按 active（= [0]）判断，顺序一翻转就会在有 SVIP 时显示成 VIP。
     */
    vipLabel: conceptValid ? 'SVIP' : 'VIP',
    // 展示口径不变：仍然是「所有有效记录里最晚的那个」（= 两档取大）
    endTimeMs: Math.max(vipExpiresAt, svipExpiresAt),
    conceptValid,
    vipExpiresAt,
    svipExpiresAt,
  };
}

/** 主动查一次 VIP 状态（静默领取的触发依据）。 */
export async function fetchVipStatus(): Promise<VipStatus> {
  if (!getApiSession().token) {
    return EMPTY_VIP_STATUS;
  }

  await bootstrapMobileApi();
  const response = await mobileApi.user_vip_detail({});
  return parseVipStatus(response.body);
}

export type VipClaimOutcome =
  /** 领取成功。 */
  | 'claimed'
  /** 今天已经领过。 */
  | 'already'
  /** 账号被风控，需要去官方客户端领。 */
  | 'risk'
  /** 未登录。 */
  | 'not-logged-in'
  /** 其他失败。 */
  | 'failed';

/**
 * 领取接口的完整结果：除了结论，还带上**服务端下发的下次可领取时间戳**。
 *
 * ## 为什么要把时间戳一起带出来（而不是让调用方自己算）
 *
 * 「下次可领取时间」是整条自动领取链路唯一的事实依据（见 vip-deadline）：
 * 闹钟、回前台、重启恢复三处都只**读**它，绝不各自拿 `上次领取 + 24h` 现算 ——
 * 三处现算必然会漂移，而漂移的表现就是要么漏领、要么重复请求。
 *
 * 所以「算这一次」只允许发生在领取成功的那一处，并且优先用服务端给的值；
 * `0` = **服务端没给**（这个接口的返回体没有文档化的该字段，仓库里也没有响应样例），
 * 调用方按「下一个自然日的校准时刻」兜底 —— 那个兜底同样只在 vip-deadline 里写一次。
 */
export type DailyVipClaimResult = {
  outcome: VipClaimOutcome;
  /** 服务端下发的下次可领取时间（毫秒）；0 = 服务端没给。 */
  deadlineMs: number;
};

/** 提取酷狗返回体里的错误码，兼容 { error_code } 与包在 body 里的两种形态。 */
function pickErrorCode(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0;
  }
  const record = error as Record<string, unknown>;
  const bodyCode = pickNumber(toRecord(record.body).error_code);
  if (bodyCode) {
    return bodyCode;
  }
  const responseCode = pickNumber(toRecord(toRecord(record.response).data).error_code);
  if (responseCode) {
    return responseCode;
  }
  return pickNumber(record.error_code, record.status);
}

/**
 * 返回体里可能承载「下次可领取时间」的字段名（按可能性排序）。
 *
 * 为什么是一张**候选表**而不是一个写死的字段：领取接口的返回体在
 * `api/module/youth_day_vip.js` 里没有做任何字段约定（它只透传响应），仓库里也没有
 * 响应样例。多认几个名字的代价只是几行代码；认不出来就退回本地校准值，依然可用。
 *
 * **刻意不认 `vip_end_time` / `end_time` / `expire_*` / `deadline`**：这些是 VIP 的
 * **到期时间**（≈ 发放时刻 + 24h），不是「下次可领时间」。把它们当下次可领，会在
 * 23:52 领到之后把下一次排到第二天 23:52 —— 正好复刻「晚上领过一次、第二天一整天
 * 不自动领」那个线上故障。只有 `next_*` / `reset_*` 才是同一语义。
 */
const NEXT_CLAIM_FIELDS = [
  'next_time',
  'next_receive_time',
  'next_claim_time',
  'next_claim_at',
  'next_receive_at',
  'next_day_time',
  'reset_time',
  'reset_at',
] as const;

/**
 * 服务端给的「下次可领时间」最多能有多远。
 *
 * 每日额度按自然日重置，所以正常的 next_time 不会超过约 24 小时（跨时区再加一点余量）。
 * 超过 26 小时的值更可能是别的语义（月度重置、到期时间、噪声），宁可不采信、退回
 * 本地校准 —— 否则一个错误字段就能把领取锁死好几天。
 */
const NEXT_CLAIM_MAX_AHEAD_MS = 26 * 60 * 60 * 1000;

/**
 * 从领取返回体里取出「下次可领取时间戳」；取不到返回 0。
 *
 * 两个校验缺一不可：
 * - `> now`：候选字段里也可能有「多少秒后」（如 86400）。按绝对时间解析出来是 1970 年，
 *   放过它会把下一次领取排到几十年前，整条链路**永远不再触发**；
 * - `<= now + 26h`：见 `NEXT_CLAIM_MAX_AHEAD_MS`，挡住语义不对/噪声字段。
 */
function extractNextClaimAt(body: unknown): number {
  const root = toRecord(body);
  const groups = [
    root,
    toRecord(root.data),
    toRecord(toRecord(root.data).data),
    toRecord(root.result),
    toRecord(root.info),
  ];
  const now = Date.now();

  for (const record of groups) {
    for (const field of NEXT_CLAIM_FIELDS) {
      const value = parseVipEndTime(record[field]);
      if (value > now && value <= now + NEXT_CLAIM_MAX_AHEAD_MS) {
        return value;
      }
    }
  }

  return 0;
}


/**
 * 日志用：列出返回体顶层字段名（只列 key，不打印值）。
 *
 * 目的不是调试某一次请求，而是给「服务端到底有没有下发下次可领时间」留下可查证据：
 * 现在的接口模块 `api/module/youth_day_vip.js` 只透传响应，没有声明任何字段；
 * 仓库里也没有响应样例。真机日志里看到这行时，就能直接确认这次响应到底给了什么。
 */
function describeBodyKeys(body: unknown): string {
  const keys = Object.keys(toRecord(body));
  return keys.length ? keys.join(',') : '空';
}

/**
 * 发给服务端的 `receive_day`。
 *
 * 与本地按天标记共用同一套日历（**东八区 04:00 换日**，见 vip-day）。两边口径一旦不同，
 * 就会出现「本地以为没领过 → 白发一次请求（服务端回 131001）」或者「本地以为已经领过 →
 * 当天真的漏领」这两种都很难查的故障。
 */
function todayKey(): string {
  return vipDayKey();
}

/**
 * 静默领取 1 天畅听 VIP。
 *
 * 与官方版的区别：
 * - **不弹任何 UI**，结果只进日志（调用方按需决定是否提示）
 * - **不询问是否升级概念版**，领取成功后直接结束
 * - 不做重试：风控 / 今日已领都直接返回，避免加剧风控
 *
 * 返回值带上服务端下发的「下次可领取时间戳」（见 `DailyVipClaimResult`）：
 * 这是整条链路唯一的时间依据，由调用方在**一处**落盘，绝不在这里自己加 24h。
 */
export async function claimDailyVipSilently(): Promise<DailyVipClaimResult> {
  if (!getApiSession().token) {
    return { outcome: 'not-logged-in', deadlineMs: 0 };
  }

  await bootstrapMobileApi();

  try {
    const response = await mobileApi.youth_day_vip({ receive_day: todayKey() });
    const body = toRecord(response.body);
    const deadlineMs = extractNextClaimAt(body);
    if (deadlineMs <= 0) {
      /*
       * 当前接口没有文档化的「下次可领时间」字段（见 api/module/youth_day_vip.js：
       * 它只是把响应原样透传）。这里只打顶层 key，既留下证据，也不泄露响应内容。
       * 排期因此走本地校准值（默认 00:05），而不是凭空相信某个写死的时刻。
       */
      console.log(
        `[vip] 领取返回体没有「下次可领时间」字段（顶层：${describeBodyKeys(
          body
        )}），按本地校准值排期`
      );
    }
    if (pickNumber(body.status) === 1) {
      return { outcome: 'claimed', deadlineMs };
    }
    // status 非 1 且没抛错：按「今天已领」处理，不当作失败
    return { outcome: 'already', deadlineMs };
  } catch (error) {
    // 失败分支同样试着取一次：131001（今天已领）的返回体里可能带下次可领时间，
    // 有的话就不必退回到本地校准值
    const record = toRecord(error);
    const deadlineMs =
      extractNextClaimAt(record.body) || extractNextClaimAt(toRecord(record.response).data);
    const code = pickErrorCode(error);
    if (code === 131001) {
      if (deadlineMs <= 0) {
        console.log(
          `[vip] 131001 返回体没有「下次可领时间」字段（顶层：${describeBodyKeys(
            record.body
          )}），按本地校准值排期`
        );
      }
      return { outcome: 'already', deadlineMs };
    }
    if (code === 20028) {
      return { outcome: 'risk', deadlineMs };
    }
    console.warn('[vip] 静默领取失败:', code || error);
    return { outcome: 'failed', deadlineMs };
  }
}

/**
 * 把当天领到的畅听 VIP 升级为概念版 VIP。
 *
 * 调用方有两个：vip-claim-state 的 `claimSvip`（「我的」页那颗 `SVIP` 胶囊），
 * 以及 vip-silent-claim 的 `attemptSvipUpgrade`（自动补领的第二步，自己带按天额度闸门）。
 * 约束仍然是硬的：**任何一条路都必须先满足前置条件**，凭空发出去的升级请求既会失败、
 * 又会消耗用户当天那一次升级额度。
 *
 * ## 前置条件
 *
 * 必须先领过**当天**的每日畅听 VIP，否则服务端会直接报错 —— 这个前置判断放在调用方
 * （vip-claim-state 只在 dailyClaimed 为真时才放开按钮），因为本文件不该知道 UI 状态。
 *
 * ## 返回值的语义
 *
 * 复用 `VipClaimOutcome`：`'claimed'` = 升级成功，`'already'` = 今天已经升级过（或服务端
 * 认为无需再升）、也算达成目标。风控 20028 与「今日已领」131001 的处理与领取接口保持一致 ——
 * 用户看到的按钮必须对这两个码做出同样的反应，否则会出现「领取被判风控」和「升级被判风控」
 * 两种不同说法。
 */
export async function upgradeToConceptVip(): Promise<VipClaimOutcome> {
  if (!getApiSession().token) {
    return 'not-logged-in';
  }

  await bootstrapMobileApi();

  try {
    const response = await mobileApi.youth_day_vip_upgrade({});
    const body = toRecord(response.body);

    // 错误码有两种上报方式：抛异常，或者 status=0 + error_code 塞在返回体里。
    // 两条路都要认 —— 漏掉返回体这种，风控（20028）会被当成「已经升级过」，
    // 于是按钮被错误地置灰，用户再也没有重试的机会。
    const bodyCode = pickNumber(body.error_code);
    if (bodyCode === 131001) {
      return 'already';
    }
    if (bodyCode === 20028) {
      return 'risk';
    }

    if (pickNumber(body.status) === 1) {
      return 'claimed';
    }
    // status 非 1 且没有明确错误码：按「今天已升级」处理，与领取接口的判断口径一致
    return 'already';
  } catch (error) {
    const code = pickErrorCode(error);
    if (code === 131001) {
      return 'already';
    }
    if (code === 20028) {
      return 'risk';
    }
    console.warn('[vip] 概念版升级失败:', code || error);
    return 'failed';
  }
}
