import { describe, it, expect } from 'vitest';
import {
  collectTribute,
  newSave,
  tributeChance,
  tributeGold,
  tributeHourHit,
  tributePreview,
  tributeSouls,
  TRIBUTE,
} from '../../src/meta';

const KINGDOM = '破碎尖塔';
const HOUR_MS = 3_600_000;
const save = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

/** 独立复算：从 last 起可结算的 hours 与命中数（与实现同一套小时口径） */
function expectHits(kingdom: string, level: number, last: number, now: number) {
  const hours = Math.min(Math.max(0, Math.floor((now - last) / HOUR_MS)), TRIBUTE.capHours);
  const firstHour = Math.floor(last / HOUR_MS) + 1;
  let hits = 0;
  for (let i = 0; i < hours; i++) {
    if (tributeHourHit(kingdom, firstHour + i, level)) hits += 1;
  }
  return { hours, hits };
}

describe('进贡（离线结算）', () => {
  it('概率公式（设计值）：5%/级、75% 封顶；产出随等级线性', () => {
    expect(tributeChance(1)).toBeCloseTo(0.05);
    expect(tributeChance(10)).toBeCloseTo(0.5);
    expect(tributeChance(20)).toBeCloseTo(0.75);
    expect(tributeGold(1)).toBe(100);
    expect(tributeSouls(1)).toBe(25);
    expect(tributeGold(5)).toBe(260);
  });

  it('预览只读且确定：同参数两次一致；离线 30 小时按 12 小时封顶', () => {
    const s = save();
    const t30h = 30 * HOUR_MS;
    const a = tributePreview(s, KINGDOM, t30h);
    const b = tributePreview(s, KINGDOM, t30h);
    expect(b).toEqual(a);
    expect(a.hours).toBe(TRIBUTE.capHours);
    expect(a.ready).toBe(true);
    expect(a.hits).toBe(a.hours >= 0 ? expectHits(KINGDOM, 1, 0, t30h).hits : 0);
    expect(a.gold).toBe(a.hits * tributeGold(1));
    expect(a.souls).toBe(a.hits * tributeSouls(1));
    expect(a.goldKeys).toBeLessThanOrEqual(a.hits);
  });

  it('收取入账并把锚点拨到 now；同一时刻再收为空（幂等）', () => {
    const s = save();
    const now = 24 * HOUR_MS;
    const expected = expectHits(KINGDOM, 1, 0, now);
    const goldBefore = s.currencies.gold;
    const keysBefore = s.currencies.goldKeys;

    const collected = collectTribute(s, KINGDOM, now);
    expect(collected.ok).toBe(true);
    expect(collected.collected.hours).toBe(expected.hours);
    expect(collected.collected.hits).toBe(expected.hits);
    expect(s.currencies.gold).toBe(goldBefore + expected.hits * tributeGold(1));
    expect(s.currencies.souls).toBe(800 + expected.hits * tributeSouls(1));
    expect(s.currencies.goldKeys).toBe(keysBefore + collected.collected.goldKeys);
    expect(s.kingdoms[KINGDOM]?.lastTributeAt).toBe(now);
    expect(s.stats.goldEarned).toBe(expected.hits * tributeGold(1));

    const again = tributePreview(s, KINGDOM, now);
    expect(again.ready).toBe(false);
    expect(again.hits).toBe(0);
  });

  it('进贡累计依赖王国等级：升级后概率与产出变大', () => {
    const s = save();
    s.kingdoms[KINGDOM] = { level: 5, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    const preview = tributePreview(s, KINGDOM, 12 * HOUR_MS);
    if (preview.hits > 0) {
      expect(preview.gold).toBe(preview.hits * tributeGold(5));
    }
    expect(preview.hours).toBe(12);
  });
});
