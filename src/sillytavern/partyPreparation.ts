import { ALL_BASE_COLORS, BaseColor } from '../engine/types';
import type { SkillPrototype } from '../engine/skills/prototypes';
import { TROOPS } from '../data/troops';
import { troopStatsAtLevel } from '../data/leveling';
import { isImmortal } from '../data/immortals';
import { storyInitialHp } from './storyHp';
import { webPortraitUrl, type PresetPortraitResolver } from './actorPortraits';
import weapons from '../data/weapons.json';
import type { CombatantSnapshot } from '../session/contract';
import { STAT_LIMITS, TEAM_SIZE_LIMITS } from '../session/validateRequest';
import type { HostSnapshot } from './hostAdapter';
import type { StSave } from './save';
import { abilityIdentity, adaptedAbilityDescription, adaptedPrototype, learningAbilityId, registerStSkillLibrary, skillNameForTroop } from './enemyBlueprint';
import { describeAdaptedAbility } from './abilityDescription';
import { prototypeEconomyIssues } from './economyAvailability';
import { weaponOwned } from './weaponShop';

/** Member refs are JSON pointers into statData, shared by selection and equippedAbilities. */
export const HERO_MEMBER_REF = '/人物';
/**
 * st-party-v2: match-3 stats follow the match-3 level curve; AIRP attributes and AC only nudge
 * them (−5% to +10%). AIRP HP, weapon panels and damage reductions no longer set absolute numbers;
 * AIRP HP only supplies the current/max ratio for story entry HP.
 */
export const PARTY_CONVERSION_VERSION = 'st-party-v2';
/** Rarity whose median troop defines the party's base curve (the original game's most common normal-mode rarity). */
export const PARTY_REFERENCE_RARITY = 2;
/** AIRP attribute scores and AC above this value count as this value. */
export const PARTY_ATTRIBUTE_CAP = 30;
/** The game's starter weapon (meta STARTER_WEAPON_ID); used whenever no weapon is bound. */
export const STARTER_WEAPON = 'gw_KnightsSword';
const escapePointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');
export function companionMemberRef(name: string): string { return `/羁绊列表/${escapePointer(name)}`; }
export function equipmentRef(memberRef: string, key: string): string { return `${memberRef}/装备列表/${escapePointer(key)}`; }

export interface PartyIssue { code: string; path: string; message: string }
export interface PartyAbilityChoice {
  abilityId: string; skillId: string; sourceSpellId: number; name: string; description: string;
  manaCost: number; sourceManaColors: BaseColor[];
  /** Own economic effects; derived forms are additionally checked against the full battle. */
  availabilityIssues?: string[];
}
export interface PartyEquipment {
  ref: string; key: string; name: string; type: string; slot: string; data: Record<string, unknown>;
}
export interface PartyInitializationChoice {
  memberRef: string; kind: 'colors' | 'baseAbility' | 'weaponBinding'; path: string;
  colorChoices?: BaseColor[][]; abilityChoices?: PartyAbilityChoice[]; weaponChoices?: string[];
}
export interface PartyConversionConfig {
  /** Coefficients are returned with the result; v1 is a provisional, uncalibrated conversion. */
  hpScale: number; attackScale: number; armorScale: number; magicScale: number;
}
export const DEFAULT_PARTY_CONVERSION: Readonly<PartyConversionConfig> = Object.freeze({
  hpScale: 1, attackScale: 1, armorScale: 1, magicScale: 1,
});
export interface PartyPreparationOptions {
  /** Default: protagonist alone. Explicit order must contain the protagonist exactly once. */
  memberRefs?: readonly string[];
  mode?: 'story' | 'replay';
  save?: Pick<StSave, 'id' | 'chat' | 'learnedAbilityIds' | 'equippedAbilities'>;
  /** UI overrides; null explicitly restores a companion's registered base ability. */
  equippedAbilities?: Readonly<Record<string, string | null>>;
  baseAbilities?: Readonly<Record<string, string>>;
  /** equipmentRef -> existing gw_* catalogue ID. No binding is inferred from narrative names. */
  weaponBindings?: Readonly<Record<string, string>>;
  conversion?: PartyConversionConfig;
  /** The card's preset avatar lookup by character name (presetPortraitResolver); used when MVU has no 头像 address. */
  presetPortrait?: PresetPortraitResolver;
}
export interface PartyCandidate {
  memberRef: string; name: string; kind: 'hero' | 'companion'; eligible: boolean; selected: boolean;
  equipment: PartyEquipment[]; issues: PartyIssue[]; snapshot?: CombatantSnapshot;
  source?: {
    level: number; maxHp: number; currentHp: number; temporaryHp: number; ac: number;
    /** Scores as read (uncapped); the factors apply PARTY_ATTRIBUTE_CAP. */
    attributes: Record<typeof coreKeys[number], number>;
    base: PartyStats; factors: PartyStats;
  };
  weapon?: { id: string; sourceId: number; spellId: number; isDefault: boolean; equipmentRef?: string };
  ability?: PartyAbilityChoice;
}
export interface PartyPreparation {
  ready: boolean; party: CombatantSnapshot[]; candidates: PartyCandidate[];
  issues: PartyIssue[]; initializationChoices: PartyInitializationChoice[];
  conversion: { version: typeof PARTY_CONVERSION_VERSION; status: 'uncalibrated'; mode: 'classic' | 'new'; config: PartyConversionConfig };
  notices: string[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
class InputIssue extends Error {
  constructor(readonly issue: PartyIssue) { super(issue.message); }
}
function fail(code: string, path: string, message: string): never { throw new InputIssue({ code, path, message }); }
function record(value: unknown, path: string): Record<string, unknown> {
  if (!object(value)) fail('object', path, `${path} 需要对象`);
  return value;
}
function number(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value)))
    fail('number', path, `${path} 需要 ${min} 至 ${max} 的有限${integer ? '整数' : '数值'}`);
  return value;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail('text', path, `${path} 需要非空文本`);
  return value;
}
function colors(value: unknown, path: string): BaseColor[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 || new Set(value).size !== value.length ||
      value.some(color => !ALL_BASE_COLORS.includes(color as BaseColor))) fail('colors', path, `${path} 需要一至三种不同的六色法力颜色`);
  return [...value] as BaseColor[];
}
type PartyStats = CombatantSnapshot['stats'];
const baseCurve = new Map<number, PartyStats>();
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
/**
 * Level-driven base stats: per stat, the median of every ordinary (non-Immortal) troop of
 * PARTY_REFERENCE_RARITY at that level. Enemies use the same troop curve (troopStatsAtLevel),
 * so a party member and an enemy of the same level start from comparable numbers.
 */
export function partyBaseStats(level: number): PartyStats {
  const cached = baseCurve.get(level); if (cached) return { ...cached };
  const leveled = TROOPS.filter(t => t.rarityIdx === PARTY_REFERENCE_RARITY && !isImmortal(t)).map(t => troopStatsAtLevel(t, level));
  const stats = { hp: median(leveled.map(s => s.health)), attack: median(leveled.map(s => s.attack)),
    armor: median(leveled.map(s => s.armor)), magic: median(leveled.map(s => s.magic)) };
  baseCurve.set(level, stats); return { ...stats };
}
/** D&D ability modifier of a score capped at PARTY_ATTRIBUTE_CAP: −5 (score 1) to +10 (score 30). */
export function partyAttributeModifier(score: number): number {
  return Math.floor((Math.min(score, PARTY_ATTRIBUTE_CAP) - 10) / 2);
}
/**
 * Small nudge from AIRP numbers: 1% per ability modifier point, 0.5% per AC point above 10.
 * Range 0.95–1.10, so even all-30 scores weigh about as much as five levels (simulated).
 */
export function partyAttributeFactor(score: number): number { return 1 + .01 * partyAttributeModifier(score); }
export function partyAcFactor(ac: number): number { return 1 + .005 * (Math.min(ac, PARTY_ATTRIBUTE_CAP) - 10); }

interface PartyCatalogue {
  abilities: PartyAbilityChoice[]; prototypes: Map<string, SkillPrototype>;
  /** Current and legacy (color-bound v1) learning identities. */
  byId: Map<string, PartyAbilityChoice>;
  /** Common-rarity abilities usable as a companion's initial active. */
  starters: PartyAbilityChoice[];
}
let catalogue: PartyCatalogue | undefined;
function catalog(): PartyCatalogue {
  if (catalogue) return catalogue;
  const prototypes = new Map<string, SkillPrototype>();
  registerStSkillLibrary(prototypes);
  const abilities = new Map<string, PartyAbilityChoice>();
  const byId = new Map<string, PartyAbilityChoice>();
  const starters: PartyAbilityChoice[] = [];
  // Same prototype as registerAdaptedCatalog/compileEnemyBlueprint. Colors are not part of the identity.
  for (const troop of TROOPS) {
    const prototype = adaptedPrototype(troop.spell.id);
    const skillId = `st:${troop.spell.id}`;
    prototypes.set(skillId, prototype);
    const abilityId = learningAbilityId(prototype, troop.manaCost);
    let choice = abilities.get(abilityId);
    if (!choice) {
      const description = adaptedAbilityDescription(troop.spell.id);
      const availabilityIssues = prototypeEconomyIssues(prototype);
      choice = {
        // Same player-facing name as the enemies with these mechanics (one name per mechanics).
        abilityId, skillId, sourceSpellId: troop.spell.id, name: skillNameForTroop(troop.id) ?? description.name,
        description: description.description, manaCost: troop.manaCost,
        sourceManaColors: [...troop.manaColors] as BaseColor[],
        ...(availabilityIssues.length ? { availabilityIssues } : {}),
      };
      abilities.set(abilityId, choice); byId.set(abilityId, choice);
      if (troop.rarityIdx === 0 && !availabilityIssues.length && prototype.segments.length) starters.push(choice);
    }
    // Saves created before the color decoupling keep resolving their learned/base abilities.
    const legacy = abilityIdentity(prototype, troop.manaColors, troop.manaCost);
    if (!byId.has(legacy)) byId.set(legacy, choice);
  }
  catalogue = { abilities: [...abilities.values()], prototypes, byId, starters };
  return catalogue;
}
/** Real adapted learning identities; no native troop panel/traits are attached to the character. */
export function partyAbilityChoices(): PartyAbilityChoice[] { return structuredClone(catalog().abilities); }
/** Resolve a current or legacy learning identity to its catalogue ability. */
export function findPartyAbility(abilityId: string): PartyAbilityChoice | undefined {
  const choice = catalog().byId.get(abilityId);
  return choice && structuredClone(choice);
}
const QUALITY_ORDER = ['普通', '精良', '稀有', '卓越', '传说', '史诗', '神话'] as const;
function fnv32(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
/**
 * Test-phase companion rarity: explicit `三消.稀有度`, otherwise the highest quality among worn
 * equipment, otherwise 普通. Once colors are persisted the rarity no longer changes them.
 */
export function companionRarity(actor: Record<string, unknown>, equipment: readonly PartyEquipment[]): string {
  const bridge = object(actor['三消']) ? actor['三消'] : {};
  const explicit = bridge['稀有度'];
  if (typeof explicit === 'string' && (QUALITY_ORDER as readonly string[]).includes(explicit)) return explicit;
  let best = 0;
  for (const item of equipment) {
    const quality = item.data['品质'] === '神器' ? '卓越' : item.data['品质'];
    best = Math.max(best, (QUALITY_ORDER as readonly unknown[]).indexOf(quality));
  }
  return QUALITY_ORDER[best]!;
}
/** Same color counts as enemy ranks: 普通/精良 1, 稀有～史诗 2, 神话 3. */
export function companionColorCount(rarity: string): number {
  const index = (QUALITY_ORDER as readonly string[]).indexOf(rarity);
  return index >= 6 ? 3 : index >= 2 ? 2 : 1;
}
/** Fixed companion colors from two dimensions: the name hash selects, the rarity sets how many. */
export function companionDefaultColors(name: string, rarity: string): BaseColor[] {
  const count = companionColorCount(rarity);
  const combos: BaseColor[][] = [];
  const pick = (start: number, chosen: BaseColor[]): void => {
    if (chosen.length === count) { combos.push(chosen); return; }
    for (let i = start; i < ALL_BASE_COLORS.length; i++) pick(i + 1, [...chosen, ALL_BASE_COLORS[i]!]);
  };
  pick(0, []);
  return [...combos[fnv32(`match3-companion:${name}`) % combos.length]!];
}
/** Deterministic initial active for a companion without a learned/registered ability. */
export function companionStarterAbility(name: string): PartyAbilityChoice {
  const starters = catalog().starters;
  return structuredClone(starters[fnv32(`match3-starter:${name}`) % starters.length]!);
}
/** Every catalogue weapon whose spell is actually registered; placeholders without a spell are excluded. */
export function partyWeaponChoices(): string[] {
  return weapons.filter(row => catalog().prototypes.get(`gw_${row.referenceName}`)?.segments.length).map(row => `gw_${row.referenceName}`);
}
/** Adapted engine description of a weapon's spell (formula tokens resolve with abilityDisplayText). */
export function partyWeaponDescription(id: string): string {
  const prototype = catalog().prototypes.get(id);
  return prototype?.segments.length ? describeAdaptedAbility(prototype).description : '';
}
/** Keep restricted weapons visible in binding choices, with an explicit reason. */
export function partyWeaponEconomyIssues(id: string): string[] {
  const prototype = catalog().prototypes.get(id);
  return prototype ? prototypeEconomyIssues(prototype) : [];
}
/** Original-game name of a troop (`st:<spellId>`) or weapon (`gw_*`) skill. */
function skillDisplayName(skillId: string): string | undefined {
  const troop = /^st:(\d+)$/.exec(skillId);
  if (troop) { const source = TROOPS.find(t => t.spell.id === Number(troop[1])); return source && skillNameForTroop(source.id); }
  return weapons.find(row => `gw_${row.referenceName}` === skillId)?.spell.name.trim() || undefined;
}
function checkedSkill(skillId: string, path: string): void {
  const prototype = catalog().prototypes.get(skillId);
  if (!prototype?.segments.length) fail('skill', path, `主动能力 ${skillId} 尚未真实注册`);
  const issues = prototypeEconomyIssues(prototype);
  if (issues.length) fail('economy-unavailable', path, `${skillDisplayName(skillId) ?? describeAdaptedAbility(prototype).name}：${issues.join('、')}尚未接入酒馆模式，暂未开放出战；已有收藏和学习进度保留。`);
}
function readEquipment(actor: Record<string, unknown>, ref: string): PartyEquipment[] {
  const list = actor['装备列表'] === undefined ? {} : record(actor['装备列表'], `${ref}/装备列表`);
  const result: PartyEquipment[] = [];
  for (const [key, value] of Object.entries(list)) {
    const path = equipmentRef(ref, key); const item = record(value, path);
    // Equipment-box boolean is the current schema; old wear-state text is only a fallback.
    let worn: boolean;
    if (own(item, '装备箱')) {
      if (typeof item['装备箱'] !== 'boolean') fail('equipment', path, '装备箱需要布尔值');
      worn = !item['装备箱'];
    } else if (item['穿戴状态'] === '已装备' || item['穿戴状态'] === '未装备') {
      worn = item['穿戴状态'] === '已装备';
    } else fail('equipment', path, '装备缺少明确的装备箱或穿戴状态');
    if (!worn) continue;
    result.push({ ref: path, key, name: text(item['名称'] || key, `${path}/名称`),
      type: text(item['类型'], `${path}/类型`), slot: text(item['部位'], `${path}/部位`), data: structuredClone(item) });
  }
  return result;
}
const coreKeys = ['力量', '敏捷', '体质', '智力', '感知', '魅力'] as const;
const qualityAc: Record<string, number> = { 普通: 1, 精良: 2, 稀有: 3, 卓越: 4, 神器: 4, 传说: 5, 史诗: 6, 神话: 7 };
function actorAc(actor: Record<string, unknown>, equipped: PartyEquipment[], ref: string): number {
  if (actor['AC'] !== undefined) return number(actor['AC'], `${ref}/AC`, 0);
  // bondSchema has no AC; reproduce the helper's highest armour-quality bonus, without stacking.
  if (actor['种族'] === '龙精种') return 18;
  let bonus = 0;
  for (const item of equipped) {
    if (item.slot === '特殊' || (item.type !== '防具' && item.type !== '盾牌' && item.slot !== '盾牌')) continue;
    const quality = text(item.data['品质'], `${item.ref}/品质`);
    if (!own(qualityAc, quality)) fail('equipment-quality', `${item.ref}/品质`, '防具品质缺少现有 AC 映射');
    bonus = Math.max(bonus, qualityAc[quality]!);
  }
  return 10 + bonus;
}
function prepareActor(candidate: PartyCandidate, actor: Record<string, unknown>,
  options: PartyPreparationOptions, config: PartyConversionConfig): void {
  const ref = candidate.memberRef;
  const level = number(actor['等级'], `${ref}/等级`, 1, 100, true);
  const maxHp = number(actor['生命值上限'], `${ref}/生命值上限`, 1, Number.MAX_SAFE_INTEGER, true);
  const currentHp = number(actor['当前生命值'], `${ref}/当前生命值`, 0, maxHp, true);
  const temporaryHp = number(actor['临时生命值'] === undefined ? 0 : actor['临时生命值'], `${ref}/临时生命值`, 0, Number.MAX_SAFE_INTEGER, true);
  const attrs = record(actor['属性'], `${ref}/属性`);
  const core = coreKeys.map(key => number(attrs[key], `${ref}/属性/${key}`, 1, Number.MAX_SAFE_INTEGER, true));
  const [strength, dexterity, constitution, intelligence, wisdom, charisma] = core as [number, number, number, number, number, number];
  const equipped = candidate.equipment;
  const mains = equipped.filter(item => item.type === '武器' && item.slot === '主手');
  if (mains.length > 1) fail('weapon-ambiguous', `${ref}/装备列表`, '存在多件已穿戴主手武器');
  const ac = actorAc(actor, equipped, ref);
  // Level sets the trend; AIRP numbers only nudge it, and scores/AC above 30 count as 30.
  const base = partyBaseStats(level);
  const factors = { hp: partyAttributeFactor(constitution), attack: partyAttributeFactor(Math.max(strength, dexterity)),
    armor: partyAcFactor(ac), magic: partyAttributeFactor(Math.max(intelligence, wisdom, charisma)) };
  const scaled = (key: keyof PartyStats, scale: number) => Math.round(base[key] * factors[key] * scale);
  const stats = { hp: Math.max(1, scaled('hp', config.hpScale)), attack: scaled('attack', config.attackScale),
    armor: scaled('armor', config.armorScale), magic: scaled('magic', config.magicScale) };
  for (const key of ['hp', 'attack', 'armor', 'magic'] as const)
    number(stats[key], `${ref}/stats/${key}`, STAT_LIMITS[key].min, STAT_LIMITS[key].max, true);
  candidate.source = { level, maxHp, currentHp, temporaryHp, ac,
    attributes: Object.fromEntries(coreKeys.map((key, index) => [key, core[index]!])) as Record<typeof coreKeys[number], number>,
    base, factors };
  if (options.mode !== 'replay' && temporaryHp > 0) candidate.issues.push({ code: 'temporary-hp', path: `${ref}/临时生命值`, message: '临时生命吸收池尚未实现，请先处理临时 HP' });
  if (options.mode !== 'replay' && currentHp === 0) candidate.issues.push({ code: 'zero-hp', path: `${ref}/当前生命值`, message: '当前生命为零的角色尚未恢复战斗能力' });
  const initialHp = options.mode === 'replay' ? stats.hp : storyInitialHp(stats.hp, currentHp, maxHp);
  // Same order as the status bar, minus local uploads (display-only, see actorPortraits.ts).
  const portraitUrl = webPortraitUrl(actor['头像']) ?? webPortraitUrl(options.presetPortrait?.(candidate.name)) ?? defaultActorPortrait(actor['性别']);
  candidate.snapshot = { externalId: ref, name: candidate.name, levelLabel: String(level), battleScaling: { level, difficulty: 1 }, stats, initialHp,
    portraitUrl, manaColors: [], manaCost: 1 };
}

/** Tavern actors carry no battle art; use the base game's default character art by gender. */
export function defaultActorPortrait(gender: unknown): string {
  const kind = gender === '男' ? 'male' : gender === '女' ? 'female' : 'unknown';
  return `${import.meta.env.BASE_URL ?? '/'}static/hero/character-${kind}.webp`;
}

/** Travelling companions whose fixed colors are not yet persisted in `三消.颜色`. Pure. */
export function missingCompanionColors(snapshot: HostSnapshot): { name: string; colors: BaseColor[] }[] {
  const bonds = object(snapshot.statData['羁绊列表']) ? snapshot.statData['羁绊列表'] : {};
  const result: { name: string; colors: BaseColor[] }[] = [];
  for (const [name, actor] of Object.entries(bonds)) {
    if (!object(actor) || actor['同行誓约'] !== true || !name.trim()) continue;
    const bridge = actor['三消'];
    if (bridge !== undefined && (!object(bridge) || bridge['颜色'] !== undefined)) continue;
    let equipment: PartyEquipment[] = [];
    try { equipment = readEquipment(actor, companionMemberRef(name)); } catch { /* Rarity falls back to 普通. */ }
    result.push({ name, colors: companionDefaultColors(name, companionRarity(actor, equipment)) });
  }
  return result;
}

/** Pure preparation: never writes host variables, local saves, rewards or runtime modules. */
export function prepareCurrentParty(snapshot: HostSnapshot, options: PartyPreparationOptions = {}): PartyPreparation {
  const issues: PartyIssue[] = []; const candidates: PartyCandidate[] = []; const initializationChoices: PartyInitializationChoice[] = [];
  let mode: 'classic' | 'new' = 'classic';
  const config = { ...(options.conversion ?? DEFAULT_PARTY_CONVERSION) };
  const selected = options.memberRefs ?? [HERO_MEMBER_REF];
  try {
    for (const key of ['hpScale', 'attackScale', 'armorScale', 'magicScale'] as const) number(config[key], `conversion/${key}`, Number.MIN_VALUE);
    if (options.mode !== undefined && options.mode !== 'story' && options.mode !== 'replay') fail('mode', 'mode', '模式需要 story 或 replay');
    if (!Array.isArray(selected) || selected.some(ref => typeof ref !== 'string' || !ref.trim()))
      fail('selection', 'memberRefs', 'memberRefs 需要非空角色引用组成的数组');
    for (const [key, value] of Object.entries({ baseAbilities: options.baseAbilities, equippedAbilities: options.equippedAbilities, weaponBindings: options.weaponBindings })) {
      if (value === undefined) continue;
      const map = record(value, key);
      for (const [ref, id] of Object.entries(map)) {
        text(ref, key);
        if (key !== 'equippedAbilities' || id !== null) text(id, `${key}/${ref}`);
      }
    }
    if (options.save) {
      const save = options.save;
      record(save.chat, 'save/chat'); text(save.id, 'save/id');
      for (const key of ['hostId', 'characterId', 'chatId']) text(save.chat[key as keyof typeof save.chat], `save/chat/${key}`);
      if (!Array.isArray(save.learnedAbilityIds) || save.learnedAbilityIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(save.learnedAbilityIds).size !== save.learnedAbilityIds.length)
        fail('save-abilities', 'save/learnedAbilityIds', '已学能力需要无重复的非空代码数组');
      const equipped = record(save.equippedAbilities, 'save/equippedAbilities');
      for (const [ref, id] of Object.entries(equipped)) { text(ref, 'save/equippedAbilities'); text(id, `save/equippedAbilities/${ref}`); }
    }
    const root = record(snapshot.statData, 'statData');
    const system = root['系统配置'] === undefined ? {} : record(root['系统配置'], '/系统配置');
    const modeValue = system['战斗数值模式'];
    if (modeValue === 'new' || modeValue === '新版') mode = 'new';
    else if (modeValue !== undefined && modeValue !== 'classic' && modeValue !== '经典') fail('mode', '/系统配置/战斗数值模式', '战斗数值模式需要 classic/经典 或 new/新版');
    const hero = record(root['人物'], HERO_MEMBER_REF);
    const bonds = root['羁绊列表'] === undefined ? {} : record(root['羁绊列表'], '/羁绊列表');
    const actors: [string, unknown, string, 'hero' | 'companion'][] = [
      [HERO_MEMBER_REF, hero, typeof hero['名称'] === 'string' ? hero['名称'] : '', 'hero'],
      ...Object.entries(bonds).map(([name, actor]): [string, unknown, string, 'companion'] => [companionMemberRef(name), actor, name, 'companion']),
    ];
    for (const [ref, value, name, kind] of actors) {
      const candidate: PartyCandidate = { memberRef: ref, name, kind, eligible: kind === 'hero', selected: selected.includes(ref), equipment: [], issues: [] };
      candidates.push(candidate);
      try {
        const actor = record(value, ref); text(name, `${ref}/名称`);
        if (kind === 'companion') {
          if (actor['同行誓约'] !== undefined && typeof actor['同行誓约'] !== 'boolean') fail('companion-state', `${ref}/同行誓约`, '同行誓约需要布尔值');
          candidate.eligible = actor['同行誓约'] === true;
          if (!candidate.eligible) candidate.issues.push({ code: 'not-travelling', path: `${ref}/同行誓约`, message: '该角色当前未同行' });
        }
        candidate.equipment = readEquipment(actor, ref);
        prepareActor(candidate, actor, options, config);
        const unit = candidate.snapshot!;
        if (kind === 'hero') {
          const main = candidate.equipment.find(item => item.type === '武器' && item.slot === '主手');
          // A binding to a paid weapon that this floor has not bought falls back to the starter.
          const registered = main && options.weaponBindings?.[main.ref];
          const bound = registered && weaponOwned(root, registered) ? registered : undefined;
          if (main && !bound) {
            // Optional binding; until then the hero fights with the game's starter weapon.
            initializationChoices.push({ memberRef: ref, kind: 'weaponBinding', path: main.ref, weaponChoices: partyWeaponChoices() });
          }
          const id = bound ?? STARTER_WEAPON;
          const weapon = weapons.find(row => `gw_${row.referenceName}` === id);
          if (!weapon) fail('weapon-binding', main?.ref ?? ref, `已登记的武器不在现有目录中，请重新登记主手武器`);
          checkedSkill(id, main?.ref ?? ref);
          candidate.weapon = { id, sourceId: weapon.id, spellId: weapon.spell.id, isDefault: !bound, ...(main && bound ? { equipmentRef: main.ref } : {}) };
          unit.manaColors = colors(weapon.manaColors, `${ref}/manaColors`); unit.manaCost = weapon.manaCost;
          const description = describeAdaptedAbility(catalog().prototypes.get(id)!);
          // The hero's ability is the weapon's own spell: show its native name, not a generated
          // target phrase. The adapted description stays (it states the engine's real numbers);
          // a single effect needs no "1." list marker.
          unit.skillId = id; unit.spellName = weapon.spell.name;
          unit.spellDescription = description.description;
          if (options.equippedAbilities?.[ref] || options.save?.equippedAbilities[ref]) fail('hero-ability', ref, '主角主动能力由当前武器决定');
        } else {
          const bridge = actor['三消'] === undefined ? {} : record(actor['三消'], `${ref}/三消`);
          // Fixed colors: a persisted value wins; otherwise name hash × rarity (the host persists it).
          unit.manaColors = bridge['颜色'] === undefined
            ? companionDefaultColors(name, companionRarity(actor, candidate.equipment))
            : colors(bridge['颜色'], `${ref}/三消/颜色`);
          // Abilities are color independent; they are learned from soul fragments.
          const override = options.equippedAbilities;
          const chosen = override && own(override, ref) ? override[ref] : options.save?.equippedAbilities[ref];
          if (chosen && !options.save?.learnedAbilityIds.includes(chosen)) fail('ability-not-learned', ref, '所选能力尚未学会');
          const abilityId = chosen || options.baseAbilities?.[ref];
          const ability = abilityId ? catalog().byId.get(abilityId) : companionStarterAbility(name);
          if (!ability) fail('ability-mapping', ref, '已装配的能力缺少现有技能映射，请改用其他能力');
          checkedSkill(ability.skillId, ref); candidate.ability = structuredClone(ability);
          unit.skillId = ability.skillId; unit.manaCost = ability.manaCost;
          unit.spellName = ability.name; unit.spellDescription = ability.description;
        }
        number(unit.manaCost, `${ref}/manaCost`, STAT_LIMITS.manaCost.min, STAT_LIMITS.manaCost.max, true);
      } catch (error) {
        if (!(error instanceof InputIssue)) throw error;
        candidate.issues.push(error.issue);
      }
      if (candidate.issues.length) delete candidate.snapshot;
    }
    if (!Array.isArray(selected) || selected.length < TEAM_SIZE_LIMITS.min || selected.length > TEAM_SIZE_LIMITS.max)
      issues.push({ code: 'team-size', path: 'memberRefs', message: '出战队伍需要 1 至 4 人' });
    if (new Set(selected).size !== selected.length) issues.push({ code: 'duplicate-member', path: 'memberRefs', message: '出战角色重复' });
    if (!selected.includes(HERO_MEMBER_REF)) issues.push({ code: 'hero-required', path: 'memberRefs', message: '出战队伍需要包含当前主角' });
    for (const ref of selected) {
      const candidate = candidates.find(item => item.memberRef === ref);
      if (!candidate) issues.push({ code: 'unknown-member', path: 'memberRefs', message: `当前人物/羁绊列表中没有角色 ${ref}` });
      else issues.push(...candidate.issues);
    }
    if (options.save) {
      const save = options.save;
      if (['hostId', 'characterId', 'chatId'].some(key => save.chat[key as keyof typeof save.chat] !== snapshot.chat[key as keyof typeof snapshot.chat]) ||
          (snapshot.saveId !== undefined && snapshot.saveId !== save.id))
        issues.push({ code: 'save-binding', path: 'save', message: '能力存档与当前宿主聊天/存档绑定不一致' });
    }
    for (const map of [options.baseAbilities, options.equippedAbilities, options.save?.equippedAbilities]) {
      for (const ref of Object.keys(map ?? {})) if (!candidates.some(candidate => candidate.memberRef === ref))
        issues.push({ code: 'unknown-member', path: ref, message: '能力装配引用未出现在当前人物/羁绊列表中' });
    }
  } catch (error) {
    if (!(error instanceof InputIssue)) throw error;
    issues.push(error.issue);
  }
  return { ready: issues.length === 0, party: issues.length ? [] : selected.map(ref => structuredClone(candidates.find(item => item.memberRef === ref)!.snapshot!)),
    candidates, issues, initializationChoices, conversion: { version: PARTY_CONVERSION_VERSION, status: 'uncalibrated', mode, config },
    notices: ['st-party-v2：三消数值按等级取原游戏同稀有度兵种的中位数曲线，五维与 AC（超过 30 按 30 计）只做 −5%～+10% 的修正；尚未经过真实酒馆体验标定。',
      '临时 HP 吸收池、族群身份、武器淬炼及词缀尚未接入；同伴颜色按名字与稀有度测试映射。'] };
}

