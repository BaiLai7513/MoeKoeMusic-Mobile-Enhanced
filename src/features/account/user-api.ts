import { pickNumber, pickStringLike, pickText, toRecord } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

import { parseVipStatus } from './vip-api';
import { rememberSvipValid, rememberVipEndTimeMs } from './vip-local-state';

export type UserProfile = {
  userid: string;
  nickname: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  signature: string;
  fans: number;
  follows: number;
  listenMinutes: number;
  isVip: boolean;
  vipLabel: string;
  /** VIP 到期时间（毫秒）；0 表示拿不到。静默领取靠它判断是否需要补领。 */
  vipEndTimeMs: number;
  /**
   * **概念版** VIP 是否有效。
   *
   * 单独带一个字段是为了让「我的」页面那个按钮直接用它：按钮要判的是「有没有概念版」，
   * 而不是 `isVip`（任意一种 VIP）。资料本来就是 `/user/vip/detail` 拉的，
   * 顺手带上就不必为这一个布尔再打一次同样的接口。
   */
  conceptValid: boolean;
};

export function isLoggedIn(): boolean {
  const session = getApiSession();
  return Boolean(session.userid && session.userid !== '0' && session.token);
}

export async function fetchUserProfile(): Promise<UserProfile> {
  await bootstrapMobileApi();
  const [detailResult, vipResult] = await Promise.allSettled([
    mobileApi.user_detail({}),
    mobileApi.user_vip_detail({}),
  ]);

  if (detailResult.status === 'rejected') {
    throw detailResult.reason instanceof Error
      ? detailResult.reason
      : new Error('获取用户信息失败');
  }

  const data = toRecord(toRecord(detailResult.value.body).data);
  const session = getApiSession();

  // VIP 状态统一由 vip-api 解析，避免两处各写一套字段兜底逻辑
  const vipStatus =
    vipResult.status === 'fulfilled' ? parseVipStatus(vipResult.value.body) : null;

  /*
   * 顺手把这次拿到的**权威**状态落进本地缓存（见 vip-local-state）：
   * 自动补领与胶囊按钮从此只读本地，不再为了判断状态单独打一次 /user/vip/detail，
   * 而这里反正已经查到了 —— 让它成为下一次冷启动的判断依据。
   *
   * 只有真的拿到了服务端回答（vipStatus 非 null）才写：请求失败不是「没有 VIP」，
   * 而是「没问到」，那种情况下写入会把一条本来正确的本地记录清掉。
   */
  if (vipStatus) {
    void rememberVipEndTimeMs(vipStatus.endTimeMs);
    // SVIP 的「今天这一份」：权威回答才有资格写（见 vip-local-state 的 rememberSvipValid）
    void rememberSvipValid(vipStatus.conceptValid);
  }

  return {
    userid: pickStringLike(data.userid, session.userid),
    nickname: pickText(data.nickname, `用户 ${session.userid ?? ''}`),
    avatarUrl: sizedImage(pickText(data.pic), 240),
    backgroundUrl: sizedImage(pickText(data.bg_pic), 720),
    signature: pickText(data.descri),
    fans: pickNumber(data.fans),
    follows: pickNumber(data.follows),
    listenMinutes: pickNumber(data.duration),
    isVip: vipStatus?.isVip ?? false,
    vipLabel: vipStatus?.vipLabel ?? '',
    vipEndTimeMs: vipStatus?.endTimeMs ?? 0,
    // VIP 那条请求失败时按「没有概念版」处理，与上面 isVip 的口径一致：
    // 未知状态下让按钮可点（失败会如实提示），比把按钮灰住不给出路好
    conceptValid: vipStatus?.conceptValid ?? false,
  };
}
