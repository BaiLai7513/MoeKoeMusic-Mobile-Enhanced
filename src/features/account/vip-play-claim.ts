import { showToast } from '@/components/ui/toast';
import {
  onPlaybackStart,
  onVipBlockedPlayback,
  retryVipBlockedTrack,
} from '@/features/player/store';
import { bootstrapMobileApi } from '@/lib/kugou-api';

import { markDailyClaimed, markSvipUpgraded } from './vip-claim-state';
import { claimDailyVipNow, scheduleSilentVipClaim, VIP_CLAIMED_TOAST } from './vip-silent-claim';

/**
 * 把「每日畅听 VIP 的自动补领」挂到播放器上。
 *
 * ## 为什么触发点在这里，而不是启动时
 *
 * 原来是在根布局里、启动后立刻排一次领取。问题有两个：
 *
 * 1. **请求特征太像脚本**：一启动就打领取接口，这个节奏和真人的行为对不上，
 *    而酷狗对这个接口正是按节奏判风控的（20028）。
 * 2. **时机与额度都不对**：用户开 App 不代表要听歌。真开始听歌时才需要 VIP，
 *    也只有那时补领才有意义。
 *
 * 挂在播放器上还有个好处：**锁屏、耳机线控、通知栏切歌**这些原生发起的播放同样覆盖到，
 * 因为它们最终都会走 player store 的状态更新（见 `onPlaybackStart` 的说明）。
 *
 * ## 三个触发时机为什么都在这里
 *
 * 1. **开始播放**（`onPlaybackStart`）：真正要听歌的那一刻。
 * 2. **被 VIP 挡住**（`onVipBlockedPlayback`）：用户点到的歌因为缺 VIP 放不了。
 *    那一刻用户是「正在听歌却没有 VIP」，让他等随机延时纯属伤害体验，所以立刻补领。
 * 3. **打开软件**（bootstrap 完成时排一次）：用户开了 App 却没听歌时，VIP 也该补上。
 *
 * 三条路都不自己实现节流，全部交给 `vip-silent-claim`：同一自然日一次会话尝试 + 按天一次
 * （成功失败都算）+ 两次流程之间的最小间隔。后两个入口最多只能「把已经在排队的那一次提前」
 * 或者「在本次会话还什么都没试过时补上一次」，**不会**让任何一层节流被绕过，
 * 也不会让请求次数上界变大（详见那个文件的文件头）。
 *
 * 另外，两条路的「VIP 还没过期」判断都是**纯本地**的（见 vip-local-state）：本地记录说还有效时
 * 直接退出，一次网络请求都不发 —— 所以「每次开播都查一次状态」这件事已经不存在了。
 *
 * ## 为什么自动路径只能领每日畅听 VIP
 *
 * 这里**只调 `scheduleSilentVipClaim` / `claimDailyVipNow`**，它们内部只碰两个接口：
 * `youth/day/vip`（领 1 天畅听 VIP）与 `youth/day/vip/upgrade`（升级概念版）。
 * 用户手动那一次（「我的」页那颗 `SVIP` 胶囊）走的是同两个接口的另一套按天额度，
 * 两条路互不占用 —— 具体见 vip-silent-claim 的文件头。
 */

/** 只挂一次：根布局可能因为热重载等原因被重复求值，挂两次就等于一次开播排两次检查。 */
let attached = false;

/**
 * 第一步（领 1 天畅听 VIP）有结果时的统一处理。
 *
 * 三条触发路必须完全一致：少任何一步都会出现「这条路领到了但界面/播放器不知道」的怪状态。
 *
 * `already`（今天本来就领过）只登记状态、不弹 toast：那一下并没有真的领到东西，
 * 说「已自动领取」是假话。但不登记的话界面会以为今天没领，用户点SVIP 胶囊就会白发一次请求。
 */
function handleDailyStep(outcome: 'claimed' | 'already'): void {
  markDailyClaimed();

  if (outcome === 'claimed') {
    showToast(VIP_CLAIMED_TOAST);
    // 领到 VIP 意味着「刚才那首因为缺 VIP 而失败」的前提已经不成立：原地重新解析它。
    // 只在当前曲目确实还是那一首时才动手 —— 用户已经切到别的歌就什么都不要做（见该函数的说明）
    retryVipBlockedTrack();
  }
}

/**
 * 第二步（自动升级概念版）成功。
 *
 * 刻意**不弹 toast**：自动路径两步都弹会变成骚扰，用户要的「领取成功有提示」由第一步负责。
 * 但状态必须登记，否则胶囊要等下次拉资料才变灰，中间用户会以为没成功再点一次。
 * 日志那一边由 vip-silent-claim 负责（它是自动路径唯一的痕迹）。
 */
function handleUpgraded(): void {
  markSvipUpgraded();
}

/** 三条触发路共用同一份回调，避免某条路少登记一个状态。 */
const CLAIM_OPTIONS = { onDailyStep: handleDailyStep, onUpgraded: handleUpgraded };

export function attachVipClaimToPlayback(): void {
  if (attached) {
    return;
  }
  attached = true;

  onPlaybackStart(() => {
    scheduleSilentVipClaim(CLAIM_OPTIONS);
  });

  // 用户点到的歌因为缺 VIP 播不了：这时再等随机延时就是让他一首接一首白跳。
  // claimDailyVipNow 只做「提前结束等待 / 补上本次会话那一次尝试」，节流一条都不绕过
  onVipBlockedPlayback(() => {
    claimDailyVipNow(CLAIM_OPTIONS);
  });

  /*
   * 「打开软件触发一次」。
   *
   * 为什么必须等 bootstrap：会话（token/userid）是异步 hydrate 的，模块作用域这一刻还是空的，
   * 直接排会撞上 `scheduleSilentVipClaim` 的未登录早返回（那条早返回刻意不消耗会话标记，
   * 所以也不算白费，但「开了 App 就补领」这件事就落空了）。bootstrapMobileApi 幂等且启动时
   * 本来就会跑，借它的 Promise 当「会话就绪」信号，不用再往外导出内部的 hydrate 函数。
   *
   * 三个触发时机（打开软件 / 开始播放 / 被 VIP 挡住）共用同一套「一天一次」节流，
   * 所以多接这一个入口**不会**让请求变多：它只是让「开了 App 但还没听歌」的那一天也能补上。
   */
  void bootstrapMobileApi()
    .then(() => scheduleSilentVipClaim(CLAIM_OPTIONS))
    .catch(() => undefined);
}
