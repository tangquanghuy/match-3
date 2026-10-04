import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import {
  AiColorChooser,
  FixedColorChooser,
  countBoardColors,
  prototypeNeedsColor,
} from '@engine/skills/colorChooser';
import { skill, createGems, destroyColor, transform, CHOSEN, dmg } from '@engine/skills/builders';
import { BaseColor, PlayerSide, colorGem, skullGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

/** 用指定颜色计数铺棋盘（其余填骷髅，不计色） */
function boardWithColors(counts: Partial<Record<BaseColor, number>>): BoardModel {
  gid = 0;
  const board = new BoardModel();
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cells.push({ row: r, col: c });
  let i = 0;
  for (const [color, n] of Object.entries(counts)) {
    for (let k = 0; k < (n ?? 0); k++) {
      board.set(cells[i++], g(colorGem(color as BaseColor)));
    }
  }
  while (i < cells.length) board.set(cells[i++], g(skullGem()));
  return board;
}

function makeChar(id: number): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 10, mana: 10, skillId: 'none', statuses: [], defeated: false,
  };
}
function stateWith(board: BoardModel) {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  return createGameState(board, left, right);
}

describe('countBoardColors', () => {
  it('统计各色数量，忽略骷髅', () => {
    const state = stateWith(boardWithColors({ Red: 5, Blue: 3 }));
    const counts = countBoardColors(state);
    expect(counts.get(BaseColor.Red)).toBe(5);
    expect(counts.get(BaseColor.Blue)).toBe(3);
    expect(counts.get(BaseColor.Green)).toBeUndefined();
  });
});

describe('AiColorChooser（需求 2.3）', () => {
  it('选现存数量最多的颜色', () => {
    const state = stateWith(boardWithColors({ Red: 3, Blue: 7, Green: 2 }));
    expect(new AiColorChooser().choose(state, 0)).toBe(BaseColor.Blue);
  });
  it('平局取 ALL_BASE_COLORS 固定序更前者（Red 先于 Green）', () => {
    const state = stateWith(boardWithColors({ Green: 5, Red: 5 }));
    expect(new AiColorChooser().choose(state, 0)).toBe(BaseColor.Red);
  });
  it('无任何颜色宝石 → null（需求 2.6）', () => {
    const state = stateWith(boardWithColors({}));
    expect(new AiColorChooser().choose(state, 0)).toBeNull();
  });
  it('全色转化时己方可用的四连优先于无用的五连', () => {
    const board = new BoardModel();
    [BaseColor.Red, BaseColor.Red, BaseColor.Blue, BaseColor.Red].forEach((color, col) =>
      board.set({ row: 0, col }, g(colorGem(color))));
    [BaseColor.Yellow, BaseColor.Yellow, BaseColor.Blue, BaseColor.Yellow, BaseColor.Yellow].forEach((color, col) =>
      board.set({ row: 2, col }, g(colorGem(color))));
    const state = stateWith(board);
    state.teams[PlayerSide.Left].characters[0]!.mana = 0;
    expect(new AiColorChooser().choose(state, 0, undefined,
      skill(transform(BaseColor.Blue, CHOSEN)))).toBe(BaseColor.Red);
  });
  it('摧毁选定颜色优先己方缺法力颜色；青灰帝的附加效果优先命中敌方颜色', () => {
    const state = stateWith(boardWithColors({ Red: 2, Blue: 8 }));
    state.teams[PlayerSide.Left].characters[0]!.mana = 0;
    state.teams[PlayerSide.Right].characters[0]!.colors = [BaseColor.Blue];
    expect(new AiColorChooser().choose(state, 0, undefined, skill(destroyColor(CHOSEN)))).toBe(BaseColor.Red);
    const grayKing = skill(destroyColor(CHOSEN), dmg('enemyAll', 9, 1, {
      ifCond: { kind: 'targetColor', color: 'CHOSEN' },
    }));
    expect(new AiColorChooser().choose(state, 0, undefined, grayKing)).toBe(BaseColor.Blue);
    // Red covers the output slot, blue covers two non-damage slots and more board gems.
    state.teams[PlayerSide.Right].characters = [
      { ...makeChar(4), role: 'Striker', colors: [BaseColor.Red] },
      { ...makeChar(5), role: 'Generator', colors: [BaseColor.Blue] },
      { ...makeChar(6), role: 'Defender', colors: [BaseColor.Blue] },
    ];
    expect(new AiColorChooser().choose(state, 0, undefined, grayKing)).toBe(BaseColor.Red);
  });
});

describe('FixedColorChooser', () => {
  it('恒返回给定色', () => {
    expect(new FixedColorChooser(BaseColor.Purple).choose()).toBe(BaseColor.Purple);
  });
});

describe('prototypeNeedsColor', () => {
  it('含 CHOSEN 的 create/transform/destroyColor → true', () => {
    expect(prototypeNeedsColor(skill(createGems(CHOSEN, 5)))).toBe(true);
    expect(prototypeNeedsColor(skill(transform(CHOSEN, BaseColor.Blue)))).toBe(true);
    expect(prototypeNeedsColor(skill(destroyColor(CHOSEN)))).toBe(true);
  });
  it('无 CHOSEN → false', () => {
    expect(prototypeNeedsColor(skill(dmg('enemyFront', 2), createGems(BaseColor.Red, 5)))).toBe(false);
  });
});

describe('CHOSEN 段按选定色执行（端到端，需求 2.5）', () => {
  it('destroyColor(CHOSEN) 施法耗蓝后优先摧毁己方需要的颜色', () => {
    const board = boardWithColors({ Red: 4, Blue: 10 });
    const state = stateWith(board);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('pick', skill(destroyColor(CHOSEN)));
    state.teams[PlayerSide.Left].characters[0].skillId = 'pick';
    let idg = 90000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.skullChance = 0;
    // 注入 AI 选色
    engine.setColorChooser(new AiColorChooser());

    const events = engine.castSkill(0);
    const destroy = events.find((e) => e.type === 'gem-destroy');
    expect(destroy?.type).toBe('gem-destroy');
    // 红色数量较少，但施法者消耗法力后需要红色。
    if (destroy?.type === 'gem-destroy') {
      expect(destroy.cells.every((c) => c.gemType.kind === 'color' && c.gemType.color === BaseColor.Red)).toBe(true);
    }
  });

  it('无可选色时 CHOSEN 段安全跳过（需求 2.6）', () => {
    const board = boardWithColors({}); // 全骷髅
    const state = stateWith(board);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('pick', skill(destroyColor(CHOSEN)));
    state.teams[PlayerSide.Left].characters[0].skillId = 'pick';
    let idg = 90000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.setColorChooser(new AiColorChooser());
    const events = engine.castSkill(0);
    // 只有 skill-cast，无 gem-destroy
    expect(events.some((e) => e.type === 'gem-destroy')).toBe(false);
  });
});
