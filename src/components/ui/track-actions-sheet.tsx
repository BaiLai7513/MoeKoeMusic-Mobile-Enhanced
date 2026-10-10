import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Spinner, Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { showToast } from '@/components/ui/toast';
import { TouchText } from '@/components/ui/touch-text';
import { isLoggedIn } from '@/features/account/user-api';
import {
  downloadTrack,
  fetchAvailableQualities,
  isDownloadSupported,
} from '@/features/download/downloader';
import { libraryActions, useIsLiked, useLibrary, type LibraryPlaylist } from '@/features/library/store';
import { AUDIO_QUALITIES, AUDIO_QUALITY_LABELS, type AudioQuality } from '@/features/player/audio-quality';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';
import { shareTrack } from '@/lib/share';

/**
 * Sheet 内容区的**固定高度**。
 *
 * 为什么必须固定：这个 Sheet 用 `snapPointsMode="fit"`，高度完全由内容撑开。
 * 而它有三个视图（操作菜单 / 选歌单 / 下载音质），行数各不相同 ——
 * 切换视图时 Sheet 必然会**重新测量并动画到新高度**，肉眼就是一次闪烁。
 *
 * 把三种视图的高度钉成同一个值后，切换时不存在任何高度变化，闪烁从根上消失。
 * 取 260 = 上下留白(6) + 5 行操作(5×50)，正好是「操作菜单」最满时的尺寸，
 * 其余视图不足的部分由留白补齐，超出的部分在视图内滚动。
 */
const SHEET_CONTENT_HEIGHT = 260;

/**
 * Sheet 各段固定高度，用于**显式算出整体高度**（配合 snapPointsMode="constant"）。
 *
 * 必须与 Sheet.Frame 的实际 padding 与头部尺寸保持一致 —— 改样式时这几项要一起改。
 */
const SHEET_HANDLE_HEIGHT = 20;
const SHEET_PADDING_TOP = 12;
const SHEET_HEADER_HEIGHT = 56;
const SHEET_BOTTOM_EXTRA = 6;

type SheetBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 操作面板的一行。
 *
 * 高度**必须钉死**：这个 Sheet 用 `snapPointsMode="fit"`，高度由内容撑开，
 * 而行内会在「图标 ↔ Spinner」之间切换；两着的实际高度并不相同（Spinner small
 * 比 Ionicons 21 略矮），一旦切换就会让整行高度变化几像素，
 * Sheet 重新测量后表现为轻微抖动/闪烁 —— 且只在特定时机可见，所以是偶发的。
 */
function ActionRow({
  icon,
  label,
  danger = false,
  active = false,
  busy = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  active?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const color = danger ? palette.danger : active ? palette.accent : palette.text;

  return (
    <XStack
      alignItems="center"
      gap={14}
      height={ACTION_ROW_HEIGHT}
      paddingHorizontal={14}
      borderRadius={14}
      opacity={busy ? 0.55 : 1}
      transition="quickest"
      pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
      onPress={busy ? undefined : onPress}>
      <XStack
        width={ACTION_ICON_SIZE}
        height={ACTION_ICON_SIZE}
        alignItems="center"
        justifyContent="center">
        {busy ? <Spinner size="small" color={palette.accent} /> : icon}
      </XStack>
      <Text flex={1} color={color} fontSize={15} fontWeight="600">
        {label}
      </Text>
    </XStack>
  );
}

/** 操作行高度与图标位尺寸：显式常量，避免任何内容切换改变布局。 */
const ACTION_ROW_HEIGHT = 50;
const ACTION_ICON_SIZE = 26;

/** 新建歌单弹窗;创建成功后回调新歌单 listid。 */
export function CreatePlaylistSheet({
  open,
  onOpenChange,
  onCreated,
}: SheetBaseProps & {
  onCreated?: (listid: string, name: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setBusy(false);
    }
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }

    setBusy(true);
    try {
      const listid = await libraryActions.createPlaylist(trimmed);
      showToast(`歌单「${trimmed}」已创建`);
      onOpenChange(false);
      onCreated?.(listid, trimmed);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建歌单失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}>
      <Sheet
        modal={false}
        open={open}
        onOpenChange={onOpenChange}
        snapPointsMode="fit"
        dismissOnSnapToBottom
        moveOnKeyboardChange
        transition="medium"
        zIndex={110000}>
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
          paddingHorizontal="$4"
          paddingBottom={Math.max(insets.bottom, 16) + 8}>
          <YStack gap={16}>
            <Text color={palette.text} fontSize={17} fontWeight="700">
              新建歌单
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="歌单名称"
              placeholderTextColor={palette.textTertiary}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreate()}
              style={[
                styles.input,
                {
                  color: palette.text,
                  backgroundColor: palette.cardAlt,
                  borderColor: palette.border,
                },
              ]}
            />
            <XStack gap={12}>
              <XStack
                flex={1}
                height={44}
                alignItems="center"
                justifyContent="center"
                borderRadius={22}
                backgroundColor={palette.cardAlt}
                transition="quickest"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => onOpenChange(false)}>
                <Text color={palette.textSecondary} fontSize={14.5} fontWeight="600">
                  取消
                </Text>
              </XStack>
              <XStack
                flex={1}
                height={44}
                alignItems="center"
                justifyContent="center"
                gap={8}
                borderRadius={22}
                backgroundColor={palette.accent}
                opacity={name.trim() && !busy ? 1 : 0.5}
                transition="quickest"
                pressStyle={{ opacity: 0.85 }}
                onPress={() => void handleCreate()}>
                {busy ? <Spinner size="small" color={palette.onAccent} /> : null}
                <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                  创建
                </Text>
              </XStack>
            </XStack>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </Modal>
  );
}

export type TrackRemovalContext = {
  /** 所在歌单的 listid(写操作用)。 */
  listid: string;
  /** 移除成功后由页面同步本地列表。 */
  onRemoved: (track: PlayerTrack) => void;
};

/**
 * 歌曲操作面板:喜欢 / 收藏到歌单 / 分享,在自己歌单上下文里额外提供"从歌单移除"。
 * 原生 Modal 承载 Sheet，避免被 TabBar / MiniPlayer 这类页面浮层盖住。
 */
export function TrackActionsSheet({
  open,
  onOpenChange,
  track,
  removal,
  initialView = 'actions',
}: SheetBaseProps & {
  track: PlayerTrack | null;
  removal?: TrackRemovalContext;
  initialView?: 'actions' | 'pick' | 'download';
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const liked = useIsLiked(track?.hash);
  const [view, setView] = useState<'actions' | 'pick' | 'download'>(initialView);
  const [busyKey, setBusyKey] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetState, setResetState] = useState({ open, initialView });
  /**
   * 这首歌当前账号可下的音质（高→低）。
   * `null` = 正在探测；空数组 = 探测失败，回退到列出全部档位。
   */
  const [availableQualities, setAvailableQualities] = useState<AudioQuality[] | null>(null);

  if (open !== resetState.open || (open && initialView !== resetState.initialView)) {
    setResetState({ open, initialView });
    if (open) {
      setView(initialView);
      setBusyKey('');
      // 换一首歌时清掉上一首的可用音质，避免短暂显示错误的档位列表
      setAvailableQualities(null);
    }
  }

  useEffect(() => {
    if (open && isLoggedIn()) {
      void libraryActions.ensure().catch(() => undefined);
    }
  }, [open]);

  // 注意：可用音质的探测**不在这里做**。
  // 它必须发生在切换到 download 视图之前（见 handleOpenDownload 的注释），
  // 否则「矮的检测态 → 高的列表态」会让 fit 模式的 Sheet 抖一下。
  // 这里只在音质列表为空时做一次兜底重试没有意义，故不设 effect。

  const myPlaylists = library.playlists.filter((item) => item.isMine);

  async function run(key: string, action: () => Promise<void>) {
    if (busyKey) {
      return;
    }
    setBusyKey(key);
    try {
      await action();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusyKey('');
    }
  }

  function handleToggleLike(current: PlayerTrack) {
    void run('like', async () => {
      const result = await libraryActions.toggleLike(current);
      showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      onOpenChange(false);
    });
  }

  function handleAddTo(playlist: LibraryPlaylist, current: PlayerTrack) {
    void run(`add-${playlist.listid}`, async () => {
      await libraryActions.addToPlaylist(playlist, [current]);
      showToast(`已收藏到「${playlist.name}」`);
      onOpenChange(false);
    });
  }

  function handleRemove(current: PlayerTrack, context: TrackRemovalContext) {
    void run('remove', async () => {
      await libraryActions.removeFromPlaylist(context.listid, [current]);
      context.onRemoved(current);
      showToast('已从歌单移除');
      onOpenChange(false);
    });
  }

  function handleShare(current: PlayerTrack) {
    onOpenChange(false);
    void shareTrack(current);
  }

  /**
   * 打开下载视图。
   *
   * **先探测、再切视图** —— 不能反过来。
   * 这个 Sheet 用的是 `snapPointsMode="fit"`，高度由内容撑开；
   * 如果先切到「正在检测…」的矮状态、拿到结果后再换成高列表，
   * 弹窗会先撑到矮的再长到高的，肉眼就是一次明显的闪烁/跳动。
   * 放在切换前探测，下载视图一出现就是最终高度，只发生一次尺寸变化。
   */
  function handleOpenDownload(current: PlayerTrack) {
    void run('probe-quality', async () => {
      const list = await fetchAvailableQualities(current);
      setAvailableQualities(list);
      setView('download');
    });
  }

  /** 下载一首：先按所选音质解析直链（拿不到会自动降级），再交给系统下载器。 */
  function handleDownload(current: PlayerTrack, quality: AudioQuality) {
    void run(`download-${quality}`, async () => {
      const outcome = await downloadTrack(current, quality);
      // 实际音质可能与所选不同（降级了），如实告知
      const label = AUDIO_QUALITY_LABELS[outcome.quality];
      showToast(
        outcome.quality === quality
          ? `已开始下载（${label}）`
          : `该音质不可用，已按 ${label} 下载`
      );
      onOpenChange(false);
    });
  }

  /**
   * Sheet 的固定高度。
   *
   * **为什么不用 `snapPointsMode="fit"`**：fit 模式必须先渲染内容、再测量高度，
   * 首帧拿到测量结果前 Sheet 会以「大高度」出现、随后收缩到内容高度 ——
   * 这个过程就是用户看到的闪烁（在首页这种重列表页、又正在播放音频时尤其明显，
   * 因为那一帧还要处理列表重渲染 + 音频线程）。
   *
   * 改成 constant + 显式高度后，Sheet **首帧就是最终高度**，不再依赖测量。
   */
  const sheetHeight =
    SHEET_HANDLE_HEIGHT +
    SHEET_PADDING_TOP +
    SHEET_HEADER_HEIGHT +
    SHEET_CONTENT_HEIGHT +
    Math.max(insets.bottom, 16) +
    SHEET_BOTTOM_EXTRA;

  return (
    <>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="slide"
        onRequestClose={() => onOpenChange(false)}>
        {/*
         * 这里刻意用**原生 RN Modal + 自己定高的面板**，不用 Tamagui 的 Sheet。
         *
         * 实测（onLayout 打点）Tamagui Sheet 的高度序列是：
         *   353 → 35 → 370
         * 中间那一下塌成 35（≈只剩上下 padding，内容完全没参与布局），随后才弹回最终高度。
         * 这个序列在**所有页面**都会出现，但只有首页那一帧真被画出来 ——
         * 因为首页的每日推荐是**非虚拟化**列表（点 ⋮ 会全量重渲染 6 行带封面图的列表），
         * 再叠加音频线程，帧预算被占满，中间态就上屏了，表现为从底部弹出时闪一下。
         *
         * 换掉之后：滑动动画交给系统（animationType="slide"），
         * 面板高度由 [sheetHeight] 显式给定，**不存在任何「先测量再修正」的环节**。
         */}
        <Pressable style={styles.overlay} onPress={() => onOpenChange(false)}>
          <Pressable
            style={[
              styles.panel,
              {
                height: sheetHeight,
                backgroundColor: palette.card,
                paddingBottom: Math.max(insets.bottom, 16) + 6,
              },
            ]}
            onPress={(event) => event.stopPropagation()}>
            <XStack height={SHEET_HANDLE_HEIGHT} alignItems="center" justifyContent="center">
              <XStack width={40} height={4} borderRadius={2} backgroundColor={palette.cardAlt} />
            </XStack>
            {track ? (
              <YStack paddingHorizontal="$3">
              <XStack
                alignItems="center"
                gap={12}
                paddingHorizontal={14}
                paddingBottom={12}
                borderBottomWidth={StyleSheet.hairlineWidth}
                borderBottomColor={palette.border}>
                <Artwork uri={track.coverUrl} size={44} radius={10} />
                <YStack flex={1} gap={2}>
                  <Text color={palette.text} fontSize={15} fontWeight="700" numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text color={palette.textTertiary} fontSize={12} numberOfLines={1}>
                    {track.artist || '未知歌手'}
                  </Text>
                </YStack>
                {view !== 'actions' ? (
                  <TouchText onPress={() => setView('actions')} fontSize={13} offsetForAlignment={false}>
                    返回
                  </TouchText>
                ) : null}
              </XStack>

              {view === 'actions' ? (
                <YStack paddingTop={6} height={SHEET_CONTENT_HEIGHT}>
                  <ActionRow
                    icon={
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={21}
                        color={liked ? palette.accent : palette.text}
                      />
                    }
                    label={liked ? '从「我喜欢」移除' : '加入「我喜欢」'}
                    active={liked}
                    busy={busyKey === 'like'}
                    onPress={() => handleToggleLike(track)}
                  />
                  <ActionRow
                    icon={<MaterialCommunityIcons name="playlist-plus" size={22} color={palette.text} />}
                    label="收藏到歌单"
                    onPress={() => {
                      if (!isLoggedIn()) {
                        showToast('请先登录');
                        return;
                      }
                      setView('pick');
                    }}
                  />
                  <ActionRow
                    icon={<Ionicons name="share-social-outline" size={20} color={palette.text} />}
                    label="分享"
                    onPress={() => handleShare(track)}
                  />
                  {isDownloadSupported() ? (
                    <ActionRow
                      icon={<Ionicons name="download-outline" size={21} color={palette.text} />}
                      label="下载"
                      busy={busyKey === 'probe-quality'}
                      onPress={() => handleOpenDownload(track)}
                    />
                  ) : null}
                  {removal ? (
                    <ActionRow
                      icon={<Ionicons name="remove-circle-outline" size={21} color={palette.danger} />}
                      label="从歌单移除"
                      danger
                      busy={busyKey === 'remove'}
                      onPress={() => handleRemove(track, removal)}
                    />
                  ) : null}
                </YStack>
              ) : view === 'download' ? (
                <YStack paddingTop={6} height={SHEET_CONTENT_HEIGHT}>
                  {availableQualities === null ? (
                    <YStack alignItems="center" paddingVertical={26} gap={10}>
                      <Spinner color={palette.accent} />
                      <Text color={palette.textTertiary} fontSize={12.5}>
                        正在检测可用音质…
                      </Text>
                    </YStack>
                  ) : (
                    <>
                      <Text
                        color={palette.textTertiary}
                        fontSize={12.5}
                        paddingHorizontal={14}
                        paddingBottom={8}>
                        {availableQualities.length
                          ? '这首歌当前可下载的音质'
                          : '未能检测到可用音质，展示全部档位（不可用时会自动降级）'}
                      </Text>
                      <ScrollView showsVerticalScrollIndicator={false} style={styles.pickList}>
                        {(availableQualities.length
                          ? availableQualities
                          : [...AUDIO_QUALITIES].reverse()
                        ).map((item) => (
                          <XStack
                            key={item}
                            alignItems="center"
                            gap={12}
                            height={ACTION_ROW_HEIGHT}
                            paddingHorizontal={14}
                            borderRadius={14}
                            opacity={busyKey === `download-${item}` ? 0.55 : 1}
                            transition="quickest"
                            pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
                            onPress={() => handleDownload(track, item)}>
                            <Text flex={1} color={palette.text} fontSize={15} fontWeight="600">
                              {AUDIO_QUALITY_LABELS[item]}
                            </Text>
                            <XStack
                              width={ACTION_ICON_SIZE}
                              height={ACTION_ICON_SIZE}
                              alignItems="center"
                              justifyContent="center">
                              {busyKey === `download-${item}` ? (
                                <Spinner size="small" color={palette.accent} />
                              ) : (
                                <Ionicons
                                  name="download-outline"
                                  size={18}
                                  color={palette.textTertiary}
                                />
                              )}
                            </XStack>
                          </XStack>
                        ))}
                      </ScrollView>
                    </>
                  )}
                </YStack>
              ) : (
                <YStack paddingTop={6} height={SHEET_CONTENT_HEIGHT}>
                  <ActionRow
                    icon={<Ionicons name="add-circle-outline" size={21} color={palette.accent} />}
                    label="新建歌单"
                    active
                    onPress={() => setCreateOpen(true)}
                  />
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.pickList}>
                    {library.status === 'loading' && !myPlaylists.length ? (
                      <YStack alignItems="center" paddingVertical={26}>
                        <Spinner color={palette.accent} />
                      </YStack>
                    ) : myPlaylists.length ? (
                      myPlaylists.map((playlist) => (
                        <XStack
                          key={playlist.listid}
                          alignItems="center"
                          gap={12}
                          paddingVertical={9}
                          paddingHorizontal={14}
                          borderRadius={14}
                          opacity={busyKey === `add-${playlist.listid}` ? 0.55 : 1}
                          transition="quickest"
                          pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
                          onPress={() => handleAddTo(playlist, track)}>
                          <Artwork uri={playlist.coverUrl} size={40} radius={10} />
                          <YStack flex={1} gap={2}>
                            <Text color={palette.text} fontSize={14.5} fontWeight="600" numberOfLines={1}>
                              {playlist.name}
                            </Text>
                            <Text color={palette.textTertiary} fontSize={11.5}>
                              {playlist.count} 首
                            </Text>
                          </YStack>
                          {busyKey === `add-${playlist.listid}` ? (
                            <Spinner size="small" color={palette.accent} />
                          ) : (
                            <Ionicons name="add" size={18} color={palette.textTertiary} />
                          )}
                        </XStack>
                      ))
                    ) : (
                      <YStack alignItems="center" paddingVertical={26} gap={6}>
                        <Text color={palette.textTertiary} fontSize={13}>
                          还没有自己的歌单
                        </Text>
                      </YStack>
                    )}
                  </ScrollView>
                </YStack>
              )}
              </YStack>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <CreatePlaylistSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(listid, name) => {
          if (!track) {
            return;
          }
          const created: LibraryPlaylist = {
            listid,
            gid: '',
            name,
            coverUrl: null,
            count: 0,
            isMine: true,
            isLike: false,
          };
          void run(`add-${listid}`, async () => {
            await libraryActions.addToPlaylist(created, [track]);
            showToast(`已收藏到「${name}」`);
            onOpenChange(false);
          });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  pickList: {
    // 用 flex 填满「固定高度的内容区」剩余空间，而不是自己定 maxHeight ——
    // 否则列表高度会随条目数变化，又把 Sheet 的高度带跑。
    flex: 1,
  },
  /** 底部面板的遮罩层：点击空白处关闭。 */
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 8, 14, 0.42)',
  },
  /** 底部面板本体：高度由调用处显式给定，不做任何内容测量。 */
  panel: {
    width: '100%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
});
