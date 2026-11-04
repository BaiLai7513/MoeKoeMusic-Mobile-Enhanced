import { AppState } from 'react-native';

import { showToast } from '@/components/ui/toast';
import {
  onPlaybackStart,
  onVipBlockedPlayback,
  retryVipBlockedTrack,
} from '@/features/player/store';
import { bootstrapMobileApi } from '@/lib/kugou-api';

import { markDailyClaimed, markSvipUpgraded } from './vip-claim-state';
import { subscribeVipAlarmDue, type VipAlarmDuePayload } from './vip-deadline';
import {
  alarmSilentVipClaim,
  claimDailyVipNow,
  refreshVipStatusIfStale,
  resumeAutoUpgrade,
  resumeSilentVipClaim,
  scheduleSilentVipClaim,
  takeAutoClaimFailureReminder,
  VIP_CLAIMED_TOAST,
} from './vip-silent-claim';

/**
 * 把「每日畅听 VIP 的自动补领」挂到**所有触发源**上。
 *
 * ## 五个触发点，两条主线
 *
 * | 触发点 | 谁叫起来 | 目的 |
 * |---|---|---|
 * | 开始播放（`onPlaybackStart`） | 播放器 | 真正要听歌的那一刻补上 |
 * | 被 VIP 挡住（`onVipBlockedPlayback`） | 播放器 | 用户正在白跳歌，立刻领 |
 * | 闹钟到期（`VipAlarmReceiver` → 设备事件） | AlarmManager | **前台停留跨期 / 后台到期**的主要触发 |
 * | 回前台（`AppState` active） | 用户 | 兜底：闹钟没响成、权限被拒、重启恢复失败 |
 * | 冷启动（bootstrap 完成） | 进程 | 同上，冷启动不会触发 AppState 的 change |
 *
 * 五条路**都不自己实现节流或请求**：全部交给 `vip-silent-claim` 的同一个入口
 * （`scheduleSilentVipClaim` / `resumeSilentVipClaim` / `alarmSilentVipClaim` /
 * `claimDailyVipNow`），而「该不该领」只看 `vip-deadline` 里那一个时间戳。
 *
 * ## 为什么闹钟不直接发请求
 *
 * `VipAlarmReceiver` 只做三件事：看是否到期、`goAsync()` + 唤醒锁把进程按一会儿、
 * 往 JS 发一个「到期了」事件。**网络请求发生在 JS 里**（这里），因为酷狗签名只有 JS 有
 * （`api/` 是打进 bundle 的 node 模块）。详见报告里的「架构选型」。
 *
 * ## 为什么不用 `player.tsx` 挂 onResume
 *
 * player 页是「点开播放器」才挂载的 modal，用户不开播放器就没有 onResume ——
 * 而这条兜底恰恰要在「用户切回 App」时无条件生效。所以挂在根布局的模块作用域。
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

  if (outcome !== 'claimed') {
    return;
  }

  if (AppState.currentState !== 'active') {
    /*
     * 后台/锁屏状态下领到的：**不弹提示，也不要在半夜把歌放起来**。
     *
     * `retryVipBlockedTrack` 会把「因缺 VIP 失败」的那首歌原地重放 —— 在用户正看着屏幕
     * 时这是雪中送炭，在他半夜睡觉时就是惊吓。状态已经登记，回前台自然能看到结果。
     */
    console.log('[vip] 后台领取成功（不弹提示、不自动继续播放）');
    return;
  }

  showToast(VIP_CLAIMED_TOAST);
  // 领到 VIP 意味着「刚才那首因为缺 VIP 而失败」的前提已经不成立：原地重新解析它。
  // 只在当前曲目确实还是那一首时才动手 —— 用户已经切到别的歌就什么都不要做（见该函数的说明）
  retryVipBlockedTrack();
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

/**
 * 第一步（领 1 天畅听 VIP）**失败**。
 *
 * 自动领取是**一天一次**：失败也把今天那一次用掉，所以「等自动重试」指望不上。
 * 用户唯一能自救的动作是**手动领**（`claimDailyVipManually`、独立额度、立即发请求、
 * 不等任何退避），所以这里要把提示弹出来。
 *
 * 两个时机都要覆盖：
 * - 失败发生在前台（例如用户正因缺 VIP 被跳过）→ 立刻提示；
 * - 失败发生在后台（闹钟在凌晨叫醒）→ **不弹**（半夜不该吵醒人），
 *   只把状态留在按天记录里；下次回前台由 `handleForeground` 补弹一次
 *   （`takeAutoClaimFailureReminder` 保证一天只弹一次）。
 *
 * 与成功提示同一条规矩：后台只记日志。
 */
function handleDailyFailed(outcome: 'risk' | 'failed'): void {
  if (AppState.currentState !== 'active') {
    console.log(`[vip] 后台自动领取失败（${outcome}），回前台时再提示手动领取`);
    return;
  }

  // 取到文案的同时会把「已提示」落盘：同一次失败不会在切前台时再弹一遍
  void takeAutoClaimFailureReminder().then((hint) => {
    if (hint) {
      showToast(hint);
    }
  });
}

/** 五条触发动共用同一份回调，避免某条路少登记一个状态。 */
const CLAIM_OPTIONS = {
  onDailyStep: handleDailyStep,
  onDailyFailed: handleDailyFailed,
  onUpgraded: handleUpgraded,
};

/**
 * 回到前台（含冷启动）。
 *
 * 两件事，缺一不可：
 * 1. **到期/有待领取标记** → 立刻走统一入口补领（覆盖「闹钟被系统清掉」「精确闹钟权限被拒」
 *    「重启后恢复失败」「用户在后台被冻结」所有情况）；
 * 2. **未到期** → 把闹钟重算一次并重排。用户改过时间、清过缓存、刚授予精确闹钟权限时，
 *    原闹钟可能已经不在了；原生侧对「同一个截止时间已排过」会跳过，所以这里重复调不会
 *    把 inexact 闹钟一次次往后推。
 */
async function handleForeground(): Promise<void> {
  /*
   * 先补一次「今天自动领取失败」的提示（如果昨天/半夜那次失败了）。
   *
   * 失败大多发生在没有界面的时机（闹钟在凌晨叫醒、后台开播），那时不能弹；
   * 用户回到前台是唯一能及时告诉他的时机 —— 而且这是**唯一的自救入口**：
   * 自动那条一天只有一次，手动领取则是独立额度、立即发请求。
   *
   * `takeAutoClaimFailureReminder` 取到文案的同时会落盘「已提示」，所以反复切前台只弹一次。
   */
  const reminder = await takeAutoClaimFailureReminder();
  if (reminder) {
    showToast(reminder);
  }

  /*
   * 先问一次服务端「现在到底有没有 VIP / SVIP」，再决定领不领。
   *
   * 刚登录 / 换账号时本地缓存是空的或上一个账号的，直接走闸门会误判成「没有权益」，
   * 于是白发一次领取请求（服务端只会回 131001）。缓存 10 分钟内才算新鲜，不重复问。
   */
  await refreshVipStatusIfStale();

  /*
   * 先补「今天领到、但升级那一步丢了」的情况。
   *
   * 判定在 `resumeAutoUpgrade` 内部（今天领过 + 今天还没升级 + SVIP 不是有效），
   * 它自己最多打一次接口，所以反复回前台是安全的。5 秒定时器被冻住而丢掉 SVIP
   * 正是 2026-11-04 那次事故的形状。
   */
  await resumeAutoUpgrade();

  /*
   * 领取这一步**不再看「下次可领取时间」**：闸门在 `runSilentVipClaim` 里（按 VIP 日标记）。
   * 每次回前台都问一次，代价只是一次本地存储读取；今天已经领过时它会安静退出。
   */
  const started = resumeSilentVipClaim(CLAIM_OPTIONS);
  if (!started) {
    console.log('[vip] 回前台：已有领取流程在进行（或未登录），本次不重复触发');
  }
}

/**
 * 闹钟到期（原生只负责叫醒）。
 *
 * 这里**不做任何网络请求**，只是把流程交给统一入口；请求发生在 `runSilentVipClaim` 里。
 * 如果没能启动（另一个流程正在飞、或未登录），就什么都不做：
 * - 另一个流程结束时会把原生交接释放掉；
 * - 未登录时原生会等它自己的 45 秒超时后放手，「待领取」标记留着，下次回前台补领。
 */
function handleAlarmDue(payload: VipAlarmDuePayload): void {
  console.log(`[vip] 闹钟到期（cycle=${payload.cycleId}），交给统一领取入口`);
  const started = alarmSilentVipClaim(CLAIM_OPTIONS);
  if (!started) {
    console.log('[vip] 闹钟触发的这次没能启动领取（已有流程在飞 / 未登录）');
  }
}

export function attachVipClaimTriggers(): void {
  if (attached) {
    return;
  }
  attached = true;

  onPlaybackStart(() => {
    scheduleSilentVipClaim(CLAIM_OPTIONS);
  });

  // 用户点到的歌因为缺 VIP 播不了：这时再等随机延时就是让他一首接一首白跳。
  // claimDailyVipNow 只做「提前结束等待 / 补上本次那一次尝试」，闸门一条都不绕过
  onVipBlockedPlayback(() => {
    claimDailyVipNow(CLAIM_OPTIONS);
  });

  // 闹钟到期的唯一出口。原生只在**到期**时发它，且不在回调里联网。
  subscribeVipAlarmDue(handleAlarmDue);

  // 回前台兜底。AppState 在冷启动时不会触发 change，所以下面还有一次「等 bootstrap 完成」。
  AppState.addEventListener('change', (next) => {
    if (next !== 'active') {
      return;
    }
    void handleForeground();
  });

  /*
   * 「打开软件 / 冷启动」这一次。
   *
   * 为什么必须等 bootstrap：会话（token/userid）是异步 hydrate 的，模块作用域这一刻还是空的，
   * 直接排会撞上 `runSilentVipClaim` 的未登录早返回（那条早返回刻意不消耗任何标记，
   * 所以也不算白费，但「开了 App 就补领」这件事就落空了）。bootstrapMobileApi 幂等且启动时
   * 本来就会跑，借它的 Promise 当「会话就绪」信号，不用再往外导出内部的 hydrate 函数。
   */
  void bootstrapMobileApi()
    .then(() => handleForeground())
    .catch(() => undefined);
}
