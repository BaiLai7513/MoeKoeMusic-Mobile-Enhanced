import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { showToast } from '@/components/ui/toast';
import { CreatePlaylistSheet } from '@/components/ui/track-actions-sheet';
import {
  fetchUserProfile,
  isLoggedIn,
  type UserProfile,
} from '@/features/account/user-api';
import { libraryActions, useLibrary, type LibraryPlaylist } from '@/features/library/store';
import {
  claimSvip,
  markConceptStatus,
  refreshConceptVip,
  syncFromStorage,
  useVipClaimState,
} from '@/features/account/vip-claim-state';
import { MaxContentWidth } from '@/constants/theme';
import { useDockContentInset } from '@/hooks/use-dock-inset';
import { usePalette } from '@/hooks/use-palette';
import { bootstrapMobileApi } from '@/lib/kugou-api';
import { readCache, writeCache } from '@/lib/offline-cache';

/** 个人资料的离线缓存键。 */
const PROFILE_CACHE_KEY = 'profile';

/**
 * 昵称行右侧 VIP 胶囊的高度。
 *
 * 原为 34（与搜索页分类 chip 同值），现按「上下各缩短 1/8」的要求只压高度：
 * 34 × (1 - 2/8) = 25.5，取整 26。只动高度、不动 paddingHorizontal，
 * 所以左右内边距天然还是对称的（「两侧均匀」）。
 *
 * 从此刻起它与 search.tsx 的 TAB_CHIP_HEIGHT 不再同值 —— 两个控件只是曾经看起来一样高，
 * 没有任何行为关联，以后调搜索页 chip 的高度时不要再顺手改这里。
 */
const VIP_CHIP_HEIGHT = 26;

/** 昵称行与胶囊共用的底部留白：同值才能让两者底边齐平（见 VipChipShell 的 marginBottom 说明）。 */
const NICKNAME_ROW_PADDING_BOTTOM = 8;

type ScreenState = {
  checking: boolean;
  refreshing: boolean;
  loggedIn: boolean;
  profile: UserProfile | null;
  error: string;
};

function formatListenTime(minutes: number): string {
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)} 小时`;
  }

  return minutes > 0 ? `${minutes} 分钟` : '—';
}

function PlaylistRow({
  item,
  onPress,
}: {
  item: LibraryPlaylist;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      gap={12}
      paddingVertical={9}
      paddingHorizontal={10}
      borderRadius={14}
      transition="quickest"
      pressStyle={{ opacity: 0.65, backgroundColor: palette.cardAlt }}
      onPress={onPress}>
      <Artwork uri={item.coverUrl} size={46} radius={12} />
      <YStack flex={1} gap={2}>
        <Text color={palette.text} fontSize={14.5} fontWeight="600" numberOfLines={1}>
          {item.name}
        </Text>
        <Text color={palette.textTertiary} fontSize={12}>
          {item.count} 首
        </Text>
      </YStack>
      <Ionicons name="chevron-forward" size={16} color={palette.textTertiary} />
    </XStack>
  );
}

/** 个人中心顶部的入口卡片（当前只保留「我喜欢」；云盘入口已随精简移除）。 */
function QuickEntryCard({
  icon,
  gradient,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      flex={1}
      alignItems="center"
      gap={11}
      padding={12}
      borderRadius={18}
      backgroundColor={palette.card}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={palette.border}
      transition="quickest"
      pressStyle={{ opacity: 0.75, scale: 0.98 }}
      onPress={onPress}>
      <XStack
        width={42}
        height={42}
        borderRadius={13}
        overflow="hidden"
        alignItems="center"
        justifyContent="center">
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </XStack>
      <YStack flex={1} gap={2}>
        <Text color={palette.text} fontSize={14.5} fontWeight="700" numberOfLines={1}>
          {title}
        </Text>
        <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
          {subtitle}
        </Text>
      </YStack>
    </XStack>
  );
}

/**
 * 昵称行右侧的 `SVIP` 胶囊 —— 文案只有三个字母，状态全靠颜色区分：
 *
 * | 胶囊 | 可点（金色填充） | 不可点（次级灰） | 点击 |
 * |---|---|---|---|
 * | `SVIP` | 概念版已失效 | 概念版有效、或还不知道 | 先领当天畅听 VIP，再升级概念版 |
 *
 * 为什么文案短到只有三个字母：这一行还要放昵称与昵称旁的 VIP 徽标，
 * 「领取SVIP」这类长词会把昵称挤掉。状态区分本来就靠颜色
 * （可点 = 醒目色填充，不可点 = cardAlt + 次级文字色），文案只负责「这是哪一项」，
 * 「到底做了什么」交给点击后的 toast 说明。
 *
 * 为什么不可点时**仍然响应点击**：胶囊只有三个字母，光看颜色用户不一定知道
 * 「为什么点不动」。点一下给一句 toast 说明原因，比让按钮像坏掉一样毫无反应好。
 *
 * 状态本身不在这里维护，全部来自 vip-claim-state —— 自动补领、「我的」页拉资料、
 * 以及这里点击的结果写的是同一份，所以不会出现「按钮说没领、状态说领了」。
 *
 * 「未知」（conceptValid 为 null）必须是独立的一态，不能并进「失效」：并进去的话，
 * 概念版有效的用户会先看到一个可点的按钮，白打一次接口。
 */

/** 胶囊外壳：尺寸/圆角/内边距/字号集中在这里，改尺寸只需要动一处。 */
function VipChipShell({
  label,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();

  // 配色规则与原来一致：
  // - 可点用 VIP 金色填充，与紧挨着的昵称 VIP 徽标呼应，一眼能看出「这步跟 VIP 有关」
  // - 不可点退到 cardAlt + textTertiary（现有次级色），视觉上明确「这里没事可做了」
  //
  // 两种态都必须用**不透明**填充：这行文字压在用户头图的照片上，
  // vipSoft 这种 18% 透明的底色透出照片后，金色文字的对比度会随背景彻底失控。
  const backgroundColor = disabled ? palette.cardAlt : palette.vip;
  const borderColor = disabled ? palette.border : palette.vip;
  const contentColor = disabled ? palette.textTertiary : palette.onAccent;

  return (
    <XStack
      height={VIP_CHIP_HEIGHT}
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      borderRadius={999}
      overflow="hidden"
      paddingHorizontal={14}
      /*
       * 外层昵称行是 alignItems="flex-end"，用 marginBottom 把胶囊抬起来。
       *
       * 这里不能用 paddingBottom：padding 在胶囊内部，只会把文字往上顶，
       * 胶囊本身仍贴着容器底边，看起来会比昵称低半格。margin 才是真正移动盒子。
       * 值取 8 与昵称行的 paddingBottom 同值 → 两者底边齐平。
       */
      marginBottom={NICKNAME_ROW_PADDING_BOTTOM}
      backgroundColor={backgroundColor}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={borderColor}
      opacity={disabled ? 0.9 : loading ? 0.6 : 1}
      transition="quickest"
      pressStyle={disabled ? undefined : { opacity: 0.7, scale: 0.97 }}
      onPress={onPress}>
      {loading ? (
        <Spinner size="small" color={contentColor} />
      ) : (
        /*
         * 高度从 34 收到 26 后，13 号字会占掉胶囊一半的高度，视觉上「字把按钮撑满了」；
         * 更实际的风险是系统字体缩放（Android 常见 1.3×）：13 × 1.3 ≈ 17，
         * 单行行高可到 23~24，贴着 26 的内高，numberOfLines={1} 容易被裁。
         * 降到 12 后 12 × 1.3 ≈ 15.6，留出约 6~8 的余量，既不成比例也不裁字。
         * 宽度侧不受影响：左右 padding 保持 14，文案变短则按钮自然变窄。
         */
        <Text color={contentColor} fontSize={12} fontWeight="700" numberOfLines={1}>
          {label}
        </Text>
      )}
    </XStack>
  );
}

/** 胶囊：概念版 SVIP。失效时点击走「领当天畅听 VIP → 升级概念版」这条链路。 */
function SvipChip() {
  const { conceptValid, loading } = useVipClaimState();
  const disabled = conceptValid !== false;

  return (
    <VipChipShell
      label="SVIP"
      disabled={disabled}
      loading={loading}
      onPress={() => {
        if (loading) {
          return;
        }
        if (disabled) {
          showToast(conceptValid === true ? 'SVIP 有效中' : '正在确认 VIP 状态，请稍后再试');
          return;
        }
        void claimSvip();
      }}
    />
  );
}

/** 昵称行右侧：`SVIP`（概念版）胶囊。 */
function VipChipRow() {
  // 兜底再读一次持久化状态（根布局已经读过，这里是幂等的）：
  // 万一将来有别的入口不经过根布局渲染这个页面，胶囊也不会显示成初始态。
  //
  // 顺序很重要：**先等本地记录落地，再考虑要不要查接口**。本地那份「今天有效」的记录
  // 一旦被读进来，refreshConceptVip 就会看到「已经有结论」而直接返回 —— 这才是
  // 「本地记录显示 SVIP 还有效 → 一次请求都不发」成立的地方；反过来的话每次冷启动
  // 都会先白打一次 /user/vip/detail。
  useEffect(() => {
    void syncFromStorage().then(() => refreshConceptVip());
  }, []);

  /*
   * 胶囊自带 marginBottom（见 VipChipShell），所以这层只是横向排版：
   * 外层昵称行是 alignItems="flex-end"，包裹层自然底边对齐，胶囊与昵称底边齐平。
   *
   * gap 仍是 6（历史上是两颗胶囊之间的间距）：现在只剩一颗，它不产生任何可视效果，
   * 位置与并排时期**完全一致** —— 这一层刻意不动，删掉左边那颗时不去顺带挪动右边这颗。
   */
  return (
    <XStack alignItems="flex-end" gap={6} flexShrink={0}>
      <SvipChip />
    </XStack>
  );
}

/** 可点击展开/收起的歌单分组标题。 */
function CollapsibleSectionHeader({
  title,
  count,
  open,
  onToggle,
  actionLabel,
  onAction,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = usePalette();

  return (
    <XStack
      alignItems="center"
      gap={8}
      transition="quickest"
      pressStyle={{ opacity: 0.65 }}
      onPress={onToggle}>
      <Text color={palette.text} fontSize={18} fontWeight="700" letterSpacing={0.2}>
        {title}
      </Text>
      <Text flex={1} color={palette.textTertiary} fontSize={12.5}>
        {count > 0 ? `${count} 个` : ''}
      </Text>
      {actionLabel && onAction ? (
        <Text
          color={palette.accent}
          fontSize={13.5}
          fontWeight="600"
          paddingVertical={4}
          paddingHorizontal={4}
          pressStyle={{ opacity: 0.6 }}
          onPress={onAction}
          suppressHighlighting>
          {actionLabel}
        </Text>
      ) : null}
      <XStack
        width={24}
        height={24}
        borderRadius={12}
        alignItems="center"
        justifyContent="center"
        backgroundColor={palette.cardAlt}>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={palette.textSecondary}
        />
      </XStack>
    </XStack>
  );
}

export default function MeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockContentInset();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ScreenState>({
    checking: true,
    refreshing: false,
    loggedIn: false,
    profile: null,
    error: '',
  });
  const [createOpen, setCreateOpen] = useState(false);
  // 创建的歌单默认展开，收藏的歌单默认收起
  const [createdOpen, setCreatedOpen] = useState(true);
  const [collectedOpen, setCollectedOpen] = useState(false);
  const library = useLibrary();

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    const requestId = ++requestIdRef.current;

    startTransition(() => {
      setState((current) => ({
        ...current,
        checking: mode === 'initial' && !current.profile,
        refreshing: mode === 'refresh',
        error: '',
      }));
    });

    try {
      await bootstrapMobileApi();

      if (!isLoggedIn()) {
        libraryActions.reset();
        if (requestId !== requestIdRef.current) return;
        startTransition(() => {
          setState({
            checking: false,
            refreshing: false,
            loggedIn: false,
            profile: null,
            error: '',
          });
        });
        return;
      }

      const [profileResult] = await Promise.allSettled([
        fetchUserProfile(),
        libraryActions.refresh(),
      ]);

      if (requestId !== requestIdRef.current) return;

      if (profileResult.status === 'rejected') {
        throw profileResult.reason;
      }

      // 记下最后一次成功的资料，供离线时展示
      void writeCache(PROFILE_CACHE_KEY, profileResult.value);

      // 先把持久化标记读回共享状态，再登记概念版状态：
      // syncFromStorage 在「作用域变了」时会清空内存状态（冷启动时账号刚从 guest 变成真实账号），
      // 顺序反了会把刚登记的概念版状态一起清掉。
      // 放在这里而不是只靠按钮挂载时那次读取，是为了让按钮**首帧**就是「已领取」，
      // 而不是先闪一下「还没领」再跳过去。
      await syncFromStorage();
      if (requestId !== requestIdRef.current) return;

      // 概念版状态直接用刚拿到的资料登记（fetchUserProfile 内部打的就是 /user/vip/detail），
      // 这样按钮不必为同一个布尔再查一次接口。
      markConceptStatus(profileResult.value.conceptValid);

      startTransition(() => {
        setState({
          checking: false,
          refreshing: false,
          loggedIn: true,
          profile: profileResult.value,
          error: '',
        });
      });

      // 这里刻意**不再**排 VIP 静默领取：自动补领已经改成「开始播放歌曲时」触发
      // （见 vip-play-claim）。留在页面加载里会让它先吃掉 vip-silent-claim 的会话级标记，
      // 用户真正开播时反而不领了。
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      // 断网时用上次成功的资料兜底：登录态本身是本地的（token 在 SecureStore），
      // 不该因为拉不到昵称头像就整页变成错误态。
      const cached = state.profile ? null : await readCache<UserProfile>(PROFILE_CACHE_KEY);
      if (requestId !== requestIdRef.current) return;

      // 同成功路径：先把持久化标记读回来，别让胶囊先闪一下可点态
      await syncFromStorage();
      if (requestId !== requestIdRef.current) return;

      // 缓存可能是旧版本写的（那时还没有 conceptValid 字段），退回用 vipLabel 判断：
      // 这里不追求绝对准确，只是别让按钮在离线时卡在「查询中」。
      if (cached) {
        markConceptStatus(cached.conceptValid ?? cached.vipLabel === 'SVIP');
      }

      startTransition(() => {
        setState((current) => {
          const shown = current.profile ?? cached;
          return {
            ...current,
            checking: false,
            refreshing: false,
            loggedIn: current.loggedIn || Boolean(cached),
            profile: shown,
            // 有内容可展示时用温和文案：资料已经显示出来了，
            // 再甩一句「获取用户信息失败」会让用户以为页面坏了。
            error: shown
              ? '网络不可用，正在显示上次加载的资料'
              : error instanceof Error
                ? error.message
                : '加载失败',
          };
        });
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load])
  );

  // "我喜欢"独立成顶部卡片入口，不再混在创建的歌单列表里
  const likePlaylist = library.playlists.find((item) => item.isLike) ?? null;
  const createdPlaylists = library.playlists.filter((item) => item.isMine && !item.isLike);
  const collectedPlaylists = library.playlists.filter((item) => !item.isMine);

  function openPlaylist(item: LibraryPlaylist) {
    router.push({
      pathname: '/playlist/[id]',
      params: { id: item.gid, name: item.name, cover: item.coverUrl ?? '' },
    });
  }

  const profile = state.loggedIn && state.profile ? state.profile : null;
  const bannerUrl = profile?.backgroundUrl ?? null;
  const [bannerFailed, setBannerFailed] = useState(false);

  useEffect(() => {
    setBannerFailed(false);
  }, [bannerUrl]);

  return (
    <View flex={1} backgroundColor={palette.background}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressViewOffset={insets.top}
          />
        }
        contentContainerStyle={{ paddingBottom: dockInset }}>
        {profile ? (
          <>
            {/* 沉浸式背景头图，穿透状态栏 */}
            <View height={insets.top + 148} backgroundColor={palette.cardAlt}>
              {bannerUrl && !bannerFailed ? (
                <>
                  <Image
                    source={{ uri: bannerUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={280}
                    onError={() => setBannerFailed(true)}
                  />
                  <LinearGradient
                    colors={['rgba(8, 8, 14, 0.22)', 'transparent', 'rgba(8, 8, 14, 0.28)']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                </>
              ) : (
                <LinearGradient
                  colors={[palette.gradientStart, palette.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </View>

            <YStack
              alignSelf="center"
              width="100%"
              maxWidth={MaxContentWidth}
              paddingHorizontal={16}
              gap={18}>
              <YStack>
                <XStack marginTop={-34} alignItems="flex-end" gap={12}>
                  <View padding={3} borderRadius={999} backgroundColor={palette.background}>
                    {profile.avatarUrl ? (
                      <Image
                        source={{ uri: profile.avatarUrl }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <Artwork uri={null} size={68} circle />
                    )}
                  </View>
                  <XStack
                    flex={1}
                    alignItems="center"
                    gap={8}
                    paddingBottom={NICKNAME_ROW_PADDING_BOTTOM}>
                    <Text
                      flexShrink={1}
                      color={palette.text}
                      fontSize={20}
                      fontWeight="800"
                      numberOfLines={1}>
                      {profile.nickname}
                    </Text>
                    {profile.isVip ? (
                      <Text
                        color={palette.vip}
                        backgroundColor={palette.vipSoft}
                        fontSize={10}
                        fontWeight="800"
                        paddingHorizontal={7}
                        paddingVertical={2.5}
                        borderRadius={7}
                        overflow="hidden">
                        {profile.vipLabel}
                      </Text>
                    ) : null}
                  </XStack>
                  {/* 昵称行右侧：SVIP 胶囊。
                      外层 alignItems="flex-end"，胶囊靠自身的 marginBottom 与昵称对齐 */}
                  <VipChipRow />
                </XStack>

                <YStack marginTop={8} gap={4}>
                  <Text color={palette.textTertiary} fontSize={12}>
                    ID {profile.userid}
                  </Text>
                  {profile.signature ? (
                    <Text
                      color={palette.textSecondary}
                      fontSize={12.5}
                      lineHeight={18}
                      numberOfLines={2}>
                      {profile.signature}
                    </Text>
                  ) : null}
                </YStack>

                <XStack gap={10} marginTop={14}>
                  {[
                    { label: '关注', value: String(profile.follows) },
                    { label: '粉丝', value: String(profile.fans) },
                    { label: '听歌时长', value: formatListenTime(profile.listenMinutes) },
                  ].map((stat) => (
                    <YStack
                      key={stat.label}
                      flex={1}
                      alignItems="center"
                      gap={3}
                      paddingVertical={12}
                      borderRadius={16}
                      backgroundColor={palette.card}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}>
                      <Text color={palette.text} fontSize={15} fontWeight="700">
                        {stat.value}
                      </Text>
                      <Text color={palette.textTertiary} fontSize={11.5}>
                        {stat.label}
                      </Text>
                    </YStack>
                  ))}
                </XStack>
              </YStack>

              <XStack gap={10}>
                <QuickEntryCard
                  icon="heart"
                  gradient={[palette.gradientStart, palette.gradientEnd]}
                  title="我喜欢"
                  subtitle={likePlaylist ? `${likePlaylist.count} 首` : '收藏喜欢的歌曲'}
                  onPress={() => {
                    if (likePlaylist) {
                      openPlaylist(likePlaylist);
                    } else {
                      showToast('还没有"我喜欢"歌单');
                    }
                  }}
                />
                <QuickEntryCard
                  icon="phone-portrait-outline"
                  gradient={['#5EA8FF', '#3E7BFA']}
                  title="本地音乐"
                  subtitle="手机里的歌曲"
                  onPress={() => router.push('/local')}
                />
              </XStack>

              {state.error ? (
                <XStack
                  alignItems="center"
                  gap={8}
                  paddingHorizontal={14}
                  paddingVertical={10}
                  borderRadius={14}
                  backgroundColor={palette.dangerSoft}>
                  <Ionicons name="alert-circle" size={15} color={palette.danger} />
                  <Text flex={1} color={palette.danger} fontSize={12.5}>
                    {state.error}
                  </Text>
                </XStack>
              ) : null}

              <YStack gap={10}>
                <CollapsibleSectionHeader
                  title="我创建的歌单"
                  count={createdPlaylists.length}
                  open={createdOpen}
                  onToggle={() => setCreatedOpen((open) => !open)}
                  actionLabel="新建"
                  onAction={() => setCreateOpen(true)}
                />
                {createdOpen ? (
                  createdPlaylists.length ? (
                    <YStack
                      backgroundColor={palette.card}
                      borderRadius={20}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      paddingVertical={6}
                      paddingHorizontal={4}>
                      {createdPlaylists.map((item) => (
                        <PlaylistRow key={item.gid} item={item} onPress={() => openPlaylist(item)} />
                      ))}
                    </YStack>
                  ) : (
                    <YStack
                      alignItems="center"
                      paddingVertical={22}
                      borderRadius={20}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      backgroundColor={palette.card}>
                      <Text color={palette.textTertiary} fontSize={12.5}>
                        还没有自己的歌单，点右上角&quot;新建&quot;
                      </Text>
                    </YStack>
                  )
                ) : null}
              </YStack>

              {collectedPlaylists.length ? (
                <YStack gap={10}>
                  <CollapsibleSectionHeader
                    title="收藏的歌单"
                    count={collectedPlaylists.length}
                    open={collectedOpen}
                    onToggle={() => setCollectedOpen((open) => !open)}
                  />
                  {collectedOpen ? (
                    <YStack
                      backgroundColor={palette.card}
                      borderRadius={20}
                      borderWidth={StyleSheet.hairlineWidth}
                      borderColor={palette.border}
                      paddingVertical={6}
                      paddingHorizontal={4}>
                      {collectedPlaylists.map((item) => (
                        <PlaylistRow key={item.gid} item={item} onPress={() => openPlaylist(item)} />
                      ))}
                    </YStack>
                  ) : null}
                </YStack>
              ) : null}
            </YStack>
          </>
        ) : (
          <YStack
            alignSelf="center"
            width="100%"
            maxWidth={MaxContentWidth}
            paddingHorizontal={16}
            paddingTop={insets.top + 14}
            gap={18}>
            <Text color={palette.text} fontSize={26} fontWeight="800" letterSpacing={0.3}>
              我的
            </Text>

            {state.checking ? (
              <YStack alignItems="center" paddingVertical={80}>
                <Spinner size="large" color={palette.accent} />
              </YStack>
            ) : (
              <YStack
                borderRadius={26}
                overflow="hidden"
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={palette.border}
                backgroundColor={palette.card}>
                <LinearGradient
                  colors={[palette.accentSoft, 'transparent']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <YStack alignItems="center" paddingVertical={38} paddingHorizontal={26} gap={18}>
                  <Image
                    source={require('@/assets/images/icon.png')}
                    style={styles.heroIcon}
                    contentFit="cover"
                  />
                  <YStack alignItems="center" gap={6}>
                    <Text color={palette.text} fontSize={19} fontWeight="800">
                      登录酷狗账号
                    </Text>
                    <Text color={palette.textTertiary} fontSize={13} textAlign="center" lineHeight={19}>
                      同步你的歌单与收藏，获得完整的听歌体验
                    </Text>
                  </YStack>
                  <XStack
                    height={46}
                    paddingHorizontal={34}
                    borderRadius={23}
                    overflow="hidden"
                    alignItems="center"
                    justifyContent="center"
                    transition="quickest"
                    pressStyle={{ scale: 0.97, opacity: 0.9 }}
                    onPress={() => router.push('/login')}>
                    <LinearGradient
                      colors={[palette.gradientStart, palette.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text color="#FFFFFF" fontSize={14.5} fontWeight="700">
                      立即登录
                    </Text>
                  </XStack>
                  {state.error ? (
                    <Text color={palette.danger} fontSize={12}>
                      {state.error}
                    </Text>
                  ) : null}
                </YStack>
              </YStack>
            )}

          </YStack>
        )}
      </ScrollView>

      <XStack
        position="absolute"
        top={insets.top + 8}
        right={16}
        width={38}
        height={38}
        borderRadius={19}
        alignItems="center"
        justifyContent="center"
        backgroundColor={palette.barSurface}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}
        shadowColor={palette.dockShadow}
        shadowOffset={{ width: 0, height: 4 }}
        shadowOpacity={0.12}
        shadowRadius={10}
        elevation={4}
        transition="quickest"
        pressStyle={{ opacity: 0.7, scale: 0.96 }}
        onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={19} color={palette.text} />
      </XStack>

      <CreatePlaylistSheet open={createOpen} onOpenChange={setCreateOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
  },
});
