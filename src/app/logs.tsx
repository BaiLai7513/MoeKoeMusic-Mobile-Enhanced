import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { flushLogsNow } from '@/features/logs/capture';
import { formatBytes } from '@/features/logs/format';
import { readTodayLog, type TodayLog } from '@/features/logs/storage';
import { usePalette } from '@/hooks/use-palette';

/**
 * 「查看今日」的独立路由页。
 *
 * 为什么不做成 Modal/Sheet：需求里明确禁止 Tamagui `Sheet snapPointsMode="fit"`（闪烁坑），
 * 而原生 Modal 要显式定高、还得自己处理滚动与键盘；独立页反而最短路径 ——
 * `FlatList/ScrollView` 天然可滚，进页自动贴底，返回键行为也和别的页面一致。
 *
 * 只读：这里没有任何写入路径，`flushLogsNow()` 只是把内存缓冲落盘，好让「刚发生的日志」
 * 也能被看到。
 */

/** 页面最多渲染多少字符。整天的日志可能有几 MB，全量塞进一个 Text 会明显掉帧。 */
const DISPLAY_MAX_CHARS = 120 * 1024;

export default function LogsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /** 只在「首次拿到内容」时贴底；用户自己往上翻之后不该再被拽回去。 */
  const pendingAutoScroll = useRef(true);
  const [log, setLog] = useState<TodayLog | null>(null);
  const [loading, setLoading] = useState(true);
  /** 刷新用：自增触发下面那个 effect 重跑，避免在 effect 里同步 setState。 */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    pendingAutoScroll.current = true;
    // 先把缓冲刷下去，否则「刚才那条」永远差一截。
    flushLogsNow();
    // setState 放在 then 里（而不是 effect 体里同步调用）：遵守 react-hooks/set-state-in-effect，
    // 也顺手处理了「读文件期间就退出页面」的竞态。
    void readTodayLog().then((next) => {
      if (!alive) {
        return;
      }
      setLog(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  function reload() {
    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  const display = useMemo(() => {
    const text = log?.text ?? '';
    if (text.length <= DISPLAY_MAX_CHARS) {
      return text.trimEnd();
    }

    const tail = text.slice(text.length - DISPLAY_MAX_CHARS);
    // 从第一个换行后开始，别让首行是半截。
    const lineStart = tail.indexOf('\n');
    const body = lineStart >= 0 ? tail.slice(lineStart + 1) : tail;
    return `……（内容较长，仅显示最近 ${formatBytes(DISPLAY_MAX_CHARS)}，前面 ${text.length - DISPLAY_MAX_CHARS} 字符已省略）\n${body.trimEnd()}`;
  }, [log]);

  const meta = log
    ? `${log.dayKey} · ${log.lines} 行 · ${formatBytes(log.bytes)}`
    : '读取中…';

  return (
    <YStack flex={1} backgroundColor={palette.background} paddingTop={insets.top + 10}>
      <XStack alignItems="center" gap={12} paddingHorizontal={16} paddingBottom={10}>
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
          pressStyle={{ opacity: 0.7, scale: 0.96 }}
          onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={palette.text} />
        </XStack>
        <YStack flex={1} gap={2}>
          <Text color={palette.text} fontSize={17} fontWeight="700" letterSpacing={0.2}>
            运行日志
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5}>
            {meta}
          </Text>
        </YStack>
        <XStack
          accessibilityLabel="刷新日志"
          accessibilityRole="button"
          width={44}
          height={44}
          borderRadius={22}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ opacity: 0.65, scale: 0.96 }}
          onPress={reload}>
          <Ionicons name="refresh-outline" size={20} color={palette.text} />
        </XStack>
      </XStack>

      {loading && !log ? (
        <View flex={1} alignItems="center" justifyContent="center" gap={10}>
          <Spinner size="small" color={palette.accent} />
          <Text color={palette.textTertiary} fontSize={13}>
            正在读取今日日志…
          </Text>
        </View>
      ) : null}

      {!loading && log && !display ? (
        <View flex={1} alignItems="center" justifyContent="center" gap={10} padding={24}>
          <Ionicons name="document-text-outline" size={40} color={palette.textTertiary} />
          <Text color={palette.textTertiary} fontSize={13.5} textAlign="center">
            今天还没有日志
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5} textAlign="center" lineHeight={16}>
            正常使用 App 一会儿后再回来刷新即可。
          </Text>
        </View>
      ) : null}

      {display ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
          }}
          onContentSizeChange={() => {
            if (!pendingAutoScroll.current) {
              return;
            }
            pendingAutoScroll.current = false;
            scrollRef.current?.scrollToEnd({ animated: false });
          }}>
          <YStack
            backgroundColor={palette.card}
            borderRadius={16}
            borderWidth={StyleSheet.hairlineWidth}
            borderColor={palette.border}
            padding={12}>
            <RNText
              selectable
              // 等宽字体：日志是按列对齐的，比例字体下缩进和时间戳全乱。
              // 这里刻意用 RN 的 Text 而不是 Tamagui Text —— 后者的 fontFamily 只接受主题里的字体 token，
              // 想用系统等宽字体只能绕开它的类型约束。
              style={[styles.logText, { color: palette.textSecondary }]}>
              {display}
            </RNText>
          </YStack>
        </ScrollView>
      ) : null}
    </YStack>
  );
}

const styles = StyleSheet.create({
  logText: {
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
  },
});
