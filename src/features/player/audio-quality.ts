/**
 * 音质档位定义（与原版酷狗 / 桌面端 MoeKoeMusic 保持一致）。
 *
 * 数组是**升序**的：越靠后音质越高，同时对账号特权（VIP / SVIP）的要求也越高。
 * 「依次降级」就是从这个数组里取「目标档位及其之前的所有档位」再倒序尝试。
 */

export const AUDIO_QUALITIES = [
  '128',
  '320',
  'flac',
  'high',
  'viper_atmos',
  'viper_clear',
  'viper_tape',
] as const;

export type AudioQuality = (typeof AUDIO_QUALITIES)[number];

/** 展示名，与桌面端一致。 */
export const AUDIO_QUALITY_LABELS: Record<AudioQuality, string> = {
  '128': '标准',
  '320': '高品',
  flac: 'FLAC',
  high: 'Hi-Res',
  viper_atmos: '全景声',
  viper_clear: '超清',
  viper_tape: '母带',
};

/**
 * 默认音质。
 *
 * 取「高品(320)」而不是无损：无损及以上需要 VIP 特权，
 * 默认值应当对未开通 VIP 的账号也可用；需要更高音质的用户在设置里自行上调。
 */
export const DEFAULT_AUDIO_QUALITY: AudioQuality = '320';

export function isAudioQuality(value: unknown): value is AudioQuality {
  return typeof value === 'string' && (AUDIO_QUALITIES as readonly string[]).includes(value);
}

/**
 * 生成降级链：`目标 → 目标低一档 → … → 128`。
 *
 * 例：目标 `flac` → `['flac', '320', '128']`。
 * 播放时按这个顺序逐档请求，取第一个真正拿到地址的档位 ——
 * 这既解决了「某些歌某一档拿不到就整个播不了」，也天然实现了「无则依次降级」。
 */
export function qualityFallbackChain(target: AudioQuality): AudioQuality[] {
  const index = AUDIO_QUALITIES.indexOf(target);
  if (index < 0) {
    return [DEFAULT_AUDIO_QUALITY];
  }

  return AUDIO_QUALITIES.slice(0, index + 1).reverse() as AudioQuality[];
}
