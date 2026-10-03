/**
 * 职业天赋 → 引擎动态特质定义（主角系统 v3）。
 *
 * classes.json 里 effect.kind==='unimplemented' 的 56 条天赋，在这里逐条编译成与
 * traits.json 同构的 TraitDefinition，code = 天赋 code 本身；经
 * registerDynamicTraits 注册后，引擎全部既有钩子（大连/配色/死亡/回合开始/召唤/开局）
 * 对它们零改动生效——battleBridge 把选中天赋的 code 塞进主角快照 traitIds 即可。
 *
 * 纪律（与上一批别名一致）：数值/触发点/目标必须与官方描述逐字对应；
 * 召唤目标经 troops.json 按 ReferenceName 解析，缺兵种直接抛错（构建期发现）。
 */
import { getTroopById, type TroopData } from '../../data/troops';
import { BaseColor } from '../../engine/types';
import type { TraitDefinition } from '../../engine/traits';

// 召唤目标静态解析（构建期手数，troops.json 实测）：
// Bandit=6353 强盗 / SisterOfShadows=6477 暗影姐妹 / Hellspawn=6389 地狱再生魔 /
// AncientGolem=6398 远古魔像 / Heronath=6331 赫洛娜丝 / Nightmare=6568 梦魇马 /
// GiantSpider=6110 巨型蜘蛛。
const SUMMON = {
  bandit: { troopId: 6353, referenceName: 'Bandit', displayName: '强盗' },
  sisterOfShadows: { troopId: 6477, referenceName: 'SisterOfShadows', displayName: '暗影姐妹' },
  hellspawn: { troopId: 6389, referenceName: 'Hellspawn', displayName: '地狱再生魔' },
  ancientGolem: { troopId: 6398, referenceName: 'AncientGolem', displayName: '远古魔像' },
  heronath: { troopId: 6331, referenceName: 'Heronath', displayName: '赫洛娜丝' },
  nightmare: { troopId: 6568, referenceName: 'Nightmare', displayName: '梦魇马' },
  giantSpider: { troopId: 6110, referenceName: 'GiantSpider', displayName: '巨型蜘蛛' },
} as const;

/** 数据一致性护栏（导入期执行一次）：召唤目标必须真实存在 */
function assertSummonTargets(): void {
  for (const spec of Object.values(SUMMON)) {
    const troop: TroopData | undefined = getTroopById(spec.troopId);
    if (!troop) throw new Error(`召唤目标兵种不存在：${spec.referenceName}`);
  }
}
assertSummonTargets();

/**
 * 56 条未实现天赋的动态定义表（2026-09-18 批）。
 * 每条注明官方原文；回合数惯例沿用 traits.json 同类特质（大连/配色/开局均 3）。
 */
export const TALENT_DYNAMIC_DEFS: readonly TraitDefinition[] = [
  // —— 自身回合/事件数值（既有键，数值对齐官方原文）——
  { code: 'fasthealing', name: '快速愈合', description: 'Recover 2 Life every turn.', regen: { stat: 'hp', amount: 2 } },
  { code: 'vengeance', name: '复仇', description: 'Gain 3 Attack when an enemy dies.', onEnemyDeathGain: { stat: 'attack', amount: 3 } },
  { code: 'counterattack', name: '反击', description: 'Gain 2 attack when I take damage.', onDamagedGain: { stat: 'attack', amount: 2 } },
  { code: 'delirium', name: '谵妄', description: 'Gain 2 Magic and Attack when I take damage to Life.', onDamagedGain: { stat: 'magic', amount: 2, alsoStats: ['attack'] } },
  { code: 'healingherb', name: '治愈药草', description: 'Gain 4 Life when matching Green Gems.', onColorMatchGain: { color: 'Green', stat: 'hp', amount: 4 } },
  { code: 'darkhunger', name: '暗饥', description: 'Steal 1 Life from the first enemy when matching Purple Gems.', onColorMatchDrain: { color: BaseColor.Purple, amount: 1 } },
  { code: 'lightfingers', name: '妙手', description: 'Gain 5 Gold every turn.', turnStartEconomy: { currency: 'gold', amount: 5 } },
  { code: 'soulcaller', name: '唤魂者', description: 'Gain 1 Soul every turn.', turnStartEconomy: { currency: 'souls', amount: 1 } },
  // —— 事件→全队数值光环（既有键， lordofdeath/virtueofjustice 族）——
  { code: 'mysticchannel', name: '秘术导流', description: 'All Mystics gain 2 Magic and Life when an enemy dies.', onEnemyDeathTypeAura: { troopType: 'Mystic', gains: { magic: 2, hp: 2 } } },
  { code: 'aquaticglory', name: '海族荣光', description: 'All Merfolk allies gain 2 Magic when an enemy dies.', onEnemyDeathTypeAura: { troopType: 'Merfolk', gains: { magic: 2 } } },
  { code: 'unholyblessing', name: '邪恶祝福', description: 'All Undead gain 2 Armor and Magic when an ally dies.', onAllyDeathTypeAura: { troopType: 'Undead', gains: { armor: 2, magic: 2 } } },
  { code: 'lordofstorms', name: '风暴之主', description: 'Elementals gain 1 Magic when an ally casts a spell.', onAllyCastTypeAura: { troopType: 'Elemental', gains: { magic: 1 } } },
  { code: 'brilliantaura', name: '光辉灵气', description: 'All allies gain 2 Life on 4 or 5 Gem matches.', onBigMatchTypeAura: { troopType: 'all', gains: { hp: 2 } } },
  { code: 'thievesguild', name: '盗贼公会', description: 'All Rogues gain 1 Magic on 4 or 5 of a kind.', onBigMatchTypeAura: { troopType: 'Rogue', gains: { magic: 1 } } },
  // —— 每回合全队数值光环（既有键 turnStartTypeAura，8 条）——
  { code: 'eternalsummer', name: '永恒盛夏', description: 'All Fey Allies gain 2 Life every turn.', turnStartTypeAura: { scope: 'Fey', gains: { hp: 2 } } },
  { code: 'harvestmoon', name: '收获之月', description: 'All Wargare Allies gain 2 Life every turn.', turnStartTypeAura: { scope: 'Wargare', gains: { hp: 2 } } },
  { code: 'shadowscales', name: '暗影鳞片', description: 'All Naga Allies gain 1 Armor every turn.', turnStartTypeAura: { scope: 'Naga', gains: { armor: 1 } } },
  { code: 'stryxcommander', name: '鸟族指挥官', description: 'All Stryx allies gain 1 Attack every turn.', turnStartTypeAura: { scope: 'Stryx', gains: { attack: 1 } } },
  { code: 'urskamajor', name: '厄什卡大军', description: 'All Urska Allies gain 1 Attack every turn.', turnStartTypeAura: { scope: 'Urska', gains: { attack: 1 } } },
  { code: 'bullgeneral', name: '牛头将军', description: 'All Tauros allies gain 1 Attack every turn.', turnStartTypeAura: { scope: 'Tauros', gains: { attack: 1 } } },
  { code: 'divinity', name: '神性', description: 'All Divine Allies gain 2 Life every turn.', turnStartTypeAura: { scope: 'Divine', gains: { hp: 2 } } },
  { code: 'armorplating', name: '装甲镀层', description: 'All Mech Allies gain 2 Armor per turn.', turnStartTypeAura: { scope: 'Mech', gains: { armor: 2 } } },
  // —— 开局法力（既有键 allyStartMana 泛化 scope）——
  { code: 'windspeed', name: '风速', description: 'All Yellow Allies start with 10% Mana.', allyStartMana: { scope: 'Yellow', ratio: 0.1 } },
  { code: 'inspiration', name: '鼓舞', description: 'All Allies start with 15% Mana.', allyStartMana: { scope: 'all', ratio: 0.15 } },
  // —— 配色/大匹配触发（既有键）——
  { code: 'hunt', name: '狩猎', description: "Hunter's Mark a random enemy on 4 or 5 of a kind.", onBigMatchStatus: { scope: 'randomEnemy', statuses: [{ id: 'marked' }], turns: 3 } },
  { code: 'bloodthirsty', name: '嗜血', description: 'Become enraged on 4 or 5 Gem matches.', onBigMatchStatus: { scope: 'self', statuses: [{ id: 'rage' }], turns: 3 } },
  { code: 'deluge', name: '泛滥', description: 'Submerge a random ally on 4 or 5 Gem matches.', onBigMatchStatus: { scope: 'randomAlly', statuses: [{ id: 'submerged' }], turns: 3 } },
  { code: 'darkvenom', name: '暗毒', description: 'Poison a random Enemy when matching purple Gems.', onColorMatchStatus: { color: BaseColor.Purple, scope: 'randomEnemy', statuses: [{ id: 'poison', magnitude: 1 }], turns: 3 } },
  { code: 'rocksolid', name: '磐石', description: 'Gain a Barrier when matching Brown Gems.', onColorMatchStatus: { color: BaseColor.Brown, scope: 'self', statuses: [{ id: 'barrier' }], turns: 3 } },
  { code: 'treeofknowledge', name: '智慧之树', description: 'Gain Enchant when matching Green Gems.', onColorMatchStatus: { color: BaseColor.Green, scope: 'self', statuses: [{ id: 'enchanted' }], turns: 3 } },
  // —— 防御/受击（既有键）——
  { code: 'dodge', name: '闪避', description: '30% chance to dodge Skull damage.', dodgeChance: 0.3 },
  { code: 'antimagicsphere', name: '反魔法领域', description: 'Reduce damage from Spells by 20%.', spellDamageReduction: 0.2 },
  { code: 'impact', name: '冲击', description: 'Inflict Stun when enemies deal Skull damage to me.', inflictOnSkullDamaged: { id: 'stun', turns: 3 } },
  // —— 召唤类（既有键，目标经 troops.json 解析）——
  { code: 'backup', name: '后援', description: '35% chance to summon a Bandit when an ally dies.', summonOnAllyDeath: { chance: 0.35, ...SUMMON.bandit } },
  { code: 'shadowscall', name: '暗影呼唤', description: '20% chance to summon a Sister of Shadows when an enemy dies.', summonOnEnemyDeath: { chance: 0.2, ...SUMMON.sisterOfShadows } },
  { code: 'spawnofhell', name: '地狱之子', description: '50% chance to summon a Hellspawn when an enemy dies.', summonOnEnemyDeath: { chance: 0.5, ...SUMMON.hellspawn } },
  // —— 新键批（本批引擎新增；定义直读/编译键见 traits.ts 字段注）——
  { code: 'vanguard', name: '先锋', description: 'Gain Barrier at the start of battle.', battleStartStatus: { target: 'self', statuses: [{ id: 'barrier' }], turns: 3 } },
  { code: 'roottrap', name: '根须陷阱', description: 'Entangle the first enemy at the start of battle.', battleStartStatus: { target: 'firstEnemy', statuses: [{ id: 'entangle' }], turns: 3 } },
  { code: 'snapfreeze', name: '急冻', description: 'Freeze a random enemy at the start of battle.', battleStartStatus: { target: 'randomEnemy', statuses: [{ id: 'frozen' }], turns: 3 } },
  { code: 'swiftcurse', name: '疾速诅咒', description: 'Death Mark a random enemy at the start of battle.', battleStartStatus: { target: 'randomEnemy', statuses: [{ id: 'death-mark' }], turns: 3 } },
  { code: 'serendipity', name: '机缘巧合', description: 'Give a random ally a random status effect.', battleStartStatus: { target: 'randomAlly', statuses: [], turns: 3, randomPositive: true } },
  { code: 'golemprotector', name: '魔像守护', description: '20% chance to summon an Ancient Golem when I take damage to Life.', summonOnDamaged: { chance: 0.2, ...SUMMON.ancientGolem } },
  { code: 'childofsky', name: '天空之子', description: '25% chance to summon a Heronath when an ally casts a spell.', summonOnAllyCast: { chance: 0.25, ...SUMMON.heronath } },
  { code: 'razorarmor', name: '剃刀护甲', description: 'Add 20% of Armor to Skull Damage.', skullDamageFromArmorRatio: 0.2 },
  { code: 'banishment', name: '放逐', description: 'Dispel all enemies on 4 or 5 Gem matches.', onBigMatchDispelEnemies: true },
  { code: 'purification', name: '净化', description: 'Cleanse myself on 4 or 5 Gem matches.', onBigMatchCleanseSelf: true },
  { code: 'lifesiphon', name: '生命虹吸', description: 'Steal 2 Life from the first enemy on 4 or 5 Gem matches.', onBigMatchDrainLife: { amount: 2 } },
  { code: 'lightningstrike', name: '落雷', description: 'Explode 1 Yellow Gem on 4 or 5 Gem matches.', onBigMatchExplodeGem: { color: BaseColor.Yellow } },
  { code: 'chaosstorm', name: '混沌风暴', description: 'Summon a random storm on 4 or 5 Gem matches.', onBigMatchRandomStorm: {} },
  { code: 'hauntedweave', name: '闹鬼之织', description: 'Web a random enemy when I summon a troop.', onSelfSummonStatus: { statuses: [{ id: 'web' }], turns: 3 } },
  { code: 'savior', name: '救星', description: 'When an ally dies, Barrier another random ally.', onAllyDeathStatus: { target: 'randomAlly', statuses: [{ id: 'barrier' }], turns: 3 } },
  { code: 'feyvengeance', name: '妖精复仇', description: 'Faerie Fire a random enemy when an Ally dies.', onAllyDeathStatus: { target: 'randomEnemy', statuses: [{ id: 'faerie-fire' }], turns: 3 } },
  { code: 'upinflames', name: '烈火焚身', description: 'Burn a random enemy when an ally dies.', onAllyDeathStatus: { target: 'randomEnemy', statuses: [{ id: 'burning', magnitude: 1 }], turns: 3 } },
  { code: 'chillofdeath', name: '死亡寒意', description: 'When an enemy dies, Freeze another random enemy.', onEnemyDeathRandomStatus: { statuses: [{ id: 'frozen' }], turns: 3 } },
  { code: 'risingshadows', name: '暗影渐起', description: '7% chance to assassinate the last enemy when another enemy dies.', onEnemyDeathKill: { chance: 0.07, scope: 'lastEnemy' } },
  { code: 'chaoswave', name: '混沌之波', description: 'All enemies lose 1 point on a random skill when I match Skulls.', onSkullMatchEnemyDrain: { stat: 'random', amount: 1 } },
];

/**
 * 职业专属特质收编表（2026-09-18 第二批）：classes.json 中 implemented=false 的 38 条
 * 职业特质逐条编译（官方原文为准；回合数惯例同上批）。
 */
export const PERK_DYNAMIC_DEFS: readonly TraitDefinition[] = [
  // —— 既有键直收 ——
  { code: 'fullplate', name: '全身板甲', description: 'Gain 2 Armor every turn.', regen: { stat: 'armor', amount: 2 } },
  { code: 'divineaura', name: '神圣灵气', description: 'All allies heal 2 points per turn.', turnStartTypeAura: { scope: 'all', gains: { hp: 2 } } },
  { code: 'bardicinspiration', name: '吟游诗人之激励', description: 'All Yellow Allies gain 1 to all Stats at the start of each turn.', turnStartTypeAura: { scope: 'Yellow', gains: { hp: 1, armor: 1, attack: 1, magic: 1 } } },
  { code: 'barbaricfury', name: '蛮族狂怒', description: 'Gain 3 Attack when matching Red Gems.', onColorMatchGain: { color: BaseColor.Red, stat: 'attack', amount: 3 } },
  { code: 'goodkarma', name: '好因果', description: 'Gain 3 Mana when matching 4 or more Gems.', onBigMatchGain: { stat: 'mana', amount: 3 } },
  { code: 'hacknslash', name: '砍劈', description: 'Gain 3 Attack when dealing Skull damage.', onSkullHitGain: { stat: 'attack', amount: 3 } },
  { code: 'ward', name: '守护', description: 'All allies gain 5 Armor.', teamAura: { scope: 'allies', stat: 'armor', amount: 5 } },
  { code: 'nightsblessing', name: '夜之祝福', description: 'Give 2 Magic to all Mystic Allies when matching Purple.', onColorMatchTypeAura: { color: BaseColor.Purple, scope: 'Mystic', gains: { magic: 2 } } },
  { code: 'dwarvenmettle', name: '矮人勇气', description: 'All Dwarven allies gain 2 Life and Attack on 4 or 5 Gem matches.', onBigMatchTypeAura: { troopType: 'Dwarf', gains: { hp: 2, attack: 2 } } },
  { code: 'dragonsgrace', name: '龙族恩典', description: 'All ally Dragons gain 1 Life and Magic on 4 or 5 Gem matches.', onBigMatchTypeAura: { troopType: 'Dragon', gains: { hp: 1, magic: 1 } } },
  { code: 'monstrouskin', name: '怪物血亲', description: 'Give all Monster Allies 2 to all Skill Points on 4 or 5 Gem matches.', onBigMatchTypeAura: { troopType: 'Monster', gains: { hp: 2, armor: 2, attack: 2, magic: 2 } } },
  { code: 'contagion', name: '传染', description: 'Inflict Disease on a random Enemy on Green Gem matches.', onColorMatchStatus: { color: BaseColor.Green, scope: 'randomEnemy', statuses: [{ id: 'disease' }], turns: 3 } },
  { code: 'doomsight', name: '末日视野', description: '25% chance to Death Mark a random enemy when matching 4 or more Gems.', onBigMatchStatus: { scope: 'randomEnemy', statuses: [{ id: 'death-mark' }], turns: 3, chance: 0.25 } },
  { code: 'elementalforce', name: '元素之力', description: 'Inflict one random Stun, Freeze, Burn, or Entangle status not already present on a random Enemy when matching 4 or more Gems.', onBigMatchStatus: { scope: 'randomEnemy', statuses: [{ id: 'stun' }, { id: 'frozen' }, { id: 'burning', magnitude: 1 }, { id: 'entangle' }], turns: 3, randomMissingStatus: true } },
  { code: 'crashingwave', name: '碎浪', description: 'Explode a Blue Gem when matching 4 or more Gems.', onBigMatchExplodeGem: { color: BaseColor.Blue } },
  { code: 'sneakattack', name: '偷袭', description: 'Deal 7 damage to the last enemy on 4 or 5 matches.', onBigMatchDamage: { amount: 7, scope: 'lastEnemy' } },
  { code: 'manaflare', name: '法力闪耀', description: 'Gain 2 bonus Purple Mana when matching Purple Gems.', manaLink: { color: BaseColor.Purple, amount: 2 } },
  { code: 'highseas', name: '大海之途', description: 'Gain 2 bonus Blue Mana when matching Blue Gems.', manaLink: { color: BaseColor.Blue, amount: 2 } },
  { code: 'ensoul', name: '赋魂', description: 'Gain an extra Soul on 4 or 5 Gem matches.', onBigMatchEconomy: { currency: 'souls', amount: 1 } },
  // —— 开局法力族（allyStartMana 泛化 scope 后零钩子）——
  { code: 'bullishvigor', name: '牛头活力', description: 'All Tauros Allies start with 50% Mana.', allyStartMana: { scope: 'Tauros', ratio: 0.5 } },
  { code: 'clockwork', name: '发条机构', description: 'All Mech Allies start with 50% Mana.', allyStartMana: { scope: 'Mech', ratio: 0.5 } },
  { code: 'giantlord', name: '巨人领主', description: 'All Giant Allies start with 50% Mana.', allyStartMana: { scope: 'Giant', ratio: 0.5 } },
  { code: 'infusestone', name: '灌岩', description: 'All Construct Allies start with 50% Mana.', allyStartMana: { scope: 'Construct', ratio: 0.5 } },
  // —— 施法触发（既有 castStatus/castEnemyDrain）——
  { code: 'frostbite', name: '冻伤', description: '25% chance to Freeze a random enemy when an ally casts a spell.', onAllyCastStatus: { scope: 'randomEnemy', statuses: [{ id: 'frozen' }], turns: 3, chance: 0.25 } },
  { code: 'spiritdrain', name: '灵魂汲取', description: 'Drain 2 Mana from a random Enemy when an Ally casts a spell.', onAllyCastEnemyDrain: { stat: 'mana', amount: 2, scope: 'randomEnemy' } },
  // —— 召唤族 ——
  { code: 'hellsteed', name: '地狱坐骑', description: '25% chance to summon a Nightmare when an Ally casts a Spell.', summonOnAllyCast: { chance: 0.25, ...SUMMON.nightmare } },
  { code: 'familiar', name: '魔宠', description: '35% chance to summon a Giant Spider when I take damage.', summonOnDamaged: { chance: 0.35, ...SUMMON.giantSpider } },
  // —— 本批新增键 ——
  { code: 'wrathofanu', name: '阿努之怒', description: '50% chance to Stun a random enemy at the start of my turn.', turnStartStatus: { target: 'randomEnemy', statuses: [{ id: 'stun' }], turns: 3, chance: 0.5 } },
  { code: 'getbehindme', name: '躲我身后！', description: '25% chance to Barrier a random Ally at the start of my turn.', turnStartStatus: { target: 'randomAlly', statuses: [{ id: 'barrier' }], turns: 3, chance: 0.25 } },
  { code: 'ancientmysteries', name: '远古奥秘', description: '25% chance to grant a random Positive Status Effect to a random Ally when my turn begins.', turnStartStatus: { target: 'randomAlly', statuses: [], turns: 3, chance: 0.25, randomPositive: true } },
  { code: 'stormsoul', name: '风暴之魂', description: 'Conjure a Lightstorm when my turn begins.', turnStartStorm: { referenceName: 'Lightstorm', displayName: '光风暴', colors: [BaseColor.Yellow] } },
  { code: 'heatwave', name: '热浪', description: 'Create a Firestorm at the start of every turn.', turnStartStorm: { referenceName: 'Firestorm', displayName: '火风暴', colors: [BaseColor.Red] } },
  { code: 'portent', name: '征兆', description: 'All Centaurs gain 2 Magic when an enemy casts a spell.', onEnemyCastTypeAura: { troopType: 'Centaur', gains: { magic: 2 } } },
  { code: 'brutalstrike', name: '野蛮打击', description: 'Inflict Bleed on all Enemies when an Enemy dies.', onEnemyDeathEnemyAllStatus: { statuses: [{ id: 'bleed', magnitude: 1 }], turns: 3 } },
  { code: 'deathcurse', name: '死亡诅咒', description: 'Death Mark all enemies when I die.', onSelfDeathEnemyAllStatus: { statuses: [{ id: 'death-mark' }], turns: 3 } },
  { code: 'bullseye', name: '正中要害', description: '15% chance for Skull damage to be lethal.', skullLethalChance: 0.15 },
  { code: 'darkchannel', name: '暗黑导流', description: '50% chance to gain 1 Magic every turn.', turnStartChanceGain: { chance: 0.5, stat: 'magic', amount: 1 } },
  { code: 'assassinate', name: '猎杀', description: '10% Chance to assassinate the last enemy when I deal Skull damage.', onSkullHitKill: { chance: 0.1, scope: 'lastEnemy' } },
];

/**
 * PvP 天赋（exemplar/bloodandglory）：官方仅 PvP 战斗生效。本作以竞技场对战为 PvP
 * 场景（BattleRequest.mode='pvp'，bridge 按出敌来源注入）；荣耀币种不存在，
 * bloodandglory 设计值映射为黄金 1（官方单场荣耀个位数，量级一致）。
 */
export const PVP_DYNAMIC_DEFS: readonly TraitDefinition[] = [
  { code: 'exemplar', name: '典范', description: 'Gain 5 Attack in PvP Battles.', pvpBonus: { phase: 'battle', gains: { attack: 5 } } },
  { code: 'bloodandglory', name: '血与荣耀', description: 'Gain 1 Glory in PvP Battles.', pvpEconomyGain: { currency: 'gold', amount: 1 } },
];

/** 动态天赋 code 集合（talents/battleBridge/heroScreen 判断「未实现」徽标用） */
export const TALENT_DYNAMIC_CODES: ReadonlySet<string> = new Set(
  [...TALENT_DYNAMIC_DEFS, ...PERK_DYNAMIC_DEFS, ...PVP_DYNAMIC_DEFS].map((d) => d.code),
);
