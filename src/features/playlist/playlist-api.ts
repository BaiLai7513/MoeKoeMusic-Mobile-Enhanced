import type { PlayerTrack } from '@/features/player/types';
import { detectAudioQuality, pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { normalizeDurationMs, sizedImage, splitArtistTitle } from '@/lib/format';
import { bootstrapMobileApi, mobileApi } from '@/lib/kugou-api';

export type PlaylistInfo = {
  name: string;
  intro: string;
  coverUrl: string | null;
  count: number;
  /** 歌单的**数字 ID**（写操作专用，与路由用的 gid 不是一回事）。 */
  listid: string;
  /** 创建者 userid：收藏时要靠它告诉服务端「这是谁的歌单」。 */
  createUserid: string;
};

export type PlaylistTracksPage = {
  info: PlaylistInfo | null;
  tracks: PlayerTrack[];
  hasMore: boolean;
};

export const PLAYLIST_PAGE_SIZE = 50;

export async function fetchPlaylistTracks(
  globalCollectionId: string,
  page: number
): Promise<PlaylistTracksPage> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_track_all({
    id: globalCollectionId,
    page,
    pagesize: PLAYLIST_PAGE_SIZE,
  });

  const data = toRecord(toRecord(response.body).data);
  const listInfo = toRecord(data.list_info);
  const count = pickNumber(data.count, listInfo.count);

  const name = pickText(listInfo.name);
  const info: PlaylistInfo | null = name || count > 0
    ? {
        name,
        intro: pickText(listInfo.intro),
        coverUrl: sizedImage(pickText(listInfo.pic), 480),
        count,
        // 收藏要用：不同版本字段名不一致，两种都认一下
        listid: pickStringLike(listInfo.listid ?? listInfo.list_create_listid),
        createUserid: pickStringLike(listInfo.list_create_userid),
      }
    : null;

  const songs = toRecords(data.songs);
  const tracks = songs
    .map<PlayerTrack | null>((item) => {
      const hash = pickText(item.hash);
      const rawName = pickText(item.name);
      if (!hash || !rawName) {
        return null;
      }

      const { artist, title } = splitArtistTitle(rawName);
      const albumInfo = toRecord(item.albuminfo);

      return {
        hash,
        title,
        artist: artist || '未知歌手',
        album: pickText(albumInfo.name) || undefined,
        coverUrl: sizedImage(pickText(item.cover), 240),
        albumId: pickStringLike(item.album_id) || undefined,
        albumAudioId: pickStringLike(item.album_audio_id, item.audio_id, item.mixsongid) || undefined,
        durationMs: normalizeDurationMs(item.timelen),
        vip: pickNumber(item.privilege) >= 10 || undefined,
        quality: detectAudioQuality(item),
        fileid: pickStringLike(item.fileid) || undefined,
      };
    })
    .filter((item): item is PlayerTrack => Boolean(item));

  return {
    info,
    tracks,
    hasMore:
      count > 0
        ? songs.length >= PLAYLIST_PAGE_SIZE && page * PLAYLIST_PAGE_SIZE < count
        : songs.length >= PLAYLIST_PAGE_SIZE,
  };
}
