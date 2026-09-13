/**
 * Skill damage primitive.
 *
 * Splash damage is a selected-target chain: start at the chosen enemy, walk toward
 * the back of the team, wrap to the front, and hit at most four living characters.
 * The evaluated damage is one shared pool, not full damage per victim.
 */
import type { GameEvent, SkillDamageEvent } from '../../events';
import type { Character } from '../../types';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { casterMagic, locate } from './context';
import { passivesOf } from '../../traits';
import { consumeBarrier } from './status';

export type DamageRange = 'single' | 'all' | 'splash';

export interface DamageParams {
  targets: Character[];
  scaling: ScalingSpec;
  range?: DamageRange;
  trueDamage?: boolean;
}

interface ChainMeta {
  index: number;
  count: number;
  fromId: number;
}

const SPLASH_WEIGHT_TABLE: Record<number, readonly number[]> = {
  1: [1],
  2: [0.65, 0.35],
  3: [0.50, 0.30, 0.20],
  4: [0.40, 0.30, 0.20, 0.10],
};

export function splashChainWeights(count: number): number[] {
  const clamped = Math.max(1, Math.min(4, Math.floor(count)));
  return [...SPLASH_WEIGHT_TABLE[clamped]];
}

/** Living team order starting at primary, walking backward in formation, then wrapping. */
export function orderedSplashTargets(teamCharacters: Character[], primaryId: number): Character[] {
  const alive = teamCharacters.filter((character) => !character.defeated);
  if (alive.length === 0) return [];
  const start = alive.findIndex((character) => character.id === primaryId);
  if (start < 0) return [];
  const count = Math.min(4, alive.length);
  return Array.from({ length: count }, (_, offset) => alive[(start + offset) % alive.length]);
}

function damageCapacity(target: Character, trueDamage: boolean): number {
  return Math.max(0, trueDamage ? target.hp : target.hp + target.armor);
}

/**
 * Weighted capped allocation with forward redistribution and wraparound passes.
 * If one target cannot absorb its share, remaining damage is redistributed among
 * targets that still have effective HP, so damage is not lost while capacity exists.
 */
export function allocateSplashChainDamage(
  totalDamage: number,
  targets: Character[],
  trueDamage = false,
): number[] {
  const total = Math.max(0, Math.floor(totalDamage));
  const weights = splashChainWeights(targets.length);
  const capacities = targets.map((target) => damageCapacity(target, trueDamage));
  const allocations = targets.map(() => 0);
  let remaining = total;
  let guard = 0;

  while (remaining > 0 && guard < 16) {
    guard += 1;
    const active = targets
      .map((_, index) => index)
      .filter((index) => allocations[index] < capacities[index]);
    if (active.length === 0) break;

    let progress = 0;
    for (let position = 0; position < active.length && remaining > 0; position += 1) {
      const index = active[position];
      const tail = active.slice(position);
      const tailWeight = tail.reduce((sum, item) => sum + weights[item], 0);
      const desired = position === active.length - 1
        ? remaining
        : Math.floor((remaining * weights[index]) / Math.max(Number.EPSILON, tailWeight));
      const share = Math.max(1, desired);
      const spare = capacities[index] - allocations[index];
      const dealt = Math.min(remaining, spare, share);
      if (dealt <= 0) continue;
      allocations[index] += dealt;
      remaining -= dealt;
      progress += dealt;
    }
    if (progress === 0) break;
  }

  return allocations;
}

function damageOne(
  target: Character,
  casterId: number,
  /** 减免前的伤害；函数内会按目标的法术减伤特质折算 */
  amount: number,
  trueDamage: boolean,
  range: DamageRange,
  chain?: ChainMeta,
): GameEvent[] {
  const events: GameEvent[] = [];
  if (target.defeated || amount <= 0) return events;

  // 法术减伤特质（法术铠甲）。真实伤害同样受它影响：这里减的是"法术"来源，
  // 真实伤害只是绕过护甲，不代表绕过法术抗性。
  const reduced = Math.max(0, Math.round(amount * passivesOf(target).spellDamageTaken));
  if (reduced <= 0) return events;
  amount = reduced;

  // 屏障：整发吸收后消失。放在扣护甲之前，且只被「确实会造成伤害」的一发消耗，
  // 因此不发 skill-damage——这一发等于没打中，受击触发链也不应启动。
  const barrier = consumeBarrier(target);
  if (barrier.consumed) return barrier.events;

  let remaining = amount;
  if (!trueDamage) {
    const absorbed = Math.min(target.armor, remaining);
    target.armor -= absorbed;
    remaining -= absorbed;
  }
  target.hp = Math.max(0, target.hp - remaining);

  const damageEvent: SkillDamageEvent = {
    type: 'skill-damage',
    casterId,
    targetId: target.id,
    range,
    damage: amount,
    resultingHp: target.hp,
    resultingArmor: target.armor,
  };
  if (chain) {
    damageEvent.chainIndex = chain.index;
    damageEvent.chainCount = chain.count;
    damageEvent.chainFromId = chain.fromId;
  }
  events.push(damageEvent);

  if (target.hp <= 0 && !target.defeated) {
    target.defeated = true;
    events.push({ type: 'defeat', characterId: target.id });
  }
  return events;
}

export function damageEffect(params: DamageParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const { targets, scaling, range = 'single', trueDamage = false } = params;
      if (targets.length === 0) return [];

      const amount = evaluateScaling(scaling, casterMagic(ctx));

      if (range === 'splash') {
        const primary = targets[0];
        const located = locate(ctx.state, primary.id);
        const ordered = located ? orderedSplashTargets(located.team.characters, primary.id) : [primary];
        const allocations = allocateSplashChainDamage(amount, ordered, trueDamage);
        const hits = ordered
          .map((target, index) => ({ target, amount: allocations[index] }))
          .filter((entry) => entry.amount > 0);
        const damageEvents: SkillDamageEvent[] = [];
        const tailEvents: GameEvent[] = [];

        hits.forEach((entry, index) => {
          const fromId = index === 0 ? ctx.casterId : hits[index - 1].target.id;
          const produced = damageOne(entry.target, ctx.casterId, entry.amount, trueDamage, range, {
            index,
            count: hits.length,
            fromId,
          });
          for (const event of produced) {
            if (event.type === 'skill-damage') damageEvents.push(event);
            else tailEvents.push(event);
          }
        });

        // Let the complete chain play before gray/death removal events begin.
        return [...damageEvents, ...tailEvents];
      }

      if (range === 'all') {
        // 群体伤害：先产出全部 skill-damage，再统一追加 defeat。
        // 若逐个交替（dmg,defeat,dmg,defeat...），表现层会因中间插入 defeat 而断开
        // 群攻批次的聚合，退化成"一个个受击/一个个阵亡"。与 splash 分支保持一致。
        const damageEvents: SkillDamageEvent[] = [];
        const tailEvents: GameEvent[] = [];
        for (const victim of targets) {
          const produced = damageOne(victim, ctx.casterId, amount, trueDamage, range);
          for (const event of produced) {
            if (event.type === 'skill-damage') damageEvents.push(event);
            else tailEvents.push(event);
          }
        }
        return [...damageEvents, ...tailEvents];
      }

      const events: GameEvent[] = [];
      for (const victim of targets.slice(0, 1)) {
        events.push(...damageOne(victim, ctx.casterId, amount, trueDamage, range));
      }
      return events;
    },
  };
}
