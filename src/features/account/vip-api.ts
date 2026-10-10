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
 * 本文件**只调用领取接口，永不调用升级接口** —— 个人版不做「自动升级概念版」
 * （那会消耗用户的额外额度），这一点靠物理隔离保证，而不是靠调用方的自觉。
 */

export type VipStatus = {
  /** 当前是否处于 VIP 有效期内。 */
  isVip: boolean;
  /** 展示用标签：SVIP / VIP / 空。 */
  vipLabel: string;
  /** VIP 到期时间（毫秒时间戳）；0 表示拿不到或没有记录。 */
  endTimeMs: number;
};

const EMPTY_VIP_STATUS: VipStatus = { isVip: false, vipLabel: '', endTimeMs: 0 };

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
 * 从 `/user/vip/detail` 的返回体解析 VIP 状态。
 * `busi_vip[]` 里通常 `[0]` 是概念版、`[1]` 是畅听版，取**有效期内的那一个**。
 */
export function parseVipStatus(body: unknown): VipStatus {
  const records = toRecords(toRecord(toRecord(body).data).busi_vip);
  if (!records.length) {
    return EMPTY_VIP_STATUS;
  }

  const active = records.find((item) => pickNumber(item.is_vip) === 1);
  if (!active) {
    return EMPTY_VIP_STATUS;
  }

  return {
    isVip: true,
    vipLabel: pickText(active.product_type).toLowerCase() === 'svip' ? 'SVIP' : 'VIP',
    endTimeMs: parseVipEndTime(active.vip_end_time),
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
