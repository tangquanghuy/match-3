import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { FixedCellChooser, prototypeNeedsCell } from '@engine/skills/cellChooser';
import { gemEffect } from '@engine/skills/effects/gems';
import type { EffectContext } from '@engine/skills/effects/context';
import { skill, destroyChosenRow, destroyChosenCol, destroyRows } from '@engine/skills/builders';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Gem, GemType, CellPos } from '@engine/types';
import type { GameState } from '@engine/GameState';

let gid = 0;
function g(type: GemType): Gem { return { id: gid++, type }; }
function fullBoard(): BoardModel {
  gid = 0;
  const board = new BoardModel();
  const palette = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % 4])));
  return board;
}
function makeChar(id: number): Character {
  return { id, name:`C${id}`, maxHp:50, hp:50, attack:5, armor:0, magic:5, colors:[BaseColor.Red], manaCost:8, mana:8, skillId:'none', statuses:[], defeated:false };
}
function stateWith(board: BoardModel): GameState {
  return createGameState(board, { player: PlayerSide.Left, characters:[makeChar(0)] }, { player: PlayerSide.Right, characters:[makeChar(4)] });
}
function pureCtx(state: GameState, chosenCell?: CellPos): EffectContext {
  let id = 900000;
  const ctx: EffectContext = { state, casterId:0, rng:new SeededRNG(1), nextGemId:()=>id++ };
  if (chosenCell) ctx.chosenCell = chosenCell;
  return ctx;
}

describe('prototypeNeedsCell 覆盖选行/列', () => {
  it('选行/列段也走"点选一枚宝石"选择器 → true', () => {
    expect(prototypeNeedsCell(skill(destroyChosenRow()))).toBe(true);
    expect(prototypeNeedsCell(skill(destroyChosenCol()))).toBe(true);
  });
  it('固定整行段无需玩家选 → false', () => {
    expect(prototypeNeedsCell(skill(destroyRows(3)))).toBe(false);
  });
});

describe('chosenLine 以选定宝石格为起点（pure）', () => {
  it('点选 (2,3) + 选行 → 摧毁第2整行（8格）', () => {
    const board = fullBoard();
    const events = gemEffect({ op:'clear', mode:'destroy', target:{ kind:'chosenLine', orientation:'row' } }).apply(pureCtx(stateWith(board), { row: 2, col: 3 }));
    const d = events.find((e) => e.type === 'gem-destroy');
    expect(d?.type).toBe('gem-destroy');
    if (d?.type === 'gem-destroy') {
      expect(d.cells.length).toBe(8);
      expect(d.cells.every((c) => c.pos.row === 2)).toBe(true);
    }
  });
  it('点选 (6,5) + 选列 → 摧毁第5整列（8格）', () => {
    const board = fullBoard();
    const events = gemEffect({ op:'clear', mode:'destroy', target:{ kind:'chosenLine', orientation:'col' } }).apply(pureCtx(stateWith(board), { row: 6, col: 5 }));
    const d = events.find((e) => e.type === 'gem-destroy');
    if (d?.type === 'gem-destroy') {
      expect(d.cells.length).toBe(8);
      expect(d.cells.every((c) => c.pos.col === 5)).toBe(true);
    }
  });
  it('未提供 chosenCell → 安全跳过', () => {
    const events = gemEffect({ op:'clear', mode:'destroy', target:{ kind:'chosenLine', orientation:'row' } }).apply(pureCtx(stateWith(fullBoard())));
    expect(events).toEqual([]);
  });
});

describe('castSkill 接入选行/列（端到端，复用 FixedCellChooser）', () => {
  it('点选某格 → 摧毁其所在行', () => {
    const board = fullBoard();
    const state = stateWith(board);
    state.teams[PlayerSide.Left].characters[0].skillId = 'row';
    const registry = new ExtensionRegistry();
    registry.prototypes.set('row', skill(destroyChosenRow()));
    let idg = 700000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.skullChance = 0;
    engine.setCellChooser(new FixedCellChooser({ row: 4, col: 1 }));
    const events = engine.castSkill(0);
    const d = events.find((e) => e.type === 'gem-destroy');
    if (d?.type === 'gem-destroy') expect(d.cells.every((c) => c.pos.row === 4)).toBe(true);
    expect(board.isFull()).toBe(true); // 补满
  });
});
