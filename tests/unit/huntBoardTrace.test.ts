import { describe, expect, it } from 'vitest';
import { BoardModel } from '../../src/engine/BoardModel';
import { createHuntBoard, HuntBoardTrace, huntPos } from '../../src/engine/HuntBoard';
import { SeededRNG } from '../../src/engine/rng';
import type { GameEvent } from '../../src/engine/events';
import { applyMove, commitMove, createOpeningBoard } from '../../src/meta/systems/treasureHunt';
import { newSave } from '../../src/meta/state/schema';

function replay(board: BoardModel, events: GameEvent[]) {
  for (const event of events) {
    if (event.type === 'swap') board.swap(event.a, event.b);
    if (event.type === 'gem-merge') for (const group of event.groups) {
      expect(board.get(group.target.pos)?.id).toBe(group.target.gemId);
      for (const cell of group.consumed) { expect(board.get(cell.pos)?.id).toBe(cell.gemId); board.set(cell.pos, null); }
      board.set(group.target.pos, { id: group.target.gemId, type: group.target.gemType });
    }
    if (event.type === 'gravity' || event.type === 'reshuffle') {
      const pieces = event.moves.map(move => ({ ...move, gem: board.get(move.from)! }));
      for (const move of pieces) { expect(move.gem.id).toBe(move.gemId); board.set(move.from, null); }
      for (const move of pieces) board.set(move.to, move.gem);
    }
    if (event.type === 'refill') for (const spawn of event.spawns) {
      expect(board.get(spawn.to)).toBeNull();
      board.set(spawn.to, { id: spawn.gemId, type: spawn.gemType });
    }
  }
  const cells: number[] = [], ids = new Set<number>();
  board.forEach(gem => { expect(gem).not.toBeNull(); ids.add(gem!.id); cells.push(gem!.type.kind === 'special' ? gem!.type.spec.tier! - 1 : -1); });
  expect(ids.size).toBe(64);
  return cells;
}

function firstMove(state: Parameters<typeof applyMove>[0]) {
  for (let i = 0; i < 64; i++) for (const to of [i + 1, i + 8]) {
    const result = applyMove(state, i, to);
    if (result.ok) return result;
  }
  throw new Error('No move');
}

describe('treasure hunt battle-board trace', () => {
  it('replays authoritative merges, gravity and refill exactly, without changing the input', () => {
    let merges = 0;
    for (let seed = 1; seed <= 25; seed++) {
      let state = { cells: createOpeningBoard(new SeededRNG(seed)), turns: 30, moves: 0, rng: seed };
      for (let move = 0; move < 8; move++) {
        const before = JSON.stringify(state), result = firstMove(state);
        expect(JSON.stringify(state)).toBe(before);
        expect(replay(createHuntBoard(state.cells), result.events)).toEqual(result.cells);
        merges += result.events.filter(e => e.type === 'gem-merge').length;
        state = { cells: result.cells, turns: result.turns, moves: result.moves, rng: result.rng };
        if (result.over) break;
      }
    }
    expect(merges).toBeGreaterThan(200);
  });
  it('reshuffle retains every piece id and tier', () => {
    const cells = Array.from({ length: 64 }, (_, i) => i % 8);
    const trace = new HuntBoardTrace(cells);
    const after = cells.slice().reverse();
    trace.reshuffle(after);
    expect(replay(createHuntBoard(cells), trace.events)).toEqual(after);
  });
  it('maps all eight tiers to the existing battle loot sprites', () => {
    const board = createHuntBoard(Array.from({ length: 64 }, (_, i) => i % 8));
    expect(board.get(huntPos(7))?.type).toEqual({ kind: 'special', spec: { kind: 'bootyGem', tier: 8 } });
  });
  it('committed save contains no presentation history', () => {
    const save = newSave({ now: 0 });
    save.treasureHunt = { cells: createOpeningBoard(new SeededRNG(3)), turns: 8, moves: 0, rng: 3 };
    const swap = firstMove(save.treasureHunt).events[0];
    if (swap.type !== 'swap') throw new Error('Expected swap');
    const result = commitMove(save, swap.a.row * 8 + swap.a.col, swap.b.row * 8 + swap.b.col);
    expect(result.ok).toBe(true);
    expect(save.treasureHunt).not.toHaveProperty('events');
  });
});
