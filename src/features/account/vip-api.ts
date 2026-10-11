import { pickNumber, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

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
};

const EMPTY_VIP_STATUS: VipStatus = {
  isVip: false,
  vipLabel: '',
  endTimeMs: 0,
  conceptValid: false,
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
    endTimeMs: activeRecords.reduce(
      (latest, item) => Math.max(latest, parseVipEndTime(item.vip_end_time)),
      0
    ),
    conceptValid,
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

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 静默领取 1 天畅听 VIP。
 *
 * 与官方版的区别：
 * - **不弹任何 UI**，结果只进日志（调用方按需决定是否提示）
 * - **不询问是否升级概念版**，领取成功后直接结束
 * - 不做重试：风控 / 今日已领都直接返回，避免加剧风控
 */
export async function claimDailyVipSilently(): Promise<VipClaimOutcome> {
  if (!getApiSession().token) {
    return 'not-logged-in';
  }

  await bootstrapMobileApi();

  try {
    const response = await mobileApi.youth_day_vip({ receive_day: todayKey() });
    const body = toRecord(response.body);
    if (pickNumber(body.status) === 1) {
      return 'claimed';
    }
    // status 非 1 且没抛错：按「今天已领」处理，不当作失败
    return 'already';
  } catch (error) {
    const code = pickErrorCode(error);
    if (code === 131001) {
      return 'already';
    }
    if (code === 20028) {
      return 'risk';
    }
    console.warn('[vip] 静默领取失败:', code || error);
    return 'failed';
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
