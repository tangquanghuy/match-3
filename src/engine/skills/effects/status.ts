/**
 * 状态效果系统（战斗技能系统 · 需求 9）。
 *
 * 状态生命周期：施加(apply) → 按回合结算(tick) → 到期移除(expire)。
 * 状态实例存于 Character.statuses（需求 9.1）。
 *
 * DoT 类（poison/burning）在结算时对宿主造成伤害并发 status-tick（需求 9.2）。
 * 官方状态无固定回合上限（rulings/R004 取代需求 9.5 的 3 回合倒计时）：负面状态靠共用累积
 * 自愈概率移除，正面状态按各自触发移除；只有非官方的辅助状态仍按 turns 递减到期。
 *
 * 结算时机由 TurnEngine 在固定时机（对即将行动方角色）调用 tickStatuses，保证确定性（需求 9.4）。
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import { isImmuneToStatus, passivesOf } from '../../traits';
import { applyTransformTemplate } from './summon';
import type { SummonTemplate } from './summon';
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
import { isSameMatchType, colorGem, skullGem, PlayerSide } from '../../types';
import type { BaseColor } from '../../types';
import type { SeededRNG } from '../../rng';
import type {
  GameEvent,
  StatusApplyEvent,
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

/**
 * 妖火状态（GoW Faerie Fire，官方语义已核实——官方论坛 + wiki 状态表，
 * 见 GEMS-SEMANTICS-2 ⭐官方数据核验节）：受术者受到的**法术**伤害 +50%
 *（钩在 damageOne 口径：骷髅/普攻不吃，DoT 直扣血也不吃）；每回合累计 10% 自行消退。
 * 施加来源：faerieFireGem 精灵火宝石（被摧毁时）与后续技能桶。
 */
export const FAERIE_FIRE_STATUS_ID = 'faerie-fire';
/** 妖火状态对所受法术伤害的放大倍率（官方 +50%） */
export const FAERIE_FIRE_SPELL_MULT = 1.5;

/**
 * 恐怖状态（GoW Terror，官方状态表语义：每回合开始 10% 几率使目标在队伍列表中
 * 下移一位）。施加来源：terrorGem 恐怖宝石（被匹配时）与后续技能桶。
 * 位次交换在 tickTeamStatuses 落地（那里持有编队数组引用）；无后位则空过不掷签。
 */
export const TERROR_STATUS_ID = 'terror';
/** 恐怖状态每回合使目标下移一位的概率（官方 10%） */
export const TERROR_DROP_CHANCE = 0.1;

/**
 * 赐福状态（GoW Blessed，官方语义已核实——官方帮助中心「All status effects」+ wiki 状态表
 * 交叉，见 GEMS-SEMANTICS-2 ⭐官方数据核验节）：施加时**净化全部负面状态**，存续期间
 * **免疫负面状态**（R011：正面状态照常施加；吞噬/法力燃烧分别在对应入口处理；诅咒例外——
 * 官方「诅咒落在赐福单位上时两者互相抵消」，且诅咒本就穿透普通免疫）。
 * gowhead 数据的施加步骤名为 CauseBlessed；中文数据「赐福/祝福」同义。
 * 无时限（R004）：持有者行动（施法，或作为首位兵种造成骷髅伤害）后移除，见 endActionStatuses。
 */
export const BLESS_STATUS_IDS = new Set(['blessed']);

/**
 * 附魔状态（GoW Enchanted，官方语义已核实——官方帮助中心 + wiki 状态表交叉）：
 * 持有者**每回合开始获得 2 点法力值，直到其施放法术**。无时间上限（R002，tick 不递减）；
 * 移除时机：施放法术（TurnEngine 在效果执行前移除——法术若给自身重新附魔，新实例
 * 不被同一次施法消耗）、驱散或诅咒。
 * 沉默期间不可获得法力（canGainMana 同口径），故 +2 被沉默拦截。
 */
export const ENCHANTED_STATUS_ID = 'enchanted';
/** 附魔每回合开始提供的法力（官方 +2） */
export const ENCHANTED_MANA_PER_TURN = 2;

/**
 * 反射状态（GoW Reflect，官方语义已核实——官方帮助中心「Reflect always does a minimum
 * of 1 damage」+ wiki 状态表「Ends after taking damage once」交叉）：受到的任何伤害
 * **50% 反弹给来源（至少 1 点）**，原伤害照常结算；**受一次伤害后即消失**。
 * gowhead 数据的施加步骤名为 CauseMirror（中文数据译「反射」），本引擎统一用
 * traits.json 既有拼写 `reflect`（mirrorimage/reflectivesurface 特质已以此 id 施加）。
 * 消费点：骷髅普攻（CombatResolver）与法术伤害（damageOne）两处结算末尾；
 * 屏障整发吸收=没被打中，不触发反弹也不消耗。
 */
export const REFLECT_STATUS_ID = 'reflect';
/** 反射比例（官方 50%） */
export const REFLECT_RATIO = 0.5;
/** 反射伤害下限（官方至少 1 点） */
export const REFLECT_MIN = 1;

/** 负面状态 id 全集（赐福净化口径）：负面 + 诅咒族（官方「净化目标」含解除诅咒）。 */
const NEGATIVE_STATUS_IDS = new Set([
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease',
  'curse', 'cursed', 'death-mark', 'death_mark', 'charm', 'charmed', 'mana-burn', 'mana_burn',
  'faerie-fire', 'terror', 'wolf', 'wolf-form', 'lycanthropy',
]);

/**
 * 可自愈负面状态（rulings/R004）：无固定回合上限；持有者回合开始共用**一个**累积自愈
 * 概率（首次 10%，此后每回合 +10%，诅咒在身时每回合 +5%），掷中一次移除全部可自愈负面。
 * 中毒不在此集合（不自愈，只能被净化等效果移除）。
 * 官方状态表（official-status-effects.html：Cursed / Lycanthropy / Bleed 条目）+
 * 社区入库 community-2026-09-28-status-durations.json。
 */
const AUTO_RECOVER_STATUS_IDS = new Set([
  'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'cursed',
  'marked', 'death-mark', 'death_mark',
  'wolf', 'wolf-form', 'lycanthropy', 'charm', 'charmed', 'mana-burn', 'mana_burn',
  'faerie-fire', 'terror',
]);
/** 获得时重置累积自愈概率的负面状态（R004：任何负面状态，含中毒）。 */
const RESETTING_NEGATIVE_STATUS_IDS = new Set([...AUTO_RECOVER_STATUS_IDS, 'poison']);
/** 赐福拦截的状态（R011：只拦负面；诅咒族除外，由诅咒×赐福互消处理）。 */
const BLESSED_BLOCKED_STATUS_IDS: ReadonlySet<string> = new Set(
  [...RESETTING_NEGATIVE_STATUS_IDS, ...NEGATIVE_STATUS_IDS].filter((id) => !CURSE_STATUS_IDS.has(id)),
);
/** R011：该状态是否会被赐福挡下（负面状态，诅咒除外）。 */
export function isBlessedBlockedStatus(statusId: string): boolean {
  return BLESSED_BLOCKED_STATUS_IDS.has(statusId);
}
/**
 * 无时限状态（tick 不递减 turns，R002/R004）：中毒（仅净化解除）、屏障／反射（受一次伤害后
 * 移除）、附魔（施放法术后移除）、狂怒（造成一次骷髅伤害后移除）、潜水／祝福（持有者行动后
 * 移除：施放技能，或作为首位兵种用骷髅造成伤害）。可自愈负面同样不递减（见上）。
 */
const NON_EXPIRING_STATUS_IDS = new Set([
  'poison', 'barrier', 'enchanted', 'reflect', 'rage', 'enraged', 'submerged', 'blessed',
]);
/**
 * 该状态是否仍按 turns 倒计时（只读查询，供表现层决定是否显示「剩余 N 回合」）。
 * 官方状态（无时限 / 累积自愈）返回 false——它们的 turns 字段不代表剩余回合。
 */
export function statusCountsDown(statusId: string): boolean {
  return !NON_EXPIRING_STATUS_IDS.has(statusId) && !AUTO_RECOVER_STATUS_IDS.has(statusId);
}

/** 该状态是否参与累积自愈（负面，中毒除外）。 */
export function isRecoverableStatus(statusId: string): boolean {
  return AUTO_RECOVER_STATUS_IDS.has(statusId);
}

/**
 * 下一次回合开始的累积自愈概率（%，与 tickStatuses 同口径：可自愈实例 recoveryChance 的最小值，
 * 缺省 10%）。无可自愈负面时返回 null。只读，不改状态。
 */
export function statusRecoveryChance(char: Pick<Character, 'statuses'>): number | null {
  const recoverable = char.statuses.filter((s) => s.turns > 0 && AUTO_RECOVER_STATUS_IDS.has(s.id));
  if (recoverable.length === 0) return null;
  return Math.min(...recoverable.map((s) => s.recoveryChance ?? RECOVERY_BASE));
}

/** 持有者行动（施法／首位骷髅伤害）即移除的正面状态（R004）。 */
export const ACTION_ENDED_STATUS_IDS: ReadonlySet<string> = new Set(['submerged', 'blessed']);
const RECOVERY_BASE = 10;
const RECOVERY_STEP = 10;
const RECOVERY_STEP_CURSED = 5;

/**
 * 移除持有者因「行动」而结束的正面状态（潜水、祝福，R004）。返回 status-expire 事件。
 * 调用点：TurnEngine 施法（效果执行前）、CombatResolver 首位骷髅伤害成立后。
 */
export function endActionStatuses(char: Character): GameEvent[] {
  const ended = char.statuses.filter((s) => ACTION_ENDED_STATUS_IDS.has(s.id));
  if (ended.length === 0) return [];
  char.statuses = char.statuses.filter((s) => !ACTION_ENDED_STATUS_IDS.has(s.id));
  return ended.map((s): StatusExpireEvent => ({ type: 'status-expire', targetId: char.id, statusId: s.id, reason: 'action' }));
}

/** Compatibility export: no status currently prevents selection. Stealthy is a
 * trait; Submerged instead avoids whole-team spell damage (damageEffect).
 * Official status rule: infinityplus2.freshdesk.com/support/solutions/articles/150000208274
 */
export const UNTARGETABLE_STATUS_IDS = new Set<string>();

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
 *   - frozen   冰冻：官方=冻结色的4/5连及受冻结单位施法不给额外回合；施法、攻击、充能照常。
 *   - silence  沉默：官方=不可施法、不可获得法力。一致。
 *   - stun     击晕：官方=禁用全部特质。passivesOf/activeTraitIds 屏蔽全部特质。
 * 织网（web）不是控制类——不禁行动，只锁魔力，见 WEB_STATUS_ID。
 */
export const CONTROL_STATUS_IDS = new Set(['silence', 'frozen', 'entangle']);

/**
 * 织网状态 id（GoW Web，官方语义）：
 *   - 魔力归零：技能数值只剩基础项（`casterMagic()` 对织网角色按 0 计）；
 *   - 无法获得魔力值增益（buff/特质触发在施加口拦截）；
 *   - 与其他可自愈负面共用累积自愈概率（首回合 10%，之后每回合 +10%，R004）；
 *   - 无固定回合上限（R004）。
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

/** Mana Drain/Steal are blocked by Blessed, Mana Shield and Invulnerable.
 * Impervious alone protects Mana Burn, not Mana Drain. Ordinary trait immunity
 * is bypassed by Curse or Stun; Invulnerable is retained. */
export function isImmuneToManaDrain(char: Character): boolean {
  if (hasStatus(char, 'blessed') || char.traitIds?.includes('invulnerable')) return true;
  return !!passivesOf(char).manaOpsImmunity && !isCursed(char) && !isStunned(char);
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
  // Official Stun disables traits; status-granted invisibility is independent.
  if (!hasStatus(char, 'stun') && passivesOf(char).untargetable) return true;
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
    reason: 'consumed',
  };
  return { consumed: true, events: [ev] };
}

/** Official 4.5 patch: Reflect is floor(50% damage), minimum 1. */
export function reflectDamageAmount(damageTaken: number): number {
  return Math.max(REFLECT_MIN, Math.floor(damageTaken * REFLECT_RATIO));
}

/**
 * 消耗反射：带反射则立即移除并返回 status-expire 事件（官方「受一次伤害后结束」）。
 * 调用方在结算完反弹伤害后调用；屏障整发吸收（没被打中）不得调用。
 */
export function consumeReflect(char: Character): GameEvent[] {
  if (!hasStatus(char, REFLECT_STATUS_ID)) return [];
  char.statuses = char.statuses.filter((s) => s.id !== REFLECT_STATUS_ID);
  const ev: StatusExpireEvent = {
    type: 'status-expire',
    targetId: char.id,
    statusId: REFLECT_STATUS_ID,
    reason: 'consumed',
  };
  return [ev];
}

/**
 * 该角色当前能否释放技能：
 * 沉默限制施法；冰冻限制额外回合，仍可施法。击晕、缠绕不限制施法。
 */
export function canCastSkill(char: Character): boolean {
  return !isSilenced(char);
}

/**
 * 该角色当前能否发动普通（骷髅）攻击：
 * 缠绕使攻击力为零（以攻击落空表达）；冰冻和击晕不限制攻击。
 */
export function canAttack(char: Character): boolean {
  return !isEntangled(char);
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
  // 赐福（GoW Blessed，rulings/R011）：存续期间只免疫**负面**状态；正面状态（屏障、附魔、
  // 反射、狂怒、潜水、赐福自身）照常施加。诅咒放行——官方「诅咒落在赐福单位上时两者互相
  // 抵消」，且诅咒本就穿透普通免疫（见下方 curse 分支的互消处理）。
  // 拦截不改变状态，只发 status-blocked 演出元数据（表现层飘「免疫」）。
  if (isBlessedBlockedStatus(status.id) && hasStatus(char, 'blessed')) {
    return [{ type: 'status-blocked', targetId: char.id, statusId: status.id, reason: 'blessed' }];
  }
  // 免疫特质（防火/隔热/警醒/健壮/灵巧/无坚不摧…）：不施加
  // GoW Curse penetrates ordinary immunities. Invulnerable remains the one
  // exception; its trait id is retained on Character for this distinction.
  const invulnerable = char.traitIds?.includes('invulnerable') ?? false;
  if (isImmuneToStatus(char, status.id) && (invulnerable || (!isCursed(char) && !isStunned(char) && !CURSE_STATUS_IDS.has(status.id)))) {
    return [{ type: 'status-blocked', targetId: char.id, statusId: status.id, reason: 'immune' }];
  }

  const cancelledByOpposite = (CURSE_STATUS_IDS.has(status.id) && char.statuses.some(s => BLESS_STATUS_IDS.has(s.id) && s.turns > 0))
    || (BLESS_STATUS_IDS.has(status.id) && isCursed(char));
  const existing = char.statuses.find((s) => s.id === status.id);
  const events: GameEvent[] = [];
  // Curse removes positive statuses and resets their recovery chance.
  if (CURSE_STATUS_IDS.has(status.id)) {
    // 诅咒 × 赐福互相抵消（官方状态表）：诅咒落在赐福单位上时同时移除赐福。
    const blessed = char.statuses.filter((s) => BLESS_STATUS_IDS.has(s.id));
    if (blessed.length > 0) {
      char.statuses = char.statuses.filter((s) => !blessed.includes(s));
      for (const inst of blessed) events.push({ type: 'status-expire', targetId: char.id, statusId: inst.id, reason: 'stripped' });
    }
    const positives = char.statuses.filter((s) => POSITIVE_STATUS_IDS.includes(s.id));
    if (positives.length > 0) {
      char.statuses = char.statuses.filter((s) => !positives.includes(s));
      for (const positive of positives) events.push({ type: 'status-expire', targetId: char.id, statusId: positive.id, reason: 'stripped' });
    }
  }
  // 赐福施加时净化全部负面状态（官方「cleanses the affected Troop」；诅咒同属被净化对象）。
  if (BLESS_STATUS_IDS.has(status.id)) {
    const negatives = char.statuses.filter((s) => NEGATIVE_STATUS_IDS.has(s.id));
    if (negatives.length > 0) {
      char.statuses = char.statuses.filter((s) => !negatives.includes(s));
      for (const negative of negatives) events.push({ type: 'status-expire', targetId: char.id, statusId: negative.id, reason: 'cleansed' });
    }
  }
  // Applying either member cancels the opposite status; the incoming member
  // is not retained after its dispel/cleanse action.
  if (cancelledByOpposite) return events;
  // R004：获得（新施加或再次施加）任何负面状态 → 共用累积自愈概率重置为 10%。
  // 出血例外：官方只在第 4 层之后再叠才重置（见下方 bleed 分支）。
  if (RESETTING_NEGATIVE_STATUS_IDS.has(status.id) && !(status.id === 'bleed' && existing)) {
    for (const s of char.statuses) s.recoveryChance = undefined;
  }
  if (existing) {
    existing.turns = Math.max(existing.turns, status.turns);
    if (DEATH_MARK_STATUS_IDS.has(status.id)) existing.graceTicks = 1;
    if (status.id === 'bleed') {
      // GoW Bleed stacks on every application (even a single layer), up to four.
      const oldStacks = existing.magnitude ?? 1;
      existing.magnitude = Math.min(4, Math.max(0, oldStacks) + Math.max(1, status.magnitude ?? 1));
      // A fifth Bleed application refreshes the accumulated cleanse chance.
      if (oldStacks >= 4) existing.recoveryChance = undefined;
    } else if (status.magnitude !== undefined) {
      existing.magnitude = opts.stack
        ? (existing.magnitude ?? 0) + status.magnitude
        : Math.max(existing.magnitude ?? 0, status.magnitude);
    }
  } else {
    const inst: StatusInstance = { id: status.id, turns: status.turns };
    if (DEATH_MARK_STATUS_IDS.has(status.id)) inst.graceTicks = 1;
    if (status.id === 'bleed') inst.magnitude = Math.min(4, Math.max(1, status.magnitude ?? 1));
    else if (status.magnitude !== undefined) inst.magnitude = status.magnitude;
    char.statuses.push(inst);
  }

  const ev: StatusApplyEvent = {
    type: 'status-apply',
    targetId: char.id,
    statusId: status.id,
    turns: status.turns,
  };
  // 演出元数据：出血层数 + 刷新/叠层标记（仅在有意义时出现，普通新挂事件形态不变）
  if (status.id === 'bleed') ev.stacks = char.statuses.find((s) => s.id === 'bleed')?.magnitude ?? 1;
  if (existing) ev.refreshed = true;
  return [...events, ev];
}

/**
 * 结算单个角色的全部状态（需求 9.2, 9.4, 9.5）：
 *   0. 织网挣脱判定（GoW Web：累计 10%/回合；未传 rng 时不判定不累计，只走正常到期）
 *   1. DoT 状态扣血 → status-tick（含伤害量）；hp≤0 标记阵亡 → defeat
 *   2. 全部状态 turns 递减；归零移除 → status-expire
 * 直接修改角色。返回事件（tick / defeat / expire 按序）。
 */
export function tickStatuses(
  char: Character, rng?: SeededRNG, lycanthropyTemplate?: () => SummonTemplate | null,
): GameEvent[] {
  if (char.defeated || char.fled || char.statuses.length === 0) return [];

  const events: GameEvent[] = [];

  // 0. 累积自愈（rulings/R004）：全部可自愈负面共用一个概率，每回合只掷一次。
  //    概率 = 各实例 recoveryChance 的最小值（缺省 10%；新获得负面状态时被清空 = 重置）。
  //    掷中 → 一次移除全部可自愈负面；未中 → 所有实例 +10%（诅咒在身 +5%），上限 100%。
  if (rng) {
    const recoverable = char.statuses.filter((s) => s.turns > 0 && AUTO_RECOVER_STATUS_IDS.has(s.id));
    if (recoverable.length > 0) {
      const chance = Math.min(...recoverable.map((s) => s.recoveryChance ?? RECOVERY_BASE));
      if (rng.next() * 100 < chance) {
        char.statuses = char.statuses.filter((s) => !recoverable.includes(s));
        for (const status of recoverable) {
          events.push({ type: 'status-expire', targetId: char.id, statusId: status.id, reason: 'recovered' });
        }
      } else {
        const next = Math.min(100, chance + (isCursed(char) ? RECOVERY_STEP_CURSED : RECOVERY_STEP));
        for (const status of recoverable) status.recoveryChance = next;
      }
    }
  }

  // Each turn with active Lycanthropy has a 15% Beast-transformation roll.
  // Recovering from the status above preempts this roll.
  if (rng && lycanthropyTemplate && char.statuses.some(s => s.turns > 0 && WOLF_STATUS_IDS.has(s.id))
    && rng.next() < 0.15) {
    const template = lycanthropyTemplate();
    if (template) {
      for (const status of char.statuses) {
        events.push({ type: 'status-expire', targetId: char.id, statusId: status.id, reason: 'transform' });
      }
      applyTransformTemplate(char, template);
      events.push({ type: 'troop-transform', targetId: char.id, name: template.name });
      return events;
    }
  }

  // 0.5 附魔（GoW Enchanted）：持有者回合开始 +2 法力（上限夹取在 manaCost）；
  // 沉默期间不可获得法力（canGainMana 同口径）。走 buff 事件让表现层显示法力跳动。
  if (hasStatus(char, ENCHANTED_STATUS_ID) && !isSilenced(char)) {
    const before = char.mana;
    char.mana = Math.min(char.manaCost, char.mana + ENCHANTED_MANA_PER_TURN);
    const gained = char.mana - before;
    if (gained > 0) events.push({ type: 'buff', targetId: char.id, stat: 'mana', amount: gained });
  }

  // 1. DoT 结算（按状态数组既有顺序，确定性）
  for (const s of char.statuses) {
    if (s.turns <= 0) continue;
    if (DOT_STATUS_IDS.has(s.id)) {
      // The original status rules differ for each DoT; magnitude on Poison and
      // Burning was legacy fixture data, not a damage multiplier in GoW.
      const raw = s.id === 'poison'
        ? (rng && rng.next() < 0.5 ? 1 : 0)
        : s.id === 'burning' ? 3
        : [0, 1, 3, 6, 10][Math.min(4, Math.max(1, s.magnitude ?? 1))];
      let damage = 0;
      let armorDamage = 0;
      if (raw > 0) {
        const barrier = consumeBarrier(char);
        if (barrier.consumed) events.push(...barrier.events);
        else if (s.id === 'burning') {
          armorDamage = Math.min(char.armor, raw);
          char.armor -= armorDamage;
          damage = raw - armorDamage;
          char.hp = Math.max(0, char.hp - damage);
        } else {
          damage = Math.min(char.hp, raw);
          char.hp -= damage;
        }
      }
      events.push({ type: 'status-tick', targetId: char.id, statusId: s.id, damage, ...(armorDamage > 0 ? { armorDamage } : {}) });
      if (char.hp <= 0 && !char.defeated) {
        char.defeated = true;
        const def: DefeatEvent = { type: 'defeat', characterId: char.id };
        events.push(def);
        break;
      }
    }
    if (DEATH_MARK_STATUS_IDS.has(s.id) && (s.graceTicks ?? 0) > 0) {
      s.graceTicks!--;
      continue;
    }
    if (DEATH_MARK_STATUS_IDS.has(s.id) && rng && !char.defeated && rng.next() < 0.1) {
      char.hp = 0;
      char.defeated = true;
      events.push({ type: 'status-tick', targetId: char.id, statusId: s.id });
      events.push({ type: 'defeat', characterId: char.id });
      break;
    }
  }

  // 已在本次结算中阵亡：不再发任何到期事件（defeat 之后不应再有该单位的状态演出）
  if (char.defeated) return events;

  // 2. 递减存续并移除到期状态
  const survivors: StatusInstance[] = [];
  for (const s of char.statuses) {
    // R002/R004: no hard turn cap for official statuses. Poison stays until
    // cleansed; recoverable negatives end only via the cumulative roll above;
    // positive statuses end on their trigger (damage / cast / skull hit / action).
    // Only non-official helper statuses keep the legacy turns countdown.
    const remaining = NON_EXPIRING_STATUS_IDS.has(s.id) || AUTO_RECOVER_STATUS_IDS.has(s.id)
      ? s.turns : s.turns - 1;
    if (remaining <= 0) {
      const exp: StatusExpireEvent = {
        type: 'status-expire',
        targetId: char.id,
        statusId: s.id,
        reason: 'expired',
      };
      events.push(exp);
    } else {
      survivors.push({ ...s, turns: remaining });
    }
  }
  char.statuses = survivors;

  return events;
}

/**
 * 恐怖状态的队伍位次 tick（官方语义：每回合开始 10% 几率使目标下移一位）：
 * 按编队数组序逐个判定，命中即与后一位交换（下移=靠后，骷髅伤害/队首目标更晚打到他）。
 * 无后位、或后位已阵亡则空过**不掷签**（与织网挣脱同款护栏：状态不在场零随机消耗）。
 * 事件复用既有 status-tick（无 damage 字段 = 表现层按状态徽记闪动处理），不新增事件类型。
 */
function tickTerrorRoster(characters: Character[], rng: SeededRNG, player: PlayerSide): GameEvent[] {
  const events: GameEvent[] = [];
  const checked = new Set<number>();
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (ch.defeated || !hasStatus(ch, TERROR_STATUS_ID) || checked.has(ch.id)) continue;
    checked.add(ch.id);
    if (rng.next() >= TERROR_DROP_CHANCE) continue;
    events.push({ type: 'status-tick', targetId: ch.id, statusId: TERROR_STATUS_ID });
    if (i === characters.length - 1) {
      // At the final position Terror causes a Flee, not a death. Reuse the
      // existing flee resolution pipeline (no death triggers or resurrection).
      ch.fled = true;
      events.push({ type: 'flee', characterId: ch.id, player, hp: ch.hp, armor: ch.armor });
      // Leave the unit in the roster until resolveDefeatEvents processes the
      // flee event, so a queued summon can occupy its newly freed slot.
    } else if (!characters[i + 1].defeated) {
      characters[i] = characters[i + 1];
      characters[i + 1] = ch;
      // 编队已改：发调位事件让侧边卡列同步滑动（否则卡面顺序与引擎队首不一致）
      events.push({ type: 'troop-reposition', targetId: ch.id, to: 'back', index: i + 1 });
    }
  }
  return events;
}

/** 结算整队每个存活角色的状态，按队伍索引顺序（确定性，需求 9.4） */
export function tickTeamStatuses(
  characters: Character[], rng?: SeededRNG, player: PlayerSide = PlayerSide.Left,
  lycanthropyTemplate?: () => SummonTemplate | null,
): GameEvent[] {
  const events: GameEvent[] = [];
  // 恐怖位次交换先于逐角色 DoT/到期结算（同一回合窗口内，顺序固定保证确定性）
  if (rng) events.push(...tickTerrorRoster(characters, rng, player));
  for (const ch of characters) {
    const ticks = tickStatuses(ch, rng, lycanthropyTemplate);
    for (const event of ticks) if (event.type === 'troop-transform') event.sourceSide = player;
    events.push(...ticks);
  }
  return events;
}

// —— 状态施加效果原语（供技能原型编排） ——

import type { EffectContext, EffectPrimitive } from './context';
import { findSide } from './context';
import { modifierBonus } from './secondary';

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
  /**
   * 逐颗宝石驱动施加（原语 Wave4 批，官方 7463 Infernal Drill「Destroy…InflictEffect
   * OnRandomTroops AllAllies barrier UseCounterForAmount」/ 9287 / 8804 Poison Stone 族）：
   * 给出时改变施加编排——施加次数 = 本次施放被摧毁的该类宝石数（castTracking.destroyed
   * 现有口径；color 筛基色含归属色特殊宝石，'skull' 筛骷髅族，缺省不筛即全部被摧毁宝石），
   * 每次从 targets 存活池中随机取一名施加（rng 逐次掷、可重复同目标，次数用尽为止）。
   * targets 语义随之从「逐个施加」变为「随机候选池」（官方 InflictEffectOnRandomTroops）。
   */
  perDestroyed?: { color?: BaseColor | 'skull' };
  /**
   * 计数驱动施加（R22 批，官方「每有一名X则赋予一名随机盟友/敌人Y」族——8427 受诅咒敌人
   * → 屏障、9252 红色盟友 → 恐怖、9287 鬼魂宝石 → 屏障、9341 每 10 黄金 → 疾病）：
   * 给出时施加次数 = modifierBonus(perCount)（mod+source 全套，支持 ratio——「每有 10 黄金」
   * = { ratio 10:1, source battleGold }），每次从 targets 存活池随机取一名（可重复，rng 逐次掷）。
   * targets 语义同 perDestroyed = 「随机候选池」。计数 ≤ 0 → 零事件零 rng。
   */
  perCount?: import('./secondary').ModifierSpec;
}

/** 与 destroyed 追踪比对用的宝石类型匹配（secondary.matchGem 同口径：色含归属色特殊宝石） */
function matchDestroyed(gemType: import('../../types').GemType, color: BaseColor | 'skull' | undefined): boolean {
  if (color === undefined) return true;
  return isSameMatchType(gemType, color === 'skull' ? skullGem() : colorGem(color));
}

/**
 * 构建「施加状态」效果原语（需求 9.1；叠层为窗口 B 增量）。
 * 对每个存活目标施加状态并发 status-apply。
 * 叠层语义（SOP 裁定）：最终 magnitude = 每层值 × 层数（bleed 无显式值时每层 1）；
 * 同 id 已存在时按**累加**合并（仅 stacks 路径），非 stacks 施加维持 max 合并。
 * perDestroyed（Wave4 批）：施加次数改为「本次施放被摧毁的该类宝石数」，每次随机取
 * 存活目标池一名（可重复）；计数为 0 → 无事件且不消耗 rng（护栏同无新键零事件零随机）。
 */
export function statusEffect(params: StatusApplyParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const { targets, statusId, turns, magnitude, stacks } = params;
      if (targets.length === 0) return [];
      const layers = Math.max(1, stacks ?? 1);
      const mag = magnitude !== undefined ? magnitude * layers : undefined;
      const stack = stacks !== undefined && stacks > 1;
      const events: GameEvent[] = [];

      // 计数驱动施加（R22 批）：施加次数 = 来源计数折算（支持 ratio），目标 = 存活池逐次随机
      if (params.perCount) {
        const count = modifierBonus(params.perCount, ctx);
        const pool = targets.filter((t) => !t.defeated);
        if (count <= 0 || pool.length === 0) return [];
        for (let i = 0; i < count; i++) {
          const target = pool[ctx.rng.nextInt(pool.length)];
          const status: StatusInstance =
            mag !== undefined ? { id: statusId, turns, magnitude: mag } : { id: statusId, turns };
          events.push(...applyStatus(target, status, { stack }));
        }
        return events;
      }

      // 逐颗宝石驱动施加（Wave4）：施加次数 = 被摧毁计数，目标 = 存活池逐次随机
      if (params.perDestroyed) {
        const count = (ctx.castTracking?.destroyed ?? [])
          .filter((d) => matchDestroyed(d.gemType, params.perDestroyed!.color)).length;
        const pool = targets.filter((t) => !t.defeated);
        if (count <= 0 || pool.length === 0) return [];
        for (let i = 0; i < count; i++) {
          const target = pool[ctx.rng.nextInt(pool.length)];
          const status: StatusInstance =
            mag !== undefined ? { id: statusId, turns, magnitude: mag } : { id: statusId, turns };
          events.push(...applyStatus(target, status, { stack }));
        }
        return events;
      }

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



/**
 * 随机状态效果（「造成随机状态效果」/ 官方 RandomStatusEffect 敌方分支）的负面池：施加给敌方阵营。
 * L2-random-status-pools：按已入库 official-status-effects.html 的负面状态全集（15 项，等概率）；
 * Charm 不在官方状态表内，已剔除；补入 Faerie Fire、Hunter's Mark（marked）、Lycanthropy、Terror。
 */
export const RANDOM_NEGATIVE_STATUS_POOL: readonly string[] = [
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'death-mark',
  'faerie-fire', 'marked', 'lycanthropy', 'terror',
];

/**
 * 随机状态的正面池：施加给盟友阵营（官方 RandomPositiveStatusEffect 与「随机状态效果」盟友分支）。
 * L2-random-status-pools：官方状态表的 6 个正面状态，各一次（等概率）；Enrage 只用规范 id
 * 'enraged'，不再经 'rage' 别名双倍权重。
 */
export const RANDOM_POSITIVE_STATUS_POOL: readonly string[] = [
  'barrier', 'blessed', 'enchanted', 'enraged', 'reflect', 'submerged',
];

/**
 * 正面状态 id 全集（原语 Wave3 批，官方 RandomPositiveStatusEffect——Book of Secrets 8369
 * 「Cause a random status effect on all Enemies or Allies」的盟友分支步骤
 * {Target: AllAllies, Type: RandomPositiveStatusEffect}）：与 traits.ts 的
 * POSITIVE_STATUS_IDS 同集（净化口径的正面状态；traits 内为私有常量，此处镜像、
 * 改动需两处同步）。仅作净化/驱散的「正面」判定集（含 rage 别名）；随机掷签一律用
 * RANDOM_POSITIVE_STATUS_POOL（L2-random-status-pools，官方 6 项各一次）。
 */
export const POSITIVE_STATUS_IDS: readonly string[] = [
  'barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged',
];

export interface RandomStatusParams {
  targets: Character[];
  /** 存续回合数（缺省 3，与 statusEffect 同口径） */
  turns?: number;
  /** 每目标连续施加的随机状态个数（「使其陷入 3 个随机状态效果」= 3；缺省 1） */
  times?: number;
  allPositive?: boolean;
  /**
   * 池强制（原语 Wave3 批）：'positive' = 正面池 RANDOM_POSITIVE_STATUS_POOL
   * （官方 RandomPositiveStatusEffect 步骤），无视目标阵营；缺省按目标阵营选池
   * （盟友=正面池、敌方=负面池，2026-09-17 回收批口径不变）。
   */
  pool?: 'positive';
}

/**
 * 随机状态（用户裁定 2026-09-17：盟友=正面池、敌方=负面池）：对每个存活目标掷签施加。
 * times > 1 时逐次独立掷签（可重复同一状态，走 applyStatus 合并口径）。
 * pool:'positive' 强制正面全集（官方 RandomPositiveStatusEffect，Wave3 批）。
 * DoT 量级走引擎默认（中毒/燃烧 3、出血 1，由 tick 结算侧的缺省口径接管）。
 */
export function randomStatusEffect(params: RandomStatusParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      const mySide = findSide(ctx.state, ctx.casterId);
      for (const target of params.targets) {
        if (target.defeated) continue;
        const negative = mySide !== null && findSide(ctx.state, target.id) !== mySide;
        // pool:'positive' 强制正面池（无视阵营）；POSITIVE_STATUS_IDS 含 rage 别名，不能直接作掷签池
        const pool = params.pool === 'positive'
          ? RANDOM_POSITIVE_STATUS_POOL
          : negative ? RANDOM_NEGATIVE_STATUS_POOL : RANDOM_POSITIVE_STATUS_POOL;
        if (params.allPositive) {
          // Blessed blocks subsequently applied statuses: grant it last. 'rage' is an
          // alias of 'enraged' (RAGE_STATUS_IDS): grant Enrage once (L5-007).
          for (const statusId of [...POSITIVE_STATUS_IDS.filter(id => id !== 'blessed' && id !== 'rage'), 'blessed']) {
            events.push(...applyStatus(target, { id: statusId, turns: params.turns ?? 3 }));
          }
          continue;
        }
        const times = Math.max(1, params.times ?? 1);
        for (let i = 0; i < times; i++) {
          const statusId = pool[ctx.rng.nextInt(pool.length)];
          const status: StatusInstance = { id: statusId, turns: params.turns ?? 3 };
          events.push(...applyStatus(target, status));
        }
      }
      return events;
    },
  };
}

export interface CleanseParams {
  targets: Character[];
}

/**
 * Cleanse (R002, official status guide): remove every **negative** status from each
 * living target; positive statuses (POSITIVE_STATUS_IDS: Barrier, Enchanted, …) are kept.
 * Same rule as traits.ts cleanseNegative. One presentation event per target with removals.
 */
export function cleanseEffect(params: CleanseParams): EffectPrimitive {
  return {
    apply(_ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      const positive = new Set(POSITIVE_STATUS_IDS);
      for (const target of params.targets) {
        if (target.defeated || target.statuses.length === 0) continue;
        const statusIds = target.statuses.filter((s) => !positive.has(s.id)).map((status) => status.id);
        if (statusIds.length === 0) continue;
        target.statuses = target.statuses.filter((s) => positive.has(s.id));
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
        events.push({ type: 'status-expire', targetId: target.id, statusId: params.statusId, reason: 'dispelled' });
      }
      return events;
    },
  };
}

