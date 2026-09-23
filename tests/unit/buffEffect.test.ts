import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { buffEffect } from '@engine/skills/effects/buff';
import { selectTargets } from '@engine/skills/targeting';
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

function makeState(leftOver: Partial<Character>[]): GameState {
  const left: Team = {
    player: PlayerSide.Left,
    characters: leftOver.map((o, i) => makeChar(i, o)),
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: [makeChar(4)],
  };
  return createGameState(new BoardModel(), left, right);
}

function ctxFor(state: GameState, casterId: number): EffectContext {
  let gid = 1000;
  return { state, casterId, rng: new SeededRNG(1), nextGemId: () => gid++ };
}

describe('buffEffect 作用己方', () => {
  it('加攻击力作用于己方目标（需求 8.1）', () => {
    const state = makeState([{ attack: 5 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    const events = buffEffect({ targets, stat: 'attack', scaling: { base: 0, mult: 1 } }).apply(ctxFor(state, 0));
    // magic=10 → +10 攻击
    expect(state.teams[PlayerSide.Left].characters[0].attack).toBe(15);
    expect(events[0]).toMatchObject({ type: 'buff', targetId: 0, stat: 'attack', amount: 10 });
  });

  it('加护甲', () => {
    const state = makeState([{ armor: 2 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    buffEffect({ targets, stat: 'armor', scaling: { base: 3, mult: 0 } }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[0].armor).toBe(5);
  });

  it('加魔力', () => {
    const state = makeState([{ magic: 10 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    buffEffect({ targets, stat: 'magic', scaling: { base: 4, mult: 0 } }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[0].magic).toBe(14);
  });
});

describe('buffEffect 上限夹取', () => {
  it('治疗不超过 maxHp（需求 8.3）', () => {
    const state = makeState([{ hp: 45, maxHp: 50, magic: 10 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    // 名义 +10 但只能加到 50 → 实际 +5
    const events = buffEffect({ targets, stat: 'hp', scaling: { base: 0, mult: 1 } }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[0].hp).toBe(50);
    expect(events[0]).toMatchObject({ stat: 'hp', amount: 5 });
  });

  it('满血治疗不产生 0 事件', () => {
    const state = makeState([{ hp: 50, maxHp: 50 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    const events = buffEffect({ targets, stat: 'hp', scaling: { base: 10, mult: 0 } }).apply(ctxFor(state, 0));
    expect(events).toEqual([]);
  });

  it('加法力不超过 manaCost（需求 8.4）', () => {
    const state = makeState([{ mana: 15, manaCost: 20, magic: 10 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    // 名义 +10 但只能加到 20 → 实际 +5
    const events = buffEffect({ targets, stat: 'mana', scaling: { base: 0, mult: 1 } }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[0].mana).toBe(20);
    expect(events[0]).toMatchObject({ stat: 'mana', amount: 5 });
  });

  it('全体治疗作用于所有存活己方', () => {
    const state = makeState([{ hp: 40 }, { hp: 30 }, { hp: 20, defeated: true }]);
    const targets = selectTargets('allyAll', state, 0, new SeededRNG(1));
    buffEffect({ targets, stat: 'hp', scaling: { base: 5, mult: 0 } }).apply(ctxFor(state, 0));
    const left = state.teams[PlayerSide.Left].characters;
    expect(left[0].hp).toBe(45);
    expect(left[1].hp).toBe(35);
    expect(left[2].hp).toBe(20); // 阵亡不接受
  });

  it('double 使当前护甲翻倍', () => {
    const state = makeState([{ armor: 4 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    const events = buffEffect({ targets, stat: 'armor', scaling: { base: 0, mult: 0 }, double: true }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[0].armor).toBe(8);
    expect(events[0]).toMatchObject({ type: 'buff', targetId: 0, stat: 'armor', amount: 4 });
  });

  it('double 使当前攻击翻倍', () => {
    const state = makeState([{ attack: 7 }]);
    const targets = selectTargets('allySelf', state, 0, new SeededRNG(1));
    buffEffect({ targets, stat: 'attack', scaling: { base: 99, mult: 1 }, double: true }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[0].attack).toBe(14);
  });
});
