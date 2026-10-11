import { normalizeDurationMs } from '@/lib/format';
import { mobileApi } from '@/lib/kugou-api';
import { readCache, writeCache } from '@/lib/offline-cache';
import { getCurrentAudioQuality } from '@/features/settings/store';

import {
  AUDIO_QUALITIES,
  isAudioQuality,
  qualityFallbackChain,
  type AudioQuality,
} from './audio-quality';
import type { PlayerTrack } from './types';

/** 单曲直链的缓存键前缀（配合 hash 使用）。 */
const SOURCE_CACHE_PREFIX = 'songsource.';

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function toRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(toRecord) : [];
}

function collectUrls(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  return [];
}

/**
 * 「这首歌放不了」的原因。
 *
 * 为什么必须是结构化字段，而不是让调用方去匹配 message：VIP 到手后值不值得重试
 * 完全取决于原因 —— 「缺 VIP」重新解析就可能成功，「无版权」领多少天 VIP 也没用。
 * 靠中文文案判断的话，哪天改一句提示语，自愈逻辑就会静默失效（而且不会报错）。
 */
export type PlaybackUnavailableReason =
  /** 服务端明确说无版权（status 3）—— 与账号身份无关，重试没有意义。 */
  | 'copyright'
  /** 缺 VIP，或服务端没给出更明确的原因 —— 领到 VIP 后值得重新解析一次。 */
  | 'vip'
  /** 本地文件地址缺失 —— 与账号无关。 */
  | 'local-missing';

export class PlaybackUnavailableError extends Error {
  readonly reason: PlaybackUnavailableReason;

  constructor(message: string, reason: PlaybackUnavailableReason) {
    super(message);
    this.reason = reason;
  }
}

export type ResolvedSongSource = {
  uri: string;
  durationMs: number;
  /** 实际拿到地址的音质档位；调用方可用于显示「正在以 FLAC 播放」。 */
  quality: AudioQuality;
  /** 文件扩展名（mp3 / flac / m4a…），下载时用来决定文件名后缀。 */
  extName: string;
};

/** 播放列表里可用的音质候选：某一档位对应的 hash 可能与原曲不同。 */
type QualityCandidate = {
  hash: string;
  quality: AudioQuality;
};

/**
 * 从 `/privilege/lite` 的返回里提取「这个账号在这首歌上真正能听的音质」。
 *
 * 结构：`body.data[]`，每一项还可能带 `relate_goods[]`（关联的不同音质版本）。
 * `level === 0` 表示无权限；`quality` 必须是已知档位。
 */
function extractPrivilegedQualities(body: unknown): QualityCandidate[] {
  const candidates = new Map<AudioQuality, QualityCandidate>();

  for (const item of toRecords(toRecord(body).data)) {
    const goods = [item, ...toRecords(item.relate_goods)];

    for (const good of goods) {
      const hash = typeof good.hash === 'string' ? good.hash : '';
      const quality = good.quality;
      // level === 0 → 该账号没有这一档的权限
      if (!hash || Number(good.level ?? 0) === 0 || !isAudioQuality(quality)) {
        continue;
      }
      if (!candidates.has(quality)) {
        candidates.set(quality, { hash, quality });
      }
    }
  }

  return [...candidates.values()];
}

/**
 * 计算本次要尝试的音质候选列表。
 *
 * 优先尝试「降级链 ∩ 账号特权」—— 命中时可以用上该音质专属的 hash；
 * 特权接口失败或没有交集时，退化为「用原 hash 把整条降级链试一遍」，
 * 这样至少不会因为特权接口异常而完全播不了。
 */
function buildCandidates(
  privileged: QualityCandidate[],
  chain: AudioQuality[],
  fallbackHash: string
): QualityCandidate[] {
  if (privileged.length) {
    const byQuality = new Map(privileged.map((item) => [item.quality, item]));
    const matched = chain
      .map((quality) => byQuality.get(quality))
      .filter((item): item is QualityCandidate => Boolean(item));

    if (matched.length) {
      return matched;
    }
  }

  return chain.map((quality) => ({ hash: fallbackHash, quality }));
}

/**
 * 查询「当前账号在这首歌上真正能听」的音质档位，**从高到低**排列。
 *
 * 用途：下载面板先探测再列选项 —— 只列出真正可下的档位，
 * 用户就不会出现「选了母带却被告知降级为高品」这种挫败感。
 *
 * 查询失败时返回**空数组**（而不是全部档位）：调用方据此回退到「列出全部」，
 * 这样网络异常时功能仍可用。
 */
export async function fetchAvailableQualities(track: PlayerTrack): Promise<AudioQuality[]> {
  try {
    const response = await mobileApi.privilege_lite({
      hash: track.hash,
      album_id: String(track.albumId ?? 0),
    });

    const available = extractPrivilegedQualities(response.body).map((item) => item.quality);
    return [...new Set(available)].sort(
      (a, b) => AUDIO_QUALITIES.indexOf(b) - AUDIO_QUALITIES.indexOf(a)
    );
  } catch (error) {
    console.warn('[songurl] 查询可用音质失败，调用方应回退到全部档位:', error);
    return [];
  }
}

/**
 * 解析歌曲真实播放地址。
 *
 * ## 为什么不是「请求一次 /song/url 就完事」
 *
 * 原实现只请求一次、不指定音质（服务端默认 128）、且传了 `free_part: 1`
 * （→ `IsFreePart: 1`，服务端只返回试听片段），任一档拿不到就直接报「无版权」。
 * 结果是大量**官方客户端能正常播放**的歌在这里被判为不可播。
 *
 * 现在按官方客户端/桌面端的做法：
 * 1. 先查 `/privilege/lite` 拿到该账号在这首歌上**真正可用**的音质及各档 hash
 * 2. 由设置里的目标音质生成降级链（目标 → … → 128）
 * 3. 逐档请求 `/song/url`，跳过 `status !== 1`、`extName === 'mp4'`、无 url 的结果
 * 4. 第一个成功的即采用 —— 「高音质优先，拿不到就降级」
 */
export async function resolveSongSource(
  track: PlayerTrack,
  options?: { quality?: AudioQuality }
): Promise<ResolvedSongSource> {
  // 本地文件：地址现成的，跳过全部在线解析（也不该受音质设置影响）
  if (track.source === 'local') {
    if (!track.localUri) {
      throw new PlaybackUnavailableError('本地文件地址缺失，可能已被删除或移动', 'local-missing');
    }
    return {
      uri: track.localUri,
      durationMs: track.durationMs ?? 0,
      quality: '128',
      extName: guessExtension(track.localUri),
    };
  }

  const target = options?.quality ?? getCurrentAudioQuality();
  const chain = qualityFallbackChain(target);

  let privileged: QualityCandidate[] = [];
  try {
    /*
     * 只传 hash，**不要传 album_id**。
     *
     * 这是对齐桌面版（能正常播放的参照实现）的调用方式：
     *   De("/privilege/lite", { hash: u })
     * 我们之前多传了 album_id，反而可能让服务端按另一版本去匹配。
     */
    const response = await mobileApi.privilege_lite({ hash: track.hash });
    privileged = extractPrivilegedQualities(response.body);
  } catch (error) {
    // 特权接口失败不该导致整首歌播不了，退化为用原 hash 逐档尝试
    console.warn('[player] 查询歌曲特权失败，改为逐档尝试:', error);
  }

  const candidates = buildCandidates(privileged, chain, track.hash);
  let lastStatus = 0;

  // 直链解析是「放不了」类问题的第一现场，保留一条精简诊断日志：
  // 能一眼看出是特权没拿到、还是逐档都失败、还是被 mp4/空 url 挡掉。
  console.log(
    `[songurl] ${track.title} 目标=${target} 降级链=[${chain.join('>')}] 特权档位=[${
      privileged.map((item) => item.quality).join(',') || '无'
    }] 候选=${candidates.length}`
  );

  for (const candidate of candidates) {
    try {
      /*
       * 只传 hash + quality，**不要传 album_id / album_audio_id**。
       *
       * 对齐桌面版：De("/song/url", { hash: V.hash, quality: V.quality })
       *
       * 实测证据：DAMIDAMI 这首歌的 /privilege/lite 明确返回可用档位
       * [128,320,flac,high]，但带上 album_id/album_audio_id 请求 /song/url 时
       * 三档全部返回 status=3（被判无版权）。这两个 ID 来自歌单解析，
       * 指向的可能是另一个版本，与 hash 不匹配时服务端就会拒绝。
       * 各档位自己的 hash 本身已足够定位资源。
       */
      const response = await mobileApi.song_url({
        hash: candidate.hash,
        quality: candidate.quality,
      });

      const body = toRecord(response.body);
      const status = Number(body.status ?? 0);
      lastStatus = status;

      if (status !== 1) {
        console.log(`[songurl] ${candidate.quality} status=${status}，降级下一档`);
        continue;
      }
      // mp4 是视频轨，音频播放器放不了，换下一档
      if (String(body.extName ?? '').toLowerCase() === 'mp4') {
        console.log(`[songurl] ${candidate.quality} 返回 mp4，降级下一档`);
        continue;
      }

      const urls = [
        ...collectUrls(body.url),
        ...collectUrls(body.backupUrl),
        ...collectUrls(body.backup_url),
      ];
      if (!urls.length) {
        console.log(`[songurl] ${candidate.quality} 无 url，降级下一档`);
        continue;
      }

      console.log(`[songurl] ${track.title} → ${candidate.quality} 解析成功`);
      const resolved: ResolvedSongSource = {
        uri: urls[0],
        durationMs: normalizeDurationMs(body.timeLength) || track.durationMs || 0,
        quality: candidate.quality,
        extName: String(body.extName ?? '').toLowerCase() || 'mp3',
      };

      // 记下直链供离线重放。
      // 播放缓存的键是**歌曲 hash**，所以即使这条 URL 之后过期，
      // 只要音频已进缓存，CacheDataSource 仍能从本地读出内容。
      void writeCache(SOURCE_CACHE_PREFIX + track.hash, resolved);

      return resolved;
    } catch (error) {
      // 单档失败继续试下一档；全部失败后由下面的统一错误兜底
      console.log(`[songurl] ${candidate.quality} 请求异常，降级下一档:`, error);
      continue;
    }
  }

  console.warn(`[songurl] ${track.title} 全部档位均失败，最后 status=${lastStatus}`);

  // 离线兜底：改用上次解析出的直链。
  //
  // 这不是「假装成功」——播放缓存的键是歌曲 hash，只要这首歌之前播过、
  // 音频已落盘，CacheDataSource 就会直接从本地读出来，根本不需要这个 URL 可达。
  // 如果这首歌没缓存过，后续仍会正常报错，与不兜底时的结果一致。
  const cachedSource = await readCache<ResolvedSongSource>(SOURCE_CACHE_PREFIX + track.hash);
  if (cachedSource?.uri) {
    console.log(`[songurl] ${track.title} 在线解析失败，改用上次的直链（离线重放）`);
    return cachedSource;
  }

  // status 3 = 无版权（服务端明确告知），其余按「需要 VIP / 暂不可播」处理
  if (lastStatus === 3) {
    throw new PlaybackUnavailableError('这首歌暂无版权，无法播放', 'copyright');
  }

  throw new PlaybackUnavailableError('这首歌需要 VIP 或暂不可播放', 'vip');
}

/** 从本地地址里猜扩展名，仅用于展示与下载命名。 */
function guessExtension(uri: string): string {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(uri);
  return match ? match[1].toLowerCase() : 'mp3';
}
