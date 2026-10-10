export type PlayerTrack = {
  /** 播放用音频 hash，全流程主键。本地曲目用 `local:<MediaStore id>`。 */
  hash: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl: string | null;
  albumId?: string;
  albumAudioId?: string;
  durationMs?: number;
  vip?: boolean;
  /** 可用最高音质：sq=无损，hq=320k；缺省为普通音质。 */
  quality?: 'sq' | 'hq';
  /** 歌曲在所属歌单里的实例 ID，仅来自歌单曲目接口；从歌单移除歌曲必须用它。 */
  fileid?: string;
  /**
   * 曲目来源；`local` 表示本地文件，[localUri] 直接就是可播放地址，
   * **跳过在线直链解析**。在线曲目不设此字段。
   */
  source?: 'local';
  /** 本地曲目的播放地址（content:// 或 file://），仅 source === 'local' 时有值。 */
  localUri?: string;
  /** 本地曲目的文件路径（仅用于展示/排查，不用于播放）。 */
  localPath?: string;
};

export type PlayMode = 'sequence' | 'shuffle' | 'single';

export type LyricLine = {
  timeMs: number;
  text: string;
};

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty';
