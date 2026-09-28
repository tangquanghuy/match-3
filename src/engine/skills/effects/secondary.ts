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
import { isSameMatchType, colorGem, skullGem, PlayerSide, opponentOf, matchesKingdom } from '../../types';
import type { SpecialGemKind, SkullStormDropKind } from '../../types';
import type { BaseColor, Character, KingdomRef } from '../../types';
import { BoardModel } from '../../BoardModel';
import { goldForSide } from '../../battleGold';
import type { SecondaryModifier } from '../scaling';
import type { EffectContext } from './context';
import { findCharacter, findSide, effectCasterSide, killCheckTarget } from './context';
import { mostUsedManaColorForCast } from './manaColor';

/** Status-id aliases that name one GoW status (L4b-7200-rage-alias): Enrage is applied as 'rage' by most
 *  prototypes while counters/conditions often say 'enraged'. Same alias set as status.ts RAGE_STATUS_IDS
 *  (not imported: status.ts imports this module). */
const STATUS_ALIAS_GROUPS: readonly ReadonlySet<string>[] = [new Set(['rage', 'enraged'])];
function sameStatus(actual: string, wanted: string | undefined): boolean {
  if (wanted === undefined) return false;
  if (actual === wanted) return true;
  return STATUS_ALIAS_GROUPS.some((g) => g.has(actual) && g.has(wanted));
}

/**
 * 二次缩放来源。color 字段为 undefined 表示不筛颜色（任意色/全体）。
 */
export type ModifierSource =
  /** 本技能前序段直接摧毁（destroy/explode）的宝石数，可筛颜色；
   *  R22 批：skulls=true 筛普通骷髅族（「因该行被摧毁的骷髅头数而增强」，7388/7977/8812/9492）、
   *  special 筛指定特殊宝石 kind（「因被摧毁的石像鬼宝石数而增强」，8927） */
  | { kind: 'chosenColumnAtCastStart'; color?: BaseColor; skulls?: boolean }
  /** Chosen-row gems at cast start (P-R1-row-count-at-cast-start), same filters as chosenColumnAtCastStart. */
  | { kind: 'chosenRowAtCastStart'; color?: BaseColor; skulls?: boolean }
  | { kind: 'destroyedGems'; color?: BaseColor; skulls?: boolean; special?: SpecialGemKind; specialTier?: number }
  | { kind: 'countedAdjacentSpecial' }
  /** Count color gems on both diagonals through the same center as area:x. */
  | { kind: 'diagonalGems'; color: BaseColor; anchor?: 'chosenCell' }
  // anchor 'chosenCell' (P-R6-chosen-cell-counts): the X through ctx.chosenCell (native Target Board CountGems
  // BoardTarget Diagonals, like area:x center 'CELL'); no chosen cell -> 0. Without anchor: board centre.
  /** 本技能前序段直接转化（transform）的宝石数，可筛颜色（按转化后的颜色计） */
  | { kind: 'transformedGems'; color?: BaseColor }
  /** 当前棋盘上某色宝石数（在段执行时刻读取）。R22 批：color 亦可为 'CHOSEN'（运行时取
   *  ctx.chosenColor，未选色按 0 计；8060「创造与此色宝石数等量」/ 8355「使选定色宝石数翻倍」）
   *  与 'ENEMY_MOST_USED'（9364「几率随敌人最常用法力色的宝石数增强」）；except 排除某色
   *  （8464 口径备用，本批未消费）。 */
  | { kind: 'boardGems'; color?: BaseColor | 'CHOSEN' | 'ENEMY_MOST_USED'; except?: BaseColor }
  /** 当前棋盘上的骷髅头数（含末日族，经 isSameMatchType 同族判定） */
  | { kind: 'boardSkulls' }
  /** Skull-family gems captured before the spell's first segment (native CountGems ordering). */
  | { kind: 'castStartBoardSkulls' }
  /** Colour gems captured before the spell's first segment (R014, native CountGems <Color> before CreateGems). */
  | { kind: 'castStartBoardGems'; color: BaseColor }
  /** 当前棋盘上指定种类的特殊宝石数（「因炸弹宝石数而增强」） */
  | { kind: 'boardSpecial'; gem: SpecialGemKind; tier?: number; color?: BaseColor }
  /** 施法者自身属性（hp=当前生命；missingHp=已损失生命） */
  | { kind: 'selfStat'; stat: 'attack' | 'armor' | 'hp' | 'missingHp' | 'magic' | 'manaCost' }
  /** 某方存活人数（ally=施法方含自身；enemy=敌方）。atCastStart（P-R1-count-at-native-step，本行至
   *  enemiesOfColor 的军队计数通用）：读施法开始时的存活单位（native Count* 位于 step 0） */
  | { kind: 'teamSize'; side: 'ally' | 'enemy'; atCastStart?: boolean }
  /** 施法方指定种族的存活盟友数 */
  | { kind: 'alliesOfRace'; race: string; atCastStart?: boolean }
  /** 敌方指定种族的存活敌人数（武器原语批 K-E，「因恶魔敌人数而增强」；与 alliesOfRace 对称，
   *  敌方侧形态补齐——enemiesOfColor 的种族版） */
  | { kind: 'enemiesOfRace'; race: string; atCastStart?: boolean }
  /** 施法方指定王国的存活盟友数（原语 Wave4 批，「因 Dhrak-Zum 盟友数量而增强」；
   *  与 alliesOfRace 对称，按 Character.kingdom 筛选） */
  | { kind: 'alliesOfKingdom'; kingdom: KingdomRef; atCastStart?: boolean }
  /** P-R5-named-ally-count: alive allies (caster included) of a named troop (native CountArmyTroop@AllAllies);
   *  name = zh Character.name (troopPresent 口径) */
  | { kind: 'alliesNamed'; name: string | string[]; atCastStart?: boolean }
  // name[] (P-R5-faction-kingdom): any of several troops — native CountArmyKingdom on a faction kingdom id
  // (3048 Wild Court / 3053 Amanithrax) whose members share the zh parent-kingdom name with the rest of the kingdom
  /** 敌方指定王国的存活敌人数（原语 Wave4 批；与 enemiesOfColor 同构，按 kingdom 筛选） */
  | { kind: 'enemiesOfKingdom'; kingdom: KingdomRef; atCastStart?: boolean }
  /** 施法方关联指定法力色的存活盟友数（「因蓝色盟友数而增强」） */
  | { kind: 'alliesOfColor'; color: BaseColor; atCastStart?: boolean }
  /** 敌方关联指定法力色的存活敌人数（「因红色敌人（的数量）而增强」，R13 批；与 alliesOfColor 对称） */
  | { kind: 'enemiesOfColor'; color: BaseColor; atCastStart?: boolean }
  /** 敌方处于指定状态的存活人数；R22 批 statusId 可缺省 = 任意状态（「因身负状态效果的
   *  敌人数而增强」，8581「每有一名敌人陷入状态效果」） */
  | { kind: 'enemyStatusCount'; statusId?: string }
  /** 己方处于指定状态的存活人数（「因下潜的盟友数而增强」） */
  | { kind: 'allyStatusCount'; statusId: string; excludeSelf?: boolean }
  /** 选定目标施法开始时带有的所列状态个数（P-R3-target-status-count，native 每个状态一步
   *  CountSpecificStatusEffect@FromTarget，各 +1） */
  | { kind: 'targetStatusCount'; statusIds: string[] }
  /** 敌方全体的某属性总和（hp=当前生命；R22 批 stat 增 mana、color 筛法力色——
   *  8367「因所有红色敌人的法力值而增强」） */
  | { kind: 'enemyStatSum'; stat: 'attack' | 'armor' | 'hp' | 'magic' | 'mana'; color?: BaseColor }
  /** 施法方全体的某属性总和（hp=当前生命；R22 批 stat 增 mana、excludeSelf=true 排除施法者
   *  ——7506「因其他盟友的魔力值」/ 7651「因其他所有盟友的法力值」口径） */
  | { kind: 'allyStatSum'; stat: 'attack' | 'armor' | 'hp' | 'magic' | 'mana'; excludeSelf?: boolean }
  /** 最近目标段的当前主目标属性（R22 批 stat 增 missingHp / manaCost：7464/7472 目标侧补齐，
   *  与 selfStat 侧对齐；batch-r28 增 mana——8037「伤害值因其（目标的）法力值而增强」，
   *  官方 CountMana@FromTarget 实锤） */
  | { kind: 'targetStat'; stat: 'attack' | 'armor' | 'hp' | 'magic' | 'missingHp' | 'manaCost' | 'mana' }
  /** 本次释放玩家手动选定目标（ctx.chosenTargetId）的当前属性（R22 批，8659「造成等同于
   *  其（指定敌人）攻击力的伤害，再对上方敌人造成同等伤害」——同额跨段引用选定的那名敌人，
   *  不受后段目标解析冲掉 lastTarget 影响） */
  | { kind: 'chosenStat'; stat: 'attack' | 'armor' | 'hp' | 'magic' }
  /**
   * 本技能最近一个伤害段实际造成的伤害总额（R22 批，7274「数值因造成的伤害而增强」/
   * 9571「并将其作为生命赋予最弱的盟友」）：damage 原语结算把本段 skill-damage 事件总额
   * 记入 castTracking.lastDamage（每段整体覆写，lastReduce 同款「最近一段」语义）。
   */
  | { kind: 'lastDamage' }
  /** 敌方生命/法力值满值的存活人数（R22 批，官方 CountEnemiesFullMana——8406/7808「每有
   *  一名法力值满值的敌人」「因生命值和法力值满值的敌军数而增强」）：hp/mana 各自开关，
   *  都缺省 = 只看法力满值；都给 = 同时满足才计（满判定：hp≥maxHp、mana≥manaCost）。 */
  | { kind: 'enemyFull'; hp?: boolean; mana?: boolean }
  /** 施法者属性高于最近目标的三围/生命计数（R22 批，7812「自身每高于敌方一个技能即窃取
   *  3 点魔法」）：逐围（attack/armor/magic/hp 四围，randomStat 同一口径）比较 caster>target
   *  计数，供 multiplier 消费。 */
  | { kind: 'casterStatBeatsCount' }
  /** 本技能前序段耗掉的敌方法力总和 */
  | { kind: 'drainedMana' }
  /**
   * 全战斗敌方阵亡数（原语 Wave3 批，官方 CountEnemyDeaths——
   * Glutmaw 8086「Devour…boosted by Enemy deaths [x5]」步骤
   * {Target: AllEnemies, Amount: 500, Type: CountEnemyDeaths}）。跨段追踪计数。
   */
  | { kind: 'countEnemyDeaths' }
  /** 全战斗己方阵亡数（官方 CountAllyDeaths——Dullahan 8172 双来源，「boosted
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
  /** 施法者阵营当前金币总数（「伤害因我的金币而增强」「数量等于我的金币」） */
  | { kind: 'battleGold' }
  /** Enemy-owned Gold. */
  | { kind: 'enemyGold' }
  /** Sum first, then apply the ratio once (do not round each side separately). */
  | { kind: 'bothGold' }
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
  | { kind: 'tempering' }
  /**
   * 本次施放前序窃取黄金段的实际入账总额（batch-r28，跨段追踪 goldStolen——
   * 8087「伤害值因被窃取的黄金数而增强 [1:1]」/ 8904「数值因窃取黄金数而增强 [50:1]」/
   * 8141「数量因窃取的黄金数而增强，上限 16」官方 CountEnemyGold+TakeEnemyGold+GiveGold
   * 步骤族实锤；与 battleGold（池总额≠本次窃取额）明确区分）。
   */
  | { kind: 'goldStolen' }
  /**
   * 本次施放前序经济支出段的实际扣减总额（batch-r28，跨段追踪 goldSpent——
   * 7460「花费我所有的黄金以增强造成的伤害数 [1:1]」：花费额即时转化为伤害加成）。
   */
  | { kind: 'goldSpent' }
  /**
   * 随机一名存活盟友的当前属性（batch-r28，7402「伤害值等同于**一名**盟友的攻击力」——
   * 泛指单体盟友来源缺口）：解析时种子化掷选一名存活盟友（含施法者自身），
   * 并把掷中者缓存到 castTracking.randomAllyId——同施法内重复读取复用同一名
   * （「给予**其**攻击力和护甲值」的「其」经 TargetMode 'lastAlly' 引用同一名）。
   */
  | { kind: 'randomAllyStat'; stat: 'attack' | 'armor' | 'hp' | 'magic' }
  /**
   * 以最近创造段的首颗宝石所在格为锚、周边（8 邻）某色宝石计数（batch-r28，官方
   * BoardTarget SurroundingGems——8804「宝石附近或下方每有一颗绿色宝石」；「下方」格
   * 即 8 邻中的正下格，故按 3x3 邻域口径计数、不含锚格自身）。锚缺失（前序无成功创造段）
   * 按 0 计。只数基色宝石（boardGems 同口径，不含归属色特殊宝石）。
   */
  | { kind: 'surroundingGems'; color: BaseColor; anchor: 'lastCreated' }
  /**
   * 原生 CountGems <色> BoardTarget Block3x3（P-F2-precount-explode，7553「爆破一颗宝石……伤害值因
   * 被摧毁的蓝色宝石数而增强」：计数是第 0 步，爆破是最后一步）：以本次选定格 ctx.chosenCell 为中心的
   * 3x3 方块（含中心格，越界收边）内该基色宝石数，在判定时刻读棋盘——后续爆破同一格前即可预读。
   * 未选格 → 0。
   */
  | { kind: 'chosenCellBlockGems'; color?: BaseColor; skulls?: boolean };
  // skulls (P-R6-chosen-cell-counts, native CountGems Skull Block3x3): count skull-family gems instead of a colour

/** 二次缩放规格：解析出的 [xN]/[N:M] + 来源，段定义里以纯数据存在（可 JSON 化） */
export interface ModifierSpec {
  mod: SecondaryModifier;
  /** 单来源。多来源句式（「因蓝色宝石和盟友数而增强」）用 sources，计数相加 */
  source?: ModifierSource;
  /** 多来源（与 source 二选一；两处都写时以 sources 为准） */
  sources?: ModifierSource[];
  /**
   * 分组多来源（P-counter-per-step，8228 原生 CountAttackArmorLife 50 + CountMagic 50）：每组对应
   * 一个原生 Count* 步骤——组内计数相加后 floor 一次，各组结果再相加（R007-1）。给出时优先于
   * sources / source。
   */
  sourceGroups?: ModifierSource[][];
  /**
   * 加成上限（batch-r28，官方 CountMax 步骤族——7667「上限为 14 颗宝石」/ 8141「上限
   * 16」/ 8142「上限 14」/ 10061「击杀几率最高可达 30%」）：给出时把**加成项**（bonus，
   * 非总值）夹到 ≤max——「6 颗、因黄金增强 [4:1]、上限 14」= 6 + min(floor(gold/4), 8)。
   */
  max?: number;
  /**
   * 多来源 ratio 合并取整（单一原生计数步骤跨多项：原生 CountAttackArmorLife；社区自制兵种
   * 「每有 4 颗红色或黄色宝石」= 单一合并计数）。
   * 缺省按 R007-1：原生每个 Count* 步骤独立 floor 后相加。multiplier 为线性，两者等价。
   */
  pooled?: boolean;
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
 * 「如果敌人是恶魔/使用红色法力值/已陷入沉默，则造成 N 倍伤害」「若自身生命值受损…」
 * 「如果板面上有 ≥N 颗X色宝石…」「如果敌方有X族军队…」。
 * target* 类条件按受击/受益目标逐个判定；其余为施法全局条件。
 */
export type Condition =
  | { kind: 'targetRace'; race: string }
  /** 目标法力色过滤；color 亦可为 'CHOSEN'（「所有使用该(选定)颜色的敌人/盟友」，R11 批：
   *  运行时取 ctx.chosenColor，未选色 → 条件对任何目标不成立、整段安全跳过） */
  | { kind: 'targetColor'; color: BaseColor | 'CHOSEN' }
  | { kind: 'targetStatus'; statusId: string }
  /** 目标身负任意状态（R22 批，7263「如果敌人陷入某状态效果」/ 7935「若敌人身负状态效果」——
   *  任意状态存在判定，与按 id 的 targetStatus 区分）。目标相对条件。 */
  | { kind: 'targetHasAnyStatus' }
  | { kind: 'targetHpDamaged' }
  | { kind: 'selfHpDamaged' }
  /**
   * 板面上某类宝石 ≥n 颗（「如果板面上有 13 颗或更多红色宝石」「若板面上有骷髅…」）。
   * color 筛基色（缺省数骷髅）；special（batch-r28，8567「若板面上有狼化宝石」官方
   * CountGems Color1=Lycanthropy 实锤）筛指定种类的特殊宝石——给出时优先按特殊宝石计数。
   */
  | { kind: 'boardAtLeast'; color?: BaseColor; special?: SpecialGemKind; n: number }
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
  /** 任一存活敌人带该法力色（「若其中一个使用蓝色法力值」的聚合判定，全局条件） */
  | { kind: 'anyEnemyColor'; color: BaseColor }
  /**
   * P-C-firstlast-army-color: the first or the last enemy uses this mana colour (native CountArmyColor@FirstLastEnemies,
   * e.g. 8418 Sister Ebony Purple -> Barrier). Read on the alive enemies at cast start (the native count precedes the
   * primary damage, so a kill by this cast does not change it); a lone enemy is both first and last.
   */
  | { kind: 'firstLastEnemyColor'; color: BaseColor }
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
   * 则基于我已晋升的稀有度造成 3 到 5 倍伤害」）：min 为晋升数下限。与 targetRace:'Boss' 组合
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
  | { kind: 'kingdomOf'; side: 'ally' | 'enemy'; kingdom: KingdomRef }
  /**
   * P-A-target-kingdom: the segment's own target belongs to the kingdom (native StatusModifier
   * MultiplyForKingdom<id> on Damage@FromTarget: "If the Enemy is from <Kingdom>"). Target-relative,
   * symmetric to targetRace / targetColor; without a target it falls back to the chosen target.
   */
  | { kind: 'targetKingdom'; kingdom: KingdomRef }
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
  | { kind: 'kingdomPresent'; kingdom: string }
  /** 最近产目标段的主目标带有该状态（R22 批全局条件，读跨段追踪 lastTarget——7541「如果
   *  敌人已陷入猎人标记状态…获得一个额外回合」、8276 条件化爆破、8533 等：条件挂在
   *  无目标段 / 目标与本段不同的段上时，targetStatus 会错滤本段目标，故按追踪目标判定）。
   *  无追踪目标 → false。 */
  | { kind: 'lastTargetStatus'; statusId: string }
  /** 最近产目标段的主目标具有该种族（R22 批全局条件，8533「若敌人是元素」、8534「若敌人
   *  是建造」、8573 配合 devour 等）。无追踪目标 → false。 */
  /** Race of the original selected enemy, unaffected by later random target steps. */
  | { kind: 'chosenTargetRace'; race: string }
  /** P-R1-chosen-target-color-cond: the chosen target's mana colour at cast start (native CountArmyColor@FromTarget
   *  at step 0), usable before any targeting segment and after the target died. */
  | { kind: 'chosenTargetColor'; color: BaseColor }
  | { kind: 'lastTargetRace'; race: string }
  /** 最近产目标段的主目标带该法力色（R22 批全局条件，8467「若敌人使用蓝色法力值」） */
  | { kind: 'lastTargetColor'; color: BaseColor }
  /** 最近产目标段的主目标仍存活（R22 批，「否则」反向分支：8550「否则就使他陷入死亡标记」
   *  8248「否则就召唤 2 名暗影姐妹」8694「否则则消除其所有技能值」——ifTargetDied 的取反
   *  全局条件形态；主目标从已阵亡到不存在同判 false）。无追踪目标 → false。 */
  | { kind: 'lastTargetSurvived' }
  /** 最近一个多目标段中任一目标阵亡（R22 批，9986「若有敌人死亡」9812「若有敌人死亡」
   *  7747「若其中一名敌人身亡」——ifTargetDied 仅判主目标，多目标任意死亡判定读
   *  castTracking.lastTargets 各项 aliveBefore）。 */
  | { kind: 'anyTrackedDied' }
  | { kind: 'castEnemyDied' }
  | { kind: 'castSacrificed' }
  /** 最近目标段的主目标属性高于施法者（R22 批反向属性比较，7960「若其攻击力比较大」——
   *  §13.2 casterStatBeatsTarget 只支持施法者>目标正向，本条件为其对偶）。 */
  | { kind: 'targetStatBeatsCaster'; stat: 'attack' | 'armor' | 'magic' | 'hp' }
  /**
   * 原生 FromTarget（本次手动选定的目标 ctx.chosenTargetId）在**判定时刻**的属性高于施法者
   *（P-F3-prehit-target-compare，7670 CountSet [AddForMoreLifeOnTarget] 在伤害前比较）。
   * 与 targetStatBeatsCaster 的区别：不依赖跨段追踪，首个目标段之前也可判定。全局条件。
   */
  | { kind: 'chosenTargetStatBeatsCaster'; stat: 'attack' | 'armor' | 'magic' | 'hp' }
  /**
   * 原生 FromTarget（手动选定的目标）存活且生命未满（P-F3-lasttarget-damaged，7791
   * CountSet@FromTarget [AddForDamaged] → Enrage@Self：命中后该敌受损则自身狂怒）。
   * 挂在自身目标段上也按选定目标判定（全局条件）。
   */
  | { kind: 'chosenTargetDamaged' }
  /**
   * 战场经济池某币种 ≥n（batch-r28，7435「如果自身有 12 个或更多灵魂」——经济阈值条件
   * 缺口；读 GameState.economy 共用池现值，全局条件整段判定）。
   */
  | { kind: 'economyAtLeast'; currency: 'gold' | 'souls' | 'gems' | 'maps'; n: number }
  /**
   * 最近产目标段的主目标在**施法开始时**已带该状态（batch-r28，7690「如果该敌人**已被**
   * 冻结，则再造成 5 点伤害」——首段 damage+冻结同段施加后，targetStatus 恒真，
   * 须读 CastTracking.statusesAtCastStart 施法前快照）。无追踪目标/无快照 → false。
   */
  | { kind: 'lastTargetStatusAtCastStart'; statusId: string };

export interface CondMult {
  times: number;
  cond: Condition;
}

/**
 * P-B-action-status-self-count: live status check that also sees the caster's Enchanted / Submerged / Blessed the
 * engine removed when this cast began (R002 / R004 "after the holder acts"; native Count* steps of the same spell
 * still count them).
 */
function hasStatusForCast(ctx: EffectContext, c: Character, statusId: string): boolean {
  if (c.statuses.some((s) => sameStatus(s.id, statusId) && s.turns > 0)) return true;
  return c.id === ctx.casterId && (ctx.actionEndedStatusIds ?? []).some((id) => sameStatus(id, statusId));
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
    case 'chosenTargetRace': {
      const selected = ctx.chosenTargetId === undefined ? undefined : findCharacter(ctx.state, ctx.chosenTargetId);
      return !!selected && !selected.defeated && hasTroopType(selected, cond.race);
    }
    case 'chosenTargetColor': {
      const id = ctx.chosenTargetId;
      if (id === undefined) return false;
      const colors = ctx.castTracking?.colorsAtCastStart?.[id] ?? findCharacter(ctx.state, id)?.colors ?? [];
      return colors.includes(cond.color);
    }
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
      return !!target && target.statuses.some((s) => sameStatus(s.id, cond.statusId) && s.turns > 0);
    case 'targetHasAnyStatus':
      return !!target && target.statuses.some((s) => s.turns > 0);
    case 'targetHpDamaged':
      return !!target && target.hp < target.maxHp;
    case 'selfHpDamaged': {
      const caster = findCharacter(ctx.state, ctx.casterId);
      return !!caster && caster.hp < caster.maxHp;
    }
    case 'boardAtLeast': {
      // special（batch-r28，8567 狼化宝石在场）：筛指定种类特殊宝石，优先于基色/骷髅口径
      let n = 0;
      ctx.state.board.forEach((gem) => {
        if (!gem) return;
        if (cond.special !== undefined) {
          if (gem.type.kind === 'special' && gem.type.spec.kind === cond.special) n += 1;
        } else if (cond.color) {
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
        (c) => !c.defeated && c.statuses.some((s) => sameStatus(s.id, cond.statusId) && s.turns > 0),
      );
    }
    case 'anyAllyStatus': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return false;
      return ctx.state.teams[side].characters.some(
        (c) => !c.defeated && hasStatusForCast(ctx, c, cond.statusId),
      );
    }
    case 'stormPresent': {
      // 全场唯一风暴挂在某一方 Team.storm 上；双方都扫（将来放开每方一个时天然兼容）
      for (const side of ['Left', 'Right'] as const) {
        const storm = ctx.state.teams[side].storm;
        if (!storm) continue;
        if (cond.dropKind !== undefined && storm.dropKind !== cond.dropKind) continue;
        if (cond.color !== undefined && storm.color !== cond.color && storm.color2 !== cond.color) continue;
        return true;
      }
      return false;
    }
    case 'not':
      return !conditionMet(cond.cond, ctx, target);
    case 'casterStatBeatsTarget': {
      const me = findCharacter(ctx.state, ctx.casterId);
      const foe = (() => {
        // P-R3-precast-compare: before the first targeting segment (native CountSet@FromTarget at step 0) the
        // comparison uses the chosen target.
        const id = ctx.castTracking?.lastTarget?.id ?? ctx.chosenTargetId;
        return id !== undefined ? findCharacter(ctx.state, id) : undefined;
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
    case 'firstLastEnemyColor': {
      const enemies = armyUnits(ctx, 'enemy', true);
      if (enemies.length === 0) return false;
      return [enemies[0], enemies[enemies.length - 1]].some((c) => c.colors.includes(cond.color));
    }
    case 'selfStatus': {
      const caster = findCharacter(ctx.state, ctx.casterId);
      return !!caster && hasStatusForCast(ctx, caster, cond.statusId);
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
        (c) => !c.defeated && matchesKingdom(c, cond.kingdom),
      );
    }
    case 'targetKingdom': {
      const unit = target ?? (ctx.chosenTargetId === undefined ? undefined : findCharacter(ctx.state, ctx.chosenTargetId));
      return !!unit && matchesKingdom(unit, cond.kingdom);
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
    case 'lastTargetStatus':
    case 'lastTargetRace':
    case 'lastTargetColor':
    case 'lastTargetSurvived':
    case 'targetStatBeatsCaster': {
      // R22 批 lastTarget 族（全局条件）：统一取跨段追踪主目标判定。
      // targetStatBeatsCaster falls back to the chosen target before the first targeting segment (P-R3-precast-compare).
      // lastTargetSurvived = negation of ifTargetDied: same tracked victim (P-G-ifTargetDied-after-self).
      const last = cond.kind === 'lastTargetSurvived' ? killCheckTarget(ctx) : ctx.castTracking?.lastTarget;
      const lastId = last?.id ?? (cond.kind === 'targetStatBeatsCaster' ? ctx.chosenTargetId : undefined);
      // P-R7-dead-last-target-cond: a target the hit killed has left the roster; colour / race / status conditions
      // read the tracked unit object (its state at death), matching native step-0 Count* before the Damage step.
      // lastTargetSurvived / targetStatBeatsCaster keep "gone = false".
      const deadOk = cond.kind === 'lastTargetStatus' || cond.kind === 'lastTargetRace' || cond.kind === 'lastTargetColor';
      const ch = (lastId !== undefined ? findCharacter(ctx.state, lastId) : undefined)
        ?? (deadOk && last?.unit && last.unit.id === lastId ? last.unit : undefined);
      if (!ch) return false;
      switch (cond.kind) {
        case 'lastTargetStatus':
          return ch.statuses.some((s) => sameStatus(s.id, cond.statusId) && s.turns > 0);
        case 'lastTargetRace':
          return hasTroopType(ch, cond.race);
        case 'lastTargetColor':
          return ch.colors.includes(cond.color);
        case 'lastTargetSurvived':
          return !ch.defeated;
        case 'targetStatBeatsCaster': {
          const me = findCharacter(ctx.state, ctx.casterId);
          return !!me && statOf(ch, cond.stat) > statOf(me, cond.stat);
        }
        default: {
          const _never: never = cond;
          return _never;
        }
      }
    }
    case 'chosenTargetStatBeatsCaster':
    case 'chosenTargetDamaged': {
      const chosen = ctx.chosenTargetId === undefined ? undefined : findCharacter(ctx.state, ctx.chosenTargetId);
      if (!chosen || chosen.defeated) return false;
      if (cond.kind === 'chosenTargetDamaged') return chosen.hp < chosen.maxHp;
      const me = findCharacter(ctx.state, ctx.casterId);
      return !!me && statOf(chosen, cond.stat) > statOf(me, cond.stat);
    }
    case 'castSacrificed': return ctx.castTracking?.sacrificeSucceeded === true;
    case 'castEnemyDied': return (ctx.castTracking?.enemyDeaths ?? 0) > 0;
    case 'anyTrackedDied': {
      // R22 批：本次施放任一产目标段的目标阵亡（跨段累积，ifTargetDied 的多目标/跨段形态）
      const list = ctx.castTracking?.allTargets;
      if (!list || list.length === 0) return false;
      return list.some((t) => {
        if (!t.aliveBefore) return false;
        const c = findCharacter(ctx.state, t.id);
        return c === undefined || c.defeated;
      });
    }
    case 'economyAtLeast':
      // 战场经济阈值（batch-r28，7435「如果自身有 12 个或更多灵魂」）：共用池现值直读
      return (cond.currency === 'gold'
        ? goldForSide(ctx.state, effectCasterSide(ctx))
        : ctx.state.economy[cond.currency]) >= cond.n;
    case 'lastTargetStatusAtCastStart': {
      // 施法前状态快照判定（batch-r28，7690「如果该敌人已被冻结」）：读 executePrototype
      // 进入段循环前采集的 statusesAtCastStart——首段施加的状态不影响本判定（时序解耦）
      const last = ctx.castTracking?.lastTarget;
      const snapshot = ctx.castTracking?.statusesAtCastStart;
      if (!last || !snapshot) return false;
      return (snapshot[last.id] ?? []).includes(cond.statusId);
    }
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
  'targetRace', 'targetColor', 'targetStatus', 'targetHpDamaged', 'manaFull', 'targetHasAnyStatus', 'targetKingdom',
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

function statOf(char: Character, stat: 'attack' | 'armor' | 'hp' | 'magic' | 'missingHp' | 'manaCost' | 'mana'): number {
  switch (stat) {
    case 'attack': return char.attack;
    case 'armor': return char.armor;
    case 'hp': return char.hp;
    case 'magic': return char.magic;
    case 'missingHp': return Math.max(0, char.maxHp - char.hp);
    case 'manaCost': return char.manaCost;
    case 'mana': return char.mana;
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
/**
 * Alive units of the caster's ally / enemy side. atCastStart (P-R1-count-at-native-step) reads
 * castTracking.unitsAtCastStart and keys the side off ctx.casterSide when the caster already left the roster.
 */
function armyUnits(ctx: EffectContext, which: 'ally' | 'enemy', atCastStart?: boolean): Character[] {
  const snapshot = atCastStart ? ctx.castTracking?.unitsAtCastStart : undefined;
  const side = findSide(ctx.state, ctx.casterId) ?? (snapshot ? ctx.casterSide ?? null : null);
  if (side === null) return [];
  const targetSide = which === 'ally' ? side : (side === 'Left' ? 'Right' : 'Left');
  if (snapshot) return snapshot[targetSide] ?? [];
  return ctx.state.teams[targetSide].characters.filter((c) => !c.defeated);
}

export function resolveModifierCount(source: ModifierSource, ctx: EffectContext): number {
  const tracking = ctx.castTracking;
  switch (source.kind) {
    case 'chosenColumnAtCastStart':
      return (tracking?.chosenColumnAtCastStart ?? []).filter(g => source.skulls ? isSkull(g) : matchGem(g, source.color)).length;
    case 'chosenRowAtCastStart':
      return (tracking?.chosenRowAtCastStart ?? []).filter(g => source.skulls ? isSkull(g) : matchGem(g, source.color)).length;
    case 'countedAdjacentSpecial': return tracking?.countedAdjacentSpecial ?? 0;
    case 'diagonalGems': {
      const mid = Math.floor((BoardModel.ROWS - 1) / 2);
      const anchor = source.anchor === 'chosenCell' ? ctx.chosenCell : { row: mid, col: mid };
      if (!anchor) return 0;
      let n = 0;
      ctx.state.board.forEach((gem, pos) => {
        if (gem && (pos.row - pos.col === anchor.row - anchor.col || pos.row + pos.col === anchor.row + anchor.col)
          && matchGem(gem.type, source.color)) n++;
      });
      return n;
    }
    case 'destroyedGems': {
      // R22 批：skulls/special 细分筛（7388/7977/8812/9492 骷髅、8927 石像鬼宝石）
      return (tracking?.destroyed ?? []).filter((d) => {
        if (source.skulls) return isSkull(d.gemType);
        if (source.special !== undefined) {
          return d.gemType.kind === 'special' && d.gemType.spec.kind === source.special
            && (source.specialTier === undefined || (d.gemType.spec.tier ?? 1) === source.specialTier);
        }
        return matchGem(d.gemType, source.color);
      }).length;
    }
    case 'transformedGems': {
      // 追踪粒度权衡：transform 事件自带逐格明细，但追踪层只累计总数；
      // 带颜色的「因转换的 X 色宝石数」来源极少（<10 条），第一波按总转化数计，规则手册已注明。
      return source.color === undefined ? (tracking?.transformed ?? 0) : countTransformed(tracking, source.color);
    }
    case 'boardGems': {
      // R22 批：color 可为 'CHOSEN'/'ENEMY_MOST_USED' 动态色（未解析按 0 计），except 排除某色
      let color: BaseColor | null = null;
      if (source.color === 'CHOSEN') color = ctx.chosenColor ?? null;
      else if (source.color === 'ENEMY_MOST_USED') {
        const side = findSide(ctx.state, ctx.casterId);
        color = side === null ? null : mostUsedManaColorForCast(ctx, side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left);
      } else color = source.color ?? null;
      if (source.color !== undefined && color === null) return 0;
      let n = 0;
      ctx.state.board.forEach((gem) => {
        if (!gem || gem.type.kind !== 'color') return;
        if (color !== null && gem.type.color !== color) return;
        if (source.except !== undefined && gem.type.color === source.except) return;
        n += 1;
      });
      return n;
    }
    case 'castStartBoardSkulls': return ctx.castTracking?.skullsAtCastStart ?? 0;
    case 'castStartBoardGems': return ctx.castTracking?.colorGemsAtCastStart?.[source.color] ?? 0;
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
        // tier (gargoyleGem 1 Good / 2 Bad, native Good/BadGargoyle) and color (dragonGem etc., native Dragon<Color>)
        if (gem && gem.type.kind === 'special' && gem.type.spec.kind === source.gem
          && (source.tier === undefined || (gem.type.spec.tier ?? 1) === source.tier)
          && (source.color === undefined || gem.type.spec.color === source.color)) n += 1;
      });
      return n;
    }
    case 'selfStat': {
      const caster = findCharacter(ctx.state, ctx.casterId);
      return caster ? statOf(caster, source.stat) : 0;
    }
    // Army counts (native CountArmyColor / CountArmyType / CountArmyKingdom). atCastStart reads the units alive at
    // cast start (P-R1-count-at-native-step), otherwise the live roster when the consuming segment runs.
    case 'teamSize':
      return armyUnits(ctx, source.side, source.atCastStart).length;
    case 'alliesOfRace':
      return armyUnits(ctx, 'ally', source.atCastStart).filter((c) => hasTroopType(c, source.race)).length;
    case 'enemiesOfRace':
      // 敌方该种族存活计数（K-E 批，与 alliesOfRace 对称、敌方侧形态补齐）
      return armyUnits(ctx, 'enemy', source.atCastStart).filter((c) => hasTroopType(c, source.race)).length;
    case 'alliesOfKingdom':
      // 施法方该王国存活盟友数（Wave4 批，与 alliesOfRace 对称，按 kingdom 筛选）
      return armyUnits(ctx, 'ally', source.atCastStart).filter((c) => matchesKingdom(c, source.kingdom)).length;
    case 'alliesNamed':
      // P-R5-named-ally-count: native CountArmyTroop — one per matching ally, not a boolean like troopPresent
    {
      const names = Array.isArray(source.name) ? source.name : [source.name];
      return armyUnits(ctx, 'ally', source.atCastStart).filter((c) => names.includes(c.name)).length;
    }
    case 'enemiesOfKingdom':
      // 敌方该王国存活计数（Wave4 批，与 enemiesOfColor 同构）
      return armyUnits(ctx, 'enemy', source.atCastStart).filter((c) => matchesKingdom(c, source.kingdom)).length;
    case 'enemyStatusCount': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.filter(
        (c) => !c.defeated && (source.statusId === undefined
          ? c.statuses.some((s) => s.turns > 0)
          : c.statuses.some((s) => sameStatus(s.id, source.statusId) && s.turns > 0)),
      ).length;
    }
    case 'alliesOfColor':
      return armyUnits(ctx, 'ally', source.atCastStart).filter((c) => c.colors.includes(source.color)).length;
    case 'enemiesOfColor':
      // 敌方该法力色存活计数（R13 批，官方 CountArmyColor Target=AllEnemies）：
      // 与 alliesOfColor 同构，仅换算敌方侧。
      return armyUnits(ctx, 'enemy', source.atCastStart).filter((c) => c.colors.includes(source.color)).length;
    case 'allyStatusCount': {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      // excludeSelf (P-R3-ally-status-excl-self): native CountSpecificStatusEffect@AllAlliesButNotSelf
      return ctx.state.teams[side].characters.filter(
        (c) => !c.defeated && !(source.excludeSelf && c.id === ctx.casterId)
          && hasStatusForCast(ctx, c, source.statusId),
      ).length;
    }
    case 'targetStatusCount': {
      // P-R3-target-status-count: native CountSpecificStatusEffect@FromTarget, one step per status (step 0, before
      // this cast's own statuses): how many of the listed statuses the chosen target had at cast start.
      const id = ctx.chosenTargetId ?? tracking?.lastTarget?.id;
      if (id === undefined) return 0;
      const snapshot = tracking?.statusesAtCastStart;
      const had: string[] = snapshot
        ? snapshot[id] ?? []
        : (findCharacter(ctx.state, id)?.statuses ?? []).filter((s) => s.turns > 0).map((s) => s.id);
      return source.statusIds.filter((w) => had.some((h) => sameStatus(h, w))).length;
    }
    case 'enemyStatSum':
      return teamStatSum(ctx, 'enemy', source.stat, source.color);
    case 'allyStatSum':
      return teamStatSum(ctx, 'ally', source.stat, undefined, source.excludeSelf === true);
    case 'targetStat': {
      const last = tracking?.lastTarget;
      if (!last) return 0;
      const ch = findCharacter(ctx.state, last.id);
      return ch ? statOf(ch, source.stat) : 0;
    }
    case 'chosenStat': {
      // R22 批：本次释放手动选定目标的当前属性（8659「等同于其攻击力…再同等伤害」）
      if (ctx.chosenTargetId === undefined) return 0;
      const ch = findCharacter(ctx.state, ctx.chosenTargetId);
      return ch ? statOf(ch, source.stat) : 0;
    }
    case 'lastDamage':
      return tracking?.lastDamage ?? 0;
    case 'enemyFull': {
      // 满值判定（R22 批）：hp 开关缺省不查 hp；mana 开关缺省查 mana（8406 口径），
      // 两者都给 = 同时满足（7808「生命值和法力值满值」）。
      const checkHp = source.hp === true;
      const checkMana = source.mana === true
        ? true
        : (source.mana === undefined && source.hp !== true);
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const enemySide = side === 'Left' ? 'Right' : 'Left';
      return ctx.state.teams[enemySide].characters.filter(
        (c) => !c.defeated
          && (!checkHp || c.hp >= c.maxHp)
          && (!checkMana || c.mana >= c.manaCost),
      ).length;
    }
    case 'casterStatBeatsCount': {
      // R22 批：四围逐项比较 caster > 追踪目标 的命中数（7812「每高于敌方一个技能」）
      const me = findCharacter(ctx.state, ctx.casterId);
      const last = tracking?.lastTarget;
      const foe = last ? findCharacter(ctx.state, last.id) : undefined;
      if (!me || !foe) return 0;
      let n = 0;
      for (const stat of ['attack', 'armor', 'magic', 'hp'] as const) {
        if (statOf(me, stat) > statOf(foe, stat)) n += 1;
      }
      return n;
    }
    case 'drainedMana':
      return tracking?.drainedMana ?? 0;
    case 'countEnemyDeaths':
      // 之前各行动的阵亡计数加上本次施法前序段的阵亡数
      return (ctx.state.battleDeaths?.[opponentOf(effectCasterSide(ctx))] ?? 0) + (tracking?.enemyDeaths ?? 0);
    case 'countAllyDeaths':
      return (ctx.state.battleDeaths?.[effectCasterSide(ctx)] ?? 0) + (tracking?.allyDeaths ?? 0);
    case 'battleGold':
      return goldForSide(ctx.state, effectCasterSide(ctx));
    case 'enemyGold':
      return goldForSide(ctx.state, opponentOf(effectCasterSide(ctx)));
    case 'bothGold':
      return goldForSide(ctx.state, PlayerSide.Left) + goldForSide(ctx.state, PlayerSide.Right);
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
    case 'goldStolen':
      // 本次施放窃取黄金累计（batch-r28）：economy.ts stealGold 段结算写入
      return tracking?.goldStolen ?? 0;
    case 'goldSpent':
      // 本次施放经济支出累计（batch-r28）：economy.ts spendEconomy 段结算写入
      return tracking?.goldSpent ?? 0;
    case 'randomAllyStat': {
      // 泛指单体盟友（batch-r28，7402「一名盟友的攻击力」）：掷选一名存活盟友（含施法者），
      // 缓存到 castTracking.randomAllyId 供 'lastAlly' 目标模式与同施法内重复读取复用
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return 0;
      const allies = ctx.state.teams[side].characters.filter((c) => !c.defeated);
      if (allies.length === 0) return 0;
      const cachedId = tracking?.randomAllyId;
      let pick = cachedId !== undefined ? allies.find((c) => c.id === cachedId) : undefined;
      if (!pick) {
        pick = allies[ctx.rng.nextInt(allies.length)];
        if (tracking) tracking.randomAllyId = pick.id;
      }
      return statOf(pick, source.stat);
    }
    case 'surroundingGems': {
      // 位置锚计数（batch-r28，8804 官方 BoardTarget SurroundingGems）：以最近创造段的
      // 首颗宝石所在格为锚的 8 邻格内某基色宝石数（不含锚格自身；越界自动收边）。
      // 锚缺失（前序无成功创造段）→ 0，消费段按零加成/零次数安全退化。
      const anchor = tracking?.lastCreatedCell;
      if (!anchor) return 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const pos = { row: anchor.row + dr, col: anchor.col + dc };
          if (pos.row < 0 || pos.col < 0 || pos.row >= BoardModel.ROWS || pos.col >= BoardModel.COLS) continue;
          const gem = ctx.state.board.get(pos);
          if (gem && gem.type.kind === 'color' && gem.type.color === source.color) n += 1;
        }
      }
      return n;
    }
    case 'chosenCellBlockGems': {
      const centre = ctx.chosenCell;
      if (!centre) return 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const pos = { row: centre.row + dr, col: centre.col + dc };
          if (pos.row < 0 || pos.col < 0 || pos.row >= BoardModel.ROWS || pos.col >= BoardModel.COLS) continue;
          const gem = ctx.state.board.get(pos);
          if (!gem) continue;
          if (source.skulls ? isSkull(gem.type) : gem.type.kind === 'color' && gem.type.color === source.color) n += 1;
        }
      }
      return n;
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

/** 某方全体的属性总和（R22 批：color 筛法力色、excludeSelf 排除施法者） */
function teamStatSum(
  ctx: EffectContext,
  side: 'ally' | 'enemy',
  stat: 'attack' | 'armor' | 'hp' | 'magic' | 'mana',
  color?: BaseColor,
  excludeSelf = false,
): number {
  const casterSide = findSide(ctx.state, ctx.casterId);
  if (casterSide === null) return 0;
  const targetSide = side === 'ally' ? casterSide : (casterSide === 'Left' ? 'Right' : 'Left');
  let sum = 0;
  for (const c of ctx.state.teams[targetSide].characters) {
    if (c.defeated) continue;
    if (excludeSelf && c.id === ctx.casterId) continue;
    if (color !== undefined && !c.colors.includes(color)) continue;
    sum += statOf(c, stat);
  }
  return sum;
}

/**
 * 计算二次缩放加成（叠加项）：
 *   multiplier：a × count；ratio：floor(count × 百分比 / 100)（R003，[3:1]=34%）。
 * count 为 0 或 spec 缺省 → 0（DoD 边界：无资源退化）。
 * 多来源（sources）：R007-1——原生每个 Count* 步骤独立计数并取整，再相加（ratio 按来源
 * 分别 floor；multiplier 线性不受影响）。社区兵种单一合并计数用 pooled: true。
 * max（batch-r28，官方 CountMax 封顶族）：给出时把加成项夹到 ≤max（封的是加成、
 * 不是总值——「6 颗、[4:1]、上限 14」= 6 + min(floor(gold/4), 8)）。
 */
export function modifierBonus(spec: ModifierSpec | undefined, ctx: EffectContext): number {
  if (!spec) return 0;
  let bonus = 0;
  if (spec.sourceGroups) {
    // One native Count* step per group: sum inside the group, floor once, then add the groups.
    for (const group of spec.sourceGroups) {
      let count = 0;
      for (const s of group) count += resolveModifierCount(s, ctx);
      bonus += scaledCount(spec.mod, count);
    }
  } else if (spec.sources && spec.mod.kind === 'ratio' && !spec.pooled) {
    // R007-1 (rulings/R007-counters-random-pools.md): one floor per native Count* step, then sum.
    for (const s of spec.sources) bonus += scaledCount(spec.mod, resolveModifierCount(s, ctx));
  } else {
    let count = 0;
    if (spec.sources) {
      for (const s of spec.sources) count += resolveModifierCount(s, ctx);
    } else if (spec.source) {
      count = resolveModifierCount(spec.source, ctx);
    }
    bonus = scaledCount(spec.mod, count);
  }
  if (bonus === 0) return 0;
  return spec.max !== undefined ? Math.min(bonus, Math.max(0, spec.max)) : bonus;
}

/** 单一计数的折算：multiplier = a × count；ratio = floor(count × 百分比 / 100)（R003） */
function scaledCount(mod: SecondaryModifier, count: number): number {
  if (count <= 0) return 0;
  if (mod.kind === 'multiplier') return mod.a * count;
  const per = Math.max(1, Math.floor(mod.a));
  const m = Math.max(0, Math.floor(mod.b ?? 0));
  // R003 (rulings/R003-count-threshold-labels.md): the native Count* Amount is a percentage and
  // [N:M] is only its display label, so the counter is floor(count × Amount / 100). Exact labels
  // ([1:1]=100, [2:1]=50, [4:1]=25, [20:3]=15, [1:2]=200) map to that percentage directly; the
  // non-terminating [N:1] labels are stored natively as the rounded-up percentage
  // ([3:1]=34, [6:1]=17, [8:1]=13), e.g. armor 50 at [3:1] -> 17, not floor(50 / 3) = 16.
  const pct = (100 * m) / per;
  if (Number.isInteger(pct)) return Math.floor((count * pct) / 100);
  if (m === 1) return Math.floor((count * Math.ceil(pct)) / 100);
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
