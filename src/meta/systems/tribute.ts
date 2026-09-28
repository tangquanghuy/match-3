/**
 * 进贡系统——离线可结算的王国进贡（GoW Tribute 口径 + 单机节奏）。
 *
 * 确定性口径：每小时的命中判定用「王国名 + 绝对小时序号」做种子
 * （fnv1a32 与 session/battleResult 的 digestString 同算法），
 * 同一存档在任何时刻收取，结果都一致——离线收益可复现、可对账。
 *
 * 规则（数值单源 data/economy.ts + data/kingdomTribute.ts）：
 *  - 每王国每小时掷一次，命中按该王国配比产出黄金 / 灵魂 / 荣耀，主城翻倍；
 *  - **一键收取**时按绝对小时分组：同一小时有 ≥2 个王国进贡 → 额外宝石与金钥匙
 *    （GoW「多国同时进贡额外给宝石和钥匙」）。单国收取没有这份加成；
 *  - 只有已开放（冒险者等级达标）的王国进贡；每国最多攒 12 小时。
 */
import { SeededRNG } from '../../engine/rng';
import type { MetaSave } from '../state/schema';
import { TRIBUTE, tributeChance, tributeMultiBonus } from '../data/economy';
import { tributeYield } from '../data/kingdomTribute';
import { KINGDOM_ORDER, kingdomUnlockLevel } from '../data/kingdoms';
import { earn } from './wallet';

const HOUR_MS = 3_600_000;

/** fnv1a32（与 session/battleResult.digestString 同算法；本地实现避免跨层取物流 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc7;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 某王国某一小时的命中判定（导出供测试独立复算） */
export function tributeHourHit(kingdom: string, hourIndex: number, level: number): boolean {
  const rng = new SeededRNG(fnv1a32(`${kingdom}:${hourIndex}`));
  return rng.next() < tributeChance(level);
}

export interface TributePreview {
  kingdom: string;
  /** 可结算的小时数（已按 12 小时上限截断） */
  hours: number;
  /** 其中命中进贡的小时数 */
  hits: number;
  gold: number;
  souls: number;
  glory: number;
  /** 单国进贡本身不出金钥匙（钥匙与宝石只来自多国同时进贡），保留字段兼容旧界面 */
  goldKeys: number;
  /** 命中的绝对小时序号（一键收取按小时分组算多国加成） */
  hitHours: number[];
  /** 是否主城（产出已含翻倍） */
  home: boolean;
  /** 本王国每小时命中概率 */
  chance: number;
  /**
   * 是否有可收取内容（地图进贡气泡与收取按钮的唯一判据）：可实际入账的产出量 > 0。
   * （UX M-4：不能用「累计了小时数」判，否则会出现「0 袋 + 按钮可点 + 点了说没有」。）
   */
  ready: boolean;
  /** 未截断的累计小时数；> capHours 即正在溢出（超出部分在收取瞬间永久丢失） */
  pendingHours: number;
  /** 是否已达 12 小时上限并开始溢出 */
  overflowing: boolean;
  /** 达到 12 小时上限的时刻（毫秒时间戳）；已溢出时是过去的时刻 */
  capAt: number;
  /** 下一个小时结算的时刻 */
  nextHourAt: number;
}

function levelOf(save: MetaSave, kingdom: string): number {
  return save.kingdoms[kingdom]?.level ?? 1;
}

function lastTributeOf(save: MetaSave, kingdom: string): number {
  return save.kingdoms[kingdom]?.lastTributeAt ?? 0;
}

/** 冒险者等级是否已开放该王国（未开放的王国不进贡） */
export function tributeKingdomOpen(save: MetaSave, kingdom: string): boolean {
  return save.hero.level >= kingdomUnlockLevel(kingdom);
}

/** 预览可收取的进贡（地图气泡、王国弹层、宝库页），纯只读。 */
export function tributePreview(save: MetaSave, kingdom: string, now: number): TributePreview {
  const level = levelOf(save, kingdom);
  const last = lastTributeOf(save, kingdom);
  const pending = Math.max(0, Math.floor((now - last) / HOUR_MS));
  const hours = Math.min(pending, TRIBUTE.capHours);
  const firstHour = Math.floor(last / HOUR_MS) + 1;
  const chance = tributeChance(level);
  const home = save.homeKingdom === kingdom;
  const per = tributeYield(kingdom, level, home);
  const hitHours: number[] = [];
  for (let i = 0; i < hours; i++) {
    const hourIndex = firstHour + i;
    const rng = new SeededRNG(fnv1a32(`${kingdom}:${hourIndex}`));
    if (rng.next() < chance) hitHours.push(hourIndex);
  }
  const hits = hitHours.length;
  const gold = hits * per.gold;
  const souls = hits * per.souls;
  const glory = hits * per.glory;
  return {
    kingdom,
    hours,
    hits,
    gold,
    souls,
    glory,
    goldKeys: 0,
    hitHours,
    home,
    chance,
    ready: gold > 0 || souls > 0 || glory > 0,
    pendingHours: pending,
    overflowing: pending > TRIBUTE.capHours,
    capAt: last + TRIBUTE.capHours * HOUR_MS,
    nextHourAt: last + (pending + 1) * HOUR_MS,
  };
}

/**
 * 收取后的新锚点：没溢出时只推进整小时（不吞掉正在累积的半小时）；
 * 已溢出则直接拨到 now（超出 12 小时的部分本来就作废）。
 */
function nextAnchor(save: MetaSave, kingdom: string, now: number): number {
  const last = lastTributeOf(save, kingdom);
  const pending = Math.max(0, Math.floor((now - last) / HOUR_MS));
  return pending > TRIBUTE.capHours ? now : last + pending * HOUR_MS;
}

function setAnchor(save: MetaSave, kingdom: string, at: number): void {
  const entry = save.kingdoms[kingdom] ?? { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
  entry.lastTributeAt = at;
  save.kingdoms[kingdom] = entry;
}

/** 实际入账的单国进贡结果 */
export interface TributeCollected {
  hours: number;
  hits: number;
  gold: number;
  souls: number;
  glory: number;
  goldKeys: number;
}

/**
 * 单国收取：入账并推进锚点。没有可结算内容也返回 ok（幂等）。
 * 单国收取拿不到多国同时进贡的宝石/钥匙加成——界面默认走 collectAllTribute。
 */
export function collectTribute(
  save: MetaSave,
  kingdom: string,
  now: number,
): { ok: true; collected: TributeCollected } {
  const preview = tributePreview(save, kingdom, now);
  if (preview.ready) {
    earn(save, { gold: preview.gold, souls: preview.souls, glory: preview.glory });
    save.stats.goldEarned += preview.gold;
    save.stats.soulsEarned += preview.souls;
  }
  setAnchor(save, kingdom, nextAnchor(save, kingdom, now));
  const { hours, hits, gold, souls, glory } = preview;
  return { ok: true, collected: { hours, hits, gold, souls, glory, goldKeys: 0 } };
}

/** 某一小时的多国同时进贡加成 */
export interface TributeHourBonus {
  hourIndex: number;
  /** 该小时的时刻（毫秒） */
  at: number;
  /** 该小时一起进贡的王国 */
  kingdoms: string[];
  gems: number;
  goldKeys: number;
}

export interface TributeTotals {
  gold: number;
  souls: number;
  glory: number;
  gems: number;
  goldKeys: number;
}

/** 宝库总览：全部已开放王国的进贡 + 多国同时进贡加成 */
export interface TributeTreasury {
  /** 已开放王国的逐国预览（按推进序） */
  kingdoms: TributePreview[];
  /** 有产出的王国数 */
  readyCount: number;
  bonuses: TributeHourBonus[];
  totals: TributeTotals;
  /** 其中来自多国加成的部分 */
  bonusTotals: { gems: number; goldKeys: number };
  ready: boolean;
  /** 有王国已攒满并在溢出 */
  overflowing: boolean;
  /** 最早一个王国攒满 12 小时的时刻（全都满了则为过去的时刻） */
  earliestCapAt: number;
  /** 最近的下一次结算时刻 */
  nextHourAt: number;
}

export function tributeTreasury(save: MetaSave, now: number): TributeTreasury {
  const kingdoms = KINGDOM_ORDER.filter((k) => tributeKingdomOpen(save, k)).map((k) => tributePreview(save, k, now));
  const byHour = new Map<number, string[]>();
  for (const p of kingdoms) {
    for (const hour of p.hitHours) {
      const list = byHour.get(hour) ?? [];
      list.push(p.kingdom);
      byHour.set(hour, list);
    }
  }
  const bonuses: TributeHourBonus[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hourIndex, list]) => ({ hourIndex, at: hourIndex * HOUR_MS, kingdoms: list, ...tributeMultiBonus(list.length) }))
    .filter((b) => b.gems > 0 || b.goldKeys > 0);
  const bonusTotals = bonuses.reduce((acc, b) => ({ gems: acc.gems + b.gems, goldKeys: acc.goldKeys + b.goldKeys }), { gems: 0, goldKeys: 0 });
  const totals: TributeTotals = {
    gold: kingdoms.reduce((s, p) => s + p.gold, 0),
    souls: kingdoms.reduce((s, p) => s + p.souls, 0),
    glory: kingdoms.reduce((s, p) => s + p.glory, 0),
    gems: bonusTotals.gems,
    goldKeys: bonusTotals.goldKeys,
  };
  const readyCount = kingdoms.filter((p) => p.ready).length;
  return {
    kingdoms,
    readyCount,
    bonuses,
    totals,
    bonusTotals,
    ready: readyCount > 0,
    overflowing: kingdoms.some((p) => p.overflowing),
    earliestCapAt: kingdoms.length ? Math.min(...kingdoms.map((p) => p.capAt)) : now,
    nextHourAt: kingdoms.length ? Math.min(...kingdoms.map((p) => p.nextHourAt)) : now + HOUR_MS,
  };
}

/** 一键收取全部王国进贡（含多国同时进贡加成）。幂等：同一时刻再收为空。 */
export function collectAllTribute(save: MetaSave, now: number): { ok: true; haul: TributeTreasury } {
  const haul = tributeTreasury(save, now);
  const { totals } = haul;
  if (totals.gold || totals.souls || totals.glory || totals.gems || totals.goldKeys) {
    earn(save, { ...totals });
    save.stats.goldEarned += totals.gold;
    save.stats.soulsEarned += totals.souls;
  }
  for (const p of haul.kingdoms) setAnchor(save, p.kingdom, nextAnchor(save, p.kingdom, now));
  return { ok: true, haul };
}
