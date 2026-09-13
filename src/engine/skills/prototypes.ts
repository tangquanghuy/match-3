/**
 * 技能原型组合器（战斗技能系统 · 需求 11）。
 *
 * 一个「技能原型」= 一至多个「效果段」的有序数组。每个效果段声明：
 *   目标模式 + 效果类型（伤害/宝石/增益/状态/召唤/额外回合）+ 参数（含已解析的缩放）。
 * 执行器 executePrototype 按描述顺序解释各段：选目标 → 调对应效果原语 → 汇集事件（需求 11.1, 11.3）。
 *
 * 回退策略：未被支持的效果段被安全跳过、不崩溃；空原型 = 仅扣法力无战斗效果（需求 11.4）。
 *
 * 确定性：段顺序固定、目标选择/随机经 ctx.rng，相同状态 + 种子 → 相同事件流（需求 11.5, 12.4）。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import type { GameEvent } from '../events';
import { resolveDefeatEvents } from '../teamRoster';
import type { Character } from '../types';
import type { ScalingSpec } from './scaling';
import type { TargetMode } from './targeting';
import { selectTargets } from './targeting';
import type { EffectContext, EffectPrimitive } from './effects/context';
import { damageEffect } from './effects/damage';
import type { DamageRange } from './effects/damage';
import { buffEffect } from './effects/buff';
import type { BuffStat } from './effects/buff';
import { gemEffect } from './effects/gems';
import type { GemParams } from './effects/gems';
import { cleanseEffect, statusEffect } from './effects/status';
import { summonEffect, extraTurnEffect } from './effects/summon';
import type { SummonParams } from './effects/summon';

/** 伤害段 */
export interface DamageSegment {
  kind: 'damage';
  target: TargetMode;
  scaling: ScalingSpec;
  range?: DamageRange;
  trueDamage?: boolean;
  /** enemyFirstN/allyFirstN 的 N */
  n?: number;
}

/** 增益段（作用己方目标） */
export interface BuffSegment {
  kind: 'buff';
  target: TargetMode;
  stat: BuffStat;
  scaling: ScalingSpec;
  n?: number;
}

/** 宝石操作段（不经目标选择） */
export interface GemSegment {
  kind: 'gem';
  params: GemParams;
}

/** 状态施加段 */
export interface StatusSegment {
  kind: 'status';
  target: TargetMode;
  statusId: string;
  turns: number;
  magnitude?: number;
  n?: number;
}

/** Remove statuses from selected allies. */
export interface CleanseSegment {
  kind: 'cleanse';
  target: TargetMode;
  n?: number;
}

/** 召唤段 */
export interface SummonSegment {
  kind: 'summon';
  params: SummonParams;
}

/** 额外回合段 */
export interface ExtraTurnSegment {
  kind: 'extraTurn';
}

/** 效果段联合 */
export type EffectSegment =
  | DamageSegment
  | BuffSegment
  | GemSegment
  | StatusSegment
  | CleanseSegment
  | SummonSegment
  | ExtraTurnSegment;

/** 技能原型：有序效果段数组 */
export interface SkillPrototype {
  segments: EffectSegment[];
}

/** 空原型：仅扣法力、无战斗效果（回退用，需求 11.4） */
export function fallbackPrototype(): SkillPrototype {
  return { segments: [] };
}

/** 为需要目标选择的段解析目标 */
function resolveTargets(
  segment: { target: TargetMode; n?: number },
  ctx: EffectContext,
  overrideMode?: TargetMode,
): Character[] {
  return selectTargets(
    overrideMode ?? segment.target,
    ctx.state,
    ctx.casterId,
    ctx.rng,
    segment.n ?? 1,
    ctx.chosenTargetId,
  );
}

/**
 * 把单个效果段编译为效果原语；未支持的段返回 null（安全跳过，需求 11.4）。
 */
function compileSegment(segment: EffectSegment, ctx: EffectContext): EffectPrimitive | null {
  switch (segment.kind) {
    case 'damage':
      return damageEffect({
        targets: resolveTargets(segment, ctx, segment.range === 'splash' ? 'enemyChosen' : undefined),
        scaling: segment.scaling,
        range: segment.range,
        trueDamage: segment.trueDamage,
      });
    case 'buff':
      return buffEffect({
        targets: resolveTargets(segment, ctx),
        stat: segment.stat,
        scaling: segment.scaling,
      });
    case 'gem':
      return gemEffect(segment.params);
    case 'status':
      return statusEffect({
        targets: resolveTargets(segment, ctx),
        statusId: segment.statusId,
        turns: segment.turns,
        magnitude: segment.magnitude,
      });
    case 'cleanse':
      return cleanseEffect({ targets: resolveTargets(segment, ctx) });
    case 'summon':
      // 注入上下文的召唤物解析器（ref/randomOf 来源需要）
      return summonEffect({ ...segment.params, resolveRef: ctx.resolveSummonRef });
    case 'extraTurn':
      return extraTurnEffect();
    default: {
      // 未知段：安全跳过（回退，需求 11.4）
      return null;
    }
  }
}

/**
 * 执行技能原型：按段顺序解释，汇集事件流（需求 11.3, 11.5）。
 * 空原型或全部段不支持 → 返回空事件（仅扣法力回退由 castSkill 处理，需求 11.4）。
 */
export function executePrototype(proto: SkillPrototype, ctx: EffectContext): GameEvent[] {
  const events: GameEvent[] = [];
  for (const segment of proto.segments) {
    const primitive = compileSegment(segment, ctx);
    if (primitive) {
      events.push(...resolveDefeatEvents(ctx.state, primitive.apply(ctx)));
    }
  }
  return events;
}
