import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { BoardGenerator } from '@engine/boardGen';
import { GravitySystem } from '@engine/GravitySystem';
import { MatchResolver } from '@engine/MatchResolver';
import { SeededRNG } from '@engine/rng';
import { BATTLE_COMBO_BIAS } from '@engine/comboBias';
import { BATTLE_SKULL_CHANCE, BATTLE_SKULL_DROPS, pickSkullVariant } from '@engine/skullDrops';
import { skullGem, specialGem, type GemType } from '@engine/types';

function family(type: GemType): string {
  if (type.kind === 'skull') return 'normal';
  if (type.kind === 'special' && type.spec.kind === 'doomSkull') return 'doom';
  if (type.kind === 'special' && type.spec.kind === 'uberDoomSkull') return 'uber';
  return 'color';
}

function normalized(board: BoardModel): unknown[] {
  const cells: unknown[] = [];
  board.forEach(gem => cells.push(gem && {
    id: gem.id,
    type: family(gem.type) === 'color' ? gem.type : skullGem(),
  }));
  return cells;
}

function hasLegalSwap(board: BoardModel): boolean {
  const resolver = new MatchResolver();
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
        if (!BoardModel.inBounds(b)) continue;
        const copy = board.clone();
        copy.swap({ row, col }, b);
        if (resolver.hasAnyMatch(copy)) return true;
      }
    }
  }
  return false;
}

describe('natural battle skull tuning', () => {
  it('uses strength 5 and a total 20% skull family split 15/4/1', () => {
    expect(BATTLE_COMBO_BIAS).toBe(5);
    expect(BATTLE_SKULL_CHANCE).toBe(0.2);
    expect(BATTLE_SKULL_DROPS).toEqual({ normal: 0.15, doom: 0.04, uber: 0.01 });
  });

  it.each([
    [0, 'normal'], [0.149999999, 'normal'],
    [0.15, 'doom'], [0.189999999, 'doom'],
    [0.19, 'uber'], [0.199999999, 'uber'],
  ])('base draw %s chooses %s', (roll, expected) => {
    expect(family(pickSkullVariant(Number(roll), 0.2, BATTLE_SKULL_DROPS))).toBe(expected);
  });

  it.each([[0.299999, 'normal'], [0.30, 'doom'], [0.379999, 'doom'], [0.38, 'uber']])(
    'an increased total preserves the 75/20/5 conditional split (%s)', (roll, expected) => {
      expect(family(pickSkullVariant(Number(roll), 0.4, BATTLE_SKULL_DROPS))).toBe(expected);
    },
  );

  it('keeps ordinary skulls when no mix is configured', () => {
    for (const roll of [0, 0.15, 0.19, 0.199999]) {
      expect(pickSkullVariant(roll, 0.2)).toEqual(skullGem());
    }
    expect(pickSkullVariant(0.19, 0.2, { normal: 0, doom: 0, uber: 0 })).toEqual(skullGem());
  });

  it('draws the requested rates through real unbiased refills', () => {
    const gravity = new GravitySystem(new SeededRNG(20260930), (() => { let id = 0; return () => id++; })());
    gravity.skullDropMix = BATTLE_SKULL_DROPS;
    const counts: Record<string, number> = { normal: 0, doom: 0, uber: 0, color: 0 };
    for (let i = 0; i < 1000; i++) {
      for (const spawn of gravity.apply(new BoardModel(), BATTLE_SKULL_CHANCE).spawns) {
        counts[family(spawn.gemType)]++;
      }
    }
    const total = 1000 * BoardModel.ROWS * BoardModel.COLS;
    expect(Math.abs(counts.normal / total - 0.15)).toBeLessThan(0.005);
    expect(Math.abs(counts.doom / total - 0.04)).toBeLessThan(0.003);
    expect(Math.abs(counts.uber / total - 0.01)).toBeLessThan(0.0015);
    expect(Math.abs(counts.color / total - 0.8)).toBeLessThan(0.006);
  });

  it.each([1, 7, 42, 2026])('refill variants consume no extra RNG draws (seed %s)', seed => {
    const oldRng = new SeededRNG(seed), newRng = new SeededRNG(seed);
    let oldId = 0, newId = 0;
    const oldGravity = new GravitySystem(oldRng, () => oldId++);
    const newGravity = new GravitySystem(newRng, () => newId++);
    newGravity.skullDropMix = BATTLE_SKULL_DROPS;
    const oldBoard = new BoardModel(), newBoard = new BoardModel();
    oldGravity.apply(oldBoard, BATTLE_SKULL_CHANCE);
    newGravity.apply(newBoard, BATTLE_SKULL_CHANCE);
    expect(normalized(newBoard)).toEqual(normalized(oldBoard));
    expect(newRng.getState()).toBe(oldRng.getState());
  });

  it('opening boards have no mixed-skull prematches, keep a legal swap and preserve RNG draws', () => {
    const resolver = new MatchResolver();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const oldRng = new SeededRNG(seed), newRng = new SeededRNG(seed);
      let oldId = 0, newId = 0;
      const legacy = new BoardGenerator(oldRng, () => oldId++, BATTLE_SKULL_CHANCE).generate();
      const board = new BoardGenerator(newRng, () => newId++, BATTLE_SKULL_CHANCE, 0, BATTLE_SKULL_DROPS).generate();
      expect(resolver.hasAnyMatch(board)).toBe(false);
      expect(hasLegalSwap(board)).toBe(true);
      expect(normalized(board)).toEqual(normalized(legacy));
      expect(newRng.getState()).toBe(oldRng.getState());
      board.forEach(gem => { if (gem) seen.add(family(gem.type)); });
    }
    expect([...seen].sort()).toEqual(['color', 'doom', 'normal', 'uber']);
  });

  it.each(['doomSkull', 'uberDoomSkull'] as const)('keeps %s storm precedence', kind => {
    let id = 0;
    const gravity = new GravitySystem(new SeededRNG(73), () => id++);
    gravity.skullDropMix = BATTLE_SKULL_DROPS;
    const result = gravity.apply(new BoardModel(), 0.2, undefined, { kind, chance: 1 });
    expect(result.spawns).toHaveLength(64);
    expect(result.spawns.every(spawn => JSON.stringify(spawn.gemType) === JSON.stringify(specialGem(kind)))).toBe(true);
  });

  it('keeps event-special pool precedence over the natural mix', () => {
    let id = 0;
    const gravity = new GravitySystem(new SeededRNG(73), () => id++);
    gravity.skullDropMix = BATTLE_SKULL_DROPS;
    gravity.specialSpawnChance = 1;
    gravity.specialPool = [{ gem: { kind: 'hourglass' }, weight: 1 }];
    const result = gravity.apply(new BoardModel(), 0.2);
    expect(result.spawns.every(spawn => JSON.stringify(spawn.gemType) === JSON.stringify(specialGem('hourglass')))).toBe(true);
  });
});
