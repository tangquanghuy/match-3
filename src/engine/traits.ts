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
 * 官方共 785 个 trait code。已实现 87 个（覆盖 2355 次兵种出场），涵盖：骷髅减伤、
 * 法术减伤、状态免疫、开局法力、每回合恢复、受击增益、命中附带状态/增益、
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
import type { BaseColor, Character, PassiveModifiers, StatGains, PlayerSide, StormSummon } from './types';

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
  /** 自己造成骷髅伤害时获得 */
  onSkullHitGain?: { stat: PassiveStat; amount: number };
  /** 同队任一角色施法时获得 */
  onAllyCastGain?: { stat: PassiveStat; amount: number };
  /** 敌方任一角色施法时获得 */
  onEnemyCastGain?: { stat: PassiveStat; amount: number };
  /** 敌方角色阵亡时获得 */
  onEnemyDeathGain?: { stat: PassiveStat; amount: number };
  /** 同队角色阵亡时获得 */
  onAllyDeathGain?: { stat: PassiveStat; amount: number };
  /** 自己一方匹配 4 或 5 连时获得 */
  onBigMatchGain?: { stat: PassiveStat; amount: number };
  /** 自己造成骷髅伤害时给目标施加的状态 */
  inflictOnSkullHit?: { id: string; turns: number; magnitude?: number };
  /** 承受骷髅伤害时给攻击者施加的状态（毒孢子族） */
  inflictOnSkullDamaged?: { id: string; turns: number; magnitude?: number };
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
  /** 匹配该色宝石时获得数值 */
  onColorMatchGain?: { color: string; stat: PassiveStat; amount: number };
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
    // 布尔项取并集：任一条特质给了隐匿即生效
    if (trait.untargetable) passive.untargetable = true;
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
    // 4/5 连种族光环：同种族数值叠加，异种族并存
    if (trait.onBigMatchTypeAura) {
      const k = trait.onBigMatchTypeAura.troopType;
      const merged = bigMatchAura.get(k) ?? noGains();
      for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
        merged[stat] += trait.onBigMatchTypeAura.gains[stat] ?? 0;
      }
      bigMatchAura.set(k, merged);
    }
    // 死亡召唤：同字段取概率更高的一条（多个持有不叠加多次召唤，与"同类取最强"口径一致）。
    // 风暴变体（storm）随对象整体拷贝，编译层不感知其差异——风暴入队/顶替裁定在 TurnEngine。
    for (const key of ['summonOnDeath', 'summonOnAllyDeath', 'summonOnEnemyDeath'] as const) {
      const s = trait[key];
      if (s && (passive[key] === undefined || s.chance > passive[key]!.chance)) {
        passive[key] = { ...s };
      }
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

/** 配色触发（食人魔之怒/阳光…）：匹配到某色时给该队加值。 */
export function applyColorMatchTriggers(
  team: readonly Character[],
  color: BaseColor,
): BuffEvent[] {
  const events: BuffEvent[] = [];
  for (const char of team) {
    if (char.defeated) continue;
    const gains = passivesOf(char).gainOnColorMatch[color];
    if (!gains) continue;
    for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
      const actual = grantStat(char, stat, gains[stat]);
      if (actual !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: actual });
    }
  }
  return events;
}

/**
 * 4 或 5 连响应（庞然/巨型/修理…）：只作用于匹配方自己一队。
 * 另含种族光环（firstwargare/overclock…）：持有者所在方配对 4/5 连时，
 * 给同队该族盟友（或 troopType 'all' 的全队）套用光环增益，按队伍序确定性结算。
 */
export function applyBigMatchTriggers(matchingTeam: readonly Character[]): BuffEvent[] {
  const events = applyTrigger(matchingTeam, 'gainOnBigMatch');
  for (const holder of matchingTeam) {
    if (holder.defeated) continue;
    const aura = passivesOf(holder).bigMatchTypeAura;
    for (const [troopType, gains] of Object.entries(aura)) {
      for (const member of matchingTeam) {
        if (member.defeated) continue;
        if (troopType !== 'all' && !member.troopTypes?.includes(troopType)) continue;
        for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
          const actual = grantStat(member, stat, gains[stat]);
          if (actual !== 0) events.push({ type: 'buff', targetId: member.id, stat, amount: actual });
        }
      }
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
