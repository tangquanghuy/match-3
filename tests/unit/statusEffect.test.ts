import { describe, it, expect } from 'vitest';
import {
  applyStatus,
  tickStatuses,
  tickTeamStatuses,
  hasStatus,
  statusEffect,
} from '@engine/skills/effects/status';
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
    const events = tickStatuses(c);
    // DoT 直接扣血，不动护甲
    expect(c.hp).toBe(46);
    expect(c.armor).toBe(10);
    const tick = events.find((e) => e.type === 'status-tick');
    expect(tick).toMatchObject({ type: 'status-tick', targetId: 1, statusId: 'poison', damage: 4 });
    // turns 递减为 1，未移除
    expect(c.statuses[0].turns).toBe(1);
  });

  it('到期移除并发 status-expire（需求 9.5）', () => {
    const c = makeChar(1, { hp: 50 });
    applyStatus(c, { id: 'poison', turns: 1, magnitude: 4 });
    const events = tickStatuses(c);
    expect(c.statuses).toEqual([]);
    expect(events.some((e) => e.type === 'status-expire' && e.statusId === 'poison')).toBe(true);
  });

  it('DoT 致死标记阵亡并发 defeat', () => {
    const c = makeChar(1, { hp: 3 });
    applyStatus(c, { id: 'burning', turns: 3, magnitude: 5 });
    const events = tickStatuses(c);
    expect(c.hp).toBe(0);
    expect(c.defeated).toBe(true);
    expect(events.some((e) => e.type === 'defeat' && e.characterId === 1)).toBe(true);
  });

  it('非 DoT 状态结算不扣血，只递减/到期', () => {
    const c = makeChar(1, { hp: 50 });
    applyStatus(c, { id: 'silence', turns: 2 });
    tickStatuses(c);
    expect(c.hp).toBe(50);
    expect(c.statuses[0].turns).toBe(1);
  });

  it('结算时机确定：整队按索引顺序（需求 9.4）', () => {
    const chars = [makeChar(0, { hp: 50 }), makeChar(1, { hp: 50 })];
    applyStatus(chars[0], { id: 'poison', turns: 2, magnitude: 3 });
    applyStatus(chars[1], { id: 'poison', turns: 2, magnitude: 7 });
    const events = tickTeamStatuses(chars);
    const ticks = events.filter(
      (e): e is Extract<GameEvent, { type: 'status-tick' }> => e.type === 'status-tick',
    );
    expect(ticks.map((t) => t.targetId)).toEqual([0, 1]);
    expect(chars[0].hp).toBe(47);
    expect(chars[1].hp).toBe(43);
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
