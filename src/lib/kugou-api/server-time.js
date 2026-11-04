'use strict';

/**
 * 服务端时钟校准：HTTP `Date` 响应头 → 设备时钟偏移。
 *
 * ## 为什么需要它
 *
 * 「每日 VIP 的下次可领取时间」是一个**绝对时间戳**，判断到期必须拿「现在」去比。
 * 而设备时钟可以被用户随手改：往后调一天，任何基于 `Date.now()` 的判断都会立刻认为
 * 「已到期」并触发领取。所以「现在」要优先用**服务端时间**校准：
 * 每个 API 响应都带一个 `Date` 头，拿它跟本地时间求差得到偏移量，
 * 之后统一用 `Date.now() + offset` 当「可信现在」。
 *
 * ## 为什么放在适配层（而不是改 api/ 子模块）
 *
 * `api/` 是外部子模块，随上游升级漂移。这里在**我们自己的适配层**给同一个 axios
 * 实例挂一个响应拦截器：零额外请求（领取/查资料本来就要发请求，Date 头是白送的），
 * 也不用碰子模块源码。
 *
 * ## 精度说明
 *
 * `Date` 头只精确到秒，且它是服务端**生成响应**的时刻，比客户端收到时早约半个 RTT。
 * 对「24 小时」这个量级完全够用（误差 < 1s），不值得为它单独做一次校时请求。
 */

/** HTTP 日期头只认 RFC 7231 里的 GMT 形式（`Wed, 21 Oct 2015 07:28:00 GMT`）。 */
const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/**
 * 手写解析而不是 `Date.parse`：Hermes 对非 ISO 格式的支持并不完整，
 * 而 HTTP 日期恰好是「非 ISO」那一类 —— 一旦解析失败，校准会静默失效。
 */
function parseHttpDate(value) {
  const match =
    /^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT$/.exec(
      value.trim()
    );
  if (!match) {
    return 0;
  }

  const month = MONTHS[match[2]];
  if (month === undefined) {
    return 0;
  }

  return Date.UTC(
    Number(match[3]),
    month,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
}

/** 超过 7 天的偏移一定是坏样本（设备时间被改得很离谱，或代理返回了伪造的 Date）。 */
const MAX_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

let offsetMs = 0;
let samples = 0;

/**
 * 记一次服务端时间样本。
 *
 * 第一个样本直接采用（冷启动就能校准），之后用 1/4 步长平滑：
 * 网络抖动带来的误差通常远小于系统时钟的漂移，平滑能避免个别慢响应把偏移带歪。
 */
function noteServerDateHeader(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }

  const serverNow = parseHttpDate(value);
  if (!serverNow) {
    return;
  }

  const next = serverNow - Date.now();
  if (!Number.isFinite(next) || Math.abs(next) > MAX_OFFSET_MS) {
    return;
  }

  offsetMs = samples === 0 ? next : offsetMs + (next - offsetMs) / 4;
  samples += 1;
}

/**
 * 直接采用一个已知偏移（来自原生 SharedPreferences 里持久化的那一份）。
 *
 * 冷启动时 JS 还没来得及发任何请求，但原生侧存着上次校准的结果 ——
 * 先拿它当「可信现在」的起点，比默认 0 好得多。
 */
function adoptServerClockOffset(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_OFFSET_MS) {
    return;
  }

  offsetMs = value;
  if (samples === 0) {
    samples = 1;
  }
}

function getServerClockOffsetMs() {
  return offsetMs;
}

function resetServerClock() {
  offsetMs = 0;
  samples = 0;
}

module.exports = {
  noteServerDateHeader,
  adoptServerClockOffset,
  getServerClockOffsetMs,
  resetServerClock,
};
