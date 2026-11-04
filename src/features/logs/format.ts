/**
 * 运行日志的格式化工具：时间戳、标签、安全序列化、可读体积。
 *
 * 这里刻意不引第三方序列化库（不动 npm 依赖），而是手写一个「永不抛异常」的
 * `JSON.stringify` 包装：日志是排障手段，它自己绝不能成为新的崩溃源。
 */

import { redactLogText } from './redact';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** 落盘用的级别标签。用 3~5 个大写字母，方便在日志里 grep。 */
export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

/** 没有 `[tag]` 前缀的日志统一挂到这个标签下。 */
export const DEFAULT_LOG_TAG = 'app';

/**
 * 单条日志的最大字符数。
 *
 * 为什么需要上限：项目里有把整个接口响应 `console.log` 出来的地方（VIP 链路），
 * 一条就能有几十万字符。不截断的话单条日志就能顶满整个文件，把真正有用的上下文挤走。
 */
export const MAX_LOG_LINE_CHARS = 4000;

/** 序列化对象时的硬上限，比行上限宽松：留出余量给「先序列化 → 再脱敏 → 最后截断」。 */
const MAX_SERIALIZED_CHARS = 32000;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** 本地时区的 `YYYY-MM-DD`，同时用作日志文件名。 */
export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 本地时区的 `YYYY-MM-DD HH:mm:ss.SSS`。 */
export function formatTime(date: Date): string {
  return (
    `${dayKeyOf(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}`
  );
}

/** 可读体积，用于设置页与导出文件的头部。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function safeJson(value: unknown): string {
  // 循环引用会让 JSON.stringify 抛 TypeError，WeakSet 记一下访问过的对象。
  const seen = new WeakSet<object>();
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') {
      return `${item}n`;
    }
    if (typeof item === 'function') {
      return `[function ${(item as { name?: string }).name || 'anonymous'}]`;
    }
    if (item instanceof Error) {
      return { name: item.name, message: item.message };
    }
    if (item instanceof Map) {
      return Array.from(item.entries());
    }
    if (item instanceof Set) {
      return Array.from(item.values());
    }
    if (item && typeof item === 'object') {
      if (seen.has(item)) {
        return '[循环引用]';
      }
      seen.add(item);
    }
    return item;
  });

  return text ?? String(value);
}

function describeError(error: Error): string {
  const head = `${error.name || 'Error'}: ${error.message || ''}`.trim();
  const stack = typeof error.stack === 'string' ? error.stack.slice(0, 2000) : '';
  return stack ? `${head}\n${stack}` : head;
}

/**
 * 把任意值转成可写进日志的字符串。
 *
 * 任何一步失败都退回惰性描述（`Object.prototype.toString`），保证函数本身不抛异常 ——
 * 否则 `console.log` 被拦截后反而会让业务代码崩掉，这是绝对不能接受的。
 */
export function safeSerialize(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null) {
    return 'null';
  }

  const kind = typeof value;
  if (kind === 'undefined') {
    return 'undefined';
  }
  if (kind === 'number' || kind === 'boolean' || kind === 'bigint') {
    return String(value);
  }
  if (kind === 'symbol') {
    return String(value);
  }
  if (kind === 'function') {
    return `[function ${(value as { name?: string }).name || 'anonymous'}]`;
  }
  if (value instanceof Error) {
    return describeError(value);
  }

  try {
    const text = safeJson(value);
    return text.length > MAX_SERIALIZED_CHARS
      ? `${text.slice(0, MAX_SERIALIZED_CHARS)} …（+${text.length - MAX_SERIALIZED_CHARS} 字符已省略）`
      : text;
  } catch {
    try {
      return Object.prototype.toString.call(value);
    } catch {
      return '[不可序列化的值]';
    }
  }
}

/**
 * 从参数里认出 `[vip]` 这类标签。
 *
 * 项目里大量日志把标签写在第一个入参开头，直接保留会和格式化前缀里的标签重复，
 * 所以这里把开头那个 `[xxx]` 摘出来，后面不再重复输出。
 */
export function extractTag(args: unknown[]): { tag: string; rest: unknown[] } {
  const first = args[0];
  if (typeof first !== 'string') {
    return { tag: DEFAULT_LOG_TAG, rest: args };
  }

  const matched = /^\[([^\]\n]{1,24})\]\s*/.exec(first);
  if (!matched) {
    return { tag: DEFAULT_LOG_TAG, rest: args };
  }

  // 标签里不能有方括号/换行，否则日志会出现两个 `]`，后续 grep 解析会错位。
  const tag = matched[1].replace(/[[\]\r\n]/g, '').trim() || DEFAULT_LOG_TAG;
  return { tag, rest: [first.slice(matched[0].length), ...args.slice(1)] };
}

/**
 * 拼一行最终日志：`时间戳 [级别] [标签] 内容`。
 *
 * 顺序是「序列化 → 脱敏 → 截断」：
 * 先脱敏再截断，避免把 `token=abcdef…` 从中间切开后留下半截凭据。
 */
export function formatLogLine(level: LogLevel, args: unknown[], now: Date = new Date()): string {
  const { tag, rest } = extractTag(args);
  const body = rest
    .map((item) => safeSerialize(item))
    .join(' ')
    .trim();

  const redacted = redactLogText(body);
  const content =
    redacted.length > MAX_LOG_LINE_CHARS
      ? `${redacted.slice(0, MAX_LOG_LINE_CHARS)} …（+${redacted.length - MAX_LOG_LINE_CHARS} 字符已省略）`
      : redacted;

  return `${formatTime(now)} [${LOG_LEVEL_LABELS[level]}] [${tag}] ${content}`;
}
