import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { GravitySystem } from '@engine/GravitySystem';
import { BoardGenerator } from '@engine/boardGen';
import { MatchResolver } from '@engine/MatchResolver';
import { SeededRNG } from '@engine/rng';
import {
  BATTLE_COMBO_BIAS, BATTLE_SETUP_BIAS, SETUP_SHARE_ONE_PLUS, SETUP_SHARE_TWO_PLUS, bestSwapTier, bigSwapCount,
  comboStreakFade, extraTurnStreakOf, hasBigHolePattern, setupBucketFor,
} from '@engine/comboBias';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { ActionLogEntry, GemType } from '@engine/types';

const FILLER = [BaseColor.Brown, BaseColor.Purple, BaseColor.Yellow, BaseColor.Green];
function fillerBoard(): BoardModel {
  const b = new BoardModel();
  let id = 1;
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      b.set({ row, col }, { id: id++, type: colorGem(FILLER[(row + 2 * col) % 4]) });
    }
  }
  return b;
}

/** 清掉顶部 n 行，模拟一次消除后的空洞 */
function clearTop(board: BoardModel, rows: number): void {
  for (let row = 0; row < rows; row++) for (let col = 0; col < BoardModel.COLS; col++) board.set({ row, col }, null);
}

function snapshot(board: BoardModel): string {
  const out: string[] = [];
  board.forEach((gem) => out.push(gem ? `${gem.id}:${JSON.stringify(gem.type)}` : '-'));
  return out.join('|');
}

function log(entries: [PlayerSide, ActionLogEntry['outcome']][]): ActionLogEntry[] {
  return entries.map(([side, outcome], index) => ({ index, side, action: { type: 'cast', characterId: 1 }, outcome }));
}

describe('连消倾向：默认关闭时与旧版逐字节一致', () => {
  it('comboBias = 0 与不传该参数的重力/补充结果、随机数消耗完全相同', () => {
    for (const seed of [1, 7, 42, 2026]) {
      const a = fillerBoard(); const b = fillerBoard();
      clearTop(a, 3); clearTop(b, 3);
      let idA = 500; let idB = 500;
      const rngA = new SeededRNG(seed); const rngB = new SeededRNG(seed);
      const ra = new GravitySystem(rngA, () => idA++).apply(a, 0.16);
      const rb = new GravitySystem(rngB, () => idB++).apply(b, 0.16, undefined, undefined, 0, log([[PlayerSide.Left, 'switched']]));
      expect(rb).toEqual(ra);
      expect(snapshot(b)).toBe(snapshot(a));
      expect(rngB.getState()).toBe(rngA.getState());
    }
  });

  it('setupBias = 0 与旧版开局逐字节一致', () => {
    for (const seed of [1, 12345, 20260830]) {
      let idA = 1; let idB = 1;
      const a = new BoardGenerator(new SeededRNG(seed), () => idA++, 0.16).generate();
      const b = new BoardGenerator(new SeededRNG(seed), () => idB++, 0.16, 0).generate();
      expect(snapshot(b)).toBe(snapshot(a));
    }
  });
});

describe('连消倾向：开启时的行为', () => {
  it('补充结果合法：棋盘填满、id 唯一且按列序分配、同 seed 可复现', () => {
    const run = () => {
      const board = fillerBoard();
      clearTop(board, 4);
      let id = 900;
      const result = new GravitySystem(new SeededRNG(99), () => id++)
        .apply(board, 0.16, undefined, undefined, BATTLE_COMBO_BIAS, log([[PlayerSide.Left, 'switched']]));
      return { board, result };
    };
    const first = run();
    expect(first.board.isFull()).toBe(true);
    const ids = first.result.spawns.map((s) => s.gemId);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(new Set(ids).size).toBe(32);
    expect(first.result.spawns.every((s) => first.board.get(s.to)?.id === s.gemId)).toBe(true);
    const second = run();
    expect(snapshot(second.board)).toBe(snapshot(first.board));
  });

  /** n 次试验里补充后「无连锁且有 4+ 交换」的占比 */
  function bigSwapShareAfterRefill(holes: (board: BoardModel) => void, bias: number, trials = 150): number {
    let hits = 0;
    for (let seed = 1; seed <= trials; seed++) {
      const board = fillerBoard();
      holes(board);
      let id = 1000;
      new GravitySystem(new SeededRNG(seed), () => id++)
        .apply(board, 0.16, undefined, undefined, bias, log([[PlayerSide.Left, 'switched']]));
      if (new MatchResolver().findMatches(board).length === 0 && bestSwapTier(board) > 0) hits++;
    }
    return hits / trials;
  }
  /** 每列挖一个互不相连的洞（不是大消形状）：落定后整条顶行由补充填满 */
  const scattered = (board: BoardModel) => {
    for (let col = 0; col < BoardModel.COLS; col++) board.set({ row: col % 3, col }, null);
  };

  it('新回合（本次行动没打出大消）的补充适度提高 4+ 交换的机会', () => {
    const probe = fillerBoard();
    scattered(probe);
    expect(hasBigHolePattern(probe)).toBe(false);
    const plain = bigSwapShareAfterRefill(scattered, 0);
    const biased = bigSwapShareAfterRefill(scattered, BATTLE_COMBO_BIAS);
    expect(biased).toBeGreaterThan(plain);
    // 适度：不到旧的「强度 10」那种大量送 4/5 连
    expect(biased).toBeLessThan(bigSwapShareAfterRefill(scattered, 10));
  });

  it('连段护栏：本次行动已打出大消（下一个决策点还是行动方）时反向打散', () => {
    const topRow = (board: BoardModel) => clearTop(board, 1);
    const probe = fillerBoard();
    topRow(probe);
    expect(hasBigHolePattern(probe)).toBe(true);
    expect(bigSwapShareAfterRefill(topRow, BATTLE_COMBO_BIAS)).toBeLessThan(bigSwapShareAfterRefill(topRow, 0));

    expect(comboStreakFade(0)).toBe(1);
    expect(comboStreakFade(1)).toBeLessThan(0);
    expect(comboStreakFade(9)).toBe(comboStreakFade(2));
    // 连段计数只看当前行动之前、同一方连续的 extra-turn
    expect(extraTurnStreakOf(undefined)).toBe(0);
    expect(extraTurnStreakOf(log([[PlayerSide.Left, 'extra-turn'], [PlayerSide.Left, 'extra-turn'], [PlayerSide.Left, 'switched']]))).toBe(2);
    expect(extraTurnStreakOf(log([[PlayerSide.Right, 'extra-turn'], [PlayerSide.Left, 'switched']]))).toBe(0);
    expect(extraTurnStreakOf(log([[PlayerSide.Left, 'extra-turn'], [PlayerSide.Left, 'switched'], [PlayerSide.Right, 'switched']]))).toBe(0);
  });

  it('空洞形状识别：一行 4 空 / 一列 4 空 / L·T 交叉算大消，3 连不算', () => {
    const cut = (cells: [number, number][]) => { const b = fillerBoard(); for (const [row, col] of cells) b.set({ row, col }, null); return hasBigHolePattern(b); };
    expect(cut([[0, 0], [0, 1], [0, 2]])).toBe(false);
    expect(cut([[0, 0], [0, 1], [0, 2], [0, 3]])).toBe(true);
    expect(cut([[0, 5], [1, 5], [2, 5], [3, 5]])).toBe(true);
    expect(cut([[2, 1], [2, 2], [2, 3], [1, 2], [0, 2]])).toBe(true);
    expect(cut([[0, 0], [0, 1], [0, 2], [2, 5], [3, 5], [4, 5]])).toBe(false);
  });

  it('开局倾向：约 60% 的开局有 ≥2 处 4+ 交换、约 80% 有 ≥1 处，且仍无预成匹配', () => {
    const trials = 300;
    let twoPlus = 0; let onePlus = 0; let plainTwoPlus = 0; let plainOnePlus = 0;
    for (let seed = 1; seed <= trials; seed++) {
      let id = 1;
      const a = new BoardGenerator(new SeededRNG(seed * 7919), () => id++, 0.16).generate();
      const b = new BoardGenerator(new SeededRNG(seed * 7919), () => id++, 0.16, BATTLE_SETUP_BIAS).generate();
      expect(new MatchResolver().findMatches(b)).toEqual([]);
      const nb = bigSwapCount(b); const na = bigSwapCount(a);
      if (nb >= 2) twoPlus++;
      if (nb >= 1) onePlus++;
      if (na >= 2) plainTwoPlus++;
      if (na >= 1) plainOnePlus++;
    }
    expect(twoPlus / trials).toBeGreaterThan(SETUP_SHARE_TWO_PLUS - 0.08);
    expect(twoPlus / trials).toBeLessThan(SETUP_SHARE_TWO_PLUS + 0.08);
    expect(onePlus / trials).toBeGreaterThan(SETUP_SHARE_ONE_PLUS - 0.07);
    expect(onePlus / trials).toBeLessThan(SETUP_SHARE_ONE_PLUS + 0.07);
    // 比改动前的自然开局明显多
    expect(twoPlus).toBeGreaterThan(plainTwoPlus * 2);
    expect(onePlus).toBeGreaterThan(plainOnePlus * 1.3);
  });

  it('开局档位按目标占比切分', () => {
    expect(setupBucketFor(0)).toBe(2);
    expect(setupBucketFor(SETUP_SHARE_TWO_PLUS - 0.001)).toBe(2);
    expect(setupBucketFor(SETUP_SHARE_TWO_PLUS)).toBe(1);
    expect(setupBucketFor(SETUP_SHARE_ONE_PLUS)).toBe(0);
    expect(setupBucketFor(0.999)).toBe(0);
  });

  it('bestSwapTier：4 连 = 1，5 连 = 2，找完不改棋盘', () => {
    const b = fillerBoard();
    const put = (row: number, col: number, type: GemType) => b.set({ row, col }, { id: 5000 + row * 8 + col, type });
    for (const col of [0, 1, 3]) put(0, col, colorGem(BaseColor.Red));
    put(1, 2, colorGem(BaseColor.Red));
    const before = snapshot(b);
    expect(bestSwapTier(b)).toBe(1);
    expect(snapshot(b)).toBe(before);
    put(0, 4, colorGem(BaseColor.Red));
    expect(bestSwapTier(b)).toBe(2);
  });
});
