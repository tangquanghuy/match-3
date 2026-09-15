/**
 * 放映厅队伍装配工厂（窗口 G）。
 *
 * 全部走 AIRP 契约（src/session/contract.ts 的 BattleRequest）——App.init(mount, request)
 * 的正门入口。技能/特质清单从数据文件现场读，E 的内容批次落库后自动扩入——扩展口子。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** @returns {{spells: Map<number, {id:number,name:string,desc:string,troopName:string,kingdom:string,rarity:string,troopTypes:string[]}>, traitNames: Map<string,{name:string,description:string}>}} */
export function loadContentIndex() {
  const troops = JSON.parse(readFileSync(`${ROOT}/src/data/troops.json`, 'utf8'));
  const traits = JSON.parse(readFileSync(`${ROOT}/src/data/traits.json`, 'utf8'));
  const spells = new Map();
  for (const troop of troops) {
    const sp = troop.spell;
    if (!sp || spells.has(sp.id)) continue;
    spells.set(sp.id, {
      id: sp.id,
      name: sp.name || `(技能 ${sp.id})`,
      desc: sp.description || '',
      troopName: troop.name || '',
      kingdom: troop.kingdom || '',
      rarity: troop.rarity || '',
      troopTypes: troop.troopTypes || [],
    });
  }
  const traitNames = new Map();
  for (const t of traits) {
    traitNames.set(t.code, { name: t.name || t.code, description: t.description || '' });
  }
  return { spells, traitNames };
}

/** App.init 里登记的 30 个 GoW 种族（与 render/App.ts knownTroopTypes 同源，只读对齐） */
export const RACES = [
  'Beast', 'Fey', 'Elemental', 'Dragon', 'Human', 'Daemon', 'Divine', 'Monster',
  'Knight', 'Construct', 'Wildfolk', 'Rogue', 'Elf', 'Wargare', 'Giant', 'Undead',
  'Centaur', 'Goblin', 'Raksha', 'Mystic', 'Stryx', 'Naga', 'Merfolk', 'Urska',
  'Dwarf', 'Tauros', 'Orc', 'Mech', 'Gnome', 'Immortal',
];

export const TIERS = ['minion', 'elite', 'boss', 'lord', 'legendary'];

const TIER_ZH = { minion: '杂兵', elite: '精英', boss: '首领', lord: '领主', legendary: '传奇' };

/** 阶级→大致数值曲线（仅供放映，不参与平衡） */
const TIER_STATS = {
  minion: { hp: 40, attack: 8, armor: 2, magic: 1 },
  elite: { hp: 60, attack: 12, armor: 4, magic: 2 },
  boss: { hp: 90, attack: 16, armor: 6, magic: 3 },
  lord: { hp: 120, attack: 20, armor: 8, magic: 4 },
  legendary: { hp: 160, attack: 24, armor: 10, magic: 6 },
};

const ALL_COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'];

function char({
  externalId, name, tier, troopTypes, skillId, traitIds, manaCost = 6, magic, hp, attack, armor,
}) {
  const stats = TIER_STATS[tier] || { hp: 70, attack: 12, armor: 4, magic: 3 };
  return {
    externalId,
    name,
    stats: {
      hp: hp ?? stats.hp,
      attack: attack ?? stats.attack,
      armor: armor ?? stats.armor,
      magic: magic ?? stats.magic,
    },
    troopTypes,
    manaColors: [ALL_COLORS[externalId.length % 6], ALL_COLORS[(externalId.length + 2) % 6]],
    manaCost,
    ...(tier ? { tier } : {}),
    ...(skillId !== undefined ? { skillId } : {}),
    ...(traitIds !== undefined ? { traitIds } : {}),
  };
}

/** 通用战斗请求壳 */
function makeRequest({ battleId, seed, playerTeam, enemyTeam }) {
  return {
    schemaVersion: 1,
    battleId,
    requestId: battleId,
    rulesetVersion: '1.0.0',
    seed,
    playerTeam,
    enemyTeam,
  };
}

/** 特质放映：双方同族（族亲光环有受益对象），特质 code 挂满我方 4 人 */
export function traitScenarioRequest(code, seed) {
  const race = raceForTrait(code);
  const playerTeam = [0, 1, 2, 3].map((i) => char({
    externalId: `trait-${code}-p${i}`,
    name: i === 0 ? `${code}·载体` : `${code}·队友${i}`,
    tier: 'elite',
    troopTypes: [race],
    skillId: '7004',
    traitIds: [code],
    manaCost: 4,
  }));
  const enemyTeam = [0, 1, 2, 3].map((i) => char({
    externalId: `trait-${code}-e${i}`,
    name: `陪练${i}`,
    tier: 'elite',
    troopTypes: [race],
    skillId: '7004',
    traitIds: [],
    manaCost: 4,
  }));
  return makeRequest({ battleId: `theater-trait-${code}`, seed, playerTeam, enemyTeam });
}

/** 敌人放映：probe 我方（干净无特质）vs 同阶级同种族敌 4 人（skillId/traitIds 省略 → assigner 自动编配） */
export function enemyScenarioRequest(tier, race, seed) {
  const playerTeam = [0, 1, 2, 3].map((i) => char({
    externalId: `probe-p${i}`,
    name: `探针${i}`,
    tier: 'elite',
    troopTypes: ['Human'],
    skillId: '7004',
    traitIds: [],
    manaCost: 4,
  }));
  const enemyTeam = [0, 1, 2, 3].map((i) => char({
    externalId: `${tier}-${race}-${i}`,
    name: `${TIER_ZH[tier]}·${race} ${i}`,
    tier,
    troopTypes: [race],
    skillId: undefined,
    traitIds: undefined,
  }));
  return makeRequest({ battleId: `theater-enemy-${tier}-${race}`, seed, playerTeam, enemyTeam });
}

/** 族亲类特质按名字归族，保证光环有同族受益对象 */
export function raceForTrait(code) {
  const c = code.toLowerCase();
  if (c.includes('knight')) return 'Knight';
  if (c.includes('beast') || c.includes('wolf') || c.includes('lycan')) return 'Beast';
  if (c.includes('urska')) return 'Urska';
  if (c.includes('daemon') || c.includes('infernal') || c.includes('imp')) return 'Daemon';
  if (c.includes('divine') || c.includes('holy') || c.includes('angel')) return 'Divine';
  if (c.includes('undead') || c.includes('bone') || c.includes('skeleton')) return 'Undead';
  if (c.includes('dragon')) return 'Dragon';
  if (c.includes('elf')) return 'Elf';
  if (c.includes('dwarf')) return 'Dwarf';
  if (c.includes('goblin')) return 'Goblin';
  if (c.includes('giant')) return 'Giant';
  if (c.includes('naga')) return 'Naga';
  if (c.includes('merfolk')) return 'Merfolk';
  if (c.includes('elemental')) return 'Elemental';
  if (c.includes('construct') || c.includes('mech') || c.includes('machine')) return 'Construct';
  if (c.includes('fey') || c.includes('fairy')) return 'Fey';
  return 'Human';
}

export function encodeRequest(request) {
  return Buffer.from(JSON.stringify(request), 'utf8').toString('base64url');
}
