import { pickNumber, pickStringLike, pickText, toRecord } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

import { parseVipStatus } from './vip-api';

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
  };
}
