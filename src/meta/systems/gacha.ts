/**
 * 抽卡系统（M4）——宝石宝箱（单抽/十连+保底）与金钥匙宝箱。
 *
 * 官方调研（详见 TASK-META.md §7）：GoW 不公布概率；社区实测宝石箱顶档 ≈1/1000、
 * 官方文档称宝石箱的传说/神话权重为普通箱的 4×/10×；官方十连只有折扣没有保底。
 * 本作口径：价格 150/1500 与「十连保底 Epic+」为用户裁定（ASSETS-NEEDED §1.3），
 * 权重按计划 §4.2 的「顶两档 2.0%」落成万分比表（economy.ts 单源）。
 *
 * 确定性：同 seed 必出同一批结果；每次开箱记入 save.gachaLog（容量 50，新的在前），
 * 供对账脚本/测试审计概率与权重表一致。
 */
import { TROOPS, getTroopById, type TroopData } from '../../data/troops';
import { SeededRNG } from '../../engine/rng';
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
import { spend } from './wallet';

/** 稀有度档 → 该档全部兵种（数据只读派生，一次构建） */
const BY_RARITY_IDX: TroopData[][] = (() => {
  const bands: TroopData[][] = [[], [], [], [], [], []];
  for (const troop of TROOPS) bands[Math.min(Math.max(troop.rarityIdx, 0), 5)]!.push(troop);
  return bands;
})();

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
}

export interface GachaDrawResult {
  ok: true;
  kind: 'gem' | 'gold';
  /** 实际消耗 */
  spent: { gems?: number; goldKeys?: number };
  cards: GachaCard[];
  /** true = 十连保底被触发（第 10 张被抬到 Epic+） */
  pityUsed: boolean;
}

function draw(
  save: MetaSave,
  kind: 'gem' | 'gold',
  seed: number,
  cards: GachaCard[],
  pityUsed: boolean,
  spent: { gems?: number; goldKeys?: number },
): GachaDrawResult {
  const entry: GachaLogEntry = {
    at: Date.now(),
    kind,
    seed: seed >>> 0,
    troops: cards.map((c) => c.troopId),
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
): { cards: GachaCard[]; pityUsed: boolean } {
  const cards: GachaCard[] = [];
  let pityUsed = false;
  for (let i = 0; i < count; i++) {
    const lastRoll = i === count - 1;
    // 保底在最后一抽结算：前 count-1 张都没有保底档时，最后一抽直接从保底档取人
    // （先判定再入册，不会出现「多送一张再撤回」的账目问题）
    if (pity && lastRoll && !cards.some((c) => c.rarityIdx >= GACHA_PITY_MIN_IDX)) {
      cards.push(commit(save, pickTroopInBand(GACHA_PITY_MIN_IDX, rng)));
      pityUsed = true;
      continue;
    }
    cards.push(commit(save, pickTroopInBand(pickBand(weights, rng), rng)));
  }
  return { cards, pityUsed };
}

/** 入册 + 重复标记（GoW：重复卡进升阶材料，语义一致） */
function commit(save: MetaSave, troopId: number): GachaCard {
  const duplicate = save.collection[String(troopId)] !== undefined;
  grantTroop(save, troopId, 1);
  const rarityIdx = getTroopById(troopId)?.rarityIdx ?? 0;
  return { troopId, rarityIdx, duplicate };
}

/** 宝石宝箱：count = 1（150 宝石）或 10（1500 宝石，保底 Epic+） */
export function openGemChest(
  save: MetaSave,
  seed: number,
  count: 1 | 10 = 1,
): GachaDrawResult | MetaFailure {
  if (count !== 1 && count !== GEM_CHEST.multiCount) {
    return fail('INVALID', '宝石宝箱只支持单抽或十连');
  }
  const cost = count === 1 ? GEM_CHEST.singleCost : GEM_CHEST.multiCost;
  const paid = spend(save, { gems: cost });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const { cards, pityUsed } = rollBatch(save, GEM_CHEST_WEIGHTS, rng, count, count === 10);
  return draw(save, 'gem', seed, cards, pityUsed, { gems: cost });
}

/** 金钥匙宝箱：1 把金钥匙一开，池子偏低稀有度 */
export function openGoldChest(save: MetaSave, seed: number): GachaDrawResult | MetaFailure {
  const paid = spend(save, { goldKeys: GOLD_CHEST.keyCost });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const { cards, pityUsed } = rollBatch(save, GOLD_CHEST_WEIGHTS, rng, 1, false);
  return draw(save, 'gold', seed, cards, pityUsed, { goldKeys: GOLD_CHEST.keyCost });
}
