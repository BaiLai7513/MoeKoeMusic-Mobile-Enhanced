import { StyleSheet, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { SectionHeader } from '@/components/ui/section-header';
import { usePalette } from '@/hooks/use-palette';

import { isListenSyncSupported } from './listen-report';
import { setListenSyncEnabled, useListenSyncEnabled } from './listen-report-state';

/**
 * 设置页的「听歌时长」区块。
 *
 * ## 为什么默认关闭，且必须由用户手动打开
 *
 * 上报要求 `d_sec`（累计秒，须 ≥ 服务端值）与 `diff_sec`（本次新增）**与真实听歌节奏自洽**。
 * 不自洽的报文会被拒收，反复发还会被按请求节奏判成脚本（错误码 20028 —— 本项目在 VIP
 * 领取链路上踩过同一个坑）。这个功能对平台方是「成长值记账」，宁可默认不参与，
 * 也不要替用户默默打开一个可能把他账号推到风控里的开关。
 *
 * ## 为什么接口不存在时整块不渲染
 *
 * 开关存在的前提是 API 生成代码里有 `user_grade_info`（等级同步全靠它，
 * 不用逐首流水的 `user_listen_report` —— 原因见 `listen-report.ts` 文件头）。
 * 缺接口时显示一个「打开了也什么都不发生」的开关，比不显示更糟 —— 用户会以为上报坏了。
 */
export function ListenSyncSettingSection() {
  const palette = usePalette();
  const enabled = useListenSyncEnabled();

  if (!isListenSyncSupported()) {
    return null;
  }

  return (
    <YStack gap={10}>
      <SectionHeader title="听歌时长" />
      <YStack
        backgroundColor={palette.card}
        borderRadius={20}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}
        paddingVertical={4}
        overflow="hidden">
        <XStack alignItems="center" minHeight={56} paddingHorizontal={14} paddingVertical={10} gap={12}>
          <YStack flex={1} gap={3}>
            <Text color={palette.text} fontSize={14.5} fontWeight={500}>
              同步到酷狗账号
            </Text>
            <Text color={palette.textTertiary} fontSize={11.5} lineHeight={15}>
              按真实播放时长累计听歌等级；关闭时不发任何请求
            </Text>
          </YStack>
          <Switch
            value={enabled}
            onValueChange={setListenSyncEnabled}
            trackColor={{ false: palette.border, true: palette.accent }}
            thumbColor={palette.onAccent}
            ios_backgroundColor={palette.border}
          />
        </XStack>
      </YStack>
      <Text color={palette.textTertiary} fontSize={11.5} paddingHorizontal={4} lineHeight={16}>
        默认关闭。开启后每首播满 60 秒才上报一次，失败不重试；上报节奏与真实听歌不一致时，
        平台可能拒绝记账。
      </Text>
    </YStack>
  );
}
