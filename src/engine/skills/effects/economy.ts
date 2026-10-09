import { creditBattleMaps } from '../../battleMaps';
/**
 * 战场经济效果原语（DECISIONS 四项拍板①）：金币 / 灵魂 / 宝石（钻石）三币种获得。
 *
 * 数值走一次缩放（[魔法+N]，按施法者魔力）+ 二次缩放（modifier，来源可为
 * battleGold/battleSouls/battleGems 等战场经济自身），与伤害/增益段同一套管线。
 * 黄金按施法者阵营入账；其它货币维持现有玩家奖励模型。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import { opponentOf } from '../../types';
import { goldForSide, setGoldForSide, creditGoldForSide, remainingBattleGold, battleGoldMultiplier } from '../../battleGold';
import { creditBattleSouls } from '../../battleSouls';
import type { GameEvent } from '../../events';
import type { EconomyGainEvent } from '../../events';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { effectCasterSide, casterMagic } from './context';
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
      let amount = evaluateWithModifier(
        evaluateScaling(params.scaling, casterMagic(ctx)),
        params.modifier,
        ctx,
      );
      if (amount <= 0) return [];
      const side = effectCasterSide(ctx);
      if (params.currency === 'gold') amount = creditGoldForSide(ctx.state, side, amount);
      else if (params.currency === 'souls') amount = creditBattleSouls(ctx.state, amount);
      else if (params.currency === 'maps') amount = creditBattleMaps(ctx.state, amount);
      else ctx.state.economy[params.currency] += amount;
      if (amount <= 0) return [];
      const event: EconomyGainEvent = {
        type: 'economy-gain',
        currency: params.currency,
        amount,
        side,
      };
      return [event];
    },
  };
}

/** Gold theft transfers only available enemy Gold; goldStolen tracks the actual transfer. */
export interface StealGoldParams {
  /** Debit and track now; a later gainGold segment credits the native GiveGold step. */
  deferCredit?: boolean;
  /** 窃取额缩放（定量句式；all 时忽略） */
  scaling: ScalingSpec;
  /** 「最多 N」入账上限（8087 官方 CountMax 50） */
  cap?: number;
  /** 全额句式：转移敌方全部黄金 */
  all?: boolean;
  /** 窃取额二次缩放 */
  modifier?: ModifierSpec;
}

export function stealGoldEffect(params: StealGoldParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = effectCasterSide(ctx);
      const enemySide = opponentOf(side);
      const available = goldForSide(ctx.state, enemySide);
      const requested = params.all ? available : evaluateWithModifier(
        evaluateScaling(params.scaling, casterMagic(ctx)), params.modifier, ctx,
      );
      const gain = Math.max(0, Math.min(available, requested, params.cap ?? Infinity,
        Math.ceil(remainingBattleGold(ctx.state, side) / battleGoldMultiplier(ctx.state, side))));
      if (gain <= 0) return [];
      setGoldForSide(ctx.state, enemySide, available - gain);
      const credited = params.deferCredit ? 0 : creditGoldForSide(ctx.state, side, gain);
      if (ctx.castTracking) {
        ctx.castTracking.goldStolen = (ctx.castTracking.goldStolen ?? 0) + gain;
      }
      if (params.deferCredit || credited <= 0) return [];
      const event: EconomyGainEvent = {
        type: 'economy-gain',
        currency: 'gold',
        amount: credited,
        side,
      };
      return [event];
    },
  };
}

/**
 * 经济支出段（batch-r28，官方 TakeMyGold 步骤——7460「花费我所有的黄金」/ 8243
 * 「失去所有黄金」）：从施法者自己的计数扣减（夹零——池为 0 时实际支出 0）。
 * 货币为 gold 时把**实际扣减额**累加进 castTracking.goldSpent，供「花费的黄金转化为
 * 加成」来源挂载（7460：支出段在前、伤害段以 { multiplier 1, source goldSpent } 读同额）。
 * 不发事件：支出只扣施法阵营黄金余额，不影响另一方余额
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
      const side = effectCasterSide(ctx);
      const available = goldForSide(ctx.state, side);
      const actual = Math.min(available, requested);
      if (actual <= 0) return [];
      setGoldForSide(ctx.state, side, available - actual);
      if (params.currency === 'gold' && ctx.castTracking) {
        ctx.castTracking.goldSpent = (ctx.castTracking.goldSpent ?? 0) + actual;
      }
      return [];
    },
  };
}
