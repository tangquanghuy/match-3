import { BoardModel } from './BoardModel';
import { MatchResolver } from './MatchResolver';
import { findLegalSwaps } from './boardUtils';
import type { SeededRNG } from './rng';
import type { CellPos } from './types';

const resolver = new MatchResolver();

/**
 * 简单敌方 AI：在所有合法交换中挑一个。
 * 评分启发式：优先能消除更多宝石、并尽量促成 4 连及以上（争取额外回合）的交换。
 * 平分时用 RNG 随机选，避免每局完全一致。
 */
export function chooseEnemySwap(
  board: BoardModel,
  rng: SeededRNG,
): { a: CellPos; b: CellPos } | null {
  const swaps = findLegalSwaps(board);
  if (swaps.length === 0) return null;

  let best: { a: CellPos; b: CellPos }[] = [];
  let bestScore = -1;

  for (const sw of swaps) {
    const trial = board.clone();
    trial.swap(sw.a, sw.b);
    const matches = resolver.findMatches(trial);
    if (matches.length === 0) continue;

    let cells = 0;
    let bonus = 0;
    for (const g of matches) {
      cells += g.cells.length;
      if (g.shape === 'line4plus' || g.shape === 'L' || g.shape === 'T') bonus += 5;
    }
    const score = cells + bonus;
    if (score > bestScore) {
      bestScore = score;
      best = [sw];
    } else if (score === bestScore) {
      best.push(sw);
    }
  }

  if (best.length === 0) return swaps[rng.nextInt(swaps.length)];
  return best[rng.nextInt(best.length)];
}
