import type { EffectSegment, SkillPrototype } from '../engine/skills/prototypes';
import type { Condition, ModifierSource } from '../engine/skills/effects/secondary';
import type { TargetMode } from '../engine/skills/targeting';
import type { TraitDefinition } from '../engine/traits';
import { stableJson } from './json';

export interface EnemyMechanismUnknownDetail {
  /** Structural rule ID relative to an active kind or trait root; positions use []. */
  key: string;
  /** Owning root family, independent of derived effect tags; null means unclassified. */
  family: string | null;
  /** Exact legacy unknown entry, including the concrete path and diagnostic tag. */
  detail: string;
}

export interface EnemyMechanismInspection {
  families: string[];
  targets: string[];
  dependencies: string[];
  unknown: string[];
  /** Same order and concrete occurrences as unknown, including repeated stable keys. */
  unknownDetails: EnemyMechanismUnknownDetail[];
}
type Data = Record<string, unknown>;
type TraitKey = Exclude<keyof TraitDefinition, 'code' | 'name' | 'description' | 'troops'>;
type TraitRule = readonly [family: string, trigger?: string, target?: string];

// Runtime field rules, independent of identities, descriptions and source catalogs.
// Schema additions deliberately require these exhaustive tables to be updated.
const ACTIVE_FAMILIES = {
  damage: 'damage', buff: 'buff', reduce: 'reduce', gem: 'gem', randomStat: 'randomStat',
  status: 'status', cleanse: 'cleanse', dispel: 'dispel', storm: 'storm', removeStorm: 'removeStorm',
  shuffleBoard: 'shuffleBoard', oneOf: 'oneOf', choose: 'choose', summon: 'summon',
  extraTurn: 'extraTurn', escapeChance: 'escapeChance', gainEconomy: 'gainEconomy',
  stealGold: 'stealGold', spendEconomy: 'spendEconomy', sacrifice: 'sacrifice',
  randomStatus: 'randomStatus', transformTroop: 'transformTroop', reposition: 'reposition',
  shuffleTeam: 'shuffleTeam', devour: 'devour', summonCopy: 'summonCopy',
  swapPositions: 'swapPositions', selfRevive: 'selfRevive',
} satisfies Record<EffectSegment['kind'], string>;

const EFFECT_FIELDS = {
  damage: ['kind', 'target', 'scaling', 'range', 'splashRatio', 'splashChances', 'randomWaves', 'randomPrefer', 'trueDamage', 'manaBurn', 'n', 'nRange', 'targetRace', 'targetKingdom', 'modifier', 'modifiers', 'raceDouble', 'raceTimes', 'condMult', 'condBonus', 'rangeSpec', 'split', 'splitRandom', 'drain', 'execute', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  buff: ['kind', 'lifeMode', 'target', 'stat', 'scaling', 'n', 'nRange', 'targetRace', 'targetKingdom', 'full', 'halve', 'fraction', 'double', 'modifier', 'raceDouble', 'raceTimes', 'condMult', 'condBonus', 'rangeSpec', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  reduce: ['kind', 'target', 'stat', 'scaling', 'drainAll', 'gainStat', 'gainRatio', 'gainLifeMode', 'modifierAfterCap', 'times', 'n', 'nRange', 'halve', 'fraction', 'targetRace', 'targetKingdom', 'modifier', 'raceDouble', 'raceTimes', 'condMult', 'condBonus', 'rangeSpec', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  gem: ['kind', 'params', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  randomStat: ['kind', 'target', 'scaling', 'oneSkill', 'n', 'nRange', 'targetRace', 'targetKingdom', 'modifier', 'raceDouble', 'raceTimes', 'condMult', 'condBonus', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  status: ['kind', 'target', 'statusId', 'turns', 'magnitude', 'stacks', 'n', 'nRange', 'targetRace', 'targetKingdom', 'perDestroyed', 'perCount', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  cleanse: ['kind', 'target', 'n', 'nRange', 'targetRace', 'targetKingdom', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  dispel: ['kind', 'target', 'statusId', 'n', 'nRange', 'targetRace', 'targetKingdom', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  storm: ['kind', 'color', 'turns', 'dropKind', 'color2', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  removeStorm: ['kind', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  shuffleBoard: ['kind', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  oneOf: ['kind', 'options', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  choose: ['kind', 'labels', 'options'],
  summon: ['kind', 'params', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  extraTurn: ['kind', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  escapeChance: ['kind', 'escapeChance', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  gainEconomy: ['kind', 'currency', 'scaling', 'modifier', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  stealGold: ['kind', 'deferCredit', 'scaling', 'cap', 'all', 'modifier', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  spendEconomy: ['kind', 'currency', 'scaling', 'all', 'modifier', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  sacrifice: ['kind', 'target', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  randomStatus: ['kind', 'target', 'n', 'nRange', 'turns', 'times', 'allPositive', 'pool', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  transformTroop: ['kind', 'target', 'ref', 'randomOf', 'copyOf', 'troopId', 'fullMana', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  reposition: ['kind', 'target', 'to', 'n', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  shuffleTeam: ['kind', 'side', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  devour: ['kind', 'target', 'n', 'chance', 'chanceMult', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  summonCopy: ['kind', 'target', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  swapPositions: ['kind', 'a', 'b', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
  selfRevive: ['kind', 'healPct', 'full', 'fullMana', 'chance', 'ifTargetDied', 'ifCond', 'chanceBoost'],
} satisfies { [K in EffectSegment['kind']]: readonly (keyof Extract<EffectSegment, { kind: K }>)[] };

const TRAIT_RULES = {
  skullDamageReduction: ['damageReduction'],
  spellDamageReduction: ['damageReduction'],
  statusImmunities: ['immunity'],
  battleStartManaRatio: ['mana', 'battleStart', 'allySelf'],
  battleStartStorm: ['storm', 'battleStart'],
  regen: ['regen', 'turnStart', 'allySelf'],
  onDamagedGain: ['buff', 'damaged', 'allySelf'],
  onDamagedStatus: ['status', 'damaged', 'allySelf'],
  onDamagedEnemyStatus: ['status', 'damaged', 'attacker'],
  onSkullDamagedEnemyDamage: ['damage', 'skullDamaged', 'attacker'],
  onDamagedCreateGem: ['gemCreate', 'damaged'],
  onDeathEconomy: ['economy', 'selfDeath'],
  onSelfDeathFillAllyMana: ['mana', 'selfDeath', 'allyRandom'],
  onDeathCreateGem: ['gemCreate', 'selfDeath'],
  manaOpsImmunity: ['immunity'],
  onSkullHitGain: ['buff', 'skullHit', 'allySelf'],
  onAllyCastGain: ['buff', 'allyCast', 'allySelf'],
  onEnemyCastGain: ['buff', 'enemyCast', 'allySelf'],
  onEnemyDeathGain: ['buff', 'enemyDeath', 'allySelf'],
  onEnemyDeathStatus: ['status', 'enemyDeath', 'allySelf'],
  onEnemyDeathTypeAura: ['aura', 'enemyDeath', 'allyAll'],
  onAllyDeathTypeAura: ['aura', 'allyDeath', 'allyAll'],
  onAllyCastTypeAura: ['aura', 'allyCast', 'allyAll'],
  onDamagedTypeAura: ['aura', 'damaged', 'allyAll'],
  onEnemyDeathEnemyStatus: ['status', 'enemyDeath', 'enemyFront'],
  onAllyDeathGain: ['buff', 'allyDeath', 'allySelf'],
  onBigMatchGain: ['buff', 'bigMatch', 'allySelf'],
  inflictOnSkullHit: ['status', 'skullHit', 'victim'],
  inflictOnSkullHitList: ['status', 'skullHit', 'victim'],
  onSkullHitStealMana: ['manaSteal', 'skullHit', 'victim'],
  inflictOnSkullDamaged: ['status', 'skullDamaged', 'attacker'],
  inflictOnSkullDamagedList: ['status', 'skullDamaged', 'attacker'],
  onBigMatchTypeAura: ['aura', 'bigMatch', 'allyAll'],
  teamAura: ['aura', 'battleStart'],
  typeAura: ['aura', 'battleStart', 'allyAll'],
  perAllyColor: ['aura', 'battleStart', 'allySelf'],
  reflectSkullRatio: ['reflect', 'skullDamaged', 'attacker'],
  dodgeChance: ['dodge', 'skullDamaged', 'allySelf'],
  manaLink: ['manaLink', 'colorMatch'],
  onColorMatchGain: ['buff', 'colorMatch', 'allySelf'],
  onColorMatchGains: ['buff', 'colorMatch', 'allySelf'],
  onBigMatchStatus: ['status', 'bigMatch'],
  onBigMatchSizedGain: ['buff', 'bigMatch', 'allySelf'],
  onColorMatchTypeAura: ['aura', 'colorMatch', 'allyAll'],
  onBigMatchCleanse: ['cleanse', 'bigMatch', 'allyAll'],
  onColorMatchCleanse: ['cleanse', 'colorMatch', 'allyAll'],
  onColorMatchStatus: ['status', 'colorMatch'],
  onColorMatchDrain: ['manaDrain', 'colorMatch', 'enemyRandom'],
  onColorMatchDamage: ['damage', 'colorMatch', 'enemyRandom'],
  onBigMatchDamage: ['damage', 'bigMatch'],
  onBigMatchEnemyDrain: ['reduce', 'bigMatch'],
  onBigMatchCreateGem: ['gemCreate', 'bigMatch'],
  onBigMatchConvert: ['statConvert', 'bigMatch', 'allySelf'],
  onBigMatchSummon: ['summon', 'bigMatch'],
  onBigMatchStorm: ['storm', 'bigMatch'],
  onBigMatchKill: ['execute', 'bigMatch'],
  onEnemyColorMatchGain: ['buff', 'enemyColorMatch', 'allySelf'],
  turnStartCreateGem: ['gemCreate', 'turnStart'],
  turnStartColorToSkull: ['gemTransform', 'turnStart'],
  turnStartCreateSpecialGem: ['gemCreate', 'turnStart'],
  turnStartColorToSpecial: ['gemTransform', 'turnStart'],
  battleStartConvertGems: ['gemTransform', 'battleStart'],
  onExtraTurnGain: ['buff', 'extraTurn', 'allySelf'],
  onExtraTurnStatus: ['status', 'extraTurn'],
  onAllySummonStorm: ['storm', 'allySummon'],
  onAllySummonGain: ['buff', 'allySummon', 'allySelf'],
  turnStartEnemyDrain: ['manaDrain', 'turnStart', 'enemyRandom'],
  turnStartStealLife: ['lifeSteal', 'turnStart', 'enemyRandom'],
  turnStartStealMana: ['manaSteal', 'turnStart', 'enemyRandom'],
  turnStartExplodeGem: ['gemExplode', 'turnStart'],
  onSkullHitExplodeGem: ['gemExplode', 'skullHit'],
  onColorMatchExplodeGem: ['gemExplode', 'colorMatch'],
  onAllyCastEnemyDamage: ['damage', 'allyCast'],
  onAllyCastCreateGem: ['gemCreate', 'allyCast'],
  skullMultVsTroopType: ['skullMultiplier'],
  skullMultVsStatus: ['skullMultiplier'],
  skullMultVsStatusList: ['skullMultiplier'],
  skullMultVsColor: ['skullMultiplier'],
  skullMultVsWounded: ['skullMultiplier'],
  armorPierceChance: ['armorPierce', 'skullHit'],
  untargetable: ['untargetable'],
  summonOnDeath: ['summon', 'selfDeath'],
  summonOnAllyDeath: ['summon', 'allyDeath'],
  summonOnEnemyDeath: ['summon', 'enemyDeath'],
  summonOnDamaged: ['summon', 'damaged'],
  summonOnAllyCast: ['summon', 'allyCast'],
  skullDamageFromArmorRatio: ['skullFromArmor'],
  onBigMatchDispelEnemies: ['dispel', 'bigMatch', 'enemyAll'],
  onBigMatchCleanseSelf: ['cleanse', 'bigMatch', 'allySelf'],
  onBigMatchDrainLife: ['lifeSteal', 'bigMatch', 'enemyAll'],
  onBigMatchExplodeGem: ['gemExplode', 'bigMatch'],
  onBigMatchCreatePlainGem: ['gemCreate', 'bigMatch'],
  onBigMatchRandomStorm: ['storm', 'bigMatch'],
  onSelfSummonStatus: ['status', 'selfSummon', 'allySelf'],
  onAllyDeathStatus: ['status', 'allyDeath'],
  onEnemyDeathRandomStatus: ['status', 'enemyDeath', 'enemyRandom'],
  onSkullMatchEnemyDrain: ['reduce', 'skullMatch', 'enemyRandom'],
  onEnemyCastTypeAura: ['aura', 'enemyCast', 'allyAll'],
  onEnemyDeathEnemyAllStatus: ['status', 'enemyDeath', 'enemyAll'],
  onSelfDeathEnemyAllStatus: ['status', 'selfDeath', 'enemyAll'],
  skullLethalChance: ['execute', 'skullHit', 'victim'],
  turnStartChanceGain: ['buff', 'turnStart', 'allySelf'],
  onSkullHitKill: ['execute', 'skullHit'],
  onEnemyDeathKill: ['execute', 'enemyDeath'],
  onSkullHitDevour: ['devour', 'skullHit', 'victim'],
  onSkullDamagedDevour: ['devour', 'skullDamaged', 'attacker'],
  onEnemyDeathDevour: ['devour', 'enemyDeath', 'enemyRandom'],
  selfRevive: ['revive', 'selfDeath', 'allySelf'],
  turnStartStatus: ['status', 'turnStart'],
  battleEconomyGain: ['economy'],
  onBigMatchEconomy: ['economy', 'bigMatch'],
  onSkullMatchEconomy: ['economy', 'skullMatch'],
  battleStartDestroy: ['gemDestroy', 'battleStart'],
  battleStartStatus: ['status', 'battleStart'],
  battleStartManaAura: ['mana', 'battleStart', 'allyAll'],
  onDelveGain: ['buff', 'delve', 'allySelf'],
  onDelveBounty: ['economy', 'delve'],
  onDelveMiles: ['delveMiles', 'delve'],
  vsAscendedMultiplier: ['damageMultiplier'],
  enemyMasteryMult: ['mastery'],
  devourImmunity: ['immunity'],
  positionAura: ['aura', 'positionEntry', 'allySelf'],
  onAllyCastRandomStatus: ['randomStatus', 'allyCast'],
  allyStartMana: ['mana', 'battleStart', 'allyAll'],
  battleStartTypeAura: ['aura', 'battleStart', 'allyAll'],
  turnStartTypeAura: ['aura', 'turnStart', 'allyAll'],
  perAllyTrait: ['aura', 'battleStart', 'allySelf'],
  onAllyCastStatus: ['status', 'allyCast'],
  onEnemyCastStatus: ['status', 'enemyCast'],
  onAllyCastEnemyDrain: ['reduce', 'allyCast'],
  turnStartEconomy: ['economy', 'turnStart'],
  onAllyCastEconomy: ['economy', 'allyCast'],
  onDamagedEconomy: ['economy', 'damaged'],
  turnStartSummon: ['summon', 'turnStart'],
  turnStartStorm: ['storm', 'turnStart'],
  mode: ['mode'], pvpBonus: ['buff'], pvpEconomyGain: ['economy'],
} satisfies Record<TraitKey, TraitRule>;

const TRAIT_SHAPES = {
  skullDamageReduction: 'number',
  spellDamageReduction: 'number',
  statusImmunities: 'array',
  battleStartManaRatio: 'number',
  battleStartStorm: 'object',
  regen: 'object',
  onDamagedGain: 'object',
  onDamagedStatus: 'object',
  onDamagedEnemyStatus: 'object',
  onSkullDamagedEnemyDamage: 'object',
  onDamagedCreateGem: 'object',
  onDeathEconomy: 'object',
  onSelfDeathFillAllyMana: 'boolean',
  onDeathCreateGem: 'object',
  manaOpsImmunity: 'boolean',
  onSkullHitGain: 'object',
  onAllyCastGain: 'object',
  onEnemyCastGain: 'object',
  onEnemyDeathGain: 'object',
  onEnemyDeathStatus: 'object',
  onEnemyDeathTypeAura: 'object',
  onAllyDeathTypeAura: 'object',
  onAllyCastTypeAura: 'object',
  onDamagedTypeAura: 'object',
  onEnemyDeathEnemyStatus: 'object',
  onAllyDeathGain: 'object',
  onBigMatchGain: 'object',
  inflictOnSkullHit: 'object',
  inflictOnSkullHitList: 'array',
  onSkullHitStealMana: 'number',
  inflictOnSkullDamaged: 'object',
  inflictOnSkullDamagedList: 'array',
  onBigMatchTypeAura: 'object',
  teamAura: 'object',
  typeAura: 'object',
  perAllyColor: 'object',
  reflectSkullRatio: 'number',
  dodgeChance: 'number',
  manaLink: 'object',
  onColorMatchGain: 'object',
  onColorMatchGains: 'array',
  onBigMatchStatus: 'object',
  onBigMatchSizedGain: 'object',
  onColorMatchTypeAura: 'object',
  onBigMatchCleanse: 'object',
  onColorMatchCleanse: 'object',
  onColorMatchStatus: 'object',
  onColorMatchDrain: 'object',
  onColorMatchDamage: 'object',
  onBigMatchDamage: 'object',
  onBigMatchEnemyDrain: 'object',
  onBigMatchCreateGem: 'object',
  onBigMatchConvert: 'object',
  onBigMatchSummon: 'object',
  onBigMatchStorm: 'object',
  onBigMatchKill: 'object',
  onEnemyColorMatchGain: 'object',
  turnStartCreateGem: 'object',
  turnStartColorToSkull: 'object',
  turnStartCreateSpecialGem: 'object',
  turnStartColorToSpecial: 'object',
  battleStartConvertGems: 'object',
  onExtraTurnGain: 'object',
  onExtraTurnStatus: 'object',
  onAllySummonStorm: 'object',
  onAllySummonGain: 'object',
  turnStartEnemyDrain: 'object',
  turnStartStealLife: 'object',
  turnStartStealMana: 'object',
  turnStartExplodeGem: 'object',
  onSkullHitExplodeGem: 'object',
  onColorMatchExplodeGem: 'object',
  onAllyCastEnemyDamage: 'object',
  onAllyCastCreateGem: 'object',
  skullMultVsTroopType: 'object',
  skullMultVsStatus: 'object',
  skullMultVsStatusList: 'array',
  skullMultVsColor: 'object',
  skullMultVsWounded: 'number',
  armorPierceChance: 'number',
  untargetable: 'boolean',
  summonOnDeath: 'object',
  summonOnAllyDeath: 'object',
  summonOnEnemyDeath: 'object',
  summonOnDamaged: 'object',
  summonOnAllyCast: 'object',
  skullDamageFromArmorRatio: 'number',
  onBigMatchDispelEnemies: 'boolean',
  onBigMatchCleanseSelf: 'boolean',
  onBigMatchDrainLife: 'object',
  onBigMatchExplodeGem: 'object',
  onBigMatchCreatePlainGem: 'object',
  onBigMatchRandomStorm: 'object',
  onSelfSummonStatus: 'object',
  onAllyDeathStatus: 'object',
  onEnemyDeathRandomStatus: 'object',
  onEnemyDeathKill: 'object',
  onSkullMatchEnemyDrain: 'object',
  onEnemyCastTypeAura: 'object',
  onEnemyDeathEnemyAllStatus: 'object',
  onSelfDeathEnemyAllStatus: 'object',
  skullLethalChance: 'number',
  turnStartChanceGain: 'object',
  onSkullHitKill: 'object',
  onSkullHitDevour: 'object',
  onSkullDamagedDevour: 'object',
  onEnemyDeathDevour: 'object',
  selfRevive: 'object',
  turnStartStatus: 'object',
  battleEconomyGain: 'object',
  onBigMatchEconomy: 'object',
  onSkullMatchEconomy: 'object',
  battleStartDestroy: 'object',
  battleStartStatus: 'object',
  battleStartManaAura: 'object',
  onDelveGain: 'object',
  onDelveBounty: 'object',
  onDelveMiles: 'object',
  vsAscendedMultiplier: 'object',
  enemyMasteryMult: 'number',
  devourImmunity: 'boolean',
  positionAura: 'object',
  onAllyCastRandomStatus: 'object',
  allyStartMana: 'object',
  battleStartTypeAura: 'object',
  turnStartTypeAura: 'object',
  perAllyTrait: 'object',
  onAllyCastStatus: 'object',
  onEnemyCastStatus: 'object',
  onAllyCastEnemyDrain: 'object',
  turnStartEconomy: 'object',
  onAllyCastEconomy: 'object',
  onDamagedEconomy: 'object',
  turnStartSummon: 'object',
  turnStartStorm: 'object',
  mode: 'string',
  pvpBonus: 'object',
  pvpEconomyGain: 'object',
} satisfies Record<TraitKey, string>;

const TARGETS = [
  'enemyFront', 'enemyRandom', 'enemyRandomOther', 'enemyRandomPrefNotPrev', 'allyRandomPrefNotPrev',
  'enemyRandomN', 'enemyWeakest', 'enemyWeakestN', 'enemyHealthiest', 'enemyHealthiestN',
  'enemyFirstN', 'enemyNth', 'enemyLast', 'enemySecondLast', 'enemyLastN', 'enemyAllOther',
  'enemyAll', 'enemyChosen', 'enemyChosenAndNextDown', 'enemyChosenAndBelow', 'enemyChosenAndAdjacent',
  'enemyAboveTarget', 'enemyBelowTarget', 'enemyNextDown', 'enemyNextUp', 'lastTarget', 'lastTargets',
  'lastTargetFirst', 'lastTargetLast', 'lastDamaged', 'lastAlly', 'allySelf', 'allyFront', 'allyRandom',
  'allyRandomN', 'allyRandomPrefNotPrevN', 'allyWeakest', 'allyLowestManaOther', 'allyHighestManaOther',
  'allyWeakestN', 'allyLowestHpOtherN', 'allyHealthiest', 'allyHealthiestN', 'allyFirstN', 'allyNth',
  'allyOthers', 'allySelfAndBelow', 'allyAboveSelf', 'allyBelowSelf', 'allyBelowTarget', 'allyLastOther',
  'allyLast', 'allyLastN', 'allyAll', 'allyChosenOther', 'allyChosen',
] as const satisfies readonly TargetMode[];
const targetCoverage: Record<Exclude<TargetMode, typeof TARGETS[number]>, never> = {};
void targetCoverage;
const TARGET_SET = new Set<string>(TARGETS);
const COLORS = new Set(['Red', 'Green', 'Blue', 'Yellow', 'Purple', 'Brown']);
const SCOPE_TARGETS: Record<string, string> = {
  self: 'allySelf', randomAlly: 'allyRandom', randomEnemy: 'enemyRandom',
  allAllies: 'allyAll', allEnemies: 'enemyAll', enemyAll: 'enemyAll',
  firstEnemy: 'enemyFront', front: 'enemyFront', lastEnemy: 'enemyLast',
  allies: 'allyAll', enemies: 'enemyAll',
};
const FILTER_SCOPE_KEYS = new Set([
  'battleStartManaAura', 'battleStartTypeAura', 'turnStartTypeAura', 'onColorMatchTypeAura', 'allyStartMana',
]);

const SOURCE_CONTEXT = {
  chosenColumnAtCastStart: 'input:column', chosenRowAtCastStart: 'input:row',
  destroyedGems: 'order:destroyedGems', countedAdjacentSpecial: 'order:countedAdjacentSpecial',
  diagonalGems: 'context:board', transformedGems: 'order:transformedGems',
  boardGems: 'context:board', boardSkulls: 'context:board', castStartBoardSkulls: 'context:castStart',
  castStartBoardGems: 'context:castStart', boardSpecial: 'context:board', selfStat: 'context:casterStat',
  allyFrontStat: 'context:allyFrontStat', teamSize: 'context:teamSize',
  alliesOfRace: 'context:teamFilter:ally', enemiesOfRace: 'context:teamFilter:enemy',
  alliesOfKingdom: 'context:teamFilter:ally', alliesNamed: 'context:teamFilter:ally',
  enemiesOfKingdom: 'context:teamFilter:enemy', alliesOfColor: 'context:teamFilter:ally',
  enemiesOfColor: 'context:teamFilter:enemy', enemyStatusCount: 'context:enemyStatus',
  allyStatusCount: 'context:allyStatus', targetStatusCount: 'context:targetStatus',
  enemyStatSum: 'context:enemyStat', allyStatSum: 'context:allyStat', targetStat: 'context:targetStat',
  chosenStat: 'input:target', lastDamage: 'order:lastDamage', enemyFull: 'context:enemyStats',
  casterStatBeatsCount: 'context:statComparison', drainedMana: 'order:drainedMana',
  countEnemyDeaths: 'context:enemyDeaths', countAllyDeaths: 'context:allyDeaths',
  battleMaps: 'context:economy:maps', sacrificedStat: 'order:sacrificedStat', lastReduce: 'order:lastReduce',
  battleGold: 'context:economy:gold', enemyGold: 'context:enemyEconomy:gold', bothGold: 'context:bothEconomy:gold',
  battleSouls: 'context:economy:souls', battleGems: 'context:economy:gems', tempering: 'context:tempering',
  goldStolen: 'order:goldStolen', goldSpent: 'order:goldSpent', randomAllyStat: 'random:allyStat',
  surroundingGems: 'order:lastCreated', chosenCellBlockGems: 'input:cell',
} satisfies Record<ModifierSource['kind'], string>;
const CONDITION_CONTEXT = {
  targetRace: 'context:target', targetColor: 'context:target', targetStatus: 'context:targetStatus',
  targetHasAnyStatus: 'context:targetStatus', targetHpDamaged: 'context:targetHp', selfHpDamaged: 'context:casterHp',
  boardAtLeast: 'context:board', castStartBoardAtLeast: 'context:castStart',
  destroyedColorAtLeast: 'order:destroyedGems', enemyRacePresent: 'context:teamFilter:enemy',
  allyRacePresent: 'context:teamFilter:ally', anyEnemyStatus: 'context:enemyStatus',
  anyAllyStatus: 'context:allyStatus', stormPresent: 'context:storm', troopPresent: 'context:namedUnit',
  selfStatus: 'context:casterStatus', casterStatBeatsTarget: 'context:statComparison',
  anyEnemyColor: 'context:teamFilter:enemy', firstLastEnemyColor: 'context:teamFilter:enemy',
  not: 'condition:not', anyOf: 'condition:anyOf', allOf: 'condition:allOf',
  regionPresent: 'context:region', ascended: 'context:ascended', manaFull: 'context:mana',
  kingdomOf: 'context:teamFilter', targetKingdom: 'context:target', targetHasDoom: 'context:race:Doom',
  kingdomPresent: 'context:kingdom', lastTargetStatus: 'order:lastTarget',
  chosenTargetRace: 'input:target', chosenTargetColor: 'input:target', chosenTargetStatus: 'input:target',
  lastTargetRace: 'order:lastTarget', lastTargetColor: 'order:lastTarget', lastTargetSurvived: 'order:lastTarget',
  anyTrackedDied: 'order:trackedDeaths', castEnemyDied: 'order:enemyDeath', castSacrificed: 'order:sacrifice',
  targetStatBeatsCaster: 'context:statComparison', chosenTargetStatBeatsCaster: 'input:target',
  chosenTargetDamaged: 'input:target', economyAtLeast: 'context:economy',
  lastTargetStatusAtCastStart: 'order:lastTarget',
} satisfies Record<Condition['kind'], string>;
function data(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function has(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}
function enabled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== ''
    && (!Array.isArray(value) || value.length > 0);
}

/**
 * Static classification, not execution verification. Tags are sorted and deduplicated.
 * Context tags use context:race/type/kingdom/namedUnit/ref/color:<value>.
 * order/input/trigger/random tags distinguish the sources of dependencies.
 * Unknowns carry structural paths. unknownDetails preserves those strings in detail;
 * keys are relative to an active kind or trait root field, with array indices erased.
 * Input atoms and branches are never reordered.
 */
export function inspectEnemyMechanisms(
  prototype: SkillPrototype,
  traits: readonly TraitDefinition[],
): EnemyMechanismInspection {
  const families = new Set<string>();
  const targets = new Set<string>();
  const dependencies = new Set<string>();
  const unknown = new Set<string>();
  const unknownDetails = new Map<string, EnemyMechanismUnknownDetail>();
  let diagnosticContext: { family: string | null; path: string; rule: string } = { family: null, path: '', rule: '' };
  const ancestors = new Set<object>();
  const dep = (tag: string) => { dependencies.add(tag); };
  const family = (side: 'active' | 'trait', tag: string) => { families.add(`${side}:${tag}`); };
  const issue = (path: string, tag: unknown) => {
    const detail = `${path}:${String(tag)}`;
    const rulePath = `${diagnosticContext.rule}${path.slice(diagnosticContext.path.length)}`.replace(/\[\d+\]/g, '[]');
    unknown.add(detail);
    unknownDetails.set(detail, { key: `${rulePath}:${String(tag)}`, family: diagnosticContext.family, detail });
  };

  function withDiagnosticContext(family: string | null, path: string, rule: string, visit: () => void): void {
    const previous = diagnosticContext;
    diagnosticContext = { family, path, rule };
    try { visit(); } finally { diagnosticContext = previous; }
  }

  function context(kind: string, value: unknown): void {
    if (Array.isArray(value)) { value.forEach(v => context(kind, v)); return; }
    if ((typeof value === 'string' && value !== '') || typeof value === 'number') dep(`context:${kind}:${value}`);
  }
  function color(value: unknown): void {
    if (value === undefined) return;
    context('color', value);
    if (value === 'CHOSEN') dep('input:color');
    if (value === 'CASTER') dep('context:casterColors');
    if (value === 'ENEMY' || value === 'TRACKED_ENEMY') dep('random:enemyColor');
    if (value === 'ENEMY_MOST_USED') dep('context:teamFilter:enemy:color');
    if (value === 'ALLY_MOST_USED') dep('context:teamFilter:ally:color');
    if (value === 'LAST_TARGET') dep('order:lastTarget');
    if (value === 'CHOSEN_TARGET') dep('input:target');
  }
  function target(value: unknown, path: string): void {
    if (typeof value !== 'string') { issue(path, 'invalidTarget'); return; }
    if (value === 'fromPrevious') { targets.add(value); dep('order:fromPrevious'); return; }
    if (!TARGET_SET.has(value)) { issue(path, `target:${value}`); return; }
    targets.add(value);
    if (value.startsWith('last')) dep(`order:${value}`);
    if (value.includes('Random')) dep('random:target');
    if (value.includes('Chosen') || /(?:AboveTarget|BelowTarget|NextDown|NextUp)$/.test(value)) dep('input:target');
    if ((/Other|PrefNotPrev/.test(value) && value.startsWith('enemy')) || value.includes('PrefNotPrev')) dep('order:lastTarget');
    if (value.includes('PrefNotPrev')) dep('order:previousPick');
  }
  function guarded(value: Data, path: string, visit: () => void): void {
    if (ancestors.has(value)) { issue(path, 'cycle'); return; }
    ancestors.add(value);
    try { visit(); } finally { ancestors.delete(value); }
  }
  function condition(value: unknown, path: string): void {
    if (!data(value) || typeof value.kind !== 'string') { issue(path, 'invalidCondition'); return; }
    guarded(value, path, () => {
      const kind = value.kind as Condition['kind'];
      if (!has(CONDITION_CONTEXT, kind)) { issue(path, `condition:${kind}`); return; }
      dep(CONDITION_CONTEXT[kind]); dep(`condition:${kind}`);
      context('race', value.race); context('kingdom', value.kingdom); color(value.color);
      context('region', value.region); context('currency', value.currency);
      if (kind === 'troopPresent') context('namedUnit', value.name);
      if (value.side) dep(`context:teamFilter:${value.side}`);
      if (kind === 'lastTargetStatusAtCastStart' || kind === 'castStartBoardAtLeast') dep('context:castStart');
      if (kind === 'not') condition(value.cond, `${path}.cond`);
      if (kind === 'anyOf' || kind === 'allOf') {
        if (!Array.isArray(value.of)) issue(path, 'invalidConditions');
        else value.of.forEach((v, i) => condition(v, `${path}.of[${i}]`));
      }
    });
  }
  function source(value: unknown, path: string): void {
    if (!data(value) || typeof value.kind !== 'string') { issue(path, 'invalidSource'); return; }
    const kind = value.kind as ModifierSource['kind'];
    if (!has(SOURCE_CONTEXT, kind)) { issue(path, `source:${kind}`); return; }
    dep(SOURCE_CONTEXT[kind]); dep(`source:${kind}`);
    context('race', value.race); context('kingdom', value.kingdom);
    if (kind === 'alliesNamed') context('namedUnit', value.name);
    color(value.color); color(value.except);
    if (value.atCastStart === true || kind.includes('AtCastStart') || kind.startsWith('castStart')) dep('context:castStart');
    if (value.side) dep(`context:teamFilter:${value.side}`);
    if (value.anchor === 'chosenCell' || kind === 'chosenCellBlockGems') dep('input:cell');
  }
  function modifier(value: unknown, path: string): void {
    if (!data(value)) { issue(path, 'invalidModifier'); return; }
    if (!data(value.mod) || !['multiplier', 'ratio'].includes(String(value.mod.kind))) issue(`${path}.mod`, 'unknownModifier');
    // Runtime precedence: shadowed sources introduce no dependencies.
    if (Array.isArray(value.sourceGroups)) {
      value.sourceGroups.forEach((group, i) => {
        if (!Array.isArray(group)) issue(`${path}.sourceGroups[${i}]`, 'invalidGroup');
        else group.forEach((s, j) => source(s, `${path}.sourceGroups[${i}][${j}]`));
      });
    } else if (Array.isArray(value.sources)) value.sources.forEach((s, i) => source(s, `${path}.sources[${i}]`));
    else if (value.source !== undefined) source(value.source, `${path}.source`);
    else issue(path, 'missingSource');
  }
  function probability(value: unknown, path: string): void {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) issue(path, 'invalidChance');
    else if (value === 0) dep('condition:never');
    else if (value < 1) dep('random:chance');
  }
  function common(value: Data, path: string): void {
    if (value.targetRace) { context('race', value.targetRace); dep('context:targetFilter:race'); }
    if (value.targetKingdom !== undefined) { context('kingdom', value.targetKingdom); dep('context:targetFilter:kingdom'); }
    context('race', value.raceDouble);
    for (const key of ['modifier', 'chanceBoost', 'perCount', 'countModifier']) {
      if (value[key] !== undefined) modifier(value[key], `${path}.${key}`);
    }
    if (Array.isArray(value.modifiers)) value.modifiers.forEach((m, i) => modifier(m, `${path}.modifiers[${i}]`));
    if (value.chanceBoost !== undefined) dep('random:boostedChance');
    if (value.ifCond !== undefined) condition(value.ifCond, `${path}.ifCond`);
    for (const key of ['condMult', 'condBonus', 'chanceMult']) {
      if (data(value[key])) condition(value[key].cond, `${path}.${key}.cond`);
      else if (value[key] !== undefined) issue(`${path}.${key}`, 'invalidConditional');
    }
    probability(value.chance, `${path}.chance`);
    if (value.ifTargetDied === true) dep('order:targetDied');
    if (enabled(value.fromPrevious)) dep('order:fromPrevious');
    if (value.nRange !== undefined || value.rangeSpec !== undefined || value.countRange !== undefined) dep('random:range');
    if (data(value.scaling) && typeof value.scaling.mult === 'number' && value.scaling.mult !== 0) dep('context:casterMagic');
  }
  function gem(value: unknown, path: string): void {
    if (!data(value)) { issue(path, 'invalidGemParams'); return; }
    const op = value.op;
    if (!['create', 'transform', 'clear'].includes(String(op))) { issue(path, `gemOp:${op}`); return; }
    dep('context:board'); common(value, path);
    if (op === 'create') {
      family('active', 'gemCreate');
      if (!data(value.gem)) { issue(`${path}.gem`, 'invalidGem'); return; }
      const spec = value.gem;
      if (!['color', 'skull', 'mix', 'special', 'mixSpecial', 'mixAny'].includes(String(spec.kind))) issue(`${path}.gem`, `gemKind:${spec.kind}`);
      color(spec.color);
      if (Array.isArray(spec.colors)) spec.colors.forEach(color);
      if (data(spec.spec)) color(spec.spec.color);
      if (Array.isArray(spec.specs)) spec.specs.forEach(s => { if (data(s)) color(s.color); });
      if (Array.isArray(spec.entries)) spec.entries.forEach(s => { if (data(s)) color(s.color); else color(s); });
    } else if (op === 'transform') {
      family('active', 'gemTransform');
      if (value.from === 'CELL' || value.diagonalAnchor === 'chosenCell') dep('input:cell');
      else if (value.from !== 'ANY') color(value.from);
      color(value.to);
      if (data(value.toSpecial)) color(value.toSpecial.color);
    } else {
      if (!['destroy', 'explode', 'remove'].includes(String(value.mode))) issue(path, `clearMode:${value.mode}`);
      else family('active', `gem${String(value.mode)[0].toUpperCase()}${String(value.mode).slice(1)}`);
      if (!data(value.target)) { issue(`${path}.target`, 'invalidClearTarget'); return; }
      const t = value.target;
      if (!['lines', 'chosenLine', 'randomLines', 'color', 'allColors', 'skulls', 'allGems', 'special', 'randomGems', 'cell', 'area', 'chosenCross', 'lastDestroyedLine'].includes(String(t.kind))) issue(`${path}.target`, `clearTarget:${t.kind}`);
      targets.add(`board:${t.kind}`); color(t.color);
      if (Array.isArray(t.colors)) t.colors.forEach(color);
      if (t.kind === 'chosenLine') dep(`input:${t.orientation}`);
      if (t.kind === 'chosenCross' || t.cell === 'CELL' || t.center === 'CELL') dep('input:cell');
      if (t.kind === 'area' && t.center === undefined) dep('input:cell');
      if (t.kind === 'lastDestroyedLine') dep('order:lastDestroyed');
      if (t.kind === 'randomLines' || t.kind === 'randomGems' || t.center === 'RANDOM') dep('random:board');
    }
  }
  function summonSource(value: unknown, path: string): void {
    if (!data(value)) { issue(path, 'invalidSummonSource'); return; }
    if (typeof value.ref === 'string') context('ref', value.ref);
    else if (Array.isArray(value.randomOf)) { context('ref', value.randomOf); dep('random:summon'); }
    else if (value.randomOfKingdom !== undefined) { context('kingdom', value.randomOfKingdom); dep('random:summon'); }
    else if (data(value.template)) dep('context:summonTemplate');
    else issue(path, 'unknownSummonSource');
  }
  function sequence(value: unknown, path: string): void {
    if (!Array.isArray(value)) { issue(path, 'invalidSegments'); return; }
    if (ancestors.has(value)) { issue(path, 'cycle'); return; }
    ancestors.add(value);
    if (value.length > 1) dep('order:segments');
    try { value.forEach((s, i) => segment(s, `${path}[${i}]`)); }
    finally { ancestors.delete(value); }
  }
  function segment(value: unknown, path: string): void {
    const tag = data(value) && typeof value.kind === 'string' && has(ACTIVE_FAMILIES, value.kind)
      ? `active:${ACTIVE_FAMILIES[value.kind as EffectSegment['kind']]}` : null;
    withDiagnosticContext(tag, path, tag ?? 'active', () => {
      if (!data(value) || typeof value.kind !== 'string') { issue(path, 'invalidSegment'); return; }
      guarded(value, path, () => {
        const kind = value.kind as EffectSegment['kind'];
        if (!has(ACTIVE_FAMILIES, kind)) {
          issue(path, `activeKind:${kind}`);
          if (Array.isArray(value.options)) value.options.forEach((s, i) => sequence(s, `${path}.options[${i}]`));
          return;
        }
        for (const key of Object.keys(value)) {
          // Native gem builders mirror opts.modifier onto the segment as metadata.
          // The executor reads params.modifier; accept only an identical mirror,
          // so a modifier which would be silently ignored is still a rule gap.
          if (kind === 'gem' && key === 'modifier' && data(value.params) && value.params.modifier !== undefined) {
            try { if (stableJson(value.modifier) === stableJson(value.params.modifier)) continue; }
            catch { issue(`${path}.${key}`, 'invalidModifierMirror'); continue; }
          }
          if (!(EFFECT_FIELDS[kind] as readonly string[]).includes(key) && key !== 'fromPrevious') issue(`${path}.${key}`, 'activeField');
        }
        family('active', ACTIVE_FAMILIES[kind]); common(value, path);
        if (value.target !== undefined) target(value.target, `${path}.target`);
        if (kind === 'oneOf' || kind === 'choose') {
          family('active', 'branch'); dep(kind === 'oneOf' ? 'random:branch' : 'input:branch');
          if (!Array.isArray(value.options)) issue(path, 'invalidBranches');
          else value.options.forEach((s, i) => sequence(s, `${path}.options[${i}]`));
        }
        if (kind === 'damage') {
          for (const key of ['trueDamage', 'manaBurn', 'drain', 'execute', 'splitRandom']) if (value[key] === true) family('active', key);
          if (enabled(value.splashRatio) || enabled(value.splashChances)) family('active', 'splash');
          if (enabled(value.split) || value.splitRandom === true) family('active', 'splitDamage');
          if (enabled(value.randomWaves)) { dep('random:damageWaves'); dep('order:previousPick'); }
          if (enabled(value.splashChances)) dep('random:splash');
          if (value.range !== undefined) dep('random:range');
        }
        if (kind === 'buff' || kind === 'reduce') {
          context('stat', value.stat);
          if (value.stat === 'mana') family('active', kind === 'buff' ? 'manaGain' : 'manaDrain');
          if (value.stat === 'hp' && kind === 'buff') family('active', value.lifeMode === 'heal' || value.full === true ? 'heal' : 'lifeGain');
          if (kind === 'reduce' && enabled(value.gainStat)) { family('active', 'steal'); dep('effect:bothSides'); }
          if (kind === 'buff' && value.double === true) family('active', 'statDouble');
          if (kind === 'reduce' && enabled(value.times)) dep('order:repeatedReduce');
        }
        if (kind === 'randomStat' || kind === 'randomStatus') dep('random:effect');
        if (kind === 'status' && data(value.perDestroyed)) { dep('order:destroyedGems'); color(value.perDestroyed.color); }
        if (kind === 'gem') gem(value.params, `${path}.params`);
        if (kind === 'storm') { color(value.color); color(value.color2); }
        if (kind === 'summon') {
          if (!data(value.params)) issue(`${path}.params`, 'invalidSummonParams');
          else { common(value.params, `${path}.params`); summonSource(value.params.source, `${path}.params.source`); }
        }
        if (kind === 'transformTroop') {
          context('ref', value.ref); context('ref', value.randomOf);
          if (value.randomOf !== undefined) dep('random:transform');
          if (value.copyOf !== undefined) target(value.copyOf, `${path}.copyOf`);
        }
        if (kind === 'swapPositions') { target(value.a, `${path}.a`); target(value.b, `${path}.b`); dep('order:formation'); }
        if (kind === 'shuffleTeam') { targets.add(value.side === 'ally' ? 'allyAll' : 'enemyAll'); dep('random:formation'); dep('order:formation'); }
        if (kind === 'reposition') dep('order:formation');
        if (kind === 'selfRevive') dep('order:selfDeath');
        if (kind === 'escapeChance') probability(value.escapeChance, `${path}.escapeChance`);
        if (kind === 'gainEconomy' || kind === 'spendEconomy') context('currency', value.currency);
        if (kind === 'stealGold') { context('currency', 'gold'); dep('effect:bothSides'); if (value.deferCredit === true) dep('order:deferredCredit'); }
      });
    });
  }
  function traitDetails(value: unknown, key: string, path: string, summon: boolean): void {
    if (Array.isArray(value)) { value.forEach((v, i) => traitDetails(v, key, `${path}[${i}]`, summon)); return; }
    if (!data(value)) return;
    guarded(value, path, () => {
      probability(value.chance, `${path}.chance`);
      for (const k of ['color', 'gemColor', 'colors']) {
        const v = value[k]; if (Array.isArray(v)) v.forEach(color); else color(v);
      }
      if (value.troopType && value.troopType !== 'all') { context('type', value.troopType); dep('context:teamFilter:type'); }
      if (value.trait) { context('trait', value.trait); dep('context:teamFilter:trait'); }
      if (value.scope !== undefined) {
        const scope = String(value.scope);
        if (FILTER_SCOPE_KEYS.has(key)) {
          dep('context:teamFilter:ally');
          if (scope !== 'all') { if (COLORS.has(scope)) color(scope); else context('type', scope); }
        } else if (has(SCOPE_TARGETS, scope)) target(SCOPE_TARGETS[scope], `${path}.scope`);
        else issue(`${path}.scope`, `scope:${scope}`);
      }
      if (typeof value.target === 'string') {
        if (has(SCOPE_TARGETS, value.target)) target(SCOPE_TARGETS[value.target], `${path}.target`);
        else if (key === 'vsAscendedMultiplier') context('enemyRole', value.target);
        else issue(`${path}.target`, `scope:${value.target}`);
      }
      if (summon) context('ref', value.referenceName);
      if (value.randomPositive === true || value.randomNegative === true || enabled(value.randomMissingStatusCount)) dep('random:status');
      if (value.minSize !== undefined) dep(`context:matchSize:${value.minSize}`);
      if (value.position !== undefined) dep(`context:position:${value.position}`);
      if (value.phase !== undefined) dep(`context:pvpPhase:${value.phase}`);
      if (value.currency !== undefined) context('currency', value.currency);
      // Storm referenceName/displayName are presentation metadata, not summon references.
      if (data(value.storm)) traitDetails(value.storm, key, `${path}.storm`, false);
    });
  }

  for (const key of Object.keys(prototype)) {
    if (!['segments', 'inputTarget', 'oncePerBattle'].includes(key)) issue(`prototype.${key}`, 'prototypeField');
  }
  if (prototype.inputTarget !== undefined) { target(prototype.inputTarget, 'prototype.inputTarget'); dep('input:target'); }
  if (prototype.oncePerBattle === true) dep('context:oncePerBattle');
  sequence(prototype.segments, 'prototype.segments');
  traits.forEach((trait, i) => {
    for (const [key, value] of Object.entries(trait)) {
      if (['code', 'name', 'description', 'troops'].includes(key)) continue;
      const path = `traits[${i}].${key}`;
      const rule: TraitRule | undefined = has(TRAIT_RULES, key) ? TRAIT_RULES[key as TraitKey] : undefined;
      withDiagnosticContext(rule ? `trait:${rule[0]}` : null, path, `trait:${key}`, () => {
        if (!rule) { issue(path, 'traitField'); return; }
        if (!enabled(value)) return;
        const shape = TRAIT_SHAPES[key as TraitKey];
        const actual = Array.isArray(value) ? 'array' : typeof value;
        if (actual !== shape || (shape === 'number' && !Number.isFinite(value))) { issue(path, 'invalidTraitValue'); return; }
        const [tag, trigger, defaultTarget] = rule;
        family('trait', tag);
        if (trigger) dep(`trigger:${trigger}`);
        if (defaultTarget && !(data(value) && (value.scope !== undefined || value.target !== undefined))) {
          if (TARGET_SET.has(defaultTarget)) target(defaultTarget, path); else targets.add(defaultTarget);
        }
        traitDetails(value, key, path, tag === 'summon');
        if (['dodgeChance', 'armorPierceChance', 'skullLethalChance'].includes(key)) probability(value, path);
        if (key === 'mode') context('mode', value);
        if (key.startsWith('pvp')) context('mode', 'pvp');
        if (key.startsWith('onDelve')) context('mode', 'delve');
        if (key === 'perAllyColor') dep('context:teamFilter:ally:color');
        if (key === 'skullMultVsTroopType') dep('context:targetFilter:type');
        if (key === 'skullMultVsStatus' || key === 'skullMultVsStatusList') dep('context:targetStatus');
        if (key === 'skullMultVsWounded') dep('context:targetHp');
      });
    }
  });
  if ([...targets].some(t => t.startsWith('enemy')) && [...targets].some(t => t.startsWith('ally'))) dep('effect:bothSides');
  const sortedUnknown = [...unknown].sort();
  return {
    families: [...families].sort(), targets: [...targets].sort(), dependencies: [...dependencies].sort(),
    unknown: sortedUnknown, unknownDetails: sortedUnknown.map(detail => unknownDetails.get(detail)!),
  };
}
