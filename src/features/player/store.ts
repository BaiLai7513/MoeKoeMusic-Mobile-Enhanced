import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import {
  buildQueueItem,
  onNativeCommand,
  onNativeState,
  pendingUri,
  PlayerManager,
  type NativePlayerState,
  type NativeQueueItem,
} from './PlayerManager';
import { loadLyricLines } from './lyrics';
import { PlaybackUnavailableError, resolveSongSource } from './song-url';
import type { LyricLine, LyricsStatus, PlayMode, PlayerTrack } from './types';

export type PlayerState = {
  queue: PlayerTrack[];
  index: number;
  track: PlayerTrack | null;
  playing: boolean;
  buffering: boolean;
  loading: boolean;
  mode: PlayMode;
  error: string;
  lyrics: LyricLine[];
  lyricsStatus: LyricsStatus;
};

export type ProgressState = {
  positionMs: number;
  durationMs: number;
};

const INITIAL_PLAYER_STATE: PlayerState = {
  queue: [],
  index: -1,
  track: null,
  playing: false,
  buffering: false,
  loading: false,
  mode: 'sequence',
  error: '',
  lyrics: [],
  lyricsStatus: 'idle',
};

const INITIAL_PROGRESS_STATE: ProgressState = {
  positionMs: 0,
  durationMs: 0,
};

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

const playerStore = createStore(INITIAL_PLAYER_STATE);
const progressStore = createStore(INITIAL_PROGRESS_STATE);

// ---------------- 「开始播放歌曲」通知 ----------------
//
// 给「开播后要做一次」的副作用（目前是 VIP 自动补领）一个统一入口。
//
// 为什么用订阅而不是在 loadTrackAt 之类的 action 里塞回调：`playing` 变 true 有两条
// 互不相干的路径 —— `loadTrackAt`（点歌/切歌，JS 主动）和 `applyNativeState`
// （锁屏、耳机、通知栏、暂停后恢复，原生主动）。回调散在 action 里就必须每处都记得写，
// 漏一处就会出现「用系统按钮播放时永远不触发」这种只在特定操作下才复现的差异。
// 挂在 store 上，任何把 playing/曲目写成「正在播这首」的代码路径都自动覆盖。
//
// 去重键用「曲目 hash + 是否在播」：缓冲、歌词、进度这类同曲状态变化不重复通知，
// 而切歌（hash 变）与暂停后恢复（先清空键）都算一次新的开始播放。

const playbackStartListeners = new Set<() => void>();
let lastStartedHash = '';

playerStore.subscribe(() => {
  const { playing, track } = playerStore.getState();

  if (!playing || !track) {
    // 播完/暂停后清掉键，这样「暂停再播同一首」也算一次新的开始播放
    lastStartedHash = '';
    return;
  }

  if (track.hash === lastStartedHash) {
    return;
  }
  lastStartedHash = track.hash;

  for (const listener of playbackStartListeners) {
    try {
      listener();
    } catch (error) {
      // 订阅者（VIP 补领）属于锦上添花，异常绝不能冒泡回播放链路
      console.warn('[player] 开始播放回调异常:', error);
    }
  }
});

/**
 * 订阅「开始播放歌曲」。回调会在开播与切歌时触发，**频率由调用方自己去重** ——
 * 这里刻意不做节流，因为「多频繁算合理」是业务的事（见 vip-silent-claim 的三层节流）。
 *
 * 返回取消订阅函数。
 */
export function onPlaybackStart(listener: () => void): () => void {
  playbackStartListeners.add(listener);
  return () => {
    playbackStartListeners.delete(listener);
  };
}

let loadSequence = 0;
let failStreak = 0;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
// 每次“建立新队列”都会自增；后台补齐歌单剩余曲目时靠它判断队列是否已被替换。
let queueGeneration = 0;

// ---------------- 「因缺少 VIP 而播不了」通知 ----------------
//
// 与上面的 onPlaybackStart 同一个思路：播放链路不该知道 VIP 领取的存在，只负责把
// 「用户点到的这首歌被 VIP 挡住了」这个事实广播出去，由 account 侧决定要不要立刻补领。
//
// 为什么**只有** loadTrackAt（用户真正点到的当前曲目）广播，而不包括预解析失败：
// 每次开播后的 prefetchAround 都会把后面 8 首一次性铺开，队列里必然夹着 VIP 歌，
// 它们失败是常态。若那也算「用户被挡住」，随机延时就会在每次开播的瞬间被立刻收掉，
// 防风控的节奏设计等于白写 —— 通知的语义必须是「用户此刻听不了这首歌」，而不是
// 「我们刚刚探测到一首以后可能播不了的歌」。

/**
 * 最近一次「因缺少 VIP 而解析失败」的曲目 hash。**只在它仍是当前曲目时**用于
 * VIP 到手后的原地自愈（见 retryVipBlockedTrack），所以用户一换歌它就自然失效。
 */
let vipBlockedHash: string | null = null;

const vipBlockedListeners = new Set<() => void>();

/** 订阅「当前曲目因缺少 VIP 而无法播放」。返回取消订阅函数。 */
export function onVipBlockedPlayback(listener: () => void): () => void {
  vipBlockedListeners.add(listener);
  return () => {
    vipBlockedListeners.delete(listener);
  };
}

function notifyVipBlocked() {
  for (const listener of vipBlockedListeners) {
    try {
      listener();
    } catch (error) {
      // 同 onPlaybackStart：订阅者（VIP 补领）异常绝不能冒泡回播放链路
      console.warn('[player] VIP 受限回调异常:', error);
    }
  }
}

// ---------------- 原生播放器接线 ----------------
//
// 播放/暂停/seek 全交给原生 ExoPlayer（native/android/player/PlayerController.kt）；
// 锁屏与通知栏由 media3 的 MediaSessionService 托管，**播放进度也会自动同步给系统**，
// JS 侧不需要为了锁屏/通知栏做任何事。
//
// 应用内进度条才需要 JS 知道 position，这里以 500ms 轮询 getState()。
// 关键：**只在「前台 + 正在播放」时轮询** —— 退到后台后锁屏/通知栏的进度由 media3
// 自己推进，JS 侧再轮询纯属白耗电（实测后台播放时主线程占用明显）。

const PROGRESS_POLL_MS = 500;

let progressTimer: ReturnType<typeof setInterval> | null = null;
let nativeSubscriptions: { remove: () => void }[] = [];
let appInForeground = AppState.currentState === 'active';

// ---------------- 播放列表直链解析（让系统「上/下一首」可用） ----------------
//
// 系统媒体卡片的上一首/下一首是否可点，取决于 Player 有没有真正的播放列表。
// 但每首歌的直链都要单独调酷狗 /song/url（签名在 JS 侧），不可能一次全拿到，
// 所以：整条队列先以占位符建列表（保证长度 → 按钮可用），
// JS 提前把「当前 + 后面几首」替换成真实直链。

/** 播放列表下标 → 已解析的直链。 */
const resolvedUris = new Map<number, string>();
/** 播放列表下标 → 当时的歌曲 hash，用于判断缓存是否已因换队列而失效。 */
let playlistHashes: string[] = [];
/** 正在解析中的下标，避免重复请求。 */
const resolvingIndexes = new Set<number>();
/** 提前解析后面多少首。系统切歌是原生直接推进的，撞上占位符会失败，所以多备一些。 */
const PREFETCH_AHEAD = 8;

/** 解析某一首的直链并写回播放列表；返回直链或 null。 */
async function resolveIndex(index: number): Promise<string | null> {
  const { queue } = playerStore.getState();
  const track = queue[index];
  if (!track || playlistHashes[index] !== track.hash) {
    return null;
  }

  const cached = resolvedUris.get(index);
  if (cached) {
    return cached;
  }
  if (resolvingIndexes.has(index)) {
    return null;
  }

  resolvingIndexes.add(index);
  try {
    const source = await resolveSongSource(track);
    // 期间队列可能被替换
    if (playlistHashes[index] !== track.hash) {
      return null;
    }
    resolvedUris.set(index, source.uri);
    await PlayerManager.replaceItem(index, track, source.uri);
    return source.uri;
  } catch (error) {
    console.warn(`[player] 第 ${index} 首直链解析失败:`, error);
    return null;
  } finally {
    resolvingIndexes.delete(index);
  }
}

/**
 * 提前把将要播到的曲目解析好，交给 ExoPlayer 的列表。
 *
 * 关键：不能只按「当前 + 顺序后 N 首」预解析 —— 随机模式下原生会跳到**乱序**的下标，
 * 那样几乎必然撞上占位符（表现为一首放完卡住几秒）。
 * 所以这里同时做两件事：
 * 1. 按原生报上来的真实「下一首/上一首」下标解析（随机模式也准）
 * 2. 再按顺序多备几首，覆盖列表循环时的连续播放
 */
function prefetchAround(index: number, nativeNext?: number, nativePrevious?: number) {
  const { queue } = playerStore.getState();

  const targets = new Set<number>();
  if (typeof nativeNext === 'number' && nativeNext >= 0) {
    targets.add(nativeNext);
  }
  if (typeof nativePrevious === 'number' && nativePrevious >= 0) {
    targets.add(nativePrevious);
  }
  for (let k = index; k <= Math.min(index + PREFETCH_AHEAD, queue.length - 1); k += 1) {
    targets.add(k);
  }

  targets.forEach((k) => {
    const track = queue[k];
    if (track && playlistHashes[k] === track.hash && !resolvedUris.has(k)) {
      void resolveIndex(k);
    }
  });
}

AppState.addEventListener('change', (next) => {
  const foreground = next === 'active';
  if (foreground === appInForeground) {
    return;
  }
  appInForeground = foreground;
  // 回到前台立刻恢复轮询；退到后台停掉，并补一次位置让进度条不落后
  syncProgressPolling();
});

function writeProgress(state: NativePlayerState) {
  const current = progressStore.getState();
  const duration = state.durationMs > 0 ? state.durationMs : current.durationMs;
  if (state.positionMs === current.positionMs && duration === current.durationMs) {
    return;
  }
  progressStore.setState({ positionMs: state.positionMs, durationMs: duration });
}

/** 只有「前台且在播放」才值得轮询；停止时补一次最终位置，避免进度条停在旧值。 */
function syncProgressPolling() {
  const shouldPoll = appInForeground && playerStore.getState().playing;

  if (shouldPoll) {
    if (progressTimer) {
      return;
    }
    progressTimer = setInterval(() => {
      void PlayerManager.getState().then((state) => {
        if (state) writeProgress(state);
      });
    }, PROGRESS_POLL_MS);
    return;
  }

  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  void PlayerManager.getState().then((state) => {
    if (state) writeProgress(state);
  });
}

function applyNativeState(state: NativePlayerState) {
  const current = playerStore.getState();

  // 系统侧切歌（通知栏/锁屏/车机/耳机）时，ExoPlayer 自己在列表里前进，
  // JS 这边要跟着换指标与曲目 —— 否则 UI 会停留在上一首。
  //
  // 但**正在切换曲目/队列时必须禁止认领**：那时原生报的还是上一首的下标，
  // 认领会把 JS 侧曲目写歪（详见 loadTrackAt 里的说明）。
  if (
    !current.loading &&
    typeof state.index === 'number' &&
    state.index >= 0 &&
    state.index !== current.index &&
    state.mediaId != null &&
    playlistHashes[state.index] === state.mediaId
  ) {
    adoptNativeIndex(state.index);
  }

  const latest = playerStore.getState();
  // 切歌瞬间原生可能还在报旧曲目，mediaId 对不上就忽略，避免状态写歪。
  if (state.mediaId && latest.track && state.mediaId !== latest.track.hash) {
    return;
  }

  if (latest.playing !== state.playing || latest.buffering !== state.buffering) {
    playerStore.setState({ playing: state.playing, buffering: state.buffering });
  }

  if (state.error) {
    if (state.error !== latest.error) {
      playerStore.setState({ error: state.error, loading: false, playing: false });
    }
    recoverFromPlaybackError();
    return;
  }

  // 播放恢复正常 → 清错误并复位自愈标记
  if (latest.error) {
    playerStore.setState({ error: '' });
  }
  if (state.playing) {
    recoveryTrackHash = null;
    failStreak = 0;
  }

  writeProgress(state);
  syncProgressPolling();
  // 照原生认定的下一首/上一首预解析（随机模式下这才是真正会播到的曲目）
  prefetchAround(playerStore.getState().index, state.nextIndex, state.previousIndex);
}

/**
 * 播放中出错的自愈。
 *
 * 酷狗直链带时效（路径里那串时间戳），暂停久了或缓存过期后继续播就会失败。
 * 策略：**同一首首次失败先重新解析直链重试**（位置会回到 0，但比直接跳过体验好），
 * 再失败才跳下一首，并且用 failStreak 限流，避免整队列疯狂跳歌。
 */
let recoveryTrackHash: string | null = null;

function recoverFromPlaybackError() {
  const { track, index, queue } = playerStore.getState();
  if (!track) {
    return;
  }

  // 首次失败：丢掉这一首的直链重新解析后原地重播。
  // 刻意**不重建播放列表** —— 重建会把 ExoPlayer 的随机顺序重置掉。
  if (recoveryTrackHash !== track.hash) {
    recoveryTrackHash = track.hash;
    console.log(`[player] 播放出错，重新解析直链后重试: ${track.title}`);

    if (playlistHashes[index] === track.hash) {
      resolvedUris.delete(index);
      void resolveIndex(index).then((uri) => {
        if (uri) {
          void PlayerManager.seekToIndex(index);
          prefetchAround(index);
          return;
        }
        // 解析不出来 → 回退到重建列表的路径
        void loadTrackAt(index);
      });
      return;
    }

    void loadTrackAt(index);
    return;
  }

  // 同一首二次失败：放弃重试，跳下一首（限流）
  recoveryTrackHash = null;
  if (queue.length <= 1) {
    return;
  }

  failStreak += 1;
  if (failStreak >= Math.min(queue.length, 6)) {
    console.warn('[player] 连续多首播放失败，停止自动跳过');
    return;
  }

  if (advanceTimer) {
    clearTimeout(advanceTimer);
  }
  advanceTimer = setTimeout(() => {
    advanceTimer = null;
    void skip(1, true);
  }, 1200);
}

/**
 * VIP 到手后的自愈：如果**当前曲目**还停在「因缺少 VIP 而失败」上，就重新解析它并播放。
 *
 * 为什么必须限定「当前曲目 = 那条失败记录」：从失败到 VIP 到手中间隔着一次查状态 + 一次
 * 领取请求（几百毫秒到几秒），而且失败后播放器还会自动跳歌。这段里用户完全可能已经在听
 * 别的歌了，那时把他切回去，是最招人烦的一种「贴心」。用户一换歌，`vipBlockedHash`
 * 就对不上当前曲目，这里自然什么都不做。
 *
 * 为什么不直接调 loadTrackAt：自愈策略（丢掉直链 → 原地重新解析 → 再失败才跳歌）
 * 项目里只有 recoverFromPlaybackError 一份实现，复用它可以白拿「同一首二次失败才跳歌」
 * 的限流，不必再写一套跳歌逻辑。解析失败那次 playlistHashes 已被清空，所以它会走
 * `loadTrackAt` 那条路 —— 正是我们要的「拿新身份（已领到 VIP）重新解析整首」。
 *
 * 返回是否真的发起了重试（供日志/测试判断，正常路径不需要看）。
 */
export function retryVipBlockedTrack(): boolean {
  const { track, error } = playerStore.getState();
  // 没有错误态说明当前曲目并不处于「播不了」的状态：可能已经在放了，
  // 此时再重试等于把歌从头开始，纯属倒退
  if (!track || !error || track.hash !== vipBlockedHash) {
    return false;
  }

  // 必须清掉自愈标记：否则会命中上面「同一首二次失败」那条分支，
  // 用户刚领到 VIP，等来的却是自己的歌被跳过
  recoveryTrackHash = null;
  console.log(`[player] VIP 已到账，重新解析当前曲目: ${track.title}`);
  recoverFromPlaybackError();
  return true;
}

/** 通知栏/锁屏/耳机的切歌命令：JS 解析地址后再下发播放。 */
function handleNativeCommand(command: 'next' | 'previous') {
  void skip(command === 'next' ? 1 : -1);
}

function ensureNativeSubscriptions() {
  if (nativeSubscriptions.length || !PlayerManager.isAvailable()) {
    return;
  }
  nativeSubscriptions = [
    onNativeState(applyNativeState),
    onNativeCommand(handleNativeCommand),
  ];
}

function pickNextIndex(step: 1 | -1, auto: boolean): number {
  const { queue, index, mode } = playerStore.getState();
  if (!queue.length) {
    return -1;
  }

  if (mode === 'shuffle' && queue.length > 1 && (auto || step === 1)) {
    let candidate = index;
    while (candidate === index) {
      candidate = Math.floor(Math.random() * queue.length);
    }
    return candidate;
  }

  return (index + step + queue.length) % queue.length;
}

/**
 * 跟随原生播放列表的下标切换（系统侧切歌）。
 * 与 [loadTrackAt] 的区别：**不重建播放列表**，因为 ExoPlayer 已经自己切过去了，
 * 重建会导致当前曲目重新加载。这里只同步 JS 侧状态并继续预解析。
 */
function adoptNativeIndex(index: number) {
  const { queue } = playerStore.getState();
  const track = queue[index];
  if (!track) {
    return;
  }

  playerStore.setState({
    index,
    track,
    error: '',
    lyrics: [],
    lyricsStatus: 'idle',
  });
  progressStore.setState({ positionMs: 0, durationMs: track.durationMs ?? 0 });

  void loadLyricLines(track)
    .then((lines) => {
      if (playerStore.getState().track?.hash !== track.hash) {
        return;
      }
      playerStore.setState({
        lyrics: lines,
        lyricsStatus: lines.length ? 'ready' : 'empty',
      });
    })
    .catch(() => {
      if (playerStore.getState().track?.hash === track.hash) {
        playerStore.setState({ lyrics: [], lyricsStatus: 'empty' });
      }
    });

  prefetchAround(index);
}

async function loadTrackAt(index: number) {
  const { queue } = playerStore.getState();
  const track = queue[index];
  if (!track) {
    return;
  }

  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  const sequence = ++loadSequence;

  // 队列/曲目正在切换：先作废旧的原生下标映射。
  //
  // 这是「点了别的歌单却不切换」的根因：切换期间原生播放器仍在播旧曲并持续
  // 上报状态，而那时 playlistHashes 还是旧队列的映射，于是 applyNativeState 会
  // 按旧下标把 JS 侧曲目认领成新队列里的**错误一首**；紧接着 mediaId 校验又会
  // 拒绝后续所有事件，导致播放/暂停/切歌全部对不上。
  playlistHashes = [];
  resolvedUris.clear();
  resolvingIndexes.clear();

  playerStore.setState({
    index,
    track,
    loading: true,
    error: '',
    lyrics: [],
    lyricsStatus: 'idle',
  });
  progressStore.setState({ positionMs: 0, durationMs: track.durationMs ?? 0 });

  try {
    const source = await resolveSongSource(track);
    if (sequence !== loadSequence) {
      return;
    }

    ensureNativeSubscriptions();

    // 建立整条播放列表：当前项给真链，其余先占位。
    // 列表必须有「长度」，否则系统媒体卡片的上一首/下一首永远是灰的。
    playlistHashes = queue.map((item) => item.hash);
    resolvedUris.clear();
    resolvingIndexes.clear();
    resolvedUris.set(index, source.uri);

    const items: NativeQueueItem[] = queue.map((item, k) =>
      buildQueueItem(item, k === index ? source.uri : pendingUri(item.hash))
    );

    await PlayerManager.setPlaylist(items, index);
    // 有了原生播放列表，曲目由 ExoPlayer 推进 → 循环/随机必须同步给原生
    await PlayerManager.setPlaybackMode(playerStore.getState().mode);

    failStreak = 0;
    // 当前曲目真的播出来了 → 之前那条「缺 VIP」的记录已经过期作废
    vipBlockedHash = null;
    playerStore.setState({ loading: false, playing: true, buffering: false });
    if (source.durationMs > 0) {
      progressStore.setState({ durationMs: source.durationMs });
    }

    // 提前解析：先按顺序铺开，随后原生状态事件会带着真实「下一首」下标过来，
    // applyNativeState 里再按它精确补齐（随机模式靠这一步）
    prefetchAround(index);
  } catch (error) {
    if (sequence !== loadSequence) {
      return;
    }

    failStreak += 1;
    // 只有「缺 VIP」这一类值得记下来：领到 VIP 后重新解析它就可能成功。
    // 无版权/本地文件缺失就算领了 VIP 也一样放不了，记下来只会换来一次无意义的请求。
    const blockedByVip = error instanceof PlaybackUnavailableError && error.reason === 'vip';
    vipBlockedHash = blockedByVip ? track.hash : null;

    playerStore.setState({
      loading: false,
      playing: false,
      buffering: false,
      lyricsStatus: 'empty',
      error: error instanceof Error ? error.message : '播放失败，请稍后重试',
    });

    if (blockedByVip) {
      // 放在 setState 之后：订阅方（VIP 补领）此刻读到的错误状态与 UI 一致
      notifyVipBlocked();
    }

    const { queue: currentQueue } = playerStore.getState();
    const maxStreak = Math.min(currentQueue.length, 6);
    if (currentQueue.length > 1 && failStreak < maxStreak) {
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        void skip(1, true);
      }, 1400);
    }
  }
}

async function loadLyricsFor(track: PlayerTrack, sequence: number) {
  try {
    const lines = await loadLyricLines(track);
    if (sequence !== loadSequence) {
      return;
    }

    playerStore.setState({
      lyrics: lines,
      lyricsStatus: lines.length ? 'ready' : 'empty',
    });
  } catch {
    if (sequence === loadSequence) {
      playerStore.setState({ lyrics: [], lyricsStatus: 'empty' });
    }
  }
}

/**
 * 切歌。
 *
 * 有了原生播放列表后，切歌可以交给 ExoPlayer（会遵循循环/随机设置），
 * 但必须**先把目标曲目的直链解析好**，否则原生会撞上占位符而失败。
 * 所以：按 JS 队列算出目标下标 → 解析直链 → replaceItem → 再让原生跳过去。
 * 解析不到时回退到「重建播放列表」的路径（那里有错误提示与自动跳过）。
 */
async function skip(step: 1 | -1, auto = false) {
  const { queue } = playerStore.getState();
  if (queue.length === 0) {
    return;
  }

  // 队列只有一首：交给原生 repeat 处理
  if (queue.length === 1) {
    await PlayerManager.seekToMs(0);
    if (step === 1) {
      await PlayerManager.resume();
    }
    return;
  }

  const targetIndex = pickNextIndex(step, auto);
  if (targetIndex < 0) {
    return;
  }

  let uri = resolvedUris.get(targetIndex);
  if (!uri) {
    await resolveIndex(targetIndex);
    uri = resolvedUris.get(targetIndex);
  }

  if (!uri) {
    await loadTrackAt(targetIndex);
    return;
  }

  await PlayerManager.seekToIndex(targetIndex);
  adoptNativeIndex(targetIndex);
  prefetchAround(targetIndex);
}

/** 当前队列的 generation 是否仍是 expected（供后台补齐判断队列是否已被替换/清空）。 */
export function isCurrentQueueGeneration(expected: number): boolean {
  return expected === queueGeneration;
}

export const playerActions = {
  async loadLyrics() {
    const { track, lyricsStatus } = playerStore.getState();
    if (!track || lyricsStatus !== 'idle') {
      return;
    }

    const sequence = loadSequence;
    playerStore.setState({ lyricsStatus: 'loading' });
    await loadLyricsFor(track, sequence);
  },

  /**
   * 用一批曲目建立新队列并从 startIndex 开始播放。
   * 返回本次队列的 generation，供 appendTracks 后台补齐时校验队列未被替换；
   * 无可播曲目时返回 null。
   */
  async playTracks(tracks: PlayerTrack[], startIndex = 0): Promise<number | null> {
    const playable = tracks.filter((track) => track.hash);
    if (!playable.length) {
      return null;
    }

    const targetHash = tracks[startIndex]?.hash;
    const index = Math.max(
      0,
      playable.findIndex((track) => track.hash === targetHash)
    );

    failStreak = 0;
    const generation = ++queueGeneration;
    playerStore.setState({ queue: playable });
    await loadTrackAt(index);
    return generation;
  },

  /**
   * 把后续分页的曲目追加到当前队列末尾（按 hash 去重）。
   * generation 与当前队列不一致（队列已被替换/清空）时不追加并返回 false。
   */
  appendTracks(tracks: PlayerTrack[], generation: number): boolean {
    if (generation !== queueGeneration) {
      return false;
    }

    const { queue } = playerStore.getState();
    if (!queue.length) {
      return false;
    }

    const seen = new Set(queue.map((track) => track.hash));
    const fresh = tracks.filter((track) => track.hash && !seen.has(track.hash));
    if (fresh.length) {
      playerStore.setState({ queue: [...queue, ...fresh] });
    }

    return true;
  },

  async playTrackNow(track: PlayerTrack) {
    if (!track.hash) {
      return;
    }

    const { queue, index } = playerStore.getState();
    const existing = queue.findIndex((item) => item.hash === track.hash);
    if (existing >= 0) {
      await loadTrackAt(existing);
      return;
    }

    // 插播只是把歌插到当前曲目之后，不改变队列归属：
    // 歌单的后台补齐继续追加到队尾，顺序仍与歌单一致。
    const nextQueue = [...queue];
    nextQueue.splice(index + 1, 0, track);
    failStreak = 0;
    playerStore.setState({ queue: nextQueue });
    await loadTrackAt(index + 1);
  },

  pause() {
    if (!playerStore.getState().track) {
      return;
    }
    void PlayerManager.pause();
  },

  toggle() {
    const { track, playing, loading, error } = playerStore.getState();
    if (!track || loading) {
      return;
    }

    if (error) {
      void loadTrackAt(playerStore.getState().index);
      return;
    }

    if (playing) {
      void PlayerManager.pause();
      return;
    }

    const { positionMs, durationMs } = progressStore.getState();
    if (durationMs > 0 && positionMs >= durationMs - 300) {
      void PlayerManager.seekToMs(0);
    }
    void PlayerManager.resume();
  },

  next() {
    void skip(1);
  },

  previous() {
    void skip(-1);
  },

  seekToMs(positionMs: number) {
    const { track } = playerStore.getState();
    if (!track) {
      return;
    }

    const { durationMs } = progressStore.getState();
    const clamped = Math.max(0, durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs);
    progressStore.setState({ positionMs: clamped });
    void PlayerManager.seekToMs(clamped);
  },

  setMode(mode: PlayMode) {
    playerStore.setState({ mode });
    // 曲目由原生播放列表推进 → 循环/随机必须同步过去
    void PlayerManager.setPlaybackMode(mode);
  },

  cycleMode() {
    const { mode } = playerStore.getState();
    const order: PlayMode[] = ['sequence', 'shuffle', 'single'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    playerStore.setState({ mode: next });
    void PlayerManager.setPlaybackMode(next);
    return next;
  },

  async jumpTo(index: number) {
    const { queue } = playerStore.getState();
    if (index < 0 || index >= queue.length) {
      return;
    }

    await loadTrackAt(index);
  },

  removeAt(index: number) {
    const { queue, index: currentIndex } = playerStore.getState();
    if (index < 0 || index >= queue.length) {
      return;
    }

    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== index);

    if (!nextQueue.length) {
      playerActions.clearQueue();
      return;
    }

    if (index === currentIndex) {
      playerStore.setState({ queue: nextQueue });
      void loadTrackAt(Math.min(index, nextQueue.length - 1));
      return;
    }

    playerStore.setState({
      queue: nextQueue,
      index: index < currentIndex ? currentIndex - 1 : currentIndex,
    });
  },

  clearQueue() {
    loadSequence += 1;
    queueGeneration += 1;
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }

    // 原生 stop() 会一并清掉 MediaSession 的曲目与通知，无需再清锁屏控制。
    playerStore.setState({
      ...INITIAL_PLAYER_STATE,
      mode: playerStore.getState().mode,
    });
    progressStore.setState(INITIAL_PROGRESS_STATE);
    void PlayerManager.stop();
    // 放到 setState 之后：此时 playing=false，轮询会正确停掉
    syncProgressPolling();
  },
};

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    playerStore.subscribe,
    playerStore.getState,
    playerStore.getInitialState
  );
}

/** 仅订阅“是否有曲目”这一布尔值，供布局类组件使用，避免高频重渲染。 */
export function useHasTrack(): boolean {
  return useSyncExternalStore(
    playerStore.subscribe,
    () => Boolean(playerStore.getState().track),
    () => false
  );
}

export function usePlayerProgress(): ProgressState {
  return useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getState,
    progressStore.getInitialState
  );
}

type ProgressSelection = string | number | boolean | null | undefined;

export function usePlayerProgressSelector<T extends ProgressSelection>(
  selector: (state: ProgressState) => T
): T {
  return useSyncExternalStore(
    progressStore.subscribe,
    () => selector(progressStore.getState()),
    () => selector(progressStore.getInitialState())
  );
}
