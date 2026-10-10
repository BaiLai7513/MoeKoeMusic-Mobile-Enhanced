import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { startTransition, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { MiniPlayer, MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { SongListItem } from '@/components/ui/song-list-item';
import { MaxContentWidth } from '@/constants/theme';
import { scanLocalMusic } from '@/features/local/local-music';
import { playCollection } from '@/features/player/play-collection';
import { useHasTrack, usePlayer } from '@/features/player/store';
import type { PlayerTrack } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';

type ScreenState = {
  tracks: PlayerTrack[];
  loading: boolean;
  /** 权限被拒：要和「扫到 0 首」区分开，否则用户以为是没音乐。 */
  permissionDenied: boolean;
};

/** 本地音乐页：扫描系统媒体库里的音乐并直接播放（content:// 由 ExoPlayer 处理）。 */
export default function LocalMusicScreen() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const { track } = usePlayer();

  const [state, setState] = useState<ScreenState>({
    tracks: [],
    loading: true,
    permissionDenied: false,
  });

  useEffect(() => {
    let alive = true;

    void scanLocalMusic().then((result) => {
      if (!alive) {
        return;
      }
      startTransition(() => {
        setState({
          tracks: result.tracks,
          loading: false,
          permissionDenied: !result.granted,
        });
      });
    });

    return () => {
      alive = false;
    };
  }, []);

  const activeHash = track?.hash;
  const listBottomInset = insets.bottom + (hasTrack ? MINI_PLAYER_HEIGHT + 26 : 16) + 16;

  function playFrom(index: number) {
    // 本地曲目解析是同步级的（不请求网络），整列表丢给播放器即可
    void playCollection({
      tracks: state.tracks,
      startIndex: index,
      loadedPage: 1,
      hasMore: false,
      loadPage: async () => ({ tracks: state.tracks, hasMore: false }),
    });
  }

  return (
    <View flex={1} backgroundColor={palette.background}>
      <LinearGradient
        colors={[isDark ? 'rgba(255, 126, 182, 0.16)' : 'rgba(255, 92, 158, 0.14)', 'transparent']}
        style={styles.headerGlow}
      />

      <FlatList
        data={state.tracks}
        keyExtractor={(item) => item.hash}
        showsVerticalScrollIndicator={false}
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
              <XStack
                width={112}
                height={112}
                borderRadius={20}
                overflow="hidden"
                alignItems="center"
                justifyContent="center">
                <LinearGradient
                  colors={[palette.gradientStart, palette.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="phone-portrait-outline" size={44} color="#FFFFFF" />
              </XStack>
              <YStack flex={1} gap={7}>
                <Text color={palette.text} fontSize={20} fontWeight="800">
                  本地音乐
                </Text>
                <Text color={palette.textTertiary} fontSize={12.5} lineHeight={18}>
                  来自系统媒体库，包含通过本应用下载到 Music/MoeKoe 的歌曲
                </Text>
                {!state.loading ? (
                  <Text color={palette.textTertiary} fontSize={12}>
                    共 {state.tracks.length} 首
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            {state.tracks.length ? (
              <XStack
                alignSelf="flex-start"
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
            ) : null}
          </YStack>
        }
        ListEmptyComponent={
          state.loading ? (
            <YStack alignItems="center" paddingVertical={70}>
              <Spinner size="large" color={palette.accent} />
            </YStack>
          ) : (
            <YStack alignItems="center" paddingVertical={60} gap={10} paddingHorizontal={28}>
              <Ionicons name="musical-notes-outline" size={36} color={palette.textTertiary} />
              <Text color={palette.textTertiary} fontSize={13} textAlign="center" lineHeight={20}>
                {state.permissionDenied
                  ? '没有读取媒体库的权限，无法扫描本地音乐。\n请在系统设置里允许本应用读取音频。'
                  : '没有找到本地音乐'}
              </Text>
            </YStack>
          )
        }
        renderItem={({ item, index }) => (
          <SongListItem
            track={item}
            active={item.hash === activeHash}
            onPress={() => playFrom(index)}
          />
        )}
      />

      <RNView
        pointerEvents="box-none"
        style={[styles.miniDock, { bottom: Math.max(insets.bottom, 12) }]}>
        <RNView pointerEvents="box-none" style={styles.miniDockInner}>
          <MiniPlayer />
        </RNView>
      </RNView>
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
