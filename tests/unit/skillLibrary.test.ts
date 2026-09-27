import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { getSkillPrototype } from '@engine/skills/library';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}
function fillBoard(board: BoardModel): void {
  const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
    }
  }
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Blue], manaCost: 7, mana: 7,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

/** 把技能库里某 spellId 的原型注册进 registry，返回可释放的引擎 */
function setupWithSkill(spellId: number) {
  const board = new BoardModel();
  gid = 0;
  fillBoard(board);
  const skillKey = String(spellId);
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { skillId: skillKey })] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5), makeChar(6)] };
  const state = createGameState(board, left, right);
  const registry = new ExtensionRegistry();
  const proto = getSkillPrototype(spellId);
  if (proto) registry.prototypes.set(skillKey, proto);
  let idg = 100000;
  const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
  engine.skullChance = 0;
  return { engine, state };
}

describe('技能库配置能真实生效', () => {
  it('犀首兽 杀戮节庆(7132)：溅射伤害', () => {
    const { engine, state } = setupWithSkill(7132);
    const before = state.teams[PlayerSide.Right].characters.map((c) => c.hp);
    const events = engine.castSkill(0);
    expect(events[0]).toMatchObject({ type: 'skill-cast' });
    expect(events.some((e) => e.type === 'skill-damage')).toBe(true);
    // Main target takes the full seven points; only the adjacent slot takes half.
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(before[0] - 7);
    expect(state.teams[PlayerSide.Right].characters[1].hp).toBe(before[1] - 3);
    expect(state.teams[PlayerSide.Right].characters[2].hp).toBe(before[2]);
  });

  it('毒蛇 剧毒蛇液(7063)：前2名中毒 + 造红宝石 + 自愈', () => {
    const { engine, state } = setupWithSkill(7063);
    state.teams[PlayerSide.Left].characters[0].hp = 40; // 留出治疗空间
    const events = engine.castSkill(0);
    // 前 2 名敌人中毒
    const right = state.teams[PlayerSide.Right].characters;
    expect(right[0].statuses.some((s) => s.id === 'poison')).toBe(true);
    expect(right[1].statuses.some((s) => s.id === 'poison')).toBe(true);
    expect(right[2].statuses.some((s) => s.id === 'poison')).toBe(false);
    // 自愈 [魔法+1]=6
    expect(state.teams[PlayerSide.Left].characters[0].hp).toBe(46);
    // 事件流含状态施加与增益
    expect(events.some((e) => e.type === 'status-apply')).toBe(true);
    expect(events.some((e) => e.type === 'buff')).toBe(true);
  });

  it('狙击(7004)：单体伤害', () => {
    const { engine, state } = setupWithSkill(7004);
    const before = state.teams[PlayerSide.Right].characters[0].hp;
    const events = engine.castSkill(0);
    expect(events.some((e) => e.type === 'skill-damage')).toBe(true);
    // magic=5, [魔法+2]=7
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(before - 7);
  });

  it('箭雨(7155)：群体伤害命中全部敌人', () => {
    const { engine } = setupWithSkill(7155);
    const events = engine.castSkill(0);
    const hits = events.filter((e) => e.type === 'skill-damage');
    expect(hits.length).toBe(3); // 三名敌人
  });

  it('未配置技能 → 仅扣法力，消耗回合', () => {
    const { engine, state } = setupWithSkill(999999); // 库里没有
    const events = engine.castSkill(0);
    expect(events[0].type).toBe('skill-cast');
    expect(events.some((event) => event.type === 'turn-end')).toBe(true);
    expect(state.activePlayer).toBe(PlayerSide.Right);
    expect(state.teams[PlayerSide.Left].characters[0].mana).toBe(0);
  });
});
