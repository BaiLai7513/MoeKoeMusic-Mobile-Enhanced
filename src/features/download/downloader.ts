import { NativeModules, Platform } from 'react-native';

import {
  AUDIO_QUALITY_LABELS,
  type AudioQuality,
} from '@/features/player/audio-quality';
import { resolveSongSource } from '@/features/player/song-url';
import type { PlayerTrack } from '@/features/player/types';

/**
 * 重新导出：下载面板需要先探测可用音质再列选项，
 * 让调用方只依赖下载模块这一处即可。
 */
export { fetchAvailableQualities } from '@/features/player/song-url';

/**
 * 歌曲下载：解析直链 → 交给**系统下载器**。
 *
 * 原生实现在 `native/android/player/DownloadModule.kt`（模块名 `MoeKoeDownload`），
 * 底层是 Android 的 `DownloadManager`，好处见那里的注释。
 */

type NativeDownloadModule = {
  enqueue(url: string, subPath: string, title: string, description: string): Promise<number>;
};

const native = NativeModules.MoeKoeDownload as NativeDownloadModule | undefined;

/** 当前环境是否支持调用系统下载器（非 Android / 未原生构建时为 false）。 */
export function isDownloadSupported(): boolean {
  return Platform.OS === 'android' && Boolean(native);
}

/** 公共音乐目录下的子目录，方便「本地扫描」只扫我们自己下载的内容。 */
const DOWNLOAD_FOLDER = 'MoeKoe';

/** 去掉文件系统非法字符，并压缩空白。 */
function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DownloadOutcome = {
  /** 实际拿到的音质（可能因权限/资源不足从目标音质降级）。 */
  quality: AudioQuality;
  fileName: string;
};

/**
 * 下载单曲。
 *
 * [quality] 是**期望**音质；解析时会自动按「目标 → … → 128」降级，
 * 返回的 `quality` 才是真正下到的档位。
 */
export async function downloadTrack(
  track: PlayerTrack,
  quality: AudioQuality
): Promise<DownloadOutcome> {
  if (!native) {
    throw new Error('当前环境不支持调用系统下载器');
  }

  const source = await resolveSongSource(track, { quality });
  const artist = sanitizeFileName(track.artist || '未知歌手');
  const title = sanitizeFileName(track.title || track.hash);
  const fileName = `${artist} - ${title}.${source.extName}`;
  const subPath = `${DOWNLOAD_FOLDER}/${fileName}`;

  await native.enqueue(
    source.uri,
    subPath,
    track.title || fileName,
    `${artist} · ${AUDIO_QUALITY_LABELS[source.quality]}`
  );

  return { quality: source.quality, fileName };
}

/** 批量下载进度。 */
export type BatchDownloadProgress = {
  done: number;
  total: number;
  failed: number;
};

/**
 * 批量下载（顺序执行）。
 *
 * 刻意**逐首之间留间隔**：解析直链要调 `/privilege/lite` + `/song/url`，
 * 一口气打几十次很容易被风控限流。单首失败不中断整批。
 */
export async function downloadTracks(
  tracks: PlayerTrack[],
  quality: AudioQuality,
  onProgress?: (progress: BatchDownloadProgress) => void
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  for (let index = 0; index < tracks.length; index += 1) {
    try {
      await downloadTrack(tracks[index], quality);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.warn('[download] 下载失败:', tracks[index]?.title, error);
    }

    onProgress?.({ done: index + 1, total: tracks.length, failed });

    if (index < tracks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return { ok, failed };
}
