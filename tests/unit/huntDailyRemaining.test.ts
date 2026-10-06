import { describe, expect, it } from 'vitest';
import { todayStartOf, DAY_MS } from '../../src/meta/gateway/clock';
import { newSave, TREASURE_HUNT_DAILY_CAP } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { finishHunt, huntDailyRemaining } from '../../src/meta/systems/treasureHunt';

const today = todayStartOf(Date.UTC(2026, 9, 4, 4));

describe('treasure hunt daily remaining reserve', () => {
  it('starts at 800,000 gold, 1,000 gems and the new 4,000 Glory cap', () => {
    expect(TREASURE_HUNT_DAILY_CAP).toEqual({ gold: 800_000, souls: 20_000, gems: 1_000, glory: 4_000 });
    expect(huntDailyRemaining(newSave({ now: today }), today)).toEqual(TREASURE_HUNT_DAILY_CAP);
  });

  it('subtracts today\'s credited hunt rewards, not wallet balances, without modifying the save', () => {
    const save = newSave({ now: today });
    save.treasureHuntDaily = { dayStart: today, gold: 123_456, souls: 100, gems: 321, glory: 2_345 };
    save.currencies.gold = 2;
    save.currencies.gems = 0;
    save.currencies.glory = 99_999;
    const before = structuredClone(save);
    expect(huntDailyRemaining(save, today)).toEqual({ gold: 676_544, souls: 19_900, gems: 679, glory: 1_655 });
    expect(save).toEqual(before);
  });

  it('never shows negative reserves for exhausted or oversized counters', () => {
    const save = newSave({ now: today });
    save.treasureHuntDaily = { dayStart: today, gold: 900_000, souls: 22_000, gems: 1_000, glory: 5_000 };
    expect(huntDailyRemaining(save, today)).toEqual({ gold: 0, souls: 0, gems: 0, glory: 0 });
  });

  it('restores full reserves at UTC+8 midnight without changing yesterday\'s counters', () => {
    const midnight = Date.UTC(2026, 9, 4, 16);
    const save = newSave({ now: midnight - 1 });
    save.treasureHuntDaily = { dayStart: todayStartOf(midnight - 1), ...TREASURE_HUNT_DAILY_CAP };
    const before = structuredClone(save);
    expect(huntDailyRemaining(save, todayStartOf(midnight - 1))).toEqual({ gold: 0, souls: 0, gems: 0, glory: 0 });
    expect(huntDailyRemaining(save, todayStartOf(midnight))).toEqual(TREASURE_HUNT_DAILY_CAP);
    expect(todayStartOf(midnight) - save.treasureHuntDaily.dayStart).toBe(DAY_MS);
    expect(save).toEqual(before);
  });

  it('keeps old 2,500 Glory credit and makes the extra 1,500 available today', () => {
    const original = newSave({ now: today });
    original.treasureHuntDaily = { dayStart: today, gold: 0, souls: 0, gems: 0, glory: 2_500 };
    const save = migrateSave(original);
    expect(huntDailyRemaining(save, today).glory).toBe(1_500);
    save.treasureHunt = { cells: Array(8).fill(7), turns: 1, moves: 0, rng: 2 };
    const settled = finishHunt(save, today);
    expect(settled.ok && settled.grant?.glory).toBe(1_500);
    expect(save.treasureHuntDaily.glory).toBe(4_000);
    expect(huntDailyRemaining(save, today).glory).toBe(0);
  });

  it('matches the exact amount paid when only one of each capped currency remains', () => {
    const save = newSave({ now: today });
    save.treasureHuntDaily = { dayStart: today, gold: 799_999, souls: 19_999, gems: 999, glory: 3_999 };
    save.treasureHunt = { cells: Array(8).fill(7), turns: 1, moves: 0, rng: 2 };
    expect(huntDailyRemaining(save, today)).toEqual({ gold: 1, souls: 1, gems: 1, glory: 1 });
    const settled = finishHunt(save, today);
    expect(settled.ok && settled.grant).toMatchObject({ gold: 1, souls: 1, gems: 1, glory: 1 });
    expect(huntDailyRemaining(save, today)).toEqual({ gold: 0, souls: 0, gems: 0, glory: 0 });
  });
});
