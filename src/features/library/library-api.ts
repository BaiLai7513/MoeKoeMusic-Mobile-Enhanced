import type { PlayerTrack } from '@/features/player/types';
import { pickNumber, pickStringLike, pickText, toRecord, toRecords } from '@/lib/api-parse';
import { sizedImage } from '@/lib/format';
import { bootstrapMobileApi, getApiSession, mobileApi } from '@/lib/kugou-api';

export type LibraryPlaylist = {
  /** 写操作(加歌/删歌/删歌单)用的 ID。 */
  listid: string;
  /** 读操作(拉曲目/路由跳转)用的全局 ID。 */
  gid: string;
  name: string;
  coverUrl: string | null;
  count: number;
  isMine: boolean;
  isLike: boolean;
};

export const LIKE_PLAYLIST_NAME = '我喜欢';

function ensureOk(body: unknown, fallbackMessage: string): Record<string, unknown> {
  const record = toRecord(body);
  if (pickNumber(record.status) !== 1) {
    throw new Error(pickText(record.error_msg, record.error) || fallbackMessage);
  }
  return record;
}

export async function fetchLibraryPlaylists(): Promise<LibraryPlaylist[]> {
  await bootstrapMobileApi();
  const response = await mobileApi.user_playlist({ page: 1, pagesize: 200 });
  const data = toRecord(toRecord(response.body).data);
  const myUserid = String(getApiSession().userid ?? '');

  return toRecords(data.info)
    .map<LibraryPlaylist | null>((item) => {
      const listid = pickStringLike(item.listid);
      const gid = pickStringLike(item.list_create_gid);
      const name = pickText(item.name);
      // authors 字段存在说明是收藏的专辑，不算歌单
      if (!listid || !gid || !name || item.authors) {
        return null;
      }

      return {
        listid,
        gid,
        name,
        coverUrl: sizedImage(pickText(item.pic), 240),
        count: pickNumber(item.count),
        isMine: pickStringLike(item.list_create_userid) === myUserid,
        isLike: name === LIKE_PLAYLIST_NAME,
      };
    })
    .filter((item): item is LibraryPlaylist => Boolean(item));
}

/** 创建歌单，返回新歌单的 listid。 */
export async function createPlaylist(name: string): Promise<string> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_add({
    name,
    list_create_userid: getApiSession().userid,
  });
  const body = ensureOk(response.body, '创建歌单失败');
  return pickStringLike(toRecord(toRecord(body.data).info).listid);
}

/**
 * 删除歌单（api/module/playlist_del.js → `/v2/delete_list`，cloudlist 服务）。
 *
 * 接口只认 `listid`（用户歌单 ID），不是路由用的 gid ——
 * 两者在 user_playlist 的返回里是两个不同字段，传错会删不掉对应的歌单。
 * 模块内部把 listid 转成 Number，所以传数字串即可。
 *
 * 服务端对「收藏来的歌单」只会取消收藏、对「我喜欢」这类收藏歌单会拒绝，
 * 所以调用方要先过 isPlaylistDeletable / isPlaylistUncollectable ——
 * 这里只负责转发并如实报错。
 */
export async function deletePlaylist(listid: string): Promise<void> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_del({ listid });
  ensureOk(response.body, '删除歌单失败');
}

/**
 * 「我喜欢」的别名：它本质是收藏、不是普通歌单，删掉等于清空全部收藏，
 * 所以即使 list_create_userid 是本人也禁止删除。
 *
 * 名字集合只是 isLike 之外的双保险（isLike 只认「我喜欢」），
 * 兜住服务端对收藏歌单使用同义叫法的历史差异。
 *
 * 注意：**不要把「默认收藏」「我的收藏」加进来** —— 用户确认过它们是
 * 「我创建的歌单」里的普通歌单（默认收藏只是没起名字），必须允许删除；
 * 加进来会让用户永远删不掉自己的歌单。
 */
const LIKE_PLAYLIST_ALIASES = new Set([LIKE_PLAYLIST_NAME, '我喜欢的音乐']);

/**
 * 这个歌单能不能整个删掉。
 * - 只有自己创建的歌单才能真删；收藏来的歌单走 isPlaylistUncollectable（取消收藏）；
 * - 「我喜欢」以及同义叫法必须排除：删它等于清空收藏。
 *
 * 「默认收藏」是普通自建歌单（用户确认过），这里刻意不做名字特判。
 */
export function isPlaylistDeletable(playlist: LibraryPlaylist): boolean {
  return playlist.isMine && !playlist.isLike && !LIKE_PLAYLIST_ALIASES.has(playlist.name);
}

/**
 * 这个收藏来的歌单能不能从「我的收藏」里移除。
 *
 * 收藏页里的歌单都不是本人创建的，`playlist_del` 在服务端对它们只会取消收藏，
 * 不会删除原歌单（api/module/playlist_del.js 的注释就是「取消收藏歌单」）。
 * 所以入口对它们可用，但文案/确认必须说清是「取消收藏」而不是删除。
 */
export function isPlaylistUncollectable(playlist: LibraryPlaylist): boolean {
  return !playlist.isMine && !playlist.isLike && !LIKE_PLAYLIST_ALIASES.has(playlist.name);
}

/**
 * 收藏歌曲到歌单。data 串按 `,`/`|` 拆分，
 * 所以歌名里的这两个分隔符必须剔除；直调模块不要再 URL 编码。
 */
export async function addTracksToPlaylist(listid: string, tracks: PlayerTrack[]): Promise<void> {
  await bootstrapMobileApi();
  const data = tracks
    .map((track) => {
      const name = `${track.artist} - ${track.title}`.replace(/[,|]/g, ' ');
      return [name, track.hash, track.albumId ?? '', track.albumAudioId ?? ''].join('|');
    })
    .join(',');

  const response = await mobileApi.playlist_tracks_add({ listid, data });
  ensureOk(response.body, '收藏失败');
}

/**
 * 从歌单移除歌曲；fileid 来自歌单曲目接口，与 hash 不是一回事。
 *
 * 「我喜欢」的取消喜欢也走这里：酷狗没有单独的取消喜欢接口，
 * 「我喜欢」本身就是账号下的一个云端歌单（api/module/playlist_tracks_sort.js
 * 也注明「type 0=自建/我喜欢」）。现有的 toggleLike 取消分支同样是用
 * removeTracksFromPlaylist(like.listid, [fileid]) 实现的，所以两处行为一致。
 */
export async function removeTracksFromPlaylist(listid: string, fileids: string[]): Promise<void> {
  await bootstrapMobileApi();
  const response = await mobileApi.playlist_tracks_del({ listid, fileids: fileids.join(',') });
  ensureOk(response.body, '移除失败');
}

export type PlaylistTrackRef = {
  hash: string;
  fileid: string;
};

const TRACK_REF_PAGE_SIZE = 300;
const TRACK_REF_MAX_PAGES = 4;

/**
 * 拉取歌单全部曲目的 hash/fileid 轻量映射(用于"我喜欢"状态判定与取消喜欢)。
 * 上限 TRACK_REF_MAX_PAGES 页，超大歌单尾部不保证覆盖。
 */
export async function fetchPlaylistTrackRefs(gid: string): Promise<PlaylistTrackRef[]> {
  await bootstrapMobileApi();
  const refs: PlaylistTrackRef[] = [];

  for (let page = 1; page <= TRACK_REF_MAX_PAGES; page += 1) {
    const response = await mobileApi.playlist_track_all({
      id: gid,
      page,
      pagesize: TRACK_REF_PAGE_SIZE,
    });
    const data = toRecord(toRecord(response.body).data);
    const songs = toRecords(data.songs);

    for (const item of songs) {
      const hash = pickText(item.hash);
      const fileid = pickStringLike(item.fileid);
      if (hash && fileid) {
        refs.push({ hash, fileid });
      }
    }

    const total = pickNumber(toRecord(data.list_info).count);
    const fetched = page * TRACK_REF_PAGE_SIZE;
    if (songs.length < TRACK_REF_PAGE_SIZE || (total > 0 && fetched >= total)) {
      break;
    }
  }

  return refs;
}
