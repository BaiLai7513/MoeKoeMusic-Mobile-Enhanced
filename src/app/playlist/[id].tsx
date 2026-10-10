import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { BatchDownloadBar } from '@/components/ui/batch-download-bar';
import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { SongListItem } from '@/components/ui/song-list-item';
import { TouchText } from '@/components/ui/touch-text';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { isDownloadSupported } from '@/features/download/downloader';
import { useBatchSelect } from '@/features/download/use-batch-select';
import { libraryActions, useLibrary } from '@/features/library/store';
import { fetchPlaylistTracks, type PlaylistInfo } from '@/features/playlist/playlist-api';
import { playCollection } from '@/features/player/play-collection';
import { useHasTrack, usePlayer } from '@/features/player/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { readCache, writeCache } from '@/lib/offline-cache';
import type { PlayerTrack } from '@/features/player/types';

/** 单个歌单的离线缓存键（只存第一页）。 */
function playlistCacheKey(playlistId: string): string {
  return `playlist.${playlistId}`;
}

type ScreenState = {
  info: PlaylistInfo | null;
  tracks: PlayerTrack[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};

export default function PlaylistScreen() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { track } = usePlayer();
  const params = useLocalSearchParams<{ id: string; name?: string; cover?: string }>();
  const playlistId = typeof params.id === 'string' ? params.id : '';
  const requestIdRef = useRef(0);

  const [state, setState] = useState<ScreenState>({
    info: null,
    tracks: [],
    page: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: '',
  });
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  const library = useLibrary();
  // 自己的歌单(含"我喜欢")才允许移除歌曲;listid 是写操作专用 ID
  const ownPlaylist = library.playlists.find((item) => item.gid === playlistId && item.isMine);
  const batch = useBatchSelect();
  const batchTracks = state.tracks.filter((item) => batch.selectedSet.has(item.hash));
  const canBatch = isDownloadSupported() && state.tracks.length > 0;

  useEffect(() => {
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  function handleTrackRemoved(removed: PlayerTrack) {
    setState((current) => ({
      ...current,
      tracks: current.tracks.filter((item) =>
        removed.fileid ? item.fileid !== removed.fileid : item.hash !== removed.hash
      ),
      info: current.info
        ? { ...current.info, count: Math.max(0, current.info.count - 1) }
        : current.info,
    }));
  }

  useEffect(() => {
    void loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  async function loadPage(page: number) {
    if (!playlistId) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setState((current) => ({
      ...current,
      loading: page === 1,
      loadingMore: page > 1,
      error: '',
    }));

    try {
      const result = await fetchPlaylistTracks(playlistId, page);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState((current) => {
          const seen = new Set(current.tracks.map((item) => item.hash));
          const merged =
            page === 1
              ? result.tracks
              : [...current.tracks, ...result.tracks.filter((item) => !seen.has(item.hash))];

          return {
            info: result.info ?? current.info,
            tracks: merged,
            page,
            hasMore: result.hasMore,
            loading: false,
            loadingMore: false,
            error: '',
          };
        });
      });

      // 只缓存第一页：足够离线时浏览与找回歌单内容，
      // 而整份歌单（可能 200+ 首）塞进 SecureStore 体积与读写开销都不划算。
      if (page === 1) {
        void writeCache(playlistCacheKey(playlistId), {
          tracks: result.tracks,
          info: result.info ?? null,
        });
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      // 断网兜底：用上次缓存的第一页，让歌单至少能打开、能看到歌
      if (page === 1 && !state.tracks.length) {
        const cached = await readCache<{ tracks: PlayerTrack[]; info: PlaylistInfo | null }>(
          playlistCacheKey(playlistId)
        );
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (cached?.tracks?.length) {
          startTransition(() => {
            setState({
              info: cached.info,
              tracks: cached.tracks,
              page: 1,
              hasMore: false,
              loading: false,
              loadingMore: false,
              error: '网络不可用，正在显示上次加载的歌曲',
            });
          });
          return;
        }
      }

      startTransition(() => {
        setState((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          hasMore: page === 1 ? current.hasMore : false,
          error: error instanceof Error ? error.message : '歌单加载失败',
        }));
      });
    }
  }

  /** 从第 index 首开始播放整个歌单：先播已加载的，后台补齐剩余分页到队列。 */
  function playFrom(index: number) {
    void playCollection({
      tracks: state.tracks,
      startIndex: index,
      loadedPage: state.page,
      hasMore: state.hasMore,
      loadPage: (page) => fetchPlaylistTracks(playlistId, page),
    });
  }

  const fallbackName = typeof params.name === 'string' ? params.name : '';
  const fallbackCover = typeof params.cover === 'string' && params.cover ? params.cover : null;
  const title = state.info?.name || fallbackName || '歌单';
  const coverUrl = state.info?.coverUrl ?? fallbackCover;
  const activeHash = track?.hash;
  const listBottomInset = insets.bottom + (hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;

  return (
    <View flex={1} backgroundColor={palette.background}>
      <LinearGradient
        colors={[isDark ? 'rgba(255, 126, 182, 0.16)' : 'rgba(255, 92, 158, 0.14)', 'transparent']}
        style={styles.headerGlow}
      />

      <FlatList
        data={state.tracks}
        keyExtractor={(item, index) => `${item.hash}-${index}`}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (state.hasMore && !state.loading && !state.loadingMore) {
            void loadPage(state.page + 1);
          }
        }}
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: MaxContentWidth,
          paddingHorizontal: 12,
          paddingTop: insets.top + 8,
          paddingBottom: listBottomInset,
        }}
        ListHeaderComponent={
          <YStack gap={18} paddingHorizontal={4} paddingBottom={16}>
            <XStack
              width={38}
              height={38}
              borderRadius={19}
              alignItems="center"
              justifyContent="center"
              backgroundColor={palette.card}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              transition="quickest"
              pressStyle={{ opacity: 0.6, scale: 0.94 }}
              onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </XStack>

            <XStack gap={16} alignItems="center">
              <Artwork uri={coverUrl} size={112} radius={20} />
              <YStack flex={1} gap={7}>
                <Text color={palette.text} fontSize={20} fontWeight="800" numberOfLines={2}>
                  {title}
                </Text>
                {state.info?.intro ? (
                  <Text color={palette.textTertiary} fontSize={12.5} lineHeight={18} numberOfLines={2}>
                    {state.info.intro.replace(/\s+/g, ' ')}
                  </Text>
                ) : null}
                <Text color={palette.textTertiary} fontSize={12}>
                  {state.info?.count ? `共 ${state.info.count} 首` : ''}
                </Text>
              </YStack>
            </XStack>

            {state.tracks.length ? (
              <XStack alignSelf="flex-start" alignItems="center" gap={10}>
                <XStack
                  alignItems="center"
                  gap={7}
                  height={44}
                  paddingHorizontal={22}
                  borderRadius={22}
                  backgroundColor={palette.accent}
                  transition="quickest"
                  pressStyle={{ opacity: 0.85, scale: 0.97 }}
                  onPress={() => playFrom(0)}>
                  <Ionicons name="play" size={16} color={palette.onAccent} />
                  <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                    播放全部
                  </Text>
                </XStack>

                {canBatch && !batch.selectMode ? (
                  <XStack
                    alignItems="center"
                    gap={6}
                    height={44}
                    paddingHorizontal={18}
                    borderRadius={22}
                    backgroundColor={palette.card}
                    borderWidth={StyleSheet.hairlineWidth}
                    borderColor={palette.border}
                    transition="quickest"
                    pressStyle={{ opacity: 0.75, scale: 0.97 }}
                    onPress={batch.enter}>
                    <Ionicons name="checkmark-circle-outline" size={17} color={palette.text} />
                    <Text color={palette.text} fontSize={14} fontWeight="600">
                      多选
                    </Text>
                  </XStack>
                ) : null}
              </XStack>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          state.loading ? (
            <YStack alignItems="center" paddingVertical={70}>
              <Spinner size="large" color={palette.accent} />
            </YStack>
          ) : state.error ? (
            <YStack alignItems="center" paddingVertical={60} gap={12} paddingHorizontal={28}>
              <Ionicons name="cloud-offline-outline" size={36} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13} textAlign="center">
                {state.error}
              </Text>
              <TouchText onPress={() => void loadPage(1)} fontSize={14}>
                重试
              </TouchText>
            </YStack>
          ) : (
            <YStack alignItems="center" paddingVertical={60} gap={8}>
              <Ionicons name="musical-note" size={34} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13}>
                这个歌单还没有歌曲
              </Text>
            </YStack>
          )
        }
        ListFooterComponent={
          state.loadingMore ? (
            <XStack justifyContent="center" paddingVertical={16}>
              <Spinner color={palette.accent} />
            </XStack>
          ) : null
        }
        renderItem={({ item, index }) => (
          <SongListItem
            track={item}
            rank={index + 1}
            active={item.hash === activeHash}
            onPress={() => playFrom(index)}
            onMore={() => setActionTrack(item)}
            selectMode={batch.selectMode}
            selected={batch.selectedSet.has(item.hash)}
            onToggleSelect={() => batch.toggle(item.hash)}
          />
        )}
      />

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
        removal={
          ownPlaylist
            ? { listid: ownPlaylist.listid, onRemoved: handleTrackRemoved }
            : undefined
        }
      />

      {/* 多选时隐藏 MiniPlayer 并换成批量操作条，避免两个底部浮层打架 */}
      {batch.selectMode ? (
        <BatchDownloadBar
          tracks={batchTracks}
          allTracks={state.tracks}
          bottomInset={insets.bottom}
          onSelectAll={() => batch.toggleAll(state.tracks)}
          onCancel={batch.exit}
        />
      ) : (
        <RNView
          pointerEvents="box-none"
          style={[styles.miniDock, { bottom: Math.max(insets.bottom, 12) }]}>
          <RNView pointerEvents="box-none" style={styles.miniDockInner}>
            <MiniPlayer />
          </RNView>
        </RNView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  miniDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  miniDockInner: {
    width: '100%',
    maxWidth: 680,
  },
});
