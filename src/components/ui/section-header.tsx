import { Text, XStack, YStack } from 'tamagui';

import { usePalette } from '@/hooks/use-palette';

/**
 * 区块标题右侧动作按钮的触摸高度。
 * 44 接近 Android 建议的 48dp 最小触摸目标，同时不会把标题行撑得过高。
 */
const ACTION_TOUCH_HEIGHT = 44;

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const palette = usePalette();

  return (
    <XStack alignItems="flex-end" justifyContent="space-between" gap="$3">
      <YStack flex={1} gap={2}>
        <Text color={palette.text} fontSize={20} fontWeight="700" letterSpacing={0.2}>
          {title}
        </Text>
        {subtitle ? (
          <Text color={palette.textTertiary} fontSize={12.5}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {actionLabel && onAction ? (
        /*
         * 必须用带尺寸的容器，不能直接把 onPress 挂在 <Text> 上。
         *
         * 裸 Text 的触摸区域就是字形本身：「播放全部」13.5px 字号实测约 54×26 像素，
         * 远小于 Android 建议的 48dp（≈132px）最小触摸目标 ——
         * 结果就是点偏十几个像素完全没反应，用户会觉得「时灵时不灵」。
         * 负 margin 是为了让放大后的热区在视觉上仍然贴边。
         */
        <XStack
          alignItems="center"
          justifyContent="center"
          height={ACTION_TOUCH_HEIGHT}
          paddingHorizontal={12}
          marginRight={-12}
          marginBottom={-Math.round((ACTION_TOUCH_HEIGHT - 26) / 2)}
          borderRadius={16}
          transition="quickest"
          pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
          onPress={onAction}>
          <Text color={palette.accent} fontSize={13.5} fontWeight="600">
            {actionLabel}
          </Text>
        </XStack>
      ) : null}
    </XStack>
  );
}
