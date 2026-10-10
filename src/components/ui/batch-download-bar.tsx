import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import { showToast } from '@/components/ui/toast';
import { TouchText } from '@/components/ui/touch-text';
import { downloadTracks } from '@/features/download/downloader';
import { AUDIO_QUALITIES, AUDIO_QUALITY_LABELS, type AudioQuality } from '@/features/player/audio-quality';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';

/**
 * 列表页的多选操作条（底部浮层）。
 *
 * 只负责「全选 / 退出 / 触发批量下载」；勾选状态由页面的 [useBatchSelect] 持有，
 * 这样列表虚拟化、分页追加都不会影响已选集合。
 */
export function BatchDownloadBar({
  tracks,
  allTracks,
  bottomInset,
  onSelectAll,
  onCancel,
}: {
  /** 当前勾选的曲目（按列表顺序）。 */
  tracks: PlayerTrack[];
  /** 列表里已加载的全部曲目，用于「全选」。 */
  allTracks: PlayerTrack[];
  bottomInset: number;
  onSelectAll: () => void;
  onCancel: () => void;
}) {
  const palette = usePalette();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const allSelected = tracks.length > 0 && tracks.length >= allTracks.length;

  async function startBatch(quality: AudioQuality) {
    if (busy || !tracks.length) {
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
        <XStack alignItems="center" gap={12}>
          <YStack flex={1} gap={2}>
            <Text color={palette.text} fontSize={14.5} fontWeight="700">
              {busy && progress
                ? `下载中 ${progress.done}/${progress.total}`
                : `已选 ${tracks.length} 首`}
            </Text>
            <TouchText
              onPress={() => {
                if (!busy) {
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
            paddingHorizontal={16}
            borderRadius={19}
            backgroundColor={palette.cardAlt}
            transition="quickest"
            pressStyle={{ opacity: 0.7 }}
            onPress={busy ? undefined : onCancel}>
            <Text color={palette.textSecondary} fontSize={14} fontWeight="600">
              退出
            </Text>
          </XStack>

          <XStack
            alignItems="center"
            justifyContent="center"
            gap={6}
            height={38}
            paddingHorizontal={18}
            borderRadius={19}
            backgroundColor={palette.accent}
            opacity={tracks.length && !busy ? 1 : 0.5}
            transition="quickest"
            pressStyle={{ opacity: 0.85 }}
            onPress={() => {
              if (!tracks.length || busy) {
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
