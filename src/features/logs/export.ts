/**
 * 导出：把最近 7 天的日志合并成**一份文档**，保存到用户在系统文件选择器里挑的目录。
 *
 * ## 为什么不再走「分享面板」
 *
 * 原来的做法是把正文塞进 `Share.share()` 的 `EXTRA_TEXT`：Android 的分享走 Binder，
 * 单次事务约 1 MB，7 天日志很容易超，只能截断成「最近 180 KB」再发 —— 用户拿到的是
 * 残篇，而且落在哪个 App 里取决于他点了谁。需求改成「导出为文档文件、存到用户指定目录」
 * 之后，走 **SAF（Storage Access Framework）目录选择**：
 *
 * - `Directory.pickDirectoryAsync()`（expo-file-system 新 API）拉系统目录选择器，
 *   返回的 `Directory` 就是一个可写的 SAF 文档目录；
 * - `directory.createFile(name, 'text/plain')` 在里面建文件，`write()` 直接落盘；
 * - 用户自己挑位置（下载 / 文档 / 网盘同步目录都行），文件是真文件，不会被截断。
 *
 * 取消选择不算失败：`pickDirectoryAsync` 在用户返回时抛异常/回空，这里映射成
 * `cancelled`，调用方不要弹「导出失败」。
 *
 * ## 回退
 *
 * 拿不到目录选择器（老系统 / 平台不支持 / 抛了非取消异常）时，退回 App 私有目录
 * （cache），并把完整路径告诉用户 —— 至少文件是完整的，还能用系统文件管理器取走。
 */

import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { flushLogsNow } from './capture';
import { formatBytes, formatTime } from './format';
import { LOG_RETENTION_DAYS, readAllLogsForExport } from './storage';

/** 回退目录（App 私有 cache）：不占「7 天日志」的额度，系统低存储时也能自己回收。 */
const EXPORT_DIR_NAME = 'logs-export';

/** 回退目录里最多留几份导出文件，防止这里变成第二个无限增长的目录。 */
const KEEP_EXPORT_FILES = 3;

const SEPARATOR = '='.repeat(56);

export type ExportResult =
  | {
      ok: true;
      /** 文件的 `file://` / `content://` 地址。 */
      uri: string;
      /** 文件名（导出成功提示里用）。 */
      name: string;
      bytes: number;
      fileCount: number;
      /** 用户选中的目录地址；回退到 App 私有目录时为空串。 */
      savedTo: string;
      /** true = 没能让用户选目录，落在 App 私有目录里。 */
      fallback: boolean;
    }
  | { ok: false; reason: 'empty' | 'cancelled' | 'save-failed'; error?: string };

export type MergedLog = { text: string; fileCount: number; bytes: number };

function stampForFileName(now: Date): string {
  // "2026-11-03 19:30:00.000" → "20261103193000"
  return formatTime(now).replace(/[-:. ]/g, '').slice(0, 14);
}

function buildHeader(fileCount: number, totalBytes: number, now: Date): string {
  const version = Constants.expoConfig?.version ?? '?';
  return [
    'MoeKoe 运行日志导出',
    `生成时间: ${formatTime(now)}`,
    `应用版本: v${version} · ${Platform.OS} ${String(Platform.Version)}`,
    `日志范围: 最近 ${LOG_RETENTION_DAYS} 天，共 ${fileCount} 个文件（${formatBytes(totalBytes)}）`,
    // 脱敏已按需求关闭（见 logs/redact.ts 的开关），所以这里必须如实说明 ——
    // 原来那句「已脱敏，可以放心发给开发者」现在是错的，留着会误导用户把凭据发出去。
    '内容说明: 原始日志（未脱敏），可能包含账号标识与接口凭据，请勿公开分享',
    SEPARATOR,
    '',
  ].join('\n');
}

/**
 * 合并最近 7 天的日志。
 *
 * 先 flush 再读：否则内存缓冲里最后几秒的日志（往往就是出问题那段）不在文件里。
 */
export async function mergeRecentLogs(): Promise<MergedLog> {
  flushLogsNow();

  const files = await readAllLogsForExport();
  const totalBytes = files.reduce((sum, item) => sum + item.size, 0);
  const now = new Date();

  const sections = files.map(
    (item) => `##### ${item.dayKey}.log（${formatBytes(item.size)}） #####\n${item.text.trimEnd()}\n`
  );

  return {
    text: `${buildHeader(files.length, totalBytes, now)}\n${sections.join('\n')}`,
    fileCount: files.length,
    bytes: totalBytes,
  };
}

function getExportDirectory(): Directory | null {
  try {
    const directory = new Directory(Paths.cache, EXPORT_DIR_NAME);
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true });
    }
    return directory;
  } catch {
    return null;
  }
}

/** 只保留最近 KEEP_EXPORT_FILES 份回退文件（按文件名里的时间戳排序）。 */
function pruneExportDirectory(directory: Directory): void {
  try {
    const names = directory
      .list()
      .filter((item): item is File => item instanceof File)
      .map((item) => item.name)
      .sort()
      .reverse();

    for (const name of names.slice(KEEP_EXPORT_FILES)) {
      try {
        new File(directory, name).delete();
      } catch {
        // 删不掉就留着，不影响这次导出。
      }
    }
  } catch {
    // 清理失败无所谓。
  }
}

/** 用户按返回键取消选择时，原生抛的异常各平台措辞不同，只做宽松匹配。 */
function isCancellation(error: unknown): boolean {
  const text = String((error as { message?: unknown })?.message ?? error);
  return /cancel|dismiss|abort/i.test(text);
}

function writeFallback(merged: MergedLog, name: string): ExportResult {
  const directory = getExportDirectory();
  if (!directory) {
    return { ok: false, reason: 'save-failed', error: 'no-directory' };
  }

  try {
    const file = new File(directory, name);
    file.write(merged.text);
    pruneExportDirectory(directory);
    return {
      ok: true,
      uri: file.uri,
      name,
      bytes: merged.text.length,
      fileCount: merged.fileCount,
      savedTo: '',
      fallback: true,
    };
  } catch (error) {
    return { ok: false, reason: 'save-failed', error: String(error) };
  }
}

/**
 * 导出主入口：合并 → 让用户选目录 → 写文档。
 *
 * 返回值给设置页决定弹什么：`cancelled` 静默（用户自己取消的，不该报错），
 * `empty` 说明没日志可导，`save-failed` 才是真的失败。
 */
export async function exportLogs(): Promise<ExportResult> {
  let merged: MergedLog;
  try {
    merged = await mergeRecentLogs();
  } catch (error) {
    return { ok: false, reason: 'save-failed', error: String(error) };
  }

  if (merged.fileCount === 0) {
    return { ok: false, reason: 'empty' };
  }

  const now = new Date();
  const name = `MoeKoe-logs-${stampForFileName(now)}.txt`;

  let directory: Directory | null = null;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isCancellation(error)) {
      return { ok: false, reason: 'cancelled' };
    }
    // 平台不支持 / 没有文件管理器：不当作失败，退回 App 私有目录
    console.warn('[log] 目录选择器不可用，退回 App 私有目录:', error);
  }

  if (!directory) {
    return writeFallback(merged, name);
  }

  try {
    // SAF 目录里必须用 createFile（mimeType 决定系统给什么图标、用什么 App 打开），
    // 直接 new File(dir, name) 在部分 Android 版本上建不出来。
    const file = directory.createFile(name, 'text/plain');
    file.write(merged.text);
    return {
      ok: true,
      uri: file.uri,
      name,
      bytes: merged.text.length,
      fileCount: merged.fileCount,
      savedTo: directory.uri,
      fallback: false,
    };
  } catch (error) {
    return { ok: false, reason: 'save-failed', error: String(error) };
  }
}
