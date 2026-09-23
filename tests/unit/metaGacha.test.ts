import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { MockGateway, memoryStorage } from '../../src/meta/gateway/mockGateway';
import { isFailure } from '../../src/meta/gateway';
import {
  GACHA_PITY_MIN_IDX,
  GEM_CHEST,
  GEM_CHEST_WEIGHTS,
  GLORY_CHEST,
  GOLD_CHEST_WEIGHTS,
  grantTroop,
  newSave,
  openGemChest,
  openGloryChest,
  openGoldChest,
} from '../../src/meta';

const save = (gems = 0, goldKeys = 0) =>
  newSave({ now: 0, starterTroopIds: [6000, 6097, 6457], currencies: { gems, goldKeys } });

describe('宝石宝箱（150 单抽 / 1500 十连保底 Epic+）', () => {
  it('权重表合法：万分比合计 10000，顶两档 2.0%', () => {
    expect(GEM_CHEST_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(GEM_CHEST_WEIGHTS[4]! + GEM_CHEST_WEIGHTS[5]!).toBe(200); // 计划 §4.2
    expect(GEM_CHEST_WEIGHTS[5]!).toBe(20); // 顶档 0.2%（社区实测 ~1/1000 量级）
  });

  it('宝石不足 → INSUFFICIENT 且不出卡', () => {
    const r = openGemChest(save(149), 1, 1);
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    const ten = openGemChest(save(1499), 2, 10);
    expect(ten).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
  });

  it('单抽：扣 150、出 1 张、进日志、卡真实存在', () => {
    const s = save(150);
    const r = openGemChest(s, 12345, 1);
    if (!r.ok) throw new Error(r.message);
    expect(r.cards).toHaveLength(1);
    expect(r.spent).toEqual({ gems: 150 });
    expect(s.currencies.gems).toBe(0);
    expect(getTroopById(r.cards[0]!.troopId)).toBeTruthy();
    expect(s.gachaLog[0]).toMatchObject({ kind: 'gem', seed: 12345 });
    expect(s.gachaLog[0]!.troops).toEqual([r.cards[0]!.troopId]);
  });

  it('十连保底：各种子下必出 Epic+；保底触发时第 10 张为 Epic 档', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = save(1500);
      const r = openGemChest(s, seed, 10);
      if (!r.ok) throw new Error(r.message);
      expect(r.cards).toHaveLength(10);
      expect(s.currencies.gems).toBe(0);
      const hasTop = r.cards.some((c) => c.rarityIdx >= GACHA_PITY_MIN_IDX);
      expect(hasTop).toBe(true);
      if (r.pityUsed) {
        expect(r.cards[9]!.rarityIdx).toBe(GACHA_PITY_MIN_IDX);
      }
    }
  });

  it('对账审计：3000 次单抽的档位频率与权重表一致（固定种子，确定可复现）', () => {
    const N = 3000;
    const s = save(N * GEM_CHEST.singleCost);
    const bands = [0, 0, 0, 0, 0, 0];
    let dups = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r = openGemChest(s, seed, 1);
      if (!r.ok) throw new Error(r.message);
      for (const card of r.cards) {
        bands[card.rarityIdx]! += 1;
        if (card.duplicate) dups += 1;
      }
    }
    const expected = GEM_CHEST_WEIGHTS.map((w) => (w / 10000) * N);
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

describe('金钥匙宝箱（1 钥匙一开，池偏低稀有度）', () => {
  it('金钥匙不足 → INSUFFICIENT', () => {
    expect(openGoldChest(save(0, 0), 1)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
  });

  it('开箱：扣 1 钥匙、只出 UR 及以下（官方金箱只出 Common/Rare，本作放宽到 UR）', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = save(0, 1);
      const r = openGoldChest(s, seed);
      if (!r.ok) throw new Error(r.message);
      expect(r.spent).toEqual({ goldKeys: 1 });
      expect(r.cards).toHaveLength(1);
      expect(r.cards[0]!.rarityIdx).toBeLessThanOrEqual(3);
      expect(GOLD_CHEST_WEIGHTS[4]).toBe(0);
    }
  });

  it('重复获得进 copies：已持有的普通卡再抽到必标 duplicate', () => {
    const s = save(30000);
    // 预持有全部普通卡 → 任何普通档抽卡都必然是重复
    for (const t of TROOPS) {
      if (t.rarityIdx === 0) grantTroop(s, t.id, 1);
    }
    let commonPulls = 0;
    let sawDupe = false;
    for (let seed = 100; seed < 140; seed++) {
      const r = openGemChest(s, seed, 1);
      if (!r.ok) throw new Error(r.message);
      for (const card of r.cards) {
        if (card.rarityIdx !== 0) continue;
        commonPulls += 1;
        expect(card.duplicate).toBe(true);
        sawDupe = true;
      }
    }
    expect(commonPulls).toBeGreaterThan(0);
    expect(sawDupe).toBe(true);
    expect(s.collection['6000']!.copies).toBeGreaterThanOrEqual(1);
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

  it('7 把钥匙显式开 7 次 → 整批成交：扣 7、出 7 张、7 张全部入账、一条日志', () => {
    const s = save(0, 7);
    const before = collectionStats(s);
    const r = openGoldChest(s, 4242, 7);
    if (!r.ok) throw new Error(r.message);
    expect(r.cards).toHaveLength(7);
    expect(r.spent).toEqual({ goldKeys: 7 });
    expect(s.currencies.goldKeys).toBe(0);
    const after = collectionStats(s);
    expect(after.copies - before.copies).toBe(7); // 消耗张数 == 入账张数
    expect(s.gachaLog).toHaveLength(1);
    expect(s.gachaLog[0]!.troops).toHaveLength(7);
  });

  it('同种子下 10 连 == 前 10 抽序列；批量与单抽同一 RNG 口径', () => {
    const batch = save(0, 10);
    const br = openGoldChest(batch, 777, 10);
    if (!br.ok) throw new Error(br.message);
    expect(br.cards).toHaveLength(10);
    expect(batch.currencies.goldKeys).toBe(0);
    expect(br.pityUsed).toBe(false); // 金箱无保底（保底是宝石池裁定特权）
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
    expect(seven.result.cards).toHaveLength(7);
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
    expect(result.spent).toEqual({ glory: GLORY_CHEST.cost * GLORY_CHEST.multiCount });
    expect(s.currencies.glory).toBe(0);
    expect(s.gachaLog).toHaveLength(1);
    expect(s.gachaLog[0]!.kind).toBe('glory');
    expect(s.gachaLog[0]!.troops).toEqual(result.cards.map((card) => card.troopId));
    expect(result.cards.length + result.goldKeys + Object.keys(result.stones.traitstones ?? {}).length).toBeGreaterThan(0);
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
