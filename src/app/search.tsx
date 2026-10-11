import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { startTransition, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { BatchDownloadBar } from '@/components/ui/batch-download-bar';
import {
  AlbumCard,
  MvCard,
  PlaylistCard,
} from '@/components/ui/search-result-cards';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { isLoggedIn } from '@/features/account/user-api';
import { isDownloadSupported } from '@/features/download/downloader';
import { useBatchSelect } from '@/features/download/use-batch-select';
import { playCollection } from '@/features/player/play-collection';
import { useHasTrack, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import {
  fetchHotKeywords,
  fetchSuggestions,
  searchAlbums,
  searchMvs,
  searchPlaylists,
  searchSongs,
  type SearchAlbum,
  type SearchKeyword,
  type SearchMv,
  type SearchPlaylist,
  type SearchTab,
} from '@/features/search/search-api';
import { usePalette } from '@/hooks/use-palette';

const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: 'song', label: '单曲' },
  { value: 'special', label: '歌单' },
  { value: 'album', label: '专辑' },
  { value: 'mv', label: 'MV' },
];

/** 各标签的网格列数，与桌面端的网格布局对应（移动端窄屏收窄）。 */
const TAB_COLUMNS: Record<SearchTab, number> = {
  song: 1,
  special: 2,
  album: 2,
  mv: 2,
};

type ListItem = PlayerTrack | SearchPlaylist | SearchAlbum | SearchMv;

/**
 * 顶部分类行的高度。
 *
 * 显式钉死而不是靠 padding 撑开：这一行是横向 ScrollView，
 * 若不固定高度，下方的 FlatList 切换列数时会把它压扁（见使用处的注释）。
 * 34 ≈ 文字行高(13×1.3) + 上下内边距 + 描边。
 */
const TAB_CHIP_HEIGHT = 34;

type ResultsState = {
  keyword: string;
  tab: SearchTab;
  items: ListItem[];
  page: number;
  total: number;
  hasMore: boolean;
  searching: boolean;
  loadingMore: boolean;
  error: string;
};

const EMPTY_RESULTS: ResultsState = {
  keyword: '',
  tab: 'song',
  items: [],
  page: 0,
  total: 0,
  hasMore: false,
  searching: false,
  loadingMore: false,
  error: '',
};

type FetchPage = {
  items: ListItem[];
  total: number;
  hasMore: boolean;
};

/**
 * 拉取某个分类的一页结果。
 * SearchTab 现在就是这四类、与接口的 type 一一对应，因此直接透传，
 * 不再需要把「综合」之类收敛成某一类的中间函数。
 */
async function fetchTabPage(
  tab: SearchTab,
  keyword: string,
  page: number
): Promise<FetchPage> {
  if (tab === 'song') {
    const result = await searchSongs(keyword, page);
    return { items: result.tracks, total: result.total, hasMore: result.hasMore };
  }
  if (tab === 'special') {
    return searchPlaylists(keyword, page);
  }
  if (tab === 'mv') {
    return searchMvs(keyword, page);
  }
  return searchAlbums(keyword, page);
}

function itemKey(item: ListItem): string {
  if ('hash' in item) {
    return item.hash;
  }
  return item.id;
}

export default function SearchScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { track } = usePlayer();
  const inputRef = useRef<TextInput>(null);
  const searchIdRef = useRef(0);
  const params = useLocalSearchParams<{ q?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q.trim() : '';

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>('song');
  /*
   * 当前被按住的分类 chip（null = 都没按）。
   *
   * 按压反馈刻意用 React 状态而不是 pressStyle 表达：Tamagui 的 pressStyle 伪类由
   * emitter 在 render 之外补发状态，多指同时按（多点触控）时每个 chip 各留一份自己的
   * press 态，松手事件对不齐就清不干净 —— 表现为「两三个 chip 同时变暗、白字发灰」，
   * 再点一次才恢复。这里只存**一个**值，后按下的覆盖前一个，
   * 所以物理上不可能同时有两个 chip 处于按压态。
   */
  const [pressedTab, setPressedTab] = useState<SearchTab | null>(null);
  const [hotKeywords, setHotKeywords] = useState<SearchKeyword[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<ResultsState>(EMPTY_RESULTS);
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  // 识曲等入口带初始关键词跳转进来时，直接执行一次搜索
  useEffect(() => {
    if (initialQuery) {
      void commitSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    let cancelled = false;
    fetchHotKeywords()
      .then((keywords) => {
        if (!cancelled) {
          setHotKeywords(keywords);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed === results.keyword) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSuggestions(trimmed)
        .then((items) => {
          startTransition(() => setSuggestions(items));
        })
        .catch(() => {});
    }, 280);

    return () => clearTimeout(timer);
  }, [query, results.keyword]);

  async function runSearch(keyword: string, tab: SearchTab) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }

    if (!isLoggedIn()) {
      searchIdRef.current += 1;
      setResults({ ...EMPTY_RESULTS, keyword: trimmed, tab });
      return;
    }

    const searchId = ++searchIdRef.current;
    setResults({ ...EMPTY_RESULTS, keyword: trimmed, tab, searching: true });

    try {
      const page = await fetchTabPage(tab, trimmed, 1);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults({
          ...EMPTY_RESULTS,
          keyword: trimmed,
          tab,
          items: page.items,
          page: 1,
          total: page.total,
          hasMore: page.hasMore,
          searching: false,
        });
      });
    } catch (error) {
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults({
          ...EMPTY_RESULTS,
          keyword: trimmed,
          tab,
          error: error instanceof Error ? error.message : '搜索失败，请稍后重试',
        });
      });
    }
  }

  async function commitSearch(keyword: string) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }

    Keyboard.dismiss();
    setQuery(trimmed);
    setSuggestions([]);
    await runSearch(trimmed, activeTab);
  }

  function changeTab(tab: SearchTab) {
    if (tab === activeTab) {
      return;
    }
    setActiveTab(tab);
    if (results.keyword) {
      void runSearch(results.keyword, tab);
    }
  }

  async function loadMore() {
    if (!results.hasMore || results.loadingMore || results.searching) {
      return;
    }

    const searchId = searchIdRef.current;
    const { keyword, tab } = results;
    setResults((current) => ({ ...current, loadingMore: true }));

    try {
      const nextPage = results.page + 1;
      const page = await fetchTabPage(tab, keyword, nextPage);
      if (searchId !== searchIdRef.current) {
        return;
      }

      startTransition(() => {
        setResults((current) => {
          const seen = new Set(current.items.map(itemKey));
          const fresh = page.items.filter((item) => !seen.has(itemKey(item)));
          return {
            ...current,
            items: [...current.items, ...fresh],
            page: nextPage,
            hasMore: page.hasMore,
            loadingMore: false,
          };
        });
      });
    } catch {
      if (searchId === searchIdRef.current) {
        setResults((current) => ({ ...current, loadingMore: false, hasMore: false }));
      }
    }
  }

  function resetSearch() {
    searchIdRef.current += 1;
    setQuery('');
    setSuggestions([]);
    setResults(EMPTY_RESULTS);
    inputRef.current?.focus();
  }

  /* ---------- 导航 ---------- */

  function openPlaylist(playlist: SearchPlaylist) {
    router.push({
      pathname: '/playlist/[id]',
      params: { id: playlist.id, name: playlist.name, cover: playlist.coverUrl ?? '' },
    });
  }

  function openAlbum(album: SearchAlbum) {
    router.push({
      pathname: '/album/[id]',
      params: {
        id: album.id,
        name: album.name,
        cover: album.coverUrl ?? '',
        artist: album.artist,
        date: album.publishDate,
      },
    });
  }

  function openMv(mv: SearchMv) {
    router.push({
      pathname: '/mv/[hash]',
      params: { hash: mv.hash, title: mv.name },
    });
  }

  const showResults = Boolean(results.keyword) && !suggestions.length;
  const showSuggestions = suggestions.length > 0;
  const activeHash = track?.hash;
  const listBottomInset = insets.bottom + (hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;
  const columns = TAB_COLUMNS[results.tab];

  const hasContent = results.items.length > 0;

  // 多选只对「单曲」结果开放：歌单/专辑/MV 是卡片，不适用批量下载
  const batch = useBatchSelect();
  const batchTracks = results.items.filter(
    (item): item is PlayerTrack => 'hash' in item && batch.selectedSet.has(item.hash)
  );
  const canBatch = isDownloadSupported() && results.tab === 'song' && results.items.length > 0;

  /** 从第 index 首开始播放整个“单曲”搜索结果：先播已加载的，后台补齐剩余分页。 */
  function playSongsFrom(index: number) {
    void playCollection({
      tracks: results.items as PlayerTrack[],
      startIndex: index,
      loadedPage: results.page,
      hasMore: results.hasMore,
      loadPage: async (page) => {
        const result = await searchSongs(results.keyword, page);
        return { tracks: result.tracks, hasMore: result.hasMore };
      },
    });
  }

  function renderGridItem(item: ListItem, index: number) {
    if (results.tab === 'song') {
      const song = item as PlayerTrack;
      return (
        <SongListItem
          track={song}
          active={song.hash === activeHash}
          onPress={() => playSongsFrom(index)}
          onMore={() => setActionTrack(song)}
          selectMode={batch.selectMode}
          selected={batch.selectedSet.has(song.hash)}
          onToggleSelect={() => batch.toggle(song.hash)}
        />
      );
    }
    if (results.tab === 'special') {
      const playlist = item as SearchPlaylist;
      return <PlaylistCard item={playlist} onPress={() => openPlaylist(playlist)} />;
    }
    if (results.tab === 'album') {
      const album = item as SearchAlbum;
      return <AlbumCard item={album} onPress={() => openAlbum(album)} />;
    }
    if (results.tab === 'mv') {
      const mv = item as SearchMv;
      return <MvCard item={mv} onPress={() => openMv(mv)} />;
    }
    return null;
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <YStack
        alignSelf="center"
        width="100%"
        maxWidth={MaxContentWidth}
        flex={1}
        paddingTop={insets.top + 10}
        gap={12}>
        <XStack alignItems="center" gap={10} paddingHorizontal={16} flexShrink={0}>
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

          <XStack
            flex={1}
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
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => void commitSearch(query)}
              placeholder="歌曲、歌手、专辑"
              placeholderTextColor={palette.textTertiary}
              returnKeyType="search"
              autoCorrect={false}
              autoFocus={!initialQuery}
              style={[styles.input, { color: palette.text }]}
            />
            {query ? (
              <XStack
                width={22}
                height={22}
                borderRadius={11}
                alignItems="center"
                justifyContent="center"
                backgroundColor={palette.cardAlt}
                pressStyle={{ opacity: 0.6 }}
                onPress={resetSearch}>
                <Ionicons name="close" size={13} color={palette.textSecondary} />
              </XStack>
            ) : (
              <XStack
                width={28}
                height={28}
                alignItems="center"
                justifyContent="center"
                pressStyle={{ opacity: 0.6, scale: 0.92 }}
                onPress={() => router.push('/recognize')}>
                <Ionicons name="mic-outline" size={19} color={palette.accent} />
              </XStack>
            )}
          </XStack>
        </XStack>

        {showResults ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            /*
             * 关键：必须同时钉住高度并禁止收缩。
             *
             * 这里原本是 `style={{ flexGrow: 0 }}`，但 RN 的 flexShrink 默认为 1 ——
             * 切换分类时下方 FlatList 的列数会在 1/2 之间变化，布局压力一变，
             * 这一行就会被压缩到低于文字所需高度，表现为「顶部分类被压扁、文字被裁」。
             * 固定高度 + flexShrink: 0 后，无论下方怎么变都不再受影响。
             */
            style={{ flexGrow: 0, flexShrink: 0, height: TAB_CHIP_HEIGHT }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
            {SEARCH_TABS.map((tab) => {
              const active = tab.value === activeTab;
              return (
                <XStack
                  key={tab.value}
                  height={TAB_CHIP_HEIGHT}
                  alignItems="center"
                  justifyContent="center"
                  borderRadius={999}
                  overflow="hidden"
                  /*
                   * 选中态刻意不用「会动的 backgroundColor」来表达。
                   *
                   * 原因：@tamagui/animations-react-native 的颜色动画用一个 0/1 的
                   * Animated.Value 加 animateToValue 开关（见 createAnimations.tsx 的
                   * getColorInterpolated）。而 render 路径与 avoidReRenders 的 emitter
                   * 路径会在同一帧各 update 一次同一个 key，开关被取反两次，进行中的
                   * 「accent → card」会被倒放回 accent —— 表现为「旧 tab 又亮一下」。
                   * pressStyle 之类的伪类状态靠 emitter 补发，正是同帧第二次 update 的来源
                   * （本 chip 的按压反馈现在已改为 pressedTab 状态驱动，见下方 props）。
                   *
                   * 改成「恒定 accent 色的填充层 + opacity 淡入淡出」后，填充色永远正确，
                   * 重复驱动也不可能闪出错误的颜色。
                   */
                  animateOnly={['opacity', 'transform']}
                  backgroundColor={active ? palette.accent : palette.card}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={active ? palette.accent : palette.border}
                  transition="quickest"
                  /*
                   * 按压态由 pressedTab 单一状态驱动（见其声明处的说明），不再用 pressStyle：
                   * opacity/scale 走 props，仍然受上面的 transition + animateOnly 管辖，
                   * 动画参数与选中态的填充淡入淡出保持一致。
                   */
                  opacity={pressedTab === tab.value ? 0.7 : 1}
                  scale={pressedTab === tab.value ? 0.97 : 1}
                  onPressIn={() => setPressedTab(tab.value)}
                  /*
                   * 松手要清；横向 ScrollView 抢走手势时 Tamagui 也会走 responder terminate
                   * 并把 onPressOut 补发出来（mainThreadPressEvents 的 deactivate），
                   * 所以「按下后滑动去滚动」同样会取消按压态，不会留下一个一直按着的 chip。
                   *
                   * 清除时先判断「现在按住的还是不是我」：多指同按时后按下的会顶掉前一个，
                   * 如果这里无条件写 null，先抬起的那根手指会把**仍按着**的那个 chip 的
                   * 高亮一起抹掉（高亮在手底下凭空消失）。带上判断后，
                   * 高亮始终跟着最后按下的那根手指，且依然最多只有一个。
                   */
                  onPressOut={() =>
                    setPressedTab((current) => (current === tab.value ? null : current))
                  }
                  onPress={() => changeTab(tab.value)}>
                  <XStack
                    pointerEvents="none"
                    opacity={active ? 1 : 0}
                    transition="quickest"
                    animateOnly={['opacity']}
                    backgroundColor={palette.accent}
                    borderRadius={999}
                    style={styles.tabFill}
                  />
                  <XStack style={styles.tabContent}>
                    <Text
                      color={active ? '#FFFFFF' : palette.textSecondary}
                      fontSize={13}
                      fontWeight={active ? '700' : '500'}>
                      {tab.label}
                    </Text>
                  </XStack>
                </XStack>
              );
            })}
          </ScrollView>
        ) : null}

        {showSuggestions ? (
          <YStack paddingHorizontal={16} gap={2}>
            {suggestions.map((suggestion) => (
              <XStack
                key={suggestion}
                alignItems="center"
                gap={10}
                paddingVertical={12}
                paddingHorizontal={10}
                borderRadius={12}
                transition="quickest"
                pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
                onPress={() => void commitSearch(suggestion)}>
                <Ionicons name="search-outline" size={15} color={palette.textTertiary} />
                <Text flex={1} color={palette.text} fontSize={14.5} numberOfLines={1}>
                  {suggestion}
                </Text>
                <Ionicons name="arrow-up-outline" size={14} color={palette.textTertiary} style={{ transform: [{ rotate: '45deg' }] }} />
              </XStack>
            ))}
          </YStack>
        ) : showResults ? (
          results.searching ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={12}>
              <Spinner size="large" color={palette.accent} />
            </YStack>
          ) : results.error ? (
            <YStack flex={1} alignItems="center" justifyContent="center" gap={14} paddingHorizontal={32}>
              <Ionicons name="cloud-offline-outline" size={38} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13.5} textAlign="center">
                {results.error}
              </Text>
              <Text
                color={palette.accent}
                fontSize={14}
                fontWeight="600"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => void runSearch(results.keyword, results.tab)}
                suppressHighlighting>
                重试
              </Text>
            </YStack>
          ) : !hasContent ? (
            isLoggedIn() ? (
              <YStack flex={1} alignItems="center" justifyContent="center" gap={10}>
                <Ionicons name="search" size={38} color={palette.textTertiary} />
                <Text color={palette.textTertiary} fontSize={13.5}>
                  没有找到相关内容
                </Text>
              </YStack>
            ) : (
              <YStack flex={1} alignItems="center" justifyContent="center" gap={14} paddingHorizontal={32}>
                <Ionicons name="lock-closed-outline" size={38} color={palette.textTertiary} />
                <Text color={palette.textTertiary} fontSize={13.5} textAlign="center" lineHeight={20}>
                  酷狗概念版的搜索需要登录后才能获取结果，请先登录
                </Text>
                <XStack
                  alignItems="center"
                  gap={6}
                  paddingHorizontal={20}
                  paddingVertical={10}
                  borderRadius={999}
                  backgroundColor={palette.accent}
                  pressStyle={{ opacity: 0.75, scale: 0.98 }}
                  onPress={() => router.push('/login')}>
                  <Ionicons name="log-in-outline" size={16} color="#FFFFFF" />
                  <Text color="#FFFFFF" fontSize={14} fontWeight="700">
                    去登录
                  </Text>
                </XStack>
              </YStack>
            )
          ) : (
            <FlatList
              key={results.tab}
              data={results.items}
              numColumns={columns}
              columnWrapperStyle={columns > 1 ? { gap: 14 } : undefined}
              keyExtractor={(item, index) => `${itemKey(item)}-${index}`}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.4}
              onEndReached={() => void loadMore()}
              contentContainerStyle={{
                paddingHorizontal: columns > 1 ? 16 : 12,
                paddingBottom: listBottomInset,
                gap: columns > 1 ? 18 : 0,
              }}
              ListHeaderComponent={
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  paddingHorizontal={columns > 1 ? 0 : 6}
                  paddingBottom={8}>
                  <Text color={palette.textTertiary} fontSize={12.5}>
                    {results.total > 0 ? `共 ${results.total} 条` : `${results.items.length} 条`}
                  </Text>
                  {results.tab === 'song' ? (
                    <XStack alignItems="center" gap={14}>
                      {canBatch && !batch.selectMode ? (
                        <XStack
                          alignItems="center"
                          gap={5}
                          pressStyle={{ opacity: 0.6 }}
                          onPress={batch.enter}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={16}
                            color={palette.textSecondary}
                          />
                          <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                            多选
                          </Text>
                        </XStack>
                      ) : null}
                      <XStack
                        alignItems="center"
                        gap={5}
                        pressStyle={{ opacity: 0.6 }}
                        onPress={() => playSongsFrom(0)}>
                        <Ionicons name="play-circle" size={17} color={palette.accent} />
                        <Text color={palette.accent} fontSize={13.5} fontWeight="600">
                          播放全部
                        </Text>
                      </XStack>
                    </XStack>
                  ) : null}
                </XStack>
              }
              ListFooterComponent={
                results.loadingMore ? (
                  <XStack justifyContent="center" paddingVertical={16}>
                    <Spinner color={palette.accent} />
                  </XStack>
                ) : null
              }
              renderItem={({ item, index }) => renderGridItem(item, index)}
            />
          )
        ) : (
          <YStack paddingHorizontal={16} gap={14}>
            {hotKeywords.length ? (
              <>
                <XStack alignItems="center" gap={6}>
                  <Ionicons name="flame" size={16} color={palette.accent} />
                  <Text color={palette.text} fontSize={16} fontWeight="700">
                    热搜榜
                  </Text>
                </XStack>
                <XStack flexWrap="wrap" gap={10}>
                  {hotKeywords.map((item, index) => (
                    <XStack
                      key={item.keyword}
                      alignItems="center"
                      gap={7}
                      paddingHorizontal={13}
                      paddingVertical={9}
                      borderRadius={999}
                      backgroundColor={palette.card}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      transition="quickest"
                      pressStyle={{ opacity: 0.65, scale: 0.97 }}
                      onPress={() => void commitSearch(item.keyword)}>
                      <Text
                        color={index < 3 ? palette.accent : palette.textTertiary}
                        fontSize={12.5}
                        fontWeight="800">
                        {index + 1}
                      </Text>
                      <Text color={palette.text} fontSize={13.5} fontWeight="500">
                        {item.keyword}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
              </>
            ) : null}
          </YStack>
        )}
      </YStack>

      {/* 多选时隐藏 MiniPlayer 并换成批量操作条，避免两个底部浮层打架 */}
      {batch.selectMode ? (
        <BatchDownloadBar
          tracks={batchTracks}
          allTracks={results.items.filter(
            (item): item is PlayerTrack => 'hash' in item
          )}
          bottomInset={insets.bottom}
          onSelectAll={() =>
            batch.toggleAll(results.items.filter((item): item is PlayerTrack => 'hash' in item))
          }
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

      <TrackActionsSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => {
          if (!open) {
            setActionTrack(null);
          }
        }}
        track={actionTrack}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '500',
    paddingTop: 2,
    paddingBottom: 0,
    textAlignVertical: 'center',
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
  /*
   * 绝对定位的填充层按父级 padding box 拉伸、且**不补偿**父级 padding，
   * 所以 paddingHorizontal 必须挪到内容层，否则填充层会比胶囊大一圈。
   */
  tabFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabContent: {
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
