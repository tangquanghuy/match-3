import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { registerSkillLibrary, SKILL_LIBRARY } from '@engine/skills/library';
import { FixedColorChooser } from '@engine/skills/colorChooser';
import { skill, destroyColor, CHOSEN } from '@engine/skills/builders';
import { troopToSummonTemplate } from '../../src/data/troops';
import { BaseColor, PlayerSide, colorGem, skullGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Blue], manaCost: 7, mana: 7, skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

describe('技能库注册进注册表（需求 1.4）', () => {
  it('registerSkillLibrary 把全部原型按 String(spellId) 写入', () => {
    const registry = new ExtensionRegistry();
    registerSkillLibrary(registry.prototypes);
    for (const key of Object.keys(SKILL_LIBRARY)) {
      expect(registry.prototypes.has(key)).toBe(true);
    }
  });

  it('角色 skillId 指向库技能 → castSkill 执行其原型', () => {
    // 用毒蛇技能 7063（库中已配）
    gid = 0;
    const board = new BoardModel();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem([BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown][(r + c) % 4])));
    }
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { skillId: '7063', hp: 40 })] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5), makeChar(6)] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registerSkillLibrary(registry.prototypes);
    let idg = 100000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.skullChance = 0;

    const events = engine.castSkill(0);
    // 毒蛇：前2名中毒 + 造红宝石 + 自愈
    expect(events.some((e) => e.type === 'status-apply')).toBe(true);
    expect(state.teams[PlayerSide.Right].characters[0].statuses.some((s) => s.id === 'poison')).toBe(true);
    expect(state.teams[PlayerSide.Right].characters[1].statuses.some((s) => s.id === 'poison')).toBe(true);
  });
});

describe('选色技能端到端（需求 2.5）', () => {
  it('FixedColorChooser 注入 → CHOSEN 段作用于该色', () => {
    gid = 0;
    const board = new BoardModel();
    // 铺红蓝两色
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem((r + c) % 2 === 0 ? BaseColor.Red : BaseColor.Blue)));
    }
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { skillId: 'pick' })] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('pick', skill(destroyColor(CHOSEN)));
    let idg = 100000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.skullChance = 0;
    engine.setColorChooser(new FixedColorChooser(BaseColor.Red)); // 玩家选红

    const events = engine.castSkill(0);
    const destroy = events.find((e) => e.type === 'gem-destroy');
    expect(destroy?.type).toBe('gem-destroy');
    if (destroy?.type === 'gem-destroy') {
      expect(destroy.cells.every((c) => c.gemType.kind === 'color' && c.gemType.color === BaseColor.Red)).toBe(true);
    }
  });
});

describe('召唤解析器接入（需求 7.2/7.3）', () => {
  it('setSummonResolver + troopToSummonTemplate 让 ref 召唤真实兵种', () => {
    gid = 0;
    const board = new BoardModel();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(skullGem()));
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { skillId: 'sm' })] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    // 召唤一个已知存在的兵种 referenceName（Ogre 一定在数据里）
    registry.prototypes.set('sm', { segments: [{ kind: 'summon', params: { source: { ref: 'Ogre' } } }] });
    let idg = 100000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    engine.setSummonResolver((ref) => troopToSummonTemplate(ref));

    const before = state.teams[PlayerSide.Left].characters.length;
    const events = engine.castSkill(0);
    expect(events.some((e) => e.type === 'summon')).toBe(true);
    expect(state.teams[PlayerSide.Left].characters.length).toBe(before + 1);
    expect(state.teams[PlayerSide.Left].characters[before].name).toBe('食人魔');
  });
});
