/**
 * 从 GoW 原始 dump 生成结构化特质表。
 * 用法: node scripts/build_traits.mjs
 * 输入: data/raw/troops.gow.zh.json
 * 输出: src/data/traits.json（引擎 traits.ts 消费）
 *
 * 只输出「描述能被完整解析成引擎已支持机制」的特质。解析不了的会统计在报告里，
 * 明确列出缺哪种机制，避免默默漏掉或半实现。
 */
import fs from 'node:fs';
import path from 'node:path';

const IN = 'data/raw/troops.gow.zh.json';
const OUT = 'src/data/traits.json';

/** 中文状态名 → 引擎状态 id。缠绕（攻击归零）与织网（魔力归零）是两个状态，按官方拆分。
 *  妖火（Faerie Fire，受法术伤害 ×1.5 的独立状态）与燃烧（DoT）是两个状态，按官方拆分——
 *  历史上两者都映射 burning，13 条特质语义偏差、flamingmane 双子句被 Set 去重吞掉。 */
const STATUS_MAP = [
  [/中毒/, 'poison'],
  [/燃烧/, 'burning'],
  [/妖火|妖仙|精灵之火/, 'faerie-fire'],
  [/冻结|冰冻/, 'frozen'],
  [/沉默/, 'silence'],
  [/缠绕|纠缠/, 'entangle'],
  [/织网/, 'web'],
  [/击晕|眩晕/, 'stun'],
];

/**
 * 特质可救批（T1 免疫 + T3 骷髅命中）扩展状态映射：这些状态本体在引擎里已落地
 * （skills/effects/status.ts：death-mark/marked/curse/disease/bleed/terror 均有结算），
 * 只是 STATUS_MAP 当年没收。并入免疫、骷髅命中/受击附状态与屠戮条件三类规则
 * （屠戮条件经 DAMAGE_CONDITION_MAP 消费扩展表——cursehunter/virulence/doom 等
 * 「对陷入X状态的敌人造成双倍骷髅头伤害」）；大连光环仍走自己的 AURA_STATUS_MAP，
 * 不并此表（两表范围不同：光环按「施加」，屠戮按「条件命中」）。
 */
const RESCUE_STATUS_MAP = [
  [/死亡标记/, 'death-mark'],
  [/猎人标记/, 'marked'],
  [/受诅|诅咒/, 'curse'],
  [/疾病/, 'disease'],
  [/出血/, 'bleed'],
  [/恐怖/, 'terror'],
  // 法力灼烧本体在引擎已注册（status.ts MANA_BURN_STATUS_IDS），skyancestry
  // 「对法力耗尽、沉默、妖火和法力灼烧免疫」的灼烧段按此映射（manashield 先例）。
  [/法力灼烧/, 'mana-burn'],
];

/** 免疫 / 骷髅命中附状态规则的完整查找表：基础表在前（保持既有命中次序），扩展表在后 */
const RESCUE_FULL_STATUS_MAP = [...STATUS_MAP, ...RESCUE_STATUS_MAP];

/**
 * 双状态诅咒族的机器翻译错字定点修正（仅双状态拆段分支生效，不做全局映射）：
 * diseasedcurse 官方名「疾病诅咒」（Diseased Curse = Curse + Disease），dump 描述把
 * Disease 误译作「击败」；按特质名与官方机制逐字核对后映射 disease，其余状态不在此列。
 */
const DUAL_STATUS_ALIAS = { 击败: 'disease' };

/**
 * 机翻错译定点修正（核对报告 §二）：这些 code 的官方中文 dump 描述与官方英文语义有出入
 * （数字错位/目标反向/状态错词/术语不统一），生成前先按官方英文描述改写。
 * 只改描述文本——机制一律仍由句式规则从修正后的文本解析，保证「描述↔数值」对账成立。
 */
const DESCRIPTION_OVERRIDES = {
  // 「Gain 5 to a random Skill on 4 or 5 Gem matches」——dump 把两个数字都译错
  insanegrowth: '在配对 4 或 5 颗宝石时，随机一项技能获得 5 点。',
  // 「Inflict Freeze and Bleed to a random Enemy」——dump 把 Enemy 译成「盟友」（目标反向）
  bloodcoldrage: '在配对 4 或更多宝石时，使一名随机敌人陷入冻结和出血状态。',
  // 「Curse and Disease」——dump 把 Disease 误译作「击败」
  diseasedcurse: '在敌人对自身造成骷髅头伤害时，使其陷入诅咒和疾病状态。',
  // 「Create 2 Web Gems」——「网络宝石」与他处「织网」术语不统一
  silkenweave: '轮到我行动时，创造 2 颗织网宝石。',
  // 「matching 4 or more Gems」——「4 后更多」为错字
  volcanicmeteor: '配对 4 或更多宝石时，燃烧和击晕一名随机敌人。',
  // 「Reflect 35%/30% of Skull Damage」——与他处「反弹」术语统一（与 Reflect 状态撞名）
  flowershield: '反弹 35% 的骷髅头伤害。',
  mudsplash: '反弹 30% 的骷髅伤害。',
  // 「Faerie Fire Gem」——「妖仙宝石」与他处「妖火宝石」译法统一
  faeriesoul: '在我的回合开始的时候，创造一颗妖火宝石。',
  faerieaura: '在我的回合开始的时候，有 30% 的几率创造 3 颗妖火宝石。',
  // powerof* 族「Give 1 to all Skill Points」——机翻腔「所有技能组」统一为「全部技能值各 N 点」
  powerofcomet: '在配对蓝色宝石时给予所有蓝色盟友全部技能值各 1 点。',
  powerofnebula: '在配对绿色宝石时给予所有绿色盟友全部技能值各 1 点。',
  powerofmeteor: '在配对红色宝石时给予所有红色盟友全部技能值各 1 点。',
  powerofsun: '在配对黄色宝石时给予所有黄色盟友全部技能值各 1 点。',
  powerofmoon: '在配对紫色宝石时给予所有紫色盟友全部技能值各 1 点。',
  powerofeclipse: '在配对棕色宝石时给予所有棕色盟友全部技能值各 1 点。',
  powerofstars: '在配对骷髅头宝石时给予所有盟友全部技能值各 1 点。',
  // 召唤名对齐兵种数据（「道的仆人」机报名 → 兵种库「恶道仆人」ServantOfTheDao）
  daoslamp: '匹配4个或以上的宝石时有30%几率召唤恶道仆人。',
  // badtarot「Inflict a random status effect on a random Enemy when an Ally casts a spell.」
  // ——dump 把 Enemy 译成「盟友」（目标反向，与 bloodcoldrage 同款机翻事故；官方
  // TraitType=cause_random_status_effect 施加负面池，目标必为敌方）
  badtarot: '在任一盟友施放法术时使一名随机敌人陷入一个状态效果。',
  // —— 缺口清扫批机翻错译定点修正（逐条与 data/raw/gow-2026-09-18 官方 EN 核对）——
  // destinyof* 族「2% chance to Deathmark …, boosted by my ascensions」：dump 把句尾
  // 晋升增强从句直译进描述、且漏了「随机」；机制本体（配色触发死亡标记 2%）照收，
  // 晋升度本作未建模（与 godslayer 批同裁定）。
  destinyofice: '在配对蓝色宝石时，有 2% 的几率使一名随机敌人陷入死亡标记状态。',
  destinyofnature: '在配对绿色宝石时，有 2% 的几率使一名随机敌人陷入死亡标记状态。',
  destinyofflame: '在配对红色宝石时，有 2% 的几率使一名随机敌人陷入死亡标记状态。',
  destinyoflight: '在配对黄色宝石时，有 2% 的几率使一名随机敌人陷入死亡标记状态。',
  destinyofdarkness: '在配对紫色宝石时，有 2% 的几率使一名随机敌人陷入死亡标记状态。',
  destinyofstone: '在配对棕色宝石时，有 2% 的几率使一名随机敌人陷入死亡标记状态。',
  // fenixsblessing「Bless and Enchant a random Ally」——dump 把 Ally 译成「敌人」（目标反向）
  fenixsblessing: '在配对 4 或更多宝石时，赋予一名随机盟友赐福和法印效果。',
  // crystalize/spark/prosperousyear「Gain Enchant when matching X Gems」——「获得法印效果」
  // 按官方口径改写为自身施加句（持有者自身获得，scope=self）
  crystalize: '在配对紫色宝石时赋予自身法印状态。',
  spark: '在配对红色宝石时赋予自身法印状态。',
  prosperousyear: '在配对黄色宝石时赋予自身法印状态。',
  // lordofsummer「All Fey Allies start with 50% Mana」——dump 把 start_battle 误译成「回合开始」
  lordofsummer: '所有妖仙盟友在战斗开始时获得 50% 法力值。',
  // soulgatherer 官方「Gain 4 Souls」——dump 把 4 误译成 2
  soulgatherer: '在我的回合开始的时候，获得 4 个灵魂。',
  // essenceofmagic「gain 1 to all Stats」——dump 错别字「技能职」
  essenceofmagic: '在每个回合开始的时候，所有紫色盟友的全部技能值增加 1 点。',
  // hemlock「Curse and Disease a random Enemy」——dump 语序错乱（「随机诅咒并感染敌人的疾病」）
  hemlock: '在一名盟友施放法术时，使一名随机敌人陷入诅咒和疾病状态。',
  // psychicaffliction「Eliminate 1 Magic from all Enemies」——dump「获减除」为错词
  psychicaffliction: '当一名盟友施放法术时，消除所有敌人 1 点魔法值。',
  // parliamentarycall 召唤 Owlbear（枭熊）——dump 误作「枭雄」
  parliamentarycall: '在我的回合开始的时候，有 10% 的几率召唤一名枭熊。',
  // draconicrage「Gain 2 Attack, Life and Armor whenever an Ally casts」——「友军」统一为
  // 「盟友」，多属性展开同 vast 口径
  draconicrage: '当一名盟友施放法术时，获得 2 点攻击力、生命值和护甲值。',
  // banding 家族（官方 Filter=traitbanding「Gain N … for each Ally with a Banding Trait」）——
  // dump 机翻破损不可解析（「获得两次生命值，仅限于…」等），按官方英文逐条改写
  bandinglife: '己方每有一名拥有束带特质的盟友，获得 2 点生命值。',
  bandingmagic: '己方每有一名拥有束带特质的盟友，获得 1 点魔法值。',
  bandingarmor: '己方每有一名拥有束带特质的盟友，获得 2 点护甲值。',
  bandingattack: '己方每有一名拥有束带特质的盟友，获得 1 点攻击力。',
  truebanding: '己方每有一名拥有束带特质的盟友，全部技能值各获得 1 点。',
  // —— 接线批机翻错译定点修正（逐条与 data/raw/gow-2026-09-18 官方 EN 核对）——
  // eventide「Create an Enchanted Gem」——dump 把 Enchanted 误译作「魔法」；统一「附魔」
  eventide: '当我的轮次开始时创造一颗附魔宝石。',
  // astralaura「Create an Umbral Star Gem when matching 4 or more Gems」——dump「即可创建」
  // 的「即可」为机翻赘词，生成规则锚定不掉；按官方 EN 改写（规则头锚定「匹配」无「在」前缀）
  astralaura: '匹配 4 颗或更多宝石时，创建一颗暗影星宝石。',
  // stonefragment/icefragment「Create a Brown/Blue Mana Potion when I take skull damage」——
  // dump 把 skull damage 误译作「颅骨受伤」、量词作「一瓶」；统一到受击创造句式
  stonefragment: '在受到骷髅头伤害时创造一颗棕色法力药水宝石。',
  icefragment: '在受到骷髅头伤害时创造一颗蓝色法力药水宝石。',
  // —— 终扫批（2026-09-18 全量 28 个 missTraits 逐条核对后的收尾两条）——
  // daospuppet 官方「25% chance to summon the Dao when I die」（RawData summon +
  // death + Filter=6993）：dump 描述「有 25% 召唤恶道」漏了「几率」二字，概率捕获
  // 正则需要它；「恶道」改按兵种库实名「刀」（id 6993，official Filter 即其兵种 id）。
  daospuppet: '在自身身亡时，有 25% 的几率召唤刀。',
  // clanhunt 官方「Give 2 Attack to Green Allies when an Ally deals Skull damage」——
  // dump「给予所有与绿色盟友」的「与」为机翻衍字；触发词对齐引擎骷髅结算口径
  //（骷髅伤害经骷髅配对结算产生，与 powerofstars「配对骷髅头宝石时…」同款句式，
  // 描述↔触发点对账一致）。
  clanhunt: '在盟友配对骷髅头时，给予所有绿色盟友 2 点攻击力。',
};

/**
 * 官方英文描述权威、但中文机翻破损/漏译导致句式规则无法落地（或落地错语义）的特质，
 * 按 traits.en.json / troops.gow.en.json 的官方文本逐条显式写效果（核对报告 §1.1/§3.1）。
 * 命中本表的 code 不再走描述解析。
 */
const EXPLICIT_EFFECTS = {
  // 「Independent 25% chances to inflict Curse or Death Mark on a random Enemy」：
  // 两个独立 25% 判定（各中各的），不是一次 25% 两条全上。
  maladycurse: {
    onBigMatchStatus: {
      scope: 'randomEnemy', statuses: [{ id: 'curse' }, { id: 'death-mark' }],
      turns: 3, chance: 0.25, independentChance: true,
    },
  },
  // 「Barrier and Bless a random Ally when matching 4 or more Gems」（zh 机翻「获得屏障和
  // 一个随机盟友」破损不可解析）
  sanctuary: {
    onBigMatchStatus: { scope: 'randomAlly', statuses: [{ id: 'barrier' }, { id: 'blessed' }], turns: 3 },
  },
  // 「Curse and Burn a random Enemy」（zh 漏译「随机」，句式规则无法判定目标）
  hellfire: {
    onBigMatchStatus: {
      scope: 'randomEnemy', statuses: [{ id: 'curse' }, { id: 'burning', magnitude: 1 }], turns: 3,
    },
  },
  // —— 缺口清扫批（官方 EN + RawData 实锤、机翻文本不可解析或引擎映射表刻意不含的语义）——
  // 法印（enchanted）按批裁定不进 AURA_STATUS_MAP（AURA_UNKNOWN_STATUS 拦截），法印句全部
  // 走显式表；emperorsblessing/enchantedwind/fenixsblessing 官方「Enchant … on 4 or 5 Gem
  // matches」， fenixs 官方目标是随机 Ally（dump 误作敌人，已按 EN 改写描述）。
  emperorsblessing: {
    onBigMatchStatus: { scope: 'randomAlly', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  enchantedwind: {
    onBigMatchStatus: { scope: 'allAllies', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  fenixsblessing: {
    onBigMatchStatus: { scope: 'randomAlly', statuses: [{ id: 'blessed' }, { id: 'enchanted' }], turns: 3 },
  },
  // crystalize/spark/prosperousyear「Gain Enchant when matching X Gems」（持有者自身）
  crystalize: {
    onColorMatchStatus: { color: 'Purple', scope: 'self', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  spark: {
    onColorMatchStatus: { color: 'Red', scope: 'self', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  prosperousyear: {
    onColorMatchStatus: { color: 'Yellow', scope: 'self', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  // enchantinggaze「Enchant a random Ally when matching Purple Gems」（scope 扩到 randomAlly）
  enchantinggaze: {
    onColorMatchStatus: { color: 'Purple', scope: 'randomAlly', statuses: [{ id: 'enchanted' }], turns: 3 },
  },
  // brambleheart「Independent 50% chances to Entangle or inflict Bleed on a random Enemy
  // when matching Green Gems」——两条独立概率（各中各的），independentChance 语义无法从
  // 机翻「纠缠或流血」的「或」字可靠推断，按官方 EN 显式落表
  brambleheart: {
    onColorMatchStatus: {
      color: 'Green', scope: 'randomEnemy',
      statuses: [{ id: 'entangle' }, { id: 'bleed', magnitude: 1 }],
      turns: 3, chance: 0.5, independentChance: true,
    },
  },
  // 施法显式状态（moonfestival/gibberingmadness/hemlock/magehunter/psychicbacklash）：
  // 官方 EN 与 RawData（cast_spell + Filter=random/self）逐条核对；hemlock 中文已改写
  moonfestival: {
    onAllyCastStatus: { scope: 'randomAlly', statuses: [{ id: 'enchanted' }], turns: 3, chance: 0.3 },
  },
  gibberingmadness: {
    onAllyCastStatus: { scope: 'randomAlly', statuses: [{ id: 'rage' }], turns: 3 },
  },
  hemlock: {
    onAllyCastStatus: {
      scope: 'randomEnemy',
      statuses: [{ id: 'curse' }, { id: 'disease' }],
      turns: 3,
    },
  },
  magehunter: {
    onEnemyCastStatus: { scope: 'self', statuses: [{ id: 'rage' }], turns: 3 },
  },
  psychicbacklash: {
    onEnemyCastStatus: { scope: 'randomEnemy', statuses: [{ id: 'stun' }], turns: 3 },
  },
  // 施法敌方削减（psychicaffliction 消除魔法 / succumb 随机技能值，官方 adjust_random_stats
  // mod -4）：reduce 语义（持有者不进账），random=每次触发掷一条属性
  psychicaffliction: {
    onAllyCastEnemyDrain: { stat: 'magic', amount: 1, scope: 'allEnemies' },
  },
  succumb: {
    onAllyCastEnemyDrain: { stat: 'random', amount: 4, scope: 'allEnemies' },
  },
  // PVP 限定（defender/siege/virtueofhonor，官方 TraitType=pvp_*）：mode:'pvp' 惰性建模——
  // 本作无 PVP 模式层，字段编译进 passive 但标准战斗结算不读（任务裁定同 onDelve* 批）
  defender: {
    mode: 'pvp',
    pvpBonus: { phase: 'defense', gains: { armor: 3 } },
  },
  siege: {
    mode: 'pvp',
    pvpBonus: { phase: 'attack', gains: { attack: 2 } },
  },
  virtueofhonor: {
    mode: 'pvp',
    pvpBonus: { phase: 'battle', gains: { hp: 10, armor: 10, attack: 10, magic: 10 } },
  },
  // 束带计数光环（bandinglife/bandingmagic/bandingarmor/bandingattack/truebanding，
  // 官方 Filter=traitbanding「Gain N … for each Ally with a Banding Trait」）：中文已按
  // 官方 EN 改写；计数口径（含自己）与引擎 perAllyColor 同源
  bandinglife: {
    perAllyTrait: { trait: 'banding', gains: { hp: 2 } },
  },
  bandingmagic: {
    perAllyTrait: { trait: 'banding', gains: { magic: 1 } },
  },
  bandingarmor: {
    perAllyTrait: { trait: 'banding', gains: { armor: 2 } },
  },
  bandingattack: {
    perAllyTrait: { trait: 'banding', gains: { attack: 1 } },
  },
  truebanding: {
    perAllyTrait: { trait: 'banding', gains: { hp: 1, armor: 1, attack: 1, magic: 1 } },
  },
  // moonfever「Inflict Lycanthropy on a random Enemy when matching 4 or more Gems」：
  // 狼化状态本体已落地（status.ts WOLF_STATUS_IDS，狼化宝石同款 turns=3），
  // AURA_UNKNOWN_STATUS 拦「狼化」是历史时序——按官方 EN 显式落表
  moonfever: {
    onBigMatchStatus: { scope: 'randomEnemy', statuses: [{ id: 'lycanthropy' }], turns: 3 },
  },
  // —— 终扫批（28 个 missTraits 判读落地）——
  // clanhunt「Give 2 Attack to Green Allies when an Ally deals Skull damage」（RawData
  // adjust_allies_attack + on_skull_damage + Filter=1/color）：引擎的骷髅结算点对**整支
  // 行动方队伍**触发 'skull' 色键配色触发（TurnEngine 骷髅伤害结算后统一调
  // applyColorMatchTriggers('skull')）——「任一盟友造成骷髅伤害」与该触发点同一语义
  //（feartouch「匹配骷髅即造成骷髅伤害」先例）。复用 onColorMatchTypeAura 的 'skull' 键
  //（powerofstars/diamondaura 同款消费路径），scope 'Green' 经 scopeMatches 认颜色。
  clanhunt: {
    onColorMatchTypeAura: { color: 'skull', scope: 'Green', gains: { attack: 2 } },
  },
};

/**
 * 死亡/配对召唤的机翻兵种名 → 兵种库 referenceName（troops.json 精简表按 referenceName
 * 解析 troopId）。dump 描述里的召唤名与兵种名常对不上（半人马侦察兵 vs 人马斥候），
 * 逐条与 troops.gow.en.json 官方英文描述交叉核对后固化。daospuppet 召唤「the Dao」
 * 在兵种库无此兵种，留未实现桶。
 */
const SUMMON_TROOP_NAME_FIX = {
  herdspirit: 'CentaurScout',
  dragonboon: 'Dragonette',
  stonepact: 'StoneMefyt',
  dissolve: 'GreenSlime',
  infernalpact: 'Hellhound',
  wolfcompanion: 'Warfang',
  daoslamp: 'ServantOfTheDao',
  // 终扫批：daospuppet 官方 RawData Filter=6993 即兵种 id——「the Dao」= 兵种库
  // 「刀」（referenceName Dao，id 6993），与旧注「兵种库无此兵种」已不符。
  daospuppet: 'Dao',
};

/**
 * 复活族召唤表（缺口清扫批 11 code，官方 summon_and_fill /「resurrect with full Mana」）：
 * 复活 = 身亡时按概率召唤一个兵种模板，code → 兵种 referenceName。大多数是「复活自己」
 * （持有者本人，immortal→InfernalKing / *soul 七族→各自持有者），rebirth/hiddennest 是
 * 官方指明的变身物（幼龙 BabyDragon / 恶龙蛋 FellDragonEgg）。fullMana=官方明示「满法力
 * 入场」（immortal 官方只说 resurrect after death，不带 mana）。
 * 概率从中文描述的「N% 的几率」捕获（11 条官方数值与机翻一致，审计对账兜底）。
 */
const RESURRECT_SUMMON = {
  immortal: { ref: 'InfernalKing', fullMana: false },
  rebirth: { ref: 'BabyDragon', fullMana: true },
  eternaldawn: { ref: 'Quetzalma', fullMana: true },
  hiddennest: { ref: 'FellDragonEgg', fullMana: true },
  deepsoul: { ref: 'Krakynos', fullMana: true },
  cursedsoul: { ref: 'Runethius', fullMana: true },
  bloodysoul: { ref: 'Hematrax', fullMana: true },
  eldritchsoul: { ref: 'Vizinium', fullMana: true },
  deadlysoul: { ref: 'Demizerius', fullMana: true },
  ancientsoul: { ref: 'Amenhotrex', fullMana: true },
  infernalsoul: { ref: 'Pandemonia', fullMana: true },
};

/**
 * 回合开始创造的风暴表（缺口清扫批 11 code，官方 create_storm / Activation=start_turn）。
 * 键为中文描述截获的风暴词干；colors=官方 Filter 的 BoostColors（原色风暴单色，
 * 混合风暴双色——引擎风暴契约只支持单色加权，混合风暴为惰性数据建模）。
 * referenceName 为官方风暴名；骸骨风暴沿用 STORM_MAP 的骷髅系 dropKind。
 */
const TURN_START_STORM_MAP = {
  暗: { referenceName: 'Darkstorm', displayName: '暗风暴', colors: ['Purple'] },
  冰: { referenceName: 'Icestorm', displayName: '冰风暴', colors: ['Blue'] },
  光: { referenceName: 'Lightstorm', displayName: '光风暴', colors: ['Yellow'] },
  尘: { referenceName: 'Duststorm', displayName: '尘风暴', colors: ['Brown'] },
  骨: { referenceName: 'Bonestorm', displayName: '骨风暴', colors: ['Brown'], dropKind: 'skull' },
  疯狂: { referenceName: 'Madnessstorm', displayName: '疯狂风暴', colors: ['Blue', 'Purple'] },
  电: { referenceName: 'Electrostorm', displayName: '电风暴', colors: ['Red', 'Yellow'] },
  星: { referenceName: 'Starstorm', displayName: '星风暴', colors: ['Yellow', 'Purple'] },
  熔岩: { referenceName: 'Lavastorm', displayName: '熔岩风暴', colors: ['Red', 'Brown'] },
  Holly: { referenceName: 'Hollystorm', displayName: 'Hollystorm', colors: ['Green', 'Red'] },
  狂风: { referenceName: 'Galestorm', displayName: '狂风暴雨', colors: ['Blue', 'Yellow'] },
};

/** DoT 状态施加时带 magnitude:1（bleed 与 poison/burning 同为每回合跳伤的攻击性 DoT） */
const isDotStatus = (id) => id === 'poison' || id === 'burning' || id === 'bleed';
/** 引擎尚未实现的状态/机制关键词，用于报告 */
const UNSUPPORTED_STATUS = /疾病|狼化|死亡标记|吞噬|法力燃烧|法力耗尽|法力窃取|恐怖|出血|猎人标记|受诅|转化|屏障|下潮|狂怒|法印|风暴/;

const COLOR_MAP = [
  // 「色」字可省（roseaura「匹配红宝石时窃取 4 条生命」——机翻省略了「色」）
  [/蓝[色]?/, 'Blue'], [/绿[色]?/, 'Green'], [/红[色]?/, 'Red'],
  [/黄[色]?/, 'Yellow'], [/紫[色]?/, 'Purple'], [/棕[色]?/, 'Brown'],
];

const STAT_MAP = [
  [/生命值/, 'hp'], [/护甲值/, 'armor'], [/攻击力/, 'attack'], [/魔法值/, 'magic'], [/技能值/, 'magic'],
  // 「提供 4 点护甲」（celestialbarrier）不带「值」：放最后兜底，避免抢走「护甲值」的匹配
  [/护甲/, 'armor'],
  // 机翻省字/别称（收编批）：「4 点生命」（bountifulgrowth）、「盔甲」（vast 官方译法）
  [/生命/, 'hp'],
  [/盔甲/, 'armor'],
];

/**
 * 条件光环可施加的状态 = 引擎已落地的状态本体全集（**不**并入全局 STATUS_MAP——
 * 免疫/命中附状态等其它规则的接线属于状态批，不在本批范围）。
 * bleed 等攻击性 DoT 施加时带 magnitude:1（与命中附状态口径一致）。
 */
const AURA_STATUS_MAP = [
  [/冻结|冰冻/, 'frozen'],
  // 流血=bleed 的机翻别称（bloodyfury「施加流血效果」）；毒药=poison 别称（venomouscurse）
  [/出血|流血/, 'bleed'],
  [/中毒|毒药/, 'poison'],
  [/燃烧/, 'burning'],
  // 妖火独立状态（motherswrath 的机翻「精灵之火」同指 Faerie Fire）
  [/妖火|妖仙|精灵之火/, 'faerie-fire'],
  // 激怒=rage 动词（ancientguardian「激怒并阻挡」）；阻挡=barrier 机翻动词
  [/狂怒|激怒/, 'rage'],
  [/屏障|阻挡/, 'barrier'],
  [/下潜|下潮/, 'submerged'],
  [/反射/, 'reflect'],
  [/赐福|祝福/, 'blessed'],
  [/诅咒/, 'curse'],
  [/魅惑/, 'charm'],
  // 患病=disease 机翻别称（sicknessaura「患病和中毒」）
  [/疾病|患病/, 'disease'],
  [/死亡标记/, 'death-mark'],
  [/缠绕|纠缠/, 'entangle'],
  [/织网/, 'web'],
  [/击晕|眩晕/, 'stun'],
  [/沉默/, 'silence'],
  // T5 批补收：恐怖本体在 T1/T3 批已落地（status.ts TERROR_STATUS_ID），当时条件光环
  // 映射表没收是历史时序问题；terrorqueen/gapingwounds/icyterror 三条靠它入大连施加。
  [/恐怖/, 'terror'],
  // T5 配色状态批补收：猎人标记本体同在 T1/T3 批落地（status.ts MARK_STATUS_ID，
  // RESCUE_STATUS_MAP 早有映射），huntersmoon「配对红色→随机猎人标记」是首条施加句。
  [/猎人标记/, 'marked'],
];
/** 引擎尚无对应状态本体：含这些词的条件光环句子整体不收（不做缺状态的半解析） */
const AURA_UNKNOWN_STATUS = /法印|狼化|风暴|石化|催眠|惑乱|迷惑|变羊|吞噬|受诅|嘲讽/;
/** 「随机的正面增益状态效果」（dragonsblessing）的候选池 */
const POSITIVE_STATUS_POOL = [
  { id: 'barrier' }, { id: 'rage' }, { id: 'reflect' }, { id: 'blessed' }, { id: 'enchanted' },
];

/**
 * 「一个随机的状态效果」（experiment「使随机一名敌人陷入一个随机的状态效果」）的候选池：
 * 与引擎 skills/effects/status.ts 的 RANDOM_NEGATIVE_STATUS_POOL 同源（12 项施加管线
 * 已落地的负面状态）。DoT（中毒/燃烧/出血）与全局口径一致带 magnitude:1。
 */
const NEGATIVE_STATUS_POOL = [
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'death-mark', 'charm',
];

/**
 * 中文族名 → 英文 TroopType。
 *
 * 不靠翻译猜：对每个「X盟友获得 N 点 Y」特质，统计实际持有它的兵种的 TroopType 分布，
 * 取占比最高者作为该族名的英文类型（61/64 条命中率 ≥0.8，见 artifacts/troop-types.txt）。
 * 机械/不死族之盾两条命中率偏低是因为兵种常带双类型，这里按语义直接指定。
 */
const TROOP_TYPE_MAP = {
  野兽: 'Beast', 妖仙: 'Fey', 元素: 'Elemental', 龙族: 'Dragon', 人类: 'Human',
  恶魔: 'Daemon', 神祇: 'Divine', 怪物: 'Monster', 骑士: 'Knight', 建造: 'Construct',
  蛮族: 'Wildfolk', 盗贼: 'Rogue', 精灵: 'Elf', 狼族: 'Wargare', 巨人: 'Giant',
  不死族: 'Undead', 人马: 'Centaur', 哥布林: 'Goblin', 猫族: 'Raksha', 秘士: 'Mystic',
  鸟族: 'Stryx', 纳迦: 'Naga', 海族: 'Merfolk', 厄仑卡: 'Urska', 矮人: 'Dwarf',
  牛头族: 'Tauros', 兽人: 'Orc', 机械: 'Mech', 石人: 'Construct', 侏儒: 'Gnome',
  半人马: 'Centaur', 罗刹: 'Raksha', 不朽: 'Immortal',
  厄什卡: 'Urska', 罗格: 'Rogue',
  怪兽: 'Monster', // 「怪兽盟友」与「怪物」同义（psychicpulse）
  // 机翻族名别名（收编批：报告 3.1 Top 表逐条核对官方 EN TroopType 后补）
  美人鱼: 'Merfolk', 人鱼: 'Merfolk', 神圣: 'Divine', 机甲: 'Mech',
  // 「巨型盟友」（mountainclan，官方 Giant——dump 未带「人」字）
  巨型: 'Giant',
};

const num = (s) => Number(s);

/**
 * 中文特殊宝石名 → 引擎 SpecialGemKind（子串匹配，尾缀「宝石/符」可有可无）。
 * 顺序敏感：超级末日骷髅头先于末日骷髅头、x3 先于 x2。逐条与官方 EN dump
 * （data/raw/troops.gow.en.json）交叉核对：狂怒/愤怒/激怒宝石同为 Enrage Gem、
 * 妖仙宝石=Faerie Fire Gem（faeriesoul 机翻）、蛛网/网络宝石=Web Gem、
 * 死亡印记宝石=Death Mark Gem。不在表内的（狼化/石像鬼/龙族/元素星/法力药剂/
 * 天使/灵魂/恶魔门户/腐烂/魔法/灵力宝石等）= 引擎未实现，命中句式也整体不收。
 */
const SPECIAL_GEM_MAP = [
  [/x3\s*通配/, { kind: 'wildcard', tier: 3 }],
  [/x2\s*通配/, { kind: 'wildcard', tier: 2 }],
  // 「极度末日骷髅头」= Uber Doomskull 的另一机翻（onyxshard），与「超级」同义并在前拦截
  [/超级末日骷髅头|极度末日骷髅头/, { kind: 'uberDoomSkull' }],
  [/末日骷髅头/, { kind: 'doomSkull' }],
  [/织网|蛛网|网络/, { kind: 'web' }],
  [/燃烧/, { kind: 'burningGem' }],
  [/冻结/, { kind: 'freezeGem' }],
  [/诅咒/, { kind: 'curseGem' }],
  [/毒/, { kind: 'poisonGem' }],
  [/流血/, { kind: 'bleedGem' }],
  [/恐怖/, { kind: 'terrorGem' }],
  [/死亡标记|死亡印记/, { kind: 'deathMarkGem' }],
  [/纠缠|缠绕/, { kind: 'entangleGem' }],
  [/激怒|愤怒|狂怒/, { kind: 'enrageGem' }],
  [/许愿|愿望/, { kind: 'wish' }],
  [/赃物/, { kind: 'bootyGem' }],
  [/妖火|妖仙/, { kind: 'faerieFireGem' }],
  [/鬼魂/, { kind: 'ghost' }],
  [/屏障/, { kind: 'barrierGem' }],
  [/击晕|眩晕/, { kind: 'stunGem' }],
  [/沉没/, { kind: 'submergeGem' }],
  [/沙漏/, { kind: 'hourglass' }],
  [/炸弹/, { kind: 'bomb' }],
  // —— 接线批补收（引擎波 B 已落地的 kind；dump 机翻词逐条对照官方 EN）——
  [/腐烂/, { kind: 'decayGem' }],
  [/恶石像鬼/, { kind: 'gargoyleGem', tier: 2 }],
  [/善石像鬼|优质石像鬼/, { kind: 'gargoyleGem', tier: 1 }],
  [/天使/, { kind: 'angelGem' }],
  [/元素之星|元素星/, { kind: 'elementalStar' }],
  [/暗影之星|暗影星/, { kind: 'umbralStar' }],
  [/狼化|狼人/, { kind: 'lycanthropyGem' }],
  [/法力药水|法力药剂/, { kind: 'manaPotionGem' }],
  [/灵魂宝石|灵力宝石|灵魂|灵力/, { kind: 'spiritGem' }],
  [/附魔/, { kind: 'enchantedGem' }],
  [/恶魔门户/, { kind: 'daemonicPortalGem' }],
  [/巨人/, { kind: 'giantGem' }],
  [/龙/, { kind: 'dragonGem' }],
];
const pickSpecialGem = (desc) => SPECIAL_GEM_MAP.find(([re]) => re.test(desc))?.[1];

const COLOR_CHAR_TO_BASE = { 蓝: 'Blue', 绿: 'Green', 红: 'Red', 黄: 'Yellow', 紫: 'Purple', 棕: 'Brown' };

/**
 * 带色前缀的宝石名解析（接线批 *shard 巨人宝石族 / 蓝龙宝石族 / 法力药水族）：
 * 「蓝色巨人宝石」→ giantGem + Blue；剥掉前导数量词（「一颗蓝龙」→「蓝龙」）。
 * spiritGem 官方颜色集合存疑——落引擎既定缺省紫（types.ts SPECIAL_MATCH_COLOR 注），
 * 否则无 spec.color 的灵力宝石 joinKey=null 不可匹配。
 */
function pickSpecialGemColored(raw) {
  const name = String(raw ?? '').replace(/^(?:一|\d+)\s*[颗个瓶枚]/, '').trim();
  const m = /^(蓝|绿|红|黄|紫|棕)色?/.exec(name);
  const base = m ? name.slice(m[0].length) : name;
  const gem = pickSpecialGem(base);
  if (!gem) return null;
  if (m) return { ...gem, color: COLOR_CHAR_TO_BASE[m[1]] };
  if (gem.kind === 'spiritGem') return { ...gem, color: 'Purple' };
  return gem;
}

/** 「N 颗/个/名」计数捕获 → 数字（「一」按 1；无捕获缺省 1；「2 颗」取整数前缀） */
const countOf = (raw) => {
  if (raw === undefined) return 1;
  const s = String(raw).trim();
  if (s[0] === '一') return 1;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 1;
};

/**
 * 回合开始/轮次开始的触发头（T4 创造批共用）：
 * 在/当、我的/我、每一个、回合/轮次开始、的时候/时 全部可选；「轮到我行动时」独立分支
 * （chaoticdesire/silkenweave 的官方译法）。
 */
const TURN_START_HEAD = String.raw`(?:(?:当|在)?(?:我的|我)?(?:每一个|每一)?(?:回合|轮次)开始(?:的时候|时)?|轮到我行动时)`;

/**
 * 屠戮条件的可用状态全集（O 桶高频批）：基础表 + 特质可救批扩展表 + 下潜。
 * 下潜（submerged）本体在 status.ts 已落地（UNTARGETABLE_STATUS_IDS），命中附状态
 * 映射表没收它是因为没有「命中施加下潜」的官方句式；屠戮条件有（depthcharge
 * 「对已下潜的敌人造成双倍骷髅头伤害」），在此补上。含未落地状态词（法印/吞噬…）
 * 的句子整体不收，不做缺状态半解析。
 */
const DAMAGE_CONDITION_MAP = [...RESCUE_FULL_STATUS_MAP, [/下潜|下潮/, 'submerged'],
  // 法印=Enchanted（引擎已注册 'enchanted' 状态 id；antimagic「对拥有法印效果的敌人
  // 造成双倍骷髅头伤害」按此映射。条件光环仍不收法印——见 AURA_UNKNOWN_STATUS。）
  [/法印/, 'enchanted']];

/**
 * 解析屠戮类特质的「条件」描述：陷入某状态的敌人 / 被击晕的敌人 / 受伤的敌人。
 * 只认引擎已有的状态；`受伤` 是「当前生命低于上限」的状况，不是状态。
 */
function parseDamageCondition(text) {
  if (/受伤/.test(text)) return { wounded: true };
  const hit = DAMAGE_CONDITION_MAP.find(([re]) => re.test(text));
  return hit ? { status: hit[1] } : null;
}
const pickColor = (desc) => COLOR_MAP.find(([re]) => re.test(desc))?.[1];
const pickStat = (desc) => STAT_MAP.find(([re]) => re.test(desc))?.[1];

/** 触发类特质的属性词 → 引擎 stat（含随机技能值→magic、法力值→mana 的既有约定） */
const pickTriggerStat = (word) => (word === '随机技能值' ? 'magic' : word === '法力值' ? 'mana' : pickStat(word));

/**
 * 解析共享数值的属性列表（条件光环族）：「攻击力、护甲值和生命值」「生命值和魔法值」
 * 「全部技能值」（四项各 N）「随机技能值」（→ magic）。解析不了返回 null。
 */
function parseGainsList(text, value) {
  const gains = {};
  for (const part of text.split(/[、和，]/).map((s) => s.trim()).filter(Boolean)) {
    if (/^全部技能/.test(part)) {
      gains.hp ??= value; gains.armor ??= value; gains.attack ??= value; gains.magic ??= value;
      continue;
    }
    const stat = pickTriggerStat(part);
    if (!stat) return null;
    gains[stat] ??= value;
  }
  return Object.keys(gains).length > 0 ? gains : null;
}

/** 把一条描述解析成引擎效果；无法完整表达返回 null 并给出原因。code 供召唤名修复等定点表使用。 */
function parse(desc, code) {
  let m;

  // 减伤：降低来自骷髅头的伤害 N%
  if ((m = /降低来自骷髅头的伤害\s*(\d+)%/.exec(desc))) {
    return { effects: { skullDamageReduction: num(m[1]) / 100 } };
  }
  // 消除 N% 的骷髅头伤害（等价减伤）
  if ((m = /消除\s*(\d+)%\s*的骷髅头伤害/.exec(desc))) {
    return { effects: { skullDamageReduction: num(m[1]) / 100 } };
  }
  // 减伤：降低来自法术的伤害 N%
  if ((m = /降低来自法术的伤害\s*(\d+)%/.exec(desc))) {
    return { effects: { spellDamageReduction: num(m[1]) / 100 } };
  }
  // 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」，O 桶判读批）：
  // 三个动词都是**效果操作**不是状态——引擎唯一的法力削减入口是 skills/effects/debuff.ts
  // 的 reduceEffect（stat='mana' 同时覆盖耗蓝/耗尽/减半/窃取），落 manaOpsImmunity 在执行
  // 入口对带此被动的目标整体跳过。「灼烧」另对应引擎已识别的 mana-burn 状态 id
  // （status.ts MANA_BURN_STATUS_IDS，自动消退集合成员），一并挂 statusImmunities：
  // 现在就挡技能施加端，将来有 DoT 式法力燃烧结算也自动免疫。
  if (/^对法力灼烧、法力耗尽和法力窃取免疫。?$/.test(desc)) {
    return { effects: { manaOpsImmunity: true, statusImmunities: ['mana-burn'] } };
  }
  // —— 战斗机制批（jinx / leader 族 / indigestible / goodtarot+badtarot，7 code）——
  // 全部整条锚定（官方英文描述逐条核对过，见 data/raw/gow-2026-09-18/traits.en.json）。

  // jinx（官方「Halve enemy Gem Masteries」，Activation=start_battle /
  // TraitType=adjust_all_masteries / Modifier=0.5）：本引擎以「匹配宝石产出的法力」
  // 作为 Gem Masteries（宝石灵力）的落地模型，敌方队伍宝石法力获取 ×0.5。
  if (/^将敌人的宝石灵力减半。?$/.test(desc)) {
    return { effects: { enemyMasteryMult: 0.5 } };
  }
  // 位次条件光环（leader「Gain 3 to all Skills if in first position」 /
  // general 同款末位版 / goblord 单属性末位版）：front=编队首位、last=编队末位；
  // 「全部技能值」= 四项各 N（giftof* 族同口径展开）。
  if ((m = /^(?:当|如果)军队位于(首位|末位)时?[，,]?全部技能值将增加\s*(\d+)\s*点。?$/.exec(desc))) {
    const v = num(m[2]);
    return { effects: { positionAura: { position: m[1] === '首位' ? 'front' : 'last', gains: { hp: v, armor: v, attack: v, magic: v } } } };
  }
  if ((m = /^(?:当|如果)军队位于(首位|末位)时?[，,]?则?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[3]);
    if (!stat) return null;
    return { effects: { positionAura: { position: m[1] === '首位' ? 'front' : 'last', gains: { [stat]: num(m[2]) } } } };
  }
  // indigestible（官方「Immunity to Devour」）：引擎尚无吞噬机制，落数据字段
  // devourImmunity 编译进 passive，供吞噬机制将来落地时经 passivesOf 消费。
  if (/^对吞噬免疫。?$/.test(desc)) {
    return { effects: { devourImmunity: true } };
  }
  // —— R22 吞噬批（voracious/consumefuel/bloodyfeast，3 code）——
  // 「有 N% 的几率吞噬」→ devour 触发字段（chance = N/100），触发头按官方句式分流：
  // 「在造成骷髅头伤害时」→ 命中侧 onSkullHitDevour（吞本次受击目标）；
  // 「头骨受到伤害时」→ 受击侧 onSkullDamagedDevour（官方「吞噬第一个敌人」的引擎落地
  //   口径=吞攻击者：持有者受骷髅伤害时攻击者即敌方队首）；
  // 「若敌人死亡」→ 敌亡侧 onEnemyDeathDevour（吞死者一方随机一名存活）。
  // 消费端复用 devourEffect 原语（即杀 + 官方成长额度），吞噬免疫在原语口拦截。
  if ((m = /^在?造成骷髅头伤害时有\s*(\d+)\s*%\s*的?几率吞噬/.exec(desc))) {
    return { effects: { onSkullHitDevour: { chance: num(m[1]) / 100 } } };
  }
  if ((m = /^头骨受到伤害时有\s*(\d+)\s*%\s*的?几率吞噬/.exec(desc))) {
    return { effects: { onSkullDamagedDevour: { chance: num(m[1]) / 100 } } };
  }
  if ((m = /^若敌人死亡[，,]则有\s*(\d+)\s*%\s*的?几率吞噬/.exec(desc))) {
    return { effects: { onEnemyDeathDevour: { chance: num(m[1]) / 100 } } };
  }
  // 施法响应·随机状态（goodtarot「Grant a random status effect to a random Ally when an
  // Ally casts a spell」/ badtarot 同款但目标是随机敌人）：池按 scope 取阵营——
  // 盟友=正面池、敌人=负面池（与技能 randomStatusEffect 的阵营裁定同源，池在消费端取）。
  if ((m = /^(?:当|在)(?:一名|任一)盟友施(?:放|法)法?术?时[，,]?使一名随机(盟友|敌人)陷入一个状态效果。?$/.exec(desc))) {
    return { effects: { onAllyCastRandomStatus: { scope: m[1] === '盟友' ? 'randomAlly' : 'randomEnemy' } } };
  }
  // —— 缺口清扫批（203 code 全量核对后的新句式族，全部整条锚定、「全部命中才收」）——
  // 逐条官方英文依据见 data/raw/gow-2026-09-18/traits.en.json 与 artifacts/recycle/missing-traits-en.json。

  // 复活族（11 code，官方 summon_and_fill「resurrect / become X … on death」）：按 code 查
  // RESURRECT_SUMMON（复活=召唤自身模板 / 官方指明变身物），概率取描述里的「N%」。
  // 必须先于死亡召唤三族块：描述里有「身亡/死亡」但无「召唤」二字，不会互抢。
  if (RESURRECT_SUMMON[code]) {
    const spec = RESURRECT_SUMMON[code];
    const slim = (Array.isArray(troopsSlim) ? troopsSlim : troopsSlim.raw_data ?? []).find((t) => t.referenceName === spec.ref);
    const chanceM = /(\d+)\s*%\s*的?几?率?/.exec(desc);
    if (slim && chanceM) {
      return {
        effects: {
          summonOnDeath: {
            chance: num(chanceM[1]) / 100,
            troopId: slim.id,
            referenceName: slim.referenceName,
            displayName: slim.name,
            ...(spec.fullMana ? { fullMana: true } : {}),
          },
        },
      };
    }
    return null;
  }
  // 开局范围光环（iceaura 族 6 色「All Blue Allies gain 5 to all Stats」）：「全部状态值/
  // 技能值」= 四项各 N（giftof* 族同口径展开）
  if ((m = /^所有(.+?)盟友的全部(?:状态值|技能值)将增加\s*(\d+)\s*点。?$/.exec(desc))) {
    const scope = pickColor(m[1]) ?? TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    const v = num(m[2]);
    if (scope) return { effects: { battleStartTypeAura: { scope, gains: { hp: v, armor: v, attack: v, magic: v } } } };
  }
  // 开局范围光环·多属性（soaring「Allied Stryx gain 5 Life and Attack」）：无触发头的裸
  // 「X盟友获得 N 点<stats>」句；带触发头的同形句（virtue 家族「当敌人身亡时，所有盟友
  // 获得 3 点攻击力和护甲值」）由负向护栏排除，落回各自的死亡/施法/大连规则。
  if ((m = /^(.{1,12}?)盟友获得\s*(\d+)\s*点((?:生命值|护甲值|攻击力|魔法值)(?:和(?:\s*(\d+)\s*点)?(?:生命值|护甲值|攻击力|魔法值))+)[，,]?。?$/.exec(desc))
    && !/身亡|施法|施放|配对|匹配|消除|受到|伤害|承受/.test(desc)) {
    const scope = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    const gains = parseGainsList(m[3], num(m[2]));
    if (scope && gains) return { effects: { battleStartTypeAura: { scope, gains } } };
  }
  // 种族开局法力（orclord/lordofbeasts/hauntedcrown 族 17 code「All X Allies start with
  // N% Mana」）：给予/获得/拥有/初始四种机翻句式；「所有」前缀与开局法力规则（battleStartManaRatio
  // 的 !/所有/ 护栏）互斥不抢。官方 Filter=种族（orc/beast/…），Ratio 缺省 50%。
  if ((m = /^在战斗开始(?:的时候|时)[，,]?给予所有(.+?)盟友\s*(\d+)\s*%(?:\s*的)?\s*法力值?。?$/.exec(desc))
    || (m = /^所有(.+?)(?:军队|盟友)?(?:在战斗开始(?:的时候|时)[，,]?(?:获得|拥有|都有)|初始法力值?为?)\s*(\d+)\s*%(?:\s*的)?\s*(?:法力值?)?。?$/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    if (!troopType) return null;
    return { effects: { allyStartMana: { troopType, ratio: num(m[2]) / 100 } } };
  }
  // 回合开始范围光环（queensgrace/feralinspiration/nightsong/blessingofanu 族 17 code）。
  // 三种语序：scope 前置（「所有蛮族在每一回合开始时获得…」）/ 头前置（「在每回合开始时，
  // 所有恶魔军队获得…」「给予所有元素盟友…」）/ 增加形（「所有巨型盟友的攻击力和护甲值
  // 增加2点」「全部状态值将增加 1 点」）。官方 trig=self_player——引擎侧只在持有者一方
  // 行动的回合结算（applyTurnStartPassives 只收行动方队伍），语义一致。
  const turnAuraScope = (raw) => {
    const name = raw.replace(/(?:盟友|军队)$/g, '');
    return TROOP_TYPE_MAP[name] ?? TROOP_TYPE_MAP[`${name}族`] ?? pickColor(name);
  };
  // 属性列表尾（严格枚举，杜绝 (.+?) 吃进句尾标点的退化匹配——退化命中会让本族文本
  // 在错误的语序分支里 return null，吞掉后面的正确分支）
  const AURA_STATS = String.raw`(?:全部技能值|全部状态值|所有技能值|随机技能值|生命值|护甲值|攻击力|魔法值)(?:[、和](?:\s*(?:\d+)\s*点)?(?:全部技能值|全部状态值|所有技能值|随机技能值|生命值|护甲值|攻击力|魔法值))*`;
  if ((m = new RegExp(String.raw`^所有\s*(.+?)\s*(?:盟友|军队)?将?在?(?:我的|自身的?)?(?:每一个|每一|每个|每)?回合开始(?:的时候|时)?[，,]?(?:获得|拥有|都有|提供)?\s*(\d+)\s*点\s*` + `(${AURA_STATS})` + String.raw`[，,]?。?$`).exec(desc))) {
    const scope = turnAuraScope(m[1]);
    const gains = parseGainsList(m[3], num(m[2]));
    if (scope && gains) return { effects: { turnStartTypeAura: { scope, gains } } };
    return null;
  }
  if ((m = new RegExp(String.raw`^[当在]?(?:我的|自身的?)?(?:每一个|每一|每个|每)?回合开始(?:的时候|时)?[，,]?(?:给予|为|提供)?\s*所有\s*(.+?)\s*(?:盟友|军队)?\s*(?:获得|拥有|都有|提供)?\s*(\d+)\s*点\s*` + `(${AURA_STATS})` + String.raw`[，,]?。?$`).exec(desc))) {
    const scope = turnAuraScope(m[1]);
    const gains = parseGainsList(m[3], num(m[2]));
    if (scope && gains) return { effects: { turnStartTypeAura: { scope, gains } } };
    return null;
  }
  if ((m = /^[当在]?(?:我的|自身的?)?(?:每一个|每一|每个|每)?回合开始(?:的时候|时)?[，,]?所有\s*(.+?)\s*(?:盟友|军队)?的((?:生命值|护甲值|攻击力|魔法值)(?:[、和](?:\s*(\d+)\s*点)?(?:生命值|护甲值|攻击力|魔法值))+)(?:将)?增加\s*(\d+)\s*点[，,]?。?$/.exec(desc))) {
    const scope = turnAuraScope(m[1]);
    const gains = parseGainsList(m[2], num(m[4]));
    if (scope && gains) return { effects: { turnStartTypeAura: { scope, gains } } };
    return null;
  }
  if ((m = /^[当在]?(?:我的|自身的?)?(?:每一个|每一|每个|每)?回合开始(?:的时候|时)?[，,]?所有\s*(.+?)\s*(?:盟友|军队)?的?(?:全部|所有)(?:技能值?|状态值)(?:将)?增加\s*(\d+)\s*点[，,]?。?$/.exec(desc))) {
    const scope = turnAuraScope(m[1]);
    const v = num(m[2]);
    if (scope) return { effects: { turnStartTypeAura: { scope, gains: { hp: v, armor: v, attack: v, magic: v } } } };
    return null;
  }
  // 回合开始创造风暴（snowstorm/penumbra/shroudofskulls 等 11 code「Create a Xstorm at the
  // start of every turn」）：风暴名查 TURN_START_STORM_MAP（含混合双色的惰性建模）。
  // 「轮次」（shroudofskulls 机翻）与英文名 Hollystorm（holly&ivy）一并收。
  if ((m = /^[当在]?(?:我的)?(?:每一个|每一|每个|每)?(?:回合|轮次)开始(?:的时候|时)?[，,]?(?:创造|召唤|制造)出?(?:一(?:场|个))?\s*(.+?)\s*(?:风暴|暴雨|storm)。?$/i.exec(desc))) {
    const storm = TURN_START_STORM_MAP[m[1]?.trim()];
    if (storm) {
      return {
        effects: {
          turnStartStorm: {
            referenceName: storm.referenceName,
            displayName: storm.displayName,
            colors: storm.colors,
            ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
          },
        },
      };
    }
    return null;
  }
  // 回合开始按概率召唤（harpyflock 鸟妖 / parliamentarycall 枭熊）：复用死亡召唤的兵种名
  // 解析（TROOP_BY_NAME 中文名直查），召唤物数据建模完整；回合钩子暂无召唤口（惰性字段）。
  if ((m = /^在?我的回合开始(?:的时候|时)?[，,]?有\s*(\d+)\s*[％%]\s*的?几率召唤一?[名只个头]?(.+?)。?$/.exec(desc))) {
    const troop = resolveSummonedTroop(desc);
    if (troop && !troop.storm) {
      return {
        effects: {
          turnStartSummon: {
            chance: num(m[1]) / 100,
            troopId: troop.troopId,
            referenceName: troop.referenceName,
            displayName: m[2].trim(),
          },
        },
      };
    }
    return null;
  }
  // —— 接线批：回合开始施加状态（11 code，官方 EN + RawData start_turn + cause_* 逐条核对）——
  // 消费口 TurnEngine.applyTurnStartEconomyAndSummons（仅行动方回合结算，官方 trig=self_player）。
  // 目标：自身=self（tidalking）/ 一名随机敌人=randomEnemy / 所有敌人=allEnemies（curseofdamnation）/
  // 一名随机盟友=randomAlly / 所有盟友=allAllies（blessedwaters）；DoT（燃烧）带 magnitude:1；
  // 概率句收 chance；「和/或」（sleepersbane 官方 "50% chances to Curse and/or inflict Terror"）
  // = 两条独立概率，落 independentChance。头部放宽「轮到我的回合」（sunflare 机翻语序）。
  // scope/状态词任一解析不了则**不拦截**（落回后续规则）——不做半解析。
  if ((m = new RegExp(String.raw`^(?:(?:当|在)?(?:轮到我的|我的|我)?(?:每一个|每一)?(?:回合|轮次)开始(?:的时候|时)?)[，,]?\s*(?:(?:有\s*)?(\d+)\s*%\s*的?(?:几[率会]|机会)\s*)?(.+?)。?$`).exec(desc))) {
    const tail = m[2];
    const scope = /自身|自己/.test(tail) && !/敌人|盟友/.test(tail) ? 'self'
      : /所有敌人/.test(tail) ? 'allEnemies'
        : /所有盟友/.test(tail) ? 'allAllies'
          : /随机/.test(tail) && /敌人/.test(tail) ? 'randomEnemy'
            : /随机/.test(tail) && /盟友/.test(tail) ? 'randomAlly'
              : null;
    if (scope) {
      const found = AURA_STATUS_MAP.filter(([re]) => re.test(tail)).map(([, id]) => id);
      if (found.length > 0) {
        const chanceM = m[1];
        return {
          effects: {
            turnStartStatus: {
              target: scope,
              statuses: [...new Set(found)].map((id) => (isDotStatus(id) ? { id, magnitude: 1 } : { id })),
              turns: 3,
              ...(chanceM !== undefined ? { chance: num(chanceM) / 100 } : {}),
              ...(/和\/或/.test(tail) ? { independentChance: true } : {}),
            },
          },
        };
      }
    }
  }
  // 回合开始自身增益·单/随机技能值（darklordrising 3 魔法 / heofmanyparts「2 个随机技能值」，
  // 随机技能值→magic 与 pickTriggerStat 既有约定一致）→ regen
  if ((m = /^在?我的回合开始(?:的时候|时)?[，,]?获得\s*(\d+)\s*[点个](随机技能值|生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickTriggerStat(m[2]);
    if (!stat) return null;
    return { effects: { regen: { stat, amount: num(m[1]) } } };
  }
  // 回合开始自身增益·共享数值多属性（wildhorns「攻击力、生命值和护甲值获得2点提升」，
  // 属性词在数词前）→ regen alsoStats
  if ((m = /^在?我的回合开始(?:的时候|时)?[，,]?((?:随机技能值|生命值|护甲值|攻击力|魔法值)(?:[、和](?:\s*(\d+)\s*点)?(?:随机技能值|生命值|护甲值|攻击力|魔法值))*)获得\s*(\d+)\s*点(?:提升|增益)?。?$/.exec(desc))) {
    const gains = parseGainsList(m[1], num(m[3]));
    if (!gains) return null;
    const stats = Object.keys(gains);
    return { effects: { regen: { stat: stats[0], amount: num(m[3]), ...(stats.length > 1 ? { alsoStats: stats.slice(1) } : {}) } } };
  }
  // 回合开始经济（goldenhoard 5 黄金 / soulgatherer 4 灵魂）：惰性字段（回合钩子无经济口），
  // 数值经描述对账；「金币」=gold、「灵魂」=souls。
  if ((m = /^在?我的回合开始(?:的时候|时)?[，,]?获得\s*(\d+)\s*个?(金币|灵魂)。?$/.exec(desc))) {
    return { effects: { turnStartEconomy: { currency: m[2] === '金币' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 配对骷髅全屏伤害（spiny/spiky「Deal N damage to all enemies when I match skulls」）：
  // 与 onColorMatchDamage 同一触发点（骷髅匹配、骷髅伤害结算后），scope allEnemies 逐个结算。
  if ((m = /^在自身配对骷髅头(?:宝石)?时[，,]?对所有敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onColorMatchDamage: { color: 'skull', amount: num(m[1]), scope: 'allEnemies' } } };
  }
  // 大连伤害·末位敌人（attackfrombelow「Deal 8 damage to the last Enemy when matching 4 or
  // more Gems」）：scope lastEnemy=队伍序末位存活（确定性、零随机消耗）。
  if ((m = /^在?(?:配对|匹配)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?对最后一个敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onBigMatchDamage: { amount: num(m[1]), scope: 'lastEnemy' } } };
  }
  // 承伤经济（pickpocket「Gain 10 Gold when I take damage」）：惰性字段（受击结算无经济口）。
  if ((m = /^在自身受到伤害时获得\s*(\d+)\s*(黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onDamagedEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 施法经济（soulverdict「Gain 3 Souls when an Ally casts a spell」）：惰性字段（施法响应区无经济口）。
  if ((m = /^(?:当|在)一名盟友施(?:放|法)法?术?时[，,]?获得\s*(\d+)\s*个?(黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onAllyCastEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 免疫：对 X、Y 免疫（T1 批：warded/cunning/brave/immune——「对疾病和狼化免疫」的
  // 狼化引擎未实现，按映射表只收疾病，不做缺状态半解析）
  if (/免疫/.test(desc)) {
    if (/所有状态效果/.test(desc)) return { effects: { statusImmunities: ['*'] } };
    const ids = RESCUE_FULL_STATUS_MAP.filter(([re]) => re.test(desc)).map(([, id]) => id);
    if (ids.length > 0) return { effects: { statusImmunities: [...new Set(ids)] } };
    return null; // 全是引擎没有的状态
  }
  // 开局法力：战斗开始时获得 N% 法力 / 全满法力
  if (/战斗开始时/.test(desc) && /法力/.test(desc) && !/所有|全部/.test(desc)) {
    if (/全满/.test(desc)) return { effects: { battleStartManaRatio: 1 } };
    if ((m = /(\d+)%\s*法力/.exec(desc))) return { effects: { battleStartManaRatio: num(m[1]) / 100 } };
    return null;
  }
  // 每回合开始时恢复 N 点 X（仅自身，不含队伍范围）
  if ((m = /在?每回合开始时恢复\s*(\d+)\s*点(生命值|护甲值)/.exec(desc))) {
    return { effects: { regen: { stat: m[2] === '护甲值' ? 'armor' : 'hp', amount: num(m[1]) } } };
  }
  if ((m = /^在每回合开始时获得\s*(\d+)\s*点(攻击力|护甲值|生命值|魔法值)/.exec(desc))) {
    return { effects: { regen: { stat: pickStat(m[2]) ?? 'hp', amount: num(m[1]) } } };
  }
  // 受击触发：在自身受到伤害时获得 N 点 X / 在受到攻击时获得 N 点 X（法力值→mana，
  // zornsfury「在自身受到伤害时获得 4 点法力值」；共享数值多属性 darkfury
  // 「获得 8 点攻击力和魔法值」→ alsoStats）
  if ((m = /(?:在自身受到伤害时|在受到攻击时)获得\s*(\d+)\s*点((?:随机技能值|生命值|护甲值|攻击力|魔法值|法力值)(?:[、和](?:\s*\d+\s*点)?(?:随机技能值|生命值|护甲值|攻击力|魔法值|法力值))*)/.exec(desc))) {
    const gains = (() => {
      const g = parseGainsList(m[2], num(m[1]));
      if (g) return g;
      const stat = pickTriggerStat(m[2]);
      return stat ? { [stat]: num(m[1]) } : null;
    })();
    if (!gains) return null;
    const stats = Object.keys(gains);
    return {
      effects: {
        onDamagedGain: {
          stat: stats[0],
          amount: num(m[1]),
          ...(stats.length > 1 ? { alsoStats: stats.slice(1) } : {}),
        },
      },
    };
  }
  // 受击获得正面状态（收编批）：reflectivesurface「当我受到伤害时获得反射」/
  // raging「受到伤害时激怒自身」。与 aquatic「使自身下潜」同一字段 onDamagedStatus，
  // 施加回合数同口径取 3；施加经 applyStatus（免疫在施加口拦截）。
  if ((m = /^(?:当|在)?我?(?:自身)?受到伤害时[，,]?(?:使自身(下潜|反射|狂怒|屏障|赐福)|获得(下潜|反射|狂怒|屏障|赐福)|激怒自身)。?$/.exec(desc))) {
    const word = m[1] ?? m[2] ?? '狂怒';
    const id = { 下潜: 'submerged', 反射: 'reflect', 狂怒: 'rage', 屏障: 'barrier', 赐福: 'blessed' }[word];
    return { effects: { onDamagedStatus: { statusId: id, turns: 3 } } };
  }
  // 受击下潜（aquatic「在自身受到伤害时使自身下潜」，O 桶判读批）：与 onDamagedGain
  // 同一触发点（骷髅受击结算处），落新字段 onDamagedStatus。下潜本体已落地
  // （status.ts UNTARGETABLE_STATUS_IDS）；回合数与特质批大连施加的下潜（tsunami 族
  // onBigMatchStatus turns:3）同口径取 3。
  if (/^在自身受到伤害时使自身下潜。?$/.test(desc)) {
    return { effects: { onDamagedStatus: { statusId: 'submerged', turns: 3 } } };
  }
  // —— 接线批：骷髅受击/命中钩子族（官方 EN + RawData 逐条核对）——
  // 必须先于下方「在造成骷髅头伤害时」命中附状态块：brokenjaw/siphon/electrifiedplating
  // 的句式以其为前缀，后置会被旧规则吞掉半句或整体 return null。
  // 命中附加护甲比（spikearmor「增加 25% 护甲值到骷髅头伤害」/ electrifiedplating「伤害值
  // 添加 50% 的护甲值」）→ skullDamageFromArmorRatio（职业天赋 razorarmor 同字段，已接线）
  if ((m = /^增加\s*(\d+)\s*%\s*护甲值到骷髅头伤害。?$/.exec(desc))
    || (m = /^在造成骷髅头伤害时[，,]?伤害值添加\s*(\d+)\s*%\s*的?护甲值。?$/.exec(desc))) {
    return { effects: { skullDamageFromArmorRatio: num(m[1]) / 100 } };
  }
  // 命中窃法（siphon 吸星大法「窃取敌人法力值」）：官方 RawData Modifier=1（描述无数量词）
  if (/^在造成骷髅头伤害时[，,]?窃取敌人法力值。?$/.test(desc)) {
    return { effects: { onSkullHitStealMana: 1 } };
  }
  // 命中多条状态（brokenjaw 断颚「陷入出血和沉默状态」）→ inflictOnSkullHitList：
  // 按「和」拆段逐个映射，全部命中才收（与 inflictOnSkullDamagedList 同口径）；DoT 带 magnitude:1
  if ((m = /^在造成骷髅头伤害的时候使第一位敌人陷入(.+?)状态。?$/.exec(desc))) {
    const ids = m[1].split('和').map((s) => s.trim()).filter(Boolean)
      .map((part) => RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(part))?.[1]);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
    return {
      effects: {
        inflictOnSkullHitList: ids.map((id) => (isDotStatus(id)
          ? { id, turns: 3, magnitude: 1 }
          : { id, turns: 3 })),
      },
    };
  }
  // 受击敌方全体受伤（manyheads 九头攻击「当敌人造成骷髅头伤害时，全体敌人受到 3 点伤害」）
  if ((m = /^当敌人造成骷髅头伤害时[，,]?全体敌人受到\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onSkullDamagedEnemyDamage: { amount: num(m[1]) } } };
  }
  // 受击创造宝石（onyxshard「创造 2 颗极度末日骷髅头」/ *shard 巨人宝石族 / 法力药水族，
  // 官方 Activation=received_skull_damage）→ onDamagedCreateGem
  if ((m = /^在受到骷髅头伤害时创造\s*(一|\d+)\s*[颗瓶]\s*(.+?)。?$/.exec(desc))) {
    const gem = pickSpecialGemColored(m[2]);
    if (!gem) return null; // 受击创造句式锁定：宝石名不识别整体不收（不做半解析）
    return {
      effects: {
        onDamagedCreateGem: {
          gem: gem.kind,
          count: countOf(m[1]),
          ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
          ...(gem.color ? { color: gem.color } : {}),
        },
      },
    };
  }
  // 受击使敌方首位陷入状态（deathray 死光「在自身生命值受损时，使敌方第一名敌人陷入死亡
  // 标记效果」，官方 Activation=life_damage_received Filter=first）→ onDamagedEnemyStatus。
  // 「效果/状态」两种机翻尾缀都收。
  if ((m = /^在自身生命值受损时[，,]?使敌方第一名敌人陷入(.+?)(?:状态|效果)。?$/.exec(desc))) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(m[1]));
    if (!hit) return null;
    return { effects: { onDamagedEnemyStatus: { id: hit[1], turns: 3 } } };
  }
  // 命中附带：在造成骷髅头伤害时 …状态
  if (/在造成骷髅头伤害时/.test(desc)) {
    if ((m = /获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(desc))) {
      return { effects: { onSkullHitGain: { stat: pickStat(m[2]) ?? 'hp', amount: num(m[1]) } } };
    }
    // 忽略护甲（savagestrike「…有 100% 的几率忽略护甲值」）：与 armorpiercing/trueshot 的
    // 「略过护甲值」同一引擎机制，按语义映射到 armorPierceChance（T3 批逐条核对）。
    if ((m = /有\s*(\d+)%\s*的?几率忽略护甲值/.exec(desc))) {
      return { effects: { armorPierceChance: num(m[1]) / 100 } };
    }
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(desc));
    if (hit) {
      // magnitude 语义按状态而异：DoT 是每回合伤害；web 是挣脱几率（缺省 10%，由引擎管理）。
      // 因此只给 DoT 带 magnitude，其余状态不带。
      const isDot = isDotStatus(hit[1]);
      return {
        effects: {
          inflictOnSkullHit: isDot
            ? { id: hit[1], turns: 3, magnitude: 1 }
            : { id: hit[1], turns: 3 },
        },
      };
    }
    return null;
  }
  // 承受骷髅伤害附状态（毒孢子族）：被打时反手给攻击者上状态。
  // 句式有「使敌人中毒」「使敌人陷入X状态」两种；DoT 带 magnitude:1，其余不带
  if (/^在承受骷髅头伤害时[，,]?使敌人/.test(desc)) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(desc));
    if (!hit) return null;
    const isDot = isDotStatus(hit[1]);
    return {
      effects: {
        inflictOnSkullDamaged: isDot
          ? { id: hit[1], turns: 3, magnitude: 1 }
          : { id: hit[1], turns: 3 },
      },
    };
  }
  // 骷髅受击附状态·变体句式（T3 批逐条核对官方描述）：毒孢子句式之外的三种译法——
  //   revenge/magmahide「在自身受到骷髅头伤害时，使对方陷入X状态」
  //   serenity/scalding「在敌方/敌人对自身造成骷髅头伤害时，使对方陷入X状态」
  //   frozensoul「当承受骷髅头伤害时冻结敌人」（动词句，无「陷入…状态」）
  // 与毒孢子同一字段（inflictOnSkullDamaged）。
  // 双状态诅咒族（T2 批：frozencurse 等「使其陷入诅咒和X状态」）要一次施加两条状态，
  // 落到新字段 inflictOnSkullDamagedList：按「和」拆段逐个映射，**全部命中才收**（不做
  // 半解析）；条目顺序与描述一致，DoT 段带 magnitude:1，与单状态口径相同。
  if (/^(?:在自身受到|在敌[方人]对自身造成|当承受)骷髅头伤害时/.test(desc)) {
    const captured = /使(?:对方|其)陷入(.+?)状态/.exec(desc) ?? /当承受骷髅头伤害时(.+?)敌人/.exec(desc);
    const text = captured?.[1];
    if (!text) return null;
    if (/和/.test(text)) {
      const ids = text
        .split('和')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((part) => RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(part))?.[1] ?? DUAL_STATUS_ALIAS[part]);
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
      return {
        effects: {
          inflictOnSkullDamagedList: ids.map((id) => (isDotStatus(id)
            ? { id, turns: 3, magnitude: 1 }
            : { id, turns: 3 })),
        },
      };
    }
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(text));
    if (!hit) return null;
    const isDot = isDotStatus(hit[1]);
    return {
      effects: {
        inflictOnSkullDamaged: isDot
          ? { id: hit[1], turns: 3, magnitude: 1 }
          : { id: hit[1], turns: 3 },
      },
    };
  }
  // 骷髅匹配附状态（feartouch「在配对骷髅头使使敌人陷入恐怖状态」——dump 的「使使」
  // 为机翻叠字，按「配对骷髅头时使敌人陷入X状态」理解；匹配骷髅即造成骷髅伤害，
  // 与 T3 骷髅命中族同一字段 inflictOnSkullHit 同一口径）。DoT 带 magnitude:1，其余不带；
  // 状态词查不到整体不收，不做半解析。
  if ((m = /^(?:在)?配对骷髅头(?:宝石)?时?[，,]?使+敌人陷入(.+?)状态。?$/.exec(desc))) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(m[1]));
    if (!hit) return null;
    const isDot = isDotStatus(hit[1]);
    return {
      effects: {
        inflictOnSkullHit: isDot
          ? { id: hit[1], turns: 3, magnitude: 1 }
          : { id: hit[1], turns: 3 },
      },
    };
  }
  // 队伍光环·全体：所有盟友获得 N 点 X / 所有敌人损失 N 点 X。
  // 整条锚定（^…$）：历史上未锚定行首，「在配对骷髅头时，所有盟友获得 2 点攻击力…」
  // 这类触发句被中途命中误收成战斗开始光环（virtue 家族 / darkness 的触发点错误即此因）。
  if ((m = /^所有(盟友|敌人)(获得|损失)\s*(\d+)\s*点?(随机技能值|生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = m[4] === '随机技能值' ? 'magic' : pickStat(m[4]);
    if (!stat) return null;
    return {
      effects: {
        teamAura: {
          scope: m[1] === '盟友' ? 'allies' : 'enemies',
          stat,
          amount: m[2] === '损失' ? -num(m[3]) : num(m[3]),
        },
      },
    };
  }
  // —— 回合开始创造特殊宝石（T4 创造批）——必须先于下面的纯色规则：
  // 纯色规则对「命中句式但颜色不识别」会提前 return null，会吞掉特殊宝石句。
  // A. 创造型（spidersilk 25%织网 / haunted 鬼魂 / eyeofdestruction 末日骷髅…）：
  //    概率、数量皆可选（无数量句 = 1 颗）。宝石名不在 SPECIAL_GEM_MAP 的
  //    （风暴/元素星/狼化/石像鬼…）不拦截，落回后续规则留在未实现桶。
  if ((m = new RegExp(`^${TURN_START_HEAD}[，,]?\\s*(?:有\\s*(\\d+)\\s*%\\s*的?(?:几[率会]|机会)\\s*)?(?:创[建造成]|生成)出?\\s*(?:(一|\\d+)\\s*[颗个])?\\s*(.+?)。?$`).exec(desc))) {
    const gem = pickSpecialGemColored(m[3]);
    if (gem) {
      return {
        effects: {
          turnStartCreateSpecialGem: {
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            ...(gem.color ? { color: gem.color } : {}),
            count: countOf(m[2]),
            ...(m[1] !== undefined ? { chance: num(m[1]) / 100 } : {}),
          },
        },
      };
    }
  }
  // B. 转化型（redrage 红2→燃烧 / embers / daemonsmark 骷髅2→末日骷髅 / temporal 黄→沙漏…）：
  //    来源只认六色或骷髅头（末日族不算普通骷髅），目标必须是 SPECIAL_GEM_MAP 内的特殊宝石；
  //    未命中（bonepile 的「转换成骷髅头」/ 狼化宝石等）不拦截，落回后续规则。
  //    「宝石」整体可选（(?:宝石)?）：写成 宝石? 会让「宝」变必选，骷髅头等无「宝石」尾缀的
  //    来源全部漏配（kinofchaos/daemonsmark 骷髅转化即因此落空）。
  if ((m = new RegExp(`^${TURN_START_HEAD}[，,]?\\s*(?:有\\s*(\\d+)\\s*%\\s*的?几[率会]\\s*)?将\\s*(?:(一|\\d+)\\s*[颗个名])?\\s*(.+?)(?:宝石)?转[换化][为成]\\s*(.+?)(?:宝石)?。?$`).exec(desc))) {
    const gem = pickSpecialGemColored(m[4]);
    const src = m[3] === '骷髅头' ? 'skull' : pickColor(m[3]);
    if (gem && src) {
      return {
        effects: {
          turnStartColorToSpecial: {
            color: src,
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            ...(gem.color ? { gemColor: gem.color } : {}),
            count: countOf(m[2]),
            ...(m[1] !== undefined ? { chance: num(m[1]) / 100 } : {}),
          },
        },
      };
    }
  }
  // 回合开始造某色宝石：「在我的回合开始的时候，创建一颗红色宝石。」
  // T4 扩展：前缀放宽到 当/我/轮次开始、数量可选（intothevoid「创造 2 颗紫色宝石」、
  // lightningaura「创造 2 颗黄色闪电宝石」按官方文本收 count）。
  if ((m = /^(?:当|在)?(?:我的|我)?回合开始(?:的时候|时)?[，,]?创[建造]\s*(一[颗个]|\d+\s*[颗个])?(.+?)宝石。?$/.exec(desc))) {
    const color = pickColor(m[2]);
    if (!color) return null; // 特殊宝石类型不在映射表，整体不收
    return { effects: { turnStartCreateGem: { color, ...(m[1] ? { count: countOf(m[1]) } : {}) } } };
  }
  // 回合开始创造普通骷髅头（接线批 bonefeast「创造 2 颗骷髅头」）：color 'skull' 走
  // turnStartCreateGem（TurnEngine 落 { kind:'skull' }）；数量必带。
  if ((m = /^(?:当|在)?(?:我的|我)?(?:每一个|每一)?(?:回合|轮次)开始(?:的时候|时)?[，,]?创[建造]\s*(一|\d+)\s*[颗个]骷髅头。?$/.exec(desc))) {
    return { effects: { turnStartCreateGem: { color: 'skull', count: countOf(m[1]) } } };
  }
  // 回合开始按概率把某色转成骷髅头（引擎已有骷髅；转成其它特殊宝石的不收）
  if ((m = /^(?:在)?我的回合开始(?:的时候|时)[，,]?有\s*(\d+)%\s*的?几率将一颗(.+?)宝石转换成骷髅头。?$/.exec(desc))) {
    const color = pickColor(m[2]);
    if (!color) return null;
    return { effects: { turnStartColorToSkull: { color, chance: num(m[1]) / 100 } } };
  }
  // 骷髅伤害无视护甲：骷髅头伤害有 N% 的几率略过护甲值
  if ((m = /^骷髅头伤害有\s*(\d+)%\s*的?几率略过护甲值/.exec(desc))) {
    return { effects: { armorPierceChance: num(m[1]) / 100 } };
  }
  // 屠戮类：对<族/色/状态>造成 N 倍骷髅头伤害。「造成 3 倍」（空格）与「5x」（nastyteeth）
  // 两种机翻排版都收；双条件（lethaltoxin「陷入中毒和织网状态」）拆开各落一条同倍率
  // （任一命中即 ×3，编译进 skullMultVsStatus 同一张表）。
  if ((m = /^对(.+?)(?:军队)?造成\s*(双|三|\d+)\s*(?:倍|x)\s*骷髅头伤害/.exec(desc))) {
    const mult = m[2] === '双' ? 2 : m[2] === '三' ? 3 : num(m[2]);
    const target = m[1].replace(/军队$/, '');
    // 先看是不是颜色（红色军队…），再看种族，最后看状态/状况
    const color = pickColor(target);
    if (color) return { effects: { skullMultVsColor: { color, mult } } };
    const troopType = TROOP_TYPE_MAP[target] ?? TROOP_TYPE_MAP[`${target}族`];
    if (troopType) return { effects: { skullMultVsTroopType: { troopType, mult } } };
    // 双状态条件（「陷入X和Y状态的敌人」）：两段各自映射，全部命中才收
    const dual = /陷入(.+?)状态/.exec(target);
    if (dual && /和/.test(dual[1])) {
      const conds = dual[1].split('和').map((s) => parseDamageCondition(s.trim()));
      if (conds.length >= 2 && conds.every((c) => c?.status)) {
        return { effects: { skullMultVsStatusList: conds.map((c) => ({ status: c.status, mult })) } };
      }
    }
    const cond = parseDamageCondition(target);
    if (cond) return { effects: cond.status ? { skullMultVsStatus: { status: cond.status, mult } } : { skullMultVsWounded: mult } };
    return null;
  }
  // —— 模式专属特质批（淘宝模式 / 晋升度 / 赏金语义，8 code）——
  // 官方 RawData 佐证：deep* 族 GameMode=delve_attacker（淘宝=Delve 进层时按 stat 调整，
  // Modifier=9/5/9/7）、bountyhunter Activation=end_battle_rewards（bonus_bounty，2-6 倍
  // 随晋升稀有度）、pathfinder Activation=end_battle_rewards（旅程英里 2x/2.5x/3x）、
  // godslayer/siegebreaker Activation=on_skull_damage + Filter=boss/castle（晋升度倍率
  // 3-5 倍）。这些机制都在 Delve/晋升/结算层生效，**标准三消战斗内惰性**——本作未建模
  // Delve/晋升层，落为正确建模的声明字段（编译进 passive 但结算路径不消费），数据完整、
  // 审计对账通过、描述正确。全部整条锚定，「全部命中才收」。

  // A. 淘宝模式获得（deepvitality/deepmagic/deepshield/deepstrength）：
  //    「在淘宝模式中获得 N 点生命值/魔法值/护甲值/攻击力。」→ onDelveGain
  //    属性词只认 STAT_MAP 四项（官方 deep 族也只用这四项），解析不了整体不收。
  if ((m = /^在淘宝模式中获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onDelveGain: { stat, amount: num(m[1]) } } };
  }
  // B. 赏金猎人（bountyhunter）：「基于我已晋升的稀有度获得 2 到 6 倍的赏金点数。」
  //    → onDelveBounty（战后赏金倍率区间，下限/上限按晋升稀有度取位；官方 Modifier=2 为下限）
  if ((m = /^基于我已晋升的稀有度获得\s*(\d+)\s*到\s*(\d+)\s*倍的赏金点数。?$/.exec(desc))) {
    const min = num(m[1]);
    const max = num(m[2]);
    if (!(min > 0 && max > min)) return null;
    return { effects: { onDelveBounty: { min, max } } };
  }
  // C. 探路者（pathfinder）：「在自身旅程活动中获得 2x/2.5x/3x 英里，数量因自身晋升稀有度
  //    而定。」→ onDelveMiles（英里倍率表，位序=晋升稀有度序）
  if ((m = /^在自身旅程活动中获得\s*([\d.x/]+?)\s*英里，数量因自身晋升稀有度而定。?$/.exec(desc))) {
    const multipliers = m[1].split('/').map((s) => Number(s.replace(/x$/i, '')));
    if (multipliers.length < 2 || multipliers.some((x) => !Number.isFinite(x) || x <= 0)) return null;
    return { effects: { onDelveMiles: { multipliers } } };
  }
  // D. 屠魔/攻城（godslayer/siegebreaker）：「基于我已晋升的稀有度对魔头/高塔造成 3 到 5 倍
  //    伤害。」→ vsAscendedMultiplier（target boss=魔头 / tower=高塔）。**必须先于下方通用
  //    「基于晋升对<族>」规则**：魔头/高塔不是兵种种族（官方 Filter=boss/castle，是模式构造），
  //    落 skullMultVsTroopType 会让标准战斗骷髅结算错误放大。
  if ((m = /^基于我已晋升的稀有度对(魔头|高塔)造成\s*(\d+)\s*到\s*(\d+)\s*倍伤害。?$/.exec(desc))) {
    const min = num(m[2]);
    const max = num(m[3]);
    if (!(min > 1 && max > min)) return null;
    return { effects: { vsAscendedMultiplier: { target: m[1] === '魔头' ? 'boss' : 'tower', min, max } } };
  }
  // 「基于我已晋升的稀有度对<族>造成 3 到 5 倍伤害」：晋升度本作未建模，取区间下限
  if ((m = /^基于我已晋升的稀有度对(.+?)造成\s*(\d+)\s*到\s*(\d+)\s*倍伤害/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    if (!troopType) return null;
    return { effects: { skullMultVsTroopType: { troopType, mult: num(m[2]) } } };
  }
  // 施法响应：当一名盟友/敌人施放法术时获得 N 点 X（整条锚定，排除带种族范围的变体）。
  // 共享数值多属性（draconicrage「获得 2 点攻击力、生命值和护甲值」）首属性进 stat、
  // 其余进 alsoStats（与 onDamagedGain 同口径）。
  if ((m = /^(?:当|在)一?名?(盟友|敌人)施(?:放|法)法?术?时[，,]?获得\s*(\d+)\s*点((?:随机技能值|生命值|护甲值|攻击力|魔法值)(?:[、和](?:\s*(\d+)\s*点)?(?:随机技能值|生命值|护甲值|攻击力|魔法值))*)。?$/.exec(desc))) {
    const gains = parseGainsList(m[3], num(m[2]));
    if (!gains) return null;
    const key = m[1] === '盟友' ? 'onAllyCastGain' : 'onEnemyCastGain';
    const stats = Object.keys(gains);
    return { effects: { [key]: { stat: stats[0], amount: num(m[2]), ...(stats.length > 1 ? { alsoStats: stats.slice(1) } : {}) } } };
  }
  // 敌人身亡时自身获得状态（bloodlust「在敌人身亡时获得狂怒效果」）：rage 本体已落地
  // （RAGE_STATUS_IDS），施加回合数与大连施加的狂怒（provocation）同口径取 3。
  // 只收引擎已落地的四个正面状态，其余词不命中即整体不收。
  if ((m = /^(?:当|在)(?:一名)?敌人身亡时[，,]?获得(狂怒|屏障|反射|赐福)效果。?$/.exec(desc))) {
    const id = { 狂怒: 'rage', 屏障: 'barrier', 反射: 'reflect', 赐福: 'blessed' }[m[1]];
    return { effects: { onEnemyDeathStatus: { id, turns: 3 } } };
  }
  // 种族限定的敌人身亡光环（lordofdeath「所有不死族在一名敌人身亡时获得 5 点生命值和
  // 魔法值」）：受益者为持有者一方该种族的存活盟友（含持有者）。种族查表失败按未实现
  // 归类，不硬猜。
  if ((m = /^所有(.+?)在一名敌人身亡时[，,]?获得\s*(\d+)\s*点(.+?)。?$/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    const gains = parseGainsList(m[3], num(m[2]));
    if (!troopType || !gains) return null;
    return { effects: { onEnemyDeathTypeAura: { troopType, gains } } };
  }
  // 敌人身亡时使另一名敌人陷入状态（sharedfate「在一名敌人身亡时，使另一名敌人陷入死亡
  // 标记状态」）：目标取死者一方队伍序首个存活（引擎侧确定性结算）；状态本体查不到不收。
  if ((m = /^在一名敌人身亡时[，,]?使另一名敌人陷入(.+?)状态。?$/.exec(desc))) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(m[1]));
    if (!hit) return null;
    return { effects: { onEnemyDeathEnemyStatus: { id: hit[1], turns: 3 } } };
  }
  // 身亡经济（valuable「在自身身亡时获得 25 黄金」，O 桶判读批）：死者本人持有的
  // 战场经济入账，复用条件经济批的 creditEconomy 口径（economy[currency] += amount
  // 并发 economy-gain 事件）；持有者币种超出黄金/灵魂句式的（宝石）不硬猜，不收。
  if ((m = /^在自身身亡时获得\s*(\d+)\s*(黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onDeathEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 身亡创造特殊宝石（T4 批 unstablecore「在我身亡时创造 3 颗炸弹宝石」）：身亡/死亡/
  // 死后三种译法都收；宝石名不在映射表的（carcass 腐烂的宝石）不拦截，留在未实现桶。
  if ((m = /^[在当]?我(?:身亡时|死亡时|死[后亡])时?[，,]?创[建造成]出?\s*(一|\d+)\s*[颗个]\s*(.+?)(?:宝石)?。?$/.exec(desc))) {
    const gem = pickSpecialGem(m[2]);
    if (gem) {
      return {
        effects: {
          onDeathCreateGem: {
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            count: countOf(m[1]),
          },
        },
      };
    }
  }
  // —— 接线批：死亡钩子补族 ——
  // 盟友身亡魅惑随机敌人（temptation 蛊惑「Charm a random enemy when an ally dies」）
  // → onAllyDeathStatus（职业天赋 savior 同字段，随机目标经注入 rng）
  if (/^在一名盟友身亡时[，,]?魅惑一名随机敌人。?$/.test(desc)) {
    return { effects: { onAllyDeathStatus: { target: 'randomEnemy', statuses: [{ id: 'charm' }], turns: 3 } } };
  }
  // 自身亡使敌方全体陷入状态（icyrebirth 寒冰重生「Freeze all Enemies when I die」）
  // → onSelfDeathEnemyAllStatus（职业天赋 deathcurse 同字段，确定性逐个施加）
  if (/^在自身身亡时冻结所有敌军。?$/.test(desc)) {
    return { effects: { onSelfDeathEnemyAllStatus: { statuses: [{ id: 'frozen' }], turns: 3 } } };
  }
  // 自身亡使敌方全体沉默（deafeningwail 震耳欲聋的哀嚎「Silence all Enemies when I die」；
  // 「噤声」为 silence 的机翻动词）→ 同上
  if (/^我死后[，,]?让所有敌人噤声。?$/.test(desc)) {
    return { effects: { onSelfDeathEnemyAllStatus: { statuses: [{ id: 'silence' }], turns: 3 } } };
  }
  // sacrifice「当一名敌人身亡时，所有技能增加 3 点」：官方「Gain 3 to all Skills」= 四项属性
  // 各 3（与 hunger/manifestation 的全部技能展开同口径），首属性进 stat、其余进 alsoStats
  //（引擎 TRIGGER_FIELDS 展开）。历史上只落 magic 一项，漏了另外三项。
  if ((m = /^(?:当|在)(?:一名)?敌人身亡时[，,]?所有技能增加\s*(\d+)\s*点。?$/.exec(desc))) {
    return {
      effects: { onEnemyDeathGain: { stat: 'hp', amount: num(m[1]), alsoStats: ['armor', 'attack', 'magic'] } },
    };
  }
  // virtueofjustice「当敌人身亡时，所有盟友获得 3 点攻击力和护甲值」（官方
  // 「All allies gain 3 Attack and Armor when an enemy dies」）：敌亡触发的全队光环，
  // 复用 onEnemyDeathTypeAura（troopType 'all' = 全队）。
  if ((m = /^(?:当|在)(?:一名)?敌人身亡时[，,]?所有盟友获得\s*(\d+)\s*点(.+?)。?$/.exec(desc))) {
    const gains = parseGainsList(m[2], num(m[1]));
    if (gains) return { effects: { onEnemyDeathTypeAura: { troopType: 'all', gains } } };
  }
  // virtueofsacrifice「当一名盟友身亡时，所有盟友获得 2 点攻击力和魔法值」：
  // 盟友亡触发的全队光环（onAllyDeathTypeAura，与 onEnemyDeathTypeAura 同构、方向相反）。
  if ((m = /^(?:当|在)一名盟友身亡时[，,]?所有盟友获得\s*(\d+)\s*点(.+?)。?$/.exec(desc))) {
    const gains = parseGainsList(m[2], num(m[1]));
    if (gains) return { effects: { onAllyDeathTypeAura: { troopType: 'all', gains } } };
  }
  // virtueofloyalty「当一名盟友施放法术时，所有盟友获得 3 点护甲值和生命值」：
  // 施法触发的全队光环（onAllyCastTypeAura）。
  if ((m = /^(?:当|在)一名盟友施放法术时[，,]?所有盟友获得\s*(\d+)\s*点(.+?)。?$/.exec(desc))) {
    const gains = parseGainsList(m[2], num(m[1]));
    if (gains) return { effects: { onAllyCastTypeAura: { troopType: 'all', gains } } };
  }
  // virtueofhumility「当自身生命值承受伤害时，所有盟友获得 2 点护甲值和魔法值」：
  // 承伤触发的全队光环（onDamagedTypeAura，与 gainOnDamaged 同一触发点）。
  if ((m = /^(?:当|在)?自身生命值承受伤害时[，,]?所有盟友获得\s*(\d+)\s*点(.+?)。?$/.exec(desc))) {
    const gains = parseGainsList(m[2], num(m[1]));
    if (gains) return { effects: { onDamagedTypeAura: { troopType: 'all', gains } } };
  }
  // 阵亡响应：当敌人/一名盟友身亡时获得 N 点 X
  if ((m = /^(?:当|在)(?:一名)?(敌人|盟友)身亡时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值|法力值)。?$/.exec(desc))) {
    const stat = m[3] === '法力值' ? 'mana' : pickStat(m[3]);
    if (!stat) return null;
    const key = m[1] === '敌人' ? 'onEnemyDeathGain' : 'onAllyDeathGain';
    return { effects: { [key]: { stat, amount: num(m[2]) } } };
  }
  // 4/5 连：在配对 4 或 5 颗宝石时，获得 N 点 X（只收「自身获得」这一类）
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onBigMatchGain: { stat, amount: num(m[1]) } } };
  }
  // 4+ 连给全队：「在配对 4 或更多宝石的时候，给予所有盟友 N 颗/点 X」。
  // 引擎的 4/5 连触发本就作用于匹配方全队，因此与上一条同一实现。
  if ((m = /^在?配对\s*4\s*(?:或)?更?多?颗?宝石的?时?候?[，,]?给[予]?所有盟友\s*(\d+)\s*[颗点](生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onBigMatchGain: { stat, amount: num(m[1]) } } };
  }
  // 条件经济光环·大连版（条件经济批）：「在配对 4 或 5 颗宝石时，获得额外 N 黄金/灵魂」
  // → onBigMatchEconomy。黄金=gold、灵魂=souls；minSize 缺省 4（官方「4 或 5 颗」口径
  // = 任意大连，与 onBigMatchStatus 的 minSize 缺省同款）。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?获得额外\s*(\d+)\s*(黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onBigMatchEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 条件经济光环·骷髅版：「在配对骷髅头时，获得 N 个灵魂/黄金」（darkensouls）
  // → onSkullMatchEconomy，骷髅匹配触发点结算（与 diamondaura/rancor 的 'skull' 键同一结算口径）。
  if ((m = /^在配对骷髅头(?:宝石)?时[，,]?获得\s*(\d+)\s*[个点](黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onSkullMatchEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 4/5 连给予盟友（firstwargare/overclock/celestialsage…）：种族限定或全队，
  // 支持「N 点 X 和 Y」双属性共享数值（两个属性各得 N）。种族查表失败按未实现归类，不硬猜。
  if ((m = /^[当在]?配对\s*4\s*颗?\s*或\s*(?:更?多|5)\s*颗?宝石的?时?候?[，,]?\s*给予(.+?)盟友\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)(?:和(?:\s*(\d+)\s*点)?(生命值|护甲值|攻击力|魔法值))?[，,]?。?$/.exec(desc))) {
    const scopeName = m[1];
    // 「所有」= 全队；「所有机械」= 先剥掉「所有」再查种族映射
    const lookupName = scopeName === '所有' ? null : scopeName.replace(/^所有/, '');
    const troopType = lookupName === null
      ? 'all'
      : (TROOP_TYPE_MAP[lookupName] ?? TROOP_TYPE_MAP[`${lookupName}族`] ?? TROOP_TYPE_MAP[lookupName.replace(/族$/, '')]);
    const stat1 = pickStat(m[3]);
    if (!troopType || !stat1) return null;
    const gains = { [stat1]: num(m[2]) };
    if (m[5]) {
      const stat2 = pickStat(m[5]);
      if (!stat2) return null;
      gains[stat2] = num(m[4] ?? m[2]);
    }
    return { effects: { onBigMatchTypeAura: { troopType, gains } } };
  }
  // —— 条件光环批（窗口 E）新句式，接在上面的 4/5 连规则之后 ——

  // 4+ 连自身增益·长尾：「在配对 4 颗或更多宝石时，获得 4 点攻击力」（huntress，句尾无句号）
  // 「在配对 4 或更多宝石时， 获得 3 点法力值」（crystallizedmana，法力值→mana）。
  // 「在配对 4 或 5 颗宝石时」（两个数字不同 = 任意 4/5 连）。
  if ((m = /^在?配对\s*(\d+)\s*颗?\s*或\s*(?:(\d+)\s*颗?|更?多)\s*[颗个]?宝石的?时?候?[，,]?\s*获得\s*(\d+)\s*点?(随机技能值|生命值|护甲值|攻击力|魔法值|法力值)\s*。?$/.exec(desc))) {
    const stat = pickTriggerStat(m[4]);
    if (!stat) return null;
    const n1 = num(m[1]);
    const n2 = m[2] !== undefined ? num(m[2]) : null; // null =「或更多」
    if (n2 !== null && n1 === n2) {
      return { effects: { onBigMatchSizedGain: { minSize: n1, stat, amount: num(m[3]) } } };
    }
    return { effects: { onBigMatchGain: { stat, amount: num(m[3]) } } };
  }
  // 4/5 连自身增益·「随机一项技能」变体（insanegrowth 官方译法「随机一项技能获得 5 点」）：
  // 属性词在数词前，按 randomStat 口径落 magic；「4 或 5」= 任意大连（onBigMatchGain），
  // 两数相同才落 minSize 限定（onBigMatchSizedGain）。
  if ((m = /^在?配对\s*(\d+)\s*颗?\s*或\s*(?:(\d+)\s*颗?|更?多)\s*[颗个]?宝石的?时?候?[，,]?随机一项?技能获得\s*(\d+)\s*点。?$/.exec(desc))) {
    const n1 = num(m[1]);
    const n2 = m[2] !== undefined ? num(m[2]) : null;
    if (n2 !== null && n1 === n2) {
      return { effects: { onBigMatchSizedGain: { minSize: n1, stat: 'magic', amount: num(m[3]) } } };
    }
    return { effects: { onBigMatchGain: { stat: 'magic', amount: num(m[3]) } } };
  }
  // 4+ 连自身增益·共享数值多属性（vast「获得2点攻击力、生命值和盔甲」/ castledefense）：
  // 首属性进 stat、其余进 alsoStats（引擎 TRIGGER_FIELDS 同额展开）。消除/匹配/配对与
  // 颗/个/枚量词的机翻差异、省字「生命/护甲/盔甲」都收。
  if ((m = /^在?(?:配对|匹配|消除)\s*4\s*[颗个枚]?\s*或\s*(?:更?多|5|以上)\s*[颗个枚]?的?宝石的?时[，,]?\s*获得\s*(\d+)\s*点((?:生命值?|护甲值?|盔甲|攻击力|魔法值)(?:[、和]\s*(?:\d+\s*点)?(?:生命值?|护甲值?|盔甲|攻击力|魔法值))+)[，,]?。?$/.exec(desc))) {
    const gains = parseGainsList(m[2], num(m[1]));
    if (gains) {
      const stats = Object.keys(gains);
      return { effects: { onBigMatchGain: { stat: stats[0], amount: num(m[1]), alsoStats: stats.slice(1) } } };
    }
  }
  // 4+ 连团队增益·长尾（条件光环主体，16 code + 收编批 8 code）：两种动词都收——
  //   「所有哥布林盟友获得 5 点生命值」（获得）/「给所有牛头族盟友 1 点攻击力、护甲值和生命值」（给/给予）
  //   「所有野兽军队获得 …」（军队后缀）/「当配对4个或更多宝石时，所有罗格盟友获得2点魔法值」（个、无空格）
  //   「在配对 4 或更多宝石是，给予怪兽盟友 2 点随机技能值」（官方文本「是」为「时」之误）
  //   「为所有 猫族 盟友提供 2 点魔法值和生命值」（提供动词 + 机翻空格，strengthofthepride）
  //   「消除 4 个或更多宝石时…」（消除动词，dwarvenbrew/kingoftheherd）
  // 属性表支持共享数值多属性与「全部技能值」（giftof* 族 = 四项各 N）。
  if ((m = /^[当在]?(?:配对|匹配|消除)\s*4\s*[颗个枚]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?[时是]候?[，,]?\s*(.+)$/.exec(desc))) {
    const bm = /^(?:给予?|使)?\s*所有\s*(.*?)\s*(?:盟友|军队)?\s*(?:获得|提供)?\s*(\d+)\s*点(.+?)[，,]?。?$/.exec(m[1])
      ?? /^(?:给予?|为|提供)\s*所有\s*(.*?)\s*盟友\s*(?:提供|给予|赋予|恢复|获得)?\s*(\d+)\s*点(.+?)[，,]?。?$/.exec(m[1])
      // 「给予怪兽盟友 2 点随机技能值」（psychicpulse）：动词句、无「所有」前缀
      ?? /^(?:给予?)\s*(?:所有)?(.+?)(?:盟友|军队)?\s*(\d+)\s*点(.+?)[，,]?。?$/.exec(m[1]);
    if (bm) {
      const scopeName = bm[1].trim();
      // scope：种族名 / 'all'（全队）/ 颜色名（bountifulgrowth「为所有绿色盟友提供 4 点生命」，
      // 引擎侧 bigMatchTypeAura 结算经 scopeMatches 同样认颜色）
      const troopType = scopeName === ''
        ? 'all'
        : (TROOP_TYPE_MAP[scopeName] ?? TROOP_TYPE_MAP[`${scopeName}族`] ?? TROOP_TYPE_MAP[scopeName.replace(/族$/, '')] ?? pickColor(scopeName));
      const gains = parseGainsList(bm[3], num(bm[2]));
      if (troopType && gains) {
        return { effects: { onBigMatchTypeAura: { troopType, gains } } };
      }
    }
  }
  // 4+ 连团队增益·scope 前置变体（oceanswell「所有人鱼盟友在匹配 4 颗或更多宝石时获得
  // 2 点魔法值」）：受益范围写在触发头之前。
  if ((m = /^所有\s*(.*?)\s*盟友在?(?:配对|匹配|消除)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?(?:获得|提供|给予|赋予|恢复)?\s*(\d+)\s*点(.+?)[，,]?。?$/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`] ?? TROOP_TYPE_MAP[m[1].replace(/族$/, '')] ?? pickColor(m[1]);
    const gains = parseGainsList(m[3], num(m[2]));
    if (troopType && gains) {
      return { effects: { onBigMatchTypeAura: { troopType, gains } } };
    }
  }
  // 条件光环·净化：「净化所有盟友」= 移除全部负面状态（正面清单与 status.ts 诅咒剥正面一致）。
  //   4+ 连版（royalhoney）/ 配色版（adagio「在配对黄色宝石时净化所有盟友」）。
  if (/净化所有盟友/.test(desc)) {
    if (/^在?配对\s*4\s*[颗个]?\s*或\s*(?:更?多|5)\s*[颗个]?宝石的?时?候?[，,]?净化所有盟友。?$/.test(desc)) {
      return { effects: { onBigMatchCleanse: { minSize: 4 } } };
    }
    if ((m = /^在?配对(.+?)宝石时[，,]?净化所有盟友。?$/.exec(desc))) {
      const color = pickColor(m[1]);
      if (color) return { effects: { onColorMatchCleanse: { color } } };
    }
  }
  // 4/5 连技能伤害（T5 大连伤害批 3 code）：「对一名随机敌人造成 N 点伤害」→ randomEnemy
  // （随机目标走引擎种子化 rng，与大连施加状态的随机分支同口径）、「对所有敌人造成 N 点伤害」
  // → enemyAll。伤害走既有 skill-damage 管线（damageOne）。配色版的同句式
  // （lumpofcoal/dawnslayer/sleetstorm「在配对X色宝石时对…」）属另一触发点，不在此收。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?对一名随机敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onBigMatchDamage: { amount: num(m[1]), scope: 'randomEnemy' } } };
  }
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?对所有敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onBigMatchDamage: { amount: num(m[1]), scope: 'enemyAll' } } };
  }
  // 4+ 连伤害·机翻变体（huntersclaw「消除 4 个或更多宝石时，对随机敌人造成 6 点伤害」，
  // 官方「Deal 6 damage to a random Enemy when matching 4 or more Gems」）：消除/匹配动词
  // 与「随机敌人」省略「一名」的排版差异都收。
  if ((m = /^在?(?:配对|匹配|消除)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?对(?:一名)?随机敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onBigMatchDamage: { amount: num(m[1]), scope: 'randomEnemy' } } };
  }
  // 4+ 连敌减（T5 大连敌减批 5 code + darkness 修正 + 收编批 darksight/darkinfusion/
  // lossofsanity）：损失/耗掉/消除按纯削减收（本批裁定：只减敌方、不给持有者进账）。
  // 「敌人损失 N 点技能值」（suppression/aspectofplague，无序词=首位存活；技能值→magic
  // 同 STAT_MAP 约定）/「一名随机敌人损失 N 点魔法值」（technomancy）/「耗掉一名随机敌人
  // N 点法力值」（creepinggloom，动词前置）/「所有敌人损失 N 点攻击力」（darkness，官方
  // Filter=all，落 allEnemies 全体削减）/「消除所有敌人 3 点魔法值」（lossofsanity，官方
  // 「Eliminate 3 Magic from all Enemies」）。「4 或 5 颗」与「4 或更多（颗）」同为任意大连，
  // minSize 缺省 4。
  if ((m = /^在?(?:配对|匹配|消除)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?(.+)$/.exec(desc))) {
    const dm = /^(所有敌人|一名随机敌人|第一名敌人|首位敌人|敌人)?(?:损失|耗掉|消除)(所有敌人|一名随机敌人|第一名敌人|首位敌人|敌人)?\s*(\d+)\s*点(魔法值|技能值|攻击力|护甲值|法力值)。?$/.exec(m[1]);
    if (dm) {
      const stat = pickTriggerStat(dm[4]);
      if (stat) {
        const scope = /所有敌人/.test(`${dm[1] ?? ''}${dm[2] ?? ''}`) ? 'allEnemies'
          : /一名随机敌人/.test(`${dm[1] ?? ''}${dm[2] ?? ''}`) ? 'randomEnemy' : 'front';
        return { effects: { onBigMatchEnemyDrain: { stat, amount: num(dm[3]), scope } } };
      }
    }
    // 窃取动词按批裁定落纯削减（持有者不进账，官方语义为转移）：攻击力句（chillingaura）
    // 与魔法句（darkinfusion「窃取首位敌人 2 点魔法值」/ darksight「从第一个敌人身上窃取
    // 2 点魔法值」）。其余属性不硬猜、留未实现桶。
    const sm = /^窃取(?:第一名|第一位|首位)敌人\s*(\d+)\s*点(攻击力|魔法值)。?$/.exec(m[1])
      ?? /^从(?:第一个|第一位|第一名|首位)敌人身上窃取\s*(\d+)\s*点(攻击力|魔法值)。?$/.exec(m[1]);
    if (sm) {
      return { effects: { onBigMatchEnemyDrain: { stat: sm[2] === '魔法值' ? 'magic' : 'attack', amount: num(sm[1]), scope: 'front' } } };
    }
  }
  // 大连创造宝石（T4 大连创造批 4 code）：「在配对 4 或更多宝石时（有 N% 几率）创建
  // x2/x3 通配宝石 / 2 颗燃烧宝石」（wildtribe/wildmagic/spectromancy/twinfires）。
  // 「匹配 4 颗或更多宝石时」同义前缀一并收；宝石名不在映射表的（恶/善石像鬼宝石、
  // 暗影星、绿龙宝石）与创造风暴的（deadlywaters 骸骨风暴）不拦截，留在未实现桶。
  if ((m = /^(?:在?配对|匹配)\s*4\s*颗?\s*或\s*更?多\s*颗?\s*宝石的?时[，,]?\s*(?:有\s*(\d+)\s*%\s*的?几[率会]\s*)?(?:创[建造成]|生成)出?\s*(?:(一|\d+)\s*[颗个])?\s*(.+?)(?:宝石|符)?。?$/.exec(desc))) {
    const gem = pickSpecialGemColored(m[3]);
    if (gem) {
      return {
        effects: {
          onBigMatchCreateGem: {
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            ...(gem.color ? { color: gem.color } : {}),
            count: countOf(m[2]),
            ...(m[1] !== undefined ? { chance: num(m[1]) / 100 } : {}),
          },
        },
      };
    }
  }
  // 配对转换（T5 杂项批 trascend「在配对 4 或 5 颗宝石时，将 N 点生命值替换成 N 点魔法值」）：
  // from 侧减 to 侧加（1:1 交换，持有者自身，不掷随机数）。只收 生命值→魔法值 同额句式，
  // 其余属性/不同额的不硬猜（引擎只落地了这一对）。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?将\s*(\d+)\s*点生命值替换成\s*(\d+)\s*点魔法值。?$/.exec(desc))) {
    if (num(m[1]) === num(m[2])) {
      return { effects: { onBigMatchConvert: { from: 'hp', to: 'magic', amount: num(m[1]) } } };
    }
  }
  // 配对召唤（T5 杂项批 genieslamp/stormflock + 收编批 daoslamp「匹配4个或以上的宝石时
  // 有30%几率召唤恶道仆人」）：复用死亡召唤基建（兵种名经 TROOP_BY_NAME / 召唤名修复表
  // 解析成 troopId/referenceName，TurnEngine 注入召唤口走同一条模板装配+入队管线）。
  // 「或以上」/量词「个」/召唤名解析失败不拦截，留在未实现桶。
  if ((m = /^(?:在?配对|匹配)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?\s*(?:有\s*(\d+)\s*[％%]\s*的?几[率会]\s*)?召唤一?[名只个头]?(.+?)。?$/.exec(desc))) {
    const troop = resolveSummonedTroop(desc);
    if (troop && !troop.storm) {
      return {
        effects: {
          onBigMatchSummon: {
            chance: m[1] !== undefined ? num(m[1]) / 100 : 1,
            troopId: troop.troopId,
            referenceName: troop.referenceName,
            displayName: m[2].trim(),
          },
        },
      };
    }
  }
  // 配对风暴（T5 杂项批 deadlywaters「在配对 4 或 5 颗宝石时，创造骸骨风暴」+ 收编批
  // eternaldoom「在匹配 4 或更多宝石时，召唤末日风暴」）：风暴名查 STORM_MAP（骸骨/末日
  // 风暴 dropKind 同源），TurnEngine 注入风暴设置口（与技能造风暴同一份全局唯一顶替裁定）。
  // 不在映射表的风暴（元素风暴/临界风暴——引擎掉落契约无对应语义，映射拿不准）不拦截，
  // 留在未实现桶。
  if ((m = /^在?(?:配对|匹配)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?(?:创[建造成]|召唤)出?(.+?)。?$/.exec(desc))) {
    const storm = STORM_MAP[m[1]];
    if (storm) {
      return {
        effects: {
          onBigMatchStorm: {
            color: storm.color,
            turns: STORM_TURNS,
            troopId: storm.troopId,
            referenceName: storm.referenceName,
            displayName: m[1],
            ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
          },
        },
      };
    }
  }
  // 配对即杀（T5 杂项批 deathbelow「在配对 4 或 5 颗宝石时，有 N% 的几率猎杀最后一名敌人」）：
  // 即死概率原语（death-mark 的回合开始 10% 即死先例同族），最后一名=敌方队伍序末位存活
  //（确定性），处决走 defeat 出编队管线。只收「猎杀最后一名敌人」句式。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?有\s*(\d+)\s*%\s*的?几率猎杀最后一名敌人。?$/.exec(desc))) {
    return { effects: { onBigMatchKill: { chance: num(m[1]) / 100, scope: 'lastEnemy' } } };
  }
  // 条件光环·施加状态（屏障/狂怒/下潜/反射/赐福/冻结+出血…）：状态本体均已落地。
  //   DoT（出血/中毒/燃烧）带 magnitude:1；概率句（lotusblessing 50%）收进 chance。
  //   范围按描述词判定：「获得屏障效果」=self / 所有敌人=allEnemies / 一名随机敌人=randomEnemy /
  //   自己=self / 所有盟友=allAllies / 其余（「一名（随机）盟友」）=randomAlly。
  //   含引擎没有的状态本体（恐怖/法印…）的句子整体不收，不做缺状态的半解析；
  //   「创造 N 颗X宝石」是特殊宝石域不在此收（twinfires）；「第一名敌人」收 firstEnemy（dragonvines）；
  //   未命中任何已知状态的（如「获得额外 N 黄金」）同样落回后续规则留在未实现桶。
  if (/^在?(?:配对|匹配|消除)\s*4/.test(desc) && !AURA_UNKNOWN_STATUS.test(desc) && !/创造|创建/.test(desc)) {
    const chanceM = /有\s*(\d+)%\s*的?几率/.exec(desc);
    const enemyTargeted = /敌人/.test(desc) && !/所有敌人/.test(desc);
    // 敌人指定：随机 → randomEnemy；指定序号（「第一名敌人」dragonvines）→ firstEnemy
    //（引擎按队伍序首个存活确定性结算，不掷随机数）；其余序词不硬猜
    const scope = /获得屏障效果/.test(desc) ? 'self'
      : /所有敌人/.test(desc) ? 'allEnemies'
        : (enemyTargeted && /随机|任意/.test(desc)) ? 'randomEnemy'
          : (enemyTargeted && /第一名敌人|第一位敌人|首位敌人/.test(desc)) ? 'firstEnemy'
            : enemyTargeted ? null
              : /自己/.test(desc) ? 'self'
                : /所有盟友/.test(desc) ? 'allAllies'
                  : 'randomAlly';
    let statuses = null;
    let randomPositive = false;
    let randomNegative = false;
    if (/一个随机的状态效果/.test(desc)) {
      // 随机负面池（experiment「使随机一名敌人陷入一个随机的状态效果」）：池与引擎
      // RANDOM_NEGATIVE_STATUS_POOL 同源，DoT 带 magnitude:1；引擎侧 rng 掷一条
      statuses = NEGATIVE_STATUS_POOL.map((id) => (isDotStatus(id) ? { id, magnitude: 1 } : { id }));
      randomNegative = true;
    }
    else if (/屏障效果/.test(desc)) statuses = [{ id: 'barrier' }];
    else if (/反射效果/.test(desc)) statuses = [{ id: 'reflect' }];
    else if (/下潜/.test(desc)) statuses = [{ id: 'submerged' }];
    else if (/正面增益状态效果/.test(desc)) { statuses = POSITIVE_STATUS_POOL; randomPositive = true; }
    else if (/赐福/.test(desc)) statuses = [{ id: 'blessed' }];
    else if (/狂怒/.test(desc)) statuses = [{ id: 'rage' }];
    else {
      // 复合状态（bloodcoldrage「陷入冻结和出血状态」/ bloodmark「所有敌人陷入出血」）：按映射表收全部命中
      const found = AURA_STATUS_MAP.filter(([re]) => re.test(desc)).map(([, id]) => id);
      if (found.length > 0) {
        statuses = [...new Set(found)].map((id) => (id === 'poison' || id === 'burning' || id === 'bleed' ? { id, magnitude: 1 } : { id }));
      }
    }
    if (scope !== null && statuses) {
      return {
        effects: {
          onBigMatchStatus: {
            scope,
            statuses,
            turns: 3,
            ...(chanceM ? { chance: num(chanceM[1]) / 100 } : {}),
            ...(randomPositive ? { randomPositive: true } : {}),
            ...(randomNegative ? { randomNegative: true } : {}),
          },
        },
      };
    }
  }
  // 敌方配色触发（rancor）：「在敌人配对骷髅头时，获得 3 点攻击力」→ 敌方配对骷髅时自己获得
  if ((m = /^在敌人配对骷髅头(?:宝石)?时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onEnemyColorMatchGain: { color: 'skull', stat, amount: num(m[1]) } } };
  }
  // 配色团队光环（celestial*/powerof*/*aura 族 + virtueofcourage + 收编批 lifetide/
  // celestialstrength/blessingofstone）：「在配对红色宝石时，给予所有红色盟友 4 点攻击力」。
  // 匹配动词 配对/匹配/消除、给予动词 给予/为/赋予/赐予/提供/恢复、获得/恢复后缀、
  // 多属性共享数值（「2 点攻击力和生命值」）与「全部技能值各 N」（四项各 N）都收。
  // 受益范围：同色盟友（查 colors）/ 种族（查 troopTypes）/「所有盟友」= 全队；
  // 骷髅头匹配以 'skull' 为色键（diamondaura/powerofstars/virtueofcourage）。
  // 宝石短语含数字 = 4+ 连句式外壳被 (.+?宝石) 吞进组里，整条跳过（不 return null，
  // 让大连句式落回前面已命中的 4+ 规则族）。
  if ((m = /^在?(?:配对|匹配|消除)(骷髅头(?:宝石)?|.+?宝石)(?:的?时候?|时)[，,]?\s*(?:给予|为|赋予|赐予|提供|恢复)?所有\s*(.*?)\s*盟友(?:获得|给予|提供|赋予|赐予|恢复)?\s*(?:(\d+)\s*点?\s*(.+?)|全部技能值各\s*(\d+)\s*点)[，,]?。?$/.exec(desc)) && !/\d/.test(m[1])) {
    let gemColor;
    if (m[1].startsWith('骷髅头')) gemColor = 'skull';
    else {
      gemColor = pickColor(m[1]);
      if (!gemColor) return null;
    }
    // 「所有盟友」= 全队；「所有棕色盟友」= 先剥「盟友」再查颜色/种族映射
    const scopeName = m[2].trim();
    const scope = scopeName === '' ? 'all' : (pickColor(scopeName) ?? TROOP_TYPE_MAP[scopeName] ?? TROOP_TYPE_MAP[`${scopeName}族`]);
    const gains = m[5] !== undefined
      ? { hp: num(m[5]), armor: num(m[5]), attack: num(m[5]), magic: num(m[5]) }
      : (() => { const g = parseGainsList(m[4], num(m[3])); if (g) return g; const stat = pickStat(m[4] ?? ''); return stat ? { [stat]: num(m[3]) } : null; })();
    if (!scope || !gains) return null;
    return { effects: { onColorMatchTypeAura: { color: gemColor, scope, gains } } };
  }
  // 配色触发·共享数值多属性（ragingbull）：「在配对红色宝石时获得 2 点攻击力、护甲值和生命值」
  // （宝石短语含数字 = 4+ 连外壳，跳过不短路）
  if ((m = /^在?(?:配对|匹配|消除)(.+?)宝石(?:的?时候?|时)[，,]?\s*获得\s*(\d+)\s*点((?:生命值?|护甲值?|攻击力|魔法值)(?:[、和](?:\s*(\d+)\s*点)?(?:生命值?|护甲值?|攻击力|魔法值))+)[，,]?。?$/.exec(desc)) && !/\d/.test(m[1])) {
    const color = pickColor(m[1]);
    const gains = parseGainsList(m[3], num(m[2]));
    if (!color || !gains) return null;
    const stats = Object.keys(gains);
    return { effects: { onColorMatchGain: { color, stat: stats[0], amount: num(m[2]), alsoStats: stats.slice(1) } } };
  }
  // 配色触发：在配对<色>宝石时获得 N 点 X（boo/firewall 族带逗号；royalfire「点 攻击力」带
  // 空格；收编批 dwarvenfortress「消除棕色宝石时获得3点护甲值」/ guardianshield 机翻
  // 「活动 8 点护甲值」——消除动词与「活动」错别字都收；宝石短语含数字 = 4+ 连外壳，跳过）
  if ((m = /^在?(?:配对|匹配|消除)(.+?)宝石(?:的?时候?|时)[，,]?\s*(?:获得|活动)\s*(\d+)\s*点\s*(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc)) && !/\d/.test(m[1])) {
    const color = pickColor(m[1]);
    const stat = pickStat(m[3]);
    if (!color || !stat) return null;
    return { effects: { onColorMatchGain: { color, stat, amount: num(m[2]) } } };
  }
  // 骷髅匹配全技能增益（T5 批，manifestation「在配对骷髅头时，所有技能值增加 5 点」/
  // hunger「在配对骷髅头宝石时全部技能值将增加 2 点」）：TurnEngine 骷髅结算处以 'skull'
  // 色键调 applyColorMatchTriggers（与 diamondaura/powerofstars 光环同一触发点），故落
  // onColorMatchGain 的 'skull' 键、持有者自身获益。「全部/所有技能值」沿用 giftof* 族
  // 的四项各 N 口径展开（hp/armor/attack/magic，共享同一 amount 走 alsoStats）。
  if ((m = /^在?配对骷髅头(?:宝石)?时[，,]?(?:全部|所有)技能值?(?:将)?增加\s*(\d+)\s*点。?$/.exec(desc))) {
    return {
      effects: {
        onColorMatchGain: { color: 'skull', stat: 'hp', amount: num(m[1]), alsoStats: ['armor', 'attack', 'magic'] },
      },
    };
  }
  // 配色伤害（T5 杂项批 lumpofcoal/dawnslayer/sleetstorm「在配对X色宝石时，对一名随机敌人
  // 造成 N 点伤害」）：与配色施加状态/窃取生命同一触发点（applyColorMatchTriggers），伤害经
  // TurnEngine 注入的 damage（damageOne 管线，同技能伤害口径），随机目标走种子化 rng。
  // sleetstorm 官方文本无逗号，[，,]? 一并收。
  if ((m = /^在?配对(.+?)宝石的?时[，,]?对一名随机敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    if (color) return { effects: { onColorMatchDamage: { color, amount: num(m[2]) } } };
  }
  // 配色施加状态（T5 配色状态批 16 code + 收编批 venomofanu/bloodyfury/angrybear）：
  //   动词句 molten「随机燃烧一名敌人」/ wildvines「随机缠绕一名敌人」/ magicvines「缠绕一名
  //   随机敌人」/ lionsroar·petrification「击晕一名随机敌人」（petrification 官方文本无句尾句号）；
  //   陷入句 sunfire「随机使一名敌人陷入妖火状态」/ sourcandy「使一名随机敌人陷入妖火状态」/
  //   deepwounds/rainofspines/grimcurse/curseofmadness/huntersmoon/webbedbranches（单状态）与
  //   enchantedvines「陷入缠绕和妖火状态」/ ancientchill「陷入冻结和妖火状态」（双状态按「和」
  //   拆段，全部命中才收，条目序与描述一致）；foxfire 带概率「有 50% 的几率」收进 chance；
  //   venomofanu「匹配蓝色宝石时使随机敌人中毒」（匹配动词省「在」）/ bloodyfury「匹配骷髅头
  //   时，随机对一名敌人施加流血效果」（骷髅头不带「宝石」尾缀）；angrybear「当配对棕色宝石时
  //   赋予自身狂怒状态」= 持有者自身（scope 'self'）。
  // 状态词查 AURA_STATUS_MAP（与大连施加同表），DoT（燃烧/出血/中毒）带 magnitude:1；
  // 回合数 3（与 onBigMatchStatus 同口径）。指定序号（「第一名敌人」）、窃取/伤害类动词句、
  // 无「随机」的句子不在此收；形状不合落回后续规则，不短路。
  if ((m = /^[当在]?(?:配对|匹配)(骷髅头|.+?宝石)的?时[，,]?(.+)$/.exec(desc))) {
    const color = m[1] === '骷髅头' ? 'skull' : pickColor(m[1]);
    // 色键解析不了就跳过本规则（落回后续规则）——宝石短语可能只是 4+ 连句式的机翻外壳
    //（「匹配4枚或更多宝石时…」被 (.+?宝石) 吞进组里），此处 return null 会误杀下游规则
    if (color) {
      const tail = m[2];
      if (!/所有敌人/.test(tail) && /自身|自己/.test(tail) && !/敌人/.test(tail)) {
      // 自身变体（angrybear）：目标确定性（持有者本人，scope 'self'），概率句仍收 chance
      const chanceM = /有\s*(\d+)\s*[％%]\s*的?几率/.exec(tail);
      const found = AURA_STATUS_MAP.filter(([re]) => re.test(tail)).map(([, id]) => id);
      if (found.length > 0) {
        return {
          effects: {
            onColorMatchStatus: {
              color,
              scope: 'self',
              statuses: [...new Set(found)].map((id) => (isDotStatus(id) ? { id, magnitude: 1 } : { id })),
              turns: 3,
              ...(chanceM ? { chance: num(chanceM[1]) / 100 } : {}),
            },
          },
        };
      }
    }
    if (/随机/.test(tail) && /敌人/.test(tail) && !/所有敌人/.test(tail)) {
      const chanceM = /有\s*(\d+)\s*[％%]\s*的?几率/.exec(tail);
      let statuses = null;
      const trapped = /陷入(.+?)状态/.exec(tail);
      if (trapped) {
        const ids = trapped[1]
          .split('和')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((part) => AURA_STATUS_MAP.find(([re]) => re.test(part))?.[1]);
        if (!ids.some((id) => !id) && new Set(ids).size === ids.length) {
          statuses = [...new Set(ids)].map((id) => (isDotStatus(id) ? { id, magnitude: 1 } : { id }));
        }
      } else {
        const hit = AURA_STATUS_MAP.find(([re]) => re.test(tail));
        if (hit) statuses = [isDotStatus(hit[1]) ? { id: hit[1], magnitude: 1 } : { id: hit[1] }];
      }
      if (statuses) {
        return {
          effects: {
            onColorMatchStatus: {
              color,
              scope: 'randomEnemy',
              statuses,
              turns: 3,
              ...(chanceM ? { chance: num(chanceM[1]) / 100 } : {}),
            },
          },
        };
      }
      }
    }
  }
  // 配色窃取生命（T5 窃取批 5 code + 收编批 roseaura 族 7 code）：
  //   corruption 族「在配对<色>宝石时窃取第一/第一位/首位敌人 N 点生命值」；
  //   roseaura/bluebellaura/gladiolaaura/daffodilaura/irisaura/orchidaura「匹配X宝石时窃取
  //   N 条生命」（官方「Steal 4 Life when matching X Gems」，省略目标=首位敌人，量词「条」）
  //   与 blossomaura「匹配骷髅宝石时窃取 4 条生命」（骷髅以 'skull' 色键）。
  // 结算与技能 drain（settleDrain）同口径：对首位存活敌人造成 amount 伤害（damageOne 管线），
  // 持有者按实际伤害额等量治疗。与配色施加状态同一触发点（applyColorMatchTriggers）。
  if ((m = /^在?配对(.+?)宝石的?时[，,]?窃取(?:第一名|第一位|首位)敌人\s*(\d+)\s*点生命值。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    if (color) return { effects: { onColorMatchDrain: { color, amount: num(m[2]) } } };
  }
  if ((m = /^在?匹配(骷髅|.+?)宝石时窃取\s*(\d+)\s*[条点]生命。?$/.exec(desc))) {
    const color = m[1] === '骷髅' ? 'skull' : pickColor(m[1]);
    if (color) return { effects: { onColorMatchDrain: { color, amount: num(m[2]) } } };
  }
  // 反弹 N% 的骷髅（头）伤害——"反弹/反射"、"骷髅头/骷髅"两种译法都收
  if ((m = /^(?:反弹|反射)\s*(\d+)%\s*的骷髅(?:头)?伤害。?$/.exec(desc))) {
    return { effects: { reflectSkullRatio: num(m[1]) / 100 } };
  }
  // 有 N% 的几率闪避骷髅头伤害（dontblink 的机翻动词「躲避」一并收）
  if ((m = /^有\s*(\d+)%\s*的?几率(?:闪避|躲避)骷髅头伤害/.exec(desc))) {
    return { effects: { dodgeChance: num(m[1]) / 100 } };
  }
  // 种族光环：<族>盟友获得 N 点 X。整条锚定，避免把「当…时，所有<族>…」这类条件光环误收
  // 注意分隔符只能写「盟友」：写成 (?:盟友|族盟友) 会让惰性组把「蛮族」的族字
  // 让给分隔符，m[1] 变成「蛮」而查不到映射。
  if ((m = /^(.+?)盟友获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    const stat = pickStat(m[3]);
    if (troopType && stat) {
      return { effects: { typeAura: { troopType, stat, amount: num(m[2]) } } };
    }
    return null;
  }
  // 光环·计数：每有一名<色>盟友则获得 N 点 X（stoneshield/magicshield 的机翻「即获得」一并收）
  if ((m = /每有一名(.+?)盟友(?:则|即)获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(desc))) {
    const color = pickColor(m[1]);
    const stat = pickStat(m[3]);
    if (!color || !stat) return null;
    return { effects: { perAllyColor: { color, stat, amount: num(m[2]) } } };
  }
  // 法力灵链：在配对<色>宝石时获得额外的<色>法力
  if (/获得额外的/.test(desc) && /法力/.test(desc)) {
    if (/所有宝石/.test(desc)) return { effects: { manaLink: { color: '*', amount: 1 } } };
    const color = pickColor(desc);
    if (!color) return null;
    return { effects: { manaLink: { color, amount: 1 } } };
  }
  // 隐匿（stealthy）：无法被法术指定为目标。引擎 untargetable 已支持
  // （targeting.ts 的 targetableFrom，全员不可指定时退化为可指定）。
  if (/^无法成为法术指定攻击目标（除非场上已无任何其他目标）。?$/.test(desc)) {
    return { effects: { untargetable: true } };
  }
  // 战后经济加成（窗口 E 经济批，DECISIONS 四项拍板①）：merchant/necromancy/necromaster/moneybags 族。
  // 「从战斗中获得 N% 额外灵魂/黄金」「在战斗中获得 N% 黄金加成」→ battleEconomyGain，
  // 战斗结束时对战场经济池对应币种按 (1 + ratio) 放大（traits.ts 编译 / TurnEngine 结算）。
  if ((m = /从战斗中获得\s*(\d+)%\s*额外(灵魂|黄金)/.exec(desc))) {
    return { effects: { battleEconomyGain: { currency: m[2] === '黄金' ? 'gold' : 'souls', ratio: num(m[1]) / 100 } } };
  }
  if ((m = /^在战斗中获得\s*(\d+)%\s*黄金加成。?$/.exec(desc))) {
    return { effects: { battleEconomyGain: { currency: 'gold', ratio: num(m[1]) / 100 } } };
  }
  // 开局召唤风暴（songofnature/songofstone/songofdoom…「在战斗开始的时候召唤叶风暴」）：
  // 与 BATTLE_START_STORMS 同一 battleStartStorm 字段，风暴名复用死亡召唤的 STORM_MAP
  // （9 种风暴 + 骷髅系 dropKind 同源）。已入 BATTLE_START_STORMS 的 5 个 code 由显式
  // 映射兜底（生成器里 startupStorm 后展开覆盖，输出不变）。捕获名不在 STORM_MAP 的
  // （开局召唤兵种，如 parliamentarycall）不在此收——开局召兵需入队钩子，属新机制。
  if ((m = /^在战斗开始的时候召唤(.+?)。?$/.exec(desc))) {
    const storm = STORM_MAP[m[1]];
    if (!storm) return null;
    return {
      effects: {
        battleStartStorm: {
          color: storm.color,
          turns: STORM_TURNS,
          troopId: storm.troopId,
          referenceName: storm.referenceName,
          displayName: m[1],
          ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
        },
      },
    };
  }
  // 开局爆破（omenof* 族「在战斗开始的时候爆破一颗X宝石/骷髅头」，O 桶判读批）：
  // 定义直读字段 battleStartDestroy（与 battleStartStorm 同族，TurnEngine 构造期读
  // getTrait），命中格经既有 resolveBoardChange 清除管线结算（法力/骷髅伤害/重力/连锁
  // 照常，直接结算归持有者一方）。「爆破」目标必须是基础色宝石或骷髅头，其余不收。
  if ((m = /^在战斗开始的时候爆破一颗(.+?)。?$/.exec(desc))) {
    if (m[1] === '骷髅头') return { effects: { battleStartDestroy: { kind: 'skull' } } };
    const color = pickColor(m[1]);
    if (!color) return null;
    return { effects: { battleStartDestroy: { kind: 'color', color } } };
  }
  // 死亡召唤三族（daemonicpact/terrorpact/fromdark/darkdeath… + 收编批 6 条）。
  // 触发主体：自己身亡 / 盟友身亡 / 敌人身亡；概率可省略（=100%，如 loyalmount/desertmount）；
  // 死亡译法 身亡时/死亡时/死时（dissolve）/死后（infernalpact）都收。
  // 召唤物两段式解析：先查兵种数据（含按 code 的机报名修复表），未命中查风暴映射表
  //（骸骨风暴/末日风暴等 9 种，产出 storm 变体 spec，不产出兵种）；两者都查不到留在未实现桶。
  if (/身亡时|死亡时|死[后时]/.test(desc) && /召唤/.test(desc)) {
    if (/当?一?名?敌人(?:死亡|身亡)时/.test(desc)) {
      const hit = parseDeathSummon(desc, 'summonOnEnemyDeath', true, code);
      if (hit) return hit;
      return null; // 敌人身亡但召唤名解析失败，不再尝试其它字段
    }
    if (/当一名盟友身亡时/.test(desc)) {
      const hit = parseDeathSummon(desc, 'summonOnAllyDeath', false, code);
      if (hit) return hit;
      return null;
    }
    const hit = parseDeathSummon(desc, 'summonOnDeath', true, code);
    if (hit) return hit;
    return null;
  }
  return null;
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
// 兵种中文名 → 精简 troops.json 的 { troopId, referenceName }，供死亡召唤特质解析召唤物。
// 精简表（src/data/troops.json）由 build_troops.mjs 产出，与官方 dump 同源，中文名可直接对上。
const troopsSlim = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const TROOP_BY_NAME = new Map(
  (Array.isArray(troopsSlim) ? troopsSlim : troopsSlim.raw_data ?? []).map((t) => [t.name, { troopId: t.id, referenceName: t.referenceName }]),
);

/**
 * 风暴映射表（阶段 1.1 查证收尾，来源与假设详见 DECISIONS.md「风暴（Storm）全局掉落修正」）。
 *
 * 官方语义：风暴不是兵种，是挂在战斗上的全局掉落修正器。六色风暴提升对应色宝石掉率；
 * **骸骨风暴提升骷髅掉率、末日/超级末日风暴提升（至尊）末日骷髅掉率**——而引擎的风暴契约
 * （Team.storm.color: BaseColor，阶段 1.2 已定）只支持按 BaseColor 加权颜色掉落。
 * 骷髅族风暴已回填官方语义：storm.dropKind 指向骷髅系掉落（skull/doomSkull/uberDoomSkull），
 * color 降级为表现层主色（近似色系，供指示器/法力配色使用）：
 *   - 骸骨风暴 Bonestorm → dropKind 'skull'，主色 Brown（骷髅头的棕色系）
 *   - 末日风暴 Doomstorm / 超级末日风暴 Uber Doomstorm → dropKind 'doomSkull'/'uberDoomSkull'，主色 Purple
 * troopId 用虚拟号段 9001~9009（真实兵种 id 不会撞上，表现层可据此区分风暴与兵种）。
 */
const STORM_TURNS = 8; // 官方 3.0 补丁说明："a board affect that lasts 8 Turns (4 for each side)"
const STORM_MAP = {
  暗风暴: { color: 'Purple', troopId: 9001, referenceName: 'Darkstorm' },
  火风暴: { color: 'Red', troopId: 9002, referenceName: 'Firestorm' },
  冰风暴: { color: 'Blue', troopId: 9003, referenceName: 'Icestorm' },
  光风暴: { color: 'Yellow', troopId: 9004, referenceName: 'Lightstorm' },
  叶风暴: { color: 'Green', troopId: 9005, referenceName: 'Leafstorm' },
  尘风暴: { color: 'Brown', troopId: 9006, referenceName: 'Duststorm' },
  骸骨风暴: { color: 'Brown', troopId: 9007, referenceName: 'Bonestorm', dropKind: 'skull' },
  末日风暴: { color: 'Purple', troopId: 9008, referenceName: 'Doomstorm', dropKind: 'doomSkull' },
  超级末日风暴: { color: 'Purple', troopId: 9009, referenceName: 'UberDoomstorm', dropKind: 'uberDoomSkull' },
};

/**
 * 解析「召唤一只/名/个 X」里的 X，两段式：
 *   1. 查兵种数据（现状）→ { troopId, referenceName }；
 *   2. 未命中查风暴映射表 → 兵种召唤变体为风暴：附 storm: { color, turns }，
 *      troopId 为虚拟风暴号段（引擎据此不产出兵种、改设全局风暴）。
 * 都查不到返回 null（该特质继续留在未实现桶）。
 */
function resolveSummonedTroop(desc) {
  const name = (/(?:召唤|召唤出)一?[名只个头]?(.+?)[。.？?]?$/.exec(desc) ?? [])[1]?.trim();
  if (!name) return null;
  const troop = TROOP_BY_NAME.get(name);
  if (troop) return { troopId: troop.troopId, referenceName: troop.referenceName };
  const storm = STORM_MAP[name];
  if (storm) {
    return {
      troopId: storm.troopId,
      referenceName: storm.referenceName,
      storm: {
        color: storm.color,
        turns: STORM_TURNS,
        ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
      },
    };
  }
  return null;
}

/**
 * 召唤名机翻修复（收编批）：dump 描述的召唤名与兵种库中文名对不上
 * （「半人马侦察兵」vs 兵种库「人马斥候」等），按 code 显式指向官方英文描述确认的
 * referenceName，displayName 用兵种库实名（展示与防幻觉对账都要求实名）。
 */
function resolveSummonedTroopByCode(code) {
  const ref = SUMMON_TROOP_NAME_FIX[code];
  if (!ref) return null;
  const slim = (Array.isArray(troopsSlim) ? troopsSlim : troopsSlim.raw_data ?? []).find((t) => t.referenceName === ref);
  if (!slim) return null;
  return { troopId: slim.id, referenceName: slim.referenceName, displayName: slim.name };
}

/** 死亡召唤共同解析：触发主体 + 概率 + 召唤物。触发字段由调用方指定 */
function parseDeathSummon(desc, field, withChance, code) {
  const byCode = resolveSummonedTroopByCode(code);
  const chance = withChance ? (/(?:有|时)\s*(\d+)%\s*的?几率/.exec(desc) ?? [])[1] : undefined;
  const troop = byCode ?? resolveSummonedTroop(desc);
  if (!troop) return null;
  return {
    effects: {
      [field]: {
        chance: chance !== undefined ? num(chance) / 100 : 1,
        troopId: troop.troopId,
        referenceName: troop.referenceName,
        displayName: byCode?.displayName
          ?? (/(?:召唤|召唤出)一?[名只个头]?(.+?)[。.？?]?$/.exec(desc) ?? [])[1]?.trim(),
        ...(troop.storm ? { storm: troop.storm } : {}),
      },
    },
  };
}

const info = new Map();
for (const r of raw.troops) {
  for (const t of r.stats?.traits ?? []) {
    if (!info.has(t.code)) info.set(t.code, { name: t.name, description: t.description, troops: 0 });
    info.get(t.code).troops += 1;
  }
}

const out = [];
const skipped = [];
// 开局风暴的原始描述只有少量固定特质。按 code 显式映射，避免依赖多语言描述文本的正则匹配。
const BATTLE_START_STORMS = {
  songoflight: { color: 'Yellow', turns: STORM_TURNS, troopId: 9004, referenceName: 'Lightstorm', displayName: 'Lightstorm' },
  songofdarkness: { color: 'Purple', turns: STORM_TURNS, troopId: 9001, referenceName: 'Darkstorm', displayName: 'Darkstorm' },
  songofbones: { color: 'Brown', turns: STORM_TURNS, troopId: 9007, referenceName: 'Bonestorm', displayName: 'Bonestorm', dropKind: 'skull' },
  songoffire: { color: 'Red', turns: STORM_TURNS, troopId: 9002, referenceName: 'Firestorm', displayName: 'Firestorm' },
  songofice: { color: 'Blue', turns: STORM_TURNS, troopId: 9003, referenceName: 'Icestorm', displayName: 'Icestorm' },
};
for (const [code, v] of [...info].sort((a, b) => b[1].troops - a[1].troops)) {
  // 机翻错译定点修正（核对报告 §二）：先改写描述再解析，保证「描述↔数值」对账一致
  const description = DESCRIPTION_OVERRIDES[code] ?? v.description;
  // 官方英文权威、中文机翻破损的特质按官方文本显式写效果（maladycurse/sanctuary/hellfire）
  const parsed = EXPLICIT_EFFECTS[code] ? { effects: EXPLICIT_EFFECTS[code] } : parse(description, code);
  const startupStorm = BATTLE_START_STORMS[code];
  if (parsed || startupStorm) {
    out.push({
      code,
      name: v.name,
      description,
      troops: v.troops,
      ...(parsed?.effects ?? {}),
      ...(startupStorm ? { battleStartStorm: startupStorm } : {}),
    });
  } else {
    skipped.push({ code, ...v, description });
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const coverage = out.reduce((s, x) => s + x.troops, 0);
const skippedCoverage = skipped.reduce((s, x) => s + x.troops, 0);
console.log(`已实现特质: ${out.length} 个 code，覆盖 ${coverage} 次兵种出场`);
console.log(`未实现特质: ${skipped.length} 个 code，覆盖 ${skippedCoverage} 次出场`);
const byMechanic = new Map();
for (const s of skipped) {
  const key = UNSUPPORTED_STATUS.test(s.description) ? '缺状态/机制'
    : /召唤/.test(s.description) ? '缺召唤钩子'
      : /宝石/.test(s.description) ? '缺棋盘钩子'
        : /盟友获得|盟友\s*\d/.test(s.description) ? '缺种族光环（需中文种族名映射）'
          : /施放法术时/.test(s.description) ? '缺施法响应钩子'
            : /配对\s*4\s*或\s*5/.test(s.description) ? '缺 4/5 连钩子'
              : /闪避/.test(s.description) ? '缺闪避钩子'
                : /反弹/.test(s.description) ? '缺反弹钩子'
                  : /身亡时/.test(s.description) ? '缺阵亡钩子'
                    : '其它';
  byMechanic.set(key, (byMechanic.get(key) ?? 0) + 1);
}
console.log('未实现原因分布:');
for (const [k, n] of [...byMechanic].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)}${n}`);
