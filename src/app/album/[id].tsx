import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { PlaylistPickSheet } from '@/components/ui/playlist-pick-sheet';
import { showToast } from '@/components/ui/toast';
import { TrackCollectionScreen } from '@/components/ui/track-collection-screen';
import { fetchAlbumSongs } from '@/features/album/album-api';
import { libraryActions, useLibrary } from '@/features/library/store';
import type { PlayerTrack } from '@/features/player/types';

export default function AlbumScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    cover?: string;
    artist?: string;
    date?: string;
  }>();
  const albumId = typeof params.id === 'string' ? params.id : '';
  const name = typeof params.name === 'string' && params.name ? params.name : '专辑';
  const cover = typeof params.cover === 'string' && params.cover ? params.cover : null;
  const artist = typeof params.artist === 'string' ? params.artist : '';
  const date = typeof params.date === 'string' ? params.date : '';
  const subtitle = [artist, date].filter(Boolean).join(' · ');

  const library = useLibrary();
  const [pickOpen, setPickOpen] = useState(false);
  /** 打开面板那一刻的曲目快照：面板期间列表可能继续分页，不跟着变。 */
  const [pendingTracks, setPendingTracks] = useState<PlayerTrack[]>([]);

  const loadPage = useCallback((page: number) => fetchAlbumSongs(albumId, page), [albumId]);

  // 歌单列表是懒加载的：打开面板时确保已经拉过（失败就显示空态，不弹错）
  useEffect(() => {
    if (pickOpen) {
      void libraryActions.ensure().catch(() => undefined);
    }
  }, [pickOpen]);

  /*
   * 只有**自己创建**的歌单可写：收藏来的歌单属于别人，往里面加歌服务端会拒绝。
   * 「我喜欢」虽然是收藏语义，但它就是账号自己的歌单，允许添加 —— 所以只过滤 isMine。
   */
  const writablePlaylists = library.playlists.filter((item) => item.isMine);

  return (
    <>
      <TrackCollectionScreen
        collectionKey={albumId}
        title={name}
        subtitle={subtitle}
        coverUrl={cover}
        emptyText="这张专辑暂时没有歌曲"
        loadPage={loadPage}
        headerActionLabel="添加"
        onHeaderAction={(tracks) => {
          setPendingTracks(tracks);
          setPickOpen(true);
        }}
      />

      <PlaylistPickSheet
        open={pickOpen}
        onOpenChange={setPickOpen}
        subtitle={`把 ${pendingTracks.length} 首歌加入哪个歌单`}
        playlists={writablePlaylists}
        onPick={async (playlist) => {
          await libraryActions.addToPlaylist(playlist, pendingTracks);
          showToast(`已添加到「${playlist.name}」`);
        }}
      />
    </>
  );
}
