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

export type EconomyCurrency = 'gold' | 'souls' | 'gems';

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
