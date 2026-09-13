import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { selectTargets, candidatesFor, isChosenMode } from '@engine/skills/targeting';
import {
  AiTargetChooser,
  FixedTargetChooser,
  prototypeChosenTargetMode,
} from '@engine/skills/targetChooser';
import { skill, dmg, heal } from '@engine/skills/builders';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameState } from '@engine/GameState';

function makeChar(id: number, hp: number, defeated = false): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp, attack: 5, armor: 0, magic: 6,
    colors: [BaseColor.Red], manaCost: 10, mana: 10, skillId: 'none', statuses: [], defeated,
  };
}
function stateOf(leftHp: number[], rightHp: number[]): GameState {
  const left: Team = { player: PlayerSide.Left, characters: leftHp.map((hp, i) => makeChar(i, hp)) };
  const right: Team = { player: PlayerSide.Right, characters: rightHp.map((hp, i) => makeChar(i + 4, hp)) };
  return createGameState(new BoardModel(), left, right);
}

describe('selectTargets 手动选定模式', () => {
  it('enemyChosen 取 chosenId 指向的敌人', () => {
    const state = stateOf([50], [40, 30, 20]);
    const t = selectTargets('enemyChosen', state, 0, new SeededRNG(1), 1, 5);
    expect(t.map((c) => c.id)).toEqual([5]);
  });
  it('allyChosen 取 chosenId 指向的己方', () => {
    const state = stateOf([50, 30, 20], [40]);
    const t = selectTargets('allyChosen', state, 0, new SeededRNG(1), 1, 2);
    expect(t.map((c) => c.id)).toEqual([2]);
  });
  it('未提供 chosenId → 空（安全跳过）', () => {
    const state = stateOf([50], [40, 30]);
    expect(selectTargets('enemyChosen', state, 0, new SeededRNG(1))).toEqual([]);
  });
  it('chosenId 指向已阵亡/不存在 → 空', () => {
    const state = stateOf([50], [40, 30]);
    state.teams[PlayerSide.Right].characters[0].defeated = true;
    expect(selectTargets('enemyChosen', state, 0, new SeededRNG(1), 1, 4)).toEqual([]);
    expect(selectTargets('enemyChosen', state, 0, new SeededRNG(1), 1, 999)).toEqual([]);
  });
});

describe('candidatesFor / isChosenMode', () => {
  it('列出候选存活角色', () => {
    const state = stateOf([50, 30], [40, 20, 10]);
    expect(candidatesFor('enemyChosen', state, 0).map((c) => c.id)).toEqual([4, 5, 6]);
    expect(candidatesFor('allyChosen', state, 0).map((c) => c.id)).toEqual([0, 1]);
  });
  it('isChosenMode 判定', () => {
    expect(isChosenMode('enemyChosen')).toBe(true);
    expect(isChosenMode('allyChosen')).toBe(true);
    expect(isChosenMode('enemyFront')).toBe(false);
  });
});

describe('AiTargetChooser', () => {
  it('enemyChosen 选最低血敌人', () => {
    const state = stateOf([50], [40, 15, 30]);
    expect(new AiTargetChooser().choose('enemyChosen', state, 0, new SeededRNG(1))).toBe(5);
  });
  it('allyChosen 选最低血己方', () => {
    const state = stateOf([50, 12, 30], [40]);
    expect(new AiTargetChooser().choose('allyChosen', state, 0, new SeededRNG(1))).toBe(1);
  });
  it('平局取队伍索引更前者', () => {
    const state = stateOf([50], [20, 20, 30]);
    expect(new AiTargetChooser().choose('enemyChosen', state, 0, new SeededRNG(1))).toBe(4);
  });
  it('无候选 → null', () => {
    const state = stateOf([50], []);
    expect(new AiTargetChooser().choose('enemyChosen', state, 0, new SeededRNG(1))).toBeNull();
  });
});

describe('prototypeChosenTargetMode', () => {
  it('识别含手动选目标段的模式', () => {
    expect(prototypeChosenTargetMode(skill(dmg('enemyChosen', 4)))).toBe('enemyChosen');
    expect(prototypeChosenTargetMode(skill(heal('allyChosen', 3)))).toBe('allyChosen');
    expect(prototypeChosenTargetMode(skill(dmg('enemyFront', 4)))).toBeNull();
  });
});

describe('castSkill 接入目标选择（端到端）', () => {
  function setup(proto: ReturnType<typeof skill>) {
    const state = stateOf([50], [40, 15, 30]);
    state.teams[PlayerSide.Left].characters[0].skillId = 'pick';
    const registry = new ExtensionRegistry();
    registry.prototypes.set('pick', proto);
    let idg = 1000;
    const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
    return { engine, state };
  }

  it('玩家 FixedTargetChooser 指定打谁', () => {
    const { engine } = setup(skill(dmg('enemyChosen', 4)));
    engine.setTargetChooser(new FixedTargetChooser(6)); // 玩家点了 id6（30血）
    const events = engine.castSkill(0);
    const dmgEv = events.find((e) => e.type === 'skill-damage');
    expect(dmgEv?.type).toBe('skill-damage');
    if (dmgEv?.type === 'skill-damage') expect(dmgEv.targetId).toBe(6);
  });

  it('AI 默认选最低血', () => {
    const { engine } = setup(skill(dmg('enemyChosen', 4)));
    const events = engine.castSkill(0); // 默认 AiTargetChooser → id5(15血)
    const dmgEv = events.find((e) => e.type === 'skill-damage');
    if (dmgEv?.type === 'skill-damage') expect(dmgEv.targetId).toBe(5);
  });
});
