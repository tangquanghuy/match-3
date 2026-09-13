import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import {
  executePrototype,
  fallbackPrototype,
} from '@engine/skills/prototypes';
import type { SkillPrototype, EffectSegment } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameState } from '@engine/GameState';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 10,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeState(): GameState {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0), makeChar(1)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] };
  return createGameState(new BoardModel(), left, right);
}

function ctxFor(state: GameState, casterId: number, over: Partial<EffectContext> = {}): EffectContext {
  let gid = 1000;
  return { state, casterId, rng: new SeededRNG(1), nextGemId: () => gid++, ...over };
}

describe('executePrototype 多段顺序执行（需求 11.3）', () => {
  it('伤害段 + 增益段按序执行并汇集事件', () => {
    const state = makeState();
    const proto: SkillPrototype = {
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 } },
        { kind: 'buff', target: 'allySelf', stat: 'attack', scaling: { base: 3, mult: 0 } },
      ],
    };
    const events = executePrototype(proto, ctxFor(state, 0));
    // 敌方队首受 10 伤害
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(40);
    // 施法者 +3 攻击
    expect(state.teams[PlayerSide.Left].characters[0].attack).toBe(8);
    // 事件顺序：先 skill-damage 后 buff
    const types = events.map((e) => e.type);
    expect(types.indexOf('skill-damage')).toBeLessThan(types.indexOf('buff'));
  });

  it('额外回合段调用 grantExtraTurn', () => {
    const state = makeState();
    let granted = false;
    const proto: SkillPrototype = {
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 5, mult: 0 } },
        { kind: 'extraTurn' },
      ],
    };
    const events = executePrototype(proto, ctxFor(state, 0, { grantExtraTurn: () => (granted = true) }));
    expect(granted).toBe(true);
    expect(events.some((e) => e.type === 'extra-turn')).toBe(true);
  });

  it('状态段对全体敌人施加', () => {
    const state = makeState();
    const proto: SkillPrototype = {
      segments: [{ kind: 'status', target: 'enemyAll', statusId: 'poison', turns: 3, magnitude: 4 }],
    };
    const events = executePrototype(proto, ctxFor(state, 0));
    expect(events.filter((e) => e.type === 'status-apply').length).toBe(2);
  });
});

describe('executePrototype 回退（需求 11.4）', () => {
  it('空原型 → 无事件、不崩溃', () => {
    const state = makeState();
    const events = executePrototype(fallbackPrototype(), ctxFor(state, 0));
    expect(events).toEqual([]);
  });

  it('未知段被安全跳过、不崩溃', () => {
    const state = makeState();
    // 构造一个含未知 kind 的段（模拟未支持机制）
    const unknownSegment = { kind: 'unknownMechanic' } as unknown as EffectSegment;
    const proto: SkillPrototype = {
      segments: [
        unknownSegment,
        { kind: 'damage', target: 'enemyFront', scaling: { base: 5, mult: 0 } },
      ],
    };
    const events = executePrototype(proto, ctxFor(state, 0));
    // 未知段跳过，伤害段仍执行
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(45);
    expect(events.some((e) => e.type === 'skill-damage')).toBe(true);
  });
});

describe('executePrototype 确定性（需求 11.5）', () => {
  it('相同状态 + 种子 → 相同事件流', () => {
    const proto: SkillPrototype = {
      segments: [{ kind: 'damage', target: 'enemyRandom', scaling: { base: 3, mult: 1 } }],
    };
    const run = () => {
      const state = makeState();
      return JSON.stringify(executePrototype(proto, ctxFor(state, 0, { rng: new SeededRNG(99) })));
    };
    expect(run()).toBe(run());
  });
});
