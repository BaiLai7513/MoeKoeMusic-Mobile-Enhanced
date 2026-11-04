/**
 * `server-time.js` 的类型声明（与 `runtime.d.ts` 同一套做法：
 * 项目只对 .ts 开启类型检查，纯 JS 适配层用 d.ts 描述）。
 */

/** 记一次服务端时间样本（HTTP `Date` 头）。非法值会被静默忽略。 */
export declare function noteServerDateHeader(value: unknown): void;

/** 直接采用一个已知偏移（原生持久化的那一份）。 */
export declare function adoptServerClockOffset(value: number): void;

/** 当前「服务端时间 - 设备时间」的偏移（毫秒）。 */
export declare function getServerClockOffsetMs(): number;

/** 清空校准结果（退出登录 / 测试用）。 */
export declare function resetServerClock(): void;
