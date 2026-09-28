import { describe, it, expect } from 'vitest';
import {
  collectTribute,
  newSave,
  tributeChance,
  tributeHourHit,
  tributePreview,
  TRIBUTE,
} from '../../src/meta';
import { collectAllTribute, tributeTreasury } from '../../src/meta/systems/tribute';
import { tributeMultiBonus, TRIBUTE_MULTI_BONUS } from '../../src/meta/data/economy';
import { TRIBUTE_PROFILES, tributeProfileOf, tributeSpecialtyOf, tributeYield } from '../../src/meta/data/kingdomTribute';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { setHomeKingdom } from '../../src/meta/systems/kingdomOps';
import { hydrateSave } from '../../src/meta/state/save';

const KINGDOM = '破碎尖塔';
const HOUR_MS = 3_600_000;
const save = () => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  s.homeKingdom = null; // 大部分用例不看主城翻倍
  return s;
};

/** 独立复算：从 last 起可结算的 hours 与命中数（与实现同一套小时口径） */
function expectHits(kingdom: string, level: number, last: number, now: number) {
  const hours = Math.min(Math.max(0, Math.floor((now - last) / HOUR_MS)), TRIBUTE.capHours);
  const firstHour = Math.floor(last / HOUR_MS) + 1;
  let hits = 0;
  for (let i = 0; i < hours; i++) {
    if (tributeHourHit(kingdom, firstHour + i, level)) hits += 1;
  }
  return { hours, hits };
}

describe('进贡配比（GoW 官方基数 + 设计值）', () => {
  it('42 个王国都有配比；官方 20 国与 GoW 1.0.8 进贡表一致', () => {
    for (const k of KINGDOM_ORDER) expect(TRIBUTE_PROFILES[k], k).toBeDefined();
    expect(Object.values(TRIBUTE_PROFILES).filter((p) => p.official)).toHaveLength(20);
    expect(tributeProfileOf('破碎尖塔')).toMatchObject({ gold: 200, souls: 8, glory: 0, official: true });
    expect(tributeProfileOf('阿达纳')).toMatchObject({ gold: 175, souls: 4, glory: 2 });
    expect(tributeProfileOf('盖塔尔')).toMatchObject({ gold: 0, souls: 40, glory: 0 }); // Khetar
    expect(tributeProfileOf('白盔国')).toMatchObject({ gold: 0, souls: 0, glory: 10 }); // Whitehelm
  });

  it('三种货币都有专精王国可选（主城选择有意义）', () => {
    const specialties = new Set(KINGDOM_ORDER.map(tributeSpecialtyOf));
    expect(specialties.has('gold')).toBe(true);
    expect(specialties.has('souls')).toBe(true);
    expect(specialties.has('glory')).toBe(true);
    expect(tributeSpecialtyOf('卡其尔')).toBe('gold');
    expect(tributeSpecialtyOf('盖塔尔')).toBe('souls');
    expect(tributeSpecialtyOf('白盔国')).toBe('glory');
  });

  it('产出随等级放大，灵魂按基数 ×2，主城翻倍', () => {
    expect(tributeYield(KINGDOM, 1)).toEqual({ gold: 200, souls: 16, glory: 0 });
    expect(tributeYield(KINGDOM, 10)).toEqual({ gold: 920, souls: 74, glory: 0 });
    expect(tributeYield(KINGDOM, 1, true)).toEqual({ gold: 400, souls: 32, glory: 0 });
    expect(tributeYield('白盔国', 10).glory).toBe(19);
  });

  it('概率 5%/级、75% 封顶', () => {
    expect(tributeChance(1)).toBeCloseTo(0.05);
    expect(tributeChance(10)).toBeCloseTo(0.5);
    expect(tributeChance(20)).toBeCloseTo(0.75);
  });

  it('多国同时进贡加成：不足 2 国为 0，取满足的最高档', () => {
    expect(tributeMultiBonus(0)).toEqual({ gems: 0, goldKeys: 0 });
    expect(tributeMultiBonus(1)).toEqual({ gems: 0, goldKeys: 0 });
    expect(tributeMultiBonus(2)).toEqual({ gems: 1, goldKeys: 0 });
    expect(tributeMultiBonus(3)).toEqual({ gems: 3, goldKeys: 1 });
    const top = TRIBUTE_MULTI_BONUS[TRIBUTE_MULTI_BONUS.length - 1]!;
    expect(tributeMultiBonus(99)).toEqual({ gems: top.gems, goldKeys: top.goldKeys });
  });
});

describe('进贡（离线结算）', () => {
  it('预览只读且确定：同参数两次一致；离线 30 小时按 12 小时封顶；产出 = 命中 × 配比', () => {
    const s = save();
    const t30h = 30 * HOUR_MS;
    const a = tributePreview(s, KINGDOM, t30h);
    const b = tributePreview(s, KINGDOM, t30h);
    expect(b).toEqual(a);
    expect(a.hours).toBe(TRIBUTE.capHours);
    expect(a.hits).toBe(expectHits(KINGDOM, 1, 0, t30h).hits);
    expect(a.hitHours).toHaveLength(a.hits);
    const per = tributeYield(KINGDOM, 1);
    expect(a.gold).toBe(a.hits * per.gold);
    expect(a.souls).toBe(a.hits * per.souls);
    expect(a.glory).toBe(a.hits * per.glory);
    expect(a.goldKeys).toBe(0);
    expect(a.ready).toBe(a.gold > 0 || a.souls > 0 || a.glory > 0);
  });

  it('M-4/M-10 口径：ready 只看产出；满溢与下一袋时刻可算', () => {
    const s = save();
    const atCap = tributePreview(s, KINGDOM, TRIBUTE.capHours * HOUR_MS);
    expect(atCap.hours).toBe(TRIBUTE.capHours);
    expect(atCap.pendingHours).toBe(TRIBUTE.capHours);
    expect(atCap.overflowing).toBe(false);
    const over = tributePreview(s, KINGDOM, 30 * HOUR_MS);
    expect(over.pendingHours).toBe(30);
    expect(over.overflowing).toBe(true);
    expect(over.capAt).toBe(TRIBUTE.capHours * HOUR_MS);
    expect(over.nextHourAt).toBe(31 * HOUR_MS);
    const fresh = tributePreview(s, KINGDOM, 0);
    expect(fresh.hours).toBe(0);
    expect(fresh.ready).toBe(false);
    expect(fresh.nextHourAt).toBe(HOUR_MS);
  });

  it('单国收取入账并推进锚点；同一时刻再收为空（幂等）；溢出时锚点拨到 now', () => {
    const s = save();
    const now = 24 * HOUR_MS;
    const expected = expectHits(KINGDOM, 1, 0, now);
    const goldBefore = s.currencies.gold;
    const soulsBefore = s.currencies.souls;
    const collected = collectTribute(s, KINGDOM, now);
    expect(collected.collected.hits).toBe(expected.hits);
    const per = tributeYield(KINGDOM, 1);
    expect(s.currencies.gold).toBe(goldBefore + expected.hits * per.gold);
    expect(s.currencies.souls).toBe(soulsBefore + expected.hits * per.souls);
    expect(s.kingdoms[KINGDOM]?.lastTributeAt).toBe(now);
    expect(s.stats.goldEarned).toBe(expected.hits * per.gold);
    expect(tributePreview(s, KINGDOM, now).ready).toBe(false);
  });

  it('没溢出时收取不吞掉正在累积的半小时', () => {
    const s = save();
    s.kingdoms[KINGDOM] = { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    collectTribute(s, KINGDOM, 5.5 * HOUR_MS);
    expect(s.kingdoms[KINGDOM]!.lastTributeAt).toBe(5 * HOUR_MS);
  });

  it('主城进贡翻倍；未开放王国不能设为主城；旧档缺省主城 = 起始王国', () => {
    const s = save();
    s.kingdoms[KINGDOM] = { level: 3, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    const plain = tributePreview(s, KINGDOM, 12 * HOUR_MS);
    expect(setHomeKingdom(s, KINGDOM)).toEqual({ ok: true, home: KINGDOM });
    const home = tributePreview(s, KINGDOM, 12 * HOUR_MS);
    expect(home.home).toBe(true);
    expect(home.gold).toBe(plain.gold * 2);
    expect(setHomeKingdom(s, KINGDOM_ORDER[30]!)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete legacy.homeKingdom;
    expect(hydrateSave(legacy).homeKingdom).toBe(KINGDOM);
    expect(hydrateSave({ ...legacy, homeKingdom: null }).homeKingdom).toBeNull();
  });
});

describe('一键收取（宝库）', () => {
  /** 冒险者 20 级、前 20 国 10 级：保证有同小时多国进贡 */
  function richSave() {
    const s = save();
    s.hero.level = 20;
    for (const k of KINGDOM_ORDER.slice(0, 20)) {
      s.kingdoms[k] = { level: 10, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    }
    return s;
  }

  it('只统计已开放王国；多国同小时 → 宝石/金钥匙，与逐小时复算一致', () => {
    const s = richSave();
    const now = 12 * HOUR_MS;
    const t = tributeTreasury(s, now);
    expect(t.kingdoms.map((p) => p.kingdom)).toEqual(KINGDOM_ORDER.slice(0, 20));
    const counts = new Map<number, number>();
    for (const k of KINGDOM_ORDER.slice(0, 20)) {
      for (let hour = 1; hour <= 12; hour++) {
        if (tributeHourHit(k, hour, 10)) counts.set(hour, (counts.get(hour) ?? 0) + 1);
      }
    }
    let gems = 0;
    let keys = 0;
    for (const c of counts.values()) {
      gems += tributeMultiBonus(c).gems;
      keys += tributeMultiBonus(c).goldKeys;
    }
    expect(gems).toBeGreaterThan(0);
    expect(t.totals.gems).toBe(gems);
    expect(t.totals.goldKeys).toBe(keys);
    expect(t.totals.gold).toBe(t.kingdoms.reduce((sum, p) => sum + p.gold, 0));
    expect(t.bonuses.every((b) => b.kingdoms.length >= 2)).toBe(true);
  });

  it('收取入账五种货币并推进全部锚点；再收为空', () => {
    const s = richSave();
    const now = 12 * HOUR_MS;
    const before = { ...s.currencies };
    const { haul } = collectAllTribute(s, now);
    expect(s.currencies.gold - before.gold).toBe(haul.totals.gold);
    expect(s.currencies.souls - before.souls).toBe(haul.totals.souls);
    expect(s.currencies.glory - before.glory).toBe(haul.totals.glory);
    expect(s.currencies.gems - before.gems).toBe(haul.totals.gems);
    expect(s.currencies.goldKeys - before.goldKeys).toBe(haul.totals.goldKeys);
    expect(haul.totals.souls).toBeGreaterThan(0);
    expect(haul.totals.glory).toBeGreaterThan(0);
    const again = tributeTreasury(s, now);
    expect(again.ready).toBe(false);
    expect(again.totals).toEqual({ gold: 0, souls: 0, glory: 0, gems: 0, goldKeys: 0 });
  });
});
