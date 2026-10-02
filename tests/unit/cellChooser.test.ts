import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { AiCellChooser, FixedCellChooser, prototypeNeedsCell } from '@engine/skills/cellChooser';
import { gemEffect } from '@engine/skills/effects/gems';
import type { EffectContext } from '@engine/skills/effects/context';
import { skill, explodeAt, CELL, dmg, destroyArea, destroyAt, transform } from '@engine/skills/builders';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType, CellPos } from '@engine/types';
import type { GameState } from '@engine/GameState';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}
function fullBoard(): BoardModel {
  gid = 0;
  const board = new BoardModel();
  const palette = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
  }
  return board;
}
function makeChar(id: number): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 8, mana: 8, skillId: 'none', statuses: [], defeated: false,
  };
}
function stateWith(board: BoardModel): GameState {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  return createGameState(board, left, right);
}
function pureCtx(state: GameState, chosenCell?: CellPos): EffectContext {
  let id = 900000;
  const ctx: EffectContext = { state, casterId: 0, rng: new SeededRNG(1), nextGemId: () => id++ };
  if (chosenCell) ctx.chosenCell = chosenCell;
  return ctx;
}

describe('AiCellChooser', () => {
  it('选离棋盘中心最近的非空格', () => {
    gid = 0;
    const board = new BoardModel();
    // 只放两颗：一颗靠角、一颗近中心
    board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 4, col: 4 }, g(colorGem(BaseColor.Blue)));
    const state = stateWith(board);
    expect(new AiCellChooser().choose(state, 0, new SeededRNG(1))).toEqual({ row: 4, col: 4 });
  });
  it('全空棋盘 → null', () => {
    const state = stateWith(new BoardModel());
    expect(new AiCellChooser().choose(state, 0, new SeededRNG(1))).toBeNull();
  });
  it('单格转化优先形成己方可用的五连', () => {
    const board = new BoardModel();
    [BaseColor.Red, BaseColor.Red, BaseColor.Blue, BaseColor.Red, BaseColor.Red]
      .forEach((color, col) => board.set({ row: 0, col }, g(colorGem(color))));
    board.set({ row: 4, col: 4 }, g(colorGem(BaseColor.Blue)));
    const state = stateWith(board);
    state.teams[PlayerSide.Left].characters[0]!.mana = 0;
    expect(new AiCellChooser().choose(state, 0, new SeededRNG(1), undefined,
      skill(transform(CELL, BaseColor.Red)))).toEqual({ row: 0, col: 2 });
  });
  it('单格摧毁优先选择己方需要的颜色', () => {
    const board = new BoardModel();
    board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 4, col: 4 }, g(colorGem(BaseColor.Blue)));
    const state = stateWith(board);
    state.teams[PlayerSide.Left].characters[0]!.mana = 0;
    expect(new AiCellChooser().choose(state, 0, new SeededRNG(1), undefined,
      skill(destroyAt(CELL)))).toEqual({ row: 0, col: 0 });
  });
});

describe('FixedCellChooser', () => {
  it('恒返回给定格', () => {
    expect(new FixedCellChooser({ row: 2, col: 3 }).choose()).toEqual({ row: 2, col: 3 });
  });
});

describe('prototypeNeedsCell', () => {
  it('含 explodeAt(CELL) → true', () => {
    expect(prototypeNeedsCell(skill(explodeAt(CELL)))).toBe(true);
  });
  it('固定格 explodeAt 不需玩家选 → false', () => {
    expect(prototypeNeedsCell(skill(explodeAt({ row: 3, col: 3 })))).toBe(false);
  });
  it('无宝石选格段 → false', () => {
    expect(prototypeNeedsCell(skill(dmg('enemyFront', 3)))).toBe(false);
  });
  it('面积爆破锚格 CELL → true', () => {
    expect(prototypeNeedsCell(skill(destroyArea('row3', 'explode', CELL)))).toBe(true);
  });
});

describe('explodeAt 引爆（pure，辐射一圈）', () => {
  it('以选定格为中心 3x3 爆破', () => {
    const board = fullBoard();
    const state = stateWith(board);
    const events = gemEffect({ op: 'clear', mode: 'explode', target: { kind: 'cell', cell: 'CELL' } }).apply(
      pureCtx(state, { row: 4, col: 4 }),
    );
    const ex = events.find((e) => e.type === 'gem-explode');
    expect(ex?.type).toBe('gem-explode');
    // 3x3 = 9 格全在界内
    if (ex?.type === 'gem-explode') expect(ex.cells.length).toBe(9);
  });

  it('中心在角落时只波及界内格（角落=4 格）', () => {
    const board = fullBoard();
    const state = stateWith(board);
    const events = gemEffect({ op: 'clear', mode: 'explode', target: { kind: 'cell', cell: 'CELL' } }).apply(
      pureCtx(state, { row: 0, col: 0 }),
    );
    const ex = events.find((e) => e.type === 'gem-explode');
    if (ex?.type === 'gem-explode') expect(ex.cells.length).toBe(4);
  });

  it('destroyAt 单格只清该格（不辐射）', () => {
    const board = fullBoard();
    const state = stateWith(board);
    const events = gemEffect({ op: 'clear', mode: 'destroy', target: { kind: 'cell', cell: 'CELL' } }).apply(
      pureCtx(state, { row: 4, col: 4 }),
    );
    const d = events.find((e) => e.type === 'gem-destroy');
    if (d?.type === 'gem-destroy') expect(d.cells.length).toBe(1);
  });

  it('未提供 chosenCell → 安全跳过', () => {
    const board = fullBoard();
    const state = stateWith(board);
    const events = gemEffect({ op: 'clear', mode: 'explode', target: { kind: 'cell', cell: 'CELL' } }).apply(pureCtx(state));
    expect(events).toEqual([]);
  });
});

describe('castSkill 接入选格（端到端）', () => {
  it('FixedCellChooser 指定引爆中心', () => {
    const board = fullBoard();
    const state = stateWith(board);
    state.teams[PlayerSide.Left].characters[0].skillId = 'boom';
    const registry = new ExtensionRegistry();
    registry.prototypes.set('boom', skill(explodeAt(CELL)));
    let idg = 500000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.skullChance = 0;
    engine.setCellChooser(new FixedCellChooser({ row: 4, col: 4 }));

    const events = engine.castSkill(0);
    expect(events.some((e) => e.type === 'gem-explode')).toBe(true);
    expect(board.isFull()).toBe(true); // 引爆后重力补满
  });

  it('AI 默认选中心格引爆', () => {
    const board = fullBoard();
    const state = stateWith(board);
    state.teams[PlayerSide.Left].characters[0].skillId = 'boom';
    const registry = new ExtensionRegistry();
    registry.prototypes.set('boom', skill(explodeAt(CELL)));
    let idg = 500000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.skullChance = 0;
    const events = engine.castSkill(0);
    expect(events.some((e) => e.type === 'gem-explode')).toBe(true);
  });
});
