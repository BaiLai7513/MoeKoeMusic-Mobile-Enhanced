import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import { showToast } from '@/components/ui/toast';
import { TouchText } from '@/components/ui/touch-text';
import { downloadTracks, isDownloadSupported } from '@/features/download/downloader';
import { AUDIO_QUALITIES, AUDIO_QUALITY_LABELS, type AudioQuality } from '@/features/player/audio-quality';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';

/**
 * 列表页的多选操作条（底部浮层）。
 *
 * 只负责「全选 / 退出 / 批量下载」，以及可选的一项「移除」；
 * 勾选状态由页面的 [useBatchSelect] 持有，这样列表虚拟化、分页追加都不会影响已选集合。
 *
 * 「移除」是可选动作：[onRemove] 只在能移除歌曲的歌单页传（自己的歌单/「我喜欢」），
 * 其他页面（搜索、收藏合辑）不传，按钮就不出现，布局与原来完全一致。
 */
export function BatchDownloadBar({
  tracks,
  allTracks,
  bottomInset,
  onSelectAll,
  onCancel,
  onRemove,
  removing = false,
}: {
  /** 当前勾选的曲目（按列表顺序）。 */
  tracks: PlayerTrack[];
  /** 列表里已加载的全部曲目，用于「全选」。 */
  allTracks: PlayerTrack[];
  bottomInset: number;
  onSelectAll: () => void;
  onCancel: () => void;
  /** 触发批量移除（内部会做二次确认）；不传则不显示「移除」。 */
  onRemove?: () => void;
  /** 批量移除进行中：显示 spinner 并锁住其他动作，防止重复提交。 */
  removing?: boolean;
}) {
  const palette = usePalette();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const allSelected = tracks.length > 0 && tracks.length >= allTracks.length;
  // 下载/移除互斥：任何一个在跑时，另一个和「退出/全选」都不能点
  const locked = busy || removing;
  const downloadSupported = isDownloadSupported();

  async function startBatch(quality: AudioQuality) {
    if (locked || !tracks.length) {
      return;
    }

    setBusy(true);
    setPickerOpen(false);
    setProgress({ done: 0, total: tracks.length });

    try {
      const result = await downloadTracks(tracks, quality, ({ done, total }) => {
        setProgress({ done, total });
      });

      // 批量只用**一条**汇总提示，避免逐首弹 Toast 刷屏（也符合「少一些提示」的诉求）
      showToast(
        result.failed
          ? `${result.ok} 首已开始下载，${result.failed} 首失败`
          : `${result.ok} 首已开始下载（${AUDIO_QUALITY_LABELS[quality]}，逐首自动匹配）`
      );
      onCancel();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量下载失败');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <YStack
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        paddingHorizontal={16}
        paddingBottom={Math.max(bottomInset, 12)}
        paddingTop={10}
        backgroundColor={palette.barSurface}
        borderTopWidth={StyleSheet.hairlineWidth}
        borderTopColor={palette.border}>
        <XStack alignItems="center" gap={onRemove ? 8 : 12}>
          <YStack flex={1} gap={2}>
            <Text color={palette.text} fontSize={14.5} fontWeight="700" numberOfLines={1}>
              {removing
                ? `正在移除 ${tracks.length} 首…`
                : busy && progress
                  ? `下载中 ${progress.done}/${progress.total}`
                  : `已选 ${tracks.length} 首`}
            </Text>
            <TouchText
              onPress={() => {
                if (!locked) {
                  onSelectAll();
                }
              }}
              fontSize={12}
              offsetForAlignment={false}>
              {allSelected ? '取消全选' : `全选（${allTracks.length}）`}
            </TouchText>
          </YStack>

          <XStack
            alignItems="center"
            justifyContent="center"
            height={38}
            // 多出「移除」时把退出/下载的内边距收一点，保证 360dp 宽的屏上
            // 左侧「已选 N 首 / 全选」仍有一行放得下的空间；其他页面尺寸不变
            paddingHorizontal={onRemove ? 12 : 16}
            borderRadius={19}
            backgroundColor={palette.cardAlt}
            opacity={locked ? 0.5 : 1}
            transition="quickest"
            pressStyle={{ opacity: 0.7 }}
            onPress={locked ? undefined : onCancel}>
            <Text color={palette.textSecondary} fontSize={14} fontWeight="600">
              退出
            </Text>
          </XStack>

          {/*
           * 「移除」和「下载」并列，但用危险色区分：这是不可撤销的批量操作。
           * 只有能移除歌曲的页面才传 onRemove，其他页面不会多出这个按钮。
           */}
          {onRemove ? (
            <XStack
              alignItems="center"
              justifyContent="center"
              gap={5}
              height={38}
              paddingHorizontal={12}
              borderRadius={19}
              backgroundColor={palette.dangerSoft}
              opacity={tracks.length && !locked ? 1 : 0.5}
              transition="quickest"
              pressStyle={{ opacity: 0.75 }}
              onPress={() => {
                if (!tracks.length || locked) {
                  return;
                }
                onRemove();
              }}>
              {removing ? (
                <Spinner size="small" color={palette.danger} />
              ) : (
                <Ionicons name="trash-outline" size={16} color={palette.danger} />
              )}
              <Text color={palette.danger} fontSize={14} fontWeight="700">
                移除
              </Text>
            </XStack>
          ) : null}

          {/* 没有下载能力（非 Android / 原生模块缺失）时不摆一个点了必然失败的按钮；
              此时批量条仍可只用于「移除」 */}
          {downloadSupported ? (
            <XStack
              alignItems="center"
              justifyContent="center"
              gap={6}
              height={38}
              paddingHorizontal={onRemove ? 14 : 18}
              borderRadius={19}
              backgroundColor={palette.accent}
              opacity={tracks.length && !locked ? 1 : 0.5}
              transition="quickest"
              pressStyle={{ opacity: 0.85 }}
              onPress={() => {
                if (!tracks.length || locked) {
                  return;
                }
                setPickerOpen(true);
              }}>
              {busy ? (
                <Spinner size="small" color={palette.onAccent} />
              ) : (
                <Ionicons name="download-outline" size={17} color={palette.onAccent} />
              )}
              <Text color={palette.onAccent} fontSize={14} fontWeight="700">
                下载
              </Text>
            </XStack>
          ) : null}
        </XStack>
      </YStack>

      <Modal
        visible={pickerOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheetWrap} onPress={(event) => event.stopPropagation()}>
            <YStack
              backgroundColor={palette.card}
              borderRadius={22}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              overflow="hidden"
              paddingVertical={8}>
              <Text
                color={palette.text}
                fontSize={17}
                fontWeight="800"
                textAlign="center"
                paddingVertical={10}>
                批量下载音质
              </Text>
              <Text
                color={palette.textTertiary}
                fontSize={12}
                textAlign="center"
                paddingHorizontal={20}
                paddingBottom={10}
                lineHeight={17}>
                这是音质上限。每首歌会自动匹配它自己可用的最高音质，不会超过所选档位
                —— 所以不会逐首提示降级。
              </Text>
              {[...AUDIO_QUALITIES].reverse().map((item) => (
                <XStack
                  key={item}
                  alignItems="center"
                  height={50}
                  paddingHorizontal={18}
                  transition="quickest"
                  pressStyle={{ opacity: 0.65, backgroundColor: palette.cardAlt }}
                  onPress={() => void startBatch(item)}>
                  <Text flex={1} color={palette.text} fontSize={15} fontWeight="600">
                    {AUDIO_QUALITY_LABELS[item]}
                  </Text>
                  <Ionicons name="download-outline" size={18} color={palette.textTertiary} />
                </XStack>
              ))}
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 460,
  },
});
