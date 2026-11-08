import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import type { LibraryPlaylist } from '@/features/library/store';
import { usePalette } from '@/hooks/use-palette';

/**
 * 面板高度**显式定死**，不随歌单数量变化。
 *
 * 项目里踩过 Tamagui Sheet `snapPointsMode="fit"` 的坑（先渲染再测量 → 首帧塌陷再弹回，
 * 肉眼就是闪一下）。这里沿用 `PlaylistRemoveSheet` 的做法：原生 Modal + 常量高度，
 * 歌单多了只在面板内部滚动，面板本身永远不重新测量。
 */
const PANEL_HEIGHT = 468;
const PANEL_HANDLE_HEIGHT = 20;
const PANEL_HEADER_HEIGHT = 54;
const ROW_HEIGHT = 60;

/**
 * 「把歌曲加入某个自建歌单」的选择面板。
 *
 * 为什么单独一个组件：专辑页（`TrackCollectionScreen`）和以后的其它集合页都要用它，
 * 而项目里原来只有「创建歌单」的 `CreatePlaylistSheet`。这里只负责**挑一个歌单**，
 * 真正的写入由调用方的 `onPick` 完成（专辑页传的是 `libraryActions.addToPlaylist`），
 * 这样不会出现两套加歌逻辑。
 */
export function PlaylistPickSheet({
  open,
  onOpenChange,
  title = '添加至歌单',
  subtitle,
  playlists,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtitle?: string;
  /** 已过滤好的可写歌单（通常只有自己创建的）。 */
  playlists: LibraryPlaylist[];
  /** 选中后执行写入；抛错表示失败，错误文案直接显示在面板里。 */
  onPick: (playlist: LibraryPlaylist) => Promise<void>;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  /** 正在写入的歌单 id；同时挡住并发点击。 */
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [wasOpen, setWasOpen] = useState(open);

  // 每次重新打开都清掉上一次的状态（渲染期对比，避免打开首帧闪一下旧错误）
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBusyId('');
      setError('');
    }
  }

  const bottomPadding = Math.max(insets.bottom, 16) + 6;
  // 横屏 / 小窗下窗口可能只有 360 左右，按窗口高度截断，别让面板跑到屏幕外
  const panelHeight = Math.min(PANEL_HEIGHT, windowHeight - 24);

  async function handlePick(playlist: LibraryPlaylist) {
    if (busyId) {
      return;
    }
    setBusyId(playlist.listid);
    setError('');
    try {
      await onPick(playlist);
      onOpenChange(false);
    } catch (err) {
      // Modal 会盖住根布局的 Toast 宿主，错误必须显示在面板里
      setError(err instanceof Error ? err.message : '添加失败，请稍后重试');
    } finally {
      setBusyId('');
    }
  }

  function close() {
    if (!busyId) {
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
          style={[styles.panel, { height: panelHeight, backgroundColor: palette.card, paddingBottom: bottomPadding }]}
          onPress={(event) => event.stopPropagation()}>
          <XStack height={PANEL_HANDLE_HEIGHT} alignItems="center" justifyContent="center">
            <XStack width={40} height={4} borderRadius={2} backgroundColor={palette.cardAlt} />
          </XStack>

          <YStack flex={1} paddingTop={12} paddingHorizontal={16}>
            <XStack minHeight={PANEL_HEADER_HEIGHT} alignItems="flex-start">
              <YStack gap={2} flex={1}>
                <Text color={palette.text} fontSize={17} fontWeight="700">
                  {title}
                </Text>
                {subtitle ? (
                  <Text color={palette.textTertiary} fontSize={12}>
                    {subtitle}
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            {error ? (
              <Text color={palette.danger} fontSize={12.5} lineHeight={18} paddingBottom={6}>
                {error}
              </Text>
            ) : null}

            {playlists.length ? (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {playlists.map((playlist) => {
                  const busy = busyId === playlist.listid;
                  return (
                    <XStack
                      key={playlist.listid}
                      height={ROW_HEIGHT}
                      alignItems="center"
                      gap={10}
                      paddingHorizontal={4}
                      opacity={busyId && !busy ? 0.5 : 1}
                      transition="quickest"
                      pressStyle={{ opacity: 0.65 }}
                      onPress={() => void handlePick(playlist)}>
                      <YStack flex={1} gap={2}>
                        <Text color={palette.text} fontSize={14.5} fontWeight={600} numberOfLines={1}>
                          {playlist.name}
                        </Text>
                        <Text color={palette.textTertiary} fontSize={11.5}>
                          {playlist.count} 首
                        </Text>
                      </YStack>
                      {busy ? (
                        <Spinner size="small" color={palette.accent} />
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={palette.textTertiary} />
                      )}
                    </XStack>
                  );
                })}
              </ScrollView>
            ) : (
              <YStack flex={1} alignItems="center" justifyContent="center" gap={10} paddingHorizontal={20}>
                <Ionicons name="albums-outline" size={34} color={palette.textTertiary} />
                <Text color={palette.textTertiary} fontSize={13} textAlign="center">
                  还没有自建歌单
                </Text>
                <Text color={palette.textTertiary} fontSize={11.5} textAlign="center" lineHeight={17}>
                  可以先到「我的」页创建一个歌单，再回来添加。
                </Text>
              </YStack>
            )}
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
});
