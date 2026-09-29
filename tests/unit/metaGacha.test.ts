import { describe, it, expect, vi, afterEach } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { isFailure } from '../../src/meta/gateway';
import {
  GACHA_PITY_MIN_IDX,
  GEM_CHEST,
  GEM_CHEST_BASE,
  GEM_CHEST_EXTRA,
  GEM_CHEST_WEIGHTS,
  CHEST_LOOT_BASE,
  GLORY_CHEST,
  GLORY_CHEST_LOOT,
  GOLD_CHEST,
  GOLD_CHEST_LOOT,
  grantTroop,
  newSave,
  openGemChest,
  openGloryChest,
  openGoldChest,
} from '../../src/meta';

const save = (gems = 0, goldKeys = 0) =>
  newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gems, goldKeys } });

describe('宝石宝箱（150 单抽 / 1500 十连保底稀有或以上）', () => {
  afterEach(() => vi.restoreAllMocks());
  it('权重表对齐 GoW 官方：部队 80%（不出普通/精良，神话维持 0.2%）+ 金属锭 10% + 特质石 10%', () => {
    expect(GEM_CHEST_WEIGHTS).toEqual([0, 0, 6710, 1070, 200, 20]);
    expect(GEM_CHEST_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(8000);
    const extra = GEM_CHEST_EXTRA.reduce((a, row) => a + row.weight, 0);
    // 材料表是十万分比，必须恰好补满宝石箱剩余的 20%
    expect(extra / CHEST_LOOT_BASE).toBeCloseTo((GEM_CHEST_BASE - 8000) / GEM_CHEST_BASE, 10);
    const sum = (group: string) => GEM_CHEST_EXTRA.filter((row) => row.group === group).reduce((a, row) => a + row.weight, 0);
    expect([sum('ingot'), sum('stone')]).toEqual([10_000, 10_000]);
    expect(GACHA_PITY_MIN_IDX).toBe(2);
  });

  it('宝石不足 → INSUFFICIENT 且不出卡', () => {
    const r = openGemChest(save(149), 1, 1);
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    const ten = openGemChest(save(1499), 2, 10);
    expect(ten).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
  });

  it('单抽：扣 150、进日志；出卡时卡真实存在，否则材料已入账', () => {
    const s = save(150);
    const r = openGemChest(s, 12345, 1);
    if (!r.ok) throw new Error(r.message);
    expect(r.spent).toEqual({ gems: 150 });
    expect(s.currencies.gems).toBe(0);
    expect(s.gachaLog[0]).toMatchObject({ kind: 'gem', seed: 12345 });
    expect(s.gachaLog[0]!.troops).toEqual(r.cards.map((c) => c.troopId));
    if (r.cards.length) expect(getTroopById(r.cards[0]!.troopId)).toBeTruthy();
    else expect(Object.keys({ ...r.materials.ingots, ...r.materials.traitstones }).length).toBe(1);
  });

  it('十连保底：各种子下必出稀有或以上部队；部队只来自稀有及以上', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = save(1500);
      const r = openGemChest(s, seed, 10);
      if (!r.ok) throw new Error(r.message);
      expect(s.currencies.gems).toBe(0);
      expect(r.cards.length).toBeGreaterThanOrEqual(1);
      expect(r.cards.every((c) => c.rarityIdx >= GACHA_PITY_MIN_IDX)).toBe(true);
      const materials = Object.values({ ...r.materials.ingots, ...r.materials.traitstones }).reduce((a, n) => a + n!, 0);
      expect(r.cards.length + materials).toBe(10); // 一抽一项
    }
  });

  /**
   * 每抽固定两次 RNG：先选档（下标 6 = 材料抽），再选档内角色 / 材料行。
   * 材料行喂 0 → 首行「超稀钢锭」，金属锭不再掷色，所以材料抽同样只耗两次。
   */
  function mockGemBands(bands: readonly number[]): void {
    const all = [...GEM_CHEST_WEIGHTS, GEM_CHEST_BASE - GEM_CHEST_WEIGHTS.reduce((a, b) => a + b, 0)];
    const rolls = bands.flatMap((band) => {
      const lower = all.slice(0, band).reduce((a, b) => a + b, 0);
      return [(lower + all[band]! / 2) / GEM_CHEST_BASE, 0];
    });
    let index = 0;
    vi.spyOn(SeededRNG.prototype, 'next').mockImplementation(() => rolls[index++] ?? 0);
  }

  it('十张全是材料抽时，仅将末张换成稀有部队，不额外发卡', () => {
    mockGemBands(Array<number>(10).fill(6));
    const s = newSave({ now: 0, currencies: { gems: GEM_CHEST.multiCost } });
    const r = openGemChest(s, 1, GEM_CHEST.multiCount);
    if (!r.ok) throw new Error(r.message);
    expect(r.pityUsed).toBe(true);
    expect(r.cards.map((card) => card.rarityIdx)).toEqual([2]);
    expect(s.currencies.gems).toBe(0);
    expect(s.gachaLog[0]!.troops).toEqual(r.cards.map((card) => card.troopId));
    expect(s.gachaLog[0]!.audit!.reasons).toEqual(['ten-pity']);
  });

  it.each([2, 3, 4, 5])('前九张都是材料，第十张自然出档位 %i 时保留原档位', (band) => {
    mockGemBands([...Array<number>(9).fill(6), band]);
    const r = openGemChest(save(GEM_CHEST.multiCost), 1, GEM_CHEST.multiCount);
    if (!r.ok) throw new Error(r.message);
    expect(r.pityUsed).toBe(false);
    expect(r.cards.map((card) => card.rarityIdx)).toEqual([band]);
  });

  it('单抽出材料时不触发保底、不出卡', () => {
    mockGemBands([6]);
    const r = openGemChest(save(GEM_CHEST.singleCost), 1);
    if (!r.ok) throw new Error(r.message);
    expect(r.pityUsed).toBe(false);
    expect(r.cards).toHaveLength(0);
  });

  it('对账审计：3000 次单抽的档位频率与权重表一致（固定种子，确定可复现）', () => {
    const N = 3000;
    const s = save(N * GEM_CHEST.singleCost);
    const bands = [0, 0, 0, 0, 0, 0];
    let dups = 0;
    let materials = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r = openGemChest(s, seed, 1);
      if (!r.ok) throw new Error(r.message);
      if (!r.cards.length) materials += 1;
      for (const card of r.cards) {
        bands[card.rarityIdx]! += 1;
        if (card.duplicate) dups += 1;
      }
    }
    expect(materials).toBeGreaterThan(N * 0.2 * 0.8);
    expect(materials).toBeLessThan(N * 0.2 * 1.2);
    const expected = GEM_CHEST_WEIGHTS.map((w) => (w / GEM_CHEST_BASE) * N);
    for (let idx = 0; idx < 6; idx++) {
      const exp = expected[idx]!;
      // 期望样本少的档给宽区间（二项分布尾部），期望 ≥100 的档 ±25%
      const lo = exp >= 100 ? exp * 0.75 : Math.max(0, exp * 0.25);
      const hi = exp >= 100 ? exp * 1.25 : Math.max(8, exp * 3);
      expect(bands[idx]).toBeGreaterThanOrEqual(Math.floor(lo));
      expect(bands[idx]).toBeLessThanOrEqual(Math.ceil(hi) + 8);
    }
    // 重复卡语义：2000+ 抽在 1798 池里必有重复，重复都进了 copies
    expect(dups).toBeGreaterThan(0);
    expect(s.gachaLog.length).toBeLessThanOrEqual(50);
    expect(s.gachaLog[0]!.seed).toBe(N); // 新的在前
  });
});

describe('金钥匙宝箱（GoW 黄金宝箱口径：资源/特质石为主，部队到稀有，传说千分之一）', () => {
  it('掉落表合法：合计 100%，资源 62 / 特质石 25 / 部队 13，不含史诗与神话，传说 0.1%', () => {
    const sum = (group: string) => GOLD_CHEST_LOOT.filter((row) => row.group === group).reduce((a, row) => a + row.weight, 0);
    expect(GOLD_CHEST_LOOT.reduce((a, row) => a + row.weight, 0)).toBe(CHEST_LOOT_BASE);
    expect([sum('resource'), sum('stone'), sum('troop')]).toEqual([62_000, 25_000, 13_000]);
    const troops = GOLD_CHEST_LOOT.flatMap((row) => row.loot.type === 'troop' ? [row] : []);
    expect(Math.max(...troops.map((row) => (row.loot as { rarityIdx: number }).rarityIdx))).toBe(3);
    expect(troops.find((row) => (row.loot as { rarityIdx: number }).rarityIdx === 3)!.weight).toBe(100);
    expect(GOLD_CHEST.keyGoldPrice).toBe(300);
  });

  it('金钥匙不足且不补 → INSUFFICIENT', () => {
    expect(openGoldChest(save(0, 0), 1)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
  });

  it('开箱：扣 1 钥匙、一箱一项；千箱内部队只到传说、多数是资源与特质石', () => {
    const s = save(0, 0);
    let troops = 0;
    let maxIdx = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      s.currencies.goldKeys = 1;
      const r = openGoldChest(s, seed);
      if (!r.ok) throw new Error(r.message);
      expect(r.spent).toEqual({ goldKeys: 1 });
      expect(r.count).toBe(1);
      troops += r.cards.length;
      for (const card of r.cards) maxIdx = Math.max(maxIdx, card.rarityIdx);
    }
    expect(maxIdx).toBeLessThanOrEqual(3);
    expect(troops).toBeGreaterThan(70); // 13% ± 抽样误差
    expect(troops).toBeLessThan(200);
  });

  it('钥匙不足时 buyMissingKeys：7 钥匙 + 900 黄金开十连，一笔原子成交', () => {
    const s = save(0, 7);
    s.currencies.gold = 1_000;
    const r = openGoldChest(s, 99, 10, { buyMissingKeys: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.spent).toEqual({ goldKeys: 7, gold: 900 });
    expect(r.boughtKeys).toBe(3);
    expect(s.currencies.goldKeys).toBe(0);
    expect(s.currencies.gold).toBe(100 + r.currencies.gold);
    expect(r.count).toBe(10);
    expect(s.gachaLog).toHaveLength(1);
  });

  it('零钥匙时 buyMissingKeys 单开：扣 300 黄金', () => {
    const s = save(0, 0);
    s.currencies.gold = 300;
    const r = openGoldChest(s, 5, 1, { buyMissingKeys: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.spent).toEqual({ gold: 300 });
    expect(r.boughtKeys).toBe(1);
  });

  it('黄金不够补齐 → 整批不成交：钥匙、黄金、收藏都不动', () => {
    const s = save(0, 7);
    s.currencies.gold = 899;
    const before = structuredClone(s);
    expect(openGoldChest(s, 99, 10, { buyMissingKeys: true })).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s).toEqual(before);
  });

  it('重复获得进 copies：已持有的普通卡再从金宝箱抽到必标 duplicate', () => {
    const s = save(0, 0);
    // 预持有全部普通卡 → 任何普通档抽卡都必然是重复
    for (const t of TROOPS) {
      if (t.rarityIdx === 0) grantTroop(s, t.id, 1);
    }
    let commonPulls = 0;
    for (let seed = 100; seed < 400; seed++) {
      s.currencies.goldKeys = 1;
      const r = openGoldChest(s, seed, 1);
      if (!r.ok) throw new Error(r.message);
      for (const card of r.cards) {
        if (card.rarityIdx !== 0) continue;
        commonPulls += 1;
        expect(card.duplicate).toBe(true);
        expect(s.collection[String(card.troopId)]!.copies).toBeGreaterThanOrEqual(1);
      }
    }
    expect(commonPulls).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CH-1 回归锁（阶段 B 窗口 O 批次 0）：金钥匙十连必须原子
// 阶段 A 实测坏数值（u4-gold10-verify.log）：钥匙 7 → 0（扣光）、collection +5 条 / 副本 +2
// （7 张卡已持久化）、演出没开、toast 反报「不足」。根因是 UI 层"循环 10 次单抽"。
// 下面把坏数值打成断言：要么 0 消耗 0 入账，要么 N 消耗 N 入账，不允许中间态。
// ---------------------------------------------------------------------------

/** 收藏条目数与总张数（本体 + 副本），用于核对"扣了但没入账"或"入账了但没扣" */
function collectionStats(s: ReturnType<typeof save>): { entries: number; copies: number } {
  const recs = Object.values(s.collection);
  return { entries: recs.length, copies: recs.reduce((sum, r) => sum + 1 + r.copies, 0) };
}

describe('CH-1 · 金钥匙十连原子性', () => {
  it('7 把钥匙开十连 → 整批不成交：钥匙不动、零入账、零日志', () => {
    const s = save(0, 7);
    const before = collectionStats(s);
    const r = openGoldChest(s, 4242, 10);
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.currencies.goldKeys).toBe(7); // 阶段 A 这里是 0（扣光）
    expect(collectionStats(s)).toEqual(before); // 阶段 A 这里是 +5 条 / +2 副本
    expect(s.gachaLog).toHaveLength(0);
  });

  it('7 把钥匙显式开 7 次 → 整批成交：扣 7、开 7 箱、部队卡全部入账、一条日志', () => {
    const s = save(0, 7);
    const before = collectionStats(s);
    const r = openGoldChest(s, 4242, 7);
    if (!r.ok) throw new Error(r.message);
    expect(r.count).toBe(7);
    expect(r.spent).toEqual({ goldKeys: 7 });
    expect(s.currencies.goldKeys).toBe(0);
    const after = collectionStats(s);
    expect(after.copies - before.copies).toBe(r.cards.length); // 出卡张数 == 入账张数
    expect(s.gachaLog).toHaveLength(1);
    expect(s.gachaLog[0]!.troops).toEqual(r.cards.map((c) => c.troopId));
  });

  it('同种子同存档结果确定；十连一次扣 10 钥匙', () => {
    const a = save(0, 10);
    const b = save(0, 10);
    const ra = openGoldChest(a, 777, 10);
    const rb = openGoldChest(b, 777, 10);
    if (!ra.ok || !rb.ok) throw new Error('open failed');
    expect(ra.count).toBe(10);
    expect(a.currencies.goldKeys).toBe(0);
    expect({ ...ra, cards: ra.cards.map((c) => c.troopId) }).toEqual({ ...rb, cards: rb.cards.map((c) => c.troopId) });
  });

  it('count 越界（0 / 11 / 小数）→ INVALID 且一把钥匙都不扣', () => {
    for (const bad of [0, -1, 11, 1.5]) {
      const s = save(0, 10);
      const r = openGoldChest(s, 1, bad);
      expect(r).toMatchObject({ ok: false, code: 'INVALID' });
      expect(s.currencies.goldKeys).toBe(10);
      expect(s.gachaLog).toHaveLength(0);
    }
  });
});

describe('CH-1 · 网关层原子性（落盘不被污染）', () => {
  it('7 把钥匙调 openChest("gold", 10) 失败后落盘仍是 7；改开 7 次才成交', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    await gw.load();
    const live = gw.current();
    live.currencies.goldKeys = 7;
    const entriesBefore = Object.keys(live.collection).length;

    const ten = await gw.openChest('gold', 10);
    expect(isFailure(ten.result)).toBe(true);
    expect(gw.current().currencies.goldKeys).toBe(7);
    expect(Object.keys(gw.current().collection).length).toBe(entriesBefore);
    // 重开一个网关读同一份 storage：落盘也不能被污染
    const reopened = new MockGateway(storage);
    const snap = await reopened.load();
    expect(snap.save.currencies.goldKeys).toBe(7);

    const seven = await gw.openChest('gold', 7);
    if (isFailure(seven.result)) throw new Error(seven.result.message);
    expect('count' in seven.result && seven.result.count).toBe(7);
    expect(gw.current().currencies.goldKeys).toBe(0);
  });
});

describe('荣耀宝箱单抽 / 十连原子性', () => {
  it('荣耀不足十连时整批不成交，收藏、材料与日志均不变化', () => {
    const s = save();
    s.currencies.glory = GLORY_CHEST.cost * GLORY_CHEST.multiCount - 1;
    const beforeCollection = collectionStats(s);
    const beforeMaterials = structuredClone(s.materials);
    const result = openGloryChest(s, 8801, GLORY_CHEST.multiCount);

    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.currencies.glory).toBe(GLORY_CHEST.cost * GLORY_CHEST.multiCount - 1);
    expect(collectionStats(s)).toEqual(beforeCollection);
    expect(s.materials).toEqual(beforeMaterials);
    expect(s.gachaLog).toHaveLength(0);
  });

  it('荣耀十连一次扣总价、结算十箱并只写一条批次日志', () => {
    const s = save();
    s.currencies.glory = GLORY_CHEST.cost * GLORY_CHEST.multiCount;
    const result = openGloryChest(s, 8802, GLORY_CHEST.multiCount);
    if (!result.ok) throw new Error(result.message);

    expect(result.count).toBe(GLORY_CHEST.multiCount);
    expect(result.spent).toEqual({ glory: GLORY_CHEST.cost * GLORY_CHEST.multiCount, gloryKeys: 0 });
    expect(s.currencies.glory).toBe(0);
    expect(s.gachaLog).toHaveLength(1);
    expect(s.gachaLog[0]!.kind).toBe('glory');
    expect(s.gachaLog[0]!.troops).toEqual(result.cards.map((card) => card.troopId));
    expect(result.cards.length + Object.keys(result.stones.traitstones ?? {}).length + Object.values(result.currencies).filter(Boolean).length).toBeGreaterThan(0);
  });

  it('荣耀箱掉落表 = GoW 官方公示：部队 70 / 特质石 20 / 资源 10，神话 0.01%', () => {
    const sum = (group: string) => GLORY_CHEST_LOOT.filter((row) => row.group === group).reduce((a, row) => a + row.weight, 0);
    expect(GLORY_CHEST_LOOT.reduce((a, row) => a + row.weight, 0)).toBe(CHEST_LOOT_BASE);
    expect([sum('troop'), sum('stone'), sum('resource')]).toEqual([70_000, 20_000, 10_000]);
    const mythic = GLORY_CHEST_LOOT.find((row) => row.loot.type === 'troop' && row.loot.rarityIdx === 5)!;
    expect(mythic.weight).toBe(10);
    expect(GLORY_CHEST_LOOT.some((row) => row.loot.type === 'troop' && row.loot.rarityIdx === 0)).toBe(false);
  });

  it('荣耀箱拒绝非单抽/十连数量且不扣荣耀', () => {
    for (const count of [0, 2, 9, 11, 1.5]) {
      const s = save();
      s.currencies.glory = 1_000;
      expect(openGloryChest(s, 8803, count)).toMatchObject({ ok: false, code: 'INVALID' });
      expect(s.currencies.glory).toBe(1_000);
      expect(s.gachaLog).toHaveLength(0);
    }
  });
});
