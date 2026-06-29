import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { GravitySystem } from '@engine/GravitySystem';
import { SeededRNG } from '@engine/rng';
import { colorGem, BaseColor } from '@engine/types';
import type { Gem } from '@engine/types';

function makeIdGen(): () => number {
  let id = 10000;
  return () => id++;
}

function gem(id: number): Gem {
  return { id, type: colorGem(BaseColor.Red) };
}

describe('GravitySystem', () => {
  it('单列：底部空格被上方宝石填补', () => {
    const board = new BoardModel();
    const idGen = makeIdGen();
    const grav = new GravitySystem(new SeededRNG(1), idGen);

    // 第 0 列：仅 (0,0) 有一个宝石，其余为空
    const g = gem(1);
    board.set({ row: 0, col: 0 }, g);

    const result = grav.apply(board, 0);

    // 该宝石应落到底部 (7,0)
    expect(board.get({ row: 7, col: 0 })?.id).toBe(1);
    // 顶部应补充新宝石，棋盘填满
    expect(board.isFull()).toBe(true);
    // 应记录该宝石的移动
    const move = result.moves.find((m) => m.gemId === 1);
    expect(move).toBeDefined();
    expect(move!.to).toEqual({ row: 7, col: 0 });
  });

  it('重力后棋盘所有格子填满', () => {
    const board = new BoardModel();
    const idGen = makeIdGen();
    const grav = new GravitySystem(new SeededRNG(42), idGen);
    // 棋盘全空，全部靠补充
    grav.apply(board, 0);
    expect(board.isFull()).toBe(true);
  });

  it('补充的新宝石 id 唯一', () => {
    const board = new BoardModel();
    const idGen = makeIdGen();
    const grav = new GravitySystem(new SeededRNG(7), idGen);
    const result = grav.apply(board, 0);
    const ids = result.spawns.map((s) => s.gemId);
    expect(new Set(ids).size).toBe(ids.length);
    // 全空棋盘需补满 64 格
    expect(result.spawns.length).toBe(64);
  });

  it('保序：同列多个宝石下落后相对顺序不变', () => {
    const board = new BoardModel();
    const idGen = makeIdGen();
    const grav = new GravitySystem(new SeededRNG(3), idGen);
    // 第 0 列放置 (1,0)=A, (3,0)=B，中间有空
    board.set({ row: 1, col: 0 }, gem(100));
    board.set({ row: 3, col: 0 }, gem(200));
    grav.apply(board, 0);
    // A 在上、B 在下，落底后 B 在最底 (7)，A 在 (6)
    expect(board.get({ row: 7, col: 0 })?.id).toBe(200);
    expect(board.get({ row: 6, col: 0 })?.id).toBe(100);
  });
});
