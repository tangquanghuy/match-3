import { describe, it, expect } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { MAX_ASCENSION } from '../../src/meta/data/economy';
import { newSave, type MetaSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { EVENT_TYPES, EVENT_MILESTONES, EVENT_WEEKLY_GEM_CAP, EVENT_SHOP, WEEK_MS, type EventTypeId } from '../../src/meta/data/events';
import { ensureEventWeek, claimEventWeeklyGems, eventWeeklySummary, eventBattleReady, planEventEncounter,
  applyEventBattleModifiers, eventBattleProgress, abandonTowerRun, buyEventGoods } from '../../src/meta/systems/events';
import { buildBattleRequest, type BridgeOutcome } from '../../src/meta/systems/battleBridge';
import { applySettlement } from '../../src/meta/systems/settlement';
import { snapshotToCharacter } from '../../src/session/combatantMapping';
import type { BattleResult } from '../../src/session/contract';
import { eventDamageMultiplier, skullDamageMultiplier, attachPassives } from '../../src/engine/traits';
import { damageOne } from '../../src/engine/skills/effects/damage';
import { BaseColor, type Character } from '../../src/engine/types';
import { BUDGET_SCENARIOS, gemBudget, projectEventParticipation } from '../../src/meta/economy/gachaModel';

const WEEK = weekStartOf(new Date(2026, 8, 21, 12).getTime());
const fresh = () => {
  const save = newSave({ now: WEEK, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 1000, gems: 0 } });
  save.dailyFirstWinAt = WEEK; // 本套只核算活动，不混入每日首胜50。
  save.hero.level = 20; // 活动 20 级解锁
  return save;
};
let seed = 12000;
function battle(save: MetaSave, type: EventTypeId, choice?: string, week = WEEK): BridgeOutcome {
  const plan = planEventEncounter(save, week, ++seed, type, choice);
  const outcome = buildBattleRequest(save, plan);
  if (!outcome.ok) throw new Error(outcome.message);
  applyEventBattleModifiers(save, outcome);
  return outcome;
}
function result(outcome: BridgeOutcome, victory = true): BattleResult {
  const r = outcome.request;
  return {
    schemaVersion: r.schemaVersion, battleId: r.battleId, requestId: r.requestId, rulesetVersion: r.rulesetVersion,
    seed: r.seed, winner: victory ? 'player' : 'enemy', turns: 10, summonedCount: 0, actionLogDigest: '', eventSummary: [],
    combatants: [...r.playerTeam.map(s => ({ externalId: s.externalId, side: 'player' as const,
      hp: s.initialHp ?? s.stats.hp, maxHp: s.stats.hp, armor: s.stats.armor, defeated: false, statuses: [] })),
    ...r.enemyTeam.map(s => ({ externalId: s.externalId, side: 'enemy' as const,
      hp: victory ? 0 : s.initialHp ?? s.stats.hp, maxHp: s.stats.hp, armor: 0, defeated: victory, statuses: [] }))],
    defeatedExternalIds: victory ? r.enemyTeam.map(s => s.externalId) : [],
  };
}
function settle(save: MetaSave, out: BridgeOutcome, r = result(out), todayStart = WEEK) {
  return applySettlement(save, r, { plan: out.plan, enemyByExternalId: out.enemyByExternalId, todayStart });
}

describe('周常奖励账本与迁移', () => {
  it('六轨3600+共享1800+守土80，且同一周奖励领取幂等', () => {
    const s = fresh();
    for (const { id } of EVENT_TYPES) {
      const w = ensureEventWeek(s, WEEK, id); w.points = 1200; w.wins = 5; w.eventData.supplies = 84;
      claimEventWeeklyGems(s, WEEK, id);
      expect(EVENT_MILESTONES[id].reduce((n, m) => n + (m.gems ?? 0), 0)).toBe(600);
    }
    expect(eventWeeklySummary(s, WEEK)).toMatchObject({ wins: 30, earned: 1800 });
    expect(s.currencies.gems).toBe(5400);
    for (const { id } of EVENT_TYPES) expect(claimEventWeeklyGems(s, WEEK, id)).toEqual([]);
    expect(EVENT_WEEKLY_GEM_CAP).toBe(5480);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(claimEventWeeklyGems(loaded, WEEK, 'invasion')).toEqual([]);
    expect(eventWeeklySummary(loaded, WEEK).earned).toBe(1800);
    for (const { id } of EVENT_TYPES) {
      const w = ensureEventWeek(loaded, WEEK + WEEK_MS, id);
      expect(w).toMatchObject({ points: 0, wins: 0, tokens: 0, claimed: [], bought: {}, runTeam: null });
      expect(claimEventWeeklyGems(loaded, WEEK + WEEK_MS, id)).toEqual([]);
    }
    expect(eventWeeklySummary(loaded, WEEK + WEEK_MS).earned).toBe(0);
  });
  it('单独一个活动也可领取全部共享目标，不强制六活动全清', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'factionAssault');
    w.wins = 30; w.points = 3000;
    claimEventWeeklyGems(s, WEEK, 'factionAssault');
    expect(s.currencies.gems).toBe(2400);
    expect(eventWeeklySummary(s, WEEK).earned).toBe(1800);
  });
  it('旧档只补宝石差额，不重复发已领取材料，不丢购买记录', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'invasion');
    w.eventData = {}; w.points = 2200; w.claimed = [0, 1, 2, 3, 4, 5]; w.wins = 30;
    w.bought.invasion_celestial = 1; s.currencies.gems = 60;
    const before = structuredClone(s.materials);
    const out = battle(s, 'invasion'); settle(s, out, result(out, false));
    expect(s.currencies.gems).toBe(2400);
    expect(s.materials).toEqual(before);
    expect(w.bought.invasion_celestial).toBe(1);
    expect(claimEventWeeklyGems(s, WEEK, 'invasion')).toEqual([]);
  });
  it('真实结算达到直接宝石上限；重复战斗结果及读档重放不重复入账', () => {
    let s = fresh();
    for (const { id } of EVENT_TYPES) for (let i = 0; i < 14; i++) settle(s, battle(s, id));
    expect(s.currencies.gems).toBe(5480);
    const out = battle(s, 'invasion'); const r = result(out); settle(s, out, r);
    const before = JSON.stringify(s); settle(s, out, r); expect(JSON.stringify(s)).toBe(before);
    s = migrateSave(JSON.parse(before)); const loaded = JSON.stringify(s);
    settle(s, out, r); expect(JSON.stringify(s)).toBe(loaded);
  });
  it('跨周结束的旧战斗不回拨实例，也不重复发放周奖励', () => {
    const s = fresh(); const out = battle(s, 'invasion');
    ensureEventWeek(s, WEEK + WEEK_MS, 'invasion').points = 100;
    const before = JSON.stringify(s); settle(s, out, result(out), WEEK + WEEK_MS);
    expect(JSON.stringify(s)).toBe(before);
    const old = fresh(); const oldBattle = battle(old, 'invasion');
    settle(old, oldBattle, result(oldBattle), WEEK + WEEK_MS);
    expect(old.currencies.gems).toBe(0);
  });
  it('印记累计周上限360，消费后也不恢复额度，限量材料与余印金币分开', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'invasion');
    w.tokensEarned = 355; w.tokens = 100;
    settle(s, battle(s, 'invasion'));
    expect(w.tokensEarned).toBe(360); expect(w.tokens).toBe(105);
    const sink = EVENT_SHOP.invasion.find(g => g.id.endsWith('_surplus'))!;
    const gold = s.currencies.gold;
    expect(buyEventGoods(s, sink.id, WEEK, 'invasion').ok).toBe(true);
    expect(s.currencies.gold).toBe(gold + 150);
    settle(s, battle(s, 'invasion')); expect(w.tokens).toBe(95);
    for (const rows of Object.values(EVENT_SHOP)) for (const row of rows) {
      if (row.mats || row.classXp || row.troopRole) expect(row.stock).not.toBeNull();
    }
  });
});

describe('跨层队伍、营地和固定首领', () => {
  it('阵亡角色在第二、第三层保持阵亡，残血不覆盖最大生命，站位锁定', () => {
    const s = fresh(); const first = battle(s, 'towerOfDoom'); const r = result(first);
    const players = r.combatants.filter(c => c.side === 'player');
    players[0]!.hp = Math.max(1, Math.floor(players[0]!.maxHp / 2));
    players[1]!.hp = 0; players[1]!.defeated = true;
    eventBattleProgress(s, first.plan, r, true);
    const second = battle(s, 'towerOfDoom');
    expect(second.request.playerTeam).toHaveLength(3);
    const char = snapshotToCharacter(second.request.playerTeam[0]!, 0);
    expect(char.hp).toBe(players[0]!.hp); expect(char.maxHp).toBe(players[0]!.maxHp);
    eventBattleProgress(s, second.plan, result(second), true);
    const third = battle(s, 'towerOfDoom');
    expect(third.request.playerTeam).toHaveLength(3);
    expect(third.request.playerTeam.some(c => c.externalId === players[1]!.externalId)).toBe(false);
    expect(s.eventWeeks.towerOfDoom!.runTeam).toHaveLength(4);
    expect(eventBattleReady(s, 'towerOfDoom', false)).toBeNull();
    s.teams[0]!.members.reverse(); expect(eventBattleReady(s, 'towerOfDoom', false)).toContain('锁定');
  });
  it('营地只治疗存活成员，重复预览不叠加治疗，不超过最大生命', () => {
    const s = fresh(); battle(s, 'towerOfDoom'); const w = s.eventWeeks.towerOfDoom!;
    w.eventData.floor = 6;
    w.runTeam![0]!.hp = 1; w.runTeam![1]!.hp = 0; w.runTeam![1]!.defeated = true;
    const out = battle(s, 'towerOfDoom', 'rest'); const again = battle(s, 'towerOfDoom', 'rest');
    expect(out.request.playerTeam).toHaveLength(3);
    expect(out.request.playerTeam[0]!.initialHp).toBe(1 + Math.ceil(w.runTeam![0]!.maxHp * .35));
    expect(again.request.playerTeam.map(c => c.initialHp)).toEqual(out.request.playerTeam.map(c => c.initialHp));
    expect(w.runTeam![0]!.hp).toBe(1);
    expect(out.request.playerTeam.every(c => c.initialHp! <= c.stats.hp)).toBe(true);
    settle(s, out); expect(w.points).toBe(50);
  });
  it('网关拒绝非营地休整，且失败请求不创建登塔进行中状态', async () => {
    const gateway = new MockGateway(memoryStorage(), { now: () => WEEK }); await gateway.load();
    const out = await gateway.planEventBattle('towerOfDoom', 'rest');
    // 失败命令整体不落盘：连本周塔实例都不会被创建
    const save = gateway.current();
    expect(out.ok).toBe(false); expect(save.eventWeeks.towerOfDoom?.runTeam ?? null).toBeNull();
    expect(save.eventWeeks.towerOfDoom?.eventData.runActive ?? 0).toBe(0);
    expect(save.pendingBattle).toBeNull();
  });
  it('25层独立递增，5层一首领，周最高层补差，重复登塔不重复发符卷', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    let level = 0;
    for (let i = 1; i <= 25; i++) {
      const out = battle(s, 'towerOfDoom');
      expect(out.plan.enemies[0]!.level).toBeGreaterThan(level); level = out.plan.enemies[0]!.level;
      expect(out.plan.enemies.some(e => e.tier === 'boss')).toBe(i % 5 === 0);
      eventBattleProgress(s, out.plan, result(out), true);
    }
    expect(w.eventData).toMatchObject({ floorBest: 25, towerPaidFloors: 25, runActive: 0 });
    expect(s.materials.forgeScrolls).toBe(5); expect(s.currencies.glory).toBe(50);
    for (let i = 1; i <= 5; i++) { const out = battle(s, 'towerOfDoom'); eventBattleProgress(s, out.plan, result(out), true); }
    expect(abandonTowerRun(s, WEEK)).toMatchObject({ ok: true, glory: 0, scrolls: 0 });
    expect(s.materials.forgeScrolls).toBe(5);
  });
  it('首领/护卫同阶固定、血池真实进入战斗；败场只计首领净伤害，半血狂暴', () => {
    const s = fresh(); const first = battle(s, 'raidBoss'); const second = battle(s, 'raidBoss');
    expect(first.plan.enemies).toEqual(second.plan.enemies);
    const w = s.eventWeeks.raidBoss!; const max = w.eventData.bossMax!;
    expect(first.request.enemyTeam[0]!.stats.hp).toBe(max);
    const r = result(first, false); const boss = r.combatants.find(c => c.side === 'enemy')!;
    boss.hp = Math.floor(max / 2); eventBattleProgress(s, first.plan, r, false);
    expect(w.eventData.bossHp).toBe(Math.floor(max / 2));
    const third = battle(s, 'raidBoss'); const b = snapshotToCharacter(third.request.enemyTeam[0]!, 4);
    expect(b.hp).toBe(boss.hp); expect(b.maxHp).toBe(max); expect(b.eventTarget).toBe('boss');
    expect(third.request.enemyTeam[0]!.stats.attack).toBe(Math.round(first.request.enemyTeam[0]!.stats.attack * 1.3));
    eventBattleProgress(s, third.plan, result(third), true); expect(w.eventData.bossTier).toBe(2);
  });
  it('阵营迂回影响下一据点，三据点循环；世界事件路线和编队加成快照生效', () => {
    const s = fresh(); const first = battle(s, 'factionAssault', 'flank');
    eventBattleProgress(s, first.plan, result(first), true);
    const second = battle(s, 'factionAssault', 'siege');
    const original = buildBattleRequest(s, second.plan); if (!original.ok) throw Error(original.message);
    expect(second.request.enemyTeam.map(c => c.stats.armor)).toEqual(original.request.enemyTeam.map(c => Math.floor(c.stats.armor / 2)));
    eventBattleProgress(s, second.plan, result(second), true);
    expect(battle(s, 'factionAssault').plan.enemies.some(e => e.tier === 'boss')).toBe(true);
    const world = battle(s, 'worldEvent', 'escort');
    if (world.plan.source.kind === 'event') world.plan.source.matchingTroops = 4;
    s.teams[0]!.members = []; eventBattleProgress(s, world.plan, result(world), true);
    expect(s.eventWeeks.worldEvent!.eventData.supplies).toBeGreaterThanOrEqual(14);
    expect(s.eventWeeks.worldEvent!.eventData.supplies).toBeLessThanOrEqual(16);
  });
});

function char(id: number, overrides: Partial<Character> = {}): Character {
  return { id, name: `C${id}`, maxHp: 1000, hp: 1000, armor: 0, attack: 10, magic: 10,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: '', statuses: [], defeated: false, ...overrides };
}
describe('专精和宝石抽卡模型', () => {
  it('真实出战使用基础品质加晋升：满晋升可达5倍，未解锁特质仍无加成', () => {
    const specialist = TROOPS.find(t => t.traits.some(trait => trait.code === 'godslayer'))!;
    const s = newSave({ now: WEEK, starterTroopIds: [specialist.id, 6000, 6097] });
    const rec = s.collection[String(specialist.id)]!;
    rec.ascension = MAX_ASCENSION;
    rec.traits = [true, true, true];
    const out = battle(s, 'raidBoss');
    const snap = out.request.playerTeam.find(c => c.templateId === String(specialist.id))!;
    expect(snap.eventRarity).toBe(5);
    const attacker = snapshotToCharacter(snap, 0); attachPassives(attacker);
    const target = snapshotToCharacter(out.request.enemyTeam[0]!, 4);
    expect(eventDamageMultiplier(attacker, target)).toBe(5);
    rec.ascension = 0;
    const base = battle(s, 'raidBoss').request.playerTeam.find(c => c.templateId === String(specialist.id))!;
    expect(base.eventRarity).toBe(specialist.rarityIdx);
    rec.traits = [false, false, false];
    const locked = snapshotToCharacter(battle(s, 'raidBoss').request.playerTeam.find(c => c.templateId === String(specialist.id))!, 0);
    attachPassives(locked);
    expect(eventDamageMultiplier(locked, target)).toBe(1);
  });

  it.each([['godslayer', 'boss'], ['siegebreaker', 'tower']] as const)('%s只加成明确活动目标，骷髅与法术相同，昏迷与锁定特质不加成', (trait, target) => {
    const attacker = char(0, { traitIds: [trait], eventRarity: 0 }); attachPassives(attacker);
    const boss = char(1, { eventTarget: target });
    expect(eventDamageMultiplier(attacker, boss)).toBe(3); expect(skullDamageMultiplier(attacker, boss)).toBe(3);
    attacker.eventRarity = 5; expect(eventDamageMultiplier(attacker, boss)).toBe(5);
    damageOne(boss, 0, 10, false, 'single', undefined, attacker); expect(boss.hp).toBe(950);
    expect(eventDamageMultiplier(attacker, char(2))).toBe(1);
    expect(eventDamageMultiplier(char(3), boss)).toBe(1);
    attacker.statuses = [{ id: 'stun', turns: 2 }]; expect(eventDamageMultiplier(attacker, boss)).toBe(1);
  });
  it('参与场次映射奖励、共享目标和时长；与运行表一致且避免重复计入', () => {
    expect(projectEventParticipation('invasion', { wins: 5 })).toMatchObject({ metric: 500, gems: 450, minutes: 15 });
    expect(projectEventParticipation('invasion', { wins: 8, route: 'risk' }).gems).toBe(600);
    expect(projectEventParticipation('classTrials', { wins: 4, streakLength: 4 }).metric).toBe(590);
    expect(projectEventParticipation('classTrials', { wins: 4, streakLength: 4, route: 'risk' }).metric).toBe(728);
    expect(projectEventParticipation('worldEvent', { wins: 4, matchingTroops: 4, route: 'risk' }).gems).toBe(600);
    expect(gemBudget(BUDGET_SCENARIOS.weeklyFull!).events).toBe(5480);
    expect(gemBudget(BUDGET_SCENARIOS.weeklyStandard!).events).toBe(3960);
    expect(gemBudget(BUDGET_SCENARIOS.weeklyLight!).events).toBe(1640);
    expect(() => gemBudget({ ...BUDGET_SCENARIOS.weeklyLight!, eventPoints: { invasion: 100 } })).toThrow();
    expect(() => projectEventParticipation('invasion', { wins: 1, route: 'invalid' as 'risk' })).toThrow();
  });
});
