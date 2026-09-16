import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import {
  GACHA_PITY_MIN_IDX,
  GEM_CHEST,
  GEM_CHEST_WEIGHTS,
  GOLD_CHEST_WEIGHTS,
  grantTroop,
  newSave,
  openGemChest,
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
