import { describe, it, expect } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { MAX_ASCENSION } from '../../src/meta/data/economy';
import { newSave, type MetaSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { EVENT_TYPES, EVENT_MILESTONES, EVENT_MILESTONE_CURRENCY_BONUS, EVENT_SHARED_GOALS, EVENT_WEEKLY_GEM_CAP, EVENT_SHOP, WEEK_MS, type EventTypeId } from '../../src/meta/data/events';
import { ensureEventWeek, claimEventMilestones, claimEventWeeklyGems, eventWeeklySummary, eventModeState, buyEventGoods } from '../../src/meta/systems/events';
import type { BridgeOutcome } from '../../src/meta/systems/battleBridge';
import { snapshotToCharacter } from '../../src/session/combatantMapping';
import { eventBattle, fakeResult, rollAll, settleEvent } from './helpers/eventDriver';
import type { BattleResult } from '../../src/session/contract';
import { eventDamageMultiplier, skullDamageMultiplier, attachPassives } from '../../src/engine/traits';
import { damageOne } from '../../src/engine/skills/effects/damage';
import { BaseColor, type Character } from '../../src/engine/types';
import { BUDGET_SCENARIOS, gemBudget, projectEventParticipation } from '../../src/meta/economy/gachaModel';

const WEEK = weekStartOf(new Date(2026, 8, 21, 12).getTime());
const fresh = () => {
  const save = newSave({ now: WEEK, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 1000, gems: 0 } });
  save.dailyFirstWinAt = WEEK; // 本套只核算活动，不混入每日首胜。
  save.hero.level = 20; // 活动 20 级解锁
  return save;
};
function battle(save: MetaSave, type: EventTypeId, action?: string, week = WEEK): BridgeOutcome {
  return eventBattle(save, type, week, action);
}
const result = (outcome: BridgeOutcome, victory = true): BattleResult => fakeResult(outcome, victory);
/** 额外奖励（battle-bonus）的钻石是低概率惊喜，不计入周活动宝石预算 */
let bonusGems = 0;
function settle(save: MetaSave, out: BridgeOutcome, r = result(out), todayStart = WEEK) {
  const detail = settleEvent(save, out, r, todayStart);
  for (const l of detail.lines) if (l.key === 'battle-bonus') bonusGems += l.deltas.gems ?? 0;
  if (out.plan.source.kind === 'event' && out.plan.source.typeId === 'worldEvent' && todayStart < WEEK + WEEK_MS) rollAll(save, WEEK);
  return detail;
}

describe('周常奖励账本与迁移', () => {
  it('六条活动轨与共享胜场的额外金币、灵魂预算逐档入账', () => {
    const bonusGold = EVENT_MILESTONE_CURRENCY_BONUS.gold.reduce((sum, n) => sum + n, 0);
    const bonusSouls = EVENT_MILESTONE_CURRENCY_BONUS.souls.reduce((sum, n) => sum + n, 0);
    expect(bonusGold).toBe(3900);
    expect(bonusSouls).toBe(1750);
    expect(EVENT_TYPES.length * bonusGold + EVENT_SHARED_GOALS.reduce((sum, goal) => sum + goal.gold, 0)).toBe(26_400);
    expect(EVENT_TYPES.length * bonusSouls + EVENT_SHARED_GOALS.reduce((sum, goal) => sum + goal.souls, 0)).toBe(12_000);
    for (const { id } of EVENT_TYPES) for (const milestone of EVENT_MILESTONES[id]) {
      expect(milestone.gold).toBeGreaterThan(0);
      expect(milestone.souls).toBeGreaterThan(0);
    }
  });

  it('新达成里程碑领取全额，旧周已领档位只补新增货币且不重复入账', () => {
    const freshSave = fresh();
    const week = ensureEventWeek(freshSave, WEEK, 'invasion');
    week.points = 1200;
    const before = { ...freshSave.currencies };
    claimEventMilestones(freshSave, WEEK, 'invasion');
    claimEventWeeklyGems(freshSave, WEEK, 'invasion');
    expect(freshSave.currencies.gold - before.gold).toBe(EVENT_MILESTONES.invasion.reduce((sum, m) => sum + (m.gold ?? 0), 0));
    expect(freshSave.currencies.souls - before.souls).toBe(EVENT_MILESTONES.invasion.reduce((sum, m) => sum + (m.souls ?? 0), 0));
    expect(claimEventWeeklyGems(freshSave, WEEK, 'invasion')).toEqual([]);

    const oldSave = fresh();
    const oldWeek = ensureEventWeek(oldSave, WEEK, 'invasion');
    oldWeek.points = 1200;
    oldWeek.claimed = [0, 1, 2, 3, 4, 5];
    oldWeek.wins = 30;
    oldWeek.eventData = Object.fromEntries(EVENT_SHARED_GOALS.map((_, i) => [`sharedClaim${i}`, 1]));
    const oldBefore = { ...oldSave.currencies };
    claimEventWeeklyGems(oldSave, WEEK, 'invasion');
    expect(oldSave.currencies.gold - oldBefore.gold).toBe(3900 + 3000);
    expect(oldSave.currencies.souls - oldBefore.souls).toBe(1750 + 1500);
    expect(claimEventWeeklyGems(oldSave, WEEK, 'invasion')).toEqual([]);
  });
  it('旧档已领周活动奖励在读档时补发，重复读档不重发', () => {
    const old = fresh();
    const week = ensureEventWeek(old, WEEK, 'invasion');
    week.claimed = [0, 2];
    week.eventData.gemPaid0 = 150;
    week.eventData.gemPaid2 = 150;
    week.eventData.sharedClaim0 = 1;
    const loaded = migrateSave(JSON.parse(JSON.stringify(old)));
    expect(loaded.currencies.gold - old.currencies.gold).toBe(200 + 500 + EVENT_SHARED_GOALS[0]!.gold);
    expect(loaded.currencies.souls - old.currencies.souls).toBe(100 + 200 + EVENT_SHARED_GOALS[0]!.souls);
    expect(migrateSave(JSON.parse(JSON.stringify(loaded))).currencies).toEqual(loaded.currencies);
    expect(claimEventWeeklyGems(loaded, WEEK, 'invasion')).toEqual([]);
  });
  it('六轨3600+共享1800+守土80，且同一周奖励领取幂等', () => {
    const s = fresh();
    for (const { id } of EVENT_TYPES) {
      const w = ensureEventWeek(s, WEEK, id); w.points = 1200; w.wins = 5;
      if (id === 'worldEvent') eventModeState(s, WEEK, 'worldEvent').supplies = 84;
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
    bonusGems = 0;
    // 每个活动按自己的玩法打到里程碑全部领完（塔会自己选路、世界事件会把骰子掷完）
    for (const { id } of EVENT_TYPES) for (let i = 0; i < 40 && (ensureEventWeek(s, WEEK, id).claimed.length < 6 || (id === 'invasion' && ensureEventWeek(s, WEEK, id).playRewards < 4)); i++) settle(s, battle(s, id));
    expect(s.currencies.gems - bonusGems).toBe(5480);
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
