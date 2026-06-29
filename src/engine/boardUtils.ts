import { BoardModel } from './BoardModel';
import { MatchResolver } from './MatchResolver';
import type { SeededRNG } from './rng';
import type { CellPos, Gem } from './types';

const resolver = new MatchResolver();

/** 棋盘上是否存在至少一个合法交换（需求 3.2，也用于死局检测） */
export function hasLegalSwap(board: BoardModel): boolean {
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const a: CellPos = { row, col };
      const neighbors: CellPos[] = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ];
      for (const b of neighbors) {
        if (!BoardModel.inBounds(b)) continue;
        const trial = board.clone();
        trial.swap(a, b);
        if (resolver.hasAnyMatch(trial)) return true;
      }
    }
  }
  return false;
}

/**
 * 找出所有合法交换的列表（每项为相邻两格 a、b）。
 * 用于提示功能：不求最优收益，随机挑一组即可。
 */
export function findLegalSwaps(board: BoardModel): { a: CellPos; b: CellPos }[] {
  const result: { a: CellPos; b: CellPos }[] = [];
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const a: CellPos = { row, col };
      const neighbors: CellPos[] = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ];
      for (const b of neighbors) {
        if (!BoardModel.inBounds(b)) continue;
        const trial = board.clone();
        trial.swap(a, b);
        if (resolver.hasAnyMatch(trial)) result.push({ a, b });
      }
    }
  }
  return result;
}

/**
 * 找一组提示：随机挑一个合法交换，返回交换后形成的匹配组涉及的全部格子。
 * 不求最优收益。无解返回 null。
 */
export function pickHintSwap(
  board: BoardModel,
  rng: SeededRNG,
): { a: CellPos; b: CellPos; cells: CellPos[] } | null {
  const swaps = findLegalSwaps(board);
  if (swaps.length === 0) return null;
  const chosen = swaps[rng.nextInt(swaps.length)];

  // 在副本上执行交换，找出交换后产生的匹配组，收集其全部格子
  const trial = board.clone();
  trial.swap(chosen.a, chosen.b);
  const matches = resolver.findMatches(trial);

  // 取包含 a 或 b 的那个匹配组（即本次交换促成的组）
  const key = (p: CellPos): string => `${p.row},${p.col}`;
  const ab = new Set([key(chosen.a), key(chosen.b)]);
  let group: CellPos[] = [];
  for (const g of matches) {
    if (g.cells.some((c) => ab.has(key(c)))) {
      group = g.cells.slice();
      break;
    }
  }
  if (group.length === 0) {
    return { a: chosen.a, b: chosen.b, cells: [chosen.a, chosen.b] };
  }

  // 关键：匹配组坐标是"交换后"的。把其中的交换格映射回"交换前"的来源格，
  // 使高亮落在当前棋盘上真正同色的那组宝石上。
  // （交换进 b 的宝石来自 a，反之亦然）
  const cells = group.map((c) => {
    if (key(c) === key(chosen.a)) return chosen.b;
    if (key(c) === key(chosen.b)) return chosen.a;
    return c;
  });

  return { a: chosen.a, b: chosen.b, cells };
}

/**
 * 原地洗牌：保留棋盘上现有的全部宝石（同一组 id 与类型），
 * 重排到一个"无预成匹配且存在合法交换"的布局。
 * 返回每个宝石的 from→to 移动列表，供表现层做洗牌动画。
 */
export function reshuffle(
  board: BoardModel,
  rng: SeededRNG,
): { gemId: number; from: CellPos; to: CellPos }[] {
  // 收集现有宝石及其原位置
  const gems: Gem[] = [];
  const origin = new Map<number, CellPos>();
  board.forEach((gem, pos) => {
    if (gem) {
      gems.push(gem);
      origin.set(gem.id, { ...pos });
    }
  });

  const positions: CellPos[] = [];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) positions.push({ row: r, col: c });
  }

  for (let attempt = 0; attempt < 400; attempt++) {
    // Fisher-Yates 洗牌（用种子化 RNG）
    const shuffled = gems.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // 写入棋盘
    for (let i = 0; i < positions.length; i++) {
      board.set(positions[i], shuffled[i]);
    }
    // 校验：无预成匹配 且 有合法交换
    if (!resolver.hasAnyMatch(board) && hasLegalSwap(board)) {
      const moves: { gemId: number; from: CellPos; to: CellPos }[] = [];
      board.forEach((gem, pos) => {
        if (gem) {
          const from = origin.get(gem.id)!;
          if (from.row !== pos.row || from.col !== pos.col) {
            moves.push({ gemId: gem.id, from, to: { ...pos } });
          }
        }
      });
      return moves;
    }
  }

  // 兜底：返回当前布局的移动（极少触发）
  const moves: { gemId: number; from: CellPos; to: CellPos }[] = [];
  board.forEach((gem, pos) => {
    if (gem) {
      const from = origin.get(gem.id)!;
      if (from.row !== pos.row || from.col !== pos.col) {
        moves.push({ gemId: gem.id, from, to: { ...pos } });
      }
    }
  });
  return moves;
}
