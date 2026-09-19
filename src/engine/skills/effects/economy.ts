/**
 * 战场经济效果原语（DECISIONS 四项拍板①）：金币 / 灵魂 / 宝石（钻石）三币种获得。
 *
 * 数值走一次缩放（[魔法+N]，按施法者魔力）+ 二次缩放（modifier，来源可为
 * battleGold/battleSouls/battleGems 等战场经济自身），与伤害/增益段同一套管线。
 * 全场共用一个经济池（GameState.economy），side 只作归因记录。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import { PlayerSide } from '../../types';
import type { GameEvent } from '../../events';
import type { EconomyGainEvent } from '../../events';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { findSide, casterMagic } from './context';
import { evaluateWithModifier } from './secondary';
import type { ModifierSpec } from './secondary';

export type EconomyCurrency = 'gold' | 'souls' | 'gems' | 'maps';

export interface EconomyGainParams {
  currency: EconomyCurrency;
  /** 数值缩放（[魔法 × mult + base]；纯常数 mult=0） */
  scaling: ScalingSpec;
  /** 二次缩放（「数量因本战斗收集的灵魂数而增强 [N:M]」） */
  modifier?: ModifierSpec;
}

export function economyGainEffect(params: EconomyGainParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const amount = evaluateWithModifier(
        evaluateScaling(params.scaling, casterMagic(ctx)),
        params.modifier,
        ctx,
      );
      if (amount <= 0) return [];
      ctx.state.economy[params.currency] += amount;
      const event: EconomyGainEvent = {
        type: 'economy-gain',
        currency: params.currency,
        amount,
        side: findSide(ctx.state, ctx.casterId) ?? PlayerSide.Left,
      };
      return [event];
    },
  };
}

/**
 * 窃取黄金段（batch-r28，官方 CountEnemyGold + TakeEnemyGold + GiveGold 步骤族——
 * 8087/8904/9189/8141）。共用池口径裁定（GameState.economy 不分阵营，§10.2）：
 * - **定量句式**（「窃取 [M+2] 黄金」「最多 50 黄金」）：维持 §10.2 既有口径 =
 *   gainGold(N)——入账 economy.gold 并发 economy-gain（敌方扣减无池可落，不建模）；
 *   「最多 N」= 入账额 = min(N, cap)（无敌方池可查，up-to 上限按上限值入账）。
 *   实际入账额累加进 castTracking.goldStolen，供「因窃取的黄金数而增强」来源挂载
 *   （battleGold 是池总额、≠本次窃取额——r27 卡点的解）。
 * - **全额句式**（all: true，「窃取(所有)敌人的黄金」）：官方为零和转移；共用池模型下
 *   「敌方手中的黄金」≈ 池内黄金全额（战斗中敌我收入混账的唯一在场代理）——裁定为
 *   **池内黄金全额易主**：池总额不变（奖励不重复计）、不发事件，goldStolen 记池内
 *   黄金总额供后续段引用（池为 0 时窃取额自然为 0，与「无敌方可劫」语义一致）。
 */
export interface StealGoldParams {
  /** 窃取额缩放（定量句式；all 时忽略） */
  scaling: ScalingSpec;
  /** 「最多 N」入账上限（8087 官方 CountMax 50） */
  cap?: number;
  /** 全额句式（「窃取所有敌人的黄金」）：零和易主，见上方裁定 */
  all?: boolean;
  /** 窃取额二次缩放 */
  modifier?: ModifierSpec;
}

export function stealGoldEffect(params: StealGoldParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      if (params.all) {
        const total = ctx.state.economy.gold;
        if (total > 0 && ctx.castTracking) {
          ctx.castTracking.goldStolen = (ctx.castTracking.goldStolen ?? 0) + total;
        }
        return [];
      }
      const amount = evaluateWithModifier(
        evaluateScaling(params.scaling, casterMagic(ctx)),
        params.modifier,
        ctx,
      );
      const gain = params.cap !== undefined ? Math.min(amount, params.cap) : amount;
      if (gain <= 0) return [];
      ctx.state.economy.gold += gain;
      if (ctx.castTracking) {
        ctx.castTracking.goldStolen = (ctx.castTracking.goldStolen ?? 0) + gain;
      }
      const event: EconomyGainEvent = {
        type: 'economy-gain',
        currency: 'gold',
        amount: gain,
        side: findSide(ctx.state, ctx.casterId) ?? PlayerSide.Left,
      };
      return [event];
    },
  };
}

/**
 * 经济支出段（batch-r28，官方 TakeMyGold 步骤——7460「花费我所有的黄金」/ 8243
 * 「失去所有黄金」）：从共用池扣减（夹零——池为 0 时实际支出 0）。
 * 货币为 gold 时把**实际扣减额**累加进 castTracking.goldSpent，供「花费的黄金转化为
 * 加成」来源挂载（7460：支出段在前、伤害段以 { multiplier 1, source goldSpent } 读同额）。
 * 不发事件：共用池总额在战斗结算时按 state.economy 直读，支出只是池内减项
 * （economy-gain 语义是「获得」，复用负数额会误导表现层——待渲染侧需要时再议事件形态）。
 */
export interface SpendEconomyParams {
  currency: 'gold';
  /** 支出额缩放；all 时忽略 */
  scaling: ScalingSpec;
  /** 全额句式（「花费/失去所有的黄金」） */
  all?: boolean;
  modifier?: ModifierSpec;
}

export function spendEconomyEffect(params: SpendEconomyParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const requested = params.all
        ? Number.POSITIVE_INFINITY
        : evaluateWithModifier(evaluateScaling(params.scaling, casterMagic(ctx)), params.modifier, ctx);
      const actual = Math.min(ctx.state.economy[params.currency], requested);
      if (actual <= 0) return [];
      ctx.state.economy[params.currency] -= actual;
      if (params.currency === 'gold' && ctx.castTracking) {
        ctx.castTracking.goldSpent = (ctx.castTracking.goldSpent ?? 0) + actual;
      }
      return [];
    },
  };
}
