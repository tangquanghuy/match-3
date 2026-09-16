/**
 * 二次缩放效果（窗口 B · 五机制之一，`scripts/spell-rules.md` §二次缩放）。
 *
 * 技能数值可随「战场实际资源数」二次缩放，官方文本以方括号尾标记表达：
 *   - [xN]（multiplier）：每 1 个来源 +N            → 加成 = N × 来源数
 *   - [N:M]（ratio）：每 N 个来源 +M               → 加成 = M × floor(来源数 / N)
 * 加成**叠加**在基础数值之上（base_value + 加成），不是乘法关系；
 * 来源数为 0 时加成为 0，数值退化为普通一次缩放（DoD 边界：无资源 → 0 加成/1 倍）。
 *
 * 来源计数全部在效果段执行时从 ctx 现场读取（棋盘/队伍/跨段追踪），保证确定性：
 * 相同状态 + 种子 → 相同来源数 → 相同事件流。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import { isSameMatchType, colorGem, skullGem } from '../../types';
import type { SpecialGemKind, SkullStormDropKind } from '../../types';
import type { BaseColor, Character } from '../../types';
import type { SecondaryModifier } from '../scaling';
import type { EffectContext } from './context';
import { findCharacter, findSide } from './context';

/**
 * 二次缩放来源。color 字段为 undefined 表示不筛颜色（任意色/全体）。
 */
export type ModifierSource =
  /** 本技能前序段直接摧毁（destroy/explode）的宝石数，可筛颜色 */
  | { kind: 'destroyedGems'; color?: BaseColor }
  /** 本技能前序段直接转化（transform）的宝石数，可筛颜色（按转化后的颜色计） */
  | { kind: 'transformedGems'; color?: BaseColor }
  /** 当前棋盘上某色宝石数（在段执行时刻读取） */
  | { kind: 'boardGems'; color?: BaseColor }
  /** 当前棋盘上的骷髅头数（含末日族，经 isSameMatchType 同族判定） */
  | { kind: 'boardSkulls' }
  /** 当前棋盘上指定种类的特殊宝石数（「因炸弹宝石数而增强」） */
  | { kind: 'boardSpecial'; gem: SpecialGemKind }
  /** 施法者自身属性（hp=当前生命；missingHp=已损失生命） */
  | { kind: 'selfStat'; stat: 'attack' | 'armor' | 'hp' | 'missingHp' | 'magic' }
  /** 某方存活人数（ally=施法方含自身；enemy=敌方） */
  | { kind: 'teamSize'; side: 'ally' | 'enemy' }
  /** 施法方指定种族的存活盟友数 */
  | { kind: 'alliesOfRace'; race: string }
  /** 施法方关联指定法力色的存活盟友数（「因蓝色盟友数而增强」） */
  | { kind: 'alliesOfColor'; color: BaseColor }
  /** 敌方处于指定状态的存活人数 */
  | { kind: 'enemyStatusCount'; statusId: string }
  /** 己方处于指定状态的存活人数（「因下潜的盟友数而增强」） */
  | { kind: 'allyStatusCount'; statusId: string }
  /** 敌方全体的某属性总和（hp=当前生命） */
  | { kind: 'enemyStatSum'; stat: 'attack' | 'armor' | 'hp' | 'magic' }
  /** 施法方全体的某属性总和（hp=当前生命） */
  | { kind: 'allyStatSum'; stat: 'attack' | 'armor' | 'hp' | 'magic' }
  /** 最近目标段的当前主目标属性 */
  | { kind: 'targetStat'; stat: 'attack' | 'armor' | 'hp' | 'magic' }
  /** 本技能前序段耗掉的敌方法力总和 */
  | { kind: 'drainedMana' }
  /** 战场经济池当前金币总数（「伤害因我的金币而增强」「数量等于我的金币」） */
  | { kind: 'battleGold' }
  /** 战场经济池当前灵魂总数（「因本战斗收集的灵魂数而增强」） */
  | { kind: 'battleSouls' }
  /** 战场经济池当前宝石（钻石）总数 */
  | { kind: 'battleGems' };

/** 二次缩放规格：解析出的 [xN]/[N:M] + 来源，段定义里以纯数据存在（可 JSON 化） */
export interface ModifierSpec {
  mod: SecondaryModifier;
  /** 单来源。多来源句式（「因蓝色宝石和盟友数而增强」）用 sources，计数相加 */
  source?: ModifierSource;
  /** 多来源（与 source 二选一；两处都写时以 sources 为准） */
  sources?: ModifierSource[];
}

/** 某角色是否具有指定种族/类型 */
export function hasTroopType(char: Character, race: string): boolean {
  return (char.troopTypes ?? []).includes(race);
}

/** 种族条件倍数：raceDouble 段的放大倍率（默认 ×2，「翻 3 倍」= 3） */
export const DEFAULT_RACE_DOUBLE = 2;

/**
 * 条件倍率/条件触发的条件规格（窗口 B · 第二批词汇）。
 * 「如果敌人是恶魔/使用红色法力/已陷入沉默，则造成 N 倍伤害」「若自身生命值受损…」
 * 「如果板面上有 ≥N 颗X色宝石…」「如果敌方有X族军队…」。
 * target* 类条件按受击/受益目标逐个判定；其余为施法全局条件。
 */
export type Condition =
  | { kind: 'targetRace'; race: string }
  | { kind: 'targetColor'; color: BaseColor }
  | { kind: 'targetStatus'; statusId: string }
  | { kind: 'targetHpDamaged' }
  | { kind: 'selfHpDamaged' }
  | { kind: 'boardAtLeast'; color?: BaseColor; n: number }
  | { kind: 'enemyRacePresent'; race: string }
  | { kind: 'allyRacePresent'; race: string }
  /** 任一存活敌人带有该状态即真（「若有(一名)敌人陷入X状态」，全局条件整段判定） */
  | { kind: 'anyEnemyStatus'; statusId: string }
  /** 任一存活盟友（含施法者）带有该状态即真（全局条件） */
  | { kind: 'anyAllyStatus'; statusId: string }
  /**
   * 风暴在场（「若存在/正在进行(冰/骸骨…)风暴」，全局条件）：读双方 team.storm。
   * color 筛颜色风暴（骷髅系风暴的 color 仅是指示器主色，按 dropKind 判定更准）；
   * dropKind 筛骷髅系（骸骨='skull'/末日='doomSkull'/超级末日='uberDoomSkull'）；
   * 两者都缺省 = 任意风暴在场。两者同给时需同时满足。
   */
  | { kind: 'stormPresent'; color?: BaseColor; dropKind?: SkullStormDropKind }
  /** 析取（「若敌人是兽人或恶魔」）：任一子条件成立即成立 */
  | { kind: 'anyOf'; of: Condition[] }
  /** 合取：全部子条件成立才成立 */
  | { kind: 'allOf'; of: Condition[] };

export interface CondMult {
  times: number;
  cond: Condition;
}

/** 条件是否成立（target 类需传目标；全局类忽略 target） */
export function conditionMet(
  cond: Condition,
  ctx: EffectContext,
  target?: Character,
): boolean {
  switch (cond.kind) {
    case 'targetRace':
      return !!target && hasTroopType(target, cond.race);
    case 'targetColor':
      return !!target && target.colors.includes(cond.color);
    case 'targetStatus':
      return !!target && target.statuses.some((s) => s.id === cond.statusId && s.turns > 0);
    case 'targetHpDamaged':
      return !!target && target.hp < target.maxHp;
    case 'selfHpDamaged': {
      const caster = findCharacter(ctx.state, ctx.casterId);
      return !!caster && caster.hp < caster.maxHp;
    }
    case 'boardAtLeast': {
      let n = 0;
      ctx.state.board.forEach((gem) => {
        if (!gem) return;
        if (cond.color) {
          if (gem.type.kind === 'color' && gem.type.color === cond.color) n += 1;
        } else if (gem.type.kind === 'skull') n += 1;
      });
      return n >= cond.n;
    }
    case 'enemyRacePresent': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return false;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.some((c) => !c.defeated && hasTroopType(c, cond.race));
    }
    case 'allyRacePresent': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return false;
      return ctx.state.teams[side].characters.some((c) => !c.defeated && hasTroopType(c, cond.race));
    }
    case 'anyEnemyStatus': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return false;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.some(
        (c) => !c.defeated && c.statuses.some((s) => s.id === cond.statusId && s.turns > 0),
      );
    }
    case 'anyAllyStatus': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return false;
      return ctx.state.teams[side].characters.some(
        (c) => !c.defeated && c.statuses.some((s) => s.id === cond.statusId && s.turns > 0),
      );
    }
    case 'stormPresent': {
      // 全场唯一风暴挂在某一方 Team.storm 上；双方都扫（将来放开每方一个时天然兼容）
      for (const side of ['Left', 'Right'] as const) {
        const storm = ctx.state.teams[side].storm;
        if (!storm) continue;
        if (cond.dropKind !== undefined && storm.dropKind !== cond.dropKind) continue;
        if (cond.color !== undefined && storm.color !== cond.color) continue;
        return true;
      }
      return false;
    }
    case 'anyOf':
      return cond.of.some((c) => conditionMet(c, ctx, target));
    case 'allOf':
      return cond.of.every((c) => conditionMet(c, ctx, target));
    default: {
      const _exhaustive: never = cond;
      return _exhaustive;
    }
  }
}

/** 条件倍率乘子：condMult 存在且条件不成立 → 1；成立 → times */
export function condMultiplier(
  condMult: CondMult | undefined,
  ctx: EffectContext,
  target?: Character,
): number {
  if (!condMult) return 1;
  return conditionMet(condMult.cond, ctx, target) ? condMult.times : 1;
}

/** 目标相对条件（需要具体目标才能判定；无目标段挂这类条件 → 整段跳过）。
 * 组合条件（anyOf/allOf）按「任一叶子是目标相对」判定——对目标过滤语义成立。 */
const TARGET_CONDITION_KINDS: ReadonlySet<Condition['kind']> = new Set([
  'targetRace', 'targetColor', 'targetStatus', 'targetHpDamaged',
]);

export function isTargetCondition(cond: Condition): boolean {
  if (TARGET_CONDITION_KINDS.has(cond.kind)) return true;
  if (cond.kind === 'anyOf' || cond.kind === 'allOf') {
    return cond.of.some((c) => isTargetCondition(c));
  }
  return false;
}

/** 条件加成（「若…则伤害增加 N 点」，加算而非倍率） */
export interface CondBonus {
  n: number;
  cond: Condition;
}

/** 条件加成取值：条件成立 → n，不成立 → 0（叠加顺序见 SOP：先加后乘） */
export function condBonusValue(
  bonus: CondBonus | undefined,
  ctx: EffectContext,
  target?: Character,
): number {
  if (!bonus || bonus.n <= 0) return 0;
  return conditionMet(bonus.cond, ctx, target) ? bonus.n : 0;
}

function statOf(char: Character, stat: 'attack' | 'armor' | 'hp' | 'magic' | 'missingHp'): number {
  switch (stat) {
    case 'attack': return char.attack;
    case 'armor': return char.armor;
    case 'hp': return char.hp;
    case 'magic': return char.magic;
    case 'missingHp': return Math.max(0, char.maxHp - char.hp);
  }
}

/** 与 destroyed/transformed 比对用的宝石类型匹配 */
function matchGem(
  gemType: import('../../types').GemType,
  color: BaseColor | undefined,
): boolean {
  if (color === undefined) return true;
  return isSameMatchType(gemType, colorGem(color));
}

/** 骷髅计数用 */
function isSkull(gemType: import('../../types').GemType): boolean {
  return isSameMatchType(gemType, skullGem());
}

/**
 * 解析来源计数（段执行时刻）。
 * 跨段追踪（destroyed/transformed/drainedMana/主目标）缺省时按 0 计。
 */
export function resolveModifierCount(source: ModifierSource, ctx: EffectContext): number {
  const tracking = ctx.castTracking;
  switch (source.kind) {
    case 'destroyedGems':
      return (tracking?.destroyed ?? []).filter((d) => matchGem(d.gemType, source.color)).length;
    case 'transformedGems': {
      // 追踪粒度权衡：transform 事件自带逐格明细，但追踪层只累计总数；
      // 带颜色的「因转换的 X 色宝石数」来源极少（<10 条），第一波按总转化数计，规则手册已注明。
      return source.color === undefined ? (tracking?.transformed ?? 0) : countTransformed(tracking, source.color);
    }
    case 'boardGems': {
      let n = 0;
      ctx.state.board.forEach((gem) => {
        if (gem && gem.type.kind === 'color' && (source.color === undefined || gem.type.color === source.color)) n += 1;
      });
      return n;
    }
    case 'boardSkulls': {
      let n = 0;
      ctx.state.board.forEach((gem) => {
        if (gem && isSkull(gem.type)) n += 1;
      });
      return n;
    }
    case 'boardSpecial': {
      let n = 0;
      ctx.state.board.forEach((gem) => {
        if (gem && gem.type.kind === 'special' && gem.type.spec.kind === source.gem) n += 1;
      });
      return n;
    }
    case 'selfStat': {
      const caster = findCharacter(ctx.state, ctx.casterId);
      return caster ? statOf(caster, source.stat) : 0;
    }
    case 'teamSize': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const targetSide = source.side === 'ally' ? side : (side === 'Left' ? 'Right' : 'Left');
      return ctx.state.teams[targetSide].characters.filter((c) => !c.defeated).length;
    }
    case 'alliesOfRace': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      return ctx.state.teams[side].characters.filter((c) => !c.defeated && hasTroopType(c, source.race)).length;
    }
    case 'enemyStatusCount': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.filter(
        (c) => !c.defeated && c.statuses.some((s) => s.id === source.statusId && s.turns > 0),
      ).length;
    }
    case 'alliesOfColor': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      return ctx.state.teams[side].characters.filter(
        (c) => !c.defeated && c.colors.includes(source.color),
      ).length;
    }
    case 'allyStatusCount': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      return ctx.state.teams[side].characters.filter(
        (c) => !c.defeated && c.statuses.some((s) => s.id === source.statusId && s.turns > 0),
      ).length;
    }
    case 'enemyStatSum':
      return teamStatSum(ctx, 'enemy', source.stat);
    case 'allyStatSum':
      return teamStatSum(ctx, 'ally', source.stat);
    case 'targetStat': {
      const last = tracking?.lastTarget;
      if (!last) return 0;
      const ch = findCharacter(ctx.state, last.id);
      return ch ? statOf(ch, source.stat) : 0;
    }
    case 'drainedMana':
      return tracking?.drainedMana ?? 0;
    case 'battleGold':
      return ctx.state.economy.gold;
    case 'battleSouls':
      return ctx.state.economy.souls;
    case 'battleGems':
      return ctx.state.economy.gems;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

/** transformedGems 带颜色筛选时需要转化明细；追踪里只存数量，则按转化后颜色细分的计数 */
function countTransformed(
  tracking: { transformed: number } | undefined,
  _color: BaseColor,
): number {
  // 追踪粒度权衡：transform 事件自带逐格明细，但追踪层只累计总数；
  // 带颜色的「因转换的 X 色宝石数」来源极少（<10 条），第一波按总转化数计，规则手册已注明。
  return tracking?.transformed ?? 0;
}

/** 某方全体的属性总和 */
function teamStatSum(
  ctx: EffectContext,
  side: 'ally' | 'enemy',
  stat: 'attack' | 'armor' | 'hp' | 'magic',
): number {
  const casterSide = findSide(ctx.state, ctx.casterId);
  if (casterSide === null) return 0;
  const targetSide = side === 'ally' ? casterSide : (casterSide === 'Left' ? 'Right' : 'Left');
  let sum = 0;
  for (const c of ctx.state.teams[targetSide].characters) {
    if (!c.defeated) sum += statOf(c, stat);
  }
  return sum;
}

/**
 * 计算二次缩放加成（叠加项）：
 *   multiplier：a × count；ratio：b × floor(count / a)。
 * count 为 0 或 spec 缺省 → 0（DoD 边界：无资源退化）。
 * 多来源（sources）计数相加后按同一公式折算。
 */
export function modifierBonus(spec: ModifierSpec | undefined, ctx: EffectContext): number {
  if (!spec) return 0;
  let count = 0;
  if (spec.sources) {
    for (const s of spec.sources) count += resolveModifierCount(s, ctx);
  } else if (spec.source) {
    count = resolveModifierCount(spec.source, ctx);
  }
  if (count <= 0) return 0;
  if (spec.mod.kind === 'multiplier') {
    return spec.mod.a * count;
  }
  const per = Math.max(1, Math.floor(spec.mod.a));
  const m = Math.max(0, Math.floor(spec.mod.b ?? 0));
  return m * Math.floor(count / per);
}

/** 求值「一次缩放 + 二次缩放」的最终数值（非负整数） */
export function evaluateWithModifier(
  base: number,
  spec: ModifierSpec | undefined,
  ctx: EffectContext,
): number {
  return Math.max(0, base + modifierBonus(spec, ctx));
}
