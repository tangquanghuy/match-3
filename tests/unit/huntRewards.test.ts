import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { ARCANE_STONE_KEYS, STONE_COLORS, parseStoneKey } from '../../src/meta/data/materials';
import { newSave } from '../../src/meta/state/schema';
import {
  HUNT_EXPECTED_GEMS, HUNT_FIXED_REWARDS, HUNT_STONE_BASE, HUNT_STONE_DROPS, HUNT_CHEST_STONE_DROPS,
  LOOT_LADDER, commitMove, finishHunt, rollRewards,
} from '../../src/meta/systems/treasureHunt';

class FixedRoll extends SeededRNG {
  private calls = 0;
  constructor(private roll: number, private color = 0) { super(1); }
  override nextInt(max: number): number { return (this.calls++ === 0 ? this.roll : this.color) % max; }
}
const currencies = ['gold', 'souls', 'glory', 'gems', 'goldKeys'] as const;

describe('treasure hunt currency-first rewards', () => {
  it.each([
    [6, { gold: 35_000, souls: 1_050, glory: 210, gems: 70 }],
    [7, { gold: 140_000, souls: 3_500, glory: 700, gems: 210 }],
  ] as const)('tier %i always awards all four currencies together', (tier, expected) => {
    for (const roll of [0, 1000, 1800, 2000, 2050, 9999]) {
      const grant = rollRewards([tier], 0, new FixedRoll(roll));
      expect(grant).toMatchObject({ ...expected, goldKeys: 0 });
      expect(Object.values(grant.traitstones).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    [4, { minor: 2000, major: 500, runic: 0, arcane: 0, celestial: 0, none: 7500 }],
    [5, { minor: 1500, major: 1000, runic: 0, arcane: 0, celestial: 0, none: 7500 }],
    [6, { minor: 0, major: 1000, runic: 800, arcane: 200, celestial: 50, none: 7950 }],
    [7, { minor: 0, major: 1000, runic: 800, arcane: 200, celestial: 50, none: 7950 }],
  ] as const)('tier %i has exact absolute material probabilities, including a no-stone outcome', (tier, expected) => {
    const counts: Record<string, number> = { minor: 0, major: 0, runic: 0, arcane: 0, celestial: 0, none: 0 };
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
    expect(counts).toEqual(expected);
  });

  it('keeps treasure hunt stone odds independent of gem chest changes', () => {
    expect(HUNT_STONE_DROPS.map(({ tier, weight }) => [tier, weight])).toEqual([
      ['major', 1_000], ['runic', 800], ['arcane', 200], ['celestial', 50],
    ]);
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
    const cells = [0, 1, 2, 3];
    expect(rollRewards(cells, 15_000, new SeededRNG(1))).toEqual({
      gold: 594, souls: 35, glory: 0, gems: 0, goldKeys: 0, traitstones: {},
    });
    expect(rollRewards([6, 7], 0, new SeededRNG(19))).toEqual(rollRewards([6, 7], 15_000, new SeededRNG(19)));
  });

  it('multiple high-tier treasures add all currencies, with at most one bonus stone each', () => {
    const cells = [6, 6, 6, 7];
    const grant = rollRewards(cells, 0, new SeededRNG(42));
    expect(grant).toMatchObject({ gold: 245_000, souls: 6_650, glory: 1_330, gems: 420 });
    expect(Object.values(grant.traitstones).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4);
    expect(grant).toEqual(rollRewards(cells, 0, new SeededRNG(42)));
    for (const key of currencies) expect(HUNT_FIXED_REWARDS[7]![key] ?? 0).toBeGreaterThanOrEqual(3 * (HUNT_FIXED_REWARDS[6]![key] ?? 0));
  });


  it('each chest rolls independently, misses do not stop later rolls, and same stones accumulate', () => {
    class ChestRolls extends SeededRNG {
      calls = 0;
      constructor(private rolls: number[]) { super(1); }
      override nextInt(max: number): number {
        if(max !== HUNT_STONE_BASE) return 0;
        const roll=this.rolls[this.calls++];
        if(roll===undefined)throw new Error('unexpected extra chest roll');
        return roll;
      }
    }
    const rng = new ChestRolls([0,9999,0,1000,9999,0]);
    const grant = rollRewards([0,4,4,5,6,7,7,3], 99999, rng);
    expect(rng.calls).toBe(6);
    const color = STONE_COLORS[0]!.key;
    expect(grant.traitstones).toEqual({ [`minor:${color}`]:2, [`major:${color}`]:1, [`runic:${color}`]:1 });
    // Not one drop per run or one roll per chest type: all 12 identical boxes can hit.
    const many = new ChestRolls(Array(12).fill(0));
    expect(rollRewards(Array(12).fill(6),0,many).traitstones).toEqual({ [`major:${color}`]:12 });
    expect(many.calls).toBe(12);
  });

  it('each chest rule displays its own absolute drop table and leaves a no-drop outcome',()=>{
    expect(LOOT_LADDER[4]!.stoneOdds).toBe('初级石 20%、高级石 5%');
    expect(LOOT_LADDER[5]!.stoneOdds).toBe('初级石 15%、高级石 10%');
    for(const tier of [4,5,6,7]){
      const rows=HUNT_CHEST_STONE_DROPS[tier]!;
      expect(rows.reduce((sum,row)=>sum+row.weight,0)).toBeLessThan(HUNT_STONE_BASE);
      expect(new Set(rows.map(row=>row.tier)).size).toBe(rows.length);
    }
    expect(LOOT_LADDER.slice(0,4).every(row=>row.stoneOdds==='')).toBe(true);
    expect(LOOT_LADDER[6]!.stoneOdds).toBe('高级石 10%、符文石 8%、秘法石 2%、圣辉石 0.5%');
    expect(LOOT_LADDER[7]!.stoneOdds).toBe(LOOT_LADDER[6]!.stoneOdds);
  });

  it('rule display and economy model use the same fixed currency table', () => {
    expect(HUNT_EXPECTED_GEMS).toEqual([0, 0, 0, 0, 0, 14, 70, 210]);
    expect(LOOT_LADDER[6]!.reward).toBe('35,000 黄金 + 1,050 灵魂 + 210 荣耀 + 70 宝石');
    expect(LOOT_LADDER[7]!.reward).toBe('140,000 黄金 + 3,500 灵魂 + 700 荣耀 + 210 宝石');
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
    expect(result.grant!.gems).toBeGreaterThanOrEqual(280);
    expect(save.treasureHunt).toBeNull();
    for (const key of currencies) expect(save.currencies[key] - before.currencies[key]).toBe(result.grant![key]);
    const expected = { ...before.materials.traitstones };
    for (const [key, n] of Object.entries(result.grant!.traitstones)) expected[key] = (expected[key] ?? 0) + n;
    expect(save.materials.traitstones).toEqual(expected);
    const settled = structuredClone(save);
    expect(commitMove(save, 1, 9).ok).toBe(false);
    expect(save).toEqual(settled);
  });

  it('caps treasure hunt gold and gems per game-time day, then resets on the next day', () => {
    const save = newSave({ now: 0 });
    const cells = Array(8).fill(7);
    save.treasureHunt = { cells, turns: 1, moves: 0, rng: 2 };
    const first = finishHunt(save, 10_000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.grant).toMatchObject({ gold: 1_000_000, gems: 1_680 });
    expect(save.treasureHuntDaily).toEqual({ dayStart: 10_000, gold: 1_000_000, gems: 1_680 });

    save.treasureHunt = { cells, turns: 1, moves: 1, rng: 2 };
    const second = finishHunt(save, 10_000);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.grant).toMatchObject({ gold: 0, gems: 320 });
    expect(save.treasureHuntDaily).toEqual({ dayStart: 10_000, gold: 1_000_000, gems: 2_000 });

    save.treasureHunt = { cells, turns: 1, moves: 2, rng: 2 };
    const nextDay = finishHunt(save, 86_410_000);
    expect(nextDay.ok).toBe(true);
    if (!nextDay.ok) return;
    expect(nextDay.grant).toMatchObject({ gold: 1_000_000, gems: 1_680 });
    expect(save.treasureHuntDaily).toEqual({ dayStart: 86_410_000, gold: 1_000_000, gems: 1_680 });
  });
});
