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
import { isWebbed } from './status';
import { hasTroopType, evaluateWithModifier, DEFAULT_RACE_DOUBLE, condMultiplier, condBonusValue } from './secondary';
import type { ModifierSpec, CondMult, CondBonus } from './secondary';
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
  /** 全额治疗（stat='hp'）：恢复到 maxHp 上限（「恢复所有生命值」） */
  full?: boolean;
  /**
   * 比例获得（引擎原语批，stat='mana' 专用）：「获得半数法力值」= 获得
   * floor(manaCost / 2)（半条法力，逐目标按各自法力条现算）；给出时忽略 scaling。
   */
  halve?: boolean;
  /**
   * 任意比例获得（R12 批，stat='mana' 专用）：「获得 4 分之一的法力值 / 25% 法力值」=
   * 获得 floor(manaCost × fraction)（官方 GenerateQuarterMana = 0.25，逐目标现算、下取整）；
   * 与 halve 二选一同时给出时以 halve 为准。给出时忽略 scaling。
   */
  fraction?: number;
  /** 二次缩放（[xN]/[N:M] + 来源），可选 */
  modifier?: ModifierSpec;
  /** 种族条件翻倍：目标 troopTypes 含该族时数值 ×2（五机制之一） */
  raceDouble?: string;
  /** 种族条件倍率（默认 2；「翻 3 倍」= 3），仅与 raceDouble 同用 */
  raceTimes?: number;
  /** 条件倍率（「如果…则造成 N 倍/效果翻倍」） */
  condMult?: CondMult;
  /** 条件加成（加算；先加后乘） */
  condBonus?: CondBonus;
}

/**
 * 对单个角色施加增益，返回实际变化量（受上限夹取后可能小于名义值）。
 * 导出供窃取（debuff.ts）的「自身等量获得」路径复用，保证口径一致
 * （hp 上限、mana 上限、织网拦截魔法增益、治疗修正）。
 */
export function applyBuffGain(target: Character, stat: BuffStat, amount: number): number {
  return buffOne(target, stat, amount);
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
      // 织网（GoW Web）期间无法获得魔法值增益；返回 0 则不发 buff 事件
      if (isWebbed(target)) return 0;
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

/** 随机属性可投的点（GoW Random Stats：攻/甲/血/魔四维） */
const RANDOM_STATS: readonly BuffStat[] = ['attack', 'armor', 'hp', 'magic'];

export interface RandomStatParams {
  /** 目标列表（由 targeting 产出） */
  targets: Character[];
  /** 点数缩放规格（「获得 [魔法] 点随机技能值」按施法者魔力求值） */
  scaling: ScalingSpec;
  /** 二次缩放（「点数因…而增强」） */
  modifier?: ModifierSpec;
  /** 种族条件翻倍 */
  raceDouble?: string;
  /** 种族条件倍率（默认 2） */
  raceTimes?: number;
  /** 条件倍率（「如果…则造成 N 倍/效果翻倍」） */
  condMult?: CondMult;
  /** 条件加成（加算；先加后乘） */
  condBonus?: CondBonus;
}

/**
 * 随机属性获得原语（DECISIONS.md「纯逻辑小活顺路处理」）：获得 N 点随机技能值。
 * 每点经种子化 RNG 随机分给攻/甲/血/魔之一（+1），逐点独立投掷；
 * 每个目标按属性聚合为一次 buff 事件，避免事件流噪声。
 */
export function randomStatEffect(params: RandomStatParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const { targets } = params;
      if (targets.length === 0) return [];
      const base = evaluateWithModifier(
        evaluateScaling(params.scaling, casterMagic(ctx)),
        params.modifier,
        ctx,
      );
      const events: GameEvent[] = [];
      for (const target of targets) {
        if (target.defeated) continue;
        const raceFactor = params.raceDouble && hasTroopType(target, params.raceDouble) ? (params.raceTimes ?? DEFAULT_RACE_DOUBLE) : 1;
        const effPoints = (base + condBonusValue(params.condBonus, ctx, target)) * raceFactor * condMultiplier(params.condMult, ctx, target);
        if (effPoints <= 0) continue;
        const gains: Partial<Record<BuffStat, number>> = {};
        for (let i = 0; i < effPoints; i++) {
          const stat = RANDOM_STATS[ctx.rng.nextInt(RANDOM_STATS.length)];
          gains[stat] = (gains[stat] ?? 0) + 1;
        }
        for (const [stat, amount] of Object.entries(gains) as [BuffStat, number][]) {
          const applied = buffOne(target, stat, amount);
          if (applied !== 0) {
            events.push({ type: 'buff', targetId: target.id, stat, amount: applied });
          }
        }
      }
      return events;
    },
  };
}

/**
 * 构建增益原语（需求 8.1–8.5；二次缩放/种族翻倍为窗口 B 增量）。
 */
export function buffEffect(params: BuffParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const { targets, stat, scaling } = params;
      if (targets.length === 0) return []; // 无目标安全跳过

      const base = evaluateWithModifier(
        evaluateScaling(scaling, casterMagic(ctx)),
        params.modifier,
        ctx,
      );
      const events: GameEvent[] = [];

      for (const target of targets) {
        if (target.defeated) continue; // 阵亡不接受增益
        // 比例获得（半条法力 / 任意比例）：按受益者各自的 manaCost 现算，覆盖缩放数值。
        // 比例族仅 stat='mana' 生效（非 mana 属性挂 halve/fraction 走普通数值路径，既有护栏）。
        if (stat === 'mana' && (params.halve || params.fraction !== undefined)) {
          const ratio = params.halve ? 0.5 : (params.fraction as number);
          const applied = buffOne(target, 'mana', Math.floor(target.manaCost * ratio));
          if (applied !== 0) {
            events.push({ type: 'buff', targetId: target.id, stat, amount: applied });
          }
          continue;
        }
        // 种族条件翻倍：按受益者逐个判定（群体段中仅该族目标翻倍）
        const raceFactor = params.raceDouble && hasTroopType(target, params.raceDouble) ? (params.raceTimes ?? DEFAULT_RACE_DOUBLE) : 1;
        let amount = (base + condBonusValue(params.condBonus, ctx, target)) * raceFactor * condMultiplier(params.condMult, ctx, target);
        if (params.full && stat === 'hp') amount = Number.POSITIVE_INFINITY;
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
