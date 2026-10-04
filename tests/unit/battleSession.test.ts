import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Gem, GemType } from '@engine/types';
import {
  BATTLE_SCHEMA_VERSION,
  BattleSession,
  RULESET_VERSION,
  mapRequestToTeams,
} from '@session/index';
import type { BattleRequest, CombatantSnapshot } from '@session/index';

let gid = 0;
const g = (type: GemType): Gem => ({ id: gid++, type });

function snapshot(over: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    externalId: 'x',
    name: 'C',
    stats: { hp: 40, attack: 4, armor: 0, magic: 6 },
    manaColors: [BaseColor.Red],
    manaCost: 10,
    skillId: 'plain',
    traitIds: [],
    ...over,
  };
}

function makeRequest(): BattleRequest {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: 'b1',
    requestId: 'r1',
    rulesetVersion: RULESET_VERSION,
    seed: 99,
    playerTeam: [snapshot({ externalId: 'p1' })],
    enemyTeam: [snapshot({ externalId: 'e1', stats: { hp: 12, attack: 4, armor: 0, magic: 1 } })],
  };
}

/** 造一场可控战斗：静态棋盘 + 底行一处合法交换 + 一个纯伤害技能。 */
function setup(damage = 3, region?: 'WintersReach', bannerBoost?: number) {
  const request = makeRequest();
  if (bannerBoost !== undefined) request.playerBanner = { boosts: { [BaseColor.Red]: bannerBoost } };
  if (region) request.region = region;
  const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(request);

  const board = new BoardModel();
  const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
    }
  }
  board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
  board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Blue)));

  const registry = new ExtensionRegistry();
  registry.prototypes.set('plain', {
    segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: damage, mult: 0 } }],
  });

  const state = createGameState(board, playerTeam, enemyTeam);
  let idg = 700000;
  const engine = new TurnEngine(state, new SeededRNG(request.seed), () => idg++, registry);
  engine.skullChance = 0;

  const session = new BattleSession({ request, idMap, engine });
  return { session, state, request };
}

describe('BattleSession 生命周期（设计 §2）', () => {
  it('passes troop roles from battle snapshots into the AI state', () => {
    const request = makeRequest();
    request.playerTeam[0]!.role = 'Generator';
    request.enemyTeam[0]!.role = 'Striker';
    const teams = mapRequestToTeams(request);
    expect(teams.playerTeam.characters[0]?.role).toBe('Generator');
    expect(teams.enemyTeam.characters[0]?.role).toBe('Striker');
  });
  it('passes regional context into the engine and keeps ordinary battles regionless', () => {
    expect(setup(3, 'WintersReach').session.getState().region).toBe('WintersReach');
    expect(setup().session.getState().region).toBeUndefined();
  });
  it.each([3, 4])('applies the full aggregated +%s banner through a session', (boost) => {
    const { session } = setup(3, undefined, boost);
    const events = session.resolve({ type: 'swap', from: { row: 7, col: 2 }, to: { row: 6, col: 2 } });
    const gain = events.find((e) => e.type === 'mana-gain' && e.color === BaseColor.Red);
    expect(gain).toMatchObject({ type: 'mana-gain', amount: 3 + boost });
  });

  it('提交行动会累积事件流', () => {
    const { session } = setup();
    expect(session.recordedEvents()).toHaveLength(0);

    const events = session.resolve({ type: 'swap', from: { row: 7, col: 2 }, to: { row: 6, col: 2 } });
    expect(events.length).toBeGreaterThan(0);
    expect(session.recordedEvents()).toHaveLength(events.length);

    const before = session.recordedEvents().length;
    session.passTurn();
    expect(session.recordedEvents().length).toBeGreaterThan(before);
  });

  it('被拒绝的行动不产生事件也不污染累计', () => {
    const { session } = setup();
    // 非相邻交换：引擎直接拒绝
    expect(session.resolve({ type: 'swap', from: { row: 0, col: 0 }, to: { row: 5, col: 5 } })).toEqual([]);
    // 法力不足：施法被拒绝
    expect(session.resolve({ type: 'cast', characterId: 0 })).toEqual([]);
    expect(session.recordedEvents()).toHaveLength(0);
    expect(session.getState().actionLog).toHaveLength(0);
  });

  it('未结束时 isFinished 为假且拒绝导出结果', () => {
    const { session } = setup();
    expect(session.isFinished()).toBe(false);
    expect(() => session.buildResult()).toThrow(/尚未结束/);
  });

  it('结束后导出结果，并含累积事件的摘要', () => {
    const { session, state } = setup(999);
    state.teams[PlayerSide.Left].characters[0].mana = 10;
    session.resolve({ type: 'cast', characterId: 0 });

    expect(session.isFinished()).toBe(true);
    const result = session.buildResult();
    expect(result).toMatchObject({
      battleId: 'b1',
      requestId: 'r1',
      winner: 'player',
      turns: 1,
      defeatedExternalIds: ['e1'],
    });
    expect(result.eventSummary.find((s) => s.type === 'skill-cast')?.count).toBe(1);
    expect(result.actionLogDigest).toMatch(/^[0-9a-f]{8}$/);
  });

  it('结果只算一次：多次导出返回同一份数据', () => {
    const { session, state } = setup(999);
    state.teams[PlayerSide.Left].characters[0].mana = 10;
    session.resolve({ type: 'cast', characterId: 0 });

    const first = session.buildResult();
    const second = session.buildResult();
    expect(second).toBe(first);
  });

  it('多次行动的事件全部计入摘要，回合数不含额外回合', () => {
    const { session, state } = setup(3);
    // 一次交换 + 一次施法
    session.resolve({ type: 'swap', from: { row: 7, col: 2 }, to: { row: 6, col: 2 } });
    state.teams[PlayerSide.Right].characters[0].mana = 10;
    session.resolve({ type: 'cast', characterId: 4 });

    const log = session.getState().actionLog;
    expect(log.map((e) => e.action.type)).toEqual(['swap', 'cast']);
    const swapEvents = session.recordedEvents().filter((e) => e.type === 'swap');
    expect(swapEvents).toHaveLength(1);
  });
});

describe('surrender', () => {
  it('finishes exactly once without inventing deaths, turns or loot', () => {
    const { session, state } = setup();
    state.economy = { gold: 90, souls: 10, gems: 2, maps: 1 };
    const hp = state.teams[PlayerSide.Left].characters[0].hp;
    expect(session.surrender()).toEqual([{ type: 'game-over', winner: PlayerSide.Right, reason: 'surrender' }]);
    expect(session.isFinished()).toBe(true);
    const result = session.buildResult();
    expect(result).toMatchObject({ winner: 'enemy', endReason: 'surrender', turns: 0,
      economy: { gold: 0, souls: 0, gems: 0 }, defeatedExternalIds: [], fledExternalIds: [] });
    expect(state.teams[PlayerSide.Left].characters[0].hp).toBe(hp);
    expect(result.combatants.every(c => !c.defeated)).toBe(true);
    expect(session.surrender()).toEqual([]);
    expect(session.passTurn()).toEqual([]);
    expect(session.resolve({ type: 'cast', characterId: 0 })).toEqual([]);
    expect(session.buildResult()).toBe(result);
    expect(session.recordedEvents().filter(e => e.type === 'game-over')).toHaveLength(1);
  });

  it('does not replace an already resolved victory', () => {
    const { session, state } = setup(999);
    state.teams[PlayerSide.Left].characters[0].mana = 10;
    session.resolve({ type: 'cast', characterId: 0 });
    const won = session.buildResult();
    expect(session.surrender()).toEqual([]);
    expect(session.buildResult()).toBe(won);
    expect(won.winner).toBe('player');
    expect(won.endReason).toBeUndefined();
  });

  it('can surrender on the enemy turn without letting the enemy act afterwards', () => {
    const { session, state } = setup();
    state.activePlayer = PlayerSide.Right;
    session.surrender();
    expect(session.resolve({ type: 'swap', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } })).toEqual([]);
    expect(state.actionLog).toHaveLength(0);
  });
});


describe('battle result map cap', () => {
  it.each([[99, 2], [1.9, 1], [-2, undefined], [NaN, undefined]])('serializes %s maps as %s', (maps, expected) => {
    const { session, state } = setup(999);
    state.economy.maps = maps!;
    state.teams[PlayerSide.Left].characters[0].mana = 10;
    session.resolve({ type: 'cast', characterId: 0 });
    expect(session.buildResult().economy?.maps).toBe(expected);
  });
});
