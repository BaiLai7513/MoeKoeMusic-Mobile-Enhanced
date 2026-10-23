/**
 * 倍速档位定义（与桌面版 MoeKoeMusic 一致）。
 *
 * 刻意只给这 6 档，不做「任意数值」：ExoPlayer 的变速会连带做音调校正，
 * 非整档的值（例如 1.13×）听起来会有一种说不清的「跑调感」，
 * 而用户真正会用的就这几个 —— 桌面版验证过的档位没必要在移动端另造一套。
 *
 * 升序排列：UI 直接按数组顺序铺开，也方便判断「是否原速」以外的展示逻辑。
 */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** 默认原速。设置里没存过、或存的值不合法时都回落到它。 */
export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

export function isPlaybackRate(value: unknown): value is PlaybackRate {
  return typeof value === 'number' && (PLAYBACK_RATES as readonly number[]).includes(value);
}

/**
 * 展示成 `1.0×` / `0.75×`。
 *
 * 整数档也补一位小数：`1×` 和 `1.25×` 并排时数字位数不一致，看着不像同一族档位；
 * 统一成 `1.0×` 后整排宽高一致，也不会在切换档位时抖动。
 */
export function formatPlaybackRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : rate}×`;
}
