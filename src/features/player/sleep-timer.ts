import { useSyncExternalStore } from 'react';

import { showToast } from '@/components/ui/toast';
import { getCurrentPlaybackRate } from '@/features/settings/store';

import { PlayerManager } from './PlayerManager';
import { playerActions } from './store';

/**
 * 睡眠定时（到点先淡出音量，再暂停）。
 *
 * ## 为什么状态放在模块里，而不是播放页的 useState
 *
 * 定时器的语义是「不管我现在在哪个页面（甚至已经锁屏），到点都要停」。
 * 挂在 `/player` 页面上会遇到最典型的一次误用：用户设完定时就退出播放页，
 * 页面卸载把 interval 一起带走 —— 定时看起来设上了，实际什么都不会发生。
 *
 * ## 为什么是「每秒自检」而不是 setTimeout(到点)
 *
 * 一把梭的 setTimeout 有两个坑，都在真机上必然遇到：
 * - 定的是 60 分钟，中途用户 seek / 切歌 / 暂停，`setTimeout` 不知道这些事；
 * - 应用退到后台后系统会压慢 JS 定时器，长定时的误差会累计到几十秒。
 *
 * 这里只做「读当前时间（或原生进度）→ 与目标比对」的纯检查，每次自检都是独立正确的，
 * 被压慢只会让它晚几秒动手，不会漏。
 *
 * ## 暂停时还倒计时吗？继续倒。
 *
 * 定的是「多久之后关掉播放」这件**时间**上的事，而不是「再放多久」。用户按下暂停去接电话、
 * 回来又继续听，是很正常的操作；如果暂停就冻结倒计时，他会得到一个「设了 60 分钟、
 * 结果凌晨三点还在放」的夜晚。代价是「暂停状态下到点」也会走一遍淡出 + 暂停
 * （此时本就无声，用户感知为「定时自动结束了」），之后音量会被还原，不影响下次播放。
 */

/** 固定档位时长（分钟）。与原版桌面端一致；自定义时长走 sleepTimerActions.start。 */
export const SLEEP_TIMER_MINUTES = [15, 30, 60, 90] as const;

/**
 * 自定义时长的允许范围（分钟）。
 *
 * 下限 1：0 与负数不构成「定时」；上限 720（12 小时）：再长通常意味着「设完就忘了」，
 * 到点没停反而更糟，而且 3 位数字是播放页药丸能稳住宽度的上限
 * （见 formatLongClock 的注释）。范围定义放在这里而不是面板里，
 * 是为了让「面板提示的范围 / 输入校验 / store 的兜底」永远用同一组数。
 */
export const SLEEP_TIMER_MIN_MINUTES = 1;
export const SLEEP_TIMER_MAX_MINUTES = 720;

/**
 * 淡出总时长。
 *
 * 2.5 秒是听感与「别拖太久」之间的折中：再短会有明显的「声音被拽下去」的感觉，
 * 再长又会让用户觉得暂停键反应慢。分 10 步下发，每步约 250ms，
 * 每步的变化量小到人耳听不出台阶。
 */
const FADE_MS = 2500;
const FADE_STEPS = 10;
const FADE_STEP_MS = FADE_MS / FADE_STEPS;

/**
 * 「本曲结束」在淡出之外额外留的余量。
 *
 * 这一档必须在**歌真结束之前**就淡完并暂停：ExoPlayer 到点会自动切下一首
 * （队列是整条下发的），如果我们的 pause 晚到一步，下一首会以满音量开个头再被掐掉。
 * 多留 600ms 让 pause 稳稳落在切换之前。
 */
const TRACK_END_MARGIN = 600;

/**
 * 自检间隔。
 *
 * 1 秒足够准（剩余时间显示也是秒级），又不会有明显唤醒开销；
 * 而且这个 interval **只在定时生效期间存在**，没有定时就完全不存在。
 */
const TICK_MS = 1000;

export type SleepTimerKind = 'duration' | 'track';

export type SleepTimerState = {
  /** null = 没开定时。 */
  kind: SleepTimerKind | null;
  /**
   * duration 模式下用户选的分钟数（固定档位或自定义值，1–720）。
   * 只用于在面板上打勾/回显，倒计时一律以 deadlineAt 为准。
   */
  minutes: number | null;
  /**
   * duration 模式的到点时刻（时间戳）。
   *
   * 存「终点」而不是「剩余量」：剩余量要自己每秒递减，一旦某次 tick 没跑
   * 就会永久偏差；存终点则每次都用 `终点 - 现在` 现算，天然对齐真实时间。
   * track 模式没有固定期限，恒为 null。
   */
  deadlineAt: number | null;
  /** 展示用剩余毫秒（track 模式是「当前这歌还剩多久」）。 */
  remainingMs: number;
  /** 正在淡出：UI 需要提示，也让「取消」知道要还原音量。 */
  fading: boolean;
};

const INITIAL_SLEEP_TIMER_STATE: SleepTimerState = {
  kind: null,
  minutes: null,
  deadlineAt: null,
  remainingMs: 0,
  fading: false,
};

/** 与 player / settings store 同款的极简 store（项目里没有全局状态库）。 */
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

const sleepTimerStore = createStore(INITIAL_SLEEP_TIMER_STATE);

let tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 淡出轮次的令牌。
 *
 * 淡出是「先 await 一下、再发一条原生命令」的异步循环，中途用户完全可能点「取消」。
 * 取消时把令牌 +1，正在跑的那一轮下一拍就发现对不上、立刻退出 ——
 * 比去 clearInterval 一个已经开始跑的 async 函数靠谱得多（那个根本停不下来）。
 */
let fadeToken = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureTicking() {
  if (tickTimer) {
    return;
  }
  tickTimer = setInterval(tick, TICK_MS);
}

function stopTicking() {
  if (!tickTimer) {
    return;
  }
  clearInterval(tickTimer);
  tickTimer = null;
}

function now(): number {
  return Date.now();
}

/**
 * 每秒自检一次「该不该停了」。
 *
 * 两个模式的判定方式不同，原因很实在：
 * - duration：纯时间戳比对，不依赖播放状态，暂停/切歌都不影响（见文件头说明）。
 * - track：只能问原生。JS 侧的进度**只在「前台且在播」时轮询**（见 store 的
 *   syncProgressPolling），锁屏听歌时那份进度是停摆的；用它会得出「歌永远不会结束」。
 *   直接问 getState 每秒一次开销极小，且锁屏/后台都是准的。
 */
function tick() {
  const { kind, deadlineAt, fading } = sleepTimerStore.getState();

  if (kind === null) {
    stopTicking();
    return;
  }

  // 已经在淡出了，收尾交给 runFadeOut，别再重复触发
  if (fading) {
    return;
  }

  if (kind === 'duration') {
    const remainingMs = (deadlineAt ?? 0) - now();
    // 提前一个淡出时长动手：这样「淡完」的那一刻正好是用户设定的终点，
    // 而不是「到点才开始淡、再听 2.5 秒才停」。
    if (remainingMs <= FADE_MS) {
      void runFadeOut();
      return;
    }
    sleepTimerStore.setState({ remainingMs });
    return;
  }

  void PlayerManager.getState().then((state) => {
    // 期间可能已被取消、或换成了别的模式
    const snapshot = sleepTimerStore.getState();
    if (snapshot.kind !== 'track' || snapshot.fading) {
      return;
    }
    if (!state || state.durationMs <= 0) {
      return;
    }

    // 倍速下 media3 的 position 走的是**媒体时间**：2× 时 1 秒真实时间过去 2 秒媒体时间。
    // 展示与阈值都换算成真实时间，否则 2× 放着的时候倒计时会显得「跳得飞快」。
    const rate = getCurrentPlaybackRate();
    const remainingMs = Math.max(0, state.durationMs - state.positionMs) / (rate > 0 ? rate : 1);

    if (!state.playing) {
      // 暂停在最后几秒时不淡出：那等于「暂停状态下把音量悄悄拧到 0」，
      // 用户回来一按播放就是没声音。等它真的在播、真的走到末尾再处理。
      sleepTimerStore.setState({ remainingMs });
      return;
    }

    if (remainingMs <= FADE_MS + TRACK_END_MARGIN) {
      void runFadeOut();
      return;
    }
    sleepTimerStore.setState({ remainingMs });
  });
}

/**
 * 淡出 → 暂停 → 还原音量。
 *
 * 为什么淡出放在 JS 侧：media3 的 volume 是瞬时值，没有渐变 API；
 * 分 10 步下发是唯一不碰原生播放循环的做法（每步约 250ms，听不出台阶）。
 *
 * 最后必须把音量**还原成 1**：这是设备级的播放音量，留着 0 会让下一次播放彻底没声音，
 * 而用户绝不可能想到是「昨晚那个睡眠定时」干的。另外 store 的开播钩子也会兜一次。
 */
async function runFadeOut() {
  const token = ++fadeToken;
  stopTicking();
  sleepTimerStore.setState({ fading: true, remainingMs: 0 });

  for (let step = 1; step <= FADE_STEPS; step += 1) {
    if (token !== fadeToken) {
      // 被取消：音频由 cancel() 负责还原，这里安静退出
      return;
    }
    await PlayerManager.setVolume(1 - step / FADE_STEPS);
    await delay(FADE_STEP_MS);
  }

  if (token !== fadeToken) {
    return;
  }

  playerActions.pause();
  // 等 pause 真正落到原生再抬音量，否则最后那一下会「先响回来一瞬再停」
  await delay(120);

  if (token !== fadeToken) {
    return;
  }

  await PlayerManager.setVolume(1);
  sleepTimerStore.setState(INITIAL_SLEEP_TIMER_STATE);
  showToast('睡眠定时已到，已暂停播放');
}

/** 取消定时，并把可能已经压低的音量还原。 */
function cancel() {
  const { kind, fading } = sleepTimerStore.getState();
  if (kind === null) {
    return;
  }

  fadeToken += 1;
  stopTicking();
  sleepTimerStore.setState(INITIAL_SLEEP_TIMER_STATE);

  if (fading) {
    // 走到这里说明淡出已经开始：音量必须还原，否则就是永久静音
    void PlayerManager.setVolume(1);
  }
  showToast('已取消睡眠定时');
}

export const sleepTimerActions = {
  /** 按分钟数定时。切歌不影响它 —— 定的是「多久之后关」，与放到第几首无关。 */
  start(minutes: number) {
    /*
     * 范围校验的主体在面板里（那里能就着输入框给出「最长 12 小时」这类具体提示），
     * 这里只是兜底：将来若有别的入口直接调 start，也不至于把 deadline 推到
     * 几十小时之后。非法值**静默忽略**，避免和面板的提示叠成两条 toast。
     */
    if (
      !Number.isFinite(minutes) ||
      minutes < SLEEP_TIMER_MIN_MINUTES ||
      minutes > SLEEP_TIMER_MAX_MINUTES
    ) {
      return;
    }

    // 之前可能正处在淡出里：先作废那一轮，避免它继续往下压音量/暂停
    fadeToken += 1;
    sleepTimerStore.setState({
      kind: 'duration',
      minutes,
      deadlineAt: now() + minutes * 60_000,
      remainingMs: minutes * 60_000,
      fading: false,
    });
    void PlayerManager.setVolume(1);
    ensureTicking();
    showToast(`已设置：${minutes} 分钟后停止播放`);
  },

  /**
   * 「本曲结束」。
   *
   * 注意语义：这里的「不重置」体现在**定时本身不会因为切歌被取消**，
   * 但剩余时间会跟着换成新歌的剩余时长 —— 「本曲结束」本来就该跟着当前这首走。
   */
  startTrack() {
    fadeToken += 1;
    sleepTimerStore.setState({
      kind: 'track',
      minutes: null,
      deadlineAt: null,
      remainingMs: 0,
      fading: false,
    });
    void PlayerManager.setVolume(1);
    ensureTicking();
    showToast('已设置：本曲结束后停止播放');
  },

  cancel,
};

export function useSleepTimer(): SleepTimerState {
  return useSyncExternalStore(
    sleepTimerStore.subscribe,
    sleepTimerStore.getState,
    sleepTimerStore.getInitialState
  );
}
