/**
 * 六个活动的独立玩法状态机（2026-09-29 玩法重做）。
 */
import { describe, it, expect } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { MockGateway, memoryStorage } from '../../src/meta/gateway/mockGateway';
import { EVENT_TYPES, EVENT_UNLOCK_HERO_LEVEL, WEEK_MS } from '../../src/meta/data/events';
import {
  abandonTowerRun, currentEventTheme, ensureEventWeek, eventAction, eventBattlePoints, eventBattleProgress, eventBattleReady,
  eventMetricOf, eventModeState, planEventEncounter,
} from '../../src/meta/systems/events';
import { generateTowerMap, towerFloorOf, towerReachable, TOWER_FLOORS } from '../../src/meta/systems/eventModes/tower';
import { TOWER_LANES, TOWER_ZONES } from '../../src/meta/data/towerData';
import { RAID_FATIGUE_ATTACK, raidPhaseOf, raidPoolOf, raidWeakColor } from '../../src/meta/systems/eventModes/raid';
import { INVASION_CITY_MAX, SQUAD_INFO } from '../../src/meta/systems/eventModes/invasion';
import { FACTION_COUNTER_EVERY, factionTargets } from '../../src/meta/systems/eventModes/faction';
import { BOARD_SIZE } from '../../src/meta/systems/eventModes/world';
import { TRIALS_PER_WEEK, evaluateGoals, trialById } from '../../src/meta/systems/eventModes/trials';
import { buildBattleRequest } from '../../src/meta/systems/battleBridge';
import { getTroopById } from '../../src/data/troops';
import type { EncounterPlan } from '../../src/meta/systems/encounter';
import { eventBattle, fakeResult, settleEvent, towerNextBattle } from './helpers/eventDriver';

const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
const fresh = () => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 1000 } });
  s.hero.level = EVENT_UNLOCK_HERO_LEVEL;
  return s;
};

describe('平台：玩法状态建档与存档往返', () => {
  it('六活动各自建档独立状态，存档往返后状态不变，坏状态重建', () => {
    const s = fresh();
    for (const { id } of EVENT_TYPES) expect(ensureEventWeek(s, WEEK, id).mode).toBeTruthy();
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)));
    for (const { id } of EVENT_TYPES) {
      expect(JSON.stringify(ensureEventWeek(loaded, WEEK, id).mode)).toBe(JSON.stringify(s.eventWeeks[id]!.mode));
    }
    loaded.eventWeeks.invasion!.mode = { v: 1, squads: 'broken' };
    const raw = migrateSave(JSON.parse(JSON.stringify(loaded)));
    expect(eventModeState(raw, WEEK, 'invasion').squads.length).toBeGreaterThan(0);
  });

  it('非战斗动作失败时存档不变', () => {
    const s = fresh();
    ensureEventWeek(s, WEEK, 'worldEvent');
    const before = JSON.stringify(s);
    expect(eventAction(s, WEEK, 'worldEvent', 'roll', 1)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('网关：六页都能规划出属于自己活动的战斗（塔需先开始登塔）', async () => {
    const gateway = new MockGateway(memoryStorage());
    const { save } = await gateway.load();
    save.hero.level = EVENT_UNLOCK_HERO_LEVEL;
    save.hero.classId = save.hero.unlockedClasses[0] ?? save.hero.classId;
    const towerBlocked = await gateway.planEventBattle(0, WEEK, 'towerOfDoom', 'go:0-0');
    expect(towerBlocked.ok).toBe(false);
    const action = towerNextBattle(save, WEEK);
    const planned = await gateway.planEventBattle(0, WEEK, 'towerOfDoom', action);
    expect(planned.ok).toBe(true);
    for (const id of ['invasion', 'raidBoss', 'factionAssault', 'worldEvent'] as const) {
      const p = await gateway.planEventBattle(0, WEEK, id);
      expect(p.ok, id).toBe(true);
      if (p.ok) expect(p.plan.source).toMatchObject({ kind: 'event', weekStart: WEEK, typeId: id });
    }
  });
});

describe('末日之塔 · 肉鸽爬塔', () => {
  it('地图：三区 8/8/9 行、末行唯一首领、每行节点都可达、边不交叉、节点类型约束', () => {
    expect(TOWER_ZONES.reduce((n, z) => n + z.rows, 0)).toBe(TOWER_FLOORS);
    for (let seed = 1; seed < 40; seed++) {
      for (let zone = 0; zone < 3; zone++) {
        const rows = generateTowerMap(seed, zone);
        expect(rows).toHaveLength(TOWER_ZONES[zone]!.rows);
        expect(rows.at(-1)).toHaveLength(1);
        expect(rows.at(-1)![0]!.kind).toBe('boss');
        expect(rows[0]!.every((n) => n.kind === 'battle')).toBe(true);
        expect(rows.at(-2)!.every((n) => n.kind === 'camp')).toBe(true);
        for (let r = 1; r < rows.length; r++) {
          for (const node of rows[r]!) expect(rows[r - 1]!.some((p) => p.next.includes(node.col)), `${seed}/${zone}/${r}`).toBe(true);
        }
        for (let r = 0; r < rows.length - 1; r++) {
          for (const a of rows[r]!) for (const b of rows[r]!) {
            if (a.col >= b.col) continue;
            // a 在左 b 在右：a 的目标列不能大于 b 的目标列（否则交叉）
            for (const ta of a.next) for (const tb of b.next) expect(ta <= tb, `交叉 ${seed}/${zone}/${r}`).toBe(true);
          }
          for (const n of rows[r]!) expect(n.col).toBeLessThan(TOWER_LANES);
        }
        const kinds = rows.flat().map((n) => n.kind);
        expect(kinds).toContain('elite');
        expect(kinds).toContain('merchant');
        expect(kinds).toContain('treasure');
        expect(rows[0]!.concat(rows[1]!).some((n) => n.kind === 'elite' || n.kind === 'merchant')).toBe(false);
      }
    }
  });

  it('开跑锁定队伍 + 开局祝福；只能走相邻节点；战斗胜利后三选一再前进', () => {
    const s = fresh();
    expect(eventAction(s, WEEK, 'towerOfDoom', 'start', 7).ok).toBe(true);
    const state = eventModeState(s, WEEK, 'towerOfDoom');
    expect(state.run!.pending?.kind).toBe('blessing');
    expect(s.eventWeeks.towerOfDoom!.runTeam!.length).toBe(4);
    // 未处理祝福前不能出发
    const first = state.run!.rows[0]![0]!;
    expect(planEventEncounter(s, WEEK, 1, 'towerOfDoom', `go:0-${first.col}`)).toMatchObject({ ok: false });
    expect(eventAction(s, WEEK, 'towerOfDoom', 'pick:0', 8).ok).toBe(true);
    // 跳层不可达
    const far = state.run!.rows[2]![0]!;
    expect(planEventEncounter(s, WEEK, 1, 'towerOfDoom', `go:2-${far.col}`)).toMatchObject({ ok: false });
    const out = eventBattle(s, 'towerOfDoom', WEEK, `go:0-${first.col}`);
    expect(out.request.enemyTeam.every((e) => e.eventTarget === 'tower')).toBe(true);
    settleEvent(s, out, fakeResult(out), WEEK);
    const run = eventModeState(s, WEEK, 'towerOfDoom').run!;
    expect(run.floor).toBe(1);
    expect(run.gold).toBeGreaterThan(0);
    expect(run.pending?.kind).toBe('reward');
    expect(towerReachable(run)).toHaveLength(0);
    expect(eventAction(s, WEEK, 'towerOfDoom', 'pick:0', 9).ok).toBe(true);
    const next = towerReachable(eventModeState(s, WEEK, 'towerOfDoom').run!);
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((n) => n.row === 1 && first.next.includes(n.col))).toBe(true);
  });

  it('生命跨层按比例延续、阵亡者不再出战；遗物进入战斗快照', () => {
    const s = fresh();
    const a1 = towerNextBattle(s, WEEK);
    const out = eventBattle(s, 'towerOfDoom', WEEK, a1);
    const r = fakeResult(out);
    const players = r.combatants.filter((c) => c.side === 'player');
    players[0]!.hp = Math.floor(players[0]!.maxHp / 2);
    players[1]!.hp = 0; players[1]!.defeated = true;
    settleEvent(s, out, r, WEEK);
    const run = eventModeState(s, WEEK, 'towerOfDoom').run!;
    run.relics.push('ember_sigil', 'ambush_horn');
    const a2 = towerNextBattle(s, WEEK);
    const base = buildBattleRequest(s, planEventEncounter(s, WEEK, 99, 'towerOfDoom', a2) as EncounterPlan);
    const out2 = eventBattle(s, 'towerOfDoom', WEEK, a2);
    expect(out2.request.playerTeam).toHaveLength(3);
    expect(out2.request.playerTeam.some((p) => p.externalId === players[1]!.externalId)).toBe(false);
    const snap = out2.request.playerTeam.find((p) => p.externalId === players[0]!.externalId)!;
    expect(snap.initialHp! / snap.stats.hp).toBeLessThan(0.75);
    if (base.ok) {
      const baseSnap = base.request.playerTeam.find((p) => p.externalId === snap.externalId)!;
      expect(snap.stats.attack).toBeGreaterThanOrEqual(baseSnap.stats.attack + 4 + run.bonus.attack);
    }
    expect(out2.request.enemyTeam.every((e) => e.initialHp! < e.stats.hp)).toBe(true);
  });

  it('营地、商人、奇遇、放弃结算', () => {
    const s = fresh();
    eventAction(s, WEEK, 'towerOfDoom', 'start', 3);
    eventAction(s, WEEK, 'towerOfDoom', 'pick:0', 3);
    const run = eventModeState(s, WEEK, 'towerOfDoom').run!;
    const team = s.eventWeeks.towerOfDoom!.runTeam!;
    team[0]!.hp = 1; team[1]!.hp = 0; team[1]!.defeated = true;
    run.pending = { kind: 'camp' };
    expect(eventAction(s, WEEK, 'towerOfDoom', 'camp:revive', 1).ok).toBe(true);
    expect(team[1]!.defeated).toBe(false);
    run.gold = 200;
    run.pending = { kind: 'merchant', stock: [{ relic: 'curse_doll', price: 110, sold: false }], healUsed: false, purgeUsed: false };
    expect(eventAction(s, WEEK, 'towerOfDoom', 'buy:0', 1).ok).toBe(true);
    expect(run.relics).toContain('curse_doll');
    expect(run.gold).toBe(90);
    expect(eventAction(s, WEEK, 'towerOfDoom', 'buy:0', 1)).toMatchObject({ ok: false, code: 'SOLD_OUT' });
    expect(eventAction(s, WEEK, 'towerOfDoom', 'buy:heal', 1)).toMatchObject({ ok: true });
    expect(eventAction(s, WEEK, 'towerOfDoom', 'buy:purge', 1)).toMatchObject({ ok: false });
    expect(eventAction(s, WEEK, 'towerOfDoom', 'leave', 1).ok).toBe(true);
    // 失败动作会整体回滚玩法状态：重新取当前 run
    const live = eventModeState(s, WEEK, 'towerOfDoom').run!;
    live.pending = { kind: 'event', event: 'cursed_chest' };
    expect(eventAction(s, WEEK, 'towerOfDoom', 'event:0', 1).ok).toBe(true);
    expect(live.relics).toContain('curse_frailty');
    live.floor = 11;
    const glory = s.currencies.glory;
    expect(abandonTowerRun(s, WEEK)).toMatchObject({ ok: true, floorReached: 11, glory: 22, scrolls: 2 });
    expect(s.currencies.glory).toBe(glory + 22);
    expect(eventModeState(s, WEEK, 'towerOfDoom').run).toBeNull();
    expect(s.eventWeeks.towerOfDoom!.runTeam).toBeNull();
    expect(abandonTowerRun(s, WEEK)).toMatchObject({ ok: false });
  });

  it('战败结束本轮，按已通过层结算；击败首领进入下一区新地图', () => {
    const s = fresh();
    const out = eventBattle(s, 'towerOfDoom', WEEK);
    settleEvent(s, out, fakeResult(out), WEEK);
    const run = eventModeState(s, WEEK, 'towerOfDoom').run!;
    eventAction(s, WEEK, 'towerOfDoom', 'skip', 1);
    // 直接跳到本区首领前一层
    const bossRow = run.rows.length - 1;
    const camp = run.rows[bossRow - 1]![0]!;
    run.at = { row: camp.row, col: camp.col };
    run.floor = towerFloorOf(0, camp.row);
    const boss = eventBattle(s, 'towerOfDoom', WEEK, `go:${bossRow}-${run.rows[bossRow]![0]!.col}`);
    expect(boss.plan.enemies.some((e) => e.tier === 'boss')).toBe(true);
    settleEvent(s, boss, fakeResult(boss), WEEK);
    expect(run.pending).toMatchObject({ kind: 'reward', source: 'boss' });
    expect(eventAction(s, WEEK, 'towerOfDoom', 'pick:0', 1).ok).toBe(true);
    expect(run.zone).toBe(1);
    expect(run.at).toBeNull();
    const again = eventBattle(s, 'towerOfDoom', WEEK);
    settleEvent(s, again, fakeResult(again, false), WEEK);
    expect(eventModeState(s, WEEK, 'towerOfDoom').run).toBeNull();
    expect(s.eventWeeks.towerOfDoom!.eventData.floorBest).toBeGreaterThanOrEqual(TOWER_ZONES[0]!.rows);
  });
});

describe('突袭首领 · 阶段与疲惫', () => {
  it('血池跨场保留、阶段切换清疲劳、疲惫与破绽改面板、讨伐刷新下一阶', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'raidBoss');
    expect(state.max).toBe(raidPoolOf(1));
    const out = eventBattle(s, 'raidBoss', WEEK);
    expect(out.request.enemyTeam[0]!.eventTarget).toBe('boss');
    expect(out.request.enemyTeam[0]!.initialHp).toBe(state.max);
    const r = fakeResult(out, false);
    const boss = r.combatants.find((c) => c.side === 'enemy')!;
    boss.hp = state.max - 50;
    expect(eventBattlePoints(s, out.plan, r, false)).toBeGreaterThan(0);
    settleEvent(s, out, r, WEEK);
    expect(state.hp).toBe(state.max - 50);
    expect(state.fatigue.length).toBe(3);
    // 疲惫：同阶段再战攻击 -40%
    const fresh2 = buildBattleRequest(s, planEventEncounter(s, WEEK, 5, 'raidBoss') as EncounterPlan);
    const tired = eventBattle(s, 'raidBoss', WEEK);
    const weak = raidWeakColor(WEEK);
    if (fresh2.ok) {
      const troopSnap = tired.request.playerTeam.find((p) => !p.externalId.endsWith('-hero'))!;
      const baseSnap = fresh2.request.playerTeam.find((p) => p.externalId === troopSnap.externalId)!;
      const mult = (1 + RAID_FATIGUE_ATTACK + (troopSnap.manaColors.includes(weak) ? 0.3 : 0));
      expect(troopSnap.stats.attack).toBe(Math.max(0, Math.round(baseSnap.stats.attack * mult)));
    }
    // 打进二阶段：疲劳清空
    const r2 = fakeResult(tired, false);
    r2.combatants.find((c) => c.side === 'enemy')!.hp = Math.floor(state.max * 0.5);
    settleEvent(s, tired, r2, WEEK);
    expect(raidPhaseOf(state.hp, state.max)).toBe(1);
    expect(state.fatigue).toEqual([]);
    // 讨伐
    state.hp = 1;
    const kill = eventBattle(s, 'raidBoss', WEEK);
    expect(kill.request.enemyTeam).toHaveLength(4); // 绝境增援
    settleEvent(s, kill, fakeResult(kill), WEEK);
    expect(state).toMatchObject({ tier: 2, slain: 1, fatigue: [] });
    expect(state.max).toBe(raidPoolOf(2));
  });
});

describe('入侵 · 三路兵线', () => {
  it('截击歼灭目标、其余兵团推进、抵达王都扣城防、清空一波 = 守土成功', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'invasion');
    const theme = currentEventTheme(WEEK, 'invasion');
    expect(state.squads).toHaveLength(3);
    for (const sq of state.squads) for (const id of sq.troops) expect(getTroopById(id)!.kingdom).toBe(theme.kingdom);
    const target = state.squads.find((x) => x.kind === 'siege')!;
    const others = state.squads.filter((x) => x.id !== target.id).map((x) => ({ id: x.id, dist: x.dist }));
    const out = eventBattle(s, 'invasion', WEEK, `squad:${target.id}`);
    expect(out.request.enemyTeam.every((e) => e.initialHp! < e.stats.hp)).toBe(true); // 先机
    expect(eventBattlePoints(s, out.plan, fakeResult(out), true)).toBe(120);
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(state.squads.some((x) => x.id === target.id)).toBe(false);
    for (const o of others) expect(state.squads.find((x) => x.id === o.id)!.dist).toBe(o.dist - 1);
    // 输两场：掠袭骑抵达王都
    for (let i = 0; i < 2; i++) { const lose = eventBattle(s, 'invasion', WEEK, `squad:${state.squads[0]!.id}`); settleEvent(s, lose, fakeResult(lose, false), WEEK); }
    expect(state.city).toBeLessThan(INVASION_CITY_MAX);
    // 清空本波
    const gems = s.currencies.gems;
    while (state.wave === 1 && state.squads.length) { const w = eventBattle(s, 'invasion', WEEK); settleEvent(s, w, fakeResult(w), WEEK); }
    expect(state.wave).toBe(2);
    expect(state.repelled).toBe(1);
    expect(state.squads.length).toBe(4);
    expect(state.squads.some((x) => x.kind === 'warlord')).toBe(true);
    expect(s.currencies.gems).toBeGreaterThan(gems);
    expect(state.city).toBe(INVASION_CITY_MAX);
  });

  it('城破：本波重来且不发守土奖励', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'invasion');
    state.city = 1;
    state.squads = [{ id: 99, lane: 0, dist: 1, kind: 'raider', troops: state.squads[0]!.troops }, { id: 98, lane: 1, dist: 4, kind: 'siege', troops: state.squads[2]!.troops }];
    const out = eventBattle(s, 'invasion', WEEK, 'squad:98');
    settleEvent(s, out, fakeResult(out, false), WEEK);
    expect(state.fallen).toBe(1);
    expect(state.wave).toBe(1);
    expect(state.city).toBe(INVASION_CITY_MAX);
    expect(state.repelled).toBe(0);
    expect(SQUAD_INFO.warlord.damage).toBe(2);
  });
});

describe('阵营突袭 · 领地征服', () => {
  it('只能进攻边境/相邻地块；占领叠加战区加成；每 4 场反扑；王城需要内应', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'factionAssault');
    expect(factionTargets(state).every((d) => d.x === 0)).toBe(true);
    expect(planEventEncounter(s, WEEK, 1, 'factionAssault', 'tile:3-1')).toMatchObject({ ok: false });
    const barracks = state.districts.find((d) => d.x === 0)!;
    barracks.kind = 'barracks';
    const before = buildBattleRequest(s, planEventEncounter(s, WEEK, 2, 'factionAssault', `tile:0-${barracks.y}`) as EncounterPlan);
    const out = eventBattle(s, 'factionAssault', WEEK, `tile:0-${barracks.y}`);
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(barracks.owner).toBe('player');
    expect(factionTargets(state).some((d) => d.x === 1 && d.y === barracks.y)).toBe(true);
    const after = eventBattle(s, 'factionAssault', WEEK, `tile:1-${barracks.y}`);
    if (before.ok) expect(after.request.playerTeam[0]!.stats.attack).toBeGreaterThanOrEqual(before.request.playerTeam[0]!.stats.attack + 3);
    expect(state.counterIn).toBe(FACTION_COUNTER_EVERY - 1);
    for (let i = 0; i < 3; i++) { const lose = eventBattle(s, 'factionAssault', WEEK, `tile:1-${barracks.y}`); settleEvent(s, lose, fakeResult(lose, false), WEEK); }
    expect(barracks.owner).toBe('enemy'); // 反扑夺回
    for (const d of state.districts) if (d.kind !== 'capital') d.owner = 'player';
    expect(eventBattleReady(s, 'factionAssault', true, 'tile:3-1', WEEK)).toContain('内应');
  });
});

describe('世界事件 · 庆典棋盘', () => {
  it('胜利换骰子、掷骰前进领奖、绕圈加成；里程碑按物资', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'worldEvent');
    expect(state.board).toHaveLength(BOARD_SIZE);
    expect(state.board[0]).toBe('start');
    const out = eventBattle(s, 'worldEvent', WEEK, 'escort');
    settleEvent(s, out, fakeResult(out), WEEK);
    expect(state.dice).toBe(2);
    const lose = eventBattle(s, 'worldEvent', WEEK, 'survey');
    settleEvent(s, lose, fakeResult(lose, false), WEEK);
    expect(state.dice).toBe(2);
    expect(eventAction(s, WEEK, 'worldEvent', 'roll', 11).ok).toBe(true);
    expect(state.pos).toBeGreaterThan(0);
    expect(state.dice).toBe(1);
    state.lucky = 1;
    state.pos = BOARD_SIZE - 2;
    const supplies = state.supplies;
    expect(eventAction(s, WEEK, 'worldEvent', 'lucky:3', 12).ok).toBe(true);
    expect(state.laps).toBe(1);
    expect(state.supplies).toBeGreaterThanOrEqual(supplies + 6 - 2);
    expect(eventMetricOf(s, WEEK, 'worldEvent')).toEqual({ label: '物资', value: state.supplies });
  });
});

describe('职业试炼 · 规则挑战', () => {
  it('每周 8 道试炼；规则改写战斗；新星才给大额积分', () => {
    const s = fresh();
    const state = eventModeState(s, WEEK, 'classTrials');
    expect(state.trials).toHaveLength(TRIALS_PER_WEEK);
    expect(new Set(state.trials).size).toBe(TRIALS_PER_WEEK);
    const soloId = state.trials.includes('solo') ? 'solo' : null;
    if (soloId) {
      const solo = eventBattle(s, 'classTrials', WEEK, 'trial:solo');
      expect(solo.request.playerTeam.every((p) => p.externalId.endsWith('-hero'))).toBe(true);
    }
    const id = state.trials[0]!;
    const out = eventBattle(s, 'classTrials', WEEK, `trial:${id}`);
    const r = fakeResult(out, true, 5);
    const got = evaluateGoals(trialById(id)!, r);
    const first = eventBattlePoints(s, out.plan, r, true);
    expect(first).toBe(30 + 50 * got.filter(Boolean).length);
    eventBattleProgress(s, out.plan, r, true);
    expect(eventBattlePoints(s, out.plan, r, true)).toBe(30);
    expect(evaluateGoals(trialById(id)!, fakeResult(out, false))).toEqual([false, false, false]);
  });
});
