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
 * 官方共 785 个 trait code。已实现 376 个（覆盖 4078 次兵种出场），涵盖：骷髅减伤、
 * 法术减伤、状态免疫（含死亡标记/猎人标记/恐怖/疾病扩展）、开局法力、每回合恢复、
 * 受击增益、命中附带状态/增益（含死亡标记/猎人标记/受诅/疾病/出血）、
 * 全体光环、按颜色盟友计数的自身光环、法力灵链。
 *
 * 未实现的按缺失机制归类，见 `artifacts/trait-build.txt`：缺棋盘钩子（278）、
 * 缺状态或机制（123，如疾病/狼化/吞噬/风暴）、缺种族光环（64，需中文种族名映射）、
 * 缺召唤钩子（30）、缺施法响应（14）、缺阵亡钩子（12）、缺 4/5 连（—）、
 * 缺反弹（3）、缺闪避（2）。
 */
import traitTable from '../data/traits.json';
import { effectiveHealing } from './healing';
import type { BuffEvent, GameEvent } from './events';
import type { BaseColor, Character, PassiveModifiers, StatGains, PlayerSide, StatusInstance, StormSummon, TraitEconomyGain } from './types';
import type { SeededRNG } from './rng';

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
  /** 每回合开始恢复 */
  regen?: { stat: PassiveStat; amount: number };
  /** 自身受到伤害后获得 */
  onDamagedGain?: { stat: PassiveStat; amount: number };
  /** 自身受到伤害后自身获得状态（aquatic「在自身受到伤害时使自身下潜」）；施加走 applyStatus，免疫在施加口拦截 */
  onDamagedStatus?: { statusId: string; turns: number };
  /** 自己身亡时向战场经济池入账（valuable「在自身身亡时获得 25 黄金」） */
  onDeathEconomy?: { currency: keyof TraitEconomyGain; amount: number };
  /** 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」）：reduce 原语 stat='mana' 的执行入口跳过 */
  manaOpsImmunity?: boolean;
  /** 自己造成骷髅伤害时获得 */
  onSkullHitGain?: { stat: PassiveStat; amount: number };
  /** 同队任一角色施法时获得 */
  onAllyCastGain?: { stat: PassiveStat; amount: number };
  /** 敌方任一角色施法时获得 */
  onEnemyCastGain?: { stat: PassiveStat; amount: number };
  /** 敌方角色阵亡时获得 */
  onEnemyDeathGain?: { stat: PassiveStat; amount: number };
  /** 敌方角色阵亡时自身获得状态（bloodlust「在敌人身亡时获得狂怒效果」） */
  onEnemyDeathStatus?: { id: string; turns: number };
  /** 敌方角色阵亡时同队指定种族盟友获得数值（lordofdeath「所有不死族在一名敌人身亡时获得 5 点生命值和魔法值」） */
  onEnemyDeathTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 敌方角色阵亡时使死者一方仍存活的另一名角色陷入状态（sharedfate「使另一名敌人陷入死亡标记状态」） */
  onEnemyDeathEnemyStatus?: { id: string; turns: number };
  /** 同队角色阵亡时获得 */
  onAllyDeathGain?: { stat: PassiveStat; amount: number };
  /** 自己一方匹配 4 或 5 连时获得 */
  onBigMatchGain?: { stat: PassiveStat; amount: number };
  /** 自己造成骷髅伤害时给目标施加的状态 */
  inflictOnSkullHit?: { id: string; turns: number; magnitude?: number };
  /** 承受骷髅伤害时给攻击者施加的状态（毒孢子族） */
  inflictOnSkullDamaged?: { id: string; turns: number; magnitude?: number };
  /** 承受骷髅伤害时给攻击者施加的多条状态（双状态诅咒族 frozencurse 等「陷入诅咒和X状态」） */
  inflictOnSkullDamagedList?: readonly { id: string; turns: number; magnitude?: number }[];
  /** 自己一方匹配 4/5 连时，给同队指定种族（或全队）盟友的增益 */
  onBigMatchTypeAura?: { troopType: string; gains: Partial<StatGains> };
  /** 战斗开始时对全体盟友/敌人的固定增减 */
  teamAura?: { scope: 'allies' | 'enemies'; stat: PassiveStat; amount: number };
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
  /**
   * 自己一方匹配 4/5 连时施加状态（条件光环批：celestialshield 屏障 / provocation 狂怒 /
   * tsunami 下潜 / mirrorimage 反射 / dragonsblessing 随机正面增益 / lotusblessing 50% 赐福全队）。
   * 施加经 BigMatchTriggerContext.applyStatus 注入（TurnEngine 传 status.applyStatus），DoT 带 magnitude。
   */
  onBigMatchStatus?: {
    scope: 'self' | 'randomAlly' | 'allAllies' | 'allEnemies' | 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
    randomPositive?: boolean;
    minSize?: number;
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
    scope: 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns?: number;
    chance?: number;
  };
  /**
   * 配对某色（或骷髅）宝石时窃取首位敌人的生命（T5 窃取批 5 code：corruption/poisontide/
   * justabite/darkesthunger/ladyofdesire「在配对X色宝石时窃取第一/首位敌人 N 点生命值」）。
   * 口径与技能 drain（settleDrain）一致：对首位存活敌人造成 amount 伤害（TurnEngine 注入
   * drainLife 回调走 damageOne 管线），持有者按实际伤害额等量治疗；编译进
   * PassiveModifiers.colorMatchDrain 的同色键。
   */
  onColorMatchDrain?: { color: BaseColor | 'skull'; amount: number };
  /**
   * 自己一方配对 4/5 连时对敌人造成技能伤害（T5 大连伤害批 3 code：shock/tentacles/
   * lightningbolt「在配对 4 或 5 颗宝石时对…造成 N 点伤害」）。伤害经
   * BigMatchTriggerContext.damage 注入（TurnEngine 传 damageOne 管线，法术减伤/屏障/
   * 护甲/阵亡同口径）产出 skill-damage 事件；randomEnemy 每条规格耗一次种子化随机数
   * （与施加状态的随机分支同口径）；minSize 缺省 4（「4 或 5 颗」= 任意大连）。
   */
  onBigMatchDamage?: { amount: number; scope: 'randomEnemy' | 'enemyAll'; minSize?: number };
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
    scope: 'front' | 'randomEnemy';
    minSize?: number;
  };
  /** 敌方配对某色/骷髅时自身获得（rancor「在敌人配对骷髅头时，获得 3 点攻击力」） */
  onEnemyColorMatchGain?: { color: string; stat: PassiveStat; amount: number };
  /** 回合开始时把棋盘上随机一格变成该色宝石 */
  turnStartCreateGem?: { color: string };
  /** 回合开始时按概率把一颗该色宝石转成骷髅头 */
  turnStartColorToSkull?: { color: string; chance: number };
  /** 对特定种族的骷髅伤害倍率 */
  skullMultVsTroopType?: { troopType: string; mult: number };
  /** 对处于特定状态的目标的骷髅伤害倍率 */
  skullMultVsStatus?: { status: string; mult: number };
  /** 对关联特定法力色的目标的骷髅伤害倍率 */
  skullMultVsColor?: { color: string; mult: number };
  /** 对已受伤目标的骷髅伤害倍率 */
  skullMultVsWounded?: number;
  /** 骷髅伤害无视护甲的概率 */
  armorPierceChance?: number;
  /** 无法成为技能指定目标（隐匿） */
  untargetable?: boolean;
  /** 自己身亡时按概率召唤（daemonicpact/terrorpact 族；summon 为兵种中文名，由生成器解析成 referenceName；带 storm 时为风暴变体，不产出兵种） */
  summonOnDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon };
  /** 一名盟友（含自己）身亡时召唤（fromdark/fromashes 族） */
  summonOnAllyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon };
  /** 敌方角色身亡时召唤（darkdeath/icydeath 族） */
  summonOnEnemyDeath?: { chance: number; troopId: number; referenceName: string; displayName: string; storm?: StormSummon };
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
}

export const TRAIT_LIBRARY: readonly TraitDefinition[] = traitTable as TraitDefinition[];

const BY_CODE = new Map(TRAIT_LIBRARY.map((t) => [t.code, t]));

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
    bigMatchDamage: [],
    bigMatchEnemyDrain: [],
    bigMatchEconomyGain: {},
    skullMatchEconomyGain: { gold: 0, souls: 0, gems: 0 },
  };
}

export const NEUTRAL_PASSIVES: PassiveModifiers = neutralPassives();

export type TraitLookup = (code: string) => TraitDefinition | undefined;

/** 按 code 取特质定义；未实现的 code 返回 undefined（安全忽略，不报错）。 */
export function getTrait(code: string): TraitDefinition | undefined {
  return BY_CODE.get(code);
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
    scope: 'randomEnemy';
    statuses: readonly { id: string; magnitude?: number }[];
    turns: number;
    chance?: number;
  }> = {};
  // 配色窃取生命（T5 窃取批）：色键 → 伤害额，同色键累加（与 gainOnColorMatch 同口径）
  const colorMatchDrain: Record<string, number> = {};
  // 大连技能伤害 / 大连敌减（T5 大连伤害批 + 大连敌减批）：多条并存按声明序逐条结算，
  // minSize 定义侧可省，编译期缺省 4（「4 或 5 颗」=「4 或更多」= 任意大连）
  const bigMatchDamage: { amount: number; scope: 'randomEnemy' | 'enemyAll'; minSize: number }[] = [];
  const bigMatchEnemyDrain: {
    stat: 'attack' | 'armor' | 'magic' | 'mana';
    amount: number;
    scope: 'front' | 'randomEnemy';
    minSize: number;
  }[] = [];
  const cleanseColors = new Set<string>();
  let cleanseBigMatch = false;
  let bigMatchStatus: PassiveModifiers['onBigMatchStatus'];
  const damagedStatusList: { id: string; turns: number; magnitude?: number }[] = [];
  const bigMatchEconomy: Record<string, TraitEconomyGain> = {};
  const skullEconomy: TraitEconomyGain = { gold: 0, souls: 0, gems: 0 };

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
    // 同类累加：多条再生/狂暴叠加符合直觉
    if (trait.regen) {
      if (trait.regen.stat === 'armor') passive.regenArmorPerTurn += trait.regen.amount;
      else passive.regenPerTurn += trait.regen.amount;
    }
    for (const [from, into] of TRIGGER_FIELDS) {
      const gain = trait[from];
      if (gain) passive[into][gain.stat] += gain.amount;
    }
    if (trait.onColorMatchGain) {
      const k = trait.onColorMatchGain.color;
      colorMatchGains[k] ??= noGains();
      colorMatchGains[k][trait.onColorMatchGain.stat] += trait.onColorMatchGain.amount;
      // 共享数值附加属性（ragingbull「2 点攻击力、护甲值和生命值」）
      for (const stat of trait.onColorMatchGain.alsoStats ?? []) {
        colorMatchGains[k][stat] += trait.onColorMatchGain.amount;
      }
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
    // 命中附带状态取回合数更长的一条
    if (trait.inflictOnSkullHit
      && (passive.inflictOnSkullHit === undefined
        || trait.inflictOnSkullHit.turns > passive.inflictOnSkullHit.turns)) {
      passive.inflictOnSkullHit = { ...trait.inflictOnSkullHit };
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
    if (trait.onEnemyDeathEnemyStatus && passive.onEnemyDeathEnemyStatus === undefined) {
      passive.onEnemyDeathEnemyStatus = { ...trait.onEnemyDeathEnemyStatus };
    }
    // 身亡经济（valuable）：同类取先声明的一条（与上方死亡变体同口径）
    if (trait.onDeathEconomy && passive.onDeathEconomy === undefined) {
      passive.onDeathEconomy = { ...trait.onDeathEconomy };
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
      const { color, scope, statuses, turns, chance } = trait.onColorMatchStatus;
      const prev = colorMatchStatus[color];
      if (prev === undefined || (turns ?? 3) > prev.turns) {
        colorMatchStatus[color] = {
          scope,
          statuses: [...statuses],
          turns: turns ?? 3,
          ...(chance !== undefined ? { chance } : {}),
        };
      }
    }
    // 配色窃取生命（T5 窃取批）：同色键累加
    if (trait.onColorMatchDrain) {
      const { color, amount } = trait.onColorMatchDrain;
      colorMatchDrain[color] = (colorMatchDrain[color] ?? 0) + amount;
    }
    // 大连技能伤害 / 大连敌减（T5 大连伤害批 + 大连敌减批）：多条并存逐条结算，minSize 缺省 4
    if (trait.onBigMatchDamage) {
      bigMatchDamage.push({ ...trait.onBigMatchDamage, minSize: trait.onBigMatchDamage.minSize ?? 4 });
    }
    if (trait.onBigMatchEnemyDrain) {
      bigMatchEnemyDrain.push({ ...trait.onBigMatchEnemyDrain, minSize: trait.onBigMatchEnemyDrain.minSize ?? 4 });
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
  passive.bigMatchDamage = bigMatchDamage;
  passive.bigMatchEnemyDrain = bigMatchEnemyDrain;
  passive.cleanseOnColorMatch = [...cleanseColors];
  passive.cleanseOnBigMatch = cleanseBigMatch;
  passive.onBigMatchStatus = bigMatchStatus;
  passive.bigMatchEconomyGain = bigMatchEconomy;
  passive.skullMatchEconomyGain = { ...skullEconomy };
  if (damagedStatusList.length > 0) passive.inflictOnSkullDamagedList = damagedStatusList;
  return passive;
}

/** 就地为角色编译并挂上被动修正。无特质的角色也会挂中性值，读取处无需判空。 */
export function attachPassives(char: Character, lookup: TraitLookup = getTrait): void {
  char.passive = resolvePassives(char.traitIds, lookup);
}

/** 取角色的被动修正；未编译过时返回中性值。 */
export function passivesOf(char: Character): PassiveModifiers {
  return char.passive ?? NEUTRAL_PASSIVES;
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
  return mult;
}

/** 匹配某色宝石时该角色的法力灵链加成（含彩虹灵链）。 */
export function manaLinkBonus(char: Character, color: BaseColor): number {
  const link = passivesOf(char).manaLink;
  return (link[color] ?? 0) + (link[ALL_COLORS] ?? 0);
}

/** 就地给角色某项数值加值，hp/armor 同时抬上限，返回实际变化量。 */
function grantStat(char: Character, stat: PassiveStat, amount: number): number {
  if (amount === 0 || char.defeated) return 0;
  if (stat === 'magic') {
    // 织网（GoW Web）期间无法获得魔法值增益。字面量与 status.ts 的 WEB_STATUS_ID 一致；
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
    const gains = passivesOf(char)[field];
    for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
      const actual = grantStat(char, stat, gains[stat]);
      if (actual !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: actual });
    }
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
  ];
}

/**
 * 阵亡响应（吸收生命/复仇者/庆功…）。
 * @param deadTeam 阵亡者所在队；该队存活者走「盟友阵亡」，对方走「敌人阵亡」
 */
export function applyDeathTriggers(
  deadTeam: readonly Character[],
  opposingTeam: readonly Character[],
): BuffEvent[] {
  return [
    ...applyTrigger(deadTeam, 'gainOnAllyDeath'),
    ...applyTrigger(opposingTeam, 'gainOnEnemyDeath'),
  ];
}

/**
 * 敌人身亡触发的状态/种族光环变体（T2 死亡钩子批：bloodlust/lordofdeath/sharedfate）。
 *
 * 与 applyDeathTriggers 同一时机（行动末尾统一扫 defeat 事件）、同一持有者口径：
 * 持有者为死者的对方全队存活角色，按队伍序结算。三类变体：
 *   - onEnemyDeathStatus：持有者自身获得状态（bloodlust「在敌人身亡时获得狂怒效果」）；
 *   - onEnemyDeathTypeAura：持有者一方指定种族的存活盟友获得数值，含持有者本人
 *     （lordofdeath「所有不死族在一名敌人身亡时获得 5 点生命值和魔法值」）；
 *   - onEnemyDeathEnemyStatus：死者已被移出编队，目标取死者一方队伍序首个存活角色
 *     （sharedfate「在一名敌人身亡时，使另一名敌人陷入死亡标记状态」），确定性、不耗随机数。
 * applyStatus 由 TurnEngine 注入（与 onBigMatchStatus 同口径，免疫在 applyStatus 内拦截）；
 * 缺省时状态类变体跳过，仅光环类生效。
 */
export function applyEnemyDeathTriggers(
  opposingTeam: readonly Character[],
  deadSideTeam: readonly Character[],
  ctx: { applyStatus?: (char: Character, status: StatusInstance) => GameEvent[] } = {},
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
    const aura = p.onEnemyDeathTypeAura;
    if (aura) {
      for (const member of opposingTeam) {
        if (member.defeated) continue;
        if (!(member.troopTypes ?? []).includes(aura.troopType)) continue;
        for (const stat of GAIN_STAT_ORDER) {
          const actual = grantStat(member, stat, aura.gains[stat] ?? 0);
          if (actual !== 0) events.push({ type: 'buff', targetId: member.id, stat, amount: actual });
        }
      }
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
  }
  return events;
}

/** 死亡召唤特质的定义字段（summonOnDeath / summonOnAllyDeath / summonOnEnemyDeath 共用） */
export type DeathSummonSpec = NonNullable<TraitDefinition['summonOnDeath']>;

/** 死亡召唤的执行环境：由 TurnEngine 注入，避免 traits 直接依赖 GameState/编队容量逻辑 */
export interface DeathSummonContext {
  /** 阵亡者 id（供宿主侧判定等） */
  deadId: number;
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
    for (const code of char.traitIds ?? []) {
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
    events.push(...ctx.enqueue({ ...template, id, defeated: false, statuses: [] }, spec.troopId, side));
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
 * 持有者按实际伤害额等量治疗（结算经 opts.drainLife 注入，TurnEngine 传 damageOne+治疗）；
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
     * 等量治疗）；缺省时窃取类跳过（纯逻辑环境零事件）。
     */
    drainLife?: (target: Character, holder: Character, amount: number) => GameEvent[];
  } = {},
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const char of team) {
    if (char.defeated) continue;
    const gains = passivesOf(char).gainOnColorMatch[color];
    if (!gains) continue;
    for (const stat of GAIN_STAT_ORDER) {
      const actual = grantStat(char, stat, gains[stat]);
      if (actual !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: actual });
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
          if (actual !== 0) events.push({ type: 'buff', targetId: member.id, stat, amount: actual });
        }
      }
    }
  }
  // 配色净化（adagio）：任一存活持有者的净化色命中本次颜色即全队去负面状态
  if (team.some((c) => !c.defeated && passivesOf(c).cleanseOnColorMatch.includes(color))) {
    for (const member of team) events.push(...cleanseNegative(member));
  }
  // 敌方配色触发（rancor）：敌方持有者自身获得（不动敌方的 gainOnColorMatch——那是他们自己配对时才吃的）
  if (opts.enemyTeam) {
    for (const char of opts.enemyTeam) {
      if (char.defeated) continue;
      const gains = passivesOf(char).gainOnEnemyColorMatch[color];
      if (!gains) continue;
      for (const stat of GAIN_STAT_ORDER) {
        const actual = grantStat(char, stat, gains[stat]);
        if (actual !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: actual });
      }
    }
  }
  // 配色施加状态（T5 配色状态批 16 code：molten/sunfire/deepwounds/foxfire…）：
  // 匹配色命中持有者的 colorMatchStatus 键时，给随机一名存活敌人逐条施加状态。
  // 只在施加口与敌队都注入时结算——旧特质路径（无新键）零事件、零随机消耗。
  if (opts.applyStatus && opts.enemyTeam) {
    const foes = opts.enemyTeam.filter((c) => !c.defeated);
    if (foes.length > 0) {
      for (const holder of team) {
        if (holder.defeated) continue;
        const spec = passivesOf(holder).colorMatchStatus[color];
        if (!spec) continue;
        if (spec.chance !== undefined) {
          // 概率判定走种子化 rng；纯逻辑环境（无 rng）按召唤口径不生效
          if (!opts.rng || opts.rng.next() >= spec.chance) continue;
        }
        const foe = opts.rng ? foes[Math.floor(opts.rng.next() * foes.length)] : foes[0];
        events.push(...applySpecStatuses(foe, spec.statuses, spec.turns, opts));
      }
    }
  }
  // 配色窃取生命（T5 窃取批 5 code：corruption/poisontide/justabite/darkesthunger/ladyofdesire）：
  // 匹配色命中持有者的 colorMatchDrain 键时，对首位存活敌人造成伤害、持有者等量治疗。
  // 结算经 opts.drainLife 注入（TurnEngine 传 damageOne+治疗，defeat 出编队同骷髅口径）；
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
  // 条件经济光环·骷髅版（darkensouls「在配对骷髅头时，获得 3 个灵魂」）：
  // 仅骷髅键结算（配色键无对应官方句式），按持有者逐个入账、阵亡不贡献。
  if (color === 'skull') {
    for (const holder of team) {
      if (holder.defeated) continue;
      events.push(...grantEconomy(passivesOf(holder).skullMatchEconomyGain, opts.gainEconomy));
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
  stat: 'attack' | 'armor' | 'magic' | 'mana',
  amount: number,
): GameEvent[] {
  if (target.defeated || amount <= 0) return [];
  if (stat === 'mana' && passivesOf(target).manaOpsImmunity) return [];
  const current = stat === 'mana' ? target.mana : Math.max(0, target[stat]);
  const removed = Math.min(current, amount);
  if (removed <= 0) return [];
  if (stat === 'mana') target.mana -= removed;
  else target[stat] -= removed;
  return [{ type: 'buff', targetId: target.id, stat, amount: -removed }];
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
        if (troopType !== 'all' && !member.troopTypes?.includes(troopType)) continue;
        for (const stat of GAIN_STAT_ORDER) {
          const actual = grantStat(member, stat, gains[stat]);
          if (actual !== 0) events.push({ type: 'buff', targetId: member.id, stat, amount: actual });
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
        if (actual !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: actual });
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
      if (spec.chance !== undefined) {
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
      } else if (spec.scope === 'randomEnemy') {
        // 随机一名敌人（winterveil「冻结一名随机敌人」）：消耗一次随机数，无 rng 退化为首个存活
        const foes = (ctx.enemyTeam ?? []).filter((c) => !c.defeated);
        if (foes.length === 0) continue;
        const foe = ctx.rng ? foes[Math.floor(ctx.rng.next() * foes.length)] : foes[0];
        events.push(...applySpecStatuses(foe, spec.statuses, spec.turns, ctx));
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
        } else {
          const foe = ctx.rng ? foes[Math.floor(ctx.rng.next() * foes.length)] : foes[0];
          events.push(...ctx.damage(foe, holder, spec.amount));
        }
      }
    }
  }
  // 大连敌减（T5 大连敌减批 5 code：suppression/aspectofplague/technomancy/creepinggloom/
  // chillingaura）：削减敌方属性（reduce 语义，持有者不进账）。front=首位存活确定性选取、
  // randomEnemy 每条规格耗一次随机数；manashield 免疫在 reduceStat 拦截。
  if (ctx.enemyTeam) {
    for (const holder of matchingTeam) {
      if (holder.defeated) continue;
      for (const spec of passivesOf(holder).bigMatchEnemyDrain) {
        if (spec.minSize > size) continue;
        const foes = ctx.enemyTeam.filter((c) => !c.defeated);
        if (foes.length === 0) break;
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
 * 回合开始的被动结算：生命 / 护甲恢复。发 `buff` 事件让卡面能演出恢复量。
 */
export function applyTurnStartPassives(characters: readonly Character[]): BuffEvent[] {
  const events: BuffEvent[] = [];
  for (const char of characters) {
    if (char.defeated) continue;
    const p = passivesOf(char);
    // 回合恢复同样受出血/疾病影响：出血下再生归零，疾病下减半（与技能治疗一致）
    const healed = Math.min(effectiveHealing(char, p.regenPerTurn), char.maxHp - char.hp);
    if (healed > 0) {
      char.hp += healed;
      events.push({ type: 'buff', targetId: char.id, stat: 'hp', amount: healed });
    }
    if (p.regenArmorPerTurn > 0) {
      char.armor += p.regenArmorPerTurn;
      events.push({ type: 'buff', targetId: char.id, stat: 'armor', amount: p.regenArmorPerTurn });
    }
  }
  return events;
}

/**
 * 战斗开始时的一次性特质结算，顺序固定以保证确定性：
 *   1. 全体光环（崇敬 +2 法强 / 诅咒 -2 法强）
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
): BuffEvent[] {
  const events: BuffEvent[] = [];
  const push = (char: Character, stat: PassiveStat, amount: number) => {
    const actual = grantStat(char, stat, amount);
    if (actual !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: actual });
  };

  // 1. 全体光环：来源可能在任意一方，两边都要扫
  for (const [source, own, foe] of [[allies, allies, enemies], [enemies, enemies, allies]] as const) {
    for (const char of source) {
      if (char.defeated) continue;
      for (const code of char.traitIds ?? []) {
        const aura = lookup(code)?.teamAura;
        if (!aura) continue;
        for (const target of aura.scope === 'allies' ? own : foe) push(target, aura.stat, aura.amount);
      }
    }
  }

  // 2. 种族光环（族亲 / 之盾）：只作用于同队指定种族的存活角色，含自己
  for (const team of [allies, enemies]) {
    for (const char of team) {
      if (char.defeated) continue;
      for (const code of char.traitIds ?? []) {
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
      for (const code of char.traitIds ?? []) {
        const per = lookup(code)?.perAllyColor;
        if (!per) continue;
        const count = team.filter((c) => !c.defeated && c.colors.includes(per.color as BaseColor)).length;
        push(char, per.stat, per.amount * count);
      }
    }
  }

  // 4. 开局法力
  for (const char of [...allies, ...enemies]) {
    if (char.defeated) continue;
    let ratio = 0;
    for (const code of char.traitIds ?? []) {
      const r = lookup(code)?.battleStartManaRatio;
      if (r !== undefined) ratio = Math.max(ratio, r);
    }
    if (ratio <= 0) continue;
    const gained = Math.min(char.manaCost, Math.floor(char.manaCost * ratio));
    if (gained > char.mana) {
      const delta = gained - char.mana;
      char.mana = gained;
      events.push({ type: 'buff', targetId: char.id, stat: 'mana', amount: delta });
    }
  }

  return events;
}
