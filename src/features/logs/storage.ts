/**
 * 运行日志的落盘层：目录约定、按天分文件、单文件上限、7 天轮转、读取/清空/统计。
 *
 * ## 为什么用 `expo-file-system` 的新 API（`File` / `Directory` / `Paths`）
 *
 * SDK 57 装的是 expo-file-system@57.0.1，包根导出的是**新**的对象式 API
 * （`node_modules/expo-file-system/package.json` 的 `exports["."] → ./src/index.ts`，
 * 该文件只导出 `Paths` / `File` / `Directory`）；老的 `getInfoAsync` / `writeAsStringAsync`
 * 那一套被挪到了 `expo-file-system/legacy` 子路径。这里要的是新 API 的
 * `write(content, { append: true })` —— 原生侧是真 append（见报告里的 Kotlin 证据），
 * 不需要「读全文再拼回去」，这是日志热路径能扛住的前提。
 *
 * ## 为什么按天一个文件
 *
 * 直接的好处是 7 天轮转 = 删文件，不用改写内容；出问题时也只要捡其中一天。
 * 文件名用本地时区的 `YYYY-MM-DD.log`，字符串字典序 == 日期序，清理时不用解析。
 *
 * ## 全部函数都吞异常
 *
 * 日志是排障工具，它自己没有资格让 App 崩掉或卡住。任何一个 native 调用失败都只是
 * 「这次没记上」，绝不上抛。调用方（capture.ts）也不再二次捕获。
 */

import { Directory, File, Paths } from 'expo-file-system';

import { dayKeyOf, formatBytes, formatTime } from './format';

/** 目录名。放在 documentDirectory 下：不会被系统在低存储时清掉。 */
const LOG_DIR_NAME = 'logs';

/** 只保留最近 7 天（含今天）。 */
export const LOG_RETENTION_DAYS = 7;

/** 单文件上限 2 MB，超了只留尾部。 */
export const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024;

/** 单日文件名的格式；也只有匹配它的文件会被统计/清理/导出。 */
const DAY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.log$/;

/**
 * 超限截断时保留的字符数。
 *
 * 取 `MAX_LOG_FILE_BYTES / 4`：UTF-8 里一个 UTF-16 码元最多占 3 字节（BMP 汉字），
 * 代理对是 4 字节/2 码元 = 2 字节/码元，所以「保留 N/4 个字符」在数学上一定 ≤ N 字节。
 * 保守取值的好处是不用在这里依赖 TextEncoder（Hermes 不一定有）。
 */
const TRIM_KEEP_CHARS = Math.floor(MAX_LOG_FILE_BYTES / 4);

export type LogFileRecord = {
  /** `YYYY-MM-DD` */
  dayKey: string;
  name: string;
  uri: string;
  /** 字节数 */
  size: number;
  /** 最后修改时间（毫秒）；拿不到时为 0 */
  modifiedAt: number;
};

export type LogsStats = {
  fileCount: number;
  totalBytes: number;
};

let cachedDirectory: Directory | null = null;
let directoryFailed = false;

/**
 * 拿到（必要时创建）日志目录。
 *
 * 失败后置 `directoryFailed` 记忆化：否则每条日志都会重试一次 native 创建，
 * 在「存储确实不可用」的设备上会变成持续的 IO 噪音。
 */
export function getLogsDirectory(): Directory | null {
  if (cachedDirectory) {
    return cachedDirectory;
  }
  if (directoryFailed) {
    return null;
  }

  try {
    const directory = new Directory(Paths.document, LOG_DIR_NAME);
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true });
    }
    cachedDirectory = directory;
    return directory;
  } catch {
    directoryFailed = true;
    return null;
  }
}

/** 日志目录的 `file://` 地址，供设置页展示/排障用。拿不到时返回空串。 */
export function getLogsDirectoryUri(): string {
  return getLogsDirectory()?.uri ?? '';
}

function toRecord(item: File): LogFileRecord | null {
  const matched = DAY_FILE_PATTERN.exec(item.name);
  if (!matched) {
    return null;
  }

  let size = 0;
  let modifiedAt = 0;
  try {
    size = item.size;
  } catch {
    size = 0;
  }
  try {
    // `lastModified` 是新 API 的推荐字段，`modificationTime` 已标 deprecated，只做兜底。
    modifiedAt = item.lastModified ?? item.modificationTime ?? 0;
  } catch {
    modifiedAt = 0;
  }

  return { dayKey: matched[1], name: item.name, uri: item.uri, size, modifiedAt };
}

/** 按日期升序列出所有日志文件；目录不存在/读取失败时返回空数组。 */
export function listLogFiles(): LogFileRecord[] {
  const directory = getLogsDirectory();
  if (!directory) {
    return [];
  }

  try {
    const records: LogFileRecord[] = [];
    for (const item of directory.list()) {
      if (!(item instanceof File)) {
        continue;
      }
      const record = toRecord(item);
      if (record) {
        records.push(record);
      }
    }
    return records.sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0));
  } catch {
    return [];
  }
}

export function getLogsStats(): LogsStats {
  const records = listLogFiles();
  let totalBytes = 0;
  for (const record of records) {
    totalBytes += record.size;
  }
  return { fileCount: records.length, totalBytes };
}

/**
 * 单文件超过上限时，只保留尾部。
 *
 * 为什么是「截断」而不是「滚动到 .1 备份」：备份会让「7 天」变成「7 天 + 若干备份」，
 * 统计、清理、导出都要跟着处理多套文件名；而排障真正要看的是**最近**的那段日志，
 * 保住尾部比保住开头有用得多。
 */
function trimLogFile(file: File): void {
  const text = file.textSync();
  const tail = text.slice(Math.max(0, text.length - TRIM_KEEP_CHARS));
  // 从第一个换行后开始，避免留下半行 —— 半行日志比没有日志更误导人。
  const lineStart = tail.indexOf('\n');
  const body = lineStart >= 0 ? tail.slice(lineStart + 1) : tail;
  const marker =
    `…… ${formatTime(new Date())} [WARN] [log] 单日日志已超过 ${formatBytes(MAX_LOG_FILE_BYTES)}，` +
    '只保留最近的尾部内容（更早的部分已丢弃）\n';

  file.write(`${marker}${body}`);
}

/**
 * 追加一段已格式化好的日志。
 *
 * 调用方已经把多行拼成一段，这里只做一次 native 写，避免每条日志一次 IO。
 */
export function appendLogText(text: string, now: Date = new Date()): void {
  if (!text) {
    return;
  }

  const directory = getLogsDirectory();
  if (!directory) {
    return;
  }

  try {
    const file = new File(directory, `${dayKeyOf(now)}.log`);
    // `size` 对不存在的文件返回 0，不用先判 exists。
    if (file.size >= MAX_LOG_FILE_BYTES) {
      trimLogFile(file);
    }
    // 新 API 原生支持 append（FileOutputStream(file, true)），不会把已有内容读回来重写。
    file.write(text, { append: true });
  } catch {
    // 写不进去就算了：可能是磁盘满 / 目录被安全软件锁住，都不该影响 App 主流程。
  }
}

/**
 * 清理过期日志：同时按「文件名日期」和「mtime」两条线判断。
 *
 * 两条线都要，是因为它们各自会漏：
 * - 只按文件名：用户改了系统时间（或时区），文件名可能落在未来，永远清不掉。
 * - 只按 mtime：文件被复制/恢复后 mtime 会刷新，旧内容就赖着不走了。
 */
export function cleanupExpiredLogs(now: Date = new Date()): number {
  const records = listLogFiles();
  if (records.length === 0) {
    return 0;
  }

  // 用「日历日减 6 天」而不是减毫秒：跨月/闰年/夏令时都不会算错。
  // 保留 7 天 = 今天 + 前 6 天，所以阈值是今天往前数第 7 天。
  const cutoffDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (LOG_RETENTION_DAYS - 1)
  );
  const cutoffKey = dayKeyOf(cutoffDay);
  const cutoffMs = cutoffDay.getTime();

  let removed = 0;
  for (const record of records) {
    const expiredByDay = record.dayKey < cutoffKey;
    const expiredByTime = record.modifiedAt > 0 && record.modifiedAt < cutoffMs;
    if (!expiredByDay && !expiredByTime) {
      continue;
    }

    try {
      new File(record.uri).delete();
      removed += 1;
    } catch {
      // 删不掉（被占用）就留着，下一轮再说。
    }
  }

  return removed;
}

/** 读某个日志文件的全文；失败返回空串。 */
export async function readLogFileText(uri: string): Promise<string> {
  try {
    return await new File(uri).text();
  } catch {
    return '';
  }
}

export type TodayLog = {
  dayKey: string;
  text: string;
  bytes: number;
  lines: number;
};

/** 读今天的日志（只读用途：设置页统计 / 「查看今日」页面）。 */
export async function readTodayLog(): Promise<TodayLog> {
  const today = dayKeyOf(new Date());
  const record = listLogFiles().find((item) => item.dayKey === today);
  if (!record) {
    return { dayKey: today, text: '', bytes: 0, lines: 0 };
  }

  const text = await readLogFileText(record.uri);
  return {
    dayKey: today,
    text,
    bytes: record.size,
    lines: text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0,
  };
}

export type LogFileContent = { dayKey: string; size: number; text: string };

/** 读全部（已被 7 天限制住的）日志，按日期升序，供导出合并。 */
export async function readAllLogsForExport(): Promise<LogFileContent[]> {
  const records = listLogFiles();
  const result: LogFileContent[] = [];
  for (const record of records) {
    const text = await readLogFileText(record.uri);
    if (text) {
      result.push({ dayKey: record.dayKey, size: record.size, text });
    }
  }
  return result;
}

/** 删除全部日志文件，返回删除个数。 */
export function deleteAllLogs(): number {
  let removed = 0;
  for (const record of listLogFiles()) {
    try {
      new File(record.uri).delete();
      removed += 1;
    } catch {
      // 同上：删不掉就留到下一轮清理。
    }
  }
  return removed;
}
