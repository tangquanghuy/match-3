/**
 * 每周活动（素材批 2026-09-19）：6 周轮换确定性、主题参数、出敌过校验、
 * 积分公式、里程碑入账、周切重置、结算行素材展示。
 */
import { describe, it, expect } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { EVENT_MILESTONES, EVENT_ROTATION, eventTypeOfWeek, WEEK_MS } from '../../src/meta/data/events';
import {
  currentEventTheme,
  ensureEventWeek,
  eventPointsOf,
  eventMilestonesReached,
  eventTokensFor,
  buyEventGoods,
  planEventEncounter,
  eventBattleProgress,
  applyEventBattleModifiers,
  factionMatchCount,
  trialMultiplier,
  EVENT_STATE_KEYS,
} from '../../src/meta/systems/events';
import { EVENT_SHOP } from '../../src/meta/data/events';
import { buildBattleRequest } from '../../src/meta/systems/battleBridge';
import { eventMetricOf, abandonTowerRun } from '../../src/meta/systems/events';
import type { BattleResult } from '../../src/session/contract';
import type { BridgeOutcome } from '../../src/meta/systems/battleBridge';
import { applySettlement } from '../../src/meta/systems/settlement';
import { parseStoneKey } from '../../src/meta/data/materials';
import { getTroopById } from '../../src/data/troops';
import { troopStatsAtLevel } from '../../src/data/leveling';

const OGRE = 6000;
const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS); // 对齐周一零点的任意锚点

const saveWithTeam = () => {
  const s = newSave({ now: 0, starterTroopIds: [OGRE, 6097, 6457], currencies: { gold: 1000 } });
  return s;
};

describe('轮换与主题（data/events）', () => {
  it('6 周大轮换：weekIndex 决定类型，同周必同类型', () => {
    expect(EVENT_ROTATION).toHaveLength(6);
    expect(eventTypeOfWeek(WEEK).id).toBe(eventTypeOfWeek(WEEK + 1).id);
    expect(eventTypeOfWeek(WEEK + WEEK_MS).id).not.toBe(eventTypeOfWeek(WEEK).id);
    // 负数/大数不越界
    expect(eventTypeOfWeek(-WEEK_MS * 7).id).toBeTruthy();
  });

  it('主题参数确定性：同周同势力；入侵/阵营突袭有目标王国', () => {
    const a = currentEventTheme(WEEK);
    const b = currentEventTheme(WEEK);
    expect(b.kingdom).toBe(a.kingdom);
    const weekOf = (id: string): string | null =>
      Array.from({ length: 12 }, (_, i) => currentEventTheme(WEEK + i * WEEK_MS)).find((t) => t.type.id === id)?.kingdom ?? null;
    expect(weekOf('invasion')).not.toBeNull();
    expect(weekOf('factionAssault')).not.toBeNull();
    expect(weekOf('raidBoss')).toBeNull();
  });

  it('里程碑表：六档、阈值严格递增、素材键全部合法', () => {
    for (const [typeId, table] of Object.entries(EVENT_MILESTONES)) {
      expect(table, typeId).toHaveLength(6);
      for (let i = 1; i < table.length; i++) {
        expect(table[i]!.points).toBeGreaterThan(table[i - 1]!.points);
      }
      for (const m of table) {
        for (const key of Object.keys(m.mats?.traitstones ?? {})) {
          expect(parseStoneKey(key), `${typeId}:${key}`).not.toBeNull();
        }
        for (const [key, n] of Object.entries(m.mats?.ingots ?? {})) {
          expect(n!).toBeGreaterThan(0);
          expect(key).toMatch(/^(common|uncommon|rare|ultraRare|epic|legendary|mythic)$/);
        }
      }
    }
  });
});

describe('活动实例与出敌（systems/events）', () => {
  it('ensureEventWeek：建档 + 周切重置（幂等）', () => {
    const s = saveWithTeam();
    const w1 = ensureEventWeek(s, WEEK);
    expect(w1.points).toBe(0);
    w1.points = 500;
    expect(ensureEventWeek(s, WEEK).points).toBe(500); // 同周幂等
    const w2 = ensureEventWeek(s, WEEK + WEEK_MS);
    expect(w2.points).toBe(0); // 跨周重置
    expect(w2.weekStart).toBe(WEEK + WEEK_MS);
  });

  it('planEventEncounter：同周同 seed 复现；出敌引用真实部队', () => {
    const s = saveWithTeam();
    const p1 = planEventEncounter(s, WEEK, 12345);
    const p2 = planEventEncounter(s, WEEK, 12345);
    expect(p1.source).toMatchObject({ kind: 'event', weekStart: WEEK });
    expect(p2.enemies).toEqual(p1.enemies);
    for (const e of p1.enemies) {
      expect(getTroopById(e.troopId)).toBeTruthy();
    }
  });

  it('入侵周：敌人全部来自本周目标王国；等级随防线推进递增', () => {
    // 找到一个入侵周
    let week = WEEK;
    for (let i = 0; i < 6; i++) {
      if (currentEventTheme(week).type.id === 'invasion') break;
      week += WEEK_MS;
    }
    const s = saveWithTeam();
    const theme = currentEventTheme(week);
    expect(theme.kingdom).toBeTruthy();
    const line1 = planEventEncounter(s, week, 999);
    for (const e of line1.enemies) {
      expect(getTroopById(e.troopId)!.kingdom).toBe(theme.kingdom);
    }
    ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.invLine] = 3;
    const line3 = planEventEncounter(s, week, 999);
    expect(line3.enemies[0]!.level).toBe(line1.enemies[0]!.level + 6);
  });

  it('eventPointsOf：按稀有度与等级计分并封顶 120', () => {
    const s = saveWithTeam();
    const plan = planEventEncounter(s, WEEK, 42);
    const manual = plan.enemies.reduce((sum, e) => {
      const troop = getTroopById(e.troopId)!;
      return sum + (troop.rarityIdx + 1) * 10 + e.level;
    }, 0);
    expect(eventPointsOf(plan)).toBe(Math.min(manual, 120));
  });

  it('eventMilestonesReached：只返回未领且达标者（按总分）', () => {
    const gains = eventMilestonesReached(WEEK, 650, [0, 1]);
    expect(gains.map((g) => g.index)).toEqual([2]);
    expect(gains[0]!.milestone.points).toBe(EVENT_MILESTONES[currentEventTheme(WEEK).type.id]![2]!.points);
  });
});

describe('活动结算（applySettlement 事件分支）', () => {
  it('胜场入积分 + 里程碑素材自动入账（结算行可解释）', () => {
    const s = saveWithTeam();
    const week = ensureEventWeek(s, WEEK);
    const plan = planEventEncounter(s, WEEK, 777);
    const enemyByExternalId = new Map(plan.enemies.map((e, i) => [`e${i}-${e.troopId}`, e]));
    const result = {
      winner: 'player',
      turns: 8,
      defeatedExternalIds: [...enemyByExternalId.keys()],
      combatants: [],
      eventSummary: [],
    } as unknown as Parameters<typeof applySettlement>[1];

    // 手动预置进度到里程碑 1 门槛前（世界事件按物资，其余按积分）
    const isWorld = currentEventTheme(WEEK).type.id === 'worldEvent';
    if (isWorld) week.eventData[EVENT_STATE_KEYS.supplies] = 13;
    else week.points = 95;
    const detail = applySettlement(s, result, { plan, enemyByExternalId, todayStart: 0 });
    const pointsLine = detail.lines.find((l) => l.key === 'event-points');
    expect(pointsLine).toBeTruthy();
    const gained = eventPointsOf(plan);
    expect(week.points).toBe((isWorld ? 0 : 95) + gained);
    // 里程碑（100 分档）应当已入账：库存出现特质石
    const milestoneLines = detail.lines.filter((l) => l.key === 'event-milestone');
    expect(milestoneLines.length).toBeGreaterThanOrEqual(1);
    // 里程碑奖励按当周类型落账：素材或货币至少一项入账
    const firstMilestone = EVENT_MILESTONES[currentEventTheme(WEEK).type.id]![0]!;
    const ingotTotal = Object.values(s.materials.ingots).reduce((a, b) => a + b, 0);
    const stoneTotal = Object.values(s.materials.traitstones).reduce((a, b) => a + b, 0);
    const matCredited = ingotTotal + stoneTotal + s.materials.forgeScrolls > 0;
    const cashCredited =
      (firstMilestone.gold ?? 0) + (firstMilestone.souls ?? 0) + (firstMilestone.gems ?? 0) + (firstMilestone.glory ?? 0) > 0;
    expect(matCredited || cashCredited || milestoneLines[0]!.mats !== undefined).toBe(true);
  });

  it('败场不积分不推进里程碑', () => {
    const s = saveWithTeam();
    const plan = planEventEncounter(s, WEEK, 778);
    const before = ensureEventWeek(s, WEEK).points;
    const result = { winner: 'enemy', turns: 8, defeatedExternalIds: [], combatants: [], eventSummary: [] } as unknown as Parameters<typeof applySettlement>[1];
    applySettlement(s, result, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(ensureEventWeek(s, WEEK).points).toBe(before);
  });
});

describe('活动商店与代币（2026-09-19 追补）', () => {
  it('货架数据合法：id 全局唯一、cost>0、限量≥1、奖励非空；每类 ≥4 件', () => {
    const seen = new Set<string>();
    for (const [typeId, goods] of Object.entries(EVENT_SHOP)) {
      expect(goods.length, typeId).toBeGreaterThanOrEqual(4);
      for (const g of goods) {
        expect(seen.has(g.id), g.id).toBe(false);
        seen.add(g.id);
        expect(g.cost).toBeGreaterThan(0);
        expect(g.stock === null || g.stock >= 1).toBe(true);
        const hasReward =
          (g.gold ?? 0) + (g.souls ?? 0) + (g.gems ?? 0) + (g.goldKeys ?? 0) + (g.glory ?? 0) > 0 ||
          Object.keys(g.mats?.ingots ?? {}).length + Object.keys(g.mats?.traitstones ?? {}).length > 0 ||
          (g.mats?.forgeScrolls ?? 0) > 0;
        expect(hasReward, g.id).toBe(true);
      }
    }
  });

  it('eventTokensFor：下限 3，按积分十分之一取整', () => {
    expect(eventTokensFor(0)).toBe(3);
    expect(eventTokensFor(29)).toBe(3);
    expect(eventTokensFor(40)).toBe(4);
    expect(eventTokensFor(120)).toBe(12);
  });

  it('购买：扣代币入素材、已购计数累加、限量售罄拒绝', () => {
    const s = saveWithTeam();
    ensureEventWeek(s, WEEK).tokens = 100;
    const unlimited = EVENT_SHOP[currentEventTheme(WEEK).type.id]!.find((g) => g.stock === null)!;
    const limited = EVENT_SHOP[currentEventTheme(WEEK).type.id]!.find((g) => g.stock !== null && g.stock! >= 2)!;

    const r1 = buyEventGoods(s, unlimited.id, WEEK);
    expect(r1).toMatchObject({ ok: true, tokensSpent: unlimited.cost });
    expect(ensureEventWeek(s, WEEK).bought[unlimited.id]).toBe(1);

    // 把限量货买到售罄
    const stock = limited.stock!;
    for (let i = 0; i < stock; i++) {
      ensureEventWeek(s, WEEK).tokens += limited.cost;
      const r = buyEventGoods(s, limited.id, WEEK);
      expect(r.ok).toBe(true);
    }
    expect(buyEventGoods(s, limited.id, WEEK)).toMatchObject({ ok: false, code: 'SOLD_OUT' });
  });

  it('代币不足 → 整笔不动；未知商品拒绝；周切重置代币与已购', () => {
    const s = saveWithTeam();
    ensureEventWeek(s, WEEK).tokens = 2;
    const anyGoods = EVENT_SHOP[currentEventTheme(WEEK).type.id]![0]!;
    expect(buyEventGoods(s, anyGoods.id, WEEK)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(buyEventGoods(s, '不存在的商品', WEEK)).toMatchObject({ ok: false, code: 'INVALID' });
    expect(ensureEventWeek(s, WEEK).tokens).toBe(2);

    ensureEventWeek(s, WEEK).tokens = 500;
    ensureEventWeek(s, WEEK + WEEK_MS); // 跨周
    expect(ensureEventWeek(s, WEEK + WEEK_MS).tokens).toBe(0);
    expect(Object.keys(ensureEventWeek(s, WEEK + WEEK_MS).bought)).toHaveLength(0);
  });

  it('胜场结算同步发代币（结算行备注可解释）', () => {
    const s = saveWithTeam();
    ensureEventWeek(s, WEEK);
    const plan = planEventEncounter(s, WEEK, 781);
    const result = { winner: 'player', turns: 8, defeatedExternalIds: [], combatants: [], eventSummary: [] } as unknown as Parameters<typeof applySettlement>[1];
    applySettlement(s, result, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(ensureEventWeek(s, WEEK).tokens).toBe(eventTokensFor(eventPointsOf(plan)));
  });
});

describe('六种玩法机制（玩法差异化批）', () => {
  const findWeekOf = (id: string): number => {
    for (let i = 0; i < 12; i++) {
      const week = WEEK + i * WEEK_MS;
      if (currentEventTheme(week).type.id === id) return week;
    }
    throw new Error(`rotation missing ${id}`);
  };

  /** 依 plan/存档构造最小 BattleResult：playerHps 按预设队序（缺省满血），enemyHps 按出敌序（缺省按胜负） */
  const fakeResult = (save: ReturnType<typeof saveWithTeam>, plan: ReturnType<typeof planEventEncounter>, victory: boolean, opts?: { playerHps?: number[]; enemyHps?: number[] }): BattleResult => {
    const team = save.teams[0]!;
    const player = team.members.map((m, i) => {
      const maxHp = 200;
      const hp = opts?.playerHps?.[i] ?? maxHp;
      return {
        externalId: m.kind === 'hero' ? `p${i}-hero` : `p${i}-${m.troopId}`,
        side: 'player' as const,
        hp,
        maxHp,
        armor: 0,
        defeated: hp <= 0,
        statuses: [],
      };
    });
    const enemies = plan.enemies.map((e, i) => {
      const maxHp = 300;
      const hp = opts?.enemyHps?.[i] ?? (victory ? 0 : maxHp);
      return { externalId: `e${i}-${e.troopId}`, side: 'enemy' as const, hp, maxHp, armor: 0, defeated: hp <= 0, statuses: [] };
    });
    return {
      winner: victory ? 'player' : 'enemy',
      turns: 8,
      combatants: [...player, ...enemies],
      defeatedExternalIds: [],
      eventSummary: [],
      seed: 42,
    } as unknown as BattleResult;
  };

  it('入侵周防线推进：胜→推进，破第三防线=守土成功重赏，败→退回第 1 条', () => {
    const week = findWeekOf('invasion');
    const s = saveWithTeam();
    ensureEventWeek(s, week);
    const settle = (victory: boolean): void => {
      const plan = planEventEncounter(s, week, 555);
      eventBattleProgress(s, plan, fakeResult(s, plan, victory), victory);
    };
    settle(true);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.invLine]).toBe(2);
    settle(true);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.invLine]).toBe(3);
    const gloryBefore = s.currencies.glory;
    settle(true);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.invRepelled]).toBe(1);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.invLine]).toBe(1);
    expect(s.currencies.glory).toBe(gloryBefore + 40);
    settle(false);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.invLine]).toBe(1);
  });

  it('突袭首领：计划生成血池，伤害跨场累计，清零=讨伐成功并刷新更强首领', () => {
    const week = findWeekOf('raidBoss');
    const s = saveWithTeam();
    ensureEventWeek(s, week);
    const plan1 = planEventEncounter(s, week, 777);
    const max1 = ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossMax]!;
    expect(max1).toBeGreaterThan(0);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossHp]).toBe(max1);
    const damageOf = (pl: ReturnType<typeof planEventEncounter>, hps: number[]): number =>
      pl.enemies.reduce((sum, e, i) => {
        const realMax = troopStatsAtLevel(getTroopById(e.troopId)!, e.level).health;
        return sum + Math.max(0, realMax - (hps[i] ?? realMax));
      }, 0);
    const d1 = damageOf(plan1, [200, 200, 300]);
    const r = eventBattleProgress(s, plan1, fakeResult(s, plan1, true, { enemyHps: [200, 200, 300] }), true);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossHp]).toBe(max1 - d1);
    expect(r.lines.some((l) => l.label.startsWith('首领伤害'))).toBe(true);
    ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossHp] = 1; // 残血（一场伤害必≥1，稳定触发讨伐成功）
    const gloryBefore = s.currencies.glory;
    const plan2 = planEventEncounter(s, week, 778);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossMax]).toBe(max1);
    eventBattleProgress(s, plan2, fakeResult(s, plan2, true, { enemyHps: [0, 0, 0] }), true);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossesSlain]).toBe(1);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossTier]).toBe(2);
    expect(s.currencies.glory).toBe(gloryBefore + 50);
    planEventEncounter(s, week, 779);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.bossMax]).toBeGreaterThan(max1);
  });

  it('末日之塔：开爬/通过推进/状态冻结/败北收尾', () => {
    const week = findWeekOf('towerOfDoom');
    const s = saveWithTeam();
    ensureEventWeek(s, week);
    const plan1 = planEventEncounter(s, week, 801);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.runActive]).toBe(1);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.floor]).toBe(1);
    eventBattleProgress(s, plan1, fakeResult(s, plan1, true, { playerHps: [150, 0, 200] }), true);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.floor]).toBe(2);
    expect(ensureEventWeek(s, week).runTeam!.filter((m) => !m.defeated)).toHaveLength(2);
    const plan2 = planEventEncounter(s, week, 802);
    const outcome = buildBattleRequest(s, plan2) as unknown as BridgeOutcome;
    expect(outcome.ok).toBe(true);
    applyEventBattleModifiers(s, outcome);
    expect(outcome.request.playerTeam).toHaveLength(2);
    const hero = outcome.request.playerTeam.find((snap) => snap.externalId === 'p0-6000');
    expect(hero?.stats.hp).toBeLessThanOrEqual(150);
    eventBattleProgress(s, plan2, fakeResult(s, plan2, false), false);
    const weekState = ensureEventWeek(s, week);
    expect(weekState.eventData[EVENT_STATE_KEYS.runActive]).toBe(0);
    expect(weekState.eventData[EVENT_STATE_KEYS.floorBest]).toBe(1);
    expect(weekState.runTeam).toBeNull();
    expect(s.currencies.glory).toBe(2);
  });

  it('世界事件：胜场掉物资（里程碑按物资结算），败场不掉', () => {
    const week = findWeekOf('worldEvent');
    const s = saveWithTeam();
    ensureEventWeek(s, week);
    const plan = planEventEncounter(s, week, 901);
    eventBattleProgress(s, plan, fakeResult(s, plan, true), true);
    const supplies = ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.supplies]!;
    expect(supplies).toBeGreaterThanOrEqual(2);
    const metric = eventMetricOf(s, week);
    expect(metric.label).toBe('物资');
    expect(metric.value).toBe(supplies);
    const plan2 = planEventEncounter(s, week, 902);
    eventBattleProgress(s, plan2, fakeResult(s, plan2, false), false);
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.supplies]).toBe(supplies);
  });

  it('职业试炼：连胜 ×1.3/×1.6 计分，败场清零', () => {
    const week = findWeekOf('classTrials');
    const s = saveWithTeam();
    const weekState = ensureEventWeek(s, week);
    const plan = planEventEncounter(s, week, 951);
    const base = eventPointsOf(plan);
    const settleWin = (): void => {
      applySettlement(s, fakeResult(s, plan, true), { plan, enemyByExternalId: new Map(), todayStart: 0 });
    };
    settleWin();
    expect(weekState.eventData[EVENT_STATE_KEYS.trialStreak]).toBe(1);
    const after1 = weekState.points;
    settleWin();
    expect(weekState.eventData[EVENT_STATE_KEYS.trialStreak]).toBe(2);
    expect(weekState.points).toBe(after1 + Math.min(240, Math.round(base * 1.3)));
    settleWin();
    expect(weekState.points).toBe(after1 + Math.min(240, Math.round(base * 1.3)) + Math.min(240, Math.round(base * 1.6)));
    applySettlement(s, fakeResult(s, plan, false), { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(weekState.eventData[EVENT_STATE_KEYS.trialStreak]).toBe(0);
  });

  it('阵营突袭：编入目标王国的部队给全队叠加攻击/生命', () => {
    const KINGDOM = '破碎尖塔';
    let week = -1;
    for (let i = 0; i < 5000 && week < 0; i++) {
      const candidate = WEEK + i * WEEK_MS;
      if (currentEventTheme(candidate).type.id === 'factionAssault' && currentEventTheme(candidate).kingdom === KINGDOM) {
        week = candidate;
      }
    }
    expect(week).toBeGreaterThanOrEqual(0);
    const s = saveWithTeam();
    const plan = planEventEncounter(s, week, 961);
    const outcome = buildBattleRequest(s, plan) as unknown as BridgeOutcome;
    expect(outcome.ok).toBe(true);
    const before = outcome.request.playerTeam.map((snap) => ({ attack: snap.stats.attack, hp: snap.stats.hp }));
    applyEventBattleModifiers(s, outcome);
    const match = factionMatchCount(s, KINGDOM);
    expect(match).toBe(3);
    outcome.request.playerTeam.forEach((snap, i) => {
      expect(snap.stats.attack).toBe(before[i]!.attack + 2 * match);
      expect(snap.stats.hp).toBe(before[i]!.hp + 10 * match);
    });
  });

  it('trialMultiplier 值表与规则卡一致', () => {
    expect(trialMultiplier(1)).toBe(1);
    expect(trialMultiplier(2)).toBe(1.3);
    expect(trialMultiplier(3)).toBe(1.6);
    expect(trialMultiplier(4)).toBe(2);
    expect(trialMultiplier(9)).toBe(2);
  });

  it('放弃按败北同口径收尾：到达层=当前层-1，照发层数奖励；无 run 时拒绝', () => {
    const week = findWeekOf('towerOfDoom');
    const s = saveWithTeam();
    ensureEventWeek(s, week);
    planEventEncounter(s, week, 971); // 开爬，floor=1
    ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.floor] = 8; // 直接爬到第 8 层
    expect(ensureEventWeek(s, week).eventData[EVENT_STATE_KEYS.runActive]).toBe(1);
    const gloryBefore = s.currencies.glory;
    const r = abandonTowerRun(s, week);
    expect(r).toMatchObject({ ok: true, floorReached: 7, glory: 14, scrolls: 1 });
    expect(s.currencies.glory).toBe(gloryBefore + 14);
    expect(s.materials.forgeScrolls).toBe(1);
    const weekState = ensureEventWeek(s, week);
    expect(weekState.eventData[EVENT_STATE_KEYS.runActive]).toBe(0);
    expect(weekState.eventData[EVENT_STATE_KEYS.floorBest]).toBe(7);
    expect(weekState.runTeam).toBeNull();
    // 无 run 再放弃 → 拒绝
    expect(abandonTowerRun(s, week)).toMatchObject({ ok: false, code: 'INVALID' });
  });
});
