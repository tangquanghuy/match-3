import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { collectAllTribute, tributeHourHit, tributePreview, tributeTreasury } from '../../src/meta/systems/tribute';
import { treasuryBodyHtml } from '../../src/meta/screens/kingdomSheet';

const HOUR = 3_600_000;
const KINGDOM = '破碎尖塔';

// Find a reproducible empty capped window, followed by a real hit. No mocked RNG.
function emptyWindow(): number {
  for (let start = 500_000; start < 501_000; start++) {
    if (Array.from({ length: 12 }, (_, i) => start + i + 1).every(hour => !tributeHourHit(KINGDOM, hour, 1))
      && tributeHourHit(KINGDOM, start + 13, 1)) return start * HOUR;
  }
  throw new Error('Missing deterministic tribute fixture');
}

describe('empty tribute state and real countdown', () => {
  it('a new or legacy-zero kingdom starts at account creation, not the Unix epoch', () => {
    const now = 500_000 * HOUR + 23 * 60_000;
    const save = newSave({ now });
    for (const explicitZero of [false, true]) {
      if (explicitZero) save.kingdoms[KINGDOM] = { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
      const preview = tributePreview(save, KINGDOM, now);
      expect(preview.hours).toBe(0);
      expect(preview.pendingHours).toBe(0);
      expect(preview.ready).toBe(false);
      expect(preview.overflowing).toBe(false);
      expect(preview.nextHourAt).toBe(now + HOUR);
    }
  });

  it('an empty 12-hour window is never full and does not permanently block later tribute', () => {
    const start = emptyWindow();
    const save = newSave({ now: start });
    save.kingdoms[KINGDOM] = { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: start };
    const before = structuredClone(save);
    const empty = tributeTreasury(save, start + 12.5 * HOUR);
    expect(empty.readyCount).toBe(0);
    expect(empty.overflowing).toBe(false);
    expect(empty.kingdoms[0]!.hours).toBeLessThan(12);
    expect(empty.nextHourAt).toBe(start + 13 * HOUR);
    const arrived = tributeTreasury(save, start + 13 * HOUR);
    expect(arrived.ready).toBe(true);
    expect(arrived.kingdoms[0]!.hitHours).toContain(start / HOUR + 13);
    expect(save).toEqual(before);
    const { haul } = collectAllTribute(save, start + 13 * HOUR);
    expect(haul.totals).toEqual(arrived.totals);
    expect(tributeTreasury(save, start + 13 * HOUR).ready).toBe(false);
  });

  it('once a window has rewards, waiting never rolls those rewards away or exceeds its cap', () => {
    const start = emptyWindow();
    const save = newSave({ now: start });
    const first = tributePreview(save, KINGDOM, start + 24 * HOUR);
    expect(first.ready).toBe(true);
    const later = tributePreview(save, KINGDOM, start + 200 * HOUR);
    expect(later.hitHours).toEqual(first.hitHours);
    expect(later.gold).toBe(first.gold);
    expect(later.hours).toBe(12);
    expect(later.overflowing).toBe(true);
  });

  it('midnight is rendered as remaining time, not the ambiguous wall-clock 00:00', () => {
    const now = new Date(2026, 8, 29, 23, 6).getTime();
    const save = newSave({ now: now - 6 * 60_000 });
    const html = treasuryBodyHtml(tributeTreasury(save, now), now);
    expect(html).toContain('54:00');
    expect(html).not.toContain('下一次进贡 00:00');
    expect(html).toContain('data-tribute-at');
  });
});
