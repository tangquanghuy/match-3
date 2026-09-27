/** Skill damage: splash = full primary + adjacent collateral; scatter = one random shared pool. */
import type { GameEvent, SkillDamageEvent } from '../../events';
import type { Character } from '../../types';
import { PlayerSide } from '../../types';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive } from './context';
import { casterMagic, locate, findCharacter, findSide } from './context';
import { hasTroopType, evaluateWithModifier, modifierBonus, DEFAULT_RACE_DOUBLE, condMultiplier, condBonusValue, isTargetCondition } from './secondary';
import type { ModifierSpec, CondMult, CondBonus } from './secondary';
import { passivesOf, eventDamageMultiplier, isImmuneToStatus } from '../../traits';
import { consumeBarrier, hasStatus, FAERIE_FIRE_STATUS_ID, FAERIE_FIRE_SPELL_MULT,
  REFLECT_STATUS_ID, isCursed } from './status';
import { applyBuffGain } from './buff';
import { reflectHit } from './reflect';

export type DamageRange = 'single' | 'all' | 'splash' | 'scatter';

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
  /** Native ManaBurn: add each victim's current Mana, never drain it. */
  manaBurn?: boolean;
  /** Adjacent splash fraction: light 25%, normal 50%, heavy 75%. */
  splashRatio?: number;
  /** Select a living centre afresh for each random splash wave. */
  randomSplashCount?: number;
  /** Independent per-wave rolls; a failed wave does not cancel later waves. */
  randomSplashChances?: number[];
  /** Number of separate native random damage steps, sampled sequentially. */
  randomDamageWaves?: number;
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
  /** Native StealLife: bypass Armor, transfer only Life actually lost, increase maximum Life. */
  drain?: boolean;
  /** 即杀（「摧毁/消灭该敌人」）：伤害额 = 目标当前有效耐久（屏障/法术减伤照常结算） */
  execute?: boolean;
  /** 分摊（「伤害分摊给至多 {N} 名敌人」）：掷一次总额，均分给前 N 名存活敌人（余数给靠前者） */
  split?: number;
  /**
   * 随机分摊（R22 批，7207「再造成 8 点伤害，随机分配给所有敌人」）：掷一次总额后按
   * 逐点随机分给所选存活敌人（与 split 的"均分给前 N 名"不同——分配方式随机、
   * 覆盖全体）。modifier 在总额上照常生效。
   */
  splitRandom?: boolean;
  /** Only spells aimed at the whole team are avoided by Submerged; random single-target
   * waves and positional subsets may use range=all for presentation but still hit. */
  wholeTeamDamage?: boolean;
}

interface ChainMeta {
  index: number;
  count: number;
  fromId: number;
}

/** Primary first, then its living formation neighbours; no wraparound. */
export function orderedSplashTargets(teamCharacters: Character[], primaryId: number): Character[] {
  const alive = teamCharacters.filter(character => !character.defeated);
  const index = alive.findIndex(character => character.id === primaryId);
  if (index < 0) return [];
  return [alive[index], alive[index - 1], alive[index + 1]].filter((c): c is Character => !!c);
}

/**
 * Allocate individual points with the seeded RNG, without a fixed slot bias.
 * First avoid overkill using pre-mitigation HP/armor capacity; if the entire team
 * is saturated, distribute the excess over the original targets as well. This
 * preserves the pool, without granting spell-resistant troops a redistribution bonus.
 * Each target subsequently receives ONE hit (barrier/reflection/reduction once).
 */
export function allocateScatterDamage(totalDamage: number, targets: Character[], rng: EffectContext['rng'], trueDamage = false): number[] {
  let remaining = Math.max(0, Math.floor(totalDamage));
  const shares = targets.map(() => 0);
  const capacities = targets.map(t => Math.max(0, Math.ceil(trueDamage ? t.hp : t.hp + t.armor)));
  let active = targets.map((_, i) => i).filter(i => capacities[i] > 0);
  const all = targets.map((_, i) => i);
  while (remaining > 0 && all.length > 0) {
    const candidates = active.length ? active : all;
    if (candidates.length === 1) {
      const i = candidates[0];
      const chunk = active.length ? Math.min(remaining, capacities[i] - shares[i]) : remaining;
      shares[i] += chunk;
      remaining -= chunk;
      active = [];
      continue;
    }
    const i = candidates[rng.nextInt(candidates.length)];
    shares[i]++;
    remaining--;
    if (active.length && shares[i] >= capacities[i]) active = active.filter(j => j !== i);
  }
  return shares;
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
  /** Reflect triggers only for enemy damage (official 4.5), never friendly damage. */
  sourceIsEnemy = true,
  /** Devour is a lethal operation, not a mitigatable spell hit. */
  ignoreSpellModifiers = false,
): GameEvent[] {
  const events: GameEvent[] = [];
  if (target.defeated || amount <= 0) return events;

  // 妖火状态（GoW Faerie Fire）：目标受到的法术伤害 +50%。damageOne 即本引擎的
  // 「法术伤害」统一口径（技能伤害、炸毁骷髅的真伤弹体都走这里），骷髅普攻
  // （resolveSkullDamage）与 DoT 直扣血不经此处，天然不吃妖火。
  if (caster && !ignoreSpellModifiers) amount *= eventDamageMultiplier(caster, target);
  const amplified = !ignoreSpellModifiers && hasStatus(target, FAERIE_FIRE_STATUS_ID) ? amount * FAERIE_FIRE_SPELL_MULT : amount;

  // 法术减伤特质（法术铠甲）。真实伤害同样受它影响：这里减的是"法术"来源，
  // 真实伤害只是绕过护甲，不代表绕过法术抗性。
  const reduced = ignoreSpellModifiers ? Math.max(0, Math.round(amplified))
    : Math.max(0, Math.round(amplified * (hasStatus(target, 'stun') ? 1 : passivesOf(target).spellDamageTaken)));
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
  if (sourceIsEnemy && caster && hasStatus(target, REFLECT_STATUS_ID)) {
    events.push(...reflectHit(target, caster, amount, 'skill'));
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
      const { scaling, range = 'single', trueDamage = false } = params;
      // Same status-immunity/Curse policy as status application; Blessed always
      // blocks Mana Burn. Mana Shield's drain immunity must not replace damage.
      const targets = params.manaBurn ? params.targets.filter(victim => {
        if (hasStatus(victim, 'blessed')) return false;
        const immune = isImmuneToStatus(victim, 'mana-burn') || isImmuneToStatus(victim, 'mana_burn');
        return !immune || ((isCursed(victim) || hasStatus(victim, 'stun')) && !victim.traitIds?.includes('invulnerable'));
      }) : params.targets;
      if (targets.length === 0) return [];
      // 反射状态（GoW Reflect）反弹对象=伤害来源；预解析一次即可
      const caster = findCharacter(ctx.state, ctx.casterId);
      const sourceSide = findSide(ctx.state, ctx.casterId);
      const reflectAllowed = (victim: Character) => sourceSide !== null
        && findSide(ctx.state, victim.id) !== null && findSide(ctx.state, victim.id) !== sourceSide;
      let stolenLife = 0;
      const hit = (victim: Character, points: number, hitRange: DamageRange, chain?: ChainMeta): GameEvent[] => {
        const before = victim.hp;
        const produced = damageOne(victim, ctx.casterId, points, trueDamage || !!params.drain,
          hitRange, chain, caster, reflectAllowed(victim));
        // Only a successful hit may steal Life: Barrier, resistance and overkill
        // cannot create more Life than the target actually lost.
        if (params.drain && produced.some(e => e.type === 'skill-damage')) {
          stolenLife += Math.max(0, before - victim.hp);
        }
        return produced;
      };

      // 一次缩放（[魔法+N]）+ 二次缩放（[xN]/[N:M] 随战场资源）共同决定名义伤害；
      // 伤害区间（[A] – [B]）在区间内均匀取整（种子化，每段一次）。
      // modifiers（batch-r28）：多份加成相加后并入（7483 双系数；rangeSpec 路径同样生效）
      const drawAmount = (): number => {
        let rolled: number;
        if (params.rangeSpec) {
          const lo = evaluateWithModifier(evaluateScaling(params.rangeSpec.min, casterMagic(ctx)), params.modifier, ctx);
          const hi = evaluateWithModifier(evaluateScaling(params.rangeSpec.max, casterMagic(ctx)), params.modifier, ctx);
          rolled = hi <= lo ? lo : lo + ctx.rng.nextInt(hi - lo + 1);
        } else {
          rolled = evaluateWithModifier(evaluateScaling(scaling, casterMagic(ctx)), params.modifier, ctx);
        }
        if (params.modifiers?.length) {
          for (const spec of params.modifiers) rolled += modifierBonus(spec, ctx);
          rolled = Math.max(0, rolled);
        }
        return rolled;
      };
      // A random-high-damage native step rolls separately for each wave.
      // Ordinary grouped damage still evaluates its amount only once.
      const amount = params.randomDamageWaves && params.rangeSpec ? 0 : drawAmount();
      // 条件倍率以主目标计算溅射基数；邻位再乘溅射比例，各受害者独立结算抗性。
      const doubled = (victim: Character, baseAmount = amount): number => {
        if (params.execute) {
          return trueDamage ? victim.hp : victim.hp + victim.armor;
        }
        const times = params.raceTimes ?? DEFAULT_RACE_DOUBLE;
        const raceFactor = params.raceDouble && hasTroopType(victim, params.raceDouble) ? times : 1;
        // 叠加顺序（SOP 裁定）：(基础值 + 条件加成) × 种族倍率 × 条件倍率
        const based = baseAmount + (params.manaBurn ? victim.mana : 0) + condBonusValue(params.condBonus, ctx, victim);
        return based * raceFactor * condMultiplier(params.condMult, ctx, victim);
      };

      if (range === 'scatter' || params.splitRandom) {
        const victims = [...new Map(targets.filter(c => !c.defeated).map(c => [c.id, c])).values()];
        // Global conditions boost the shared pool ONCE, before allocation. Target-relative
        // conditions remain per-victim; otherwise +10 versus an Elf team becomes +40.
        const globalBonus = params.condBonus && !isTargetCondition(params.condBonus.cond) ? params.condBonus : undefined;
        const globalMult = params.condMult && !isTargetCondition(params.condMult.cond) ? params.condMult : undefined;
        const pool = (amount + condBonusValue(globalBonus, ctx)) * condMultiplier(globalMult, ctx);
        const allocations = allocateScatterDamage(pool, victims, ctx.rng, trueDamage);
        const hits: SkillDamageEvent[] = [];
        const tails: GameEvent[] = [];
        victims.forEach((victim, i) => {
          // A pool is rolled/evaluated only once; never re-evaluate modifier/rangeSpec here.
          const race = params.raceDouble && hasTroopType(victim, params.raceDouble) ? (params.raceTimes ?? DEFAULT_RACE_DOUBLE) : 1;
          const share = (allocations[i] + condBonusValue(globalBonus ? undefined : params.condBonus, ctx, victim))
            * race * condMultiplier(globalMult ? undefined : params.condMult, ctx, victim);
          // Shares already drawn: a submerged troop dodges its share; it is not
          // redistributed to other troops (which would increase damage).
          if (params.wholeTeamDamage && hasStatus(victim, 'submerged')) return;
          for (const event of hit(victim, share, 'scatter')) {
            if (event.type === 'skill-damage') hits.push(event);
            else tails.push(event);
          }
        });
        const events = [...hits, ...tails];
        return params.drain ? settleDrain(ctx, events, stolenLife) : events;
      }

      if (params.split !== undefined && params.split > 0) {
        const mySide = findSide(ctx.state, ctx.casterId);
        if (mySide === null) return [];
        const enemySide = mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
        const victims = ctx.state.teams[enemySide].characters.filter((c) => !c.defeated).slice(0, params.split);
        if (victims.length === 0) return [];
        const total = Math.floor(amount);
        const per = Math.floor(total / victims.length);
        let rem = total - per * victims.length;
        const events: GameEvent[] = [];
        for (const victim of victims) {
          const deal = per + (rem > 0 ? 1 : 0);
          if (rem > 0) rem -= 1;
          if (deal <= 0) continue;
          events.push(...hit(victim, deal, 'single'));
        }
        return params.drain ? settleDrain(ctx, events, stolenLife) : events;
      }

      if (range === 'splash') {
        const events: GameEvent[] = [];
        // A multi-target segment represents one complete splash per centre.
        // Snapshot each wave before dealing it; killing its centre does not cancel collateral.
        const selected = new Set<number>();
        const centres: { id: number; aliveBefore: boolean }[] = [];
        const randomSplash = params.randomSplashCount !== undefined || params.randomSplashChances !== undefined;
        const waves = params.randomSplashChances?.length ?? params.randomSplashCount ?? targets.length;
        for (let wave = 0; wave < waves; wave++) {
          // Native PercentageChance applies to each individual step, not a uniform hit count
          // and not a nested chain. Roll before target selection; skipped waves track nobody.
          const chance = Math.max(0, Math.min(1, params.randomSplashChances?.[wave] ?? 1));
          if (chance < 1 && !(ctx.rng.next() < chance)) continue;
          let primary = targets[wave];
          if (randomSplash) {
            const alive = targets.filter(t => !t.defeated);
            const preferred = alive.filter(t => !selected.has(t.id));
            const candidates = preferred.length ? preferred : alive;
            if (!candidates.length) break;
            primary = candidates[ctx.rng.nextInt(candidates.length)];
            selected.add(primary.id);
          }
          if (!primary || primary.defeated) continue;
          if (randomSplash && ctx.castTracking) {
            const snapshot = { id: primary.id, aliveBefore: true };
            centres.push(snapshot);
            ctx.castTracking.lastTargets = centres;
            ctx.castTracking.lastTarget = centres[0];
            const all = ctx.castTracking.allTargets ??= [];
            if (!all.some(t => t.id === primary.id)) all.push(snapshot);
          }
          const located = locate(ctx.state, primary.id);
          const ordered = located ? orderedSplashTargets(located.team.characters, primary.id) : [primary];
          const primaryDamage = Math.max(0, Math.floor(doubled(primary)));
          const ratio = params.splashRatio ?? 0.5;
          const damageEvents: SkillDamageEvent[] = [];
          const tailEvents: GameEvent[] = [];
          ordered.forEach((target, index) => {
            const hitAmount = index === 0 ? primaryDamage : Math.floor(primaryDamage * ratio);
            const produced = hit(target, hitAmount, range, {
              index, count: ordered.length, fromId: index === 0 ? ctx.casterId : primary.id,
            });
            for (const event of produced) {
              if (event.type === 'skill-damage') damageEvents.push(event);
              else tailEvents.push(event);
            }
          });
          events.push(...damageEvents, ...tailEvents);
        }
        return params.drain ? settleDrain(ctx, events, stolenLife) : events;
      }

      if (params.randomDamageWaves !== undefined && range === 'all') {
        // Source steps pick a new, currently alive target each time. Prefer one not
        // previously hit; when the pool is exhausted, subsequent native steps can
        // hit earlier survivors again. Never select an enemy killed in this cast.
        const selected = new Set<number>();
        const snapshots: { id: number; aliveBefore: boolean }[] = [];
        const damageEvents: SkillDamageEvent[] = [];
        const tailEvents: GameEvent[] = [];
        for (let wave = 0; wave < params.randomDamageWaves; wave++) {
          const alive = targets.filter(target => !target.defeated);
          const fresh = alive.filter(target => !selected.has(target.id));
          const choices = fresh.length ? fresh : alive;
          if (!choices.length) break;
          const victim = choices[ctx.rng.nextInt(choices.length)];
          selected.add(victim.id);
          snapshots.push({ id: victim.id, aliveBefore: true });
          const perWaveAmount = params.rangeSpec ? drawAmount() : amount;
          const produced = hit(victim, doubled(victim, perWaveAmount), range);
          for (const event of produced) {
            if (event.type === 'skill-damage') damageEvents.push(event);
            else tailEvents.push(event);
          }
        }
        if (ctx.castTracking && snapshots.length) {
          ctx.castTracking.lastTarget = snapshots[0];
          ctx.castTracking.lastTargets = snapshots;
          const tracked = ctx.castTracking.allTargets ??= [];
          for (const snapshot of snapshots) {
            if (!tracked.some(entry => entry.id === snapshot.id)) tracked.push(snapshot);
          }
        }
        const events = [...damageEvents, ...tailEvents];
        return params.drain ? settleDrain(ctx, events, stolenLife) : events;
      }

      if (range === 'all') {
        // 群体伤害：先产出全部 skill-damage，再统一追加 defeat。
        // 若逐个交替（dmg,defeat,dmg,defeat...），表现层会因中间插入 defeat 而断开
        // 群攻批次的聚合，退化成"一个个受击/一个个阵亡"。与 splash 分支保持一致。
        const damageEvents: SkillDamageEvent[] = [];
        const tailEvents: GameEvent[] = [];
        for (const victim of targets) {
          if (params.wholeTeamDamage && hasStatus(victim, 'submerged')) continue;
          const produced = hit(victim, doubled(victim), range);
          for (const event of produced) {
            if (event.type === 'skill-damage') damageEvents.push(event);
            else tailEvents.push(event);
          }
        }
        return params.drain ? settleDrain(ctx, [...damageEvents, ...tailEvents], stolenLife) : [...damageEvents, ...tailEvents];
      }

      const events: GameEvent[] = [];
      for (const victim of targets.slice(0, 1)) {
        events.push(...hit(victim, doubled(victim), range));
      }
      return params.drain ? settleDrain(ctx, events, stolenLife) : events;
    },
  };
}

/** Transfer only the target Life lost; the caster grows current and maximum Life. */
function settleDrain(ctx: EffectContext, produced: GameEvent[], stolenLife: number): GameEvent[] {
  if (stolenLife <= 0) return produced;
  const caster = findCharacter(ctx.state, ctx.casterId);
  if (!caster || caster.defeated) return produced;
  const gained = applyBuffGain(caster, 'hp', stolenLife, 'gain');
  if (gained === 0) return produced;
  return [...produced, { type: 'buff', targetId: caster.id, stat: 'hp', amount: gained, maxHpGain: gained }];
}
