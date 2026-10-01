/**
 * 被动特质系统（需求 7.1；原 GAP-4）。
 *
 * ## 设计
 *
 * 特质是**声明式数据**，不是回调代码。表由 `scripts/build_traits.mjs` 从 GoW 官方
 * dump 的中文描述解析生成（`src/data/traits.json`），运行时不解析文本。战斗开始时
 * 把角色身上的特质编译成一份 `PassiveModifiers` 挂在 `Character.passive` 上，之后
 * 骷髅结算、技能伤害、状态施加、法力分配、回合尾只读这份已算好的修正。
 *
 * 这样做的原因是结算路径不必改签名——`damageOne()` 这类深处的纯函数拿不到注册表，
 * 若走「传 lookup」的路子要贯穿整条伤害分配链（溅射、链式）。编译成数据后热路径
 * 零改造，修正还可序列化、可直接断言。
 *
 * ## 叠加规则
 *
 * 同类减伤取**最强的一项**，不做连乘——连乘会让高稀有度兵种迅速接近免疫，玩家也
 * 无法预期实际减伤比例。免疫取并集；恢复/受击增益等同类累加；减伤留 5% 下限，
 * 避免完全免疫导致战斗打不完。
 *
 * ## 覆盖范围
 *
 * 官方共 785 个 trait code。已实现 785 个（覆盖 5394 次兵种出场，兵种侧全覆盖），涵盖：骷髅减伤、
 * 法术减伤、状态免疫（含死亡标记/猎人标记/恐怖/疾病扩展）、开局法力、每回合恢复、
 * 受击增益、命中附带状态/增益（含死亡标记/猎人标记/受诅/疾病/出血）、
 * 全体光环、按颜色盟友计数的自身光环、法力灵链、吞噬、风暴、大连/配色全族钩子、
 * 开局转换、回合开始削减/窃取/爆破、额外回合触发、召唤响应、施法响应伤害（特质收尾批后无留弃）。
 *
 * 兵种侧 785 code 全部可表达（数据缺口仅剩 dump 无兵种载体的 Delve/Boss/觉醒内容）；
 * 生成器侧缺机制归档见 `artifacts/trait-build.txt`（历史归档，收尾批后归零）。
 */
import traitTable from '../data/traits.json';
import { normalizeCombatText } from '../data/combatText';
import { COMMUNITY_TRAITS } from '../data/communityTraits';
import { effectiveHealing } from './healing';
import type { BuffEvent, GameEvent } from './events';
import type { Character, PassiveModifiers, SpecialGemKind, StatGains, PlayerSide, StatusInstance, StormSummon, TraitEconomyGain } from './types';
import { BaseColor } from './types';
import { SeededRNG } from './rng';

/** 状态免疫通配符：免疫所有状态 */
export const ALL_STATUSES = '*';
/** 法力灵链通配符：所有颜色 */
export const ALL_COLORS = '*';

export type PassiveStat = keyof StatGains;

/** 一条特质的声明。字段全部可选——一条特质只填它真正影响的部分。 */
export interface TraitDefinition {
  code: string;
  name: string;
  description: string;
  /** 使用该特质的兵种数量，仅供参考与排序 */
  troops?: number;
  skullDamageReduction?: number;
  spellDamageReduction?: number;
  statusImmunities?: readonly string[];
  /** 战斗开始时获得的法力占需求的比例（1 = 满） */
  battleStartManaRatio?: number;
  /** 战斗开始时召唤的风暴。风暴不是兵种，仍走 TurnEngine 的全局顶替裁定。 */
  battleStartStorm?: StormSummon & {
    troopId: number;
    referenceName: string;
    displayName: string;
  };
  /** 每回合开始恢复；alsoStats 为共享数值的附加属性（wildhorns「攻击力、生命值和护甲值获得2点提升」） */
  regen?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 自身受到伤害后获得 */
  onDamagedGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 自身受到伤害后自身获得状态（aquatic「在自身受到伤害时使自身下潜」）；施加走 applyStatus，免疫在施加口拦截 */
  onDamagedStatus?: { statusId: string; turns: number };
  /**
   * 自身承受骷髅伤害时使**对方阵营**队伍序首位存活陷入状态（deathray 死光「在自身生命值
   * 受损时，使敌方第一名敌人陷入死亡标记效果」）。与 onDamagedStatus 同一触发点
   * （CombatResolver 骷髅受击结算处，闪避/屏障/挣扎路径不触发、激怒无视敌方特质）；
   * 受魅惑反打时按持有者归属取对面（与 onDamagedTypeAura 同款裁定）。施加走 applyStatus，
   * 免疫在施加口拦截。建模子集：技能伤害路径（damageOne）不触发。
   */
  onDamagedEnemyStatus?: { id: string; turns: number };
  /**
   * 自身承受骷髅伤害时对**对方全体存活**造成固定额技能伤害（manyheads 九头攻击「当敌人造成
   * 骷髅头伤害时，全体敌人受到 3 点伤害」）。触发点与 gainOnDamaged 同口径（落空不触发），
   * 消费在 TurnEngine.applyDamagedTriggersFromEvents（伤害经 damageOne 管线注入）。
   */
  onSkullDamagedEnemyDamage?: { amount: number };
  /**
   * 自身承受骷髅伤害时创造特殊宝石（onyxshard 缟玛瑙碎片「创造 2 颗极度末日骷髅头」/
   * *shard 巨人宝石族 / 法力药水族）。随机现存格就地翻新（满盘创造的代理口径，与
   * onDeathCreateGem 同源），color 为六色族宝石的归属基色；消费在
   * TurnEngine.applyDamagedTriggersFromEvents（处在 runCascades 组结算内，不重入连锁）。
   */
  onDamagedCreateGem?: { gem: SpecialGemKind; tier?: number; color?: string; count: number };
  /** 自己身亡时向战场经济池入账（valuable「在自身身亡时获得 25 黄金」） */
  onDeathEconomy?: { currency: keyof TraitEconomyGain; amount: number };
  /** On actual death, fill one random surviving ally's mana (not the dead holder). */
  onSelfDeathFillAllyMana?: boolean;
  /** 自己身亡时创造 N 颗特殊宝石（T4 批 unstablecore「在我身亡时创造 3 颗炸弹宝石」） */
  onDeathCreateGem?: { gem: SpecialGemKind; tier?: number; count: number };
  /** 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」）：reduce 原语 stat='mana' 的执行入口跳过 */
  manaOpsImmunity?: boolean;
  /** 自己造成骷髅伤害时获得 */
  onSkullHitGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 同队任一角色施法时获得 */
  onAllyCastGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 敌方任一角色施法时获得 */
  onEnemyCastGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 敌方角色阵亡时获得；alsoStats 为共享数值的附加属性（sacrifice「所有技能增加 3 点」= 四项各 3） */
  onEnemyDeathGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 敌方角色阵亡时自身获得状态（bloodlust「在敌人身亡时获得狂怒效果」） */
  onEnemyDeathStatus?: { id: string; turns: number };
  /** 敌方角色阵亡时同队指定种族盟友获得数值（lordofdeath）；troopType 'all' = 全队（virtueofjustice） */
  onEnemyDeathTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 同队角色阵亡时同队指定范围盟友获得数值（virtueofsacrifice「当一名盟友身亡时，所有盟友获得…」） */
  onAllyDeathTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 同队任一角色施法时同队指定范围盟友获得数值（virtueofloyalty「当一名盟友施放法术时，所有盟友获得…」） */
  onAllyCastTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 自身承受伤害时同队指定范围盟友获得数值（virtueofhumility「当自身生命值承受伤害时，所有盟友获得…」） */
  onDamagedTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 敌方角色阵亡时使死者一方仍存活的另一名角色陷入状态（sharedfate「使另一名敌人陷入死亡标记状态」） */
  onEnemyDeathEnemyStatus?: { id: string; turns: number };
  /** 同队角色阵亡时获得 */
  onAllyDeathGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 自己一方匹配 4 或 5 连时获得；alsoStats 为共享数值的附加属性（vast「N 点攻击力、生命值和护甲」） */
  onBigMatchGain?: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 自己造成骷髅伤害时给目标施加的状态 */
  inflictOnSkullHit?: { id: string; turns: number; magnitude?: number };
  /**
   * 造成骷髅伤害时给目标施加的**多条**状态（brokenjaw 断颚「使第一位敌人陷入出血和沉默
   * 状态」）。与 inflictOnSkullHit 同一触发点、条目按描述顺序保留，DoT 带 magnitude；
   * 结算侧在单条施加点之后逐条施加（CombatResolver）。
   */
  inflictOnSkullHitList?: readonly { id: string; turns: number; magnitude?: number }[];
  /**
   * 造成骷髅伤害时窃取本次受击目标的法力（siphon 吸星大法「窃取敌人法力值」；官方
   * RawData Modifier=1，描述无数量词）。偷多少削多少（目标夹零、自己按 manaCost 夹取），
   * manashield 免疫在削减口整体跳过；消费在 CombatResolver 骷髅结算口。
   */
  onSkullHitStealMana?: number;
  /** 承受骷髅伤害时给攻击者施加的状态（毒孢子族） */
  inflictOnSkullDamaged?: { id: string; turns: number; magnitude?: number };
  /** 承受骷髅伤害时给攻击者施加的多条状态（双状态诅咒族 frozencurse 等「陷入诅咒和X状态」） */
  inflictOnSkullDamagedList?: readonly { id: string; turns: number; magnitude?: number }[];
  /** 自己一方匹配 4/5 连时，给同队指定种族（或全队）盟友的增益 */
  onBigMatchTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 战斗开始时对全体盟友/敌人的固定增减 */
  teamAura?: { scope: 'allies' | 'enemies'; stat: PassiveStat | 'random'; amount: number };
  /** 战斗开始时给同队指定种族的盟友加值（族亲 / 之盾） */
  typeAura?: { troopType: string; stat: PassiveStat; amount: number };
  /** 战斗开始时按「关联该色的盟友数量」给自己叠加 */
  perAllyColor?: { color: string; stat: PassiveStat; amount: number };
  /** 反弹给攻击者的骷髅伤害比例 */
  reflectSkullRatio?: number;
  /** 闪避骷髅伤害的概率 */
  dodgeChance?: number;
  /** 匹配该色宝石时额外法力 */
  manaLink?: { color: string; amount: number };
  /** 匹配该色宝石时获得数值；alsoStats 为共享数值的附加属性（ragingbull「N 点攻击力、护甲值和生命值」） */
  onColorMatchGain?: { color: string; stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] };
  /** 同一次配色可给予不同属性不同点数（自定义部队）。 */
  onColorMatchGains?: readonly { color: string; stat: PassiveStat; amount: number }[];
  /**
   * 自己一方匹配 4/5 连时施加状态（条件光环批：celestialshield 屏障 / provocation 狂怒 /
   * tsunami 下潜 / mirrorimage 反射 / dragonsblessing 随机正面增益 / lotusblessing 50% 赐福全队）。
   * 施加经 BigMatchTriggerContext.applyStatus 注入（TurnEngine 传 status.applyStatus），DoT 带 magnitude。
   */
  onBigMatchStatus?: {
    scope: 'self' | 'randomAlly' | 'allAllies' | 'allEnemies' | 'randomEnemy' | 'firstEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    randomPositive?: boolean;
    /** 随机负面池掷签（experiment「陷入一个随机的状态效果」，statuses 为负面池；仅 randomEnemy） */
    randomNegative?: boolean;
    minSize?: number;
    /**
     * 独立概率掷（maladycurse「Independent 25% chances to inflict Curse or Death Mark」）：
     * 每条状态各自掷一次 chance（各中各的），而非一次判定全上；每条各耗一次种子化 rng。
     */
    independentChance?: boolean;
  };
  /** 配对 N 连限定自身增益（insanegrowth「配对 5 或 5 颗」官方文本只认 5 连） */
  onBigMatchSizedGain?: { minSize: number; stat: PassiveStat; amount: number };
  /** 匹配某色宝石时给同队指定范围盟友加值（celestial/powerof/各色 aura 族）；scope 为 'all'/种族/颜色；色可为 'skull' */
  onColorMatchTypeAura?: { color: string; scope: string; gains: Partial<StatGains> };
  /** 自己一方 4+ 连时净化全队（royalhoney）：移除全部负面状态 */
  onBigMatchCleanse?: { minSize?: number };
  /** 匹配某色宝石时净化全队（adagio） */
  onColorMatchCleanse?: { color: string };
  /**
   * 配对某色（或骷髅）宝石时给随机一名敌人施加状态（T5 配色状态批 16 code：
   * molten/sunfire/deepwounds/foxfire…）。风格对齐 onBigMatchStatus 的 randomEnemy 分支：
   * 施加经 applyStatus 注入（TurnEngine 传 status.applyStatus，免疫在施加口拦截）；
   * 随机目标与概率（foxfire「有 50% 的几率」用 chance）经 rng 注入判定。turns 缺省 3
   * （与大连施加同口径），编译进 PassiveModifiers.colorMatchStatus 的同色键。
   */
  onColorMatchStatus?: {
    color: BaseColor | 'skull';
    scope: 'randomEnemy' | 'randomAlly' | 'self';
    statuses: readonly { id: string; magnitude?: number }[];
    turns?: number;
    chance?: number;
    /** 独立概率掷（brambleheart「Independent 50% chances to Entangle or inflict Bleed」）：
     *  每条状态各自掷一次 chance（各中各的），每条各耗一次种子化 rng */
    independentChance?: boolean;
  };
  /**
   * 配对某色（或骷髅）宝石时窃取首位敌人的生命（T5 窃取批 5 code：corruption/poisontide/
   * justabite/darkesthunger/ladyofdesire「在配对X色宝石时窃取第一/首位敌人 N 点生命值」）。
   * 口径与技能 drain（settleDrain）一致：对首位存活敌人造成 amount 伤害（TurnEngine 注入
   * drainLife 回调走 damageOne 管线），持有者按目标实际失血增加当前与最大生命；编译进
   * PassiveModifiers.colorMatchDrain 的同色键。
   */
  onColorMatchDrain?: { color: BaseColor | 'skull'; amount: number };
  /**
   * 配对某色（或骷髅）宝石时对随机一名敌人造成技能伤害（T5 杂项批 lumpofcoal/dawnslayer/
   * sleetstorm「在配对X色宝石时，对一名随机敌人造成 N 点伤害」）。触发点与配色施加状态/
   * 窃取生命同点（applyColorMatchTriggers）；伤害经 opts.damage 注入（damageOne 管线，
   * 同技能伤害口径），随机目标消耗一次种子化 rng。编译进 colorMatchDamage 的同色键
   * （同色键累加，与 onColorMatchDrain 同口径）。
   */
  onColorMatchDamage?: { color: BaseColor | 'skull'; amount: number; scope?: 'randomEnemy' | 'allEnemies' };
  /**
   * 自己一方配对 4/5 连时对敌人造成技能伤害（T5 大连伤害批 3 code：shock/tentacles/
   * lightningbolt「在配对 4 或 5 颗宝石时对…造成 N 点伤害」）。伤害经
   * BigMatchTriggerContext.damage 注入（TurnEngine 传 damageOne 管线，法术减伤/屏障/
   * 护甲/阵亡同口径）产出 skill-damage 事件；randomEnemy 每条规格耗一次种子化随机数
   * （与施加状态的随机分支同口径）；minSize 缺省 4（「4 或 5 颗」= 任意大连）。
   */
  onBigMatchDamage?: { amount: number; scope: 'randomEnemy' | 'enemyAll' | 'lastEnemy'; minSize?: number };
  /**
   * 自己一方配对 4/5 连时削减敌方属性（T5 大连敌减批 5 code：suppression/aspectofplague/
   * technomancy/creepinggloom/chillingaura「敌人/一名随机敌人损失/耗掉/窃取 N 点X」）。
   * reduce 语义（不给自己）：目标属性夹零发负 buff 事件，mana 为耗蓝口径（manashield
   * 免疫在削减口拦截）；front=首位存活敌人、randomEnemy 走种子化 rng；minSize 缺省 4。
   * chillingaura 官方文本是「窃取」，按批裁定落纯削减（自身不进账）。
   */
  onBigMatchEnemyDrain?: {
    stat: 'attack' | 'armor' | 'magic' | 'mana';
    amount: number;
    scope: 'front' | 'randomEnemy' | 'allEnemies';
    minSize?: number;
  };
  /**
   * 自己一方配对 4/5 连（或 4+ 连）时创造特殊宝石（T4 大连创造批 4 code：wildtribe/
   * wildmagic x2 通配、twinfires 燃烧、spectromancy x3 通配「在配对 4 或更多宝石时
   * （有 N% 几率）创建…」）。落子经 BigMatchTriggerContext.createGem 注入（TurnEngine
   * 写棋盘 + gem-transform 事件，新造宝石参与的匹配由外层 runCascades 下一轮吸收）；
   * minSize 缺省 4（「4 或更多」= 任意大连，与 onBigMatchStatus 同口径）。
   */
  onBigMatchCreateGem?: {
    gem: SpecialGemKind;
    tier?: number;
    color?: string;
    count: number;
    chance?: number;
    minSize?: number;
  };
  /**
   * 配对 N 连时把生命转换为魔法（T5 杂项批 trascend「在配对 4 或 5 颗宝石时，将 2 点
   * 生命值替换成 2 点魔力值」）：持有者自身 1:1 交换（from 侧减、to 侧加），生命侧保底
   * 1 点（特质不自杀），实际减少额 = 魔法获得额；不掷随机数。minSize 缺省 4。
   */
  onBigMatchConvert?: { from: 'hp'; to: 'magic'; amount: number; minSize?: number };
  /**
   * 配对 N 连时按概率召唤兵种（T5 杂项批 genieslamp「配对 4+ 有 30% 的几率召唤一名神灯
   * 之灵」/stormflock）：复用死亡召唤基建（summonOnDeath 的模板装配/入队管线同源），
   * 召唤物归持有者一方；概率经 ctx.summon 注入口内的种子化 rng 判定。
   * minSize 缺省 4（「4 或更多」= 任意大连）。
   */
  onBigMatchSummon?: { chance: number; troopId: number; referenceName: string; displayName: string; minSize?: number };
  /**
   * 配对 N 连时创造风暴（T5 杂项批 deadlywaters「在配对 4 或 5 颗宝石时，创造骸骨风暴」）。
   * 风暴不是兵种：经 ctx.setStorm 注入口走 TurnEngine 的全局唯一顶替裁定（与技能造风暴
   * 同一 storm-change 事件形态），troopId 为虚拟风暴号段。minSize 缺省 4。
   */
  onBigMatchStorm?: StormSummon & { troopId: number; referenceName: string; displayName: string; minSize?: number };
  /**
   * 配对 N 连时按概率即杀（T5 杂项批 deathbelow「有 8% 的几率猎杀最后一名敌人」）。
   * 即死概率原语（death-mark 的回合开始 10% 即死先例同族）：概率走种子化 rng（无 rng
   * 不生效），目标=敌方队伍序末位存活（确定性），处决经 ctx.kill 注入口走 defeat
   * 出编队管线。minSize 缺省 4。
   */
  onBigMatchKill?: { chance: number; scope: 'lastEnemy'; minSize?: number };
  /** 敌方配对某色/骷髅时自身获得（rancor「在敌人配对骷髅头时，获得 3 点攻击力」） */
  onEnemyColorMatchGain?: { color: string; stat: PassiveStat; amount: number };
  /**
   * 回合开始时把棋盘上随机一格变成该色宝石；count 为数量（intothevoid「创造 2 颗紫色宝石」）。
   * color 'skull' = 普通骷髅头（bonefeast「创造 2 颗骷髅头」，TurnEngine 落 { kind:'skull' }）。
   */
  turnStartCreateGem?: { color: string; count?: number };
  /** 回合开始时按概率把一颗该色宝石转成骷髅头 */
  turnStartColorToSkull?: { color: string; chance: number };
  /**
   * 回合开始时创造特殊宝石（T4 批 spidersilk 织网 / haunted 鬼魂 / eyeofdestruction 末日骷髅…）。
   * 满盘创造的代理口径：随机互不相同的 N 个现存格就地翻新成特殊宝石（与技能 doCreate 的
   * 转化回退同源），改完棋盘立即 runCascades；chance 缺省必定。color 为六色族宝石
   *（dragonGem/giantGem/spiritGem/manaPotionGem/candyGem）的归属基色（oceankin 蓝龙宝石）。
   */
  turnStartCreateSpecialGem?: { gem: SpecialGemKind; tier?: number; color?: string; count: number; chance?: number };
  /**
   * 回合开始时把 N 颗某色（或骷髅头）宝石转换成特殊宝石（T4 批 redrage/embers 红→燃烧、
   * daemonsmark/kinofchaos 骷髅→末日骷髅、temporal 黄→沙漏族；接线批 lycanthropy 紫→狼化、
   * kinof* 六色→龙宝石族）。目标格按来源色/骷髅筛选（转换后不再是来源类型，天然不重复命中）；
   * chance 缺省必定。gemColor 为六色族目标宝石的归属基色（与来源色 color 分名防混淆）。
   */
  turnStartColorToSpecial?: {
    color: BaseColor | 'skull';
    gem: SpecialGemKind;
    tier?: number;
    /** 六色族目标宝石的归属基色（kinof*「蓝色宝石→蓝龙宝石」族；与来源色 color 分名防混淆） */
    gemColor?: string;
    count: number;
    chance?: number;
  };
  // ———— 特质收尾批（2026-09-19，最后 23 个无定义 code 的官方 EN 权威钩子）————
  // 消费全部走「定义直读」（TurnEngine 在触发点 getTrait(code)，同 turnStartChanceGain
  // 口径）——不进 PassiveModifiers、无中性形态键，无此特质的对局零事件零随机消耗。
  /**
   * 战斗开始时有 chance 几率把 N 颗某色宝石转换为特殊宝石（冬之宫廷恩赐 wintercourtsboon
   * 「35% chance to convert 3 Blue Gems to Freeze Gems」/ 夏之宫廷恩赐 summercourtsboon
   * 同族）。消费在 TurnEngine.applyBattleStartConvertTraits（构造期事件，棋盘已生成）；
   * 目标格复用 randomCellOfColor（每颗各耗一次 rng，与 turnStartColorToSpecial 同口径），
   * 转换后立即 runCascades。
   */
  battleStartConvertGems?: { color: BaseColor; gem: SpecialGemKind; tier?: number; count: number; chance: number };
  /**
   * 自己一方获得额外回合时自身获得属性（大牙 bigteeth「Gain 1 Attack when allies gain an
   * Extra Turn」）。消费在 finishTurn 的额外回合分支（匹配/技能两种来源统一在此结算，
   * 技能额外回合按既有契约延迟到下一次交换行动的回合尾）。
   */
  onExtraTurnGain?: { stat: PassiveStat; amount: number };
  /**
   * 自己一方获得额外回合时给同队指定范围施加状态（时间精华 essenceoftime「Enchant all
   * Allies when I get an extra turn」）。scope=allAllies / self；施加经 applyStatus
   * （免疫在施加口拦截）。
   */
  onExtraTurnStatus?: { scope: 'self' | 'allAllies'; id: string; turns: number };
  /**
   * 同队任一角色召唤部队后召唤一场风暴（召唤自然 callnature「Summon a Leafstorm when an
   * ally summons a troop」）。colors 为官方 BoostColors 的惰性建模（混合风暴双色，
   * 引擎契约取 colors[0]，与 turnStartStorm 同口径）。消费在行动末尾的 summon 事件扫描。
   */
  onAllySummonStorm?: { referenceName: string; displayName: string; troopId: number; colors: readonly BaseColor[]; dropKind?: 'skull' | 'doomSkull' | 'uberDoomSkull' };
  /**
   * 同队任一角色被召唤后自身获得属性（召唤仪式 summoningritual「Gain 8 Magic after an
   * Ally is summoned」）。消费与 onAllySummonStorm 同点（召唤事件按 player 归属触发
   * 持有者一方全员）。
   */
  onAllySummonGain?: { stat: PassiveStat; amount: number };
  /**
   * 回合开始时削减首位敌人的全部技能值（饥荒相 aspectoffamine「First enemy loses 3 Skill
   * points at the start of each turn」；官方 "Skill points" = 攻击/护甲/生命/魔法四项各减，
   * 与 powerof* 族「全部技能值」同口径）。削减语义同 onBigMatchEnemyDrain（夹零发负
   * buff 事件，不给自己进账）；目标=持有者对面阵营队伍序首位存活（确定性、零随机消耗）。
   */
  turnStartEnemyDrain?: { amount: number };
  /** 回合开始时从首位敌人窃取生命（死亡相 aspectofdeath「Steal 2 Life from the first enemy」）：伤害经 traitDrainLife（damageOne 管线 + 持有者按目标实际失血增加当前与最大生命）。 */
  turnStartStealLife?: { amount: number };
  /** 回合开始时从首位敌人窃取法力（猴王魔法 monkeymagic「Steal 2 Magic from the first enemy」）：削减口径同 onSkullHitStealMana（目标夹零、manashield 免疫整体跳过、自己按 manaCost 夹取）。 */
  turnStartStealMana?: { amount: number };
  /**
   * 回合开始时爆破宝石（陷阱古墓 trappedtomb「爆破 2 颗随机宝石」/ 星火 onelittlespark
   * 「爆破 2 颗骷髅头」/ 天使迸发 angelicburst「爆破一颗天使宝石」）。kind='random'=
   * 任意宝石、'skull'=普通骷髅头、特殊宝石 kind=盘上该类宝石；命中格移除后走
   * resolveBoardChange（结算归持有者一方、连锁照常），候选唯一不掷骰。
   */
  turnStartExplodeGem?: { kind: 'random' | 'skull' | SpecialGemKind; tier?: number; count: number };
  /** 造成骷髅头伤害时爆破 N 颗随机宝石（天崩地裂 cataclysm「Explode 2 random Gems when I deal skull damage」）：消费在 applyDamagedTriggersFromEvents 的攻击者侧扫描（skull-damage 实扣才触发）。 */
  onSkullHitExplodeGem?: { count: number };
  /**
   * 配对某色宝石时爆破一颗随机宝石（暗藏陷阱 hiddentrap「Explode a random Gem when
   * matching Yellow Gems」）。消费在 applyColorMatchTriggers（ctx.explodeSpec 注入）；
   * kind 固定 'random'（官方语义任意宝石，非关联色）。
   */
  onColorMatchExplodeGem?: { color: BaseColor | 'skull'; count: number };
  /**
   * 同队任一角色施放法术时对敌人造成技能伤害（蝰蛇之牙 serpentsfang「Deal 3 damage to a
   * random enemy when an ally casts a spell」/ 炮火支援 artillerysupport「Deal 5 damage to
   * all Enemies」）。伤害经 traitDamage（damageOne 管线），随机目标耗一次种子化 rng。
   */
  onAllyCastEnemyDamage?: { amount: number; scope: 'randomEnemy' | 'enemyAll' };
  /** 同队任一角色施放法术时创造特殊宝石（天眼通 clairvoyance「Create a Good Gargoyle Gem when an Ally casts a spell」）：落子经 spawnSpecialGems（随机现存格就地翻新）。 */
  onAllyCastCreateGem?: { gem: SpecialGemKind; tier?: number; count: number };
  /** 对特定种族的骷髅伤害倍率 */
  skullMultVsTroopType?: { troopType: string; mult: number };
  /** 对处于特定状态的目标的骷髅伤害倍率 */
  skullMultVsStatus?: { status: string; mult: number };
  /**
   * 对处于多个指定状态（任一命中即可）目标的骷髅伤害倍率（lethaltoxin「对陷入中毒和织网
   * 状态的敌人造成三倍骷髅头伤害」→ 中毒×3 与织网×3 两条）。编译进 skullMultVsStatus
   * 同一张倍率表（同状态键取最强），结算侧无差别。
   */
  skullMultVsStatusList?: readonly { status: string; mult: number }[];
  /** 对关联特定法力色的目标的骷髅伤害倍率 */
  skullMultVsColor?: { color: string; mult: number };
  /** 对已受伤目标的骷髅伤害倍率 */
  skullMultVsWounded?: number;
  /** 骷髅伤害无视护甲的概率 */
  armorPierceChance?: number;
  /** 无法成为技能指定目标（隐匿） */
  untargetable?: boolean;
  /** 自己身亡时按概率召唤（daemonicpact/terrorpact 族；summon 为兵种中文名，由生成器解析成 referenceName；带 storm 时为风暴变体，不产出兵种） */
  summonOnDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon; /** 复活族（immortal/deepsoul/rebirth/eternaldawn 等）：召唤物以满法力入场 */ fullMana?: boolean };
  /** 一名盟友（含自己）身亡时召唤（fromdark/fromashes 族） */
  summonOnAllyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon; /** 复活族（immortal/deepsoul/rebirth/eternaldawn 等）：召唤物以满法力入场 */ fullMana?: boolean };
  /** 敌方角色身亡时召唤（darkdeath/icydeath 族） */
  summonOnEnemyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon; /** 复活族（immortal/deepsoul/rebirth/eternaldawn 等）：召唤物以满法力入场 */ fullMana?: boolean };
  /**
   * 自身承受骷髅伤害时按概率召唤（职业天赋 golemprotector「当我受到伤害时，有 20% 的
   * 几率召唤一只远古魔像」）。与死亡召唤同构的规格；触发点 = 骷髅受击结算处（与
   * gainOnDamaged 同口径：闪避/屏障/挣扎的落空不触发；技能伤害不触发，建模子集）。
   * 编译进 PassiveModifiers.summonOnDamaged，TurnEngine 在骷髅结算后统一消费。
   */
  summonOnDamaged?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /**
   * 同队任一角色（含持有者）施放法术时按概率召唤（职业天赋 childofsky「当盟友施放法术时，
   * 有 25% 的几率召唤一只苍鹭巨兽」）。编译进 PassiveModifiers.summonOnAllyCast，
   * TurnEngine 在施法响应区统一消费；召唤物归持有者一方。
   */
  summonOnAllyCast?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /**
   * 骷髅伤害附加护甲比（职业天赋 razorarmor「骷髅头伤害附加 20% 的护甲值」）：持有者
   * （攻击方队首）造成骷髅伤害时，附加 自身护甲值 × ratio 的固定伤害（计入 doom 骷髅
   * 加伤之后的同一 bonus 通道，吃目标减伤/护甲结算）。编译进
   * PassiveModifiers.skullDamageFromArmorRatio，TurnEngine 骷髅结算口消费。
   */
  skullDamageFromArmorRatio?: number;
  /**
   * 自己一方配对 4/5 连时驱散所有敌人（职业天赋 banishment「配对 4 或 5 颗宝石时，
   * 驱散所有敌人」）：移除敌方全队存活的**正面**状态（正面清单与诅咒剥正面同源）。
   * 编译进 PassiveModifiers.onBigMatchDispelEnemies，大匹配触发点消费。
   */
  onBigMatchDispelEnemies?: boolean;
  /**
   * 自己一方配对 4/5 连时净化自身（职业天赋 purification「配对 4 或 5 颗宝石时，净化
   * 自身」）：移除持有者自身的负面状态。与 cleanseOnBigMatch（全队）同点不同范围。
   * 编译进 PassiveModifiers.onBigMatchCleanseSelf。
   */
  onBigMatchCleanseSelf?: boolean;
  /**
   * 自己一方配对 4/5 连时窃取首位敌人生命（职业天赋 lifesiphon「配对 4 或 5 颗宝石时，
   * 窃取第一名敌人 2 点生命值」）。同色窃取批 onColorMatchDrain 的大连版：front 目标
   * 确定性、伤害经 drainLife 注入（持有者按目标实际失血增长生命及上限）。编译进
   * PassiveModifiers.onBigMatchDrainLife。
   */
  onBigMatchDrainLife?: { amount: number; minSize?: number };
  /**
   * 自己一方配对 4/5 连时爆破 N 颗关联色宝石（职业天赋 lightningstrike「配对 4 或 5 颗
   * 宝石时，爆破一颗黄色宝石」）。落子口径同开局爆破 omenof*：命中格移除后走
   * resolveBoardChange（法力归持有者一方、重力连锁照常），候选唯一不掷骰、多候选耗
   * 一次 rng。编译进 PassiveModifiers.onBigMatchExplodeGem，TurnEngine 注入爆破口消费。
   *
   * kind 扩展（特质收尾批）：'random'=任意宝石（unstablepossession「爆破 2 颗随机宝石」/
   * trappedtomb 同族大连接口）、'skull'=普通骷髅头（goodomen 族按 kind 爆破）、
   * 特殊宝石 kind=爆破盘上该类特殊宝石（gargoyleGem tier 1=善神石像鬼宝石）。
   * 带 kind 时 color 缺省；两者都缺省按 legacy 色爆破（既有 lightningstrike 数据不变）。
   */
  onBigMatchExplodeGem?: { color?: string; kind?: 'random' | 'skull' | SpecialGemKind; tier?: number; count?: number; minSize?: number };
  /** 自己一方配对 4/5 连时创造 N 颗**普通色**宝石（lunarscales「有 50% 的几率创造 3 颗紫色宝石」；特殊宝石走 onBigMatchCreateGem）。概率缺省必定。 */
  onBigMatchCreatePlainGem?: { color: BaseColor; count: number; chance?: number; minSize?: number };
  /**
   * 自己一方配对 4/5 连时召唤一个**随机**风暴（职业天赋 chaosstorm「配对 4 或 5 颗宝石时，
   * 召唤一个随机风暴」）。风暴种类经 rng 从七大基础风暴（光/暗/冰/火/叶/尘/骸骨）均匀
   * 掷取；设置经 ctx.setStorm 注入，全局唯一顶替裁定照常。编译进
   * PassiveModifiers.onBigMatchRandomStorm。
   */
  onBigMatchRandomStorm?: { minSize?: number };
  /**
   * 自己召唤部队后，使一名随机敌人陷入状态（职业天赋 hauntedweave「当我召唤部队时，
   * 织网一名随机敌人」）。触发点 = 持有者可归因的召唤完成（死亡召唤/大连召唤/回合召唤
   * /施法召唤），施加经注入 applyStatus。编译进 PassiveModifiers.onSelfSummonStatus。
   */
  onSelfSummonStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /**
   * 同队角色阵亡时施加状态（职业天赋 savior「当盟友身亡时，给另一名随机盟友屏障」/
   * feyvengeance「当盟友身亡时，使随机敌人妖火」/ upinflames 燃烧）：target=randomAlly
   * 从持有者一方存活取、randomEnemy 从对方存活取，随机目标经注入 rng。编译进
   * PassiveModifiers.onAllyDeathStatus。
   */
  onAllyDeathStatus?: {
    target: 'randomAlly' | 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
  };
  /**
   * 敌方角色阵亡时，使死者一方**另一名随机**存活角色陷入状态（职业天赋 chillofdeath
   * 「当敌人身亡时，冻结另一名随机敌人」；sharedfate 的随机目标变体——sharedfate 是
   * 确定性取首个存活）。编译进 PassiveModifiers.onEnemyDeathRandomStatus。
   */
  onEnemyDeathRandomStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /**
   * 敌方角色阵亡时按概率猎杀最后一名敌人（职业天赋 risingshadows「当另一名敌人身亡时，
   * 有 7% 的几率猎杀最后一名敌人」）。onBigMatchKill 的死亡触发变体：概率经注入 rng、
   * 目标=死者一方队伍序末位存活、处决经 ctx.kill 注入。编译进
   * PassiveModifiers.onEnemyDeathKill。
   */
  onEnemyDeathKill?: { chance: number; scope: 'lastEnemy' };
  /**
   * 匹配骷髅头时削减敌人随机技能（职业天赋 chaoswave「匹配骷髅头时，所有敌人随机损失
   * 1 点技能值」）。大连敌减（bigMatchEnemyDrain）的骷髅触发版：scope 固定 allEnemies、
   * stat 支持 'random'（每次触发经注入 rng 掷一项，无 rng 落 magic，与 castEnemyDrain
   * 同口径）。编译进 PassiveModifiers.onSkullMatchEnemyDrain。
   */
  onSkullMatchEnemyDrain?: { stat: 'attack' | 'armor' | 'magic' | 'mana' | 'random'; amount: number };
  /** 敌方施法时同队指定范围盟友获得（职业天赋 portent）；与 onAllyCastTypeAura 同构反向 */
  onEnemyCastTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 敌方身亡时使其一方**全部**存活陷入状态（职业天赋 brutalstrike「当敌人身亡时，使所有敌人出血」） */
  onEnemyDeathEnemyAllStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /** 自己身亡时使敌方**全部**存活陷入状态（职业天赋 deathcurse「我身亡时，使所有敌人陷入死亡标记」） */
  onSelfDeathEnemyAllStatus?: { statuses: readonly { id: string; magnitude?: number }[]; turns: number };
  /** 骷髅伤害即死概率（职业天赋 bullseye「骷髅头伤害有 15% 的几率一击致命」）：结算口判定 */
  skullLethalChance?: number;
  /** 回合开始按概率获得属性（职业天赋 darkchannel「每回合有 50% 的几率获得 1 点魔力值」）。
   *  定义直读键（TurnEngine 回合开始结算口消费）；魔法走 grantStat（织网拦截口径不变）。 */
  turnStartChanceGain?: { chance: number; stat: PassiveStat; amount: number };
  /** 造成骷髅伤害时按概率猎杀末位敌人（职业天赋 assassinate「造成骷髅头伤害时，10% 猎杀最后一名敌人」） */
  onSkullHitKill?: { chance: number; scope: 'lastEnemy' };
  // —— R22 吞噬批（TurnEngine 消费，复用 skills/effects/devour 的 devourEffect 原语：
  //  即杀走 damageOne 伤害管线 + 官方成长额度 +2/+2/+2/+5，吞噬免疫在原语口整体跳过）——
  /**
   * 造成骷髅伤害时按概率吞噬本次受击目标（voracious 贪食「在造成骷髅头伤害时有 5% 的几率
   * 吞噬敌人」）。消费在 TurnEngine 骷髅结算后（applySkullDevourTriggers）：闪避/屏障/挣扎
   * 落空不产 skull-damage 事件、天然不触发；目标已亡/吞噬免疫由原语跳过（免疫不耗 rng）。
   */
  onSkullHitDevour?: { chance: number };
  /**
   * 承受骷髅伤害时按概率吞噬攻击者（consumefuel 消耗燃料「头骨受到伤害时有 10% 的几率吞噬
   * 第一个敌人」——持有者受骷髅伤害时攻击者即敌方队首，引擎口径取本次攻击者；攻击者已亡
   * （如被反弹反杀）不触发）。触发点与 onSkullHitDevour 同点反向。
   */
  onSkullDamagedDevour?: { chance: number };
  /**
   * 敌方角色阵亡时按概率吞噬死者一方**随机一名**存活（bloodyfeast 血腥盛宴「若敌人死亡，
   * 则有 20% 的几率吞噬该随机敌人」）。消费在 processDeathTriggers（与 applyEnemyDeathTriggers
   * 同时机、死者经出编队天然排除），随机目标经同一条种子化 rng。
   */
  onEnemyDeathDevour?: { chance: number };
  /**
   * 死亡时自我复活（凤凰涅槃批，Sunbird「浴火重生」官方 "Die and rise from the Ashes"）：
   * 出编队口（TurnEngine/prototypes 的 resolveDefeatAfterRevive）拦截本次伤害致死的 defeat
   * 事件——掷中后死亡被撤销（不出编队、不触发阵亡钩子），原位回血复活。healPct 缺省 0.5、
   * full=满血、fullMana=法力回满（deepsoul「复活并恢复全部魔力」口径）、chance 缺省 1。
   * 现网复活族特质（immortal/deepsoul/rebirth/eternaldawn）保持 summonOnDeath 复活模型不变，
   * 本键供 Phoenix 涅槃类新特质/段级 selfRevive 消费。
   */
  selfRevive?: { chance?: number; healPct?: number; full?: boolean; fullMana?: boolean };
  /** 自己回合开始时施加状态（职业天赋 wrathofanu 击晕随机敌 / getbehindme 屏障随机盟友 /
   *  ancientmysteries 随机盟友随机正面状态；接线批 tidalking 自身下潜 / blessedwaters 赐福
   *  全体盟友 / curseofdamnation 诅咒全体敌人 / sunflare·burningembers 燃烧随机敌）。
   *  定义直读键（applyTurnStartPassives 同族），TurnEngine 回合开始结算口消费。 */
  turnStartStatus?: {
    target: 'self' | 'randomAlly' | 'randomEnemy' | 'allAllies' | 'allEnemies';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    /** 从正面状态池随机掷一条（ancientmysteries 口径），忽略 statuses 列表 */
    randomPositive?: boolean;
    /** 独立概率掷（sleepersbane「Curse and/or Terror」）：每条状态各自掷一次 chance
     *  （各中各的），每条各耗一次种子化 rng；目标先选出、概率逐条判定（与
     *  onBigMatchStatus 的 independentChance 同口径）。 */
    independentChance?: boolean;
  };
  /**
   * 战后经济加成（merchant/necromancy/necromaster/moneybags 族，DECISIONS 四项拍板①）：
   * 「从战斗中获得 N% 额外灵魂/黄金」「在战斗中获得 N% 黄金加成」。
   * 战斗结束时对战场经济池的对应币种总额按 (1 + ratio) 放大；多条特质比率累加
   * （编译进 PassiveModifiers.battleEconomyGain）。
   */
  battleEconomyGain?: { currency: 'gold' | 'souls'; ratio: number };
  /**
   * 条件经济光环·大连版（条件经济批：greedy/extremegreed/pillageandplunder
   * 「在配对 4 或 5 颗宝石时，获得额外 N 黄金」）：自己一方配对 N 连时向战场经济池
   * 入账。minSize 缺省 4（官方「4 或 5 颗」口径 = 任意大连，与 onBigMatchStatus 同款）。
   */
  onBigMatchEconomy?: { currency: keyof TraitEconomyGain; amount: number; minSize?: number };
  /** 条件经济光环·骷髅版（darkensouls「在配对骷髅头时，获得 3 个灵魂」），骷髅匹配触发点结算 */
  onSkullMatchEconomy?: { currency: keyof TraitEconomyGain; amount: number };
  /**
   * 战斗开始时爆破一颗指定基础色的宝石或骷髅头（omenof* 族）。定义直读字段
   * （同 battleStartStorm 族，TurnEngine 构造期读 getTrait，不进 passive）：命中格从
   * 棋盘移除后走既有 resolveBoardChange 清除管线（法力/骷髅伤害/重力/连锁照常），
   * 直接结算归持有者一方；候选唯一不掷骰、无候选安全跳过。
   */
  battleStartDestroy?: { kind: 'color'; color: string } | { kind: 'skull' };
  /**
   * 战斗开始时施加状态（职业天赋族：vanguard「战斗开始时获得屏障」/ roottrap「缠绕第一
   * 名敌人」/ snapfreeze「冻结一名随机敌人」/ swiftcurse「死亡标记一名随机敌人」/
   * serendipity「给一名随机盟友一个随机状态效果」）。定义直读字段（同 battleStartStorm/
   * battleStartDestroy 族，TurnEngine 构造期读 getTrait，不进 passive）：随机目标与
   * randomPositive（从正面状态池掷一条）经构造期同一条种子化 rng；施加走 applyStatus
   *（免疫在施加口拦截），事件进 takeInitialEvents 供表现层首屏消费。
   */
  battleStartStatus?: {
    target: 'self' | 'randomAlly' | 'randomEnemy' | 'firstEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    /** 从正面状态池随机掷一条（serendipity 口径），忽略 statuses 列表 */
    randomPositive?: boolean;
  };
  /**
   * 战斗开始时给同队匹配范围的盟友按 manaCost 比例授予开局法力（职业天赋 windspeed
   * 「所有黄色盟友以 10% 法力值开始战斗」/ inspiration「所有盟友以 15% 法力值开始战斗」）。
   * 定义直读字段（同 battleStartStorm 族）；scope 认 'all'/种族/颜色（scopeMatches 同款）。
   * 自身版为 battleStartManaRatio（快速/赐能），两者叠加各自独立结算。
   */
  battleStartManaAura?: { scope: string; ratio: number };
  // —— 模式专属特质批（淘宝模式 / 晋升度 / 赏金语义，8 code）——
  // 这些机制在官方属于 Delve 进层 / 战后结算 / 晋升度倍率（官方 RawData：deep* 族
  // GameMode=delve_attacker、bountyhunter/pathfinder Activation=end_battle_rewards、
  // godslayer/siegebreaker on_skull_damage + Filter=boss/castle），**标准三消战斗内惰性**。
  // 本作未建模 Delve/晋升层：字段编译进 passive（types.ts PassiveModifiers 同名字段），
  // 数据建模完整、审计对账通过、描述正确；战斗结算路径不消费——无新键特质零事件、
  // 零随机消耗的护栏不被破坏（这些字段没有任何触发钩子，天然零事件）。
  /** 淘宝模式获得（deepvitality/deepmagic/deepshield/deepstrength「在淘宝模式中获得 N 点X」） */
  onDelveGain?: { stat: 'hp' | 'magic' | 'armor' | 'attack'; amount: number };
  /** 晋升赏金（bountyhunter「基于我已晋升的稀有度获得 2 到 6 倍的赏金点数」） */
  onDelveBounty?: { min: number; max: number };
  /** 旅程英里（pathfinder「在自身旅程活动中获得 2x/2.5x/3x 英里」，位序=晋升稀有度序） */
  onDelveMiles?: { multipliers: readonly number[] };
  /** 晋升度倍率（godslayer/siegebreaker「对魔头/高塔造成 3 到 5 倍伤害」；不进 skullMultVs* 屠戮表） */
  vsAscendedMultiplier?: { target: 'boss' | 'tower'; min: number; max: number };
  // —— 战斗机制批（jinx / leader 族 / indigestible / goodtarot+badtarot，7 code）——
  /** 敌方宝石灵力倍率（jinx「将敌人的宝石灵力减半」）：详见 PassiveModifiers.enemyMasteryMult */
  enemyMasteryMult?: number;
  /** 吞噬免疫（indigestible「对吞噬免疫」）：引擎尚无吞噬机制，数据字段先行（吞噬落地时消费） */
  devourImmunity?: boolean;
  /**
   * 位次条件光环（leader「当军队位于首位时，全部技能值将增加 3 点」/ general 末位版 /
   * goblord 末位单属性版）。定义直读键（applyPositionAuras 读 getTrait，同 teamAura 口径）：
   * front=编队首位、last=编队末位；进入该位次时一次性补授（位次在本引擎编队模型下
   * 只会因阵亡/召唤前移或追加，不回退），granted 集合由宿主按战斗持有防重复。
   */
  positionAura?: { position: 'front' | 'last'; gains: Partial<StatGains> };
  /**
   * 盟友施法时的随机状态（goodtarot 随机盟友 / badtarot 官方目标=随机敌人）：池按 scope
   * 取阵营（randomAlly=正面池 / randomEnemy=负面池，消费端与技能 randomStatusEffect 同源）。
   */
  onAllyCastRandomStatus?: { scope: 'randomAlly' | 'randomEnemy' };
  // —— 缺口清扫批（203 code 全量核对后的新增字段，官方 EN + RawData 逐条实锤）——
  /**
   * 种族开局法力（orclord/lordofbeasts/hauntedcrown 族 17 code「All X Allies start with
   * N% Mana」）：战斗开始时同队该种族存活盟友（含持有者）的法力补到 manaCost×ratio。
   * 定义直读键（applyBattleStartTraits 读 getTrait，同 typeAura 口径）。
   */
  /**
   * 种族/范围开局法力（缺口清扫批 orclord/lordofbeasts/hauntedcrown 族「All X Allies
   * start with N% Mana」）。scope 认种族名/颜色名/'all'（scopeMatches 同款）；旧数据
   * 字段 troopType 仍收（种族名等价），职业天赋 windspeed「所有黄色盟友」用 scope 传颜色、
   * inspiration「所有盟友」用 scope:'all'。
   */
  allyStartMana?: { troopType?: string; scope?: string; ratio: number };
  /**
   * 开局范围光环（iceaura 族 6 色「All Blue Allies gain 5 to all Stats」+ soaring「Allied
   * Stryx gain 5 Life and Attack」）：战斗开始时同队 scope（颜色或种族）成员一次性获得。
   * 定义直读键（applyBattleStartTraits，scopeMatches 认颜色/种族/'all'）。
   */
  battleStartTypeAura?: { scope: string; gains: Partial<StatGains> };
  /**
   * 回合开始范围光环（queensgrace/feralinspiration/nightsong/blessingofanu 族 17 code
   * 「All X Allies gain N … at the start of each turn」）：持有者一方每个回合开始时给
   * scope（种族或颜色）成员叠加。定义直读键（applyTurnStartPassives 读 getTrait，
   * 仅行动方队伍结算——官方 trig=self_player）。
   */
  turnStartTypeAura?: { scope: string; gains: Partial<StatGains> };
  /**
   * 束带计数光环（bandinglife/bandingmagic/bandingarmor/bandingattack/truebanding，
   * 官方 Filter=traitbanding「Gain N … for each Ally with a Banding Trait」）：战斗开始时
   * 数同队存活持有束带特质（banding* / truebanding）的盟友数（含自己，perAllyColor 同口径），
   * gains×count 一次性授出。定义直读键（applyBattleStartTraits）。
   */
  perAllyTrait?: { trait: 'banding'; gains: Partial<StatGains> };
  /**
   * 施法显式状态（缺口清扫批 5 code）：onAllyCast=同队任一角色施法时（moonfestival 30%
   * 法印随机盟友 / gibberingmadness 狂怒随机盟友 / hemlock 诅咒+疾病随机敌人）、
   * onEnemyCast=敌方施法时（magehunter 自身狂怒 / psychicbacklash 击晕随机敌人）。
   * 施加经 applyCastRandomStatusTriggers 注入的 applyStatus（免疫在施加口拦截），
   * 概率/随机目标经注入的 rng；无注入时概率 <1 不生效、随机退化为首个存活。
   */
  onAllyCastStatus?: {
    scope: 'self' | 'randomAlly' | 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
  };
  onEnemyCastStatus?: {
    scope: 'self' | 'randomAlly' | 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
  };
  /**
   * 施法响应·敌方属性削减（psychicaffliction「消除所有敌人 1 点魔力值」/ succumb「敌人
   * 失去 4 点随机技能值」）。reduce 语义（持有者不进账）：stat 'random' 每次触发经 rng
   * 在四项属性中掷一条（无 rng 按随机技能值口径落 magic）；allEnemies 逐个削减。
   */
  onAllyCastEnemyDrain?: { stat: 'hp' | 'attack' | 'armor' | 'magic' | 'mana' | 'random'; amount: number; scope: 'allEnemies' | 'randomEnemy' };
  /** 回合开始经济入账（goldenhoard 5 黄金 / soulgatherer 4 灵魂）。惰性：回合钩子无经济口 */
  turnStartEconomy?: { currency: 'gold' | 'souls'; amount: number };
  /** 盟友施法时经济入账（soulverdict 3 灵魂）。惰性：施法响应区无经济口 */
  onAllyCastEconomy?: { currency: 'gold' | 'souls'; amount: number };
  /** 自身承伤时经济入账（pickpocket 10 黄金）。惰性：受击结算无经济口 */
  onDamagedEconomy?: { currency: 'gold' | 'souls'; amount: number };
  /** 回合开始按概率召唤兵种（harpyflock 5% 鸟妖 / parliamentarycall 10% 枭熊）。惰性：回合钩子无召唤口 */
  turnStartSummon?: { chance: number; troopId: number; referenceName: string; displayName: string };
  /**
   * 回合开始创造风暴（snowstorm/penumbra/shroudofskulls 等 11 code）。惰性：回合开始
   * 棋盘钩子无风暴口。colors=官方 BoostColors（原色风暴单色、混合风暴双色），
   * dropKind 为骷髅系掉落（骸骨风暴）——引擎风暴契约落地时并集加权。
   */
  turnStartStorm?: {
    referenceName: string;
    displayName: string;
    colors: readonly BaseColor[];
    dropKind?: 'skull' | 'doomSkull' | 'uberDoomSkull';
  };
  /** PVP 限定标记（defender/siege/virtueofhonor）：标准战斗惰性，PVP 模式落地时消费 */
  mode?: 'pvp';
  /** PVP 限定加成（attack=进攻方全队 / defense=防守方全队 / battle=持有者自身） */
  pvpBonus?: { phase: 'attack' | 'defense' | 'battle'; gains: Partial<StatGains> };
  /** PvP 战斗结算荣耀映射（职业天赋 bloodandglory；本作映射黄金）：GameOver 且 pvpMode 时入账 */
  pvpEconomyGain?: { currency: 'gold' | 'souls'; amount: number };
}

export const TRAIT_LIBRARY: readonly TraitDefinition[] = (traitTable as TraitDefinition[]).map(t => ({ ...t, description: normalizeCombatText(t.description) }));

const BY_CODE = new Map(TRAIT_LIBRARY.map((t) => [t.code, t]));

/**
 * 动态特质定义注册表（meta 职业天赋 v3）：宿主（meta 层）在构建战斗请求前把
 * 「职业天赋编译出的特质定义」注册进来，getTrait 按 静态库 → 动态注册 顺序回落查询。
 * 定义形态与 traits.json 完全一致——引擎的全部既有钩子（大连/配色/死亡/回合开始/
 * 召唤/开局…）对动态定义零改动生效。进程级单例，同 code 重注册即覆盖（幂等）。
 */
const DYNAMIC_DEFS = new Map<string, TraitDefinition>();

/** 注册动态特质定义（meta 职业天赋；调用方保证幂等或接受覆盖语义） */
export function registerDynamicTraits(defs: readonly TraitDefinition[]): void {
  for (const d of defs) DYNAMIC_DEFS.set(d.code, { ...d, description: normalizeCombatText(d.description) });
}

// 自定义部队特质独立注册；官方审计仅覆盖上面的原版 traitTable。
registerDynamicTraits(COMMUNITY_TRAITS);

/** 已注册的动态特质 code（供宿主快照校验把天赋 code 放进 knownTraitIds） */
export function dynamicTraitCodes(): string[] {
  return [...DYNAMIC_DEFS.keys()];
}

const noGains = (): StatGains => ({ hp: 0, armor: 0, attack: 0, magic: 0, mana: 0 });

/** 触发类特质：字段名 → 编译到 passive 的哪一项 */
const TRIGGER_FIELDS = [
  ['onDamagedGain', 'gainOnDamaged'],
  ['onSkullHitGain', 'gainOnSkullHit'],
  ['onAllyCastGain', 'gainOnAllyCast'],
  ['onEnemyCastGain', 'gainOnEnemyCast'],
  ['onEnemyDeathGain', 'gainOnEnemyDeath'],
  ['onAllyDeathGain', 'gainOnAllyDeath'],
  ['onBigMatchGain', 'gainOnBigMatch'],
] as const;

/** 无特质角色的中性修正 */
export function neutralPassives(): PassiveModifiers {
  return {
    skullDamageTaken: 1,
    spellDamageTaken: 1,
    statusImmunities: [],
    regenPerTurn: 0,
    regenArmorPerTurn: 0,
    regenAttackPerTurn: 0,
    regenMagicPerTurn: 0,
    gainOnDamaged: noGains(),
    gainOnSkullHit: noGains(),
    gainOnAllyCast: noGains(),
    gainOnEnemyCast: noGains(),
    gainOnEnemyDeath: noGains(),
    gainOnAllyDeath: noGains(),
    gainOnBigMatch: noGains(),
    manaOpsImmunity: false,
    manaLink: {},
    reflectSkullRatio: 0,
    dodgeChance: 0,
    skullMultVsTroopType: {},
    skullMultVsStatus: {},
    skullMultVsColor: {},
    skullMultVsWounded: 1,
    armorPierceChance: 0,
    gainOnColorMatch: {},
    untargetable: false,
    bigMatchTypeAura: {},
    gainOnBigMatchSized: {},
    colorMatchTypeAura: {},
    cleanseOnColorMatch: [],
    cleanseOnBigMatch: false,
    gainOnEnemyColorMatch: {},
    colorMatchStatus: {},
    colorMatchDrain: {},
    colorMatchDamage: {},
    bigMatchDamage: [],
    bigMatchEnemyDrain: [],
    bigMatchCreateGem: [],
    bigMatchEconomyGain: {},
    skullMatchEconomyGain: { gold: 0, souls: 0, gems: 0 },
    // 模式专属特质批：淘宝/晋升/赏金字段的中性形态（空 = 无任何 Delve 层效果）
    onDelveGains: {},
    vsAscendedMultipliers: [],
    // 战斗机制批：宝石灵力无抑制 / 非吞噬免疫为中性形态
    enemyMasteryMult: 1,
    devourImmunity: false,
    // 缺口清扫批：施法显式状态/施法敌减无 + 惰性经济/召唤/风暴/PVP 字段的中性形态
    castStatus: {},
    turnStartEconomyGains: { gold: 0, souls: 0, gems: 0 },
    allyCastEconomyGains: { gold: 0, souls: 0, gems: 0 },
    damagedEconomyGains: { gold: 0, souls: 0, gems: 0 },
    pvpMode: false,
    pvpBonuses: [],
    // 职业天赋批：新键的中性形态（未持有 = 无行为）
    skullDamageFromArmorRatio: 0,
    onBigMatchDispelEnemies: false,
    onBigMatchCleanseSelf: false,
    onBigMatchExplodeGem: [],
  };
}

export const NEUTRAL_PASSIVES: PassiveModifiers = neutralPassives();

export type TraitLookup = (code: string) => TraitDefinition | undefined;

/** 按 code 取特质定义；未实现的 code 返回 undefined（安全忽略，不报错）。
 *  动态注册表（registerDynamicTraits）回落查询——meta 职业天赋经此进入全部既有钩子。 */
export function getTrait(code: string): TraitDefinition | undefined {
  return BY_CODE.get(code) ?? DYNAMIC_DEFS.get(code);
}

/** 已实现的特质 code，供宿主快照校验判断「这个特质客户端认不认」。 */
export function implementedTraitIds(): string[] {
  return TRAIT_LIBRARY.map((t) => t.code);
}

/** 把一组特质 code 编译成被动修正。未知 code 直接跳过。 */
export function resolvePassives(
  traitIds: readonly string[] | undefined,
  lookup: TraitLookup = getTrait,
): PassiveModifiers {
  const passive = neutralPassives();
  if (!traitIds || traitIds.length === 0) return passive;

  let skullReduction = 0;
  let spellReduction = 0;
  const immunities = new Set<string>();
  const manaLink: Record<string, number> = {};
  const multByType: Record<string, number> = {};
  const multByStatus: Record<string, number> = {};
  const multByColor: Record<string, number> = {};
  const colorMatchGains: Record<string, StatGains> = {};
  const bigMatchAura = new Map<string, StatGains>();
  const sizedBigMatchGains: Record<string, StatGains> = {};
  const colorMatchAura: Record<string, Record<string, StatGains>> = {};
  const enemyColorGains: Record<string, StatGains> = {};
  // 配色施加状态（T5 配色状态批）：色键 → 规格条目（与 PassiveModifiers.colorMatchStatus 同构）
  const colorMatchStatus: Record<string, {
    scope: 'randomEnemy' | 'randomAlly' | 'self';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    independentChance?: boolean;
  }> = {};
  // 配色窃取生命（T5 窃取批）：色键 → 伤害额，同色键累加（与 gainOnColorMatch 同口径）
  const colorMatchDrain: Record<string, number> = {};
  // 配色伤害（T5 杂项批 lumpofcoal/dawnslayer/sleetstorm + 缺口清扫批 spiny/spiky 全体 scope）：
  // 色键 → { amount, scope }，同色键累加伤害额、scope 取后声明的一条
  const colorMatchDamage: Record<string, { amount: number; scope: 'randomEnemy' | 'allEnemies' }> = {};
  // 大连技能伤害 / 大连敌减（T5 大连伤害批 + 大连敌减批）：多条并存按声明序逐条结算，
  // minSize 定义侧可省，编译期缺省 4（「4 或 5 颗」=「4 或更多」= 任意大连）
  const bigMatchDamage: { amount: number; scope: 'randomEnemy' | 'enemyAll' | 'lastEnemy'; minSize: number }[] = [];
  const bigMatchEnemyDrain: {
    stat: 'attack' | 'armor' | 'magic' | 'mana';
    amount: number;
    scope: 'front' | 'randomEnemy' | 'allEnemies';
    minSize: number;
  }[] = [];
  // 大连创造宝石（T4 大连创造批）：多条并存按声明序逐条结算，minSize 编译期缺省 4
  const bigMatchCreateGem: {
    gem: SpecialGemKind;
    tier?: number;
    color?: string;
    count: number;
    chance?: number;
    minSize: number;
  }[] = [];
  const cleanseColors = new Set<string>();
  let cleanseBigMatch = false;
  let bigMatchStatus: PassiveModifiers['onBigMatchStatus'];
  const damagedStatusList: { id: string; turns: number; magnitude?: number }[] = [];
  // 命中附带状态·多条版（接线批 brokenjaw）：条目按声明顺序拼接保留，结算侧逐条施加
  const skullHitStatusList: { id: string; turns: number; magnitude?: number }[] = [];
  const bigMatchEconomy: Record<string, TraitEconomyGain> = {};
  const skullEconomy: TraitEconomyGain = { gold: 0, souls: 0, gems: 0 };
  // 模式专属特质批（淘宝/晋升/赏金）：聚合容器——Delve 层属性按 stat 累加，晋升度倍率
  // 按声明序保留（godslayer/siegebreaker 可并存），赏金取最宽区间
  const delveGains: Partial<Record<'hp' | 'magic' | 'armor' | 'attack', number>> = {};
  const vsAscended: { target: 'boss' | 'tower'; min: number; max: number }[] = [];
  // 缺口清扫批：施法显式状态/施法敌减 + 惰性经济/召唤/风暴/PVP 聚合容器
  const castStatus: NonNullable<PassiveModifiers['castStatus']> = {};
  let castEnemyDrain: PassiveModifiers['castEnemyDrain'];
  const turnStartEconomy: TraitEconomyGain = { gold: 0, souls: 0, gems: 0 };
  const allyCastEconomy: TraitEconomyGain = { gold: 0, souls: 0, gems: 0 };
  const damagedEconomy: TraitEconomyGain = { gold: 0, souls: 0, gems: 0 };
  let turnStartSummon: PassiveModifiers['turnStartSummon'];
  let turnStartStorm: PassiveModifiers['turnStartStorm'];
  const pvpBonuses: { phase: 'attack' | 'defense' | 'battle'; gains: Partial<StatGains> }[] = [];
  let passivePvpEconomy: PassiveModifiers['pvpEconomyGain'];

  for (const code of traitIds) {
    const trait = lookup(code);
    if (!trait) continue;
    // 同类减伤取最强，不连乘
    if (trait.skullDamageReduction !== undefined) {
      skullReduction = Math.max(skullReduction, trait.skullDamageReduction);
    }
    if (trait.spellDamageReduction !== undefined) {
      spellReduction = Math.max(spellReduction, trait.spellDamageReduction);
    }
    // 反弹与闪避同样取最强，不叠加
    if (trait.reflectSkullRatio !== undefined) {
      passive.reflectSkullRatio = Math.max(passive.reflectSkullRatio, trait.reflectSkullRatio);
    }
    if (trait.dodgeChance !== undefined) {
      passive.dodgeChance = Math.max(passive.dodgeChance, Math.min(0.9, trait.dodgeChance));
    }
    for (const id of trait.statusImmunities ?? []) immunities.add(id);
    // 同类累加：多条再生/狂暴叠加符合直觉。
    // regen.stat 按 stat 字段路由：attack/magic 是回合增益（aspectofwar「每回合开始时
    // 获得 3 点攻击力」），不再静默并入 HP 回复——那会让攻击增益错误地结算成回血。
    if (trait.regen) {
      const regenInto = (stat: PassiveStat) => {
        if (stat === 'armor') passive.regenArmorPerTurn += trait.regen!.amount;
        else if (stat === 'attack') passive.regenAttackPerTurn += trait.regen!.amount;
        else if (stat === 'magic') passive.regenMagicPerTurn += trait.regen!.amount;
        else if (stat === 'hp') passive.regenPerTurn += trait.regen!.amount;
      };
      regenInto(trait.regen.stat);
      // 共享数值附加属性（wildhorns「攻击力、生命值和护甲值获得2点提升」= 三项各 2）
      for (const stat of trait.regen.alsoStats ?? []) regenInto(stat);
    }
    for (const [from, into] of TRIGGER_FIELDS) {
      const gain = trait[from];
      if (!gain) continue;
      passive[into][gain.stat] += gain.amount;
      // 共享数值附加属性（sacrifice「所有技能增加 3 点」= 四项各 3 / vast 多属性大连增益）
      for (const stat of gain.alsoStats ?? []) {
        passive[into][stat] += gain.amount;
      }
    }
    const addColorGain = (color: string, stat: PassiveStat, amount: number) => {
      colorMatchGains[color] ??= noGains();
      colorMatchGains[color][stat] += amount;
    };
    if (trait.onColorMatchGain) {
      const { color, stat, amount, alsoStats } = trait.onColorMatchGain;
      addColorGain(color, stat, amount);
      for (const otherStat of alsoStats ?? []) addColorGain(color, otherStat, amount);
    }
    for (const { color, stat, amount } of trait.onColorMatchGains ?? []) {
      addColorGain(color, stat, amount);
    }
    if (trait.manaLink) {
      manaLink[trait.manaLink.color] = (manaLink[trait.manaLink.color] ?? 0) + trait.manaLink.amount;
    }
    // 屠戮类倍率：同键取最强，不相乘
    if (trait.skullMultVsTroopType) {
      const k = trait.skullMultVsTroopType.troopType;
      multByType[k] = Math.max(multByType[k] ?? 1, trait.skullMultVsTroopType.mult);
    }
    if (trait.skullMultVsStatus) {
      const k = trait.skullMultVsStatus.status;
      multByStatus[k] = Math.max(multByStatus[k] ?? 1, trait.skullMultVsStatus.mult);
    }
    // 多状态屠戮（lethaltoxin 中毒/织网 ×3）：与单状态同表合并，同键取最强
    for (const entry of trait.skullMultVsStatusList ?? []) {
      multByStatus[entry.status] = Math.max(multByStatus[entry.status] ?? 1, entry.mult);
    }
    if (trait.skullMultVsColor) {
      const k = trait.skullMultVsColor.color;
      multByColor[k] = Math.max(multByColor[k] ?? 1, trait.skullMultVsColor.mult);
    }
    if (trait.skullMultVsWounded !== undefined) {
      passive.skullMultVsWounded = Math.max(passive.skullMultVsWounded, trait.skullMultVsWounded);
    }
    if (trait.armorPierceChance !== undefined) {
      passive.armorPierceChance = Math.max(passive.armorPierceChance, trait.armorPierceChance);
    }
    // 布尔项取并集：任一条特质给了隐匿/法力操作免疫即生效
    if (trait.untargetable) passive.untargetable = true;
    if (trait.manaOpsImmunity) passive.manaOpsImmunity = true;
    // 受击附状态（aquatic）：同类取先声明的一条（同一角色持有多条时后续不覆盖）
    if (trait.onDamagedStatus && passive.onDamagedStatus === undefined) {
      passive.onDamagedStatus = { ...trait.onDamagedStatus };
    }
    // 受击使对方首位陷入状态（deathray）/ 受击敌方全体受伤（manyheads）/ 受击创造宝石
    //（onyxshard + *shard 族）：同类均取先声明的一条（与 onDamagedStatus 同口径）
    if (trait.onDamagedEnemyStatus && passive.onDamagedEnemyStatus === undefined) {
      passive.onDamagedEnemyStatus = { ...trait.onDamagedEnemyStatus };
    }
    if (trait.onSkullDamagedEnemyDamage && passive.onSkullDamagedEnemyDamage === undefined) {
      passive.onSkullDamagedEnemyDamage = { ...trait.onSkullDamagedEnemyDamage };
    }
    if (trait.onDamagedCreateGem && passive.onDamagedCreateGem === undefined) {
      passive.onDamagedCreateGem = { ...trait.onDamagedCreateGem };
    }
    // 命中附带状态取回合数更长的一条
    if (trait.inflictOnSkullHit
      && (passive.inflictOnSkullHit === undefined
        || trait.inflictOnSkullHit.turns > passive.inflictOnSkullHit.turns)) {
      passive.inflictOnSkullHit = { ...trait.inflictOnSkullHit };
    }
    // 命中附带状态·多条版（brokenjaw）：条目按声明顺序拼接保留，结算侧逐条施加
    if (trait.inflictOnSkullHitList) {
      skullHitStatusList.push(...trait.inflictOnSkullHitList.map((s) => ({ ...s })));
    }
    // 命中窃法（siphon）：单值取最强（与 armorPierceChance 数值族同口径）
    if (trait.onSkullHitStealMana !== undefined) {
      passive.onSkullHitStealMana = Math.max(passive.onSkullHitStealMana ?? 0, trait.onSkullHitStealMana);
    }
    // 受击附带状态同口径（取回合数更长的一条）
    if (trait.inflictOnSkullDamaged
      && (passive.inflictOnSkullDamaged === undefined
        || trait.inflictOnSkullDamaged.turns > passive.inflictOnSkullDamaged.turns)) {
      passive.inflictOnSkullDamaged = { ...trait.inflictOnSkullDamaged };
    }
    // 受击附带状态·多条版（双状态诅咒族）：条目按声明顺序拼接保留，结算侧逐条施加
    if (trait.inflictOnSkullDamagedList) {
      damagedStatusList.push(...trait.inflictOnSkullDamagedList.map((s) => ({ ...s })));
    }
    // 敌人身亡触发的状态/种族光环变体（bloodlust/lordofdeath/sharedfate）：
    // 单值字段同类取先声明的一条（同一角色持有多条时后续不覆盖）。
    if (trait.onEnemyDeathStatus && passive.onEnemyDeathStatus === undefined) {
      passive.onEnemyDeathStatus = { ...trait.onEnemyDeathStatus };
    }
    if (trait.onEnemyDeathTypeAura && passive.onEnemyDeathTypeAura === undefined) {
      passive.onEnemyDeathTypeAura = {
        ...trait.onEnemyDeathTypeAura,
        gains: { ...trait.onEnemyDeathTypeAura.gains },
      };
    }
    // 盟友身亡 / 盟友施法 / 自身承伤的队伍光环变体（virtue 家族）：同类取先声明的一条
    //（与 onEnemyDeathTypeAura 同口径）
    if (trait.onAllyDeathTypeAura && passive.onAllyDeathTypeAura === undefined) {
      passive.onAllyDeathTypeAura = {
        ...trait.onAllyDeathTypeAura,
        gains: { ...trait.onAllyDeathTypeAura.gains },
      };
    }
    if (trait.onAllyCastTypeAura && passive.onAllyCastTypeAura === undefined) {
      passive.onAllyCastTypeAura = {
        ...trait.onAllyCastTypeAura,
        gains: { ...trait.onAllyCastTypeAura.gains },
      };
    }
    if (trait.onDamagedTypeAura && passive.onDamagedTypeAura === undefined) {
      passive.onDamagedTypeAura = {
        ...trait.onDamagedTypeAura,
        gains: { ...trait.onDamagedTypeAura.gains },
      };
    }
    if (trait.onEnemyDeathEnemyStatus && passive.onEnemyDeathEnemyStatus === undefined) {
      passive.onEnemyDeathEnemyStatus = { ...trait.onEnemyDeathEnemyStatus };
    }
    // 身亡经济（valuable）：同类取先声明的一条（与上方死亡变体同口径）
    if (trait.onSelfDeathFillAllyMana) passive.onSelfDeathFillAllyMana = true;
    if (trait.onDeathEconomy && passive.onDeathEconomy === undefined) {
      passive.onDeathEconomy = { ...trait.onDeathEconomy };
    }
    // 身亡创造特殊宝石（unstablecore）：同类取先声明的一条（与 onDeathEconomy 同口径）
    if (trait.onDeathCreateGem && passive.onDeathCreateGem === undefined) {
      passive.onDeathCreateGem = { ...trait.onDeathCreateGem };
    }
    // 4/5 连种族光环：同种族数值叠加，异种族并存
    if (trait.onBigMatchTypeAura) {
      const k = trait.onBigMatchTypeAura.troopType;
      const merged = bigMatchAura.get(k) ?? noGains();
      for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
        merged[stat] += trait.onBigMatchTypeAura.gains[stat] ?? 0;
      }
      bigMatchAura.set(k, merged);
    }
    // —— 条件光环批（窗口 E）——
    // 5 连限定自身增益：同 minSize 数值叠加（与触发增益同类累加口径一致）
    if (trait.onBigMatchSizedGain) {
      const k = String(trait.onBigMatchSizedGain.minSize);
      sizedBigMatchGains[k] ??= noGains();
      sizedBigMatchGains[k][trait.onBigMatchSizedGain.stat] += trait.onBigMatchSizedGain.amount;
    }
    // 配色团队光环：色→scope 双层表，同键叠加（与 bigMatchTypeAura 同口径）
    if (trait.onColorMatchTypeAura) {
      const { color, scope, gains } = trait.onColorMatchTypeAura;
      const byScope = (colorMatchAura[color] ??= {});
      const merged = byScope[scope] ?? noGains();
      for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
        merged[stat] += gains[stat] ?? 0;
      }
      byScope[scope] = merged;
    }
    // 敌方配色触发：同色叠加
    if (trait.onEnemyColorMatchGain) {
      const k = trait.onEnemyColorMatchGain.color;
      enemyColorGains[k] ??= noGains();
      enemyColorGains[k][trait.onEnemyColorMatchGain.stat] += trait.onEnemyColorMatchGain.amount;
    }
    // 配色施加状态（T5 配色状态批）：同色键取回合更长的一条（与 onBigMatchStatus 同口径）；
    // turns 定义侧可省，编译期缺省 3。chance 只在官方句式带概率（foxfire 50%）时存在。
    if (trait.onColorMatchStatus) {
      const { color, scope, statuses, turns, chance, independentChance } = trait.onColorMatchStatus;
      const prev = colorMatchStatus[color];
      if (prev === undefined || (turns ?? 3) > prev.turns) {
        colorMatchStatus[color] = {
          scope,
          statuses: [...statuses],
          turns: turns ?? 3,
          ...(chance !== undefined ? { chance } : {}),
          ...(independentChance ? { independentChance: true } : {}),
        };
      }
    }
    // 配色窃取生命（T5 窃取批）：同色键累加
    if (trait.onColorMatchDrain) {
      const { color, amount } = trait.onColorMatchDrain;
      colorMatchDrain[color] = (colorMatchDrain[color] ?? 0) + amount;
    }
    // 配色伤害（T5 杂项批 + 缺口清扫批 spiny/spiky）：同色键累加伤害额（与窃取同口径），
    // scope 缺省 randomEnemy（旧数据无 scope 键）、同色键取后声明的一条
    if (trait.onColorMatchDamage) {
      const { color, amount, scope } = trait.onColorMatchDamage;
      const prevDmg = colorMatchDamage[color];
      colorMatchDamage[color] = {
        amount: (prevDmg?.amount ?? 0) + amount,
        scope: scope ?? prevDmg?.scope ?? 'randomEnemy',
      };
    }
    // 大连技能伤害 / 大连敌减（T5 大连伤害批 + 大连敌减批）：多条并存逐条结算，minSize 缺省 4
    if (trait.onBigMatchDamage) {
      bigMatchDamage.push({ ...trait.onBigMatchDamage, minSize: trait.onBigMatchDamage.minSize ?? 4 });
    }
    if (trait.onBigMatchEnemyDrain) {
      bigMatchEnemyDrain.push({ ...trait.onBigMatchEnemyDrain, minSize: trait.onBigMatchEnemyDrain.minSize ?? 4 });
    }
    // 大连创造宝石（T4 批）：多条并存逐条结算，minSize 缺省 4
    if (trait.onBigMatchCreateGem) {
      bigMatchCreateGem.push({ ...trait.onBigMatchCreateGem, minSize: trait.onBigMatchCreateGem.minSize ?? 4 });
    }
    // 配对转换（trascend）：同类取先声明的一条（与 onBigMatchStatus 同口径），minSize 缺省 4
    if (trait.onBigMatchConvert && passive.onBigMatchConvert === undefined) {
      passive.onBigMatchConvert = { ...trait.onBigMatchConvert, minSize: trait.onBigMatchConvert.minSize ?? 4 };
    }
    // 配对召唤（genieslamp/stormflock）：同字段取概率更高的一条（与 summonOnDeath 同口径）
    if (trait.onBigMatchSummon
      && (passive.bigMatchSummon === undefined || trait.onBigMatchSummon.chance > passive.bigMatchSummon.chance)) {
      passive.bigMatchSummon = { ...trait.onBigMatchSummon, minSize: trait.onBigMatchSummon.minSize ?? 4 };
    }
    // 配对风暴（deadlywaters）：同类取先声明的一条（与开局风暴同口径，全场唯一顶替在宿主侧）
    if (trait.onBigMatchStorm && passive.bigMatchStorm === undefined) {
      passive.bigMatchStorm = { ...trait.onBigMatchStorm, minSize: trait.onBigMatchStorm.minSize ?? 4 };
    }
    // 配对即杀（deathbelow）：同字段取概率更高的一条（与配对召唤同口径）
    if (trait.onBigMatchKill
      && (passive.bigMatchKill === undefined || trait.onBigMatchKill.chance > passive.bigMatchKill.chance)) {
      passive.bigMatchKill = { ...trait.onBigMatchKill, minSize: trait.onBigMatchKill.minSize ?? 4 };
    }
    // 净化：颜色并集、布尔取或
    if (trait.onColorMatchCleanse) cleanseColors.add(trait.onColorMatchCleanse.color);
    if (trait.onBigMatchCleanse) cleanseBigMatch = true;
    // 大连施加状态：同字段取回合更长的一条（与命中附状态同口径）；statuses 随对象拷贝
    if (trait.onBigMatchStatus
      && (bigMatchStatus === undefined || trait.onBigMatchStatus.turns > bigMatchStatus.turns)) {
      bigMatchStatus = { ...trait.onBigMatchStatus, statuses: [...trait.onBigMatchStatus.statuses] };
    }
    // 死亡召唤：同字段取概率更高的一条（多个持有不叠加多次召唤，与"同类取最强"口径一致）。
    // 风暴变体（storm）随对象整体拷贝，编译层不感知其差异——风暴入队/顶替裁定在 TurnEngine。
    for (const key of ['summonOnDeath', 'summonOnAllyDeath', 'summonOnEnemyDeath'] as const) {
      const s = trait[key];
      if (s && (passive[key] === undefined || s.chance > passive[key]!.chance)) {
        passive[key] = { ...s };
      }
    }
    // —— 职业天赋批 ——
    // 受击/施法召唤：同字段取概率更高的一条（与死亡召唤"同类取最强"口径一致）
    for (const key of ['summonOnDamaged', 'summonOnAllyCast'] as const) {
      const s = trait[key];
      if (s && (passive[key] === undefined || s.chance > passive[key]!.chance)) {
        passive[key] = { ...s };
      }
    }
    // 骷髅附加护甲比 / 配对驱散 / 配对自净化：同类取最强（比率高者优先、布尔取或）
    if (trait.skullDamageFromArmorRatio !== undefined) {
      passive.skullDamageFromArmorRatio = Math.max(passive.skullDamageFromArmorRatio ?? 0, trait.skullDamageFromArmorRatio);
    }
    if (trait.onBigMatchDispelEnemies) passive.onBigMatchDispelEnemies = true;
    if (trait.onBigMatchCleanseSelf) passive.onBigMatchCleanseSelf = true;
    // 配对窃取生命：同类取先声明的一条（与 onBigMatchConvert 同口径）
    if (trait.onBigMatchDrainLife && passive.onBigMatchDrainLife === undefined) {
      passive.onBigMatchDrainLife = { ...trait.onBigMatchDrainLife };
    }
    // 配对爆破宝石：多条并存按声明序逐条结算（minSize 编译期缺省 4、count 缺省 1；
    // kind/tier 为特质收尾批扩展——'random'/'skull'/特殊宝石 kind，legacy 色条目不带 kind、
    // kind 条目可无 color）
    if (trait.onBigMatchExplodeGem) {
      passive.onBigMatchExplodeGem = [
        ...(passive.onBigMatchExplodeGem ?? []),
        {
          color: trait.onBigMatchExplodeGem.color ?? '',
          ...(trait.onBigMatchExplodeGem.kind !== undefined ? { kind: trait.onBigMatchExplodeGem.kind } : {}),
          ...(trait.onBigMatchExplodeGem.tier !== undefined ? { tier: trait.onBigMatchExplodeGem.tier } : {}),
          count: trait.onBigMatchExplodeGem.count ?? 1,
          minSize: trait.onBigMatchExplodeGem.minSize ?? 4,
        },
      ];
    }
    // 配对创造普通色宝石（lunarscales）：同类取先声明的一条
    if (trait.onBigMatchCreatePlainGem && passive.onBigMatchCreatePlainGem === undefined) {
      passive.onBigMatchCreatePlainGem = {
        color: trait.onBigMatchCreatePlainGem.color,
        count: trait.onBigMatchCreatePlainGem.count,
        ...(trait.onBigMatchCreatePlainGem.chance !== undefined ? { chance: trait.onBigMatchCreatePlainGem.chance } : {}),
        minSize: trait.onBigMatchCreatePlainGem.minSize ?? 4,
      };
    }
    // 配对随机风暴 / 自身召唤触发状态 / 阵亡施加状态 / 阵亡猎杀 / 骷髅敌减：
    // 同类取先声明的一条（单天赋持有为主，多条并存极少见）
    if (trait.onBigMatchRandomStorm && passive.onBigMatchRandomStorm === undefined) {
      passive.onBigMatchRandomStorm = { minSize: trait.onBigMatchRandomStorm.minSize ?? 4 };
    }
    if (trait.onSelfSummonStatus && passive.onSelfSummonStatus === undefined) {
      passive.onSelfSummonStatus = { ...trait.onSelfSummonStatus, statuses: [...trait.onSelfSummonStatus.statuses] };
    }
    if (trait.onAllyDeathStatus && passive.onAllyDeathStatus === undefined) {
      passive.onAllyDeathStatus = { ...trait.onAllyDeathStatus, statuses: [...trait.onAllyDeathStatus.statuses] };
    }
    if (trait.onEnemyDeathRandomStatus && passive.onEnemyDeathRandomStatus === undefined) {
      passive.onEnemyDeathRandomStatus = { ...trait.onEnemyDeathRandomStatus, statuses: [...trait.onEnemyDeathRandomStatus.statuses] };
    }
    if (trait.onEnemyDeathKill && passive.onEnemyDeathKill === undefined) {
      passive.onEnemyDeathKill = { ...trait.onEnemyDeathKill };
    }
    if (trait.onSkullMatchEnemyDrain && passive.onSkullMatchEnemyDrain === undefined) {
      passive.onSkullMatchEnemyDrain = { ...trait.onSkullMatchEnemyDrain };
    }
    if (trait.onEnemyCastTypeAura && passive.onEnemyCastTypeAura === undefined) {
      passive.onEnemyCastTypeAura = { ...trait.onEnemyCastTypeAura };
    }
    if (trait.onEnemyDeathEnemyAllStatus && passive.onEnemyDeathEnemyAllStatus === undefined) {
      passive.onEnemyDeathEnemyAllStatus = { ...trait.onEnemyDeathEnemyAllStatus, statuses: [...trait.onEnemyDeathEnemyAllStatus.statuses] };
    }
    if (trait.onSelfDeathEnemyAllStatus && passive.onSelfDeathEnemyAllStatus === undefined) {
      passive.onSelfDeathEnemyAllStatus = { ...trait.onSelfDeathEnemyAllStatus, statuses: [...trait.onSelfDeathEnemyAllStatus.statuses] };
    }
    if (trait.skullLethalChance !== undefined) {
      passive.skullLethalChance = Math.max(passive.skullLethalChance ?? 0, trait.skullLethalChance);
    }
    if (trait.onSkullHitKill && passive.onSkullHitKill === undefined) {
      passive.onSkullHitKill = { ...trait.onSkullHitKill };
    }
    // 吞噬触发（R22 批 voracious/consumefuel/bloodyfeast）：同字段取先声明的一条
    //（与 onSkullHitKill 单值触发族同口径）
    if (trait.onSkullHitDevour && passive.onSkullHitDevour === undefined) {
      passive.onSkullHitDevour = { ...trait.onSkullHitDevour };
    }
    if (trait.onSkullDamagedDevour && passive.onSkullDamagedDevour === undefined) {
      passive.onSkullDamagedDevour = { ...trait.onSkullDamagedDevour };
    }
    if (trait.onEnemyDeathDevour && passive.onEnemyDeathDevour === undefined) {
      passive.onEnemyDeathDevour = { ...trait.onEnemyDeathDevour };
    }
    // 自复活（凤凰涅槃批 Sunbird「浴火重生」）：同类取概率更高的一条（缺省 1，与死亡召唤
    // "同类取最强"口径一致）
    if (trait.selfRevive
      && (passive.selfRevive === undefined || (trait.selfRevive.chance ?? 1) > (passive.selfRevive.chance ?? 1))) {
      passive.selfRevive = { ...trait.selfRevive };
    }
    // 战后经济加成（merchant/necromancy 族）：同类比率累加（与增益类"累加"口径一致）。
    if (trait.battleEconomyGain) {
      passive.battleEconomyGain ??= { gold: 0, souls: 0 };
      passive.battleEconomyGain[trait.battleEconomyGain.currency] += trait.battleEconomyGain.ratio;
    }
    // 条件经济光环（条件经济批）：大连版按 minSize 分桶累加、骷髅版直接累加
    // （多持有者各自入账由结算侧按角色循环保证，与 gainOnBigMatch 同口径）。
    if (trait.onBigMatchEconomy) {
      const k = String(trait.onBigMatchEconomy.minSize ?? 4);
      const bucket = (bigMatchEconomy[k] ??= { gold: 0, souls: 0, gems: 0 });
      bucket[trait.onBigMatchEconomy.currency] += trait.onBigMatchEconomy.amount;
    }
    if (trait.onSkullMatchEconomy) {
      skullEconomy[trait.onSkullMatchEconomy.currency] += trait.onSkullMatchEconomy.amount;
    }
    // —— 缺口清扫批 ——
    // 施法显式状态（moonfestival/gibberingmadness/magehunter/psychicbacklash/hemlock）：
    // 按触发主体分桶，各取先声明的一条（与 castRandomStatus 同口径）
    if (trait.onAllyCastStatus && castStatus.onAllyCast === undefined) {
      castStatus.onAllyCast = { ...trait.onAllyCastStatus, statuses: [...trait.onAllyCastStatus.statuses] };
    }
    if (trait.onEnemyCastStatus && castStatus.onEnemyCast === undefined) {
      castStatus.onEnemyCast = { ...trait.onEnemyCastStatus, statuses: [...trait.onEnemyCastStatus.statuses] };
    }
    // 施法敌方削减（psychicaffliction/succumb）：取先声明的一条
    if (trait.onAllyCastEnemyDrain && castEnemyDrain === undefined) {
      castEnemyDrain = { ...trait.onAllyCastEnemyDrain };
    }
    // 惰性经济/召唤/风暴（goldenhoard/soulgatherer/soulverdict/pickpocket/harpyflock/
    // parliamentarycall/snowstorm 族）：按币种/同字段聚合累加或取先声明——战斗结算路径
    // 不消费（对应钩子落地时经 passivesOf 直接读），编译只为数据建模完整。
    if (trait.turnStartEconomy) turnStartEconomy[trait.turnStartEconomy.currency] += trait.turnStartEconomy.amount;
    if (trait.onAllyCastEconomy) allyCastEconomy[trait.onAllyCastEconomy.currency] += trait.onAllyCastEconomy.amount;
    if (trait.onDamagedEconomy) damagedEconomy[trait.onDamagedEconomy.currency] += trait.onDamagedEconomy.amount;
    if (trait.turnStartSummon && turnStartSummon === undefined) turnStartSummon = { ...trait.turnStartSummon };
    if (trait.turnStartStorm && turnStartStorm === undefined) turnStartStorm = { ...trait.turnStartStorm };
    // PVP 限定（defender/siege/virtueofhonor）：惰性建模，pvpMode 标记 + 加成按声明序保留
    if (trait.mode === 'pvp') passive.pvpMode = true;
    if (trait.pvpBonus) pvpBonuses.push({ ...trait.pvpBonus });
    if (trait.pvpEconomyGain && passivePvpEconomy === undefined) {
      passivePvpEconomy = { ...trait.pvpEconomyGain };
    }
    // 模式专属特质批（淘宝/晋升/赏金）：只编译、不消费——标准战斗结算路径不读这些字段，
    // 编译产物仅供数据对账与将来 Delve/晋升层直接使用。
    if (trait.onDelveGain) {
      delveGains[trait.onDelveGain.stat] = (delveGains[trait.onDelveGain.stat] ?? 0) + trait.onDelveGain.amount;
    }
    if (trait.onDelveBounty) {
      const b = trait.onDelveBounty;
      passive.onDelveBounty = passive.onDelveBounty
        ? { min: Math.min(passive.onDelveBounty.min, b.min), max: Math.max(passive.onDelveBounty.max, b.max) }
        : { ...b };
    }
    if (trait.onDelveMiles && passive.onDelveMiles === undefined) {
      passive.onDelveMiles = { multipliers: [...trait.onDelveMiles.multipliers] };
    }
    if (trait.vsAscendedMultiplier) {
      vsAscended.push({ ...trait.vsAscendedMultiplier });
    }
    // —— 战斗机制批（jinx / indigestible / goodtarot+badtarot）——
    // 宝石灵力抑制：多条并存取最强抑制（min，与减伤族「取最强」同口径）
    if (trait.enemyMasteryMult !== undefined) {
      passive.enemyMasteryMult = Math.min(passive.enemyMasteryMult, trait.enemyMasteryMult);
    }
    // 吞噬免疫：布尔取或
    if (trait.devourImmunity) passive.devourImmunity = true;
    // 施法随机状态：同类取先声明的一条（与 onDamagedStatus 等单值变体同口径）
    if (trait.onAllyCastRandomStatus && passive.castRandomStatus === undefined) {
      passive.castRandomStatus = { ...trait.onAllyCastRandomStatus };
    }
  }

  passive.skullDamageTaken = 1 - Math.min(0.95, skullReduction);
  passive.spellDamageTaken = 1 - Math.min(0.95, spellReduction);
  passive.statusImmunities = [...immunities];
  passive.manaLink = manaLink;
  passive.skullMultVsTroopType = multByType;
  passive.skullMultVsStatus = multByStatus;
  passive.skullMultVsColor = multByColor;
  passive.gainOnColorMatch = colorMatchGains;
  passive.bigMatchTypeAura = Object.fromEntries(bigMatchAura);
  passive.gainOnBigMatchSized = sizedBigMatchGains;
  passive.colorMatchTypeAura = colorMatchAura;
  passive.gainOnEnemyColorMatch = enemyColorGains;
  passive.colorMatchStatus = colorMatchStatus;
  passive.colorMatchDrain = colorMatchDrain;
  passive.colorMatchDamage = colorMatchDamage;
  passive.bigMatchDamage = bigMatchDamage;
  passive.bigMatchEnemyDrain = bigMatchEnemyDrain;
  passive.bigMatchCreateGem = bigMatchCreateGem;
  passive.cleanseOnColorMatch = [...cleanseColors];
  passive.cleanseOnBigMatch = cleanseBigMatch;
  passive.onBigMatchStatus = bigMatchStatus;
  passive.bigMatchEconomyGain = bigMatchEconomy;
  passive.skullMatchEconomyGain = { ...skullEconomy };
  // 模式专属特质批：聚合产物挂载（空对象/空数组也是确定性的中性形态，与 neutralPassives 一致）
  passive.onDelveGains = delveGains;
  passive.vsAscendedMultipliers = vsAscended;
  // 缺口清扫批：聚合产物挂载（同上，空形态 = 无效果）
  if (castStatus.onAllyCast || castStatus.onEnemyCast) passive.castStatus = castStatus;
  if (castEnemyDrain) passive.castEnemyDrain = castEnemyDrain;
  passive.turnStartEconomyGains = { ...turnStartEconomy };
  passive.allyCastEconomyGains = { ...allyCastEconomy };
  passive.damagedEconomyGains = { ...damagedEconomy };
  if (turnStartSummon) passive.turnStartSummon = turnStartSummon;
  if (turnStartStorm) passive.turnStartStorm = turnStartStorm;
  passive.pvpBonuses = pvpBonuses;
  if (passivePvpEconomy) passive.pvpEconomyGain = passivePvpEconomy;
  if (damagedStatusList.length > 0) passive.inflictOnSkullDamagedList = damagedStatusList;
  if (skullHitStatusList.length > 0) passive.inflictOnSkullHitList = skullHitStatusList;
  return passive;
}

/** 就地为角色编译并挂上被动修正。无特质的角色也会挂中性值，读取处无需判空。 */
export function attachPassives(char: Character, lookup: TraitLookup = getTrait): void {
  char.passive = resolvePassives(char.traitIds, lookup);
}

/** 取角色的被动修正；未编译过时返回中性值。 */
export function activeTraitIds(char: Character): readonly string[] {
  return char.statuses.some(st => st.id === 'stun' && st.turns > 0) ? [] : (char.traitIds ?? []);
}

export function passivesOf(char: Character): PassiveModifiers {
  // Stun suppresses all trait-derived modifiers until the status is removed.
  // Keep the compiled passive on the Character so cleansing restores it.
  if (char.statuses.some(st => st.id === 'stun' && st.turns > 0)) return NEUTRAL_PASSIVES;
  return char.passive ?? NEUTRAL_PASSIVES;
}

/** Resolve names at the trigger, never infer activation from the final roster. */
export function traitActivations(
  char: Character,
  matches: (trait: TraitDefinition) => boolean,
): import('./events').TraitActivation[] {
  return activeTraitIds(char).flatMap(code => {
    const def = getTrait(code);
    return def && matches(def)
      ? [{ characterId: char.id, traitId: code, name: char.traitNames?.[code] ?? def.name }]
      : [];
  });
}

/** Max-stacking defenses credit only the winning modifier, not every owned trait. */
export function strongestTraitActivation(
  char: Character,
  field: 'skullDamageReduction' | 'spellDamageReduction' | 'dodgeChance' | 'reflectSkullRatio' | 'armorPierceChance',
): import('./events').TraitActivation[] {
  const strongest = activeTraitIds(char).reduce((best, code) => Math.max(best, getTrait(code)?.[field] ?? 0), 0);
  return strongest > 0 ? traitActivations(char, def => def[field] === strongest).slice(0, 1) : [];
}

/** Attach provenance only to nonzero stat changes emitted by this trigger. */
function annotateTraitBuffs(
  events: BuffEvent[], start: number, holder: Character,
  spec: (trait: TraitDefinition, stat: PassiveStat) => boolean,
): void {
  for (let i = start; i < events.length; i++) {
    const event = events[i];
    const cues = traitActivations(holder, def => spec(def, event.stat));
    if (cues.length) event.traitActivations = cues;
  }
}

function gainAffects(gain: { stat: PassiveStat; amount: number; alsoStats?: PassiveStat[] } | undefined, stat: PassiveStat): boolean {
  return !!gain && gain.amount !== 0 && (gain.stat === stat || !!gain.alsoStats?.includes(stat));
}

/** 角色是否免疫某状态。 */
export function isImmuneToStatus(char: Character, statusId: string): boolean {
  const immunities = passivesOf(char).statusImmunities;
  return immunities.includes(ALL_STATUSES) || immunities.includes(statusId);
}

/**
 * 攻击者对某目标的骷髅伤害倍率（屠戮类特质）。
 *
 * 多个条件同时命中时取**最强的一项**而不是相乘：龙族杀手 ×2 叠上烈焰之恨 ×2 变 ×4
 * 会让特定队伍组合瞬秒，且玩家无法从描述预期实际倍率。
 */
/** 仅宿主明确标记的活动目标触发，普通战斗完全不变；当前品质0..5（基础品质+晋升）对应3..5倍。 */
export function eventDamageMultiplier(attacker: Character, target: Character): number {
  if (!target.eventTarget || attacker.statuses.some(s => s.id === 'stun')) return 1;
  const progress = Math.max(0, Math.min(5, attacker.eventRarity ?? 0)) / 5;
  return passivesOf(attacker).vsAscendedMultipliers.reduce((mult, spec) =>
    spec.target === target.eventTarget ? Math.max(mult, spec.min + (spec.max - spec.min) * progress) : mult, 1);
}

export function skullDamageMultiplier(attacker: Character, target: Character): number {
  const p = passivesOf(attacker);
  let mult = 1;
  for (const type of target.troopTypes ?? []) {
    mult = Math.max(mult, p.skullMultVsTroopType[type] ?? 1);
  }
  for (const status of target.statuses) {
    mult = Math.max(mult, p.skullMultVsStatus[status.id] ?? 1);
  }
  for (const color of target.colors) {
    mult = Math.max(mult, p.skullMultVsColor[color] ?? 1);
  }
  if (target.hp < target.maxHp) mult = Math.max(mult, p.skullMultVsWounded);
  return mult * eventDamageMultiplier(attacker, target);
}

/** 匹配某色宝石时该角色的法力灵链加成（含彩虹灵链）。 */
export function manaLinkBonus(char: Character, color: BaseColor): number {
  const link = passivesOf(char).manaLink;
  return (link[color] ?? 0) + (link[ALL_COLORS] ?? 0);
}

/** 就地给角色某项数值加值，hp/armor 同时抬上限，返回实际变化量。 */
export function grantStat(char: Character, stat: PassiveStat, amount: number): number {
  if (amount === 0 || char.defeated) return 0;
  // Entangle prevents Attack buffs from spells and traits until it is removed.
  if (stat === 'attack' && amount > 0 && char.statuses.some(s => s.id === 'entangle' && s.turns > 0)) return 0;
  if (stat === 'magic') {
    // 织网（GoW Web）期间无法获得魔力值增益。字面量与 status.ts 的 WEB_STATUS_ID 一致；
    // 不直接 import 是为避免 traits ↔ status 的运行时循环依赖（status 依赖本模块）。
    if (char.statuses.some((s) => s.id === 'web' && s.turns > 0)) return 0;
  }
  if (stat === 'mana') {
    const before = char.mana;
    char.mana = Math.max(0, Math.min(char.manaCost, char.mana + amount));
    return char.mana - before;
  }
  if (stat === 'hp') {
    char.maxHp = Math.max(1, char.maxHp + amount);
    char.hp = Math.max(1, Math.min(char.maxHp, char.hp + amount));
    return amount;
  }
  if (stat === 'armor') {
    char.armor = Math.max(0, char.armor + amount);
    return amount;
  }
  const before = char[stat];
  char[stat] = Math.max(0, before + amount);
  return char[stat] - before;
}

/** 触发类被动的统一施加口：给一组角色套用它们各自的某项触发增益。 */
function applyTrigger(
  characters: readonly Character[],
  field: keyof Pick<
    PassiveModifiers,
    'gainOnAllyCast' | 'gainOnEnemyCast' | 'gainOnEnemyDeath' | 'gainOnAllyDeath' | 'gainOnBigMatch'
  >,
): BuffEvent[] {
  const events: BuffEvent[] = [];
  for (const char of characters) {
    if (char.defeated) continue;
    const eventStart = events.length;
    const gains = passivesOf(char)[field];
    for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
      const actual = grantStat(char, stat, gains[stat]);
      if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual });
    }
    const source = TRIGGER_FIELDS.find(([, into]) => into === field)?.[0];
    if (source) annotateTraitBuffs(events, eventStart, char, (def, stat) => gainAffects(def[source], stat));
  }
  return events;
}

/**
 * 施法响应（秘法/铭刻/怨恨…）。
 * 施法者所在队全体走「盟友施法」，对方全体走「敌人施法」——施法者自己也算盟友，与官方一致。
 */
export function applyCastTriggers(
  casterTeam: readonly Character[],
  opposingTeam: readonly Character[],
): BuffEvent[] {
  return [
    ...applyTrigger(casterTeam, 'gainOnAllyCast'),
    ...applyTrigger(opposingTeam, 'gainOnEnemyCast'),
    // 盟友施法队伍光环（virtueofloyalty「当一名盟友施放法术时，所有盟友获得…」）：
    // 持有者在施法方队伍时生效，受益者为该队存活盟友。
    ...applyTypeAuraGains(casterTeam, casterTeam, 'onAllyCastTypeAura'),
    // 敌方施法队伍光环（职业天赋 portent「当敌人施放法术时，所有人马族获得 2 点魔力值」）：
    // 持有者在受击方（对方施法时的己方）队伍，受益者为同队存活盟友。
    ...applyTypeAuraGains(opposingTeam, opposingTeam, 'onEnemyCastTypeAura'),
  ];
}

/**
 * 施法响应·随机状态（战斗机制批 goodtarot「Grant a random status effect to a random Ally
 * when an Ally casts a spell」/ badtarot 同款但官方目标是随机 Enemy）+ 施法显式状态
 * （缺口清扫批 moonfestival/gibberingmadness/magehunter/psychicbacklash/hemlock）+
 * 施法敌方削减（psychicaffliction/succumb）。
 *
 * 与 applyCastTriggers 同一触发点（castSkillAction 施法响应区、技能效果之前）结算。
 * 随机状态池按 scope 取阵营——randomAlly=正面池、randomEnemy=负面池（与技能
 * randomStatusEffect 的阵营裁定同源；池本体经 ctx.poolOf 注入，避免 traits ↔ status
 * 循环依赖），回合数 3。每个存活持有者独立结算：掷目标一次、池内掷签一次。
 * 施法者自己也算盟友，与官方一致。无 rng/施加口/池注入时随机状态整块跳过。
 *
 * 显式状态走 onAllyCast/onEnemyCast 双桶：持有者在施法方队伍走 onAllyCast
 *（目标按 scope：self=持有者 / randomAlly=施法方存活 / randomEnemy=对方存活），
 * 在对方队伍走 onEnemyCast（magehunter「敌人施法时自身狂怒」/ psychicbacklash
 * 「击晕随机敌人」）。概率 <1 走种子化 rng（无 rng 不生效），随机目标各耗一次。
 * 施法敌方削减为 reduce 语义（reduceStat 夹零发负 buff 事件，manashield 在削减口拦截），
 * allEnemies 逐个确定性削减、零随机消耗（stat 'random' 每目标掷一次属性）。
 */
export function applyCastRandomStatusTriggers(
  casterTeam: readonly Character[],
  opposingTeam: readonly Character[],
  ctx: {
    /** 随机目标选择 / 池内掷签；缺省时整块跳过（纯逻辑环境零事件、零随机消耗） */
    rng?: Pick<SeededRNG, 'next'>;
    /** 状态施加口（TurnEngine 注入 skills/effects/status 的 applyStatus，免疫在施加口拦截） */
    applyStatus?: (char: Character, status: StatusInstance) => GameEvent[];
    /** 池解析：scope → 状态 id 列表（TurnEngine 注入同名 RANDOM_*_STATUS_POOL） */
    poolOf?: (scope: 'randomAlly' | 'randomEnemy') => readonly string[];
  } = {},
): GameEvent[] {
  if (!ctx.rng || !ctx.applyStatus || !ctx.poolOf) return [];
  const events: GameEvent[] = [];
  for (const holder of casterTeam) {
    if (holder.defeated) continue;
    const spec = passivesOf(holder).castRandomStatus;
    if (!spec) continue;
    const pool = ctx.poolOf(spec.scope);
    if (pool.length === 0) continue;
    const targets = (spec.scope === 'randomAlly' ? casterTeam : opposingTeam)
      .filter((c) => !c.defeated);
    if (targets.length === 0) continue;
    const target = targets[Math.floor(ctx.rng.next() * targets.length)];
    const id = pool[Math.floor(ctx.rng.next() * pool.length)];
    events.push(...ctx.applyStatus(target, { id, turns: 3 }));
  }
  // —— 施法显式状态 ——显式目标（self）不耗随机数；随机目标各耗一次；概率 <1 先掷一次
  const aliveIn = (team: readonly Character[]) => team.filter((c) => !c.defeated);
  const casterAlive = aliveIn(casterTeam);
  const foeAlive = aliveIn(opposingTeam);
  const explicit = (
    holder: Character,
    spec: NonNullable<NonNullable<PassiveModifiers['castStatus']>['onAllyCast']>,
    allies: readonly Character[],
    foes: readonly Character[],
  ) => {
    if (holder.defeated) return;
    if (spec.chance !== undefined && ctx.rng!.next() >= spec.chance) return;
    let target: Character | undefined;
    if (spec.scope === 'self') {
      target = holder;
    } else if (spec.scope === 'randomAlly') {
      if (allies.length === 0) return;
      target = ctx.rng ? allies[Math.floor(ctx.rng.next() * allies.length)] : allies[0];
    } else {
      if (foes.length === 0) return;
      target = ctx.rng ? foes[Math.floor(ctx.rng.next() * foes.length)] : foes[0];
    }
    for (const st of spec.statuses) {
      events.push(...ctx.applyStatus!(target, { id: st.id, turns: spec.turns, ...(st.magnitude !== undefined ? { magnitude: st.magnitude } : {}) }));
    }
  };
  for (const holder of casterTeam) {
    const spec = passivesOf(holder).castStatus?.onAllyCast;
    if (spec) explicit(holder, spec, casterAlive, foeAlive);
  }
  for (const holder of opposingTeam) {
    const spec = passivesOf(holder).castStatus?.onEnemyCast;
    if (spec) explicit(holder, spec, foeAlive, casterAlive);
  }
  // —— 施法敌方削减（psychicaffliction/succumb，reduce 语义）——持有者在施法方队伍时生效；
  // stat 'random' 按目标各掷一次属性（官方 Skill Points = 生命/护甲/攻击/魔法四项，hp 经
  // reduceStat 夹零、无击杀；无 rng 按随机技能值口径落 magic，与「随机技能值」解析约定一致）；
  // 削减夹零发负 buff 事件、法力走耗蓝口径（manashield 免疫在 reduceStat 拦截）。
  const DRAIN_STATS = ['hp', 'armor', 'attack', 'magic'] as const;
  for (const holder of casterTeam) {
    if (holder.defeated) continue;
    const spec = passivesOf(holder).castEnemyDrain;
    if (!spec) continue;
    // scope randomEnemy（职业天赋 spiritdrain「耗掉一名随机敌人 2 点法力值」）：每持有者
    // 耗一次 rng 掷目标；allEnemies（psychicaffliction/succumb 原口径）逐个确定性削减。
    const targets = spec.scope === 'randomEnemy'
      ? (ctx.rng && foeAlive.length > 0 ? [foeAlive[Math.floor(ctx.rng.next() * foeAlive.length)]] : [])
      : foeAlive;
    for (const foe of targets) {
      const stat = spec.stat === 'random'
        ? (ctx.rng ? DRAIN_STATS[Math.floor(ctx.rng.next() * DRAIN_STATS.length)] : 'magic')
        : spec.stat;
      events.push(...reduceStat(foe, stat, spec.amount));
    }
  }
  return events;
}

/**
 * 位次条件光环（战斗机制批 leader「当军队位于首位时，全部技能值将增加 3 点」/
 * general·goblord 末位版）。定义直读键（getTrait，同 teamAura 口径，不进 passive）。
 *
 * 结算语义「进入该位次时一次性补授」：front=编队首位（characters[0]，阵亡者被移出
 * 编队后天然前移）、last=编队末位。位次在本引擎编队模型下只会因阵亡/逃离前移或
 * 召唤追加、不回退，因此「进入即补授」与官方「处于该位次期间生效」等效；
 * granted 集合由宿主（TurnEngine）按战斗持有防重复授出。战斗开始与每次行动开始
 * 各结算一次（首位易主在下次行动开始补授）。返回 buff 事件供演出。
 */
export function applyPositionAuras(
  teams: readonly (readonly Character[])[],
  granted: Set<number>,
  lookup: TraitLookup = getTrait,
): BuffEvent[] {
  const events: BuffEvent[] = [];
  for (const team of teams) {
    if (team.length === 0) continue;
    const occupant = team[0];
    const occupantLast = team[team.length - 1];
    // front 位次 occupant === occupantLast 时（单人队）同一人只授一次
    const candidates = new Set<Character>([occupant]);
    candidates.add(occupantLast);
    for (const char of candidates) {
      if (!char || char.defeated || granted.has(char.id)) continue;
      const auras = (char.traitIds ?? [])
        .map((code) => lookup(code)?.positionAura)
        .filter((a): a is NonNullable<typeof a> => !!a);
      if (auras.length === 0) continue;
      let didGrant = false;
      for (const aura of auras) {
        const inPosition = aura.position === 'front' ? char === occupant : char === occupantLast;
        if (!inPosition) continue;
        didGrant = true;
        for (const stat of GAIN_STAT_ORDER) {
          const actual = grantStat(char, stat, aura.gains[stat] ?? 0);
          if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual });
        }
      }
      // 只有真正处于光环位次并授出过才登记：不在位次的持有者保留将来补授资格
      //（如 front 位持 last 光环者，待身前角色离场后进入末位时再授）。
      if (didGrant) granted.add(char.id);
    }
  }
  return events;
}

/** Self-death mana gift. Called once per resolved defeat, after revival checks. */
export function applySelfDeathManaGift(
  dead: Character,
  allies: readonly Character[],
  rng: { nextInt(max: number): number },
): GameEvent[] {
  if (!dead.defeated || !passivesOf(dead).onSelfDeathFillAllyMana) return [];
  const pool = allies.filter(c => c.id !== dead.id && !c.defeated && c.hp > 0);
  if (pool.length === 0) return [];
  // Full-mana allies remain valid: the trait promises a random ally, not smart targeting.
  const target = pool[rng.nextInt(pool.length)];
  const amount = grantStat(target, 'mana', Math.max(0, target.manaCost - target.mana));
  return amount > 0 ? [{ type: 'buff', source: 'trait', targetId: target.id, stat: 'mana', amount,
    traitActivations: traitActivations(dead, def => !!def.onSelfDeathFillAllyMana),
  }] : [];
}

/**
 * 阵亡响应（吸收生命/复仇者/庆功…）。
 * @param deadTeam 阵亡者所在队；该队存活者走「盟友阵亡」，对方走「敌人阵亡」
 */
export function applyDeathTriggers(
  deadTeam: readonly Character[],
  opposingTeam: readonly Character[],
  ctx: DeathTriggerContext = {},
): GameEvent[] {
  const events: GameEvent[] = [
    ...applyTrigger(deadTeam, 'gainOnAllyDeath'),
    ...applyTrigger(opposingTeam, 'gainOnEnemyDeath'),
    // 盟友身亡队伍光环（virtueofsacrifice「当一名盟友身亡时，所有盟友获得…」）：
    // 持有者为死者一方存活角色，受益者同队存活盟友（'all'=全队/种族名）。
    ...applyTypeAuraGains(deadTeam, deadTeam, 'onAllyDeathTypeAura'),
  ];
  // 盟友身亡施加状态（职业天赋 savior「给另一名随机盟友屏障」/ feyvengeance、upinflames
  // 「使随机敌人妖火/燃烧」）：持有者=死者的**同队**存活队友（对方的"盟友死"触发走
  // applyEnemyDeathTriggers，不在此列）。target=randomAlly 从死者一方存活取、randomEnemy
  // 从对方存活取；随机目标经 ctx.rng（无 rng 退化为首个存活），施加经 ctx.applyStatus
  //（免疫在施加口拦截）。
  for (const holder of deadTeam) {
    if (holder.defeated) continue;
    const spec = passivesOf(holder).onAllyDeathStatus;
    if (!spec) continue;
    const pool = (spec.target === 'randomAlly' ? deadTeam : opposingTeam).filter((c) => !c.defeated);
    if (pool.length === 0) continue;
    const target = ctx.rng ? pool[Math.floor(ctx.rng.next() * pool.length)] : pool[0];
    for (const st of spec.statuses) {
      if (!ctx.applyStatus) continue;
      const status: StatusInstance = { id: st.id, turns: spec.turns };
      if (st.magnitude !== undefined) status.magnitude = st.magnitude;
      events.push(...ctx.applyStatus(target, status));
    }
  }
  return events;
}

/** 死亡触发家族的执行环境（全部可选——缺省时状态/猎杀类变体跳过） */
export interface DeathTriggerContext {
  /** 状态施加口（免疫在施加口拦截）；缺省时状态类跳过 */
  applyStatus?: (char: Character, status: StatusInstance) => GameEvent[];
  /** 随机目标 / 概率判定；缺省时随机目标退化为首个存活、概率 <1 不生效 */
  rng?: Pick<SeededRNG, 'next'>;
  /** 即杀口（onEnemyDeathKill 的处决通道）；缺省时猎杀类跳过 */
  kill?: (target: Character) => GameEvent[];
}

/**
 * 队伍光环变体的统一施加口（T2 死亡钩子批 + virtue 修正批）：
 * 持有者（存活）触发时，给 team 内匹配范围的存活成员套用光环增益。
 * troopType 'all' = 全队（virtueofjustice），其余按种族名查 troopTypes。
 */
function applyTypeAuraGains(
  holders: readonly Character[],
  team: readonly Character[],
  field: 'onEnemyDeathTypeAura' | 'onAllyDeathTypeAura' | 'onAllyCastTypeAura' | 'onEnemyCastTypeAura' | 'onDamagedTypeAura',
): BuffEvent[] {
  const events: BuffEvent[] = [];
  for (const holder of holders) {
    if (holder.defeated) continue;
    const aura = passivesOf(holder)[field];
    if (!aura) continue;
    for (const member of team) {
      if (member.defeated) continue;
      if (aura.troopType !== 'all' && !(member.troopTypes ?? []).includes(aura.troopType)) continue;
      for (const stat of GAIN_STAT_ORDER) {
        const actual = grantStat(member, stat, aura.gains[stat] ?? 0);
        if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: member.id, stat, amount: actual, traitActivations: traitActivations(holder, def => !!def[field]?.gains[stat]) });
      }
    }
  }
  return events;
}

/**
 * 敌人身亡触发的状态/种族光环变体（T2 死亡钩子批：bloodlust/lordofdeath/sharedfate）。
 *
 * 与 applyDeathTriggers 同一时机（行动末尾统一扫 defeat 事件）、同一持有者口径：
 * 持有者为死者的对方全队存活角色，按队伍序结算。三类变体：
 *   - onEnemyDeathStatus：持有者自身获得状态（bloodlust「在敌人身亡时获得狂怒效果」）；
 *   - onEnemyDeathTypeAura：持有者一方指定种族的存活盟友获得数值，含持有者本人
 *     （lordofdeath「所有不死族在一名敌人身亡时获得 5 点生命值和魔力值」）；
 *   - onEnemyDeathEnemyStatus：死者已被移出编队，目标取死者一方队伍序首个存活角色
 *     （sharedfate「在一名敌人身亡时，使另一名敌人陷入死亡标记状态」），确定性、不耗随机数。
 * applyStatus 由 TurnEngine 注入（与 onBigMatchStatus 同口径，免疫在 applyStatus 内拦截）；
 * 缺省时状态类变体跳过，仅光环类生效。
 */
export function applyEnemyDeathTriggers(
  opposingTeam: readonly Character[],
  deadSideTeam: readonly Character[],
  ctx: { applyStatus?: (char: Character, status: StatusInstance) => GameEvent[]; rng?: Pick<SeededRNG, 'next'>; kill?: (target: Character) => GameEvent[] } = {},
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const holder of opposingTeam) {
    if (holder.defeated) continue;
    const p = passivesOf(holder);
    if (p.onEnemyDeathStatus && ctx.applyStatus) {
      events.push(...ctx.applyStatus(holder, {
        id: p.onEnemyDeathStatus.id,
        turns: p.onEnemyDeathStatus.turns,
      }));
    }
    if (p.onEnemyDeathEnemyStatus && ctx.applyStatus) {
      const target = deadSideTeam.find((c) => !c.defeated);
      if (target) {
        events.push(...ctx.applyStatus(target, {
          id: p.onEnemyDeathEnemyStatus.id,
          turns: p.onEnemyDeathEnemyStatus.turns,
        }));
      }
    }
    // 敌方身亡→死者一方另一名随机存活陷入状态（职业天赋 chillofdeath「当敌人身亡时，
    // 冻结另一名随机敌人」）：与 sharedfate 同点，目标改随机（经 ctx.rng，无 rng 退化首存）。
    if (p.onEnemyDeathRandomStatus && ctx.applyStatus) {
      const pool = deadSideTeam.filter((c) => !c.defeated);
      if (pool.length > 0) {
        const target = ctx.rng ? pool[Math.floor(ctx.rng.next() * pool.length)] : pool[0];
        for (const st of p.onEnemyDeathRandomStatus.statuses) {
          const status: StatusInstance = { id: st.id, turns: p.onEnemyDeathRandomStatus.turns };
          if (st.magnitude !== undefined) status.magnitude = st.magnitude;
          events.push(...ctx.applyStatus(target, status));
        }
      }
    }
    // 敌方身亡→死者一方全部存活陷入状态（职业天赋 brutalstrike「当敌人身亡时，使所有
    // 敌人陷入出血状态」）：确定性逐个施加，零随机消耗。
    if (p.onEnemyDeathEnemyAllStatus && ctx.applyStatus) {
      for (const target of deadSideTeam) {
        if (target.defeated) continue;
        for (const st of p.onEnemyDeathEnemyAllStatus.statuses) {
          const status: StatusInstance = { id: st.id, turns: p.onEnemyDeathEnemyAllStatus.turns };
          if (st.magnitude !== undefined) status.magnitude = st.magnitude;
          events.push(...ctx.applyStatus(target, status));
        }
      }
    }
    // 敌方身亡→按概率猎杀死者一方末位存活（职业天赋 risingshadows「当另一名敌人身亡时，
    // 有 7% 的几率猎杀最后一名敌人」）：概率经 ctx.rng（无 rng 不生效），处决经 ctx.kill
    //（defeat 出编队管线，同 bigMatchKill 口径）。新增的 defeat 不再回灌本次扫描
    //（与 applyBigMatchTriggers 的 kill 同口径）。
    if (p.onEnemyDeathKill && ctx.kill) {
      if (ctx.rng && ctx.rng.next() < p.onEnemyDeathKill.chance) {
        const pool = deadSideTeam.filter((c) => !c.defeated);
        if (pool.length > 0) events.push(...ctx.kill(pool[pool.length - 1]));
      }
    }
  }
  // 种族光环（lordofdeath 不死族 / virtueofjustice 'all' 全队）：
  // 受益者为持有者一方该种族（或全部）的存活盟友，含持有者本人。
  // 放在持有者循环外统一结算（helper 内部自带持有者循环，避免 N×N 重复施加）。
  events.push(...applyTypeAuraGains(opposingTeam, opposingTeam, 'onEnemyDeathTypeAura'));
  return events;
}

/** 死亡召唤特质的定义字段（summonOnDeath / summonOnAllyDeath / summonOnEnemyDeath 共用） */
export type DeathSummonSpec = NonNullable<TraitDefinition['summonOnDeath']>;

/** 死亡召唤的执行环境：由 TurnEngine 注入，避免 traits 直接依赖 GameState/编队容量逻辑 */
export interface DeathSummonContext {
  /** 阵亡者 id（供宿主侧判定等元数据；配对召唤等无死者来源的变体可省略） */
  deadId?: number;
  /** 分配新角色 id（TurnEngine 注入，确定性）；缺省时该次召唤跳过 */
  nextCharId?: () => number;
  /** 召唤物入队：side 为**持有者**所在方（召唤物跟随持有者，而非死者），填空位或进 FIFO 队列 */
  enqueue: (summoned: Character, troopId: number, side: PlayerSide) => GameEvent[];
  /**
   * 风暴召唤结算（spec 带 storm 变体时调用，不入队）：side 为持有者所在方，
   * 宿主负责顶替裁定（全场唯一）并产出 storm-change 事件；缺省时风暴召唤跳过。
   */
  setStorm?: (spec: DeathSummonSpec, side: PlayerSide) => GameEvent[];
  /** 种子化随机源（概率判定）；缺省时概率 <1 的召唤不生效（纯逻辑单测可省略） */
  rng?: { next(): number };
}

/** 战斗开始时由特质召唤风暴的已解析请求。 */
export interface BattleStartStormSpec {
  spec: DeathSummonSpec;
  side: PlayerSide;
}

/** 收集开局风暴，保持队伍和特质声明顺序以保证多风暴时的确定性。 */
export function collectBattleStartStorms(
  characters: readonly Character[],
  side: PlayerSide,
  lookup: TraitLookup = getTrait,
): BattleStartStormSpec[] {
  const specs: BattleStartStormSpec[] = [];
  for (const char of characters) {
    if (char.defeated) continue;
    for (const code of activeTraitIds(char)) {
      const storm = lookup(code)?.battleStartStorm;
      if (!storm) continue;
      specs.push({
        side,
        spec: {
          chance: 1,
          troopId: storm.troopId,
          referenceName: storm.referenceName,
          displayName: storm.displayName,
          storm,
        },
      });
    }
  }
  return specs;
}

/**
 * 死亡召唤结算（daemonicpact/terrorpact/fromdark/darkdeath 族）。
 *
 * spec 带风暴变体（storm）时**不入队**：改走 ctx.setStorm 设置持有者一方的
 * 全局风暴（Team.storm，见 TurnEngine.setStormFromSummon 的顶替裁定），
 * 概率判定与兵种召唤同口径。多个 spec 按传入顺序结算，后召顶先召。
 *
 * @param specs 调用方（TurnEngine.resolveDeathSummons）已按持有者语义预筛的召唤规格，
 *              每项携带持有者所在方（召唤物跟随持有者入队），顺序即入队顺序（确定性）。
 * 由 TurnEngine 在行动末尾统一扫 defeat 事件时调用（与 applyDeathTriggers 同一时机）。
 * 概率判定经种子化 rng（确定性）；召唤物模板由生成器按兵种数据预解析（troopId/referenceName）。
 */
export function applyDeathSummons(
  specs: { spec: DeathSummonSpec; side: PlayerSide }[],
  ctx: DeathSummonContext,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const { spec, side } of specs) {
    if (ctx.rng && ctx.rng.next() >= spec.chance) continue;
    // 风暴变体：不是兵种，不入队——交给宿主设置 team.storm（不需要 nextCharId/模板）
    if (spec.storm) {
      if (ctx.setStorm) events.push(...ctx.setStorm(spec, side));
      continue;
    }
    if (!ctx.nextCharId) continue; // 无 id 分配器则安全跳过（纯单测环境）
    const template = resolveSummonTemplate(spec);
    if (!template) continue;
    const id = ctx.nextCharId();
    // 复活族（immortal/deepsoul/rebirth「resurrect with full Mana」）：fullMana 时召唤物
    // 以满法力入场（复活=召唤自身模板 + 补满法力条，与官方「with full Mana」一致）。
    const mana = spec.fullMana === true ? template.manaCost : template.mana;
    events.push(...ctx.enqueue({ ...template, id, defeated: false, statuses: [], mana }, spec.troopId, side));
  }
  return events;
}

/**
 * 从召唤描述构造召唤物模板。生成器已把中文名解析成 troopId + referenceName，
 * 但属性数值在引擎侧拿不到（traits.ts 不 import 兵种数据，避免数据层依赖）——
 * TurnEngine 注入的 enqueue 回调负责查兵种数据装配真实属性；这里只提供兜底骨架，
 * 让"解析失败但troopId 有效"的场景也能以占位属性进场（AI 对局不因数据缺口崩溃）。
 */
let summonTemplateResolver: ((spec: DeathSummonSpec) => Omit<Character, 'id' | 'defeated' | 'statuses'> | null) | null = null;

/** 由装配层（TurnEngine/App）注入召唤模板解析器：兵种数据 → 属性模板 */
export function setSummonTemplateResolver(
  resolver: (spec: DeathSummonSpec) => Omit<Character, 'id' | 'defeated' | 'statuses'> | null,
): void {
  summonTemplateResolver = resolver;
}

function resolveSummonTemplate(spec: DeathSummonSpec): Omit<Character, 'id' | 'defeated' | 'statuses'> | null {
  return summonTemplateResolver ? summonTemplateResolver(spec) : null;
}

/**
 * 配色触发（食人魔之怒/阳光…）：匹配到某色时给匹配方全队加值。
 *
 * 条件光环批扩展（均要求特质带对应新键，旧特质零事件、零随机消耗）：
 *   - colorMatchTypeAura：配色团队光环（celestial/powerof/各色 aura 族），scope 为
 *     'all'/种族/颜色；color 传 'skull' 时结算骷髅匹配触发（diamondaura/powerofstars/rancor）
 *   - cleanseOnColorMatch：配色净化（adagio）
 *   - opts.enemyTeam：敌方配色触发（rancor）——敌方配对骷髅/某色时敌方持有者自身获得
 *
 * T5 配色状态批扩展：onColorMatchStatus（molten/sunfire/deepwounds…「在配对X色宝石时
 * 使随机一名敌人陷入Y状态」族）——色键命中时给随机一名存活敌人施加状态。施加经
 * opts.applyStatus 注入（TurnEngine 传 status.applyStatus，免疫在施加口拦截）；随机目标
 * 与概率（foxfire 50% 用 chance）经 opts.rng 判定，每次触发至多耗两条随机数（概率一条、
 * 选目标一条），与 applyBigMatchTriggers 的 randomEnemy 分支同口径：无 rng 时概率 <1 的
 * 不生效、随机目标退化为首个存活；无 applyStatus/enemyTeam 时整块跳过（纯逻辑环境零事件）。
 *
 * T5 窃取批扩展：onColorMatchDrain（corruption/poisontide/justabite/darkesthunger/ladyofdesire
 * 「在配对X色宝石时窃取第一/首位敌人 N 点生命值」）——色键命中时对首位存活敌人造成伤害、
 * 持有者按目标实际失血增长生命及上限（结算经 opts.drainLife 注入）；
 * front 目标确定性选取、零随机消耗，无 drainLife/enemyTeam 注入时整块跳过。
 */
export function applyColorMatchTriggers(
  team: readonly Character[],
  color: BaseColor | 'skull',
  opts: {
    enemyTeam?: readonly Character[];
    gainEconomy?: (currency: keyof TraitEconomyGain, amount: number) => GameEvent[];
    /** 随机目标选择 / 概率判定；缺省时概率 <1 不生效、随机目标退化为首个存活 */
    rng?: Pick<SeededRNG, 'next'>;
    /** 状态施加口（TurnEngine 注入 skills/effects/status 的 applyStatus）；缺省时不施加状态 */
    applyStatus?: (char: Character, status: StatusInstance) => GameEvent[];
    /**
     * 窃取生命口（T5 窃取批，TurnEngine 注入：damageOne 管线伤害 + 持有者按实际伤害额
     * 增长当前与最大生命）；缺省时窃取类跳过（纯逻辑环境零事件）。
     */
    drainLife?: (target: Character, holder: Character, amount: number) => GameEvent[];
    /**
     * 技能伤害口（T5 杂项批 lumpofcoal/dawnslayer/sleetstorm 配色伤害，TurnEngine 注入
     * damageOne 管线，与大连伤害同款回调）；缺省时配色伤害跳过（纯逻辑环境零事件）。
     */
    damage?: (target: Character, caster: Character, amount: number) => GameEvent[];
    /**
     * kind 感知宝石爆破口（特质收尾批 hiddentrap「配对黄色宝石时爆破一颗随机宝石」，
     * TurnEngine 注入与大连 explodeSpec 同款回调）；缺省时配色爆破跳过。
     */
    explodeSpec?: (spec: { kind: 'random' | 'skull' | SpecialGemKind; tier?: number; color?: string; count: number }) => GameEvent[];
  } = {},
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const char of team) {
    if (char.defeated) continue;
    const gains = passivesOf(char).gainOnColorMatch[color];
    if (!gains) continue;
    for (const stat of GAIN_STAT_ORDER) {
      const actual = grantStat(char, stat, gains[stat]);
      if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual,
        traitActivations: traitActivations(char, def =>
          (def.onColorMatchGain?.color === color && gainAffects(def.onColorMatchGain, stat))
          || !!def.onColorMatchGains?.some(gain => gain.color === color && gainAffects(gain, stat))),
      });
    }
  }
  // 配色团队光环：任意存活持有者 → 同队 scope 范围内成员（按持有者序 × 队伍序确定性结算）
  for (const holder of team) {
    if (holder.defeated) continue;
    const byScope = passivesOf(holder).colorMatchTypeAura[color];
    if (!byScope) continue;
    for (const [scope, gains] of Object.entries(byScope)) {
      for (const member of team) {
        if (member.defeated) continue;
        if (!scopeMatches(member, scope)) continue;
        for (const stat of GAIN_STAT_ORDER) {
          const actual = grantStat(member, stat, gains[stat]);
          if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: member.id, stat, amount: actual, traitActivations: traitActivations(holder, def => def.onColorMatchTypeAura?.color === color && def.onColorMatchTypeAura.scope === scope && !!def.onColorMatchTypeAura.gains[stat]) });
        }
      }
    }
  }
  // 配色净化（adagio）：任一存活持有者的净化色命中本次颜色即全队去负面状态
  if (team.some((c) => !c.defeated && passivesOf(c).cleanseOnColorMatch.includes(color))) {
    for (const member of team) events.push(...cleanseNegative(member));
  }
  // 匹配骷髅头时削减敌人随机技能（职业天赋 chaoswave「匹配骷髅头时，所有敌人随机损失
  // 1 点技能值」）：只在骷髅触发点（color === 'skull'）结算，scope 固定敌方全队存活逐个
  // 削减（确定性）；stat 'random' 每个目标经 rng 掷一项（无 rng 落 magic，与 castEnemyDrain
  // 同口径）。reduce 语义（持有者不进账），manashield 免疫在 reduceStat 拦截。
  if (color === 'skull' && opts.enemyTeam) {
    for (const holder of team) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).onSkullMatchEnemyDrain;
      if (!spec) continue;
      for (const foe of opts.enemyTeam) {
        if (foe.defeated) continue;
        const stat = spec.stat === 'random'
          ? (opts.rng
            ? (['attack', 'armor', 'magic', 'mana'] as const)[Math.floor(opts.rng.next() * 4)]
            : 'magic')
          : spec.stat;
        events.push(...reduceStat(foe, stat, spec.amount));
      }
    }
  }
  // 敌方配色触发（rancor）：敌方持有者自身获得（不动敌方的 gainOnColorMatch——那是他们自己配对时才吃的）
  if (opts.enemyTeam) {
    for (const char of opts.enemyTeam) {
      if (char.defeated) continue;
      const gains = passivesOf(char).gainOnEnemyColorMatch[color];
      if (!gains) continue;
      for (const stat of GAIN_STAT_ORDER) {
        const actual = grantStat(char, stat, gains[stat]);
        if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual,
          traitActivations: traitActivations(char, def => def.onEnemyColorMatchGain?.color === color && gainAffects(def.onEnemyColorMatchGain, stat)),
        });
      }
    }
  }
  // 配色施加状态（T5 配色状态批 16 code：molten/sunfire/deepwounds/foxfire… + angrybear
  // 自身狂怒 + 缺口清扫批 enchantinggaze 随机盟友 / brambleheart 独立概率）：匹配色命中
  // 持有者的 colorMatchStatus 键时施加状态。
  // scope randomEnemy=随机一名存活敌人；randomAlly=随机一名存活盟友（enchantinggaze
  // 「匹配紫色宝石时为随机盟友附魔」）；self=持有者自身（angrybear「配对棕色宝石时赋予
  // 自身狂怒状态」，确定性目标、零随机消耗）。概率仍走 rng（无 rng 概率 <1 不生效）；
  // independentChance（brambleheart「Independent 50% chances to Entangle or inflict
  // Bleed」）不在入口整体判定——每条状态在目标选出后各掷各的 chance（各耗一次 rng）。
  // 只在施加口注入时结算——旧特质路径（无新键）零事件、零随机消耗。
  if (opts.applyStatus) {
    const foes = (opts.enemyTeam ?? []).filter((c) => !c.defeated);
    const allies = team.filter((c) => !c.defeated);
    for (const holder of team) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).colorMatchStatus[color];
      if (!spec) continue;
      if (spec.scope === 'randomEnemy' && foes.length === 0) continue;
      if (spec.scope === 'randomAlly' && allies.length === 0) continue;
      if (spec.chance !== undefined && !spec.independentChance) {
        // 概率判定走种子化 rng；纯逻辑环境（无 rng）按召唤口径不生效
        if (!opts.rng || opts.rng.next() >= spec.chance) continue;
      }
      if (spec.scope === 'self') {
        events.push(...applySpecStatuses(holder, spec.statuses, spec.turns, opts));
        continue;
      }
      const pool = spec.scope === 'randomAlly' ? allies : foes;
      const target = opts.rng ? pool[Math.floor(opts.rng.next() * pool.length)] : pool[0];
      if (spec.independentChance) {
        for (const st of spec.statuses) {
          if (!opts.rng || opts.rng.next() >= (spec.chance ?? 1)) continue;
          events.push(...applySpecStatuses(target, [st], spec.turns, opts));
        }
        continue;
      }
      events.push(...applySpecStatuses(target, spec.statuses, spec.turns, opts));
    }
  }
  // 配色窃取生命（T5 窃取批 5 code：corruption/poisontide/justabite/darkesthunger/ladyofdesire）：
  // 匹配色命中持有者的 colorMatchDrain 键时，对首位存活敌人窃取生命、持有者增长生命及上限。
  // 结算经 opts.drainLife 注入（TurnEngine 传绕甲伤害+生命增长，defeat 出编队同骷髅口径）；
  // front 目标确定性选取、不耗随机数——无新键特质零事件、零随机消耗。前一个持有者的
  // 窃取若击杀首位，后续持有者重取当前首位（同一触发点内逐个现算）。
  if (opts.drainLife && opts.enemyTeam) {
    for (const holder of team) {
      if (holder.defeated) continue;
      const amount = passivesOf(holder).colorMatchDrain[color];
      if (!amount) continue;
      const front = opts.enemyTeam.find((c) => !c.defeated);
      if (!front) break;
      events.push(...opts.drainLife(front, holder, amount));
    }
  }
  // 配色伤害（T5 杂项批 3 code：lumpofcoal/dawnslayer/sleetstorm「在配对X色宝石时对一名
  // 随机敌人造成 N 点伤害」+ 缺口清扫批 spiny/spiky「在自身配对骷髅头时，对所有敌人造成
  // N 点伤害」）：伤害经 opts.damage 注入（TurnEngine 传 damageOne 管线，与大连伤害/窃取
  // 生命同款回调）；randomEnemy 随机目标每条持有者耗一次种子化 rng（与配色施加状态的随机
  // 分支同口径），无 rng 退化为首个存活；allEnemies 逐个确定性结算、零随机消耗——无新键
  // 特质零事件、零随机消耗。
  if (opts.damage && opts.enemyTeam) {
    for (const holder of team) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).colorMatchDamage[color];
      if (!spec) continue;
      const foes = opts.enemyTeam.filter((c) => !c.defeated);
      if (foes.length === 0) break;
      if (spec.scope === 'allEnemies') {
        for (const foe of foes) events.push(...opts.damage(foe, holder, spec.amount));
        continue;
      }
      const foe = opts.rng ? foes[Math.floor(opts.rng.next() * foes.length)] : foes[0];
      events.push(...opts.damage(foe, holder, spec.amount));
    }
  }
  // 条件经济光环·骷髅版（darkensouls「在配对骷髅头时，获得 3 个灵魂」）：
  // 仅骷髅键结算（配色键无对应官方句式），按持有者逐个入账、阵亡不贡献。
  if (color === 'skull') {
    for (const holder of team) {
      if (holder.defeated) continue;
      events.push(...grantEconomy(passivesOf(holder).skullMatchEconomyGain, opts.gainEconomy));
    }
  }
  // 配色爆破（特质收尾批 hiddentrap「在配对黄色宝石时，爆破一颗随机宝石」）：定义直读
  //（getTrait，同 onSkullMatchEnemyDrain 的骷髅触发点口径），匹配色命中即经 opts.explodeSpec
  // 注入爆破（kind 固定 'random' 任意宝石）；缺省注入时跳过——无此特质的对局零事件。
  if (opts.explodeSpec) {
    for (const holder of team) {
      if (holder.defeated) continue;
      for (const code of activeTraitIds(holder)) {
        const spec = getTrait(code)?.onColorMatchExplodeGem;
        if (!spec || spec.color !== color) continue;
        events.push(...opts.explodeSpec({ kind: 'random', count: spec.count }));
      }
    }
  }
  return events;
}

/** 触发增益循环的属性序（统一 hp→armor→attack→magic→mana，保证事件顺序确定性） */
const GAIN_STAT_ORDER = ['hp', 'armor', 'attack', 'magic', 'mana'] as const;

/**
 * 正面状态清单（净化时保留）。与 skills/effects/status.ts 诅咒剥正面的清单一致；
 * 不直接 import——status 依赖本模块（passivesOf/isImmuneToStatus），反向 import 会成环。
 */
const POSITIVE_STATUS_IDS = new Set(['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged']);

/** 净化（adagio/royalhoney「净化所有盟友」）：移除全部负面状态，正面状态保留。 */
function cleanseNegative(char: Character): GameEvent[] {
  if (char.defeated || char.statuses.length === 0) return [];
  const removed = char.statuses.filter((s) => !POSITIVE_STATUS_IDS.has(s.id)).map((s) => s.id);
  if (removed.length === 0) return [];
  char.statuses = char.statuses.filter((s) => POSITIVE_STATUS_IDS.has(s.id));
  const event: GameEvent = { type: 'status-cleanse', targetId: char.id, statusIds: removed };
  return [event];
}

/**
 * 驱散（职业天赋 banishment「驱散所有敌人」）：移除全部**正面**状态，负面保留——
 * 与净化正好互为反向。事件同用 status-cleanse（表现层的驱散/净化同属"状态被移除"演出）。
 */
function dispelPositive(char: Character): GameEvent[] {
  if (char.defeated || char.statuses.length === 0) return [];
  const removed = char.statuses.filter((s) => POSITIVE_STATUS_IDS.has(s.id)).map((s) => s.id);
  if (removed.length === 0) return [];
  char.statuses = char.statuses.filter((s) => !POSITIVE_STATUS_IDS.has(s.id));
  // kind:'dispel' 让表现层区分驱散与净化（光效/音效不同，且只撤被驱散的持续层）
  const event: GameEvent = { type: 'status-cleanse', targetId: char.id, statusIds: removed, kind: 'dispel' };
  return [event];
}

/**
 * 七大基础风暴池（职业天赋 chaosstorm「召唤一个随机风暴」的掷签池）：光/火/冰/暗/叶/尘/
 * 骸骨，载荷取自 songof* 族的官方战斗开始风暴（色键/回合/骷髅掉落同源，号段沿用 9001~9007）。
 */
const RANDOM_STORM_POOL: readonly { color: BaseColor; turns: number; troopId: number; dropKind?: 'skull' }[] = [
  { color: BaseColor.Yellow, turns: 8, troopId: 9004 },
  { color: BaseColor.Red, turns: 8, troopId: 9002 },
  { color: BaseColor.Blue, turns: 8, troopId: 9003 },
  { color: BaseColor.Purple, turns: 8, troopId: 9001 },
  { color: BaseColor.Green, turns: 8, troopId: 9005 },
  { color: BaseColor.Brown, turns: 8, troopId: 9006 },
  { color: BaseColor.Brown, turns: 8, troopId: 9007, dropKind: 'skull' },
];

/**
 * 大连触发的执行环境（条件光环批）：由 TurnEngine 注入，traits 不反向依赖 status。
 * 全部可选——缺省时新效果跳过，不含新键特质的对局行为与随机数消耗逐字节不变。
 */
export interface BigMatchTriggerContext {
  /** 本次触发的匹配组宝石数（4/5…）；缺省按 4 处理（旧行为：>=4 全触发） */
  size?: number;
  /** 随机目标选择 / 概率判定；缺省时概率 <1 不生效、随机目标退化为首个存活（纯逻辑单测可省略） */
  rng?: Pick<SeededRNG, 'next'>;
  /** 状态施加口（TurnEngine 注入 skills/effects/status 的 applyStatus）；缺省时不施加状态 */
  applyStatus?: (char: Character, status: StatusInstance) => GameEvent[];
  /** 敌方存活队列（scope 'allEnemies' 的施加目标，bloodmark 族）；缺省时该 scope 跳过 */
  enemyTeam?: readonly Character[];
  /**
   * 战场经济入账口（条件经济批，TurnEngine 注入：economy[currency] += amount 并发
   * economy-gain 事件）；缺省时条件经济光环跳过（纯逻辑单测零事件）。
   */
  gainEconomy?: (currency: keyof TraitEconomyGain, amount: number) => GameEvent[];
  /**
   * 技能伤害口（T5 大连伤害批，TurnEngine 注入 damageOne 管线：妖火/法术减伤/屏障/护甲/
   * 阵亡同技能伤害口径）；缺省时伤害类跳过（纯逻辑环境零事件）。
   */
  damage?: (target: Character, caster: Character, amount: number) => GameEvent[];
  /**
   * 特殊宝石创造口（T4 大连创造批 wildtribe/wildmagic/twinfires/spectromancy，TurnEngine
   * 注入：随机格就地转化 + gem-transform 事件；新造宝石参与的匹配由外层 runCascades
   * 下一轮吸收）；缺省时创造类跳过（纯逻辑环境零事件、零随机消耗）。
   * color 为六色族宝石的归属基色（接线批 slimed 绿龙宝石族），缺省 undefined。
   */
  createGem?: (gem: SpecialGemKind, tier: number | undefined, count: number, color?: string) => GameEvent[];
  /**
   * 兵种召唤口（T5 杂项批 genieslamp/stormflock，TurnEngine 注入：复用死亡召唤基建
   * applyDeathSummons——概率走注入的 rng、模板按兵种数据装配、入队走容量/FIFO 规则）；
   * 缺省时召唤跳过（纯逻辑环境零事件、零随机消耗）。
   */
  summon?: (spec: { chance: number; troopId: number; referenceName: string; displayName: string }) => GameEvent[];
  /**
   * 风暴设置口（T5 杂项批 deadlywaters，TurnEngine 注入：全局唯一「后召顶替先召」裁定，
   * 与技能造风暴同一 storm-change 事件形态）；缺省时风暴跳过。
   */
  setStorm?: (storm: StormSummon, troopId: number) => GameEvent[];
  /**
   * 即杀口（T5 杂项批 deathbelow「猎杀最后一名敌人」，TurnEngine 注入：hp 归零 + defeat
   * 事件走 resolveDefeatEvents 出编队，与骷髅击杀同口径）；缺省时概率 <1 不生效
   * （纯逻辑环境零事件、零随机消耗）。
   */
  kill?: (target: Character) => GameEvent[];
  /**
   * 窃取生命口（职业天赋 lifesiphon，同配色窃取批的 opts.drainLife：damageOne 伤害 +
   * 持有者按目标实际失血增长生命及上限）；缺省时窃取类跳过。
   */
  drainLife?: (target: Character, holder: Character, amount: number) => GameEvent[];
  /**
   * 宝石爆破口（职业天赋 lightningstrike，TurnEngine 注入：命中格从棋盘移除后走
   * resolveBoardChange——法力归持有者一方、重力连锁照常；候选唯一不掷骰、多候选耗一次
   * rng、无候选安全跳过）；缺省时爆破类跳过。
   */
  explodeGem?: (color: string, count: number) => GameEvent[];
  /**
   * kind 感知宝石爆破口（特质收尾批，TurnEngine 注入同一落子管线）：kind='random' 任意
   * 宝石 / 'skull' 普通骷髅头 / 特殊宝石 kind（tier=善神石像鬼等分层宝石的层号）；
   * color 仅供六色族特殊宝石的归属基色。缺省时 kind 条目跳过（legacy 色条目不受影响）。
   */
  explodeSpec?: (spec: { kind: 'random' | 'skull' | SpecialGemKind; tier?: number; color?: string; count: number }) => GameEvent[];
  /**
   * 普通色宝石创造口（lunarscales，TurnEngine 注入：随机现存格就地翻新为该色普通宝石 +
   * gem-transform 事件，新造宝石参与的匹配由外层 runCascades 吸收）；缺省时跳过。
   */
  createPlainGem?: (color: string, count: number) => GameEvent[];
}

/** 条件经济光环的币种结算序（固定 gold→souls→gems，保证事件顺序确定性） */
const ECONOMY_CURRENCY_ORDER = ['gold', 'souls', 'gems'] as const;

/**
 * 条件经济光环·通用结算：把一份按币种聚合的数额经 ctx.gainEconomy 入账。
 * 零数额与缺省回调都安全跳过（无新键特质零事件、零随机消耗）。
 */
function grantEconomy(
  amounts: Readonly<TraitEconomyGain>,
  gain?: (currency: keyof TraitEconomyGain, amount: number) => GameEvent[],
): GameEvent[] {
  if (!gain) return [];
  const events: GameEvent[] = [];
  for (const currency of ECONOMY_CURRENCY_ORDER) {
    const amount = amounts[currency];
    if (amount > 0) events.push(...gain(currency, amount));
  }
  return events;
}

/** 把编译好的状态规格逐条施加到目标（ctx.applyStatus 由 TurnEngine 注入；缺省时跳过） */
function applySpecStatuses(
  target: Character,
  statuses: readonly { id: string; magnitude?: number }[],
  turns: number,
  ctx: BigMatchTriggerContext,
): GameEvent[] {
  if (!ctx.applyStatus) return [];
  const events: GameEvent[] = [];
  for (const spec of statuses) {
    const status: StatusInstance = spec.magnitude !== undefined
      ? { id: spec.id, turns, magnitude: spec.magnitude }
      : { id: spec.id, turns };
    events.push(...ctx.applyStatus(target, status));
  }
  return events;
}

/**
 * 敌减原语（T5 大连敌减批 suppression/aspectofplague/technomancy/creepinggloom/chillingaura）：
 * 目标属性扣减、夹零，实际发生的削减才发负 buff 事件（与 skills/effects/debuff.ts 的
 * reduceEffect 同口径）；mana 为耗蓝口径，manashield 免疫在削减口整体跳过。
 * 不直接 import debuff——effects 层依赖本模块的 passivesOf，反向引会成环，逻辑就地实现。
 */
function reduceStat(
  target: Character,
  stat: 'attack' | 'armor' | 'magic' | 'mana' | 'hp',
  amount: number,
): GameEvent[] {
  if (target.defeated || amount <= 0) return [];
  if (stat === 'mana' && passivesOf(target).manaOpsImmunity) return [];
  const current = stat === 'mana' ? target.mana : Math.max(0, target[stat]);
  const removed = Math.min(current, amount);
  if (removed <= 0) return [];
  if (stat === 'mana') target.mana -= removed;
  else target[stat] -= removed;
  return [{ type: 'buff', source: 'trait', targetId: target.id, stat, amount: -removed }];
}

/** 触发循环里的成员匹配：scope 为 'all'（全队）/种族名（troopTypes）/颜色名（colors） */
function scopeMatches(member: Character, scope: string): boolean {
  if (scope === 'all') return true;
  return (member.troopTypes ?? []).includes(scope) || member.colors.includes(scope as BaseColor);
}

/**
 * 4 或 5 连响应（庞然/巨型/修理…）：只作用于匹配方自己一队。
 * 另含种族光环（firstwargare/overclock…）：持有者所在方配对 4/5 连时，
 * 给同队该族盟友（或 troopType 'all' 的全队）套用光环增益，按队伍序确定性结算。
 *
 * 条件光环批扩展（均要求特质带对应新键，旧特质行为与随机消耗逐字节不变）：
 *   - gainOnBigMatchSized：minSize 限定自身增益（insanegrowth 只认 5 连）
 *   - onBigMatchStatus：施加状态（屏障/狂怒/下潜/反射/赐福…）；随机目标与概率经 ctx.rng 判定，
 *     施加经 ctx.applyStatus（TurnEngine 注入）；无 rng 时概率 <1 的不生效、随机目标退化为首个存活
 *   - cleanseOnBigMatch：任一存活持有者带此键即全队净化（移除负面状态）
 *   - damage + bigMatchDamage：大连技能伤害（T5 大连伤害批 shock/tentacles/lightningbolt）
 *   - bigMatchEnemyDrain：大连敌减（T5 大连敌减批 suppression/chillingaura 族，reduce 语义）
 */
export function applyBigMatchTriggers(
  matchingTeam: readonly Character[],
  ctx: BigMatchTriggerContext = {},
): GameEvent[] {
  const events: GameEvent[] = [...applyTrigger(matchingTeam, 'gainOnBigMatch')];
  const size = ctx.size ?? 4;
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    const aura = passivesOf(holder).bigMatchTypeAura;
    for (const [troopType, gains] of Object.entries(aura)) {
      for (const member of matchingTeam) {
        if (member.defeated) continue;
        // scopeMatches：'all' 全队 / 种族名（查 troopTypes）/ 颜色名（查 colors，
        // bountifulgrowth「为所有绿色盟友提供 4 点生命」）
        if (!scopeMatches(member, troopType)) continue;
        for (const stat of GAIN_STAT_ORDER) {
          const actual = grantStat(member, stat, gains[stat]);
          if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: member.id, stat, amount: actual, traitActivations: traitActivations(holder, def => def.onBigMatchTypeAura?.troopType === troopType && !!def.onBigMatchTypeAura.gains[stat]) });
        }
      }
    }
  }

  // 5 连限定自身增益（insanegrowth）
  for (const char of matchingTeam) {
    if (char.defeated) continue;
    const sized = passivesOf(char).gainOnBigMatchSized;
    for (const [minSize, gains] of Object.entries(sized)) {
      if (size < Number(minSize)) continue;
      for (const stat of GAIN_STAT_ORDER) {
        const actual = grantStat(char, stat, gains[stat]);
        if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual, traitActivations: traitActivations(char, def => def.onBigMatchSizedGain?.minSize === Number(minSize) && gainAffects(def.onBigMatchSizedGain, stat)) });
      }
    }
  }

  // 施加状态（celestialshield/provocation/tsunami/lotusblessing…）
  if (ctx.applyStatus) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).onBigMatchStatus;
      if (!spec) continue;
      if ((spec.minSize ?? 4) > size) continue;
      // 独立概率掷（maladycurse）不在入口整体判定——每条状态在目标选出后各掷各的
      if (spec.chance !== undefined && !spec.independentChance) {
        // 概率判定走种子化 rng；纯逻辑环境（无 rng）按召唤口径不生效
        if (!ctx.rng || ctx.rng.next() >= spec.chance) continue;
      }
      const alive = matchingTeam.filter((c) => !c.defeated);
      if (spec.scope === 'self') {
        events.push(...applySpecStatuses(holder, spec.statuses, spec.turns, ctx));
      } else if (spec.scope === 'allEnemies') {
        // 敌方全队（bloodmark「使所有敌人陷入出血状态」）：目标为对方存活队列
        const foes = (ctx.enemyTeam ?? []).filter((c) => !c.defeated);
        for (const foe of foes) {
          events.push(...applySpecStatuses(foe, spec.statuses, spec.turns, ctx));
        }
      } else if (spec.scope === 'firstEnemy') {
        // 首位敌人（dragonvines「缠绕第一名敌人」）：队伍序首个存活，确定性、不耗随机数
        const foes = (ctx.enemyTeam ?? []).filter((c) => !c.defeated);
        if (foes.length === 0) continue;
        events.push(...applySpecStatuses(foes[0], spec.statuses, spec.turns, ctx));
      } else if (spec.scope === 'randomEnemy') {
        // 随机一名敌人（winterveil「冻结一名随机敌人」）：消耗一次随机数，无 rng 退化为首个存活；
        // randomNegative（experiment「陷入一个随机的状态效果」）为概率语义：无 rng 整条跳过
        //（不退化为必发全池），命中时再消耗一次从负面池掷一条；
        // independentChance（maladycurse「独立 25% 几率施加诅咒或死亡标记」）：每条状态
        // 各自掷一次 chance（各中各的），每条各耗一次 rng，无 rng 时概率 <1 的不生效。
        const foes = (ctx.enemyTeam ?? []).filter((c) => !c.defeated);
        if (foes.length === 0) continue;
        if (spec.randomNegative && !ctx.rng) continue;
        const foe = ctx.rng ? foes[Math.floor(ctx.rng.next() * foes.length)] : foes[0];
        if (spec.independentChance) {
          for (const st of spec.statuses) {
            if (!ctx.rng || ctx.rng.next() >= (spec.chance ?? 1)) continue;
            events.push(...applySpecStatuses(foe, [st], spec.turns, ctx));
          }
          continue;
        }
        const picks = spec.randomNegative
          ? [spec.statuses[Math.floor(ctx.rng!.next() * spec.statuses.length)]]
          : spec.statuses;
        events.push(...applySpecStatuses(foe, picks, spec.turns, ctx));
      } else if (spec.scope === 'allAllies') {
        for (const member of alive) {
          events.push(...applySpecStatuses(member, spec.statuses, spec.turns, ctx));
        }
      } else {
        // randomAlly：有 rng 随机取（只在此消耗一次随机数），无 rng 退化为首个存活
        if (alive.length === 0) continue;
        const target = ctx.rng ? alive[Math.floor(ctx.rng.next() * alive.length)] : alive[0];
        const picks = spec.randomPositive && ctx.rng
          ? [spec.statuses[Math.floor(ctx.rng.next() * spec.statuses.length)]]
          : spec.statuses;
        events.push(...applySpecStatuses(target, picks, spec.turns, ctx));
      }
    }
  }

  // 大连技能伤害（T5 大连伤害批 3 code：shock/tentacles/lightningbolt）：对随机一名/全体
  // 敌人造成固定额技能伤害。伤害经 ctx.damage 注入（TurnEngine 传 damageOne 管线）；
  // randomEnemy 每条规格耗一次随机数（与施加状态随机分支同口径），无 rng 退化为首个存活；
  // 无注入/无敌队时整块跳过——无新键特质零事件、零随机消耗。minSize 与经济光环同口径。
  if (ctx.damage && ctx.enemyTeam) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      for (const spec of passivesOf(holder).bigMatchDamage) {
        if (spec.minSize > size) continue;
        const foes = ctx.enemyTeam.filter((c) => !c.defeated);
        if (foes.length === 0) break;
        if (spec.scope === 'enemyAll') {
          for (const foe of foes) events.push(...ctx.damage(foe, holder, spec.amount));
        } else if (spec.scope === 'lastEnemy') {
          // 末位敌人（attackfrombelow「Deal 8 damage to the last Enemy」）：队伍序末位存活，
          // 确定性选取、零随机消耗
          events.push(...ctx.damage(foes[foes.length - 1], holder, spec.amount));
        } else {
          const foe = ctx.rng ? foes[Math.floor(ctx.rng.next() * foes.length)] : foes[0];
          events.push(...ctx.damage(foe, holder, spec.amount));
        }
      }
    }
  }
  // 大连敌减（T5 大连敌减批 5 code：suppression/aspectofplague/technomancy/creepinggloom/
  // chillingaura）：削减敌方属性（reduce 语义，持有者不进账）。front=首位存活确定性选取、
  // randomEnemy 每条规格耗一次随机数、allEnemies=敌方全队存活逐个削减（darkness「所有敌人
  // 损失 4 点攻击力」，确定性、零随机消耗）；manashield 免疫在 reduceStat 拦截。
  if (ctx.enemyTeam) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      for (const spec of passivesOf(holder).bigMatchEnemyDrain) {
        if (spec.minSize > size) continue;
        const foes = ctx.enemyTeam.filter((c) => !c.defeated);
        if (foes.length === 0) break;
        if (spec.scope === 'allEnemies') {
          for (const foe of foes) events.push(...reduceStat(foe, spec.stat, spec.amount));
          continue;
        }
        const target = spec.scope === 'front' ? foes[0]
          : ctx.rng ? foes[Math.floor(ctx.rng.next() * foes.length)] : foes[0];
        events.push(...reduceStat(target, spec.stat, spec.amount));
      }
    }
  }

  // 净化（royalhoney）：任一存活持有者带键即全队去负面状态
  if (matchingTeam.some((c) => !c.defeated && passivesOf(c).cleanseOnBigMatch)) {
    for (const member of matchingTeam) events.push(...cleanseNegative(member));
  }

  // 大连创造宝石（T4 大连创造批 4 code：wildtribe/wildmagic x2 通配、twinfires 燃烧、
  // spectromancy x3 通配）：概率（wildtribe 10%）走种子化 rng、每条规格一次；落子经
  // ctx.createGem 注入（TurnEngine 写棋盘 + gem-transform，连锁由外层 runCascades 下一轮
  // 吸收）。minSize 与经济光环同口径；无注入/无 rng 时概率 <1 的不生效——无新键特质
  // 零事件、零随机消耗。
  if (ctx.createGem) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      for (const spec of passivesOf(holder).bigMatchCreateGem) {
        if (spec.minSize > size) continue;
        if (spec.chance !== undefined) {
          if (!ctx.rng || ctx.rng.next() >= spec.chance) continue;
        }
        events.push(...ctx.createGem(spec.gem, spec.tier, spec.count, spec.color));
      }
    }
  }

  // 配对转换（T5 杂项批 trascend「将 2 点生命值替换成 2 点魔力值」）：持有者自身 1:1 交换，
  // 生命侧保底 1 点（特质不自杀），实际减少多少生命就等量加多少魔法（织网下的魔法增益
  // 拦截走 grantStat 既有口径）；纯数值操作不掷随机数——无新键特质零事件、零随机消耗。
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    const spec = passivesOf(holder).onBigMatchConvert;
    if (!spec || spec.minSize > size) continue;
    const loss = Math.min(spec.amount, holder.hp - 1);
    if (loss <= 0) continue;
    holder.hp -= loss;
    events.push({ type: 'buff', source: 'trait', targetId: holder.id, stat: 'hp', amount: -loss });
    const gained = grantStat(holder, 'magic', loss);
    if (gained > 0) events.push({ type: 'buff', source: 'trait', targetId: holder.id, stat: 'magic', amount: gained });
  }

  // 配对召唤（T5 杂项批 genieslamp/stormflock「配对 4+ 有 N% 的几率召唤一名X」）：概率在
  // 本层判定（与其他 chance 规格同口径：无 rng 时概率 <1 不生效，恰好掷一次），入队经
  // ctx.summon 注入（TurnEngine 复用死亡召唤基建的模板装配/容量/FIFO 规则，召唤物归持有者
  // 一方）；缺省时整块跳过——无新键特质零事件、零随机消耗。
  if (ctx.summon) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).bigMatchSummon;
      if (!spec || spec.minSize > size) continue;
      if (spec.chance < 1) {
        if (!ctx.rng || ctx.rng.next() >= spec.chance) continue;
      }
      events.push(...ctx.summon(spec));
    }
  }

  // 配对风暴（T5 杂项批 deadlywaters「配对时创造骸骨风暴」）：设置经 ctx.setStorm 注入
  //（TurnEngine 的全局唯一顶替裁定，与技能造风暴同一事件形态），只传 StormSummon 载荷；
  // 缺省时跳过。
  if (ctx.setStorm) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).bigMatchStorm;
      if (!spec || spec.minSize > size) continue;
      events.push(...ctx.setStorm({ color: spec.color, turns: spec.turns, dropKind: spec.dropKind }, spec.troopId));
    }
  }

  // 配对即杀（T5 杂项批 deathbelow「配对 4/5 有 8% 的几率猎杀最后一名敌人」）：概率走
  // 种子化 rng（无 rng 不生效，按召唤口径），目标=敌方队伍序末位存活（确定性）；处决经
  // ctx.kill 注入（TurnEngine 走 defeat 出编队管线，召唤队列顶替照常）；缺省时整块跳过。
  if (ctx.kill && ctx.enemyTeam) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).bigMatchKill;
      if (!spec || spec.minSize > size) continue;
      if (!ctx.rng || ctx.rng.next() >= spec.chance) continue;
      const foes = ctx.enemyTeam.filter((c) => !c.defeated);
      if (foes.length === 0) break;
      events.push(...ctx.kill(foes[foes.length - 1]));
    }
  }

  // —— 职业天赋批（大匹配 5 新键；缺省注入时各自跳过——无新键特质零事件、零随机消耗）——
  // 配对驱散所有敌人（banishment）：移除敌方全队存活的正面状态（正面清单与诅咒剥正面同源）。
  // 确定性逐个结算、零随机消耗。
  if (matchingTeam.some((c) => !c.defeated && passivesOf(c).onBigMatchDispelEnemies)) {
    for (const foe of ctx.enemyTeam ?? []) {
      if (foe.defeated) continue;
      events.push(...dispelPositive(foe));
    }
  }
  // 配对净化自身（purification）：只清持有者自己的负面状态（与 royalhoney 全队口径相区分）
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    if (passivesOf(holder).onBigMatchCleanseSelf) events.push(...cleanseNegative(holder));
  }
  // 配对窃取首位敌人生命（lifesiphon）：front 目标确定性、伤害经 ctx.drainLife（持有者按
  // 目标实际失血增长生命及上限，与配色窃取批同源）；同类取先声明的一条（编译期保证）。
  if (ctx.drainLife && ctx.enemyTeam) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).onBigMatchDrainLife;
      if (!spec || (spec.minSize ?? 4) > size) continue;
      const front = ctx.enemyTeam.find((c) => !c.defeated);
      if (front) events.push(...ctx.drainLife(front, holder, spec.amount));
    }
  }
  // 配对爆破宝石：多条规格按声明序逐条结算。legacy 色条目（lightningstrike）走
  // ctx.explodeGem；kind 条目（特质收尾批 unstablepossession 'random' / goodomen
  // 'skull'/特殊宝石 kind）走 ctx.explodeSpec（TurnEngine 注入 kind 感知爆破口）。
  // 候选多时每条规格耗一次 rng；无候选安全跳过。
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    for (const spec of passivesOf(holder).onBigMatchExplodeGem ?? []) {
      if (spec.minSize > size) continue;
      if (spec.kind !== undefined) {
        if (!ctx.explodeSpec) continue;
        events.push(...ctx.explodeSpec({ kind: spec.kind, tier: spec.tier, color: spec.color, count: spec.count }));
      } else if (ctx.explodeGem) {
        events.push(...ctx.explodeGem(spec.color, spec.count));
      }
    }
  }
  // 配对创造普通色宝石（lunarscales）：概率经注入 rng（无 rng 时概率 <1 不生效），
  // 落子经 ctx.createPlainGem（TurnEngine 注入随机空格写盘 + gem-transform，同 createGem 口径）。
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    const spec = passivesOf(holder).onBigMatchCreatePlainGem;
    if (!spec || spec.minSize > size) continue;
    if (spec.chance !== undefined && (!ctx.rng || ctx.rng.next() >= spec.chance)) continue;
    if (!ctx.createPlainGem) continue;
    events.push(...ctx.createPlainGem(spec.color, spec.count));
  }
  // 配对召唤随机风暴（chaosstorm）：rng 从七大基础风暴均匀掷一（无 rng 不生效），设置经
  // ctx.setStorm 注入（全局唯一顶替裁定照常）；虚拟风暴号段沿用 9008（号段仅元数据）。
  if (ctx.setStorm) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      const spec = passivesOf(holder).onBigMatchRandomStorm;
      if (!spec || spec.minSize > size) continue;
      if (!ctx.rng) continue;
      const pick = RANDOM_STORM_POOL[Math.floor(ctx.rng.next() * RANDOM_STORM_POOL.length)]!;
      const storm: StormSummon = { color: pick.color, turns: pick.turns };
      if (pick.dropKind) storm.dropKind = pick.dropKind;
      events.push(...ctx.setStorm(storm, pick.troopId));
    }
  }

  // 条件经济光环（greedy/extremegreed/pillageandplunder「配对 4 或 5 颗获得额外 N 黄金」）：
  // 按持有者逐个入账（阵亡不贡献），minSize 限定与 gainOnBigMatchSized 同口径。
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    const byMinSize = passivesOf(holder).bigMatchEconomyGain;
    for (const [minSize, amounts] of Object.entries(byMinSize)) {
      if (size < Number(minSize)) continue;
      events.push(...grantEconomy(amounts, ctx.gainEconomy));
    }
  }
  return events;
}

/**
 * 回合开始的被动结算：生命 / 护甲恢复 / 攻击·魔法回合增益 + 回合开始范围光环
 * （缺口清扫批 turnStartTypeAura：queensgrace/feralinspiration/nightsong/blessingofanu
 * 族 17 code「All X Allies gain N … at the start of each turn」）。
 * 发 `buff` 事件让卡面能演出恢复量。
 *
 * 范围光环为定义直读键（getTrait，同 positionAura 口径）：只在持有者一方行动的回合结算
 *（TurnEngine 传行动方队伍，官方 trig=self_player），受益者为同队 scope（种族或颜色，
 * scopeMatches 认颜色/种族/'all'）内的存活成员、含持有者本人。光环授出的攻击/魔法走
 * grantStat（织网/ silenced 等既有拦截口径不变），法力不授（官方句式只涉四项属性）。
 */
export function applyTurnStartPassives(characters: readonly Character[]): BuffEvent[] {
  const events: BuffEvent[] = [];
  for (const char of characters) {
    if (char.defeated) continue;
    const eventStart = events.length;
    const p = passivesOf(char);
    // 回合恢复同样受出血/疾病影响：出血下再生归零，疾病下减半（与技能治疗一致）
    const healed = Math.min(effectiveHealing(char, p.regenPerTurn), char.maxHp - char.hp);
    if (healed > 0) {
      char.hp += healed;
      events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'hp', amount: healed });
    }
    if (p.regenArmorPerTurn > 0) {
      char.armor += p.regenArmorPerTurn;
      events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'armor', amount: p.regenArmorPerTurn });
    }
    // 攻击/魔法回合增益（aspectofwar「每回合开始时获得 3 点攻击力」）：regen.stat 分路由的
    // 结算端；魔法走 grantStat（织网下无法获得魔法增益的官方口径）。
    if (p.regenAttackPerTurn !== 0) {
      const actual = grantStat(char, 'attack', p.regenAttackPerTurn);
      if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'attack', amount: actual });
    }
    if (p.regenMagicPerTurn !== 0) {
      const actual = grantStat(char, 'magic', p.regenMagicPerTurn);
      if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'magic', amount: actual });
    }
    annotateTraitBuffs(events, eventStart, char, (def, stat) => gainAffects(def.regen, stat));
    // 回合开始范围光环（turnStartTypeAura，定义直读）：持有者存活时给同队 scope 成员叠加
    for (const code of activeTraitIds(char)) {
      const aura = getTrait(code)?.turnStartTypeAura;
      if (!aura) continue;
      for (const member of characters) {
        if (member.defeated) continue;
        if (!scopeMatches(member, aura.scope)) continue;
        for (const stat of GAIN_STAT_ORDER) {
          const actual = grantStat(member, stat, aura.gains[stat] ?? 0);
          if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: member.id, stat, amount: actual, traitActivations: traitActivations(char, def => def.code === code) });
        }
      }
    }
  }
  return events;
}

/**
 * 战斗开始时的一次性特质结算，顺序固定以保证确定性：
 *   1. 全体光环（崇敬：盟友每人随机获得 2 点技能值；诅咒：敌人 -2 魔力）
 *   2. 按颜色盟友计数的自身光环（水系之心…）
 *   3. 开局法力（快速 / 赐能）
 *
 * 光环先于法力：开局法力按 manaCost 比例算，而光环不改 manaCost，因此顺序对结果无影响，
 * 但固定下来便于复现。返回 buff 事件供表现层演出。
 */
export function applyBattleStartTraits(
  allies: readonly Character[],
  enemies: readonly Character[],
  lookup: TraitLookup = getTrait,
  rng: SeededRNG = new SeededRNG(0),
): BuffEvent[] {
  const events: BuffEvent[] = [];
  const push = (char: Character, stat: PassiveStat, amount: number) => {
    const actual = grantStat(char, stat, amount);
    if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual });
  };

  // 1. 全体光环：来源可能在任意一方，两边都要扫
  for (const [source, own, foe] of [[allies, allies, enemies], [enemies, enemies, allies]] as const) {
    for (const char of source) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const aura = lookup(code)?.teamAura;
        if (!aura) continue;
        for (const target of aura.scope === 'allies' ? own : foe) {
          if (aura.stat === 'random') {
            // One seeded roll for each skill point, matching randomStatEffect's stat pool.
            const stats: readonly PassiveStat[] = ['attack', 'armor', 'hp', 'magic'];
            for (let i = 0; i < Math.abs(aura.amount); i++) {
              push(target, stats[rng.nextInt(stats.length)]!, Math.sign(aura.amount));
            }
          } else {
            push(target, aura.stat, aura.amount);
          }
        }
      }
    }
  }

  // 2. 种族光环（族亲 / 之盾）：只作用于同队指定种族的存活角色，含自己
  for (const team of [allies, enemies]) {
    for (const char of team) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const aura = lookup(code)?.typeAura;
        if (!aura) continue;
        for (const target of team) {
          if (target.defeated) continue;
          if (!(target.troopTypes ?? []).includes(aura.troopType)) continue;
          push(target, aura.stat, aura.amount);
        }
      }
    }
  }

  // 3. 按颜色盟友计数：数的是同队全部存活角色（含自己），与 GoW 一致
  for (const team of [allies, enemies]) {
    for (const char of team) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const per = lookup(code)?.perAllyColor;
        if (!per) continue;
        const count = team.filter((c) => !c.defeated && c.colors.includes(per.color as BaseColor)).length;
        push(char, per.stat, per.amount * count);
      }
    }
  }

  // 3.5 束带计数光环（缺口清扫批 bandinglife/bandingmagic/bandingarmor/bandingattack/
  // truebanding，官方 Filter=traitbanding「Gain N … for each Ally with a Banding Trait」）：
  // 数同队存活持有束带特质的盟友（含自己，与 perAllyColor 同口径），gains×count 一次性授出。
  // 束带家族 = banding* 前缀 + truebanding（官方 traitbanding 过滤器的全集）。
  const isBandingTrait = (code: string) => code.startsWith('banding') || code === 'truebanding';
  for (const team of [allies, enemies]) {
    for (const char of team) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const per = lookup(code)?.perAllyTrait;
        if (!per) continue;
        const count = team.filter((c) => !c.defeated && (c.traitIds ?? []).some(isBandingTrait)).length;
        for (const stat of GAIN_STAT_ORDER) {
          if (stat === 'mana') continue; // 光环不授法力（官方句式只涉四项属性）
          const actual = grantStat(char, stat, (per.gains[stat] ?? 0) * count);
          if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat, amount: actual });
        }
      }
    }
  }

  // 3.6 开局范围光环（缺口清扫批 iceaura 族 6 色「All X Allies gain 5 to all Stats」+
  // soaring「Allied Stryx gain 5 Life and Attack」）：同队 scope（颜色/种族）成员一次性获得，
  // scopeMatches 认颜色与种族（含持有者本人，同 typeAura 口径）。
  for (const team of [allies, enemies]) {
    for (const char of team) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const aura = lookup(code)?.battleStartTypeAura;
        if (!aura) continue;
        for (const target of team) {
          if (target.defeated) continue;
          if (!scopeMatches(target, aura.scope)) continue;
          for (const stat of GAIN_STAT_ORDER) {
            const actual = grantStat(target, stat, aura.gains[stat] ?? 0);
            if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: target.id, stat, amount: actual });
          }
        }
      }
    }
  }

  // 3.7 种族/范围开局法力（缺口清扫批 orclord/lordofbeasts/hauntedcrown 族 17 code「All X
  // Allies start with N% Mana」）：同队 scope 匹配的存活盟友（含持有者）法力补到
  // manaCost×ratio，只补不扣（与开局法力步骤同口径）。scope 经 scopeMatches（种族/颜色/
  // 'all'，职业天赋 windspeed 黄色盟友 / inspiration 全体走同一条通路）；旧 troopType 字段
  // 等价转发（种族名下 scopeMatches 与 includes 行为一致）。
  for (const team of [allies, enemies]) {
    for (const char of team) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const spec = lookup(code)?.allyStartMana;
        if (!spec) continue;
        const scope = spec.scope ?? spec.troopType;
        if (!scope) continue;
        for (const target of team) {
          if (target.defeated) continue;
          if (!scopeMatches(target, scope)) continue;
          const gained = Math.min(target.manaCost, Math.floor(target.manaCost * spec.ratio));
          if (gained > target.mana) {
            const delta = gained - target.mana;
            target.mana = gained;
            events.push({ type: 'buff', source: 'trait', targetId: target.id, stat: 'mana', amount: delta });
          }
        }
      }
    }
  }

  // 4. 开局法力
  for (const char of [...allies, ...enemies]) {
    if (char.defeated) continue;
    let ratio = 0;
    for (const code of activeTraitIds(char)) {
      const r = lookup(code)?.battleStartManaRatio;
      if (r !== undefined) ratio = Math.max(ratio, r);
    }
    if (ratio <= 0) continue;
    const gained = Math.min(char.manaCost, Math.floor(char.manaCost * ratio));
    if (gained > char.mana) {
      const delta = gained - char.mana;
      char.mana = gained;
      events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'mana', amount: delta });
    }
  }

  return events;
}
