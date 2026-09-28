/**
 * 六种常驻活动：独立主题与周实例、出敌校验、积分与里程碑入账、周切重置。
 */
import { describe, it, expect } from 'vitest';
import { weekStartOf as weekStartOfGame } from '../../src/meta/gateway/clock';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { EventsScreen } from '../../src/meta/screens/eventsScreen';
import type { ShellCtx } from '../../src/meta/shell/screen';
import { EVENT_MILESTONES, EVENT_TYPES, EVENT_WEEKLY_PLAY_REWARD_CAP, EVENT_UNLOCK_HERO_LEVEL, EVENT_DIFFICULTY, eventThemeOf, WEEK_MS } from '../../src/meta/data/events';
import {
  currentEventTheme,
  ensureEventWeek,
  eventPointsOf,
  eventMilestonesReached,
  eventTokensFor,
  eventShopOf,
  eventPageState,
  buyEventGoods,
  planEventEncounter,
  eventBattleProgress,
  applyEventBattleModifiers,
  factionMatchCount,
  trialMultiplier,
  EVENT_STATE_KEYS,
  raidPoolOf,
  raidPointsFor,
  eventStageLevel,
  towerFloorLevel,
  eventBattleReady,
} from '../../src/meta/systems/events';
import { EVENT_SHOP } from '../../src/meta/data/events';
import { buildBattleRequest } from '../../src/meta/systems/battleBridge';
import { eventMetricOf, abandonTowerRun } from '../../src/meta/systems/events';
import type { BattleResult } from '../../src/session/contract';
import type { BridgeOutcome } from '../../src/meta/systems/battleBridge';
import { applySettlement } from '../../src/meta/systems/settlement';
import { parseStoneKey } from '../../src/meta/data/materials';
import { getTroopById } from '../../src/data/troops';

const OGRE = 6000;
const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS); // 对齐周一零点的任意锚点
const TYPE = 'invasion' as const;

const saveWithTeam = () => {
  const s = newSave({ now: 0, starterTroopIds: [OGRE, 6097, 6457], currencies: { gold: 1000 } });
  s.hero.level = EVENT_UNLOCK_HERO_LEVEL; // 活动 20 级解锁
  return s;
};

describe('常驻活动与主题（data/events）', () => {
  it('六种类型固定开放，单活动同周主题可复现', () => {
    expect(EVENT_TYPES).toHaveLength(6);
    for (const def of EVENT_TYPES) {
      expect(eventThemeOf(def.id, WEEK)).toEqual(eventThemeOf(def.id, WEEK));
      expect(eventThemeOf(def.id, WEEK).type.id).toBe(def.id);
    }
  });

  it('主题参数确定性：同周同势力；入侵/阵营突袭有目标王国', () => {
    const a = currentEventTheme(WEEK, TYPE);
    const b = currentEventTheme(WEEK, TYPE);
    expect(b.kingdom).toBe(a.kingdom);
    expect(currentEventTheme(WEEK, 'factionAssault').kingdom).not.toBeNull();
    expect(currentEventTheme(WEEK, 'raidBoss').kingdom).toBeNull();
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
  it('高阶残血首领的强化攻击遵守战斗请求上限', () => {
    const save = saveWithTeam();
    const week = ensureEventWeek(save, WEEK, 'raidBoss');
    week.eventData.bossTier = 200;
    const plan = planEventEncounter(save, WEEK, 777, 'raidBoss');
    week.eventData.bossHp = 1;
    const outcome = buildBattleRequest(save, plan);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.message);
    const bossIndex = plan.enemies.findIndex(e => e.tier === 'boss');
    expect(bossIndex).toBeGreaterThanOrEqual(0);
    const boss = outcome.request.enemyTeam[bossIndex]!;
    boss.stats.attack = 999;
    applyEventBattleModifiers(save, outcome);
    expect(boss.stats.attack).toBe(999);
    expect(boss.initialHp).toBe(1);
  });

  it('ensureEventWeek：建档 + 周切重置（幂等）', () => {
    const s = saveWithTeam();
    const w1 = ensureEventWeek(s, WEEK, TYPE);
    expect(w1.points).toBe(0);
    w1.points = 500;
    expect(ensureEventWeek(s, WEEK, TYPE).points).toBe(500); // 同周幂等
    const w2 = ensureEventWeek(s, WEEK + WEEK_MS, TYPE);
    expect(w2.points).toBe(0); // 跨周重置
    expect(w2.weekStart).toBe(WEEK + WEEK_MS);
  });

  it('同周六活动周实例互不借用进度/代币/已购，下一周一起清零', () => {
    const s = saveWithTeam();
    const invasion = ensureEventWeek(s, WEEK, 'invasion');
    invasion.points = 625;
    invasion.claimed = [0, 1, 2];
    invasion.tokens = 47;
    invasion.bought.invasion_major = 1;
    invasion.eventData[EVENT_STATE_KEYS.invLine] = 3;
    for (const { id } of EVENT_TYPES) {
      const other = ensureEventWeek(s, WEEK, id);
      if (id === 'invasion') continue;
      expect(other.points).toBe(0);
      expect(other.claimed).toEqual([]);
      expect(other.tokens).toBe(0);
      expect(other.bought).toEqual({});
      expect(other.eventData).toEqual({ revision: 2, ...(id === 'worldEvent' ? { worldWins: 0 } : id === 'classTrials' ? { trialWins: 0 } : {}) });
    }
    expect(eventPageState(s, WEEK, 'raidBoss').metric.value).toBe(0);
    expect(eventShopOf(s, WEEK, 'raidBoss').week.tokens).toBe(0);
    const next = WEEK + WEEK_MS;
    for (const { id } of EVENT_TYPES) {
      const fresh = ensureEventWeek(s, next, id);
      expect(fresh.weekStart).toBe(next);
      expect(fresh).toMatchObject({ points: 0, tokens: 0, tokensEarned: 0, playRewards: 0, claimed: [], bought: {}, eventData: {} });
    }
  });

  it('活动周实例：坏索引与异店已购在 hydrate 时丢弃', () => {
    const raw = JSON.parse(JSON.stringify(newSave({ now: 0 }))) as Record<string, unknown>;
    raw.eventWeeks = { towerOfDoom: {
      weekStart: WEEK, points: 345, claimed: [0, 1, 1, -1, 6, 1.5], wins: 3,
      tokens: 35, bought: { tod_scroll: 1, invasion_major: 3 },
      eventData: { floor: 6 }, runTeam: [{ externalId: 'p0-6000', hp: 8, defeated: false }],
    } };
    const migrated = migrateSave(raw);
    expect(migrated.eventWeeks.towerOfDoom).toMatchObject({ weekStart: WEEK, points: 345, claimed: [0, 1], tokens: 35, tokensEarned: 35, bought: { tod_scroll: 1 } });
    expect(migrated.eventWeeks.towerOfDoom?.runTeam?.[0]).toMatchObject({ hp: 8, maxHp: 8 });
    expect(migrated.eventWeeks.invasion).toBeUndefined();
    expect(ensureEventWeek(migrated, WEEK, 'invasion').points).toBe(0);
  });

  it('planEventEncounter：同周同 seed 复现；出敌引用真实部队', () => {
    const s = saveWithTeam();
    const p1 = planEventEncounter(s, WEEK, 12345, TYPE);
    const p2 = planEventEncounter(s, WEEK, 12345, TYPE);
    expect(p1.source).toMatchObject({ kind: 'event', weekStart: WEEK, typeId: TYPE });
    expect(p2.enemies).toEqual(p1.enemies);
    for (const e of p1.enemies) {
      expect(getTroopById(e.troopId)).toBeTruthy();
    }
  });

  it('网关可在同一周为六页分别生成所属活动的战斗来源', async () => {
    const gateway = new MockGateway(memoryStorage(), { now: () => WEEK });
    await gateway.load();
    for (const { id } of EVENT_TYPES) {
      const planned = await gateway.planEventBattle(id);
      expect(planned.ok, id).toBe(true);
      // 周锚点由核心按服务器时钟推导（游戏时区周一零点）
      if (planned.ok) expect(planned.source).toMatchObject({ kind: 'event', weekStart: weekStartOfGame(WEEK), typeId: id });
    }
  });

  it('入侵周：敌人全部来自本周目标王国；等级随防线推进递增', () => {
    const s = saveWithTeam();
    const theme = currentEventTheme(WEEK, TYPE);
    expect(theme.kingdom).toBeTruthy();
    const line1 = planEventEncounter(s, WEEK, 999, TYPE);
    for (const e of line1.enemies) {
      expect(getTroopById(e.troopId)!.kingdom).toBe(theme.kingdom);
    }
    ensureEventWeek(s, WEEK, TYPE).eventData[EVENT_STATE_KEYS.invLine] = 3;
    const line3 = planEventEncounter(s, WEEK, 999, TYPE);
    expect(line1.enemies[0]!.level).toBe(EVENT_UNLOCK_HERO_LEVEL);
    expect(line3.enemies[0]!.level).toBe(line1.enemies[0]!.level + 6);
  });

  it('eventPointsOf：基础固定100，强攻120，降低随机敌人带来的收益波动', () => {
    const s = saveWithTeam();
    const plan = planEventEncounter(s, WEEK, 42, TYPE);
    expect(eventPointsOf(plan)).toBe(100);
    expect(eventPointsOf(planEventEncounter(s, WEEK, 42, TYPE, 'charge'))).toBe(120);
  });

  it('eventMilestonesReached：只返回未领且达标者（按总分）', () => {
    const gains = eventMilestonesReached(TYPE, 650, [0, 1]);
    expect(gains.map((g) => g.index)).toEqual([2, 3]);
    expect(gains[0]!.milestone.points).toBe(EVENT_MILESTONES[TYPE][2]!.points);
    expect(eventMilestonesReached('worldEvent', 95, []).map((g) => g.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(eventMilestonesReached(TYPE, 95, []).map((g) => g.index)).toEqual([]);
  });
});

describe('六活动页面', () => {
  it('总览可进入六活动，六页均可出战，其他活动的领取状态不会误标', () => {
    const save = saveWithTeam();
    const week = weekStartOf(Date.now());
    ensureEventWeek(save, week, TYPE).claimed = [0];
    const ctx = { save: () => save } as ShellCtx;
    const screen = new EventsScreen();
    const overview = screen.html(ctx);
    for (const { id } of EVENT_TYPES) {
      expect(overview).toContain(`href="#events/${id}"`);
      const page = screen.html(ctx, id);
      expect(page).toContain('id="evFight"');
      expect(page).not.toContain('ev-preview');
      expect(page).not.toContain('CLOSED');
      expect(page).toContain(`href="#events/${id}/rewards"`);
      const rewards = screen.html(ctx, `${id}/rewards`);
      if (id !== TYPE) expect(rewards).not.toContain('class="ev-mile done"');
      else expect(rewards).toContain('class="ev-mile done"');
    }
  });
});

describe('活动结算（applySettlement 事件分支）', () => {
  it('胜场入积分 + 里程碑素材自动入账（结算行可解释）', () => {
    const s = saveWithTeam();
    const week = ensureEventWeek(s, WEEK, TYPE);
    const plan = planEventEncounter(s, WEEK, 777, TYPE);
    const enemyByExternalId = new Map(plan.enemies.map((e, i) => [`e${i}-${e.troopId}`, e]));
    const result = {
      winner: 'player',
      turns: 8,
      defeatedExternalIds: [...enemyByExternalId.keys()],
      combatants: [],
      eventSummary: [],
    } as unknown as Parameters<typeof applySettlement>[1];

    // 手动预置进度到里程碑 1 门槛前（世界事件按物资，其余按积分）
    week.points = 95;
    const detail = applySettlement(s, result, { plan, enemyByExternalId, todayStart: 0 });
    const pointsLine = detail.lines.find((l) => l.key === 'event-points');
    expect(pointsLine).toBeTruthy();
    const gained = eventPointsOf(plan);
    expect(week.points).toBe(95 + gained);
    // 里程碑（100 分档）应当已入账：库存出现特质石
    const milestoneLines = detail.lines.filter((l) => l.key === 'event-milestone');
    expect(milestoneLines.length).toBeGreaterThanOrEqual(1);
    // 里程碑奖励按当周类型落账：素材或货币至少一项入账
    const firstMilestone = EVENT_MILESTONES[TYPE][0]!;
    const ingotTotal = Object.values(s.materials.ingots).reduce((a, b) => a + b, 0);
    const stoneTotal = Object.values(s.materials.traitstones).reduce((a, b) => a + b, 0);
    const matCredited = ingotTotal + stoneTotal + s.materials.forgeScrolls > 0;
    const cashCredited =
      (firstMilestone.gold ?? 0) + (firstMilestone.souls ?? 0) + (firstMilestone.gems ?? 0) + (firstMilestone.glory ?? 0) > 0;
    expect(matCredited || cashCredited || milestoneLines[0]!.mats !== undefined).toBe(true);
  });

  it('败场不积分不推进里程碑', () => {
    const s = saveWithTeam();
    const plan = planEventEncounter(s, WEEK, 778, TYPE);
    const before = ensureEventWeek(s, WEEK, TYPE).points;
    const result = { winner: 'enemy', turns: 8, defeatedExternalIds: [], combatants: [], eventSummary: [] } as unknown as Parameters<typeof applySettlement>[1];
    applySettlement(s, result, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(ensureEventWeek(s, WEEK, TYPE).points).toBe(before);
  });
});

describe('活动商店与代币（2026-09-19 追补）', () => {
  it('货架数据合法：id 全局唯一、cost>0、限量≥1、奖励非空；每类 8 件限量商品与独立余印补给', () => {
    const seen = new Set<string>();
    for (const [typeId, goods] of Object.entries(EVENT_SHOP)) {
      expect(goods.filter(g => g.stock !== null), typeId).toHaveLength(8);
      expect(goods.filter(g => g.stock === null), typeId).toHaveLength(1);
      expect(goods.reduce((sum,g)=>sum+g.cost*(g.stock??0),0),typeId).toBeGreaterThan(360);
      expect(goods.every(g => !g.gems),typeId).toBe(true);
      for (const g of goods) {
        expect(seen.has(g.id), g.id).toBe(false);
        seen.add(g.id);
        expect(g.cost).toBeGreaterThan(0);
        expect(g.stock === null || g.stock >= 1).toBe(true);
        const hasReward =
          (g.gold ?? 0) + (g.souls ?? 0) + (g.gems ?? 0) + (g.goldKeys ?? 0) + (g.glory ?? 0) > 0 ||
          Object.keys(g.mats?.ingots ?? {}).length + Object.keys(g.mats?.traitstones ?? {}).length > 0 ||
          (g.mats?.forgeScrolls ?? 0) > 0 || !!g.troopRole || (g.classXp ?? 0) > 0;
        expect(hasReward, g.id).toBe(true);
      }
    }
  });

  it('扩充货架：限量补给实际入账、预算不变、售罄与下周补货同步', () => {
    for (const { id: type } of EVENT_TYPES) {
      for (const goods of EVENT_SHOP[type].filter(g => g.stock !== null && !g.troopRole && !g.classXp)) {
        const save = saveWithTeam();
        const before = structuredClone(save);
        const week = ensureEventWeek(save, WEEK, type);
        week.tokens = 360;
        week.tokensEarned = 360;
        const count = goods.stock!;
        for (let i = 0; i < count; i++) {
          expect(buyEventGoods(save, goods.id, WEEK, type), goods.id).toMatchObject({ok:true,stockLeft:count-i-1});
        }
        expect(week.tokens).toBe(360-goods.cost*count);
        expect(week.tokensEarned).toBe(360);
        for (const key of ['gold','souls','goldKeys','glory','gems'] as const) {
          expect(save.currencies[key]-before.currencies[key], goods.id+':'+key).toBe((goods[key]??0)*count);
        }
        for (const group of ['ingots','traitstones'] as const) {
          for (const [key,amount] of Object.entries(goods.mats?.[group]??{})) {
            const afterMap = save.materials[group] as Record<string,number>;
            const beforeMap = before.materials[group] as Record<string,number>;
            expect((afterMap[key]??0)-(beforeMap[key]??0),goods.id+':'+key).toBe(amount!*count);
          }
        }
        expect(save.materials.forgeScrolls-before.materials.forgeScrolls).toBe((goods.mats?.forgeScrolls??0)*count);
        expect(buyEventGoods(save,goods.id,WEEK,type)).toMatchObject({ok:false,code:'SOLD_OUT'});
        const next = eventShopOf(save,WEEK+WEEK_MS,type);
        expect(next.rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(count);
        expect(next.week.tokens).toBe(0);
        expect(next.week.bought).toEqual({});
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
    ensureEventWeek(s, WEEK, TYPE).tokens = 100;
    const unlimited = EVENT_SHOP[TYPE].find((g) => g.stock === null)!;
    const limited = EVENT_SHOP[TYPE].find((g) => g.stock !== null && g.stock! >= 2)!;

    const r1 = buyEventGoods(s, unlimited.id, WEEK, TYPE);
    expect(r1).toMatchObject({ ok: true, tokensSpent: unlimited.cost });
    expect(ensureEventWeek(s, WEEK, TYPE).bought[unlimited.id]).toBe(1);

    // 把限量货买到售罄
    const stock = limited.stock!;
    for (let i = 0; i < stock; i++) {
      ensureEventWeek(s, WEEK, TYPE).tokens += limited.cost;
      const r = buyEventGoods(s, limited.id, WEEK, TYPE);
      expect(r.ok).toBe(true);
    }
    expect(buyEventGoods(s, limited.id, WEEK, TYPE)).toMatchObject({ ok: false, code: 'SOLD_OUT' });
  });

  it('招牌兵种按周确定，保留对应玩法和主题', () => {
    for (const weekStart of [WEEK, WEEK + WEEK_MS, WEEK + WEEK_MS * 8]) {
      for (const typeId of ['invasion', 'raidBoss', 'factionAssault', 'worldEvent'] as const) {
        const shop = eventShopOf(saveWithTeam(), weekStart, typeId);
        const featured = shop.rows.find((row) => row.goods.troopRole)!.goods;
        const troop = getTroopById(featured.troopId!)!;
        expect(troop, `${typeId}:${weekStart}`).toBeTruthy();
        expect(eventShopOf(saveWithTeam(), weekStart, typeId).rows.find((row) => row.goods.id === featured.id)?.goods.troopId).toBe(troop.id);
        if (featured.troopRole === 'siegebreaker' || featured.troopRole === 'godslayer') {
          expect(troop.traits.some((trait) => trait?.code === featured.troopRole)).toBe(true);
        } else if (featured.troopRole === 'faction') {
          expect(troop.kingdom).toBe(shop.theme.kingdom);
        } else {
          expect(troop.troopTypes).toContain(shop.theme.bonusRace);
        }
      }
    }
  });

  it('购买活动兵种从该活动印记扣账，限购后正确入册', () => {
    const save = saveWithTeam();
    const row = eventShopOf(save, WEEK, TYPE).rows.find((entry) => entry.goods.troopRole)!;
    const troopId = row.goods.troopId!;
    const owned = save.collection[String(troopId)]?.copies ?? -1;
    ensureEventWeek(save, WEEK, TYPE).tokens = row.goods.cost;
    expect(buyEventGoods(save, row.goods.id, WEEK, TYPE)).toMatchObject({ ok: true, tokensLeft: 0, stockLeft: 0 });
    expect(save.collection[String(troopId)]?.copies).toBe(owned + 1);
    expect(buyEventGoods(save, row.goods.id, WEEK, TYPE)).toMatchObject({ ok: false, code: 'SOLD_OUT' });
    expect(ensureEventWeek(save, WEEK, 'raidBoss').tokens).toBe(0);
  });

  it('职业经验商品须装备已解锁职业，失败不扣印记', () => {
    const save = saveWithTeam();
    const week = ensureEventWeek(save, WEEK, 'classTrials');
    const goods = EVENT_SHOP.classTrials.find((entry) => entry.classXp)!;
    week.tokens = goods.cost;
    // 新档默认装备起始职业（2026-09-29），先卸下才能验「未装备职业」分支
    save.hero.classId = null;
    expect(buyEventGoods(save, goods.id, WEEK, 'classTrials')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(week.tokens).toBe(goods.cost);
    save.hero.classId = 'nightweaver';
    save.hero.classLevels.nightweaver = 1;
    expect(buyEventGoods(save, goods.id, WEEK, 'classTrials')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    save.hero.unlockedClasses.push('nightweaver');
    expect(buyEventGoods(save, goods.id, WEEK, 'classTrials')).toMatchObject({ ok: true, tokensLeft: 0 });
    expect(save.hero.classXp.nightweaver).toBeGreaterThan(0);
  });

  it('六活动代币不通兑、限量不串号，跨店商品 id 无法购买', () => {
    const s = saveWithTeam();
    ensureEventWeek(s, WEEK, 'invasion').tokens = 500;
    const raidGoods = EVENT_SHOP.raidBoss.find((goods) => goods.stock !== null)!;
    expect(buyEventGoods(s, raidGoods.id, WEEK, 'raidBoss')).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(buyEventGoods(s, raidGoods.id, WEEK, 'invasion')).toMatchObject({ ok: false, code: 'INVALID' });
    expect(ensureEventWeek(s, WEEK, 'invasion').tokens).toBe(500);
    ensureEventWeek(s, WEEK, 'raidBoss').tokens = 500;
    expect(buyEventGoods(s, raidGoods.id, WEEK, 'raidBoss')).toMatchObject({ ok: true });
    expect(eventShopOf(s, WEEK, 'raidBoss').rows.find((r) => r.goods.id === raidGoods.id)?.stockLeft).toBe(raidGoods.stock! - 1);
    expect(ensureEventWeek(s, WEEK, 'invasion').bought).toEqual({});
  });

  it('代币不足 → 整笔不动；未知商品拒绝；周切重置代币与已购', () => {
    const s = saveWithTeam();
    ensureEventWeek(s, WEEK, TYPE).tokens = 2;
    const anyGoods = EVENT_SHOP[TYPE][0]!;
    expect(buyEventGoods(s, anyGoods.id, WEEK, TYPE)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(buyEventGoods(s, '不存在的商品', WEEK, TYPE)).toMatchObject({ ok: false, code: 'INVALID' });
    expect(ensureEventWeek(s, WEEK, TYPE).tokens).toBe(2);

    ensureEventWeek(s, WEEK, TYPE).tokens = 500;
    ensureEventWeek(s, WEEK + WEEK_MS, TYPE); // 跨周
    expect(ensureEventWeek(s, WEEK + WEEK_MS, TYPE).tokens).toBe(0);
    expect(Object.keys(ensureEventWeek(s, WEEK + WEEK_MS, TYPE).bought)).toHaveLength(0);
  });

  it('胜场结算同步发代币（结算行备注可解释）', () => {
    const s = saveWithTeam();
    ensureEventWeek(s, WEEK, TYPE);
    const plan = planEventEncounter(s, WEEK, 781, TYPE);
    const result = { winner: 'player', turns: 8, defeatedExternalIds: [], combatants: [], eventSummary: [] } as unknown as Parameters<typeof applySettlement>[1];
    applySettlement(s, result, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(ensureEventWeek(s, WEEK, TYPE).tokens).toBe(eventTokensFor(eventPointsOf(plan)));
  });
});

describe('六种玩法机制（玩法差异化批）', () => {
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
      battleId: `meta-${plan.seed}`,
      winner: victory ? 'player' : 'enemy',
      turns: 8,
      combatants: [...player, ...enemies],
      defeatedExternalIds: [],
      eventSummary: [],
      seed: 42,
    } as unknown as BattleResult;
  };

  it('同周世界事件只按自己的物资领取里程碑，入侵积分保持不动', () => {
    const s = saveWithTeam();
    const inv = ensureEventWeek(s, WEEK, 'invasion');
    inv.points = 95;
    const world = ensureEventWeek(s, WEEK, 'worldEvent');
    world.eventData[EVENT_STATE_KEYS.supplies] = 14;
    const plan = planEventEncounter(s, WEEK, 902, 'worldEvent');
    const result = applySettlement(s, fakeResult(s, plan, true), { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(result.lines.filter((line) => line.key === 'event-milestone' && line.label.startsWith('里程碑'))).toHaveLength(2);
    expect(result.lines.filter((line) => line.key === 'event-milestone').reduce((sum, line) => sum + (line.deltas.gems ?? 0), 0)).toBe(300);
    expect(world.claimed).toEqual([0, 1]);
    expect(world.tokensEarned).toBe(world.tokens);
    expect(world.eventData[EVENT_STATE_KEYS.supplies]).toBeGreaterThanOrEqual(16);
    expect(inv).toMatchObject({ points: 95, claimed: [], tokens: 0 });
  });

  it('守土奖励按周额封顶，后续胜场仍推进并发积分和代币', () => {
    const s = saveWithTeam();
    const limit = EVENT_WEEKLY_PLAY_REWARD_CAP.invasion;
    for (let i = 0; i < 3 * (limit + 1); i++) {
      const plan = planEventEncounter(s, WEEK, 100 + i, 'invasion');
      applySettlement(s, fakeResult(s, plan, true), { plan, enemyByExternalId: new Map(), todayStart: 0 });
    }
    const week = ensureEventWeek(s, WEEK, 'invasion');
    expect(week.eventData[EVENT_STATE_KEYS.invRepelled]).toBe(limit + 1);
    expect(week.playRewards).toBe(limit);
    expect(s.currencies.glory).toBe(limit * 40 + EVENT_MILESTONES.invasion.reduce((sum, m) => sum + (m.glory ?? 0), 0));
    expect(week.wins).toBe(3 * (limit + 1));
    expect(week.points).toBeGreaterThan(0);
    expect(week.tokens).toBeGreaterThan(0);
  });

  it('入侵周防线推进：胜→推进，破第三防线=守土成功重赏，败→退回第 1 条', () => {
    const week = WEEK;
    const s = saveWithTeam();
    ensureEventWeek(s, week, 'invasion');
    const settle = (victory: boolean): void => {
      const plan = planEventEncounter(s, week, 555, 'invasion');
      eventBattleProgress(s, plan, fakeResult(s, plan, victory), victory);
    };
    settle(true);
    expect(ensureEventWeek(s, week, 'invasion').eventData[EVENT_STATE_KEYS.invLine]).toBe(2);
    settle(true);
    expect(ensureEventWeek(s, week, 'invasion').eventData[EVENT_STATE_KEYS.invLine]).toBe(3);
    const gloryBefore = s.currencies.glory;
    settle(true);
    expect(ensureEventWeek(s, week, 'invasion').eventData[EVENT_STATE_KEYS.invRepelled]).toBe(1);
    expect(ensureEventWeek(s, week, 'invasion').eventData[EVENT_STATE_KEYS.invLine]).toBe(1);
    expect(s.currencies.glory).toBe(gloryBefore + 40);
    settle(false);
    expect(ensureEventWeek(s, week, 'invasion').eventData[EVENT_STATE_KEYS.invLine]).toBe(1);
  });

  it('突袭首领：计划生成血池，伤害跨场累计，清零=讨伐成功并刷新更强首领', () => {
    const week = WEEK;
    const s = saveWithTeam();
    ensureEventWeek(s, week, 'raidBoss');
    const plan1 = planEventEncounter(s, week, 777, 'raidBoss');
    const max1 = ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossMax]!;
    expect(max1).toBeGreaterThan(0);
    expect(ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossHp]).toBe(max1);
    // 血池按阶层定额（与抽到的首领无关）；首领是第 0 位，打掉 30 点
    expect(max1).toBe(raidPoolOf(1));
    expect(plan1.enemies[0]!.tier).toBe('boss');
    const r = eventBattleProgress(s, plan1, fakeResult(s, plan1, true, { enemyHps: [max1 - 30, 200, 300] }), true);
    expect(ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossHp]).toBe(max1 - 30);
    expect(r.lines.some((l) => l.label.startsWith('首领伤害'))).toBe(true);
    ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossHp] = 1; // 残血（一场伤害必≥1，稳定触发讨伐成功）
    const gloryBefore = s.currencies.glory;
    const plan2 = planEventEncounter(s, week, 778, 'raidBoss');
    expect(ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossMax]).toBe(max1);
    eventBattleProgress(s, plan2, fakeResult(s, plan2, true, { enemyHps: [0, 0, 0] }), true);
    expect(ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossesSlain]).toBe(1);
    expect(ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossTier]).toBe(2);
    expect(s.currencies.glory).toBe(gloryBefore + 50);
    planEventEncounter(s, week, 779, 'raidBoss');
    expect(ensureEventWeek(s, week, 'raidBoss').eventData[EVENT_STATE_KEYS.bossMax]).toBeGreaterThan(max1);
  });

  it('难度曲线：Lv.20 起每阶段 +3，第 10 阶段进入最高档，胜 +3 / 败 -3 且不低于 50', () => {
    expect([0, 1, 9].map(eventStageLevel)).toEqual([20, 23, 47]);
    expect(towerFloorLevel(1)).toBe(20);
    expect(towerFloorLevel(25)).toBe(56);
    const s = saveWithTeam();
    const w = ensureEventWeek(s, WEEK, 'worldEvent');
    w.eventData.worldWins = 9;
    const normal = planEventEncounter(s, WEEK, 1, 'worldEvent');
    expect(normal.enemies[0]!.level).toBe(47);
    expect(normal.source).not.toHaveProperty('topTier');
    w.eventData.worldWins = EVENT_DIFFICULTY.topStages;
    const top = planEventEncounter(s, WEEK, 2, 'worldEvent');
    expect(top.enemies[0]!.level).toBe(50);
    expect(top.source).toMatchObject({ topTier: true });
    eventBattleProgress(s, top, fakeResult(s, top, true), true);
    expect(w.eventData[EVENT_STATE_KEYS.topLevel]).toBe(53);
    expect(planEventEncounter(s, WEEK, 3, 'worldEvent').enemies[0]!.level).toBe(53);
    const again = planEventEncounter(s, WEEK, 4, 'worldEvent');
    eventBattleProgress(s, again, fakeResult(s, again, false), false);
    eventBattleProgress(s, again, fakeResult(s, again, false), false);
    expect(w.eventData[EVENT_STATE_KEYS.topLevel]).toBe(50);
  });

  it('首领突袭按伤害计分：败场也得分，但不计胜场', () => {
    expect(raidPointsFor(0, 280)).toBe(0);
    expect(raidPointsFor(70, 280)).toBe(100);
    expect(raidPointsFor(280, 280)).toBe(120);
    expect(raidPointsFor(1, 1000)).toBe(10);
    const s = saveWithTeam();
    const plan = planEventEncounter(s, WEEK, 777, 'raidBoss');
    const max = ensureEventWeek(s, WEEK, 'raidBoss').eventData[EVENT_STATE_KEYS.bossMax]!;
    const res = fakeResult(s, plan, false, { enemyHps: [max - 70, 200, 300] });
    applySettlement(s, res, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    const week = ensureEventWeek(s, WEEK, 'raidBoss');
    expect(week.points).toBe(raidPointsFor(70, max));
    expect(week.wins).toBe(0);
    expect(week.tokens).toBeGreaterThan(0);
    expect(week.eventData[EVENT_STATE_KEYS.bossHp]).toBe(max - 70);
  });

  it('20 级前活动锁定：出战与兑换都被拒绝', () => {
    const s = saveWithTeam();
    s.hero.level = EVENT_UNLOCK_HERO_LEVEL - 1;
    expect(eventBattleReady(s, 'worldEvent', true)).toContain(`${EVENT_UNLOCK_HERO_LEVEL} 级`);
    ensureEventWeek(s, WEEK, TYPE).tokens = 100;
    const goods = EVENT_SHOP[TYPE].find((g) => g.stock === null)!;
    expect(buyEventGoods(s, goods.id, WEEK, TYPE)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(ensureEventWeek(s, WEEK, TYPE).tokens).toBe(100);
    s.hero.level = EVENT_UNLOCK_HERO_LEVEL;
    expect(eventBattleReady(s, 'worldEvent', true)).toBeNull();
  });

  it('末日之塔：开爬/通过推进/状态冻结/败北收尾', () => {
    const week = WEEK;
    const s = saveWithTeam();
    ensureEventWeek(s, week, 'towerOfDoom');
    const plan1 = planEventEncounter(s, week, 801, 'towerOfDoom');
    expect(ensureEventWeek(s, week, 'towerOfDoom').eventData[EVENT_STATE_KEYS.runActive]).toBe(1);
    expect(ensureEventWeek(s, week, 'towerOfDoom').eventData[EVENT_STATE_KEYS.floor]).toBe(1);
    eventBattleProgress(s, plan1, fakeResult(s, plan1, true, { playerHps: [150, 0, 200] }), true);
    expect(ensureEventWeek(s, week, 'towerOfDoom').eventData[EVENT_STATE_KEYS.floor]).toBe(2);
    expect(ensureEventWeek(s, week, 'towerOfDoom').runTeam!.filter((m) => !m.defeated)).toHaveLength(3);
    expect(ensureEventWeek(s, week, 'towerOfDoom').runTeam![0]!.maxHp).toBe(200);
    const plan2 = planEventEncounter(s, week, 802, 'towerOfDoom');
    const outcome = buildBattleRequest(s, plan2) as unknown as BridgeOutcome;
    expect(outcome.ok).toBe(true);
    applyEventBattleModifiers(s, outcome);
    expect(outcome.request.playerTeam).toHaveLength(3);
    const hero = outcome.request.playerTeam.find((snap) => snap.externalId === 'p0-hero'); // 新手队主角在第一位
    expect(hero?.stats.hp).toBe(200);
    expect(hero?.initialHp).toBe(150);
    eventBattleProgress(s, plan2, fakeResult(s, plan2, false), false);
    const weekState = ensureEventWeek(s, week, 'towerOfDoom');
    expect(weekState.eventData[EVENT_STATE_KEYS.runActive]).toBe(0);
    expect(weekState.eventData[EVENT_STATE_KEYS.floorBest]).toBe(1);
    expect(weekState.runTeam).toBeNull();
    expect(s.currencies.glory).toBe(2);
  });

  it('世界事件：胜场掉物资（里程碑按物资结算），败场不掉', () => {
    const week = WEEK;
    const s = saveWithTeam();
    ensureEventWeek(s, week, 'worldEvent');
    const plan = planEventEncounter(s, week, 901, 'worldEvent');
    eventBattleProgress(s, plan, fakeResult(s, plan, true), true);
    const supplies = ensureEventWeek(s, week, 'worldEvent').eventData[EVENT_STATE_KEYS.supplies]!;
    expect(supplies).toBeGreaterThanOrEqual(2);
    const metric = eventMetricOf(s, week, 'worldEvent');
    expect(metric.label).toBe('物资');
    expect(metric.value).toBe(supplies);
    const plan2 = planEventEncounter(s, week, 902, 'worldEvent');
    eventBattleProgress(s, plan2, fakeResult(s, plan2, false), false);
    expect(ensureEventWeek(s, week, 'worldEvent').eventData[EVENT_STATE_KEYS.supplies]).toBe(supplies);
  });

  it('职业试炼：连胜 ×1.3/×1.6 计分，败场清零', () => {
    const week = WEEK;
    const s = saveWithTeam();
    const weekState = ensureEventWeek(s, week, 'classTrials');
    const plan = planEventEncounter(s, week, 951, 'classTrials');
    const base = eventPointsOf(plan);
    let trialSeed = 1000;
    const settleWin = (): void => {
      const plan = planEventEncounter(s, week, trialSeed++, 'classTrials');
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
      if (currentEventTheme(candidate, 'factionAssault').kingdom === KINGDOM) {
        week = candidate;
      }
    }
    expect(week).toBeGreaterThanOrEqual(0);
    const s = saveWithTeam();
    const plan = planEventEncounter(s, week, 961, 'factionAssault');
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
    const week = WEEK;
    const s = saveWithTeam();
    ensureEventWeek(s, week, 'towerOfDoom');
    planEventEncounter(s, week, 971, 'towerOfDoom'); // 开爬，floor=1
    ensureEventWeek(s, week, 'towerOfDoom').eventData[EVENT_STATE_KEYS.floor] = 8; // 直接爬到第 8 层
    expect(ensureEventWeek(s, week, 'towerOfDoom').eventData[EVENT_STATE_KEYS.runActive]).toBe(1);
    const gloryBefore = s.currencies.glory;
    const r = abandonTowerRun(s, week);
    expect(r).toMatchObject({ ok: true, floorReached: 7, glory: 14, scrolls: 1 });
    expect(s.currencies.glory).toBe(gloryBefore + 14);
    expect(s.materials.forgeScrolls).toBe(1);
    const weekState = ensureEventWeek(s, week, 'towerOfDoom');
    expect(weekState.eventData[EVENT_STATE_KEYS.runActive]).toBe(0);
    expect(weekState.eventData[EVENT_STATE_KEYS.floorBest]).toBe(7);
    expect(weekState.runTeam).toBeNull();
    // 无 run 再放弃 → 拒绝
    expect(abandonTowerRun(s, week)).toMatchObject({ ok: false, code: 'INVALID' });
  });
});
