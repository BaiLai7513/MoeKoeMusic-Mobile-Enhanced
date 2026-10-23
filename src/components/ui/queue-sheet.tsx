import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View as RNView,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Text, XStack, YStack } from 'tamagui';

import { playerActions, usePlayer } from '@/features/player/store';
import { usePalette } from '@/hooks/use-palette';

type QueueSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MODE_LABEL: Record<string, string> = {
  sequence: '顺序播放',
  shuffle: '随机播放',
  single: '单曲循环',
};

const QUEUE_ITEM_HEIGHT = 58;
const QUEUE_HEADER_HEIGHT = 78;
const QUEUE_MAX_HEIGHT_RATIO = 0.68;
const QUEUE_RENDER_ALL_LIMIT = 100;

export function QueueSheet({ open, onOpenChange }: QueueSheetProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { queue, index, mode } = usePlayer();

  /*
   * 窗口高度的实测值。为什么不能直接用 useWindowDimensions()：
   * 真机证据（一加 PKR110，横屏分屏/自由小窗）下它报的是整块显示器的 361，
   * 而 App 真实窗口高 522 —— manifest 的 configChanges 含 orientation|screenSize，
   * Activity 不重建、Dimensions 不跟着更新，错值会一直留着。
   * maxListHeight 就是拿它算的，于是列表按「错误的高度」排版，底部几行被裁。
   *
   * 本组件没有自己的根容器（Sheet 的内容是走 Portal 画到全窗口的），所以在最外层放一个
   * 铺满父容器、不接收触摸、无背景的测量层：QueueSheet 只有一个调用点（player.tsx 的
   * 根 View，flex:1 铺满窗口），它的 layout 就等于窗口尺寸，而 onLayout 走的是 Yoga、
   * 完全不经过 Dimensions，窗口一改（拖分屏、切小窗）会立即回调重算。
   */
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const handleRootLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next <= 0) {
      return;
    }
    // 只有真的变了才 setState，避免每次布局都多推一轮渲染
    setMeasuredHeight((prev) => (prev === next ? prev : next));
  }, []);

  /*
   * 实测优先，测到之前退回 windowHeight。这里**不用** min(width, height)：
   * 对「高度」这一维，min 在全屏竖屏下会取到 361，把列表压到 3 行 —— 那是可见的视觉变化；
   * 而 windowHeight 的偏值是「整屏高」，只在横竖切换后才会小于真实窗口，本质偏小、不会溢出，
   * 正好符合「宁可偏小」的取舍。这也是 player.tsx 里
   * `height = rootSize?.height ?? windowHeight` 的同一个选择。
   */
  const height = measuredHeight ?? windowHeight;

  const frameBottomPadding = Math.max(insets.bottom, 16) + 6;
  const maxListHeight = Math.max(
    QUEUE_ITEM_HEIGHT * 3,
    height * QUEUE_MAX_HEIGHT_RATIO - QUEUE_HEADER_HEIGHT - frameBottomPadding
  );
  const listContentHeight = queue.length * QUEUE_ITEM_HEIGHT;
  const listHeight = Math.min(listContentHeight, maxListHeight);
  const listScrollable = listContentHeight > maxListHeight;
  const visibleRows = Math.ceil(maxListHeight / QUEUE_ITEM_HEIGHT);
  const renderAllRows = queue.length <= QUEUE_RENDER_ALL_LIMIT;
  const initialRows = renderAllRows ? queue.length : Math.max(24, visibleRows + 18);
  const batchRows = renderAllRows ? queue.length : 64;

  return (
    <>
      {/* 隐形测量层：只量父容器（= 窗口）的高度，无背景、不接触摸，对视觉零影响 */}
      <RNView pointerEvents="none" style={styles.measure} onLayout={handleRootLayout} />
      <Sheet
        modal={false}
        open={open}
        onOpenChange={onOpenChange}
        snapPointsMode="fit"
        dismissOnSnapToBottom
        transition="medium"
        zIndex={100000}>
        <Sheet.Overlay
          transition="quick"
          backgroundColor="rgba(8, 8, 14, 0.42)"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle backgroundColor={palette.cardAlt} width={40} alignSelf="center" />
        <Sheet.Frame
          backgroundColor={palette.card}
          borderTopLeftRadius={26}
          borderTopRightRadius={26}
          paddingTop="$3"
          paddingBottom={frameBottomPadding}>
          <XStack
            alignItems="center"
            justifyContent="space-between"
            paddingHorizontal="$4"
            paddingBottom="$3">
            <YStack gap={2}>
              <Text color={palette.text} fontSize={17} fontWeight="700">
                播放队列
              </Text>
              <Text color={palette.textTertiary} fontSize={12}>
                {MODE_LABEL[mode]} · {queue.length} 首
              </Text>
            </YStack>
            <XStack
              alignItems="center"
              gap={5}
              paddingHorizontal={12}
              paddingVertical={7}
              borderRadius={999}
              backgroundColor={palette.cardAlt}
              transition="quickest"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => {
                playerActions.clearQueue();
                onOpenChange(false);
              }}>
              <Ionicons name="trash-outline" size={14} color={palette.textSecondary} />
              <Text color={palette.textSecondary} fontSize={12.5} fontWeight="600">
                清空
              </Text>
            </XStack>
          </XStack>

          <FlatList
            data={queue}
            keyExtractor={(track, itemIndex) => `${track.hash}-${itemIndex}`}
            showsVerticalScrollIndicator={false}
            scrollEnabled={listScrollable}
            bounces={listScrollable}
            alwaysBounceVertical={false}
            overScrollMode="never"
            initialNumToRender={initialRows}
            maxToRenderPerBatch={batchRows}
            updateCellsBatchingPeriod={0}
            windowSize={renderAllRows ? 51 : 25}
            removeClippedSubviews={false}
            nestedScrollEnabled
            getItemLayout={(_, itemIndex) => ({
              length: QUEUE_ITEM_HEIGHT,
              offset: QUEUE_ITEM_HEIGHT * itemIndex,
              index: itemIndex,
            })}
            style={{ height: listHeight }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
            renderItem={({ item: track, index: itemIndex }) => {
              const active = itemIndex === index;
              return (
                <XStack
                  height={QUEUE_ITEM_HEIGHT}
                  alignItems="center"
                  gap={12}
                  paddingHorizontal={12}
                  borderRadius={14}
                  backgroundColor={active ? palette.accentSoft : 'transparent'}
                  transition="quickest"
                  pressStyle={{ opacity: 0.65 }}
                  onPress={() => void playerActions.jumpTo(itemIndex)}>
                  <XStack width={34} flexShrink={0} justifyContent="center">
                    {active ? (
                      <Ionicons name="pulse" size={16} color={palette.accent} />
                    ) : (
                      <Text
                        width={34}
                        numberOfLines={1}
                        textAlign="center"
                        color={palette.textTertiary}
                        fontSize={12.5}
                        fontVariant={['tabular-nums']}>
                        {itemIndex + 1}
                      </Text>
                    )}
                  </XStack>
                  <YStack flex={1} gap={1}>
                    <Text
                      color={active ? palette.accent : palette.text}
                      fontSize={14.5}
                      fontWeight={active ? '700' : '500'}
                      numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
                      {track.artist || '未知歌手'}
                    </Text>
                  </YStack>
                  <XStack
                    width={30}
                    height={30}
                    alignItems="center"
                    justifyContent="center"
                    transition="quickest"
                    pressStyle={{ opacity: 0.5, scale: 0.9 }}
                    onPress={(event) => {
                      event.stopPropagation();
                      playerActions.removeAt(itemIndex);
                    }}>
                    <Ionicons name="close" size={15} color={palette.textTertiary} />
                  </XStack>
                </XStack>
              );
            }}
          />
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
