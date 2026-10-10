import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'moekoe.settings.appearance';

export type StoredAppearance = {
  themeMode?: unknown;
  accentId?: unknown;
  /** 默认播放音质（AudioQuality 字符串）。存成 unknown 由上层做校验。 */
  quality?: unknown;
};

export async function readStoredAppearance(): Promise<StoredAppearance | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredAppearance) : null;
  } catch {
    return null;
  }
}

export async function writeStoredAppearance(value: {
  themeMode: string;
  accentId: string;
  quality: string;
}): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage write failures and keep runtime state usable.
  }
}
