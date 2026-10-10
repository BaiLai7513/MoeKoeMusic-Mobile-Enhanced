import { NativeModules, Platform } from 'react-native';

/**
 * 「后台能不能活下去」相关的系统能力封装（原生实现在 `native/android/player/SystemModule.kt`）。
 *
 * 背景：`问题.TXT` 里「容易没后台」的核心成因是 Android 的电池优化 ——
 * 长时间后台运行的应用会被系统冻结甚至清理，音乐播放首当其冲。
 * manifest 里声明 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 只是**允许申请**，
 * 真正加入白名单必须由用户在系统授权页确认，所以需要这里主动引导。
 *
 * 所有方法都做了兜底：非 Android、模块不可用、调用出错一律返回安全值，**绝不抛错**。
 */

type MoeKoeSystemModule = {
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
};

const native = NativeModules.MoeKoeSystem as MoeKoeSystemModule | undefined;

/** 当前平台是否支持电池优化白名单查询（用于决定设置项要不要显示）。 */
export function isBatteryOptimizationSupported(): boolean {
  return Platform.OS === 'android' && Boolean(native);
}

/**
 * 是否已加入「忽略电池优化」白名单。
 * 不可用或出错时返回 true，避免在拿不到结果时反复骚扰用户。
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!native) {
    return true;
  }
  try {
    return await native.isIgnoringBatteryOptimizations();
  } catch (error) {
    console.warn('[system] 查询电池优化白名单失败:', error);
    return true;
  }
}

/**
 * 拉起系统授权页。
 * 返回 true 表示打开的是标准授权页；false 表示国产 ROM 拦截后回退到了应用详情页
 * （此时需要提示用户去「电池 / 省电」里手动设置）。
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return await native.requestIgnoreBatteryOptimizations();
  } catch (error) {
    console.warn('[system] 拉起电池优化授权页失败:', error);
    return false;
  }
}
