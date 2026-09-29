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
import { ARCANE_STONE_KEYS, stoneColorKeyOf, stoneKey, type MaterialDelta } from '../data/materials';
import { GEM_CHEST_EXTRA, GLORY_CHEST, GLORY_CHEST_LOOT, GOLD_CHEST_LOOT, type ChestLoot, type ChestLootRow } from '../data/economy';
import type { IngotKey } from '../data/materials';
import type { CurrencyDelta } from '../types';
import type { GachaLogEntry, MetaSave } from '../state/schema';
import { GACHA_LOG_CAP } from '../state/schema';
import {
  GACHA_PITY_MIN_IDX,
  GEM_CHEST,
  GEM_CHEST_BASE,
  GEM_CHEST_WEIGHTS,
  GOLD_CHEST,
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
  /** 非部队掉落（宝石箱 20% 出金属锭 / 特质石），已入账 */
  materials: MaterialDelta;
  /** true = 十连保底被触发（第 10 张结果被抬到稀有部队） */
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
  materials: MaterialDelta = {},
): GachaDrawResult {
  const entry: GachaLogEntry = {
    // 命令时刻：权威核心在执行命令前把 savedAt 设为服务器时钟（systems 不自取时钟）
    at: save.savedAt,
    kind,
    seed: seed >>> 0,
    troops: cards.map((c) => c.troopId),
    ...(audit ? { audit } : {}),
  };
  save.gachaLog.unshift(entry);
  if (save.gachaLog.length > GACHA_LOG_CAP) save.gachaLog.length = GACHA_LOG_CAP;
  return { ok: true, kind, spent, cards, materials, pityUsed };
}

/** 档位下标 6 = 非部队掉落（宝石箱的金属锭 / 特质石） */
const EXTRA_BAND = 6;

function rollBatch(
  save: MetaSave,
  weights: readonly number[],
  rng: SeededRNG,
  count: number,
  pity: boolean,
  audit?: GachaAudit,
  extras?: { rows: readonly ChestLootRow[]; weight: number; acc: LootAcc },
): { cards: GachaCard[]; pityUsed: boolean } {
  const cards: GachaCard[] = [];
  let pityUsed = false;
  const bandWeights = extras ? [...weights, extras.weight] : weights;
  for (let i = 0; i < count; i++) {
    const lastRoll = i === count - 1;
    // 先正常掷稀有度，再在整批未达标时抬底；保底不覆盖自然抽出的高档卡。
    // 最终结果只入册一次，既不额外发卡，也不吞掉第十张自然出高档的机会。
    const pursuit = save.gachaWishlist.pursuit;
    if (audit && pursuit.targetId !== null && reallyOwned(save, pursuit.targetId)) pursuit.targetId = null;
    const pursuing = !!audit && pursuit.targetId !== null;
    const guaranteed = pursuing && pursuit.progress + 1 >= pursuit.limit;
    let reason: GachaAudit['reasons'][number] = 'normal';
    let band = pickBand(bandWeights, rng);
    if (!guaranteed && pity && lastRoll && (band < GACHA_PITY_MIN_IDX || band === EXTRA_BAND)
      && !cards.some((c) => c.rarityIdx >= GACHA_PITY_MIN_IDX)) {
      band = GACHA_PITY_MIN_IDX;
      pityUsed = true;
      reason = 'ten-pity';
    }
    if (!guaranteed && band === EXTRA_BAND && extras) {
      // 材料抽：不出卡、不写 reasons（reasons 与日志里的部队逐张对齐），但照常计入追寻进度
      addLoot(extras.acc, pickRow(extras.rows, rng).loot as Exclude<ChestLoot, { type: 'troop' }>, rng);
      if (pursuing) pursuit.progress++;
      continue;
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

/** 按稀有度档随机发一张部队卡（与宝石宝箱同池；馈赠等奖励用，不写抽卡日志） */
export function grantRandomTroop(save: MetaSave, rarityIdx: number, rng: SeededRNG): GachaCard {
  return commit(save, pickTroopInBand(rarityIdx, rng));
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
  // 官方口径：部队 80%，其余 20% 是金属锭 / 特质石（GEM_CHEST_EXTRA）
  const acc = newLootAcc();
  const extras = { rows: GEM_CHEST_EXTRA, weight: GEM_CHEST_BASE - GEM_CHEST_WEIGHTS.reduce((a, b) => a + b, 0), acc };
  if (novice) {
    // 前 9 张正常抽；第 10 张固定为异界来客（稀有度 ≥ 传说，天然满足十连保底）
    cards = rollBatch(save, GEM_CHEST_WEIGHTS, rng, count - 1, false, audit, extras).cards;
    const card = commit(save, pickNoviceVisitor(rng));
    card.wishlistHit = audit.wishlistIds.includes(card.troopId);
    card.noviceGuaranteed = true;
    audit.reasons.push('novice');
    cards.push(card);
    save.onboarding.noviceSummonUsed = true;
    if (save.onboarding.step === 'summon') save.onboarding.step = 'done';
  } else {
    ({ cards, pityUsed } = rollBatch(save, GEM_CHEST_WEIGHTS, rng, count, count === GEM_CHEST.multiCount, audit, extras));
  }
  audit.pursuitAfter = { ...save.gachaWishlist.pursuit };
  const { stones } = settleLoot(save, acc);
  return draw(save, 'gem', seed, cards, pityUsed, { gems: cost }, audit, stones);
}

/** 金宝箱 / 荣耀宝箱开箱结果：一箱一项掉落，部队卡、资源、特质石分别汇总 */
export interface ChestLootResult {
  ok: true;
  kind: 'gold' | 'glory';
  count: number;
  spent: CurrencyDelta;
  /** 金宝箱：钥匙不足时用黄金就地补的钥匙数（荣耀箱恒 0） */
  boughtKeys: number;
  /** 出的部队卡（可能为空——两种箱子都以材料/资源为主） */
  cards: GachaCard[];
  /** 资源入账（黄金 / 荣耀 / 灵魂 / 宝石） */
  currencies: { gold: number; glory: number; souls: number; gems: number };
  /** 特质石入账 */
  stones: MaterialDelta;
}
export type GloryChestResult = ChestLootResult;

/** 非部队掉落的汇总器：资源 / 特质石 / 金属锭先累加，整批结束后一次入账 */
interface LootAcc {
  currencies: { gold: number; glory: number; souls: number; gems: number };
  traitstones: Record<string, number>;
  ingots: Partial<Record<IngotKey, number>>;
}

function newLootAcc(): LootAcc {
  return { currencies: { gold: 0, glory: 0, souls: 0, gems: 0 }, traitstones: {}, ingots: {} };
}

function pickRow(rows: readonly ChestLootRow[], rng: SeededRNG): ChestLootRow {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng.next() * total;
  for (const row of rows) {
    roll -= row.weight;
    if (roll < 0) return row;
  }
  return rows[rows.length - 1]!;
}

/** 记一项非部队掉落（部队档由调用方入册） */
function addLoot(acc: LootAcc, loot: Exclude<ChestLoot, { type: 'troop' }>, rng: SeededRNG): void {
  if (loot.type === 'currency') {
    acc.currencies[loot.key] += loot.amount;
  } else if (loot.type === 'ingot') {
    acc.ingots[loot.key] = (acc.ingots[loot.key] ?? 0) + loot.amount;
  } else {
    const key = loot.tier === 'celestial' ? 'celestial'
      : loot.tier === 'arcane' ? rng.pick(ARCANE_STONE_KEYS)
      : stoneKey(loot.tier, stoneColorKeyOf(rng.pick(ALL_COLORS)))!;
    acc.traitstones[key] = (acc.traitstones[key] ?? 0) + loot.amount;
  }
}

function settleLoot(save: MetaSave, acc: LootAcc): { currencies: LootAcc['currencies']; stones: MaterialDelta } {
  earn(save, acc.currencies);
  const stones: MaterialDelta = { traitstones: acc.traitstones, ...(Object.keys(acc.ingots).length ? { ingots: acc.ingots } : {}) };
  if (Object.keys(acc.traitstones).length > 0 || Object.keys(acc.ingots).length > 0) earnMaterials(save, stones);
  return { currencies: acc.currencies, stones };
}

/** 按掉落表逐箱掷一项并立刻入账（部队入册、资源/特质石汇总后一次入账） */
function rollLoot(save: MetaSave, rows: readonly ChestLootRow[], rng: SeededRNG, count: number): Pick<ChestLootResult, 'cards' | 'currencies' | 'stones'> {
  const cards: GachaCard[] = [];
  const acc = newLootAcc();
  for (let index = 0; index < count; index++) {
    const loot = pickRow(rows, rng).loot;
    if (loot.type === 'troop') cards.push(commit(save, pickTroopInBand(loot.rarityIdx, rng)));
    else addLoot(acc, loot, rng);
  }
  return { cards, ...settleLoot(save, acc) };
}

function logLoot(save: MetaSave, kind: 'gold' | 'glory', seed: number, cards: GachaCard[]): void {
  const entry: GachaLogEntry = { at: save.savedAt, kind, seed: seed >>> 0, troops: cards.map((c) => c.troopId) };
  save.gachaLog.unshift(entry);
  if (save.gachaLog.length > GACHA_LOG_CAP) save.gachaLog.length = GACHA_LOG_CAP;
}

/** 开 count 箱金宝箱的成交价：先用钥匙，缺的钥匙（允许时）按 300 黄金/把补 */
export function goldChestPrice(save: MetaSave, count: number): { keys: number; boughtKeys: number; gold: number } {
  const keys = Math.min(save.currencies.goldKeys, count * GOLD_CHEST.keyCost);
  const boughtKeys = count * GOLD_CHEST.keyCost - keys;
  return { keys, boughtKeys, gold: boughtKeys * GOLD_CHEST.keyGoldPrice };
}

/**
 * 金钥匙宝箱（GoW 黄金宝箱口径：资源与低档特质石为主，部队只到稀有，传说千分之一）。
 *
 * `count` > 1 是**原子批量**（CH-1 修复口径）：一次性扣费，扣不动就整批不成交。
 * `buyMissingKeys`：钥匙不足时就地用黄金补（300/把），与开箱同一笔原子扣费——
 * 不存在「买了钥匙却没开箱」或「开了箱却没扣黄金」的中间态。缺省不补，钥匙不足即 INSUFFICIENT。
 * 金宝箱无十连保底（保底是宝石池的裁定特权）。
 */
export function openGoldChest(
  save: MetaSave,
  seed: number,
  count = 1,
  opts: { buyMissingKeys?: boolean } = {},
): ChestLootResult | MetaFailure {
  if (!Number.isInteger(count) || count < 1 || count > GOLD_CHEST.multiCount) {
    return fail('INVALID', `金钥匙宝箱一次可开 1~${GOLD_CHEST.multiCount} 次`);
  }
  const price = goldChestPrice(save, count);
  const spent: CurrencyDelta = opts.buyMissingKeys && price.boughtKeys > 0
    ? { ...(price.keys ? { goldKeys: price.keys } : {}), gold: price.gold }
    : { goldKeys: count * GOLD_CHEST.keyCost };
  const paid = spend(save, spent);
  if (!paid.ok) return paid;
  const boughtKeys = spent.gold ? price.boughtKeys : 0;
  const rng = new SeededRNG(seed);
  const loot = rollLoot(save, GOLD_CHEST_LOOT, rng, count);
  logLoot(save, 'gold', seed, loot.cards);
  return { ok: true, kind: 'gold', count, spent, boughtKeys, ...loot };
}

/**
 * 荣耀宝箱（GoW 官方公示原样：部队 70% / 特质石 20% / 资源 10%，见 GLORY_CHEST_LOOT）。
 * 优先消耗荣耀钥匙（竞技场产出），不足部分按 20 荣耀/箱扣。
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
  const loot = rollLoot(save, GLORY_CHEST_LOOT, rng, count);
  logLoot(save, 'glory', seed, loot.cards);
  return { ok: true, kind: 'glory', count, spent: { glory: totalCost, gloryKeys: usedKeys }, boughtKeys: 0, ...loot };
}
