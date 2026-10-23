import { useSyncExternalStore } from 'react';

import { getApiSession } from '@/lib/kugou-api';
import { readCache, writeCache } from '@/lib/offline-cache';

/**
 * 「听歌时长同步」的本地状态，只做三件事：
 *
 * 1. **开关**（默认关闭，用户必须在设置页手动打开）；
 * 2. **每个账号的累计基线** `d_sec`（上报时 `d_sec = 基线 + 本次新增`，所以基线必须持久化，
 *    否则每次冷启动都从 0 开始算，服务端会认为「本地累计比它记的还少」而整段拒收）；
 * 3. **每天已发出的上报次数**（请求上界的硬闸门，见 listen-report 里的 `MAX_REPORTS_PER_DAY`）。
 *
 * ## 为什么按账号分键
 *
 * `d_sec` 是**账号维度**的累计值。同一台设备换账号登录，A 的 12 万秒跟 B 毫无关系；
 * 只按设备存会让 B 第一次上报就带着 A 的累计值冲进服务端，必然被判「d_sec 与服务端不符」。
 * 所以键里带 `userid`（未登录时用 `guest` 占位，那种情况本来也不会发请求）。
 *
 * ## 为什么复刻一份 30 行 store，而不是用 useState / 引状态库
 *
 * 与 `player/store.ts`、`settings/store.ts`、`vip-claim-state.ts` 完全同款：
 * 本项目没有全局状态库，而「开关」既要被设置页读（React），又要被上报引擎读（非 React），
 * 复制这 30 行比引一个依赖划算。这也是为什么下面同时导出 hook 与普通 getter。
 */

export type ListenSyncState = {
  /** 本地偏好是否已经读回来；未读完之前 UI 一律按下限（关闭）渲染，避免闪一下「已开启」。 */
  hydrated: boolean;
  /** 用户是否打开了「同步听歌时长」。默认关闭：真实节奏与上报节奏不一致会被判脚本。 */
  enabled: boolean;
};

const INITIAL_LISTEN_SYNC_STATE: ListenSyncState = {
  hydrated: false,
  enabled: false,
};

type Listener = () => void;

const listeners = new Set<Listener>();
let state: ListenSyncState = INITIAL_LISTEN_SYNC_STATE;

function setState(partial: Partial<ListenSyncState>): void {
  let changed = false;
  for (const key of Object.keys(partial) as (keyof ListenSyncState)[]) {
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
}

/** 订阅开关变化（上报引擎用它决定「挂不挂原生监听」，设置页用它重渲染）。 */
export function subscribeListenSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const ENABLED_KEY = 'listenSync.enabled';
const BASELINE_PREFIX = 'listenSync.base.';
const DAILY_COUNT_PREFIX = 'listenSync.count.';
const BASELINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 基线是账号维度的，不按天重置（听歌时长本身是累计值）。 */
function accountKey(): string {
  return getApiSession().userid || 'guest';
}

let hydrationPromise: Promise<void> | null = null;

/**
 * 读回开关。幂等，可以重复调用。
 *
 * 读失败一律当「关闭」：这是唯一一个「失败必须关」的开关 —— 打开意味着要往账号上报数据，
 * 读不到用户上一次的选择时，替他打开是最不该做的默认。
 */
export function hydrateListenSyncState(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readCache<{ enabled?: unknown }>(ENABLED_KEY);
      setState({ enabled: stored?.enabled === true, hydrated: true });
    })().catch(() => {
      setState({ enabled: false, hydrated: true });
    });
  }

  return hydrationPromise;
}

/** 同步读开关（上报引擎每个事件都要问一次，不能走 hook）。 */
export function getListenSyncEnabled(): boolean {
  return state.enabled;
}

export function setListenSyncEnabled(enabled: boolean): void {
  setState({ enabled });
  // 写入失败不做任何补救：开关只影响「要不要上报」，失败时本次会话仍按内存状态走。
  void writeCache(ENABLED_KEY, { enabled });
}

export function useListenSyncEnabled(): boolean {
  return useSyncExternalStore(subscribeListenSyncState, getListenSyncEnabled, () => false);
}

/**
 * 读本地基线 `d_sec`。
 *
 * 带 24 小时有效期：基线是「服务端累计值」的本地副本，隔天还在用就有很大概率低于服务端
 * （用户可能在官方客户端/别的设备听过），那时上报的 `d_sec` 会小于服务端值而被拒。
 * 过期就当没有 —— 本次先查一次服务端，比拿着旧值硬发要好。
 */
export function readListenBaseline(): Promise<number | null> {
  return readCache<number>(`${BASELINE_PREFIX}${accountKey()}`, BASELINE_MAX_AGE_MS).then(
    (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null)
  );
}

export async function writeListenBaseline(dSec: number): Promise<void> {
  if (!Number.isFinite(dSec) || dSec < 0) {
    return;
  }

  await writeCache(`${BASELINE_PREFIX}${accountKey()}`, Math.floor(dSec));
}

/** 当天已发出的上报次数（内存镜像 + 按「账号 + 日期」的键），跨天/换账号自动从头计。 */
let counterKey = '';
let counterValue = 0;

function currentCounterKey(): string {
  return `${DAILY_COUNT_PREFIX}${accountKey()}.${todayKey()}`;
}

/**
 * 取「本次上报将是当天的第几次」并立刻把它写下去。
 *
 * 为什么**先写计数再发请求**：上限的意义是「就算每次都失败也不能无限发」。
 * 若等请求成功再计数，一个一直失败的账号（比如被风控）会把每日上限彻底绕过。
 * 与 vip-silent-claim 的「标记写在请求之前」是同一个理由。
 */
export async function nextDailyReportCount(): Promise<number> {
  const key = currentCounterKey();

  if (key !== counterKey) {
    counterKey = key;
    const stored = await readCache<number>(key);
    counterValue = typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  }

  counterValue += 1;
  await writeCache(key, counterValue);
  return counterValue;
}
