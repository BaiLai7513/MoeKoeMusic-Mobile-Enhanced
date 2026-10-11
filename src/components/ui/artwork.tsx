import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { usePalette } from '@/hooks/use-palette';

type ArtworkProps = {
  uri: string | null | undefined;
  /** 固定边长；不传则铺满父容器（正方形）。 */
  size?: number;
  radius?: number;
  circle?: boolean;
};

export function Artwork({ uri, size, radius = 14, circle = false }: ArtworkProps) {
  const palette = usePalette();
  const frameStyle = size
    ? { width: size, height: size, borderRadius: circle ? size / 2 : radius }
    : { width: '100%' as const, aspectRatio: 1, borderRadius: radius };
  const iconSize = size ? Math.max(16, Math.round(size * 0.38)) : 34;

  if (!uri) {
    return (
      <LinearGradient
        colors={[palette.placeholderStart, palette.placeholderEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.placeholder, frameStyle]}>
        <Ionicons name="musical-notes" size={iconSize} color={palette.textTertiary} />
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.frame, frameStyle, { backgroundColor: palette.cardAlt }]}>
      {/*
       * 占位层是"常驻垫底"，不是加载失败的兜底。
       * 原因：切歌瞬间新封面还没进到原生 view，而 expo-image 的淡入是从 alpha=0 开始的，
       * 中间那几帧如果底下什么都没有，就会看到一圈空白 —— 用户对这种现象的描述就是
       * 「卡片没渲染出来」。垫一层和"无封面"时同样的渐变+音符，任何时刻都有东西可看，
       * 也顺便让"正在换封面"和"没封面"两种状态长得一致。
       */}
      <LinearGradient
        colors={[palette.placeholderStart, palette.placeholderEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.placeholder, StyleSheet.absoluteFill]}>
        <Ionicons name="musical-notes" size={iconSize} color={palette.textTertiary} />
      </LinearGradient>
      <Image
        /*
         * key 必须跟着 uri 变：Android 上 expo-image 换 source 时如果间隔小于 transition
         * 时长，前一次淡出动画会被打断，而它的清理回调（57.0.1 里仍是 withEndAction，
         * 被 cancel 时不会执行）跑不到，内部那两个 Glide target 就回收不了；
         * 两个 target 都卡在 isUsed 之后，这个原生 image view 会一直画不出新图
         * （现象：控件还在、动画还在转，封面永远是空的，只有整个 view 重挂载才恢复）。
         * 官方记录：expo/expo#46703（修复 PR #49283 已进主线，但 57.0.1 尚未包含）。
         * 给原生 view 一个随 uri 变化的 key = 每次换封面都换一个干净的原生 view，
         * 坏状态最多影响一次切换、不会在长驻实例（比如迷你播放条）上累积；
         * transition 保留，新封面该淡入还是淡入。
         */
        key={uri}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        /*
         * 显式声明缓存策略，不要依赖默认值。
         * memory-disk = 内存 + 磁盘两级缓存，封面下载一次后断网仍能显示。
         * 专辑封面在列表里会大量重复出现，磁盘缓存对离线和流量都有明显收益。
         */
        cachePolicy="memory-disk"
        transition={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
