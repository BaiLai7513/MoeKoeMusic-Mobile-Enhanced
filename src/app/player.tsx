import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Slider, Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { LyricsView } from '@/components/ui/lyrics-view';
import { PlaybackRateDialog, SleepTimerDialog } from '@/components/ui/playback-options-dialog';
import { QueueSheet } from '@/components/ui/queue-sheet';
import { showToast, ToastHost } from '@/components/ui/toast';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { libraryActions, useIsLiked } from '@/features/library/store';
import { formatPlaybackRate } from '@/features/player/playback-rate';
import { useSleepTimer } from '@/features/player/sleep-timer';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import type { PlayMode } from '@/features/player/types';
import { usePlaybackRate } from '@/features/settings/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { formatClock, formatLongClock } from '@/lib/format';
import { shareTrack } from '@/lib/share';

const MODE_ICON: Record<PlayMode, 'repeat' | 'repeat-once' | 'shuffle-variant'> = {
  sequence: 'repeat',
  shuffle: 'shuffle-variant',
  single: 'repeat-once',
};

/*
 * 竖向空间分三档，按**窗口高度**切换（不是物理屏幕高度）：
 *   roomy   ≥ 700  普通全面屏手机
 *   compact 620~700 小屏手机 / 略微被压扁的窗口
 *   dense   < 620  小窗、自由窗口、上下分屏
 * dense 档会收掉「喜欢 / 添加到歌单 / 分享」这一排次要按钮，并把专辑封面下方
 * 的控制区整体缩小一档：小窗的竖向预算里，顶栏(40) + 安全区(≈64) + 控制区(≈180)
 * 已经吃掉大半，剩下的高度连「唱片 + 标题两行」都放不下，只能把它让出来。
 */
type PlayerTier = 'roomy' | 'compact' | 'dense';

/** 封面页内唱片与标题之间的间距 */
const PAGE_GAP: Record<PlayerTier, number> = { roomy: 30, compact: 20, dense: 12 };
/*
 * 标题 + 歌手两行文字块的高度（含行距与两者之间的小 gap）。它和唱片一起瓜分封面页，
 * 所以算唱片尺寸时必须先把这块减掉，否则唱片会把标题顶出可视区、自己也被裁。
 */
const TITLE_BLOCK_HEIGHT: Record<PlayerTier, number> = { roomy: 62, compact: 56, dense: 50 };

/** 唱片直径的上下限：下限保证还能看清封面，上限避免平板上无限变大 */
const DISC_MIN = 80;
const DISC_MAX = 300;
/** 唱片直径占窗口宽度的比例（≈ 改版前的 `width - 104`，在 300~420 宽度下基本一致） */
const DISC_WIDTH_RATIO = 0.72;
/** 竖向余量：上面那些高度是估算值，宁可让唱片小十几像素，也不能让它顶到进度条 */
const DISC_SAFETY = 12;

function SpinningDisc({ coverUrl, playing, size }: { coverUrl: string | null; playing: boolean; size: number }) {
  const isDark = useIsDark();
  const rotation = useSharedValue(0);

  /*
   * 依赖里**故意没有 coverUrl / track**：切歌只换封面图，转盘继续转。
   * 把曲目塞进依赖会让每次切歌都重建动画，角度从头再来一遍（视觉上是"抽一下"）。
   */
  useEffect(() => {
    if (playing) {
      /*
       * 终点取「当前角度 + 360」而不是写死 360：withRepeat 每一轮都是从创建动画时的
       * 起点重来的，而真正的起点是动画在 UI 线程上读到的当前值。写死 360 的话，
       * 暂停后恢复会从当前角度转到 360° 再跳回起点，肉眼就是"倒转一下"。
       * +360 保证起点→终点正好一整圈，而 360° 与 0° 同余（下面再 % 360），
       * 所以循环回绕那一瞬间看不出跳变。
       */
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 24000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }

    /*
     * 卸载时必须停：withRepeat 是无限循环，没人取消就一直占着 UI 线程推帧。
     * 播放页返回时整个页面会被销毁（封面就在 ScrollView 里），不清理就是实打实的
     * 动画泄漏 —— 和 MiniPlayer 里那处是同一个问题。
     */
    return () => {
      cancelAnimation(rotation);
    };
  }, [playing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size / 2}
      alignItems="center"
      justifyContent="center"
      backgroundColor={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.75)'}
      shadowColor="#000000"
      shadowOffset={{ width: 0, height: 18 }}
      shadowOpacity={isDark ? 0.5 : 0.18}
      shadowRadius={30}
      elevation={16}>
      <Animated.View style={spinStyle}>
        {/* 外圈留白按 26/300 等比例缩：写死 26 的话，80~120 的小唱片会被白环吃成一条缝 */}
        <Artwork uri={coverUrl} size={size - Math.round((size * 26) / 300)} circle />
      </Animated.View>
    </YStack>
  );
}

function PlaybackProgress({ accessory }: { accessory?: React.ReactNode }) {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const shownPosition = dragValue ?? positionMs;

  return (
    <YStack gap={7}>
      <Slider
        size="$2"
        value={[Math.min(shownPosition, Math.max(durationMs, 1))]}
        max={Math.max(durationMs, 1)}
        step={250}
        disabled={!durationMs}
        onValueChange={(values) => {
          const next = values[0] ?? 0;
          dragValueRef.current = next;
          setDragValue(next);
        }}
        onSlideEnd={() => {
          if (dragValueRef.current !== null) {
            playerActions.seekToMs(dragValueRef.current);
          }
          dragValueRef.current = null;
          setTimeout(() => setDragValue(null), 180);
        }}>
        <Slider.Track backgroundColor={palette.cardAlt} height={4} borderRadius={999}>
          <Slider.TrackActive backgroundColor={palette.accent} />
        </Slider.Track>
        <Slider.Thumb
          index={0}
          size={16}
          circular
          backgroundColor={palette.accent}
          borderWidth={2.5}
          borderColor="#FFFFFF"
          pressStyle={{
            scale: 1.2,
            backgroundColor: palette.accentPressed,
            borderColor: '#FFFFFF',
          }}
          hoverStyle={{ backgroundColor: palette.accent, borderColor: '#FFFFFF' }}
          shadowColor="#000000"
          shadowOpacity={0.2}
          shadowRadius={5}
          shadowOffset={{ width: 0, height: 2 }}
        />
      </Slider>
      <XStack justifyContent="space-between" alignItems="center" gap={10}>
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(shownPosition)}
        </Text>
        {accessory}
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(durationMs)}
        </Text>
      </XStack>
    </YStack>
  );
}

/**
 * 进度条时间行中间的两颗小药丸：倍速、定时关闭。
 *
 * 为什么塞进时间行、而不是另起一排或放进「喜欢/歌单/分享」那一排：
 * - 竖向预算已经很紧（封面页按实测高度算唱片尺寸），多一排就等于从唱片身上抠高度；
 * - 那一排次要按钮在 dense 档（小窗/分屏）会被整排隐藏，
 *   而「定时关闭」恰恰是小窗里最需要能摸到的功能之一，不能跟着一起消失。
 * 时间行左右两端各只有 20 多像素的文字，中间一直是空的，正好放得下。
 */
function PlaybackChips({
  onOpenRate,
  onOpenSleep,
}: {
  onOpenRate: () => void;
  onOpenSleep: () => void;
}) {
  const palette = usePalette();
  const rate = usePlaybackRate();
  const sleepTimer = useSleepTimer();
  const rateActive = rate !== 1;
  const sleepActive = sleepTimer.kind !== null;

  return (
    <XStack alignItems="center" gap={8}>
      <XStack
        height={20}
        paddingHorizontal={8}
        alignItems="center"
        justifyContent="center"
        borderRadius={999}
        backgroundColor={rateActive ? palette.accentSoft : palette.cardAlt}
        transition="quickest"
        pressStyle={{ opacity: 0.6, scale: 0.94 }}
        hitSlop={8}
        onPress={onOpenRate}>
        <Text
          color={rateActive ? palette.accent : palette.textSecondary}
          fontSize={11}
          fontWeight="700"
          fontVariant={['tabular-nums']}>
          {formatPlaybackRate(rate)}
        </Text>
      </XStack>

      <XStack
        height={20}
        paddingHorizontal={8}
        gap={3}
        alignItems="center"
        justifyContent="center"
        borderRadius={999}
        backgroundColor={sleepActive ? palette.accentSoft : palette.cardAlt}
        transition="quickest"
        pressStyle={{ opacity: 0.6, scale: 0.94 }}
        hitSlop={8}
        onPress={onOpenSleep}>
        <Ionicons
          name="moon-outline"
          size={10}
          color={sleepActive ? palette.accent : palette.textSecondary}
        />
        {/* 定时开着的时候直接把剩余时间摆在脸上：不用为了看还剩多久再点开一次面板。
            用 formatLongClock：自定义时长可以超过 99 分钟，`m:ss` 会变成 `719:59`
            这种宽串，把药丸撑长后会把两侧的进度时间挤走；满 1 小时进位成 `1:59:30`
            之后最宽也就三个数字段。numberOfLines 兜住极端窄窗，宁可省略也不折行。 */}
        <Text
          numberOfLines={1}
          color={sleepActive ? palette.accent : palette.textSecondary}
          fontSize={11}
          fontWeight="700"
          fontVariant={['tabular-nums']}>
          {sleepActive ? (sleepTimer.fading ? '淡出中' : formatLongClock(sleepTimer.remainingMs)) : '定时'}
        </Text>
      </XStack>
    </XStack>
  );
}

export default function PlayerScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /*
   * 注意：这里**只拿它当兜底**，不用它做真实布局尺寸。
   * 分屏/自由窗口下它并不可信（见下面 rootSize 与 width/height 的注释）。
   */
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const player = usePlayer();

  const [pageIndex, setPageIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  /* 封面/歌词那个横向 pager 的真实高度：它就是封面页全部的竖向预算 */
  const [pagerHeight, setPagerHeight] = useState(0);
  /*
   * 根容器实测尺寸。为什么非要自己量一遍：
   * 真机证据（一加 PKR110，横屏分屏/自由窗口）—— App 实际只占一块 ~144dp 宽的窄窗，
   * 而 useWindowDimensions() 报的是 w794dp × h361dp，正好等于**整块横屏屏幕**
   * （2780×1264px ÷ 3.5）。即 Activity 的 configChanges 吞掉了窗口尺寸变化，
   * RN 的 Dimensions 没有跟着更新，于是「窗口尺寸」一直停在启动时那套整屏值。
   * 按 794dp 排版、塞进 144dp 的窗口，就是横向全被裁、竖向被挤压、标题和图标叠在一起。
   * onLayout 给的是 Yoga 按**真实父容器**算出的尺寸，完全不经过 Dimensions，
   * 所以在这种窗口模式下它是唯一可信的来源。
   */
  const [rootSize, setRootSize] = useState<{ width: number; height: number } | null>(null);
  const pagerRef = useRef<ScrollView>(null);

  const { track, playing, loading, buffering, mode, error, lyrics, lyricsStatus } = player;
  const liked = useIsLiked(track?.hash);

  useEffect(() => {
    // 提前加载歌单库,让心形按钮反映真实喜欢状态
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  useEffect(() => {
    /*
     * 原来用 InteractionManager.runAfterInteractions 延后一帧挂载歌词。
     * RN 0.8x 已弃用该 API（日志里那 8 条 `InteractionManager has been deprecated` 就是它），
     * 这里换成 requestAnimationFrame：同样只延后一帧，效果一致且不再产生警告。
     */
    const frame = requestAnimationFrame(() => setLyricsMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (pageIndex === 1) {
      void playerActions.loadLyrics();
    }
  }, [pageIndex, track?.hash]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  function handleToggleLike() {
    if (!track || likeBusy) {
      return;
    }
    setLikeBusy(true);
    libraryActions
      .toggleLike(track)
      .then((result) => {
        showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      })
      .catch((cause) => {
        showToast(cause instanceof Error ? cause.message : '操作失败');
      })
      .finally(() => setLikeBusy(false));
  }

  /*
   * 「唱片被遮挡」的真实原因（改版前）：discSize 只由**宽度**决定
   * （`Math.min(width - 104, compact ? 236 : 300)`），高度只用来翻一个 700 的开关。
   * 唱片所在的封面页被塞在「顶栏(40)」和「固定高度的控制区」之间的横向 pager 里，
   * pager 是 flex:1 —— 拿到多少高度就只能用多少，超出的部分会被 ScrollView 的边界
   * 直接裁掉；页面又是 justifyContent="center"，所以上下各被切一半。
   * 小窗/分屏时窗口高度掉到 400~600，pager 只剩 150~250，而唱片还按宽度算成 236，
   * 必然溢出被裁。
   *
   * 反过来，pager 的高度就是「最多能用多少」的准确答案，所以尺寸取宽、高两个约束的
   * 小值，再夹在 [DISC_MIN, DISC_MAX] 之间 —— 小窗里跟着窗口等比例缩小，大屏也不会
   * 无限变大，且窗口一改（拖动分屏、切小窗）根容器 onLayout 一触发就立即重算。
   */

  /*
   * 尺寸的唯一来源：根容器实测值优先，没测量到之前才退回 useWindowDimensions。
   * 兜底取「窗口宽高里的小值」而不是直接用 windowWidth —— 偏小只是首帧唱片小一圈，
   * 偏大就会溢出被裁（正是这次要修的 bug），所以宁可保守。
   */
  const width = rootSize?.width ?? Math.min(windowWidth, windowHeight);
  const height = rootSize?.height ?? windowHeight;

  const tier: PlayerTier = height < 620 ? 'dense' : height < 700 ? 'compact' : 'roomy';
  const compact = tier !== 'roomy';
  const pageGap = PAGE_GAP[tier];

  /*
   * 首次布局前用（实测优先的）高度粗估：本机型上封面页约占窗口高度的一半，
   * pager 的 onLayout 一到就换成实测值。
   * 旧注释说「用 useWindowDimensions 而不是 Dimensions.get('screen')，前者是**窗口**
   * 尺寸、小窗/分屏时它会变」——真机上这句话是错的：它报的就是整块屏幕，小窗里纹丝不动，
   * 那正是这次要修的坑。现在上面那个 height 已经是「实测优先」的窗口高度。
   */
  const availableHeight = pagerHeight || Math.round(height * 0.5);
  const discByWidth = width * DISC_WIDTH_RATIO;
  /* 播放失败时标题下面还会多一行错误提示，它同样吃高度，别让唱片把它顶掉 */
  const errorBlockHeight = error ? 34 : 0;
  const discByHeight =
    availableHeight - pageGap - TITLE_BLOCK_HEIGHT[tier] - errorBlockHeight - DISC_SAFETY;
  const discSize = Math.round(
    Math.min(Math.max(Math.min(discByWidth, discByHeight), DISC_MIN), DISC_MAX)
  );

  /*
   * dense 档把控制区整体缩小一档。它直接决定 pager 能长多高：
   * 400 高的窗口里，74 的播放按钮 + 52 的换曲按钮就是奢侈品。
   */
  const transportBase =
    tier === 'dense'
      ? { side: 36, sideIcon: 20, queueIcon: 22, skip: 44, skipIcon: 24, play: 60, playIcon: 26 }
      : { side: 42, sideIcon: 22, queueIcon: 24, skip: 52, skipIcon: 28, play: 74, playIcon: 30 };
  /*
   * 窄窗（横屏分屏一侧、自由窗口拖到很窄）里横向也得跟着收：
   * 控制区左右各 28 的 padding，在 144dp 的窗口上光两侧就吃掉 56。
   * 阈值 360 是因为「一排 5 颗按钮 + 两侧 padding」在 360 以下就摆不开了。
   */
  const narrow = width < 360;
  const controlsPadding = narrow ? Math.max(10, Math.round(width * 0.07)) : 28;
  const titlePadding = narrow ? 16 : 40;
  /*
   * 换曲/播放这一排的按钮尺寸是固定的，窄窗里会横向溢出：dense 档合计 220dp
   * （roomy 档 254dp），减去 padding 后 144dp 的窗口只剩 ~124dp —— 不缩就会互相压住、
   * 最外侧两颗被裁。按「可用宽度 ÷ 一排按钮总宽」等比缩，下限 0.5：再小就点不中了，
   * 宁可让按钮略微越界。
   */
  const transportTotal = transportBase.side * 2 + transportBase.skip * 2 + transportBase.play;
  const transportScale = Math.min(1, Math.max(0.5, (width - controlsPadding * 2) / transportTotal));
  const transport = {
    side: Math.round(transportBase.side * transportScale),
    sideIcon: Math.round(transportBase.sideIcon * transportScale),
    queueIcon: Math.round(transportBase.queueIcon * transportScale),
    skip: Math.round(transportBase.skip * transportScale),
    skipIcon: Math.round(transportBase.skipIcon * transportScale),
    play: Math.round(transportBase.play * transportScale),
    playIcon: Math.round(transportBase.playIcon * transportScale),
  };
  const controlsGap = tier === 'dense' ? 10 : compact ? 14 : 20;
  const bottomPadding = Math.max(insets.bottom, 14) + (tier === 'dense' ? 12 : 20);
  const busy = loading || buffering;

  const handlePagerLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    // 只有真的变了才 setState，避免每次布局都多推一轮渲染
    setPagerHeight((prev) => (prev === next ? prev : next));
  }, []);

  /*
   * 根容器的实测尺寸：整页布局唯一可信的数字来源（理由见 rootSize 的注释）。
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

  function handlePagerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== pageIndex) {
      setPageIndex(nextIndex);
    }
  }

  const handleSeekLine = useCallback((line: { timeMs: number }) => {
    playerActions.seekToMs(line.timeMs);
  }, []);

  if (!track) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap={16}
        backgroundColor={palette.background}
        paddingTop={insets.top}>
        <Ionicons name="musical-notes-outline" size={44} color={palette.textTertiary} />
        <Text color={palette.textTertiary} fontSize={14}>
          还没有正在播放的歌曲
        </Text>
        <XStack
          paddingHorizontal={24}
          height={42}
          alignItems="center"
          borderRadius={999}
          backgroundColor={palette.accentSoft}
          pressStyle={{ opacity: 0.7 }}
          onPress={() => router.back()}>
          <Text color={palette.accent} fontSize={14} fontWeight="600">
            返回
          </Text>
        </XStack>
      </YStack>
    );
  }

  return (
    <View flex={1} backgroundColor={palette.playerBottom} onLayout={handleRootLayout}>
      <LinearGradient
        colors={[palette.playerTop, palette.playerBottom]}
        style={StyleSheet.absoluteFill}
      />

      <YStack flex={1} paddingTop={insets.top + 6} paddingBottom={bottomPadding}>
        {/* 顶栏 */}
        <XStack zIndex={1} alignItems="center" justifyContent="space-between" paddingHorizontal={18}>
          <XStack
            width={40}
            height={40}
            borderRadius={20}
            alignItems="center"
            justifyContent="center"
            transition="quickest"
            pressStyle={{ opacity: 0.6, scale: 0.92 }}
            onPress={() => router.dismiss()}>
            <Ionicons name="chevron-down" size={24} color={palette.textSecondary} />
          </XStack>
          <YStack alignItems="center" gap={2}>
            <Text color={palette.textTertiary} fontSize={11} letterSpacing={1.2}>
              正在播放
            </Text>
            <XStack gap={5} alignItems="center">
              {[0, 1].map((dot) => (
                <View
                  key={dot}
                  width={dot === pageIndex ? 14 : 5}
                  height={5}
                  borderRadius={999}
                  backgroundColor={dot === pageIndex ? palette.accent : palette.textTertiary}
                  opacity={dot === pageIndex ? 1 : 0.4}
                  transition="quick"
                />
              ))}
            </XStack>
          </YStack>
          <View width={40} height={40} />
        </XStack>

        {/* 封面 / 歌词 双页 */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePagerScroll}
          onLayout={handlePagerLayout}
          style={{ flex: 1 }}>
          <YStack width={width} alignItems="center" justifyContent="center" gap={pageGap}>
            <SpinningDisc coverUrl={track.coverUrl} playing={playing} size={discSize} />

            <YStack alignItems="center" gap={7} paddingHorizontal={titlePadding} maxWidth={560}>
              <Text
                color={palette.text}
                fontSize={tier === 'dense' ? 17 : compact ? 19 : 22}
                fontWeight="800"
                textAlign="center"
                numberOfLines={1}>
                {track.title}
              </Text>
              <Text color={palette.textSecondary} fontSize={tier === 'dense' ? 13 : 14} numberOfLines={1}>
                {track.artist || '未知歌手'}
              </Text>
              {error ? (
                <XStack
                  alignItems="center"
                  gap={6}
                  marginTop={4}
                  paddingHorizontal={13}
                  paddingVertical={7}
                  borderRadius={999}
                  backgroundColor={palette.dangerSoft}>
                  <Ionicons name="alert-circle" size={13} color={palette.danger} />
                  <Text color={palette.danger} fontSize={12}>
                    {error}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          </YStack>

          <YStack width={width} paddingTop={8}>
            {lyricsMounted ? (
              <LyricsView
                lines={lyrics}
                status={lyricsStatus}
                onSeekLine={handleSeekLine}
              />
            ) : null}
          </YStack>
        </ScrollView>

        {/* 进度与控制 */}
        <YStack
          paddingHorizontal={controlsPadding}
          gap={controlsGap}
          maxWidth={620}
          width="100%"
          alignSelf="center">
          {/*
            dense 档（小窗/分屏）把这一排次要按钮藏掉：这一排固定 40 高，
            留着它就等于从唱片身上再抠掉 40+gap。功能入口在 tab 页里都还在，
            小窗里优先保证唱片和播放/换曲可见 —— 这正是用户抱怨被遮挡的场景。
          */}
          <XStack
            display={tier === 'dense' ? 'none' : 'flex'}
            alignItems="center"
            justifyContent="center"
            gap={narrow ? 16 : 46}>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              opacity={likeBusy ? 0.5 : 1}
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={handleToggleLike}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={24}
                color={liked ? palette.accent : palette.textSecondary}
              />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => setActionsOpen(true)}>
              <MaterialCommunityIcons name="playlist-plus" size={24} color={palette.textSecondary} />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => {
                if (track) {
                  void shareTrack(track);
                }
              }}>
              <Ionicons name="share-social-outline" size={22} color={palette.textSecondary} />
            </XStack>
          </XStack>

          <PlaybackProgress
            accessory={
              <PlaybackChips
                onOpenRate={() => setRateOpen(true)}
                onOpenSleep={() => setSleepOpen(true)}
              />
            }
          />

          <XStack alignItems="center" justifyContent="space-between">
            <XStack
              width={transport.side}
              height={transport.side}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => playerActions.cycleMode()}>
              <MaterialCommunityIcons
                name={MODE_ICON[mode]}
                size={transport.sideIcon}
                color={palette.textSecondary}
              />
            </XStack>

            <XStack
              width={transport.skip}
              height={transport.skip}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.previous()}>
              <Ionicons name="play-skip-back" size={transport.skipIcon} color={palette.text} />
            </XStack>

            <XStack
              width={transport.play}
              height={transport.play}
              borderRadius={transport.play / 2}
              overflow="hidden"
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ scale: 0.94, opacity: 0.9 }}
              onPress={() => playerActions.toggle()}>
              <LinearGradient
                colors={[palette.gradientStart, palette.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {busy ? (
                <Spinner size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={transport.playIcon}
                  color="#FFFFFF"
                  style={playing ? undefined : { marginLeft: 3 }}
                />
              )}
            </XStack>

            <XStack
              width={transport.skip}
              height={transport.skip}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.next()}>
              <Ionicons name="play-skip-forward" size={transport.skipIcon} color={palette.text} />
            </XStack>

            <XStack
              width={transport.side}
              height={transport.side}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => setQueueOpen(true)}>
              <MaterialCommunityIcons
                name="playlist-music"
                size={transport.queueIcon}
                color={palette.textSecondary}
              />
            </XStack>
          </XStack>
        </YStack>
      </YStack>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
      <TrackActionsSheet
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        track={track}
        initialView="pick"
      />
      <PlaybackRateDialog open={rateOpen} onOpenChange={setRateOpen} />
      <SleepTimerDialog open={sleepOpen} onOpenChange={setSleepOpen} />
      <ToastHost />
    </View>
  );
}
