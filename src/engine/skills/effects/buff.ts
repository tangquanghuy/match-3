/**
 * 增益与资源效果原语（战斗技能系统 · 需求 8）。
 *
 * 作用于目标选择产出的**己方**角色：加攻击/护甲、恢复生命、加法力、加魔力。
 * 数额按缩放规格 + 施法者魔力求值。变更夹在各自上限内：
 *   - hp 不超过 maxHp（需求 8.3）
 *   - mana 不超过该角色 manaCost（需求 8.4）
 * 每次实际变更发一个 buff 事件（携带目标与实际变化量，需求 8.5）。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import type { GameEvent, BuffEvent } from '../../events';
import type { Character } from '../../types';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { casterMagic } from './context';
import { effectiveHealing } from '../../healing';

/** 可增益的属性 */
export type BuffStat = 'attack' | 'armor' | 'hp' | 'mana' | 'magic';

export interface BuffParams {
  /** 己方目标列表（由 targeting 产出） */
  targets: Character[];
  /** 要增益的属性 */
  stat: BuffStat;
  /** 数额缩放规格；按施法者魔力求值 */
  scaling: ScalingSpec;
}

/**
 * 对单个角色施加增益，返回实际变化量（受上限夹取后可能小于名义值）。
 */
function buffOne(target: Character, stat: BuffStat, amount: number): number {
  switch (stat) {
    case 'attack': {
      target.attack += amount;
      return amount;
    }
    case 'armor': {
      target.armor += amount;
      return amount;
    }
    case 'magic': {
      target.magic += amount;
      return amount;
    }
    case 'hp': {
      // 治疗互动（GoW）：出血期间完全无法回血，疾病期间治疗减半。
      // 只折算正向治疗——负数走的是「以 buff 形式扣血」，不该被治疗修正放大。
      const healed = effectiveHealing(target, amount);
      // 不超过 maxHp（需求 8.3）
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + healed);
      return target.hp - before;
    }
    case 'mana': {
      // 不超过 manaCost（需求 8.4）
      const before = target.mana;
      target.mana = Math.min(target.manaCost, target.mana + amount);
      return target.mana - before;
    }
    default: {
      const _exhaustive: never = stat;
      return _exhaustive;
    }
  }
}

/**
 * 构建增益原语（需求 8.1–8.5）。
 */
export function buffEffect(params: BuffParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const { targets, stat, scaling } = params;
      if (targets.length === 0) return []; // 无目标安全跳过

      const amount = evaluateScaling(scaling, casterMagic(ctx));
      const events: GameEvent[] = [];

      for (const target of targets) {
        if (target.defeated) continue; // 阵亡不接受增益
        const applied = buffOne(target, stat, amount);
        // 仅在实际发生变更时发事件（如满血治疗不产生 0 事件噪声）
        if (applied !== 0) {
          const ev: BuffEvent = {
            type: 'buff',
            targetId: target.id,
            stat,
            amount: applied,
          };
          events.push(ev);
        }
      }
      return events;
    },
  };
}
