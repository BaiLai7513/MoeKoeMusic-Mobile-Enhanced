import * as SecureStore from 'expo-secure-store';

/**
 * 离线缓存：把「上次成功加载的数据」存下来，网络不可用时继续展示。
 *
 * 背景：本项目所有数据都来自在线接口，没有本地数据库。
 * 一旦断网，页面只能显示错误态 —— 用户看到的是「以前能加载的内容全没了」。
 * 这里做一个极简的「最后一次成功结果」缓存，够覆盖首页与个人中心这类首屏。
 *
 * 存储选 SecureStore 的原因：项目已经在用它（设置、登录态），无需再引入 AsyncStorage；
 * 本项目只发布 Android，没有 iOS 上 SecureStore 2KB 的限制问题。
 */

const PREFIX = 'moekoe.cache.';

/** 读取缓存；不存在、解析失败、或超过 [maxAgeMs] 都返回 null。 */
export async function readCache<T>(key: string, maxAgeMs?: number): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(`${PREFIX}${key}`);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const entry = parsed as { at?: unknown; value?: unknown };
    const at = typeof entry.at === 'number' ? entry.at : 0;
    if (maxAgeMs && Date.now() - at > maxAgeMs) {
      return null;
    }

    return (entry.value ?? null) as T | null;
  } catch {
    return null;
  }
}

/** 写入缓存。失败只影响离线可用性，绝不该打断正常流程。 */
export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      `${PREFIX}${key}`,
      JSON.stringify({ at: Date.now(), value })
    );
  } catch {
    // 缓存写不进去不影响在线使用
  }
}
