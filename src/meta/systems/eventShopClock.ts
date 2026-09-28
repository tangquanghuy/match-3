import { EVENT_SHOP_REFRESH_DAYS } from '../data/events';
import { DAY_MS, todayStartOf } from '../gateway/clock';

/** 2026-01-01 游戏时区零点所在的日序号 */
const ANCHOR_DAY = Math.round((todayStartOf(Date.UTC(2026, 0, 1, 12)) ) / DAY_MS);

/** Fixed two-calendar-day windows at game-timezone midnight; never restarted on login or Monday. */
export function eventShopPeriodOf(now: number): { start: number; end: number; index: number } {
  const today = todayStartOf(now);
  const day = Math.round(today / DAY_MS);
  const index = Math.floor((day - ANCHOR_DAY) / EVENT_SHOP_REFRESH_DAYS);
  const start = today - (day - ANCHOR_DAY - index * EVENT_SHOP_REFRESH_DAYS) * DAY_MS;
  return { start, end: start + EVENT_SHOP_REFRESH_DAYS * DAY_MS, index };
}
