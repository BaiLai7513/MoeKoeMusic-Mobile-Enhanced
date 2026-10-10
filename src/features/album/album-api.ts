import type { PlayerTrack } from '@/features/player/types';
import {
  pickNumber,
  pickStringLike,
  pickText,
  toRecord,
  toRecords,
} from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

/**
 * 专辑相关接口。
 *
 * 说明：本文件原先属于 `features/discover/discover-api.ts`。
 * 「发现」页整体移除后，专辑页仍需 `fetchAlbumSongs`，所以单独拆出来，
 * 避免为一个接口保留整个 discover 模块。
 */

/** 专辑页每页条数。 */
export const ALBUM_PAGE_SIZE = 30;

export type AlbumSongsPage = {
  tracks: PlayerTrack[];
  total: number;
  hasMore: boolean;
};

/** 专辑歌曲（album_songs，字段嵌套在 audio_info/base/album_info 里）。 */
export async function fetchAlbumSongs(albumId: string, page: number): Promise<AlbumSongsPage> {
  await bootstrapMobileApi();
  const response = await mobileApi.album_songs({
    id: albumId,
    page,
    pagesize: ALBUM_PAGE_SIZE,
  });

  const data = toRecord(toRecord(response.body).data);
  const tracks = toRecords(data.songs)
    .map<PlayerTrack | null>((item) => {
      const audioInfo = toRecord(item.audio_info);
      const base = toRecord(item.base);
      const albumInfo = toRecord(item.album_info);
      const transParam = toRecord(item.trans_param);
      const copyright = toRecord(item.copyright);

      const hash = pickText(audioInfo.hash);
      const title = pickText(base.audio_name);
      if (!hash || !title) {
        return null;
      }

      return {
        hash,
        title,
        artist: pickText(base.author_name, '未知歌手'),
        album: pickText(albumInfo.album_name) || undefined,
        coverUrl: sizedImage(pickText(transParam.union_cover, albumInfo.sizable_cover), 240),
        albumId: pickStringLike(albumInfo.album_id) || undefined,
        albumAudioId: pickStringLike(base.album_audio_id, base.audio_id) || undefined,
        durationMs: normalizeDurationMs(audioInfo.duration),
        vip: pickNumber(copyright.privilege) >= 10 || undefined,
        quality: pickText(audioInfo.hash_flac)
          ? 'sq'
          : pickText(audioInfo.hash_320)
            ? 'hq'
            : undefined,
      };
    })
    .filter((item): item is PlayerTrack => Boolean(item));

  const total = pickNumber(data.total);

  return {
    tracks,
    total,
    hasMore: total > 0 ? page * ALBUM_PAGE_SIZE < total : tracks.length >= ALBUM_PAGE_SIZE,
  };
}
