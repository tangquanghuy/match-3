import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import {
  HUNT_START_TURNS,
  applyMove,
  beginHunt,
  commitMove,
  createOpeningBoard,
  hasLegalMove,
  hasMatch,
  rollRewards,
} from '../../src/meta/systems/treasureHunt';
import type { TreasureHuntState } from '../../src/meta/state/schema';

function checker(): number[] {
  return Array.from({ length: 64 }, (_, i) => ((Math.floor(i / 8) + (i % 8)) % 2 === 0 ? 0 : 1));
}

function at(row: number, col: number): number {
  return row * 8 + col;
}

function state(cells: number[], turns = HUNT_START_TURNS, moves = 0): TreasureHuntState {
  return { cells, turns, moves, rng: new SeededRNG(2).getState() };
}

describe('寻宝', () => {
  it('开局棋盘没有现成连线，并且能走', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const cells = createOpeningBoard(new SeededRNG(seed));
      expect(cells).toHaveLength(64);
      expect(hasMatch(cells)).toBe(false);
      expect(hasLegalMove(cells)).toBe(true);
      expect(cells.every((tier) => tier >= 0 && tier <= 3)).toBe(true);
    }
  });

  it('开局按种子生成不同宝物分布，而不是反复回退到固定双色盘', () => {
    const boards = Array.from({length:100}, (_, i) => createOpeningBoard(new SeededRNG(i + 1)));
    expect(new Set(boards.map(cells => cells.join(','))).size).toBe(100);
    expect(boards.filter(cells => cells.includes(2) || cells.includes(3)).length).toBeGreaterThan(95);
    for (const cells of boards) { expect(hasMatch(cells)).toBe(false); expect(hasLegalMove(cells)).toBe(true); }
    expect(createOpeningBoard(new SeededRNG(42))).toEqual(createOpeningBoard(new SeededRNG(42)));
  });

  it('三连把被移动的那颗升一档，并消耗 1 步', () => {
    const cells = checker();
    cells[at(0, 1)] = 0;
    const played = applyMove(state(cells), at(0, 1), at(1, 1));
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.best).toBe(3);
    expect(played.turns).toBe(7);
    expect(played.moves).toBe(1);
    expect(played.cells).toHaveLength(64);
    expect(played.cells.every((tier) => tier >= 0)).toBe(true);
  });

  it('四连不耗步，五连加 1 步', () => {
    const four = checker();
    four[at(0, 3)] = 0;
    four[at(0, 4)] = 1;
    const fourMove = applyMove(state(four), at(0, 1), at(1, 1));
    expect(fourMove.ok).toBe(true);
    if (!fourMove.ok) return;
    expect(fourMove.best).toBe(4);
    expect(fourMove.turns).toBe(8);

    const five = checker();
    five[at(0, 3)] = 0;
    const fiveMove = applyMove(state(five), at(0, 1), at(1, 1));
    expect(fiveMove.ok).toBe(true);
    if (!fiveMove.ok) return;
    expect(fiveMove.best).toBe(5);
    expect(fiveMove.turns).toBe(9);
  });

  it('金库不能交换，换不成连线的步不改棋盘', () => {
    const cells = checker();
    cells[at(3, 3)] = 7;
    const blocked = applyMove(state(cells), at(3, 3), at(3, 4));
    expect(blocked.ok).toBe(false);
    const useless = applyMove(state(checker()), at(0, 0), at(0, 1));
    expect(useless.ok).toBe(false);
  });

  it('铜币降价后给17黄金，长局不再按步数赠送特质石', () => {
    const rng = new SeededRNG(1);
    const grant = rollRewards(Array.from({ length: 64 }, () => 0), 30, rng);
    expect(grant.gold).toBe(64 * 17);
    expect(grant.souls).toBe(0);
    expect(Object.values(grant.traitstones).reduce((sum, n) => sum + n, 0)).toBe(0);
  });

  it('开局扣 1 张藏宝图，未打完的一局不重复扣', () => {
    const save = newSave({ now: 0 });
    save.materials.treasureMaps = 2;
    const first = beginHunt(save, 4);
    expect(first.ok).toBe(true);
    expect(save.materials.treasureMaps).toBe(1);
    const second = beginHunt(save, 9);
    expect(second.ok).toBe(true);
    expect(save.materials.treasureMaps).toBe(1);
    const empty = newSave({ now: 0 });
    expect(beginHunt(empty, 1).ok).toBe(false);
  });

  it('最后一步结束时把奖励写入存档', () => {
    const save = newSave({ now: 0 });
    const cells = checker();
    cells[at(0, 1)] = 0;
    save.treasureHunt = state(cells, 1, 14);
    const goldBefore = save.currencies.gold;
    const played = commitMove(save, at(0, 1), at(1, 1));
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.over).toBe(true);
    expect(save.treasureHunt).toBeNull();
    expect(save.currencies.gold).toBeGreaterThan(goldBefore);
    expect(Object.values(save.materials.traitstones).reduce((sum, n) => sum + n, 0)).toBe(0);
  });
});
