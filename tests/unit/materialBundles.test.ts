import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { BaseColor } from '../../src/engine/types';
import { traitUnlockCost } from '../../src/meta/data/economy';
import { materialBundleCatalog, materialBundleForTroop, materialBundleContents } from '../../src/meta/data/materialBundles';
import { stoneColorKeyOf } from '../../src/meta/data/materials';
import { materialShopQuote, buyMaterialGoods, type MaterialShopRequest } from '../../src/meta/systems/materialShop';
import { newSave } from '../../src/meta/state/schema';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';

const requestFor = (troopId: number, mask = 7): MaterialShopRequest => ({ kind: 'gems', bundleId: materialBundleForTroop(troopId)!.id, mask });
describe('按真实配方组合销售', () => {
  it('配方类型有限、完整阶段组合唯一，与部队数量无关', () => {
    const families = materialBundleCatalog();
    const bundles = families.flatMap(f => f.bundles);
    console.log('Material catalog:', families.map(f => [f.name, f.bundles.length]), 'total', bundles.length);
    expect(families.length).toBeLessThanOrEqual(16);
    expect(bundles.length).toBeLessThan(250);
    expect(new Set(bundles.map(b => b.id)).size).toBe(bundles.length);
    expect(new Set(bundles.map(b => JSON.stringify(b.stages))).size).toBe(bundles.length);
    expect(new Set(families.map(f => f.name)).size).toBe(families.length);
  });
  it('全目录各部队、各剩余阶段逐项等于原始配方，特殊配方及社区配方不丢失', () => {
    const s = newSave({ now: 0 }); s.collection = {};
    for (const troop of TROOPS) {
      const bundle = materialBundleForTroop(troop.id);
      if (!troop.traits.some(Boolean)) { expect(bundle).toBeUndefined(); continue; }
      expect(bundle, String(troop.id)).toBeDefined();
      for (const mask of [7, 6, 4]) {
        const expected: Record<string, number> = {};
        for (let i = 0; i < 3; i++) if (troop.traits[i] && (mask & (1 << i))) {
          for (const [key, n] of Object.entries(traitUnlockCost(i + 1, stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown), troop.id).stones)) expected[key] = (expected[key] ?? 0) + n;
        }
        expect(materialBundleContents(bundle!, mask)).toEqual(expected);
        if (bundle!.stages.some((stage, i) => (mask & (1 << i)) && !Object.keys(stage).length)) continue;
        const quote = materialShopQuote(s, requestFor(troop.id, mask));
        expect(quote.ok, String(troop.id)).toBe(true);
        if (quote.ok) expect(quote.stones).toEqual(expected);
      }
    }
  });
  it('商品不要求拥有部队，不随升阶、特质解锁或库存变化', () => {
    const s = newSave({ now: 0, starterTroopIds: [6169], currencies: { gems: 10000 } });
    const request = requestFor(6169);
    const quote = materialShopQuote(s, request);
    s.collection['6169']!.traits = [true, true, true]; s.collection['6169']!.ascension = 3;
    s.materials.traitstones.celestial = 100;
    expect(materialShopQuote(s, request)).toEqual(quote);
    s.collection = {};
    expect(materialShopQuote(s, request)).toEqual(quote);
    expect(quote).toMatchObject({ ok: true, price: 2280, gemOffer: { regularPrice: 11480, discount: 2 } });
  });
  it('宝石组合按全价与首购折扣分别凑整，传说三特质整包全价3980', () => {
    const s = newSave({ now: 0, currencies: { gems: 20000 } });
    for (const [troopId, regularPrice, price] of [[6000, 980, 180], [6001, 1480, 280], [6003, 1980, 380], [6081, 3980, 780], [6065, 5980, 1180], [6169, 11480, 2280]] as const) {
      expect(materialShopQuote(s, requestFor(troopId, 7))).toMatchObject({ ok: true, price, gemOffer: { regularPrice, discount: 2 } });
    }
    expect(materialShopQuote(s, requestFor(6081, 6))).toMatchObject({ ok: true, price: 580, gemOffer: { regularPrice: 3080 } });
    expect(materialShopQuote(s, requestFor(6081, 4))).toMatchObject({ ok: true, price: 280, gemOffer: { regularPrice: 1380 } });
    for (const bundle of materialBundleCatalog().flatMap(family => family.bundles)) {
      for (const mask of [7, 6, 4]) {
        const quote = materialShopQuote(s, { kind: 'gems', bundleId: bundle.id, mask });
        if (quote.ok) {
          expect(quote.gemOffer!.regularPrice % (mask === 7 ? 500 : 100)).toBe(mask === 7 ? 480 : 80);
          expect(Math.abs(quote.price! / quote.gemOffer!.regularPrice - 0.2), `${bundle.id}/${mask}`).toBeLessThanOrEqual(0.08);
        }
      }
    }

    const request = requestFor(6081);
    const previous = materialShopQuote(s, request, {
      revision: 2,
      gold: { minor: 2000, major: 8000, runic: 60000, arcane: 1000000, celestial: 2000000 },
      gems: { minor: 1, major: 3, runic: 12, arcane: 40, celestial: 120 },
    });
    if (!previous.ok) throw new Error(previous.message);
    expect(previous.price).toBe(980);
    expect(buyMaterialGoods(s, request, previous.signature).ok).toBe(false);
    expect(s.currencies.gems).toBe(20000);
  });
  it('组合订单成交与旧部队整套结果一致，阶段订单仅买对应阶段', () => {
    for (const mask of [7, 6, 4]) {
      const s = newSave({ now: 0, currencies: { gems: 20000 } }); s.materials.traitstones = {};
      const request = requestFor(6169, mask), quote = materialShopQuote(s, request);
      if (!quote.ok) throw new Error(quote.message);
      expect(buyMaterialGoods(s, request, quote.signature).ok).toBe(true);
      expect(s.currencies.gems).toBe(20000 - quote.price!);
      expect(s.materials.traitstones).toEqual(quote.stones);
      expect(s.materialShop.arcaneIntroPurchased).toBe(0);
    }
  });
  it('篡改商品、阶段或报价均不扣余额，也不接受客户端指定配方', () => {
    const s = newSave({ now: 0, currencies: { gems: 10000 } });
    const request = requestFor(6000), quote = materialShopQuote(s, request);
    if (!quote.ok) throw new Error(quote.message);
    const before = structuredClone(s);
    for (const mask of [0, 8, -1, 1.5, NaN, Infinity, undefined, '7']) {
      expect(materialShopQuote(s, { ...request, mask } as MaterialShopRequest).ok).toBe(false);
    }
    expect(buyMaterialGoods(s, requestFor(6169), quote.signature).ok).toBe(false);
    expect(buyMaterialGoods(s, requestFor(6000, 4), quote.signature).ok).toBe(false);
    expect(materialShopQuote(s, { kind: 'gems', bundleId: '__proto__', mask: 7 }).ok).toBe(false);
    expect(s).toEqual(before);
    const tampered = { ...request, stones: { celestial: 99999 }, price: 0 };
    expect(materialShopQuote(s, tampered)).toMatchObject({ stones: quote.stones, price: quote.price });
  });
  it('新商品请求经过真实网关保存并能重新加载', async () => {
    const storage = memoryStorage();
    const gateway = new MockGateway(storage, { now: () => 1234 }); await gateway.load();
    const s = gateway.current();
    const request = requestFor(6000, 4), quote = materialShopQuote(s, request);
    if (!quote.ok) throw new Error(quote.message);
    const balance = s.currencies.gems;
    const { result } = await gateway.buyMaterialGoods(request, quote.signature);
    expect(result.ok).toBe(true);
    const reload = new MockGateway(storage, { now: () => 1234 }); await reload.load();
    expect(reload.current().currencies.gems).toBe(balance - quote.price!);
  });
});
