import type { PlayerTrack } from '@/features/player/types';
import {
  detectAudioQuality,
  formatApiError,
  pickNumber,
  pickStringLike,
  pickText,
  toRecord,
  toRecords,
} from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, splitArtistTitle } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

/**
 * 首页数据。
 *
 * 精简后首页只保留「每日推荐」一个内容区块（外加顶部的搜索与听歌识曲入口），
 * 轮播图 / 推荐歌单 / 榜单 / 新歌速递都已移除 —— 这些是面向大众的内容运营位，
 * 个人版不需要，也省掉了对应的公开接口调用。
 */

export type HomeSong = PlayerTrack & { note: string };

export interface HomeData {
  dailySongs: HomeSong[];
  issues: string[];
  updatedAt: number;
}

type SectionResult<T> = {
  data: T | null;
  error: string | null;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function formatSongNote(note: string) {
  if (/^\d{8}$/.test(note)) {
    return `${note.slice(0, 4)}.${note.slice(4, 6)}.${note.slice(6, 8)}`;
  }

  return note.replaceAll('-', '.');
}

function normalizeSong(record: Record<string, unknown>): HomeSong | null {
  const hash = pickText(record.hash);
  if (!hash) {
    return null;
  }

  const filename = pickText(record.filename);
  const parsedFilename = splitArtistTitle(filename);
  const transParam = toRecord(record.trans_param);
  const title = pickText(record.ori_audio_name, record.songname, parsedFilename.title, filename);
  if (!title) {
    return null;
  }

  return {
    hash,
    title,
    artist: pickText(record.author_name, parsedFilename.artist, '未知歌手'),
    coverUrl: sizedImage(
      pickText(transParam.union_cover, record.sizable_cover, record.album_sizable_cover),
      240
    ),
    albumId: pickStringLike(record.album_id) || undefined,
    albumAudioId: pickStringLike(record.album_audio_id, record.audio_id, record.mixsongid) || undefined,
    durationMs: normalizeDurationMs(record.time_length ?? record.timelength ?? record.timelen),
    vip: pickNumber(record.privilege) >= 10 || undefined,
    quality: detectAudioQuality(record),
    note: formatSongNote(
      pickText(record.rec_copy_write, record.recommend_reason, record.publish_date)
    ),
  };
}

async function loadSection<T>(label: string, runner: () => Promise<T>): Promise<SectionResult<T>> {
  try {
    const data = await runner();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: `${label}加载失败：${formatApiError(error)}` };
  }
}

export async function loadHomeData(): Promise<HomeData> {
  await bootstrapMobileApi();

  const dailySection = await loadSection('每日推荐', async () => {
    const response = await mobileApi.everyday_recommend({ platform: 'ios' });
    const data = toRecord(toRecord(response.body).data);

    const songs = toRecords(data.song_list)
      .map(normalizeSong)
      .filter((item): item is HomeSong => Boolean(item));

    return shuffle(songs).slice(0, 24);
  });

  const dailySongs = dailySection.data ?? [];
  const issues = dailySection.error ? [dailySection.error] : [];

  // 唯一的区块都空了才算加载失败，交给上层展示错误态
  if (!dailySongs.length) {
    throw new Error(issues[0] ?? '每日推荐加载失败');
  }

  return {
    dailySongs,
    issues,
    updatedAt: Date.now(),
  };
}
