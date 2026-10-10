import type { ComponentProps } from 'react';
import { Text, XStack } from 'tamagui';

import { usePalette } from '@/hooks/use-palette';

/** 直接用 Tamagui Text 的 color 类型，避免把它拓宽成 string 后不可赋值。 */
type TouchTextColor = ComponentProps<typeof Text>['color'];

/**
 * 带**足够触摸区域**的文字按钮。
 *
 * 为什么需要它：直接把 `onPress` 挂在裸 `<Text>` 上时，触摸区域就是字形本身。
 * 中文短词（如「重试」「返回」）在 13px 字号下只有约 40×20 像素，
 * 远小于 Android 建议的 48dp（≈132px）最小触摸目标 ——
 * 结果是点偏一点就完全没反应，用户会觉得「时灵时不灵」。
 *
 * 统一放到 44 高、横向留出内边距，并用负 margin 抵消视觉偏移，
 * 这样热区变大而排版位置不变。
 */
export function TouchText({
  children,
  onPress,
  color,
  fontSize = 13.5,
  fontWeight = '600',
  /** 需要更紧凑的排版（如居中在窄容器里）时传 false 关闭负边距。 */
  offsetForAlignment = true,
}: {
  children: string;
  onPress: () => void;
  color?: TouchTextColor;
  fontSize?: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800';
  offsetForAlignment?: boolean;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      justifyContent="center"
      height={44}
      paddingHorizontal={12}
      marginHorizontal={offsetForAlignment ? -12 : 0}
      borderRadius={16}
      transition="quickest"
      pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
      onPress={onPress}>
      <Text color={color ?? palette.accent} fontSize={fontSize} fontWeight={fontWeight}>
        {children}
      </Text>
    </XStack>
  );
}
