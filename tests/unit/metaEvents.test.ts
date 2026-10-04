/**
 * 六种常驻活动：独立主题与周实例、出敌校验、积分与里程碑入账、周切重置。
 */
import { describe, it, expect } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { EventsScreen } from '../../src/meta/screens/eventsScreen';
import type { ShellCtx } from '../../src/meta/shell/screen';
import { EVENT_MILESTONES, EVENT_TYPES, EVENT_UNLOCK_HERO_LEVEL, eventThemeOf, WEEK_MS } from '../../src/meta/data/events';
import {
  currentEventTheme,
  ensureEventWeek,
  eventBattlePoints,
  eventMilestonesReached,
  eventTokensFor,
  eventShopOf,
  eventPageState,
  buyEventGoods,
  planEventEncounter,
} from '../../src/meta/systems/events';
import { EVENT_SHOP } from '../../src/meta/data/events';
import { applySettlement } from '../../src/meta/systems/settlement';
import { parseStoneKey } from '../../src/meta/data/materials';
import type { EncounterPlan } from '../../src/meta/systems/encounter';
import { getTroopById } from '../../src/data/troops';

const OGRE = 6000;
const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS); // 对齐周一零点的任意锚点
const TYPE = 'invasion' as const;
const planOk = (...args: Parameters<typeof planEventEncounter>): EncounterPlan => planEventEncounter(...args) as EncounterPlan;

const saveWithTeam = () => {
  const s = newSave({ now: 0, starterTroopIds: [OGRE, 6097, 6457], currencies: { gold: 1000 } });
  s.hero.level = EVENT_UNLOCK_HERO_LEVEL; // 活动 20 级解锁
  return s;
};

describe('常驻活动与主题（data/events）', () => {

  it('六家货架保留各自代币商品，锻材和特质石按活动定位分流', () => {
    const goods = (type: keyof typeof EVENT_SHOP, id: string) => EVENT_SHOP[type].find(row => row.id === id)!;
    expect(goods('invasion', 'invasion_major').mats?.ingots).toEqual({ epic: 2 });
    expect(goods('invasion', 'invasion_scroll').mats?.ingots).toEqual({ ultraRare: 4 });
    expect(goods('raidBoss', 'raid_epic').mats?.ingots).toEqual({ mythic: 1 });
    expect(goods('raidBoss', 'raid_epic').stock).toBe(1);
    expect(EVENT_SHOP.towerOfDoom.filter(row => row.mats?.forgeScrolls).length).toBe(2);
    expect(EVENT_SHOP.towerOfDoom.every(row => !row.mats?.ingots)).toBe(true);
    expect(goods('towerOfDoom', 'tod_gold')).toMatchObject({ cost: 10, stock: null, gold: 3000 });
    expect(EVENT_SHOP.towerOfDoom.some(row => row.id === 'tod_rare')).toBe(false);
    expect(goods('factionAssault', 'fa_scroll').mats?.ingots).toEqual({ common: 8 });
    expect(goods('worldEvent', 'we_ingots').mats?.ingots).toEqual({ common: 10 });
    expect(EVENT_SHOP.classTrials.every(row => !row.mats?.ingots)).toBe(true);
    expect(goods('classTrials', 'ct_scroll').mats?.traitstones?.celestial).toBe(1);
    expect(goods('classTrials', 'ct_runic').classXp).toBe(5000);
    expect(goods('classTrials', 'ct_runic').stock).toBe(3);
    expect(EVENT_TYPES.every(type => EVENT_SHOP[type.id].some(row => row.troopRole || row.classXp || row.mats?.forgeScrolls || row.mats?.ingots))).toBe(true);
  });

  it('六种类型固定开放，单活动同周主题可复现', () => {
    expect(EVENT_TYPES).toHaveLength(6);
    expect(EVENT_TYPES.find(type => type.id === 'raidBoss')?.brief).toMatch(/^主要产出：钢锭/);
    expect(EVENT_TYPES.find(type => type.id === 'classTrials')?.brief).toMatch(/^主要产出：职业等级经验/);
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
          expect(key).toMatch(/^(common|rare|ultraRare|epic|mythic)$/);
        }
      }
    }
  });
});

describe('活动实例与出敌（systems/events）', () => {

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
    for (const { id } of EVENT_TYPES) {
      const other = ensureEventWeek(s, WEEK, id);
      if (id === 'invasion') continue;
      expect(other.points).toBe(0);
      expect(other.claimed).toEqual([]);
      expect(other.tokens).toBe(0);
      expect(other.bought).toEqual({});
      expect(other.eventData).toEqual({ revision: 3 });
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
    const p1 = planOk(s, WEEK, 12345, TYPE);
    const p2 = planOk(s, WEEK, 12345, TYPE);
    expect(p1.source).toMatchObject({ kind: 'event', weekStart: WEEK, typeId: TYPE });
    expect(p2.enemies).toEqual(p1.enemies);
    for (const e of p1.enemies) {
      expect(getTroopById(e.troopId)).toBeTruthy();
    }
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
  it('boss assault and ingot trial are separate routes with one fight each', () => {
    const save = saveWithTeam();
    const screen = new EventsScreen();
    const ctx = { save: () => save } as ShellCtx;
    const raid = screen.html(ctx, 'raidBoss');
    expect(raid).toContain('href="#events/raidBoss/forge"');
    expect([...raid.matchAll(/data-fight="([^"]+)"/g)].map(m => m[1])).toEqual(['raid']);
    expect(raid).not.toContain('data-act="ingot-tier:');
    const forge = screen.html(ctx, 'raidBoss/forge');
    expect(forge).toContain('href="#events/raidBoss"');
    expect([...forge.matchAll(/data-fight="([^"]+)"/g)].map(m => m[1])).toEqual(['ingot']);
    expect(forge).toContain('class="rd-forge-range"');
    expect(forge).toContain('max="12"');
    expect([...forge.matchAll(/class="rd-forge-step"/g)]).toHaveLength(2);
    expect(forge).not.toContain('class="rd-stage"');
    expect(forge).not.toContain('class="rd-roster"');
  });
  it('总览可进入六活动，六页均可出战，其他活动的领取状态不会误标', () => {
    const save = saveWithTeam();
    const week = weekStartOf(Date.now());
    ensureEventWeek(save, week, TYPE).claimed = [0];
    const ctx = { save: () => save } as ShellCtx;
    const screen = new EventsScreen();
    const overview = screen.html(ctx);
    expect([...overview.matchAll(/<a class="ev-overview-main" href="#events\/([^"]+)"/g)].map(m => m[1]))
      .toEqual(['raidBoss', 'classTrials', 'towerOfDoom', 'worldEvent', 'invasion', 'factionAssault']);
    expect(overview).toContain('<div class="ev-overview-progress"><span>武器淬炼素材</span>');
    expect(overview).toContain('<div class="ev-overview-progress"><span>职业等级加成</span>');
    expect(screen.html(ctx, 'classTrials/rewards')).toContain('荣耀赏金');
    const raid = screen.html(ctx, 'raidBoss');
    expect(raid).toContain('\u989d\u5916\u6389\u843d\uff1a\u5b9d\u77f3\u3001\u85cf\u5b9d\u56fe');
    expect(raid).not.toContain('rd-tired');
    expect(raid).not.toContain('\u672c\u9636\u6bb5\u5df2\u75b2\u60eb');
    expect(raid).not.toContain('\u5355\u573a\u6253\u6389');
    for (const { id } of EVENT_TYPES) {
      expect(overview).toContain(`href="#events/${id}"`);
      const page = screen.html(ctx, id);
      expect(page).toContain('class="ev-main ev-board"');
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
    const plan = planOk(s, WEEK, 777, TYPE);
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
    const gained = eventBattlePoints(s, plan, result, true);
    expect(gained).toBeGreaterThanOrEqual(100);
    const detail = applySettlement(s, result, { plan, enemyByExternalId, todayStart: 0 });
    const pointsLine = detail.lines.find((l) => l.key === 'event-points');
    expect(pointsLine).toBeTruthy();
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
    const plan = planOk(s, WEEK, 778, TYPE);
    const before = ensureEventWeek(s, WEEK, TYPE).points;
    const result = { winner: 'enemy', turns: 8, defeatedExternalIds: [], combatants: [], eventSummary: [] } as unknown as Parameters<typeof applySettlement>[1];
    applySettlement(s, result, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(ensureEventWeek(s, WEEK, TYPE).points).toBe(before);
  });
});

describe('活动商店与代币（2026-09-19 追补）', () => {
  it('Event shelves keep distinctive rewards, with one unlimited tower gold exchange', () => {
    const seen = new Set<string>();
    const counts: Record<string, number> = { invasion: 7, raidBoss: 8, towerOfDoom: 6, factionAssault: 7, worldEvent: 6, classTrials: 6 };
    for (const [typeId, goods] of Object.entries(EVENT_SHOP)) {
      expect(goods, typeId).toHaveLength(counts[typeId]);
      expect(goods.reduce((sum,g)=>sum+g.cost*(g.stock ?? 0),0),typeId).toBeGreaterThan(360);
      for (const g of goods) {
        expect(seen.has(g.id), g.id).toBe(false);
        seen.add(g.id);
        expect(g.cost).toBeGreaterThan(0);
        if (g.id === 'tod_gold') expect(g.stock).toBeNull();
        else expect(g.stock).toBeGreaterThanOrEqual(1);
        expect(g.id).not.toMatch(/_surplus$/);
        for (const key of ['gold', 'souls', 'goldKeys', 'glory'] as const) {
          if (g.id !== 'tod_gold') expect(g[key], g.id).toBeUndefined();
        }
        expect(g.gems).toBeUndefined();
        const hasReward =
          Object.keys(g.mats?.ingots ?? {}).length + Object.keys(g.mats?.traitstones ?? {}).length > 0 ||
          (g.mats?.forgeScrolls ?? 0) > 0 || !!g.troopRole || (g.classXp ?? 0) > 0 || (g.gold ?? 0) > 0;
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

  it('event shop steel totals exclude tower after replacing its two steel offers', () => {
    const totals = Object.fromEntries(Object.entries(EVENT_SHOP).map(([type, rows]) => [type,
      rows.reduce((sum, goods) => sum + Object.values(goods.mats?.ingots ?? {}).reduce((n, amount) => n + (amount ?? 0), 0) * (goods.stock ?? 0), 0),
    ]));
    expect(totals).toEqual({ invasion: 32, raidBoss: 65, towerOfDoom: 0, factionAssault: 151, worldEvent: 156, classTrials: 0 });
    expect(Object.values(totals).reduce((sum, amount) => sum + amount, 0)).toBe(404);
  });

  it('unlimited tower gold exchange spends ten tokens per 3000 gold with no steel credited', () => {
    const save = saveWithTeam();
    const week = ensureEventWeek(save, WEEK, 'towerOfDoom');
    week.tokens = 40;
    week.tokensEarned = 40;
    const beforeGold = save.currencies.gold;
    const beforeIngots = structuredClone(save.materials.ingots);
    for (let i = 0; i < 4; i++) {
      expect(buyEventGoods(save, 'tod_gold', WEEK, 'towerOfDoom')).toMatchObject({ ok: true, tokensSpent: 10, tokensLeft: 30 - i * 10, stockLeft: null });
      expect(eventShopOf(save, WEEK, 'towerOfDoom').rows.find(row => row.goods.id === 'tod_gold')?.stockLeft).toBeNull();
    }
    expect(save.currencies.gold - beforeGold).toBe(12000);
    expect(save.materials.ingots).toEqual(beforeIngots);
    expect(buyEventGoods(save, 'tod_gold', WEEK, 'towerOfDoom')).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(buyEventGoods(save, 'tod_rare', WEEK, 'towerOfDoom')).toMatchObject({ ok: false, code: 'INVALID' });
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
    const limited = EVENT_SHOP[TYPE].find((g) => g.stock !== null && g.stock >= 2)!;

    const r1 = buyEventGoods(s, limited.id, WEEK, TYPE);
    expect(r1).toMatchObject({ ok: true, tokensSpent: limited.cost });
    expect(ensureEventWeek(s, WEEK, TYPE).bought[limited.id]).toBe(1);

    // 把限量货买到售罄
    const stock = limited.stock!;
    for (let i = 1; i < stock; i++) {
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
    expect(goods.classXp).toBe(5000);
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
    const plan = planOk(s, WEEK, 781, TYPE);
    const result = { winner: 'player', turns: 8, defeatedExternalIds: [], combatants: [], eventSummary: [] } as unknown as Parameters<typeof applySettlement>[1];
    const points = eventBattlePoints(s, plan, result, true);
    applySettlement(s, result, { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(ensureEventWeek(s, WEEK, TYPE).tokens).toBe(eventTokensFor(points));
  });
});

