/**
 * 设置页用的日志统计快照。
 *
 * 为什么不直接在组件里 `getLogsStats()`：`useSyncExternalStore` 要求 `getSnapshot`
 * 在两次渲染之间返回**同一个引用**，否则会无限重渲染。所以这里自己维护一份不可变快照，
 * 只有显式 `refreshLogsStats()` 才替换它。
 *
 * 统计本身是同步 native 调用（列目录 + 读每个文件 size），只有 ≤7 个文件，
 * 但仍然是 IO —— 所以只在挂载、清空、导出之后各刷一次，不在渲染路径里跑。
 */

import { useSyncExternalStore } from 'react';

import { getLogsStats, type LogsStats } from './storage';

export type LogsStatsSnapshot = LogsStats & {
  /** 是否已经查过一次（首帧为 false，用来避免闪一下 0 个文件）。 */
  loaded: boolean;
};

const INITIAL_SNAPSHOT: LogsStatsSnapshot = { fileCount: 0, totalBytes: 0, loaded: false };

let snapshot: LogsStatsSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 重新读一次磁盘统计；没有变化时保持旧引用，避免无意义的重渲染。 */
export function refreshLogsStats(): void {
  const stats = getLogsStats();
  if (
    snapshot.loaded &&
    snapshot.fileCount === stats.fileCount &&
    snapshot.totalBytes === stats.totalBytes
  ) {
    return;
  }
  snapshot = { ...stats, loaded: true };
  emit();
}

export function useLogsStats(): LogsStatsSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL_SNAPSHOT
  );
}
