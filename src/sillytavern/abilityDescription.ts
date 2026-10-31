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
  /**
   * Internal mechanics label plus a stable fingerprint of the rendered mechanics (audits, tests).
   * Player-facing skill names use the original game's spell name instead (user decision 2026-10-30).
   */
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
  /** Catalogue spell id, for the few single-skill text patches. */
  spellId?: number;
}

const NAMES = {
  damage: '伤害', buff: '属性增益', reduce: '属性削减', gem: '宝石操作', randomStat: '随机属性',
  status: '施加状态', cleanse: '净化', dispel: '移除状态', storm: '风暴', removeStorm: '清除风暴',
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

/** Player-facing colour words: base colours read "红色", indirect colours describe their source. */
const COLOR_WORDS: Record<ColorSpec, string> = {
  Red: '红色', Blue: '蓝色', Green: '绿色', Yellow: '黄色', Purple: '紫色', Brown: '棕色',
  CHOSEN: '指定颜色', CASTER: '自身的一种法力颜色', SKULL: '骷髅', ENEMY: '随机一名敌人的法力颜色',
  TRACKED_ENEMY: '该目标的法力颜色', LAST_TARGET: '该目标的法力颜色',
  ENEMY_MOST_USED: '敌方最常用的法力颜色', ALLY_MOST_USED: '我方最常用的法力颜色', CHOSEN_TARGET: '选定目标的法力颜色',
};
const BASE_COLORS = new Set<string>(['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown']);
const DROP_KINDS = { skull: '骷髅', doomSkull: '增强骷髅', uberDoomSkull: '高阶骷髅' };
/** Target-relative conditions filter each target of a multi-target segment. */
const TARGET_FILTERS = new Set(['targetRace', 'targetColor', 'targetStatus', 'targetHpDamaged', 'targetHasAnyStatus', 'targetKingdom']);
interface SourceText { text: string; unit?: string }

/** Original-game status words for skill text. Traits still read COMBAT_DESCRIPTION_TERMS. */
const SKILL_STATUSES: Record<string, string> = {
  poison: '中毒', burning: '燃烧', burn: '燃烧', bleed: '出血', bleeding: '出血', silence: '沉默',
  frozen: '冻结', freeze: '冻结', stun: '击晕', stunned: '击晕', entangle: '缠绕', entangled: '缠绕',
  web: '织网', webbed: '织网', disease: '疾病', diseased: '疾病', curse: '诅咒', cursed: '诅咒',
  'death-mark': '死亡标记', deathmark: '死亡标记', 'faerie-fire': '妖火', marked: '猎人标记',
  wolf: '狼化', 'wolf-form': '狼化', lycanthropy: '狼化', terror: '恐怖', barrier: '屏障', blessed: '赐福',
  enchanted: '附魔', enraged: '狂怒', rage: '狂怒', reflect: '反射', submerged: '下潜',
  charm: '魅惑', charmed: '魅惑', lethal: '致命防护',
};
const POSITIVE_STATUSES = new Set(['屏障', '赐福', '附魔', '狂怒', '反射', '下潜', '致命防护']);
/** Original-game special gem words; numbered entries stay generic because they name hidden identities. */
const SKILL_SPECIALS: Partial<Record<SpecialGemKind, string>> = {
  doomSkull: '末日骷髅头', uberDoomSkull: '超级末日骷髅头', bomb: '炸弹宝石', web: '织网宝石',
  lightningRow: '横向闪电宝石', lightningCol: '纵向闪电宝石', wildcard: '通配宝石', wish: '许愿宝石',
  hourglass: '沙漏宝石', bootyGem: '赃物宝石', ghost: '鬼魂宝石', burningGem: '燃烧宝石', freezeGem: '冻结宝石',
  curseGem: '诅咒宝石', bleedGem: '出血宝石', poisonGem: '中毒宝石', deathMarkGem: '死亡标记宝石', terrorGem: '恐怖宝石',
  entangleGem: '缠绕宝石', enrageGem: '狂怒宝石', submergeGem: '沉没宝石', faerieFireGem: '妖火宝石',
  stunGem: '击晕宝石', barrierGem: '屏障宝石', manaPotionGem: '法力药水', daemonicPortalGem: '召唤宝石',
  stoneBlock: '石块', lycanthropyGem: '狼人宝石', trapGem: '陷阱宝石', enchantedGem: '附魔宝石',
};
const STORM_NAMES: Partial<Record<string, string>> = {
  Red: '火风暴', Blue: '冰风暴', Green: '叶风暴', Yellow: '光风暴', Purple: '暗风暴', Brown: '尘风暴',
  skull: '骸骨风暴', doomSkull: '末日风暴', uberDoomSkull: '超级末日风暴',
};
const TIMES_WORDS: Partial<Record<string, string>> = { '2': '双倍', '3': '三倍', '4': '四倍', '5': '五倍' };

/** "a" / "a和b" / "a、b和c". */
function listWords(items: readonly string[]): string {
  return items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join('、')}和${items[items.length - 1]}`;
}
/** "，伤害因自身护甲而增强（1:1）"; several sources keep their own rates. */
function bonusClause(noun: string, parts: readonly string[]): string {
  const list = listWords(parts);
  const m = /^([^（]+)（([^）]+)）$/.exec(list);
  return m ? `，${noun}因${m[1]}而增强（${m[2]}）` : `，${noun}因${list}而增强`;
}
/** "自身"/"其" take no 的: "其攻击", "一名敌人的攻击". */
function possessive(target: string): string { return target === '自身' || target === '其' ? target : `${target}的`; }
/** "所有敌人" + "红色" → "所有红色敌人"; unchanged when the target has no 敌人/盟友 noun. */
function withFilter(target: string, adjective: string): string {
  if (!adjective) return target;
  const at = Math.max(target.lastIndexOf('敌人'), target.lastIndexOf('盟友'));
  return at < 0 ? target : target.slice(0, at) + adjective + target.slice(at);
}
const FIXED_SINGLE = new Set(['enemyFront', 'enemyLast', 'enemySecondLast', 'allyFront', 'allyLast']);
const PLURAL_TARGET = /所有|全部|\d+名|\d+位|及|两侧|这些/;
/** Negated condition clauses: "目标不处于「冻结」", "本次施放未击败任何目标". */
const NEGATIONS: readonly [RegExp, string][] = [
  [/^有(目标|敌人|盟友)身亡$/, '没有$1身亡'], [/存活$/, '身亡'], [/^献祭成功$/, '献祭失败'],
  [/带有状态效果$/, '没有状态效果'], [/已受伤$/, '未受伤'], [/法力已满$/, '法力未满'],
  [/^(敌方|我方|场上)有/, '$1没有'], [/^有/, '没有'],
  [/已?陷入/, '未陷入'], [/拥有/, '未拥有'], [/^目标为/, '目标不为'], [/为(.+)$/, '不为$1'], [/高于/, '不高于'],
  [/摧毁了至少/, '摧毁不足'], [/至少有/, '不足'], [/等级至少为/, '等级低于'], [/^战斗发生在/, '战斗未发生在'],
];
function negate(text: string): string {
  if (!/[或且]/.test(text)) for (const [pattern, replacement] of NEGATIONS) if (pattern.test(text)) return text.replace(pattern, replacement);
  return `不满足“${text}”`;
}
const SIDE_SOURCE = /^([^、和的]+|[^、和]+的)(盟友|敌人)$/;
/** Several counted sources as one phrase: "我方特定族群和另一特定族群的单位", "施放前选定行中的红色宝石和骷髅". */
function mergeSources(list: readonly SourceText[]): SourceText {
  if (list.length <= 1) return list[0] ?? { text: '0' };
  const units = new Set(list.map(s => s.unit));
  const unit = list.every(s => s.unit) ? (units.size === 1 ? list[0]!.unit : '个') : undefined;
  const done = (text: string, u = unit): SourceText => u ? { text, unit: u } : { text };
  const texts = list.map(s => s.text);
  const uniq = (v: string[]) => [...new Set(v)];
  // Unit counts on one or both sides: "特定族群和另一特定族群盟友", "燃烧单位".
  const sided = texts.map(t => SIDE_SOURCE.exec(t));
  if (sided.every(Boolean)) {
    const side = (name: string) => uniq(sided.filter(m => m![2] === name).map(m => m![1]!));
    const ally = side('盟友'), enemy = side('敌人');
    if (!ally.length || !enemy.length) return done(`${listWords(ally.length ? ally : enemy)}${ally.length ? '盟友' : '敌人'}`);
    if (ally.length === enemy.length && ally.every(v => enemy.includes(v))) return done(`${listWords(ally)}单位`);
    return done(`${listWords(ally)}盟友和${listWords(enemy)}敌人`);
  }
  // One owner's stats: "自身攻击、生命和护甲".
  const owner = /^(自身|目标)(攻击|护甲|生命|魔力|法力)$/;
  const owned = texts.map(t => owner.exec(t));
  if (owned.every(Boolean) && new Set(owned.map(m => m![1])).size === 1) return done(owned[0]![1] + listWords(owned.map(m => m![2]!)));
  // Shared lead-in such as "施放前选定行中的".
  let prefix = texts[0]!;
  for (const t of texts) while (!t.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = prefix.slice(0, prefix.lastIndexOf('的') + 1);
  if (prefix && texts.every(t => t.length > prefix.length)) return done(prefix + listWords(texts.map(t => t.slice(prefix.length))));
  // Mixed lists: merge the unit part, then enumerate.
  const part = list.filter(s => SIDE_SOURCE.test(s.text));
  if (part.length >= 2) return done([mergeSources(part).text, ...list.filter(s => !SIDE_SOURCE.test(s.text)).map(s => s.text)].join('、'));
  return done(listWords(texts));
}

/** No source catalogue, registry, RNG, DOM, locale state, or user narrative is consulted. */
class DescriptionWriter {
  readonly diagnostics: DescriptionDiagnostic[] = [];
  readonly nodes: DescribedAbilitySegment[] = [];
  /** Hidden identities are shown as "特定族群", "另一特定族群"… in order of first appearance. */
  private readonly identities = new Map<string, string>();
  /** Picked targets already named in this description. */
  mentioned = new Set<string>();
  /** Target mode of the previous clause, for "其". */
  lastPick: string | undefined;
  /** Segment paths whose status check runs before this cast's own status, but are shown last. */
  readonly checkedBefore = new Set<string>();
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
    // Never show a source identity; distinguish different hidden identities within one description.
    const key = `${category}:${String(value)}`;
    let label = this.identities.get(key);
    if (!label) {
      const index = [...this.identities.keys()].filter(k => k.startsWith(category + ':')).length;
      label = index === 0 ? `特定${category}` : index === 1 ? `另一特定${category}` : `第${index + 1}种特定${category}`;
      this.identities.set(key, label);
    }
    return label;
  }
  color(value: ColorSpec, path: string): string { return this.word(value, COLOR_WORDS, path); }
  /** "红色宝石", "骷髅", "指定颜色的宝石". */
  gems(value: ColorSpec, path: string): string {
    const word = this.color(value, path);
    const indirect: Partial<Record<ColorSpec, string>> = {
      CHOSEN: '指定颜色的宝石', CASTER: '自身颜色的宝石', ENEMY: '随机敌人颜色的宝石',
      TRACKED_ENEMY: '目标颜色的宝石', LAST_TARGET: '目标颜色的宝石', CHOSEN_TARGET: '目标颜色的宝石',
      ENEMY_MOST_USED: '敌方最常用颜色的宝石', ALLY_MOST_USED: '我方最常用颜色的宝石',
    };
    return value === 'SKULL' ? '骷髅头' : BASE_COLORS.has(value) ? `${word}宝石` : indirect[value] ?? `${word}的宝石`;
  }
  stat(value: string, path: string): string { return this.word(value, STATS, path); }
  status(value: string, path: string): string { return this.word(value, SKILL_STATUSES, path); }
  /** "使目标陷入燃烧" / "赐福目标" / "魅惑目标". */
  statusClause(target: string, name: string): string {
    const bare = name.replace(/^\d+层/, '');
    if (bare === '魅惑') return target === '其' ? '将其魅惑' : `魅惑${target}`;
    if (bare === '赐福' || bare === '附魔') return target === '其' ? `为其${name}` : `${name}${target}`;
    if (bare === '下潜') return `使${target}下潜`;
    return POSITIVE_STATUSES.has(bare) ? `使${target}获得${name}` : `使${target}陷入${name}`;
  }
  /** Condition wording for a status on someone: "陷入燃烧" / "拥有屏障". */
  hasStatus(name: string): string { return name === '下潜' ? '已下潜' : POSITIVE_STATUSES.has(name) ? `拥有${name}` : `陷入${name}`; }
  special(value: SpecialGemKind | SpecialGemSpec, path: string): string {
    // Unknown or numbered placeholder names read as a plain "特殊宝石".
    const name = (kind: SpecialGemKind, p: string) => { this.word(kind, SPECIALS, p); return SKILL_SPECIALS[kind] ?? '特殊宝石'; };
    if (typeof value === 'string') return name(value, path);
    this.audit(value, path, ['kind', 'tier', 'color']);
    return `${value.tier !== undefined ? `${this.num(value.tier, `${path}.tier`)}级` : ''}${value.color ? this.color(value.color, `${path}.color`) : ''}${name(value.kind, `${path}.kind`)}`;
  }
  scaling(s: ScalingSpec, path: string): string {
    this.audit(s, path, ['base', 'mult']);
    const base = this.num(s.base, `${path}.base`), mult = this.num(s.mult, `${path}.mult`);
    const formula = s.mult === 0 ? base : `${s.mult === 1 ? '' : mult + '×'}魔力${s.base === 0 ? '' : s.base < 0 ? base : '+' + base}`;
    // abilityDisplayText resolves this exact token with the caster's magic.
    return `max(0,round(${formula}))`;
  }
  interval(value: {min: number; max: number}, path: string): string {
    this.audit(value, path, ['min', 'max']);
    const min = this.num(value.min, `${path}.min`), max = this.num(value.max, `${path}.max`);
    return min === max ? min : `${min}～${max}`;
  }
  target(mode: TargetMode, path: string, n = '1'): string {
    const targets: Record<TargetMode, string> = {
      enemyFront: '第一位敌人', enemyRandom: '一名随机敌人', enemyRandomOther: '另一名随机敌人',
      enemyRandomPrefNotPrev: '另一名随机敌人', allyRandomPrefNotPrev: '另一名随机盟友',
      enemyRandomN: `${n}名随机敌人`, enemyWeakest: '生命最低的敌人', enemyWeakestN: `生命最低的${n}名敌人`,
      enemyHealthiest: '生命最高的敌人', enemyHealthiestN: `生命最高的${n}名敌人`, enemyFirstN: `前${n}位敌人`,
      enemyNth: `第${n}位敌人`, enemyLast: '最后一位敌人', enemySecondLast: '倒数第二位敌人', enemyLastN: `最后${n}位敌人`,
      enemyAllOther: '所有其他敌人', enemyAll: '所有敌人', enemyChosen: '一名敌人',
      enemyChosenAndNextDown: '一名敌人及其后方的敌人', enemyChosenAndBelow: '一名敌人及其后方所有敌人',
      enemyChosenAndAdjacent: '目标两侧的敌人', enemyAboveTarget: '目标前方所有敌人', enemyBelowTarget: '目标后方所有敌人',
      enemyNextDown: '目标后方的敌人', enemyNextUp: '目标前方的敌人',
      lastTarget: '其', lastTargets: '这些目标', lastTargetFirst: '其中第一位', lastTargetLast: '其中最后一位',
      lastDamaged: '受到伤害的目标', lastAlly: '其', allySelf: '自身', allyFront: '第一位盟友',
      allyRandom: '一名随机盟友', allyRandomN: `${n}名随机盟友`, allyRandomPrefNotPrevN: `${n}名随机盟友`,
      allyWeakest: '生命最低的盟友', allyLowestManaOther: '法力最低的其他盟友', allyHighestManaOther: '法力最高的其他盟友',
      allyWeakestN: `生命最低的${n}名盟友`, allyLowestHpOtherN: `生命最低的${n}名其他盟友`, allyHealthiest: '生命最高的盟友',
      allyHealthiestN: `生命最高的${n}名盟友`, allyFirstN: `前${n}位盟友`, allyNth: `第${n}位盟友`, allyOthers: '所有其他盟友',
      allySelfAndBelow: '自身及后方所有盟友', allyAboveSelf: '自身前方所有盟友', allyBelowSelf: '自身后方所有盟友', allyBelowTarget: '目标后方所有盟友',
      allyLastOther: '最后一位其他盟友', allyLast: '最后一位盟友', allyLastN: `最后${n}位盟友`, allyAll: '所有盟友',
      allyChosenOther: '另一名盟友', allyChosen: '一名盟友',
    };
    return this.word(mode, targets, path);
  }
  /** Conditions read as a clause after "若": 目标处于「冻结」, 场上有风暴 … */
  condition(c: Condition, path: string, depth = 0): string {
    if (depth >= this.maxDepth) return this.issue(path, 'depth-limit');
    const done = (text: string, ...keys: string[]) => { this.audit(c, path, ['kind', ...keys]); return text; };
    const color = () => this.color((c as {color: ColorSpec}).color, `${path}.color`);
    const status = () => this.status((c as {statusId: string}).statusId, `${path}.statusId`);
    const race = () => this.identity((c as {race: string}).race, '族群');
    switch (c.kind) {
      case 'not': return done(negate(this.condition(c.cond, `${path}.cond`, depth + 1)), 'cond');
      case 'anyOf': case 'allOf': {
        const parts = c.of.map((v, i) => this.condition(v, `${path}.of[${i}]`, depth + 1));
        const joiner = c.kind === 'anyOf' ? '或' : '且';
        // "目标为特定族群或另一特定族群": the shared subject is written once.
        const lead = /^(目标为|目标陷入|有敌人陷入)/.exec(parts[0] ?? '')?.[0];
        return done(lead && parts.every(p => p.startsWith(lead)) ? lead + parts.map(p => p.slice(lead.length)).join(joiner) : parts.join(joiner), 'of');
      }
      case 'targetRace': case 'chosenTargetRace': case 'lastTargetRace': return done(`目标为${race()}`, 'race');
      case 'targetColor': case 'chosenTargetColor': case 'lastTargetColor': return done(`目标为${color()}`, 'color');
      case 'targetStatus': case 'chosenTargetStatus': case 'lastTargetStatus': return done(`目标${this.hasStatus(status())}`, 'statusId');
      case 'lastTargetStatusAtCastStart': return done(`目标已${this.hasStatus(status())}`, 'statusId');
      case 'selfStatus': return done(`自身${this.hasStatus(status())}`, 'statusId');
      case 'anyEnemyStatus': case 'anyAllyStatus': return done(`有${c.kind === 'anyEnemyStatus' ? '敌人' : '盟友'}${this.hasStatus(status())}`, 'statusId');
      case 'targetHasAnyStatus': return done('目标带有状态效果');
      case 'targetHpDamaged': case 'chosenTargetDamaged': return done('目标已受伤');
      case 'selfHpDamaged': return done('自身已受伤');
      case 'boardAtLeast': return done(`棋盘上${c.n === 1 ? '有' : `至少有${this.num(c.n, `${path}.n`)}颗`}${c.special ? this.special(c.special, `${path}.special`) : c.color ? this.gems(c.color, `${path}.color`) : '宝石'}`, 'n', 'special', 'color');
      case 'castStartBoardAtLeast': return done(`棋盘上至少有${this.num(c.n, `${path}.n`)}颗${this.gems(c.color, `${path}.color`)}`, 'n', 'color');
      case 'destroyedColorAtLeast': return done(`摧毁了至少${this.num(c.n, `${path}.n`)}颗${this.gems(c.color, `${path}.color`)}`, 'n', 'color');
      case 'enemyRacePresent': case 'allyRacePresent': return done(`${c.kind === 'enemyRacePresent' ? '敌方' : '我方'}有${race()}`, 'race');
      case 'targetHasDoom': return done(`敌方有${this.identity('Doom', '族群')}`);
      case 'stormPresent': return done(`场上有${c.dropKind ? STORM_NAMES[c.dropKind] ?? this.word(c.dropKind, DROP_KINDS, `${path}.dropKind`) : c.color ? STORM_NAMES[c.color] ?? color() + '风暴' : '风暴'}`, 'color', 'dropKind');
      case 'troopPresent': return done(`${c.side === 'enemy' ? '敌方' : c.side === 'ally' ? '我方' : '场上'}有${this.identity(c.name, '单位')}`, 'side', 'name');
      case 'casterStatBeatsTarget': return done(`自身${this.stat(c.stat, `${path}.stat`)}高于目标`, 'stat');
      case 'targetStatBeatsCaster': case 'chosenTargetStatBeatsCaster': return done(`目标${this.stat(c.stat, `${path}.stat`)}高于自身`, 'stat');
      case 'anyEnemyColor': return done(`有${color()}敌人`, 'color');
      case 'firstLastEnemyColor': return done(`第一位或最后一位敌人为${color()}`, 'color');
      case 'regionPresent': return done(`战斗发生在${this.identity(c.region, '区域')}`, 'region');
      case 'kingdomPresent': return done(`战斗发生在${this.identity(c.kingdom, '区域')}`, 'kingdom');
      case 'kingdomOf': return done(`${this.word(c.side, {ally: '我方', enemy: '敌方'}, `${path}.side`)}有来自${this.identity(c.kingdom, '区域')}的单位`, 'side', 'kingdom');
      case 'targetKingdom': return done(`目标来自${this.identity(c.kingdom, '区域')}`, 'kingdom');
      case 'ascended': return done(`战斗晋升等级至少为${this.num(c.min, `${path}.min`)}`, 'min');
      case 'manaFull': return done(`${c.of === 'caster' ? '自身' : '目标'}法力已满`, 'of');
      case 'lastTargetSurvived': return done('目标存活');
      case 'anyTrackedDied': return done('有目标身亡');
      case 'castEnemyDied': return done('有敌人身亡');
      case 'castSacrificed': return done('献祭成功');
      case 'economyAtLeast': return done(`${this.word(c.currency, CURRENCIES, `${path}.currency`)}至少有${this.num(c.n, `${path}.n`)}`, 'currency', 'n');
      default: return this.issue(`${path}.kind`, 'unsupported-value', '条件类型尚未解析');
    }
  }
  /** What a modifier counts; `unit` is set for countable things ("颗", "名"), absent for amounts. */
  source(s: ModifierSource, path: string): SourceText {
    const done = (text: string, unit: string | undefined, ...keys: string[]): SourceText => { this.audit(s, path, ['kind', ...keys]); return unit ? { text, unit } : { text }; };
    const stat = () => this.stat((s as {stat: string}).stat, `${path}.stat`);
    const gem = (v: {color?: ColorSpec; skulls?: boolean}) => v.skulls ? '骷髅头' : v.color ? this.gems(v.color, `${path}.color`) : '宝石';
    const sideWord = (ally: boolean) => ally ? '盟友' : '敌人';
    switch (s.kind) {
      case 'chosenColumnAtCastStart': case 'chosenRowAtCastStart': return done(`该${s.kind === 'chosenColumnAtCastStart' ? '列' : '行'}的${gem(s)}`, '颗', 'color', 'skulls');
      case 'destroyedGems': return done(`被摧毁的${s.special ? (s.specialTier === undefined ? '' : `${s.specialTier}级`) + this.special(s.special, `${path}.special`) : gem(s)}`, '颗', 'color', 'skulls', 'special', 'specialTier');
      case 'countedAdjacentSpecial': return done('相邻的特殊宝石', '颗');
      case 'diagonalGems': return done(`对角线上的${gem(s)}`, '颗', 'color', 'anchor');
      case 'transformedGems': return done(`被转化的${s.color ? this.gems(s.color, `${path}.color`) : '宝石'}`, '颗', 'color');
      case 'boardGems': return done(`${s.except ? `${this.gems(s.except, `${path}.except`)}以外的` : ''}${s.color ? this.gems(s.color, `${path}.color`) : '宝石'}`, '颗', 'color', 'except');
      case 'boardSkulls': case 'castStartBoardSkulls': return done('骷髅头', '颗');
      case 'castStartBoardGems': return done(this.gems(s.color, `${path}.color`), '颗', 'color');
      case 'boardSpecial': return done(this.special({kind: s.gem, color: s.color, tier: s.tier}, path + '.spec'), '颗', 'gem', 'color', 'tier');
      case 'selfStat': return done(`自身${stat()}`, undefined, 'stat');
      case 'allyFrontStat': return done(`第一位盟友的${stat()}`, undefined, 'stat');
      case 'targetStat': case 'chosenStat': return done(`目标${stat()}`, undefined, 'stat');
      case 'randomAllyStat': return done(`随机盟友的${stat()}`, undefined, 'stat');
      case 'teamSize': return done(`${this.word(s.side, {ally: '我方', enemy: '敌方'}, `${path}.side`)}单位`, '名', 'side', 'atCastStart');
      case 'alliesOfRace': case 'enemiesOfRace': return done(`${this.identity(s.race, '族群')}${sideWord(s.kind === 'alliesOfRace')}`, '名', 'race', 'atCastStart');
      case 'alliesOfKingdom': case 'enemiesOfKingdom': return done(`${this.identity(s.kingdom, '区域')}${sideWord(s.kind === 'alliesOfKingdom')}`, '名', 'kingdom', 'atCastStart');
      case 'alliesNamed': return done((Array.isArray(s.name) ? s.name : [s.name]).map(n => this.identity(n, '单位')).join('、'), '名', 'name', 'atCastStart');
      case 'alliesOfColor': case 'enemiesOfColor': return done(`${this.color(s.color, `${path}.color`)}${sideWord(s.kind === 'alliesOfColor')}`, '名', 'color', 'atCastStart');
      case 'enemyStatusCount': return done(s.statusId ? `${this.status(s.statusId, `${path}.statusId`)}敌人` : '带有状态效果的敌人', '名', 'statusId', 'atCastStart');
      case 'allyStatusCount': return done(`${this.status(s.statusId, `${path}.statusId`)}${s.excludeSelf ? '的其他' : ''}盟友`, '名', 'statusId', 'excludeSelf');
      case 'targetStatusCount': return done(`目标身上的${listWords(s.statusIds.map((v, i) => this.status(v, `${path}.statusIds[${i}]`)))}`, '种', 'statusIds');
      case 'enemyStatSum': return done(`${s.color ? this.color(s.color, `${path}.color`) : '所有'}敌人的${stat()}总和`, undefined, 'stat', 'color');
      case 'allyStatSum': return done(`${s.excludeSelf ? '其他' : '所有'}盟友的${stat()}总和`, undefined, 'stat', 'excludeSelf');
      case 'enemyFull': return done(`${[s.hp ? '生命已满' : '', s.mana ? '法力已满' : ''].filter(Boolean).join('且') || '存活'}的敌人`, '名', 'hp', 'mana');
      case 'sacrificedStat': return done(`被献祭者的${stat()}`, undefined, 'stat');
      case 'surroundingGems': return done(`周围的${gem(s)}`, '颗', 'color', 'anchor');
      case 'chosenCellBlockGems': return done(`选定格周围的${gem(s)}`, '颗', 'color', 'skulls');
      default: {
        const words: Partial<Record<ModifierSource['kind'], [string, string?]>> = {
          lastDamage: ['造成的伤害'], casterStatBeatsCount: ['自身高于目标的属性', '项'], drainedMana: ['吸取的法力'],
          countEnemyDeaths: ['身亡的敌人', '名'], countAllyDeaths: ['身亡的盟友', '名'], battleMaps: ['藏宝图', '张'],
          lastReduce: ['减少的数值'], battleGold: ['金币', '枚'], enemyGold: ['敌方金币', '枚'], bothGold: ['双方金币', '枚'],
          battleSouls: ['灵魂', '个'], battleGems: ['宝石货币', '个'], tempering: ['武器淬炼等级', '级'], goldStolen: ['偷取的金币', '枚'], goldSpent: ['消耗的金币', '枚'],
        };
        const entry = Object.prototype.hasOwnProperty.call(words, s.kind) ? words[s.kind as keyof typeof words] : undefined;
        if (!entry) return { text: this.issue(`${path}.kind`, 'unsupported-value') };
        return done(entry[0], entry[1]);
      }
    }
  }
  /** What is counted, in game words: "红色宝石数", "特定族群盟友数", "自身护甲". */
  private countWord(src: SourceText): string {
    if (!src.unit) return src.text;
    return src.unit === '级' ? src.text : src.unit === '项' || src.unit === '种' ? `${src.text}${src.unit}数` : `${src.text}数`;
  }
  /** Bonus source with its rate, read after "因": "红色宝石数（每颗+1）", "自身护甲（1:1）". */
  modifier(m: ModifierSpec, path: string): string {
    this.audit(m, path, ['mod', 'source', 'sources', 'sourceGroups', 'max', 'pooled']);
    this.audit(m.mod, path + '.mod', ['kind', 'a', 'b']);
    if (m.max !== undefined) this.num(m.max, path + '.max');
    const a = this.num(m.mod.a, path + '.mod.a');
    const phrase = (src: SourceText): string => {
      const what = this.countWord(src);
      if (m.mod.kind === 'multiplier') return src.unit ? `${what}（每${src.unit}+${a}）` : `${what}（${m.mod.a === 1 ? '1:1' : a + '倍'}）`;
      if (m.mod.kind !== 'ratio') return this.issue(path + '.mod.kind', 'unsupported-value');
      const per = Math.max(1, Math.floor(m.mod.a)), b = Math.max(0, Math.floor(m.mod.b ?? 0));
      this.num(b, path + '.mod.b');
      const pct = 100 * b / per;
      if (!src.unit) return `${what}（${pct === 100 ? '1:1' : `${Number.isInteger(pct) ? pct : Math.round(pct)}%`}）`;
      return `${what}（每${per === 1 ? '' : per}${src.unit}+${b}）`;
    };
    const merge = (list: SourceText[]): SourceText => mergeSources(list);
    const sources = m.sources?.map((s, i) => this.source(s, `${path}.sources[${i}]`));
    const groups = m.sourceGroups?.map((g, i) => merge(g.map((s, j) => this.source(s, `${path}.sourceGroups[${i}][${j}]`))));
    const separate = groups ?? (sources && m.mod.kind === 'ratio' && !m.pooled ? sources : undefined);
    // "每颗+1" terms over counted sources add up the same way when merged.
    const linear = m.mod.kind === 'multiplier' || Math.max(1, Math.floor(m.mod.a)) === 1;
    const sameUnit = !!separate && separate.length > 1 && separate.every(s => s.unit && s.unit === separate[0]!.unit);
    // Separately rounded terms with one rate still read as one phrase: "红色宝石和蓝色宝石数（每3颗+1）".
    const parts = separate ? (separate.length > 1 && (linear || sameUnit) && separate.every(s => s.unit) ? [phrase(merge(separate))] : separate.map(phrase))
      : [phrase(sources ? merge(sources) : m.source ? this.source(m.source, path + '.source') : { text: '0' })];
    // Caps are left out on purpose: players read the rate, not the ceiling.
    return listWords(parts) || '无加成';
  }
  /** A modifier as the whole amount (base 0): "本次摧毁的紫色宝石数量×4", "自身攻击+使用棕色法力的敌人数量×10". */
  amount(m: ModifierSpec, path: string): {expr: string; max?: string} {
    this.audit(m, path, ['mod', 'source', 'sources', 'sourceGroups', 'max', 'pooled']);
    this.audit(m.mod, path + '.mod', ['kind', 'a', 'b']);
    if (m.mod.kind !== 'multiplier' && m.mod.kind !== 'ratio') return { expr: this.issue(path + '.mod.kind', 'unsupported-value') };
    const ratio = m.mod.kind === 'ratio';
    const per = ratio ? Math.max(1, Math.floor(m.mod.a)) : 1;
    const times = this.num(ratio ? Math.max(0, Math.floor(m.mod.b ?? 0)) : m.mod.a, path + (ratio ? '.mod.b' : '.mod.a'));
    const sources = m.sources?.map((s, i) => this.source(s, `${path}.sources[${i}]`));
    const groups = m.sourceGroups?.map((g, i) => mergeSources(g.map((s, j) => this.source(s, `${path}.sourceGroups[${i}][${j}]`))));
    let list = groups ?? sources ?? (m.source ? [this.source(m.source, path + '.source')] : []);
    // Same merging rule as modifier(): sums share one count when rounding cannot differ.
    if (list.length > 1 && (sources && (!ratio || m.pooled) || per === 1 && list.every(s => s.unit))) list = [mergeSources(list)];
    const term = (src: SourceText): string => {
      const base = this.countWord(src);
      if (per === 1) return times === '1' ? base : `${base}×${times}`;
      const pct = 100 * Number(times) / per;
      if (!src.unit) return `${base}的${Number.isInteger(pct) ? pct : Math.round(pct)}%`;
      return `${base}${times === '1' ? '' : '×' + times}÷${per}`;
    };
    const expr = list.map(term).join('+') || '0';
    return m.max === undefined ? { expr } : { expr, max: this.num(m.max, path + '.max') };
  }
  /** amount() without the cap: "被摧毁的紫色宝石数×4". */
  amountText(m: ModifierSpec, path: string): string { return this.amount(m, path).expr; }
  /** Chance driven by a bonus: "有N%（N等于蓝色宝石数×7）几率", or "N等于10+…" with a base. */
  chanceAmount(m: ModifierSpec, path: string, base = 0): string {
    const a = this.amount(m, path);
    return `有N%（N等于${base ? `${Number((base * 100).toPrecision(12))}+` : ''}${a.expr}）几率`;
  }
  createGem(g: CreateGemSpec, path: string): string {
    const done = (text: string, ...keys: string[]) => { this.audit(g, path, ['kind', ...keys]); return text; };
    switch (g.kind) {
      case 'color': return done(this.gems(g.color, path + '.color'), 'color');
      case 'skull': return done('骷髅头');
      case 'special': return done(this.special(g.spec, path + '.spec'), 'spec');
      case 'mix': {
        const words = g.colors.map((c, i) => this.color(c, `${path}.colors[${i}]`));
        const colors = words.filter((_, i) => g.colors[i] !== 'SKULL');
        return done(`${colors.length ? listWords(colors) + '宝石' : ''}${colors.length < words.length ? (colors.length ? '和' : '') + '骷髅头' : ''}`, 'colors');
      }
      case 'mixSpecial': {
        const names = g.specs.map((s, i) => this.special(s, `${path}.specs[${i}]`));
        if (g.minimumEach !== undefined) this.num(g.minimumEach, path + '.minimumEach');
        // Same gem at several tiers: "1或2级特殊宝石".
        const plain = names.map(n => n.replace(/^\d+级/, ''));
        const tiers = names.map(n => /^(\d+)级/.exec(n)?.[1]);
        if (new Set(plain).size === 1 && tiers.every(Boolean)) return done(`${tiers.join('或')}级${plain[0]}`, 'specs', 'minimumEach');
        if (new Set(names).size === 1) return done(names[0]!, 'specs', 'minimumEach');
        // "红色和蓝色法力药水" when only the colour differs.
        const colorless = names.map(n => n.replace(/^(红色|蓝色|绿色|黄色|紫色|棕色)/, ''));
        const colored = names.every((n, i) => n !== colorless[i]) && new Set(colorless).size === 1;
        return done(colored ? `${listWords(names.map((n, i) => n.slice(0, n.length - colorless[i]!.length)))}${colorless[0]}` : listWords(names), 'specs', 'minimumEach');
      }
      case 'mixAny': return done(listWords(g.entries.map((v, i) => typeof v === 'string' ? (v === 'SKULL' ? '骷髅头' : this.color(v, `${path}.entries[${i}]`) + '宝石') : this.special(v, `${path}.entries[${i}]`))), 'entries');
      default: return this.issue(path + '.kind', 'unsupported-value');
    }
  }
  cell(value: {row: number; col: number} | 'CELL' | 'RANDOM' | undefined, path: string): string {
    if (!value) return '棋盘中心';
    if (value === 'CELL') return '选定格';
    if (value === 'RANDOM') return '随机一格';
    this.audit(value, path, ['row', 'col']);
    return `第${value.row + 1}行第${value.col + 1}列`;
  }
  /** The object of 摧毁/爆破/移除. `title` drops counts for the short ability name. */
  clearTarget(t: ClearTarget, path: string, title = false): string {
    const done = (text: string, ...keys: string[]) => { this.audit(t, path, ['kind', ...keys]); return text; };
    const orientation = (o: string) => this.word(o, {row: '行', col: '列'}, path + '.orientation');
    switch (t.kind) {
      case 'lines': return done([t.rows ? `第${t.rows.map(n => n + 1).join('、')}行` : '', t.cols ? `第${t.cols.map(n => n + 1).join('、')}列` : ''].filter(Boolean).join('及'), 'rows', 'cols');
      case 'chosenLine': return done(`一${orientation(t.orientation)}`, 'orientation');
      case 'randomLines': return done(`随机${title ? '' : this.scaling(t.count, path + '.count')}${orientation(t.orientation)}`, 'orientation', 'count');
      case 'color': return done(`所有${this.gems(t.color, path + '.color')}`, 'color');
      case 'allColors': return done('所有宝石');
      case 'skulls': return done('所有骷髅头');
      case 'allGems': return done('棋盘上所有宝石');
      case 'special': return done(`所有${this.special({kind: t.gem, tier: t.tier}, path + '.spec')}`, 'gem', 'tier');
      case 'randomGems': {
        const what = t.special ? this.special({kind: t.special, tier: t.specialTier}, path + '.spec')
          : t.colors ? t.colors.map((c, i) => this.color(c, `${path}.colors[${i}]`)).join('或') + '宝石'
          : t.color ? this.gems(t.color, path + '.color')
          : this.word(t.include ?? 'color', {color: '宝石', all: '宝石', skull: '骷髅头', nonSkull: '宝石'}, path + '.include');
        return done(`${title ? '' : (t.countRange ? this.interval(t.countRange, path + '.countRange') : this.scaling(t.count, path + '.count')) + '颗'}${what}`, 'countRange', 'count', 'special', 'specialTier', 'color', 'colors', 'include');
      }
      case 'cell': return done(this.cell(t.cell, path + '.cell'), 'cell');
      case 'area': return done(`${this.cell(t.center, path + '.center')}的${this.word(t.shape, {square5: '5×5范围', square3: '3×3范围', cross3: '十字范围', x: '两条对角线', circle5: '圆形范围', row3: '横向三格'}, path + '.shape')}`, 'shape', 'center');
      case 'chosenCross': return done('选定格所在的行和列');
      case 'lastDestroyedLine': return done(`上次摧毁的${orientation(t.orientation)}`, 'orientation');
      default: return this.issue(path + '.kind', 'unsupported-value');
    }
  }
  gem(p: GemParams, path: string): string {
    switch (p.op) {
      case 'create': {
        this.audit(p, path, ['op', 'gem', 'count', 'countRange', 'modifier']);
        const scaling = this.scaling(p.count, path + '.count');
        const count = p.countRange ? this.interval(p.countRange, path + '.countRange') : scaling;
        const whole = !p.countRange && p.count.base === 0 && p.count.mult === 0 && p.modifier ? this.amountText(p.modifier, path + '.modifier') : undefined;
        if (whole) return `创造${this.createGem(p.gem, path + '.gem')}，数量等于${whole}`;
        const made = `创造${count}颗${this.createGem(p.gem, path + '.gem')}`;
        return p.modifier ? made + bonusClause('数量', [this.modifier(p.modifier, path + '.modifier')]) : made;
      }
      case 'transform': {
        this.audit(p, path, ['op', 'from', 'to', 'toSpecial', 'spiritColorFromSource', 'fromSpecial', 'diagonal', 'diagonalAnchor', 'tiers', 'count', 'countModifier']);
        const from = p.fromSpecial ? this.special(p.fromSpecial, path + '.fromSpecial') : p.from === 'ANY' || p.from === undefined ? '宝石' : p.from === 'CELL' ? '选定格的宝石' : this.gems(p.from, path + '.from');
        // `to` is also meaningful with special gems (colour is inferred by the engine).
        const toColor = this.color(p.to, path + '.to');
        // Tier before colour: "2级红色特殊宝石".
        const spec = p.toSpecial && typeof p.toSpecial === 'object' ? p.toSpecial : p.toSpecial ? {kind: p.toSpecial} : undefined;
        const tier = spec && 'tier' in spec && spec.tier !== undefined ? `${this.num(spec.tier, path + '.toSpecial.tier')}级` : '';
        const to = p.toSpecial ? tier + (p.to === 'SKULL' || !BASE_COLORS.has(p.to) ? '' : toColor) + this.special(p.toSpecial, path + '.toSpecial').replace(/^\d+级/, '') : this.gems(p.to, path + '.to');
        const where = p.diagonal ? `${p.diagonalAnchor === 'chosenCell' ? '选定格' : '棋盘中央'}${this.word(p.diagonal, {left: '左斜', right: '右斜'}, path + '.diagonal')}对角线上的` : '';
        const amount = p.count ? `${this.scaling(p.count, path + '.count')}颗` : p.from === 'CELL' || where ? '' : '所有';
        p.tiers?.forEach((n, i) => this.num(n, `${path}.tiers[${i}]`));
        const extra = p.countModifier ? bonusClause('数量', [this.modifier(p.countModifier, path + '.countModifier')]) : '';
        return `将${where}${amount}${from}转化为${to}${extra}`;
      }
      case 'clear': {
        this.audit(p, path, ['op', 'mode', 'target', 'modifier', 'countAdjacentSpecial']);
        const mode = this.word(p.mode, {destroy: '摧毁', explode: '爆破', remove: '移除'}, path + '.mode');
        const t = p.target;
        const whole = t.kind === 'randomGems' && !t.countRange && t.count.base === 0 && t.count.mult === 0 && !p.countAdjacentSpecial && p.modifier ? this.amountText(p.modifier, path + '.modifier') : undefined;
        if (whole) return `${mode}${this.clearTarget(t, path + '.target').replace(/max\(0,round\(0\)\)颗/, '')}，数量等于${whole}`;
        if (p.countAdjacentSpecial) this.special(p.countAdjacentSpecial, path + '.countAdjacentSpecial');
        return `${mode}${this.clearTarget(p.target, path + '.target')}${p.modifier ? bonusClause('数量', [this.modifier(p.modifier, path + '.modifier')]) : ''}`;
      }
      default: return this.issue(path + '.op', 'unsupported-value');
    }
  }
  summon(p: SummonParams, path: string): string {
    this.audit(p, path, ['source', 'countRange', 'position', 'resolveRef', 'troopId']);
    const s = p.source;
    // Summoned units are visible on the field; their hidden source identity is not shown.
    let unit = '随从';
    if ('ref' in s) this.audit(s, path + '.source', ['ref', 'troopId']);
    else if ('randomOf' in s) { this.audit(s, path + '.source', ['randomOf', 'troopId']); unit = s.randomOf.length > 1 ? '随机随从' : '随从'; }
    else if ('randomOfKingdom' in s) { this.audit(s, path + '.source', ['randomOfKingdom', 'troopId']); unit = '随机随从'; }
    else {
      this.audit(s, path + '.source', ['template', 'troopId']);
      unit = `随从${this.issue(path + '.source.template', 'unresolved-template', '内嵌召唤模板的属性与被动尚未逐项描述')}`;
    }
    if (p.resolveRef) this.issue(path + '.resolveRef', 'unresolved-template', '自定义召唤解析函数的内容尚未解析');
    const count = p.countRange ? this.interval(p.countRange, path + '.countRange') : '1';
    return `召唤${count}名${unit}${this.word(p.position ?? 'back', {front: '到首位', back: ''}, path + '.position')}`;
  }
  /** "自身攻击" / "其攻击" / "一名敌人的攻击". */
  private owner(target: string, stat: string): string { return `${possessive(target)}${stat}`; }
  segment(s: EffectSegment, path: string, depth = 0): DescribedAbilitySegment {
    const before = this.diagnostics.length;
    let name = Object.prototype.hasOwnProperty.call(NAMES, s.kind) ? NAMES[s.kind] : '未解析技能段';
    let text = '', branches: DescribedAbilitySegment[][] | undefined;
    const at = (key: string) => `${path}.${key}`;
    const num = (v: number, key: string) => this.num(v, at(key));
    const chance = (v: number, key: string) => this.percent(v, at(key));
    let picked: string | undefined;
    const selected = () => picked ??= pick();
    const pick = () => {
      if (!('target' in s)) return '';
      const n = 'n' in s && s.n !== undefined ? num(s.n, 'n') : '1';
      const range = 'nRange' in s && s.nRange ? this.interval(s.nRange, at('nRange')) : undefined;
      // "所有来自特定区域的特定族群盟友".
      const filters = [
        'targetKingdom' in s && s.targetKingdom !== undefined ? `来自${this.identity(s.targetKingdom, '区域')}的` : '',
        'targetRace' in s && s.targetRace ? this.identity(s.targetRace, '族群') : '',
      ].filter(Boolean);
      // After the first mention, the picked unit is "该目标"/"该盟友" ("对一名敌人…；使该目标陷入燃烧").
      // "其" only right after a clause on the same unit; otherwise "该目标"/"该盟友".
      const previous = this.lastPick;
      if (!['lastTarget', 'lastAlly'].includes(s.target)) this.lastPick = s.target;
      const repeat = ({enemyChosen: '该目标', allyChosen: '该盟友', allyChosenOther: '该盟友'} as Partial<Record<string, string>>)[s.target];
      if (repeat && !filters.length && this.mentioned.has(s.target)) return previous === s.target ? '其' : repeat;
      if (repeat) this.mentioned.add(s.target);
      // Fixed positions named twice in a row: "对第一位敌人造成伤害；使其陷入猎人标记".
      if (!filters.length && previous === s.target && FIXED_SINGLE.has(s.target)) return '其';
      return withFilter(this.target(s.target, at('target'), range ?? n), filters.join(''));
    };
    const notes: string[] = [];
    /** Set when the amount is a phrase ("自身攻击") rather than a number. */
    let whole: string | undefined;
    const value = () => {
      if (!('scaling' in s)) return '';
      let result = this.scaling(s.scaling, at('scaling'));
      if ('rangeSpec' in s && s.rangeSpec) {
        this.audit(s.rangeSpec, at('rangeSpec'), ['min', 'max']);
        const min = this.scaling(s.rangeSpec.min, at('rangeSpec.min')), max = this.scaling(s.rangeSpec.max, at('rangeSpec.max'));
        result = min === max ? min : `${min}～${max}`;
      }
      const mods = [...('modifier' in s && s.modifier ? [[s.modifier, 'modifier'] as const] : []), ...('modifiers' in s && s.modifiers ? s.modifiers.map((m, i) => [m, `modifiers[${i}]`] as const) : [])];
      // A zero base with a single bonus reads as the bonus itself: "增加同等数值" instead of "增加0（另加…）".
      const zero = s.scaling.base === 0 && s.scaling.mult === 0 && !('rangeSpec' in s && s.rangeSpec) && mods.length > 0 && ['buff', 'reduce', 'randomStat', 'damage', 'gainEconomy'].includes(s.kind);
      if (zero) {
        whole = mods.map(([m, key]) => this.amountText(m, at(key))).join('+');
        return whole === '减少的数值' ? '等量数值' : whole;
      }
      mods.forEach(([m, key]) => notes.push(this.modifier(m, at(key))));
      return result;
    };
    /** Bonus as a game-style clause: "，伤害因红色宝石数而增强（每颗+1）". */
    const bonus = () => notes.length ? bonusClause(s.kind === 'damage' ? '伤害' : ['gainEconomy', 'stealGold', 'spendEconomy'].includes(s.kind) ? '数量' : '数值', notes.splice(0)) : '';
    const times = (n: string) => TIMES_WORDS[n] ? `造成${TIMES_WORDS[n]}伤害` : `伤害×${n}`;
    /** Same-effect amount changes: "，若目标燃烧则造成双倍伤害". Battlefield-location bonuses are left out. */
    const conditionalAmount = () => {
      const noun = s.kind === 'damage' ? '伤害' : '数值';
      const mult = (n: string) => s.kind === 'damage' ? times(n) : `${noun}${n === '2' ? '翻倍' : '×' + n}`;
      const parts: string[] = [];
      const local = (c: string) => !c.includes('战斗发生在');
      if ('condBonus' in s && s.condBonus) {
        this.audit(s.condBonus, at('condBonus'), ['n', 'cond']);
        const c = this.condition(s.condBonus.cond, at('condBonus.cond')), n = num(s.condBonus.n, 'condBonus.n');
        if (local(c)) parts.push(`若${c}则${noun}+${n}`);
      }
      if ('raceDouble' in s && s.raceDouble) {
        const n = num(s.raceTimes ?? 2, 'raceTimes'), race = this.identity(s.raceDouble, '族群');
        parts.push(s.kind === 'damage' ? `对${race}目标${times(n)}` : `若目标为${race}则效果${n === '2' ? '翻倍' : '×' + n}`);
      }
      if ('condMult' in s && s.condMult) {
        this.audit(s.condMult, at('condMult'), ['cond', 'times']);
        const c = this.condition(s.condMult.cond, at('condMult.cond')), n = num(s.condMult.times, 'condMult.times');
        if (local(c)) parts.push(`若${c}则${mult(n)}`);
      }
      return parts.length ? '，' + parts.join('，') : '';
    };
    let prefix = '';
    if (depth >= this.maxDepth) text = this.issue(path, 'depth-limit', '分支嵌套超过描述深度上限');
    else if (!Object.prototype.hasOwnProperty.call(FIELDS, s.kind)) text = this.issue(at('kind'), 'unsupported-segment', '效果段类型尚未解析');
    else {
      this.audit(s, path, s.kind === 'choose' ? ['kind', ...FIELDS.choose] : [...COMMON, ...FIELDS[s.kind]]);
      switch (s.kind) {
        case 'damage': {
          const amount = value(), t = selected();
          const splash = s.range === 'splash' || s.splashRatio !== undefined;
          const kind = `${s.trueDamage || s.drain ? '真实' : ''}${splash ? '溅射' : s.range === 'scatter' || s.splitRandom ? '散射' : ''}`;
          const points = whole ? `等同于${amount}的` : `${amount}点`;
          if (s.splashRatio !== undefined) chance(s.splashRatio, 'splashRatio');
          s.splashChances?.forEach((v, i) => chance(v, `splashChances[${i}]`));
          if (s.range !== undefined) this.word(s.range, {single: '', all: '', splash: '', scatter: ''}, at('range'));
          if (s.execute) text = t === '其' ? '将其击杀' : `击杀${t}`;
          else if (s.split !== undefined) text = `对前${num(s.split, 'split')}位敌人平分${points}${kind}伤害`;
          else if (s.splitRandom || s.range === 'scatter' && t === '所有敌人') text = `造成${points}${kind}伤害`;
          else text = `对${t}造成${points}${kind}伤害`;
          text += bonus();
          if (s.randomWaves !== undefined) text += `，共${num(s.randomWaves, 'randomWaves')}次`;
          if (s.manaBurn) text += '，并附加等同于目标法力的伤害';
          if (s.drain) text += '，并恢复等量生命';
          text += conditionalAmount();
          break;
        }
        case 'buff': {
          const amount = value(), stat = this.stat(s.stat, at('stat')), t = selected();
          if (s.lifeMode) this.word(s.lifeMode, {gain: '', heal: ''}, at('lifeMode'));
          if (s.stat === 'mana' && (s.halve || s.fraction !== undefined)) text = `为${t}补充${chance(s.halve ? 0.5 : s.fraction!, 'fraction')}法力`;
          else if (s.double) text = `使${this.owner(t, stat)}翻倍`;
          else if (s.full && s.stat === 'hp') text = t === '其' ? '使其生命回满' : `完全治疗${t}`;
          else if (s.stat === 'hp' && s.lifeMode === 'gain') text = `使${this.owner(t, '生命')}增加${amount}${bonus()}`;
          else if (s.stat === 'hp') text = `为${t}恢复${whole ? `等同于${amount}的` : amount + '点'}生命${bonus()}`;
          else if (s.stat === 'mana' && whole === '自身法力上限') text = `使${this.owner(t, '法力')}回满`;
          else text = `使${this.owner(t, stat)}增加${amount}${bonus()}`;
          text += conditionalAmount();
          break;
        }
        case 'reduce': {
          const amount = value(), t = selected();
          const stat = s.stat === 'random' ? '随机属性' : this.stat(s.stat, at('stat'));
          const ratio = s.gainRatio ?? 1;
          if (s.gainStat) { num(ratio, 'gainRatio'); if (s.gainLifeMode) this.word(s.gainLifeMode, {gain: '', heal: ''}, at('gainLifeMode')); }
          const gained = s.gainStat ? (s.stat === 'random' ? stat : this.stat(s.gainStat, at('gainStat'))) : '';
          // Same stat taken at 1:1 is the game's "窃取".
          const steal = s.gainStat && ratio === 1 && (s.stat === 'random' || s.gainStat === s.stat) && !s.drainAll && !s.halve && s.fraction === undefined;
          if (steal) text = `窃取${t}${whole ? `等同于${amount}的` : amount + '点'}${s.stat === 'random' ? '随机属性' : stat}${bonus()}`;
          else if (s.drainAll) text = `清空${this.owner(t, stat)}`;
          else if (s.halve) text = `使${this.owner(t, stat)}减半`;
          else if (s.fraction !== undefined) text = `使${this.owner(t, stat)}减少${chance(s.fraction, 'fraction')}`;
          else text = `使${this.owner(t, stat)}减少${amount}${bonus()}`;
          notes.length = 0;
          if (s.times !== undefined) { num(s.times, 'times'); if (s.stat === 'random' && s.times > 1) text += `，共${s.times}次`; }
          if (s.gainStat && !steal) text += `，自身获得${ratio === 1 ? '等量' : `其中${chance(ratio, 'gainRatio')}的`}${gained}`;
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
        case 'randomStat': {
          const amount = value(), t = selected();
          text = s.oneSkill
            ? `使${this.owner(t, '随机属性')}增加${amount}${bonus()}`
            : `为${t}随机分配${amount}点属性${bonus()}`;
          text += conditionalAmount();
          break;
        }
        case 'status': {
          const name2 = this.status(s.statusId, at('statusId'));
          // Turns, strength and stacking rules are engine detail; only non-default durations and stacks show.
          if (s.magnitude !== undefined) num(s.magnitude, 'magnitude');
          const turns = num(s.turns, 'turns');
          const label = `${s.stacks !== undefined && s.stacks > 1 ? `${num(s.stacks, 'stacks')}层` : ''}${name2}`;
          const lasting = turns === '3' ? '' : `，持续${turns}回合`;
          text = this.statusClause(selected(), label) + lasting;
          if (s.perDestroyed) this.audit(s.perDestroyed, at('perDestroyed'), ['color']);
          if (s.perCount || s.perDestroyed) {
            const destroyed = s.perDestroyed ? `被摧毁的${s.perDestroyed.color === 'skull' ? '骷髅头' : s.perDestroyed.color ? this.gems(s.perDestroyed.color, at('perDestroyed.color')) : '宝石'}数` : '';
            const count = s.perCount ? this.amountText(s.perCount, at('perCount')) : destroyed;
            const pool = selected().includes('盟友') ? '盟友' : '敌人';
            text = `${this.statusClause(`随机${pool}`, label)}${lasting}，人数等于${count}`;
          }
          break;
        }
        case 'cleanse': text = selected() === '其' ? '将其净化' : `净化${selected()}`; break;
        case 'dispel': text = `移除${possessive(selected())}${this.status(s.statusId, at('statusId'))}`; break;
        case 'storm': {
          num(s.turns, 'turns');
          if (s.dropKind) this.word(s.dropKind, DROP_KINDS, at('dropKind'));
          else { this.color(s.color, at('color')); if (s.color2) this.color(s.color2, at('color2')); }
          text = `召唤${s.dropKind ? STORM_NAMES[s.dropKind] ?? '风暴'
            : s.color2 && BASE_COLORS.has(s.color) && BASE_COLORS.has(s.color2) ? `${COLORS[s.color]}${COLORS[s.color2]}双色风暴`
            : STORM_NAMES[s.color] ?? `${this.color(s.color, at('color'))}风暴`}`;
          break;
        }
        case 'removeStorm': text = '清除风暴'; break;
        case 'shuffleBoard': text = '打乱棋盘'; break;
        case 'oneOf': case 'choose': {
          if (s.options.length === 0) this.issue(at('options'), 'empty-branches', '分支列表为空');
          // Each branch is read on its own, so a pick named in one branch is named again in the next.
          const seen = new Set(this.mentioned), after = new Set(this.mentioned);
          branches = s.options.map((branch, i) => {
            this.mentioned = new Set(seen);
            const out = branch.map((child, j) => this.segment(child, at(`options[${i}][${j}]`), depth + 1));
            this.mentioned.forEach(v => after.add(v));
            return out;
          });
          this.mentioned = after;
          const mark = (i: number) => '①②③④⑤⑥⑦⑧⑨⑩'[i] ?? `（${i + 1}）`;
          // Labels are presentation metadata, replaced with ordinal marks to remove source identities.
          const options = branches.map(b => joinClauses(b.map(c => c.text), '，') || '无效果');
          // A random pick nested in another branch reads inline, so the ①② marks stay unambiguous.
          text = depth > 0 && s.kind === 'oneOf' ? `随机触发其一：${options.join('，或')}`
            : (s.kind === 'choose' ? '施放时选择' : '随机触发以下一项') + '：' + options.map((o, i) => mark(i) + o).join('；');
          break;
        }
        case 'summon': text = this.summon(s.params, at('params')); break;
        case 'extraTurn': text = '获得一个额外回合'; break;
        case 'escapeChance': text = `有${chance(s.escapeChance, 'escapeChance')}几率撤离战场`; break;
        case 'gainEconomy': {
          const unit = this.word(s.currency, {gold: '枚金币', souls: '个灵魂', gems: '个宝石货币', maps: '张藏宝图'}, at('currency'));
          const got = value();
          text = whole ? `获得${unit.slice(1)}，数量等于${got}` : `获得${got}${unit}${bonus()}`;
          break;
        }
        case 'stealGold': if (s.cap !== undefined) num(s.cap, 'cap'); text = `偷取敌方${s.all ? '全部' : value() + '枚'}金币${bonus()}`; break;
        case 'spendEconomy': text = `消耗${s.all ? '全部' : value()}${this.word(s.currency, s.all ? CURRENCIES : {gold: '枚金币', souls: '个灵魂', gems: '个宝石货币', maps: '张藏宝图'}, at('currency'))}${bonus()}`; break;
        case 'sacrifice': text = selected() === '其' ? '将其献祭' : `献祭${selected()}`; break;
        case 'randomStatus': {
          num(s.turns ?? 3, 'turns');
          const n = num(s.times ?? 1, 'times');
          const positive = s.pool === 'positive' || s.target.startsWith('ally'), negative = !positive && s.target.startsWith('enemy');
          text = s.allPositive ? `使${selected()}获得所有正面状态`
            : positive ? `使${selected()}获得${n}个随机正面状态` : negative ? `使${selected()}陷入${n}个随机负面状态` : `为${selected()}施加${n}个随机状态`;
          break;
        }
        case 'transformTroop': {
          const into = s.copyOf ? `${this.target(s.copyOf, at('copyOf'))}的复制` : s.randomOf ? (s.randomOf.forEach(v => this.identity(v, '单位')), s.randomOf.length > 1 ? '随机形态' : '另一形态') : s.ref ? (this.identity(s.ref, '单位'), '另一形态') : this.issue(at('ref'), 'unsupported-value', '缺少形态模板');
          text = `将${selected()}变为${into}${s.fullMana ? '，并回满法力' : ''}`;
          break;
        }
        case 'reposition': text = `将${selected()}移到${this.word(s.to, {front: '首位', back: '末位'}, at('to'))}`; break;
        case 'shuffleTeam': text = `打乱${this.word(s.side, {ally: '我方', enemy: '敌方'}, at('side'))}站位`; break;
        case 'devour': {
          const effect = selected() === '其' ? '将其吞噬' : `吞噬${selected()}`;
          let doubled = '';
          if (s.chanceMult) {
            this.audit(s.chanceMult, at('chanceMult'), ['times', 'cond']);
            const n = num(s.chanceMult.times, 'chanceMult.times');
            doubled = `，若${this.condition(s.chanceMult.cond, at('chanceMult.cond'))}则几率${n === '2' ? '翻倍' : '×' + n}`;
          }
          const base = chance(s.chance, 'chance');
          text = `${s.chanceBoost ? this.chanceAmount(s.chanceBoost, at('chanceBoost'), s.chance) : base === '100%' ? '' : `有${base}几率`}${effect}${doubled}`;
          break;
        }
        case 'summonCopy': text = `召唤${possessive(selected())}复制体`; break;
        case 'swapPositions': text = `交换${this.target(s.a, at('a'))}与${this.target(s.b, at('b'))}的位置`; break;
        case 'selfRevive': text = `若自身阵亡，则复活并恢复${s.full ? '全部' : chance(s.healPct ?? 0.5, 'healPct')}生命${s.fullMana ? '，法力回满' : ''}`; break;
      }
      if ('ifCond' in s && s.ifCond) {
        // A check moved after the status it tests reads "已陷入" (see displayOrder).
        const cond = this.condition(s.ifCond, at('ifCond')).replace(/^目标陷入/, this.checkedBefore.has(path) ? '目标已陷入' : '目标陷入');
        const sameDispel = s.kind === 'dispel' && s.ifCond.kind === 'targetStatus' && s.ifCond.statusId === s.statusId;
        const t = selected();
        // Battlefield-location effects never apply in story battles, so they are not shown.
        if (cond.includes('战斗发生在')) text = '';
        else if (sameDispel) { /* "移除目标的屏障" already implies the condition. */ }
        else if (TARGET_FILTERS.has(s.ifCond.kind) && t && PLURAL_TARGET.test(t)) {
          // Filter a group in its noun: "所有红色敌人", "所有陷入燃烧的敌人".
          const adjective = cond.replace(/^目标(为)?/, '').replace(/^(陷入|拥有|已受伤|带有状态效果)(.*)$/, (_m, a: string, b: string) => `${a}${b}的`.replace('已受伤的', '受伤的')).replace(/^(来自.+)$/, '$1的');
          const filtered = withFilter(t, adjective);
          text = filtered === t ? `若${cond}，${text}` : text.replace(t, filtered);
        }
        else prefix = `若${cond}，`;
      }
      if ('ifTargetDied' in s && s.ifTargetDied) prefix = prefix ? `若目标身亡且${prefix.slice(1)}` : '若目标身亡，';
      if (s.kind !== 'devour' && s.kind !== 'choose' && (s.chance !== undefined || s.chanceBoost)) {
        const base = chance(s.chance ?? 0, 'chance');
        prefix += s.chanceBoost ? this.chanceAmount(s.chanceBoost, at('chanceBoost'), s.chance ?? 0) : `有${base}几率`;
      }
      if (text) text = prefix + text;
    }
    const unknown = name === '未解析技能段';
    if (!unknown) {
      const short = (c: string | undefined) => c && BASE_COLORS.has(c) ? COLORS[c as ColorSpec] : c === 'SKULL' ? '骷髅' : c === 'CHOSEN' ? '指定色' : '宝石';
      const specialName = (v: SpecialGemKind | SpecialGemSpec) => (SPECIALS[typeof v === 'string' ? v : v.kind] ?? '特殊宝石').replace(/#\d+$/, '');
      let effect: string = name;
      if (s.kind === 'damage') effect = s.execute ? '直接击败' : s.drain ? '生命吸取' : s.trueDamage ? '穿甲伤害' : s.range === 'splash' ? '溅射伤害' : s.split || s.splitRandom || s.range === 'scatter' ? '分摊伤害' : s.randomWaves ? '连续伤害' : '伤害';
      if (s.kind === 'buff') effect = s.stat === 'hp' ? s.lifeMode === 'gain' ? '生命成长' : s.full ? '完全治疗' : '治疗' : (STATS[s.stat] ?? '属性') + (s.double ? '翻倍' : '增益');
      if (s.kind === 'reduce') effect = (s.stat === 'random' ? '随机属性' : STATS[s.stat] ?? '属性') + (s.gainStat ? '窃取' : s.halve ? '减半' : s.drainAll ? '清空' : '削减');
      if (s.kind === 'status') effect = STATUSES[s.statusId] ?? '未解析状态';
      if (s.kind === 'dispel') effect = '移除' + (STATUSES[s.statusId] ?? '未解析状态');
      if (s.kind === 'gem') {
        const p = s.params;
        effect = p.op === 'create' ? '生成' + (p.gem.kind === 'color' ? (BASE_COLORS.has(p.gem.color) ? COLOR_WORDS[p.gem.color] + '宝石' : p.gem.color === 'SKULL' ? '骷髅' : '宝石') : p.gem.kind === 'skull' ? '骷髅' : p.gem.kind === 'special' ? specialName(p.gem.spec) : '混合宝石')
          : p.op === 'transform' ? `${p.fromSpecial ? specialName(p.fromSpecial) : p.from === 'ANY' || p.from === undefined ? '宝石' : p.from === 'CELL' ? '选定格' : short(p.from)}转${p.toSpecial ? specialName(p.toSpecial) : short(p.to)}`
          : this.word(p.mode, {destroy: '摧毁', explode: '爆破', remove: '移除'}, at('params.mode')) + this.clearTarget(p.target, at('params.target'), true).replace(/（[^）]*）/g, '').replace(/^全部/, '');
        if (effect.length > 20) effect = effect.slice(0, 20) + '等';
      }
      if ((s.kind === 'choose' || s.kind === 'oneOf') && branches?.length) effect += '：' + [...new Set(branches.flat().map(n => n.name))].slice(0, 2).join('或');
      if (s.kind === 'storm') effect = (s.dropKind ? DROP_KINDS[s.dropKind] : COLOR_WORDS[s.color]) + '风暴';
      if (s.kind === 'removeStorm') effect = '清除风暴';
      if (s.kind === 'summon') effect = '召唤随从';
      if (s.kind === 'gainEconomy' || s.kind === 'spendEconomy') effect = (CURRENCIES[s.currency] ?? '资源') + (s.kind === 'gainEconomy' ? '获取' : '消耗');
      if (s.kind === 'randomStatus') effect = s.allPositive ? '全部正面状态' : s.pool === 'positive' ? '随机正面状态' : s.pool === 'negative' ? '随机负面状态' : '随机状态';
      const target = 'target' in s ? selected().replace(/（.*$/s, '').replace(/^选定/, '指定') : '';
      name = `${target.length > 12 ? target.slice(0, 12) : target}${effect}`;
    }
    const support = unknown || depth >= this.maxDepth ? 'unsupported' : this.diagnostics.length > before ? 'partial' : 'full';
    const node: DescribedAbilitySegment = {path, kind: Object.prototype.hasOwnProperty.call(NAMES, s.kind) ? s.kind : 'unknown', name, text, support, ...(branches ? {branches} : {})};
    this.nodes.push(node);
    return node;
  }
}

const AMOUNT = String.raw`(?:\d+|max\(0,round\([^()]*\)\))`;
/** Neighbouring clauses that differ only in one listed word: "使自身攻击、护甲各增加10", "使该目标陷入缠绕和出血". */
const MERGES: readonly {re: RegExp; render: (key: string[], items: string[]) => string}[] = [
  { re: new RegExp(`^使(自身|其|.+的)(攻击|护甲|魔力|法力|生命)(增加|减少)(${AMOUNT}(?:，(?:数值因|若).+)?)$`),
    render: ([owner, verb, rest], items) => `使${owner}${items.join('、')}${items.length > 1 ? '各' : ''}${verb}${rest}` },
  // Random owners are separate draws each time, so they never merge.
  { re: /^使([^，；]+?)(陷入|获得)((?![^，；]*(?:随机|～))[^，；]+)$/, render: ([owner, verb], items) => `使${owner}${verb}${listWords(items)}` },
  { re: new RegExp(`^创造(${AMOUNT})颗(红色|蓝色|绿色|黄色|紫色|棕色)宝石$`), render: ([count], items) => `创造${count}颗${listWords(items)}宝石` },
  { re: /^移除(其|自身|.+的)([^的，、；]+)$/, render: ([owner], items) => `移除${owner}${listWords(items)}` },
];
const STAT_ORDER = ['攻击', '护甲', '魔力', '法力', '生命'];
function mergeStatClauses(clauses: readonly string[]): string[] {
  const out: string[] = [];
  let open: {rule: number; key: string[]; items: string[]} | undefined;
  const flush = () => {
    if (!open) return;
    const items = open.rule === 0 ? [...open.items].sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b)) : open.items;
    out.push(MERGES[open.rule]!.render(open.key, items));
    open = undefined;
  };
  for (const clause of clauses) {
    let hit: {rule: number; key: string[]; item: string} | undefined;
    for (let r = 0; r < MERGES.length && !hit; r++) {
      const m = MERGES[r]!.re.exec(clause);
      if (!m) continue;
      const parts = m.slice(1) as string[];
      // The varying word is the stat (rule 0, group 2) or the last group otherwise.
      const at = r === 0 ? 1 : parts.length - 1;
      hit = { rule: r, key: parts.filter((_, i) => i !== at), item: parts[at]! };
    }
    // "该目标"/"该盟友" right after a single named target is the same unit.
    const pronoun = !!hit && /^(其|该(目标|盟友)的?)$/.test(hit.key[0]!);
    // The pronoun stands for the open owner only when the two clauses actually merge.
    const asOpen = hit && open && pronoun && open.key[0] && !PLURAL_TARGET.test(open.key[0]) ? [open.key[0], ...hit.key.slice(1)] : hit?.key;
    // Two clauses on "一名随机敌人" are separate draws; only "其" refers back to the same one.
    const separateDraw = !!open?.key[0]?.includes('随机') && !pronoun;
    if (hit && open && !separateDraw && hit.rule === open.rule && asOpen!.join('|') === open.key.join('|')) { if (!open.items.includes(hit.item)) open.items.push(hit.item); continue; }
    flush();
    if (hit) open = { rule: hit.rule, key: hit.key, items: [hit.item] };
    else out.push(clause);
  }
  flush();
  return out;
}


const CHANCE_LEAD = /^有(\d+(?:\.\d+)?%)几率/;
const COUNT_TOKEN = /(?:max\(0,round\((\d+)\)\)|(?<![\d.～])(\d+|一))(颗|名|个)/;
/**
 * Repeats of one effect, without the individual chances (A 方案):
 * "爆破1颗鬼魂宝石 + 60%/50%/40% 各再爆破1颗" → "爆破1～4颗鬼魂宝石"; "召唤1名随从，共2次" → "召唤2名随从".
 */
function foldRepeats(clauses: readonly string[]): string[] {
  const odds = (c: string) => CHANCE_LEAD.exec(c)?.[1];
  // "另一名随机敌人" on a repeat is the same kind of draw as "一名随机敌人".
  // Bleed stacks add up too: "使其陷入出血" is one stack.
  const body = (c: string) => c.replace(CHANCE_LEAD, '').replace(/另一名随机(敌人|盟友)/, '一名随机$1').replace(/陷入出血$/, '陷入1层出血');
  const countOf = (text: string) => {
    const gain = /增加max\(0,round\((\d+)\)\)$/.exec(text) ?? /(?<![\d.～])(\d+)层出血$/.exec(text);
    if (gain) return { token: gain[0], unit: '', value: Number(gain[1]), render: (v: string) => gain[0].startsWith('增加') ? `增加${v}` : `${v}层出血` };
    const found = COUNT_TOKEN.exec(text);
    // Repeating "一名敌人" hits the same picked unit; only random draws and summons add up.
    if (!found || found[3] === '名' && !text.includes('随机') && !text.startsWith('召唤')) return undefined;
    return { token: found[0], unit: found[3]!, value: found[2] === '一' ? 1 : Number(found[1] ?? found[2]), render: (v: string) => v + found[3]! };
  };
  const key = (c: string) => { const b = body(c), n = countOf(b); return n ? b.replace(n.token, '#') : b; };
  const out: string[] = [];
  for (let i = 0; i < clauses.length;) {
    let n = 1;
    while (i + n < clauses.length && !clauses[i]!.includes('；') && key(clauses[i + n]!) === key(clauses[i]!)) n++;
    const run = clauses.slice(i, i + n);
    i += n;
    if (n === 1) { out.push(run[0]!); continue; }
    let k = 0;
    while (k < n && !odds(run[k]!)) k++;
    if (!run.slice(k).every(odds)) { out.push(...run); continue; }
    const text = body(run[0]!), first = countOf(text);
    if (first) {
      const values = run.map(c => countOf(body(c))!.value);
      const min = values.slice(0, k).reduce((a, b) => a + b, 0), max = values.reduce((a, b) => a + b, 0);
      const amount = k === 0 ? `最多${max}` : min === max ? String(min) : `${min}～${max}`;
      out.push(`${k === 0 ? '有几率' : ''}${text.replace(first.token, first.render(amount))}`);
    } else if (k === n) out.push(`${text}，共${n}次`);
    else if (k > 0) out.push(`${text}${k > 1 ? `，共${k}次` : ''}，并有几率重复触发`);
    else out.push(`有几率${text}，最多${n}次`);
  }
  return out;
}


/** Join clauses: a shared "若…，" covers its clauses once; "若没有…" right after "若有…" reads "否则". */
function joinClauses(input: readonly string[], separator: string): string {
  const groups: {prefix: string; clauses: string[]}[] = [];
  for (const text of input.filter(Boolean)) {
    const prefix = text.includes('；') ? '' : /^若[^，；]+，/.exec(text)?.[0] ?? '';
    const open = groups[groups.length - 1];
    if (open && open.prefix === prefix && !text.includes('；')) open.clauses.push(text.slice(prefix.length));
    else groups.push({ prefix, clauses: [text.slice(prefix.length)] });
  }
  return groups.map((g, i) => {
    const before = groups[i - 1]?.prefix;
    const otherwise = before && g.prefix && g.prefix === `若${negate(before.slice(1, -1))}，`;
    return (otherwise ? '否则，' : g.prefix) + foldRepeats(mergeStatClauses(g.clauses)).join(g.prefix ? '，' : separator);
  }).join(separator);
}

/**
 * Reading order. A leading "若目标陷入X" check on the picked enemy, followed by effects that
 * inflict X, reads better last: "对一名敌人造成伤害；使其陷入缠绕。若目标已陷入缠绕，…".
 */
function displayOrder(segments: readonly EffectSegment[]): number[] {
  const order = segments.map((_, i) => i);
  const at = segments.findIndex((s, i) => {
    const seg = s as EffectSegment & {ifCond?: Condition; target?: string};
    const cond = seg.ifCond;
    return ['enemyChosen', 'lastTarget'].includes(seg.target ?? '') && cond?.kind === 'targetStatus'
      && segments.slice(i + 1).some(later => later.kind === 'status' && later.statusId === cond.statusId);
  });
  return at < 0 ? order : [...order.filter(i => i !== at), at];
}
/** A repeated "（N等于…）" is explained once at the end. */
function explainN(body: string): string {
  const notes = [...body.matchAll(/（N等于([^）]+)）/g)].map(m => m[1]);
  if (!notes.length || new Set(notes).size > 1) return body;
  // The note follows the last clause that uses N.
  const bare = body.replace(/（N等于[^）]+）/g, '');
  const last = bare.lastIndexOf('N%');
  const end = [bare.indexOf('；', last), bare.indexOf('。', last)].filter(i => i >= 0);
  const at = end.length ? Math.min(...end) : bare.length;
  return `${bare.slice(0, at)}（N等于${notes[0]}）${bare.slice(at)}`;
}
/**
 * Text fixes for single skills whose native data disagrees with the original description.
 * Mechanics stay untouched; only the player-facing sentence follows the original.
 */
const TEXT_PATCHES: Partial<Record<number, readonly [string, string][]>> = {
  // Native data doubles the count, the original reads "爆破板面上半数蓝色宝石".
  8160: [['爆破蓝色宝石，数量等于蓝色宝石数×2', '爆破棋盘上一半的蓝色宝石']],
};
function patched(body: string, spellId: number | undefined): string {
  for (const [from, to] of spellId === undefined ? [] : TEXT_PATCHES[spellId] ?? []) body = body.split(from).join(to);
  return body;
}

/** Describe the compiled/adapted mechanics. Never pass a source spell name or description. */
export function describeAdaptedAbility(prototype: SkillPrototype, options: AbilityDescriptionOptions = {}): AdaptedAbilityDescription {
  const requestedDepth = options.maxDepth ?? 32;
  const writer = new DescriptionWriter(Number.isFinite(requestedDepth) ? Math.max(1, Math.min(128, Math.floor(requestedDepth))) : 32);
  writer.audit(prototype, 'prototype', ['segments', 'inputTarget', 'oncePerBattle']);
  // The effect text already names "一名敌人"/"一名盟友"; other input targets still need a prompt.
  let input = '';
  if (prototype.inputTarget) {
    const t = writer.target(prototype.inputTarget, 'prototype.inputTarget');
    if (!['enemyChosen', 'allyChosen', 'allyChosenOther'].includes(prototype.inputTarget)) input = `施放时选择${t}。`;
  }
  // Text follows displayOrder; the returned segment list keeps the engine order.
  const order = displayOrder(prototype.segments);
  const moved = order.length > 0 && order[order.length - 1] !== prototype.segments.length - 1;
  if (moved) writer.checkedBefore.add(`segments[${order[order.length - 1]}]`);
  const shown = order.map(i => ({ i, node: writer.segment(prototype.segments[i]!, `segments[${i}]`) }));
  const segments = [...shown].sort((a, b) => a.i - b.i).map(entry => entry.node);
  const names = [...new Set(segments.map(s => s.name))];
  const fullSegments = writer.nodes.filter(s => s.support === 'full').length;
  const partialSegments = writer.nodes.filter(s => s.support === 'partial').length;
  const unsupportedSegments = writer.nodes.filter(s => s.support === 'unsupported').length;
  const totalSegments = writer.nodes.length;
  const rule = choiceRuleOf(prototype);
  const restriction = rule ? (rule.onlyColor ? `只能选择${COLOR_WORDS[rule.onlyColor]}宝石。` : rule.notColor ? `不能选择${COLOR_WORDS[rule.notColor]}宝石。` : rule.manaGemsOnly ? '只能选择普通宝石。' : '') : '';
  // A check moved to the end reads as its own sentence.
  const joined = moved
    ? [joinClauses(shown.slice(0, -1).map(entry => entry.node.text), '；'), shown[shown.length - 1]!.node.text].filter(Boolean).join('。')
    : joinClauses(shown.map(entry => entry.node.text), '；');
  const body = explainN(patched(joined, options.spellId));
  const description = `${prototype.oncePerBattle ? '每场战斗限一次。' : ''}${input}${restriction}${body ? body + '。' : '此原型没有主动效果段。'}`;
  return {
    name: names.length ? names.slice(0, 2).join('·') + (names.length > 2 ? '等' : '') + '〔' + mechanicalFingerprint(description) + '〕' : '无主动效果',
    description,
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
