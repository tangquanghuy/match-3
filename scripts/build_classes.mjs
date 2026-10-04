#!/usr/bin/env node
/**
 * 职业数据单源（窗口 J · 主角系统 v2）：
 *   data/raw/gow-2026-09-18/classes.en.json（gowhead 官方 38 职业）
 *   → src/meta/data/classes.json（双语 + 天赋效果编译 + 中文文案）
 *
 * 口径（官方规则，Infinity Plus 2 客服文档核实）：
 *   - 职业解锁 = 通关所属王国任务链（8 关）；
 *   - 冠军等级 1~100，胜场积经验；天赋档位 = 1/5/10/20/40/70/100 共 7 档，
 *     每档从 3 棵树的同级天赋里**选 1**（可随时改配）；
 *   - 职业专属特质 3 条，官方以魂石解锁，这里沿用 traitUnlockCost 的金+魂设计值；
 *   - 类武器官方为「该职业 250 胜解锁」，本仓库沿用职业等级解锁的合成武器（见 data/weapons.ts）。
 *
 * 天赋效果编译（TALENT_EFFECTS）：官方 119 条不同天赋逐条人工归类——
 *   kind=selfStat/selfStatIfPosition/selfStatIfWeapon/selfStatPerAlly（快照期自身静态）
 *   kind=alliesStat（快照期全队静态，scope=all/color/type）
 *   kind=xpBonus（结算期经验加成）  kind=pvp（无 PvP 模式，如实标注不适用）
 *   kind=trait（语义完全一致的已实现引擎特质别名；构建期断言 code 已实现）
 *   未列入表的 = 未实现（UI 灰显，审计计数在 classes.json summary）。
 * 别名纪律：触发点/目标/数值三者全对上才收（「4 或 5 颗」≡「4 颗或更多」视为同义）。
 */
import fs from 'node:fs';
import path from 'node:path';

const RAW = 'data/raw/gow-2026-09-18/classes.en.json';
const TROOPS = 'src/data/troops.json';
const TRAITS = 'src/data/traits.json';
const RAW_TROOPS_EN = 'data/raw/gow-2026-09-18/troops.en.json';
const OUT = 'src/meta/data/classes.json';

// ---------------------------------------------------------------------------
// 1. 王国映射：class.kid → troops.json 的中文王国名（经 gowhead 兵种 Id 桥接）
// ---------------------------------------------------------------------------
const rawTroopsEn = JSON.parse(fs.readFileSync(RAW_TROOPS_EN, 'utf8'));
const id2kid = new Map(rawTroopsEn.troops.map((t) => [t.Id, t.kid]));
const builtTroops = JSON.parse(fs.readFileSync(TROOPS, 'utf8'));
const troopList = Array.isArray(builtTroops) ? builtTroops : builtTroops.troops;
const kid2kingdom = new Map();
for (const t of troopList) {
  const kid = id2kid.get(t.id);
  if (kid != null && t.kingdom && !kid2kingdom.has(kid)) kid2kingdom.set(kid, t.kingdom);
}
const allKingdomNames = new Set(troopList.map((t) => t.kingdom).filter(Boolean));

// ---------------------------------------------------------------------------
// 2. 职业中文名 + 主角采纳的兵种类型
//    类型证据：该职业自己的族亲特质/天赋措辞（官方口径「主角采纳职业类型」）；
//    无字面证据的保持 Human（不硬猜），UI 与战斗按 Human 处理。
// ---------------------------------------------------------------------------
const CLASS_ZH = {
  nightweaver: '织夜者',
  spiritwalker: '灵行者',
  geomancer: '地卜师',
  elementalist: '元素使',
  doomsayer: '末日预言者',
  barbarian: '蛮族战士',
  monk: '武僧',
  stormcaller: '唤雷者',
  slayer: '猎杀者',
  archmagus: '大魔导士',
  invoker: '唤魔者',
  corsair: '海盗',
  tidecaller: '唤潮者',
  heirophant: '祭司长',
  dervish: '旋舞者',
  maskedlord: '哨兵',
  plaguelord: '瘟疫领主',
  shaman: '萨满',
  warpriest: '战争祭司',
  frostmage: '冰霜法师',
  thief: '盗贼',
  hunter: '日矛行者',
  runepriest: '符文祭司',
  dragonguard: '龙卫',
  bard: '吟游诗人',
  marauder: '泰坦',
  deathknight: '死亡骑士',
  oracle: '神谕者',
  orbweaver: '织球者',
  assassin: '刺客',
  mechanist: '机械师',
  necromancer: '死灵法师',
  sorcerer: '法师',
  archer: '弓箭手',
  priest: '牧师',
  warden: '守林人',
  knight: '骑士',
  warrior: '督军',
};
const CLASS_TROOP_TYPE = {
  nightweaver: 'Mystic',
  spiritwalker: 'Wargare',
  elementalist: 'Elemental',
  tidecaller: 'Merfolk',
  shaman: 'Tauros',
  bard: 'Wildfolk',
  marauder: 'Giant',
  deathknight: 'Undead',
  oracle: 'Centaur',
  mechanist: 'Mech',
  stormcaller: 'Stryx',
  dervish: 'Monster',
  // —— 字面证据不足，保持 Human（不硬猜） ——
  geomancer: 'Human',
  doomsayer: 'Human',
  barbarian: 'Human',
  slayer: 'Human',
  archmagus: 'Human',
  invoker: 'Human',
  corsair: 'Human',
  heirophant: 'Human',
  plaguelord: 'Human',
  warpriest: 'Human',
  frostmage: 'Human',
  hunter: 'Human',
  runepriest: 'Human',
  dragonguard: 'Human',
  thief: 'Human',
  assassin: 'Human',
  necromancer: 'Human',
  sorcerer: 'Human',
  archer: 'Human',
  priest: 'Human',
  warden: 'Human',
  knight: 'Human',
  warrior: 'Human',
};

// ---------------------------------------------------------------------------
// 3. 天赋效果编译表（119 条逐条裁定；未列出 = unimplemented）
// ---------------------------------------------------------------------------
const E = {
  self: (stat, amount) => ({ kind: 'selfStat', stat, amount }),
  selfPos: (position, stat, amount) => ({ kind: 'selfStatIfPosition', position, stat, amount }),
  selfAll: (position, amount) => ({ kind: 'selfStatIfPosition', position, stat: 'all', amount }),
  selfWeapon: (weaponType, stat, amount) => ({ kind: 'selfStatIfWeapon', weaponType, stat, amount }),
  selfPerAlly: (troopType, stat, amount) => ({ kind: 'selfStatPerAlly', troopType, stat, amount }),
  allies: (scope, stats) => ({ kind: 'alliesStat', scope, stats }),
  all: () => ({ kind: 'all' }),
  byColor: (color) => ({ kind: 'color', color }),
  byType: (troopType) => ({ kind: 'type', troopType }),
  trait: (code) => ({ kind: 'trait', code }),
};
const TALENT_EFFECTS = {
  // —— 自身静态 ——
  ferocity: E.self('attack', 4),
  resilience: E.self('health', 8),
  windshield: E.self('armor', 8),
  tactician: E.self('magic', 3),
  leadinglight: E.selfPos('first', 'armor', 10),
  magelord: E.selfPos('last', 'magic', 2),
  commander: E.selfAll('first', 2),
  dwarvenarmor: E.selfPerAlly('Dwarf', 'armor', 4),
  // —— 自身静态·按武器类型 ——
  protector: E.selfWeapon('shield', 'magic', 3),
  knifethrowing: E.selfWeapon('dagger', 'magic', 2),
  hammermastery: E.selfWeapon('hammer', 'magic', 2),
  perfectaim: E.selfWeapon('bow', 'magic', 2),
  wellread: E.selfWeapon('tome', 'magic', 3),
  oceanstrident: E.selfWeapon('polearm', 'magic', 3),
  maceofpower: E.selfWeapon('mace', 'magic', 2),
  axesofdoom: E.selfWeapon('axe', 'magic', 3),
  reaper: E.selfWeapon('scythe', 'magic', 2),
  precision: E.selfWeapon('missile', 'magic', 2),
  resplendence: E.selfWeapon('jewellery', 'magic', 2),
  shiningstaff: E.selfWeapon('staff', 'magic', 2),
  antiquity: E.selfWeapon('relic', 'magic', 4),
  // —— 全队静态 ——
  mentor: E.allies(E.all(), { magic: 1 }),
  armoroflight: E.allies(E.all(), { armor: 4 }),
  gloom: E.allies(E.byColor('purple'), { health: 2 }),
  magicalshield: E.allies(E.byColor('purple'), { armor: 2 }),
  stonewall: E.allies(E.byColor('brown'), { armor: 2 }),
  stonecircle: E.allies(E.byColor('brown'), { armor: 3 }),
  wallofvines: E.allies(E.byColor('green'), { armor: 5 }),
  waterybinding: E.allies(E.byColor('blue'), { health: 4 }),
  thunderfist: E.allies(E.byColor('yellow'), { magic: 1 }),
  giftoffire: E.allies(E.byColor('red'), { magic: 1 }),
  galeforce: E.allies(E.byColor('yellow'), { attack: 2 }),
  goblinfriend: E.allies(E.byType('Goblin'), { attack: 2 }),
  daemonicrage: E.allies(E.byType('Daemon'), { attack: 1 }),
  royalarmory: E.allies(E.byType('Knight'), { armor: 2 }),
  titanicsurge: E.allies(E.byType('Giant'), { health: 1, magic: 1 }),
  felinefury: E.allies(E.byType('Raksha'), { attack: 1, health: 1 }),
  celestialcurrents: E.allies(E.byType('Centaur'), { magic: 1 }),
  masterbuilder: E.allies(E.byType('Construct'), { health: 10 }),
  elvensentries: E.allies(E.byType('Elf'), { magic: 1, attack: 1 }),
  // —— 结算经济 ——
  quickstudy: { kind: 'xpBonus', pct: 10 },
  // —— 引擎特质别名（触发/目标/数值全同；code 必须在 traits.json 已实现集合） ——
  manasource: E.trait('fast'),
  stealthy: E.trait('stealthy'),
  fortitude: E.trait('fortitude'),
  insulated: E.trait('insulated'),
  fireproof: E.trait('fireproof'),
  dawnsaura: E.trait('songoflight'),
  dusksaura: E.trait('songofdarkness'),
  icyveil: E.trait('songofice'),
  firestarter: E.trait('songoffire'),
  naturesaura: E.trait('songofnature'),
  stormaura: E.trait('songofstone'),
  suddendoom: E.trait('songofdoom'),
  lightbringer: E.trait('airlink'),
  firebringer: E.trait('firelink'),
  natureswill: E.trait('naturelink'),
  watermastery: E.trait('waterlink'),
  arcanesurge: E.trait('magiclink'),
  stonemastery: E.trait('stonelink'),
  plaguebearer: E.trait('sporecloud'),
  fireblade: E.trait('scaldingstrike'),
  // —— 不适用（无 PvP 模式） ——
  exemplar: { kind: 'pvp' },
  bloodandglory: { kind: 'pvp' },
};

// ---------------------------------------------------------------------------
// 4. 中文文案：天赋/职业特质名与描述（官方文本的仓库口径翻译）
// ---------------------------------------------------------------------------

/** 通用词条 */
const STAT_ZH = { Attack: '攻击力', Armor: '护甲值', Life: '生命值', Magic: '魔力值' };
const COLOR_ZH = {
  Red: '红色', Blue: '蓝色', Green: '绿色', Yellow: '黄色', Purple: '紫色', Brown: '棕色',
};
const TYPE_ZH = {
  Daemon: '恶魔', Naga: '纳迦', Goblin: '哥布林', Rogue: '盗贼', Mystic: '秘士', Fey: '妖仙',
  Wargare: '狐人', Elf: '精灵', Dwarf: '矮人', Dwarven: '矮人', Construct: '建造', Merfolk: '海族',
  Elemental: '元素', Giant: '巨人', Raksha: '猫族', Undead: '不死族', Tauros: '牛头族',
  Centaur: '人马族', Stryx: '鸟族', Urska: '厄什卡', Knight: '骑士', Mech: '机械',
  Divine: '神祇', Monster: '怪物', Dragon: '龙族', Wildfolk: '蛮族', Beast: '野兽',
};
/** 复数 → 单数（官方文本用复数指代兵种类型） */
const IRREGULAR_SINGULAR = { Elves: 'Elf', Divines: 'Divine', Mystics: 'Mystic', Daemons: 'Daemon', constructs: 'Construct', Centaurs: 'Centaur' };
function singular(word) {
  if (IRREGULAR_SINGULAR[word]) return IRREGULAR_SINGULAR[word];
  if (/(?:s|sh|ch|x|z)es$/.test(word)) return word.slice(-2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}
function typeZh(word) {
  return TYPE_ZH[word] ?? TYPE_ZH[singular(word)] ?? COLOR_ZH[word];
}
const WEAPON_ZH = {
  shield: '盾牌', dagger: '匕首', hammer: '战锤', bow: '弓', tome: '典籍', polearm: '长柄',
  mace: '钉锤', axe: '斧', scythe: '镰刀', missile: '投射', jewellery: '饰品', staff: '法杖',
  relic: '遗物', sword: '剑',
};
const POS_ZH = { first: '首位', last: '末位' };

/** 天赋名（119 条） */
const TALENT_NAME_ZH = {
  daemonicrage: '魔怒', darkhunger: '暗饥', plaguebearer: '瘟疫携带者',
  spawnofhell: '地狱之子', suddendoom: '骤降末日', delirium: '谵妄', chaoswave: '混沌之波',
  gloom: '阴郁', shadowscales: '暗影鳞片', shadowscall: '暗影呼唤', dusksaura: '暮光灵气',
  stealthy: '隐匿', darkvenom: '暗毒', risingshadows: '暗影渐起',
  hunt: '狩猎', knifethrowing: '飞刀', lightfingers: '妙手', backup: '后援',
  goblinfriend: '哥布林之友', dodge: '闪避', thievesguild: '盗贼公会',
  magicalshield: '魔法之盾', magelord: '法师领主', antimagicsphere: '反魔法领域',
  manasource: '法力之源', antiquity: '古物', arcanesurge: '秘法奔涌', mysticchannel: '秘术导流',
  resilience: '坚韧', purification: '净化', fasthealing: '快速愈合', feyvengeance: '妖精复仇',
  healingherb: '治愈药草', natureswill: '自然意志', eternalsummer: '永恒盛夏',
  hauntedweave: '闹鬼之织', perfectaim: '精准瞄准', roottrap: '根须陷阱',
  naturesaura: '自然灵气', wallofvines: '藤蔓之墙', elvensentries: '精灵哨卫',
  harvestmoon: '收获之月', impact: '冲击', hammermastery: '战锤精通', stonecircle: '石阵',
  dwarvenarmor: '矮人护甲', rocksolid: '磐石', stonemastery: '岩石精通', fortitude: '坚韧不拔',
  serendipity: '机缘巧合', wellread: '博览群书', golemprotector: '魔像守护',
  tactician: '战术家', mentor: '导师', treeofknowledge: '智慧之树', masterbuilder: '大师工匠',
  snapfreeze: '急冻', insulated: '隔热体', oceanstrident: '海洋三叉戟', waterybinding: '水之束缚',
  deluge: '泛滥', watermastery: '流水精通', aquaticglory: '海族荣光', chaosstorm: '混沌风暴',
  maceofpower: '力量钉锤', thunderfist: '雷霆之拳', stormaura: '风暴灵气',
  titanicsurge: '泰坦涌动', lightningstrike: '落雷', lordofstorms: '风暴之主',
  reaper: '收割者', chillofdeath: '死亡寒意', soulcaller: '唤魂者', icyveil: '寒冰帷幕',
  lifesiphon: '生命虹吸', swiftcurse: '疾速诅咒', unholyblessing: '邪恶祝福',
  ferocity: '凶悍', counterattack: '反击', axesofdoom: '末日之斧', bloodandglory: '血与荣耀',
  vengeance: '复仇', bloodthirsty: '嗜血', bullgeneral: '牛头将军',
  felinefury: '猫族之怒', fireproof: '防火', upinflames: '烈火焚身', firestarter: '纵火者',
  giftoffire: '火焰馈赠', firebringer: '携火者', fireblade: '火刃',
  shiningstaff: '闪耀法杖', leadinglight: '引光者', brilliantaura: '光辉灵气',
  dawnsaura: '黎明灵气', armoroflight: '光明护甲', lightbringer: '携光者', divinity: '神性',
  exemplar: '典范', resplendence: '华彩', royalarmory: '皇家军械库', quickstudy: '勤学',
  commander: '指挥官', inspiration: '鼓舞', urskamajor: '厄什卡大军',
  windshield: '风盾', precision: '精确', windspeed: '风速', celestialcurrents: '天界洪流',
  galeforce: '大风力', childofsky: '天空之子', stryxcommander: '鸟族指挥官',
  stonewall: '石墙', protector: '护卫', vanguard: '先锋', razorarmor: '剃刀护甲',
  savior: '救星', banishment: '放逐', armorplating: '装甲镀层',
};

/** 职业特质名（97 条里出现的全部 code） */
const PERK_NAME_ZH = {
  mysticbond: '秘士族亲', arcane: '秘法', nightsblessing: '夜之祝福',
  wargarebond: '狐人族亲', spellarmor: '法术铠甲', spiritdrain: '灵魂汲取',
  stoneheart: '岩石之心', stoneskin: '铁壁铜墙', infusestone: '灌岩',
  elementalbond: '元素族亲', elementalshield: '元素之盾', elementalforce: '元素之力',
  accursed: '诅咒', omenofdark: '暗黑预兆', doomsight: '末日视野',
  orcfury: '兽人之怒', agile: '敏捷', barbaricfury: '蛮族狂怒',
  skyancestry: '天穹血脉', shock: '触电', goodkarma: '好因果',
  stryxbond: '鸟族族亲', grudge: '怨恨', bloodlust: '嗜杀', jinx: '霉运',
  waterheart: '水系之心', greedy: '贪婪', highseas: '大海之途',
  merfolkbond: '海族族亲', aquatic: '水栖', crashingwave: '碎浪',
  revered: '崇敬', holyarmor: '神圣护甲', ancientmysteries: '远古奥秘',
  monsterbond: '怪物族亲', monstrouskin: '怪物血亲', getbehindme: '躲我身后！',
  immune: '免疫', contagion: '传染',
  taurosbond: '牛头族族亲', naturespirit: '自然之灵', bullishvigor: '牛头活力',
  dwarfbond: '矮人族亲', rockydeath: '岩石之死', dwarvenmettle: '矮人勇气',
  dragonshield: '龙族之盾', dragonsgrace: '龙族恩典',
  wildfolkbond: '蛮族族亲', alert: '警醒', bardicinspiration: '吟游诗人之激励',
  giantbond: '巨人族亲', big: '庞然', giantlord: '巨人领主',
  undeadbond: '不死族族亲', warded: '辟邪', deathcurse: '死亡诅咒',
  centaurbond: '人马族族亲', invigorated: '生气勃勃', portent: '征兆',
  natureheart: '自然之心', manashield: '法力之盾', familiar: '魔宠',
  sturdy: '健壮', venomous: '毒液', assassinate: '猎杀',
  mechbond: '机械族亲', insulated: '隔热体', clockwork: '发条机构',
  firebrand: '火焰之印', fireproof: '防火', heatwave: '热浪',
  avenger: '复仇者', fullplate: '全身板甲',
  leader: '领袖', orcarmor: '兽人护甲', orccunning: '兽人之狡',
  divinebond: '神祇族亲', magiclink: '魔法灵链', arcane2: '',
  knightbond: '骑士族亲', hellsteed: '地狱坐骑', sneakattack: '偷袭',
  frostbite: '冻伤', wrathofanu: '阿努之怒', brute: '',
  ensoul: '赋魂', ward: '守护', brute2: '',
  stormsoul: '风暴之魂', brutalstrike: '野蛮打击', manaflare: '法力闪耀',
  fast: '快速', magicspirit: '魔法之灵', inscribed: '铭刻', darkchannel: '暗黑导流',
  bullseye: '正中要害', airlink: '空气灵链', divineaura: '神圣灵气',
  beastbond: '野兽族亲', fireheart: '火焰之心', frenzy: '狂暴', hacknslash: '砍劈',
  orcarmor: '兽人护甲', orccunning: '兽人之狡', leader: '领袖',
};

/** 逐条中文描述（模板覆盖不了的例外条目） */
const DESC_ZH = {
  // —— 天赋例外 ——
  darkhunger: '匹配紫色宝石时，窃取第一名敌人 1 点生命值。',
  plaguebearer: '配对 4 或 5 颗宝石时，使一名随机敌人陷入疾病状态。',
  spawnofhell: '当敌人身亡时，有 50% 的几率召唤一个地狱之子。',
  delirium: '当自身生命值受到伤害时，获得 2 点魔力值和攻击力。',
  chaoswave: '匹配骷髅头时，所有敌人随机损失 1 点技能值。',
  shadowscall: '当敌人身亡时，有 20% 的几率召唤一名暗影姐妹。',
  stealthy: '无法成为法术指定攻击目标（除非场上已无任何其他目标）。',
  darkvenom: '匹配紫色宝石时，使一名随机敌人中毒。',
  risingshadows: '当另一名敌人身亡时，有 7% 的几率猎杀最后一名敌人。',
  hunt: "配对 4 或 5 颗宝石时，使一名随机敌人陷入猎人标记。",
  lightfingers: '每回合获得 5 点黄金。',
  backup: '当盟友身亡时，有 35% 的几率召唤一名强盗。',
  dodge: '有 30% 的几率闪避骷髅头伤害。',
  thievesguild: '配对 4 或 5 颗宝石时，所有盗贼盟友获得 1 点魔力值。',
  serendipity: '给一名随机盟友施加一个随机状态效果。',
  golemprotector: '当自身生命值受到伤害时，有 20% 的几率召唤一只远古魔像。',
  rocksolid: '匹配棕色宝石时获得屏障效果。',
  fortitude: '对击晕、中毒、疾病、死亡标记、狼化和吞噬免疫。',
  treeofknowledge: '匹配绿色宝石时获得附魔状态。',
  roottrap: '战斗开始时缠绕第一名敌人。',
  snapfreeze: '战斗开始时冻结一名随机敌人。',
  deluge: '配对 4 或 5 颗宝石时，使一名随机盟友下潜。',
  chaosstorm: '配对 4 或 5 颗宝石时，召唤一个随机风暴。',
  lightningstrike: '配对 4 或 5 颗宝石时，爆破一颗黄色宝石。',
  chillofdeath: '当敌人身亡时，冻结另一名随机敌人。',
  lifesiphon: '配对 4 或 5 颗宝石时，窃取第一名敌人 2 点生命值。',
  swiftcurse: '战斗开始时使一名随机敌人陷入死亡标记。',
  bloodthirsty: '配对 4 或 5 颗宝石时进入激怒状态。',
  upinflames: '当盟友身亡时，燃烧一名随机敌人。',
  fireblade: '对陷入燃烧状态的敌人造成三倍骷髅头伤害。',
  savior: '当盟友身亡时，给另一名随机盟友屏障。',
  banishment: '配对 4 或 5 颗宝石时，驱散所有敌人。',
  vanguard: '战斗开始时获得屏障。',
  feyvengeance: '当盟友身亡时，使一名随机敌人陷入妖火状态。',
  purification: '配对 4 或 5 颗宝石时，净化自身。',
  hauntedweave: '当我召唤部队时，织网一名随机敌人。',
  antiquity: '使用遗物时获得 4 点魔力值。',
  childofsky: '当盟友施放法术时，有 25% 的几率召唤一只苍鹭巨兽。',
  exemplar: 'PvP 战斗中获得 5 点攻击力。',
  impact: '敌人对自身造成骷髅头伤害时，使其陷入击晕状态。',
  soulcaller: '每回合获得 1 点灵魂。',
  bullseye: '骷髅头伤害有 15% 的几率一击致命。',
  darkchannel: '每回合有 50% 的几率获得 1 点魔力值。',
  divineaura: '每回合所有盟友回复 2 点生命值。',
  ensoul: '配对 4 或 5 颗宝石时获得额外 1 点灵魂。',
  insulated: '对冻结免疫。',
  fireproof: '对燃烧和妖火状态效果免疫。',
  mysticchannel: '当敌人身亡时，所有秘士盟友获得 2 点魔力值和生命值。',
  unholyblessing: '当盟友身亡时，所有不死族获得 2 点护甲值和魔力值。',
  aquaticglory: '当敌人身亡时，所有海族盟友获得 2 点魔力值。',
  lordofstorms: '当盟友施放法术时，元素盟友获得 1 点魔力值。',
  // —— 职业特质例外 ——
  spiritdrain: '当盟友施放法术时，耗掉一名随机敌人 2 点法力值。',
  infusestone: '所有建造盟友以 50% 法力值开始战斗。',
  elementalforce: '匹配 4 颗或更多宝石时，随机选择一名敌人，并从其尚未拥有的击晕、冻结、燃烧、缠绕状态中随机施加一种。',
  doomsight: '匹配 4 颗或更多宝石时，有 25% 的几率使一名随机敌人陷入死亡标记。',
  barbaricfury: '匹配红色宝石时获得 3 点攻击力。',
  goodkarma: '匹配 4 颗或更多宝石时，获得 3 点法力值。',
  stormsoul: '当我的回合开始时，召唤一个光风暴。',
  brutalstrike: '当敌人身亡时，使所有敌人陷入出血状态。',
  manaflare: '匹配紫色宝石时获得额外 2 点紫色法力。',
  highseas: '匹配蓝色宝石时获得额外 2 点蓝色法力。',
  crashingwave: '匹配 4 颗或更多宝石时，爆破一颗蓝色宝石。',
  ancientmysteries: '当我的回合开始时，有 25% 的几率给一名随机盟友施加一个随机正面状态效果。',
  getbehindme: '当我的回合开始时，有 25% 的几率给一名随机盟友屏障。',
  wrathofanu: '当我的回合开始时，有 50% 的几率击晕一名随机敌人。',
  contagion: '匹配绿色宝石时，使一名随机敌人陷入疾病状态。',
  frostbite: '当盟友施放法术时，有 25% 的几率冻结一名随机敌人。',
  sneakattack: '配对 4 或 5 颗宝石时，对最后一名敌人造成 7 点伤害。',
  bardicinspiration: '每回合开始时，所有黄色盟友全技能值获得 1 点。',
  portent: '当敌人施放法术时，所有人马族获得 2 点魔力值。',
  deathcurse: '我身亡时，使所有敌人陷入死亡标记。',
  familiar: '当我受到伤害时，有 35% 的几率召唤一只巨蛛。',
  hellsteed: '当盟友施放法术时，有 25% 的几率召唤一匹梦魇。',
  assassinate: '造成骷髅头伤害时，有 10% 的几率猎杀最后一名敌人。',
  clockwork: '所有机械盟友以 50% 法力值开始战斗。',
  dwarvenmettle: '配对 4 或 5 颗宝石时，所有矮人盟友获得 2 点生命值和攻击力。',
  dragonsgrace: '配对 4 或 5 颗宝石时，所有龙族盟友获得 1 点生命值和魔力值。',
  monstrouskin: '配对 4 或 5 颗宝石时，所有怪物盟友获得 2 点全技能值。',
  bullishvigor: '所有牛头族盟友以 50% 法力值开始战斗。',
  giantlord: '所有巨人盟友以 50% 法力值开始战斗。',
  heatwave: '每回合开始时创造一个火风暴。',
  accursed: '所有敌人损失 2 点随机技能值。',
  omenofdark: '在战斗开始的时候爆破一颗紫色宝石。',
  avenger: '当一名盟友身亡时，获得 3 点攻击力。',
  fullplate: '每回合获得 2 点护甲值。',
  leader: '当军队位于首位时，全部技能值将增加 3 点。',
  holyarmor: '降低来自骷髅头的伤害 40%。',
  stoneheart: '每有一名棕色盟友则获得 1 点生命值。',
  stoneskin: '降低来自骷髅头的伤害 50%。',
  orcfury: '在自身受到伤害时获得 3 点攻击力。',
  agile: '有 20% 的几率闪避骷髅头伤害。',
  skyancestry: '对法力耗尽、沉默、妖火和法力灼烧免疫。',
  shock: '在配对 4 或 5 颗宝石时，对一名随机敌人造成 2 点伤害。',
  stryxbond: '鸟族盟友获得 2 点生命值。',
  grudge: '当一名敌人施放法术时获得 1 点攻击力。',
  bloodlust: '在敌人身亡时获得狂怒效果。',
  jinx: '将敌人的宝石灵力减半。',
  waterheart: '每有一名蓝色盟友则获得 1 点生命值。',
  greedy: '在配对 4 或 5 颗宝石时，获得额外 2 黄金。',
  merfolkbond: '海族盟友获得 2 点生命值。',
  aquatic: '在自身受到伤害时使自身下潜。',
  revered: '所有盟友获得 2 点随机技能值。',
  monsterbond: '怪物盟友获得 2 点生命值。',
  immune: '对疾病和狼化免疫。',
  taurosbond: '牛头族盟友获得 2 点生命值。',
  naturespirit: '每有一名绿色盟友则获得 1 点魔力值。',
  dwarfbond: '矮人盟友获得 2 点生命值。',
  rockydeath: '当敌人身亡时召唤一个尘风暴。',
  dragonshield: '龙族盟友获得 2 点护甲值。',
  wildfolkbond: '蛮族盟友获得 2 点生命值。',
  alert: '对沉默状态免疫。',
  giantbond: '巨人盟友获得 2 点生命值。',
  big: '在配对 4 或 5 颗宝石时，获得 1 点生命值。',
  undeadbond: '不死族盟友获得 2 点生命值。',
  warded: '对死亡标记状态效果免疫。',
  centaurbond: '人马族盟友获得 2 点生命值。',
  invigorated: '当一名盟友施放法术时获得 1 点生命值。',
  natureheart: '每有一名绿色盟友则获得 1 点生命值。',
  manashield: '对法力灼烧、法力耗尽和法力窃取免疫。',
  sturdy: '对中毒状态免疫。',
  venomous: '在造成骷髅头伤害时，使敌人陷入中毒状态。',
  mechbond: '机械盟友获得 2 点生命值。',
  firebrand: '每有一名红色盟友则获得 1 点攻击力。',
  mysticbond: '秘士盟友获得 2 点生命值。',
  arcane: '当一名盟友施放法术时获得 1 点魔力值。',
  knightbond: '骑士盟友获得 2 点生命值。',
  wargarebond: '狐人盟友获得 2 点生命值。',
  elementalbond: '元素盟友获得 2 点生命值。',
  elementalshield: '元素盟友获得 2 点护甲值。',
  spellarmor: '降低来自法术的伤害 25%。',
};

/** 树名 */
const TREE_ZH = {
  Chaos: '混沌', Shadow: '暗影', Cunning: '诡诈', Arcane: '秘法', Life: '生命',
  Forest: '森林', Stone: '岩石', Knowledge: '学识', Water: '流水', Storms: '风暴',
  War: '战争', Fire: '烈焰', Death: '死亡', Light: '光明', Wind: '疾风',
  Morale: '士气', Guardian: '守卫',
};

// ---------------------------------------------------------------------------
// 5. 模板化中文描述（按句式翻译；未命中模板且无例外条目 → 保留英文并计入告警）
// ---------------------------------------------------------------------------
function translateDesc(code, desc, kind) {
  if (DESC_ZH[code]) return DESC_ZH[code];
  let m;
  if ((m = desc.match(/^All (\w+) [Aa]llies gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All ally (\w+)s? gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All allies gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    return `所有盟友获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^Allied (\w+) gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All allies gain (\d+) (Attack|Armor|Life|Magic) on 4 or 5 Gem matches\.$/))) {
    return `配对 4 或 5 颗宝石时，所有盟友获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^All troops gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    return `全体部队获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic)\.$/))) {
    return `获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) if using (?:an? )?(\w+)\.?$/))) {
    const w = WEAPON_ZH[m[3].toLowerCase()];
    if (w) return `使用${w}时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) if in (first|last) position\.$/))) {
    return `位于${POS_ZH[m[3]]}时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) to all Skills if in (first|last) position\.$/))) {
    return `位于${POS_ZH[m[2]]}时全技能值获得 ${m[1]} 点。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) at the start of a battle\.$/))) {
    return `战斗开始时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) at the start of a battle\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `战斗开始时所有${t}获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) and (Attack|Armor|Life|Magic) at the start of a battle\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `战斗开始时所有${t}获得 ${m[2]} 点${STAT_ZH[m[3]]}和${STAT_ZH[m[4]]}。`;
  }
  if ((m = desc.match(/^All (\w+) [Aa]llies gain (\d+) (Attack|Armor|Life|Magic) (?:every turn|per turn)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `每回合所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) (?:every turn|per turn)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `每回合所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) (?:every turn|per turn)\.$/))) {
    return `每回合获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Recover (\d+) Life (?:every turn|per turn)\.$/))) {
    return `每回合回复 ${m[1]} 点生命值。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) and (Attack|Armor|Life|Magic)\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}和${STAT_ZH[m[4]]}。`;
  }
  if ((m = desc.match(/^All (\w+) [Aa]llies gain (\d+) (Attack|Armor|Life|Magic) and (Attack|Armor|Life|Magic)(?: every turn)?\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}和${STAT_ZH[m[4]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) for each (\w+) ally\.$/))) {
    const t = typeZh(m[3]);
    if (t) return `每有一名${t}盟友则获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^All [Aa]llies start with (\d+)% Mana\.$/))) {
    return `所有盟友以 ${m[1]}% 法力值开始战斗。`;
  }
  if ((m = desc.match(/^All (\w+) [Aa]llies start with (\d+)% Mana\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `所有${t}盟友以 ${m[2]}% 法力值开始战斗。`;
  }
  if ((m = desc.match(/^Start battles with (\d+)% Mana\.$/))) {
    return `战斗开始时获得 ${m[1]}% 法力值。`;
  }
  if ((m = desc.match(/^Gain bonus (Red|Blue|Green|Yellow|Purple|Brown) Mana from \w+ Gem matches\.$/))) {
    return `从${COLOR_ZH[m[1]]}宝石配对中获得额外的${COLOR_ZH[m[1]]}法力。`;
  }
  if ((m = desc.match(/^Gain (\d+)% bonus XP from battle\.$/))) {
    return `从战斗中获得 ${m[1]}% 额外经验。`;
  }
  if ((m = desc.match(/^Add (\d+)% of (Attack|Armor|Life|Magic) to Skull Damage\.$/))) {
    return `骷髅头伤害附加 ${m[1]}% 的${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) in PvP Battles\.$/))) {
    return `PvP 战斗中获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) Glory in PvP Battles\.$/))) {
    return `PvP 战斗中获得 ${m[1]} 点荣耀。`;
  }
  if ((m = desc.match(/^Reduce damage from Spells by (\d+)%\.$/))) {
    return `降低来自法术的伤害 ${m[1]}%。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) when an enemy dies\.$/))) {
    return `当敌人身亡时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) when (?:I take damage|taking damage)\.$/i))) {
    const stat = m[2][0].toUpperCase() + m[2].slice(1);
    return `受到伤害时获得 ${m[1]} 点${STAT_ZH[stat]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) when dealing Skull damage\.$/))) {
    return `造成骷髅头伤害时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) when an enemy casts a spell\.$/))) {
    return `当敌人施放法术时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Gain (\d+) (Attack|Armor|Life|Magic) when matching (Red|Blue|Green|Yellow|Purple|Brown) Gems\.$/))) {
    return `匹配${COLOR_ZH[m[3]]}宝石时获得 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^All (\w+) [Aa]llies gain (\d+) (Attack|Armor|Life|Magic) when an enemy dies\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `当敌人身亡时，所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All (\w+) [Aa]llies gain (\d+) (Attack|Armor|Life|Magic) when an ally dies\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `当盟友身亡时，所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) when an ally dies\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `当盟友身亡时，所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) when an enemy dies\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `当敌人身亡时，所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^All (\w+) gain (\d+) (Attack|Armor|Life|Magic) when an ally casts a spell\.$/))) {
    const t = typeZh(m[1]);
    if (t) return `当盟友施放法术时，所有${t}盟友获得 ${m[2]} 点${STAT_ZH[m[3]]}。`;
  }
  if ((m = desc.match(/^Give (\d+) (Attack|Armor|Life|Magic) to all (\w+) [Aa]llies when matching (Red|Blue|Green|Yellow|Purple|Brown)\.$/))) {
    const t = typeZh(m[3]);
    if (t) return `匹配${COLOR_ZH[m[4]]}宝石时，给所有${t}盟友 ${m[1]} 点${STAT_ZH[m[2]]}。`;
  }
  if ((m = desc.match(/^Create an? (\w+)storm at the start of (?:a )?battle\.$/))) {
    const STORM_ZH = { doom: '末日', dark: '暗', leaf: '叶', dust: '尘', ice: '冰雪', fire: '火', light: '光' };
    const s = STORM_ZH[m[1].toLowerCase()];
    if (s) return `战斗开始时召唤${s}风暴。`;
  }
  if (desc === 'Immune to Frozen.' || desc === 'Immunity to Frozen.') return '对冻结免疫。';
  return null;
}

// ---------------------------------------------------------------------------
// 6. 组装
// ---------------------------------------------------------------------------
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const traitCodes = new Set(
  (JSON.parse(fs.readFileSync(TRAITS, 'utf8'))).map((t) => t.code),
);

const warnings = [];
const effectCounts = {};
const classes = raw.classes.map((cls) => {
  const code = cls.HeroClassCode;
  const kingdom = kid2kingdom.get(cls.kid);
  if (!kingdom) throw new Error(`职业 ${code} 的王国 kid=${cls.kid} 无法映射到 troops.json`);
  if (!allKingdomNames.has(kingdom)) throw new Error(`职业 ${code} 王国「${kingdom}」不在 troops.json 王国集合`);
  if (!CLASS_ZH[code]) throw new Error(`缺少职业中文名：${code}`);
  const troopType = CLASS_TROOP_TYPE[code] ?? 'Human';

  const trees = cls.stats.talent_trees.map((tree) => {
    const treeZh = TREE_ZH[tree.name];
    if (!treeZh) throw new Error(`未知天赋树名：${tree.name}`);
    if (tree.talents.length !== 7) throw new Error(`树 ${tree.name}（${code}）天赋数 ${tree.talents.length} ≠ 7`);
    return {
      name: tree.name,
      nameZh: treeZh,
      talents: tree.talents.map((t) => {
        if (!TALENT_NAME_ZH[t.code]) warnings.push(`天赋缺中文名：${t.code}`);
        const effect = TALENT_EFFECTS[t.code] ?? { kind: 'unimplemented' };
        effectCounts[effect.kind] = (effectCounts[effect.kind] ?? 0) + 1;
        if (effect.kind === 'trait' && !traitCodes.has(effect.code)) {
          throw new Error(`天赋 ${t.code} 别名特质 ${effect.code} 未实现（traits.json 无此 code）`);
        }
        const descZh = translateDesc(t.code, t.description, 'talent');
        if (!descZh) warnings.push(`天赋描述未翻译（保留英文）：${t.code} | ${t.description}`);
        return {
          code: t.code,
          name: t.name,
          nameZh: TALENT_NAME_ZH[t.code] ?? t.name,
          description: t.description,
          descriptionZh: descZh ?? t.description,
          effect,
        };
      }),
    };
  });

  const perks = cls.stats.traits.map((t) => {
    if (!PERK_NAME_ZH[t.code]) warnings.push(`职业特质缺中文名：${t.code}`);
    const descZh = translateDesc(t.code, t.description, 'perk');
    if (!descZh) warnings.push(`特质描述未翻译（保留英文）：${t.code} | ${t.description}`);
    const implemented = traitCodes.has(t.code);
    if (!implemented) effectCounts.unimplemented = (effectCounts.unimplemented ?? 0) + 1;
    effectCounts.perkTrait = (effectCounts.perkTrait ?? 0) + 1;
    return {
      code: t.code,
      name: t.name,
      nameZh: PERK_NAME_ZH[t.code] ?? t.name,
      description: t.code === 'elementalforce'
        ? 'Inflict one random Stun, Freeze, Burn, or Entangle status not already present on a random Enemy when matching 4 or more Gems.'
        : t.description,
      descriptionZh: descZh ?? t.description,
      implemented,
    };
  });

  return {
    id: code,
    name: CLASS_ZH[code],
    nameEn: cls.name_localized,
    kingdom,
    troopType,
    baseStats: {
      attack: cls.Attack,
      armor: cls.Armor,
      health: cls.Health,
      magic: cls.Magic,
    },
    trees,
    perks,
  };
});

// 断言：38 职业、 kingdoms 唯一（一个王国至多一个职业）
if (classes.length !== 38) throw new Error(`职业数 ${classes.length} ≠ 38`);
const kingdomSet = new Set(classes.map((c) => c.kingdom));
if (kingdomSet.size !== classes.length) throw new Error('存在多职业共享王国，任务链解锁语义冲突');

const doc = {
  source: 'gowhead.com class entities + 仓库裁定（别名/效果编译/中文）',
  exported_at: raw.exported_at,
  generated_at: new Date().toISOString(),
  championTiers: [1, 5, 10, 20, 40, 70, 100],
  summary: {
    classes: classes.length,
    talents: effectCounts,
    unimplementedPerks: classes.flatMap((c) => c.perks).filter((p) => !p.implemented).length,
    implementedPerks: classes.flatMap((c) => c.perks).filter((p) => p.implemented).length,
  },
  classes,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`[classes] ${classes.length} 职业 → ${OUT}`);
console.log(`[classes] 天赋效果分布:`, JSON.stringify(effectCounts));
console.log(`[classes] 职业特质: ${doc.summary.implementedPerks} 已实现 / ${doc.summary.unimplementedPerks} 未实现`);
if (warnings.length) {
  console.log(`[classes] ${warnings.length} 条告警：`);
  for (const w of warnings) console.log('  -', w);
}
