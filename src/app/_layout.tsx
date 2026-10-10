import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { TamaguiProvider } from 'tamagui';

import { hydrateSettings, useSettingsHydrated } from '@/features/settings/store';
import {
  scheduleSilentVipClaim,
  VIP_CLAIMED_TOAST,
} from '@/features/account/vip-silent-claim';
import { showToast, ToastHost } from '@/components/ui/toast';
import { useEffectiveScheme, usePalette } from '@/hooks/use-palette';
import { tamaguiConfig } from '../../tamagui.config';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void hydrateSettings();

export default function RootLayout() {
  const hydrated = useSettingsHydrated();
  const palette = usePalette();
  const isDark = useEffectiveScheme() === 'dark';

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.accent,
        background: palette.background,
        card: palette.card,
        text: palette.text,
        border: 'transparent',
      },
    };
  }, [isDark, palette]);

  useEffect(() => {
    if (hydrated) {
      void SplashScreen.hideAsync().catch(() => undefined);
      // 启动后检测 VIP 是否已过期，过期则延时静默补领一天畅听 VIP。
      // 内部有「按天 + 按会话」双重去重，未登录时不消耗标记，登录后仍会触发。
      scheduleSilentVipClaim({ onClaimed: () => showToast(VIP_CLAIMED_TOAST) });
    }
  }, [hydrated]);

  if (!hydrated) {
    // 原生 splash 覆盖期间完成偏好读取,首帧即正确主题。
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={isDark ? 'dark' : 'light'}>
      <ThemeProvider value={navTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="player"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              gestureEnabled: true,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="playlist/[id]"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="album/[id]"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="mv/[hash]"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="local"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="search"
            options={{
              animation: 'fade_from_bottom',
              animationDuration: 220,
            }}
          />
          <Stack.Screen
            name="recognize"
            options={{
              animation: 'fade_from_bottom',
              animationDuration: 220,
            }}
          />
          <Stack.Screen
            name="login"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="web"
            options={{
              animation: 'slide_from_right',
            }}
          />
        </Stack>
        <ToastHost />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </TamaguiProvider>
  );
}
