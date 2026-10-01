import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import { applyMove, beginHunt, hasMatch } from '../../src/meta/systems/treasureHunt';
import * as pacing from '../../src/meta/systems/huntPacing';

/** Greedy legal play: prefer visible extra turns, then upgrading valuable loot.
 * No peek at refill RNG and no artificial turn cap in the gameplay itself. */
function greedyMove(cells: number[], strategy: 'turns' | 'loot' = 'turns'): [number, number] {
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
      const lootPriority = strategy === 'loot' && value >= 3 ** 5 ? 100_000 + value : value;
      const score = (largest >= 5 ? 20_000 : largest >= 4 ? 10_000 : 0) + lootPriority;
      if (score > bestScore) { bestScore = score; choice = [a, b]; }
    }
    cells[a] = av; cells[b] = bv;
  }
  if (!choice) throw new Error('No playable move');
  return choice;
}

function simulate(seed: number, limit = 1200, strategy: 'turns' | 'loot' = 'turns') {
  const save = newSave({ now: 0 }); save.materials.treasureMaps = 1;
  const start = beginHunt(save, seed);
  if (!start.ok) throw new Error(start.message);
  let state = start.state, bonuses = 0, cooledMoves = 0, cooledBonus = 0, maxTurns = state.turns;
  let firstVaultMove: number | null = null;
  const loot = (cells: number[]) => ({
    vaults: cells.filter(tier => tier === 7).length,
    redChests: cells.filter(tier => tier === 6).length,
    firstVaultMove,
  });
  for (let step = 0; step < limit; step++) {
    const active = state.softCap!.peak >= state.softCap!.target || state.moves >= pacing.HUNT_LONG_RUN.startMoves;
    const move = greedyMove(state.cells, strategy);
    const played = applyMove(state, ...move);
    if (!played.ok) throw new Error(played.message);
    if (played.best >= 4) bonuses++;
    if (active) { cooledMoves++; if (played.best >= 4) cooledBonus++; }
    maxTurns = Math.max(maxTurns, played.turns);
    if (firstVaultMove === null && played.cells.includes(7)) firstVaultMove = played.moves;
    if (played.over) return { over: true, moves: played.moves, bonuses, cooledMoves, cooledBonus, maxTurns, ...loot(played.cells) };
    state = { cells: played.cells, turns: played.turns, moves: played.moves, rng: played.rng, softCap: played.softCap };
  }
  return { over: false, moves: state.moves, bonuses, cooledMoves, cooledBonus, maxTurns, ...loot(state.cells) };
}

describe('藏宝图随机软上限模拟', () => {
  afterEach(() => vi.restoreAllMocks());
  it('主动寻找额外回合的固定种子玩家：降温后可自然结束，而非直接扣步/强制截断', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => new SeededRNG(700 + i).nextInt(0xffffffff));
    const cooled = seeds.map(seed => simulate(seed));
    vi.spyOn(pacing, 'huntComboBias').mockReturnValue(0);
    const natural = seeds.map(seed => simulate(seed));
    const stats = (runs: ReturnType<typeof simulate>[]) => ({
      completed: runs.filter(run => run.over).length,
      runsWithVault: runs.filter(run => run.vaults > 0).length,
      averageVaults: runs.reduce((sum, run) => sum + run.vaults, 0) / runs.length,
      maxVaults: Math.max(...runs.map(run => run.vaults)),
      averageRedChests: runs.reduce((sum, run) => sum + run.redChests, 0) / runs.length,
      runsWithRedChest: runs.filter(run => run.redChests > 0).length,
      averageMoves: runs.reduce((sum, run) => sum + run.moves, 0) / runs.length,
      maxMoves: Math.max(...runs.map(run => run.moves)),
      maxTurns: Math.max(...runs.map(run => run.maxTurns)),
      cooledMoves: runs.reduce((sum, run) => sum + run.cooledMoves, 0),
      cooledBonusRate: runs.reduce((sum, run) => sum + run.cooledBonus, 0) / Math.max(1, runs.reduce((sum, run) => sum + run.cooledMoves, 0)),
    });
    console.table({ softCap: stats(cooled), natural: stats(natural) });
    console.log('Cooled vault distribution:', Object.fromEntries(
      [...new Set(cooled.map(run => run.vaults))].sort((a, b) => a - b)
        .map(count => [count, cooled.filter(run => run.vaults === count).length]),
    ));
    console.log('Cooled first vault moves:', cooled.flatMap(run => run.firstVaultMove === null ? [] : [run.firstVaultMove]));
    expect(cooled.filter(run => run.vaults > 0).length).toBeGreaterThanOrEqual(10);
    expect(cooled.every(run => run.over)).toBe(true);
    expect(stats(cooled).cooledMoves).toBeGreaterThan(0);
    expect(stats(cooled).cooledBonusRate).toBeLessThan(stats(natural).cooledBonusRate);
    expect(stats(cooled).averageMoves).toBeLessThan(stats(natural).averageMoves);
    // Allow chest-building time; jointly require vault reachability and a short long-run tail.
    expect(stats(cooled).averageMoves).toBeLessThan(180);
    expect(cooled.filter(run => run.moves >= 300).length).toBeLessThanOrEqual(2);
    expect(stats(cooled).maxTurns).toBeLessThan(80);
  }, 60_000);

  it('独立1000种子：额外回合优先和高级合成优先均能获得宝库，且不重回普遍长局', () => {
    const rng = new SeededRNG(0x48554e54);
    const seeds = Array.from({ length: 1000 }, () => rng.nextInt(0xffffffff));
    for (const strategy of ['turns', 'loot'] as const) {
      const runs = seeds.map(seed => simulate(seed, 1200, strategy));
      const stats = {
        strategy,
        completed: runs.filter(run => run.over).length,
        runsWithVault: runs.filter(run => run.vaults > 0).length,
        averageVaults: runs.reduce((sum, run) => sum + run.vaults, 0) / runs.length,
        maxVaults: Math.max(...runs.map(run => run.vaults)),
        averageRedChests: runs.reduce((sum, run) => sum + run.redChests, 0) / runs.length,
        averageMoves: runs.reduce((sum, run) => sum + run.moves, 0) / runs.length,
        maxMoves: Math.max(...runs.map(run => run.moves)),
        maxTurns: Math.max(...runs.map(run => run.maxTurns)),
        runsOver300: runs.filter(run => run.moves >= 300).length,
        runsOver500: runs.filter(run => run.moves >= 500).length,
      };
      console.table([stats]);
      expect(stats.completed).toBe(1000);
      expect(stats.runsWithVault).toBeGreaterThanOrEqual(100);
      expect(stats.averageMoves).toBeLessThan(180);
      expect(stats.runsOver300).toBeLessThanOrEqual(20);
      expect(stats.runsOver500).toBe(0);
    }
  }, 120_000);
});
