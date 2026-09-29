/**
 * 活动玩法状态机的共享契约与小工具（2026-09-29 活动玩法重做）。
 *
 * 平台层（systems/events.ts）只管：周实例、积分→代币、里程碑、商店、周常宝石。
 * 每个活动的「怎么玩」全部收敛在 eventModes/<活动>.ts，经 EventModeImpl 接口接入：
 *   init/sanitize  — 玩法状态建档与旧档/坏档校验（存 EventWeekState.mode）
 *   plan           — 由玩家动作（节点/兵团/地块/试炼 id）出敌
 *   modify         — buildBattleRequest 之后改战斗快照（遗物、疲劳、阶段、规则变体…）
 *   points         — 单场积分（结算前调用，读的是开战时状态）
 *   progress       — 胜败推进状态机，返回结算行
 *   act            — 非战斗动作（选路、营地、商人、掷骰、领取…）
 */
import type { BaseColor } from '../../../engine/types';
import { SeededRNG } from '../../../engine/rng';
import { STAT_LIMITS } from '../../../session/validateRequest';
import type { CombatantSnapshot, BattleResult } from '../../../session/contract';
import type { EventTheme, EventTypeId } from '../../data/events';
import type { MaterialDelta } from '../../data/materials';
import type { EventWeekState, MetaSave } from '../../state/schema';
import type { CurrencyDelta, MetaFailure } from '../../types';
import type { BridgeOutcome } from '../battleBridge';
import type { EncounterEnemy, EncounterPlan } from '../encounter';

export interface EventProgressLine {
  label: string;
  deltas: CurrencyDelta;
  mats?: MaterialDelta;
  note?: string;
}

export interface ModeCtx {
  save: MetaSave;
  week: EventWeekState;
  weekStart: number;
  typeId: EventTypeId;
  theme: EventTheme;
}

/** 出敌结果：choice = 写进 plan.source.choice 的战斗标签（结算时据此找回节点） */
export interface ModePlan {
  kingdom: string;
  enemies: EncounterEnemy[];
  choice: string;
}

export interface EventActionResult {
  ok: true;
  /** 一句话 toast */
  message: string;
  lines?: EventProgressLine[];
}

export interface EventModeImpl<S> {
  init(ctx: ModeCtx): S;
  sanitize(raw: unknown, ctx: ModeCtx): S | null;
  /** 出战前置校验（阵容锁定等）；null = 可出战 */
  ready?(ctx: ModeCtx, state: S, action: string | undefined): string | null;
  plan(ctx: ModeCtx, state: S, seed: number, action: string | undefined): ModePlan | MetaFailure;
  modify(ctx: ModeCtx, state: S, outcome: BridgeOutcome): void;
  points(ctx: ModeCtx, state: S, plan: EncounterPlan, result: BattleResult, victory: boolean): number;
  progress(ctx: ModeCtx, state: S, plan: EncounterPlan, result: BattleResult, victory: boolean): EventProgressLine[];
  act?(ctx: ModeCtx, state: S, action: string, seed: number): EventActionResult | MetaFailure;
  /** 下一场基础敌人等级（总览/横幅展示） */
  nextLevel(ctx: ModeCtx, state: S): number;
  /** 总览卡一句话局面 */
  summary(ctx: ModeCtx, state: S): string;
  /** 里程碑进度口径（缺省 = 积分） */
  metric?(ctx: ModeCtx, state: S): { label: string; value: number };
}

/** 活动难度起点（与 EVENT_DIFFICULTY.base 同值；独立常量避免循环依赖） */
export const EVENT_BASE_LEVEL = 20;
/** 单场积分封顶（平台口径） */
export const EVENT_POINTS_CAP = 120;

export function clampStat(key: keyof typeof STAT_LIMITS, value: number): number {
  const lim = STAT_LIMITS[key];
  return Math.max(lim.min, Math.min(lim.max, Math.round(value)));
}

/** 快照四维按比例/平加修改（上限钳制；hp 同步钳 initialHp） */
export function buffSnapshot(
  snap: CombatantSnapshot,
  mod: { attack?: number; armor?: number; hp?: number; magic?: number; attackPct?: number; armorPct?: number; hpPct?: number; magicPct?: number },
): void {
  const s = snap.stats;
  const ratio = snap.initialHp !== undefined && s.hp > 0 ? snap.initialHp / s.hp : null;
  s.attack = clampStat('attack', (s.attack + (mod.attack ?? 0)) * (1 + (mod.attackPct ?? 0)));
  s.armor = clampStat('armor', (s.armor + (mod.armor ?? 0)) * (1 + (mod.armorPct ?? 0)));
  s.magic = clampStat('magic', (s.magic + (mod.magic ?? 0)) * (1 + (mod.magicPct ?? 0)));
  s.hp = clampStat('hp', (s.hp + (mod.hp ?? 0)) * (1 + (mod.hpPct ?? 0)));
  if (ratio !== null) snap.initialHp = Math.max(1, Math.min(s.hp, Math.round(s.hp * ratio)));
}

/** 合并旗帜法力加成（±N / 匹配） */
export function addBanner(outcome: BridgeOutcome, boosts: Partial<Record<BaseColor, number>>, side: 'player' | 'enemy' = 'player'): void {
  const req = outcome.request;
  const target = side === 'player' ? (req.playerBanner ??= { boosts: {} }) : (req.enemyBanner ??= { boosts: {} });
  for (const [color, n] of Object.entries(boosts) as [BaseColor, number][]) {
    target.boosts[color] = (target.boosts[color] ?? 0) + n;
  }
}

/** 合并法力精通（涌动概率 = m/(m+100)） */
export function addMastery(outcome: BridgeOutcome, colors: readonly BaseColor[], amount: number): void {
  const req = outcome.request;
  const map = (req.playerManaMastery ??= {});
  for (const c of colors) map[c] = (map[c] ?? 0) + amount;
}

/** 玩家快照 externalId → 部队 id（主角返回 'hero'） */
export function memberKey(externalId: string): string {
  const m = externalId.match(/^p\d+-(.+)$/);
  return m ? m[1]! : externalId;
}

export function isFailureLike(v: unknown): v is MetaFailure {
  return typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;
}

/** 种子化随机（不依赖 Math.random；同种子同结果） */
export function rngOf(seed: number): SeededRNG {
  return new SeededRNG(seed >>> 0);
}

export function pickN<T>(rng: SeededRNG, pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (copy.length > 0 && out.length < n) out.push(copy.splice(rng.nextInt(copy.length), 1)[0]!);
  return out;
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const int = (v: unknown, def: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : def;
export const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
export const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
