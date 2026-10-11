import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { TamaguiProvider } from 'tamagui';

import { hydrateSettings, useSettingsHydrated } from '@/features/settings/store';
import { syncFromStorage } from '@/features/account/vip-claim-state';
import { attachVipClaimToPlayback } from '@/features/account/vip-play-claim';
import { ToastHost } from '@/components/ui/toast';
import { useEffectiveScheme, usePalette } from '@/hooks/use-palette';
import { tamaguiConfig } from '../../tamagui.config';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void hydrateSettings();
// 在模块作用域就把「今天领没领过 VIP」读回来，而不是等「我的」页面挂载再读：
// 前者能保证按钮首帧就是正确状态，后者会先闪一下再跳成正确文案。
void syncFromStorage();
// 自动补领的触发点已经从「启动」移到「开始播放歌曲」：
// 启动即打领取接口的节奏太像脚本（实测会被判风控），而且用户开 App 不等于要听歌。
// 这里只做接线，具体节流与接口边界见 vip-play-claim / vip-silent-claim。
attachVipClaimToPlayback();

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
