import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { GEM_CHEST_EXTRA } from '../../src/meta/data/economy';
import { ARCANE_STONE_KEYS, STONE_COLORS, parseStoneKey } from '../../src/meta/data/materials';
import { newSave } from '../../src/meta/state/schema';
import {
  HUNT_EXPECTED_GEMS, HUNT_FIXED_REWARDS, HUNT_STONE_BASE, HUNT_STONE_DROPS,
  LOOT_LADDER, commitMove, rollRewards,
} from '../../src/meta/systems/treasureHunt';

class FixedRoll extends SeededRNG {
  private calls = 0;
  constructor(private roll: number, private color = 0) { super(1); }
  override nextInt(max: number): number { return (this.calls++ === 0 ? this.roll : this.color) % max; }
}
const currencies = ['gold', 'souls', 'glory', 'gems', 'goldKeys'] as const;

describe('treasure hunt currency-first rewards', () => {
  it.each([
    [6, { gold: 50_000, souls: 1_500, glory: 300, gems: 100 }],
    [7, { gold: 200_000, souls: 5_000, glory: 1_000, gems: 300 }],
  ] as const)('tier %i always awards all four currencies together', (tier, expected) => {
    for (const roll of [0, 1000, 1800, 2000, 2050, 9999]) {
      const grant = rollRewards([tier], 0, new FixedRoll(roll));
      expect(grant).toMatchObject({ ...expected, goldKeys: 0 });
      expect(Object.values(grant.traitstones).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    }
  });

  it.each([6, 7])('tier %i has exact absolute material probabilities, including a no-stone outcome', tier => {
    const counts: Record<string, number> = { major: 0, runic: 0, arcane: 0, celestial: 0, none: 0 };
    for (let roll = 0; roll < HUNT_STONE_BASE; roll++) {
      const stones = rollRewards([tier], 1_000_000, new FixedRoll(roll)).traitstones;
      const entries = Object.entries(stones);
      expect(entries.length).toBeLessThanOrEqual(1);
      if (!entries.length) { counts.none!++; continue; }
      const [key, quantity] = entries[0]!;
      expect(quantity).toBe(1);
      const parsed = parseStoneKey(key);
      expect(parsed).not.toBeNull();
      counts[parsed!.tier]!++;
    }
    expect(counts).toEqual({ major: 1000, runic: 800, arcane: 200, celestial: 50, none: 7950 });
  });

  it('matches gem chest base material odds and single-item quantities without conditional renormalization', () => {
    for (const row of HUNT_STONE_DROPS) {
      const chest = GEM_CHEST_EXTRA.find(entry => entry.loot.type === 'stone' && entry.loot.tier === row.tier)!;
      expect(row.weight / HUNT_STONE_BASE).toBe(chest.weight / 100_000);
      expect(chest.loot).toMatchObject({ amount: 1 });
    }
  });

  it('all canonical arcane combinations and base colors are reachable', () => {
    for (let i = 0; i < ARCANE_STONE_KEYS.length; i++) {
      expect(rollRewards([7], 0, new FixedRoll(1800, i)).traitstones).toEqual({ [ARCANE_STONE_KEYS[i]!]: 1 });
    }
    for (let i = 0; i < STONE_COLORS.length; i++) {
      for (const [roll, tier] of [[0, 'major'], [1000, 'runic']] as const) {
        expect(rollRewards([6], 0, new FixedRoll(roll, i)).traitstones).toEqual({ [`${tier}:${STONE_COLORS[i]!.key}`]: 1 });
      }
    }
  });

  it('low tiers award fixed currencies and never give stones regardless of moves', () => {
    const cells = [0, 1, 2, 3, 4, 5];
    expect(rollRewards(cells, 15_000, new SeededRNG(1))).toEqual({
      gold: 12_850, souls: 700, glory: 130, gems: 20, goldKeys: 0, traitstones: {},
    });
    expect(rollRewards([6, 7], 0, new SeededRNG(19))).toEqual(rollRewards([6, 7], 15_000, new SeededRNG(19)));
  });

  it('multiple high-tier treasures add all currencies, with at most one bonus stone each', () => {
    const cells = [6, 6, 6, 7];
    const grant = rollRewards(cells, 0, new SeededRNG(42));
    expect(grant).toMatchObject({ gold: 350_000, souls: 9_500, glory: 1_900, gems: 600 });
    expect(Object.values(grant.traitstones).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4);
    expect(grant).toEqual(rollRewards(cells, 0, new SeededRNG(42)));
    for (const key of currencies) expect(HUNT_FIXED_REWARDS[7]![key] ?? 0).toBeGreaterThanOrEqual(3 * (HUNT_FIXED_REWARDS[6]![key] ?? 0));
  });

  it('rule display and economy model use the same fixed currency table', () => {
    expect(HUNT_EXPECTED_GEMS).toEqual([0, 0, 0, 0, 0, 20, 100, 300]);
    expect(LOOT_LADDER[6]!.reward).toBe('50,000 黄金 + 1,500 灵魂 + 300 荣耀 + 100 宝石');
    expect(LOOT_LADDER[7]!.reward).toBe('200,000 黄金 + 5,000 灵魂 + 1,000 荣耀 + 300 宝石');
    for (const [tier, reward] of HUNT_FIXED_REWARDS.entries()) {
      const actual = rollRewards([tier], 0, new FixedRoll(9999));
      for (const key of currencies) expect(actual[key]).toBe(reward[key] ?? 0);
    }
  });

  it('ignores invalid cells rather than indexing outside the reward table', () => {
    expect(rollRewards([-1, 8, 1.5, NaN], 0, new SeededRNG(1))).toEqual({
      gold: 0, souls: 0, glory: 0, gems: 0, goldKeys: 0, traitstones: {},
    });
  });

  it('settlement pays the grant exactly once and clears the resumed long-run save', () => {
    const save = newSave({ now: 0 });
    const cells = Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i % 8) % 2);
    cells[1] = 0; cells[56] = 6; cells[63] = 7;
    save.treasureHunt = { cells, turns: 1, moves: 2999, rng: new SeededRNG(2).getState() };
    save.materials.traitstones = { 'major:blue': 5 };
    const before = structuredClone(save);
    const result = commitMove(save, 1, 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.over).toBe(true);
    expect(result.grant!.gems).toBeGreaterThanOrEqual(400);
    expect(save.treasureHunt).toBeNull();
    for (const key of currencies) expect(save.currencies[key] - before.currencies[key]).toBe(result.grant![key]);
    const expected = { ...before.materials.traitstones };
    for (const [key, n] of Object.entries(result.grant!.traitstones)) expected[key] = (expected[key] ?? 0) + n;
    expect(save.materials.traitstones).toEqual(expected);
    const settled = structuredClone(save);
    expect(commitMove(save, 1, 9).ok).toBe(false);
    expect(save).toEqual(settled);
  });
});
