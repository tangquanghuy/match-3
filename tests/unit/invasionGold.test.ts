import { describe, expect, it } from 'vitest';
import { buildBracket, ensureInvasionSeason, settleInvasionBattle, type InvasionMirror } from '../../src/meta/systems/invasion';
import { invasionGoldFactors, invasionVictoryGold } from '../../src/meta/systems/invasionGold';
import { newSave } from '../../src/meta/state/schema';
import { starterTroopIds } from '../../src/meta/data/economy';
import { WEEK_MS } from '../../src/meta/data/events';
import type { BattleResult } from '../../src/session/contract';

const WEEK = 1_700_000_000_000 - 1_700_000_000_000 % WEEK_MS;
const low = buildBracket(WEEK, 0)[0]!;
const fixture = (league = 0, level = 8, rating = 100): InvasionMirror => ({
  ...low, league, rating, defense: low.defense.map(d => ({ ...d, level })),
});

describe('invasion victory gold', () => {
  it('sets a 300 floor and 3000 ceiling including the shared victory reward', () => {
    expect(invasionVictoryGold(fixture())).toBe(300);
    expect(invasionVictoryGold(fixture(9, 36, 750))).toBe(3000);
    expect(invasionVictoryGold(fixture(999, 9999, 999999))).toBe(3000);
    expect(invasionVictoryGold(fixture(-1, -1, -1))).toBe(300);
    expect(invasionVictoryGold(fixture(NaN, NaN, NaN))).toBe(300);
  });
  it('rewards enemy league, average troop level and stats independently', () => {
    const base = fixture(3, 15, 300);
    const reward = invasionVictoryGold(base);
    expect(invasionVictoryGold({ ...base, league: 4 })).toBeGreaterThan(reward);
    expect(invasionVictoryGold({ ...base, rating: 400 })).toBeGreaterThan(reward);
    expect(invasionVictoryGold({ ...base, defense: base.defense.map(d => ({ ...d, level: 20 })) })).toBeGreaterThan(reward);
    expect(invasionVictoryGold({ ...base, difficulty: 'hard' })).toBe(reward);
    expect(invasionGoldFactors({ ...base, defense: base.defense.map((d, i) => ({ ...d, level: [10, 20, 30, 20][i]! })) }).level).toBe(20);
  });
  it('uses the real opponent league; frenzy changes gold through stats, not VP multiplier', () => {
    const base = fixture(0, 15, 300);
    const player = { ownerKey: 'test', team: [], heroLevel: 100, league: 5, recordedAt: 0 };
    const real = { ...base, player };
    expect(invasionVictoryGold(real)).toBe(invasionVictoryGold({ ...base, league: 5 }));
    expect(invasionVictoryGold({ ...real, frenzy: true, frenzyMultiplier: 2 })).toBe(invasionVictoryGold(real));
    expect(invasionVictoryGold({ ...real, rating: 450, frenzy: true, frenzyMultiplier: 2 })).toBeGreaterThan(invasionVictoryGold(real));
  });
  it('preserves rewards for old saved NPCs without the new league field across all leagues', () => {
    for (let league = 0; league < 10; league++) {
      for (const mirror of buildBracket(WEEK, league)) {
        expect(mirror.league).toBe(league);
        expect(invasionVictoryGold({ ...mirror, league: undefined })).toBe(invasionVictoryGold(mirror));
      }
    }
  });
  it('pays the launch preview once, even after the attacker rank or candidates change', () => {
    const save = newSave({ now: 0, starterTroopIds: starterTroopIds() });
    ensureInvasionSeason(save, WEEK, WEEK);
    const mirror = fixture(7, 29, 550);
    const expected = invasionVictoryGold(mirror);
    save.invasion.league = 9;
    save.invasion.refreshCount++;
    const before = save.currencies.gold;
    const earned = save.stats.goldEarned;
    const result = { winner: 'player', turns: 5, combatants: [], eventSummary: [],
      economy: { gold: 17, souls: 0, gems: 0, maps: 0 } } as unknown as BattleResult;
    const out = settleInvasionBattle(save, result, mirror.id, WEEK + 1000, WEEK, WEEK, mirror);
    if (!out.ok) throw new Error(out.message);
    expect(out.gold + out.battleRewards.gold).toBe(expected);
    expect(save.currencies.gold - before).toBe(expected + 17);
    expect(save.stats.goldEarned - earned).toBe(expected + 17);
  });
  it.each(['defeat', 'surrender'])('%s does not pay victory gold', endReason => {
    const save = newSave({ now: 0, starterTroopIds: starterTroopIds() });
    ensureInvasionSeason(save, WEEK, WEEK);
    const mirror = fixture(9, 36, 750);
    const before = save.currencies.gold;
    const result = { winner: 'enemy', endReason, turns: 5, combatants: [], eventSummary: [],
      economy: { gold: 17 } } as unknown as BattleResult;
    const out = settleInvasionBattle(save, result, mirror.id, WEEK + 1000, WEEK, WEEK, mirror);
    if (!out.ok) throw new Error(out.message);
    expect(out.gold).toBe(0);
    expect(save.currencies.gold - before).toBe(20 + (endReason === 'surrender' ? 0 : 17));
  });
});
