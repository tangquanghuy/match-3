/**
 * 游戏时间工具（本地日历口径，纯函数）。
 *
 * 网关不自取时钟：调用方（屏层/测试）用这些 helper 算好 `now` /
 * `todayStart` / `weekStart` 再传入——结算首胜、入侵赛季、进贡离线
 * 结算全部因此可测、可复算。
 */

/** 一小时的毫秒数（进贡离线结算的最小刻度） */
export const HOUR_MS = 3_600_000;

/** 本地时区「今日零点」 */
export function todayStartOf(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 本地周历的周起点（周一零点），用于活动与入侵赛季。
 */
export function weekStartOf(now: number): number {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // 周一=0 … 周日=6
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
