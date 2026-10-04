/**
 * 吞噬原语（R22 批，官方 Devour 机制——8573「有 25% 的几率吞噬一名敌人」9364/9492
 * 「有 N% 的几率吞噬敌人，几率随X增强」）：
 *
 * Original Devour adds the victim's current Attack, Armor and Life (not Magic).
 * Barrier has protected against Devour since the official 3.0.5 patch;
 * spell resistance is not Devour immunity.
 * https://gemsofwar.com/pcmobile-3-0-5-patch-notes/
 * https://community.gemsofwar.com/posts/3588.json
 *
 * 「免疫吞噬」（特质 indigestible → devourImmunity）目标整体跳过：不杀、不成长。
 * 概率在原语内部掷签（不走段级 chance 通用管线）：即使掷签失败，目标也已解析并入跨段
 * 追踪（lastTarget 指向该敌人）——8573「否则则造成 [魔法+3] 点伤害」的后段 dmg('lastTarget')
 * 在吞噬成功（目标已死）时自动空转、失败时正常生效，无需额外「未吞噬」条件。
 * chanceMult（8573「若敌人是纳迦族则几率翻倍」）按目标逐个判定；chanceBoost 加算百分点
 * 与段级口径一致（clamp [0,1]）。所有 rng 消耗固定发生（掷签 1 次/目标），保证同种子同事件流。
 */
import type { GameEvent } from '../../events';
import type { Character } from '../../types';
import type { EffectContext, EffectPrimitive } from './context';
import { findCharacter, findSide } from './context';
import { damageOne } from './damage';
import { applyBuffGain } from './buff';
import { conditionMet } from './secondary';
import type { Condition, ModifierSpec } from './secondary';
import { modifierBonus } from './secondary';
import { passivesOf } from '../../traits';
import { hasLethalImmunity, lethalResistanceEvent, hasStatus, isCursed } from './status';

export interface DevourParams {
  targets: Character[];
  /** 基础概率（0~1，「有 25% 的几率」= 0.25） */
  chance: number;
  /** 概率条件倍率（「若敌人是纳迦族则几率翻倍」= ×2，按目标判定） */
  chanceMult?: { times: number; cond: Condition };
  /** 概率随来源增强（「几率随被摧毁的头骨数量而增强 [x6]」= 每来源 +6 百分点） */
  chanceBoost?: ModifierSpec;
  /** 可覆写收益（缺省获取目标当前攻击、护甲、生命；不获取魔法） */
  gain?: { attack?: number; armor?: number; magic?: number; hp?: number };
}

export function devourEffect(params: DevourParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      const caster = findCharacter(ctx.state, ctx.casterId);
      const boost = modifierBonus(params.chanceBoost, ctx) / 100;
      for (const target of params.targets) {
        if (target.defeated || target.id === ctx.casterId) continue;
        // Official Blessed protects from Devour independently of trait immunity.
        if (hasStatus(target, 'blessed')) continue;
        if (passivesOf(target).devourImmunity && !isCursed(target)) continue;
        // 概率 = chance ×（条件倍率）+ 加成百分点，夹在 [0,1]；掷签恒发生（确定性）
        const mult = params.chanceMult && conditionMet(params.chanceMult.cond, ctx, target)
          ? params.chanceMult.times
          : 1;
        const p = Math.min(1, Math.max(0, params.chance * mult + boost));
        const devoured = ctx.rng.next() < p;
        if (!devoured) continue;
        if (hasLethalImmunity(target)) { events.push(lethalResistanceEvent(target)); continue; }
        // 即杀：走伤害管线（屏障与阵亡事件共用；吞噬不受普通法术减伤影响）
        const durability = target.hp + target.armor;
        const victimAttack = hasStatus(target, 'entangle') ? 0 : target.attack;
        const victimArmor = target.armor;
        const victimLife = target.hp;
        const damageEvents = damageOne(target, ctx.casterId, Math.max(1, durability), false, 'single', undefined, caster ?? undefined, findSide(ctx.state, target.id) !== findSide(ctx.state, ctx.casterId), true);
        if (target.defeated) for (const event of damageEvents) {
          if (event.type === 'skill-damage' && event.targetId === target.id && event.resultingHp <= 0)
            event.devoured = true;
        }
        events.push(...damageEvents);
        // 成长：获得目标当前攻击、护甲、生命，不获得魔法；特质限制由 applyBuffGain 处理
        if (caster && !caster.defeated && target.defeated) {
          const gain = params.gain ?? {};
          const ga = gain.attack ?? victimAttack;
          const gm = gain.armor ?? victimArmor;
          const gg = gain.magic ?? 0;
          const gh = gain.hp ?? victimLife;
          if (ga > 0) {
            const applied = applyBuffGain(caster, 'attack', ga);
            if (applied !== 0) events.push({ type: 'buff', targetId: caster.id, stat: 'attack', amount: applied });
          }
          if (gm > 0) {
            const applied = applyBuffGain(caster, 'armor', gm);
            if (applied !== 0) events.push({ type: 'buff', targetId: caster.id, stat: 'armor', amount: applied });
          }
          if (gg > 0) {
            const applied = applyBuffGain(caster, 'magic', gg);
            if (applied !== 0) events.push({ type: 'buff', targetId: caster.id, stat: 'magic', amount: applied });
          }
          if (gh > 0) {
            const applied = applyBuffGain(caster, 'hp', gh, 'gain');
            if (applied !== 0) events.push({ type: 'buff', targetId: caster.id, stat: 'hp', amount: applied });
          }
        }
      }
      return events;
    },
  };
}
