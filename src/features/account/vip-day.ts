/**
 * 「VIP 的一天」= **东八区（UTC+8）每日零点**为界的自然日。
 *
 * ## 为什么是「零点」而不是某个固定时刻
 *
 * 每日领取额度在服务端是按日算的，而用户能观察到的规则是：**换日之后就能再领一次**
 * ——19:17 领过的那次，第二天 05:27 就又领到了，中间只隔 10 小时，说明并不是「+24h」。
 *
 * 早先由观测校准推出过 00:28、后来又被改成固定 04:00，两个都是**保守猜测**：
 * 只会让 00:00–04:00 的额度白等一晚，还让「可领取时间」这个概念与用户的直觉
 * （过了零点就是新的一天）对不上。现在用最朴素也最好解释的口径：**东八区零点换日**。
 *
 * ## 集中在这里的原因
 *
 * 「今天」被四处共用：按天标记（自动/手动领取、两次升级）、SVIP 每日记录、
 * 发给服务端的 `receive_day`、闹钟排期、各种跨零点守卫。四处各抄一份迟早会漂移。
 */

/** 每日重置的小时（东八区）：零点。 */
export const VIP_DAY_RESET_HOUR = 0;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 东八区相对 UTC 的固定偏移：中国不实行夏令时，全年恒定。 */
const UTC8_OFFSET_MS = 8 * HOUR_MS;

/**
 * 当前「VIP 日」的日期串（`YYYY-MM-DD`），按东八区换日。
 *
 * 实现上是「把时间轴搬到东八区，再取日期」。取值一律走 `getUTCxxx`：
 * 设备时区不能参与运算，否则「今天」会跟着用户所在的时区漂。
 */
export function vipDayKey(now: number = Date.now()): string {
  const shifted = new Date(now + UTC8_OFFSET_MS - VIP_DAY_RESET_HOUR * HOUR_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/**
 * 下一个 VIP 日开始的绝对时间戳 = **下一个东八区零点**。
 *
 * 先由 `vipDayKey` 反解出当前 VIP 日的起点，再加一天。UTC+8 没有夏令时，一天恒为
 * 24 小时，所以这里可以直接加 `DAY_MS` —— 也正因为如此，不能改回 `setHours(24,…)`
 * 那套「设备本地」算法。
 *
 * 它唯一的用途是**排闹钟**（换日之后叫醒 App 去领），不再参与「能不能领」的判断：
 * 那个判断只看「本 VIP 日领过没有」。
 */
export function nextVipDayStartMs(now: number = Date.now()): number {
  const [year, month, day] = vipDayKey(now).split('-').map(Number);
  const startOfVipDay =
    Date.UTC(year, month - 1, day, VIP_DAY_RESET_HOUR, 0, 0, 0) - UTC8_OFFSET_MS;
  return startOfVipDay + DAY_MS;
}

/**
 * 一份 VIP 的时长：**24 小时**，到期时间 = 发放的那一刻 + 24h。
 *
 * 依据是真机实测的 `/user/vip/detail`（见 vip-api 的 `parseVipStatus`）：
 * 一次「先领畅听 VIP、隔几秒再升级概念版」之后，服务端同时给出两条独立记录 ——
 * `svip` 到期 `09:39:04`、`tvip` 到期 `08:52:18`，而这两个时刻正是两次发放各自的时刻。
 * 也就是说**每份都是从自己被发放的那一刻起算 24 小时**，谁也不会把谁合并掉。
 */
export const VIP_GRANT_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * 这次发放能听到什么时候（毫秒时间戳）= **现在 + 24 小时**。
 *
 * 为什么不用「今天零点」（那是早先的保守估计）：既然实测确认每份都是「发放时刻 + 24h」，
 * 写成今天零点就会**系统性偏短** —— 08:00 领的到当天 24:00 就被本地判成过期，后半天
 * 每次开播都会白发一次领取请求（服务端回 131001），而用户其实还有 8 小时 VIP。
 *
 * 与 vip-api 的口径一致：那边的权威值取「所有有效记录里最晚的到期时间」，
 * 这里是最新一次发放的到期时间 —— 两者都是「还能听多久 = 最晚的那个」这同一个语义。
 */
export function vipGrantExpiry(now: number = Date.now()): number {
  return now + VIP_GRANT_DURATION_MS;
}
