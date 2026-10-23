import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';

import { MiniPlayer } from '@/components/ui/mini-player';
import { TabBarHeight, TabBarSideMargin } from '@/constants/layout';
import { useIsDark, usePalette } from '@/hooks/use-palette';

type TabGlyph = 'home' | 'person';

function TabItem({
  focused,
  glyph,
  label,
}: {
  focused: boolean;
  glyph: TabGlyph;
  label: string;
}) {
  const palette = usePalette();
  const tint = focused ? palette.accent : palette.textTertiary;

  return (
    <YStack alignItems="center" justifyContent="center" gap={3} minWidth={58} paddingTop={4}>
      <Ionicons name={focused ? glyph : (`${glyph}-outline` as const)} size={22} color={tint} />
      <Text color={tint} fontSize={10.5} fontWeight={focused ? '700' : '600'}>
        {label}
      </Text>
    </YStack>
  );
}

export default function TabsLayout() {
  const palette = usePalette();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  /*
   * 注意：这两个值**只当兜底**，不用它们做真实布局尺寸。
   * 真机证据（一加 PKR110，横屏分屏/自由小窗）：App 实际只占 361×522 的窗口，
   * 而 useWindowDimensions() 报的是 794.29×361.14 —— 正好是整块横屏显示器。
   * 原因是 manifest 的 configChanges 含 orientation|screenSize|screenLayout|smallestScreenSize，
   * Activity 不重建，RN 的 Dimensions 只在旋转那次更新、窗口尺寸变化不更新，错值被永久保留。
   * 底部 dock 的宽度就是拿它算的 ⇒ 按 794 算成 680 宽，整条被裁/移出屏幕，所有 tab 都受影响。
   */
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /*
   * 根容器实测尺寸（修法与 player.tsx 完全一致）：onLayout 拿到的是 Yoga 按**真实父容器**
   * 算出的尺寸，完全不经过 Dimensions，分屏/自由窗口下它是唯一可信的来源。
   */
  const [rootSize, setRootSize] = useState<{ width: number; height: number } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  /* 宽高一起存 —— 分屏既能左右切也能上下切，两个方向都可能被系统报错。 */
  const handleRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
    const nextWidth = Math.round(measuredWidth);
    const nextHeight = Math.round(measuredHeight);
    if (nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    setRootSize((prev) =>
      prev && prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    );
  }, []);

  /*
   * 尺寸唯一来源：实测优先，测到之前才退回 useWindowDimensions。
   * 兜底取「窗口宽高里的小值」而不是 windowWidth —— 偏小只是 dock 窄一圈（还能完整显示），
   * 偏大就会溢出被裁（正是这次要修的 bug），所以宁可保守。全屏竖屏下 361 = 794 里的
   * 小值 361，与实测值和旧的 useWindowDimensions 值三者相等，视觉与改动前一致。
   */
  const width = rootSize?.width ?? Math.min(windowWidth, windowHeight);
  const barHeight = TabBarHeight + insets.bottom;
  const dockWidth = Math.min(width - TabBarSideMargin * 2, 680);

  return (
    <View style={styles.root} onLayout={handleRootLayout}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: palette.background },
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: barHeight,
            borderTopWidth: 0,
            backgroundColor: palette.barSurface,
            shadowColor: palette.dockShadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.45 : 0.12,
            shadowRadius: 22,
            elevation: 10,
            paddingTop: 6,
            paddingBottom: insets.bottom,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: '首页',
            tabBarIcon: ({ focused }) => <TabItem focused={focused} glyph="home" label="首页" />,
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: '我的',
            tabBarIcon: ({ focused }) => <TabItem focused={focused} glyph="person" label="我的" />,
          }}
        />
      </Tabs>

      {keyboardVisible ? null : (
        <View
          pointerEvents="box-none"
          style={[
            styles.dock,
            {
              bottom: barHeight + 8,
              width: dockWidth,
              marginLeft: (width - dockWidth) / 2,
            },
          ]}>
          <MiniPlayer />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dock: {
    position: 'absolute',
    left: 0,
  },
});
