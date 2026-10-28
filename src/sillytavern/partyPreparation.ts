import { ALL_BASE_COLORS, BaseColor } from '../engine/types';
import type { SkillPrototype } from '../engine/skills/prototypes';
import { TROOPS } from '../data/troops';
import weapons from '../data/weapons.json';
import type { CombatantSnapshot } from '../session/contract';
import { STAT_LIMITS, TEAM_SIZE_LIMITS } from '../session/validateRequest';
import type { HostSnapshot } from './hostAdapter';
import type { StSave } from './save';
import { abilityIdentity, adaptedAbilityDescription, adaptedPrototype, registerStSkillLibrary } from './enemyBlueprint';
import { describeAdaptedAbility } from './abilityDescription';
import { prototypeEconomyIssues } from './economyAvailability';

/** Member refs are JSON pointers into statData, shared by selection and equippedAbilities. */
export const HERO_MEMBER_REF = '/人物';
export const PARTY_CONVERSION_VERSION = 'st-party-v1';
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
}
export interface PartyCandidate {
  memberRef: string; name: string; kind: 'hero' | 'companion'; eligible: boolean; selected: boolean;
  equipment: PartyEquipment[]; issues: PartyIssue[]; snapshot?: CombatantSnapshot;
  source?: {
    level: number; maxHp: number; currentHp: number; temporaryHp: number; ac: number;
    panelSource: string; diceExpectation: number; levelCoefficient: number; fixedDamage: number;
    attackCount: number; normalAttackMultiplier: number; physicalReduction: number; magicalReduction: number;
    effectiveReduction: number; attackBaseline: number;
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
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || new Set(value).size !== value.length ||
      value.some(color => !ALL_BASE_COLORS.includes(color as BaseColor))) fail('colors', path, `${path} 需要一种或两种不同的六色法力颜色`);
  return [...value] as BaseColor[];
}
/** Supports helper-generated merged offhand panels (e.g. 1d6+1d4); never rolls dice. */
export function damageDiceExpectation(value: unknown): number {
  const path = '伤害骰';
  if (typeof value !== 'string' || !/^\s*\d+d\d+(\s*\+\s*\d+d\d+)*\s*$/i.test(value))
    fail('dice', path, '伤害骰需要 NdM 或 NdM+NdM 格式');
  return value.split('+').reduce((sum, term) => {
    const [count, sides] = term.trim().toLowerCase().split('d').map(Number);
    number(count, path, 1, 1000, true); number(sides, path, 2, 1000, true);
    return sum + count! * (sides! + 1) / 2;
  }, 0);
}

let catalogue: { abilities: PartyAbilityChoice[]; prototypes: Map<string, SkillPrototype> } | undefined;
function catalog() {
  if (catalogue) return catalogue;
  const prototypes = new Map<string, SkillPrototype>();
  registerStSkillLibrary(prototypes);
  const abilities = new Map<string, PartyAbilityChoice>();
  // Same prototype and ID generation as registerAdaptedCatalog/compileEnemyBlueprint.
  for (const troop of TROOPS) {
    const prototype = adaptedPrototype(troop.spell.id);
    const skillId = `st:${troop.spell.id}`;
    prototypes.set(skillId, prototype);
    const abilityId = abilityIdentity(prototype, troop.manaColors, troop.manaCost);
    const description = adaptedAbilityDescription(troop.spell.id);
    const availabilityIssues = prototypeEconomyIssues(prototype);
    if (!abilities.has(abilityId)) abilities.set(abilityId, {
      abilityId, skillId, sourceSpellId: troop.spell.id, name: description.name,
      description: description.description, manaCost: troop.manaCost,
      sourceManaColors: [...troop.manaColors] as BaseColor[],
      ...(availabilityIssues.length ? { availabilityIssues } : {}),
    });
  }
  catalogue = { abilities: [...abilities.values()], prototypes };
  return catalogue;
}
/** Real adapted active:v1 identities; no native troop panel/traits are attached to the character. */
export function partyAbilityChoices(): PartyAbilityChoice[] { return structuredClone(catalog().abilities); }
/** Keep restricted weapons visible in binding choices, with an explicit reason. */
export function partyWeaponEconomyIssues(id: string): string[] {
  const prototype = catalog().prototypes.get(id);
  return prototype ? prototypeEconomyIssues(prototype) : [];
}
const colorChoices = (): BaseColor[][] => ALL_BASE_COLORS.flatMap((color, index) => [
  [color], ...ALL_BASE_COLORS.slice(index + 1).map(other => [color, other]),
]);
function checkedSkill(skillId: string, path: string): void {
  const prototype = catalog().prototypes.get(skillId);
  if (!prototype?.segments.length) fail('skill', path, `主动能力 ${skillId} 尚未真实注册`);
  const issues = prototypeEconomyIssues(prototype);
  if (issues.length) fail('economy-unavailable', path, `${describeAdaptedAbility(prototype).name}：${issues.join('、')}尚未接入酒馆模式，暂未开放出战；已有收藏和学习进度保留。`);
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
function prepareActor(candidate: PartyCandidate, actor: Record<string, unknown>, root: Record<string, unknown>,
  mode: 'classic' | 'new', options: PartyPreparationOptions, config: PartyConversionConfig): void {
  const ref = candidate.memberRef;
  const level = number(actor['等级'], `${ref}/等级`, 1, 100, true);
  const maxHp = number(actor['生命值上限'], `${ref}/生命值上限`, 1, Number.MAX_SAFE_INTEGER, true);
  const currentHp = number(actor['当前生命值'], `${ref}/当前生命值`, 0, maxHp, true);
  const temporaryHp = number(actor['临时生命值'] === undefined ? 0 : actor['临时生命值'], `${ref}/临时生命值`, 0, Number.MAX_SAFE_INTEGER, true);
  const attrs = record(actor['属性'], `${ref}/属性`);
  const core = coreKeys.map(key => number(attrs[key], `${ref}/属性/${key}`, 1, Number.MAX_SAFE_INTEGER, true));
  const combat = actor['战斗属性'] === undefined ? {} : record(actor['战斗属性'], `${ref}/战斗属性`);
  const physicalReduction = number(combat['物理减伤'] === undefined ? 0 : combat['物理减伤'], `${ref}/战斗属性/物理减伤`, 0, 100);
  const magicalReduction = number(combat['魔法减伤'] === undefined ? 0 : combat['魔法减伤'], `${ref}/战斗属性/魔法减伤`, 0, 100);
  const equipped = candidate.equipment;
  const mains = equipped.filter(item => item.type === '武器' && item.slot === '主手');
  if (mains.length > 1) fail('weapon-ambiguous', `${ref}/装备列表`, '存在多件已穿戴主手武器');
  const main = mains[0];
  // Actor aggregate includes merged offhand dice and the attribute adjustment already.
  let panelSource = `${ref}/战斗属性/武器面板`;
  let panelValue = combat['武器面板'];
  if (panelValue === undefined && candidate.kind === 'hero' && root['武器面板'] !== undefined) {
    panelValue = root['武器面板']; panelSource = '/武器面板';
  }
  let panel: Record<string, unknown>;
  if (panelValue !== undefined) panel = record(panelValue, panelSource);
  else if (!main) {
    // Exact helper buildUnarmedWeaponPanel/calcAttrFixedDmg; no GoW weapon stats.
    const coef = mode === 'new' ? 1 : Math.floor(level / 10) + 1;
    const modifier = Math.max(0, Math.floor((Math.min(Math.max(...core), 40) - 10) / 2));
    panel = { 伤害骰: '1d4', 等级系数: coef, 固定伤害: (mode === 'new' ? 0 : level) + modifier * coef };
    panelSource = 'helper:unarmed';
  } else fail('weapon-panel', panelSource, '已装备武器需要辅助脚本生成的战斗属性/武器面板');
  let diceExpectation: number;
  try { diceExpectation = damageDiceExpectation(panel['伤害骰']); }
  catch (error) { if (error instanceof InputIssue) fail(error.issue.code, `${panelSource}/伤害骰`, error.message); throw error; }
  const levelCoefficient = number(panel['等级系数'], `${panelSource}/等级系数`, 1, Number.MAX_SAFE_INTEGER, true);
  const fixedDamage = number(panel['固定伤害'], `${panelSource}/固定伤害`, 0, Number.MAX_SAFE_INTEGER, true);
  if (mode === 'new' && levelCoefficient !== 1) fail('stale-panel', `${panelSource}/等级系数`, '新版武器面板等级系数应为 1，请先同步辅助脚本');
  const action = combat['每回合动作资源'] === undefined ? {} : record(combat['每回合动作资源'], `${ref}/战斗属性/每回合动作资源`);
  const attackCount = action['攻击次数'] === undefined ? (level >= 50 ? 3 : level >= 20 ? 2 : 1)
    : number(action['攻击次数'], `${ref}/战斗属性/每回合动作资源/攻击次数`, 1, 3, true);
  const normalAttackMultiplier = mode === 'new' ? 1 + level * .02 : 1;
  const attackBaseline = (diceExpectation * levelCoefficient + fixedDamage) * normalAttackMultiplier * attackCount;
  const ac = actorAc(actor, equipped, ref);
  // Provisional equal physical/magical weighting. New AIRP rules explicitly use zero reduction.
  const effectiveReduction = mode === 'new' ? 0 : (physicalReduction + magicalReduction) / 2;
  if (effectiveReduction >= 100) fail('reduction', `${ref}/战斗属性`, '永久完全减伤超出当前转换范围');
  const durability = maxHp * config.hpScale / (1 - effectiveReduction / 100);
  const acBudget = Math.max(0, ac - 10) * config.armorScale;
  // Split one durability budget; adding AC does not duplicate the full HP budget.
  const armor = Math.round(durability * acBudget / (durability + acBudget));
  const stats = { hp: Math.round(durability) - armor, armor,
    attack: Math.round(attackBaseline * config.attackScale),
    magic: Math.round(Math.max(0, Math.floor((Math.max(core[3]!, core[4]!, core[5]!) - 10) / 2)) * config.magicScale) };
  for (const key of ['hp', 'attack', 'armor', 'magic'] as const)
    number(stats[key], `${ref}/stats/${key}`, STAT_LIMITS[key].min, STAT_LIMITS[key].max, true);
  candidate.source = { level, maxHp, currentHp, temporaryHp, ac, panelSource, diceExpectation, levelCoefficient,
    fixedDamage, attackCount, normalAttackMultiplier, physicalReduction, magicalReduction, effectiveReduction, attackBaseline };
  if (options.mode !== 'replay' && temporaryHp > 0) candidate.issues.push({ code: 'temporary-hp', path: `${ref}/临时生命值`, message: '临时生命吸收池尚未实现，请先处理临时 HP' });
  if (options.mode !== 'replay' && currentHp === 0) candidate.issues.push({ code: 'zero-hp', path: `${ref}/当前生命值`, message: '当前生命为零的角色尚未恢复战斗能力' });
  const initialHp = options.mode === 'replay' ? stats.hp : Math.round(stats.hp * currentHp / maxHp);
  if (currentHp > 0 && initialHp === 0 && options.mode !== 'replay') fail('hp-resolution', `${ref}/当前生命值`, '当前缩放把存活角色舍入为零，请统一调整转换系数');
  candidate.snapshot = { externalId: ref, name: candidate.name, levelLabel: String(level), battleScaling: { level, difficulty: 1 }, stats, initialHp,
    manaColors: [], manaCost: 1 };
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
        prepareActor(candidate, actor, root, mode, options, config);
        const unit = candidate.snapshot!;
        if (kind === 'hero') {
          const main = candidate.equipment.find(item => item.type === '武器' && item.slot === '主手');
          const bound = main && options.weaponBindings?.[main.ref];
          if (main && !bound) {
            initializationChoices.push({ memberRef: ref, kind: 'weaponBinding', path: main.ref,
              weaponChoices: weapons.filter(row => catalog().prototypes.get(`gw_${row.referenceName}`)?.segments.length).map(row => `gw_${row.referenceName}`) });
            fail('weapon-binding', main.ref, '当前主手武器尚未登记稳定的三消能力代码');
          }
          const id = bound ?? 'gw_KnightsSword';
          const weapon = weapons.find(row => `gw_${row.referenceName}` === id);
          if (!weapon) fail('weapon-binding', main?.ref ?? ref, `武器代码 ${id} 未出现在现有目录`);
          checkedSkill(id, main?.ref ?? ref);
          candidate.weapon = { id, sourceId: weapon.id, spellId: weapon.spell.id, isDefault: !main, ...(main ? { equipmentRef: main.ref } : {}) };
          unit.manaColors = colors(weapon.manaColors, `${ref}/manaColors`); unit.manaCost = weapon.manaCost;
          const description = describeAdaptedAbility(catalog().prototypes.get(id)!);
          unit.skillId = id; unit.spellName = description.name; unit.spellDescription = description.description;
          if (options.equippedAbilities?.[ref] || options.save?.equippedAbilities[ref]) fail('hero-ability', ref, '主角主动能力由当前武器决定');
        } else {
          const bridge = actor['三消'] === undefined ? {} : record(actor['三消'], `${ref}/三消`);
          if (bridge['颜色'] === undefined) {
            initializationChoices.push({ memberRef: ref, kind: 'colors', path: `${ref}/三消/颜色`, colorChoices: colorChoices() });
            candidate.issues.push({ code: 'colors-required', path: `${ref}/三消/颜色`, message: '请选择颜色并由宿主写回三消.颜色后重新准备' });
          } else unit.manaColors = colors(bridge['颜色'], `${ref}/三消/颜色`);
          const override = options.equippedAbilities;
          const chosen = override && own(override, ref) ? override[ref] : options.save?.equippedAbilities[ref];
          if (chosen && !options.save?.learnedAbilityIds.includes(chosen)) fail('ability-not-learned', ref, `能力 ${chosen} 尚未学会`);
          const abilityId = chosen || options.baseAbilities?.[ref];
          if (!abilityId) {
            initializationChoices.push({ memberRef: ref, kind: 'baseAbility', path: ref, abilityChoices: partyAbilityChoices() });
            fail('base-ability-required', ref, '同伴尚未登记基础能力，请从现有适配能力候选中选择');
          }
          const ability = catalog().abilities.find(item => item.abilityId === abilityId);
          if (!ability) fail('ability-mapping', ref, `能力 ${abilityId} 缺少现有适配配方映射`);
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
    notices: ['st-party-v1 转换系数与耐久/法强预算尚未完成产品标定；此结果不代表产品验收通过。',
      'ST 原生技能/效果文本、临时 HP 吸收池、族群身份、武器淬炼及词缀尚未接入。'] };
}

