import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { SectionHeader } from '@/components/ui/section-header';
import { SongListItem } from '@/components/ui/song-list-item';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { MaxContentWidth } from '@/constants/theme';
import { loadHomeData, type HomeData } from '@/features/home/load-home-data';
import { playerActions, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { formatApiError } from '@/lib/api-parse';
import { readCache, writeCache } from '@/lib/offline-cache';

/** 首页数据的离线缓存键。 */
const HOME_CACHE_KEY = 'home';

type ScreenState = {
  homeData: HomeData | null;
  initialLoading: boolean;
  refreshing: boolean;
  errorMessage: string;
};

const DAILY_COLUMN_SIZE = 6;

function chunkSongs<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export default function HomeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  /*
   * 这两个值**只当兜底**：真机证据（一加 PKR110，横屏分屏/自由小窗）下
   * useWindowDimensions() 报的是整块显示器的 794.29×361.14，而不是 App 真实的
   * 361×522 窗口 —— manifest 的 configChanges 含 orientation|screenSize，
   * Activity 不重建、Dimensions 不跟着更新，错值会一直留着。
   * 所以下面的 contentWidth 优先用根容器 onLayout 的实测宽度（与 player.tsx 同一套修法）。
   */
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [rootSize, setRootSize] = useState<{ width: number; height: number } | null>(null);
  const { track } = usePlayer();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ScreenState>({
    homeData: null,
    initialLoading: true,
    refreshing: false,
    errorMessage: '',
  });
  const [actionTrack, setActionTrack] = useState<PlayerTrack | null>(null);

  /*
   * 根容器的实测尺寸：分屏/自由窗口下唯一可信的来源（onLayout 走 Yoga，不经过 Dimensions）。
   * 宽高一起存 —— 分屏既能左右切也能上下切，两个方向都可能被系统报错。
   */
  const handleRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
    const nextWidth = Math.round(measuredWidth);
    const nextHeight = Math.round(measuredHeight);
    if (nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    setRootSize((prev) =>
      prev && prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    );
  }, []);

  /*
   * 尺寸唯一来源：实测优先，测到之前才退回 useWindowDimensions。
   * 兜底取「窗口宽高里的小值」—— 偏小只是卡片窄一点（还能完整显示），
   * 偏大就会横向溢出被裁（正是这次要修的 bug），所以宁可保守。
   * 全屏竖屏下小值 361、实测 361、旧的 useWindowDimensions 值 361 三者相等，视觉不变。
   */
  const width = rootSize?.width ?? Math.min(windowWidth, windowHeight);
  const contentWidth = Math.min(width, MaxContentWidth) - 32;

  async function refreshHome(mode: 'initial' | 'refresh' = 'initial') {
    const requestId = ++requestIdRef.current;

    startTransition(() => {
      setState((current) => ({
        ...current,
        initialLoading: !current.homeData,
        refreshing: Boolean(current.homeData),
        errorMessage: '',
      }));
    });

    try {
      const homeData = await loadHomeData();
      if (requestId !== requestIdRef.current) {
        return;
      }

      // 记下最后一次成功的结果，供离线时展示
      void writeCache(HOME_CACHE_KEY, homeData);

      startTransition(() => {
        setState({
          homeData,
          initialLoading: false,
          refreshing: false,
          errorMessage: '',
        });
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      const message = formatApiError(error);

      // 网络不可用时用上次成功的数据兜底 —— 否则断网就等于「首页空了」。
      // 缓存读不到（首次安装就没联过网）才真正显示空态。
      const cached = state.homeData ? null : await readCache<HomeData>(HOME_CACHE_KEY);
      if (requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState((current) => ({
          homeData: current.homeData ?? cached,
          initialLoading: false,
          refreshing: false,
          // 有内容可展示时 banner 文案是「正在展示上次内容」，语义正确
          errorMessage: message,
        }));
      });
    }
  }

  useEffect(() => {
    void refreshHome('initial');
  }, []);

  if (!state.homeData && state.initialLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={14} backgroundColor={palette.background}>
        <Spinner size="large" color={palette.accent} />
        <Text color={palette.textTertiary} fontSize={13.5}>
          正在为你准备今日推荐
        </Text>
      </YStack>
    );
  }

  if (!state.homeData) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap={18}
        paddingHorizontal={32}
        backgroundColor={palette.background}>
        <Ionicons name="cloud-offline-outline" size={44} color={palette.textTertiary} />
        <YStack alignItems="center" gap={6}>
          <Text color={palette.text} fontSize={17} fontWeight="700">
            内容加载失败
          </Text>
          <Text color={palette.textTertiary} fontSize={13} textAlign="center">
            {state.errorMessage || '网络似乎不太顺畅，请稍后重试'}
          </Text>
        </YStack>
        <XStack
          paddingHorizontal={26}
          height={44}
          alignItems="center"
          borderRadius={999}
          backgroundColor={palette.accent}
          transition="quickest"
          pressStyle={{ opacity: 0.8, scale: 0.97 }}
          onPress={() => void refreshHome('initial')}>
          <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
            重新加载
          </Text>
        </XStack>
      </YStack>
    );
  }

  const { homeData } = state;
  const activeHash = track?.hash;
  const dailyColumns = chunkSongs(homeData.dailySongs, DAILY_COLUMN_SIZE);

  return (
    <View flex={1} backgroundColor={palette.background} onLayout={handleRootLayout}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void refreshHome('refresh')}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressViewOffset={insets.top}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 14,
            paddingBottom: dockInset,
          },
        ]}>
        <XStack
          alignItems="center"
          gap={9}
          height={46}
          paddingHorizontal={16}
          borderRadius={23}
          backgroundColor={palette.card}
          borderWidth={StyleSheet.hairlineWidth}
          borderColor={palette.border}
          transition="quickest"
          pressStyle={{ opacity: 0.7, scale: 0.99 }}
          onPress={() => router.push('/search')}>
          <Ionicons name="search" size={17} color={palette.textTertiary} />
          <Text flex={1} color={palette.textTertiary} fontSize={14}>
            搜索歌曲、歌手、歌单
          </Text>
          <XStack
            width={30}
            height={30}
            alignItems="center"
            justifyContent="center"
            pressStyle={{ opacity: 0.6, scale: 0.92 }}
            onPress={() => router.push('/recognize')}>
            <Ionicons name="mic-outline" size={19} color={palette.accent} />
          </XStack>
        </XStack>

        {state.errorMessage ? (
          <XStack
            alignItems="center"
            gap={8}
            paddingHorizontal={14}
            paddingVertical={10}
            borderRadius={14}
            backgroundColor={palette.dangerSoft}>
            <Ionicons name="alert-circle" size={15} color={palette.danger} />
            <Text flex={1} color={palette.danger} fontSize={12.5}>
              部分内容刷新失败，正在展示上次内容
            </Text>
          </XStack>
        ) : null}

        {homeData.dailySongs.length ? (
          <YStack gap={12}>
            <SectionHeader
              title="每日推荐"
              subtitle="根据你的口味每天更新"
              actionLabel="播放全部"
              onAction={() => void playerActions.playTracks(homeData.dailySongs, 0)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dailyColumns}>
              {dailyColumns.map((column, columnIndex) => (
                <YStack
                  key={`daily-column-${columnIndex}`}
                  width={contentWidth}
                  backgroundColor={palette.card}
                  borderRadius={20}
                  borderWidth={StyleSheet.hairlineWidth}
                  borderColor={palette.border}
                  paddingVertical={6}
                  paddingHorizontal={4}>
                  {column.map((song, rowIndex) => {
                    const index = columnIndex * DAILY_COLUMN_SIZE + rowIndex;
                    return (
                      <SongListItem
                        key={`${song.hash}-${index}`}
                        track={song}
                        active={song.hash === activeHash}
                        onPress={() => void playerActions.playTracks(homeData.dailySongs, index)}
                        onMore={() => setActionTrack(song)}
                      />
                    );
                  })}
                </YStack>
              ))}
            </ScrollView>
          </YStack>
        ) : null}
      </ScrollView>

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
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: 16,
    gap: 22,
  },
  dailyColumns: {
    gap: 12,
    paddingRight: 4,
  },
});
