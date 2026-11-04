import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import type { LibraryPlaylist } from '@/features/library/store';
import { usePalette } from '@/hooks/use-palette';

/**
 * 面板总高：**显式定死**，不随歌单数量变化。
 *
 * 项目里已经踩过 Tamagui Sheet `snapPointsMode="fit"` 的坑：fit 要先渲染再测量，
 * 首帧会先塌成一个很小的高度再弹回来（实测序列 353 → 35 → 370），肉眼就是闪烁。
 * 这里用原生 Modal + 常量高度，首帧就是最终尺寸；歌单多了只在面板内部滚动，
 * 面板本身永远不重新测量。删除确认是同一个 Modal 里的第二个视图，
 * 高度复用同一个计算结果，切换视图时不会出现高度跳动。
 */
const PANEL_HEIGHT = 424;
const PANEL_HANDLE_HEIGHT = 20;
const PANEL_PADDING_TOP = 12;
const PANEL_HEADER_HEIGHT = 54;
const ROW_HEIGHT = 62;

export type PlaylistRemoveMode = 'delete' | 'uncollect';

/**
 * 「删除整个歌单 / 取消收藏歌单」的选择面板。
 *
 * 只负责挑一个歌单、做二次确认、把决定交给 [onConfirm]；
 * 真正的接口调用与列表/缓存同步都在 libraryActions.removePlaylist 里，
 * 这样「我的」页和详情页不会出现两套删除逻辑。
 */
export function PlaylistRemoveSheet({
  open,
  onOpenChange,
  playlists,
  mode,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已经按 isPlaylistDeletable / isPlaylistUncollectable 过滤好的歌单。 */
  playlists: LibraryPlaylist[];
  mode: PlaylistRemoveMode;
  /** 确认后执行删除/取消收藏；抛错表示失败。 */
  onConfirm: (playlist: LibraryPlaylist) => Promise<void>;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  /** 正在二次确认的歌单；null 表示还停留在列表视图。 */
  const [pending, setPending] = useState<LibraryPlaylist | null>(null);
  const [busy, setBusy] = useState(false);
  /** 失败原因直接显示在面板里 —— Modal 会盖住根布局的 Toast 宿主，toast 在这里看不见。 */
  const [error, setError] = useState('');
  const [wasOpen, setWasOpen] = useState(open);

  /*
   * 每次重新打开都清掉上一次的选择/错误。
   * 用「渲染期对比」而不是 useEffect：effect 会在面板已经画出来之后才跑，
   * 打开的第一帧可能先闪一下上次的确认态。
   */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPending(null);
      setBusy(false);
      setError('');
    }
  }

  const uncollect = mode === 'uncollect';
  const bottomPadding = Math.max(insets.bottom, 16) + 6;
  /*
   * 横屏 / 小窗时窗口高度可能只有 360 左右，不能再把 424 硬塞进去，
   * 否则面板顶部（把手、标题）会跑到屏幕外。这里按窗口高度显式截断，
   * 仍然是「算出来的定高」，不依赖任何内容测量，不会触发 fit 那种塌陷闪烁。
   */
  const panelHeight = Math.min(PANEL_HEIGHT, windowHeight - 24);

  async function handleConfirm() {
    if (!pending || busy) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onConfirm(pending);
      // 成功后收起面板：歌单列表由父组件读的 library state 更新，这里不再自己改数据
      setPending(null);
      onOpenChange(false);
    } catch (err) {
      const fallback = uncollect ? '取消收藏失败' : '删除歌单失败';
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (!busy) {
      onOpenChange(false);
    }
  }

  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable
          style={[
            styles.panel,
            {
              height: panelHeight,
              backgroundColor: palette.card,
              paddingBottom: bottomPadding,
            },
          ]}
          onPress={(event) => event.stopPropagation()}>
          <XStack height={PANEL_HANDLE_HEIGHT} alignItems="center" justifyContent="center">
            <XStack width={40} height={4} borderRadius={2} backgroundColor={palette.cardAlt} />
          </XStack>

          <YStack flex={1} paddingTop={PANEL_PADDING_TOP} paddingHorizontal={16}>
            <XStack minHeight={PANEL_HEADER_HEIGHT} alignItems="flex-start">
              <YStack gap={2}>
                <Text color={palette.text} fontSize={17} fontWeight="700">
                  {uncollect ? '取消收藏' : '删除歌单'}
                </Text>
                <Text color={palette.textTertiary} fontSize={12}>
                  {uncollect ? '只从你的收藏里移除，不会删除原歌单' : '选择要删除的歌单，删除后无法恢复'}
                </Text>
              </YStack>
            </XStack>

            {pending ? (
              /* 二次确认：不再是系统 Alert —— 原生 Modal 之上再叠 Alert 在 Android
                 上有被盖住的风险，所以确认态直接做进同一个固定高度面板里。
                 横屏/小窗下面板会被压矮，确认内容放进 ScrollView 兜底，
                 小屏上也能滚动看全，而不是被 overflow:hidden 裁掉。 */
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.confirmContent}
                showsVerticalScrollIndicator={false}>
                <YStack alignItems="center" justifyContent="center" gap={13} paddingHorizontal={8}>
                  <Artwork uri={pending.coverUrl} size={62} radius={16} />
                  <Text
                    color={palette.text}
                    fontSize={16}
                    fontWeight="700"
                    textAlign="center"
                    numberOfLines={2}>
                    {pending.name}
                  </Text>
                  <Text
                    color={palette.textSecondary}
                    fontSize={12.5}
                    lineHeight={19}
                    textAlign="center">
                    {uncollect
                      ? `确定取消收藏「${pending.name}」？这只会把它从你的收藏里移除，原歌单不会被删除。`
                      : `确定删除「${pending.name}」？歌单里的歌曲不会被删除，但歌单本身无法恢复。`}
                  </Text>
                  {error ? (
                    <Text color={palette.danger} fontSize={12.5} lineHeight={18} textAlign="center">
                      {error}
                    </Text>
                  ) : null}
                  <XStack gap={12} alignSelf="stretch" paddingTop={4}>
                    <XStack
                      flex={1}
                      height={44}
                      alignItems="center"
                      justifyContent="center"
                      borderRadius={22}
                      backgroundColor={palette.cardAlt}
                      opacity={busy ? 0.5 : 1}
                      transition="quickest"
                      pressStyle={{ opacity: 0.7 }}
                      onPress={() => {
                        if (busy) {
                          return;
                        }
                        setPending(null);
                        setError('');
                      }}>
                      <Text color={palette.textSecondary} fontSize={14.5} fontWeight="600">
                        取消
                      </Text>
                    </XStack>
                    <XStack
                      flex={1}
                      height={44}
                      alignItems="center"
                      justifyContent="center"
                      gap={6}
                      borderRadius={22}
                      backgroundColor={palette.dangerSoft}
                      opacity={busy ? 0.6 : 1}
                      transition="quickest"
                      pressStyle={{ opacity: 0.75 }}
                      onPress={() => void handleConfirm()}>
                      {busy ? (
                        <Spinner size="small" color={palette.danger} />
                      ) : (
                        <Ionicons
                          name={uncollect ? 'heart-dislike-outline' : 'trash-outline'}
                          size={16}
                          color={palette.danger}
                        />
                      )}
                      <Text color={palette.danger} fontSize={14.5} fontWeight="700">
                        {uncollect ? '取消收藏' : '删除'}
                      </Text>
                    </XStack>
                  </XStack>
                </YStack>
              </ScrollView>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {playlists.map((item) => (
                  <XStack
                    key={item.listid}
                    height={ROW_HEIGHT}
                    alignItems="center"
                    gap={12}
                    paddingHorizontal={8}
                    borderRadius={14}
                    transition="quickest"
                    pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
                    onPress={() => {
                      if (!busy) {
                        setPending(item);
                        setError('');
                      }
                    }}>
                    <Artwork uri={item.coverUrl} size={44} radius={11} />
                    <YStack flex={1} gap={2}>
                      <Text color={palette.text} fontSize={14.5} fontWeight="600" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text color={palette.textTertiary} fontSize={11.5}>
                        {item.count} 首
                      </Text>
                    </YStack>
                    <Ionicons
                      name={uncollect ? 'heart-dislike-outline' : 'trash-outline'}
                      size={18}
                      color={palette.danger}
                    />
                  </XStack>
                ))}
              </ScrollView>
            )}
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** 底部面板遮罩：点击空白处关闭（删除进行中不放行，见 close）。 */
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 8, 14, 0.42)',
  },
  /** 面板本体：高度由调用处显式给定，不做任何内容测量。 */
  panel: {
    width: '100%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  list: {
    // 填满固定高度面板的剩余空间：列表再长也不会把面板撑高，只在内部滚动。
    flex: 1,
  },
  confirmContent: {
    // 空间足够时垂直居中；横屏/小窗空间不足时内容自然变高，由 ScrollView 滚动兜底。
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
});
