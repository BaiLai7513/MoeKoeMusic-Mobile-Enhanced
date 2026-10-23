import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import {
  PLAYBACK_RATES,
  formatPlaybackRate,
  type PlaybackRate,
} from '@/features/player/playback-rate';
import {
  SLEEP_TIMER_MAX_MINUTES,
  SLEEP_TIMER_MIN_MINUTES,
  SLEEP_TIMER_MINUTES,
  sleepTimerActions,
  useSleepTimer,
} from '@/features/player/sleep-timer';
import { playerActions } from '@/features/player/store';
import { usePlaybackRate } from '@/features/settings/store';
import { usePalette } from '@/hooks/use-palette';
import { formatLongClock } from '@/lib/format';

/**
 * 播放页的两个小面板：倍速、定时关闭。
 *
 * 为什么用**居中对话框**而不是底部 Sheet：播放页本身就是一个全屏 modal，
 * 里面再叠 Sheet 在 Android 上会多出一层手势/返回键争夺（返回键先关哪一层、
 * 下滑关 Sheet 与下拉关播放页冲突）。项目里「设置」页的选音质面板也是这套居中卡片，
 * 样式直接复用，用户看到的是同一种交互语言。
 * 另外这些面板内容极少（几个档位），不做任何内容测量 —— 定时面板的列表上限
 * 是拿窗口高度现算的（见 SleepTimerDialog 的 listMaxHeight），
 * 也就不存在 TrackActionsSheet 注释里那类「先测量再修正」的闪烁问题。
 */
type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DialogShell({
  open,
  onOpenChange,
  children,
}: DialogProps & { children: React.ReactNode }) {
  const palette = usePalette();

  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}>
      <Pressable style={styles.overlay} onPress={() => onOpenChange(false)}>
        {/*
          自定义时长要弹键盘。Android 的 Modal 窗口会跟着软键盘缩高度（adjustResize），
          iOS 不会，所以 iOS 上用 padding 把卡片顶起来，避免输入框被键盘压住。
          pointerEvents="box-none"：容器本身不接触摸，点卡片外面仍然落到遮罩那层
          Pressable（= 关闭面板），点卡片则被下面这层 stopPropagation 拦下。
        */}
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.container} onPress={(event) => event.stopPropagation()}>
            <YStack
              backgroundColor={palette.card}
              borderRadius={22}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              overflow="hidden">
              {children}
            </YStack>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function OptionRow({
  label,
  hint,
  active = false,
  danger = false,
  onPress,
}: {
  label: string;
  /** 右侧的次要说明（例如剩余时间）。 */
  hint?: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const color = danger ? palette.danger : active ? palette.accent : palette.text;

  return (
    <XStack
      alignItems="center"
      gap={10}
      height={50}
      paddingHorizontal={18}
      transition="quickest"
      pressStyle={{ opacity: 0.65, backgroundColor: palette.cardAlt }}
      onPress={onPress}>
      <Text flex={1} color={color} fontSize={14.5} fontWeight={active || danger ? '700' : '500'}>
        {label}
      </Text>
      {hint ? (
        <Text color={palette.textTertiary} fontSize={12.5} fontVariant={['tabular-nums']}>
          {hint}
        </Text>
      ) : null}
      {active ? <Ionicons name="checkmark" size={19} color={palette.accent} /> : null}
    </XStack>
  );
}

/** 倍速面板：档位与桌面版一致（0.5×~2×）。 */
export function PlaybackRateDialog({ open, onOpenChange }: DialogProps) {
  const palette = usePalette();
  const rate = usePlaybackRate();

  function choose(next: PlaybackRate) {
    playerActions.setRate(next);
    onOpenChange(false);
  }

  return (
    <DialogShell open={open} onOpenChange={onOpenChange}>
      <YStack paddingHorizontal={18} paddingTop={18} paddingBottom={6} gap={4}>
        <Text color={palette.text} fontSize={17} fontWeight="800">
          播放速度
        </Text>
        <Text color={palette.textTertiary} fontSize={12} lineHeight={17}>
          当前 {formatPlaybackRate(rate)}，选择后立即生效，并记住给下次播放用
        </Text>
      </YStack>

      <XStack flexWrap="wrap" gap={10} paddingHorizontal={18} paddingTop={10} paddingBottom={16}>
        {PLAYBACK_RATES.map((item) => {
          const active = item === rate;
          return (
            <XStack
              key={item}
              flexBasis="29%"
              flexGrow={1}
              height={44}
              alignItems="center"
              justifyContent="center"
              borderRadius={14}
              backgroundColor={active ? palette.accent : palette.cardAlt}
              transition="quickest"
              pressStyle={{ opacity: 0.7, scale: 0.97 }}
              onPress={() => choose(item)}>
              <Text
                color={active ? palette.onAccent : palette.text}
                fontSize={14.5}
                fontWeight={active ? '700' : '600'}>
                {formatPlaybackRate(item)}
              </Text>
            </XStack>
          );
        })}
      </XStack>
    </DialogShell>
  );
}

/** 点开「自定义」时输入框里的预填值：半小时最常用，改起来也最快。 */
const CUSTOM_DEFAULT_MINUTES = 30;

/**
 * 当前生效的时长是否落在固定档位之外（= 用户自己设的那个数）。
 *
 * 不能写 `SLEEP_TIMER_MINUTES.includes(timer.minutes)`：那是 readonly 的字面量元组
 * （15 | 30 | 60 | 90），传 number 进去 TS 会以「不在这个联合类型里」拒绝掉。
 * 放宽成 number[] 再比是这里唯一不需要 cast 到 any 的写法。
 */
function isCustomMinutes(minutes: number | null): boolean {
  return minutes !== null && !(SLEEP_TIMER_MINUTES as readonly number[]).includes(minutes);
}

/** 自定义输入两侧的加减按钮：外形跟档位按钮同款（圆角小方块 + 主题描边）。 */
function StepButton({ icon, onPress }: { icon: 'remove' | 'add'; onPress: () => void }) {
  const palette = usePalette();

  return (
    <XStack
      width={44}
      height={44}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={13}
      backgroundColor={palette.cardAlt}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={palette.border}
      transition="quickest"
      pressStyle={{ opacity: 0.65, scale: 0.94 }}
      onPress={onPress}>
      <Ionicons name={icon} size={19} color={palette.textSecondary} />
    </XStack>
  );
}

/**
 * 定时关闭面板：固定档位 + 自定义时长 + 本曲结束，已开时显示剩余并能取消。
 *
 * 自定义时长是面板内的**第二个视图**（点「自定义时长」进入，点「返回」退出），
 * 不是列表里展开的一段。原因很实际：档位列表在窗口矮的时候要滚动，
 * 而展开出来的输入框若排在列表末尾，用户点完还得多滚一下才能看到它，
 * 键盘一弹起来更是直接压在下面。独占一屏后卡片只有 200 出头高，
 * 任何窗口尺寸下输入框和按钮都完整可见。
 */
export function SleepTimerDialog({ open, onOpenChange }: DialogProps) {
  const palette = usePalette();
  const timer = useSleepTimer();
  const { height } = useWindowDimensions();

  /*
   * 自定义输入的三份状态。
   *
   * 输入框里存 string 而不是 number：要允许「先删空再输入」这个中间态。
   * 存 number 的话删空瞬间就变成 0/NaN，只能强制回填一个数字，光标会来回跳。
   */
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState('');

  /*
   * 每次重新打开面板都退回档位列表：上次输到一半的 7 分钟若留在输入框里，
   * 下次点开「定时关闭」会让人以为定时就是 7 分钟。
   * 沿用 CreatePlaylistSheet 的做法 —— 在渲染期比对 open，比 useEffect 少一帧闪烁。
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCustomOpen(false);
      setCustomValue('');
      setCustomError('');
    }
  }

  /*
   * 选项最多 7 行（4 个档位 + 自定义 + 本曲结束 + 取消），在普通手机上正好放得下；
   * 小窗/分屏只有 400 上下时就会顶出屏幕，所以给列表一个「按窗口算」的上限并允许滚动。
   * 用窗口高度现算而不是写死像素：这正是播放页里唱片被裁的那类坑（写死的尺寸在小窗里不成立）。
   */
  const listMaxHeight = Math.max(180, Math.min(360, height - 240));

  function subtitle(): string {
    if (customOpen) {
      return `输入 ${SLEEP_TIMER_MIN_MINUTES}–${SLEEP_TIMER_MAX_MINUTES} 分钟，到点先淡出音量再暂停`;
    }
    if (timer.kind === 'duration') {
      return `剩余 ${formatLongClock(timer.remainingMs)} · 到点先淡出音量再暂停`;
    }
    if (timer.kind === 'track') {
      return timer.remainingMs > 0
        ? `本曲还剩 ${formatLongClock(timer.remainingMs)} · 结束后淡出并暂停`
        : '本曲结束后淡出并暂停';
    }
    return '到点会先把音量淡出，再暂停播放（切歌不影响定时）';
  }

  /** ±1 分钟微调；输入框还空着时从默认 30 起算，免得让人从 0 一路加起来。 */
  function stepCustom(delta: number) {
    setCustomError('');
    setCustomValue((current) => {
      const parsed = Number(current);
      const base = current.trim() && Number.isFinite(parsed) ? parsed : CUSTOM_DEFAULT_MINUTES;
      const next = Math.min(
        SLEEP_TIMER_MAX_MINUTES,
        Math.max(SLEEP_TIMER_MIN_MINUTES, base + delta)
      );
      return String(next);
    });
  }

  /*
   * 校验放在面板里、而不是让 sleepTimerActions.start 去报错：错误必须就着输入框说。
   * 面板是 RN Modal（独立窗口），toast 挂在播放页上会被它整个盖住 —— 用户在面板里
   * 按确定，屏幕上什么都不会出现，只会觉得按钮坏了。
   */
  function confirmCustom() {
    const minutes = Number(customValue);

    if (!customValue.trim() || !Number.isFinite(minutes)) {
      setCustomError('请输入分钟数');
      return;
    }
    if (minutes < SLEEP_TIMER_MIN_MINUTES) {
      setCustomError(`至少 ${SLEEP_TIMER_MIN_MINUTES} 分钟`);
      return;
    }
    if (minutes > SLEEP_TIMER_MAX_MINUTES) {
      setCustomError(`最长 ${SLEEP_TIMER_MAX_MINUTES / 60} 小时（${SLEEP_TIMER_MAX_MINUTES} 分钟）`);
      return;
    }

    setCustomError('');
    sleepTimerActions.start(minutes);
    onOpenChange(false);
  }

  return (
    <DialogShell open={open} onOpenChange={onOpenChange}>
      <YStack paddingHorizontal={18} paddingTop={18} paddingBottom={8} gap={4}>
        <Text color={palette.text} fontSize={17} fontWeight="800">
          定时关闭
        </Text>
        <Text color={palette.textTertiary} fontSize={12} lineHeight={17}>
          {subtitle()}
        </Text>
      </YStack>

      {customOpen ? (
        <YStack paddingHorizontal={14} paddingTop={10} paddingBottom={14} gap={10}>
          <XStack alignItems="center" gap={10}>
            <StepButton icon="remove" onPress={() => stepCustom(-1)} />
            <XStack
              flex={1}
              height={44}
              alignItems="center"
              justifyContent="center"
              gap={6}
              borderRadius={13}
              backgroundColor={palette.cardAlt}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={customError ? palette.danger : palette.border}>
              <TextInput
                value={customValue}
                onChangeText={(text) => {
                  // 数字键盘之外还有粘贴和输入法，所以这里再过滤一遍；3 位刚好覆盖 720
                  setCustomValue(text.replace(/[^\d]/g, '').slice(0, 3));
                  setCustomError('');
                }}
                placeholder={String(CUSTOM_DEFAULT_MINUTES)}
                placeholderTextColor={palette.textTertiary}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={3}
                returnKeyType="done"
                selectTextOnFocus
                autoFocus
                onSubmitEditing={confirmCustom}
                style={[styles.customInput, { color: palette.text }]}
              />
              <Text color={palette.textSecondary} fontSize={12.5}>
                分钟
              </Text>
            </XStack>
            <StepButton icon="add" onPress={() => stepCustom(1)} />
          </XStack>

          <Text
            color={customError ? palette.danger : palette.textTertiary}
            fontSize={11.5}
            lineHeight={16}>
            {customError ||
              `可输入 ${SLEEP_TIMER_MIN_MINUTES}–${SLEEP_TIMER_MAX_MINUTES} 分钟（最长 ${
                SLEEP_TIMER_MAX_MINUTES / 60
              } 小时），也能用 ± 微调`}
          </Text>

          <XStack gap={10}>
            <XStack
              flex={1}
              height={40}
              alignItems="center"
              justifyContent="center"
              borderRadius={20}
              backgroundColor={palette.cardAlt}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={palette.border}
              transition="quickest"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => {
                setCustomOpen(false);
                setCustomError('');
              }}>
              <Text color={palette.textSecondary} fontSize={13.5} fontWeight="600">
                返回
              </Text>
            </XStack>
            <XStack
              flex={1}
              height={40}
              alignItems="center"
              justifyContent="center"
              borderRadius={20}
              backgroundColor={palette.accent}
              transition="quickest"
              pressStyle={{ opacity: 0.85, scale: 0.97 }}
              onPress={confirmCustom}>
              <Text color={palette.onAccent} fontSize={13.5} fontWeight="700">
                开始计时
              </Text>
            </XStack>
          </XStack>
        </YStack>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          /*
           * handled：键盘还开着时第一下点按要直接落到选项上，而不是先被"关键盘"吃掉
           * （输入框虽然不在这层，但 iOS 上键盘不会自己收起，保持一致行为）。
           */
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: listMaxHeight }}
          contentContainerStyle={{ paddingBottom: timer.kind ? 6 : 12 }}>
          {SLEEP_TIMER_MINUTES.map((minutes) => (
            <OptionRow
              key={minutes}
              label={`${minutes} 分钟后停止`}
              active={timer.kind === 'duration' && timer.minutes === minutes}
              onPress={() => {
                sleepTimerActions.start(minutes);
                onOpenChange(false);
              }}
            />
          ))}
          <OptionRow
            label="自定义时长"
            hint={
              timer.kind === 'duration' && isCustomMinutes(timer.minutes)
                ? `${timer.minutes} 分钟`
                : `${SLEEP_TIMER_MIN_MINUTES}–${SLEEP_TIMER_MAX_MINUTES} 分钟`
            }
            active={timer.kind === 'duration' && isCustomMinutes(timer.minutes)}
            onPress={() => {
              // 已经在跑自定义时长时把它回填进输入框：用户多半是想在这个数上改（比如 45 → 50），
              // 而不是从空开始重输。没有生效中的自定义值就留空，让 placeholder 充当默认值。
              setCustomValue(
                timer.kind === 'duration' && isCustomMinutes(timer.minutes)
                  ? String(timer.minutes)
                  : ''
              );
              setCustomOpen(true);
              setCustomError('');
            }}
          />
          <OptionRow
            label="本曲结束后停止"
            active={timer.kind === 'track'}
            onPress={() => {
              sleepTimerActions.startTrack();
              onOpenChange(false);
            }}
          />
          {timer.kind ? (
            <OptionRow
              label="取消定时"
              hint={timer.fading ? '正在淡出…' : undefined}
              danger
              onPress={() => {
                sleepTimerActions.cancel();
                onOpenChange(false);
              }}
            />
          ) : null}
        </ScrollView>
      )}
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    /*
     * 只负责遮罩与关闭，居中交给 keyboardArea —— 它要在键盘弹出时
     * 把整张卡片往上顶（iOS 的 padding 行为需要占满整屏才有效）。
     */
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  keyboardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
  },
  customInput: {
    flex: 1,
    height: 42,
    // Android 的 TextInput 自带纵向内边距，不清掉会和固定高度打架（文字偏下）
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});
