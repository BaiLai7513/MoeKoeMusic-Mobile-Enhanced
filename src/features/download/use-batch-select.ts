import { useCallback, useMemo, useState } from 'react';

import type { PlayerTrack } from '@/features/player/types';

/**
 * 列表页的「多选」状态。
 *
 * 用 **hash** 作为选中标识：同一首歌在不同列表里 hash 一致，
 * 切页/追加分页后已有的勾选不会丢。
 */
export function useBatchSelect() {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedHashes), [selectedHashes]);

  const enter = useCallback(() => {
    setSelectMode(true);
    setSelectedHashes([]);
  }, []);

  const exit = useCallback(() => {
    setSelectMode(false);
    setSelectedHashes([]);
  }, []);

  const toggle = useCallback((hash: string) => {
    if (!hash) {
      return;
    }
    setSelectedHashes((current) =>
      current.includes(hash) ? current.filter((item) => item !== hash) : [...current, hash]
    );
  }, []);

  /** 全选 / 取消全选（按当前列表已有的曲目）。 */
  const toggleAll = useCallback((tracks: PlayerTrack[]) => {
    const hashes = tracks.map((track) => track.hash).filter(Boolean);
    setSelectedHashes((current) => (current.length >= hashes.length ? [] : hashes));
  }, []);

  return {
    selectMode,
    selectedSet,
    count: selectedHashes.length,
    enter,
    exit,
    toggle,
    toggleAll,
  };
}
