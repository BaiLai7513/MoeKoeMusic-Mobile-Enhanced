/**
 * 运行日志的捕获层：接管 console、接管未捕获异常、内存缓冲 + 定时刷盘。
 *
 * ## 为什么必须继续调用原 console
 *
 * 开发时看 Logcat / Metro 的输出是主要排障手段。一旦拦截后不转发，等于把眼睛蒙住。
 * 所以每个被包过的 `console.xxx` 都是「先记一笔，再原样转发」。
 *
 * ## 为什么不每条日志都写盘
 *
 * `expo-file-system` 的 `write` 是**同步** native 调用（`FileSystemModule.kt` 里是
 * `Function` 而不是 `AsyncFunction`，跑在 JS 线程上）。每条日志一次写盘 = 每帧若干次
 * 同步 IO，卡顿是必然的。这里的策略是「入队 O(1)、批量落盘」：
 *
 * - 入队只是一次数组 push + 字符串长度累加，没有 IO；
 * - 定时器按需启动（有日志才排一次 2s 的 `setTimeout`，空闲时零开销）；
 * - 单次写盘最多 50 行 / 16 KB，写一次不到 1 ms；
 * - 真正危险的是「日志风暴」（比如 axios 拦截器把每个请求都打一遍），所以还有
 *   硬上限：缓冲超过 4000 行 / 512 KB 就直接丢掉最旧的一半，内存和 UI 都不会被拖垮。
 *
 * ## 什么时候一定会刷盘
 *
 * 1. 累计 50 行；
 * 2. 累计 16 KB；
 * 3. 距第一条入队满 2 秒；
 * 4. App 进入 background / inactive（切后台、锁屏、被系统杀之前的最后机会）；
 * 5. 未捕获异常（含 fatal）当场刷；
 * 6. 导出 / 查看 / 清空 之前由调用方显式 `flushLogsNow()`。
 *
 * 缺了第 4 条，崩溃前那几秒的日志正好会丢 —— 而那往往才是关键。
 */

import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { formatLogLine, dayKeyOf, type LogLevel } from './format';
import { LOG_RETENTION_DAYS, appendLogText, cleanupExpiredLogs } from './storage';

const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_LINES = 50;
const FLUSH_BATCH_CHARS = 16 * 1024;
const HARD_MAX_LINES = 4000;
const HARD_MAX_CHARS = 512 * 1024;

const CONSOLE_METHODS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
};

let installed = false;
let pending: string[] = [];
let pendingChars = 0;
let droppedLines = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let currentDayKey = '';
/** 重入保护：格式化/入队过程中万一又触发 console，不递归。 */
let capturing = false;
/**
 * 被替换下来的原 console 方法。
 *
 * 保留引用是为了「只走原生输出、不重复记日志」的场景（例如 ErrorUtils 没有旧处理器时
 * 的兜底转发）——直接用 `console.error` 会被自己的拦截器再记一遍，日志里出现重复行。
 */
const originalConsole: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};

function clearFlushTimer(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLogsNow();
  }, FLUSH_INTERVAL_MS);
}

/**
 * 跨天时做一次轮转清理。
 *
 * 只在真正要写盘时判一次，不额外开定时器：App 长驻后台一整天也不会多耗一次唤醒。
 */
function checkDayRollover(): void {
  const today = dayKeyOf(new Date());
  if (today === currentDayKey) {
    return;
  }
  currentDayKey = today;
  cleanupExpiredLogs(new Date());
}

/** 把缓冲里的日志一次性写给 storage；**同步**完成，返回时已落盘。 */
export function flushLogsNow(): void {
  clearFlushTimer();

  if (pending.length === 0 && droppedLines === 0) {
    return;
  }

  const lines = pending;
  const dropped = droppedLines;
  pending = [];
  pendingChars = 0;
  droppedLines = 0;

  const chunks: string[] = [];
  if (dropped > 0) {
    // 这条本身也要走一遍格式化，保证前缀一致、能被 grep 到。
    chunks.push(formatLogLine('warn', [`[log] 内存缓冲溢出，丢弃最早 ${dropped} 条日志`]));
  }
  for (const line of lines) {
    chunks.push(line);
  }

  try {
    checkDayRollover();
    appendLogText(`${chunks.join('\n')}\n`);
  } catch {
    // appendLogText 内部已经吞异常，这里再兜一层，绝不把异常抛回业务代码。
  }
}

function enqueue(line: string): void {
  // 硬上限：先丢最旧的，再入队。发生在「磁盘一直写不进去」这种极端情况下。
  if (pending.length >= HARD_MAX_LINES || pendingChars >= HARD_MAX_CHARS) {
    const dropCount = Math.max(1, pending.length - Math.floor(HARD_MAX_LINES / 2));
    const removed = pending.splice(0, dropCount);
    droppedLines += removed.length;
    pendingChars = pending.reduce((total, item) => total + item.length, 0);
  }

  pending.push(line);
  pendingChars += line.length;

  if (pending.length >= FLUSH_BATCH_LINES || pendingChars >= FLUSH_BATCH_CHARS) {
    flushLogsNow();
    return;
  }

  scheduleFlush();
}

/** 记一条日志（内部入口，同时给「记录阶段事件」用）。 */
export function captureLog(level: LogLevel, args: unknown[]): void {
  if (capturing) {
    return;
  }
  capturing = true;
  try {
    enqueue(formatLogLine(level, args));
  } catch {
    // 格式化失败就丢掉这一条，绝不能让它冒泡到 console 的调用方。
  } finally {
    capturing = false;
  }
}

function patchConsole(): void {
  // 用 Record 索引写法：console 上这些方法的签名各不相同，逐个赋值 TS 会拧巴。
  const target = console as unknown as Record<string, unknown>;

  for (const method of CONSOLE_METHODS) {
    const original = target[method];
    if (typeof original !== 'function') {
      continue;
    }

    const patched = (...args: unknown[]): void => {
      captureLog(method, args);
      // 必须原样转发：吞掉 console 会让开发期彻底看不见输出。
      try {
        (original as (...forwarded: unknown[]) => void).apply(console, args);
      } catch {
        // 原 console 自己抛异常就随它去，但不能连带把捕获链路炸掉。
      }
    };

    originalConsole[method] = (original as (...forwarded: unknown[]) => void).bind(console);
    target[method] = patched;
  }
}

function patchErrorUtils(): void {
  const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils || typeof errorUtils.setGlobalHandler !== 'function') {
    return;
  }

  const previous = errorUtils.getGlobalHandler?.();

  errorUtils.setGlobalHandler((error, isFatal) => {
    // 先落盘：fatal 之后 JS 环境可能立刻不可用，缓冲里的东西就没机会再写了。
    captureLog('error', [`[js] 未捕获异常${isFatal ? '（fatal）' : ''}`, error]);
    flushLogsNow();

    // 必须把控制权交回原来的处理器，否则红屏 / 崩溃上报全没了。
    if (previous) {
      previous(error, isFatal);
      return;
    }

    // 没有旧处理器时（极少数环境）至少让它还能被看到，但不能走被拦截的 console，
    // 否则同一条异常会在日志里出现两遍。
    originalConsole.error?.(error);
  });
}

function watchAppState(): void {
  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // 回前台时判一次跨天：后台待了一整天，日志该换新文件、旧的该清了。
      checkDayRollover();
      return;
    }
    // background / inactive：切后台、锁屏、上滑 —— 都可能是「最后一次能写的机会」。
    flushLogsNow();
  });
}

function describeRuntime(): string {
  const version = Constants.expoConfig?.version ?? '?';
  const os = `${Platform.OS} ${String(Platform.Version)}`;
  return `v${version} · ${os} · 保留 ${LOG_RETENTION_DAYS} 天`;
}

/**
 * 安装捕获。幂等：重复调用只有第一次生效。
 *
 * 必须在模块作用域（`_layout.tsx` 顶层）调用，而不是放在组件 effect 里 ——
 * 后者会漏掉首帧之前所有模块初始化的日志，而登录态、播放器内核恰好都在那阶段初始化。
 */
export function installLogCapture(): void {
  if (installed) {
    return;
  }
  installed = true;
  currentDayKey = dayKeyOf(new Date());

  // 启动即清理：上次进来可能已经是 8 天前了。
  cleanupExpiredLogs(new Date());

  patchConsole();
  patchErrorUtils();
  watchAppState();

  captureLog('log', [`[log] 会话开始 ${describeRuntime()}`]);
  flushLogsNow();
}
