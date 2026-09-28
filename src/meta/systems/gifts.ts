/**
 * 馈赠里程碑：进度读模型 + 领取（新手礼领取推进新手引导）。
 */
import { GIFTS, GIFT_STARTER_ID, type GiftDef, type GiftMetric } from '../data/gifts';
import { QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { fnv1a32 } from '../data/hash';
import { SeededRNG } from '../../engine/rng';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { earn } from './wallet';
import { grantRandomTroop, type GachaCard } from './gacha';

export function giftMetricValue(save: MetaSave, metric: GiftMetric): number {
  switch (metric) {
    case 'always': return 1;
    case 'heroLevel': return save.hero.level;
    case 'battlesWon': return save.stats.battlesWon;
    case 'questChains': return Object.values(save.kingdoms).filter((k) => (k?.questsDone ?? 0) >= QUESTS_PER_KINGDOM).length;
    case 'kingdomsMaxed': return Object.values(save.kingdoms).filter((k) => (k?.level ?? 1) >= 10).length;
    case 'arenaWins': return save.arena.seasonWins;
    case 'arenaBestRun': return save.arena.bestRun;
    case 'invasionLeague': return Math.max(save.invasion.bestLeague, save.invasion.league);
    case 'eventWins': return save.gifts.eventWins;
    case 'towerBest': return Math.max(save.gifts.towerBest, save.eventWeeks.towerOfDoom?.eventData.floorBest ?? 0);
    // 修改器期间按真实收藏计
    case 'troopsOwned': return Object.keys(save.collectionTruth ?? save.collection).length;
  }
}

export type GiftStatus = 'claimed' | 'ready' | 'locked';

export interface GiftRow {
  gift: GiftDef;
  value: number;
  status: GiftStatus;
}

export function giftRows(save: MetaSave): GiftRow[] {
  const claimed = new Set(save.gifts.claimed);
  return GIFTS.map((gift) => {
    const value = giftMetricValue(save, gift.metric);
    const status: GiftStatus = claimed.has(gift.id) ? 'claimed' : value >= gift.target ? 'ready' : 'locked';
    return { gift, value, status };
  });
}

/** 可领取的馈赠数（地图入口红点） */
export function giftsReady(save: MetaSave): number {
  return giftRows(save).filter((row) => row.status === 'ready').length;
}

export type GiftClaimResult = { ok: true; ids: string[]; gems: number; cards: GachaCard[] } | MetaFailure;

function markClaimed(save: MetaSave, rows: GiftRow[], seed: number): GiftClaimResult {
  let gems = 0;
  const cards: GachaCard[] = [];
  for (const row of rows) {
    save.gifts.claimed.push(row.gift.id);
    gems += row.gift.gems;
    if (row.gift.troop) cards.push(grantRandomTroop(save, row.gift.troop, new SeededRNG((seed ^ fnv1a32(row.gift.id)) >>> 0)));
  }
  if (gems > 0) earn(save, { gems });
  if (rows.some((row) => row.gift.id === GIFT_STARTER_ID) && save.onboarding.step === 'gift') save.onboarding.step = 'summon';
  return { ok: true, ids: rows.map((row) => row.gift.id), gems, cards };
}

/** seed 由网关注入（部队卡随机） */
export function claimGift(save: MetaSave, id: string, seed = 0): GiftClaimResult {
  const row = giftRows(save).find((r) => r.gift.id === id);
  if (!row) return fail('INVALID', '未知馈赠');
  if (row.status === 'claimed') return fail('INVALID', '该馈赠已领取');
  if (row.status === 'locked') return fail('PREREQ_LOCKED', '尚未达成');
  return markClaimed(save, [row], seed);
}

export function claimAllGifts(save: MetaSave, seed = 0): GiftClaimResult {
  const rows = giftRows(save).filter((r) => r.status === 'ready');
  if (rows.length === 0) return fail('INVALID', '没有可领取的馈赠');
  return markClaimed(save, rows, seed);
}
