import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { damageEffect } from '@engine/skills/effects/damage';
import { selectTargets } from '@engine/skills/targeting';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameState } from '@engine/GameState';
import type { GameEvent } from '@engine/events';

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

function makeState(leftOver: Partial<Character>[], rightOver: Partial<Character>[]): GameState {
  const left: Team = {
    player: PlayerSide.Left,
    characters: leftOver.map((o, i) => makeChar(i, o)),
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: rightOver.map((o, i) => makeChar(i + 4, o)),
  };
  return createGameState(new BoardModel(), left, right);
}

function ctxFor(state: GameState, casterId: number): EffectContext {
  let gid = 1000;
  return { state, casterId, rng: new SeededRNG(1), nextGemId: () => gid++ };
}

describe('damageEffect 单体伤害', () => {
  it('先护甲后生命（需求 6.2）', () => {
    const state = makeState([{}], [{ hp: 50, armor: 8 }]);
    const targets = selectTargets('enemyFront', state, 0, new SeededRNG(1));
    // caster magic=10, scaling {base:2,mult:1} → 12 伤害；先扣 8 甲，余 4 扣血
    const events = damageEffect({ targets, scaling: { base: 2, mult: 1 } }).apply(ctxFor(state, 0));
    const target = state.teams[PlayerSide.Right].characters[0];
    expect(target.armor).toBe(0);
    expect(target.hp).toBe(46);
    const dmg = events.find((e) => e.type === 'skill-damage');
    expect(dmg).toMatchObject({ casterId: 0, targetId: 4, range: 'single', damage: 12, resultingHp: 46, resultingArmor: 0 });
  });

  it('真实伤害跳过护甲（需求 6.4）', () => {
    const state = makeState([{}], [{ hp: 50, armor: 8 }]);
    const targets = selectTargets('enemyFront', state, 0, new SeededRNG(1));
    damageEffect({ targets, scaling: { base: 0, mult: 1 }, trueDamage: true }).apply(ctxFor(state, 0));
    const target = state.teams[PlayerSide.Right].characters[0];
    // 10 真实伤害：护甲不动，直接扣血
    expect(target.armor).toBe(8);
    expect(target.hp).toBe(40);
  });

  it('hp≤0 标记阵亡并发 defeat（需求 6.2）', () => {
    const state = makeState([{ magic: 100 }], [{ hp: 10, armor: 0 }]);
    const targets = selectTargets('enemyFront', state, 0, new SeededRNG(1));
    const events = damageEffect({ targets, scaling: { base: 0, mult: 1 } }).apply(ctxFor(state, 0));
    const target = state.teams[PlayerSide.Right].characters[0];
    expect(target.hp).toBe(0);
    expect(target.defeated).toBe(true);
    expect(events.some((e) => e.type === 'defeat' && e.characterId === 4)).toBe(true);
  });

  it('无目标安全跳过（需求 5.5）', () => {
    const state = makeState([{}], [{ defeated: true }]);
    const targets = selectTargets('enemyFront', state, 0, new SeededRNG(1));
    const events = damageEffect({ targets, scaling: { base: 5, mult: 1 } }).apply(ctxFor(state, 0));
    expect(events).toEqual([]);
  });
});

describe('damageEffect 范围', () => {
  it('全体：对每个目标各自结算（需求 6.3）', () => {
    const state = makeState([{}], [{ hp: 50 }, { hp: 50 }, { hp: 50 }]);
    const targets = selectTargets('enemyAll', state, 0, new SeededRNG(1));
    const events = damageEffect({ targets, scaling: { base: 0, mult: 1 }, range: 'all' }).apply(ctxFor(state, 0));
    const right = state.teams[PlayerSide.Right].characters;
    expect(right.map((c) => c.hp)).toEqual([40, 40, 40]);
    const damageEvents = events.filter((e) => e.type === 'skill-damage');
    expect(damageEvents.length).toBe(3);
    expect(damageEvents.every((event) => event.range === 'all')).toBe(true);
  });

  it('溅射：主目标 + 相邻位（需求 6.3）', () => {
    const state = makeState([{}], [{ hp: 50 }, { hp: 50 }, { hp: 50 }]);
    // 中间主目标全伤，相邻两名各一半，无环绕。
    const target = state.teams[PlayerSide.Right].characters[1];
    const events = damageEffect({ targets: [target], scaling: { base: 0, mult: 1 }, range: 'splash' }).apply(ctxFor(state, 0));
    const right = state.teams[PlayerSide.Right].characters;
    expect(right.map((c) => c.hp)).toEqual([45, 40, 45]);
    const damageEvents = events.filter((e) => e.type === 'skill-damage');
    expect(damageEvents.length).toBe(3);
    expect(damageEvents.every((event) => event.range === 'splash')).toBe(true);
  });

  it('溅射跳过阵亡的相邻位', () => {
    const state = makeState([{}], [{ hp: 50, defeated: true }, { hp: 50 }, { hp: 50 }]);
    const target = state.teams[PlayerSide.Right].characters[1];
    const events = damageEffect({ targets: [target], scaling: { base: 0, mult: 1 }, range: 'splash' }).apply(ctxFor(state, 0));
    // id4 阵亡不受击；命中 id5、id6
    const ids = events
      .filter((e) => e.type === 'skill-damage')
      .map((e) => (e as Extract<GameEvent, { type: 'skill-damage' }>).targetId);
    expect(ids.sort()).toEqual([5, 6]);
  });

  it('single 只打第一个目标', () => {
    const state = makeState([{}], [{ hp: 50 }, { hp: 50 }]);
    const targets = selectTargets('enemyAll', state, 0, new SeededRNG(1));
    damageEffect({ targets, scaling: { base: 0, mult: 1 }, range: 'single' }).apply(ctxFor(state, 0));
    const right = state.teams[PlayerSide.Right].characters;
    expect(right[0].hp).toBe(40);
    expect(right[1].hp).toBe(50);
  });
});
