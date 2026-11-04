import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { TamaguiProvider } from 'tamagui';

import { hydrateSettings, useSettingsHydrated } from '@/features/settings/store';
import { installLogCapture } from '@/features/logs/capture';
import { syncFromStorage } from '@/features/account/vip-claim-state';
import { attachVipClaimTriggers } from '@/features/account/vip-play-claim';
import { ToastHost } from '@/components/ui/toast';
import { useEffectiveScheme, usePalette } from '@/hooks/use-palette';
import { tamaguiConfig } from '../../tamagui.config';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void hydrateSettings();
// 运行日志的捕获必须在这层就装上：登录态、播放器内核都在模块初始化阶段打日志，
// 放进组件 effect 会整段漏掉。安装后它会接管 console 与未捕获异常，见 features/logs。
installLogCapture();
// 在模块作用域就把「今天领没领过 VIP」读回来，而不是等「我的」页面挂载再读：
// 前者能保证按钮首帧就是正确状态，后者会先闪一下再跳成正确文案。
void syncFromStorage();
// 自动补领的触发点：开播、被 VIP 挡住、打开 App / 回前台、闹钟到期（AlarmManager）。
// 「该不该领」只看 vip-deadline 里那一个截止时间戳；这里只做接线，节流与接口边界见
// vip-play-claim / vip-silent-claim / vip-deadline 的文件头。
attachVipClaimTriggers();

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
          <Stack.Screen
            name="logs"
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
