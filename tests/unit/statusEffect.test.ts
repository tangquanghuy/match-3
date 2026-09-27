import { describe, it, expect } from 'vitest';
import {
  applyStatus,
  tickStatuses,
  tickTeamStatuses,
  hasStatus,
  statusEffect,
} from '@engine/skills/effects/status';
import { activeTraitIds, passivesOf, neutralPassives } from '@engine/traits';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { selectTargets } from '@engine/skills/targeting';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameEvent } from '@engine/events';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 10,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

describe('applyStatus 施加（需求 9.1）', () => {
  it('施加新状态并发 status-apply', () => {
    const c = makeChar(1);
    const events = applyStatus(c, { id: 'poison', turns: 3, magnitude: 4 });
    expect(c.statuses).toEqual([{ id: 'poison', turns: 3, magnitude: 4 }]);
    expect(events[0]).toMatchObject({ type: 'status-apply', targetId: 1, statusId: 'poison', turns: 3 });
  });

  it('重复施加取更长存续与更大 magnitude', () => {
    const c = makeChar(1);
    applyStatus(c, { id: 'poison', turns: 2, magnitude: 3 });
    applyStatus(c, { id: 'poison', turns: 5, magnitude: 2 });
    expect(c.statuses).toEqual([{ id: 'poison', turns: 5, magnitude: 3 }]);
  });

  it('阵亡角色不接受状态', () => {
    const c = makeChar(1, { defeated: true });
    const events = applyStatus(c, { id: 'poison', turns: 3, magnitude: 4 });
    expect(events).toEqual([]);
    expect(c.statuses).toEqual([]);
  });
});

describe('tickStatuses DoT 结算（需求 9.2, 9.5）', () => {
  it('中毒扣血并发 status-tick，跳过护甲', () => {
    const c = makeChar(1, { hp: 50, armor: 10 });
    applyStatus(c, { id: 'poison', turns: 2, magnitude: 4 });
    const events = tickStatuses(c, { next: () => 0.1 } as SeededRNG);
    expect(c.hp).toBe(49);
    expect(c.armor).toBe(10);
    expect(events.find(e => e.type === 'status-tick')).toMatchObject({ statusId: 'poison', damage: 1 });
    expect(c.statuses[0].turns).toBe(2); // Poison cannot recover naturally
  });

  // 需求 9.5 的 3 回合倒计时已被 rulings/R004 取代：负面状态无回合上限，只靠共用累积自愈移除。
  it('R004：负面状态无回合上限；自愈掷中一次移除全部可自愈负面并发 status-expire（中毒保留）', () => {
    const c = makeChar(1, { hp: 50 });
    applyStatus(c, { id: 'burning', turns: 1 });
    applyStatus(c, { id: 'silence', turns: 1 });
    applyStatus(c, { id: 'poison', turns: 1 });
    for (let i = 0; i < 5; i++) tickStatuses(c); // 无 rng：不自愈、不递减
    expect(c.statuses.map(s => s.id)).toEqual(['burning', 'silence', 'poison']);
    const events = tickStatuses(c, { next: () => 0 } as SeededRNG);
    expect(c.statuses.map(s => s.id)).toEqual(['poison']);
    expect(events.filter(e => e.type === 'status-expire').map(e => e.type === 'status-expire' && e.statusId))
      .toEqual(['burning', 'silence']);
  });

  it('R004：累积概率 10%→20%→30%（诅咒下 +5%），新负面状态重置为 10%', () => {
    const c = makeChar(1, { hp: 50 });
    applyStatus(c, { id: 'silence', turns: 3 });
    const miss = { next: () => 0.99 } as SeededRNG;
    tickStatuses(c, miss);
    tickStatuses(c, miss);
    expect(c.statuses[0].recoveryChance).toBe(30);
    applyStatus(c, { id: 'frozen', turns: 3 }); // new negative -> reset
    expect(c.statuses.map(s => s.recoveryChance ?? 10)).toEqual([10, 10]);
    tickStatuses(c, { next: () => 0.15 } as SeededRNG); // 15 >= 10 -> miss
    expect(c.statuses.map(s => s.recoveryChance)).toEqual([20, 20]);
    applyStatus(c, { id: 'curse', turns: 3 });
    tickStatuses(c, miss);
    expect(c.statuses.map(s => s.recoveryChance)).toEqual([15, 15, 15]);
  });

  it('DoT 致死标记阵亡并发 defeat', () => {
    const c = makeChar(1, { hp: 3, armor: 0 });
    applyStatus(c, { id: 'burning', turns: 3 });
    const events = tickStatuses(c);
    expect(c.hp).toBe(0);
    expect(c.defeated).toBe(true);
    expect(events.some((e) => e.type === 'defeat' && e.characterId === 1)).toBe(true);
  });

  it('非 DoT 状态结算不扣血，也不递减（R004）', () => {
    const c = makeChar(1, { hp: 50 });
    applyStatus(c, { id: 'silence', turns: 2 });
    tickStatuses(c);
    expect(c.hp).toBe(50);
    expect(c.statuses[0].turns).toBe(2);
  });

  it('结算时机确定：整队按索引顺序（需求 9.4）', () => {
    const chars = [makeChar(0, { hp: 50 }), makeChar(1, { hp: 50 })];
    applyStatus(chars[0], { id: 'poison', turns: 2, magnitude: 3 });
    applyStatus(chars[1], { id: 'poison', turns: 2, magnitude: 7 });
    const events = tickTeamStatuses(chars, { next: () => 0.1 } as SeededRNG);
    const ticks = events.filter(
      (e): e is Extract<GameEvent, { type: 'status-tick' }> => e.type === 'status-tick',
    );
    expect(ticks.map((t) => t.targetId)).toEqual([0, 1]);
    expect(chars[0].hp).toBe(49);
    expect(chars[1].hp).toBe(49);
  });
});

describe('GoW official status rules: independent boundaries', () => {
  const roll = (value: number) => ({ next: () => value } as SeededRNG);
  it('Bleed stacks 1, 3, 6, 10 true damage; fifth application caps at four and restarts cleanse chance', () => {
    const c = makeChar(1, { hp: 100, armor: 30 });
    for (const [level, expected] of [[1, 1], [2, 3], [3, 6], [4, 10]] as const) {
      if (level > 1) applyStatus(c, { id: 'bleed', turns: 10 });
      else applyStatus(c, { id: 'bleed', turns: 10 });
      expect(c.statuses[0].magnitude).toBe(level);
      const before = c.hp;
      const ev = tickStatuses(c, roll(0.99));
      expect(before - c.hp).toBe(expected);
      expect(c.armor).toBe(30);
      expect(ev.find(e => e.type === 'status-tick')).toMatchObject({ damage: expected });
    }
    c.statuses[0].recoveryChance = 40;
    applyStatus(c, { id: 'bleed', turns: 10 });
    expect(c.statuses[0].magnitude).toBe(4);
    expect(c.statuses[0].recoveryChance).toBeUndefined();
  });
  it('Burning hits Armor first, then Life, and Barrier absorbs one tick', () => {
    const c = makeChar(1, { hp: 10, armor: 5 });
    applyStatus(c, { id: 'burning', turns: 10, magnitude: 99 });
    expect(tickStatuses(c, roll(0.99))).toContainEqual(expect.objectContaining({ type: 'status-tick', damage: 0, armorDamage: 3 }));
    expect([c.hp, c.armor]).toEqual([10, 2]);
    expect(tickStatuses(c, roll(0.99))).toContainEqual(expect.objectContaining({ type: 'status-tick', damage: 1, armorDamage: 2 }));
    expect([c.hp, c.armor]).toEqual([9, 0]);
    applyStatus(c, { id: 'barrier', turns: 10 });
    const events = tickStatuses(c, roll(0.99));
    expect([c.hp, c.armor]).toEqual([9, 0]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'status-expire', statusId: 'barrier' }));
    expect(tickStatuses(c, roll(0.99))).toContainEqual(expect.objectContaining({ type: 'status-tick', damage: 3 }));
  });
  it('Stun disables both compiled passives and directly-read trait triggers until cleansed', () => {
    const c = makeChar(1, { traitIds: ['fireproof'], passive: { ...neutralPassives(), spellDamageTaken: 0.5 } });
    expect(passivesOf(c).spellDamageTaken).toBe(0.5);
    expect(activeTraitIds(c)).toEqual(['fireproof']);
    applyStatus(c, { id: 'stun', turns: 3 });
    expect(passivesOf(c).spellDamageTaken).toBe(1);
    expect(activeTraitIds(c)).toEqual([]);
    c.statuses = [];
    expect(passivesOf(c).spellDamageTaken).toBe(0.5);
    expect(activeTraitIds(c)).toEqual(['fireproof']);
  });
  it('Poison has a single probabilistic 1-Life tick and no natural expiry', () => {
    const c = makeChar(1, { hp: 2, armor: 10 });
    applyStatus(c, { id: 'poison', turns: 1, magnitude: 99 });
    expect(tickStatuses(c, roll(0.5))).toContainEqual(expect.objectContaining({ type: 'status-tick', damage: 0 }));
    expect(tickStatuses(c, roll(0.49))).toContainEqual(expect.objectContaining({ type: 'status-tick', damage: 1 }));
    expect(c.statuses[0].turns).toBe(1);
    expect([c.hp, c.armor]).toEqual([1, 10]);
    const last = tickStatuses(c, roll(0));
    expect(last).toContainEqual({ type: 'defeat', characterId: 1 });
  });
});

describe('statusEffect 原语', () => {
  function makeState() {
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] };
    return createGameState(new BoardModel(), left, right);
  }
  function ctx(state: ReturnType<typeof makeState>, casterId: number): EffectContext {
    let gid = 1;
    return { state, casterId, rng: new SeededRNG(1), nextGemId: () => gid++ };
  }

  it('对全体敌人施加中毒', () => {
    const state = makeState();
    const targets = selectTargets('enemyAll', state, 0, new SeededRNG(1));
    const events = statusEffect({ targets, statusId: 'poison', turns: 3, magnitude: 4 }).apply(ctx(state, 0));
    expect(events.filter((e) => e.type === 'status-apply').length).toBe(2);
    expect(hasStatus(state.teams[PlayerSide.Right].characters[0], 'poison')).toBe(true);
    expect(hasStatus(state.teams[PlayerSide.Right].characters[1], 'poison')).toBe(true);
  });
});
