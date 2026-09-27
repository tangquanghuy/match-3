import { invasionVictoryVp } from '../../src/meta/systems/invasion';
/**
 * 入侵 PvP（素材批 2026-09-19）：镜像榜单确定性、首次定级、VP 官方计分表、
 * 荣耀/每日首胜、周结升降级（含「不打不降」）、出战斗请求过校验、headless 真实对局。
 */
import { describe, it, expect } from 'vitest';
import { newSave, type MetaSave } from '../../src/meta/state/schema';
import { SeededRNG } from '../../src/engine/rng';
import { starterTroopIds, INVASION, INVASION_LEAGUES, INVASION_VP_TABLE, INVASION_ZONES } from '../../src/meta/data/economy';
import { WEEK_MS } from '../../src/meta/data/events';
import {
  buildBracket,
  ensureInvasionSeason,
  invasionCandidates,
  invasionStandings,
  invasionVpBonuses,
  mirrorVpAt,
  planInvasionBattle,
  settleInvasionBattle,
} from '../../src/meta/systems/invasion';
import { buildMetaRegistry, metaKnownTraitIds } from '../../src/meta/systems/battleBridge';
import { validateBattleRequest } from '../../src/session/validateRequest';
import { knownTroopTypes } from '../../src/data/troops';
import { pickTalent } from '../../src/meta/systems/talents';
import { setTeamPreset } from '../../src/meta/systems/teamRules';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { BoardGenerator } from '../../src/engine/boardGen';
import { BoardModel } from '../../src/engine/BoardModel';
import { MatchResolver } from '../../src/engine/MatchResolver';
import { findLegalSwaps } from '../../src/engine/boardUtils';
import { createGameState } from '../../src/engine/GameState';
import { MatchState } from '../../src/engine/types';
import type { CellPos } from '../../src/engine/types';
import { BattleSession, mapRequestToTeams } from '../../src/session';

const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);

const save = (heroLevel = 12): MetaSave => {
  const s = newSave({ now: 0, starterTroopIds: starterTroopIds(), currencies: { gold: 5000 } });
  s.hero.level = heroLevel;
  // 起始队练到 9 级，保证对局有基本强度
  for (const id of starterTroopIds()) {
    const rec = s.collection[String(id)]!;
    rec.level = 9;
    rec.traits = [true, true, true];
  }
  return s;
};

describe('镜像榜单（buildBracket / standings）', () => {
  it('29 个镜像、互不重名、不产生血怒加倍、终值随联赛抬升', () => {
    const a = buildBracket(WEEK, 0);
    const b = buildBracket(WEEK, 0);
    expect(a).toHaveLength(INVASION.bracketSize);
    expect(new Set(a.map((m) => m.name)).size).toBe(a.length);
    expect(a.filter((m) => m.frenzy)).toHaveLength(INVASION.frenzyCount);
    expect(a.map((m) => m.finalVp)).toEqual(b.map((m) => m.finalVp)); // 同周复现
    const hi = buildBracket(WEEK, 6);
    const avg = (ms: typeof a): number => ms.reduce((s, m) => s + m.finalVp, 0) / ms.length;
    expect(avg(hi)).toBeGreaterThan(avg(a)); // 联赛越高卷得越凶
  });

  it('VP 推演随时点爬坡：周初≈0，周末=终值', () => {
    const mirror = buildBracket(WEEK, 0)[0]!;
    expect(mirrorVpAt(mirror, WEEK, WEEK)).toBe(0);
    expect(mirrorVpAt(mirror, WEEK + WEEK_MS, WEEK)).toBe(mirror.finalVp);
    expect(mirrorVpAt(mirror, WEEK + WEEK_MS / 2, WEEK)).toBeLessThanOrEqual(mirror.finalVp);
  });

  it('榜单含玩家且名次按 VP 排序', () => {
    const s = save();
    ensureInvasionSeason(s, 0, WEEK);
    s.invasion.vp = 999_999;
    const { placement } = invasionStandings(s, WEEK + 1000, WEEK);
    expect(placement).toBe(1);
  });
});

describe('赛季（ensureInvasionSeason）', () => {
  it('首次进入：从青铜起步，不按主角等级跳阶，不自动发奖', () => {
    const s = save(45);
    const summary = ensureInvasionSeason(s, 0, WEEK);
    expect(summary).toBeNull();
    expect(s.invasion.league).toBe(0);
    expect(s.invasion.bestLeague).toBe(0);
    expect(s.currencies.glory).toBe(0);
  });

  it('周榜第一名也不触发官阶晋升或旧版周结宝石', () => {
    const s = save();
    ensureInvasionSeason(s, 0, WEEK);
    const league = s.invasion.league;
    s.invasion.vp = 9_999_999; // 稳第一名
    s.invasion.battles = 5;
    const summary = ensureInvasionSeason(s, 0, WEEK + WEEK_MS)!;
    expect(summary.movement).toBe('stay');
    expect(summary.toLeague).toBe(league);
    expect(s.currencies.glory).toBe(0);
    expect(summary.gems).toBe(0);
    expect(Object.values(s.materials.traitstones).reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.invasion.vp).toBe(0); // 新赛季清零
    expect(s.invasion.weekStart).toBe(WEEK + WEEK_MS);
  });

  it('0 场跨周：不降不发（官方「不打不降」）', () => {
    const s = save();
    ensureInvasionSeason(s, 0, WEEK);
    const league = s.invasion.league;
    const gloryBefore = s.currencies.glory;
    const summary = ensureInvasionSeason(s, 0, WEEK + WEEK_MS)!;
    expect(summary.played).toBe(false);
    expect(summary.toLeague).toBe(league);
    expect(s.currencies.glory).toBe(gloryBefore);
  });

  it('新周统一重置官阶，不依赖周榜名次', () => {
    const s = save(30);
    s.invasion.progressionVp = 200;
    ensureInvasionSeason(s, 0, WEEK);
    expect(s.invasion.league).toBe(1);
    s.invasion.vp = 0;
    s.invasion.battles = 3;
    const summary = ensureInvasionSeason(s, 0, WEEK + WEEK_MS)!;
    // VP 0 必然第 30 名；白银 26-30 降级
    expect(summary.placement).toBe(30);
    expect(summary.movement).toBe('stay');
    expect(s.invasion.league).toBe(0);
    expect(s.invasion.progressionVp).toBe(0);
  });
});

describe('VP 计分（官方表）', () => {
  it('基础分按对手等级段取值', () => {
    expect(INVASION_VP_TABLE.find((r) => 8 <= r.maxLevel)!.base).toBe(10);
    expect(INVASION_VP_TABLE.find((r) => 25 <= r.maxLevel)!.base).toBe(30);
  });

  it('加分项每类取最高（速胜/存活/额外回合）', () => {
    const result = {
      turns: 5,
      combatants: [
        { side: 'player', defeated: false },
        { side: 'player', defeated: false },
        { side: 'player', defeated: false },
        { side: 'enemy', defeated: true },
      ],
      eventSummary: [{ type: 'extra-turn', count: 5 }],
    } as unknown as Parameters<typeof invasionVpBonuses>[0];
    const b = invasionVpBonuses(result);
    expect(b.speed).toBe(6); // ≤6 → +6（≤4 不满足）
    expect(b.survivors).toBe(5); // 3 人存活 → +5
    expect(b.extraTurns).toBe(2); // ≥4 → +2
    expect(b.total).toBe(13);
  });

  it('结算：胜场按难度固定 VP，荣耀/黄金入账，每日首胜只发一次', () => {
    const s = save();
    ensureInvasionSeason(s, 0, WEEK);
    const mirror = invasionCandidates(s, WEEK + 3_600_000, WEEK)[0]!;
    const result = {
      winner: 'player',
      turns: 7,
      combatants: [],
      eventSummary: [],
      defeatedExternalIds: [],
    } as unknown as Parameters<typeof settleInvasionBattle>[1];
    const r1 = settleInvasionBattle(s, result, mirror.id, WEEK + 3_600_000, WEEK, TODAY);
    expect(r1).toMatchObject({ ok: true, victory: true });
    if (!r1.ok) return;
    expect(r1.vpDelta).toBe(invasionVictoryVp(mirror));
    expect(r1.firstWinToday).toBe(true);
    const gloryAfterFirst = s.currencies.glory;
    expect(gloryAfterFirst).toBeGreaterThan(0);
    // 同日第二胜：无首胜加成
    const mirror2 = invasionCandidates(s, WEEK + 3_600_000, WEEK)[1]!;
    const r2 = settleInvasionBattle(s, result, mirror2.id, WEEK + 7_200_000, WEEK, TODAY);
    if (r2.ok) expect(r2.firstWinToday).toBe(false);
  });

  it('败场：VP −5（不透支），无荣耀', () => {
    const s = save();
    ensureInvasionSeason(s, 0, WEEK);
    s.invasion.vp = 10;
    const mirror = invasionCandidates(s, WEEK + 3_600_000, WEEK)[0]!;
    const result = { winner: 'enemy', turns: 12, combatants: [], eventSummary: [], defeatedExternalIds: [] } as unknown as Parameters<typeof settleInvasionBattle>[1];
    const r = settleInvasionBattle(s, result, mirror.id, WEEK + 3_600_000, WEEK, TODAY);
    expect(r).toMatchObject({ ok: true, victory: false, vpDelta: -5, glory: 0 });
    expect(s.invasion.vp).toBe(5);
    // VP 只有 0 时败场不透支为负
    const s2 = save();
    ensureInvasionSeason(s2, 0, WEEK);
    const mirror2 = invasionCandidates(s2, WEEK + 3_600_000, WEEK)[0]!;
    const r2 = settleInvasionBattle(s2, result, mirror2.id, WEEK + 3_600_000, WEEK, TODAY);
    expect(r2).toMatchObject({ ok: true, vpDelta: 0 });
    expect(s2.invasion.vp).toBe(0);
  });
});

describe('出战斗（过会话校验）', () => {
  it('请求合法：mode=pvp，玩家队带主角，敌方=镜像防守队', async () => {
    const s = save();
    const now = WEEK + 3_600_000;
    ensureInvasionSeason(s, now, WEEK);
    const mirror = invasionCandidates(s, now, WEEK)[0]!;
    const plan = planInvasionBattle(s, mirror.id, 424242, now, WEEK);
    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) return;
    expect(plan.request.mode).toBe('pvp');
    expect(plan.request.playerTeam.length).toBeGreaterThanOrEqual(3);
    expect(plan.request.enemyTeam).toHaveLength(mirror.defense.length);
    const registry = buildMetaRegistry(
      [...plan.request.playerTeam, ...plan.request.enemyTeam].map((x) => x.skillId as string),
    );
    const check = validateBattleRequest(plan.request, {
      knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]),
      knownTraitIds: metaKnownTraitIds(),
      knownTroopTypes: knownTroopTypes(),
    });
    expect(check.ok).toBe(true);
  });

  it('主角点了静态效果天赋 ferocity 时仍过会话校验', () => {
    const s = save();
    const now = WEEK + 3_600_000;
    s.hero.unlockedClasses.push('warrior');
    s.hero.classId = 'warrior';
    s.hero.classLevels['warrior'] = 12;
    expect(pickTalent(s, 'warrior', 0, 'ferocity')).toMatchObject({ ok: true });
    const starters = starterTroopIds();
    setTeamPreset(s, 0, {
      name: 't',
      members: [{ kind: 'hero' }, ...starters.slice(0, 3).map((troopId) => ({ kind: 'troop' as const, troopId }))],
      bannerKingdomId: null,
    });
    ensureInvasionSeason(s, now, WEEK);
    const mirror = invasionCandidates(s, now, WEEK)[0]!;
    const plan = planInvasionBattle(s, mirror.id, 424242, now, WEEK);
    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) return;
    const hero = plan.request.playerTeam.find((c) => c.externalId.endsWith('-hero'));
    expect(hero?.traitIds).toContain('ferocity');
  });

  it('非候选对手拒绝；门槛不足拒绝', () => {
    const s = save(5); // 低于 10 级
    const now = WEEK + 3_600_000;
    ensureInvasionSeason(s, now, WEEK);
    expect(planInvasionBattle(s, 'bot-1', 1, now, WEEK)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    const s2 = save();
    ensureInvasionSeason(s2, now, WEEK);
    expect(planInvasionBattle(s2, 'bot-999', 1, now, WEEK)).toMatchObject({ ok: false, code: 'INVALID' });
  });
});

describe('headless 真实对局（TurnEngine 驱动）', () => {
  const resolver = new MatchResolver();

  function skullFirstSwap(board: BoardModel, rng: SeededRNG): { a: CellPos; b: CellPos } | null {
    const swaps = findLegalSwaps(board);
    if (swaps.length === 0) return null;
    let best: { a: CellPos; b: CellPos }[] = [];
    let bestScore = -1;
    for (const sw of swaps) {
      const trial = board.clone();
      trial.swap(sw.a, sw.b);
      const matches = resolver.findMatches(trial);
      if (matches.length === 0) continue;
      let skulls = 0;
      let cells = 0;
      for (const group of matches) {
        cells += group.cells.length;
        for (const pos of group.cells) {
          if (trial.get(pos)?.type.kind === 'skull') skulls += 1;
        }
      }
      const score = skulls * 10 + cells;
      if (score > bestScore) {
        bestScore = score;
        best = [sw];
      } else if (score === bestScore) {
        best.push(sw);
      }
    }
    if (best.length === 0) return null;
    return best[rng.nextInt(best.length)]!;
  }

  it('镜像队伍能打完整一场并正常结算', () => {
    const s = save();
    const now = WEEK + 3_600_000;
    ensureInvasionSeason(s, now, WEEK);
    const mirror = invasionCandidates(s, now, WEEK)[0]!;
    const plan = planInvasionBattle(s, mirror.id, 987_654, now, WEEK);
    if (!plan.ok) throw new Error(plan.message);

    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(plan.request);
    let gemId = 700000;
    const board = new BoardGenerator(new SeededRNG(987_654), () => gemId++, 0.12).generate();
    const state = createGameState(board, playerTeam, enemyTeam);
    let unitId = 800000;
    const engine = new TurnEngine(state, new SeededRNG(plan.request.seed), () => unitId++, plan.registry);
    engine.skullChance = 0.18;
    const session = new BattleSession({ request: plan.request, idMap, engine });

    const aiRng = new SeededRNG(424242);
    let guard = 0;
    while (!session.isFinished() && guard++ < 1500) {
      const snapshot = session.getState();
      if (snapshot.state !== MatchState.AwaitingInput) continue;
      // Cast ready spells too: a zero-attack support front can stall a skull-only bot.
      const ready = snapshot.teams[snapshot.activePlayer].characters.filter(c => !c.defeated && c.mana >= c.manaCost);
      let cast = false;
      for (const c of ready) {
        if (session.resolve({ type: 'cast', characterId: c.id }).length > 0) { cast = true; break; }
      }
      if (cast) continue;
      const swap = skullFirstSwap(snapshot.board, aiRng);
      if (!swap) {
        session.passTurn();
        continue;
      }
      const events = session.resolve({ type: 'swap', from: swap.a, to: swap.b });
      if (events.length === 0) session.passTurn();
    }
    expect(session.isFinished()).toBe(true);

    const result = session.buildResult();
    const settled = settleInvasionBattle(s, result, mirror.id, now, WEEK, TODAY);
    expect(settled.ok).toBe(true);
    if (settled.ok) {
      expect(INVASION_VP_TABLE.some((r) => settled.vpDelta <= r.max)).toBe(true);
      expect(s.invasion.battles).toBe(1);
    }
  });
});

const TODAY = WEEK + 3_600_000;

// INVASION_LEAGUES 仅用于官阶表完整性断言
expect(INVASION_LEAGUES).toHaveLength(10);
expect(INVASION_ZONES).toHaveLength(10);

 describe('invasion common battle progression', () => {
  it.each(['player', 'enemy'] as const)('pays XP, gold and souls on %s result in addition to collected loot', winner => {
    const s = save(1);
    ensureInvasionSeason(s, 0, WEEK);
    const mirror = invasionCandidates(s, WEEK + 3600000, WEEK)[0]!;
    const before = { ...s.currencies };
    const maps = s.materials.treasureMaps;
    const result = { winner, turns: 7, combatants: [], eventSummary: [], defeatedExternalIds: [],
      economy: { gold: 17, souls: 9, gems: 2, maps: 1 } } as unknown as Parameters<typeof settleInvasionBattle>[1];
    const out = settleInvasionBattle(s, result, mirror.id, WEEK + 3600000, WEEK, TODAY);
    if (!out.ok) throw new Error('Settlement failed');
    expect(out.battleRewards).toMatchObject(winner === 'player'
      ? { gold: 60, souls: 30, xpGained: 100, heroLevelsGained: 1 }
      : { gold: 20, souls: 10, xpGained: 20, heroLevelsGained: 0 });
    expect(s.currencies.gold - before.gold).toBe(out.battleRewards.gold + out.gold + 17);
    expect(s.currencies.souls - before.souls).toBe(out.battleRewards.souls + 9);
    expect(s.currencies.gems - before.gems).toBe(2);
    expect(s.materials.treasureMaps - maps).toBe(1);
    expect(s.hero.xp).toBe(20);
    expect(s.hero.level).toBe(winner === 'player' ? 2 : 1);
    expect(s.stats.battlesWon).toBe(winner === 'player' ? 1 : 0);
    expect(s.stats.battlesLost).toBe(winner === 'enemy' ? 1 : 0);
  });
  it('surrender still grants participation rewards but discards collected loot', () => {
    const s = save(1);
    ensureInvasionSeason(s, 0, WEEK);
    const mirror = invasionCandidates(s, WEEK + 3600000, WEEK)[0]!;
    const before = { ...s.currencies };
    const result = { winner: 'enemy', endReason: 'surrender', turns: 2, combatants: [], eventSummary: [],
      defeatedExternalIds: [], economy: { gold: 999, souls: 999, gems: 999, maps: 999 } } as unknown as Parameters<typeof settleInvasionBattle>[1];
    const out = settleInvasionBattle(s, result, mirror.id, WEEK + 3600000, WEEK, TODAY);
    expect(out).toMatchObject({ ok: true, collected: { gold: 0, souls: 0, gems: 0, maps: 0 },
      battleRewards: { xpGained: 20, gold: 20, souls: 10 } });
    expect(s.currencies.gold - before.gold).toBe(20);
    expect(s.currencies.souls - before.souls).toBe(10);
    expect(s.hero.xp).toBe(20);
  });
});
