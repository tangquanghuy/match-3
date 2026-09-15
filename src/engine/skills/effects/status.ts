/**
 * 状态效果系统（战斗技能系统 · 需求 9）。
 *
 * 状态生命周期：施加(apply) → 按回合结算(tick) → 到期移除(expire)。
 * 状态实例存于 Character.statuses（需求 9.1）。
 *
 * DoT 类（poison/burning）在结算时对宿主造成伤害并发 status-tick（需求 9.2）。
 * 结算末尾对每个状态 turns 递减，归零移除并发 status-expire（需求 9.5）。
 *
 * 结算时机由 TurnEngine 在固定时机（对即将行动方角色）调用 tickStatuses，保证确定性（需求 9.4）。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import { isImmuneToStatus, passivesOf } from '../../traits';
// 治疗修正定义在 engine/healing.ts（特质模块也要用，放这里会形成循环 import）；
// 从状态模块转出一次，调用方按「状态相关」的直觉就能找到。
export {
  HEAL_BLOCK_STATUS_IDS,
  HEAL_HALVE_STATUS_IDS,
  isBleeding,
  isDiseased,
  healingMultiplier,
  effectiveHealing,
} from '../../healing';
import type { Character, StatusInstance } from '../../types';
import type { SeededRNG } from '../../rng';
import type {
  GameEvent,
  StatusApplyEvent,
  StatusTickEvent,
  StatusExpireEvent,
  StatusCleanseEvent,
  DefeatEvent,
} from '../../events';

/** 持续伤害类状态 id（结算时扣血）。出血与中毒/燃烧同为 DoT，只在治疗互动上不同。 */
export const DOT_STATUS_IDS = new Set(['poison', 'burning', 'bleed']);

/** GoW 状态别名：数据里既有英文正式名，也有早期调试/中文映射名。 */
export const DEATH_MARK_STATUS_IDS = new Set(['death-mark', 'death_mark']);
export const CURSE_STATUS_IDS = new Set(['curse', 'cursed']);
export const RAGE_STATUS_IDS = new Set(['rage', 'enraged']);
export const CHARM_STATUS_IDS = new Set(['charm', 'charmed']);
export const WOLF_STATUS_IDS = new Set(['wolf', 'wolf-form', 'lycanthropy']);
export const MANA_BURN_STATUS_IDS = new Set(['mana-burn', 'mana_burn']);

/** GoW 自动解除：中毒是唯一不会自行解除的负面状态。 */
const AUTO_RECOVER_STATUS_IDS = new Set([
  'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease',
  'marked', 'submerged', 'curse', 'cursed', 'death-mark', 'death_mark',
  'wolf', 'wolf-form', 'lycanthropy', 'charm', 'charmed', 'mana-burn', 'mana_burn',
]);
const RECOVERY_BASE = 10;
const RECOVERY_CURSED = 5;

/**
 * 不可被技能「指定」为目标的状态（GoW Submerged 下潮）。
 * 与 `stealthy`（隐匿）特质同一机制，见 `PassiveModifiers.untargetable`。
 * 群体技能照常命中——官方描述限定的是「法术指定攻击目标」。
 */
export const UNTARGETABLE_STATUS_IDS = new Set(['submerged']);

/**
 * 屏障状态 id（GoW Barrier）：完整吸收下一次伤害（骷髅或技能任一），随即消失。
 * 不是减伤百分比，而是一次性挡下整发伤害，因此在扣护甲之前判定。
 */
export const BARRIER_STATUS_ID = 'barrier';

/**
 * 纯标记类状态（GoW Hunter's Mark 猎人标记）：自身不带任何限制，
 * 作用是让「对中了猎人标记的敌人造成双倍骷髅伤害」这类特质（focus/eagleeye）
 * 经 `skullMultVsStatus` 生效。故引擎侧无需为它写任何分支。
 */
export const MARK_STATUS_ID = 'marked';

/**
 * 控制类状态 id 及各自限制（对齐 GoW 官方语义，见 `.kiro/specs/combat-mechanics/GEMS-SEMANTICS.md`）：
 *   - entangle 缠绕：官方=攻击力归零（骷髅匹配无伤害，仍可行动/施法/充能）。
 *     本作以 canAttack=false（攻击落空）表达，净效果一致。
 *   - frozen   冰冻：官方=不可施法、（法力色被冻结时）4/5 连不给额外回合。
 *     本作从紧：另加不可攻击，仍可充能（已知偏差，待对齐清单处理）。
 *   - silence  沉默：官方=不可施法、不可获得法力。一致。
 *   - stun     击晕：官方=禁用全部特质。本作被动系统尚无"禁用"分支，暂无效果（偏差）。
 * 织网（web）不是控制类——不禁行动，只锁魔力，见 WEB_STATUS_ID。
 */
export const CONTROL_STATUS_IDS = new Set(['silence', 'frozen', 'entangle']);

/**
 * 织网状态 id（GoW Web，官方语义）：
 *   - 魔力归零：技能数值只剩基础项（`casterMagic()` 对织网角色按 0 计）；
 *   - 无法获得魔法值增益（buff/特质触发在施加口拦截）；
 *   - 每回合**累计** 10% 几率自行挣脱（首回合 10%，之后每回合 +10%）；
 *   - 存续回合数照常递减，到期自然解除。
 * 与缠绕（entangle，攻击归零）是两个状态——中文数据里"织网/缠绕"曾混用，已按官方拆分。
 */
export const WEB_STATUS_ID = 'web';
/** 织网首回合挣脱几率（%） */
export const WEB_RECOVERY_BASE = 10;
/** 每多过一回合，挣脱几率累计增量（%） */
export const WEB_RECOVERY_STEP = 10;

/** 某角色是否带有指定状态且仍存续 */
export function hasStatus(char: Character, id: string): boolean {
  return char.statuses.some((s) => s.id === id && s.turns > 0);
}

/** 是否被沉默 */
export function isSilenced(char: Character): boolean {
  return hasStatus(char, 'silence');
}

/** 是否被眩晕 */
export function isStunned(char: Character): boolean {
  return hasStatus(char, 'stun');
}

/** 是否被冰冻 */
export function isFrozen(char: Character): boolean {
  return hasStatus(char, 'frozen');
}

/** 是否被缠绕 */
export function isEntangled(char: Character): boolean {
  return hasStatus(char, 'entangle');
}

/** 是否被织网（魔力归零，GoW Web） */
export function isWebbed(char: Character): boolean {
  return hasStatus(char, WEB_STATUS_ID);
}

export function isCursed(char: Character): boolean {
  return char.statuses.some((s) => s.turns > 0 && CURSE_STATUS_IDS.has(s.id));
}

export function isEnraged(char: Character): boolean {
  return char.statuses.some((s) => s.turns > 0 && RAGE_STATUS_IDS.has(s.id));
}

export function isCharmed(char: Character): boolean {
  return char.statuses.some((s) => s.turns > 0 && CHARM_STATUS_IDS.has(s.id));
}

/** 是否带有屏障（可吸收下一次伤害） */
export function hasBarrier(char: Character): boolean {
  return hasStatus(char, BARRIER_STATUS_ID);
}

/**
 * 该角色能否被技能「指定」为目标。
 * 下潮状态或隐匿特质任一成立即不可指定；调用方在**全员都不可指定**时须退化为可指定
 * （官方描述：「除非场上已无任何其他目标」），否则技能会无目标空放。
 */
export function isUntargetable(char: Character): boolean {
  if (passivesOf(char).untargetable) return true;
  return char.statuses.some((s) => s.turns > 0 && UNTARGETABLE_STATUS_IDS.has(s.id));
}

/**
 * 消耗屏障：带屏障则立即移除并返回 true，调用方据此把本次伤害整发归零。
 * 移除时发 status-expire，让表现层把徽章撤掉（复用既有事件，不新增类型）。
 */
export function consumeBarrier(char: Character): { consumed: boolean; events: GameEvent[] } {
  if (!hasBarrier(char)) return { consumed: false, events: [] };
  char.statuses = char.statuses.filter((s) => s.id !== BARRIER_STATUS_ID);
  const ev: StatusExpireEvent = {
    type: 'status-expire',
    targetId: char.id,
    statusId: BARRIER_STATUS_ID,
  };
  return { consumed: true, events: [ev] };
}

/**
 * 该角色当前能否释放技能：
 * 被沉默或冰冻时不可释放；击晕、缠绕不影响技能。
 */
export function canCastSkill(char: Character): boolean {
  return !isSilenced(char) && !isFrozen(char);
}

/**
 * 该角色当前能否发动普通（骷髅）攻击：
 * 被冰冻或缠绕时不可攻击（原地挣扎，攻击落空）。击晕暂不影响（待被动系统）。
 */
export function canAttack(char: Character): boolean {
  return !isFrozen(char) && !isEntangled(char);
}

/**
 * 该角色当前能否获得法力充能：
 * 被沉默时不可充能（该色法力跳过他，流向下一个能吃该色的队友）；冰冻/击晕/缠绕仍可充能。
 */
export function canGainMana(char: Character): boolean {
  return !isSilenced(char);
}

/**
 * 对角色施加一个状态（需求 9.1）。
 * 若已存在同 id 状态：刷新为「更长的存续回合」并按 opts.stack 选择合并方式——
 *   - stack: true（技能的「N 层」叠层施加）：magnitude **累加**（GoW 叠层语义，2 层+3 层=5 层）；
 *   - 默认（特质/普通施加）：magnitude 取更大值（web 的挣脱几率语义依赖 max，行为不变）。
 * 返回 status-apply 事件。
 */
export function applyStatus(
  char: Character,
  status: StatusInstance,
  opts: { stack?: boolean } = {},
): GameEvent[] {
  if (char.defeated) return [];
  // 免疫特质（防火/隔热/警醒/健壮/灵巧/无坚不摧…）：不施加、不发事件
  // GoW Curse penetrates ordinary immunities. Invulnerable remains the one
  // exception; its trait id is retained on Character for this distinction.
  const invulnerable = char.traitIds?.includes('invulnerable') ?? false;
  if (isImmuneToStatus(char, status.id) && (!isCursed(char) || invulnerable)) return [];

  const existing = char.statuses.find((s) => s.id === status.id);
  const events: GameEvent[] = [];
  // Curse removes positive statuses and resets their recovery chance.
  if (CURSE_STATUS_IDS.has(status.id)) {
    const positives = char.statuses.filter((s) => ['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged'].includes(s.id));
    if (positives.length > 0) {
      char.statuses = char.statuses.filter((s) => !positives.includes(s));
      for (const positive of positives) events.push({ type: 'status-expire', targetId: char.id, statusId: positive.id });
    }
  }
  if (existing) {
    existing.turns = Math.max(existing.turns, status.turns);
    if (status.magnitude !== undefined) {
      existing.magnitude = opts.stack
        ? (existing.magnitude ?? 0) + status.magnitude
        : Math.max(existing.magnitude ?? 0, status.magnitude);
    }
  } else {
    const inst: StatusInstance = { id: status.id, turns: status.turns };
    if (status.magnitude !== undefined) inst.magnitude = status.magnitude;
    char.statuses.push(inst);
  }

  const ev: StatusApplyEvent = {
    type: 'status-apply',
    targetId: char.id,
    statusId: status.id,
    turns: status.turns,
  };
  return [...events, ev];
}

/**
 * 结算单个角色的全部状态（需求 9.2, 9.4, 9.5）：
 *   0. 织网挣脱判定（GoW Web：累计 10%/回合；未传 rng 时不判定不累计，只走正常到期）
 *   1. DoT 状态扣血 → status-tick（含伤害量）；hp≤0 标记阵亡 → defeat
 *   2. 全部状态 turns 递减；归零移除 → status-expire
 * 直接修改角色。返回事件（tick / defeat / expire 按序）。
 */
export function tickStatuses(char: Character, rng?: SeededRNG): GameEvent[] {
  if (char.defeated || char.statuses.length === 0) return [];

  const events: GameEvent[] = [];

  // 0. 自动解除：首次 10%，之后每回合累计 +10%；诅咒下固定按 5% 基准累计。
  if (rng) {
    for (const status of [...char.statuses]) {
      if (status.turns <= 0 || !AUTO_RECOVER_STATUS_IDS.has(status.id)) continue;
      const isWeb = status.id === WEB_STATUS_ID;
      const cursed = isCursed(char);
      const base = cursed || CURSE_STATUS_IDS.has(status.id) ? RECOVERY_CURSED : RECOVERY_BASE;
      const chance = isWeb ? (status.magnitude ?? base) : (status.recoveryChance ?? base);
      if (rng.next() * 100 < chance) {
        char.statuses = char.statuses.filter((s) => s !== status);
        events.push({
          type: 'status-expire',
          targetId: char.id,
          statusId: status.id,
        });
      } else {
        if (isWeb) status.magnitude = Math.min(100, chance + (cursed ? 5 : 10));
        else status.recoveryChance = Math.min(100, chance + (cursed ? 5 : 10));
      }
    }
  }

  // 1. DoT 结算（按状态数组既有顺序，确定性）
  for (const s of char.statuses) {
    if (s.turns <= 0) continue;
    if (DOT_STATUS_IDS.has(s.id)) {
      const dmg = Math.max(0, s.magnitude ?? 0);
      if (dmg > 0) {
        // DoT 直接扣血（跳过护甲，符合中毒/燃烧的持续伤害语义）
        char.hp = Math.max(0, char.hp - dmg);
      }
      const tick: StatusTickEvent = {
        type: 'status-tick',
        targetId: char.id,
        statusId: s.id,
        damage: dmg,
      };
      events.push(tick);
      if (char.hp <= 0 && !char.defeated) {
        char.defeated = true;
        const def: DefeatEvent = { type: 'defeat', characterId: char.id };
        events.push(def);
        break; // 已阵亡，停止后续 DoT
      }
    }
    if (DEATH_MARK_STATUS_IDS.has(s.id) && rng && !char.defeated && rng.next() < 0.1) {
      char.hp = 0;
      char.defeated = true;
      events.push({ type: 'status-tick', targetId: char.id, statusId: s.id });
      events.push({ type: 'defeat', characterId: char.id });
      break;
    }
  }

  // 2. 递减存续并移除到期状态
  const survivors: StatusInstance[] = [];
  for (const s of char.statuses) {
    const remaining = s.turns - 1;
    if (remaining <= 0) {
      const exp: StatusExpireEvent = {
        type: 'status-expire',
        targetId: char.id,
        statusId: s.id,
      };
      events.push(exp);
    } else {
      survivors.push({ ...s, turns: remaining });
    }
  }
  char.statuses = survivors;

  return events;
}

/** 结算整队每个存活角色的状态，按队伍索引顺序（确定性，需求 9.4） */
export function tickTeamStatuses(characters: Character[], rng?: SeededRNG): GameEvent[] {
  const events: GameEvent[] = [];
  for (const ch of characters) {
    events.push(...tickStatuses(ch, rng));
  }
  return events;
}

// —— 状态施加效果原语（供技能原型编排） ——

import type { EffectContext, EffectPrimitive } from './context';

export interface StatusApplyParams {
  /** 目标列表（由 targeting 产出） */
  targets: Character[];
  /** 状态 id */
  statusId: string;
  /** 存续回合 */
  turns: number;
  /** 每层伤害/效果量（可选；最终 magnitude = 每层值 × 层数） */
  magnitude?: number;
  /** 叠加层数（「陷入 2 层流血」「3 次叠加中毒」）：≥2 时同 id 再施加按累加合并 */
  stacks?: number;
}

/**
 * 构建「施加状态」效果原语（需求 9.1；叠层为窗口 B 增量）。
 * 对每个存活目标施加状态并发 status-apply。
 * 叠层语义（SOP 裁定）：最终 magnitude = 每层值 × 层数（bleed 无显式值时每层 1）；
 * 同 id 已存在时按**累加**合并（仅 stacks 路径），非 stacks 施加维持 max 合并。
 */
export function statusEffect(params: StatusApplyParams): EffectPrimitive {
  return {
    apply(_ctx: EffectContext): GameEvent[] {
      const { targets, statusId, turns, magnitude, stacks } = params;
      if (targets.length === 0) return [];
      const layers = Math.max(1, stacks ?? 1);
      const mag = magnitude !== undefined ? magnitude * layers : undefined;
      const stack = stacks !== undefined && stacks > 1;
      const events: GameEvent[] = [];
      for (const target of targets) {
        if (target.defeated) continue;
        const status: StatusInstance =
          mag !== undefined
            ? { id: statusId, turns, magnitude: mag }
            : { id: statusId, turns };
        events.push(...applyStatus(target, status, { stack }));
      }
      return events;
    },
  };
}


export interface CleanseParams {
  targets: Character[];
}

/** Remove every current status from each living target and emit one presentation event. */
export function cleanseEffect(params: CleanseParams): EffectPrimitive {
  return {
    apply(_ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      for (const target of params.targets) {
        if (target.defeated || target.statuses.length === 0) continue;
        const statusIds = target.statuses.map((status) => status.id);
        target.statuses = [];
        const event: StatusCleanseEvent = {
          type: 'status-cleanse',
          targetId: target.id,
          statusIds,
        };
        events.push(event);
      }
      return events;
    },
  };
}

export interface DispelStatusParams {
  /** 目标列表（由 targeting 产出） */
  targets: Character[];
  /** 要驱散的单一状态 id（「驱散其流血效果」） */
  statusId: string;
}

/**
 * 定向驱散单一状态（引擎原语批）：只移除目标身上该 id 的状态，其余状态不动——
 * 与 cleanse（净化全部状态）互补。正面/负面皆可驱（语义由技能文本指定状态决定）。
 * 事件复用既有 status-expire（表现层撤徽章，与到期/挣脱同一路径）；目标没有该状态
 * 时无事发生（无事件）。
 */
export function dispelStatusEffect(params: DispelStatusParams): EffectPrimitive {
  return {
    apply(_ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      for (const target of params.targets) {
        if (target.defeated) continue;
        if (!hasStatus(target, params.statusId)) continue;
        target.statuses = target.statuses.filter((s) => s.id !== params.statusId);
        events.push({ type: 'status-expire', targetId: target.id, statusId: params.statusId });
      }
      return events;
    },
  };
}
