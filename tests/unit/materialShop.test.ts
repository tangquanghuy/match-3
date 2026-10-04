import { describe, expect, it } from 'vitest';
import { TROOP_PROGRESSION } from '../../src/data/leveling';
import { getTroopById } from '../../src/data/troops';
import { MATERIAL_SHOP_KEYS, MATERIAL_SHOP_PRICING, type MaterialShopPricing } from '../../src/meta/data/materialShop';
import { materialBundleCatalog, materialBundleForTroop } from '../../src/meta/data/materialBundles';
import { traitUnlockCost } from '../../src/meta/data/economy';
import { hydrateSave, parseSaveJson, serializeSave } from '../../src/meta/state/save';
import { LocalTransport } from '../../src/meta/gateway/transport';
import { newSave } from '../../src/meta/state/schema';
import { buyMaterialGoods, materialShopQuote } from '../../src/meta/systems/materialShop';
import { grantTroop, unlockTrait } from '../../src/meta/systems/troopProgress';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { isCriticalCommand } from '../../src/meta/server/protocol';

// 仅为交易逻辑测试的价格，不是运行时售价。
const pricing: MaterialShopPricing = {
  revision: 1, gold: { minor: 10, major: 20, runic: 30, arcane: 40, celestial: 50 },
  gems: { minor: 1, major: 2, runic: 3, arcane: 4, celestial: 5 },
};
const fresh = () => newSave({ now: 0, starterTroopIds: [6000, 6169], currencies: { gold: 10000, gems: 20000 } });

describe('材料商店：实际配方、价格审核与原子成交', () => {
  it('金币目录完整覆盖40种特质石', () => {
    expect(MATERIAL_SHOP_KEYS).toHaveLength(40);
    expect(new Set(MATERIAL_SHOP_KEYS).size).toBe(40);
  });
  it('所有导入部队礼包逐项等于配方，不假定主色、不固定42颗', () => {
    const s = fresh();
    for (const [id, row] of Object.entries(TROOP_PROGRESSION)) {
      const troop = getTroopById(Number(id));
      if (!troop) continue;
      grantTroop(s, troop.id);
      const q = materialShopQuote(s, { kind: 'gems', troopId: troop.id });
      const expected: Record<string, number> = {};
      for (let i = 0; i < 3; i++) {
        if (!troop.traits[i]) continue;
        for (const [key, n] of Object.entries(row.traits[i] ?? {})) expected[key] = (expected[key] ?? 0) + n;
      }
      if (!Object.keys(expected).length) continue;
      expect(q.ok, id).toBe(true);
      if (q.ok) expect(q.stones, id).toEqual(expected);
    }
  });
  it('德拉古力斯准确包含两组各21颗秘法、圣辉及全部基础材料', () => {
    const s = fresh();
    const q = materialShopQuote(s, { kind: 'gems', troopId: 6169 });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.stones).toMatchObject({ 'arcane:blue:green': 21, 'arcane:blue:red': 21, celestial: 4 });
    expect(Object.keys(q.stones).some(k => k.startsWith('minor:'))).toBe(true);
    expect(Object.keys(q.stones).some(k => k.startsWith('major:'))).toBe(true);
    expect(Object.keys(q.stones).some(k => k.startsWith('runic:'))).toBe(true);
    expect(q.price).toBe(3480);
  });
  it('已解锁特质从整套剔除；现有库存不抵扣完整礼包', () => {
    const s = fresh(); s.collection['6000']!.traits = [true, true, false];
    s.materials.traitstones['arcane:blue:blue'] = 100;
    const q = materialShopQuote(s, { kind: 'gems', troopId: 6000 });
    expect(q).toMatchObject({ ok: true, slots: [3], stones: traitUnlockCost(3, 'blue', 6000).stones });
  });
  it('正式价格开放，伪造价格和报价不生效', async () => {
    const gateway = new MockGateway(memoryStorage(), { now: () => 1234 });
    await gateway.load();
    const before = structuredClone(gateway.current());
    const request = { kind: 'gold' as const, key: 'arcane:blue:blue', count: 1, price: 0 };
    const { result } = await gateway.buyMaterialGoods(request, '0');
    expect(result).toMatchObject({ ok: false, message: '配方或价格已更新，请重新确认' });
    expect(gateway.current().materials).toEqual(before.materials);
    expect(gateway.current().currencies).toEqual(before.currencies);
    expect(isCriticalCommand('buyMaterialGoods')).toBe(true);
  });
  it('指定材料成交按数量扣金币、入库，余额不足或非法数量整笔不变', () => {
    const s = fresh(); const request = { kind: 'gold' as const, key: 'arcane:blue:blue', count: 3 };
    const q = materialShopQuote(s, request, pricing); if (!q.ok) throw new Error(q.message);
    expect(buyMaterialGoods(s, request, q.signature, pricing)).toMatchObject({ ok: true, spent: 120 });
    expect(s.currencies.gold).toBe(9880);
    expect(s.materials.traitstones['arcane:blue:blue']).toBe(3);
    s.currencies.gold = 0;
    const before = structuredClone(s);
    expect(buyMaterialGoods(s, request, q.signature, pricing)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    for (const count of [0, -1, 1.5, NaN, Infinity, 100]) expect(buyMaterialGoods(s, { ...request, count }, q.signature, pricing).ok).toBe(false);
    expect(s).toEqual(before);
  });
  it('全套材料到账后可连续解锁全部特质，按真实配方扣完', () => {
    const s = fresh(); const request = { kind: 'gems' as const, troopId: 6169 };
    const q = materialShopQuote(s, request); if (!q.ok) throw new Error(q.message);
    expect(buyMaterialGoods(s, request, q.signature)).toMatchObject({ ok: true, spent: 3480 });
    expect(s.currencies.gems).toBe(16520);
    expect(s.materialShop.arcaneIntroPurchased).toBe(0);
    expect(s.materialShop.gemBundlesPurchased).toBe(1);
    for (const slot of [1, 2, 3]) expect(unlockTrait(s, 6169, slot).ok).toBe(true);
    for (const key of Object.keys(q.stones)) expect(s.materials.traitstones[key]).toBe(0);
    expect(s.collection['6169']!.traits).toEqual([true, true, true]);
  });
  it('旧配方报价和旧价格报价拒绝成交；未拥有和已全解锁部队无礼包', () => {
    const s = fresh(); const request = { kind: 'gems' as const, troopId: 6000 };
    const q = materialShopQuote(s, request, pricing); if (!q.ok) throw new Error(q.message);
    expect(buyMaterialGoods(s, request, q.signature, { ...pricing, revision: 2 }).ok).toBe(false);
    s.collection['6000']!.traits[0] = true;
    const before = structuredClone(s);
    expect(buyMaterialGoods(s, request, q.signature, pricing).ok).toBe(false);
    expect(s).toEqual(before);
    expect(materialShopQuote(s, { kind: 'gems', troopId: 999999 }).ok).toBe(false);
    s.collection['6000']!.traits = [true, true, true];
    expect(materialShopQuote(s, request)).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
  });
});


describe('材料商店正式定价与账号优惠账本', () => {
  const funded = () => { const s = fresh(); s.currencies.gold = 200_000_000; return s; };
  const order = (s: ReturnType<typeof fresh>, key: string, count: number) => {
    const request = { kind: 'gold' as const, key, count };
    const quote = materialShopQuote(s, request);
    if (!quote.ok) throw new Error(quote.message);
    return { request, quote };
  };
  it('40种材料均有正式价格，金币高价补缺，秘法首次五折', () => {
    const s = funded();
    const prices: Record<string, number> = { minor: 3000, major: 12000, runic: 60000, arcane: 500000, celestial: 2000000 };
    for (const key of MATERIAL_SHOP_KEYS) {
      const { request, quote } = order(s, key, 1);
      expect(quote.price).toBe(prices[key.split(':')[0]!]);
      expect(buyMaterialGoods(s, request, quote.signature).ok).toBe(true);
      expect(s.materials.traitstones[key]).toBe(1);
    }
    expect(s.materialShop.arcaneIntroPurchased).toBe(21);
  });
  it('前84颗跨颜色共享；跨额度批量订单拆价，第85颗起原价', () => {
    const s = funded();
    for (const [key, count, price] of [['arcane:blue:blue', 82, 41_000_000], ['arcane:blue:red', 5, 4_000_000], ['arcane:red:red', 1, 1_000_000]] as const) {
      const { request, quote } = order(s, key, count);
      expect(quote.price).toBe(price);
      if (count === 5) expect(quote.goldLine).toMatchObject({ remaining: 2, discountCount: 2, regularCount: 3 });
      expect(buyMaterialGoods(s, request, quote.signature)).toMatchObject({ ok: true, spent: price });
    }
    expect(s.materialShop.arcaneIntroPurchased).toBe(84);
    expect(s.currencies.gold).toBe(154_000_000);
  });
  it('优惠消耗后其他颜色旧报价失效；失败不扣款、不扣额度', () => {
    const s = funded();
    const old = order(s, 'arcane:blue:red', 3);
    const first = order(s, 'arcane:blue:blue', 1);
    expect(buyMaterialGoods(s, first.request, first.quote.signature).ok).toBe(true);
    const before = structuredClone(s);
    expect(buyMaterialGoods(s, old.request, old.quote.signature)).toMatchObject({ ok: false, code: 'INVALID' });
    expect(s).toEqual(before);
    s.currencies.gold = 499_999;
    const next = order(s, 'arcane:blue:red', 1);
    const poor = structuredClone(s);
    expect(buyMaterialGoods(s, next.request, next.quote.signature)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s).toEqual(poor);
  });
  it('跨日周、序列化、旧档加载保留正确额度；畸形账本清洗', () => {
    const s = funded();
    const { request, quote } = order(s, 'arcane:blue:blue', 84);
    buyMaterialGoods(s, request, quote.signature);
    const loaded = parseSaveJson(serializeSave(s), 30 * 86400_000);
    expect(loaded.materialShop.arcaneIntroPurchased).toBe(84);
    expect(order(loaded, 'arcane:blue:red', 1).quote.price).toBe(1_000_000);
    const legacy: Record<string, unknown> = { ...s };
    delete legacy.materialShop;
    expect(hydrateSave(legacy).materialShop.arcaneIntroPurchased).toBe(0);
    for (const [raw, expected] of [[-1, 0], [4.8, 4], ['84', 0], [null, 0], [Infinity, 0], [90, 90]] as const) {
      expect(hydrateSave({ ...s, materialShop: { arcaneIntroPurchased: raw } }).materialShop.arcaneIntroPurchased).toBe(expected);
    }
  });
  it('暂停销售的品阶仍拦截成交', () => {
    const s = funded(); const request = { kind: 'gold' as const, key: 'arcane:blue:blue', count: 1 };
    const paused = { ...MATERIAL_SHOP_PRICING, gold: { ...MATERIAL_SHOP_PRICING.gold, arcane: null } };
    const q = materialShopQuote(s, request, paused);
    expect(q).toMatchObject({ ok: true, price: null });
    const before = structuredClone(s);
    if (!q.ok) throw new Error(q.message);
    expect(buyMaterialGoods(s, request, q.signature, paused).ok).toBe(false);
    expect(s).toEqual(before);
  });
  it('优惠订单重复请求按过期报价拦截；跨网关重载持久化优惠和材料', async () => {
    const s = funded(); const storage = memoryStorage();
    storage.setItem('gems.meta.save', serializeSave(s));
    const authority = new LocalTransport(storage, { now: () => 1234 });
    await authority.load();
    const { request, quote } = order(s, 'arcane:blue:blue', 2);
    const command = { type: 'buyMaterialGoods' as const, args: { request, expectedQuote: quote.signature } };
    const first = await authority.send(command);
    expect(first.result).toMatchObject({ ok: true, spent: 1_000_000 });
    const retry = await authority.send(command);
    expect(retry.result).toMatchObject({ ok: false, code: 'INVALID' });
    const gateway = new MockGateway(storage, { now: () => 10 * 86400_000 });
    await gateway.load();
    expect(gateway.current().materialShop.arcaneIntroPurchased).toBe(2);
    expect(gateway.current().materials.traitstones['arcane:blue:blue']).toBe(2);
    expect(gateway.current().currencies.gold).toBe(199_000_000);
  });
});

describe('宝石组合递减优惠', () => {
  it('changes only the 20% tier to 30% while retaining every later purchase tier', () => {
    expect(MATERIAL_SHOP_PRICING.gemBundleDiscounts).toEqual({
      0: [3, 4, 5, 6, 7, 8], 1: [3, 4, 5, 6, 7, 8], 2: [3, 4, 5, 6, 7, 8],
      3: [3, 3, 5, 8], 4: [3, 5], 5: [3, 5],
    });
    const raw = JSON.parse(serializeSave(newSave({ now: 0, currencies: { gems: 50_000 } })));
    raw.materialShop.gemDiscountPurchases = { 0: 1, 1: 2, 2: 1, 3: 1, 4: 1, 5: 1 };
    const loaded = hydrateSave(raw);
    for (const [troopId, discount, purchased] of [[6000, 4, 1], [6001, 5, 2], [6003, 4, 1], [6081, 3, 1], [6065, 5, 1], [6169, 5, 1]]) {
      const request = { kind: 'gems' as const, bundleId: materialBundleForTroop(troopId)!.id, mask: 7 };
      expect(materialShopQuote(loaded, request)).toMatchObject({ gemOffer: { discount, purchased } });
    }
    const request = { kind: 'gems' as const, bundleId: materialBundleForTroop(6081)!.id, mask: 7 };
    const previousQuote = materialShopQuote(loaded, request, { ...MATERIAL_SHOP_PRICING, revision: 6 });
    if (!previousQuote.ok) throw new Error(previousQuote.message);
    expect(buyMaterialGoods(loaded, request, previousQuote.signature)).toMatchObject({ ok: false, code: 'INVALID' });
    const currentQuote = materialShopQuote(loaded, request);
    if (!currentQuote.ok) throw new Error(currentQuote.message);
    expect(buyMaterialGoods(loaded, request, currentQuote.signature)).toMatchObject({ ok: true, spent: 1180 });
    const reloaded = parseSaveJson(serializeSave(loaded));
    expect(reloaded.materialShop.gemDiscountPurchases['3']).toBe(2);
    expect(materialShopQuote(reloaded, request)).toMatchObject({ price: 1980, gemOffer: { discount: 5, purchased: 2 } });
    expect(materialShopQuote(fresh(), { kind: 'gems', bundleId: materialBundleForTroop(6000)!.id, mask: 7 })).toMatchObject({ gemOffer: { discount: 3, purchased: 0 } });
  });

  it.each([
    [6081, 3, 3980, [[1180, 3], [1180, 3], [1980, 5], [3180, 8], [3980, 10]]],
    [6065, 4, 5980, [[1780, 3], [2980, 5], [5980, 10]]],
    [6169, 5, 11480, [[3480, 3], [5780, 5], [11480, 10]]],
  ] as const)('档位 %i 按独立阶梯成交', (troopId, tier, regularPrice, steps) => {
    const s = fresh(); s.currencies.gems = 100_000;
    grantTroop(s, troopId);
    const request = { kind: 'gems' as const, troopId };
    const first = materialShopQuote(s, request);
    if (!first.ok) throw new Error(first.message);
    steps.forEach(([price, discount], index) => {
      const quote = materialShopQuote(s, request);
      if (!quote.ok) throw new Error(quote.message);
      expect(quote).toMatchObject({ price, gemOffer: { regularPrice, discount, purchased: index, tier } });
      if (index > 0) expect(buyMaterialGoods(s, request, first.signature)).toMatchObject({ ok: false, code: 'INVALID' });
      expect(buyMaterialGoods(s, request, quote.signature)).toMatchObject({ ok: true, spent: price });
      expect(s.materialShop.gemDiscountPurchases[String(tier)]).toBe(index + 1);
    });
    expect(materialShopQuote(s, request)).toMatchObject({ price: regularPrice, gemOffer: { discount: 10 } });
  });

  it('低价档不消耗高价档优惠，同档不同阶段共用次数，失败不推进', () => {
    const s = fresh(); grantTroop(s, 6081); grantTroop(s, 6169);
    const common = { kind: 'gems' as const, troopId: 6000 };
    const legendary = { kind: 'gems' as const, bundleId: materialBundleForTroop(6081)!.id, mask: 6 };
    const mythic = { kind: 'gems' as const, troopId: 6169 };
    const mythicBefore = materialShopQuote(s, mythic);
    const commonQuote = materialShopQuote(s, common);
    if (!mythicBefore.ok || !commonQuote.ok) throw new Error('报价失败');
    expect(buyMaterialGoods(s, common, commonQuote.signature)).toMatchObject({ ok: true, spent: 280 });
    expect(materialShopQuote(s, mythic)).toEqual(mythicBefore);
    const partial = materialShopQuote(s, legendary);
    if (!partial.ok) throw new Error(partial.message);
    expect(buyMaterialGoods(s, legendary, partial.signature).ok).toBe(true);
    expect(materialShopQuote(s, { kind: 'gems', troopId: 6081 })).toMatchObject({ price: 1180, gemOffer: { discount: 3, purchased: 1 } });
    const anotherColor = materialBundleCatalog().find(f => f.name === '传说 · 双色')!.bundles[1]!;
    expect(materialShopQuote(s, { kind: 'gems', bundleId: anotherColor.id, mask: 7 })).toMatchObject({ gemOffer: { discount: 3, purchased: 1 } });
    const loaded = parseSaveJson(serializeSave(s), 30 * 86400_000);
    expect(loaded.materialShop.gemDiscountPurchases).toMatchObject({ 0: 1, 3: 1 });
    expect(materialShopQuote(loaded, mythic)).toEqual(mythicBefore);
    loaded.currencies.gems = 0;
    const poor = materialShopQuote(loaded, mythic);
    if (!poor.ok) throw new Error(poor.message);
    expect(buyMaterialGoods(loaded, mythic, poor.signature)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(loaded.materialShop.gemDiscountPurchases['5']).toBeUndefined();
  });

  it('特殊高阶秘法走神话档；旧版总单数不挤占新档优惠', () => {
    const special = materialBundleCatalog().find(f => f.name === '特殊 · 高阶秘法')!.bundles[0]!;
    const old = fresh(); old.materialShop.gemBundlesPurchased = 6;
    const raw = JSON.parse(serializeSave(old)); delete raw.materialShop.gemDiscountPurchases;
    const loaded = hydrateSave(raw);
    expect(loaded.materialShop.gemBundlesPurchased).toBe(6);
    expect(loaded.materialShop.gemDiscountPurchases).toEqual({});
    expect(materialShopQuote(loaded, { kind: 'gems', bundleId: special.id, mask: 7 })).toMatchObject({ gemOffer: { tier: 5, discount: 3 } });
    expect(hydrateSave({ ...raw, materialShop: { gemDiscountPurchases: { '5': 1.9, '3': -1, 'evil': 4 } } }).materialShop.gemDiscountPurchases).toEqual({ '3': 0, '5': 1 });
  });
});
