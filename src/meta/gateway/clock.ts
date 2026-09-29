/**
 * 游戏时间工具（固定游戏时区，纯函数）。
 *
 * 日界/周界按**固定时区** GAME_UTC_OFFSET_MS 计算，而不是运行环境的本地时区：
 * 权威核心可能跑在浏览器（本地后端）也可能跑在 Cloudflare Worker（UTC），
 * 两边必须对「今天」「本周」得出同一个答案。
 *
 * 写入路径的时刻由权威核心的时钟决定（见 server/env.ts），屏层只用这些 helper 渲染视图。
 */

/** 一小时的毫秒数（进贡离线结算的最小刻度） */
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** 游戏时区：UTC+8（日重置 = 北京时间 0 点） */
export const GAME_UTC_OFFSET_MS = 8 * HOUR_MS;

/** 游戏时区「今日零点」 */
export function todayStartOf(now: number): number {
  return Math.floor((now + GAME_UTC_OFFSET_MS) / DAY_MS) * DAY_MS - GAME_UTC_OFFSET_MS;
}

/** 游戏时区周起点（周一零点），用于活动与入侵赛季。 */
export function weekStartOf(now: number): number {
  const day = Math.floor((now + GAME_UTC_OFFSET_MS) / DAY_MS);
  // 1970-01-01 是周四：周一=0 时它的序号是 3
  const dow = (((day + 3) % 7) + 7) % 7;
  return (day - dow) * DAY_MS - GAME_UTC_OFFSET_MS;
}
