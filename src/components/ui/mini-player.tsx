import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

export const MINI_PLAYER_HEIGHT = 58;

let lastOpenPlayerAt = 0;

function ProgressHairline() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View
      position="absolute"
      left={16}
      right={16}
      bottom={0}
      height={2.5}
      borderRadius={999}
      backgroundColor={palette.cardAlt}
      overflow="hidden">
      <View
        width={`${ratio * 100}%`}
        height="100%"
        borderRadius={999}
        backgroundColor={palette.accent}
      />
    </View>
  );
}

export function MiniPlayer() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const { track, playing, loading, buffering } = usePlayer();
  const rotation = useSharedValue(0);

  /*
   * 依赖里**故意没有 track / coverUrl**：切歌只换封面图，转盘继续转。
   * 如果把曲目塞进依赖，每次切歌都会重建动画，角度从头再来一遍（视觉上是"抽一下"）。
   */
  useEffect(() => {
    if (playing) {
      /*
       * 终点取「当前角度 + 360」而不是写死 360：
       * withRepeat 每一轮都是从**创建这次动画时的起点**重来的，而真正的起点是动画
       * 开始在 UI 线程上读到的当前值。暂停后恢复时如果写死 360，就会从当前角度转到
       * 360° 再跳回起点，肉眼就是"倒转一下"。+360 保证起点→终点正好一整圈，
       * 而 360° 与 0° 同余（下面再 % 360），所以循环回绕那一瞬间看不出跳变。
       */
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 16000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }

    /*
     * 卸载时必须停：withRepeat 是无限循环，没人取消就一直占着 UI 线程推帧。
     * 而 MiniPlayer 是会被摘掉的（Tab 页键盘弹出时 dock 整个消失、搜索/歌单进入多选、
     * 切页时各自页面持有的实例卸载），不清理就是实打实的动画泄漏。
     */
    return () => {
      cancelAnimation(rotation);
    };
  }, [playing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  if (!track) {
    return null;
  }

  const busy = loading || buffering;
  function openPlayer() {
    const now = Date.now();
    if (now - lastOpenPlayerAt < 800) {
      return;
    }

    lastOpenPlayerAt = now;
    router.push('/player');
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(200)}>
      <XStack
        height={MINI_PLAYER_HEIGHT}
        alignItems="center"
        gap={10}
        paddingHorizontal={12}
        borderRadius={22}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}
        backgroundColor={palette.barSurface}
        shadowColor={palette.dockShadow}
        shadowOffset={{ width: 0, height: isDark ? 3 : 8 }}
        shadowOpacity={isDark ? 0.18 : 0.1}
        shadowRadius={isDark ? 8 : 16}
        elevation={isDark ? 0 : 8}
        transition="quickest"
        pressStyle={{ scale: 0.985 }}
        onPress={openPlayer}>
        <Animated.View style={[{ width: 40, height: 40 }, spinStyle]}>
          <Artwork uri={track.coverUrl} size={40} circle />
        </Animated.View>

        <YStack flex={1} gap={1}>
          <Text color={palette.text} fontSize={13.5} fontWeight="600" numberOfLines={1}>
            {track.title}
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
            {track.artist || '未知歌手'}
          </Text>
        </YStack>

        <XStack
          width={38}
          height={38}
          borderRadius={19}
          alignItems="center"
          justifyContent="center"
          backgroundColor={palette.accentSoft}
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.7 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.toggle();
          }}>
          {busy ? (
            <Spinner size="small" color={palette.accent} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={18}
              color={palette.accent}
              style={playing ? undefined : { marginLeft: 2 }}
            />
          )}
        </XStack>

        <XStack
          width={34}
          height={38}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.6 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.next();
          }}>
          <Ionicons name="play-skip-forward" size={19} color={palette.textSecondary} />
        </XStack>

        <ProgressHairline />
      </XStack>
    </Animated.View>
  );
}
