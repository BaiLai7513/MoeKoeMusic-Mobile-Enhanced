import { useSyncExternalStore } from 'react';

import { DEFAULT_ACCENT_ID, isAccentPresetId, type AccentPresetId } from '@/constants/accents';
import {
  DEFAULT_AUDIO_QUALITY,
  isAudioQuality,
  type AudioQuality,
} from '@/features/player/audio-quality';

import { readStoredAppearance, writeStoredAppearance } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export type SettingsState = {
  hydrated: boolean;
  themeMode: ThemeMode;
  accentId: AccentPresetId;
  /** 默认播放音质；拿不到该档位时会自动依次降级。 */
  quality: AudioQuality;
};

const INITIAL_SETTINGS_STATE: SettingsState = {
  hydrated: false,
  themeMode: 'system',
  accentId: DEFAULT_ACCENT_ID,
  quality: DEFAULT_AUDIO_QUALITY,
};

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const settingsStore = createStore(INITIAL_SETTINGS_STATE);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

let hydrationPromise: Promise<void> | null = null;

/** 在根布局模块作用域调用一次;UI 由 hydrated 门控,不存在与用户操作的竞态。 */
export function hydrateSettings(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readStoredAppearance();
      settingsStore.setState({
        themeMode: stored && isThemeMode(stored.themeMode) ? stored.themeMode : 'system',
        accentId: stored && isAccentPresetId(stored.accentId) ? stored.accentId : DEFAULT_ACCENT_ID,
        quality:
          stored && isAudioQuality(stored.quality) ? stored.quality : DEFAULT_AUDIO_QUALITY,
        hydrated: true,
      });
    })().catch(() => {
      settingsStore.setState({ hydrated: true });
    });
  }
  return hydrationPromise;
}

function persist() {
  const { themeMode, accentId, quality } = settingsStore.getState();
  void writeStoredAppearance({ themeMode, accentId, quality });
}

export const settingsActions = {
  setThemeMode(themeMode: ThemeMode) {
    settingsStore.setState({ themeMode });
    persist();
  },
  setAccentId(accentId: AccentPresetId) {
    settingsStore.setState({ accentId });
    persist();
  },
  setQuality(quality: AudioQuality) {
    settingsStore.setState({ quality });
    persist();
  },
};

/**
 * 同步读取当前默认音质（供播放内核使用，不走 React hook）。
 * 设置尚未 hydrate 时返回默认值，不会阻塞播放。
 */
export function getCurrentAudioQuality(): AudioQuality {
  return settingsStore.getState().quality;
}

export function useSettings(): SettingsState {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getState,
    settingsStore.getInitialState
  );
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().themeMode,
    () => INITIAL_SETTINGS_STATE.themeMode
  );
}

export function useAccentId(): AccentPresetId {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().accentId,
    () => INITIAL_SETTINGS_STATE.accentId
  );
}

export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().hydrated,
    () => INITIAL_SETTINGS_STATE.hydrated
  );
}

export function useAudioQuality(): AudioQuality {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.getState().quality,
    () => INITIAL_SETTINGS_STATE.quality
  );
}
