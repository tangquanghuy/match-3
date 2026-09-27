/**
 * 收集修改器。当前收藏可以被临时改掉；真实收集留在 collectionTruth，解锁和还原初始都不写它。
 */
import { kingdomTroopPool } from '../data/kingdoms';
import { starterTroopIds } from '../data/economy';
import type { MetaSave, TroopRecord } from '../state/schema';
import { fail, type MetaFailure } from '../types';

export interface CollectionModifierOk {
  ok: true;
  mode: 'real' | 'modified';
  owned: number;
  realOwned: number;
  added: number;
}

function freshRecord(): TroopRecord {
  return { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
}

function cloneRecord(rec: TroopRecord): TroopRecord {
  return {
    copies: rec.copies,
    level: rec.level,
    ascension: rec.ascension,
    traits: [rec.traits[0], rec.traits[1], rec.traits[2]],
    locked: rec.locked,
  };
}

function cloneBook(book: Record<string, TroopRecord>): Record<string, TroopRecord> {
  const copy: Record<string, TroopRecord> = {};
  for (const [key, rec] of Object.entries(book)) copy[key] = cloneRecord(rec);
  return copy;
}

/** 第一次改当前收藏之前，把当时的真实收集冻住。已经冻过就不再覆盖。 */
function keepTruth(save: MetaSave): void {
  if (save.collectionTruth === null) save.collectionTruth = cloneBook(save.collection);
}

function result(save: MetaSave, added: number): CollectionModifierOk {
  const real = save.collectionTruth ?? save.collection;
  return {
    ok: true,
    mode: save.collectionTruth === null ? 'real' : 'modified',
    owned: Object.keys(save.collection).length,
    realOwned: Object.keys(real).length,
    added,
  };
}

/** 把所选王国里还没有的部队补进当前收藏。已有卡的等级和副本不动。 */
export function unlockKingdomTroops(save: MetaSave, kingdom: string): CollectionModifierOk | MetaFailure {
  const pool = kingdomTroopPool(kingdom);
  if (pool.length === 0) return fail('UNKNOWN_TROOP', `未知王国：${kingdom}`);
  const missing = pool.filter((troop) => save.collection[String(troop.id)] === undefined);
  if (missing.length === 0) return result(save, 0);
  keepTruth(save);
  for (const troop of missing) save.collection[String(troop.id)] = freshRecord();
  return result(save, missing.length);
}

/** 当前收藏换回真实收集，并清掉备份（之后的正常获得继续记在真实收集上）。 */
export function restoreRealCollection(save: MetaSave): CollectionModifierOk {
  if (save.collectionTruth !== null) {
    save.collection = cloneBook(save.collectionTruth);
    save.collectionTruth = null;
  }
  return result(save, 0);
}

/** 当前收藏换成新档的三张初始普通卡。真实收集留在备份里。 */
export function restoreInitialCollection(save: MetaSave): CollectionModifierOk {
  keepTruth(save);
  const next: Record<string, TroopRecord> = {};
  for (const id of starterTroopIds()) next[String(id)] = freshRecord();
  save.collection = next;
  return result(save, 0);
}
