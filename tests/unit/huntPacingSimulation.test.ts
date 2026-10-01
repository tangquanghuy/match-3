import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import { applyMove, beginHunt, hasMatch } from '../../src/meta/systems/treasureHunt';
import * as pacing from '../../src/meta/systems/huntPacing';

/** Greedy legal play: prefer visible extra turns, then upgrading valuable loot.
 * No peek at refill RNG and no artificial turn cap in the gameplay itself. */
function greedyMove(cells: number[]): [number, number] {
  let choice: [number, number] | null = null, bestScore = -1;
  for (let a = 0; a < 64; a++) for (const b of [a % 8 < 7 ? a + 1 : -1, a + 8 < 64 ? a + 8 : -1]) {
    if (b < 0 || cells[a] === 7 || cells[b] === 7 || cells[a] === cells[b]) continue;
    const av = cells[a]!, bv = cells[b]!;
    cells[a] = bv; cells[b] = av;
    if (hasMatch(cells)) {
      let largest = 0, value = 0;
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const start = row * 8 + col, tier = cells[start]!;
        if (tier >= 7) continue;
        for (const [step, available] of [[1, 8 - col], [8, 8 - row]]) {
          let size = 1;
          while (size < available! && cells[start + size * step!] === tier) size++;
          if (size >= 3) { largest = Math.max(largest, size); value = Math.max(value, 3 ** tier); }
        }
      }
      const score = (largest >= 5 ? 20_000 : largest >= 4 ? 10_000 : 0) + value;
      if (score > bestScore) { bestScore = score; choice = [a, b]; }
    }
    cells[a] = av; cells[b] = bv;
  }
  if (!choice) throw new Error('No playable move');
  return choice;
}

function simulate(seed: number, limit = 1200) {
  const save = newSave({ now: 0 }); save.materials.treasureMaps = 1;
  const start = beginHunt(save, seed);
  if (!start.ok) throw new Error(start.message);
  let state = start.state, bonuses = 0, cooledMoves = 0, cooledBonus = 0, maxTurns = state.turns;
  for (let step = 0; step < limit; step++) {
    const active = state.softCap!.peak >= state.softCap!.target;
    const move = greedyMove(state.cells);
    const played = applyMove(state, ...move);
    if (!played.ok) throw new Error(played.message);
    if (played.best >= 4) bonuses++;
    if (active) { cooledMoves++; if (played.best >= 4) cooledBonus++; }
    maxTurns = Math.max(maxTurns, played.turns);
    if (played.over) return { over: true, moves: played.moves, bonuses, cooledMoves, cooledBonus, maxTurns };
    state = { cells: played.cells, turns: played.turns, moves: played.moves, rng: played.rng, softCap: played.softCap };
  }
  return { over: false, moves: state.moves, bonuses, cooledMoves, cooledBonus, maxTurns };
}

describe('藏宝图随机软上限模拟', () => {
  afterEach(() => vi.restoreAllMocks());
  it('主动寻找额外回合的固定种子玩家：降温后可自然结束，而非直接扣步/强制截断', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => new SeededRNG(700 + i).nextInt(0xffffffff));
    const cooled = seeds.map(seed => simulate(seed));
    vi.spyOn(pacing, 'huntComboBias').mockReturnValue(0);
    const natural = seeds.map(seed => simulate(seed));
    const stats = (runs: ReturnType<typeof simulate>[]) => ({
      completed: runs.filter(run => run.over).length,
      averageMoves: runs.reduce((sum, run) => sum + run.moves, 0) / runs.length,
      maxMoves: Math.max(...runs.map(run => run.moves)),
      maxTurns: Math.max(...runs.map(run => run.maxTurns)),
      cooledMoves: runs.reduce((sum, run) => sum + run.cooledMoves, 0),
      cooledBonusRate: runs.reduce((sum, run) => sum + run.cooledBonus, 0) / Math.max(1, runs.reduce((sum, run) => sum + run.cooledMoves, 0)),
    });
    console.table({ softCap: stats(cooled), natural: stats(natural) });
    expect(cooled.every(run => run.over)).toBe(true);
    expect(stats(cooled).cooledMoves).toBeGreaterThan(0);
    expect(stats(cooled).cooledBonusRate).toBeLessThan(stats(natural).cooledBonusRate);
    expect(stats(cooled).averageMoves).toBeLessThan(stats(natural).averageMoves);
  }, 60_000);
});
