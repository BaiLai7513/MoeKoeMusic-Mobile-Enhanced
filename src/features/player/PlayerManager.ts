import {
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type EmitterSubscription,
} from 'react-native';

import { sizedImage } from '@/lib/format';

import type { PlayerTrack } from './types';

/**
 * 原生播放器的 JS 门面（对应改造清单 §2.1 的 PlayerManager）。
 *
 * 职责边界：
 * - 原生只负责「播一首直链 + 状态回流」，**不维护队列**；队列/播放模式由 JS 侧
 *   `features/player/store.ts` 维护，避免两边各持一份队列导致状态不同步。
 * - 进度（position）刻意不走事件推送，而是 JS 在前台播放中按需 `getNativeState()` 轮询，
 *   避免高频过桥、也避免退到后台后白耗电。
 *
 * ## 稳定性约定（重要）
 *
 * 只有 [PlayerManager.play] 会把错误抛给调用方（调用方需要据此做失败提示与自动跳过）。
 * 其余指令类方法（pause/resume/stop/seekToMs/setVolume/setRate）以及 getState
 * **一律内部吞掉异常**，只打日志、绝不 reject ——
 * 否则调用方的 `void PlayerManager.pause()` 会变成未处理的 Promise 拒绝，
 * 造成状态错乱甚至闪退。
 *
 * 原生实现在 `native/android/player/PlayerModule.kt`，名字 `MoeKoePlayer`。
 */

export type NativePlayerState = {
  playing: boolean;
  buffering: boolean;
  positionMs: number;
  durationMs: number;
  mediaId: string | null;
  /** 当前在 ExoPlayer 播放列表中的下标；用于跟随系统切歌。 */
  index: number;
  /**
   * ExoPlayer 认定的「下一首/上一首」下标（-1 表示没有）。
   * **随机模式下这两个值才是真正会播到的曲目**，JS 必须照它们预解析直链，
   * 否则歌曲自然结束时原生会撞上未解析的占位符，表现为「一首放完卡住」。
   */
  nextIndex: number;
  previousIndex: number;
  error: string | null;
};

type PlayerMetadataPayload = {
  mediaId: string;
  title: string;
  artist: string;
  albumTitle: string;
  artworkUrl: string;
};

/** 一项播放列表条目：元数据 + 播放地址（可以是占位符，稍后 replaceItem 换成真链）。 */
export type NativeQueueItem = PlayerMetadataPayload & { url: string };

/**
 * 未解析直链时的占位 URI。
 *
 * 为什么要占位而不是直接不下发：系统媒体卡片的「上/下一首」是否可点取决于
 * `Player.hasNextMediaItem()/hasPreviousMediaItem()`，所以播放列表必须**先有长度**；
 * 而每首歌的直链要单独调酷狗 /song/url（签名在 JS 侧），不可能一次性全部拿到。
 * JS 会提前把「当前 + 后面几首」替换成真实直链，命中占位符时由自愈逻辑兜底。
 */
export const PENDING_URI_PREFIX = 'moekoe-pending://';

export function pendingUri(mediaId: string): string {
  return `${PENDING_URI_PREFIX}${mediaId}`;
}

type MoeKoePlayerModule = {
  setPlaylist(items: NativeQueueItem[], startIndex: number): Promise<boolean>;
  replaceItem(index: number, url: string, metadata: PlayerMetadataPayload): Promise<boolean>;
  seekToIndex(index: number): Promise<boolean>;
  setPlaybackMode(repeatMode: number, shuffleEnabled: boolean): Promise<boolean>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  stop(): Promise<boolean>;
  seekTo(positionMs: number): Promise<boolean>;
  getState(): Promise<NativePlayerState | null>;
};

/**
 * 播放模式到 ExoPlayer 的映射。
 *
 * 有了原生播放列表后，**曲目推进由 ExoPlayer 负责**，所以循环/随机必须交给它，
 * 否则「单曲循环」会变成顺序播放、「随机」会退化成顺序。
 * ExoPlayer 的 REPEAT_MODE：0=OFF、1=ONE、2=ALL。
 *
 * 这三个符号只在本文件内部使用（[PlayerManager.setPlaybackMode]），不对外导出。
 */
const NATIVE_REPEAT_MODE = { off: 0, one: 1, all: 2 } as const;

type NativePlaybackMode = {
  repeatMode: number;
  shuffleEnabled: boolean;
};

function toNativePlaybackMode(mode: 'sequence' | 'shuffle' | 'single'): NativePlaybackMode {
  switch (mode) {
    case 'single':
      return { repeatMode: NATIVE_REPEAT_MODE.one, shuffleEnabled: false };
    case 'shuffle':
      return { repeatMode: NATIVE_REPEAT_MODE.all, shuffleEnabled: true };
    case 'sequence':
    default:
      return { repeatMode: NATIVE_REPEAT_MODE.all, shuffleEnabled: false };
  }
}

/** 只在本文件内部用于注册事件监听，不对外导出。 */
const PLAYER_STATE_EVENT = 'MoeKoePlayer:state';
const PLAYER_COMMAND_EVENT = 'MoeKoePlayer:command';

/** 来自通知栏 / 锁屏 / 耳机的切歌命令。 */
export type NativePlayerCommand = 'next' | 'previous';

const native = NativeModules.MoeKoePlayer as MoeKoePlayerModule | undefined;

/**
 * 原生模块是否可用。
 * Expo Go / Web / 未经过原生构建时会为 false，调用方需自行降级（不要直接崩）。
 */
export function isNativePlayerAvailable(): boolean {
  return Boolean(native);
}

/** 指令类调用的统一兜底：失败只记日志，绝不让 Promise 拒绝逃逸出去。 */
async function guarded(action: string, run: () => Promise<unknown>): Promise<void> {
  if (!native) {
    return;
  }
  try {
    await run();
  } catch (error) {
    console.warn(`[PlayerManager] ${action} 失败:`, error);
  }
}

function metadataFor(track: PlayerTrack): PlayerMetadataPayload {
  return {
    mediaId: track.hash,
    title: track.title ?? '',
    artist: track.artist ?? '',
    albumTitle: track.album ?? '',
    artworkUrl: sizedImage(track.coverUrl, 480) ?? '',
  };
}

/** 把一首歌 + 播放地址组装成播放列表条目（供 store 建立列表 / 替换单项用）。 */
export function buildQueueItem(track: PlayerTrack, url: string): NativeQueueItem {
  return { ...metadataFor(track), url };
}

/**
 * Android 13+ 的 POST_NOTIFICATIONS 是**运行时权限**，只在 manifest 里声明不够。
 * media3 的 MediaSessionService 发的媒体通知同样受它限制（未授权时通知不显示、
 * 渠道 importance 会被压成 NONE），所以首次播放前请求一次。
 * 只请求一次，避免每次播放都弹窗；失败不影响播放本身。
 */
let notificationPermissionAsked = false;

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const apiLevel =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  if (!Number.isFinite(apiLevel) || apiLevel < 33) {
    // Android 13 以下没有这个运行时权限
    return;
  }

  if (notificationPermissionAsked) {
    return;
  }
  notificationPermissionAsked = true;

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    console.log('[PlayerManager] POST_NOTIFICATIONS 请求结果:', result);
  } catch (error) {
    console.warn('[PlayerManager] 请求通知权限失败:', error);
  }
}

/** 状态变化事件（播放/暂停/缓冲/错误/切曲）。进度不在此列，需另取。 */
export function onNativeState(
  listener: (state: NativePlayerState) => void
): EmitterSubscription {
  return DeviceEventEmitter.addListener(PLAYER_STATE_EVENT, listener);
}

/**
 * 通知栏 / 锁屏 / 耳机上的「上/下一首」。
 *
 * 原生侧刻意没有把整个队列交给 ExoPlayer：每首歌的直链都要单独调酷狗
 * /song/url（签名在 JS 侧），没法预置 URI。所以让 MediaSession 把命令
 * 桥回来，由 JS 解析地址后调用 [PlayerManager.seekToIndex]。
 */
export function onNativeCommand(
  listener: (command: NativePlayerCommand) => void
): EmitterSubscription {
  return DeviceEventEmitter.addListener(PLAYER_COMMAND_EVENT, listener);
}

export const PlayerManager = {
  isAvailable: isNativePlayerAvailable,

  /**
   * 建立**整条播放列表**（长度 = 队列长度），让系统媒体卡片的「上/下一首」变为可点。
   *
   * 只有 [startIndex] 那一项必须是真实直链，其余可以先给 [pendingUri] 占位；
   * JS 随后会用 [replaceItem] 提前把「当前 + 后面几首」换成真链。
   * 这是**会抛错**的方法（列表为空 / 原生失败），调用方需处理。
   */
  async setPlaylist(items: NativeQueueItem[], startIndex: number): Promise<void> {
    if (!native) {
      throw new Error('原生播放器模块 MoeKoePlayer 不可用（需经过原生构建，Expo Go 不支持）');
    }

    await ensureNotificationPermission();

    await native.setPlaylist(items, startIndex);
  },

  /** 把已解析出直链的曲目写回播放列表（预解析后调用）。失败只记日志。 */
  replaceItem(index: number, track: PlayerTrack, url: string): Promise<void> {
    return guarded('replaceItem', () => native!.replaceItem(index, url, metadataFor(track)));
  },

  /** 按播放列表下标跳转；调用方需确保该下标已解析出直链。 */
  seekToIndex(index: number): Promise<void> {
    return guarded('seekToIndex', () => native!.seekToIndex(index));
  },

  /** 同步循环/随机到 ExoPlayer（模式变化时调用）。 */
  setPlaybackMode(mode: 'sequence' | 'shuffle' | 'single'): Promise<void> {
    const nativeMode = toNativePlaybackMode(mode);
    return guarded('setPlaybackMode', () =>
      native!.setPlaybackMode(nativeMode.repeatMode, nativeMode.shuffleEnabled)
    );
  },

  pause(): Promise<void> {
    return guarded('pause', () => native!.pause());
  },

  resume(): Promise<void> {
    return guarded('resume', () => native!.resume());
  },

  stop(): Promise<void> {
    return guarded('stop', () => native!.stop());
  },

  seekToMs(positionMs: number): Promise<void> {
    return guarded('seekTo', () => native!.seekTo(positionMs));
  },

  /** 冷启对齐 / 进度轮询用；原生不可用或出错时一律返回 null，不抛错。 */
  async getState(): Promise<NativePlayerState | null> {
    if (!native) {
      return null;
    }
    try {
      return await native.getState();
    } catch (error) {
      console.warn('[PlayerManager] getState 失败:', error);
      return null;
    }
  },
};
