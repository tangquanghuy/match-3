/**
 * 敌方削弱家族效果原语（窗口 B · 五机制之三，`scripts/spell-rules.md` §敌方削弱）。
 *
 * 一个「削减」原语覆盖官方文本的整个家族：
 *   - 减攻/减甲/减魔：目标属性扣减，Math.max(0, …) 夹零（属性不会变负）；
 *   - 耗蓝（法力燃烧/耗尽）：清减目标当前法力，至多到 0；
 *   - 窃取：目标削减 + 施法者等量（可按比例）获得另一属性
 *     （「窃取 2 点护甲值并将之转为魔法值」= stat='armor' + gainStat='magic'）。
 *
 * 与织网（web）的交互（任务书明示）：web 锁的是 magic **属性增益**，不是 mana 充能——
 * 被织网者仍可被耗蓝/偷法力；施法者被织网时，「窃取转为 magic」的自身获得走
 * buffOne 的织网拦截（获得 0），mana/其余属性不受影响。
 *
 * 事件复用既有 buff 事件（削减为负数、获得为正数），不新增事件类型。
 * 削减量夹零后**实际发生的变化**才发事件：目标该属性已是 0 时不出事件。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import type { GameEvent, BuffEvent } from '../../events';
import type { Character } from '../../types';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { casterMagic, findCharacter } from './context';
import { hasTroopType, evaluateWithModifier, DEFAULT_RACE_DOUBLE, condMultiplier, condBonusValue } from './secondary';
import type { ModifierSpec, CondMult, CondBonus } from './secondary';
import { passivesOf } from '../../traits';
import { applyBuffGain } from './buff';
import type { BuffStat } from './buff';

/** 可削减的属性（mana 的削减 = 耗蓝；hp 的削减 = 直接扣血，不走护甲/屏障伤害管线）。
 *  'random'（R12 批）：官方 DecreaseRandom——执行时 rng 在攻/甲/魔三围中掷选其一削减。 */
export type ReduceStat = 'attack' | 'armor' | 'magic' | 'mana' | 'hp' | 'random';

/** 随机削减的可掷属性（官方 DecreaseRandom 语义：三围，不含 hp/mana） */
const RANDOM_REDUCE_STATS: readonly Exclude<ReduceStat, 'mana' | 'hp' | 'random'>[] = ['attack', 'armor', 'magic'];

export interface ReduceParams {
  /** 目标列表（由 targeting 产出，敌我皆可） */
  targets: Character[];
  /** 被削减的属性 */
  stat: ReduceStat;
  /** 数额缩放规格；按施法者魔力求值 */
  scaling: ScalingSpec;
  /** 耗尽全部法力（stat='mana'）：数值取目标当前法力，「耗尽法力值」 */
  drainAll?: boolean;
  /**
   * 比例减半（引擎原语批，「将敌方攻击力减半」「耗掉一半法力」）：削减额 =
   * 该属性当前值的 50% 下取整（逐目标现算）；给出时忽略 scaling/condBonus/condMult。
   */
  halve?: boolean;
  /** 窃取：目标削减的同时，施法者获得同额（×gainRatio）的该属性。
   *  stat='random' 时此字段仅作「窃取」标记：实际获得 = 掷中的那项属性（同额）。 */
  gainStat?: BuffStat;
  /** 自身获得比例，默认 1（「获得其中半数」= 0.5，向下取整） */
  gainRatio?: number;
  /** 连掷次数（仅 stat='random'：「从其 2 个随机技能值各消除 N 点」= 2，官方即两条
   *  DecreaseRandom 步骤——每步独立掷签，可能掷中同一属性）；缺省 1 */
  times?: number;
  /** 二次缩放（如「数值因被摧毁的棕色宝石而增强 [1:1]」） */
  modifier?: ModifierSpec;
  /** 种族条件翻倍：目标 troopTypes 含该族时削减量 ×2 */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率（「如果敌人是X族，则窃取 N 倍」） */
  condMult?: CondMult;
  /** 条件加成（加算；先加后乘） */
  condBonus?: CondBonus;
}

/** 施法者获得窃取所得（走 buffOne 口径：上限夹取、织网拦截、治疗修正） */
function gainToCaster(ctx: EffectContext, stat: BuffStat, amount: number): GameEvent[] {
  const caster = findCharacter(ctx.state, ctx.casterId);
  if (!caster || amount <= 0) return [];
  const applied = applyBuffGain(caster, stat, amount);
  if (applied === 0) return [];
  return [{ type: 'buff', targetId: caster.id, stat, amount: applied }];
}

/**
 * 构建削减原语（减攻/减甲/减魔/耗蓝/窃取统一入口）。
 */
export function reduceEffect(params: ReduceParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const { targets, stat, scaling, gainStat, gainRatio = 1 } = params;
      if (targets.length === 0) return [];

      const base = params.drainAll
        ? Number.POSITIVE_INFINITY
        : evaluateWithModifier(evaluateScaling(scaling, casterMagic(ctx)), params.modifier, ctx);
      const events: GameEvent[] = [];
      let drainedTotal = 0;
      // 实际削减总额（Wave4 批 lastReduce 跨段绑定）：所有属性/目标/步的 removed 累加，
      // 段末整体覆写 castTracking.lastReduce（「减除其 N 点生命值并将之转化为攻击力」=
      // 后段 attack 增益按实际削减额引用，非声明额）
      let reducedTotal = 0;
      // 随机削减的连掷次数（官方多条 DecreaseRandom 步骤 → times；非 random 恒 1 步、不耗 rng）
      const steps = stat === 'random' ? Math.max(1, params.times ?? 1) : 1;

      for (const target of targets) {
        if (target.defeated) continue;
        // 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」）：
        // 三动词共用本入口（stat='mana' 的耗蓝/耗尽/减半与 stat='mana'+gainStat 的窃取），
        // 免疫目标整体跳过——不削减、不回事件、窃取者也不进账。
        if (stat === 'mana' && passivesOf(target).manaOpsImmunity) continue;
        for (let step = 0; step < steps; step++) {
          // 官方 DecreaseRandom：每步独立掷签攻/甲/魔其一（可能重复掷中同一属性）
          const statNow: 'attack' | 'armor' | 'magic' | 'mana' | 'hp' =
            stat === 'random' ? RANDOM_REDUCE_STATS[ctx.rng.nextInt(RANDOM_REDUCE_STATS.length)] : stat;
          let cAmount: number;
          if (params.halve) {
            // 比例减半：按该属性当前值 50% 下取整（逐目标现算，不走缩放/条件修饰）
            const cur = statNow === 'mana' ? target.mana : statNow === 'hp' ? target.hp : Math.max(0, target[statNow]);
            cAmount = Math.floor(cur / 2);
          } else {
            const raceFactor = params.raceDouble && hasTroopType(target, params.raceDouble) ? (params.raceTimes ?? DEFAULT_RACE_DOUBLE) : 1;
            cAmount = (base + condBonusValue(params.condBonus, ctx, target)) * raceFactor * condMultiplier(params.condMult, ctx, target);
          }

          let removed: number;
          if (statNow === 'mana') {
            removed = Math.min(target.mana, cAmount);
            target.mana -= removed;
            drainedTotal += removed;
          } else if (statNow === 'hp') {
            // 直接扣血（减血类句式：「减除其生命值并将之转化为攻击力」）；夹零、不发伤害事件
            removed = Math.min(target.hp, cAmount);
            target.hp -= removed;
            if (target.hp <= 0 && !target.defeated) {
              target.defeated = true;
              events.push({ type: 'defeat', characterId: target.id });
            }
          } else {
            removed = Math.min(Math.max(0, target[statNow]), cAmount);
            target[statNow] -= removed;
          }
          // 实际发生削减才发事件（目标属性为 0 时无事发生）
          if (removed > 0) {
            reducedTotal += removed;
            const ev: BuffEvent = { type: 'buff', targetId: target.id, stat: statNow, amount: -removed };
            events.push(ev);
            if (gainStat) {
              // stat='random' 时 gainStat 仅是窃取标记：施法者获得掷中的那项属性
              const gainAs: BuffStat = stat === 'random' ? statNow : gainStat;
              const gain = Math.floor(removed * gainRatio);
              events.push(...gainToCaster(ctx, gainAs, gain));
            }
          }
        }
      }

      if (drainedTotal > 0) {
        // 供后续段「伤害值因所耗尽的法力值而增强」读取
        if (ctx.castTracking) ctx.castTracking.drainedMana += drainedTotal;
      }
      // lastReduce 跨段绑定（Wave4 批）：无论本段是否真的削到，都整体覆写——
      // 「最近一个 reduce 段」的语义不允许读到更早段的陈旧额度
      if (ctx.castTracking) ctx.castTracking.lastReduce = { amount: reducedTotal };
      return events;
    },
  };
}
