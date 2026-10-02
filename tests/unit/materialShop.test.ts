import { describe, expect, it } from 'vitest';
import { TROOP_PROGRESSION } from '../../src/data/leveling';
import { getTroopById } from '../../src/data/troops';
import { MATERIAL_SHOP_KEYS, MATERIAL_SHOP_PRICING, type MaterialShopPricing } from '../../src/meta/data/materialShop';
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
    expect(q.price).toBe(2280);
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
    expect(buyMaterialGoods(s, request, q.signature)).toMatchObject({ ok: true, spent: 2280 });
    expect(s.currencies.gems).toBe(17720);
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
  it('传说整包依次按凑整价格成交，第七单起恢复3980', () => {
    const s = fresh();
    grantTroop(s, 6081);
    const legacy = materialShopQuote(s, { kind: 'gems', troopId: 6081 });
    if (!legacy.ok) throw new Error(legacy.message);
    for (const [index, price, discount] of [[0, 780, 2], [1, 1580, 4], [2, 1980, 5], [3, 2380, 6], [4, 2780, 7], [5, 3180, 8], [6, 3980, 10]] as const) {
      const quote = materialShopQuote(s, { kind: 'gems', troopId: 6081 });
      if (!quote.ok) throw new Error(quote.message);
      expect(quote).toMatchObject({ price, gemOffer: { regularPrice: 3980, discount, purchased: index } });
      if (index > 0) expect(buyMaterialGoods(s, { kind: 'gems', troopId: 6081 }, legacy.signature)).toMatchObject({ ok: false, code: 'INVALID' });
      expect(buyMaterialGoods(s, { kind: 'gems', troopId: 6081 }, quote.signature)).toMatchObject({ ok: true, spent: price });
      expect(s.materialShop.gemBundlesPurchased).toBe(index + 1);
    }
    expect(materialShopQuote(s, { kind: 'gems', troopId: 6081 })).toMatchObject({ price: 3980, gemOffer: { discount: 10 } });
    expect(s.materialShop.arcaneIntroPurchased).toBe(0);
  });
  it('账号次数跨组合共享，失败不推进，存档重载后接续下一档', () => {
    const s = fresh();
    grantTroop(s, 6081);
    const first = { kind: 'gems' as const, troopId: 6000 };
    const other = { kind: 'gems' as const, troopId: 6081 };
    const old = materialShopQuote(s, other);
    const quote = materialShopQuote(s, first);
    if (!old.ok || !quote.ok) throw new Error('报价失败');
    expect(buyMaterialGoods(s, first, quote.signature)).toMatchObject({ ok: true, spent: 180 });
    const before = structuredClone(s);
    expect(buyMaterialGoods(s, other, old.signature)).toMatchObject({ ok: false, code: 'INVALID' });
    expect(s).toEqual(before);
    const loaded = parseSaveJson(serializeSave(s), 30 * 86400_000);
    expect(loaded.materialShop.gemBundlesPurchased).toBe(1);
    expect(materialShopQuote(loaded, other)).toMatchObject({ price: 1580, gemOffer: { discount: 4 } });
    loaded.currencies.gems = 0;
    const poor = materialShopQuote(loaded, other);
    if (!poor.ok) throw new Error(poor.message);
    expect(buyMaterialGoods(loaded, other, poor.signature)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(loaded.materialShop.gemBundlesPurchased).toBe(1);
    const legacy: Record<string, unknown> = { ...s }; delete legacy.materialShop;
    expect(hydrateSave(legacy).materialShop.gemBundlesPurchased).toBe(0);
    for (const [raw, expected] of [[-1, 0], [4.8, 4], ['6', 0], [null, 0], [Infinity, 0]] as const) {
      expect(hydrateSave({ ...s, materialShop: { gemBundlesPurchased: raw } }).materialShop.gemBundlesPurchased).toBe(expected);
    }
  });
});
