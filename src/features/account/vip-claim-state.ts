import { useSyncExternalStore } from 'react';

import { showToast } from '@/components/ui/toast';
import { getApiSession } from '@/lib/kugou-api';
import { readCache, writeCache } from '@/lib/offline-cache';

import {
  readSvipDayRecord,
  rememberSvipValid,
} from './vip-local-state';
import {
  attemptSvipUpgrade,
  claimDailyVipManually,
  type ManualVipClaimOutcome,
} from './vip-silent-claim';
import { fetchVipStatus } from './vip-api';

/**
 * 「我的」页面那颗 VIP 胶囊按钮的**共享状态**：自动领取、按钮点击、资料刷新三条路写的是同一份。
 *
 * ## 为什么必须有这个模块，而不是把 useState 写在按钮里
 *
 * 同一天有两条完全独立的入口：
 *
 * 1. 自动补领（`vip-play-claim` → `vip-silent-claim`：打开软件 / 开始播放 / 被 VIP 挡住）
 * 2. 用户在「我的」页面手动点按钮（SVIP = 先领当日畅听 VIP 再升级概念版）
 *
 * 两条路打的是**同一份账号额度**。如果各存一份状态，就会出现最难受的那种 bug：
 * 自动补领领完了，用户过十秒切到「我的」，按钮还显示可点；用户再点一次，
 * 服务端回 131001（今天已领），按钮才慢吞吞跳到下一步 —— 期间用户以为功能坏了，
 * 而重复请求本身还是风控的诱因。所以状态必须共享：任何一条路的结果，另一条路立刻可见。
 *
 * ## 状态从哪来（本地优先）
 *
 * 胶囊要回答的问题是「SVIP 现在有效吗」，优先读本地持久化记录（见 vip-local-state）——
 * 冷启动首帧就是正确状态，也不必为了显示一个布尔值打接口：
 * `moekoe.vip.svipDay`（一天一份）→ 首帧就能定；只有「不知道」时才由
 * `refreshConceptVip` 查一次 `/user/vip/detail`。
 *
 * ## 每日过期怎么实现
 *
 * 缓存键里带上「账号 + 当天日期」（形如 `moekoe.cache.vipClaim.1234567.2026-01-02`），
 * 换天或换账号时键本身就变了，读不到旧值，于是「每日重置」不需要任何定时器、
 * 也不需要判断时间戳。为什么要带账号，见 `currentScope` 的说明。
 */

export type VipClaimState = {
  /** 今天已经领到 1 天畅听 VIP（自动补领或手动领取都算）。 */
  dailyClaimed: boolean;
  /** 今天已经把畅听 VIP 升级成概念版。 */
  upgraded: boolean;
  /**
   * 概念版 SVIP 当前是否有效；`null` = 还没拿到可靠结论（正在查 / 查询失败）。
   *
   * 胶囊的主状态由它决定（详见 me.tsx 的 SvipChip），所以「未知」必须是一个独立的
   * 第三态：把它当成 false，SVIP 有效的用户会看到一个可点的按钮，白点一次；
   * 当成 true，则谁也别想领。
   */
  conceptValid: boolean | null;
  /** 有请求在飞 —— 用来挡重复点击，也用来给按钮显示忙碌态。 */
  loading: boolean;
};

const INITIAL_VIP_CLAIM_STATE: VipClaimState = {
  dailyClaimed: false,
  upgraded: false,
  conceptValid: null,
  loading: false,
};

/**
 * 与 `player/store.ts`、`settings/store.ts` 同款的极简 store。
 * 项目里没有全局状态库，这三处各自复制这 30 行比引入依赖更划算。
 */
function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const vipClaimStore = createStore(INITIAL_VIP_CLAIM_STATE);

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 只持久化业务标记，不存 `loading`。
 * 进程被杀时若把 `loading: true` 留下来，下次启动按钮会永远卡在忙碌态。
 *
 * `conceptValid` **不走这里**：它是按天失效的活状态，存在「账号 + 日期」的键里会让跨天读不到，
 * 而它需要的是「一天一份、当天可读」—— 所以落在 `moekoe.vip.svipDay`（见 vip-local-state）。
 */
type PersistedVipClaim = {
  dailyClaimed: boolean;
  upgraded: boolean;
};

/**
 * 状态的作用域 = 「哪个账号的哪一天」。
 *
 * 为什么必须带账号：VIP 额度是**按账号**算的。同一天在设备上换个账号登录，前一个账号领没领
 * 跟新账号毫无关系。只按日期存会让新账号一进来就看到「已领取」，而它其实什么都没领 ——
 * 按钮当天就再也点不动了，等于把新账号当天的领取机会堵死。
 *
 * 为什么必须带日期：应用可能整天挂在后台（听歌场景很常见），跨过零点后内存里还留着昨天的
 * `dailyClaimed: true`，界面会显示「今日已领」而实际上今天什么都没领。日期进入作用域后，
 * 跨天等于换了一个全新的作用域，旧标记自动作废，不需要任何定时器或时间戳比较。
 */
function currentScope(): { account: string; day: string } {
  // 会话尚未 hydrate 或未登录时是空串：那种情况下根本不会走领取逻辑，
  // 用 guest 兜底只是让键保持稳定，不会与任何真实账号互相污染
  return { account: getApiSession().userid || 'guest', day: todayKey() };
}

function storageKey(): string {
  const scope = currentScope();
  return `vipClaim.${scope.account}.${scope.day}`;
}

/** 当前内存状态属于哪个作用域；作用域一变就清空（见 `ensureScope`）。 */
let stateScope = storageKey();

/**
 * 内存状态的作用域变了（换天或换账号）就清空。
 *
 * 这里刻意不区分「为什么变」：两种变化的正确处理都是「当作今天还没领」，
 * 分成两条判断只会多一处可能写歪的地方。
 */
function ensureScope(): void {
  const scope = storageKey();

  if (scope === stateScope) {
    return;
  }

  stateScope = scope;
  // conceptValid 一起清掉：它不是「今天领没领」而是「此刻这个账号有没有概念版」，
  // 换账号后继续沿用上一个账号的结论，胶囊就会显示错误的状态。
  // 清空后由 syncFromStorage 重新从本地记录里读回来。
  vipClaimStore.setState({
    dailyClaimed: false,
    upgraded: false,
    conceptValid: null,
  });
}

function persist(): void {
  const { dailyClaimed, upgraded } = vipClaimStore.getState();
  const snapshot: PersistedVipClaim = { dailyClaimed, upgraded };
  void writeCache(storageKey(), snapshot);
}

/**
 * 把存储里的标记并进内存状态。
 *
 * 用「或」合并而不是直接覆盖：读取是异步的，从发起读到落地这段时间里用户完全可能已经
 * 点完领取。直接覆盖会让按钮从「已领取」倒回可点，用户看着自己刚领到的状态被吃掉，
 * 只能再点一次 —— 又是一次重复请求。同一天里这些标记都只会 false → true，
 * 所以「或」合并既安全又不会丢新状态。
 */
function applyStoredState(stored: PersistedVipClaim | null): void {
  const current = vipClaimStore.getState();
  const upgraded = current.upgraded || Boolean(stored?.upgraded);
  vipClaimStore.setState({
    upgraded,
    // upgraded 为真必然意味着当天已经领过畅听 VIP，存储里只写坏一半也不会出现
    // 「已升级但未领取」这种自相矛盾的状态
    dailyClaimed: current.dailyClaimed || upgraded || Boolean(stored?.dailyClaimed),
  });
}

let syncInFlight: Promise<void> | null = null;
let syncInFlightScope = '';
let syncToken = 0;

/**
 * 从持久化存储恢复当天状态。
 *
 * 幂等且可以重复调用（跨天、换账号、或别的路径直接写了缓存时用来重新对齐）。
 *
 * ## 为什么要按作用域去重，而不是简单地「有请求在飞就复用」
 *
 * 冷启动时根布局是**在会话 hydrate 之前**读的（那时 `userid` 还是空的，作用域是 guest），
 * 随后「我的」页面挂载时会话已经有了真实账号。如果这里无脑复用上一次的 Promise，
 * 按钮就会一直停在初始态 —— 恰好是最需要正确恢复的那一次启动。
 * 所以只有**同一作用域**的并发调用才复用，作用域变了必须重新读。
 *
 * 除了「今天领没领」，这里还顺带把胶囊需要的本地记录读回来：
 * `moekoe.vip.svipDay` —— 今天这一份 SVIP 记录（没有就保持「未知」，由页面去查一次）。
 * 它与账号/日期无关，所以上面那些作用域判断对它不适用，读到就登记。
 */
export function syncFromStorage(): Promise<void> {
  const scope = storageKey();

  if (syncInFlight && scope === syncInFlightScope) {
    return syncInFlight;
  }

  const token = ++syncToken;
  syncInFlightScope = scope;

  syncInFlight = (async () => {
    ensureScope();
    const [stored, svipRecord] = await Promise.all([
      readCache<PersistedVipClaim>(scope),
      readSvipDayRecord(),
    ]);

    // 本地记录与账号无关，先登记：即使下面因为作用域变了而提前返回，
    // 胶囊的「今天的 SVIP 结论」也是对的
    vipClaimStore.setState({
      // 只有「今天这一份、且写着有效」才敢直接显示有效中；
      // 写着无效时也只是「已知无效」（按钮可点），不是「未知」
      conceptValid: svipRecord ? svipRecord.valid : vipClaimStore.getState().conceptValid,
    });

    // 读取期间作用域又变了（会话 hydrate 完、换账号、跨天）：这份数据已经不属于当前作用域，
    // 直接丢掉。不丢的话会把上一个账号「今天已领」的状态写到新账号头上。
    if (scope !== storageKey()) {
      return;
    }

    applyStoredState(stored);
  })()
    .catch(() => undefined)
    .finally(() => {
      // 只有最后发起的那次读取结束时才清标记，避免先发出的旧读取把新读取的标记清掉
      if (syncToken === token) {
        syncInFlight = null;
      }
    });

  return syncInFlight;
}

/** 按钮与 toast 的文案集中在这里，避免「领取」和「升级」两条链路的措辞各自漂移。 */
const TOAST = {
  dailyClaimed: '已领取 1 天畅听 VIP',
  dailyAlready: '今天的畅听 VIP 已经领过啦',
  upgraded: '已升级为概念版 VIP',
  /** 风控文案要给出**出路**，只说「领取失败」用户会一直点，越点越糟。 */
  risk: '账号触发风控，请明天再试或到酷狗官方客户端领取',
  notLoggedIn: '请先登录酷狗账号',
  claimFailed: '领取失败，请检查网络后重试',
  upgradeFailed: '升级失败，请稍后重试',
  /**
   * 升级也按天记账（成功失败都算）：今天那一次已经发出去过了。
   * 必须给出**出路**（明天再试），否则用户会一直点，而每次都只是白点。
   */
  upgradeAttempted: '今天的升级机会已经用过了，明天再试',
} as const;

/**
 * 手动领取当天 1 天畅听 VIP —— **SVIP 领取链路的第一步**（第二步是 `upgradeToConcept`）。
 *
 * 它是用户主动点出来的，所以走 `claimDailyVipManually`：与自动补领共用同一套实现，
 * 但用**独立的按天标记**（自动那一次用掉也不影响手动兜底，反之亦然）。
 *
 * ## 节流在两个层次上，缺一不可
 *
 * - **状态层**（这里）：`loading` 挡连点、`dailyClaimed` 挡「今天已经拿到」后的重复点击。
 * - **存储层**（`claimDailyVipManually`）：独立的按天标记，成功失败都算，
 *   且**标记写在请求之前**。这一层才是硬上限 —— 状态层挡不住「进程重启」和
 *   「上次失败后 `dailyClaimed` 仍是 false」这两种情况（那正是原来这条路的洞：
 *   `failed`/`risk` 之后按钮还能点，点一次就是一次真实请求）。
 *
 * 返回 `'claimed'`（领到了）与 `'already'`（今天已领）都算达成目标并推进状态 ——
 * 「已领过」对用户来说就是「这一步不用做了」，停在原地不给任何反应才是最糟的交互。
 * 返回 `'blocked'` = 今天的手动额度已经用掉，**什么都没做**（调用方据此决定是否再补提示）。
 */
export async function claimDaily(): Promise<ManualVipClaimOutcome> {
  ensureScope();

  const snapshot = vipClaimStore.getState();
  // 已经在飞或今天已领都直接返回：领取接口对请求节奏敏感，连点会把账号推到风控，
  // 所以这里不只是「按钮禁用」的视觉问题，而是必须在状态层挡住。
  if (snapshot.loading || snapshot.dailyClaimed) {
    return 'blocked';
  }

  vipClaimStore.setState({ loading: true });

  let outcome: ManualVipClaimOutcome;
  try {
    // 走带「一天一次」标记的那条实现，而不是直接打接口 —— 理由见上面的第二条
    outcome = await claimDailyVipManually();
  } catch (error) {
    // claimDailyVipManually 内部已经兜住了接口异常，但 bootstrapMobileApi 在 try 之外，
    // 所以仍然可能抛。不兜的话 loading 会永远挂着，按钮再也点不动。
    console.warn('[vip] 手动领取异常:', error);
    outcome = 'failed';
  }

  vipClaimStore.setState({ loading: false });

  switch (outcome) {
    case 'claimed':
      vipClaimStore.setState({ dailyClaimed: true });
      persist();
      showToast(TOAST.dailyClaimed);
      return 'claimed';
    case 'already':
      vipClaimStore.setState({ dailyClaimed: true });
      persist();
      showToast(TOAST.dailyAlready);
      return 'already';
    case 'risk':
      showToast(TOAST.risk);
      return 'risk';
    case 'not-logged-in':
      showToast(TOAST.notLoggedIn);
      return 'not-logged-in';
    case 'blocked':
      // 今天的手动额度已经用掉：什么都不做，也不弹（弹了只是噪音）
      return 'blocked';
    case 'failed':
      showToast(TOAST.claimFailed);
      return 'failed';
  }
}

/**
 * SVIP 胶囊的领取链路：**先领当天 1 天畅听 VIP，再升级概念版**。
 *
 * 为什么要连做两步：服务端要求「当天必须先领过畅听 VIP」才允许升级
 * （见 `upgradeToConcept` 的前置判断），少一步升级必然失败、还会白打一次接口。
 *
 * 为什么今天已经领过时跳过第一步：那是常态（自动补领已经把畅听 VIP 领了），
 * 这时用户点 SVIP 只差「升级」这一步，再打一次领取接口纯属重复请求。
 *
 * 失败即止：第一步没成功（风控 / 未登录 / 今天的手动额度已用掉）就不要再打升级接口 ——
 * 前置条件不成立，那一次请求注定失败。各自的原因在 `claimDaily` 里已经提示过了。
 */
export async function claimSvip(): Promise<void> {
  ensureScope();

  if (vipClaimStore.getState().loading) {
    return;
  }

  if (!vipClaimStore.getState().dailyClaimed) {
    const daily = await claimDaily();
    if (daily !== 'claimed' && daily !== 'already') {
      return;
    }
  }

  await upgradeToConcept();
}

/**
 * 登记「刚查到的概念版状态」（唯一可信的 SVIP 判断依据）。
 *
 * 存在的意义是**省掉一次重复请求**：「我的」页面拉资料时打的 `fetchUserProfile` 内部就是
 * `/user/vip/detail`（和 `fetchVipStatus` 同一个接口），把那份结果直接登记进来，
 * 胶囊就不用为了一个布尔值再查一遍。
 *
 * 同时写「今天这一份」SVIP 记录：下次冷启动首帧就能把胶囊画对（也是自动补领的第二道闸）。
 */
export function markConceptStatus(valid: boolean): void {
  ensureScope();
  vipClaimStore.setState({ conceptValid: valid });
  void rememberSvipValid(valid);
}

/**
 * 主动查一次概念版状态（胶囊的兜底路径）。
 *
 * 已经有结论就直接返回：正常路径下 `markConceptStatus` 或 `syncFromStorage` 已经登记过了，
 * 这里再查就是纯重复请求。只有「还不知道」时才真的发请求，所以它可以安全地挂在组件挂载的
 * 副作用里 —— 这也是「本地记录说 SVIP 还有效 → 一次请求都不发」得以成立的原因。
 */
export async function refreshConceptVip(): Promise<void> {
  ensureScope();

  if (vipClaimStore.getState().conceptValid !== null) {
    return;
  }

  const scope = storageKey();
  try {
    const status = await fetchVipStatus();
    // 查询期间作用域变了（会话 hydrate 完成 / 换账号 / 跨天）：这份结论已经不属于当前账号，
    // 直接丢掉，否则会把上一个账号的 VIP 状态写到新账号头上
    if (scope !== storageKey()) {
      return;
    }
    vipClaimStore.setState({ conceptValid: status.conceptValid });
    void rememberSvipValid(status.conceptValid);
  } catch (error) {
    // 查不到就保持「未知」，胶囊显示查询态而不是错判成失效
    console.warn('[vip] 查询概念版状态失败:', error);
  }
}

/**
 * 把当天领到的畅听 VIP 升级为概念版 —— **SVIP 领取链路的第二步**（第一步是 `claimDaily`）。
 *
 * 两步的**实际实现都在 vip-silent-claim**（`claimDailyVipManually` / `attemptSvipUpgrade`），
 * 这里只负责界面状态与文案：两条路（SVIP 胶囊手动、自动补领）用的是同一份实现，
 * 区别只在标记（自动/手动各一份独立额度）与要不要弹 toast。
 */
export async function upgradeToConcept(): Promise<void> {
  ensureScope();

  const snapshot = vipClaimStore.getState();
  // 服务端要求「当天必须先领过畅听 VIP」才允许升级；没领就点的话请求必然失败，
  // 白白多打一次接口（还可能被算进风控），所以这里直接拦下，不给它发出去的机会。
  if (snapshot.loading || snapshot.upgraded || !snapshot.dailyClaimed) {
    return;
  }

  vipClaimStore.setState({ loading: true });

  let outcome: Awaited<ReturnType<typeof attemptSvipUpgrade>>;
  try {
    outcome = await attemptSvipUpgrade('manual');
  } catch (error) {
    console.warn('[vip] 手动升级异常:', error);
    outcome = 'failed';
  }

  vipClaimStore.setState({ loading: false });

  switch (outcome) {
    case 'claimed':
    case 'already':
      // 两种都算达成：置灰按钮，避免用户反复点到风控。
      // conceptValid 一起置真 —— 升级成功就等于「此刻有概念版」，
      // 胶囊要立刻变灰，不能等下一次拉资料（那中间用户会以为没成功而再点一次）。
      // SVIP 的「今天这一份」记录由 attemptSvipUpgrade 写好了。
      vipClaimStore.setState({ upgraded: true, dailyClaimed: true, conceptValid: true });
      persist();
      showToast(TOAST.upgraded);
      return;
    case 'risk':
      showToast(TOAST.risk);
      return;
    case 'not-logged-in':
      showToast(TOAST.notLoggedIn);
      return;
    case 'blocked':
      // 今天这次升级机会已经用掉（成功失败都算）：如实说明，别让用户以为点坏了
      showToast(TOAST.upgradeAttempted);
      return;
    case 'failed':
      showToast(TOAST.upgradeFailed);
  }
}

/**
 * 登记「今天已经领过每日 VIP」，供静默领取第一步的回调使用。
 *
 * 刻意**不**走 `claimDaily()`：那条路已经自己打完领取接口了，这里再调一次就是重复请求
 * （正是风控的诱因），只需要把结果登记下来 —— 这样胶囊、以及别的读这份状态的地方
 * 都立刻知道今天已经领过，不会再去打接口。
 */
export function markDailyClaimed(): void {
  ensureScope();
  vipClaimStore.setState({ dailyClaimed: true });
  persist();
}

/**
 * 登记「自动路径刚刚把概念版升级成功了」。
 *
 * 自动那一步不弹 toast（每一步都弹会变成骚扰），但状态必须落下来：否则胶囊要等到
 * 下次拉资料才变灰，中间用户会以为没成功而再点一次 —— 那一次就是白打的请求。
 */
export function markSvipUpgraded(): void {
  ensureScope();
  vipClaimStore.setState({ upgraded: true, dailyClaimed: true, conceptValid: true });
  persist();
}

export function useVipClaimState(): VipClaimState {
  return useSyncExternalStore(
    vipClaimStore.subscribe,
    vipClaimStore.getState,
    vipClaimStore.getInitialState
  );
}
