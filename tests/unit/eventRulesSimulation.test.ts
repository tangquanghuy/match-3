/**
 * 活动深化批：带战斗规则的真实活动请求，AI 对打到终局（不崩溃、按规则判出胜负）。
 * 与 App.init 同口径搭建：完整技能库 + meta 注册表 + 召唤解析 + 预置棋盘 + BattleSession 注入规则。
 */
import { describe, it, expect } from 'vitest';
import { BoardGenerator } from '@engine/boardGen';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { setSummonTemplateResolver } from '@engine/traits';
import { chooseAiAction } from '@engine/aiPolicy';
import { BATTLE_SKULL_CHANCE } from '@engine/comboBias';
import { MatchState, PlayerSide } from '@engine/types';
import { TROOPS, troopToSummonTemplate } from '../../src/data/troops';
import { BattleSession, mapRequestToTeams } from '@session/index';
import { applyRequestBoardPreset } from '@session/rules';
import { newSave } from '../../src/meta/state/schema';
import { EVENT_UNLOCK_HERO_LEVEL, WEEK_MS } from '../../src/meta/data/events';
import { eventModeState } from '../../src/meta/systems/events';
import type { BridgeOutcome } from '../../src/meta/systems/battleBridge';
import { eventBattle } from './helpers/eventDriver';

const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);

function run(out: BridgeOutcome) {
  const request = out.request;
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  for (const [id, p] of out.registry.prototypes) registry.prototypes.set(id, p);
  const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(request);
  const rng = new SeededRNG(request.seed);
  let nextId = 100000;
  const idGen = () => nextId++;
  const board = new BoardGenerator(rng, idGen, request.rules?.board?.skullChance ?? BATTLE_SKULL_CHANCE).generate();
  applyRequestBoardPreset(board, request, rng);
  const state = createGameState(board, playerTeam, enemyTeam, PlayerSide.Left, request.kingdom !== undefined ? { kingdom: request.kingdom } : undefined);
  const engine = new TurnEngine(state, rng, idGen, registry);
  engine.setSummonResolver((ref) => troopToSummonTemplate(ref, request.arenaRules));
  engine.setDaemonPool(TROOPS.filter((t) => t.troopTypes.includes('Daemon')).map((t) => t.referenceName));
  engine.setBeastPool(TROOPS.filter((t) => t.troopTypes.includes('Beast')).map((t) => t.referenceName));
  setSummonTemplateResolver((spec) => troopToSummonTemplate(spec.referenceName, request.arenaRules));
  engine.skullChance = BATTLE_SKULL_CHANCE;
  const session = new BattleSession({ request, idMap, engine });
  let passes = 0;
  for (let i = 0; i < 600 && state.state !== MatchState.GameOver; i++) {
    if (state.state !== MatchState.AwaitingInput) break;
    let decision = chooseAiAction({ state, side: state.activePlayer, rng, registry });
    let events = decision ? session.resolve(decision.action) : [];
    if (decision?.action.type === 'cast' && events.length === 0) {
      decision = chooseAiAction({ state, side: state.activePlayer, rng, registry, allowCast: false });
      events = decision ? session.resolve(decision.action) : [];
    }
    if (events.length === 0) { session.passTurn(); if (++passes > 30) break; }
  }
  expect(state.state).toBe(MatchState.GameOver);
  return session.buildResult();
}

const fresh = () => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 5000 } });
  s.hero.level = EVENT_UNLOCK_HERO_LEVEL;
  return s;
};

describe('活动规则战 · AI 对打到终局', () => {
  it('宝藏地精 / 地精乐队 / 宝箱怪 / 擂台', () => {
    const endings = new Set<string>();
    for (const enc of ['treasureGnome', 'gnomeBand', 'mimic', 'arena', 'gnomeParty'] as const) {
      for (let k = 0; k < 3; k++) {
        const s = fresh();
        eventModeState(s, WEEK, 'worldEvent').pending = { kind: 'encounter', enc, tier: k % 2 };
        const r = run(eventBattle(s, 'worldEvent', WEEK, 'enc'));
        endings.add(`${enc}:${r.endReason ?? 'wipe'}:${(r.fledExternalIds ?? []).length > 0 ? 'fled' : ''}`);
      }
    }
    if (import.meta.env.SIM_LOG) console.log([...endings].join(' | '));
    expect(endings.size).toBeGreaterThan(0);
  });

  it('坚守 / 限时 / 斩首 / 石阵 / 末日棋盘 试炼', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'classTrials');
    for (const id of ['survive', 'blitz', 'behead', 'stones', 'doomboard', 'gemrain', 'manaflood', 'alchemy', 'bones']) {
      state.trials = [id];
      const r = run(eventBattle(s, 'classTrials', WEEK, `trial:${id}`));
      if (id === 'survive' && r.winner === 'player') expect(['turn-limit', undefined]).toContain(r.endReason);
      if (id === 'blitz' && r.winner === 'enemy' && r.endReason === 'turn-limit') expect(r.playerTurns).toBe(8);
    }
  });

  it('突袭首领原型 / 入侵兵团 / 阵营王城', () => {
    for (let i = 0; i < 3; i++) {
      const s = fresh();
      run(eventBattle(s, 'raidBoss', WEEK));
      run(eventBattle(s, 'invasion', WEEK));
      run(eventBattle(s, 'factionAssault', WEEK));
    }
  });
});
