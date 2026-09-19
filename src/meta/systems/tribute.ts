/**
 * 进贡系统（M3）——离线可结算的王国进贡（计划 §4.5）。
 *
 * 确定性口径：每小时的命中判定用「王国名 + 绝对小时序号」做种子
 * （fnv1a32 与 session/battleResult 的 digestString 同算法），
 * 同一存档在任何时刻收取，结果都一致——离线收益可复现、可对账。
 * 概率与产出数值单源 data/economy.ts 的 TRIBUTE（官方 1%/级、上限 10% 的
 * 对照已记录在注释与任务书，单机口径按计划裁定执行）。
 */
import { SeededRNG } from '../../engine/rng';
import type { MetaSave } from '../state/schema';
import {
  tributeChance,
  tributeGold,
  tributeSouls,
  TRIBUTE,
} from '../data/economy';
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
  goldKeys: number;
  /**
   * 是否有可收取内容（地图进贡气泡与收取按钮的唯一判据）。
   *
   * **口径修正（UX 阶段 A M-4）**：改前用 `hours > 0`，于是「累计了小时数但一次没命中」
   * 时 chip 说「已满」、弹层说「0 袋」、按钮可点、点了又说「暂无可领取」——四处互相打脸。
   * 现在统一为「可实际入账的产出量 > 0」。
   */
  ready: boolean;
  /** 未截断的累计小时数；> capHours 即正在溢出（超出部分在收取瞬间永久丢失） */
  pendingHours: number;
  /** 是否已达 12 小时上限并开始溢出（M-10：这条规则必须在页面上可见） */
  overflowing: boolean;
  /** 达到 12 小时上限的时刻（毫秒时间戳）；已溢出时是过去的时刻 */
  capAt: number;
  /** 下一个小时结算的时刻（「下一袋 21:40」文案用） */
  nextHourAt: number;
}

function levelOf(save: MetaSave, kingdom: string): number {
  return save.kingdoms[kingdom]?.level ?? 1;
}

function lastTributeOf(save: MetaSave, kingdom: string): number {
  return save.kingdoms[kingdom]?.lastTributeAt ?? 0;
}

function settleHours(save: MetaSave, kingdom: string, now: number): { hours: number; hits: number; gold: number; souls: number; goldKeys: number; pendingHours: number; capAt: number; nextHourAt: number } {
  const level = levelOf(save, kingdom);
  const last = lastTributeOf(save, kingdom);
  const pending = Math.max(0, Math.floor((now - last) / HOUR_MS));
  const hours = Math.min(pending, TRIBUTE.capHours);
  const capAt = last + TRIBUTE.capHours * HOUR_MS;
  const nextHourAt = last + (pending + 1) * HOUR_MS;
  const firstHour = Math.floor(last / HOUR_MS) + 1;
  let hits = 0;
  let gold = 0;
  let souls = 0;
  let goldKeys = 0;
  const chance = tributeChance(level);
  for (let i = 0; i < hours; i++) {
    const hourIndex = firstHour + i;
    const rng = new SeededRNG(fnv1a32(`${kingdom}:${hourIndex}`));
    if (rng.next() >= chance) continue;
    hits += 1;
    gold += tributeGold(level);
    souls += tributeSouls(level);
    if (rng.next() < TRIBUTE.goldKeyChance) goldKeys += 1;
  }
  return { hours, hits, gold, souls, goldKeys, pendingHours: pending, capAt, nextHourAt };
}

/** 预览可收取的进贡（地图气泡数量、王国弹层的收取按钮），纯只读。 */
export function tributePreview(save: MetaSave, kingdom: string, now: number): TributePreview {
  const settled = settleHours(save, kingdom, now);
  return {
    kingdom,
    ...settled,
    ready: settled.gold > 0 || settled.souls > 0 || settled.goldKeys > 0,
    overflowing: settled.pendingHours > TRIBUTE.capHours,
  };
}

/** 实际入账的进贡结果（收取动作的返回，形态与 TributePreview 的产出部分同源） */
export interface TributeCollected {
  hours: number;
  hits: number;
  gold: number;
  souls: number;
  goldKeys: number;
}

/** 收取进贡：入账并把锚点拨到 now。没有可结算内容返回 ok（幂等）。 */
export function collectTribute(
  save: MetaSave,
  kingdom: string,
  now: number,
): { ok: true; collected: TributeCollected } {
  const settled = settleHours(save, kingdom, now);
  if (settled.gold > 0 || settled.souls > 0 || settled.goldKeys > 0) {
    earn(save, { gold: settled.gold, souls: settled.souls, goldKeys: settled.goldKeys });
    save.stats.goldEarned += settled.gold;
    save.stats.soulsEarned += settled.souls;
  }
  const entry = save.kingdoms[kingdom] ?? { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
  entry.lastTributeAt = now;
  save.kingdoms[kingdom] = entry;
  const { hours, hits, gold, souls, goldKeys } = settled;
  return { ok: true, collected: { hours, hits, gold, souls, goldKeys } };
}
