/**
 * 设置页的「运行日志」区块。
 *
 * 位置就是原来「听歌时长」区块的位置（播放 / 通用 之间）。这里做成独立组件而不是
 * 塞进 settings.tsx：日志的统计、导出、清空各自有异步状态，混在设置页里会让那个
 * 已经很长的函数更难读。
 *
 * 形态选择：三个按钮全部是**卡片内整行**（高 48），而不是 Tamagui 的 Sheet ——
 * 项目在 `snapPointsMode="fit"` 上反复踩过闪烁坑，且「查看今日」用独立路由页
 * （`/logs`）天然支持滚到底部、也便于以后按日期查看。
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { SectionHeader } from '@/components/ui/section-header';
import { showToast } from '@/components/ui/toast';
import { usePalette } from '@/hooks/use-palette';

import { flushLogsNow } from './capture';
import { exportLogs } from './export';
import { formatBytes } from './format';
import { LOG_RETENTION_DAYS, deleteAllLogs } from './storage';
import { refreshLogsStats, useLogsStats } from './store';

/** 行高 48：≥ Android 建议的 48dp 最小触摸目标（需求要求 ≥44）。 */
const ROW_HEIGHT = 48;

function LogRow({
  label,
  value,
  icon,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      height={ROW_HEIGHT}
      paddingHorizontal={14}
      gap={10}
      opacity={disabled ? 0.45 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? label : undefined}
      transition="quickest"
      pressStyle={
        onPress && !disabled ? { opacity: 0.65, backgroundColor: palette.cardAlt } : undefined
      }
      onPress={disabled ? undefined : onPress}>
      <Text flex={1} color={danger ? palette.danger : palette.text} fontSize={14.5} fontWeight={500}>
        {label}
      </Text>
      {value ? (
        <Text color={palette.textTertiary} fontSize={13}>
          {value}
        </Text>
      ) : null}
      {icon ? <Ionicons name={icon} size={18} color={palette.textTertiary} /> : null}
    </XStack>
  );
}

function Divider() {
  const palette = usePalette();
  return (
    <YStack height={StyleSheet.hairlineWidth} backgroundColor={palette.border} marginHorizontal={14} />
  );
}

export function LogSettingsSection() {
  const palette = usePalette();
  const router = useRouter();
  const stats = useLogsStats();
  const [exporting, setExporting] = useState(false);

  // 挂载后才知道真实占用；首帧先不显示数字，避免闪一下「0 B」。
  useEffect(() => {
    refreshLogsStats();
  }, []);

  const sizeLabel = stats.loaded ? formatBytes(stats.totalBytes) : '统计中…';
  const countLabel = stats.loaded ? `${stats.fileCount} 个文件` : '';

  async function handleExport() {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const result = await exportLogs();
      if (result.ok) {
        refreshLogsStats();
        if (result.fallback) {
          // 没能拉起目录选择器：文件在 App 私有目录里，必须把完整路径告诉用户，
          // 否则「已保存」等于什么都没说（他在文件管理器里找不到）。
          Alert.alert('已保存到应用目录', `${result.name}\n\n${result.uri}`);
          return;
        }
        showToast(`已保存：${result.name}`);
        return;
      }
      if (result.reason === 'cancelled') {
        // 用户自己在目录选择器里按了返回：这不是错误，静默退出
        return;
      }
      if (result.reason === 'empty') {
        Alert.alert('暂无日志', '还没有可导出的运行日志，正常使用一会儿再试。');
        return;
      }
      Alert.alert('导出失败', `写入文档失败。${result.error ?? ''}`);
    } finally {
      setExporting(false);
    }
  }

  function handleClear() {
    const detail = stats.loaded
      ? `将删除本机全部运行日志（${stats.fileCount} 个文件，${formatBytes(stats.totalBytes)}），且无法恢复。`
      : '将删除本机全部运行日志，且无法恢复。';

    Alert.alert('清空日志', detail, [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          // 先刷盘再删：否则缓冲里那几十行会在删完之后被写回来，用户会觉得「没删干净」。
          flushLogsNow();
          const removed = deleteAllLogs();
          refreshLogsStats();
          showToast(removed > 0 ? `已清空 ${removed} 个日志文件` : '没有可清空的日志');
        },
      },
    ]);
  }

  return (
    <YStack gap={10}>
      <SectionHeader title="运行日志" />
      <YStack
        backgroundColor={palette.card}
        borderRadius={20}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}
        paddingVertical={4}
        overflow="hidden">
        <XStack alignItems="center" minHeight={ROW_HEIGHT} paddingHorizontal={14} gap={10}>
          <YStack flex={1} gap={2}>
            <Text color={palette.text} fontSize={14.5} fontWeight={500}>
              日志占用
            </Text>
            <Text color={palette.textTertiary} fontSize={11.5}>
              {countLabel ? `${countLabel} · 保留 ${LOG_RETENTION_DAYS} 天` : '读取中…'}
            </Text>
          </YStack>
          <Text color={palette.textSecondary} fontSize={13} fontWeight={600}>
            {sizeLabel}
          </Text>
        </XStack>
        <Divider />
        <LogRow
          label="导出到文件夹"
          value={exporting ? '选择目录中…' : undefined}
          icon="share-outline"
          disabled={exporting}
          onPress={() => void handleExport()}
        />
        <Divider />
        <LogRow label="查看今日" icon="document-text-outline" onPress={() => router.push('/logs')} />
        <Divider />
        <LogRow label="清空日志" icon="trash-outline" danger onPress={handleClear} />
      </YStack>
    </YStack>
  );
}
