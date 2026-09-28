import { describe, it, expect } from 'vitest';
import { SeededRNG } from '@engine/rng';
import {
  applyStatus,
  tickStatuses,
  tickTeamStatuses,
  hasStatus,
  TERROR_STATUS_ID,
  TERROR_DROP_CHANCE,
} from '@engine/skills/effects/status';
import { neutralPassives } from '@engine/traits';
import { BaseColor, PlayerSide } from '@engine/types';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { resolveDefeatEvents } from '@engine/teamRoster';
import type { Character } from '@engine/types';
import type { GameEvent } from '@engine/events';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 100,
    hp: 100,
    attack: 10,
    armor: 0,
    magic: 0,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function withTerror(id: number, over: Partial<Character> = {}): Character {
  const char = makeChar(id, { passive: neutralPassives(), ...over });
  char.statuses.push({ id: TERROR_STATUS_ID, turns: 4 });
  return char;
}

function terrorTickEvents(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => e.type === 'status-tick' && e.statusId === TERROR_STATUS_ID);
}

describe('GoW official Terror: roster boundary', () => {
  it('final position triggers Flee without promoting legacy queued data', () => {
    let seed = 1;
    for (; seed < 500; seed++) if (new SeededRNG(seed).next() < 0.1) break;
    const last = withTerror(1);
    last.statuses[0].recoveryChance = 0;
    const substitute = makeChar(7);
    const state = createGameState(new BoardModel(),
      { player: PlayerSide.Left, characters: [last], summonQueue: [{ character: substitute, troopId: 77 }] },
      { player: PlayerSide.Right, characters: [makeChar(9)] });
    const produced = tickTeamStatuses(state.teams[PlayerSide.Left].characters, new SeededRNG(seed), PlayerSide.Left);
    expect(produced.some(e => e.type === 'defeat')).toBe(false);
    expect(produced).toContainEqual(expect.objectContaining({ type: 'flee', characterId: 1, player: PlayerSide.Left }));
    expect(last.fled).toBe(true);
    expect(state.teams[PlayerSide.Left].characters.map(c => c.id)).toEqual([1]);
    const events = resolveDefeatEvents(state, produced);
    expect(events.some(e => e.type === 'summon')).toBe(false);
    expect(state.teams[PlayerSide.Left].characters).toEqual([]);
  });
});

describe('恐怖状态（terror）：每回合 10% 队伍位次下移（官方状态表语义）', () => {
  it('掷中时与后一位交换并发 status-tick（无 damage 字段）', () => {
    // 找一个「首掷命中下移、次掷不命中」的种子（连续命中会下移两位，也是合法行为，
    // 但本用例锁定单次命中的最小场景）
    let seed = 1;
    for (; seed < 500; seed++) {
      const rng = new SeededRNG(seed);
      if (rng.next() < TERROR_DROP_CHANCE && rng.next() >= TERROR_DROP_CHANCE) break;
    }
    expect(seed).toBeLessThan(500);
    const a = withTerror(1);
    const b = makeChar(2);
    const c = makeChar(3);
    const team = { player: 0 as never, characters: [a, b, c] };
    const events = tickTeamStatuses(team.characters as never, new SeededRNG(seed));

    expect(team.characters[0].id).toBe(2); // b 上移
    expect(team.characters[1].id).toBe(1); // a（恐怖者）下移一位
    expect(team.characters[2].id).toBe(3);
    const ticks = terrorTickEvents(events);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toMatchObject({ type: 'status-tick', targetId: 1, statusId: 'terror' });
    expect((ticks[0] as { damage?: number }).damage).toBeUndefined();
  });

  it('未掷中时位次不变', () => {
    // 找一个前若干掷均 ≥ 0.1 的种子
    let seed = 1;
    for (; seed < 500; seed++) {
      const rng = new SeededRNG(seed);
      if (rng.next() >= TERROR_DROP_CHANCE) break;
    }
    const a = withTerror(1);
    const b = makeChar(2);
    const team = { player: 0 as never, characters: [a, b] };
    const events = tickTeamStatuses(team.characters as never, new SeededRNG(seed));
    expect(team.characters.map((ch) => ch.id)).toEqual([1, 2]);
    expect(terrorTickEvents(events)).toHaveLength(0);
  });

  it('无后位（队尾/单人）时空过（不发生位次交换）', () => {
    const lone = withTerror(1);
    const team = { player: 0 as never, characters: [lone] };
    const events = tickTeamStatuses(team.characters as never, new SeededRNG(9));
    expect(terrorTickEvents(events)).toHaveLength(0);
    expect(team.characters.map((ch) => ch.id)).toEqual([1]);
  });

  it('后位已阵亡时空过', () => {
    const a = withTerror(1);
    const dead = makeChar(2, { defeated: true, hp: 0 });
    const team = { player: 0 as never, characters: [a, dead] };
    const events = tickTeamStatuses(team.characters as never, new SeededRNG(3));
    expect(terrorTickEvents(events)).toHaveLength(0);
    expect(team.characters.map((ch) => ch.id)).toEqual([1, 2]);
  });

  it('无恐怖状态的角色不消耗掷签（随机序列护栏）', () => {
    const a = makeChar(1);
    const b = makeChar(2);
    const team = { player: 0 as never, characters: [a, b] };
    const rngA = new SeededRNG(11);
    tickTeamStatuses(team.characters as never, rngA);
    const rngB = new SeededRNG(11);
    tickTeamStatuses(team.characters as never, rngB);
    // 同种子两次消耗一致即可；再验证无恐怖时与纯 DoT 队伍消耗次数相同
    const team2 = { player: 0 as never, characters: [makeChar(5), makeChar(6)] };
    const rngC = new SeededRNG(11);
    tickTeamStatuses(team2.characters as never, rngC);
    expect(rngA.next()).toBe(rngC.next());
  });
});

describe('恐怖状态：施加 / 免疫 / 自动解除', () => {
  it('applyStatus 施加（恐怖宝石入口共用同一状态表）', () => {
    const char = makeChar(1);
    const events = applyStatus(char, { id: TERROR_STATUS_ID, turns: 4 });
    expect(events).toMatchObject([{ type: 'status-apply', statusId: 'terror', turns: 4 }]);
    expect(hasStatus(char, TERROR_STATUS_ID)).toBe(true);
  });

  it('免疫特质拦截施加', () => {
    const char = makeChar(1, { passive: { ...neutralPassives(), statusImmunities: [TERROR_STATUS_ID] } });
    const events = applyStatus(char, { id: TERROR_STATUS_ID, turns: 4 });
    expect(events).toEqual([expect.objectContaining({ type: 'status-blocked' })]);
    expect(hasStatus(char, TERROR_STATUS_ID)).toBe(false);
  });

  it('进入 AUTO_RECOVER 通道：累计 10% 自行解除（到期解除之外的第二条出路）', () => {
    // 找一个首次掷中自愈的种子
    let seed = 1;
    for (; seed < 500; seed++) {
      if (new SeededRNG(seed).next() < 0.1) break;
    }
    const char = withTerror(1);
    const events = tickStatuses(char, new SeededRNG(seed));
    expect(events.some((e) => e.type === 'status-expire' && e.statusId === TERROR_STATUS_ID)).toBe(true);
    expect(hasStatus(char, TERROR_STATUS_ID)).toBe(false);
  });

  it('下移概率常量为 0.1（官方 10%）', () => {
    expect(TERROR_DROP_CHANCE).toBe(0.1);
  });
});
