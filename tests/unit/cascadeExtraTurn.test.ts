import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { MatchResolver } from '@engine/MatchResolver';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team } from '@engine/types';

function setup(size: 4 | 5, side = PlayerSide.Left, frozen = false, seed = 1) {
  let id = 100;
  const board = new BoardModel();
  const palette = [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  const set = (row: number, col: number, color: BaseColor) => board.set({ row, col }, { id: id++, type: colorGem(color) });
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) set(row, col, palette[(row + col) % 4]);
  // First clear is a vertical red three. Its falling survivor joins two green pairs.
  for (const col of [0, 1, 3, ...(size === 5 ? [4] : [])]) set(7, col, BaseColor.Green);
  set(4, 2, BaseColor.Green);
  set(5, 2, BaseColor.Red);
  set(7, 2, BaseColor.Red);
  set(6, 3, BaseColor.Red);
  const team = (player: PlayerSide): Team => ({ player, characters: [{
    id: player === PlayerSide.Left ? 0 : 4, name: 'cascade fixture', hp: 9999, maxHp: 9999,
    armor: 0, magic: 0, attack: 1, mana: 0, manaCost: 999, colors: [BaseColor.Green],
    skillId: 'none', defeated: false,
    statuses: frozen && player === side ? [{ id: 'frozen', turns: 3 }] : [],
  } satisfies Character] });
  const state = createGameState(board, team(PlayerSide.Left), team(PlayerSide.Right));
  state.activePlayer = side;
  const engine = new TurnEngine(state, new SeededRNG(seed), () => id++);
  engine.skullChance = 0;
  engine.comboBias = 0;
  expect(new MatchResolver().findMatches(board)).toEqual([]);
  return { engine, state };
}

describe('下落连锁的额外回合', () => {
  it.each([PlayerSide.Left, PlayerSide.Right])('%s 首轮三连后的自然下落四连/五连都保留行动权', side => {
    for (const size of [4, 5] as const) {
      const { engine, state } = setup(size, side);
      const events = engine.resolveSwap({ row: 6, col: 2 }, { row: 6, col: 3 });
      const clears = events.filter(e => e.type === 'elimination');
      expect(clears[0]).toMatchObject({ chainCount: 1, shape: 'line3' });
      expect(clears[0].extraTurnPlayer).toBeUndefined();
      expect(clears.find(e => e.chainCount === 2 && e.cells.length === size))
        .toMatchObject({ shape: 'line4plus', extraTurnPlayer: side });
      expect(events.filter(e => e.type === 'extra-turn')).toEqual([{ type: 'extra-turn', player: side, source: 'match' }]);
      expect(events.some(e => e.type === 'turn-end')).toBe(false);
      expect(state.activePlayer).toBe(side);
      expect(state.actionLog.at(-1)?.outcome).toBe('extra-turn');
    }
  });

  it.each([4, 5] as const)('冻结绿色时，下落 %s 连照常消除但不授予额外回合', size => {
    const { engine, state } = setup(size, PlayerSide.Left, true);
    const events = engine.resolveSwap({ row: 6, col: 2 }, { row: 6, col: 3 });
    expect(events.filter(e => e.type === 'elimination').every(e => e.extraTurnPlayer === undefined)).toBe(true);
    expect(events.filter(e => e.type === 'extra-turn')).toEqual([]);
    expect(events).toContainEqual({ type: 'status-blocked', targetId: 0, statusId: 'frozen', reason: 'extra-turn' });
    expect(state.activePlayer).toBe(PlayerSide.Right);
  });
});
