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
import { isSameMatchType, colorGem, skullGem, PlayerSide } from '../../types';
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
  | { kind: 'selfStat'; stat: 'attack' | 'armor' | 'hp' | 'missingHp' | 'magic' | 'manaCost' }
  /** 某方存活人数（ally=施法方含自身；enemy=敌方） */
  | { kind: 'teamSize'; side: 'ally' | 'enemy' }
  /** 施法方指定种族的存活盟友数 */
  | { kind: 'alliesOfRace'; race: string }
  /** 敌方指定种族的存活敌人数（武器原语批 K-E，「因恶魔敌人数而增强」；与 alliesOfRace 对称，
   *  敌方侧形态补齐——enemiesOfColor 的种族版） */
  | { kind: 'enemiesOfRace'; race: string }
  /** 施法方指定王国的存活盟友数（原语 Wave4 批，「因 Dhrak-Zum 盟友数量而增强」；
   *  与 alliesOfRace 对称，按 Character.kingdom 筛选） */
  | { kind: 'alliesOfKingdom'; kingdom: string }
  /** 敌方指定王国的存活敌人数（原语 Wave4 批；与 enemiesOfColor 同构，按 kingdom 筛选） */
  | { kind: 'enemiesOfKingdom'; kingdom: string }
  /** 施法方关联指定法力色的存活盟友数（「因蓝色盟友数而增强」） */
  | { kind: 'alliesOfColor'; color: BaseColor }
  /** 敌方关联指定法力色的存活敌人数（「因红色敌人（的数量）而增强」，R13 批；与 alliesOfColor 对称） */
  | { kind: 'enemiesOfColor'; color: BaseColor }
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
  /**
   * 本技能效果段造成的敌方阵亡数（原语 Wave3 批，官方 CountEnemyDeaths——
   * Glutmaw 8086「Devour…boosted by Enemy deaths [x5]」步骤
   * {Target: AllEnemies, Amount: 500, Type: CountEnemyDeaths}）。跨段追踪计数。
   */
  | { kind: 'countEnemyDeaths' }
  /** 本技能效果段造成的己方阵亡数（官方 CountAllyDeaths——Dullahan 8172 双来源，「boosted
   *  by Ally and Enemy deaths [x5]」；献祭盟友同计入此来源） */
  | { kind: 'countAllyDeaths' }
  /** 本场收集的藏宝图数（四项拍板①延伸，2026-09-17） */
  | { kind: 'battleMaps' }
  /** 最近被献祭盟友的属性（「因献祭军队的攻击力而增强」，跨段追踪） */
  | { kind: 'sacrificedStat'; stat: 'attack' | 'armor' | 'magic' | 'hp' }
  /**
   * 本技能前序 reduce 段的实际削减总额（原语 Wave4 批，官方 7507 Lost Warrior 句式
   * 「减除其 [魔法 + 2] 点生命值并将之转化为攻击力」——ZH 净化一名盟友，减除其 [M+2]
   * 点生命值并将之转化为攻击力）：debuff.ts reduce 结算把实际发生（夹零/夹当前值后）
   * 的削减额记入 castTracking.lastReduce，后段增益以 modifier {multiplier 1} × 本来源
   * 引用同额（「并转化为攻击力」= 攻击增益 = 实际削减额，非声明额）。
   */
  | { kind: 'lastReduce' }
  /** 战场经济池当前金币总数（「伤害因我的金币而增强」「数量等于我的金币」） */
  | { kind: 'battleGold' }
  /** 战场经济池当前灵魂总数（「因本战斗收集的灵魂数而增强」） */
  | { kind: 'battleSouls' }
  /** 战场经济池当前宝石（钻石）总数 */
  | { kind: 'battleGems' }
  /**
   * 淬炼段位（武器原语批 K-E，官方 Doomed 档武器族「+N per Tempering level」）：
   * 施法者（主角）的 `Character.temperingLevel`（缺省 0）。「Deal [Magic + 10] scatter
   * damage, +4 per Tempering level」= 淬炼段 modifier `{ kind: 'multiplier', a: 4 }` ×
   * 本来源——level 2 → +8；level 0 / 缺省 → 增项为 0（multiplier 路径 count=0 早退）。
   * meta 层淬炼系统接入前恒按 0 计，既有对局数值不变。
   */
  | { kind: 'tempering' };

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

/**
 * 劫数部队的专属 TroopType（武器原语批 K-E 考证）：troops.json 中仅 6 名劫数部队
 * （寒冰/自然/火焰/光明/暗黑/岩石劫数，DoomOfIce~DoomOfStone）携带该类型值，
 * 官方武器法术「if the Enemy has a Doom」按它判定（见 Condition targetHasDoom 注释）。
 */
export const DOOM_TROOP_TYPE = 'Doom';

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
  /** 目标法力色过滤；color 亦可为 'CHOSEN'（「所有使用该(选定)颜色的敌人/盟友」，R11 批：
   *  运行时取 ctx.chosenColor，未选色 → 条件对任何目标不成立、整段安全跳过） */
  | { kind: 'targetColor'; color: BaseColor | 'CHOSEN' }
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
  /**
   * 特定兵种在场（「若自身队伍有梁帝」，全局条件）：按角色名（中文兵种名）匹配存活者。
   * name 用 troops.json 的 name 字段（不是 referenceName）；side 缺省 = 己方。
   */
  | { kind: 'troopPresent'; side?: 'ally' | 'enemy'; name: string }
  /** 施法者自身带有该状态（「若自身身处狂怒状态」，全局条件） */
  | { kind: 'selfStatus'; statusId: string }
  /**
   * 属性比较（「若自身攻击力较高」，全局条件）：施法者该属性 > 跨段追踪目标该属性。
   * stat 可选 attack/armor/magic/hp；无追踪目标 → false。
   */
  | { kind: 'casterStatBeatsTarget'; stat: 'attack' | 'armor' | 'magic' | 'hp' }
  /** 任一存活敌人带该法力色（「若其中一个使用蓝色法力」的聚合判定，全局条件） */
  | { kind: 'anyEnemyColor'; color: BaseColor }
  /** 否定（「板面上没有一颗紫色宝石」，2026-09-17 回收批）：子条件不成立即成立 */
  | { kind: 'not'; cond: Condition }
  /** 析取（「若敌人是兽人或恶魔」）：任一子条件成立即成立 */
  | { kind: 'anyOf'; of: Condition[] }
  /** 合取：全部子条件成立才成立 */
  | { kind: 'allOf'; of: Condition[] }
  /**
   * 地区条件（R11 批 · 模式专属建模，官方 MultiplyForRegion4001-4010「若在夏之岛/阿达尼亚/
   * 格赫隆使用，则伤害翻倍」）：region 为地区键（'SummerIsle'/'Aidania'/'Geheron' 等官方
   * 十地区）。标准战斗 state 无 region 字段 → 恒 false（建模完整、惰性放置——用户裁定：
   * 晋升/魔头等模式专属内容也实现，标准战斗不触发）。
   */
  | { kind: 'regionPresent'; region: string }
  /**
   * 晋升度条件（R11 批 · 模式专属建模，官方 MultiplyForAscensionBoss「如果敌人是 Boss，
   * 则根据我的升华值造成 3-5 倍伤害」）：min 为晋升数下限。与 targetRace:'Boss' 组合
   * （allOf）表达官方完整语义。标准战斗 state 无 ascension 字段（按 0 计）→ 恒 false。
   */
  | { kind: 'ascended'; min: number }
  /**
   * 法力已满（原语 Wave3 批，官方 AddForFullMana / CountEnemiesFullMana——
   * Maid of Envy 8532「If the Enemy has full Mana, drain their Mana」步骤
   * {StatusModifier: AddForFullMana, Type: DecreaseMana}）：该角色 mana ≥ manaCost。
   * 缺省按**该段目标**逐个判定（目标相对条件，目标不满足 → 被过滤、全不满足 → 段跳过）；
   * of:'caster' 为施法者全局条件（「若自身法力已满」）。
   */
  | { kind: 'manaFull'; of?: 'target' | 'caster' }
  /**
   * 王国在场（原语 Wave4 批，官方语义 Dugall Ramhorn 9588「Dhrak-Zum Allies」/
   * Seaborn Knight 9593「If the Enemy is from Merlantis」的王国家族）：
   * side 一侧（ally=施法方含自身 / enemy=敌方）存活者中存在 kingdom 匹配者即真
   * （enemyRacePresent 的王国版，全局条件整段判定；Character.kingdom 缺省者不属于
   * 任何王国，恒不匹配）。
   */
  | { kind: 'kingdomOf'; side: 'ally' | 'enemy'; kingdom: string }
  /**
   * 敌方拥有劫数（武器原语批 K-E，官方 Doomed 档武器族 76 把的
   * 「if the Enemy has a Doom / 如果敌方有劫数，则再增加 N 点」条件）。
   * 考证结论（troops.json × gowhead 官方数据）：「劫数/Doom」是**兵种属性**——
   * troops.json 中 6 名劫数部队（寒冰/自然/火焰/光明/暗黑/岩石劫数，DoomOfIce~DoomOfStone）
   * 均带专属 `troopTypes: ['Doom']`，官方法术语义 = 敌方队伍里编有劫数部队，
   * **不是战斗内标记**（trait code:'doom'「末日」是对死亡标记目标的双倍骷髅伤，另一机制）。
   * 故按目标侧模板判定：敌方存活者中存在 troopTypes 含 'Doom' 即真（全局条件整段判定，
   * = enemyRacePresent race 'Doom' 的专名形态，生成器按 kind 名消费）。
   */
  | { kind: 'targetHasDoom' }
  /**
   * 战斗发生在指定王国（武器原语批 K-E，官方「战斗发生在X王国时…」条件族）：
   * 读战斗上下文 `GameState.kingdom`（经 BattleRequest.kingdom → createGameState opts 注入；
   * 探索/入侵 = 当前王国、竞技场 = null）。字段缺省或为 null（旧请求/竞技场口径）时恒为假，
   * 条件 kingdom 需与之严格相等。全局条件整段判定。
   */
  | { kind: 'kingdomPresent'; kingdom: string };

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
    case 'targetColor': {
      if (!target) return false;
      // 'CHOSEN'（R11 批）：运行时选色（「所有使用该颜色的敌人/盟友」）；未选色 → 不成立
      if (cond.color === 'CHOSEN') {
        if (ctx.chosenColor === undefined) return false;
        return target.colors.includes(ctx.chosenColor);
      }
      return target.colors.includes(cond.color);
    }
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
    case 'not':
      return !conditionMet(cond.cond, ctx, target);
    case 'casterStatBeatsTarget': {
      const me = findCharacter(ctx.state, ctx.casterId);
      const foe = (() => {
        const last = ctx.castTracking?.lastTarget;
        return last ? findCharacter(ctx.state, last.id) : undefined;
      })();
      if (!me || !foe) return false;
      return statOf(me, cond.stat) > statOf(foe, cond.stat);
    }
    case 'anyEnemyColor': {
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return false;
      const enemySide = mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
      return ctx.state.teams[enemySide].characters.some(
        (c) => !c.defeated && c.colors.includes(cond.color),
      );
    }
    case 'selfStatus': {
      const caster = findCharacter(ctx.state, ctx.casterId);
      return !!caster && caster.statuses.some((st) => st.id === cond.statusId && st.turns > 0);
    }
    case 'troopPresent': {
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return false;
      const side = cond.side === 'enemy'
        ? mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left
        : mySide;
      return ctx.state.teams[side].characters.some((c) => !c.defeated && c.name === cond.name);
    }
    case 'anyOf':
      return cond.of.some((c) => conditionMet(c, ctx, target));
    case 'allOf':
      return cond.of.every((c) => conditionMet(c, ctx, target));
    case 'regionPresent':
      // 模式专属建模（R11 批）：战场 state 将来由晋升/地区模式挂 region 字段时按键比对；
      // 标准战斗无此字段 → 恒 false（condMult 退化为原值，官方「翻倍」不触发）。
      return (ctx.state as { region?: string }).region === cond.region;
    case 'ascended':
      // 模式专属建模（R11 批）：晋升模式挂 ascension 字段（缺省 0）；标准战斗恒 false。
      return ((ctx.state as { ascension?: number }).ascension ?? 0) >= cond.min;
    case 'manaFull': {
      // 法力已满（Wave3 批，官方 AddForFullMana）：mana ≥ manaCost 即满。
      // of:'caster' 为施法者全局判定；缺省按目标逐个判定（isTargetCondition=true）。
      if (cond.of === 'caster') {
        const caster = findCharacter(ctx.state, ctx.casterId);
        return !!caster && caster.mana >= caster.manaCost;
      }
      return !!target && target.mana >= target.manaCost;
    }
    case 'kingdomOf': {
      // 王国在场（Wave4 批）：side 一侧存活者存在 kingdom 匹配即真（全局条件）。
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return false;
      const side = cond.side === 'enemy'
        ? mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left
        : mySide;
      return ctx.state.teams[side].characters.some(
        (c) => !c.defeated && c.kingdom === cond.kingdom,
      );
    }
    case 'targetHasDoom': {
      // 敌方拥有劫数（K-E 批，考证见 Condition 定义处）：敌方存活者存在 TroopType 'Doom'。
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return false;
      const enemySide = mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
      return ctx.state.teams[enemySide].characters.some(
        (c) => !c.defeated && hasTroopType(c, DOOM_TROOP_TYPE),
      );
    }
    case 'kingdomPresent':
      // 战斗发生在指定王国（K-E 批）：战斗上下文 kingdom 严格相等才真；
      // 字段缺省/null（旧请求、竞技场）→ 恒假（用户裁定口径）。
      return ctx.state.kingdom === cond.kingdom;
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
  'targetRace', 'targetColor', 'targetStatus', 'targetHpDamaged', 'manaFull',
]);

export function isTargetCondition(cond: Condition): boolean {
  if (TARGET_CONDITION_KINDS.has(cond.kind)) return true;
  if (cond.kind === 'anyOf' || cond.kind === 'allOf') {
    return cond.of.some((c) => isTargetCondition(c));
  }
  if (cond.kind === 'not') {
    return isTargetCondition(cond.cond);
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

function statOf(char: Character, stat: 'attack' | 'armor' | 'hp' | 'magic' | 'missingHp' | 'manaCost'): number {
  switch (stat) {
    case 'attack': return char.attack;
    case 'armor': return char.armor;
    case 'hp': return char.hp;
    case 'magic': return char.magic;
    case 'missingHp': return Math.max(0, char.maxHp - char.hp);
    case 'manaCost': return char.manaCost;
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
    case 'enemiesOfRace': {
      // 敌方该种族存活计数（K-E 批，与 alliesOfRace 对称、敌方侧形态补齐）
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.filter((c) => !c.defeated && hasTroopType(c, source.race)).length;
    }
    case 'alliesOfKingdom': {
      // 施法方该王国存活盟友数（Wave4 批，与 alliesOfRace 对称，按 kingdom 筛选）
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      return ctx.state.teams[side].characters.filter((c) => !c.defeated && c.kingdom === source.kingdom).length;
    }
    case 'enemiesOfKingdom': {
      // 敌方该王国存活计数（Wave4 批，与 enemiesOfColor 同构）
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.filter((c) => !c.defeated && c.kingdom === source.kingdom).length;
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
    case 'enemiesOfColor': {
      // 敌方该法力色存活计数（R13 批，官方 CountArmyColor Target=AllEnemies）：
      // 与 alliesOfColor 同构，仅换算敌方侧。
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.filter(
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
    case 'countEnemyDeaths':
      // 本技能造成的敌方阵亡数（Wave3 批）：跨段追踪在 runSegment 数 defeat 事件入账
      return tracking?.enemyDeaths ?? 0;
    case 'countAllyDeaths':
      return tracking?.allyDeaths ?? 0;
    case 'battleGold':
      return ctx.state.economy.gold;
    case 'battleSouls':
      return ctx.state.economy.souls;
    case 'battleMaps':
      return ctx.state.economy.maps;
    case 'sacrificedStat':
      return tracking?.sacrificed ? tracking.sacrificed[source.stat] : 0;
    case 'lastReduce':
      // 前序 reduce 段实际削减额（Wave4 批，7507 跨段数值绑定）：debuff.ts 结算写入
      return tracking?.lastReduce?.amount ?? 0;
    case 'battleGems':
      return ctx.state.economy.gems;
    case 'tempering':
      // 淬炼段位（K-E 批）：施法者（主角）的 temperingLevel，缺省按 0 计（增项为 0）。
      {
        const caster = findCharacter(ctx.state, ctx.casterId);
        return Math.max(0, caster?.temperingLevel ?? 0);
      }
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
