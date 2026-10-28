import {choiceRuleOf} from '../engine/skills/gowChoiceRules';
import type { EffectSegment, SkillPrototype } from '../engine/skills/prototypes';
import type { ScalingSpec } from '../engine/skills/scaling';
import type { Condition, ModifierSource, ModifierSpec } from '../engine/skills/effects/secondary';
import type { ColorSpec, CreateGemSpec, ClearTarget, GemParams } from '../engine/skills/effects/gems';
import type { SummonParams } from '../engine/skills/effects/summon';
import type { TargetMode } from '../engine/skills/targeting';
import type { SpecialGemKind, SpecialGemSpec } from '../engine/types';

export type DescriptionSupport = 'full' | 'partial' | 'unsupported' | 'empty';
export interface DescriptionDiagnostic {
  /** Structural paths only: source names and identity values are never copied into diagnostics. */
  path: string;
  code: 'unknown-field' | 'unsupported-value' | 'unsupported-segment' | 'depth-limit' | 'empty-branches' | 'unresolved-template';
  message: string;
}
export interface DescribedAbilitySegment {
  path: string;
  kind: string;
  name: string;
  text: string;
  support: Exclude<DescriptionSupport, 'empty'>;
  /** Both random and player-selected branches preserve their original order. */
  branches?: DescribedAbilitySegment[][];
}
export interface AdaptedAbilityDescription {
  /** Chinese mechanics label plus a stable fingerprint of the rendered mechanics; no source title. */
  name: string;
  description: string;
  segments: DescribedAbilitySegment[];
  support: DescriptionSupport;
  /** Structural description coverage, including branch containers and nested segments; not gameplay acceptance. */
  coverage: {
    totalSegments: number;
    fullSegments: number;
    partialSegments: number;
    unsupportedSegments: number;
    ratio: number;
    supportedKinds: string[];
    unresolvedPaths: string[];
  };
  diagnostics: DescriptionDiagnostic[];
}
export interface AbilityDescriptionOptions {
  /** Maximum nested branch/condition depth; default 32, hard ceiling 128. */
  maxDepth?: number;
}

const NAMES = {
  damage: '伤害', buff: '属性增益', reduce: '属性削减', gem: '宝石操作', randomStat: '随机属性',
  status: '施加状态', cleanse: '净化', dispel: '移除状态', storm: '掉落倾向', removeStorm: '清除掉落倾向',
  shuffleBoard: '重排棋盘', oneOf: '随机分支', choose: '选择分支', summon: '召唤', extraTurn: '额外回合',
  escapeChance: '撤离', gainEconomy: '资源获取', stealGold: '金币转移', spendEconomy: '金币消耗',
  sacrifice: '献祭', randomStatus: '随机状态', transformTroop: '形态替换', reposition: '移动站位',
  shuffleTeam: '队伍重排', devour: '吞噬', summonCopy: '召唤复制体', swapPositions: '交换站位', selfRevive: '自身复活',
} satisfies Record<EffectSegment['kind'], string>;
const COMMON = ['kind', 'chance', 'chanceBoost', 'ifTargetDied', 'ifCond'];
const TARGET_FIELDS = ['target', 'n', 'nRange', 'targetRace', 'targetKingdom'];
const VALUE_FIELDS = ['scaling', 'modifier', 'raceDouble', 'raceTimes', 'condMult', 'condBonus', 'rangeSpec'];
const FIELDS: Record<EffectSegment['kind'], readonly string[]> = {
  damage: [...TARGET_FIELDS, ...VALUE_FIELDS, 'range', 'splashRatio', 'splashChances', 'randomWaves', 'randomPrefer', 'trueDamage', 'manaBurn', 'modifiers', 'split', 'splitRandom', 'drain', 'execute'],
  buff: [...TARGET_FIELDS, ...VALUE_FIELDS, 'stat', 'lifeMode', 'full', 'halve', 'fraction', 'double'],
  reduce: [...TARGET_FIELDS, ...VALUE_FIELDS, 'stat', 'drainAll', 'gainStat', 'gainRatio', 'gainLifeMode', 'modifierAfterCap', 'times', 'halve', 'fraction'],
  gem: ['params', 'modifier'], randomStat: [...TARGET_FIELDS, ...VALUE_FIELDS.filter(k => k !== 'rangeSpec'), 'oneSkill'],
  status: [...TARGET_FIELDS, 'statusId', 'turns', 'magnitude', 'stacks', 'perDestroyed', 'perCount'],
  cleanse: TARGET_FIELDS, dispel: [...TARGET_FIELDS, 'statusId'], storm: ['color', 'color2', 'dropKind', 'turns'],
  removeStorm: [], shuffleBoard: [], oneOf: ['options'], choose: ['labels', 'options'], summon: ['params'], extraTurn: [],
  escapeChance: ['escapeChance'], gainEconomy: ['currency', 'scaling', 'modifier'], stealGold: ['scaling', 'modifier', 'all', 'cap', 'deferCredit'],
  spendEconomy: ['currency', 'scaling', 'modifier', 'all'], sacrifice: ['target'], randomStatus: [...TARGET_FIELDS, 'turns', 'times', 'allPositive', 'pool'],
  transformTroop: ['target', 'ref', 'randomOf', 'copyOf', 'troopId', 'fullMana'], reposition: ['target', 'to', 'n'],
  shuffleTeam: ['side'], devour: ['target', 'n', 'chanceMult'], summonCopy: ['target'], swapPositions: ['a', 'b'], selfRevive: ['healPct', 'full', 'fullMana'],
};
const STATS = { attack: '攻击', armor: '护甲', hp: '生命', magic: '魔力', mana: '法力', manaCost: '法力上限', missingHp: '已损失生命' };
const CURRENCIES = { gold: '金币', souls: '灵魂', gems: '宝石货币', maps: '地图' };
const COLORS: Record<ColorSpec, string> = {
  Red: '红', Blue: '蓝', Green: '绿', Yellow: '黄', Purple: '紫', Brown: '棕',
  CHOSEN: '指定颜色', CASTER: '自身随机一种法力颜色', SKULL: '骷髅', ENEMY: '随机敌人的一种法力颜色',
  TRACKED_ENEMY: '最近目标的一种法力颜色', LAST_TARGET: '最近目标的一种法力颜色',
  ENEMY_MOST_USED: '敌方使用最多的法力颜色', ALLY_MOST_USED: '我方使用最多的法力颜色', CHOSEN_TARGET: '选定目标的一种法力颜色',
};
const STATUSES: Record<string, string> = {
  poison: '中毒', burning: '燃烧', burn: '燃烧', bleed: '流血', bleeding: '流血', silence: '封锁主动技能',
  frozen: '冻结', freeze: '冻结', stun: '特质失效', stunned: '特质失效', entangle: '攻击归零', entangled: '攻击归零',
  web: '魔力归零', webbed: '魔力归零', disease: '法力获取减半', diseased: '法力获取减半', curse: '诅咒', cursed: '诅咒',
  'death-mark': '死亡标记', deathmark: '死亡标记', 'faerie-fire': '承受法术伤害增加', marked: '承受骷髅伤害增加',
  wolf: '延迟形态替换', 'wolf-form': '延迟形态替换', lycanthropy: '延迟形态替换', terror: '恐惧', barrier: '抵挡一次伤害', blessed: '负面状态防护',
  enchanted: '每回合补充法力', enraged: '骷髅伤害增强', rage: '骷髅伤害增强', reflect: '反射伤害', submerged: '免受群体法术伤害',
  charm: '攻击相邻队友', charmed: '攻击相邻队友', lethal: '即死防护',
};
const SPECIALS: Record<SpecialGemKind, string> = {
  doomSkull: '增强骷髅宝石', uberDoomSkull: '高阶骷髅宝石', bomb: '爆破宝石', web: '魔力归零宝石',
  lightningRow: '横行清除宝石', lightningCol: '纵列清除宝石', wildcard: '法力倍率宝石', wish: '随机增益宝石',
  hourglass: '额外回合宝石', bootyGem: '资源宝石', ghost: '法力吸取宝石', burningGem: '燃烧宝石', freezeGem: '冻结宝石',
  curseGem: '诅咒宝石', bleedGem: '流血宝石', poisonGem: '中毒宝石', deathMarkGem: '死亡标记宝石', terrorGem: '恐惧宝石',
  entangleGem: '攻击归零宝石', enrageGem: '骷髅伤害增强宝石', submergeGem: '群伤防护宝石', faerieFireGem: '法术易伤宝石',
  stunGem: '特质失效宝石', barrierGem: '伤害抵挡宝石', dragonGem: '特殊宝石#25', giantGem: '特殊宝石#26',
  spiritGem: '特殊宝石#27', manaPotionGem: '法力补充宝石', candyGem: '特殊宝石#29', elementalStar: '特殊宝石#30',
  umbralStar: '特殊宝石#31', angelGem: '特殊宝石#32', daemonicPortalGem: '召唤宝石', gargoyleGem: '特殊宝石#34',
  stoneBlock: '障碍格', lycanthropyGem: '形态替换宝石', decayGem: '特殊宝石#37', volcanoGem: '特殊宝石#38',
  trapGem: '随机负面宝石', enchantedGem: '法力恢复状态宝石', mimicGem: '特殊宝石#41',
};

/** Shared display vocabulary; unknown terms must still produce a description diagnostic. */
export const COMBAT_DESCRIPTION_TERMS = { colors: COLORS, stats: STATS, statuses: STATUSES, specials: SPECIALS } as const;

/** Compare optional metadata without depending on object insertion order. */
function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? typeof value;
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
}
function mechanicalFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash.toString(36).padStart(7, '0');
}

/** No source catalogue, registry, RNG, DOM, locale state, or user narrative is consulted. */
class DescriptionWriter {
  readonly diagnostics: DescriptionDiagnostic[] = [];
  readonly nodes: DescribedAbilitySegment[] = [];
  constructor(readonly maxDepth: number) {}
  issue(path: string, code: DescriptionDiagnostic['code'], message = '此结构尚未解析'): string {
    this.diagnostics.push({ path, code, message });
    return '【未解析项】';
  }
  audit(value: object, path: string, keys: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!keys.includes(key) && (value as Record<string, unknown>)[key] !== undefined) this.issue(`${path}.${key}`, 'unknown-field', '此字段尚未纳入机械描述');
    }
  }
  word(value: string, words: Readonly<Record<string, string>>, path: string): string {
    return Object.prototype.hasOwnProperty.call(words, value) ? words[value]! : this.issue(path, 'unsupported-value');
  }
  num(value: number, path: string): string {
    return Number.isFinite(value) ? String(value) : this.issue(path, 'unsupported-value', '数值不是有限数');
  }
  percent(value: number, path: string): string { return `${this.num(Number((value * 100).toPrecision(12)), path)}%`; }
  identity(value: string | number, category: '族群' | '区域' | '单位'): string {
    const prefix = { 族群: 'affinity', 区域: 'region', 单位: 'unit' }[category];
    const match = new RegExp(`^${prefix}:(\\d+)$`).exec(String(value));
    if (match || typeof value === 'number') return `${category}#${match?.[1] ?? value}`;
    // Stable across calls and catalogue ordering; never use a source identity as display text.
    let hash = 2166136261;
    for (const ch of String(value)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    return `${category}#${hash}`;
  }
  color(value: ColorSpec, path: string): string { return this.word(value, COLORS, path); }
  stat(value: string, path: string): string { return this.word(value, STATS, path); }
  status(value: string, path: string): string { return this.word(value, STATUSES, path); }
  special(value: SpecialGemKind | SpecialGemSpec, path: string): string {
    if (typeof value === 'string') return this.word(value, SPECIALS, path);
    this.audit(value, path, ['kind', 'tier', 'color']);
    return `${value.color ? this.color(value.color, `${path}.color`) + '色' : ''}${this.word(value.kind, SPECIALS, `${path}.kind`)}${value.tier !== undefined ? `（等级${this.num(value.tier, `${path}.tier`)}）` : ''}`;
  }
  scaling(s: ScalingSpec, path: string): string {
    this.audit(s, path, ['base', 'mult']);
    const base = this.num(s.base, `${path}.base`), mult = this.num(s.mult, `${path}.mult`);
    const formula = s.mult === 0 ? base : `${s.mult === 1 ? '' : mult + '×'}魔力${s.base === 0 ? '' : s.base < 0 ? base : '+' + base}`;
    return `max(0,round(${formula}))`;
  }
  interval(value: {min: number; max: number}, path: string): string {
    this.audit(value, path, ['min', 'max']);
    return `${this.num(value.min, `${path}.min`)}～${this.num(value.max, `${path}.max`)}`;
  }
  target(mode: TargetMode, path: string, n = '1'): string {
    const targets: Record<TargetMode, string> = {
      enemyFront: '敌方首位', enemyRandom: '随机一名敌人', enemyRandomOther: '另一名随机敌人（排除最近目标）',
      enemyRandomPrefNotPrev: '随机一名敌人（优先避开上次目标）', allyRandomPrefNotPrev: '随机一名盟友（优先避开上次目标）',
      enemyRandomN: `随机${n}名敌人`, enemyWeakest: '生命最低的敌人', enemyWeakestN: `生命最低的${n}名敌人`,
      enemyHealthiest: '生命最高的敌人', enemyHealthiestN: `生命最高的${n}名敌人`, enemyFirstN: `敌方前${n}名`,
      enemyNth: `敌方第${n}位`, enemyLast: '敌方末位', enemySecondLast: '敌方倒数第二位', enemyLastN: `敌方后${n}名`,
      enemyAllOther: '除最近主目标外所有敌人', enemyAll: '所有敌人', enemyChosen: '选定的一名敌人',
      enemyChosenAndNextDown: '选定敌人及其下一位（不循环）', enemyChosenAndBelow: '选定敌人及其下方全部敌人',
      enemyChosenAndAdjacent: '选定敌人上下各一位（不含选定者）', enemyAboveTarget: '选定位置上方全部敌人', enemyBelowTarget: '选定位置下方全部敌人',
      enemyNextDown: '选定位置下一位敌人（不循环）', enemyNextUp: '选定位置上一位敌人（不循环）',
      lastTarget: '最近一段的主目标', lastTargets: '最近一段的全部目标', lastTargetFirst: '最近目标组的首位', lastTargetLast: '最近目标组的末位',
      lastDamaged: '最近伤害段实际命中的全部目标', lastAlly: '本次缩放选中的随机盟友', allySelf: '自身', allyFront: '我方首位',
      allyRandom: '随机一名盟友（含自身）', allyRandomN: `随机${n}名盟友（含自身）`, allyRandomPrefNotPrevN: `随机抽取盟友${n}次（每次只避开上一目标，可重复）`,
      allyWeakest: '生命最低的盟友', allyLowestManaOther: '除自身外法力最低的盟友', allyHighestManaOther: '除自身外法力最高的盟友',
      allyWeakestN: `生命最低的${n}名盟友`, allyLowestHpOtherN: `除自身外生命最低的${n}名盟友`, allyHealthiest: '生命最高的盟友',
      allyHealthiestN: `生命最高的${n}名盟友`, allyFirstN: `我方前${n}名`, allyNth: `我方第${n}位`, allyOthers: '除自身外所有盟友',
      allySelfAndBelow: '自身及其下方全部盟友', allyAboveSelf: '自身上方全部盟友', allyBelowSelf: '自身下方全部盟友', allyBelowTarget: '选定位置下方全部盟友',
      allyLastOther: '除自身外末位盟友', allyLast: '我方末位', allyLastN: `我方后${n}名`, allyAll: '所有盟友（含自身）',
      allyChosenOther: '选定的一名其他盟友', allyChosen: '选定的一名盟友（可选自身）',
    };
    return this.word(mode, targets, path);
  }
  condition(c: Condition, path: string, depth = 0): string {
    if (depth >= this.maxDepth) return this.issue(path, 'depth-limit');
    const done = (text: string, ...keys: string[]) => { this.audit(c, path, ['kind', ...keys]); return text; };
    const color = () => this.color((c as {color: ColorSpec}).color, `${path}.color`);
    const status = () => this.status((c as {statusId: string}).statusId, `${path}.statusId`);
    const race = () => this.identity((c as {race: string}).race, '族群');
    switch (c.kind) {
      case 'not': return done(`不满足（${this.condition(c.cond, `${path}.cond`, depth + 1)}）`, 'cond');
      case 'anyOf': case 'allOf': return done(`（${c.of.map((v, i) => this.condition(v, `${path}.of[${i}]`, depth + 1)).join(c.kind === 'anyOf' ? ' 或 ' : ' 且 ')}）`, 'of');
      case 'targetRace': return done(`该段目标属于${race()}`, 'race');
      case 'chosenTargetRace': return done(`选定目标属于${race()}`, 'race');
      case 'lastTargetRace': return done(`最近主目标属于${race()}`, 'race');
      case 'targetColor': return done(`该段目标使用${color()}法力`, 'color');
      case 'chosenTargetColor': return done(`选定目标在施放开始时使用${color()}法力`, 'color');
      case 'lastTargetColor': return done(`最近主目标使用${color()}法力`, 'color');
      case 'targetStatus': return done(`该段目标具有「${status()}」`, 'statusId');
      case 'chosenTargetStatus': return done(`选定目标具有「${status()}」（离场后读取施放开始快照）`, 'statusId');
      case 'lastTargetStatus': return done(`最近主目标具有「${status()}」`, 'statusId');
      case 'lastTargetStatusAtCastStart': return done(`最近主目标在施放开始时具有「${status()}」`, 'statusId');
      case 'selfStatus': return done(`自身具有「${status()}」`, 'statusId');
      case 'anyEnemyStatus': case 'anyAllyStatus': return done(`${c.kind === 'anyEnemyStatus' ? '敌方' : '我方'}至少一名存活单位具有「${status()}」`, 'statusId');
      case 'targetHasAnyStatus': return done('该段目标具有任一状态');
      case 'targetHpDamaged': return done('该段目标生命未满');
      case 'selfHpDamaged': return done('自身生命未满');
      case 'chosenTargetDamaged': return done('选定目标存活且生命未满');
      case 'boardAtLeast': return done(`棋盘至少有${this.num(c.n, `${path}.n`)}颗${c.special ? this.special(c.special, `${path}.special`) : c.color ? color() + '色宝石' : '宝石'}`, 'n', 'special', 'color');
      case 'castStartBoardAtLeast': return done(`施放开始时棋盘至少有${this.num(c.n, `${path}.n`)}颗${color()}色宝石`, 'n', 'color');
      case 'destroyedColorAtLeast': return done(`本次施放已摧毁至少${this.num(c.n, `${path}.n`)}颗${color()}色宝石`, 'n', 'color');
      case 'enemyRacePresent': case 'allyRacePresent': return done(`${c.kind === 'enemyRacePresent' ? '敌方' : '我方'}存在存活的${race()}单位`, 'race');
      case 'targetHasDoom': return done(`敌方存在存活的${this.identity('Doom', '族群')}单位`);
      case 'stormPresent': return done(`当前有${c.dropKind ? this.word(c.dropKind, {skull: '骷髅', doomSkull: '增强骷髅', uberDoomSkull: '高阶骷髅'}, `${path}.dropKind`) : c.color ? color() + '色' : '任意'}掉落倾向`, 'color', 'dropKind');
      case 'troopPresent': return done(`${c.side === 'enemy' ? '敌方' : c.side === 'ally' ? '我方' : '任一方'}存在存活的${this.identity(c.name, '单位')}`, 'side', 'name');
      case 'casterStatBeatsTarget': return done(`自身${this.stat(c.stat, `${path}.stat`)}高于该段目标`, 'stat');
      case 'targetStatBeatsCaster': return done(`最近主目标（缺省为选定目标）的${this.stat(c.stat, `${path}.stat`)}高于自身`, 'stat');
      case 'chosenTargetStatBeatsCaster': return done(`选定目标的${this.stat(c.stat, `${path}.stat`)}高于自身`, 'stat');
      case 'anyEnemyColor': return done(`存在使用${color()}法力的敌人`, 'color');
      case 'firstLastEnemyColor': return done(`敌方首位或末位使用${color()}法力`, 'color');
      case 'regionPresent': return done(`战斗区域为${this.identity(c.region, '区域')}`, 'region');
      case 'kingdomPresent': return done(`战斗区域为${this.identity(c.kingdom, '区域')}`, 'kingdom');
      case 'kingdomOf': return done(`${this.word(c.side, {ally: '我方', enemy: '敌方'}, `${path}.side`)}存在属于${this.identity(c.kingdom, '区域')}的存活单位`, 'side', 'kingdom');
      case 'targetKingdom': return done(`该段目标属于${this.identity(c.kingdom, '区域')}`, 'kingdom');
      case 'ascended': return done(`战斗晋升等级至少为${this.num(c.min, `${path}.min`)}`, 'min');
      case 'manaFull': return done(`${c.of === 'caster' ? '自身' : '该段目标'}法力已满`, 'of');
      case 'lastTargetSurvived': return done('最近主目标仍存活');
      case 'anyTrackedDied': return done('本次施放追踪过的目标中至少一名由存活变为阵亡');
      case 'castEnemyDied': return done('本次施放中有敌人阵亡');
      case 'castSacrificed': return done('本次施放已成功献祭');
      case 'economyAtLeast': return done(`${this.word(c.currency, CURRENCIES, `${path}.currency`)}至少为${this.num(c.n, `${path}.n`)}`, 'currency', 'n');
      default: return this.issue(`${path}.kind`, 'unsupported-value', '条件类型尚未解析');
    }
  }
  source(s: ModifierSource, path: string): string {
    const done = (text: string, ...keys: string[]) => { this.audit(s, path, ['kind', ...keys]); return text; };
    const color = () => this.color((s as {color: ColorSpec}).color, `${path}.color`);
    const stat = () => this.stat((s as {stat: string}).stat, `${path}.stat`);
    const countGem = (v: {color?: ColorSpec; skulls?: boolean}) => v.skulls ? '骷髅系宝石' : v.color ? color() + '色宝石' : '宝石';
    const snap = 'atCastStart' in s && s.atCastStart ? '施放开始时的' : '当前的';
    switch (s.kind) {
      case 'chosenColumnAtCastStart': case 'chosenRowAtCastStart': return done(`施放开始时选定${s.kind === 'chosenColumnAtCastStart' ? '列' : '行'}的${countGem(s)}数`, 'color', 'skulls');
      case 'destroyedGems': return done(`本次施放已摧毁的${s.special ? this.special(s.special, `${path}.special`) + (s.specialTier === undefined ? '' : `（等级${s.specialTier}）`) : countGem(s)}数`, 'color', 'skulls', 'special', 'specialTier');
      case 'countedAdjacentSpecial': return done('最近一次清除前记录的相邻特殊宝石数');
      case 'diagonalGems': return done(`${s.anchor === 'chosenCell' ? '穿过选定格的' : '棋盘中央'}两条对角线上的${color()}色宝石数`, 'color', 'anchor');
      case 'transformedGems': return done(`本次施放已转换的${s.color ? color() + '色' : ''}宝石数`, 'color');
      case 'boardGems': return done(`棋盘上的${s.color ? color() + '色' : '全部基色'}宝石数${s.except ? `（排除${this.color(s.except, `${path}.except`)}色）` : ''}`, 'color', 'except');
      case 'boardSkulls': return done('棋盘上的骷髅系宝石数');
      case 'castStartBoardSkulls': return done('施放开始时棋盘上的骷髅系宝石数');
      case 'castStartBoardGems': return done(`施放开始时棋盘上的${color()}色宝石数`, 'color');
      case 'boardSpecial': return done(`棋盘上的${this.special({kind: s.gem, color: s.color, tier: s.tier}, path + '.spec')}数`, 'gem', 'color', 'tier');
      case 'selfStat': return done(`自身${stat()}`, 'stat');
      case 'allyFrontStat': return done(`我方首位的${stat()}`, 'stat');
      case 'targetStat': return done(`该段目标的${stat()}`, 'stat');
      case 'chosenStat': return done(`选定目标的${stat()}`, 'stat');
      case 'randomAllyStat': return done(`本次施放固定抽取的一名存活盟友（含自身）的${stat()}`, 'stat');
      case 'teamSize': return done(`${snap}${this.word(s.side, {ally: '我方', enemy: '敌方'}, `${path}.side`)}存活单位数`, 'side', 'atCastStart');
      case 'alliesOfRace': case 'enemiesOfRace': return done(`${snap}${s.kind === 'alliesOfRace' ? '我方' : '敌方'}存活的${this.identity(s.race, '族群')}单位数`, 'race', 'atCastStart');
      case 'alliesOfKingdom': case 'enemiesOfKingdom': return done(`${snap}${s.kind === 'alliesOfKingdom' ? '我方' : '敌方'}存活的${this.identity(s.kingdom, '区域')}单位数`, 'kingdom', 'atCastStart');
      case 'alliesNamed': return done(`${snap}我方存活的${(Array.isArray(s.name) ? s.name : [s.name]).map(n => this.identity(n, '单位')).join('或')}数量`, 'name', 'atCastStart');
      case 'alliesOfColor': case 'enemiesOfColor': return done(`${snap}${s.kind === 'alliesOfColor' ? '我方' : '敌方'}使用${color()}法力的存活单位数`, 'color', 'atCastStart');
      case 'enemyStatusCount': return done(`${snap}具有${s.statusId ? '「' + this.status(s.statusId, `${path}.statusId`) + '」' : '任一状态'}的敌人数`, 'statusId', 'atCastStart');
      case 'allyStatusCount': return done(`具有「${this.status(s.statusId, `${path}.statusId`)}」的盟友数${s.excludeSelf ? '（排除自身）' : '（含自身）'}`, 'statusId', 'excludeSelf');
      case 'targetStatusCount': return done(`该段目标具有的指定状态种数（${s.statusIds.map((v, i) => this.status(v, `${path}.statusIds[${i}]`)).join('、')}）`, 'statusIds');
      case 'enemyStatSum': return done(`${s.color ? '使用' + color() + '法力的' : ''}所有存活敌人的${stat()}总和`, 'stat', 'color');
      case 'allyStatSum': return done(`所有存活盟友${s.excludeSelf ? '（排除自身）' : '（含自身）'}的${stat()}总和`, 'stat', 'excludeSelf');
      case 'enemyFull': return done(`满足${[s.hp ? '生命已满' : '', s.mana ? '法力已满' : ''].filter(Boolean).join('且') || '存活'}的敌人数`, 'hp', 'mana');
      case 'sacrificedStat': return done(`最近献祭目标的${stat()}快照`, 'stat');
      case 'surroundingGems': return done(`最近创造的首颗宝石周围八格的${color()}色宝石数`, 'color', 'anchor');
      case 'chosenCellBlockGems': return done(`选定格周围3×3区域（含中心）的${countGem(s)}数`, 'color', 'skulls');
      default: {
        const words: Partial<Record<ModifierSource['kind'], string>> = {
          lastDamage: '前序伤害段的实际伤害总额', casterStatBeatsCount: '自身高于目标的属性项数', drainedMana: '本次施放累计吸取的法力',
          countEnemyDeaths: '本次施放敌方阵亡数', countAllyDeaths: '本次施放我方阵亡数', battleMaps: '本场共享藏宝图余额',
          lastReduce: '最近削减段的实际削减量', battleGold: '我方当前战斗金币', enemyGold: '敌方当前战斗金币', bothGold: '双方当前战斗金币之和',
          battleSouls: '本场共享灵魂余额', battleGems: '本场共享宝石余额', tempering: '武器淬炼等级', goldStolen: '本次施放实际窃取的金币总额', goldSpent: '本次施放实际消耗的金币总额',
        };
        return done(this.word(s.kind, words as Record<string, string>, `${path}.kind`));
      }
    }
  }
  modifier(m: ModifierSpec, path: string): string {
    this.audit(m, path, ['mod', 'source', 'sources', 'sourceGroups', 'max', 'pooled']);
    this.audit(m.mod, path + '.mod', ['kind', 'a', 'b']);
    const source = m.source ? this.source(m.source, path + '.source') : '0';
    const sources = m.sources?.map((s, i) => this.source(s, `${path}.sources[${i}]`));
    const groups = m.sourceGroups?.map((g, i) => g.map((s, j) => this.source(s, `${path}.sourceGroups[${i}][${j}]`)).join('+'));
    const a = this.num(m.mod.a, path + '.mod.a');
    const scale = (count: string) => {
      if (m.mod.kind === 'multiplier') return `${a}×(${count})`;
      if (m.mod.kind !== 'ratio') return this.issue(path + '.mod.kind', 'unsupported-value');
      const per = Math.max(1, Math.floor(m.mod.a)), b = Math.max(0, Math.floor(m.mod.b ?? 0));
      this.num(b, path + '.mod.b');
      const pct = 100 * b / per;
      if (Number.isInteger(pct)) return `floor((${count})×${pct}/100)`;
      if (b === 1) return `floor((${count})×${Math.ceil(pct)}/100)`;
      return `${b}×floor((${count})/${per})`;
    };
    const text = groups ? groups.map(scale).join('+') || '0' : sources && m.mod.kind === 'ratio' && !m.pooled
      ? sources.map(scale).join('+') || '0' : scale(sources ? sources.join('+') || '0' : source);
    return m.max === undefined ? text : `min(${text},max(0,${this.num(m.max, path + '.max')}))`;
  }
  createGem(g: CreateGemSpec, path: string): string {
    const done = (text: string, ...keys: string[]) => { this.audit(g, path, ['kind', ...keys]); return text; };
    switch (g.kind) {
      case 'color': return done(`${this.color(g.color, path + '.color')}色宝石`, 'color');
      case 'skull': return done('骷髅宝石');
      case 'special': return done(this.special(g.spec, path + '.spec'), 'spec');
      case 'mix': return done(`随机混合宝石（${g.colors.map((c, i) => this.color(c, `${path}.colors[${i}]`)).join('、')}）`, 'colors');
      case 'mixSpecial': return done(`随机混合特殊宝石（${g.specs.map((s, i) => this.special(s, `${path}.specs[${i}]`)).join('、')}）${g.minimumEach === undefined ? '' : `，每类至少${this.num(g.minimumEach, path + '.minimumEach')}颗`}`, 'specs', 'minimumEach');
      case 'mixAny': return done(`随机混合宝石（${g.entries.map((v, i) => typeof v === 'string' ? this.color(v, `${path}.entries[${i}]`) : this.special(v, `${path}.entries[${i}]`)).join('、')}）`, 'entries');
      default: return this.issue(path + '.kind', 'unsupported-value');
    }
  }
  cell(value: {row: number; col: number} | 'CELL' | 'RANDOM' | undefined, path: string): string {
    if (!value) return '棋盘中心格';
    if (value === 'CELL') return '选定格';
    if (value === 'RANDOM') return '随机格';
    this.audit(value, path, ['row', 'col']);
    return `第${value.row + 1}行第${value.col + 1}列`;
  }
  clearTarget(t: ClearTarget, path: string, title = false): string {
    const done = (text: string, ...keys: string[]) => { this.audit(t, path, ['kind', ...keys]); return text; };
    const orientation = (o: string) => this.word(o, {row: '行', col: '列'}, path + '.orientation');
    switch (t.kind) {
      case 'lines': return done([t.rows ? `第${t.rows.map(n => n + 1).join('、')}行` : '', t.cols ? `第${t.cols.map(n => n + 1).join('、')}列` : ''].filter(Boolean).join('及'), 'rows', 'cols');
      case 'chosenLine': return done(`选定${orientation(t.orientation)}`, 'orientation');
      case 'randomLines': return done(`随机${title ? '' : this.scaling(t.count, path + '.count')}${orientation(t.orientation)}`, 'orientation', 'count');
      case 'color': return done(`${this.color(t.color, path + '.color')}色宝石`, 'color');
      case 'allColors': return done('全部基色宝石');
      case 'skulls': return done('全部骷髅系宝石');
      case 'allGems': return done('棋盘全部宝石');
      case 'special': return done(this.special({kind: t.gem, tier: t.tier}, path + '.spec'), 'gem', 'tier');
      case 'randomGems': return done(`随机${title ? '' : (t.countRange ? this.interval(t.countRange, path + '.countRange') : this.scaling(t.count, path + '.count')) + '颗'}${t.special ? this.special({kind: t.special, tier: t.specialTier}, path + '.spec') : t.colors ? t.colors.map((c, i) => this.color(c, `${path}.colors[${i}]`)).join('或') + '色宝石' : t.color ? this.color(t.color, path + '.color') + '色宝石' : this.word(t.include ?? 'color', {color: '基色宝石', all: '任意宝石', skull: '骷髅系宝石', nonSkull: '非骷髅宝石'}, path + '.include')}`, 'countRange', 'count', 'special', 'specialTier', 'color', 'colors', 'include');
      case 'cell': return done(this.cell(t.cell, path + '.cell'), 'cell');
      case 'area': return done(`以${this.cell(t.center, path + '.center')}为中心的${this.word(t.shape, {square5: '5×5区域', square3: '3×3区域', cross3: '十字五格', x: '两条对角线', circle5: '五格直径圆形区域', row3: '横向三格'}, path + '.shape')}`, 'shape', 'center');
      case 'chosenCross': return done('选定格所在整行及整列');
      case 'lastDestroyedLine': return done(`最近摧毁格所在${orientation(t.orientation)}`, 'orientation');
      default: return this.issue(path + '.kind', 'unsupported-value');
    }
  }
  gem(p: GemParams, path: string): string {
    switch (p.op) {
      case 'create': {
        this.audit(p, path, ['op', 'gem', 'count', 'countRange', 'modifier']);
        const scaling = this.scaling(p.count, path + '.count');
        return `在随机可替换格创造${p.countRange ? '随机整数' + this.interval(p.countRange, path + '.countRange') : scaling}${p.modifier ? '+(' + this.modifier(p.modifier, path + '.modifier') + ')' : ''}颗${this.createGem(p.gem, path + '.gem')}`;
      }
      case 'transform': {
        this.audit(p, path, ['op', 'from', 'to', 'toSpecial', 'spiritColorFromSource', 'fromSpecial', 'diagonal', 'diagonalAnchor', 'tiers', 'count', 'countModifier']);
        const from = p.fromSpecial ? this.special(p.fromSpecial, path + '.fromSpecial') : p.from === 'ANY' || p.from === undefined ? '任意宝石' : p.from === 'CELL' ? '选定格宝石' : this.color(p.from, path + '.from') + '色宝石';
        // `to` is also meaningful with special gems (colour is inferred by the engine).
        const toColor = this.color(p.to, path + '.to');
        const to = p.toSpecial ? this.special(p.toSpecial, path + '.toSpecial') + `（目标色：${toColor}）` : toColor + '色宝石';
        return `将${p.diagonal ? `${this.word(p.diagonal, {left: '左斜', right: '右斜'}, path + '.diagonal')}对角线（${p.diagonalAnchor === 'chosenCell' ? '穿过选定格' : '棋盘中央'}）上的` : ''}${p.count ? '随机' + this.scaling(p.count, path + '.count') + (p.countModifier ? '+(' + this.modifier(p.countModifier, path + '.countModifier') + ')' : '') + '颗' : '全部'}${from}转换为${to}${p.tiers ? `；等级在${p.tiers.map((n, i) => this.num(n, `${path}.tiers[${i}]`)).join('～')}内随机` : ''}${p.spiritColorFromSource ? '；保留各来源格的基色' : ''}`;
      }
      case 'clear': {
        this.audit(p, path, ['op', 'mode', 'target', 'modifier', 'countAdjacentSpecial']);
        return `${this.word(p.mode, {destroy: '摧毁', explode: '爆破', remove: '移除'}, path + '.mode')}${this.clearTarget(p.target, path + '.target')}${p.modifier ? `；数量加成=${this.modifier(p.modifier, path + '.modifier')}` : ''}${p.countAdjacentSpecial ? `；清除前记录相邻${this.special(p.countAdjacentSpecial, path + '.countAdjacentSpecial')}数` : ''}${p.mode === 'remove' ? '（不获取法力）' : ''}`;
      }
      default: return this.issue(path + '.op', 'unsupported-value');
    }
  }
  summon(p: SummonParams, path: string): string {
    this.audit(p, path, ['source', 'countRange', 'position', 'resolveRef', 'troopId']);
    const s = p.source;
    let unit: string;
    if ('ref' in s) { this.audit(s, path + '.source', ['ref', 'troopId']); unit = this.identity(s.ref, '单位'); }
    else if ('randomOf' in s) { this.audit(s, path + '.source', ['randomOf', 'troopId']); unit = `随机候选（${s.randomOf.map(v => this.identity(v, '单位')).join('、')}）`; }
    else if ('randomOfKingdom' in s) { this.audit(s, path + '.source', ['randomOfKingdom', 'troopId']); unit = `属于${this.identity(s.randomOfKingdom, '区域')}的随机单位`; }
    else {
      this.audit(s, path + '.source', ['template', 'troopId']);
      unit = `${s.troopId === undefined ? '模板单位' : this.identity(s.troopId, '单位')}${this.issue(path + '.source.template', 'unresolved-template', '内嵌召唤模板的属性与被动尚未逐项描述')}`;
    }
    if (p.resolveRef) this.issue(path + '.resolveRef', 'unresolved-template', '自定义召唤解析函数的内容尚未解析');
    return `召唤${p.countRange ? '随机' + this.interval(p.countRange, path + '.countRange') : '1'}个${unit}至我方${this.word(p.position ?? 'back', {front: '首位', back: '末位'}, path + '.position')}（仅填充空缺，最多4名在场单位）`;
  }
  segment(s: EffectSegment, path: string, depth = 0): DescribedAbilitySegment {
    const before = this.diagnostics.length;
    let name = Object.prototype.hasOwnProperty.call(NAMES, s.kind) ? NAMES[s.kind] : '未解析技能段';
    let text = '', branches: DescribedAbilitySegment[][] | undefined;
    const at = (key: string) => `${path}.${key}`;
    const num = (v: number, key: string) => this.num(v, at(key));
    const chance = (v: number, key: string) => this.percent(v, at(key));
    const selected = () => {
      if (!('target' in s)) return '';
      const n = 'n' in s && s.n !== undefined ? num(s.n, 'n') : '1';
      const range = 'nRange' in s && s.nRange ? this.interval(s.nRange, at('nRange')) : undefined;
      const filters = [
        'targetRace' in s && s.targetRace ? `属于${this.identity(s.targetRace, '族群')}` : '',
        'targetKingdom' in s && s.targetKingdom !== undefined ? `属于${this.identity(s.targetKingdom, '区域')}` : '',
      ].filter(Boolean);
      return this.target(s.target, at('target'), range ?? n) + (range ? '（人数在区间内均匀随机取整）' : '') + (filters.length ? `（只保留${filters.join('且')}的目标）` : '');
    };
    const value = () => {
      if (!('scaling' in s)) return '';
      let result = this.scaling(s.scaling, at('scaling'));
      if ('rangeSpec' in s && s.rangeSpec) {
        this.audit(s.rangeSpec, at('rangeSpec'), ['min', 'max']);
        result = `区间随机整数[${this.scaling(s.rangeSpec.min, at('rangeSpec.min'))},${this.scaling(s.rangeSpec.max, at('rangeSpec.max'))}]`;
      }
      if ('modifier' in s && s.modifier) result += `+(${this.modifier(s.modifier, at('modifier'))})`;
      if ('modifiers' in s && s.modifiers) result += s.modifiers.map((m, i) => `+(${this.modifier(m, at(`modifiers[${i}]`))})`).join('');
      return result;
    };
    const conditionalAmount = () => {
      const notes: string[] = [];
      if ('condBonus' in s && s.condBonus) {
        this.audit(s.condBonus, at('condBonus'), ['n', 'cond']);
        notes.push(`若${this.condition(s.condBonus.cond, at('condBonus.cond'))}，数值先加${num(s.condBonus.n, 'condBonus.n')}`);
      }
      if ('raceDouble' in s && s.raceDouble) notes.push(`目标属于${this.identity(s.raceDouble, '族群')}时数值再×${num(s.raceTimes ?? 2, 'raceTimes')}`);
      if ('condMult' in s && s.condMult) {
        this.audit(s.condMult, at('condMult'), ['cond', 'times']);
        notes.push(`若${this.condition(s.condMult.cond, at('condMult.cond'))}，数值最后×${num(s.condMult.times, 'condMult.times')}`);
      }
      return notes.length ? '；' + notes.join('；') : '';
    };
    if (depth >= this.maxDepth) text = this.issue(path, 'depth-limit', '分支嵌套超过描述深度上限');
    else if (!Object.prototype.hasOwnProperty.call(FIELDS, s.kind)) text = this.issue(at('kind'), 'unsupported-segment', '效果段类型尚未解析');
    else {
      this.audit(s, path, s.kind === 'choose' ? ['kind', ...FIELDS.choose] : [...COMMON, ...FIELDS[s.kind]]);
      switch (s.kind) {
        case 'damage': {
          const amount = value();
          text = s.execute ? `直接击败${selected()}（受即死免疫限制）` : `对${selected()}造成${amount}点${s.trueDamage || s.drain ? '无视护甲的' : ''}伤害`;
          if (s.manaBurn) text += '；伤害额额外加上每个目标当前法力（不扣除法力）';
          if (s.range) text += `；${this.word(s.range, {single: '单体结算', all: '群体结算', splash: '相邻溅射', scatter: '分配伤害'}, at('range'))}`;
          if (s.range === 'splash' || s.splashRatio !== undefined) text += `；相邻目标承受主目标数值的${chance(s.splashRatio ?? 0.5, 'splashRatio')}`;
          if (s.splashChances) text += `；各轮溅射独立触发概率：${s.splashChances.map((v, i) => chance(v, `splashChances[${i}]`)).join('、')}（覆盖目标数量设置）`;
          if (s.randomWaves !== undefined) text += `；连续随机攻击${num(s.randomWaves, 'randomWaves')}轮（区间伤害每轮独立取值）`;
          if (s.randomWaves || s.splashChances) text += s.randomPrefer === 'notHit' ? '；优先未被命中的敌人' : '；每次优先避开上一目标，仍可重复命中';
          if (s.split !== undefined) text += `；总额平均分给敌方前${num(s.split, 'split')}名存活敌人（余数优先给靠前者）`;
          if (s.splitRandom) text += '；总额随机分配给全部存活敌人';
          if (s.drain) text += '；自身恢复目标实际损失的生命总量（不超过自身生命上限）';
          text += conditionalAmount();
          break;
        }
        case 'buff': {
          const amount = value(), stat = this.stat(s.stat, at('stat'));
          const mode = s.lifeMode ? this.word(s.lifeMode, {gain: '生命与生命上限同时增加', heal: '恢复生命，不超过上限'}, at('lifeMode')) : '恢复生命，不超过上限';
          text = `使${selected()}${s.stat === 'hp' ? mode : '增加' + stat}，数值=${s.stat === 'mana' && (s.halve || s.fraction !== undefined) ? `floor(目标法力上限×${num(s.halve ? 0.5 : s.fraction!, 'fraction')})` : s.double ? '目标当前该属性（使该属性翻倍）' : s.full && s.stat === 'hp' ? '目标当前缺失生命' : amount}`;
          text += conditionalAmount();
          break;
        }
        case 'reduce': {
          const amount = value();
          const stat = s.stat === 'random' ? '随机一项属性（攻击、护甲、生命、魔力）' : this.stat(s.stat, at('stat'));
          text = `削减${selected()}的${stat}，数值=${s.drainAll ? '目标当前该属性全部数值' : s.halve || s.fraction !== undefined ? `floor(目标当前该属性×${num(s.halve ? 0.5 : s.fraction!, 'fraction')})` : amount}`;
          if (s.modifierAfterCap) text += '；基础部分先按目标现值封顶，再加来源加成；转移收益按该计数器计算';
          else text += '（实际削减不超过目标现值）';
          if (s.times !== undefined) { const times = num(s.times, 'times'); text += s.stat === 'random' ? `；每目标重复${Math.max(1, s.times)}次（每次独立选属性）` : `；此属性仅执行一次（次数参数${times}仅用于随机属性）`; }
          if (s.gainStat) text += `；自身获得floor(${s.modifierAfterCap ? '计数器数值' : '实际削减量'}×${num(s.gainRatio ?? 1, 'gainRatio')})点${s.stat === 'random' ? '同一属性' : this.stat(s.gainStat, at('gainStat'))}${s.gainStat === 'hp' || s.stat === 'random' ? s.gainLifeMode === 'gain' || s.stat === 'random' && !s.gainLifeMode ? '（生命收益同时增加上限）' : '（生命收益作为治疗）' : ''}`;
          text += conditionalAmount();
          break;
        }
        case 'gem': {
          text = this.gem(s.params, at('params'));
          name = s.params.op === 'create' ? '宝石生成' : s.params.op === 'transform' ? '宝石转换' : '宝石清除';
          // Constructors can retain an outer copy; the executor reads only params.
          const outer = (s as typeof s & {modifier?: ModifierSpec}).modifier;
          const inner = s.params.op === 'transform' ? s.params.countModifier : s.params.modifier;
          if (outer && canonical(outer) !== canonical(inner)) this.issue(at('modifier'), 'unsupported-value', '段外加成与实际执行参数不同，尚未确认其编译意图');
          break;
        }
        case 'randomStat': text = `使${selected()}获得${value()}点属性增益；${s.oneSkill ? '每目标随机选择攻击、护甲、生命、魔力中的一项，全部点数加给该项（生命收益同时增加上限）' : '每点独立随机分配至攻击、护甲、生命、魔力之一（生命收益作为治疗）'}${conditionalAmount()}`; break;
        case 'status': {
          text = `对${selected()}施加「${this.status(s.statusId, at('statusId'))}」，持续参数${num(s.turns, 'turns')}回合（实际结束遵循该状态的触发与解除规则）`;
          if (s.magnitude !== undefined) text += `，强度${num(s.magnitude, 'magnitude')}`;
          if (s.stacks !== undefined) text += `，层数${num(s.stacks, 'stacks')}`;
          let destroyed = '';
          if (s.perDestroyed) { this.audit(s.perDestroyed, at('perDestroyed'), ['color']); destroyed = `本次施放摧毁的${s.perDestroyed.color === 'skull' ? '骷髅系' : s.perDestroyed.color ? this.color(s.perDestroyed.color, at('perDestroyed.color')) + '色' : ''}宝石数`; }
          if (s.perCount || s.perDestroyed) {
            text = `在${selected()}中随机施加「${this.status(s.statusId, at('statusId'))}」，持续参数${num(s.turns, 'turns')}回合${s.magnitude === undefined ? '' : `，强度${num(s.magnitude, 'magnitude')}`}${s.stacks === undefined ? '' : `，层数${num(s.stacks, 'stacks')}`}；施加总次数=${s.perCount ? this.modifier(s.perCount, at('perCount')) : destroyed}；每次重新选择存活且可接收该状态的目标（已有同状态者跳过，流血可叠至4层）`;
          }
          break;
        }
        case 'cleanse': text = `移除${selected()}的全部负面状态，保留正面状态`; break;
        case 'dispel': text = `移除${selected()}的「${this.status(s.statusId, at('statusId'))}」状态`; break;
        case 'storm': text = `设置${s.dropKind ? this.word(s.dropKind, {skull: '骷髅', doomSkull: '增强骷髅', uberDoomSkull: '高阶骷髅'}, at('dropKind')) : this.color(s.color, at('color')) + (s.color2 ? '与' + this.color(s.color2, at('color2')) : '') + '色'}宝石的掉落倾向，持续${num(s.turns, 'turns')}回合（替换当前倾向）`; break;
        case 'removeStorm': text = '清除当前宝石掉落倾向'; break;
        case 'shuffleBoard': text = '随机重排棋盘'; break;
        case 'oneOf': case 'choose': {
          if (s.options.length === 0) this.issue(at('options'), 'empty-branches', '分支列表为空');
          branches = s.options.map((branch, i) => branch.map((child, j) => this.segment(child, at(`options[${i}][${j}]`), depth + 1)));
          text = (s.kind === 'choose' ? '由施放者选择一个分支' : '等概率随机执行一个分支') + '：' + branches.map((b, i) => `分支${i + 1}〔${b.map(c => c.text).join('；') || '无效果段'}〕`).join('；');
          // Labels are presentation metadata, replaced with ordinal labels to remove source identities.
          break;
        }
        case 'summon': text = this.summon(s.params, at('params')); break;
        case 'extraTurn': text = '获得一个额外回合（仍受战斗状态规则限制）'; break;
        case 'escapeChance': text = `自身以${chance(s.escapeChance, 'escapeChance')}概率撤离战场`; break;
        case 'gainEconomy': text = `本场战斗资源增加${value()}个${this.word(s.currency, CURRENCIES, at('currency'))}`; break;
        case 'stealGold': text = `从敌方转移${s.all ? '全部可用' : value() + '个'}金币至我方${s.cap === undefined ? '' : `（本段转移上限${num(s.cap, 'cap')}）`}${s.deferCredit ? '；入账推迟到后续伤害段之后' : '（立即入账）'}`; break;
        case 'spendEconomy': text = `消耗我方${s.all ? '全部可用' : value() + '个'}${this.word(s.currency, CURRENCIES, at('currency'))}（不足时只消耗余额）`; break;
        case 'sacrifice': text = `献祭${selected()}使其阵亡，并记录其属性快照`; break;
        case 'randomStatus': text = `对${selected()}${s.allPositive ? '施加正面状态池的全部状态' : `连续施加${num(s.times ?? 1, 'times')}个随机${s.pool === 'positive' ? '正面' : s.target.startsWith('ally') ? '正面（跨段目标按实际阵营选池）' : s.target.startsWith('enemy') ? '负面' : '状态（按目标阵营选择正面或负面池）'}状态`}，每个状态持续参数${num(s.turns ?? 3, 'turns')}回合`; break;
        case 'transformTroop': text = `将${selected()}替换为${s.copyOf ? '按' + this.target(s.copyOf, at('copyOf')) + '的当前快照复制的形态' : s.randomOf ? '随机候选（' + s.randomOf.map(v => this.identity(v, '单位')).join('、') + '）' : s.ref ? this.identity(s.ref, '单位') : this.issue(at('ref'), 'unsupported-value', '缺少形态模板')}（不触发阵亡钩子）${s.fullMana ? '，法力回满' : ''}`; break;
        case 'reposition': text = `将${selected()}移动至其队伍${this.word(s.to, {front: '首位', back: '末位'}, at('to'))}`; break;
        case 'shuffleTeam': text = `随机重排${this.word(s.side, {ally: '我方', enemy: '敌方'}, at('side'))}队伍站位`; break;
        case 'devour': {
          let probability = chance(s.chance, 'chance');
          if (s.chanceMult) { this.audit(s.chanceMult, at('chanceMult'), ['times', 'cond']); probability += `×（若${this.condition(s.chanceMult.cond, at('chanceMult.cond'))}则${num(s.chanceMult.times, 'chanceMult.times')}，否则1）`; }
          if (s.chanceBoost) probability += `+(${this.modifier(s.chanceBoost, at('chanceBoost'))})个百分点`;
          text = `对${selected()}分别判定吞噬，概率=clamp(${probability},0%,100%)；成功击败目标后，自身获得其当前攻击、护甲与生命（生命上限同时增加；受吞噬与即死免疫限制）`;
          break;
        }
        case 'summonCopy': text = `在我方空缺位置召唤${selected()}的当前快照复制体（最多4名在场单位）`; break;
        case 'swapPositions': text = `交换${this.target(s.a, at('a'))}与${this.target(s.b, at('b'))}的站位（需位于同一队伍）`; break;
        case 'selfRevive': text = `本次施放中自身阵亡后复活，${s.full ? '恢复全部生命' : '恢复生命上限的' + chance(s.healPct ?? 0.5, 'healPct')}${s.fullMana ? '，法力回满' : ''}`; break;
      }
      if ('ifTargetDied' in s && s.ifTargetDied) text = `若最近产目标段的主目标由存活变为阵亡，${text}`;
      if ('ifCond' in s && s.ifCond) text = `若${this.condition(s.ifCond, at('ifCond'))}，${text}`;
      if (s.kind !== 'devour' && s.kind !== 'choose' && (s.chance !== undefined || s.chanceBoost)) text = `整段以${s.chanceBoost ? `clamp(${chance(s.chance ?? 0, 'chance')}+(${this.modifier(s.chanceBoost, at('chanceBoost'))})个百分点,0%,100%)` : chance(s.chance!, 'chance')}概率执行：${text}`;
    }
    const unknown = name === '未解析技能段';
    if (!unknown) {
      let effect: string = name;
      if (s.kind === 'damage') effect = s.execute ? '直接击败' : s.drain ? '生命吸取' : s.trueDamage ? '穿甲伤害' : s.range === 'splash' ? '溅射伤害' : s.split || s.splitRandom || s.range === 'scatter' ? '分摊伤害' : s.randomWaves ? '连续伤害' : '伤害';
      if (s.kind === 'buff') effect = s.stat === 'hp' ? s.lifeMode === 'gain' ? '生命成长' : s.full ? '完全治疗' : '治疗' : (STATS[s.stat] ?? '属性') + (s.double ? '翻倍' : '增益');
      if (s.kind === 'reduce') effect = (s.stat === 'random' ? '随机属性' : STATS[s.stat] ?? '属性') + (s.gainStat ? '窃取' : s.halve ? '减半' : s.drainAll ? '清空' : '削减');
      if (s.kind === 'status') effect = STATUSES[s.statusId] ?? '未解析状态';
      if (s.kind === 'dispel') effect = '移除' + (STATUSES[s.statusId] ?? '未解析状态');
      if (s.kind === 'gem') {
        const p = s.params;
        effect = p.op === 'create' ? '生成' + this.createGem(p.gem, at('params.gem')).replace(/（[^）]*）/g, '').split('，')[0]
          : p.op === 'transform' ? `${p.fromSpecial ? SPECIALS[p.fromSpecial] ?? '特殊宝石' : p.from === 'ANY' || p.from === undefined ? '任意宝石' : p.from === 'CELL' ? '选定格宝石' : COLORS[p.from] ?? '宝石'}转${p.toSpecial ? SPECIALS[typeof p.toSpecial === 'string' ? p.toSpecial : p.toSpecial.kind] ?? '特殊宝石' : p.to ? COLORS[p.to] ?? '宝石' : '宝石'}`
          : this.word(p.mode, {destroy: '摧毁', explode: '爆破', remove: '移除'}, at('params.mode')) + this.clearTarget(p.target, at('params.target'), true).replace(/（[^）]*）/g, '');
        if (effect.length > 20) effect = effect.slice(0, 20) + '等';
      }
      if ((s.kind === 'choose' || s.kind === 'oneOf') && branches?.length) effect += '：' + [...new Set(branches.flat().map(n => n.name))].slice(0, 2).join('或');
      if (s.kind === 'storm') effect = (s.dropKind ? {skull: '骷髅', doomSkull: '增强骷髅', uberDoomSkull: '高阶骷髅'}[s.dropKind] : COLORS[s.color]) + '掉落倾向';
      if (s.kind === 'summon' && 'ref' in s.params.source) effect += this.identity(s.params.source.ref, '单位');
      if (s.kind === 'gainEconomy' || s.kind === 'spendEconomy') effect = (CURRENCIES[s.currency] ?? '资源') + (s.kind === 'gainEconomy' ? '获取' : '消耗');
      if (s.kind === 'randomStatus') effect = s.allPositive ? '全部正面状态' : s.pool === 'positive' ? '随机正面状态' : s.pool === 'negative' ? '随机负面状态' : '随机状态';
      const target = 'target' in s ? selected().replace(/（.*$/s, '').replace(/存活/g, '').replace(/选定/g, '指定') : '';
      name = `${target.length > 12 ? target.slice(0, 12) : target}${effect}`;
    }
    const support = unknown || depth >= this.maxDepth ? 'unsupported' : this.diagnostics.length > before ? 'partial' : 'full';
    const node: DescribedAbilitySegment = {path, kind: Object.prototype.hasOwnProperty.call(NAMES, s.kind) ? s.kind : 'unknown', name, text, support, ...(branches ? {branches} : {})};
    this.nodes.push(node);
    return node;
  }
}

const battleResourceKinds=new Set(['gainEconomy','spendEconomy','stealGold','battleGold','enemyGold','bothGold','battleSouls','battleGems','battleMaps','goldStolen','goldSpent','economyAtLeast']);
function usesBattleResources(value:unknown,seen=new WeakSet<object>()):boolean {
 if(!value||typeof value!=='object'||seen.has(value))return false;
 seen.add(value);
 if(Array.isArray(value))return value.some(child=>usesBattleResources(child,seen));
 const record=value as Record<string,unknown>;
 return typeof record.kind==='string'&&battleResourceKinds.has(record.kind)||Object.values(record).some(child=>usesBattleResources(child,seen));
}

/** Describe the compiled/adapted mechanics. Never pass a source spell name or description. */
export function describeAdaptedAbility(prototype: SkillPrototype, options: AbilityDescriptionOptions = {}): AdaptedAbilityDescription {
  const requestedDepth = options.maxDepth ?? 32;
  const writer = new DescriptionWriter(Number.isFinite(requestedDepth) ? Math.max(1, Math.min(128, Math.floor(requestedDepth))) : 32);
  writer.audit(prototype, 'prototype', ['segments', 'inputTarget', 'oncePerBattle']);
  const input = prototype.inputTarget ? `施放时选取${writer.target(prototype.inputTarget, 'prototype.inputTarget')}。` : '';
  const segments = prototype.segments.map((s, i) => writer.segment(s, `segments[${i}]`));
  const names = [...new Set(segments.map(s => s.name))];
  const fullSegments = writer.nodes.filter(s => s.support === 'full').length;
  const partialSegments = writer.nodes.filter(s => s.support === 'partial').length;
  const unsupportedSegments = writer.nodes.filter(s => s.support === 'unsupported').length;
  const totalSegments = writer.nodes.length;
  const rule = choiceRuleOf(prototype);
  const restriction = rule ? (rule.onlyColor ? `只能选择${COLORS[rule.onlyColor]}色普通宝石。` : rule.notColor ? `选择普通宝石时排除${COLORS[rule.notColor]}色。` : rule.manaGemsOnly ? '只能选择六色普通宝石。' : '') : '';
  const description = `${prototype.oncePerBattle ? '每场战斗仅可施放一次。' : ''}${input}${restriction}${segments.map((s, i) => `${i + 1}. ${s.text}`).join('；') || '此原型没有主动效果段。'}`;
  const resourceNotice=usesBattleResources(prototype)?'。以上资源仅用于本场战斗，结束后失效；金币按阵营独立，灵魂、宝石和藏宝图由双方共享；实际奖励以结算页为准。':'';
  return {
    name: names.length ? names.slice(0, 2).join('·') + (names.length > 2 ? '等' : '') + '〔' + mechanicalFingerprint(description) + '〕' : '无主动效果',
    description:description+resourceNotice,
    segments,
    support: totalSegments === 0 ? writer.diagnostics.length ? 'unsupported' : 'empty' : !writer.diagnostics.length ? 'full' : unsupportedSegments === totalSegments ? 'unsupported' : 'partial',
    coverage: {
      totalSegments, fullSegments, partialSegments, unsupportedSegments, ratio: totalSegments ? fullSegments / totalSegments : 0,
      supportedKinds: [...new Set(writer.nodes.filter(s => s.support === 'full').map(s => s.kind))].sort(),
      unresolvedPaths: [...new Set(writer.diagnostics.map(d => d.path))],
    },
    diagnostics: writer.diagnostics,
  };
}


