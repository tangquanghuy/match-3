import { getTroopById } from '../../data/troops';
import { getMaterialBundle, materialBundleContents, materialBundleDiscountTier, materialBundleForTroop } from '../data/materialBundles';
import { MATERIAL_SHOP_KEYS, MATERIAL_SHOP_PRICING, type MaterialShopPricing } from '../data/materialShop';
import { RARITY_NAMES } from '../data/rarity';
import { parseStoneKey, type MaterialDelta } from '../data/materials';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { earnMaterials, spend } from './wallet';

export type MaterialShopRequest = { kind: 'gold'; key: string; count: number } | { kind: 'gems'; bundleId: string; mask: number } | { kind: 'gems'; troopId: number };
export interface MaterialShopQuote {
  ok: true;
  currency: 'gold' | 'gems';
  price: number | null;
  stones: Record<string, number>;
  slots: number[];
  signature: string;
  goldLine?: { regularUnit: number; regularCount: number; discountUnit: number; discountCount: number; remaining: number; limit: number };
  gemOffer?: { regularPrice: number; discount: number; purchased: number; nextDiscount: number | null; tier: number; tierName: string };
}
export type MaterialShopBuyResult = { ok: true; currency: 'gold' | 'gems'; spent: number; mats: MaterialDelta } | MetaFailure;

/** 商品按配方 ID + 特质阶段销售；旧客户端 troopId 请求仅作兼容转译。 */
export function materialShopQuote(save: MetaSave, request: MaterialShopRequest, pricing: MaterialShopPricing = MATERIAL_SHOP_PRICING): MaterialShopQuote | MetaFailure {
  if (!request || typeof request !== 'object') return fail('INVALID', '请选择商品');
  let stones: Record<string, number> = {};
  let discountTier = 0;
  const slots: number[] = [];
  if (request.kind === 'gold') {
    if (!MATERIAL_SHOP_KEYS.includes(request.key) || !Number.isSafeInteger(request.count) || request.count < 1 || request.count > 99) {
      return fail('INVALID', '请选择有效材料与数量（1–99）');
    }
    stones = { [request.key]: request.count };
  } else if (request.kind === 'gems') {
    let bundleId: string;
    let mask: number;
    if ('bundleId' in request) {
      bundleId = request.bundleId; mask = request.mask;
    } else {
      // Rolling-deploy compatibility: never let old troop orders silently become full packs.
      if (!Number.isSafeInteger(request.troopId)) return fail('UNKNOWN_TROOP', '请选择有效部队');
      const troop = getTroopById(request.troopId);
      const rec = save.collection[String(request.troopId)];
      if (!troop || !rec) return fail('NOT_OWNED', '请先获得该部队');
      bundleId = materialBundleForTroop(troop.id)?.id ?? '';
      mask = troop.traits.reduce((bits, trait, i) => bits | (trait && !rec.traits[i] ? 1 << i : 0), 0);
      if (!mask) return fail('ALREADY_UNLOCKED', '该部队特质已全部解锁');
    }
    const bundle = typeof bundleId === 'string' ? getMaterialBundle(bundleId) : undefined;
    if (!bundle || !Number.isSafeInteger(mask) || mask < 1 || mask > 7) return fail('INVALID', '请选择有效的材料组合与特质阶段');
    discountTier = materialBundleDiscountTier(bundle);
    for (let i = 0; i < 3; i++) if (mask & (1 << i)) {
      if (!Object.keys(bundle.stages[i]!).length) return fail('INVALID', '该组合没有此特质阶段');
      slots.push(i + 1);
    }
    stones = materialBundleContents(bundle, mask);
  } else return fail('INVALID', '未知商品类型');
  let price: number | null = 0;
  for (const [key, amount] of Object.entries(stones)) {
    const tier = parseStoneKey(key)?.tier;
    const unit = tier ? pricing[request.kind][tier] : null;
    if (unit == null || !Number.isSafeInteger(unit) || unit <= 0) { price = null; break; }
    price += unit * amount;
    if (!Number.isSafeInteger(price)) return fail('INVALID', '商品总价超出范围');
  }
  let gemOffer: MaterialShopQuote['gemOffer'];
  // Complete packs use broad shelf tiers; smaller stage orders keep finer increments.
  if (request.kind === 'gems' && price !== null) {
    const step = slots.length === 3 ? 500 : 100;
    price = Math.ceil((price + 20) / step) * step - 20;
    if (!Number.isSafeInteger(price)) return fail('INVALID', '商品总价超出范围');
    const regularPrice = price;
    const purchased = save.materialShop?.gemDiscountPurchases?.[String(discountTier)] ?? 0;
    const discounts = pricing.gemBundleDiscounts?.[discountTier] ?? [];
    const discount = discounts[purchased] ?? 10;
    if (!Number.isInteger(discount) || discount < 1 || discount > 10) return fail('INVALID', '商品价格配置异常');
    if (discount < 10) {
      price = Math.min(regularPrice, Math.max(80, Math.round((regularPrice * discount / 10 + 20) / 100) * 100 - 20));
    }
    gemOffer = { regularPrice, discount, purchased, nextDiscount: discounts[purchased + 1] ?? null, tier: discountTier, tierName: RARITY_NAMES[discountTier] ?? '特殊' };
  }
  let goldLine: MaterialShopQuote['goldLine'];
  if (request.kind === 'gold' && price !== null) {
    const regularUnit = pricing.gold[parseStoneKey(request.key)!.tier]!;
    const intro = parseStoneKey(request.key)?.tier === 'arcane' ? pricing.arcaneIntro : undefined;
    const purchased = save.materialShop?.arcaneIntroPurchased ?? 0;
    const remaining = intro ? Math.max(0, intro.limit - purchased) : 0;
    const discountCount = Math.min(request.count, remaining);
    const discountUnit = intro?.unitGold ?? regularUnit;
    if (!Number.isSafeInteger(discountUnit) || discountUnit <= 0 || discountUnit > regularUnit) return fail('INVALID', '商品价格配置异常');
    price = discountCount * discountUnit + (request.count - discountCount) * regularUnit;
    goldLine = { regularUnit, regularCount: request.count - discountCount, discountUnit, discountCount, remaining, limit: intro?.limit ?? 0 };
  }
  const signature = JSON.stringify([pricing.revision, request, slots, stones, price, goldLine, gemOffer]);
  return { ok: true, currency: request.kind, stones, slots, price, signature, ...(goldLine ? { goldLine } : {}), ...(gemOffer ? { gemOffer } : {}) };
}

export function buyMaterialGoods(save: MetaSave, request: MaterialShopRequest, expectedQuote: string, pricing: MaterialShopPricing = MATERIAL_SHOP_PRICING): MaterialShopBuyResult {
  const quote = materialShopQuote(save, request, pricing);
  if (!quote.ok) return quote;
  if (quote.price === null) return fail('INVALID', '价格待定，尚未开售');
  if (expectedQuote !== quote.signature) return fail('INVALID', '配方或价格已更新，请重新确认');
  const paid = spend(save, { [quote.currency]: quote.price });
  if (!paid.ok) return paid;
  const mats = earnMaterials(save, { traitstones: quote.stones });
  if (quote.goldLine?.discountCount) {
    save.materialShop ??= { arcaneIntroPurchased: 0, gemBundlesPurchased: 0, gemDiscountPurchases: {} };
    save.materialShop.arcaneIntroPurchased += quote.goldLine.discountCount;
  }
  if (quote.currency === 'gems') {
    save.materialShop ??= { arcaneIntroPurchased: 0, gemBundlesPurchased: 0, gemDiscountPurchases: {} };
    save.materialShop.gemBundlesPurchased += 1;
    save.materialShop.gemDiscountPurchases ??= {};
    const tier = String(quote.gemOffer!.tier);
    save.materialShop.gemDiscountPurchases[tier] = (save.materialShop.gemDiscountPurchases[tier] ?? 0) + 1;
  }
  return { ok: true, currency: quote.currency, spent: quote.price, mats };
}
