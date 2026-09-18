/**
 * 召唤与额外回合技能效果（战斗技能系统 · 需求 10.2, 10.3, 10.4）。
 *
 * - extraTurnEffect：使当前玩家保留回合（复用回合经济，需求 10.2），发 extra-turn 事件。
 * - summonEffect: fills up to four active slots, then appends further summons to a FIFO bench.
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import type { GameEvent, ExtraTurnEvent } from '../../events';
import type { Character } from '../../types';
import { PlayerSide } from '../../types';
import { MAX_ACTIVE_TEAM_SIZE, summonQueueOf } from '../../teamRoster';
import type { EffectContext, EffectPrimitive } from './context';
import { attachPassives } from '../../traits';
import { findSide } from './context';

/**
 * 额外回合效果（需求 10.2）。发 extra-turn 事件并（若引擎注入）保留当前玩家回合。
 */
export function extraTurnEffect(): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return [];
      ctx.grantExtraTurn?.();
      const ev: ExtraTurnEvent = { type: 'extra-turn', player: side, source: 'skill' };
      return [ev];
    },
  };
}


/** 兵种转化参数（「将一名随机敌人转化为怨灵」）：ref 经 resolveRef 映射模板，目标就地替换 */
export interface TransformTroopParams {
  targets: Character[];
  /** 目标兵种 referenceName（英文，同召唤引用）；与 randomOf 二选一 */
  ref?: string;
  /** 兵种族随机（「转化为一只随机龙族」）：候选集，rng 掷选后再映射 */
  randomOf?: string[];
  /** 被转化成兵种 id（可选，供表现层取立绘） */
  troopId?: number;
  /** referenceName → 模板映射（由装配层注入；缺省用 ctx.resolveSummonRef） */
  resolveRef?: (referenceName: string) => SummonTemplate | null;
}

/**
 * 兵种转化：目标角色**就地替换**为模板兵种——保留 id 与编队位（不触发阵亡/召唤钩子，
 * 对齐官方「转化不是死亡」语义）；数值/技能/特质/法力色取模板，血量满、法力清零。
 * 无可解析模板或目标全灭时安全跳过。
 */
export function transformTroopEffect(params: TransformTroopParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const resolve = params.resolveRef ?? ctx.resolveSummonRef;
      if (!resolve) return [];
      // ref / randomOf 二选一：randomOf 先种子化掷选再映射（与 summon.randomOf 同语义）
      const refName = params.ref ?? (params.randomOf && params.randomOf.length > 0
        ? params.randomOf[ctx.rng.nextInt(params.randomOf.length)]
        : undefined);
      if (!refName) return [];
      const template = resolve(refName);
      if (!template) return [];
      const events: GameEvent[] = [];
      for (const target of params.targets) {
        if (target.defeated) continue;
        target.name = template.name;
        target.maxHp = template.maxHp;
        target.hp = template.hp;
        target.attack = template.attack;
        target.armor = template.armor;
        target.magic = template.magic;
        target.colors = [...template.colors];
        target.manaCost = template.manaCost;
        target.mana = 0;
        target.skillId = template.skillId;
        target.traitIds = [...(template.traitIds ?? [])];
        target.troopTypes = [...(template.troopTypes ?? [])];
        attachPassives(target);
        const ev: GameEvent = { type: 'troop-transform', targetId: target.id, name: template.name };
        if (params.troopId !== undefined) ev.troopId = params.troopId;
        events.push(ev);
      }
      return events;
    },
  };
}

/** 队伍最大容量（与 4 人上限一致；队伍数组长度可小于此值时有空位） */
export const MAX_TEAM_SIZE = MAX_ACTIVE_TEAM_SIZE;

/** 召唤物属性模板（引擎所需数值属性；不含表现层字段） */
export type SummonTemplate = Omit<Character, 'id' | 'defeated' | 'statuses'>;

/**
 * 召唤物来源定义（需求 7.1）。每个召唤技能显式指定召唤谁：
 *   - template：直接给一份手写属性模板
 *   - ref：引用一个已有兵种 referenceName（由 resolveRef 映射为模板）
 *   - randomOf：候选 referenceName 集合，执行期用种子化 RNG 确定性选一个
 *   - randomOfKingdom：按王国随机（武器原语批 K-E，「召唤一名来自X王国的随机部队」）——
 *     执行期经 resolveKingdomSummonRefs 取该王国的兵种引用清单（troops.json kingdom 字段
 *     口径），再种子化掷选一条走 resolveRef 解析；清单为空/解析器缺省 → 安全跳过
 *     （官方语义 = 整个王国兵册均匀随机，运行时取册而非组装期快照清单）。
 */
export type SummonSource =
  | { template: SummonTemplate; troopId?: number }
  | { ref: string; troopId?: number }
  | { randomOf: string[]; troopId?: number }
  | { randomOfKingdom: string; troopId?: number };

export interface SummonParams {
  /** 召唤物来源 */
  source: SummonSource;
  /** 召唤数量区间（「召唤 1-3 名X」，rng 掷选；缺省 1。超额进召唤队列） */
  countRange?: { min: number; max: number };
  /**
   * referenceName → 召唤物模板的映射器（由装配层注入，来自 troops 数据）。
   * ref/randomOf 需要它；template 来源不需要。缺失或映射失败时安全跳过。
   */
  resolveRef?: (referenceName: string) => SummonTemplate | null;
  /** 被召唤兵种 id（troopId），供表现层取立绘/数据（可选） */
  troopId?: number;
}

/** 计算队伍中下一个新角色 id（现有最大 id + 1），保证确定性 */
function deriveCharId(ctx: EffectContext): number {
  if (ctx.nextCharId) return ctx.nextCharId();
  let max = 0;
  for (const side of ['Left', 'Right'] as const) {
    const team = ctx.state.teams[side];
    for (const c of team.characters) {
      if (c.id > max) max = c.id;
    }
    for (const queued of team.summonQueue ?? []) {
      if (queued.character.id > max) max = queued.character.id;
    }
  }
  return max + 1;
}

/**
 * 把召唤来源解析为具体属性模板（需求 7.1, 7.3, 7.4）。
 * template→直接用；ref→经 resolveRef 映射；randomOf→种子化选一个再映射；
 * randomOfKingdom→先经 resolveKingdomSummonRefs 取王国兵册再种子化选一个映射。
 * 无法解析返回 null（调用方安全跳过）。
 */
function resolveTemplate(params: SummonParams, ctx: EffectContext): SummonTemplate | null {
  const src = params.source;
  if ('template' in src) return src.template;
  if ('ref' in src) return params.resolveRef?.(src.ref) ?? null;
  // randomOfKingdom（K-E 批）：王国兵册清单 → 种子化掷选 → resolveRef 映射；
  // 映射器缺省 / 清单空（null 或 []）→ 安全跳过（rng 不消耗，与 ref 无解析器同口径）
  if ('randomOfKingdom' in src) {
    const refs = ctx.resolveKingdomSummonRefs?.(src.randomOfKingdom);
    if (!refs || refs.length === 0) return null;
    const pick = refs[ctx.rng.nextInt(refs.length)];
    return params.resolveRef?.(pick) ?? null;
  }
  // randomOf：确定性选取
  if (src.randomOf.length === 0) return null;
  const pick = src.randomOf[ctx.rng.nextInt(src.randomOf.length)];
  return params.resolveRef?.(pick) ?? null;
}

/**
 * Append a summon to the active bottom while below four characters.
 * A full active roster stores subsequent summons on a FIFO bench.
 */
export function summonEffect(params: SummonParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return [];

      const template = resolveTemplate(params, ctx);
      if (template === null) return []; // 召唤物无法解析，安全跳过

      const team = ctx.state.teams[side];
      // Keep the active roster free of stale defeated entries. Normal engine flow removes
      // them at defeat time; this also preserves sane behavior for direct primitive tests.
      team.characters = team.characters.filter((character) => !character.defeated);

      const count = params.countRange
        ? params.countRange.min + ctx.rng.nextInt(Math.max(1, params.countRange.max - params.countRange.min + 1))
        : 1;
      const events: GameEvent[] = [];
      for (let i = 0; i < count; i++) {
        const id = deriveCharId(ctx);
        const troopId = params.troopId ?? src_troopId(params.source);
        const summoned: Character = { ...template, id, defeated: false, statuses: [] };

        if (team.characters.length < MAX_ACTIVE_TEAM_SIZE) {
          team.characters.push(summoned);
          events.push({
            type: 'summon',
            player: side,
            slot: team.characters.length - 1,
            troopId,
            characterId: id,
            destination: 'field',
          });
        } else {
          const queue = summonQueueOf(team);
          queue.push({ character: summoned, troopId });
          events.push({
            type: 'summon',
            player: side,
            slot: queue.length - 1,
            troopId,
            characterId: id,
            destination: 'queue',
          });
        }
      }
      return events;
    },
  };
}

/** 从来源取可选 troopId（表现层用） */
function src_troopId(src: SummonSource): number {
  return src.troopId ?? -1;
}

/** 调位参数（「将一名敌人击回末位」「移至队伍首位」） */
export interface RepositionParams {
  targets: Character[];
  to: 'front' | 'back';
}

/**
 * 调位：改编队顺序（front=插到队首、back=移到队尾），影响 enemyFront/enemyFirstN 等
 * 目标序。多目标按倒序处理保持下标稳定。发 troop-reposition 事件供表现层调卡面顺序。
 */
export function repositionEffect(params: RepositionParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      for (const target of [...params.targets].reverse()) {
        if (target.defeated) continue;
        const side = findSide(ctx.state, target.id);
        if (side === null) continue;
        const team = ctx.state.teams[side];
        const idx = team.characters.indexOf(target);
        if (idx < 0) continue;
        team.characters.splice(idx, 1);
        if (params.to === 'front') team.characters.unshift(target);
        else team.characters.push(target);
        events.push({ type: 'troop-reposition', targetId: target.id, to: params.to });
      }
      return events.reverse();
    },
  };
}

/** 乱序参数（「打乱敌方队伍」）：整队 Fisher-Yates 重排（种子化确定性） */
export interface TeamShuffleParams {
  side: 'ally' | 'enemy';
}

export function shuffleTeamEffect(params: TeamShuffleParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return [];
      const side = params.side === 'enemy'
        ? mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left
        : mySide;
      const team = ctx.state.teams[side];
      if (team.characters.length < 2) return [];
      for (let i = team.characters.length - 1; i > 0; i--) {
        const j = ctx.rng.nextInt(i + 1);
        const tmp = team.characters[i];
        team.characters[i] = team.characters[j];
        team.characters[j] = tmp;
      }
      return [{ type: 'team-shuffle', player: side }];
    },
  };
}
