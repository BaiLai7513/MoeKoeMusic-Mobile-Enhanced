import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, StyleSheet, TextInput, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { BatchDownloadBar } from '@/components/ui/batch-download-bar';
import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { SongListItem } from '@/components/ui/song-list-item';
import { showToast } from '@/components/ui/toast';
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

/**
 * 筛选时自动补齐分页的安全上限，与 play-collection 的 MAX_FILL_PAGES 同口径：
 * 80 页 × 50 首 = 4000 首，已超出酷狗歌单容量上限。
 * 接口异常地一直声称"还有下一页"时不至于无限请求；到顶后仍可手动上滑加载。
 */
const SEARCH_FILL_MAX_PAGES = 80;

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
  // 收藏状态：以「我的歌单」里有没有同 listid 为准，收藏成功后本地先乐观置真
  const [collecting, setCollecting] = useState(false);
  const [collectedOnce, setCollectedOnce] = useState(false);
  // 歌单内搜索：默认收起（不占列表高度），点右上角放大镜才展开
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  // 批量移除进行中：批量条会显示 spinner，同时挡住重复确认
  const [removing, setRemoving] = useState(false);

  const library = useLibrary();
  // 自己的歌单(含"我喜欢")才允许移除歌曲;listid 是写操作专用 ID
  const ownPlaylist =
    library.playlists.find((item) => item.gid === playlistId && item.isMine) ?? null;
  const likePlaylist = library.playlists.find((item) => item.isLike) ?? null;
  /*
   * 「我喜欢」也要能移除歌曲（取消喜欢），但它是否被标成 isMine 取决于服务端
   * list_create_userid 是否等于当前账号。为了不让入口依赖这个字段，
   * 额外按 isLike + gid 兜底一次；普通自建歌单仍然只认 isMine。
   */
  const removablePlaylist =
    ownPlaylist ?? (likePlaylist?.gid === playlistId ? likePlaylist : null);
  const batch = useBatchSelect();
  const batchTracks = state.tracks.filter((item) => batch.selectedSet.has(item.hash));
  /*
   * 批量条的可用条件：能下载 **或** 能移除，任一即可。
   * 原条件只看下载能力，会导致非 Android / 原生模块缺失时根本进不了多选，
   * 连带把「批量移除」也锁死；但移除走的是普通网络接口，和系统下载器无关。
   */
  const canBatch =
    state.tracks.length > 0 && (isDownloadSupported() || Boolean(removablePlaylist));

  const trimmedKeyword = keyword.trim();
  const loweredKeyword = trimmedKeyword.toLowerCase();
  const filtering = loweredKeyword.length > 0;

  // 只过滤「显示」用的行，并顺手记住每首歌在原始列表里的下标。
  // 序号和播放起点都必须按原始队列算 —— 过滤后的位置只用于渲染。
  const rows = useMemo(() => {
    const all = state.tracks.map((track, index) => ({ track, index }));
    if (!loweredKeyword) {
      return all;
    }
    return all.filter(({ track }) => {
      return (
        track.title.toLowerCase().includes(loweredKeyword) ||
        track.artist.toLowerCase().includes(loweredKeyword) ||
        (track.album ? track.album.toLowerCase().includes(loweredKeyword) : false)
      );
    });
  }, [state.tracks, loweredKeyword]);

  const totalCount = state.info?.count || state.tracks.length;
  const collectedPlaylist = state.info?.listid
    ? library.playlists.find((item) => item.listid === state.info?.listid)
    : undefined;
  const collected = collectedOnce || Boolean(collectedPlaylist);

  /*
   * 「收藏」按钮只对**从搜索点进来的、还没收藏的**歌单显示：
   * 已创建 / 已收藏的歌单都在 `library.playlists` 里，命中就不显示。
   *
   * 判定结果在首次算出来后就**冻结**（`collectEligibleRef`）：
   * - 不能在收藏成功后重新计算，否则按钮会突然消失 → 整行重排（就是「点了收藏布局变了」）；
   * - 也不能在 library 还没加载完时算，否则自己的歌单会先闪出一个「收藏」按钮。
   */
  const collectEligibleRef = useRef<boolean | null>(null);
  if (collectEligibleRef.current === null && library.status === 'ready' && state.info?.listid) {
    collectEligibleRef.current = !collectedPlaylist;
  }
  const showCollect = collectEligibleRef.current === true;
  const countText = totalCount
    ? filtering
      ? `共 ${totalCount} 首 · 匹配 ${rows.length} 首`
      : `共 ${totalCount} 首`
    : '';

  useEffect(() => {
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  function closeSearch() {
    setSearchOpen(false);
    setKeyword('');
    Keyboard.dismiss();
  }

  function toggleSearch() {
    if (searchOpen) {
      closeSearch();
    } else {
      setSearchOpen(true);
    }
  }

  function clearKeyword() {
    setKeyword('');
  }

  /**
   * 收藏这个歌单。
   *
   * 走 `playlist_add` 的收藏分支：创建者 userid + 数字 listid 缺一不可，
   * 任一缺失就说明这条接口没带全（不同端版本字段名不一致），直接提示而不是瞎试。
   *
   * 取消收藏不在这里做：「我的 → 收藏的歌单 → 删除」才是那个入口（与原来一致），
   * 详情页的心形只负责「收藏」，避免同一动作两套入口、两套文案。
   */
  async function handleCollect() {
    const info = state.info;
    if (collecting) {
      return;
    }
    if (!info?.listid || !info.createUserid) {
      showToast('这个歌单拿不到收藏所需信息，暂时无法收藏');
      console.warn('[playlist] 缺少收藏参数', { listid: info?.listid, createUserid: info?.createUserid });
      return;
    }

    setCollecting(true);
    try {
      await libraryActions.collectPlaylist({
        name: info.name,
        listid: info.listid,
        createUserid: info.createUserid,
      });
      setCollectedOnce(true);
      showToast('已收藏，可在「我的」页查看');
      void libraryActions.ensure().catch(() => undefined);
    } catch (error) {
      console.warn('[playlist] 收藏失败:', error);
      showToast(error instanceof Error ? error.message : '收藏失败，请稍后重试');
    } finally {
      setCollecting(false);
    }
  }

  /** 空结果里的「清除筛选」：顺手收起键盘，好让用户马上看到完整列表。 */
  function clearFilter() {
    setKeyword('');
    Keyboard.dismiss();
  }

  /**
   * 批量移除的二次确认。
   *
   * 和单曲删除一样用原生 Alert + `style: 'destructive'`：
   * 批量移除不可撤销，必须把「几首」和「从哪个歌单」说清楚，
   * 不能只靠按钮上的一个图标让用户猜。
   */
  function confirmBatchRemove() {
    if (!removablePlaylist || removing) {
      return;
    }

    const targets = batchTracks.filter((track) => Boolean(track.fileid));
    if (!targets.length) {
      showToast('缺少歌曲信息，无法移除');
      return;
    }

    const isLike = removablePlaylist.isLike;
    Alert.alert(
      isLike ? '取消喜欢' : '从歌单移除',
      isLike
        ? `确定取消喜欢选中的 ${targets.length} 首歌？取消后它们会从「我喜欢」中移除。`
        : `确定从「${removablePlaylist.name}」移除选中的 ${targets.length} 首歌？此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: isLike ? '取消喜欢' : '移除',
          style: 'destructive',
          onPress: () => void handleBatchRemove(targets),
        },
      ]
    );
  }

  /**
   * 批量移除选中歌曲。
   *
   * 「我喜欢」和普通自建歌单走不同的 library action：
   * - 喜欢 = 取消收藏（store 里用「我喜欢」歌单的 listid 走收藏那套语义，并同步 liked 映射）；
   * - 其他 = 从自建歌单删歌。
   * 底层都落到同一个云端删歌接口（酷狗没有独立的取消喜欢接口），
   * 但状态同步不同，所以不在页面里直接调 removeTracksFromPlaylist。
   */
  async function handleBatchRemove(targets: PlayerTrack[]) {
    const playlist = removablePlaylist;
    if (!playlist || removing) {
      return;
    }

    setRemoving(true);
    try {
      if (playlist.isLike) {
        await libraryActions.removeLikedTracks(targets);
      } else {
        await libraryActions.removeFromPlaylist(playlist.listid, targets);
      }

      // 页面自己的列表同步：按 fileid 精确删（同 hash 的不同版本不能误伤）
      const removedFileids = new Set(targets.map((track) => track.fileid));
      setState((current) => ({
        ...current,
        tracks: current.tracks.filter(
          (item) => !(item.fileid && removedFileids.has(item.fileid))
        ),
        info: current.info
          ? {
              ...current.info,
              count: Math.max(0, current.info.count - targets.length),
            }
          : current.info,
      }));
      // 批量删完还要保持多选态没有意义，直接退出并清空勾选
      batch.exit();
      showToast(
        playlist.isLike
          ? `已取消喜欢 ${targets.length} 首`
          : `已从歌单移除 ${targets.length} 首`
      );
    } catch (error) {
      // 失败时保留勾选：用户可以直接重试，不用重新一首首点
      showToast(error instanceof Error ? error.message : '移除失败');
    } finally {
      setRemoving(false);
    }
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

  /*
   * 本地过滤只能看到已经拉下来的分页：154 首的歌单刚打开时只有第一页（50 首），
   * 若只过滤已加载部分，会漏掉后面几页里明明存在的歌。
   * 所以一进入筛选状态就按页把剩余分页补齐；loadPage 自带请求序号校验和按 hash 去重，
   * 与「播放全部」的后台补页是同一口径。成本也就和点一次“播放全部”相当。
   *
   * 不把 loadPage 放进依赖：它每次渲染都是新函数，放进去会在每帧重复触发补页；
   * 其余依赖（页码/加载态/hasMore）变化后自然会继续拉下一页。
   */
  useEffect(() => {
    // page < 1：首页都没成功过（可能正在报错重试），不能在这里自己再发起第 1 页，
    // 否则失败后 loading 由 true 变回 false 会让这个 effect 反复重试。
    if (!filtering || state.page < 1 || state.page >= SEARCH_FILL_MAX_PAGES || !state.hasMore) {
      return;
    }
    if (state.loading || state.loadingMore) {
      return;
    }
    void loadPage(state.page + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, state.page, state.hasMore, state.loading, state.loadingMore]);

  /**
   * 从第 index 首开始播放整个歌单：先播已加载的，后台补齐剩余分页到队列。
   * index 永远是**原始曲目列表**里的下标（过滤只换显示行，见 renderItem）。
   *
   * 「播放全部」刻意不受筛选影响，始终播完整歌单：
   * 筛选只是查找辅助，若因此把队列悄悄缩小，同一个按钮在筛选前后行为就不一致，
   * 用户清掉关键字后很容易误以为播的还是刚才那批歌，反而容易漏播。
   */
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
        data={rows}
        keyExtractor={(item) => `${item.track.hash}-${item.index}`}
        showsVerticalScrollIndicator={false}
        // 搜索时点歌不该先被键盘「吃掉」一次触摸；滑列表则顺手收起键盘
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
            <XStack alignItems="center" justifyContent="space-between">
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

              {/* 热区 44×44，视觉仍是 38 的圆，和返回键对称；展开后图标变 × 以便收起 */}
              <XStack
                width={44}
                height={44}
                alignItems="center"
                justifyContent="center"
                transition="quickest"
                pressStyle={{ opacity: 0.6, scale: 0.94 }}
                onPress={toggleSearch}>
                <XStack
                  width={38}
                  height={38}
                  borderRadius={19}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={searchOpen ? palette.accentSoft : palette.card}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={searchOpen ? palette.accentBorder : palette.border}>
                  <Ionicons
                    name={searchOpen ? 'close' : 'search'}
                    size={19}
                    color={searchOpen ? palette.accent : palette.text}
                  />
                </XStack>
              </XStack>
            </XStack>

            {/* 搜索框只在展开时占位，收起时完全不占高度，不挤压原有头部 */}
            {searchOpen ? (
              <XStack
                alignItems="center"
                gap={8}
                height={44}
                paddingHorizontal={14}
                borderRadius={22}
                backgroundColor={palette.card}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}>
                <Ionicons name="search" size={17} color={palette.textTertiary} />
                <TextInput
                  value={keyword}
                  onChangeText={setKeyword}
                  placeholder="搜索歌单内歌曲、歌手"
                  placeholderTextColor={palette.textTertiary}
                  autoFocus
                  autoCorrect={false}
                  returnKeyType="search"
                  style={[styles.searchInput, { color: palette.text }]}
                />
                {keyword ? (
                  <XStack
                    width={44}
                    height={44}
                    marginRight={-12}
                    alignItems="center"
                    justifyContent="center"
                    transition="quickest"
                    pressStyle={{ opacity: 0.6 }}
                    onPress={clearKeyword}>
                    <XStack
                      width={22}
                      height={22}
                      borderRadius={11}
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={palette.cardAlt}>
                      <Ionicons name="close" size={13} color={palette.textSecondary} />
                    </XStack>
                  </XStack>
                ) : null}
              </XStack>
            ) : null}

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
                  {countText}
                </Text>
              </YStack>
            </XStack>

            {/*
              这里原先还有一个「删除」按钮，现已移除：删歌单是低频且不可撤销的操作，
              入口统一放在「我的」页（长按/更多 → playlist-remove-sheet），
              详情页再放一个就是同一件事两个入口，容易误触。
              剩下的播放/多选都只有在有歌时才有意义，所以条件收回 tracks.length；
              空歌单整行不渲染，也不会留下一条空白间距。
            */}
            {state.tracks.length ? (
              <XStack alignSelf="flex-start" alignItems="center" gap={10} flexWrap="wrap">
                {/* 筛选只影响列表显示：这里仍从原始第 0 首播完整队列（见 playFrom） */}
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

                {/* 收藏 / 已收藏：只对「搜索进来、还没收藏」的歌单显示；宽度固定，避免文案变化导致整行重排 */}
                {showCollect ? (
                  <XStack
                    alignItems="center"
                    justifyContent="center"
                    gap={6}
                    height={44}
                    minWidth={96}
                    paddingHorizontal={16}
                    borderRadius={22}
                    backgroundColor={palette.card}
                    borderWidth={StyleSheet.hairlineWidth}
                    borderColor={collected ? palette.accent : palette.border}
                    opacity={collecting ? 0.6 : 1}
                    transition="quickest"
                    pressStyle={collected ? undefined : { opacity: 0.75, scale: 0.97 }}
                    onPress={collected ? undefined : () => void handleCollect()}>
                    <Ionicons
                      name={collected ? 'heart' : 'heart-outline'}
                      size={17}
                      color={collected ? palette.accent : palette.text}
                    />
                    <Text
                      color={collected ? palette.accent : palette.text}
                      fontSize={14}
                      fontWeight="600">
                      {collected ? '已收藏' : collecting ? '收藏中…' : '收藏'}
                    </Text>
                  </XStack>
                ) : null}
              </XStack>
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          state.loading && !state.tracks.length ? (
            <YStack alignItems="center" paddingVertical={70}>
              <Spinner size="large" color={palette.accent} />
            </YStack>
          ) : state.tracks.length ? (
            // 有歌却一行都没有 = 筛选没命中。分页还没补齐时先转圈，
            // 否则会错报「没有匹配」——歌可能就在后面的页里。
            filtering && state.hasMore && state.page < SEARCH_FILL_MAX_PAGES ? (
              <YStack alignItems="center" paddingVertical={60} gap={10}>
                <Spinner color={palette.accent} />
                <Text color={palette.textTertiary} fontSize={13}>
                  正在加载剩余歌曲…
                </Text>
              </YStack>
            ) : (
              <YStack alignItems="center" paddingVertical={60} gap={10} paddingHorizontal={28}>
                <Ionicons name="search" size={34} color={palette.textTertiary} />
                <Text color={palette.textTertiary} fontSize={13} textAlign="center">
                  没有匹配的歌曲
                </Text>
                <TouchText onPress={clearFilter} fontSize={14}>
                  清除筛选
                </TouchText>
              </YStack>
            )
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
            <XStack justifyContent="center" alignItems="center" gap={8} paddingVertical={16}>
              <Spinner color={palette.accent} />
              {filtering ? (
                <Text color={palette.textTertiary} fontSize={12}>
                  正在加载剩余歌曲…
                </Text>
              ) : null}
            </XStack>
          ) : null
        }
        renderItem={({ item }) => (
          <SongListItem
            track={item.track}
            rank={item.index + 1}
            active={item.track.hash === activeHash}
            onPress={() => playFrom(item.index)}
            onMore={() => setActionTrack(item.track)}
            selectMode={batch.selectMode}
            selected={batch.selectedSet.has(item.track.hash)}
            onToggleSelect={() => batch.toggle(item.track.hash)}
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
      />

      {/* 多选时隐藏 MiniPlayer 并换成批量操作条，避免两个底部浮层打架 */}
      {/* 全选/批量移除始终针对完整曲目列表：筛选只是少显示几行，
          不能让「全选」悄悄变成只选筛选结果，操作范围必须可预期 */}
      {batch.selectMode ? (
        <BatchDownloadBar
          tracks={batchTracks}
          allTracks={state.tracks}
          bottomInset={insets.bottom}
          onSelectAll={() => batch.toggleAll(state.tracks)}
          onCancel={batch.exit}
          // 只有能改动歌曲的歌单（自建/「我喜欢」）才给移除入口
          onRemove={removablePlaylist ? confirmBatchRemove : undefined}
          removing={removing}
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
  // 与 search.tsx 的搜索输入保持一致：撑满 44 高的胶囊，Android 垂直居中
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '500',
    paddingTop: 2,
    paddingBottom: 0,
    textAlignVertical: 'center',
  },
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
