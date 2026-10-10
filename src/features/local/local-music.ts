import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import type { PlayerTrack } from '@/features/player/types';

/**
 * 本地音乐：扫描系统媒体库并映射成播放器认识的曲目。
 *
 * 原生实现在 `native/android/player/LocalMusicModule.kt`（模块名 `MoeKoeLocalMusic`）。
 * 本地曲目用 `source: 'local'` 标记，播放时**跳过在线直链解析**，
 * 直接用 [PlayerTrack.localUri]（content:// 形式）交给 ExoPlayer。
 */

type LocalAudioRow = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  uri: string;
  path: string | null;
};

type NativeLocalMusicModule = {
  scan(): Promise<LocalAudioRow[]>;
};

const native = NativeModules.MoeKoeLocalMusic as NativeLocalMusicModule | undefined;

export function isLocalMusicSupported(): boolean {
  return Platform.OS === 'android' && Boolean(native);
}

/** 本地曲目的 hash 前缀：与在线曲目区分开，避免同 hash 撞车。 */
const LOCAL_HASH_PREFIX = 'local:';

/**
 * 申请读取媒体库的权限。
 *
 * Android 13(API 33) 起细分成 `READ_MEDIA_AUDIO`；12 及以下仍是 `READ_EXTERNAL_STORAGE`。
 * 已经授权过则直接返回 true，不会重复弹窗。
 */
export async function ensureLocalMusicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  const apiLevel = Number(Platform.Version);
  const permission =
    apiLevel >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  if (!permission) {
    return false;
  }

  try {
    const already = await PermissionsAndroid.check(permission);
    if (already) {
      return true;
    }
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('[local] 申请媒体库权限失败:', error);
    return false;
  }
}

function toPlayerTrack(row: LocalAudioRow): PlayerTrack {
  return {
    hash: `${LOCAL_HASH_PREFIX}${row.id}`,
    title: row.title,
    artist: row.artist || '未知歌手',
    album: row.album || undefined,
    // 本地文件没有网络封面；媒体库内的内嵌封面读取成本高，先留空由 UI 兜底
    coverUrl: null,
    durationMs: row.durationMs,
    source: 'local',
    localUri: row.uri,
    localPath: row.path ?? undefined,
  };
}

export type LocalScanResult = {
  tracks: PlayerTrack[];
  /** 权限被拒时为 false —— UI 需要区分「没有音乐」和「没给权限」。 */
  granted: boolean;
};

/**
 * 扫描本地音乐。
 *
 * 先要权限再扫描：没有权限时 MediaStore 查询会返回空，
 * 若不区分就会把「没授权」误显示成「没有本地音乐」。
 */
export async function scanLocalMusic(): Promise<LocalScanResult> {
  if (!native) {
    return { tracks: [], granted: false };
  }

  const granted = await ensureLocalMusicPermission();
  if (!granted) {
    return { tracks: [], granted: false };
  }

  try {
    const rows = await native.scan();
    return { tracks: rows.map(toPlayerTrack), granted: true };
  } catch (error) {
    console.warn('[local] 扫描本地音乐失败:', error);
    return { tracks: [], granted: true };
  }
}
