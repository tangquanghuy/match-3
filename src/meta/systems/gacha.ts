/**
 * 抽卡系统（M4）——宝石宝箱（单抽/十连+保底）与金钥匙宝箱。
 *
 * 官方调研（详见 TASK-META.md §7）：GoW 不公布概率；社区实测宝石箱顶档 ≈1/1000、
 * 官方文档称宝石箱的传说/神话权重为普通箱的 4×/10×；官方十连只有折扣没有保底。
 * 本作口径：价格 150/1500 与「十连保底稀有或以上」为用户裁定（ASSETS-NEEDED §1.3），
 * 权重按计划 §4.2 的「顶两档 2.0%」落成万分比表（economy.ts 单源）。
 *
 * 确定性：同 seed、规则和初始存档必出同一批结果；每次开箱记入 save.gachaLog（容量 50，新的在前），
 * 供对账脚本/测试审计概率与权重表一致。
 */
import { GACHA_RULES, type GachaAudit } from '../data/gachaRules';
import { reallyOwned } from './wishlist';
import { TROOPS, getTroopById, type TroopData } from '../../data/troops';
import { COMMUNITY_KINGDOM } from '../../data/communityTroops';
import { SeededRNG } from '../../engine/rng';
import { BaseColor } from '../../engine/types';
import { stoneColorKeyOf, stoneKey, type MaterialDelta } from '../data/materials';
import { GLORY_CHEST } from '../data/economy';
import type { GachaLogEntry, MetaSave } from '../state/schema';
import { GACHA_LOG_CAP } from '../state/schema';
import {
  GACHA_PITY_MIN_IDX,
  GEM_CHEST,
  GEM_CHEST_WEIGHTS,
  GOLD_CHEST,
  GOLD_CHEST_WEIGHTS,
} from '../data/economy';
import { fail, type MetaFailure } from '../types';
import { grantTroop } from './troopProgress';
import { earn, earnMaterials, spend } from './wallet';

/** 稀有度档 → 该档全部兵种（数据只读派生，一次构建） */
const BY_RARITY_IDX: TroopData[][] = (() => {
  const bands: TroopData[][] = [[], [], [], [], [], []];
  for (const troop of TROOPS) bands[Math.min(Math.max(troop.rarityIdx, 0), 5)]!.push(troop);
  return bands;
})();

/** 六色（荣耀宝箱特质石随机取色用） */
const ALL_COLORS = [BaseColor.Blue, BaseColor.Green, BaseColor.Red, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown] as const;

function pickBand(weights: readonly number[], rng: SeededRNG): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let idx = 0; idx < weights.length; idx++) {
    roll -= weights[idx]!;
    if (roll < 0) return idx;
  }
  return weights.length - 1;
}

function pickTroopInBand(band: number, rng: SeededRNG): number {
  const pool = BY_RARITY_IDX[Math.min(Math.max(band, 0), 5)]!;
  return pool[rng.nextInt(pool.length)]!.id;
}

export interface GachaCard {
  troopId: number;
  rarityIdx: number;
  /** true = 重复获得（进了 copies，可升阶/特质/分解） */
  duplicate: boolean;
  wishlistHit?: boolean;
  pursuitGuaranteed?: boolean;
  /** 新手十连的异界来客保底 */
  noviceGuaranteed?: boolean;
}

export interface GachaDrawResult {
  ok: true;
  kind: 'gem' | 'gold';
  /** 实际消耗 */
  spent: { gems?: number; goldKeys?: number };
  cards: GachaCard[];
  /** true = 十连保底被触发（第 10 张低档结果被抬到稀有） */
  pityUsed: boolean;
}

function draw(
  save: MetaSave,
  kind: 'gem' | 'gold',
  seed: number,
  cards: GachaCard[],
  pityUsed: boolean,
  spent: { gems?: number; goldKeys?: number },
  audit?: GachaAudit,
): GachaDrawResult {
  const entry: GachaLogEntry = {
    at: Date.now(),
    kind,
    seed: seed >>> 0,
    troops: cards.map((c) => c.troopId),
    ...(audit ? { audit } : {}),
  };
  save.gachaLog.unshift(entry);
  if (save.gachaLog.length > GACHA_LOG_CAP) save.gachaLog.length = GACHA_LOG_CAP;
  return { ok: true, kind, spent, cards, pityUsed };
}

function rollBatch(
  save: MetaSave,
  weights: readonly number[],
  rng: SeededRNG,
  count: number,
  pity: boolean,
  audit?: GachaAudit,
): { cards: GachaCard[]; pityUsed: boolean } {
  const cards: GachaCard[] = [];
  let pityUsed = false;
  for (let i = 0; i < count; i++) {
    const lastRoll = i === count - 1;
    // 先正常掷稀有度，再在整批未达标时抬底；保底不覆盖自然抽出的高档卡。
    // 最终结果只入册一次，既不额外发卡，也不吞掉第十张自然出高档的机会。
    const pursuit = save.gachaWishlist.pursuit;
    if (audit && pursuit.targetId !== null && reallyOwned(save, pursuit.targetId)) pursuit.targetId = null;
    const pursuing = !!audit && pursuit.targetId !== null;
    const guaranteed = pursuing && pursuit.progress + 1 >= pursuit.limit;
    let reason: GachaAudit['reasons'][number] = 'normal';
    let band = pickBand(weights, rng);
    if (!guaranteed && pity && lastRoll && band < GACHA_PITY_MIN_IDX
      && !cards.some((c) => c.rarityIdx >= GACHA_PITY_MIN_IDX)) {
      band = GACHA_PITY_MIN_IDX;
      pityUsed = true;
      reason = 'ten-pity';
    }
    let troopId: number;
    if (guaranteed) { troopId = pursuit.targetId!; reason = 'pursuit'; }
    else if (audit) {
      const selected = audit.wishlistIds.filter((id) => getTroopById(id)?.rarityIdx === band);
      const chance = (GACHA_RULES.wishlistShares[band] ?? 0) * selected.length / GACHA_RULES.slotsPerRarity;
      if (selected.length && rng.next() < chance) troopId = rng.pick(selected);
      else if (selected.length) troopId = rng.pick(BY_RARITY_IDX[band]!.filter((t) => !selected.includes(t.id))).id;
      else troopId = pickTroopInBand(band, rng);
    } else troopId = pickTroopInBand(band, rng);
    if (pursuing) {
      pursuit.progress++;
      if (troopId === pursuit.targetId) {
        pursuit.targetId = null; pursuit.progress = 0; pursuit.completed++;
        pursuit.limit = GACHA_RULES.repeatPursuitLimit;
      }
    }
    const card = commit(save, troopId);
    if (audit) {
      card.wishlistHit = audit.wishlistIds.includes(troopId);
      card.pursuitGuaranteed = guaranteed;
      audit.reasons.push(reason);
    }
    cards.push(card);
  }
  return { cards, pityUsed };
}

/** 入册 + 重复标记（GoW：重复卡进升阶材料，语义一致） */
function commit(save: MetaSave, troopId: number): GachaCard {
  const duplicate = reallyOwned(save, troopId);
  grantTroop(save, troopId, 1);
  const rarityIdx = getTroopById(troopId)?.rarityIdx ?? 0;
  return { troopId, rarityIdx, duplicate };
}

/** 新手十连价格（首次宝石十连；馈赠的新手礼正好 1000） */
export const NOVICE_SUMMON_COST = 1000;
/** 新手十连保底：异界来客按稀有度档加权（传说 3 : 史诗 2 : 神话 1），档内均匀 */
export const NOVICE_VISITOR_WEIGHTS: Readonly<Record<number, number>> = { 3: 3, 4: 2, 5: 1 };

/** 异界来客保底池（按稀有度档分组） */
const VISITOR_BANDS: Readonly<Record<number, readonly TroopData[]>> = (() => {
  const bands: Record<number, TroopData[]> = {};
  for (const troop of TROOPS) {
    if (troop.kingdom !== COMMUNITY_KINGDOM || NOVICE_VISITOR_WEIGHTS[troop.rarityIdx] === undefined) continue;
    (bands[troop.rarityIdx] ??= []).push(troop);
  }
  return bands;
})();

export function noviceSummonAvailable(save: MetaSave): boolean {
  return !save.onboarding.noviceSummonUsed;
}

/** 当前宝石十连的实际价格（新手十连未用时为 1000） */
export function gemMultiCost(save: MetaSave): number {
  return noviceSummonAvailable(save) ? NOVICE_SUMMON_COST : GEM_CHEST.multiCost;
}

/** 按 3:2:1 抽一名异界来客（缺档自动跳过） */
export function pickNoviceVisitor(rng: SeededRNG): number {
  const tiers = Object.keys(VISITOR_BANDS).map(Number).filter((idx) => VISITOR_BANDS[idx]!.length > 0);
  const total = tiers.reduce((sum, idx) => sum + NOVICE_VISITOR_WEIGHTS[idx]!, 0);
  let roll = rng.next() * total;
  let tier = tiers[tiers.length - 1]!;
  for (const idx of tiers) {
    roll -= NOVICE_VISITOR_WEIGHTS[idx]!;
    if (roll < 0) { tier = idx; break; }
  }
  const pool = VISITOR_BANDS[tier]!;
  return pool[rng.nextInt(pool.length)]!.id;
}

/** 宝石宝箱：count = 1（150 宝石）或 10（1500 宝石，保底稀有或以上；首次十连为新手十连） */
export function openGemChest(
  save: MetaSave,
  seed: number,
  count = 1,
): GachaDrawResult | MetaFailure {
  if (count !== 1 && count !== GEM_CHEST.multiCount) {
    return fail('INVALID', '宝石宝箱只支持单抽或十连');
  }
  const novice = count === GEM_CHEST.multiCount && noviceSummonAvailable(save);
  const cost = count === 1 ? GEM_CHEST.singleCost : gemMultiCost(save);
  const paid = spend(save, { gems: cost });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const audit: GachaAudit = { rulesVersion: GACHA_RULES.version, wishlistIds: [...save.gachaWishlist.troopIds],
    pursuitBefore: { ...save.gachaWishlist.pursuit }, pursuitAfter: { ...save.gachaWishlist.pursuit }, reasons: [] };
  let cards: GachaCard[];
  let pityUsed = false;
  if (novice) {
    // 前 9 张正常抽；第 10 张固定为异界来客（稀有度 ≥ 传说，天然满足十连保底）
    cards = rollBatch(save, GEM_CHEST_WEIGHTS, rng, count - 1, false, audit).cards;
    const card = commit(save, pickNoviceVisitor(rng));
    card.wishlistHit = audit.wishlistIds.includes(card.troopId);
    card.noviceGuaranteed = true;
    audit.reasons.push('novice');
    cards.push(card);
    save.onboarding.noviceSummonUsed = true;
    if (save.onboarding.step === 'summon') save.onboarding.step = 'done';
  } else {
    ({ cards, pityUsed } = rollBatch(save, GEM_CHEST_WEIGHTS, rng, count, count === GEM_CHEST.multiCount, audit));
  }
  audit.pursuitAfter = { ...save.gachaWishlist.pursuit };
  return draw(save, 'gem', seed, cards, pityUsed, { gems: cost }, audit);
}

/**
 * 金钥匙宝箱：1 把金钥匙一开，池子偏低稀有度。
 *
 * `count` > 1 是**原子批量**（CH-1 修复口径）：先一次性扣掉 count 把钥匙，
 * 扣不动就整批不成交（一张卡都不入册）。历史实现是"UI 层循环 count 次单抽"，
 * 第 k 次失败时前 k-1 次已 persist 却被整块丢弃 → 玩家资源静默损失。
 * 金宝箱无十连保底（保底是宝石池的裁定特权）。
 */
export function openGoldChest(save: MetaSave, seed: number, count = 1): GachaDrawResult | MetaFailure {
  if (!Number.isInteger(count) || count < 1 || count > GOLD_CHEST.multiCount) {
    return fail('INVALID', `金钥匙宝箱一次可开 1~${GOLD_CHEST.multiCount} 次`);
  }
  const n = count;
  const cost = GOLD_CHEST.keyCost * n;
  const paid = spend(save, { goldKeys: cost });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const { cards, pityUsed } = rollBatch(save, GOLD_CHEST_WEIGHTS, rng, n, false);
  return draw(save, 'gold', seed, cards, pityUsed, { goldKeys: cost });
}

export interface GloryChestResult {
  ok: true;
  kind: 'glory';
  count: number;
  spent: { glory: number; gloryKeys: number };
  /** 出的部队卡（可能为空——荣耀箱以特质石为主） */
  cards: GachaCard[];
  goldKeys: number;
  /** 特质石/圣辉石入账 */
  stones: MaterialDelta;
}

/**
 * 荣耀宝箱（官方 Glory Chest 语义：20 荣耀一开、特质石为主）：
 * 25% 部队卡（低稀有度带）/ 10% 金钥匙 / 其余特质石包（5% 出圣辉石）。
 */
export function openGloryChest(save: MetaSave, seed: number, count = 1): GloryChestResult | MetaFailure {
  if (count !== 1 && count !== GLORY_CHEST.multiCount) {
    return fail('INVALID', '荣耀宝箱只支持单抽或十连');
  }
  const usedKeys = Math.min(save.currencies.gloryKeys, count);
  const totalCost = GLORY_CHEST.cost * (count - usedKeys);
  const paid = spend(save, { glory: totalCost, gloryKeys: usedKeys });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const cards: GachaCard[] = [];
  let goldKeys = 0;
  const stones: MaterialDelta = { traitstones: {} };
  for (let index = 0; index < count; index++) {
    const roll = rng.next();
    if (roll < GLORY_CHEST.troopChance) {
      // 低稀有度带（0~3）出一张卡，与金宝箱池同带宽
      const band = rng.nextInt(4);
      cards.push(commit(save, pickTroopInBand(band, rng)));
    } else if (roll < GLORY_CHEST.troopChance + GLORY_CHEST.goldKeyChance) {
      goldKeys += 1;
    } else {
      const colorKey = stoneColorKeyOf(rng.pick(ALL_COLORS));
      if (rng.next() < GLORY_CHEST.celestialChance) {
        stones.traitstones!['celestial'] = (stones.traitstones!['celestial'] ?? 0) + 1;
      } else if (rng.next() < 0.35) {
        const key = stoneKey('major', colorKey)!;
        stones.traitstones![key] = (stones.traitstones![key] ?? 0) + 2 + rng.nextInt(2);
      } else {
        const key = stoneKey('minor', colorKey)!;
        stones.traitstones![key] = (stones.traitstones![key] ?? 0) + 3 + rng.nextInt(3);
      }
    }
  }
  if (goldKeys > 0) earn(save, { goldKeys });
  if (Object.keys(stones.traitstones ?? {}).length > 0) earnMaterials(save, stones);
  const entry: GachaLogEntry = { at: Date.now(), kind: 'glory', seed: seed >>> 0, troops: cards.map((c) => c.troopId) };
  save.gachaLog.unshift(entry);
  if (save.gachaLog.length > GACHA_LOG_CAP) save.gachaLog.length = GACHA_LOG_CAP;
  return { ok: true, kind: 'glory', count, spent: { glory: totalCost, gloryKeys: usedKeys }, cards, goldKeys, stones };
}
