/**
 * 逃跑效果原语（DECISIONS 四项拍板③，官方句式「有 N% 的几率跑掉」）。
 *
 * 判定成功 → 施法者标记 fled 并发 flee 事件；编队移出由调用方（prototypes.runSegment
 * 的 resolveDefeatEvents 包裹）复用 defeat 的移出/补位管线完成：
 *   - 不置 defeated、不产生 defeat 事件 → 死亡召唤/阵亡响应（挥金/灵魂类）都不触发；
 *   - 全队逃光时该方 characters 为空 → checkVictory 的 isWipedOut 判定败北。
 *
 * 纯逻辑：随机只走 ctx.rng（需求 12.1, 12.2）；判定失败零事件（rng 照常消耗一次，
 * 保证同种子同事件流）。
 */
import { PlayerSide } from '../../types';
import type { GameEvent, FleeEvent } from '../../events';
import type { EffectContext, EffectPrimitive } from './context';
import { findCharacter, findSide } from './context';

export interface EscapeParams {
  /** 逃跑几率（0~1）；官方句式「有 30% 的几率跑掉」= 0.3 */
  escapeChance: number;
}

export function escapeEffect(params: EscapeParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      if (!(ctx.rng.next() < params.escapeChance)) return [];
      const caster = findCharacter(ctx.state, ctx.casterId);
      // 已阵亡/已逃跑/不在场（防御：正常施法路径不会遇到）→ 无事发生
      if (!caster || caster.defeated || caster.fled) return [];
      caster.fled = true;
      const event: FleeEvent = {
        type: 'flee',
        characterId: caster.id,
        player: findSide(ctx.state, ctx.casterId) ?? PlayerSide.Left,
        hp: caster.hp,
        armor: caster.armor,
      };
      return [event];
    },
  };
}
