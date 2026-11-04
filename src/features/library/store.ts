import { useSyncExternalStore } from 'react';

import { isLoggedIn } from '@/features/account/user-api';
import type { PlayerTrack } from '@/features/player/types';
import { bootstrapMobileApi } from '@/lib/kugou-api';
import { readCache, writeCache } from '@/lib/offline-cache';
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist as deletePlaylistRemote,
  fetchLibraryPlaylists,
  fetchPlaylistTrackRefs,
  isPlaylistDeletable,
  isPlaylistUncollectable,
  removeTracksFromPlaylist,
  type LibraryPlaylist,
} from './library-api';

/** 歌单列表的离线缓存键：断网时至少能列出自己的歌单。 */
const LIBRARY_CACHE_KEY = 'library.playlists';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export type LibraryState = {
  status: LibraryStatus;
  playlists: LibraryPlaylist[];
  /** 已喜欢歌曲 hash -> 在"我喜欢"歌单里的 fileid('' 表示刚加入、fileid 待后台刷新)。 */
  liked: Record<string, string>;
  likedReady: boolean;
  error: string;
};

const INITIAL_STATE: LibraryState = {
  status: 'idle',
  playlists: [],
  liked: {},
  likedReady: false,
  error: '',
};

let state = INITIAL_STATE;
const listeners = new Set<() => void>();

function setState(partial: Partial<LibraryState>) {
  state = { ...state, ...partial };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getLikePlaylist(): LibraryPlaylist | null {
  return state.playlists.find((item) => item.isLike) ?? null;
}

function bumpCount(listid: string, delta: number) {
  const playlists = state.playlists.map((item) =>
    item.listid === listid ? { ...item, count: Math.max(0, item.count + delta) } : item
  );
  setState({ playlists });
  // 数量变化也要落缓存：否则断网重进「我的」页时，缓存里的旧 count
  // 会把刚加/刚移除的数量“复活”，和内存里的歌单列表对不上。
  void writeCache(LIBRARY_CACHE_KEY, playlists);
}

let refreshPromise: Promise<void> | null = null;
let likedPromise: Promise<void> | null = null;

async function refreshLikedMap(): Promise<void> {
  if (!likedPromise) {
    likedPromise = (async () => {
      const like = getLikePlaylist();
      if (!like) {
        setState({ liked: {}, likedReady: true });
        return;
      }

      const refs = await fetchPlaylistTrackRefs(like.gid);
      const liked: Record<string, string> = {};
      for (const ref of refs) {
        liked[ref.hash] = ref.fileid;
      }
      setState({ liked, likedReady: true });
    })().finally(() => {
      likedPromise = null;
    });
  }

  return likedPromise;
}

async function refreshLibrary(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // 登录态存在 session 里,读取前先确保水合完成
      await bootstrapMobileApi();
      if (!isLoggedIn()) {
        setState({ ...INITIAL_STATE });
        return;
      }

      setState({ status: state.status === 'ready' ? 'ready' : 'loading', error: '' });
      try {
        const playlists = await fetchLibraryPlaylists();
        setState({ status: 'ready', playlists, error: '' });
        // 记下最后一次成功的歌单列表，供离线展示
        void writeCache(LIBRARY_CACHE_KEY, playlists);
        void refreshLikedMap().catch(() => undefined);
      } catch (error) {
        // 断网兜底：用上次缓存的歌单列表。
        // 只有当前没有任何数据时才去读缓存，避免把用户刚改过的状态覆盖回旧的。
        const cached = state.playlists.length
          ? null
          : await readCache<LibraryPlaylist[]>(LIBRARY_CACHE_KEY);

        if (cached?.length) {
          setState({ status: 'ready', playlists: cached, error: '' });
          return;
        }

        setState({
          status: state.status === 'ready' ? 'ready' : 'error',
          error: error instanceof Error ? error.message : '歌单加载失败',
        });
        throw error;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function ensureLibrary(): Promise<void> {
  if (state.status === 'ready') {
    return;
  }
  await refreshLibrary();
}

async function ensureLikedReady(): Promise<void> {
  await ensureLibrary();
  if (!state.likedReady) {
    await refreshLikedMap();
  }
}

/**
 * 真正执行「从云端歌单删歌」的公共逻辑。
 *
 * 普通自建歌单与「我喜欢」共用同一个云端接口（见 library-api 的注释），
 * 差别只在状态同步：如果删的正是「我喜欢」，还要把 liked 映射一起清掉，
 * 否则列表里那颗红心会继续亮着，用户会以为没取消成功。
 *
 * 只处理带 fileid 的曲目：fileid 是「这首歌在这个歌单里的实例 ID」，
 * 接口只认它，不能拿 hash 顶替。
 */
async function removeTracksFromList(listid: string, tracks: PlayerTrack[]): Promise<void> {
  const removable = tracks.filter(
    (track): track is PlayerTrack & { fileid: string } => Boolean(track.fileid)
  );
  if (!removable.length) {
    throw new Error('缺少歌曲信息，无法移除');
  }

  await removeTracksFromPlaylist(
    listid,
    removable.map((track) => track.fileid)
  );
  bumpCount(listid, -removable.length);

  const like = getLikePlaylist();
  if (like?.listid === listid) {
    const liked = { ...state.liked };
    for (const track of removable) {
      delete liked[track.hash];
    }
    setState({ liked });
  }
}

export const libraryActions = {
  refresh: refreshLibrary,
  ensure: ensureLibrary,

  reset() {
    setState({ ...INITIAL_STATE });
  },

  /** 加入/移出"我喜欢"。未登录或没有"我喜欢"歌单时抛错。 */
  async toggleLike(track: PlayerTrack): Promise<'liked' | 'unliked'> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    await ensureLikedReady();
    const like = getLikePlaylist();
    if (!like) {
      throw new Error('没有找到"我喜欢"歌单');
    }

    const existing = state.liked[track.hash];
    if (existing !== undefined) {
      let fileid = existing;
      if (!fileid) {
        // 刚加入还没拿到 fileid，强制刷新一次映射
        await refreshLikedMap();
        fileid = state.liked[track.hash] ?? '';
      }
      if (!fileid) {
        throw new Error('暂时无法移出，请稍后再试');
      }

      await removeTracksFromPlaylist(like.listid, [fileid]);
      const liked = { ...state.liked };
      delete liked[track.hash];
      setState({ liked });
      bumpCount(like.listid, -1);
      return 'unliked';
    }

    await addTracksToPlaylist(like.listid, [track]);
    setState({ liked: { ...state.liked, [track.hash]: '' } });
    bumpCount(like.listid, 1);
    // 后台补拉真实 fileid，供后续"取消喜欢"使用
    void refreshLikedMap().catch(() => undefined);
    return 'liked';
  },

  /** 收藏歌曲到指定歌单。 */
  async addToPlaylist(playlist: LibraryPlaylist, tracks: PlayerTrack[]): Promise<void> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    await addTracksToPlaylist(playlist.listid, tracks);
    bumpCount(playlist.listid, tracks.length);
    if (playlist.isLike) {
      const liked = { ...state.liked };
      for (const track of tracks) {
        if (liked[track.hash] === undefined) {
          liked[track.hash] = '';
        }
      }
      setState({ liked });
      void refreshLikedMap().catch(() => undefined);
    }
  },

  /** 从歌单移除歌曲(需要 track.fileid)。 */
  async removeFromPlaylist(listid: string, tracks: PlayerTrack[]): Promise<void> {
    await removeTracksFromList(listid, tracks);
  },

  /**
   * 批量取消喜欢（「我喜欢」页的批量移除）。
   *
   * 语义上这是「取消收藏」，不是把歌从自建歌单里删掉；但底层没有独立的取消喜欢接口，
   * 「我喜欢」本身就是账号下的一个云端歌单，所以仍然调用同一个删歌接口，
   * 只是 listid 固定取「我喜欢」歌单，并同步 liked 映射（见 removeTracksFromList）。
   * 这与现有的单曲 toggleLike 取消分支完全一致，不会出现两套状态。
   */
  async removeLikedTracks(tracks: PlayerTrack[]): Promise<void> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    const like = getLikePlaylist();
    if (!like) {
      throw new Error('没有找到"我喜欢"歌单');
    }

    await removeTracksFromList(like.listid, tracks);
  },

  /** 创建歌单并刷新列表，返回新歌单 listid。 */
  async createPlaylist(name: string): Promise<string> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }

    const listid = await createPlaylist(name);
    await refreshLibrary();
    return listid;
  },

  /**
   * 删除自己创建的歌单，或取消收藏别人/官方的歌单。
   *
   * 为什么要先本地挡一次：删除接口对「默认收藏」这类普通自建歌单是真删，
   * 对收藏来的歌单只做取消收藏，对「我喜欢」这类收藏歌单会拒绝/造成灾难。
   * 入口已经按 isPlaylistDeletable / isPlaylistUncollectable 过滤；
   * 这里再挡一道，避免别处调用时误删。
   *
   * 成功后**不重新拉列表**：直接把这条从内存 state 里摘掉并同步离线缓存。
   * 「我的」页读的就是这份 state，所以列表立刻消失；再打一次网络请求只会
   * 让「删完还看得见」的窗口更长，断网时甚至会把刚删掉的歌单从缓存里复活。
   */
  async removePlaylist(playlist: LibraryPlaylist): Promise<void> {
    if (!isLoggedIn()) {
      throw new Error('请先登录');
    }
    if (!isPlaylistDeletable(playlist) && !isPlaylistUncollectable(playlist)) {
      throw new Error('这个歌单不能删除');
    }

    await deletePlaylistRemote(playlist.listid);

    const playlists = state.playlists.filter((item) => item.listid !== playlist.listid);
    setState({ playlists });
    // 缓存与内存同源，否则断网重进「我的」页又会被旧缓存拉回来
    void writeCache(LIBRARY_CACHE_KEY, playlists);
  },
};

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL_STATE);
}

export function useIsLiked(hash: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hash ? state.liked[hash] !== undefined : false),
    () => false
  );
}

export type { LibraryPlaylist };
