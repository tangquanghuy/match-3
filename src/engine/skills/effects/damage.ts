/**
 * Skill damage primitive.
 *
 * Splash damage is a selected-target chain: start at the chosen enemy, walk toward
 * the back of the team, wrap to the front, and hit at most four living characters.
 * The evaluated damage is one shared pool, not full damage per victim.
 */
import type { GameEvent, SkillDamageEvent } from '../../events';
import type { Character } from '../../types';
import { PlayerSide } from '../../types';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { casterMagic, locate, findCharacter, findSide } from './context';
import { hasTroopType, evaluateWithModifier, modifierBonus, DEFAULT_RACE_DOUBLE, condMultiplier, condBonusValue } from './secondary';
import type { ModifierSpec, CondMult, CondBonus } from './secondary';
import { passivesOf } from '../../traits';
import { consumeBarrier, hasStatus, FAERIE_FIRE_STATUS_ID, FAERIE_FIRE_SPELL_MULT,
  REFLECT_STATUS_ID, reflectDamageAmount, consumeReflect } from './status';
import { applyBuffGain } from './buff';

export type DamageRange = 'single' | 'all' | 'splash';

/** 伤害区间（DECISIONS「顺路」小活）：「造成 [A] – [B] 点伤害」在 [min, max] 内均匀取整 */
export interface DamageRangeSpec {
  min: ScalingSpec;
  max: ScalingSpec;
}

export interface DamageParams {
  targets: Character[];
  scaling: ScalingSpec;
  range?: DamageRange;
  trueDamage?: boolean;
  /** 二次缩放（[xN]/[N:M] + 来源），叠加在基础伤害上 */
  modifier?: ModifierSpec;
  /**
   * 多份二次缩放（batch-r28，双系数句式——7483「伤害值等同于自身的攻击力，并因棕色敌军
   * 数量而增强 [x10]」：基数=攻击力 ×1 与来源计数 ×10 是两个不同系数，单 modifier 通道
   * 在数学上不可同表）：与 modifier 并存，各份加成相加（damage 之外的段暂无此需求）。
   */
  modifiers?: ModifierSpec[];
  /** 种族条件翻倍：目标 troopTypes 含该族时其所受伤害 ×2（五机制之一） */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率：条件成立时该目标所受数值 ×times（「如果敌人是恶魔，则造成 3 倍伤害」） */
  condMult?: CondMult;
  /** 条件加成：条件成立时该目标所受数值 +n（加算；先加后乘） */
  condBonus?: CondBonus;
  /** 伤害区间（[A] – [B]）：min/max 分别求值后随机取整 */
  rangeSpec?: DamageRangeSpec;
  /** 生命窃取：本次伤害实际打出的总额（各 skill-damage 事件 damage 之和）治疗施法者 */
  drain?: boolean;
  /** 即杀（「摧毁/消灭该敌人」）：伤害额 = 目标当前有效耐久（屏障/法术减伤照常结算） */
  execute?: boolean;
  /** 分摊（「伤害分摊给至多 {N} 名敌人」）：掷一次总额，均分给前 N 名存活敌人（余数给靠前者） */
  split?: number;
  /**
   * 随机分摊（R22 批，7207「再造成 8 点伤害，随机分配给所有敌人」）：掷一次总额后按
   * 随机切点分给**全部**存活敌人（与 split 的"均分给前 N 名"不同——分配方式随机、
   * 覆盖全体）。modifier 在总额上照常生效。
   */
  splitRandom?: boolean;
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

/** 单目标法术伤害核心（TurnEngine 炸毁骷髅结算复用：法术铠甲/屏障/护甲/阵亡同口径） */
export function damageOne(
  target: Character,
  casterId: number,
  /** 减免前的伤害；函数内会按目标的法术减伤特质折算 */
  amount: number,
  trueDamage: boolean,
  range: DamageRange,
  chain?: ChainMeta,
  /** 伤害来源角色（反射状态反弹的对象）；缺省不反弹（DoT 直扣血等无来源路径） */
  caster?: Character,
): GameEvent[] {
  const events: GameEvent[] = [];
  if (target.defeated || amount <= 0) return events;

  // 妖火状态（GoW Faerie Fire）：目标受到的法术伤害 +50%。damageOne 即本引擎的
  // 「法术伤害」统一口径（技能伤害、炸毁骷髅的真伤弹体都走这里），骷髅普攻
  // （resolveSkullDamage）与 DoT 直扣血不经此处，天然不吃妖火。
  const amplified = hasStatus(target, FAERIE_FIRE_STATUS_ID) ? amount * FAERIE_FIRE_SPELL_MULT : amount;

  // 法术减伤特质（法术铠甲）。真实伤害同样受它影响：这里减的是"法术"来源，
  // 真实伤害只是绕过护甲，不代表绕过法术抗性。
  const reduced = Math.max(0, Math.round(amplified * passivesOf(target).spellDamageTaken));
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

  // 反射状态（GoW Reflect，gowhead 步骤名 Mirror）：法术伤害同样反弹 50%（至少 1 点）
  // 给施法者，受一次伤害后消失。屏障整发吸收的路径在上面已提前返回（等于没打中）。
  if (caster && !caster.defeated && hasStatus(target, REFLECT_STATUS_ID)) {
    const reflected = reflectDamageAmount(amount);
    const takenByArmor = Math.min(caster.armor, reflected);
    caster.armor -= takenByArmor;
    caster.hp = Math.max(0, caster.hp - (reflected - takenByArmor));
    events.push({
      type: 'skill-damage',
      casterId: target.id,
      targetId: caster.id,
      range: 'single',
      damage: reflected,
      resultingHp: caster.hp,
      resultingArmor: caster.armor,
    });
    events.push(...consumeReflect(target));
    if (caster.hp <= 0 && !caster.defeated) {
      caster.defeated = true;
      events.push({ type: 'defeat', characterId: caster.id });
    }
  }

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
      // 反射状态（GoW Reflect）反弹对象=伤害来源；预解析一次即可
      const caster = findCharacter(ctx.state, ctx.casterId);

      // 一次缩放（[魔法+N]）+ 二次缩放（[xN]/[N:M] 随战场资源）共同决定名义伤害；
      // 伤害区间（[A] – [B]）在区间内均匀取整（种子化，每段一次）。
      // modifiers（batch-r28）：多份加成相加后并入（7483 双系数；rangeSpec 路径同样生效）
      let amount: number;
      if (params.rangeSpec) {
        const lo = evaluateWithModifier(evaluateScaling(params.rangeSpec.min, casterMagic(ctx)), params.modifier, ctx);
        const hi = evaluateWithModifier(evaluateScaling(params.rangeSpec.max, casterMagic(ctx)), params.modifier, ctx);
        amount = hi <= lo ? lo : lo + ctx.rng.nextInt(hi - lo + 1);
      } else {
        amount = evaluateWithModifier(evaluateScaling(scaling, casterMagic(ctx)), params.modifier, ctx);
      }
      if (params.modifiers && params.modifiers.length > 0) {
        for (const spec of params.modifiers) amount += modifierBonus(spec, ctx);
        amount = Math.max(0, amount);
      }
      // 种族翻倍：单体/群体按受击者逐个判定；溅射为共享伤害池，
      // 简化为「主目标属该族则整池翻倍」（当前数据中溅射×种族组合为零，规则手册已注明）
      const doubled = (victim: Character): number => {
        if (params.execute) {
          return trueDamage ? victim.hp : victim.hp + victim.armor;
        }
        const times = params.raceTimes ?? DEFAULT_RACE_DOUBLE;
        const raceFactor = params.raceDouble && hasTroopType(victim, params.raceDouble) ? times : 1;
        // 叠加顺序（SOP 裁定）：(基础值 + 条件加成) × 种族倍率 × 条件倍率
        const based = amount + condBonusValue(params.condBonus, ctx, victim);
        return based * raceFactor * condMultiplier(params.condMult, ctx, victim);
      };

      if (params.splitRandom) {
        // 随机分摊（R22 批，7207）：总额掷定后按随机切点分给全部存活敌人（确定性切点法：
        // 在 [0, total] 上取 n-1 个有序随机数作累积边界，差值即各目标份额，可能为 0）
        const mySide = findSide(ctx.state, ctx.casterId);
        if (mySide === null) return [];
        const enemySide = mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
        const victims = ctx.state.teams[enemySide].characters.filter((c) => !c.defeated);
        if (victims.length === 0) return [];
        const total = evaluateWithModifier(evaluateScaling(scaling, casterMagic(ctx)), params.modifier, ctx);
        if (total <= 0) return [];
        const cuts: number[] = [];
        for (let i = 0; i < victims.length - 1; i++) cuts.push(ctx.rng.nextInt(total + 1));
        cuts.sort((a, b) => a - b);
        const shares: number[] = [];
        let prev = 0;
        for (const cut of [...cuts, total]) {
          shares.push(cut - prev);
          prev = cut;
        }
        const events: GameEvent[] = [];
        victims.forEach((victim, i) => {
          if (shares[i] > 0) events.push(...damageOne(victim, ctx.casterId, shares[i], trueDamage, 'single', undefined, caster));
        });
        return events;
      }

      if (params.split !== undefined && params.split > 0) {
        const mySide = findSide(ctx.state, ctx.casterId);
        if (mySide === null) return [];
        const enemySide = mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
        const victims = ctx.state.teams[enemySide].characters.filter((c) => !c.defeated).slice(0, params.split);
        if (victims.length === 0) return [];
        const total = evaluateWithModifier(evaluateScaling(scaling, casterMagic(ctx)), params.modifier, ctx);
        const per = Math.floor(total / victims.length);
        let rem = total - per * victims.length;
        const events: GameEvent[] = [];
        for (const victim of victims) {
          const deal = per + (rem > 0 ? 1 : 0);
          if (rem > 0) rem -= 1;
          if (deal <= 0) continue;
          events.push(...damageOne(victim, ctx.casterId, deal, trueDamage, 'single', undefined, caster));
        }
        return events;
      }

      if (range === 'splash') {
        const primary = targets[0];
        const located = locate(ctx.state, primary.id);
        const ordered = located ? orderedSplashTargets(located.team.characters, primary.id) : [primary];
        const pool = params.execute
          ? (trueDamage ? primary.hp : primary.hp + primary.armor)
          : doubled(primary);
        const allocations = allocateSplashChainDamage(pool, ordered, trueDamage);
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
          }, caster);
          for (const event of produced) {
            if (event.type === 'skill-damage') damageEvents.push(event);
            else tailEvents.push(event);
          }
        });

        // Let the complete chain play before gray/death removal events begin.
        return params.drain ? settleDrain(ctx, [...damageEvents, ...tailEvents]) : [...damageEvents, ...tailEvents];
      }

      if (range === 'all') {
        // 群体伤害：先产出全部 skill-damage，再统一追加 defeat。
        // 若逐个交替（dmg,defeat,dmg,defeat...），表现层会因中间插入 defeat 而断开
        // 群攻批次的聚合，退化成"一个个受击/一个个阵亡"。与 splash 分支保持一致。
        const damageEvents: SkillDamageEvent[] = [];
        const tailEvents: GameEvent[] = [];
        for (const victim of targets) {
          const produced = damageOne(victim, ctx.casterId, doubled(victim), trueDamage, range, undefined, caster);
          for (const event of produced) {
            if (event.type === 'skill-damage') damageEvents.push(event);
            else tailEvents.push(event);
          }
        }
        return params.drain ? settleDrain(ctx, [...damageEvents, ...tailEvents]) : [...damageEvents, ...tailEvents];
      }

      const events: GameEvent[] = [];
      for (const victim of targets.slice(0, 1)) {
        events.push(...damageOne(victim, ctx.casterId, doubled(victim), trueDamage, range, undefined, caster));
      }
      return params.drain ? settleDrain(ctx, events) : events;
    },
  };
}

/** 生命窃取收尾：把本次伤害事件的实际总额折算为对施法者的治疗（buff 事件，走 buffOne 口径） */
function settleDrain(ctx: EffectContext, produced: GameEvent[]): GameEvent[] {
  let total = 0;
  for (const e of produced) {
    if (e.type === 'skill-damage') total += e.damage;
  }
  if (total <= 0) return produced;
  const caster = findCharacter(ctx.state, ctx.casterId);
  if (!caster || caster.defeated) return produced;
  const healed = applyBuffGain(caster, 'hp', total);
  if (healed === 0) return produced;
  return [...produced, { type: 'buff', targetId: caster.id, stat: 'hp', amount: healed }];
}
