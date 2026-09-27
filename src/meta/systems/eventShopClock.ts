import { EVENT_SHOP_REFRESH_DAYS } from '../data/events';

const DAY_MS = 86_400_000;
const ANCHOR_DAY = Date.UTC(2026, 0, 1) / DAY_MS;

/** Fixed two-calendar-day windows, local midnight; never restarted on login or Monday. */
export function eventShopPeriodOf(now: number): { start: number; end: number; index: number } {
  const date = new Date(now);
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  const index = Math.floor((day - ANCHOR_DAY) / EVENT_SHOP_REFRESH_DAYS);
  const start = new Date(date);
  start.setDate(start.getDate() - (day - ANCHOR_DAY - index * EVENT_SHOP_REFRESH_DAYS));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + EVENT_SHOP_REFRESH_DAYS);
  return { start: start.getTime(), end: end.getTime(), index };
}
