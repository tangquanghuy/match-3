import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardGenerator } from '../../src/engine/boardGen';
import { GravitySystem } from '../../src/engine/GravitySystem';
import { SeededRNG } from '../../src/engine/rng';
import { applyMove, createOpeningBoard, hasMatch } from '../../src/meta/systems/treasureHunt';

/** The shared battle generator/refiller must never select treasure-hunt tiles. */
function forbidBattleGeneration(): void {
  vi.spyOn(BoardGenerator.prototype, 'generate').mockImplementation(() => { throw new Error('Hunt used battle setup'); });
  vi.spyOn(GravitySystem.prototype, 'apply').mockImplementation(() => { throw new Error('Hunt used battle refill'); });
}

function firstMove(cells: number[]): [number, number] {
  for (let a = 0; a < 64; a++) {
    for (const b of [a % 8 < 7 ? a + 1 : -1, a + 8 < 64 ? a + 8 : -1]) {
      if (b < 0) continue;
      const swapped = cells.slice();
      [swapped[a], swapped[b]] = [swapped[b]!, swapped[a]!];
      if (hasMatch(swapped)) return [a, b];
    }
  }
  throw new Error('Expected a playable opening');
}

describe('藏宝图：零匹配偏置，与普通战斗隔离', () => {
  afterEach(() => vi.restoreAllMocks());

  it('开局每格只抽一次，采用首个可走盘，不为四/五连择优重掷', () => {
    forbidBattleGeneration();
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new SeededRNG(seed);
      const draw = vi.spyOn(rng, 'next');
      const cells = createOpeningBoard(rng);
      expect(draw, `seed ${seed}`).toHaveBeenCalledTimes(64);
      expect(hasMatch(cells)).toBe(false);
      expect(firstMove(cells)).toHaveLength(2);
      // Setup scoring, target-bucket draws and retry selection would advance RNG.
      const natural = new SeededRNG(seed);
      for (let i = 0; i < 64; i++) natural.next();
      expect(rng.getState()).toBe(natural.getState());
    }
  });

  it('每次补充按72/22/5/1独立抽取；连锁中的每颗宝物也不读取邻居或额外择优', () => {
    forbidBattleGeneration();
    let checked = 0;
    let cascadeRefills = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const cells = createOpeningBoard(new SeededRNG(seed));
      const [from, to] = firstMove(cells);
      const natural = new SeededRNG(seed + 1000);
      const played = applyMove({ cells, turns: 100, moves: 0, rng: natural.getState() }, from, to);
      expect(played.ok).toBe(true);
      if (!played.ok || played.shuffled) continue; // Shuffles have their own RNG budget.
      const refills = played.events.filter(event => event.type === 'refill');
      expect(refills.length).toBeGreaterThan(0);
      for (const refill of refills) {
        if (refill.chainCount > 1) cascadeRefills++;
        for (const spawn of refill.spawns) {
          const roll = natural.nextInt(100);
          const tier = roll < 72 ? 0 : roll < 94 ? 1 : roll < 99 ? 2 : 3;
          expect(spawn.gemType).toMatchObject({ kind: 'special', spec: { tier: tier + 1 } });
        }
      }
      expect(played.rng).toBe(natural.getState());
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(90);
    expect(cascadeRefills).toBeGreaterThan(0);
  });
});
