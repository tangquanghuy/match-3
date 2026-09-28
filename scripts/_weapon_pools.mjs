#!/usr/bin/env node
/**
 * 窗口 K-B · 武器法术池提取 + 规则化编译 + W 系批次生成（三合一）。
 *
 * 用法：
 *   node scripts/_weapon_pools.mjs pool     # 生成 scripts/curated-pools/pool-w01.json（718 条）
 *   node scripts/_weapon_pools.mjs triage   # 打印分诊统计（编译数/未识别子句直方图）
 *   node scripts/_weapon_pools.mjs left     # 列出未编译条目（id / desc / 原因），供人工逐条裁定
 *   node scripts/_weapon_pools.mjs gen      # 生成 src/engine/skills/curated/batch-w*.ts
 *   node scripts/_weapon_pools.mjs report   # 生成 artifacts/weapon-spell-triage.md
 *
 * 数据源：artifacts/gowhead-weapons/weapons.json（zh 文本为锚，TASK-WEAPONS §1：中文为主）。
 * 语义依据：scripts/spell-rules.md（§0 裸伤害=enemyChosen、§9 风暴/oneOf、§11 随机状态分池、
 * §12 reposition/lastTarget、§13 '&&' 切分等）；每条规则都锚定既有部队批次先例
 * （batch-05 7059 清除段先行、batch-19 7060「每摧毁一颗…」、batch-21 8167、batch-p37 8560
 * 地狱风暴=Red、batch-r9 tier3 通配、batch-16 8831 王国随机召唤不做等），机器不猜语义：
 * 规则表覆盖不到的句子一律 SKIPPED（原因 = 首个未识别子句或命中预判）。
 *
 * 本脚本只写自己名下的产物：pool-w01.json、batch-w*.ts、artifacts/weapon-spell-triage.md。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { correctedWeaponDescription } from './lib/gow-weapon-desc-corrections.mjs';
// Preserve previously reviewed runtime rows when regenerating compiler batches.
// The saved rows are historical repairs, not final GoW acceptance.
const reviewedWeaponRows = JSON.parse(readFileSync(new URL('../src/data/gowWeaponReviewedOverrides.json', import.meta.url), 'utf8')).entries;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEAPONS = path.join(ROOT, 'artifacts', 'gowhead-weapons', 'weapons.json');
const TROOPS = path.join(ROOT, 'src', 'data', 'troops.json');
const POOL_OUT = path.join(ROOT, 'scripts', 'curated-pools', 'pool-w01.json');
const CURATED_DIR = path.join(ROOT, 'src', 'engine', 'skills', 'curated');
const REPORT_OUT = path.join(ROOT, 'artifacts', 'weapon-spell-triage.md');

/** 淬炼/回火加成（Doomed 档 76 把）无战斗机制对应 → 预判 SKIP（report 归原语请求家族） */
const TEMPERING_RE = /每锻炼|每级回火|回火等级|每提升一级强化|武器段位/;

// —— 缩放解析（逐字复用 build_troops.mjs 内联解析器；必须与 src/engine/skills/scaling.ts 等价） ——
const BRACKET_RE = /\[([^\]]*)\]/g;
const MAGIC_DIV_RE = /魔法\s*\/\s*(\d+(?:\.\d+)?)/;
const MAGIC_MUL_RE = /魔法\s*[xX×]\s*(\d+(?:\.\d+)?)/;
const PLUS_N_RE = /\+\s*(\d+(?:\.\d+)?)/;
const MULTIPLIER_TOKEN_RE = /^[xX×]\s*(\d+(?:\.\d+)?)$/;
const RATIO_TOKEN_RE = /^(\d+)\s*:\s*(\d+)$/;

function classifyToken(inner) {
  const s = inner.trim();
  if (s.includes('魔法')) {
    let mult = 1;
    const div = MAGIC_DIV_RE.exec(s);
    const mul = MAGIC_MUL_RE.exec(s);
    if (div) {
      const d = Number(div[1]);
      mult = d !== 0 ? 1 / d : 0;
    } else if (mul) {
      mult = Number(mul[1]);
    }
    const plus = PLUS_N_RE.exec(s);
    const base = plus ? Number(plus[1]) : 0;
    return { scaling: { base, mult } };
  }
  const m = MULTIPLIER_TOKEN_RE.exec(s);
  if (m) return { modifier: { kind: 'multiplier', a: Number(m[1]) } };
  const r = RATIO_TOKEN_RE.exec(s);
  if (r) return { modifier: { kind: 'ratio', a: Number(r[1]), b: Number(r[2]) } };
  return null;
}

function parseScalings(desc) {
  const scalings = [];
  let modifier;
  BRACKET_RE.lastIndex = 0;
  let match;
  while ((match = BRACKET_RE.exec(desc)) !== null) {
    const classified = classifyToken(match[1]);
    if (!classified) continue;
    if (classified.scaling) scalings.push(classified.scaling);
    if (classified.modifier && modifier === undefined) modifier = classified.modifier;
  }
  return { scalings, modifier };
}

// —— 词表 ——
const COLORS = { 红: 'Red', 蓝: 'Blue', 绿: 'Green', 黄: 'Yellow', 紫: 'Purple', 棕: 'Brown' };
/** 状态词表（spell-rules §6，规范拼写；长词在前防误配）。
 *  2026-09-18 第三轮：正面状态族落地（status.ts BLESS/ENCHANTED/REFLECT_STATUS_ID）——
 *  赐福/祝福→blessed、法印/附魔→enchanted（gowhead EN 侧核实 Enchant）、反射→reflect、
 *  狼化→lycanthropy（WOLF_STATUS_IDS 收 'lycanthropy'）。 */
const STATUSES = [
  ['死亡标记', 'death-mark'], ['猎人标记', 'marked'], ['中毒', 'poison'], ['燃烧', 'burning'],
  ['流血', 'bleed'], ['出血', 'bleed'], ['沉默', 'silence'], ['冻结', 'frozen'], ['冰冻', 'frozen'],
  ['打昏', 'stun'], ['击晕', 'stun'], ['眩晕', 'stun'], ['纠缠', 'entangle'], ['缠绕', 'entangle'],
  ['屏障', 'barrier'], ['下潜', 'submerged'], ['沉没', 'submerged'], ['疾病', 'disease'],
  ['诅咒', 'curse'], ['狂怒', 'rage'], ['魅惑', 'charm'], ['恐怖', 'terror'], ['妖火', 'faerie-fire'],
  ['织网', 'web'], ['蛛网', 'web'],
  ['精灵之火', 'faerie-fire'], ['妖火', 'faerie-fire'],
  ['赐福', 'blessed'], ['祝福', 'blessed'], ['法印', 'enchanted'], ['附魔', 'enchanted'],
  ['狼人诅咒', 'lycanthropy'],
  ['反射', 'reflect'], ['狼化', 'lycanthropy'], ['狂暴', 'rage'],
];
/** 新正面状态（随机正面池之外可显式施加的）——冒烟/审计白名单同步 tests/unit/weaponSpellAudit.test.ts */
const NEW_STATUS_IDS = new Set(['blessed', 'enchanted', 'reflect', 'lycanthropy']);
/** 「所有负面状态效果」展开池 = effects/status.ts RANDOM_NEGATIVE_STATUS_POOL（引擎权威集合） */
const NEGATIVE_POOL = ['poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'death-mark', 'charm'];
/** 「所有正面状态效果」展开池 = 引擎已实现正面状态全集（屏障/狂怒/下潜 + 第三轮 赐福/法印/反射） */
const POSITIVE_POOL = ['barrier', 'rage', 'submerged', 'blessed', 'enchanted', 'reflect'];
/** 可组装特殊宝石 → SpecialGemKind（窗口 C 落地集合 + R 系扩展 + Wave B 17 新 kind；长词在前）。
 *  善/恶石像鬼以 tier 区分（types.ts：tier 1=善 / 2=恶；tier 缺省引擎按善处理）。 */
const SPECIAL_GEMS = [
  ['极度末日骷髅头', 'uberDoomSkull'], ['超级末日骷髅头', 'uberDoomSkull'],
  ['善石像鬼宝石', 'gargoyleGem', 1], ['恶石像鬼宝石', 'gargoyleGem', 2],
  ['噩梦传送门宝石', 'daemonicPortalGem'], ['恶魔传送门宝石', 'daemonicPortalGem'],
  ['末日骷髅', 'doomSkull'], ['末日骷髅头', 'doomSkull'], ['厄运骷髅头', 'doomSkull'],
  ['燃烧宝石', 'burningGem'], ['冻结宝石', 'freezeGem'], ['诅咒宝石', 'curseGem'],
  ['流血宝石', 'bleedGem'], ['毒药宝石', 'poisonGem'], ['毒宝石', 'poisonGem'],
  ['死亡标记宝石', 'deathMarkGem'], ['死亡印记宝石', 'deathMarkGem'], ['恐怖宝石', 'terrorGem'], ['恐惧宝石', 'terrorGem'], ['缠绕宝石', 'entangleGem'],
  ['激怒宝石', 'enrageGem'], ['沉没宝石', 'submergeGem'], ['妖仙宝石', 'faerieFireGem'],
  ['精灵火宝石', 'faerieFireGem'], ['打昏宝石', 'stunGem'], ['击晕宝石', 'stunGem'],
  ['屏障宝石', 'barrierGem'], ['织网宝石', 'web'], ['蛛网宝石', 'web'], ['许愿宝石', 'wish'],
  ['幽魂宝石', 'ghost'], ['鬼魂宝石', 'ghost'], ['沙漏宝石', 'hourglass'],
  ['赃物宝石', 'bootyGem'], ['战利品宝石', 'bootyGem'], ['炸弹宝石', 'bomb'],
  // —— Wave B（提交 2813774）：龙/巨人/灵力/法力药水/糖果 = 六色族，spec.color 携带归属色 ——
  ['龙宝石', 'dragonGem'], ['巨人宝石', 'giantGem'], ['灵力宝石', 'spiritGem'],
  ['法力药水宝石', 'manaPotionGem'], ['糖果宝石', 'candyGem'],
  ['元素星', 'elementalStar'], ['临界星', 'umbralStar'], ['暗影之星', 'umbralStar'], ['暗影星辰', 'umbralStar'],
  ['天使宝石', 'angelGem'], ['石像鬼宝石', 'gargoyleGem'],
  ['传送门宝石', 'daemonicPortalGem'], ['狼化宝石', 'lycanthropyGem'],
  ['腐朽宝石', 'decayGem'], ['腐烂宝石', 'decayGem'], ['陷阱宝石', 'trapGem'], ['火山宝石', 'volcanoGem'],
  // —— K-B 收官轮：石块（8769 石块计数/创造、8400 石墩）；带档通配符（8966 x3 通配符转换）——
  //  x 档变体必须排在裸「通配符」之前（matchSpecialGem 按包含匹配、先命中先返回）
  ['石块', 'stoneBlock'], ['石墩', 'stoneBlock'],
  ['x2 通配符', 'wildcard', 2], ['x3 通配符', 'wildcard', 3], ['x4 通配符', 'wildcard', 4],
  ['x2 通配', 'wildcard', 2], ['x3 通配', 'wildcard', 3], ['x4 通配', 'wildcard', 4],
  ['通配符', 'wildcard'], ['通配宝石', 'wildcard'],
];
/** 六色族：文本带颜色时经 spec.color 通道携带（GEMS-SEMANTICS-2 拍板方案） */
const SIX_COLOR_GEMS = new Set(['dragonGem', 'giantGem', 'spiritGem', 'manaPotionGem', 'candyGem']);
/** 仍不可组装的宝石族（贪婪宝石无 kind；「龙族宝石/蓝龙宝石」官方句未考证到可组装口径） */
const BLOCKED_GEM_RE = /龙族宝石|蓝龙宝石|贪婪宝石/;
/** 种族别名（高置信；「怪兽=Monster」batch-10 先例、「仙灵/妖仙=Fey」batch-17 先例）。
 *  2026-09-18 第三轮：机翻别名补全（亡灵=Undead、神秘=Mystic、构装体=Construct——
 *  均经 troops.json troopTypes 反查确认该族有成员）。
 *  2026-09-18 第四轮（K-B3）：机翻族名补全——每条均经 gowhead EN 原文核实 + troops.json
 *  troopTypes 反查该族有成员（猫族/罗刹=Raksha、金牛座/牛头族=Tauros、人马=Centaur、
 *  狼族/战神=Wargare、蛮族=Wildfolk、厄什卡/乌尔斯卡=Urska、建造=Construct、罗格=Rogue、
 *  冥河/猎鹰=Stryx、美人鱼=Merfolk）；「魔头=Boss」（GoW 官方 Boss troopType，
 *  若敌人是个魔头=目标 Boss 族判定，推翻 §5 旧读法——见 spell-rules §5 修订）。 */
const RACE_ALIAS = {
  恶魔: 'Daemon', 不死族: 'Undead', 亡灵: 'Undead', 元素: 'Elemental', 元素生物: 'Elemental', 神祇: 'Divine',
  神祗: 'Divine',
  纳迦: 'Naga', 半人马: 'Centaur', 人马: 'Centaur', 巨人: 'Giant', 矮人: 'Dwarf', 人类: 'Human', 兽人: 'Orc',
  骑士: 'Knight', 机械: 'Mech', 秘士: 'Mystic', 神秘: 'Mystic', 龙: 'Dragon', 龙族: 'Dragon', 野兽: 'Beast', 哥布林: 'Goblin', 妖仙: 'Fey', 精灵: 'Elf',
  怪兽: 'Monster', 怪物: 'Monster', 构装体: 'Construct',
  猫族: 'Raksha', 罗刹: 'Raksha', 金牛座: 'Tauros', 牛头族: 'Tauros',
  狼族: 'Wargare', 战神: 'Wargare', 蛮族: 'Wildfolk', 厄什卡: 'Urska', 乌尔斯卡: 'Urska',
  建造: 'Construct', 罗格: 'Rogue', 盗贼: 'Rogue', 冥河: 'Stryx', 猎鹰: 'Stryx', 鸟族: 'Stryx', Stryx: 'Stryx',
  美人鱼: 'Merfolk', 海族: 'Merfolk', 魔头: 'Boss',
};
/** 王国名机翻变体（K-B3：EN 原文核实；召唤/计数/状态目标共用一条归一口）。
 *  与 RACE_ALIAS 的分工：命中此处 → kingdom-* 特征（待王国批接线）；命中 RACE_ALIAS → 立即可组装。
 *  K-B 收官轮（EN 快照王国改名考证，data/raw 双语 dump 按 troop Id 配对核实）：
 *  官方 2025 改名——Zaejin→Amanithrax（zh=齐埃金）、Hellcrag→Obsidian Depths（zh=地狱悬崖）、
 *  Grosh-Nak→Dripping Caverns（zh=葛洛什奈克）；机翻译名/截断——毒菇林=Amanithrax（齐埃金）、
 *  滴答洞穴=Dripping Caverns（葛洛什奈克）、黑曜石深渊=Obsidian Depths（地狱悬崖）、
 *  圣力场=Divinion Fields（卜筮之原）、潘之谷=潘神之谷、银林地=玉银林地、狐狸座=Vulpacea（沃尔帕克）。 */
const KINGDOM_ALIAS = {
  冰封之巅: '冰峰之巅', 卡拉科斯: '卡拉考斯', 地狱岩: '地狱悬崖', 地狱峭壁: '地狱悬崖', 地域悬崖: '地狱悬崖',
  马拉杰之罪: '迈纳杰之罪', 古尔瓦尼亚: '加尔凡尼亚', '德拉克-祖姆': '卓克祖', 'Dhrak-Zum': '卓克祖',
  日冠: '日冕', 扎金: '齐埃金', 狐狸族: '沃尔帕克', 狐狸座: '沃尔帕克', 暗石: '黑石', 流沙: '聚沙之地',
  荒野平原: '狂野平原', 毒菇林: '齐埃金', 滴答洞穴: '葛洛什奈克', 黑曜石深渊: '地狱悬崖', 圣力场: '卜筮之原',
  潘之谷: '潘神之谷', 银林地: '玉银林地', 盛唐: '圣唐',
};
/** 群体名归一（机翻变体 → 王国官方名）；非变体原样返回 */
function normalizeGroupName(grp) {
  let g = (grp ?? '').trim();
  for (const [mt, canon] of Object.entries(KINGDOM_ALIAS)) if (!g.includes(canon) && g.includes(mt)) g = g.split(mt).join(canon);
  return g;
}
/** 群体名（归一后）是否为王国名（含王国名前缀） */
function isKingdomGroup(grp) {
  const g = normalizeGroupName(grp);
  return KINGDOM_NAMES.some((k) => g.includes(k));
}
/** 条件/召唤里的兵种名机翻变体（K-B3：EN 原文核实，troops.json name 反查存在）。
 *  用于 resolveTroopName 二次尝试（如「不朽的拉奇亚」→ troops「不朽的拉基亚」）。 */
const TROOP_NAME_ALIAS = {
  拉奇亚: '拉基亚', 阿巴顿: '亚巴顿', Scoprio: '天蝎座', 卡奥玛尼: '考马尼',
  双子: '双子座', 巨龟: '穴居人', 牛头怪: '陶拉乌斯', 克维尔杜夫: '克维尔杜尔夫',
  玛拉图斯: '马拉图斯', 怪物: '龟背竹',
};
/** 王国名清单（troops.json 42 王国；按王国限定目标/随机召唤 = 无对应原语，batch-16 8831 先例） */
const KINGDOM_NAMES = ['破碎尖塔', '阿达纳', '卡拉考斯', '蛛尔卡里', '卜筮之原', '鳞雾沼泽', '荆棘森林', '白盔国', '潘神之谷', '盖塔尔', '卡其尔', '齐埃金', '荣耀之地', '加尔凡尼亚', '剑锋崖', '风暴峡湾', '毛格瑞姆森林', '葛洛什奈克', '混沌', '狂野平原', '黑石', '聚沙之地', '荒芜之地', '冰峰之巅', '天启', '狮心帝国', '龙爪', '守护者', '黑鹰', '玉银林地', '日冕', '厄什卡亚', '藏宝库', '梅兰堤斯', '圣唐', '皓彩森林', '卓克祖', '迈纳杰之罪', '沃尔帕克', '诺斯', '地狱悬崖', '午夜城市', '盛唐'];
/** P-E-faction-kingdom: zh kingdom name -> raw native KingdomId (main kingdom; data/raw/troops.gow.zh.json KingdomId by
 *  kingdom_name, 1:1). Kingdom filters are emitted in the id form so faction troops (own raw id, parent zh name) are excluded. */
const KINGDOM_ID = { 破碎尖塔: 3000, 阿达纳: 3001, 皓彩森林: 3002, 潘神之谷: 3003, 齐埃金: 3004, 荣耀之地: 3005, 剑锋崖: 3006, 加尔凡尼亚: 3007, 毛格瑞姆森林: 3008, 玉银林地: 3009, 厄什卡亚: 3010, 冰峰之巅: 3011, 卡其尔: 3012, 风暴峡湾: 3013, 白盔国: 3014, 荆棘森林: 3015, 鳞雾沼泽: 3016, 卡拉考斯: 3017, 葛洛什奈克: 3018, 龙爪: 3019, 盖塔尔: 3020, 荒芜之地: 3021, 黑石: 3022, 日冕: 3023, 聚沙之地: 3024, 狮心帝国: 3025, 黑鹰: 3026, 狂野平原: 3027, 卜筮之原: 3028, 蛛尔卡里: 3029, 圣唐: 3030, 混沌: 3032, 守护者: 3033, 天启: 3034, 卓克祖: 3035, 梅兰堤斯: 3036, 迈纳杰之罪: 3037, 藏宝库: 3038, 诺斯: 3080, 地狱悬崖: 3082, 沃尔帕克: 3084, 午夜城市: 3085 };
const kref = (kg) => KINGDOM_ID[kg] ?? kg;
const krefCode = (kg) => (typeof kref(kg) === 'number' ? String(kref(kg)) : `'${kg}'`);
/** 全视之眼 = Ocularen 族（batch-08 7752 先例的引用清单） */
const OCULAREN_REFS = ['OcularenLeech', 'Ocularen', 'BurningOcularen', 'GloomOcularen'];
/** 风暴颜色（spell-rules §9.1；地狱≈火 = batch-p37 8560 先例）。
 *  K-B 收官轮：电=Yellow（8409 Electrostorm——GoW 元素口径 Yellow=风/空气，闪电系风暴
 *  归黄；与「光=Yellow」同色系裁定，见 spell-rules §14.6）。 */
const STORM_COLORS = { 尘: 'Brown', 冰: 'Blue', 叶: 'Green', 火: 'Red', 光: 'Yellow', 暗: 'Purple', 地狱: 'Red', 电: 'Yellow' };
/** 具名部队族引用清单（batch-08 7752 全视之眼先例）： troops.json 无对应 troopType、
 *  但官方句式为「召唤一名随机X」的具名族——按 name 清单均匀随机。
 *  小鬼=Imp（夏/秋/冬/春/万圣 5 只）、科博=Kobold（科博/骑士/法师/使者/小偷 5 只，
 *  troops.json name 反查 referenceName）。 */
const NAMED_GROUP_REFS = {
  小鬼: ['SummerImp', 'AutumnalImp', 'WinterImp', 'SpringImp', 'SpookyImp'],
  科博: ['Kobold', 'KoboldKnight', 'KoboldMagi', 'KoboldEmissary', 'KoboldThief'],
};

// —— 数据加载 ——
function loadWeapons() {
  const raw = JSON.parse(readFileSync(WEAPONS, 'utf8')).weapons;
  return raw.map((x) => {
    const desc = correctedWeaponDescription(x.SpellId, x._zh.spellDesc, x.stats?.spell?.desc);
    const { scalings, modifier } = parseScalings(desc);
    return {
      spellId: x.SpellId,
      weaponRef: x.ReferenceName,
      weaponName: x._zh.name,
      spellName: x._zh.spellName,
      desc,
      descEn: (x.stats?.spell?.desc ?? '').trim(),
      scalings,
      modifier,
      manaCost: x.ManaCost,
      colors: (x.mana_colors ?? []).map((c) => c.replace(/^Color/, '')),
      rarity: safeRarity(x),
    };
  });
}
function safeRarity(x) {
  try { return JSON.parse(x.data).WeaponRarity ?? ''; } catch { return ''; }
}
function loadTroops() {
  return JSON.parse(readFileSync(TROOPS, 'utf8'));
}
/** 种族 → referenceName 清单（summonRandom 引用；经 troops.json 反查，保证引用存在） */
function buildRaceRefs(troops) {
  const byRace = new Map();
  for (const t of troops) {
    for (const tt of t.troopTypes ?? []) {
      if (!byRace.has(tt)) byRace.set(tt, []);
      byRace.get(tt).push(t.referenceName);
    }
  }
  return byRace;
}

// =====================================================================
// 编译器：desc → builders 调用串 | { skip, reason }
// =====================================================================

class Compiler {
  constructor(troops) {
    this.raceRefs = buildRaceRefs(troops);
    this.imports = new Set();
  }
  use(...fns) { for (const f of fns) this.imports.add(f); }

  /**
   * 编译一条（分保真度）：
   * - full      全部子句可编译；
   * - partial   ≥1 子句编译 + ≥1 子句略去（可编译子句照常入 build，卡点子句不硬编）；
   * - mana-only 零子句可编译 → 占位绑定（不入批次，运行时回退仅扣法力）。
   * 返回 { build, fidelity, features, skippedClauses, imports } 或 { manaOnly, ... }。
   */
  compile(sp) {
    this.imports = new Set();
    // Snapshot repairs: Chinese extraction lost clauses/formulas. Keep the provenance
    // text untouched; explicit exceptions follow the English/native spell steps.
    const repaired = {
      // 7079: native BoardTarget SingleGem is a selected board cell, not a random color gem.
      // The second native IncreaseSpellPower step also applies +1 Magic to every ally.
      7079: { imports: ['skill', 'destroyAt', 'CELL', 'magic'],
        build: "skill(destroyAt(CELL), magic('allyAll', 1, 0))" },
      // 7249 was previously hand-repaired in the generated batch. Keep the conditional
      // Life/Magic clauses in the generator; the 13-vs-native-10 gem threshold remains under review.
      7249: { imports: ['skill', 'armor', 'attack', 'heal', 'magic'],
        build: "skill(armor('allyAll', 3, 1), attack('allyAll', 5, 0), heal('allyAll', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } }), magic('allyAll', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Yellow, n: 13 } }))" },
      9837: { imports: ['skill','attack','heal','inflict'], build: "skill(attack('allyAll', 1, 1, { targetRace: 'Undead' }), heal('allyAll', 1, 1, { targetRace: 'Undead' }), inflict('blessed', 'allyAll', { targetRace: 'Undead' }))" },
      9911: { imports: ['skill','attack','heal','inflict'], build: "skill(attack('allyAll', 1, 1, { targetKingdom: 3022 }), heal('allyAll', 1, 1, { targetKingdom: 3022 }), inflict('blessed', 'allyAll', { targetKingdom: 3022 }))" },
      9914: { imports: ['skill','attack','heal','inflict'], build: "skill(attack('allyAll', 1, 1, { targetKingdom: 3084 }), heal('allyAll', 1, 1, { targetKingdom: 3084 }), inflict('blessed', 'allyAll', { targetKingdom: 3084 }))" },
      9976: { imports: ['skill','attack','heal','inflict'], build: "skill(attack('allyAll', 1, 1, { targetRace: 'Mystic' }), heal('allyAll', 1, 1, { targetRace: 'Mystic' }), inflict('blessed', 'allyAll', { targetRace: 'Mystic' }))" },
      10046: { imports: ['skill','attack','heal','inflict'], build: "skill(attack('allyAll', 1, 1, { targetRace: 'Construct' }), heal('allyAll', 1, 1, { targetRace: 'Construct' }), inflict('blessed', 'allyAll', { targetRace: 'Construct' }))" },
      10050: { imports: ['skill','attack','heal','inflict'], build: "skill(attack('allyAll', 1, 1, { targetKingdom: 3024 }), heal('allyAll', 1, 1, { targetKingdom: 3024 }), inflict('blessed', 'allyAll', { targetKingdom: 3024 }))" },
      8900: { imports: ['targetedSkill','chooseSkill','transformToSpecial','dmg'], build: "targetedSkill('enemyChosen', chooseSkill([\"将所选敌人一种法力颜色的宝石转化为灵魂宝石\",\"对所选敌人造成［魔法＋2］伤害，每颗灵魂宝石增强4点\"], [transformToSpecial('CHOSEN_TARGET', 'spiritGem')], [dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'spiritGem' } } })]))" },
      8951: { imports: ["skill","chooseSkill","createSpecialGems","extraTurn","trueDmg"], build: "skill(chooseSkill([\"创造8颗灵魂宝石并获得额外回合\",\"对一名随机敌人造成［魔法×2＋3］真实伤害\"], [createSpecialGems({ kind: 'spiritGem', color: BaseColor.Purple }, 8, 0), extraTurn()], [trueDmg('enemyRandom', 3, 2, { trueDamage: true })]))" },
      8876: { imports: ["skill","chooseSkill","transform","CHOSEN","explodeAt","CELL","createGems"], build: "skill(chooseSkill([\"将所有绿色宝石转化为所选颜色\",\"爆破所选宝石，创造10颗绿色宝石\"], [transform(BaseColor.Green, CHOSEN)], [explodeAt(CELL), createGems(BaseColor.Green, 10, 0)]))" },
      8623: { imports: ["skill","chooseSkill","createSpecialGems","inflict"], build: "skill(chooseSkill([\"创造6颗元素之星，祝福所有盟友\",\"创造7颗幽影之星，诅咒所有敌人\"], [createSpecialGems({ kind: 'elementalStar' }, 6, 0), inflict('blessed', 'allyAll')], [createSpecialGems({ kind: 'umbralStar' }, 7, 0), inflict('curse', 'enemyAll')]))" },
      9204: { imports: ['skill', 'chooseSkill', 'createSpecialGems', 'dmgSplash'], build: "skill(chooseSkill(['创造8颗蓝色闪电宝石，对一名敌人造成［魔法＋3］溅射伤害', '创造8颗黄色闪电宝石，对一名敌人造成［魔法＋3］溅射伤害'], [createSpecialGems({ kind: 'lightningRow' }, 8, 0), dmgSplash('enemyChosen', 3, 1)], [createSpecialGems({ kind: 'lightningCol' }, 8, 0), dmgSplash('enemyChosen', 3, 1)]))" },
      8450: { imports: ['skill', 'dmg'], build: "skill(dmg('enemyChosen', 4, 1), dmg('lastTarget', 0, 0, { execute: true, chance: 0.2, ifCond: { kind: 'targetStatBeatsCaster', stat: 'attack' } }))" },
      7585: { imports: ['skill', 'dmg'], build: "skill(dmg('enemyRandom', 5, 1))" },
      8808: { imports: ['skill','oneOf','createSpecialGems2','explodeRandomGems'],
        build: "skill(oneOf([createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 4, 0)], [explodeRandomGems(1, 1, 'all')]))" },
      8805: { imports: ['skill', 'explodeChosenCol', 'createSpecialGems2'], build: "skill(explodeChosenCol(), createSpecialGems2([{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, sources: [{ kind: 'chosenColumnAtCastStart', color: BaseColor.Red }, { kind: 'chosenColumnAtCastStart', color: BaseColor.Brown }] } }))" },
      8988: { imports: ['skill', 'explodeChosenCol', 'createSpecialGems'], build: "skill(explodeChosenCol(), createSpecialGems({ kind: 'deathMarkGem' }, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, sources: [{ kind: 'chosenColumnAtCastStart', skulls: true }, { kind: 'chosenColumnAtCastStart', color: BaseColor.Purple }] } }))" },
      7285: { imports: ['skill', 'dmg', 'inflict'],
        build: "skill(dmg('enemyAll', 2, 0.5, { range: 'all' }), inflict('burning', 'enemyRandom'), inflict('disease', 'enemyRandomOther'))" },
      7567: { imports: ['skill', 'destroyRandomGems', 'transformTroop'],
        build: "skill(destroyRandomGems(1, 0.5, 'all'), transformTroop('enemyLast', 'BabyDragon', { fullMana: true }))" },
      7753: { imports: ['skill', 'dispelStatus', 'dmg', 'reduce'],
        build: "skill(...['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged'].map(id => dispelStatus(id, 'enemyAll')), dmg('enemyChosen', 5, 1), reduce('lastTarget', 'attack', 0, 0, { halve: true }))" },
      7129: { imports: ['skill', 'createSkulls', 'summonRef'],
        build: "skill(createSkulls(6), summonRef('Revenant', undefined))" },
      7192: { imports: ['skill', 'dmg'],
        build: "skill(dmg('enemyChosen', 4, 1, { condBonus: { n: 12, cond: { kind: 'targetStatBeatsCaster', stat: 'attack' } } }))" },
      7187: { imports: ['skill', 'createGems', 'cleanse', 'heal'], build: "skill(createGems(BaseColor.Red, 7, 0), cleanse('allyAll'), heal('allyRandom', 1, 1))" },
      8517: { imports: ['skill', 'oneOf', 'heal', 'createGems', 'extraTurn', 'explodeRandomGems'], build: "skill(oneOf([heal('allySelf', 1, 1), createGems(BaseColor.Red, 7, 0)], [heal('allySelf', 1, 1), extraTurn()], [heal('allySelf', 1, 1), explodeRandomGems(1, 0, 'all')]))" },
      8843: { imports: ['skill', 'createSpecialGems', 'extraTurn'], build: "skill(createSpecialGems({ kind: 'dragonGem', color: BaseColor.Blue }, 2, 0), createSpecialGems({ kind: 'dragonGem', color: BaseColor.Green }, 2, 0), createSpecialGems({ kind: 'dragonGem', color: BaseColor.Red }, 2, 0), createSpecialGems({ kind: 'dragonGem', color: BaseColor.Brown }, 2, 0), extraTurn())" },
      8947: { imports: ['skill', 'createSpecialGems', 'extraTurn'], build: "skill(createSpecialGems({ kind: 'web' }, 6, 0), extraTurn())" },
      8254: { imports: ['skill', 'dmgSplash', 'inflict', 'cleanse', 'explodeRandomGems'], build: "skill(dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }), inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }), cleanse('allyAll', undefined, { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }), explodeRandomGems(4, 0, 'all', undefined), explodeRandomGems(3, 0, 'all', undefined, { ifCond: { kind: 'targetHasDoom' } }))" },
      8255: { imports: ['skill', 'dmgSplash', 'inflict', 'cleanse', 'explodeRandomGems'], build: "skill(dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }), inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Green } }), cleanse('allyAll', undefined, { ifCond: { kind: 'targetColor', color: BaseColor.Green } }), explodeRandomGems(4, 0, 'all', undefined), explodeRandomGems(3, 0, 'all', undefined, { ifCond: { kind: 'targetHasDoom' } }))" },
      8256: { imports: ['skill', 'dmgSplash', 'inflict', 'cleanse', 'explodeRandomGems'], build: "skill(dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }), inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }), cleanse('allyAll', undefined, { ifCond: { kind: 'targetColor', color: BaseColor.Red } }), explodeRandomGems(4, 0, 'all', undefined), explodeRandomGems(3, 0, 'all', undefined, { ifCond: { kind: 'targetHasDoom' } }))" },
      8257: { imports: ['skill', 'dmgSplash', 'inflict', 'cleanse', 'explodeRandomGems'], build: "skill(dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }), inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }), cleanse('allyAll', undefined, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }), explodeRandomGems(4, 0, 'all', undefined), explodeRandomGems(3, 0, 'all', undefined, { ifCond: { kind: 'targetHasDoom' } }))" },
      8258: { imports: ['skill', 'dmgSplash', 'inflict', 'cleanse', 'explodeRandomGems'], build: "skill(dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }), inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }), cleanse('allyAll', undefined, { ifCond: { kind: 'targetColor', color: BaseColor.Purple } }), explodeRandomGems(4, 0, 'all', undefined), explodeRandomGems(3, 0, 'all', undefined, { ifCond: { kind: 'targetHasDoom' } }))" },
      8259: { imports: ['skill', 'dmgSplash', 'inflict', 'cleanse', 'explodeRandomGems'], build: "skill(dmgSplash('enemyChosen', 5, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'tempering' } } }), inflict('stun', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }), cleanse('allyAll', undefined, { ifCond: { kind: 'targetColor', color: BaseColor.Brown } }), explodeRandomGems(4, 0, 'all', undefined), explodeRandomGems(3, 0, 'all', undefined, { ifCond: { kind: 'targetHasDoom' } }))" },
      9985: { imports: ['skill', 'inflict', 'reduce'],
        build: "skill(inflict('silence', 'enemyChosen', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的拜布利奥斯' } }), reduce('enemyChosen', 'attack', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } }), reduce('lastTarget', 'magic', 4, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } }))" },
    }[sp.spellId];
    if (repaired) return { build: repaired.build, imports: new Set(repaired.imports),
      fidelity: 'full', features: [], skippedClauses: [] };
    let desc = sp.desc;
    // 0) EN-only 快照条目（2 把新武器半翻译）：zh 锚文本缺失 → 诚实 mana-only，待中文补全后回收
    if (/\b(Damage|Enemy|Enemies|Allies|Gems?|Mana|Life|Armor)\b/.test(desc)) {
      return { manaOnly: true, features: ['en-only-text'], skippedClauses: ['EN-only 快照（zh 法术文本缺失），待中文数据补全后回收'] };
    }
    // 1) 摘尾部 [xN]/[N:M] 增幅标签（gowhead 附注 = meta.modifier）
    let tag = null;
    const tm = /\s*\[((?:[xX×]\s*\d+)|\d+\s*:\s*\d+)\]\s*$/.exec(desc);
    if (tm) {
      const t = tm[1].replace(/\s/g, '');
      tag = t.includes(':')
        ? { kind: 'ratio', a: Number(t.split(':')[0]), b: Number(t.split(':')[1]) }
        : { kind: 'multiplier', a: Number(t.replace(/^[xX×]/, '')) };
      desc = desc.slice(0, tm.index).trimEnd();
    }
    // 2) 切子句（spell-rules §0.1：。/；/&&/换行）
    let clauses = desc.split(/。|；|&&|\n/).map((c) => c.trim()).filter(Boolean);
    // 宝石转换和生命增益是两个原始步骤；不能让前半句的转换处理器吞掉「并获得」。
    clauses = clauses.flatMap((c) => {
      const m = /^(将所有.+?宝石转换成.+?宝石)并(获得\s*\[魔法\s*\+\s*\d+\]\s*点生命值)$/.exec(c)
        || /^(将所有骷髅头转换成.+?骷髅头)[，,]?并(获得.+?点攻击力)$/.exec(c)
        || /^(再创造\s*\d+\s*颗.+?宝石)[，,]?并(爆破\s*\d+\s*颗宝石)$/.exec(c);
      return m ? [m[1], m[2]] : [c];
    });
    if (clauses.length === 0) return { manaOnly: true, features: [], skippedClauses: [] };
    const state = {
      segments: [], tag, tagUsed: false, skippedClauses: [], features: new Set(),
      lastCreate: null, lastChanceSeg: -1, lastAllyRace: null, buffRace: null, buffKingdom: null,
    };
    for (let raw of clauses) {
      // 子句归一：机翻噪声与连接词头（&&/然后/再/接着/并/同时/而且）——
      // 只剥离「句首」连接词，句中的交由 tryCompound 拆分；已知机翻错字定点修复
      raw = raw.replace(/^[\s,，。;；&]+/, '');
      raw = raw.replace(/^(?:然后|再|接着|同时|并|而且|且|随之|还)/, '').trim();
      raw = raw.replace(/^[\s,，。;；&]+/, '').trim();
      // 孤立噪声字符子句（7722 尾部「色」——MT 把「两种颜色」断句残留；非语义单元）
      if (/^[色、]$/.test(raw)) continue;
      if (raw === '') continue;
      const err = this.clause(raw, state);
      if (err) {
        if (process.env.WPOOL_TRACE === '1') console.log('[compileSkip]', raw, '| err:', err, '| segs:', state.segments.length);
        // 分保真度：卡点子句记省略（不硬编），可编译子句照常入 build
        state.skippedClauses.push(raw);
        classifyClause(raw, err, state.features);
      }
    }
    if (state.segments.length === 0) {
      return { manaOnly: true, features: [...state.features], skippedClauses: state.skippedClauses };
    }
    if (state.tag && !state.tagUsed) {
      // 尾部 [xN] 孤儿治理（第四轮口径维持）：归属子句被略去 → 不硬挂，记省略；
      // 淬炼增项自第五轮起为完整编译（tempering 来源修饰），不再产生「纯淬炼略去」特例
      if (state.skippedClauses.length > 0) {
        // partial：尾部标签的归属子句可能已略去 → 不硬挂，记省略
        state.skippedClauses.push(`尾部增幅标签 ${tagText(state.tag)}（归属子句已略去或无法可靠挂载）`);
        state.features.add('modifier-tag');
      } else {
        // §1 修饰段归属：未点名 → 挂最近数值段
        const idx = lastNumericSegment(state.segments);
        if (idx < 0) {
          state.skippedClauses.push(`尾部增幅标签 ${tagText(state.tag)}（无可靠挂载段）`);
          state.features.add('modifier-tag');
        } else {
          state.segments = withModifierAt(state.segments, idx, { mod: state.tag });
        }
      }
    }
    const fidelity = state.skippedClauses.length > 0 ? 'partial' : 'full';
    this.use('skill');
    return {
      build: `skill(\n${state.segments.map((s) => `      ${s}`).join(',\n')},\n    )`,
      imports: this.imports,
      fidelity,
      features: [...state.features],
      skippedClauses: state.skippedClauses,
    };
  }

  /**
   * 单个子句 → 段串。
   * 处理器契约：null = 本子句不属于该处理器（继续下一条）；'' = 已处理；其他字符串 = 错误原因。
   */
  clause(raw, state) {
    let c = raw.replace(/\s+/g, ' ').trim();
    // 淬炼增项（K-E 第五轮完整编译，推翻第四轮「参数化省略」）：「每锻炼 1 个武器段位则 +N
    // 点伤害值 / +N 颗宝石 / 每级回火 +N 点 / 每提升一级强化等级额外增加 N 点」＝tempering
    // 来源修饰（temperingBoost(N)），挂本子句（或最近）数值段——level 0 增项=0，随段位缩放；
    // 「(每个)回火等级有 N% 的几率杀死敌人」＝处决段 chanceBoost（+N 个百分点/段位）。
    const tFrag = c.match(/[,，]?\s*(?:每锻炼|每级回火|每提升一级强化|每个?回火等级)[^，。；]*/);
    let temperA = null;
    let temperChance = null;
    if (tFrag) {
      const aM = tFrag[0].match(/\+\s*(\d+)/);
      const cM = tFrag[0].match(/(\d+)\s*%\s*的几率杀死/);
      const eM = tFrag[0].match(/增加\s*(\d+)\s*点/);
      if (cM) temperChance = Number(cM[1]);
      else if (aM) temperA = Number(aM[1]);
      else if (eM) temperA = Number(eM[1]);
      c = c.replace(tFrag[0], '').replace(/[,，、]\s*$/, '').replace(/^\s*[,，、]/, '').trim();
    }
    // 句首连接词剥除（K-B3：移入 clause——parseSub 的条件 payload 不经 compile() 循环，
    // 「则还摧毁 2 个随机列」9484 类 payload 此前漏剥「还」）
    c = c.replace(/^[\s,，。;；&]+/, '');
    c = c.replace(/^(?:然后|再|接着|同时|并|而且|且|随之|还|额外|先|优先)/, '').trim();
    c = c.replace(/^[\s,，。;；&]+/, '').trim();
    // 机翻错字定点归一（gowhead zh 快照噪声；EN 侧核实为同义句）
    c = c.replace('反射教过', '反射效果');
    // K-B 收官轮机翻噪声定点归一：
    //  8529「使用对多的颜色」= most used（对→最）；9524/9525 尾部「 -{2}」= gowhead MT
    //  残渣（EN 原文无此段，剥除后方括号区间才能进 rangeSpec）；「使用了」=「使用」。
    c = c.replace(/对多/g, '最多');
    c = c.replace(/\s*-\s*\{\d+\}/g, '');
    c = c.replace('使用了', '使用');
    // 逗号后空格（机翻「， 则」式噪声）归一：8776 族——否则条件正则的 [，,]?(?:则) 断链
    c = c.replace(/([，,])\s+/g, '$1');
    // 机翻定点归一（2026-09-18 K-B3，EN 原文逐句核实为同义改写；zh 快照机翻丢失语义的三条）：
    // 8512「结果 [魔法+3] 给予一名敌人重击」= Deal [Magic+3] splash damage to an Enemy；
    // 8521「超级重击」= heavy splash damage；「摧毁N枚宝石的法力颜色之一」= Explode N Gems of
    // one of their Mana Colors（LAST_TARGET 通道）；「炸毁四枚宝石」cn 数词；8400「清空两个玛那」= Drain 2 Mana。
    c = c.replace(/^结果\s*(\[[^\]]*\])\s*给予一名敌人超级重击$/, '对一名敌人造成 $1 点严重的溅射伤害');
    c = c.replace(/^结果\s*(\[[^\]]*\])\s*给予一名敌人重击$/, '对一名敌人造成 $1 点溅射伤害');
    c = c.replace(/^摧毁(\d+)枚宝石的法力颜色之一$/, '爆破 $1 颗其法力颜色的宝石');
    c = c.replace(/^炸毁四枚宝石$/, '爆破 4 颗宝石');
    c = c.replace(/^从所有敌人中清空两个玛那$/, '耗掉所有敌人 2 点法力值');
    c = c.replace(/数二增强$/u, '数而增强'); // 8811「盟友数二增强」机翻（而→二）
    c = c.replace(/^在使其中毒$/, '使其中毒'); // 7194 机翻（EN "and either: Poison them OR…"，「在」为噪声）
    // 「如果/若 …，payload」缺「则」的补齐（7294/8076/9629 族）：只在首个逗号后无则/那么时插入
    if (/^(?:如果|若)/.test(c) && !/[，,](?:则|那么)/.test(c)) c = c.replace(/，/, '，则');
    // 纯淬炼子句（「每个回火等级有3%的几率杀死敌人」8726 独立句）：直接挂最近段
    if (c === '' && (temperA !== null || temperChance !== null)) {
      this.attachTempering(state, state.segments.length, temperA, temperChance, tFrag);
      return null;
    }
    const segsBefore = state.segments.length;
    for (const handler of [
      this.hPureCondMult, this.hKingdomCond, this.hIfPayload, this.hDamage, this.hStandaloneModifier, this.hStatus,
      this.hGemOps, this.hBuffHeal, this.hReduceDrain, this.hCleanseExtraTurn,
      this.hStormSummon, this.hRepositionMisc, this.hEconomy,
    ]) {
      const r = handler.call(this, c, state);
      if (r === null) continue;
      if (r === '') {
        this.attachTempering(state, segsBefore, temperA, temperChance, tFrag);
        return null;
      }
      // 定性原因（缺失状态/特殊宝石/王国/原语请求等）→ 整句记录一次，不做或拆碎片化
      if (/原语请求|缺失状态|特殊宝石家族|语义拿不准|无对应原语|译文异常|不属于该处理器/.test(r)) return r;
      // 处理器报错：若含复合拆分标记，先试拆分（拆分成功即修复；否则保留原错误）
      if (/，|并|或/.test(c)) {
        const splitErr = this.tryCompound(c, state);
        if (splitErr === null) {
          this.attachTempering(state, segsBefore, temperA, temperChance, tFrag);
          return null;
        }
      }
      return r;
    }
    // 全部处理器都不认领：尝试复合拆分
    if (/，|并|或/.test(c)) {
      const splitErr = this.tryCompound(c, state);
      if (splitErr === null) return null;
      return `无匹配规则`;
    }
    return '无匹配规则';
  }

  /** 复合拆分（，并/，然后/，再/，且/，同时/顶层或）→ 成功 null，失败错误串 */
  tryCompound(c, state) {
    const dbg = process.env.WPOOL_DEBUG === '1';
    // 「X 或 Y」= 掷签二选一（§9.3 裁定；8459 先例）；三支「X 或 Y 或 Z」（8253）= 三选一
    const orParts = [];
    {
      let rest = c;
      for (;;) {
        const ab = splitTopLevel(rest, '或');
        if (ab.length < 2) { orParts.push(rest.trim()); break; }
        orParts.push(ab[0]);
        rest = ab[1];
      }
    }
    // 分隔符残渣（「A，或B，或C」切出的 part 带「，」尾）——锚定正则会被绊住
    for (let i = 0; i < orParts.length; i++) orParts[i] = orParts[i].replace(/[，,、]+$/, '').trim();
    if (dbg) console.log('   [tryCompound]', JSON.stringify(c), 'or:', JSON.stringify(orParts));
    if (orParts.length >= 2) {
      const stash = [];
      const errs = [];
      for (const part of orParts) {
        const s = [];
        const err = this.clause(part, { ...state, segments: s });
        stash.push({ s, err });
        if (err) errs.push(err);
        else if (errs.length) break; // 前面已有失败支，不再编译后续支（走单侧回退）
      }
      if (errs.length === 0) {
        this.use('oneOf');
        state.segments.push(`oneOf(${stash.map((x) => `[${x.s.join(', ')}]`).join(', ')})`);
        return null;
      }
      if (orParts.length === 2) {
        // 单侧可编译 → 收下该侧，另一侧记省略（partial；一侧卡点不代表另一侧不可用）
        const [p1, p2] = orParts;
        const { s: s1, err: e1 } = stash[0];
        const { s: s2, err: e2 } = stash[1];
        if (!e1) {
          state.segments.push(...s1);
          this.recordSkip(p2, e2, state);
          return null;
        }
        if (!e2) {
          state.segments.push(...s2);
          this.recordSkip(p1, e1, state);
          return null;
        }
      }
      // 两侧都失败 → 落到下面的顺序拆分
    }
    for (const sp of [/^(.+?)，\s*(?:然后|再|并|且|同时)\s*(.+)$/, /^(.+?)，(.+)$/, /^(.+?)并(.+)$/]) {
      const m = sp.exec(c);
      const tail2 = (m?.[2] ?? '').trim();
      if (dbg) console.log('   [split]', String(sp), '->', m ? JSON.stringify([m[1], m[2]]) : 'no match');
      if (!m) continue;
      // 「移除所有C色宝石/骷髅头以增强(伤害)?效果」rider 不拆（挂前段修饰，7059/7124 口径）
      const enhanceRider = /^并?移除所有(?:((?:红|蓝|绿|黄|紫|棕)色宝石)|骷髅头)以(?:增强|强化)(?:此)?(?:伤害)?(?:效果效果|效果)$/.exec(tail2);
      if (dbg) console.log('   [enhanceRider]', JSON.stringify(m[2]), '->', enhanceRider ? JSON.stringify([enhanceRider[1], enhanceRider[2]]) : 'no');
      if (enhanceRider) {
        const e1 = this.clause(m[1], state);
        if (e1) return `增强 rider 主句：${e1}`;
        const idx = lastNumericSegment(state.segments);
        if (idx < 0) return '增强 rider 找不到挂载段';
        if (!state.tag) return '增强 rider 缺少尾部 [N:M] 标签';
        state.segments = withModifierAt(state.segments, idx, { mod: state.tag });
        state.tagUsed = true;
        if (m[2].includes('骷髅头')) {
          this.use('destroySkulls');
          state.segments.push('destroySkulls()');
        } else {
          this.use('destroyColor');
          state.segments.push(`destroyColor(BaseColor.${COLORS[enhanceRider[1].replace(/色?宝石$/, '')]})`);
        }
        return null;
      }
      const e1 = this.clause(m[1], state);
      const e2 = this.clause(m[2].trim(), state);
      if (dbg) console.log('   [e1]', JSON.stringify(m[1]), '->', e1 ?? 'OK', '| [e2]', JSON.stringify(m[2]), '->', e2 ?? 'OK');
      if (e1) { this.recordSkip(m[1], e1, state); }
      if (e2) { this.recordSkip(m[2], e2, state); }
      return null;
    }
    return '无法拆分';
  }

  /** 记省略子句并分类特征（分保真度核心） */
  recordSkip(text, err, state) {
    state.skippedClauses.push(text);
    classifyClause(text, err, state.features);
  }

  /**
   * 淬炼修饰挂载（K-E 第五轮）：temperA → modifier temperingBoost(N) 挂（本子句）最近数值段；
   * temperChance → 处决段 chanceBoost（无前置处决段则新建 execute 段，level 0 恒不触发）。
   * 挂载失败 → 记省略（tempering-scaling 特征），不硬凑。
   */
  attachTempering(state, segsBefore, temperA, temperChance, tFrag) {
    if (temperA !== null) {
      const idx = lastNumericSegment(state.segments, segsBefore);
      if (idx >= 0) {
        state.segments[idx] = appendOpt(state.segments[idx], `modifier: ${jsonMod({ mod: { kind: 'multiplier', a: temperA }, source: { kind: 'tempering' } })}`);
        return;
      }
      state.skippedClauses.push(tFrag[0].replace(/^[，,]\s*/, ''));
      classifyClause(tFrag[0], 'tempering 修饰找不到挂载段', state.features);
    }
    if (temperChance !== null) {
      const idx = lastKind(state.segments, /execute: true/);
      const boost = `chanceBoost: { mod: { kind: 'multiplier', a: ${temperChance} }, source: { kind: 'tempering' } }`;
      if (idx >= 0) {
        state.segments[idx] = appendOpt(state.segments[idx], boost);
        return;
      }
      this.use('dmg');
      state.segments.push(`dmg('lastTarget', 0, 0, { execute: true, ${boost} })`);
    }
  }

  /** 王国条件倍率（K-E 第五轮接线）：「若敌人来自X，或战斗发生在X，则造成 N 倍伤害」＝
   *  anyOf(targetKingdom X, kingdomPresent X) condMult；单独「若战斗发生在X」→ kingdomPresent。
   *  王国名用 zh 原文名（与 troops.json/CombatantSnapshot kingdom 字段同口径）。 */
  hKingdomCond(c, state) {
    // K-B 收官轮：尾段扩「则伤害翻倍」形（9111「若敌人来自午夜城市或战斗位于午夜城市，则伤害翻倍」——
    // 此前仅收「则造成 N 倍伤害」形，「则伤害翻倍」被 tryCompound 顶层「或」拆碎）
    let m = /^(?:如果|若)敌人来自([\u4e00-\u9fa5]+?)(?:，或战斗(?:发生在|位于)([\u4e00-\u9fa5]+?))?[，,]?(?:则造成\s*(双倍|三倍|\d+\s*倍)伤害|(?:则)?伤害(双倍|翻倍|三倍|\d+\s*倍))$/.exec(c);
    if (m) {
      const kg = normalizeGroupName(m[1]);
      const of = [{ kind: 'targetKingdom', kingdom: kref(kg) }]; // P-A-target-kingdom: the damaged target's kingdom
      if (m[2]) of.push({ kind: 'kingdomPresent', kingdom: normalizeGroupName(m[2]) });
      const cond = of.length === 1 ? of[0] : { kind: 'anyOf', of };
      const w = m[3] ?? m[4];
      const times = w === '双倍' || w === '翻倍' ? 2 : w === '三倍' ? 3 : Number(w.replace(/[^\d]/g, ''));
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '王国条件倍率找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, times, cond);
      return '';
    }
    m = /^(?:如果|若)?战斗(?:发生在|位于)([\u4e00-\u9fa5]+?)(?:王国)?[，,]?则造成\s*(双倍|三倍|\d+\s*倍)伤害$/.exec(c);
    if (m) {
      const times = m[2] === '双倍' ? 2 : m[2] === '三倍' ? 3 : Number(m[2].replace(/[^\d]/g, ''));
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '王国条件倍率找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, times, { kind: 'kingdomPresent', kingdom: normalizeGroupName(m[1]) });
      return '';
    }
    return null;
  }

  // —— 纯条件倍率子句（回挂最近伤害/数值段；8934 / batch-05 7059 系口径）——
  hPureCondMult(c, state) {
    let m = /^(?:如果|若)(?:现有|存在)(?:一个|一种)?([\u4e00-\u9fa5]?)风暴[，,]?(?:则)?(?:造成)?(?:伤害)?(?:双倍|翻倍)$/.exec(c);
    if (m) {
      const colorName = m[1] || null;
      const condSeg = colorName && STORM_COLORS[colorName]
        ? { kind: 'stormPresent', color: STORM_COLORS[colorName] }
        : { kind: 'stormPresent' };
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '伤害双倍条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, 2, condSeg);
      return '';
    }
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?造成\s*三倍伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '三倍伤害条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, 3, { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?造成\s*(\d+)\s*倍伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '倍率条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, Number(m[2]), { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?造成\s*双倍伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '双倍伤害条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, 2, { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    // 「如果对方攻击力大于自身，则造成多 N 点伤害 / N 倍伤害」= 反向属性比较（§13.2 仅支持正向）
    // K-B3：「…高于自身，则有 N% 的几率杀死对方」（8450）＝反向比较 + 处决几率，同族定性
    m = /^(?:如果|若)(?:敌人|对方)(?:的)?(生命值|攻击力|护甲值|魔力值)(?:值)?(?:高于|大于)自身[，,]?(?:则)?造成\s*(?:多\s*\d+\s*点|\d+\s*倍)伤害$/.exec(c)
      || /^(?:如果|若)(?:敌人|对方)(?:的)?(生命值|攻击力|护甲值|魔力值)(?:值)?(?:高于|大于)自身[，,]?(?:则)?有\s*\d+\s*%\s*的(?:几|机)率(?:直接)?(?:将其|把他)?(?:杀死|杀戮|击杀)(?:对方|敌人)?$/.exec(c);
    if (m) {
      return '反向属性比较（目标属性 > 施法者）无对应条件原语（spell-rules §13.2 仅正向）→ 原语请求：targetStatBeatsCaster';
    }
    m = /^(?:如果|若)(?:敌人是|敌人来自)([\u4e00-\u9fa5]+?)(?:族|生物)[，,]?(?:则)?造成\s*(\d+)\s*点额外伤害$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '额外伤害条件找不到前置伤害段';
      state.segments = withCondBonusAt(state.segments, idx, Number(m[2]), { kind: 'targetRace', race });
      return '';
    }
    // K-B 收官轮：条件加成扩形——
    //  a)「若敌人是X(族)，则(再)造成 N 点(额外)?伤害」= condBonus targetRace（7815 神祗）
    //  b)「如果敌人使用X色法力，则再添/再增加 N 点伤害」= condBonus targetColor（7815）
    m = /^(?:如果|若)(?:敌人是|敌人来自|目标是)([\u4e00-\u9fa5]+?)(?:族|生物|军队)?[，,]?(?:则)?再?造成\s*(\d+)\s*点(?:额外)?伤害$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '额外伤害条件找不到前置伤害段';
      // 引擎单 condBonus 通道：一段只容一条条件加成（7815 神祗+黄法力双条）——
      // 已占用时诚实略去第二条（不计 splitting，保住已挂载的第一条）
      if (/condBonus:/.test(state.segments[idx])) return '第二条 condBonus 无对应通道（单条件加成原语）→ 原语请求：condBonus 数组化';
      state.segments = withCondBonusAt(state.segments, idx, Number(m[2]), { kind: 'targetRace', race });
      return '';
    }
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?再(?:添|增加|添加)\s*(\d+)\s*点伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '敌色加成条件找不到前置伤害段';
      if (/condBonus:/.test(state.segments[idx])) return '第二条 condBonus 无对应通道（单条件加成原语）→ 原语请求：condBonus 数组化';
      state.segments = withCondBonusAt(state.segments, idx, Number(m[2]), { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    // 「若盟友使用红色法力值，则效果翻倍」→ 回挂最近 buff 段（7955 先例口径：目标相对条件）
    m = /^(?:如果|若)盟友使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?效果?翻倍$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /\b(heal|armor|attack|magic|mana|randomStat)\(/);
      if (idx < 0) return '效果翻倍条件找不到前置增益段';
      state.segments = withCondMultAt(state.segments, idx, 2, { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    m = /^(?:如果|若)(?:敌方有|敌人中有|敌人是)([\u4e00-\u9fa5]+?)(?:军队|部队|盟友)[，,]?(?:则)?(?:造成额外|额外造成|增加额外|增加)\s*(\d+)\s*点(?:真实)?伤害$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '额外伤害条件找不到前置伤害段';
      state.segments = withCondBonusAt(state.segments, idx, Number(m[2]), { kind: 'enemyRacePresent', race });
      return '';
    }
    // 「如果敌人已陷入X状态/已下潜，则造成双倍/N倍伤害」→ targetStatus 条件回挂
    // （2026-09-18 K-B3：动词可省（「已中毒」9687）、数值允许空格（「造成 3 倍」8186/9687）、翻倍。
    //   护栏：动词省略后须先过 matchStatus 再认领——否则会抢走「是X族」条件（7291））
    {
      const cc = c.replace('已下潜', '已陷入下潜');
      m = /^(?:如果|若)(?:敌人|对方|目标)已?(?:陷入|身中|被)?(.+?)(?:状态)?[，,]?(?:则)?造成\s*(双倍|翻倍|三倍|\d+\s*倍)伤害$/.exec(cc)
        // K-E：「若敌人陷入出血状态，则伤害翻倍」（8083，省「造成…伤害」宾语式）
        || /^(?:如果|若)(?:敌人|对方|目标)已?(?:陷入|身中|被)?(.+?)(?:状态)?[，,]?(?:则)?伤害(双倍|翻倍|三倍|\d+\s*倍)$/.exec(cc);
      if (m && matchStatus(m[1])) {
        const id = matchStatus(m[1]);
        const idx = lastKind(state.segments, /dmg/i);
        if (idx < 0) return '状态条件找不到前置伤害段';
        const w = m[2] === '双倍' || m[2] === '翻倍' ? 2 : m[2] === '三倍' ? 3 : Number(m[2].replace(/[^\d]/g, ''));
        state.segments = withCondMultAt(state.segments, idx, w, { kind: 'targetStatus', statusId: id });
        return '';
      }
    }
    m = /^(?:如果|若)(?:敌人|对方|目标)已?(?:陷入|身中|被)?(.+?)(?:状态)?[，,]?(?:则)?(?:增加|造成额外)\s*(\d+)\s*点伤害$/.exec(c);
    if (m && matchStatus(m[1])) {
      const id = matchStatus(m[1]);
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '状态条件找不到前置伤害段';
      state.segments = withCondBonusAt(state.segments, idx, Number(m[2]), { kind: 'targetStatus', statusId: id });
      return '';
    }
    // 「若任何一名敌人是X军队，则造成双倍伤害」→ condMult enemyRacePresent（全局条件回挂）
    m = /^(?:如果|若)任何(?:一名)?敌人是([\u4e00-\u9fa5]+?)(?:军队|族)[，,]?(?:则)?造成(双倍|三倍|\d+倍)伤害$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '种族倍率条件找不到前置伤害段';
      const times = m[2] === '双倍' ? 2 : m[2] === '三倍' ? 3 : Number(m[2].replace('倍', ''));
      state.segments = withCondMultAt(state.segments, idx, times, { kind: 'enemyRacePresent', race });
      return '';
    }
    // 「若自身的生命值受损，则<payload>」→ ifCond selfHpDamaged
    m = /^(?:如果|若)自身的?(生命值|护甲值)受损[，,]?则(.+)$/.exec(c);
    if (m) {
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `受损条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'selfHpDamaged' })));
      return '';
    }
    // 「如果敌人是X(族/军队)，造成 N/三 倍伤害」「若对方是一名元素军队则造成双倍伤害」→ condMult targetRace 回挂（batch-05/07 先例）
    // K-B 收官轮：主语补「目标」（7240「如果目标是妖仙，则造成三倍伤害」）
    m = /^(?:如果|若)(?:敌人|对方|目标)是一?名?([\u4e00-\u9fa5]+?)(?:族|军队|生物)?[，,]?(?:则)?造成(三|\d+|双)倍?伤害$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '种族倍率条件找不到前置伤害段';
      const times = m[2] === '三' ? 3 : m[2] === '双' ? 2 : Number(m[2]);
      state.segments = withCondMultAt(state.segments, idx, times, { kind: 'targetRace', race });
      return '';
    }
    // 「如果伤害目标是X族，则造成双倍伤害」→ condMult targetRace 回挂
    m = /^(?:如果|若)伤害目标是([\u4e00-\u9fa5]+?)(?:族|军队)?[，,]?则?造成双倍伤害$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '种族倍率条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, 2, { kind: 'targetRace', race });
      return '';
    }
    // 「如果/若现有/存在(一个)X风暴，则<payload>」→ ifCond stormPresent（8153「若存在一个风暴」）
    m = /^(?:如果|若)(?:现有|存在|有)(?:一个|一场|一种)?([\u4e00-\u9fa5]?)风暴[，,]?则(.+)$/.exec(c);
    if (m) {
      const colorName = m[1] || null;
      const condSeg = colorName && STORM_COLORS[colorName]
        ? { kind: 'stormPresent', color: STORM_COLORS[colorName] }
        : { kind: 'stormPresent' };
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `风暴条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, condSeg)));
      return '';
    }
    // 「如果敌方有X(军队)?，则<payload>」→ ifCond enemyRacePresent（§ enemyRacePresent 全局条件；
    //   7955「若敌方有魔头」无群体后缀 → 后缀可选）
    m = /^(?:如果|若)敌方有([\u4e00-\u9fa5]+?)(?:军队|部队|盟友)?[，,]?则(.+)$/.exec(c);
    if (m && RACE_ALIAS[m[1]]) {
      const race = RACE_ALIAS[m[1]];
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌方种族条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'enemyRacePresent', race })));
      return '';
    }
    // 「如果敌人/对方/他们已陷入/已带有X状态，则<payload>」→ ifCond anyEnemyStatus（全局聚合，§9.7；
    //   动词可省略——「已中毒」7380 族；K-B3：主语扩 对方/目标/他们——8952「若对方陷入猎人标记」8508。
    //   护栏：先过 matchStatus 再认领，非状态条件（「是X族」）交回后续规则）
    m = /^(?:如果|若)(?:敌人|对方|目标|他们)已?(?:陷入|身中|被|带有|拥有)?(.+?)(?:状态|效果)?[，,]?(?:则|那么)(.+)$/.exec(c);
    if (m && !/(末日|厄运|劫数|毁灭之力)/.test(m[1]) && matchStatus(m[1])) {
      const id = matchStatus(m[1]);
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌人状态条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'anyEnemyStatus', statusId: id })));
      return '';
    }
    return null;
  }

  // —— 「若<全局条件>，则<payload>」/「如果该敌人身亡，则X」（§4 / §9 / R5）——
  hIfPayload(c, state) {
    let m = /^(?:如果|若)(?:该)?敌人(?:身亡|死亡)[，,]?则(.+)$/.exec(c);
    if (m) {
      const stash = this.parseSub(m[1], state);
      if (typeof stash === 'string') return `身亡条件 payload：${stash}`;
      const bad = stash.find((s) => Compiler.NO_OPTS_RE.test(s));
      if (bad) return `条件子句内含不支持 opts 的段（${(bad.match(/^w+/) ?? ['?'])[0]}）→ 原语请求：条件化清除/净化段`;
      state.segments.push(...stash.map(withIfTargetDied));
      return '';
    }
    // 「如果敌人/敌方(拥有|带有|有)劫数/末日/厄运/毁灭之力，则X」＝敌方劫数条件（K-E 第五轮接线，
    // enemyHasDoom()=targetHasDoom，敌方存活者 troopTypes 含 Doom）。结论子句三形态：
    //  a)「再增加/再给予 N 点…」＝condBonus 挂前段（7655/7982 官方形态「…give 5 more」）；
    //  b)「可造成双倍/三倍/N 倍伤害」＝condMult 挂前伤害段（8726/8727/8728）；
    //  c) 其余 → parseSub + ifCond（「则再创造 5 颗」7952 走 lastCreate 复用、「恢复我四分之一的法力值」9580）。
    m = /^(?:如果|若)(?:敌方|敌人|对方|目标|他们)(?:拥有|带有|有|身上有)(?:一个)?(?:末日|厄运|劫数|毁灭之力)(?:效果|标记)?[，,]?(?:则|那么)?(.*)$/.exec(c);
    if (m) {
      const cond = { kind: 'targetHasDoom' };
      const payload = (m[1] ?? '').trim();
      const more = payload.match(/^(?:再|额外)?(?:增加|给予)\s*(\d+)\s*点/);
      if (more) {
        const idx = lastNumericSegment(state.segments);
        if (idx < 0) return '劫数条件加成找不到前置数值段';
        state.segments = withCondBonusAt(state.segments, idx, Number(more[1]), cond);
        return '';
      }
      const mult = payload.match(/^可?造成\s*(双倍|三倍|\d+\s*倍)伤害$/);
      if (mult) {
        const idx = lastKind(state.segments, /dmg/i);
        if (idx < 0) return '劫数条件倍率找不到前置伤害段';
        const times = mult[1] === '双倍' ? 2 : mult[1] === '三倍' ? 3 : Number(mult[1].replace(/[^\d]/g, ''));
        state.segments = withCondMultAt(state.segments, idx, times, cond);
        return '';
      }
      if (payload === '') return '「敌方拥有劫数」条件缺少结论子句';
      const stash = this.parseSub(payload, state);
      if (typeof stash === 'string') return `劫数条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, cond)));
      return '';
    }
    // 「如果(有)一名/N名敌人死亡/身亡/阵亡，则X」＝anyEnemyDied（K-B 收官轮接线）：
    // EN 原文考证（7117/7861/8075/8076/9629/9903）均为「If an Enemy dies, …」＝本咒语
    // 执行中任一敌人被击杀——与部队批 R22 已落地的 anyTrackedDied 同口径（9986/9812/7747
    // 「若有敌人死亡」先例，读本次施放跨段追踪 allTargets），builders.anyEnemyDied() 专名形态。
    // 无量词裸形（「如果敌人身亡，则X」）仍走上方 ifTargetDied（追踪主目标）规则。
    m = /^(?:如果|若)(?:有)?\s*(?:一名|一个|\d+\s*[名个])?\s*(?:敌人|敌方(?:军队|部队)?)(?:身亡|死亡|阵亡)[，,]?(?:则|那么)?(.*)$/.exec(c);
    if (m && /(一名|一个|\d+\s*[名个]|有)/.test(m[0].replace(/^(?:如果|若)/, ''))) {
      const payload = (m[1] ?? '').trim();
      if (payload === '') return '「任一敌人死亡」条件缺少结论子句';
      const stash = this.parseSub(payload, state);
      if (typeof stash === 'string') return `anyEnemyDied 条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'anyTrackedDied' })));
      return '';
    }
    // 「若有(己方)?X(族)盟友，则X」→ ifCond allyRacePresent（8409）
    m = /^(?:如果|若)(?:己方)?有([\u4e00-\u9fa5]+?)(?:族|军队|生物)?盟友[，,]?(?:则|那么)(.+)$/.exec(c);
    if (m && !/队伍/.test(c)) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `盟友种族条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'allyRacePresent', race })));
      return '';
    }
    // 「没有一名X(族)敌人(，)?(则)?X」→ not(enemyRacePresent)（8396）
    m = /^没有一名(.+?)(?:族|军队)?敌人[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `种族否定条件 payload：${stash}`;
      const cond = { kind: 'not', cond: { kind: 'enemyRacePresent', race } };
      state.segments.push(...stash.map((s) => withIfCond(s, cond)));
      return '';
    }
    // 「如果(敌人|目标|他们)使用(色)法力(值)?，则X」→ ifCond targetColor（目标相对过滤；9825/9580 族）
    m = /^(?:如果|若)(?:敌人|对方|目标|他们)(?:使用|用的是)(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m) {
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌色条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'targetColor', color: COLORS[m[1]] })));
      return '';
    }
    // 「若自身已有/陷入/身中X(效果|状态)，则X」→ ifCond selfStatus（8842；「若自身陷入燃烧」8761）
    m = /^(?:如果|若)自身(?:已有|陷入|身中|带有)(.+?)(?:状态|效果)[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      if (!id) return `状态词无法识别「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `自身状态条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'selfStatus', statusId: id })));
      return '';
    }
    // 「如果敌人是X(族)，则X」→ ifCond targetRace（目标相对过滤；「是个魔头」7754、「敌军是一名魔头」7803）
    // K-B3：族后缀可省（魔头裸词），m[1] 禁跨 则/，（否则懒匹配截出单字「不」8395）
    m = /^(?:如果|若)(?:敌人|敌军|对方|目标)是一?[个名]?([^，,则]+)(?:族|军队|生物)?[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m && !/造成(双倍|三倍|\d+倍)伤害/.test(c)) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌族条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'targetRace', race })));
      return '';
    }
    m = /^(?:如果|若)(?:板面上有|有|存在)?\s*(\d+)\s*颗?\s*或更多(?:的)?颗?(红|蓝|绿|黄|紫|棕)色?宝石[，,]?则(.+)$/.exec(c);
    if (m) {
      const stash = this.parseSub(m[3], state);
      if (typeof stash === 'string') return `宝石数量条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'boardAtLeast', color: COLORS[m[2]], n: Number(m[1]) })));
      return '';
    }
    m = /^(?:如果|若)(?:自身)?(生命值|攻击力|护甲值|魔力值)(?:值)?高于敌人[，,]?则(.+)$/.exec(c);
    if (m) {
      const statMap = { 生命值: 'hp', 攻击力: 'attack', 护甲值: 'armor', 魔力值: 'magic' };
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `属性比较条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'casterStatBeatsTarget', stat: statMap[m[1]] })));
      return '';
    }
    // 「如果盟友来自X(王国)，则为他们提供<payload>」＝盟友王国限定（K-E 第五轮接线）：
    // payload 段挂 targetKingdom 过滤（8971 白盔国屏障；段级 SegmentOpts.targetKingdom）
    m = /^(?:如果|若)(?:盟友|所有盟友|一名盟友)来自([^，,则]+)(?:王国)?[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m && isKingdomGroup(m[1])) {
      const kg = normalizeGroupName(m[1]);
      const pm = m[2].match(/^为他们提供(.+?)(?:状态|效果)?$/);
      if (pm) {
        const id = matchStatus(pm[1]);
        if (!id) return `盟友王国条件 payload 状态词无法识别「${pm[1]}」`;
        this.use('inflict');
        state.segments.push(`inflict('${id}', 'allyAll', { targetKingdom: ${krefCode(kg)} })`);
        return '';
      }
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `盟友王国条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => appendOpt(s, `targetKingdom: ${krefCode(kg)}`)));
      return '';
    }
    // 「若自身队伍中有X / 若队伍里有永生神X / 如果我的队伍中有X，则<payload>」→ troopPresent（§11.5）
    // K-B3：量词补「内」（9378「队伍内」）、主语补「我方」（9720）
    // 「则」必须显式存在：懒匹配 m[1] 依赖它锚定兵种名边界
    m = /^(?:如果|若)(?:自身)?(?:我方|我)?的?队伍(?:里|中|内)?有(?:一名)?(.+?)[，,]?(?:则|那么)(.+)$/.exec(c)
      // 「若X在(自己的)队伍内，则<payload>」（9378 永生神天界，主语后置语序）
      || /^(?:如果|若)(.+?)在(?:自己)?(?:的)?队伍(?:里|中|内)[，,]?(?:则|那么)(.+)$/.exec(c);
    if (m) {
      const name = this.resolveTroopName(m[1]);
      if (!name) return `条件兵种引用无法解析「${m[1]}」（troops.json 无此中文名）`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `兵种在场条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'troopPresent', side: 'ally', name })));
      return '';
    }
    return null;
  }

  /** 不可携带 opts 的段族（无 opts 形参，条件挂载会错位）。
   *  K-B 收官轮：destroyColor/explodeColor/destroySkulls/explodeSkulls/destroySpecialGems/
   *  explodeSpecialGems 已补 opts 形参（条件化清除族 7286/7955/9381/9486/9809/9983）→ 移出本表。 */
  static NO_OPTS_RE = /^(destroyChosenRow|destroyChosenCol|explodeChosenRow|explodeChosenCol|oneOf|cleanse)\(/;

  /** 解析条件 payload（复用规则表到临时段数组）。支持「则再创造/制造 N 颗」复用上一创造目标。 */
  parseSub(text, state) {
    const stash = [];
    const tmp = { ...state, segments: stash };
    let t = (text ?? '').trim().replace(/^(?:则|那么)/, '').trim();
    // 「则再制造 4 颗」= 按上一创造目标再造 N 颗（9647/9488 族；条件挂载由调用方 withIfCond 完成）
    const rep = t.match(/^再?(?:创造|制造|制作|创建)\s*(\d+)\s*颗?$/);
    if (rep) {
      if (!state.lastCreate) return `「${t}」缺少可复用的创造目标（同族前句未编译）`;
      const call = createGemCall(this, state.lastCreate.what, Number(rep[1]), null, true);
      if (call.err) return call.err;
      if (state.tag) state.tagUsed = true; // 尾部 [xN] 即 gowhead 对「再造 N 颗」的编码，不再另挂
      return [call.seg];
    }
    const subs = t.split(/，|,|再|并/).map((s) => s.trim()).filter(Boolean);
    for (const sub of subs) {
      const err = this.clause(sub, tmp);
      if (err) return err;
    }
    // 条件挂载护栏：清除/净化/原始段不支持 opts 挂载（诚实 SKIP，不硬凑）
    for (const s of stash) {
      if (Compiler.NO_OPTS_RE.test(s) || s.startsWith('{')) {
        return `条件子句内含不支持 opts 挂载的段（${s.slice(0, 30)}…）→ 原语请求：条件化清除段/条件化原始段`;
      }
    }
    return stash;
  }

  // —— 伤害主句（含同子句 rider）——
  hDamage(c, state) {
    // Official 2.0 rule: Mana Burn uses current Mana but never drains it.
    // Native 7412 SpellPowerMultiplier=1 adds caster Magic (no second boost channel).
    {
      const mb = /^对\s*(?:1 名|一名|一个)敌人施放法力灼烧(?:[，,]\s*(.+))?$/.exec(c);
      if (mb) {
        const rest = (mb[1] ?? '').trim();
        if (rest !== '' && !/^伤害值因自身魔[力法]值而增强$/.test(rest)) return 'Unsupported ManaBurn rider';
        this.use('dmg');
        state.segments.push("dmg('enemyChosen', 0, 1, { manaBurn: true })");
        state.lastTargetMode = 'enemyChosen';
        return '';
      }
    }
    const heads = [
      { re: /^对前\s*(\d+)\s*[位名个]敌人/, t: (m) => ({ mode: 'enemyFirstN', n: Number(m[1]) }) },
      { re: /^对首\s*(\d+)\s*[位名个]敌人/, t: (m) => ({ mode: 'enemyFirstN', n: Number(m[1]) }) },
      // 「对首位 2 名敌人」（gowhead 数词混用：首位=前 N 名）
      { re: /^对首(?:位)?\s*(\d+)\s*[名位个]敌人/, t: (m) => ({ mode: 'enemyFirstN', n: Number(m[1]) }) },
      { re: /^对(?:第\s*[一1]\s*名|第一名|第\s*1\s*[名位个]|第一位的?|首位|首名)的?敌人/, t: () => ({ mode: 'enemyFront' }) },
      { re: /^对最虚弱的敌人/, t: () => ({ mode: 'enemyWeakest' }) },
      { re: /^对第一名和最后一名敌人/, t: () => ({ mode: 'enemyFront', also: 'enemyLast' }) },
      // 「对首位和末位敌人」（首末双点，8702 族）
      { re: /^对首位和末位(?:的)?敌人/, t: () => ({ mode: 'enemyFront', also: 'enemyLast' }) },
      { re: /^对最强大的敌人|^对最强悍的敌人/, t: () => ({ mode: 'enemyHealthiest' }) },
      { re: /^对最健康的敌人/, t: () => ({ mode: 'enemyHealthiest' }) },
      { re: /^对最后(?:一名|一个|一位|的|\s*1\s*[名个]|两[名个])敌人|^对最末位的敌人|^对末(?:位|名|端)的?敌人/, t: () => ({ mode: 'enemyLast' }) },
      { re: /^对最后\s*(\d+)\s*[位名个]敌人/, t: (m) => ({ mode: 'enemyLastN', n: Number(m[1]) }) },
      { re: /^对(?:前|首)两[名位个]敌人/, t: () => ({ mode: 'enemyFirstN', n: 2 }) },
      { re: /^对最虚弱的两名敌人/, t: () => ({ mode: 'enemyWeakestN', n: 2 }) },
      { re: /^对最虚弱的\s*(\d+)\s*名敌人/, t: (m) => ({ mode: 'enemyWeakestN', n: Number(m[1]) }) },
      { re: /^对最健康的\s*(\d+)\s*名敌人/, t: (m) => ({ mode: 'enemyHealthiestN', n: Number(m[1]) }) },
      { re: /^对两?名最强大的敌人/, t: () => ({ mode: 'enemyHealthiestN', n: 2 }) },
      { re: /^对(?:前|首)两名敌人/, t: () => ({ mode: 'enemyFirstN', n: 2 }) },
      // 「对所有紫色敌人造成…」＝色限定全体 → ifCond targetColor 过滤（第三轮新原语用法）
      { re: /^对所有(红|蓝|绿|黄|紫|棕)色?敌人/, t: (m) => ({ mode: 'enemyAll', colorCond: COLORS[m[1]] }) },
      { re: /^对所有敌人|^对全体敌人/, t: () => ({ mode: 'enemyAll' }) },
      { re: /^对(?:另)?一名随机敌人|^对随机(?:的)?一名敌人|^对\s*1\s*[名个]\s*随机的?敌人/, t: () => ({ mode: 'enemyRandom' }) },
      { re: /^对(?:另)?\s*(\d+)\s*[名个]\s*随机(?:的)?敌人/, t: (m) => ({ mode: 'enemyRandomN', n: Number(m[1]) }) },
      { re: /^对\s*(\d+)\s*[名个]\s*的?随机敌人/, t: (m) => ({ mode: 'enemyRandomN', n: Number(m[1]) }) },
      { re: /^对(?:一名|一个)?随机的?敌人/, t: () => ({ mode: 'enemyRandom' }) },
      { re: /^对敌人造成l\s/, t: () => ({ mode: 'enemyChosen', typo: true }) },
      // 「对其下方的所有敌人」须先于代词头（否则「对其」截断）；「对一名敌人和其下方的敌人」8154
      { re: /^对其下方的所有敌人/, t: () => ({ mode: 'enemyChosenAndBelow' }) },
      { re: /^对一名敌人和其下方的?敌人/, t: () => ({ mode: 'enemyChosenAndBelow' }) },
      // 「对其/对他/对她造成…」＝跨段回指（§12.3 lastTarget）
      { re: /^对(?:其|他|她|该敌人|此敌人)(?!下方)/, t: () => ({ mode: 'lastTarget' }) },

      { re: /^对(?:一名|一个|\s*1\s*[名个]|1名|1个|第?\s*1\s*名)?(?:随机的?|一个随机的?)?敌人|^对敌人|^对指定的敌人/, t: () => ({ mode: 'enemyChosen' }) },
    ];
    // 「对一名敌人和一名(随机)?敌人造成 X」→ 指定+随机 各一段（9825 族；机翻省略「另」）
    const mDual = /^(?:对一名敌人和(?:另)?一名随机敌人|对一名敌人和一名敌人|对 1 名敌人和另 1 名随机敌人)造成(.+)$/.exec(c);
    if (mDual) {
      const tail = parseDamageTail(mDual[1]);
      if (!tail) return `数值公式无法解析「${mDual[1]}」`;
      this.use('dmg');
      const optStr = tail.optStr();
      state.segments.push(`dmg('enemyChosen', ${tail.base}, ${tail.mult}${optStr})`, `dmg('enemyRandom', ${tail.base}, ${tail.mult}${optStr})`);
      state.lastTargetMode = 'enemyRandom';
      return '';
    }
    // —— 选定色（CHOSEN）目标族（K-B 收官轮）——
    // 7862「对使用所选定法力宝石颜色的每一名敌人造成 [M+1] 点伤害，并使其陷入燃烧状态」：
    // 选定法力宝石 → 运行时选色（CHOSEN），伤害与状态都只作用于该色敌人（ifCond targetColor CHOSEN）
    let mc = /^(?:对)?使用(?:所)?选定(?:法力宝石)?颜色的每一名敌人造成(.+?)点伤害[，,]?并?使其?陷入(.+?)(?:状态|效果)?$/.exec(c);
    if (mc) {
      const f = parseFormulaPrefix(mc[1].trim());
      if (!f || f.rangeSpec) return `选定色伤害数值无法解析「${mc[1]}」`;
      const id = matchStatus(mc[2]);
      if (!id) return `状态词无法识别「${mc[2]}」`;
      this.use('dmg', 'inflict');
      state.segments.push(
        `dmg('enemyAll', ${f.base}, ${f.mult}, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } })`,
        `inflict('${id}', 'enemyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } })`,
      );
      state.lastTargetMode = 'enemyAll';
      return '';
    }
    // 8152「对所有使用此颜色的敌人造成 [魔法 + 1] 点伤害」＝同族（伤害单段）
    mc = /^对所有使用(?:此|该|所选定(?:法力宝石)?)颜色的?敌人造成(.+)$/.exec(c);
    if (mc) {
      const tail = parseDamageTail(mc[1]);
      if (!tail || tail.rest !== '') return `选定色伤害句无法解析「${mc[1]}」`;
      this.use('dmg');
      state.segments.push(`dmg('enemyAll', ${tail.base}, ${tail.mult}, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } })`);
      state.lastTargetMode = 'enemyAll';
      return '';
    }
    let head = null;
    let rest = c;
    for (const h of heads) {
      const m = h.re.exec(c);
      if (m) {
        head = h.t(m);
        rest = c.slice(m[0].length);
        break;
      }
    }
    // 「使最强和最弱的敌人陷入 X 状态」→ 双段（最高/最低生命各一）
    let m = /^使最强和最弱的敌人陷入(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      if (!id) return `状态词无法识别「${m[1]}」`;
      this.use('inflict');
      state.segments.push(`inflict('${id}', 'enemyHealthiest')`, `inflict('${id}', 'enemyWeakest')`);
      return '';
    }
    if (/等同于其/.test(c)) return '「等同于其攻击力的伤害」基数取目标属性无对应原语 → 原语请求：dmg base = targetStat';
    if (!head) {
      // 裸伤害句式（无目标词）＝ spell-rules §0 双轨（2026-09-18 官方 SpellSteps 重裁）：
      // 裸散射 = enemyAll + range:'all' 全体散射；裸非散射 = enemyChosen 单敌。
      if (/^(?:额外)?造成?\s*[[\d（(]/.test(c)) head = { mode: 'enemyChosen', bare: true };
      else return null; // 非伤害句
    }
    rest = rest.replace(/^(?:额外)?造成l?\s*/, '').trim();
    const parsed = parseDamageTail(rest);
    if (!parsed) {
      // 尾段非数值伤害（「造成流血效果」9647 族）→ 放行给状态处理器
      if (!/伤害|溅射|散射|真实/.test(rest)) return null;
      return '数值公式无法解析';
    }
    const dtype = parsed.dtype;
    // 裸散射句式重裁（2026-09-18 官方 SpellSteps）：无目标词 + 散射 = enemyAll 全体散射
    if (head.bare && /散射/.test(dtype)) head = { ...head, mode: 'enemyAll' };
    // 同子句 rider：，并移除所有C色宝石以增强伤害效果 → 清除段先行（batch-05 7059 先例）
    let destroyColorBefore = parsed.riderColor ?? null;
    // 同子句 rider：，并移除所有该军队法力颜色的宝石来强化此效果 → destroyColor(CASTER)
    if (!destroyColorBefore && parsed.riderSelfColor) destroyColorBefore = 'CASTER';
    let rest2 = parsed.rest;
    // 同子句 rider：，同时每摧毁一颗C色宝石则增加 N 点伤害 → modifier（7178）
    const perDestroy = /(?:，|,)?(?:同时|并且)?每摧毁一颗(红|蓝|绿|黄|紫|棕)色?宝石则增加\s*(\d+)\s*点伤害$/.exec(rest2);
    let perDestroyMod = null;
    if (perDestroy) {
      perDestroyMod = { mod: { kind: 'multiplier', a: Number(perDestroy[2]) }, source: { kind: 'destroyedGems', color: COLORS[perDestroy[1]] } };
      rest2 = rest2.slice(0, perDestroy.index).trim();
    }
    // 同子句 rider：，并窃取其半数攻击力（7805：steal halve 跨段回指）
    // K-B 收官轮：「并使其攻击力减半」= reduce halve（EN "halve their Attack"——无自得不叫窃取，7753）
    let halveStealStat = null;
    let halveIsSteal = false;
    const halveSteal = /(?:，|,)?并?(?:窃取其?半数|使其?半数)(攻击力|护甲值|魔力值|法力值)$/.exec(rest2)
      || /(?:，|,)?并?使其?(攻击力|护甲值|魔力值|法力值)减半$/.exec(rest2);
    if (halveSteal) {
      halveStealStat = statOf(halveSteal[1]);
      halveIsSteal = /窃取/.test(halveSteal[0]);
      rest2 = rest2.slice(0, halveSteal.index).trim();
    }
    // 同子句 rider：，并随机窃取 N 点能力值/随机技能值（7240）= stealRandomStat（R12 random 通道）
    let randStealN = null;
    const randSteal = /(?:，|,)?并?随机窃取\s*(\d+)\s*点(?:能力值|随机技能值)$/.exec(rest2);
    if (randSteal) {
      randStealN = Number(randSteal[1]);
      rest2 = rest2.slice(0, randSteal.index).trim();
    }
    // 同子句 rider：，伤害值因X而增强/加强（tag 缺省按 [1:1]，7059 系先例）；来源不可解析 → 增项略去（partial 化）
    // K-B3：机翻词序归一（「而加强」「由X激发」「受到X的加成」——8052/8398/9876 族；EN 原文均为 boosted by）
    const modTailNorm = rest2
      .replace('受到', '受')
      .replace(/而加强$/u, '而增强')
      .replace(/而增加$/u, '而增强')
      .replace(/而激发$/u, '而增强')
      .replace(/而加成$/u, '而增强')
      .replace(/而提升$/u, '而增强')
      .replace(/加强$/u, '增强')
      .replace(/激发$/u, '增强')
      .replace(/加成$/u, '增强');
    let modifier = null;
    const modm = /(?:，|,)?(?:伤害值|伤害力|伤害|数值|点数|效果)?并?(?:只)?(?:因|由|受)(.+?)而?增强$/.exec(modTailNorm);
    if (modm) {
      const src = parseModifierSource(modm[1]);
      if (!src) {
        state.skippedClauses.push(rest2.slice(modm.index).replace(/^[，,]/, ''));
        classifyClause(rest2.slice(modm.index), '修饰来源无法解析', state.features);
        rest2 = modTailNorm.slice(0, modm.index).trim();
      } else {
        modifier = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
        if (state.tag) state.tagUsed = true;
        rest2 = modTailNorm.slice(0, modm.index).trim();
      }
    }
    // 同子句 rider：，有 N% 的几率(直接)杀死/杀戮(其|敌人)? → 追加一段 execute+chance（8664/7380 族）
    const killRider = /(?:，|,)?有\s*(\d+)\s*%\s*的(?:几|机)率(?:直接)?(?:将其|把他)?(?:杀死|杀戮|击杀)(?:对方|敌人)?$/.exec(rest2);
    let killChance = null;
    if (killRider) {
      killChance = Number(killRider[1]) / 100;
      rest2 = rest2.slice(0, killRider.index).trim();
    }
    const tail = rest2.replace(/^[，,、和及]/, '').trim();
    if (tail !== '') return `伤害句残留无法解析「${tail}」`;

    const segs = [];
    if (destroyColorBefore) {
      this.use('destroyColor');
      segs.push(destroyColorBefore === 'CASTER' ? 'destroyColor(CASTER)' : `destroyColor(${colorRef(destroyColorBefore)})`);
    }
    const dmgAllFlag = head.mode === 'enemyAll';
    this.use('dmg', 'dmgAll', 'dmgSplash', 'trueDmg', 'scale', 'flat');
    const optParts = [];
    if (!dmgAllFlag && /溅射|散射/.test(dtype)) optParts.push(`range: 'splash'`);
    if (/真实/.test(dtype)) optParts.push(`trueDamage: true`);
    if (head.n !== undefined) optParts.push(`n: ${head.n}`);
    if (head.colorCond) optParts.push(`ifCond: { kind: 'targetColor', color: BaseColor.${head.colorCond} }`);
    if (modifier) optParts.push(`modifier: ${jsonMod(modifier)}`);
    const o = optParts.length ? `, { ${optParts.join(', ')} }` : '';
    let call;
    if (parsed.rangeSpec) {
      call = `dmg(${targetRef(head.mode)}, 0, 0, { rangeSpec: { min: ${parsed.rangeSpec.min}, max: ${parsed.rangeSpec.max} }${optParts.length ? ', ' + optParts.join(', ') : ''} })`;
    } else if (dmgAllFlag) {
      call = `dmg('enemyAll', ${parsed.base}, ${parsed.mult}, { range: 'all'${optParts.length ? ', ' + optParts.join(', ') : ''} })`;
    } else {
      let fn = 'dmg';
      if (/溅射|散射/.test(dtype)) fn = 'dmgSplash';
      else if (/真实/.test(dtype)) fn = 'trueDmg';
      call = `${fn}(${targetRef(head.mode)}, ${parsed.base}, ${parsed.mult}${o})`;
    }
    if (perDestroyMod) {
      if (state.tag) { perDestroyMod.mod = state.tag; state.tagUsed = true; }
      call = appendOpt(call, `modifier: ${jsonMod(perDestroyMod)}`);
      segs[segs.length - 1] = call;
    }
    if (head.also) segs.push(call.replace(targetRef(head.mode), `'${head.also}'`));
    segs.push(call);
    state.segments.push(...segs);
    if (killChance !== null) {
      // execute 段：伤害额=目标当前耐久，仅按几率掷签；目标=上一段主目标（lastTarget）
      const kOpts = [`chance: ${killChance}`];
      state.segments.push(`dmg('lastTarget', 0, 0, { execute: true, ${kOpts.join(', ')} })`);
      state.lastChanceSeg = state.segments.length - 1;
    }
    if (halveStealStat) {
      if (halveIsSteal) {
        this.use('steal');
        state.segments.push(`steal('${refTargetOf(state)}', '${halveStealStat}', '${halveStealStat}', 0, 0, { halve: true })`);
      } else {
        this.use('reduce');
        state.segments.push(`reduce('${refTargetOf(state)}', '${halveStealStat}', 0, 0, { halve: true })`);
      }
    }
    if (randStealN !== null) {
      this.use('stealRandomStat');
      state.segments.push(`stealRandomStat('${refTargetOf(state)}', ${randStealN}, 0)`);
    }
    state.lastTargetMode = head.mode;
    return '';
  }

  /** 独立修饰子句：「伤害值因X而增强。」（独立句，非同句 rider）→ 挂最近数值段（§1 修饰段归属） */
  hStandaloneModifier(c, state) {
    let m = /^(?:伤害值|数值|点数|效果|数量)因(.+?)而增强$/.exec(c);
    if (!m) {
      // 「每有一名X敌人则再添/增加 N 点伤害」→ 独立修饰句挂最近伤害段（7865）
      m = /^每有一名(.+?)敌人则再?(?:添|增加)\s*(\d+)\s*点伤害$/.exec(c);
      if (m) {
        const src = parseModifierSource(m[1] + '敌人');
        if (!src) return `修饰来源无法解析「${m[1]}」`;
        const idx = lastKind(state.segments, /dmg/i);
        if (idx < 0) return '独立修饰子句找不到挂载段';
        const mod = { mod: { kind: 'multiplier', a: Number(m[2]) }, ...src };
        if (state.tag) state.tagUsed = true;
        state.segments = withModifierAt(state.segments, idx, mod);
        return '';
      }
      // K-B3 机翻修饰句大族（EN 原文均为 boosted by ...）：
      // 「红色盟友和罗刹盟友可提升伤害」9833/9912/9836/9972/9975/10015/10048/9983(骷髅头)、
      // 「由X盟友激发/增强」8453/8620/8398、「受到X盟友的加成」9876/9974/9977/10047、
      // 「X盟友可提升伤害/伤害加成」9834/9842/9913/10049
      m = /^(.+?)可提升伤害$/.exec(c)
        || /^(?:受到?)(.+?)的?(?:加成|增强)$/.exec(c)
        || /^由(.+?)(?:激发|增强|加成)$/.exec(c)
        || /^(.+?)的敌人伤害加成$/.exec(c)
        || /^伤害(?:值)?由(.+?)(?:增强|加强|加成|激发)$/.exec(c);
      if (m) {
        const src = parseModifierSource(m[1]);
        if (!src) return `修饰来源无法解析「${m[1]}」`;
        const idx = lastNumericSegment(state.segments);
        if (idx < 0) return '独立修饰子句找不到挂载段';
        const mod = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
        if (state.tag) state.tagUsed = true;
        state.segments = withModifierAt(state.segments, idx, mod);
        return '';
      }
      // 「敌人每陷入以下一个状态效果则再造成 N 点伤害：A、B、C」→ condBonus anyOf(targetStatus)（8640）
      m = /^(?:敌人|目标|其)?每陷入以下?一?个?状态(?:效果)?则再?造成\s*(\d+)\s*点伤害[：](.+)$/.exec(c);
      if (m) {
        const ids = m[2].split(/[、，,]/).map((s) => matchStatus(s.trim())).filter(Boolean);
        if (ids.length === 0) return `状态词无法识别「${m[2]}」`;
        const idx = lastKind(state.segments, /dmg/i);
        if (idx < 0) return '状态计加条件找不到前置伤害段';
        const n = state.tag?.a ?? Number(m[1]);
        if (state.tag) state.tagUsed = true;
        const cond = ids.length === 1 ? { kind: 'targetStatus', statusId: ids[0] } : { kind: 'anyOf', of: ids.map((id) => ({ kind: 'targetStatus', statusId: id })) };
        state.segments = withCondBonusAt(state.segments, idx, n, cond);
        return '';
      }
      return null;
    }
    const src = parseModifierSource(m[1]);
    if (!src) return `修饰来源无法解析「${m[1]}」`;
    const idx = lastNumericSegment(state.segments);
    if (idx < 0) return '独立修饰子句找不到挂载段';
    const mod = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
    if (state.tag) state.tagUsed = true;
    state.segments = withModifierAt(state.segments, idx, mod);
    return '';
  }

  // —— 状态施加 ——
  hStatus(c, state) {
    // 「陷入叠加 N 的出血状态」（9167）；「施加 N 层流血效果」（9934，目标跨段回指）
    // K-B 收官轮修：目标头扩名词形（「使一名敌人陷入叠加 3 的出血状态」——此前仅收
    // 代词形，名词形跌入通用规则丢 stacks）
    let m = /^(?:使其?|令其?|让他|对她|对目标|使一名随机敌人|使一名敌人|一名随机敌人|一名敌人|该敌人|敌方队伍|所有敌人)?(?:陷入|施加)叠加\s*(\d+)\s*的?(.+?)(?:状态|效果)?$/.exec(c)
      || /^(?:施加|附加)\s*(\d+)\s*层的?(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      // K-B3：并列状态（「施加1层流血效果和狼人诅咒效果」9934）→ 逐状态施加
      const multi = m[2].split(/[、和]/).map((s) => matchStatus(s.trim()));
      if (multi.length > 1 && multi.every(Boolean) && !/或/.test(m[2])) {
        const mode2 = /^(?:施加|附加)/.test(c.trim()) ? refTargetOf(state) : 'enemyChosen';
        this.use('inflict');
        for (const pid of multi) state.segments.push(`inflict('${pid}', '${mode2}', { stacks: ${m[1]} })`);
        return '';
      }
      const id = matchStatus(m[2]);
      if (!id) return `状态词无法识别「${m[2]}」`;
      const mode = /^施加|附加/.test(c.trim()) ? refTargetOf(state) : 'enemyChosen';
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${mode}', { stacks: ${m[1]} })`);
      return '';
    }
    // 「祝福/赐福/诅咒 TARGET」动词句（第三轮：blessed/curse 状态落地后的正面状态族）。
    // 无目标词 → 祝福系回指上文盟友目标、诅咒系回指 lastTarget（§12.3 同款）。
    m = /^(祝福|赐福|诅咒)\s*(.*)$/.exec(c);
    if (m) {
      const id = m[1] === '诅咒' ? 'curse' : 'blessed';
      const tgtText = m[2].trim();
      if (/[并，,或]/.test(tgtText)) return null; // 复合句交 tryCompound 拆分（「赐福A并诅咒B」8698 族）
      if (tgtText === '' || /^(他们|其|他|她)$/.test(tgtText)) {
        const mode = id === 'curse' ? refTargetOf(state) : (state.lastAllyTarget ?? 'allySelf');
        const race = id === 'blessed' ? state.lastAllyRace : null;
        this.use('inflict');
        state.segments.push(`inflict('${id}', '${mode}'${race ? `, { targetRace: '${race}' }` : ''})`);
        return '';
      }
      const tgt = statusTarget(tgtText, state);
      if (tgt === null) return `状态目标无法解析「${c}」`;
      this.use('inflict');
      state.segments.push(statusSegOpts(`inflict('${id}', '${tgt.mode}')`, tgt));
      return '';
    }
    // 「陷入所有负面状态效果」/「(赋予)自身所有正面状态效果」→ 按引擎状态池逐状态施加
    //（负面 = RANDOM_NEGATIVE_STATUS_POOL 同集；正面 = 引擎已实现的正面状态集）。
    m = /^(?:使其?|令其?|让|对)?(所有敌人|一名敌人|一名随机敌人|敌人|目标)?陷?入?所有负面(?:的)?(?:状态|负面)?(?:状态)?(?:效果)?$/.exec(c)
      || /^(赋予|给予|使)(自身|自己)所有正面(?:的)?状态(?:效果)?$/.exec(c);
    if (m) {
      const negative = /负面/.test(c);
      const pool = negative ? NEGATIVE_POOL : POSITIVE_POOL;
      const mode = negative
        ? (m[1] === '所有敌人' ? 'enemyAll' : m[1] === '一名随机敌人' ? 'enemyRandom' : /目标|其|他/.test(m[1] ?? '') ? refTargetOf(state) : 'enemyChosen')
        : 'allySelf';
      this.use('inflict');
      for (const id of pool) state.segments.push(`inflict('${id}', '${mode}')`);
      return '';
    }
    // 「使所有X族军队陷入Y状态和所有Z族陷入W状态」双段（8622 族）
    m = /^(?:使|让)(.+?)(?:陷入|身中|被)(.+?)(?:状态|效果?)?和(.+?)(?:陷入|身中|被)(.+?)(?:状态|效果?)?$/.exec(c);
    if (m) {
      const t1 = statusTarget(m[1], state);
      const id1 = matchStatus(m[2]);
      const t2 = statusTarget(m[3], state);
      const id2 = matchStatus(m[4]);
      if (t1 && id1 && t2 && id2) {
        this.use('inflict');
        state.segments.push(statusSegOpts(`inflict('${id1}', '${t1.mode}')`, t1), statusSegOpts(`inflict('${id2}', '${t2.mode}')`, t2));
        return '';
      }
    }
    // 「赋予 X盟友 Y状态」（「赋予第一名盟友狂怒状态」）
    // K-B3 护栏：m[2] 必须是纯状态片段（8284/8191 曾因贪匹配吞掉「，再给予其…」复合尾段）
    let asg = /^(?:赋予|给予)(.+?)盟友(.+?)(?:状态|效果)?$/.exec(c);
    if (asg && !/随机/.test(c) && asg[2].length <= 8 && !/[，,]/.test(asg[2])) {
      const id = matchStatus(asg[2]);
      if (id) {
        const tgt = statusTarget(asg[1] + '盟友', state);
        if (tgt === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        state.segments.push(statusSegOpts(`inflict('${id}', '${tgt.mode}')`, tgt));
        state.lastAllyTarget = tgt.mode;
        return '';
      }
    }
    // 「给予所有X色盟友/敌人 N 点…」＝按法力色限定目标 → ifCond targetColor 过滤
    //（第三轮新原语用法：DamageSegment/BuffSegment/StatusSegment 均带 ifCond）
    if (/^(?:给予|为|使|让)所有(红|蓝|绿|黄|紫|棕)色?(盟友|敌人)/.test(c)) {
      // 无属性词的色限定状态/增益句由此处的通用路径处理；带属性词放行 hBuffHeal
      if (!/(生命值|护甲值|护甲|攻击力|魔力值|法力值|随机技能值|技能点数)/.test(c)) {
        const mm = /^(?:赋予|给予|使|为|让)所有(红|蓝|绿|黄|紫|棕)色?(盟友|敌人)(?:全体)?(?:获得)?(.+?)(?:状态|效果)?$/.exec(c);
        if (mm) {
          const id = matchStatus(mm[3]);
          if (id) {
            const mode = mm[2] === '盟友' ? 'allyAll' : 'enemyAll';
            this.use('inflict');
            state.segments.push(`inflict('${id}', '${mode}', { ifCond: { kind: 'targetColor', color: BaseColor.${COLORS[mm[1]]} } })`);
            return '';
          }
          return `状态词无法识别「${mm[3]}」`;
        }
      }
    }
    // 「获得一个(随机)正面状态效果」＝自身获随机正面（9211 劫数条件 payload，EN gain a random
    // Status Effect；inflictRandom pool:'positive' 正面池）
    if (/^获得一个?(?:随机(?:的)?)?(?:正面增益|正面增益状态)?(?:状态效果|状态)$/.test(c)) {
      this.use('inflictRandom');
      state.segments.push(`inflictRandom('allySelf', { pool: 'positive' })`);
      return '';
    }
    // 「给予/赋予 所有盟友 N 个随机的正面增益(状态)(效果)」（8075）＝inflictRandom times N 正面池
    m = /^(?:赋予|给予|使)所有盟友\s*(\d+)\s*个随机的?正面增益(?:状态)?(?:效果)?$/.exec(c);
    if (m) {
      this.use('inflictRandom');
      state.segments.push(`inflictRandom('allyAll', { times: ${m[1]}, pool: 'positive' })`);
      return '';
    }
    // 「赋予/给予 X盟友 一个随机(正面增益)状态效果」大族（§11.3/§11 补充：盟友=正面池）。
    // K-B3：机翻丢「随机」（9207/9210 zh 无、EN "Grant a random Status Effect" 实锤）→ 随机可省；
    // 「正面增益」修饰语可省（8384/8437/8449/8490/8509/8576/8621/8622/8706/8771/9033/9754 族——
    // EN 均为 Grant a random Status Effect to all X Allies，盟友目标按 §11 补充读正面池）；
    // 「随机赋予X盟友一个状态效果」倒装（9916）
    m = /^(?:赋予|给予|使)(.*?)盟友(?:获得)?(?:一个?)?(?:随机(?:的)?)?(?:正面增益|正面增益状态)?(?:状态)?(?:状态效果|效果|状态)?$/.exec(c)
      || /^为(.+?)盟友(?:赋予|给予)随机(?:的)?(?:正面增益)?状态(?:状态效果|效果)?$/.exec(c)
      || /^随机(?:赋予|给予)(.+?)盟友一个(?:随机(?:的)?)?(?:正面增益)?状态(?:状态效果|效果)?$/.exec(c);
    if (m) {
      const seg = allyRandomStatusSeg(m[1], this);
      if (seg.err) return seg.err;
      this.use('inflictRandom');
      state.segments.push(seg.seg);
      state.lastAllyTarget = 'allyAll';
      return '';
    }
    // 「(随机)对TARGET造成/施加 N 次X状态」——「2 次精灵之火和 2 次缠绕」按 stacks 落段（9524 族）
    m = /^(?:随机)?对(.+?)(?:随机)?(?:施加|造成)(?:一个)?(.+?)(?:状态|效果)?$/.exec(c);
    if (m && !/点/.test(m[2]) && !/伤害|生命值|护甲值|攻击力|魔力值|法力值/.test(c)) {
      const pieces = m[2].split(/和|、|，/).map((s) => s.trim()).filter(Boolean);
      const parsed = pieces.map(parseStatusPiece);
      if (parsed.length > 0 && parsed.every(Boolean)) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        for (const p2 of parsed) {
          const optStr = p2.stacks && p2.stacks > 1 ? `, { stacks: ${p2.stacks} }` : '';
          state.segments.push(statusSegOpts(`inflict('${p2.id}', '${tgt.mode}'${optStr})`, tgt));
        }
        return '';
      }
    }
    // 「获得X效果」「赋予(自身|一名盟友)X效果」——屏障/狂怒/下潜等（获得=自身）
    // K-B 收官轮：「使他们下潜」（8076——前句「给予所有盟友」的「他们」=盟友全体，
    // 沿用上文盟友目标，不落 lastTarget 敌方回指）
    m = /^(获得|赋予自身|赋予他|赋予一名盟友|赋予所有盟友|赋予所有其他盟友|获得屏障|赋予其|使他们|让他们)(屏障|狂怒|狂暴|下潜|沉没|死亡标记|猎人标记|疾病)(?:效果|状态)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[2]);
      const mode = m[1] === '获得' || m[1] === '获得屏障' || m[1] === '赋予自身' ? 'allySelf'
        : m[1] === '使他们' || m[1] === '让他们' ? (state.lastAllyTarget ?? 'allyAll')
        : m[1] === '赋予一名盟友' || m[1] === '赋予他' || m[1] === '赋予其' ? (state.lastTargetMode ?? 'allyChosen')
        : m[1] === '赋予所有其他盟友' ? 'allyOthers' : 'allyAll';
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${mode}')`);
      return '';
    }
    // 「使其/他 陷入 X 状态」（其/他 = 跨段回指；AoE 段沿用 AoE，单体段 §12.3 lastTarget）
    m = /^(?:并)?(?:使其?|使他|使之|令其?|对她|让它|将其)陷入(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      const mode = refTargetOf(state);
      const id = matchStatus(m[1]);
      if (!id) {
        // 「使其陷入 N 个随机状态效果」
        const mm = /^(.+?)陷入(\d+)个随机/.exec(c);
        if (mm) {
          this.use('inflictRandom');
          state.segments.push(`inflictRandom('${mode}', { times: ${mm[2]} })`);
          return '';
        }
        // 「使其陷入燃烧或疾病状态」→ 或 = 掷签二选一（§9.3）
        const orParts = m[1].split('或').map((s) => matchStatus(s)).filter(Boolean);
        if (orParts.length >= 2) {
          this.use('inflict', 'oneOf');
          state.segments.push(`oneOf([inflict('${orParts[0]}', '${mode}')], [inflict('${orParts[1]}', '${mode}')])`);
          return '';
        }
        // 「使其陷入织网和中毒状态」→ 和 = 并列两段（8946）
        const andParts = m[1].split('和').map((s) => matchStatus(s)).filter(Boolean);
        if (andParts.length >= 2 && andParts.length === m[1].split('和').length) {
          this.use('inflict');
          for (const pid of andParts) state.segments.push(`inflict('${pid}', '${mode}')`);
          return '';
        }
        return `状态词无法识别「${m[1]}」`;
      }
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${mode}')`);
      return '';
    }
    // 「使其流血/灼烧/诅咒」等（动词直连无「陷入」，9825 族 payload）
    m = /^(?:使其?|令其?|将他?|对她)(中毒|燃烧|灼烧|流血|沉默|冻结|冰冻|打昏|击晕|缠绕|诅咒|魅惑|狼化|赐福|祝福)(?:状态|效果)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[1] === '灼烧' ? '燃烧' : m[1]);
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${refTargetOf(state)}')`);
      return '';
    }
    // 「使所有受影响的敌人流血」（9566）＝最近伤害段实际命中集（R22 lastDamaged 目标模式）
    m = /^(?:使|令)?所有受影响的敌人(?:陷入|承受|受到)?(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      if (!id) return `状态词无法识别「${m[1]}」`;
      this.use('inflict');
      state.segments.push(`inflict('${id}', 'lastDamaged')`);
      return '';
    }
    // 「灼烧并流血所有该颜色的敌人」（9831）＝选定色（CHOSEN）敌人逐状态施加（与 7862 同族）
    m = /^(燃烧|灼烧|流血|冻结|冰冻|诅咒|缠绕|沉默|打昏|击晕|中毒|魅惑|恐怖)并(燃烧|灼烧|流血|冻结|冰冻|诅咒|缠绕|沉默|打昏|击晕|中毒|魅惑|恐怖)所有(?:该|此|同)(?:颜色|色)的?敌人$/.exec(c);
    if (m) {
      const idA = matchStatus(m[1] === '灼烧' ? '燃烧' : m[1]);
      const idB = matchStatus(m[2] === '灼烧' ? '燃烧' : m[2]);
      if (!idA || !idB) return `状态词无法识别「${m[1]}/${m[2]}」`;
      this.use('inflict');
      state.segments.push(
        `inflict('${idA}', 'enemyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } })`,
        `inflict('${idB}', 'enemyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } })`,
      );
      return '';
    }
    // 「使X陷入 1 到 4 个状态效果」（7986/7996/9910）＝随机状态条数区间（inflictRandom 仅支持
    // 固定 times）→ 定性略去（§11.3 引擎缺口家族）。
    // 护栏：仅纯状态子句认领；带并/或复合尾的（7986「并爆破…」）交 tryCompound 拆分保住另一半
    if (!/[，,]|并|或/.test(c) && /\d+\s*(?:到|-)\s*\d+\s*[个种]?(?:随机)?(?:的)?(?:状态|状态效果)/.test(c)) {
      return `随机状态条数区间（inflictRandom 无 times nRange）→ 原语请求：randomStatus nRange`;
    }
    // 「赋予一名盟友所有状态效果」（8084）＝全状态池授予（正面+负面全给，GoW 官方无池口径考证）→ 定性略去
    if (/^(?:赋予|给予|使).{0,8}(?:获得)?所有(?:的)?状态(?:效果)?$/.test(c)) {
      return `「所有状态效果」全池授予（正负面全集、无官方池口径）→ 原语请求：all-status grant`;
    }
    // 「X（目标）陷入 Y 状态」/「陷入 Y 状态」（目标在句首：所有敌人/一名敌人/…）
    // K-B3 护栏：m[1] 含 因/几率/如果 等非目标词（「几率因陷入恐怖状态…」9110）→ 不认领，
    // 交回后续处理器；否则会误报「状态目标无法解析」并触发复合拆分丢失 rider
    m = /^(.*?)陷入(.+?)$/.exec(c);
    if (m && !/[，,]|因|几率|如果|若|有\d+%/.test(m[1])) {
      const statusText = m[2].replace(/(状态|效果)$/, '').trim();
      // K-B3：并列状态（「诅咒、死亡标记和疾病」8440）→ 逐状态施加（「或」已由上方掷签分支处理）
      const multiIds = statusText.split(/[、和]/).map((s) => matchStatus(s.trim()));
      if (multiIds.length > 1 && multiIds.every(Boolean) && !/或/.test(statusText)) {
        const tgt0 = statusTarget(m[1], state);
        if (tgt0 === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        for (const pid of multiIds) state.segments.push(statusSegOpts(`inflict('${pid}', '${tgt0.mode}')`, tgt0));
        return '';
      }
      const id = matchStatus(statusText);
      if (id) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        state.segments.push(statusSegOpts(`inflict('${id}', '${tgt.mode}')`, tgt));
        return '';
      }
      // 「陷入 N 个随机状态」
      const mm = statusText.match(/^(\d+)个随机/);
      if (mm) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `多随机状态目标无法解析「${c}」`;
        this.use('inflictRandom');
        state.segments.push(`inflictRandom('${tgt.mode}', { times: ${mm[1]} })`);
        return '';
      }
      // 「陷入所有负面状态效果」
      if (/^所有负面/.test(statusText)) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        for (const id of NEGATIVE_POOL) state.segments.push(statusSegOpts(`inflict('${id}', '${tgt.mode}')`, tgt));
        return '';
      }
    }
    // 「燃烧敌人，如果敌人身亡，则转化成一只随机龙族」（7412；EN "then Burn them. If the
    // Enemy dies, transform into a Dragon troop"）＝burn lastTarget + ifTargetDied 转化
    m = /^燃烧敌人，如果敌人身亡，则转化成一只随机(.+?)(?:族|军队)?$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      const refs = race ? this.raceRefs.get(race) : null;
      if (!refs || refs.length === 0) return `种族 ${m[1]} 在 troops.json 无成员`;
      this.use('inflict', 'transformTroopRandom');
      state.segments.push(`inflict('burning', 'lastTarget')`);
      state.segments.push(withIfTargetDied(`transformTroopRandom('lastTarget', [${refs.map((r) => `'${r}'`).join(', ')}])`));
      return '';
    }
    // 「转化成一名/一只(随机)X族 / X」（R2 transformTroop 原语；条件 payload「则转化成…」）
    m = /^转化成一名?(?:随机)?(.+?)(?:族|军队|部队)?$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (race) {
        const refs = this.raceRefs.get(race);
        if (!refs || refs.length === 0) return `种族 ${race} 在 troops.json 无成员`;
        this.use('transformTroopRandom');
        state.segments.push(`transformTroopRandom('${refTargetOf(state)}', [${refs.map((r) => `'${r}'`).join(', ')}])`);
        return '';
      }
      const name = this.resolveTroopName(m[1]);
      const ref = name ? troopsRefByName(name) : null;
      if (ref) {
        this.use('transformTroop');
        state.segments.push(`transformTroop('${refTargetOf(state)}', '${ref}')`);
        return '';
      }
      return `转化目标无法解析「${m[1]}」`;
    }
    // 状态动词开头：「缠绕第一名敌人」「点燃一名敌人（=燃烧）」「死亡标记一名敌人」8398
    const verbMap = [['死亡标记', 'death-mark'], ['猎人标记', 'marked'], ['缠绕', 'entangle'], ['冻结', 'frozen'], ['冰冻', 'frozen'], ['沉默', 'silence'], ['打昏', 'stun'], ['击晕', 'stun'], ['点燃', 'burning'], ['燃烧', 'burning'], ['魅惑', 'charm'], ['诅咒', 'curse'], ['中毒', 'poison'], ['流血', 'bleed'], ['下潜', 'submerged'], ['恐怖', 'terror']];
    for (const [verb, id] of verbMap) {
      m = new RegExp(`^${verb}(.+?)$`).exec(c);
      if (m) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `状态动词目标无法解析「${c}」`;
        this.use('inflict');
        state.segments.push(statusSegOpts(`inflict('${id}', '${tgt.mode}')`, tgt));
        return '';
      }
    }
    // 「并将其冻结」等直接动词后置（跨段回指）
    m = /^(?:并)?(?:将|把)?其?(中毒|燃烧|流血|沉默|冻结|冰冻|打昏|击晕|缠绕|诅咒|魅惑)$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${refTargetOf(state)}')`);
      return '';
    }
    // 「随机燃烧一名敌人」「随机使一名敌人中毒」类（动词在中间，两种语序归一）
    const randM = c.match(/^(?:随机)(?:使)?(?:一名(?:随机的?)?)?(敌人|盟友)?(中毒|燃烧|流血|沉默|冻结|冰冻|打昏|下潜|诅咒|魅惑)(?:一名(?:随机的?)?)?(敌人|盟友)?$/);
    if (randM) {
      const side = randM[1] ?? randM[3];
      const id = matchStatus(randM[2]);
      const mode = side === '盟友' ? 'allyRandom' : 'enemyRandom';
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${mode}')`);
      return '';
    }
    // 通用「(赋予|给予|使) TARGET (状态列表) 效果」——状态词可多个（和/、连接），
    // 含新正面状态（法印/赐福/反射/狼化）。带属性词的放行 hBuffHeal。
    if (!/(生命值|护甲值|护甲|攻击力|魔力值|法力值|随机技能值|技能点数)/.test(c)) {
      m = /^(?:赋予|给予|使)(所有其他的?盟友|所有其他|其他盟友|所有盟友|全体盟友|自身|自己|一名盟友|一名随机盟友|两名随机盟友|其|他|他们|一名敌人|一名随机敌人|所有敌人|目标|一名随机的?敌人|一名选定盟友)?\s*(?:获得|施加)?(.+?)(?:状态|效果)?$/.exec(c);
      if (m) {
        const idText = m[2].trim();
        const pieces = idText.split(/和|、|，/).map((s) => s.trim()).filter(Boolean);
        const parsed = pieces.map(parseStatusPiece);
        if (parsed.length > 0 && parsed.every(Boolean) && pieces.every((p) => p.length <= 8)) {
          const tgt = statusTarget(m[1] ?? '', state);
          if (tgt === null) return `状态目标无法解析「${c}」`;
          this.use('inflict');
          for (const p2 of parsed) {
            const optStr = p2.stacks && p2.stacks > 1 ? `, { stacks: ${p2.stacks} }` : '';
            state.segments.push(statusSegOpts(`inflict('${p2.id}', '${tgt.mode}'${optStr})`, tgt));
          }
          if (tgt.mode.startsWith('ally')) { state.lastAllyTarget = tgt.mode; state.lastAllyRace = tgt.race ?? null; }
          return '';
        }
      }
    }
    return null;
  }

  // —— 宝石操作（创造/转化/清除）——
  hGemOps(c, state) {
    // Plain 「爆破 N 颗宝石」无颜色筛选；包含特殊宝石与骷髅头，不等于仅六色宝石。
    const plainExplode = /^爆破\s*(\d+)\s*颗宝石$/.exec(c);
    if (plainExplode) {
      this.use('explodeRandomGems');
      state.segments.push(`explodeRandomGems(${plainExplode[1]}, 0, 'all')`);
      return '';
    }
    // 创造动词族（机翻译名不统一：创造/制作/制造/创建/生成）
    const CREATE_V = '(?:创造|制作|制造|创建|生成)';
    // 混合宝石（「混合A和B的宝石」/「创造 N 颗 红色和绿色的宝石」7654 无「混合」同口径）。
    // K-B 收官轮：端点开放到骷髅头/特殊宝石（引擎 createGemsMixAny 已备——R22 mixAny）：
    //   9110「创造 15 颗混合蓝色和骷髅头的宝石」/ 9167「混合骷髅头和恐怖宝石」/
    //   9300「混合鬼魂宝石和冻结宝石」→ entries [色|'SKULL'|spec] 逐颗掷选。
    let m = new RegExp(`^${CREATE_V}(?:\\d+|[\\]魔法（）/ +x×.0-9[]+)?颗?混合(.+?)的?宝石$`).exec(c)
      || new RegExp(`^${CREATE_V}\\s*(\\d+)\\s*颗?\\s*(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?(?:的)?宝石$`).exec(c);
    if (m) {
      let cnt = 0;
      let parts;
      if (m.length === 4) {
        cnt = Number(m[1]);
        parts = [m[2], m[3]];
      } else {
        parts = m[1].split('和').map((s) => s.trim());
        const n = m[0].match(/(\d+)\s*颗/);
        cnt = n ? Number(n[1]) : 0;
      }
      const entries = [];
      let ok = parts.length >= 2;
      for (const p of parts) {
        const color = matchColor(p);
        if (color) {
          const gem = matchSpecialGem(p);
          // 六色族特殊宝石（「蓝色巨人宝石」）带 spec.color；普通色端点直接给色
          if (gem && SIX_COLOR_GEMS.has(gem.kind)) entries.push(`{ kind: '${gem.kind}', color: BaseColor.${color} }`);
          else entries.push(`BaseColor.${color}`);
          continue;
        }
        if (/骷髅头/.test(p)) { entries.push(`'SKULL'`); continue; }
        const gem = matchSpecialGem(p.replace(/宝石$/g, '').trim());
        if (gem) {
          entries.push(gem.tier !== undefined ? `{ kind: '${gem.kind}', tier: ${gem.tier} }` : `{ kind: '${gem.kind}' }`);
          continue;
        }
        ok = false;
        break;
      }
      // 纯色并集维持既有 createMix 形态（旧批次产物不变）；含骷髅头/特殊端点 → mixAny
      if (ok && entries.every((e) => e.startsWith('BaseColor.'))) {
        this.use('createMix');
        state.segments.push(`createMix([${entries.join(', ')}], ${cnt})`);
        return '';
      }
      if (ok) {
        this.use('createGemsMixAny');
        state.segments.push(`createGemsMixAny([${entries.join(', ')}], ${cnt}, 0)`);
        return '';
      }
      return `混合宝石端点无法识别（色/骷髅头/特殊宝石之外）「${m[1]}」`;
    }
    // 「创造 N 颗A色宝石和 M 颗B色宝石」→ 两段 createGems（7529；修复旧版吞色 bug）
    m = new RegExp(`^${CREATE_V}\\s*(\\d+)\\s*颗?(红|蓝|绿|黄|紫|棕)色?宝石和\\s*(\\d+)\\s*颗?(红|蓝|绿|黄|紫|棕)色?宝石$`).exec(c);
    if (m) {
      this.use('createGems');
      state.segments.push(`createGems(BaseColor.${COLORS[m[2]]}, ${m[1]}, 0)`, `createGems(BaseColor.${COLORS[m[4]]}, ${m[3]}, 0)`);

      return '';
    }
    // 「敌我双方每有一名X色军队则爆破一颗随机X色宝石」（7568）＝双侧色计数
    // → sources [alliesOfColor, enemiesOfColor]（K-E 第五轮接线）
    {
      const both = /^敌我双方每有一名(红|蓝|绿|黄|紫|棕)色?(?:军队|盟友|敌人)则(爆破|摧毁)一颗随机(?:的)?\1色?宝石$/.exec(c);
      if (both) {
        const mods = { mod: state.tag ?? { kind: 'multiplier', a: 1 }, sources: [{ kind: 'alliesOfColor', color: COLORS[both[1]] }, { kind: 'enemiesOfColor', color: COLORS[both[1]] }] };
        if (state.tag) state.tagUsed = true;
        this.use('explodeRandomGems', 'destroyRandomGems');
        const fn = both[2] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
        state.segments.push(`${fn}(1, 0, 'color', BaseColor.${COLORS[both[1]]}, { modifier: ${jsonMod(mods)} })`);
        return '';
      }
    }
    // 「每摧毁一颗(色)宝石/骷髅头，(即可|则|便|再)<状态>一名(随机)敌人/盟友」（8518/8965）
    // ＝官方「for every X Gem destroyed」族：perDestroyed 逐摧毁触发状态（原语 Wave4 已备，
    // 次数 = 被摧毁的该类宝石数、每次随机取目标池一名）——此前按缺口拒绝为陈旧口径。
    m = /^每摧毁一颗(红|蓝|绿|黄|紫|棕)?色?(.+?)?(?:宝石|骷髅头)[，,]?(?:即可|则|便|再)?(燃烧|点燃|诅咒|冻结|冰冻|打昏|击晕|缠绕|中毒|流血|沉默|魅惑|祝福|屏障|恐怖|激怒)一名?(随机的?)?(敌人|盟友)$/.exec(c);
    if (m) {
      const id = matchStatus(m[3] === '点燃' ? '燃烧' : m[3] === '祝福' ? '赐福' : m[3]);
      if (!id) return `状态词无法识别「${m[3]}」`;
      const mode = m[5] === '盟友' ? 'allyRandom' : 'enemyRandom';
      const per = /骷髅头/.test(m[2] ?? '')
        ? "{ color: 'skull' }"
        : m[1]
          ? `{ color: BaseColor.${COLORS[m[1]]} }`
          : '{}'; // 无色无限定 = 按全部被摧毁宝石计数（perDestroyed 缺省口径）
      this.use('inflict');
      state.segments.push(`inflict('${id}', '${mode}', { perDestroyed: ${per} })`);
      return '';
    }
    // 「制造 N 个骷髅，数量受中毒敌人影响」（9488）＝骷髅版 create+modifier rider。
    // 必须先于通用创造规则：通用规则对「…中毒敌人影响」误配单字核心「毒」→ poisonGem（预存 bug）
    m = /^(?:制造|创造|制作|创建)\s*(\d+)\s*[颗个]骷髅头?[，,]?(?:数量|宝石数?量)(?:因|受|随)(.+?)(?:而增强|而加强|影响)$/.exec(c);
    if (m) {
      const src = parseModifierSource(m[2]);
      if (!src) return `修饰来源无法解析「${m[2]}」`;
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(m[1]) }, ...src };
      if (state.tag) state.tagUsed = true;
      this.use('createSkulls');
      state.segments.push(`createSkulls(${m[1]}, 0, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 每摧毁一颗(X)宝石，则(再)创造 N 颗 Y [xN]（batch-19 7060 先例）
    m = /^每摧毁一颗(红|蓝|绿|黄|紫|棕)?色?(.+?)?(?:宝石|骷髅头)?[，,]?则(?:再)?创造\s*(\d+)\s*颗(.+)$/.exec(c);
    if (m) {
      const n = Number(m[3]);
      const what = m[4].replace(/宝石|骷髅头/g, '').trim();
      const srcColor = m[1] ? COLORS[m[1]] : undefined;
      const source = /骷髅头/.test(m[2] ?? '') || /骷髅头/.test(what)
        ? { kind: 'destroyedGems' }
        : { kind: 'destroyedGems', ...(srcColor ? { color: srcColor } : {}) };
      // 特殊宝石来源过滤无 destroyedGems 筛选通道（8806「每摧毁一颗石像鬼宝石」族）→ 诚实略去
      if (!srcColor && !/骷髅头/.test(m[2] ?? '') && matchSpecialGem(m[2] ?? '') ) {
        return `按特殊宝石筛选被摧毁数无对应来源 kind（destroyedGems 仅支持 color）→ 原语请求：destroyedSpecialGems 计数`;
      }
      const createCall = createGemCall(this, what, n, { mod: state.tag ?? { kind: 'multiplier', a: n }, source });
      if (createCall.err) return createCall.err;
      if (state.tag) state.tagUsed = true;
      state.segments.push(createCall.seg);
      return '';
    }
    // 「创造与所耗尽法力值数等数的宝石，创建的宝石色与敌人法力颜色相同」（7866）：
    // 数量 = drainedMana 二次缩放（尾部 [N:M] 即每点法力值 +N 颗）、颜色 = ColorSpec LAST_TARGET（§11 追加）
    m = /^创造与所耗尽法力值数?等数的?宝石(?:[，,]创建的宝石色?与(?:该)?敌人法力颜色相同)?$/.exec(c);
    if (m) {
      this.use('createGems');
      const mod = { mod: state.tag ?? { kind: 'multiplier', a: 1 }, source: { kind: 'drainedMana' } };
      if (state.tag) state.tagUsed = true;
      state.segments.push(`createGems('LAST_TARGET', 0, 0, { modifier: ${jsonMod(mod)} })`);
      return '';
    }
    // 「创造 8 颗指定盟友的法力颜色的宝石」（7204；EN Gems of a chosen Ally's Mana Color）
    // ＝ColorSpec 'CHOSEN_TARGET'（R22 批：本次释放手动选定目标的法力色）
    m = new RegExp(`^${CREATE_V}\\s*(\\d+)\\s*颗指定盟友的法力颜色的宝石$`).exec(c);
    if (m) {
      this.use('createGems');
      state.segments.push(`createGems('CHOSEN_TARGET', ${m[1]}, 0)`);
      return '';
    }
    // 「创造等同于被移除/摧毁的X色宝石数的Y色宝石」（8507）＝按前序清除段计数再创造
    m = /^创造等同于被(?:移除|摧毁)的(红|蓝|绿|黄|紫|棕)色?宝石数的?(红|蓝|绿|黄|紫|棕)色?宝石$/.exec(c);
    if (m) {
      this.use('createGems');
      const mod = { mod: state.tag ?? { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems', color: COLORS[m[1]] } };
      if (state.tag) state.tagUsed = true;
      state.segments.push(`createGems(BaseColor.${COLORS[m[2]]}, 0, 0, { modifier: ${jsonMod(mod)} })`);
      return '';
    }
    // 每有一颗X色宝石（在所选的列），则创造 N 颗Y → 列内计数来源缺失（8805/8988 族）诚实略去
    // K-B3：「所选列」机翻省「的」、「骷髅头或紫色宝石」并列来源——同属列内计数缺口
    m = /^(?:所选的?列|选定(?:的)?列)?每有一?颗?(?:骷髅头或?)?(红|蓝|绿|黄|紫|棕)?色?或?(红|蓝|绿|黄|紫|棕)?色?宝石[，,]?则(?:再)?创造/.exec(c);
    if (m) {
      return `「所选的列每有一颗X色宝石」列内宝石计数无对应来源 kind → 原语请求：columnGems 计数来源`;
    }
    // 每有一名X，则爆破 N 颗宝石 [xN]（batch-21 8167 先例）
    m = /^每有一名(.+?)(?:盟友|敌人)[，,]?则(爆破|摧毁)\s*(\d+)\s*颗(?:的)?宝石$/.exec(c);
    if (m) {
      const n = Number(m[3]);
      const src = allySourceOf(m[1], m[2] === '敌人');
      if (typeof src === 'string') return src;
      if (!src) return `每一名来源无法解析「${m[1]}」`;
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: n }, ...src };
      if (state.tag) state.tagUsed = true;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[2] === '爆破' ? 'explodeRandomGems' : 'destroyRandomGems';
      state.segments.push(`${fn}(${n}, 0, 'all', undefined, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 「每有一名X色敌人则创造 N 颗混合X色和骷髅头的宝石」（7655-7660 Doomed 族）＝
    // createGemsMixAny + enemiesOfColor 修饰（K-B 收官轮接线：mixAny 端点开放后整句可编译）。
    // 官方「a mix of N X Gems and Skulls for every X Enemy」＝总数 = N × 敌人数（base 0、
    // 倍率 = 尾部 [xN]（gowhead 对「每名 N 颗」的编码）或句内 N）。
    m = /^每有一[名位](红|蓝|绿|黄|紫|棕)色?敌人[，,]?则创(?:造|建)\s*(\d+)\s*颗?混合(?:的)?\1色?和骷髅头的?宝石$/.exec(c);
    if (m) {
      const color = COLORS[m[1]];
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(m[2]) }, source: { kind: 'enemiesOfColor', color } };
      if (state.tag) state.tagUsed = true;
      this.use('createGemsMixAny');
      state.segments.push(`createGemsMixAny([BaseColor.${color}, 'SKULL'], 0, 0, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 「每有一名X色盟友和敌人则创造 N 颗X色宝石」（9211-9216）＝双侧计数普通创造
    {
      const dual = /^每有一[名位](红|蓝|绿|黄|紫|棕)色?(?:盟友|盟军)和敌人则创(?:造|建|作)\s*(\d+)\s*颗?\1色?宝石$/.exec(c);
      if (dual) {
        const color = COLORS[dual[1]];
        const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(dual[2]) }, sources: [{ kind: 'alliesOfColor', color }, { kind: 'enemiesOfColor', color }] };
        if (state.tag) state.tagUsed = true;
        this.use('createGems');
        state.segments.push(`createGems(BaseColor.${color}, ${dual[2]}, 0, { modifier: ${jsonMod(mods)} })`);
        return '';
      }
    }
    // 「每有一名X色敌人(盟友)则创造 N 颗Y宝石」＝普通/特殊宝石创造 + 敌侧计数（8872/8873 巨人宝石族）
    // （[^，和] 防误吃混合句——混合端点句由上方 createMix-special 归因规则先行）
    m = /^每有一[名位](.+?)(盟友|敌人)[，,]?(?:则|就)?创(?:造|建|作)\s*(\d+)\s*颗?(?:的)?([^，和]*?)宝石$/.exec(c);
    if (m) {
      const isEnemy = m[2] === '敌人';
      const src = allySourceOf(m[1], isEnemy);
      if (typeof src === 'string') return src;
      if (!src) return `每一名来源无法解析「${m[1]}」`;
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(m[3]) }, ...src };
      if (state.tag) state.tagUsed = true;
      const what = m[4] === '' || m[4] === '颗' ? '' : m[4];
      const call = createGemCall(this, what, Number(m[3]), mods, true);
      if (call.err) return call.err;
      state.segments.push(call.seg);
      state.lastCreate = { what, allowBareColor: true };
      return '';
    }
    // 每有一名X盟友/敌人，则创造 N 颗宝石，所创造的宝石混合A和B两种颜色 [xN]
    // K-B3 语序全集（8161/8260-8266/8285/8313-8315/8386/8394/8402/8434/8435/8452/8453/8487/8506/
    // 8620/8645/8669/8809/8877 族；EN 原文均为 create a mix of N A and B Gems for each X Ally）：
    //  a) 每有一名X盟友，则创造 N 颗宝石，所创造的宝石混合A和B两种颜色
    //  b) 每有一名X盟友，则创造混合蓝色和红色的 6 颗宝石
    //  c) 每有一名/位X盟友[，,]则创(造|建) N 颗混合A和B(色)?的宝石（数量前置）
    //  d) 为每位X盟友创(造|建) N 颗混合A和B宝石（8620）
    //  e) 给每个X盟友制造 N 颗混合的A和B宝石（8453）
    // K-E：敌侧变体（7655「每有一名蓝色敌人则创造 6 颗混合蓝色和骷髅头的宝石」）→ enemiesOf* 来源
    m = /^每有一[名位](.+?)(盟友|敌人)[，,]?则创(?:造|建)\s*(\d+)\s*颗宝石[，,]?所创造的宝石混合(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?两种颜色$/.exec(c)
      || /^每有一[名位](.+?)(盟友|敌人)[，,]?则创(?:造|建)混合(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?的\s*(\d+)\s*颗宝石$/.exec(c)
      || /^每有一[名位](.+?)(盟友|敌人)[，,]?(?:则|就)?创(?:造|建|作)\s*(\d+)\s*颗?混合的?(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?(?:两种?颜色)?的?\s*宝石$/.exec(c)
      || /^为每[一位名](.+?)(盟友|敌人)创(?:造|建)\s*(\d+)\s*颗?混合的?(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?(?:两种?颜色)?的?宝石$/.exec(c)
      || /^给每个(.+?)(盟友|敌人)制(?:造|作)\s*(\d+)\s*颗?混合的?(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?(?:两种?颜色)?的?宝石$/.exec(c);
    if (m) {
      const isEnemy = m[2] === '敌人';
      let src2; let n; let cA; let cB;
      if (/所创造的宝石混合/.test(c)) {
        src2 = allySourceOf(m[1], isEnemy);
        n = Number(m[3]); cA = m[4]; cB = m[5];
      } else if (/^每有一[名位](.+?)(?:盟友|敌人)[，,]?则创(?:造|建)混合/.test(c)) {
        src2 = allySourceOf(m[1], isEnemy);
        cA = m[3]; cB = m[4]; n = Number(m[5]);
      } else {
        src2 = allySourceOf(m[1], isEnemy);
        n = Number(m[3]); cA = m[4]; cB = m[5];
      }
      if (typeof src2 === 'string') return src2;
      if (!src2) return `每一名来源无法解析「${m[1]}」`;
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: n }, ...src2 };
      if (state.tag) state.tagUsed = true;
      this.use('createMix');
      state.segments.push(`createMix([BaseColor.${COLORS[cA]}, BaseColor.${COLORS[cB]}], 0, 0, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 「创造 N 颗X宝石，宝石数量因Y而增强/受Y影响」rider（create + modifier）。
    // K-B3：宾语从 m[1] 提取（此前取自数字组，「创造 5 颗绿色宝石，宝石数因…」7491 曾丢颜色）
    m = new RegExp(`^(${CREATE_V}\\s*(\\d+)\\s*颗?([^，]*?宝石))[，,]?(?:宝石数?量|数量|宝石数|摧毁数)?(?:因|受|随)(.+?)(?:而增强|而加强|影响)$`).exec(c);
    if (m) {
      const src = parseModifierSource(m[4]);
      if (!src) return `修饰来源无法解析「${m[4]}」`;
      const what = m[3].replace(/^\s*\d+\s*颗?/, '').replace(/宝石$/, '').trim();
      const call = createGemCall(this, what, Number(m[2]), { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src });
      if (call.err) return call.err;
      if (state.tag) state.tagUsed = true;
      state.segments.push(call.seg);
      state.lastCreate = { what, allowBareColor: true };
      return '';
    }
    // 「制造 3 种药水，蓝色、绿色、红色、黄色或紫色」（8578）＝官方 Create 3 Potions of
    // either Blue/Green/Red/Yellow/Purple：逐颗在五色法力药水宝石（spec.color 通道）掷选。
    m = new RegExp(`^${CREATE_V}\\s*(\\d+)\\s*种药水[，,]((?:蓝|绿|红|黄|紫|棕)色?[、和或]+){2,}(?:蓝|绿|红|黄|紫|棕)色?$`).exec(c);
    if (m) {
      const colors = c.slice(c.indexOf('药水') + 2).replace(/^[，,]/, '').split(/[、和或]/).map((s) => matchColor(s.trim())).filter(Boolean);
      if (colors.length >= 2) {
        this.use('createGemsMixAny');
        const entries = colors.map((co) => `{ kind: 'manaPotionGem', color: BaseColor.${co} }`);
        state.segments.push(`createGemsMixAny([${entries.join(', ')}], ${m[1]}, 0)`);
        return '';
      }
      return `药水颜色表无法解析「${c}」`;
    }
    // 创造 N 颗骷髅头 / 8-12 个骷髅（countRange §9.8；「骷髅」省「头」变体 9490/9488）。
    // 必须先于通用创造规则：否则「制作 8-12 个骷髅」被通用规则截成 n=8/what='-12 个'
    m = /^(?:再|然后)?(?:创造|制作|制造|创建)?\s*(\d+)\s*[颗个]骷髅头?$/.exec(c);
    if (m) {
      this.use('createSkulls');
      state.segments.push(`createSkulls(${m[1]}, 0)`);
      state.lastCreate = { what: '骷髅头', allowBareColor: true };
      return '';
    }
    m = /^(?:制作|制造|创造|创建)\s*(\d+)-(\d+)\s*[颗个]骷髅头?$/.exec(c);
    if (m) {
      this.use('createSkulls');
      state.segments.push(`createSkulls(0, 0, { countRange: { min: ${m[1]}, max: ${m[2]} } })`);
      state.lastCreate = { what: '骷髅头', allowBareColor: true };
      return '';
    }
    // 创造 N 颗 X（色宝石/骷髅头/特殊宝石），含「随机的蓝色宝石」「6 红色宝石」变体
    // K-B3：机翻中文数词（「创造一颗许愿宝石」8696）——cn 数词归一后再走数字通道
    const cnNum = c.match(new RegExp(`^(?:再|然后|随机)?${CREATE_V}(一|两|二|三|四|五|六|七|八|十)颗`));
    let cc = c;
    if (cnNum) {
      const cnMap = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 十: 10 };
      cc = c.replace(/(一|两|二|三|四|五|六|七|八|十)颗/, `${cnMap[cnNum[1]]} 颗`);
    }
    m = new RegExp(`^(?:再|然后|随机)?${CREATE_V}(?:选定(?:颜色)?的)?\\s*(\\d+)\\s*[颗个]?(?:随机的?)?(.+?)?(?:色的)?(?:的)?(?:宝石|骷髅)?$`).exec(cc);
    if (m && /宝石|骷髅|星|石块|石墩/.test(cc)) {
      // (.+?)? 外层 ? 贪婪 → what 至少 1 字；「宝石」裸词=未指定颜色（createGems CHOSEN）
      const rawWhat = (m[2] ?? '').trim();
      const what = rawWhat === '宝石' || rawWhat === '颗宝石' ? '' : rawWhat;
      const call = createGemCall(this, what, Number(m[1]), null, true);
      if (call.err) return call.err;
      state.segments.push(call.seg);
      state.lastCreate = { what, allowBareColor: true };
      return '';
    }
    // —— 转化族 ——
    // 「将 N 颗宝石转换成X色」→ 定量随机换色
    m = /^(?:再)?将\s*(\d+)\s*颗宝石转换?为?成?(红|蓝|绿|黄|紫|棕)色?$/.exec(c);
    if (m) {
      // raw GemSegment：TransformGemParams.from 支持 'ANY'（transform 构造器形参为 ColorSpec）
      state.segments.push(`{ kind: 'gem', params: { op: 'transform', from: 'ANY', to: BaseColor.${COLORS[m[2]]}, count: { base: ${m[1]}, mult: 0 } } }`);
      return '';
    }
    // 「将所有X色宝石转换成Y色 / 一个选定颜色」
    m = /^(?:再)?将所有(红|蓝|绿|黄|紫|棕)色?宝石转换?为?成?(红|蓝|绿|黄|紫|棕)色?$/.exec(c);
    if (m) {
      this.use('transform');
      state.segments.push(`transform(BaseColor.${COLORS[m[1]]}, BaseColor.${COLORS[m[2]]})`);
      return '';
    }
    // 「将所有骷髅头转换成X宝石」（9379 骷髅→极度末日骷髅）＝from 'SKULL' 端点（ColorSpec 'SKULL'
    // 既有通道）；端点可为颜色（骷髅→红宝石）或特殊宝石（→末日骷髅族）
    m = /^(?:再)?将所有骷髅头转换?为?成?(.+?)$/.exec(c);
    if (m) {
      const gem = matchSpecialGem(m[1].replace(/宝石/g, '').trim());
      if (gem) {
        this.use('transformToSpecial');
        const spec = gem.tier !== undefined ? `{ kind: '${gem.kind}', tier: ${gem.tier} }` : `'${gem.kind}'`;
        state.segments.push(`transformToSpecial('SKULL', ${spec})`);
        return '';
      }
      const toColor = matchColor(m[1]);
      if (toColor) {
        this.use('transform');
        state.segments.push(`transform('SKULL', BaseColor.${toColor})`);
        return '';
      }
      return `骷髅头转化目标无法识别「${m[1]}」`;
    }
    // 「选定敌人一个法力颜色」＝选色交互（CHOSEN 占位符运行时由 ColorChooser 解析），
    // 独立子句为无段声明（8900；同「选定一个颜色以移除」的隐式选色口径）。
    // 「选定一颗法力宝石」（7862）＝选定单格、其颜色成为选定色——同口径无段声明。
    if (/^(?:选定|选择)(?:敌人|敌方)?(?:一个|一种)?法力(?:宝石)?颜色$/.test(c)
      || /^(?:选定|选择)一颗?(?:法力)?宝石$/.test(c)) {
      return '';
    }
    // 「将所有此(法力)颜色的宝石转换成X宝石」（8900）＝from CHOSEN 端点（选定的敌方法力色）
    m = /^(?:再)?将所有此(?:法力)?颜色的?宝石转换?为?成?(.+?)$/.exec(c);
    if (m) {
      const gem = matchSpecialGem(m[1].replace(/宝石/g, '').trim());
      if (gem) {
        this.use('transformToSpecial');
        const spec = gem.tier !== undefined ? `{ kind: '${gem.kind}', tier: ${gem.tier} }` : `'${gem.kind}'`;
        state.segments.push(`transformToSpecial('CHOSEN', ${spec})`);
        return '';
      }
      const toColor = matchColor(m[1]);
      if (toColor) {
        this.use('transform');
        state.segments.push(`transform('CHOSEN', BaseColor.${toColor})`);
        return '';
      }
      return `选定色转化目标无法识别「${m[1]}」`;
    }
    m = /^(?:再)?将所有(红|蓝|绿|黄|紫|棕)色?宝石转换?为?成?(?:一个)?选定颜色$/.exec(c);
    if (m) {
      this.use('transform');
      state.segments.push(`transform(BaseColor.${COLORS[m[1]]}, CHOSEN)`);
      return '';
    }
    // 「将他/其(其中一个/一种)法力颜色的 N 颗宝石转换成X宝石」→ from LAST_TARGET（ColorSpec 占位符）
    // K-B3：「一种」量词（9902「该敌人一种法力颜色的4颗宝石转化为恐惧宝石」）
    m = /^(?:再)?将(?:其|他|她|该敌人)(?:(?:其中|其)的?)?(?:一[个种]?)?法力颜色的\s*(\d+)\s*颗(?:的)?宝石转[换化]为?成?(.+?)$/.exec(c);
    if (m) {
      const gem = matchSpecialGem(m[2].replace(/宝石|头$/g, '').trim());
      if (gem) {
        // 转换端点无 tier 通道：善石像鬼(tier1)=引擎缺省可省略；恶石像鬼/带档通配 → 原语缺口
        if (gem.tier !== undefined && !(gem.kind === 'gargoyleGem' && gem.tier === 1)) {
          return '原语请求：转换端点不支持 tier（TransformOpts 无 tier 通道；恶石像鬼/带倍率通配）';
        }
        this.use('transformToSpecial');
        state.segments.push(`transformToSpecial('LAST_TARGET', '${gem.kind}', { count: ${m[1]} })`);
        return '';
      }
      const toColor = matchColor(m[2]);
      if (toColor) {
        this.use('transform');
        state.segments.push(`{ kind: 'gem', params: { op: 'transform', from: 'LAST_TARGET', to: BaseColor.${toColor}, count: { base: ${m[1]}, mult: 0 } } }`);
        return '';
      }
      return `转化目标无法识别「${m[2]}」`;
    }
    // 「将(该)敌人法力颜色之一的所有宝石转换为紫色」（9566 条件 payload；ColorSpec LAST_TARGET 通道）
    m = /^(?:再)?将(?:该)?敌人法力颜色之一的?所有宝石转[换化]为?成?(红|蓝|绿|黄|紫|棕)色?$/.exec(c);
    if (m) {
      this.use('transform');
      state.segments.push(`transform('LAST_TARGET', BaseColor.${COLORS[m[1]]})`);
      return '';
    }
    // 「将 N 颗(色)宝石转换成X宝石」→ 定量转化（9031；K-B 收官轮量词扩「个」9490）
    m = /^(?:再)?将\s*(\d+)\s*[颗个](红|蓝|绿|黄|紫|棕)色?宝石转[换化]为?成?(.+?)$/.exec(c);
    if (m) {
      const what = m[3].replace(/宝石/g, '').trim();
      const call = transformGemCall(this, COLORS[m[2]], what, Number(m[1]), c);
      if (call) {
        state.segments.push(call);
        state.lastCreate = { what, allowBareColor: true }; // 「则再创造 5 颗」复用 referent（7952）
        return '';
      }
      return `转化目标无法识别「${m[3]}」`;
    }
    // 「将(所有|选定/所选/指定)(色)?(法力)?宝石转换成X」——全量转化（含 x3 通配符 / 特殊宝石 / 换色）
    m = /^(?:再)?将((?:所有|选定颜色|选定的?|所选(?:颜色)?|指定颜色|一颗选定|一个选定)的?)*\s*(?:(红|蓝|绿|黄|紫|棕)色?)?(?:的)?(?:法力)?宝石转[换化]为?成?(.+?)$/.exec(c);
    if (m && /宝石/.test(c)) {
      const what = m[3].replace(/宝石/g, '').trim();
      const fromColor = m[2] ? COLORS[m[2]] : null;
      const chosenFrom = /选定|所选|指定/.test(m[1]) && !fromColor;
      const call = transformGemCall(this, fromColor, what, undefined, c);
      if (call) {
        // K-B 收官轮：「选定的法力宝石」＝玩家点选单格（CELL 管线，9638 先例）；
        // 「选定(颜色)」＝运行时选色（CHOSEN）。两者都是「选定」但选择器不同。
        const gemSel = /选定的?法力宝石|选定一颗/.test(c);
        state.segments.push(chosenFrom ? call.replace(`transformToSpecial('ANY'`, `transformToSpecial('${gemSel ? 'CELL' : 'CHOSEN'}'`) : call);
        state.lastCreate = { what, allowBareColor: true }; // 「则再创造 5 颗」复用 referent（7952）
        return '';
      }
      const toColor = matchColor(what);
      if (toColor) {
        this.use('transform');
        const from = fromColor ? `BaseColor.${fromColor}` : (chosenFrom ? 'CHOSEN' : "'ANY'");
        state.segments.push(`transform(${from}, BaseColor.${toColor})`);
        return '';
      }
      return `转化目标无法识别「${m[3]}」`;
    }
    // 清除族
    // K-B3：具名特殊宝石的定量爆破/摧毁（9747「引爆3颗激怒宝石」、9840「引爆4颗许愿宝石」）
    // 护栏：宾语段禁跨逗号（8696「爆破 3 颗宝石，再创造一颗许愿宝石」曾吞成爆破许愿宝石）
    m = /^(?:再|然后|随机)?(爆破|摧毁|引爆|爆炸)\s*(\d+)\s*[颗枚]的?([^，,]+?)宝石$/.exec(c);
    if (m) {
      const gem = matchSpecialGem(m[3]);
      if (gem) {
        this.use('destroyRandomSpecialGems', 'explodeRandomSpecialGems');
        const fn = m[1] === '摧毁' ? 'destroyRandomSpecialGems' : 'explodeRandomSpecialGems';
        state.segments.push(`${fn}('${gem.kind}', ${m[2]}, 0)`);
        return '';
      }
    }
    // 具名特殊宝石的全体爆破/摧毁（9486「引爆所有恶魔传送门宝石」、9381「爆破所有击晕宝石」）
    // ——无 opts 形参，不能挂条件（NO_OPTS_RE 护栏拦截条件用法 9486/9809/9983/9381）
    m = /^(?:再|然后)?(爆破|摧毁|引爆|爆炸)所有(.+?)宝石$/.exec(c);
    if (m) {
      const gem = matchSpecialGem(m[2]);
      if (gem) {
        this.use('destroySpecialGems', 'explodeSpecialGems');
        const fn = m[1] === '摧毁' ? 'destroySpecialGems' : 'explodeSpecialGems';
        state.segments.push(`${fn}('${gem.kind}')`);
        return '';
      }
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(?:一颗|1 颗|1枚|一枚)宝石$/.exec(c);
    if (m) {
      // 裸单颗宝石操作 = 随机一颗（R4 §11 追加）；native colourless ExplodeGems / DestroyGems include Skulls → include:'all'（R015）
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(1, 0, 'all', undefined)`);
      return '';
    }
    // 「随机摧毁 N 颗宝石，摧毁数因X而增强」（7447 黄金计数、9720 屏障盟友计数）＝destroy + modifier rider
    // 「(随机)摧毁 N 颗宝石，摧毁数因X而增强」（7447 黄金计数、9720 屏障盟友计数）＝destroy + modifier rider
    // K-B 收官轮：独立「移除所有C色宝石以增强(伤害)?(效果)?」句（7964——tryCompound 的
    // enhanceRider 只收复合尾；此为独立子句形态，[N:M] 标签挂最近数值段、清除段照编）
    m = /^移除所有(红|蓝|绿|黄|紫|棕)色宝石以(?:增强|强化)(?:此)?(?:伤害)?(?:效果效果|效果)?$/.exec(c);
    if (m) {
      const idx = lastNumericSegment(state.segments);
      if (idx < 0 || !state.tag) return '增强 rider 找不到挂载段或缺少 [N:M] 标签';
      state.segments = withModifierAt(state.segments, idx, { mod: state.tag });
      state.tagUsed = true;
      this.use('destroyColor');
      state.segments.push(`destroyColor(BaseColor.${COLORS[m[1]]})`);
      return '';
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(\d+)\s*[颗枚]的?宝石[，,]?(?:摧毁数|爆破数|数量)?(?:因|受|随)(.+?)(?:而增强|而加强|影响)$/.exec(c);
    if (m) {
      const src = parseModifierSource(m[3]);
      if (!src) return `修饰来源无法解析「${m[3]}」`;
      const mods = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
      if (state.tag) state.tagUsed = true;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${m[2]}, 0, 'all', undefined, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(\d+)\s*[颗枚]的?宝石$/.exec(c);
    if (m) {
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${m[2]}, 0, 'all', undefined)`);
      return '';
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(\d+)\s*[颗枚]选定颜色(?:的)?宝石$/.exec(c)
      || /^(?:随机)?(爆破|摧毁|引爆|爆炸)选定颜色的?\s*(\d+)\s*[颗枚]宝石$/.exec(c);
    if (m) {
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      const nPick = m[3] !== undefined ? m[3] : m[2];
      state.segments.push(`${fn}(${nPick}, 0, 'color', CHOSEN)`);
      return '';
    }
    // 爆破/摧毁 [公式] 颗（的）X色宝石 / 其法力颜色宝石（LAST_TARGET，7928/7986/8084 族）
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*([[\]()魔法x×/ +\d.]+?)\s*[颗枚](?:的)?(红|蓝|绿|黄|紫|棕)色?宝石$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[2]);
      if (!f || f.rangeSpec) return `宝石数量公式无法解析「${m[2]}」`;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${f.base}, ${f.mult}, 'color', BaseColor.${COLORS[m[3]]})`);
      return '';
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*([[\]()魔法x×/ +\d.]+?)\s*[颗枚](?:与其法力颜色同色的?|其?法力颜色的?|该敌人法力颜色的?|敌人法力颜色的?)宝石$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[2]);
      if (!f || f.rangeSpec) return `宝石数量公式无法解析「${m[2]}」`;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${f.base}, ${f.mult}, 'color', 'LAST_TARGET')`);
      return '';
    }
    // 「摧毁 [魔法+1] 颗敌人(队伍)使用最多的颜色宝石」（8529；EN Gems of the most used
    // Enemy Mana Color）＝ColorSpec 'ENEMY_MOST_USED'（R11 批占位符）
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*([[\]()魔法x×/ +\d.]+?)\s*[颗枚]敌人(?:队伍)?使用最多(?:的)?(?:法力)?(?:颜色|色)宝石$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[2]);
      if (!f || f.rangeSpec) return `宝石数量公式无法解析「${m[2]}」`;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${f.base}, ${f.mult}, 'color', 'ENEMY_MOST_USED')`);
      return '';
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*([[\]()魔法x×/ +\d.]+?)\s*[颗枚](?:的)?宝石$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[2]);
      if (!f || f.rangeSpec) return `宝石数量公式无法解析「${m[2]}」`;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${f.base}, ${f.mult}, 'all')`);
      return '';
    }
    // 行列
    m = /^摧毁\s*(\d+)\s*个随机行$/.exec(c);
    if (m) {
      this.use('destroyRandomRows');
      state.segments.push(`destroyRandomRows(${m[1]})`);
      return '';
    }
    // 「随机摧毁一列 / 随机摧毁 2 列」（8619/9387/9484；destroyRandomCols 原语已备）
    m = /^(?:随机)?摧毁\s*(\d+|[一二两三])?\s*[个列](?:随机列|随机)?$/.exec(c)
      || /^随机摧毁一列$/.exec(c);
    if (m && /随机/.test(c)) {
      const n = m[1] ? (/\d/.test(m[1]) ? Number(m[1]) : { 一: 1, 两: 2, 二: 2, 三: 3 }[m[1]]) : 1;
      this.use('destroyRandomCols');
      state.segments.push(`destroyRandomCols(${n}, 0)`);
      return '';
    }
    m = /^(摧毁|爆破)一行$/.exec(c) || /^摧毁 1 行$/.exec(c);
    if (m) {
      this.use('destroyChosenRow');
      state.segments.push('destroyChosenRow()');
      return '';
    }
    m = /^(摧毁|爆破)一列$/.exec(c) || /^(摧毁|爆破) 1 列$/.exec(c);
    if (m) {
      this.use('destroyChosenCol');
      state.segments.push('destroyChosenCol()');
      return '';
    }
    if (/^摧毁 1 组行和列$/.test(c) || /^摧毁一组行跟列$/.test(c)) {
      this.use('destroyChosenRow', 'destroyChosenCol');
      state.segments.push('destroyChosenRow()', 'destroyChosenCol()');
      return '';
    }
    if (/^爆破一列$/.test(c)) {
      this.use('explodeChosenCol');
      state.segments.push('explodeChosenCol()');
      return '';
    }
    // 「爆破 1 行或 1 列」（8448；§9.3 或 = 掷签二选一）
    if (/^爆破\s*1\s*行或\s*1\s*列$/.test(c) || /^爆破一行或一列$/.test(c)) {
      this.use('oneOf', 'explodeChosenRow', 'explodeChosenCol');
      state.segments.push('oneOf([explodeChosenRow()], [explodeChosenCol()])');
      return '';
    }
    // 「选择一宝石，摧毁其行和列」（8721）＝选定宝石的行+列（R22 destroyChosenCross 原语，
    // 7253 同款；此前误记 line-of-gem 缺口——引擎已有 chosenCross 通道）
    if (/^选择.{0,3}宝石[，,]?摧毁其行和列$/.test(c)) {
      this.use('destroyChosenRow', 'destroyChosenCol');
      state.segments.push('{ kind: \'gem\', params: { op: \'clear\', mode: \'destroy\', target: { kind: \'chosenCross\' } } }');
      return '';
    }
    // 「摧毁 X 形宝石」（8965）＝过中心两条对角线（R12 area 'x' 原语）
    if (/^摧毁\s*X\s*形(?:的)?宝石$/.test(c)) {
      this.use('destroyArea');
      state.segments.push(`destroyArea('x', 'destroy')`);
      return '';
    }
    // 「选定一个颜色以移除所有同色宝石」（8511）＝选定色清除（CHOSEN 通道，§1 修饰挂载走 destroyedGems）
    if (/^(?:选定|选择)(?:一个)?颜色(?:以|来|并)?(?:移除|摧毁)所有(?:同色|该色|其色|该颜色)?的?宝石$/.test(c)) {
      this.use('destroyColor');
      state.segments.push('destroyColor(CHOSEN)');
      return '';
    }
    // 摧毁/移除所有：选定颜色 / C色
    // K-B 收官轮：「可摧毁所选颜色的宝石」（8400，EN Destroy Gems of a chosen Color）同口径
    if (/^(?:可)?(?:摧毁|移除)(?:所有)?(?:指定|选定|所选)颜色的?(?:所有)?宝石$/.test(c) || /^移除所有一个选定颜色的宝石$/.test(c)) {
      this.use('destroyColor');
      state.segments.push('destroyColor(CHOSEN)');
      return '';
    }
    m = /^(移除|摧毁)所有(红|蓝|绿|黄|紫|棕)色?的?宝石$/.exec(c);
    if (m) {
      this.use('destroyColor');
      state.segments.push(`destroyColor(BaseColor.${COLORS[m[2]]})`);
      return '';
    }
    m = /^(爆破)所有(红|蓝|绿|黄|紫|棕)色?宝石$/.exec(c);
    if (m) {
      this.use('explodeColor');
      state.segments.push(`explodeColor(BaseColor.${COLORS[m[2]]})`);
      return '';
    }
    return null;
  }

  // —— 增益/治疗 ——
  hBuffHeal(c, state) {
    // 「使 N 名盟友的X翻倍」= 无翻倍原语（诚实 SKIP，不近似）
    const doubleM = /^使\s*\d+\s*[名个]盟友的?(护甲值|攻击力|生命值|魔力值)翻倍/.exec(c);
    if (doubleM) return `「使${doubleM[1]}翻倍」无对应原语（减半有 halve、翻倍无）→ 原语请求：stat 翻倍 buff`;
    // 「(给予/获得) 3 - 15 点法力值」＝段级 rangeSpec（R22 BuffOpts 已备；K-B 收官轮 7414）。
    // 目标词省略（「并给予 3 - 15 点法力值」payload）→ 沿用上文盟友目标 / 自身。
    {
      const rangeM = c.match(/^(?:给予|给|获得|恢复|回复)\s*(\d+)\s*-\s*(\d+)\s*点(法力值|生命值|护甲值|护甲|攻击力|魔力值)$/);
      if (rangeM) {
        const fn = fnOfStat(rangeM[3]);
        const tgt = state.lastAllyTarget ?? 'allySelf';
        this.use(fn, 'flat');
        state.lastAllyTarget = tgt;
        state.segments.push(`${fn}('${tgt}', 0, 0, { rangeSpec: { min: flat(${rangeM[1]}), max: flat(${rangeM[2]}) } })`);
        return '';
      }
    }
    // 「造成等同于其(目标)X的伤害」= 基数取目标属性，无对应缩放原语
    if (/造成等同于其/.test(c)) return '「等同于其攻击力的伤害」基数取目标属性无对应原语 → 原语请求：dmg base = targetStat';
    // 「获得(生命值/攻击力/…)〔，数量〕等同于(被)?减除的X」＝lastReduce 跨段数值绑定
    // （K-B 收官轮，7247/7756——Wave4 lastReduce 来源：前序 reduce 段实际削减额）
    {
      const gainedFirst = c.match(/^(?:获得|恢复|回复)(生命值|护甲值|护甲|攻击力|魔力值)[，,]?(?:数量)?等同于被?(?:减除|降低)的(护甲值|攻击力|魔力值|生命值)(?:值)?$/)
        // 语序变体（7247）：「获得 等同于减除的护甲值 的 攻击力」＝被减属性在前、获得属性在后
        const reducedFirst = c.match(/^(?:获得|恢复|回复)等同于被?(?:减除|降低)的(护甲值|攻击力|魔力值|生命值)(?:值)?的(生命值|护甲值|护甲|攻击力|魔力值)$/);
      if (gainedFirst || reducedFirst) {
        const gained = gainedFirst ? gainedFirst[1] : reducedFirst[2];
        const fn = fnOfStat(gained === '护甲' ? '护甲值' : gained);
        // 尾部 [1:1] 标签即官方「1 per 1」编码 → 直接作本段 modifier 倍率（不再孤儿挂载，
        // 否则与 lastReduce modifier 重复键）；无标签 → 每点削减 +1
        const mod = { mod: state.tag ?? { kind: 'multiplier', a: 1 }, source: { kind: 'lastReduce' } };
        if (state.tag) state.tagUsed = true;
        this.use(fn);
        state.segments.push(`${fn}('allySelf', 0, 0, { modifier: ${jsonMod(mod)} })`);
        return '';
      }
      // 「给予所有同色盟友 N 点属性」（7862）＝选定色（CHOSEN）盟友增益
      const sameM = c.match(/^给予所有同色盟友\s*(\d+)\s*点(生命值|护甲值|护甲|攻击力|魔力值)$/);
      if (sameM) {
        const fn = fnOfStat(sameM[2]);
        this.use(fn);
        state.segments.push(`${fn}('allyAll', ${sameM[1]}, 0, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } })`);
        return '';
      }
    }
    // 「敌方每一拥有X效果的军队，(己方)盟友即各得 N 点…」→ buff + enemyStatusCount 来源（7806）
    {
      const perEnemy = /^(?:同时[，,]?)?敌方每[一有一]?拥有(.+?)效果的?(?:军队|部队|敌人)[，,]?(?:已方|己方|我方)?盟友即?各得(.+)$/.exec(c);
      if (perEnemy) {
        const id = matchStatus(perEnemy[1]);
        if (!id) return `状态词无法识别「${perEnemy[1]}」`;
        const stash = this.buffPieces(perEnemy[2], 'allyAll', state);
        if (typeof stash === 'string') return stash;
        const mod = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'enemyStatusCount', statusId: id } };
        if (state.tag) state.tagUsed = true;
        for (let i = 0; i < stash.length; i++) state.segments.push(appendOpt(stash[i], `modifier: ${jsonMod(mod)}`));
        return '';
      }
    }
    // 恢复自身所有生命值
    if (/^(恢复|回复)自身所有生命值$/.test(c)) {
      this.use('heal');
      state.segments.push("heal('allySelf', 0, 0, { full: true })");
      return '';
    }
    // 「(所有盟友)?全部技能值增加 N 点」＝四项技能（攻/甲/血/魔）各 +N（7294/7864；EN gain N to all Skills）
    // ——按全负面/全正面状态池展开同款口径逐项落段（spell-rules §6 池展开先例）
    {
      const allSk = /^(所有盟友|全体盟友|其他的?盟友|)?(?:的)?(?:全部|所有)技能值增加\s*(\d+)\s*点$/.exec(c);
      if (allSk) {
        const mode = !allSk[1] ? 'allySelf' : /其他/.test(allSk[1]) ? 'allyOthers' : 'allyAll';
        this.use('heal', 'armor', 'attack', 'magic', 'scale', 'flat');
        state.lastAllyTarget = mode;
        state.segments.push(
          `attack('${mode}', ${allSk[2]}, 0)`,
          `armor('${mode}', ${allSk[2]}, 0)`,
          `heal('${mode}', ${allSk[2]}, 0)`,
          `magic('${mode}', ${allSk[2]}, 0)`,
        );
        return '';
      }
    }
    // 「给予所有其他盟友一半法力值 / 将一半法力值给予所有其他盟友」（9564 条件 payload）
    // ＝半条法力给队友（§9.6 gain half mana 口径，allyOthers）
    {
      const halfM = /^(?:给予|给)(所有其他盟友|其他盟友|所有盟友)一半(?:的)?法力值$/.exec(c)
        || /^将一半(?:的)?法力值给予(所有其他盟友|其他盟友|所有盟友)$/.exec(c);
      if (halfM) {
        const mode = halfM[1] === '所有盟友' ? 'allyAll' : 'allyOthers';
        this.use('mana');
        state.lastAllyTarget = mode;
        state.segments.push(`mana('${mode}', 0, 0, { halve: true })`);
        return '';
      }
    }
    // 「恢复我四分之一的法力值」（9580 劫数条件 payload；GenerateQuarterMana 口径）
    if (/^(?:恢复|回复|获得)我?四分之一的?法力值?$/.test(c)) {
      this.use('mana');
      state.lastAllyTarget = 'allySelf';
      state.segments.push(`mana('allySelf', 0, 0, { fraction: 0.25 })`);
      return '';
    }
    // 「每有一名X色/族/王国的敌人(或盟友)，则获得 N 点法力值」（7952 族）＝计数增幅法力
    {
      const perM = /^每有一名(.+?)(盟友|敌人)[，,]?则获得\s*(\d+)\s*点法力值?$/.exec(c);
      if (perM) {
        const src = allySourceOf(perM[1], perM[2] === '敌人');
        if (typeof src === 'string') return src;
        if (!src) return `每一名来源无法解析「${perM[1]}」`;
        const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(perM[3]) }, ...src };
        if (state.tag) state.tagUsed = true;
        this.use('mana');
        state.lastAllyTarget = 'allySelf';
        state.segments.push(`mana('allySelf', ${perM[3]}, 0, { modifier: ${jsonMod(mods)} })`);
        return '';
      }
    }
    // 「每有一名X敌人(盟友)，则给予所有盟友 N 点<属性>」（7982/8047）＝计数增幅全体增益
    {
      const perGrant = /^每有一名(.+?)(盟友|敌人)[，,]?则给予所有盟友\s*(\d+)\s*点(魔力值|生命值|护甲值|攻击力)$/.exec(c);
      if (perGrant) {
        const src = allySourceOf(perGrant[1], perGrant[2] === '敌人');
        if (typeof src === 'string') return src;
        if (!src) return `每一名来源无法解析「${perGrant[1]}」`;
        const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(perGrant[3]) }, ...src };
        if (state.tag) state.tagUsed = true;
        this.use('heal', 'armor', 'attack', 'magic', 'scale', 'flat');
        state.lastAllyTarget = 'allyAll';
        const fn = fnOfStat(perGrant[4]);
        state.segments.push(`${fn}('allyAll', ${perGrant[3]}, 0, { modifier: ${jsonMod(mods)} })`);
        return '';
      }
    }
    // 目标头：获得(自身) / 给予(为)X盟友 / 代词回指（给予其/他们）/ 主语先行（「所有盟友获得」）
    let m = /^(?:自身)?(获得|恢复|回复)\s*(.+)$/.exec(c);
    let target = 'allySelf';
    let rest = c;
    if (m) {
      target = 'allySelf';
      rest = m[2];
    } else if (/^(?:给予|给|为其|为他们)其?(他们|其|他)\s*(.+)$/.test(c)) {
      const pm = /^(?:给予|给|为其|为他们)其?(他们|其|他)\s*(.+)$/.exec(c);
      target = state.lastAllyTarget ?? 'allySelf';
      rest = pm[2];
    } else {
      // 主语先行（「所有盟友获得 [魔法 + 2] 点护甲值」7806）与 随机给予 前缀（10003 族）
      const subj = /^(所有|全体|其他的?)?(?:盟友|友方单位|友军)(?:全体)?(?:获得|恢复|回复)\s*(.+)$/.exec(c);
      const rand = /^随机(?:给予|给予一名|给一名)(一名|一个)?(盟友)\s*(.+)$/.exec(c);
      // 种族限定盟友（「赋予所有怪物盟友/使所有亡灵盟友」9691-10050 族）→ targetRace 通道
      const raceM = /^(?:给予|给|为|使|让|赋予)\s*(所有|全体|一名|一名随机|两名随机|随机一名|2 名随机)?\s*(?:其他|其他的)?([\u4e00-\u9fa5]{1,4}?)族?(?:盟友|盟军)\s*(?:提供|获得|恢复)?\s*(.+)$/.exec(c);
      const colorAllyM = /^(?:给予|给|为|使|让|赋予)(所有|全体)?(?:其他的?)?(红|蓝|绿|黄|紫|棕)色?盟友\s*(?:获得|提供)?\s*(.+)$/.exec(c);
      m = /^(?:给予|给|为|使|让|赋予)\s*(所有|全体|一名|一位|1 名|1 个|两名随机|2 名随机|两名|随机一名|一名随机|前 2 位|前 2 名|选定一名|一名选定|1 名选定)?\s*(?:其他|其他的)?\s*(?:随机一名|一名随机的?)?\s*盟友\s*(?:提供|获得|恢复)?\s*(.+)$/.exec(c);
      if (rand) {
        target = 'allyRandom';
        rest = rand[3];
      } else if (subj) {
        target = (subj[1] && /其他/.test(subj[1])) ? 'allyOthers' : 'allyAll';
        rest = subj[2];
      } else if (colorAllyM) {
        // 「给予所有黄色盟友 5 点攻击力」→ ifCond targetColor 过滤（第三轮用法）
        target = 'allyAll';
        rest = colorAllyM[3];
        state.buffColor = COLORS[colorAllyM[2]];
      } else if (raceM && (RACE_ALIAS[normalizeGroupName(raceM[2] + '族')] || RACE_ALIAS[normalizeGroupName(raceM[2])])) {
        // K-B3：族尾已被 raceM 的 族? 消耗（「狐狸族盟友」m[2]="狐狸"），归一时带族尾重试
        const raceCore = RACE_ALIAS[normalizeGroupName(raceM[2] + '族')] ? normalizeGroupName(raceM[2] + '族') : normalizeGroupName(raceM[2]);
        state.buffRace = RACE_ALIAS[raceCore];
        target = raceM[1] && /随机/.test(raceM[1]) ? 'allyRandomN' : 'allyAll';
        rest = raceM[3];
      } else if (raceM && (isKingdomGroup(raceM[2]) || isKingdomGroup(raceM[2] + '族')) && !m) {
        // K-E 第五轮接线：王国限定盟友增益 → 段级 targetKingdom 过滤（9914 狐狸族=沃尔帕克、10050 流沙）
        const kg = isKingdomGroup(normalizeGroupName(raceM[2] + '族')) ? normalizeGroupName(raceM[2] + '族') : normalizeGroupName(raceM[2]);
        state.buffKingdom = kg;
        target = raceM[1] && /随机/.test(raceM[1]) ? 'allyRandomN' : 'allyAll';
        rest = raceM[3];
      } else if (raceM && !m) {
        return `群体名称无法可靠映射到种族/王国「${raceM[2]}」（语义拿不准）`;
      } else if (m) {
        const grp = m[1] ?? '';
        target = allyTargetOf(grp, /其他/.test(c));
        rest = m[2];
      } else {
        return null;
      }
    }
    // 属性词预检：rest 不含属性词 → 非增益句，放行给后续处理器（如「获得一个额外回合」）
    if (!/(生命值|护甲值|护甲|攻击力|魔力值|法力值|随机技能值|技能点数)/.test(rest)) return null;
    // 数值区间（3 - 15 点法力值）＝段级 rangeSpec（R22 BuffOpts 已备；K-B 收官轮接线，7414）；
    // 仅纯「N - M 点属性」形态走 rangeSpec，其余数值型区间维持 blocked（§9.8 数值不明）
    const rangeOnly = rest.trim().match(/^(\d+)\s*-\s*(\d+)\s*点(生命值|护甲值|护甲|攻击力|魔力值|法力值)$/);
    if (/\d+\s*-\s*\d+\s*点/.test(rest) && !rangeOnly) return '数值型区间（§9.8：数值不明）不做';
    // 按「和」拆分属性段：每段独立取值；无方括号的后续段沿用前段公式（R4「一个方括号管两段」同值口径）
    this.use('heal', 'armor', 'attack', 'magic', 'mana', 'randomStat', 'scale', 'flat');
    state.lastAllyTarget = target;
    // rider：「，数量因X而增强/受X影响」→ modifier 挂本段；来源不可解析 → 增项略去（partial 化，主效果保留）
    // K-B 收官轮：「而加强」机翻词序归一（8191「数值因自身的生命值而加强」，hDamage 同款）
    let buffMod = null;
    const modRider = /[,，]\s*(?:数值|数量|宝石数?量)?(?:因|受|随)(.+?)(?:而增[强加]|而加强|影响)$/.exec(rest);
    let restBase = rest;
    if (modRider) {
      const src = parseModifierSource(modRider[1]);
      if (!src) {
        state.skippedClauses.push(modRider[0]);
        classifyClause(modRider[1], '修饰来源无法解析（§1 exotic 来源）', state.features);
        restBase = rest.slice(0, modRider.index);
      } else {
        buffMod = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
        if (state.tag) state.tagUsed = true;
        restBase = rest.slice(0, modRider.index);
      }
    }
    const race = state.buffRace ?? null;
    const buffColor = state.buffColor ?? null;
    const buffKingdom = state.buffKingdom ?? null;
    state.buffRace = null;
    state.buffColor = null;
    state.buffKingdom = null;
    const stash = this.buffPieces(restBase, target, state, buffMod, race, buffColor, buffKingdom);
    if (typeof stash === 'string') return stash;
    state.segments.push(...stash);
    if (race) state.lastAllyRace = race;
    return '';
  }

  /** 增益/状态混合段解析：属性段 → buff 族段；状态段（「反射效果」）→ inflict；出错返回字符串 */
  buffPieces(restBase, target, state, buffMod = null, race = null, color = null, kingdom = null) {
    const statRe = /(生命值|护甲值|护甲|攻击力|魔力值|法力值|随机技能值|技能点数)/;
    const parts = [];
    const segs = [];
    let lastFormula = null;
    // K-B3：顿号并列（9936「5点攻击力、生命值和护甲值」）与「和」并列同权拆分
    const pieces = restBase.includes('和') || restBase.includes('、') ? restBase.split(/\s*(?:和|、)\s*/) : [restBase];
    for (const piece of pieces) {
      const p = piece.trim();
      // 「3 - 15 点法力值」＝段级 rangeSpec（R22 BuffOpts；K-B 收官轮 7414）
      const rngM = p.match(/^(\d+)\s*-\s*(\d+)\s*点(生命值|护甲值|护甲|攻击力|魔力值|法力值)$/);
      if (rngM) {
        parts.push({ rangeStat: rngM[3], rMin: Number(rngM[1]), rMax: Number(rngM[2]) });
        continue;
      }
      // 「一半的法力值」= mana halve（§9.6 口径）；「四分之一的法力值」= fraction 0.25（K-E，8439）
      const halveM = p.match(/^(?:一半|半数|四分之一)的?(法力值)$/);
      if (halveM) {
        parts.push(/四分之一/.test(p) ? { manaFraction: 0.25 } : { halveMana: true });
        continue;
      }
      // 纯状态段（「反射效果」「屏障和法印」族）：hBuffHeal 的增益/状态混合分支（8842/7624）
      const bareStatus = p.replace(/点/g, '').replace(/^(一个|所有)/, '').trim();
      const statusId = matchStatus(bareStatus);
      if (!/(生命值|护甲值|护甲|攻击力|魔力值|法力值|随机技能值|技能点数)/.test(p) && statusId && bareStatus.length <= 6 && !parseFormulaPrefix(p)) {
        this.use('inflict');
        const sOpts = [];
        if (race) sOpts.push(`targetRace: '${race}'`);
        segs.push(sOpts.length ? `inflict('${statusId}', '${target}', { ${sOpts.join(', ')} })` : `inflict('${statusId}', '${target}')`);
        continue;
      }
      const bareStat = statRe.exec(p.replace(/点/g, '').trim());
      let f = parseFormulaPrefix(p);
      let rest2;
      if (!f) {
        // 「护甲值」裸属性段 → 沿用前段公式（R4 同值口径）
        if (bareStat && lastFormula) {
          f = lastFormula;
          rest2 = p.replace(/点/g, '').trim();
        } else {
          return `增益数值无法解析「${piece}」`;
        }
      } else {
        rest2 = f.rest.trim();
      }
      const sm = statRe.exec(rest2);
      if (!sm) return `增益属性无法解析「${piece}」`;
      const tail = rest2.replace(sm[1], '').trim();
      if (tail !== '') return `增益句残留「${tail}」`;
      lastFormula = f;
      parts.push({ stat: sm[1], f });
    }
    this.use('heal', 'armor', 'attack', 'magic', 'mana', 'randomStat', 'scale', 'flat');
    const mode = target;
    state.lastAllyTarget = mode;
    for (const part of parts) {
      // 「3 - 15 点X」rangeSpec（K-B 收官轮，7414）
      if (part.rangeStat) {
        segs.push(`${fnOfStat(part.rangeStat)}('${mode}', 0, 0, { rangeSpec: { min: flat(${part.rMin}), max: flat(${part.rMax}) } })`);
        continue;
      }
      // 「一半的法力值」= mana halve（§9.6：获得 floor(manaCost/2)，受上限夹取）
      if (part.halveMana) {
        segs.push(`mana('${mode}', 0, 0, { halve: true })`);
        continue;
      }
      // 「四分之一的法力值」= mana fraction 0.25（K-E：GenerateQuarterMana 口径，8439）
      if (part.manaFraction) {
        segs.push(`mana('${mode}', 0, 0, { fraction: ${part.manaFraction} })`);
        continue;
      }
      const { stat: st, f } = part;
      let seg;
      if (f.rangeSpec) {
        seg = `${fnOfStat(st)}('${mode}', 0, 0, { rangeSpec: { min: ${f.rangeSpec.min}, max: ${f.rangeSpec.max} } })`;
      } else if (st === '随机技能值' || st === '技能点数') {
        seg = `randomStat('${mode}', ${f.base}, ${f.mult})`;
      } else {
        seg = `${fnOfStat(st)}('${mode}', ${f.base}, ${f.mult})`;
      }
      if (buffMod) seg = appendOpt(seg, `modifier: ${jsonMod(buffMod)}`);
      if (race) seg = appendOpt(seg, `targetRace: '${race}'`);
      if (kingdom) seg = appendOpt(seg, `targetKingdom: ${krefCode(kingdom)}`);
      if (color) seg = appendOpt(seg, `ifCond: { kind: 'targetColor', color: BaseColor.${color} }`);
      segs.push(seg);
    }
    return segs;
  }

  // —— 削减/耗蓝/窃取 ——
  hReduceDrain(c, state) {
    // 「消除所有敌人全部正面增益效果」= 泛指驱散全部增益 → blocked（spell-rules §6）
    if (/消除所有敌人全部正面增益|驱散所有敌人(的)?全部(正面)?增益/.test(c)) {
      return '泛指「消除敌方全部正面增益」不做（spell-rules §6，逐状态驱散才可表达）';
    }
    let m = /^(?:减除|消除)(一名|所有)?敌人全部(护甲值|攻击力|魔力值|生命值)$/.exec(c)
      // K-B3：「消除其全部护甲值」（8395 条件 payload）目标词回指变体
      || /^(?:减除|消除)(其|该|对方)(?:的)?全部(护甲值|攻击力|魔力值|生命值)$/.exec(c)
      // K-E：「消除一位随机敌人所有护甲值」（8442-8444 劫数条件 payload；所有=全部同义）
      || /^(?:减除|消除)一位随机敌人(所有|全部)(护甲值|攻击力|魔力值|生命值)$/.exec(c);
    if (m) {
      const mode = m[1] === '所有' || m[1] === '全部' ? 'enemyAll'
        : m[1] === '一名' ? 'enemyChosen'
        : /一位随机|一名随机/.test(m[0]) ? 'enemyRandom'
        : refTargetOf(state);
      const stat = m[3] ?? m[2];
      this.use('reduce');
      state.segments.push(`reduce('${mode}', '${statOf(stat)}', 0, 0, { drainAll: true })`);
      return '';
    }
    // （兼容旧双分组形态）
    // 窃取公式+双属性（7803「窃取一名敌人 [魔法 + 1] 点攻击力和护甲值」）＝同公式两段
    // 「(先)破坏其/该敌人/目标的护甲」（9825-9830 劫数条件 payload；EN shatter its Armor）＝
    // 清空护甲（drainAll），目标跨段回指
    m = /^(?:先)?破坏(?:其|该敌人|该|目标|对方)(?:的)?(所有|全部)?护甲值?$/.exec(c);
    if (m) {
      this.use('reduce');
      state.segments.push(`reduce('${refTargetOf(state)}', 'armor', 0, 0, { drainAll: true })`);
      return '';
    }
    // 「窃取一名敌人全部护甲值」（7754；EN Steal all of an enemy's Armor）
    m = /^(?:并)?窃取(?:一名|该|其|此)?(?:敌人)?全部(护甲值|攻击力|魔力值|法力值)$/.exec(c);
    if (m) {
      const mode = /一名/.test(c) ? 'enemyChosen' : refTargetOf(state);
      this.use('steal');
      state.segments.push(`steal('${mode}', '${statOf(m[1])}', '${statOf(m[1])}', 0, 0, { drainAll: true })`);
      return '';
    }
    m = /^减除(?:所有|一名|其|该)?\s*敌人\s*([[\]魔法+ x×/()\d.]+?)\s*点(护甲值|攻击力|魔力值)$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1].trim());
      if (!f || f.rangeSpec) return `削减数值无法解析「${m[1]}」`;
      const head = m[0].match(/^(减除(?:所有|一名|其|该)?)/)[1];
      const mode = /所有/.test(head) ? 'enemyAll' : /其|该/.test(head) ? refTargetOf(state) : /一名/.test(head) ? 'enemyChosen' : 'enemyAll';
      this.use('reduce');
      state.segments.push(`reduce('${mode}', '${statOf(m[2])}', ${f.base}, ${f.mult})`);
      return '';
    }
    m = /^(?:耗掉|消除)((?:所有|一位随机|一名随机|一名)?|该|其)敌人\s*(\d+)\s*点(护甲值|法力值|攻击力)$/.exec(c);
    if (m) {
      const head = m[1] ?? '';
      const mode = head === '所有' ? 'enemyAll' : /随机/.test(head) ? 'enemyRandom' : /一名|一位/.test(head) ? 'enemyChosen' : /该|其/.test(head) ? refTargetOf(state) : 'enemyChosen';
      this.use('reduce');
      state.segments.push(`reduce('${mode}', '${statOf(m[3])}', ${m[2]}, 0)`);
      return '';
    }
    m = /^耗尽(?:该|其|这名|一位|一名)?(第一名和最后一名|所有|前后两名)?敌人(?:们)?的法力值$/.exec(c);
    if (m) {
      let mode = 'enemyChosen';
      if (m[1] === '所有') mode = 'enemyAll';
      else if (m[1] === '第一名和最后一名') {
        this.use('drainMana');
        state.segments.push("drainMana('enemyFront')", "drainMana('enemyLast')");
        return '';
      }
      this.use('drainMana');
      state.segments.push(`drainMana('${mode}')`);
      return '';
    }
    // 「耗尽一名敌人最高 12 点法力值」（7866；reduce 数值段经 0 下限夹取 = up-to 语义，诚实等价）
    m = /^耗尽(?:该|其|这名|一位|一名)?敌人?最?高?至?多?\s*(\d+)\s*点法力值$/.exec(c);
    if (m) {
      const mode = /一名/.test(c) ? 'enemyChosen' : refTargetOf(state);
      this.use('reduce');
      state.segments.push(`reduce('${mode}', 'mana', ${m[1]}, 0)`);
      return '';
    }
    m = /^耗掉(?:该|其|这名|一名|一位|一名随机)?敌人(所有的?|全部的?)?法力值$/.exec(c) || /^耗尽(?:该|其|这名|他)(?:的)?(?:所有)?法力值$/.exec(c);
    if (m) {
      this.use('drainMana');
      state.segments.push(`drainMana('${/随机/.test(c) ? 'enemyRandom' : /一名|一位/.test(c) ? 'enemyChosen' : refTargetOf(state)}')`);
      return '';
    }
    // 「吸取目标的所有法力值」（9811 条件 payload；= 耗尽其法力，无自得）
    m = /^吸取(?:其|该敌人|目标|对方|敌人)(?:的)?(?:所有)?法力值$/.exec(c);
    if (m) {
      this.use('drainMana');
      state.segments.push(`drainMana('${refTargetOf(state)}')`);
      return '';
    }
    // 窃取生命 = 伤害 drain（batch-01 口径）；目标词可在前可在后
    // K-B3：「第一位敌人」8520、「窃取其 N 点生命值」8952（条件 payload，跨段回指）
    m = /^(?:从)?(?:第一名敌人|第一位敌人|第\s*1\s*位敌人|一名敌人|最后两名敌人|最弱的两名敌人|一名随机敌人)窃取\s*([[\]（）()魔法x×/ +\d.]+?)\s*点生命值$/.exec(c)
      || /^窃取(?:第一名敌人|第一位敌人|第\s*1\s*位敌人|一名敌人|最后两名敌人|最弱的两名敌人|一名随机敌人|其|该敌人|对方|目标)?\s*([[\]（）()魔法x×/ +\d.]+?)\s*点生命值$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1]);
      if (!f || f.rangeSpec) return `窃取数值无法解析「${m[1]}」`;
      const mode = /第一名|第一位|第\s*1\s*位/.test(c) ? 'enemyFront' : /最后两名/.test(c) ? 'enemyLastN' : /最弱的两名/.test(c) ? 'enemyWeakestN' : /随机/.test(c) ? 'enemyRandom' : /其|该敌人|对方|目标/.test(c) ? refTargetOf(state) : 'enemyChosen';
      const n = /最后两名|最弱的两名/.test(c) ? `, { n: 2, drain: true }` : `, { drain: true }`;
      this.use('dmg');
      state.segments.push(`dmg('${mode}', ${f.base}, ${f.mult}${n})`);
      state.lastTargetMode = mode;
      return '';
    }
    // 窃取属性（无「转为X」子句 → 同属性自得，§3 窃取口径；有 → steal 换属性）
    // K-B3：法力值入表（8879「并窃取 6 点法力值」）
    m = /^(?:并)?窃取(?:一名敌人|一名随机敌人|敌人身上的?|从敌人身上)?\s*(\d+)\s*点(护甲值|护甲|攻击力|魔力值|法力值)$/.exec(c)
      || /^从敌人身上窃取\s*(\d+)\s*点(护甲值|护甲|攻击力|魔力值|法力值)$/.exec(c);
    if (m) {
      this.use('steal');
      const st = statOf(m[2]);
      const mode = /随机/.test(c) ? 'enemyRandom' : /敌人/.test(c) ? 'enemyChosen' : refTargetOf(state);
      state.segments.push(`steal('${mode}', '${st}', '${st}', ${m[1]}, 0)`);
      return '';
    }
    // 窃取公式+双属性（7803「窃取一名敌人 [魔法 + 1] 点攻击力和护甲值」）＝同公式两段
    m = /^(?:并)?窃取(?:一名|该|其)?(?:敌人)?\s*(\[[^\]]*\])\s*点?(护甲值|护甲|攻击力|魔力值|法力值)和(护甲值|护甲|攻击力|魔力值|法力值)$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1]);
      if (!f || f.rangeSpec) return `窃取数值无法解析「${m[1]}」`;
      this.use('steal');
      const mode = /一名/.test(c) ? 'enemyChosen' : refTargetOf(state);
      const stA = statOf(m[2]);
      const stB = statOf(m[3]);
      state.segments.push(`steal('${mode}', '${stA}', '${stA}', ${f.base}, ${fmtN(f.mult)})`);
      state.segments.push(`steal('${mode}', '${stB}', '${stB}', ${f.base}, ${fmtN(f.mult)})`);
      return '';
    }
    // 窃取属性转属性（公式变体：「窃取一名敌人 [魔法 + 1] 点魔力值，并将之转换成攻击力」8378）
    m = /^(?:并)?窃取(?:一名敌人|一名随机敌人|敌人身上的?|从敌人身上)?\s*([[\]（）()魔法x×/ +\d.]+?)\s*点(护甲值|护甲|攻击力|魔力值)(?:，?并将之转为|，?并将之转换成|，?并将之转换为)(护甲值|攻击力|魔力值|法力值)$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1].trim());
      if (!f || f.rangeSpec) return `窃取数值无法解析「${m[1]}」`;
      this.use('steal');
      const mode = /随机/.test(c) ? 'enemyRandom' : 'enemyChosen';
      state.segments.push(`steal('${mode}', '${statOf(m[2])}', '${statOf(m[3])}', ${f.base}, ${f.mult})`);
      return '';
    }
    // 「降低一名敌人1点攻击力和4点魔力值」→ reduce 双段（9985 族）
    m = /^(?:降低|减低)(一名|所有|其|该)?(?:敌人|对方的?)(.+)$/.exec(c);
    if (m) {
      let payload = m[2];
      // 「受诅咒敌人影响时效果更佳」= 模糊增幅（无量化）→ 增项略去，主效果照编
      const vague = payload.match(/[,，](?:受诅咒(?:的)?(?:敌人)?影响时效果更佳|对被诅咒的(?:敌人)?效果更佳)$/);
      if (vague) {
        state.skippedClauses.push(vague[0].replace(/^[，,]/, ''));
        classifyClause(vague[0], '修饰来源无法解析（§1 exotic 来源）', state.features);
        payload = payload.slice(0, vague.index);
      }
      const mode = m[1] === '所有' ? 'enemyAll' : (m[1] === '其' || m[1] === '该') ? refTargetOf(state) : 'enemyChosen';
      const stash = this.buffPieces(payload, mode, state);
      // buffPieces 产出 buff 族段；reduce 复用同一解析（攻击力/魔力值/护甲值段）
      if (typeof stash === 'string') return stash;
      const conv = [];
      for (const seg of stash) {
        const rm = /^(\w+)\('([^']+)',\s*(-?\d+),\s*(-?\d+)\)/.exec(seg);
        if (!rm || !/^(attack|armor|magic|heal)$/.test(rm[1])) return `降低属性段无法解析「${seg.slice(0, 40)}」`;
        const stat = { attack: 'attack', armor: 'armor', magic: 'magic', heal: 'hp' }[rm[1]];
        this.use('reduce');
        conv.push(`reduce('${rm[2]}', '${stat}', ${rm[3]}, ${rm[4]})`);
      }
      state.segments.push(...conv);
      return '';
    }
    // 「每有一个亡灵盟友，则消耗 3 点法力值」（9579）＝按盟友族计数的耗蓝 → reduce + alliesOfRace 来源
    m = /^每有一[名个](.+?)盟友[，,]?则(?:消耗|耗掉)\s*(\d+)\s*点法力值(?:值)?$/.exec(c);
    if (m) {
      const src = allySourceOf(m[1], false);
      if (typeof src === 'string') return src;
      if (!src) return `每一名来源无法解析「${m[1]}」`;
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: Number(m[2]) }, ...src };
      if (state.tag) state.tagUsed = true;
      this.use('reduce');
      state.segments.push(`reduce('${refTargetOf(state)}', 'mana', ${m[2]}, 0, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 「窃取其/该敌人法力值」= 耗尽+自得（steal mana drainAll）
    m = /^窃取其?(法力值|护甲值|攻击力)$/.exec(c);
    if (m) {
      this.use('steal');
      const st = statOf(m[1]);
      state.segments.push(`steal('${refTargetOf(state)}', '${st}', '${st}', 0, 0, { drainAll: true })`);
      return '';
    }
    // 「随机窃取 N 点能力值」/「从每名敌人身上窃取 1 点随机技能值」/「消除 N 点随机技能值」（8440）
    // ＝官方 StealRandom/DecreaseRandom（R12 已落 stat='random' 通道；K-B 收官轮接线回收——
    // 此前按 batch-01 缺口诚实略去）。窃取 → stealRandomStat（同项自得）；消除 → reduce random。
    // 数值可带公式（8440「消除 [魔法 + 1] 点随机技能值」）。
    {
      const rs = /^(?:从每名敌人身上)?(?:随机)?(窃取|消除|减除)\s*(\[[^\]]*\]|\d+)\s*点(?:的)?(?:能力值|随机技能值)$/.exec(c);
      if (rs) {
        const f = parseFormulaPrefix(rs[2]);
        if (!f || f.rangeSpec) return `随机技能值数值无法解析「${rs[2]}」`;
        if (rs[1] === '窃取') {
          this.use('stealRandomStat');
          const mode = /每名敌人/.test(c) ? 'enemyAll' : /随机/.test(c) ? 'enemyRandom' : /敌人/.test(c) ? 'enemyChosen' : refTargetOf(state);
          state.segments.push(`stealRandomStat('${mode}', ${f.base}, ${fmtN(f.mult)})`);
        } else {
          this.use('reduce');
          const mode = /每名敌人/.test(c) ? 'enemyAll' : /随机一名|一名随机/.test(c) ? 'enemyRandom' : /敌人/.test(c) ? 'enemyChosen' : refTargetOf(state);
          state.segments.push(`reduce('${mode}', 'random', ${f.base}, ${fmtN(f.mult)})`);
        }
        return '';
      }
    }
    // 窃取属性转属性
    m = /^窃取一名敌人\s*(\d+)\s*点(护甲值|攻击力|魔力值)(?:并将之转为|并将之转换成|，并将之转换为)(护甲值|攻击力|魔力值|法力值)$/.exec(c);
    if (m) {
      this.use('steal');
      state.segments.push(`steal('enemyChosen', '${statOf(m[2])}', '${statOf(m[3])}', ${m[1]}, 0)`);
      return '';
    }
    return null;
  }

  // —— 净化 / 额外回合 / 击杀几率 ——
  hCleanseExtraTurn(c, state) {
    // 「将其净化/把他们净化」→ 跨段回指目标（7624/8404）
    let m = /^(?:将|把)(其|他|她|他们|该敌人)净化$/.exec(c);
    if (m) {
      this.use('cleanse');
      state.segments.push(`cleanse('${m[1] === '该敌人' ? 'lastTarget' : 'lastTarget'}')`);
      return '';
    }
    // 「(并)将其净化和赋予其X效果」→ cleanse + inflict 同目标（8404）
    m = /^(?:并)?将其?(.+?)净化和赋予其?(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[2]);
      if (!id) return `状态词无法识别「${m[2]}」`;
      this.use('cleanse', 'inflict');
      state.segments.push(`cleanse('lastTarget')`, `inflict('${id}', 'lastTarget')`);
      return '';
    }
    // 「净化和赋予TARGET X效果」→ 目标同时作用于两段（7446）
    m = /^净化和赋予(.+?)盟友(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[2]);
      if (!id) return `状态词无法识别「${m[2]}」`;
      const tgt = statusTarget(m[1] + '盟友', state);
      if (tgt === null) return `状态目标无法解析「${c}」`;
      this.use('cleanse', 'inflict');
      state.segments.push(`cleanse('${tgt.mode}')`, statusSegOpts(`inflict('${id}', '${tgt.mode}')`, tgt));
      state.lastAllyTarget = tgt.mode;
      return '';
    }
    // 「有 N% 的几率(直接)杀死敌人，如果敌人已中毒，几率将增加至 M%」→ execute + chanceBoost（7380）
    m = /^有\s*(\d+)\s*%\s*的(?:几|机)率(?:直接)?(?:杀死|杀戮|击杀)(?:敌人|对方|其)?[，,]如果敌人已?(.+?)[，,]?(?:几|机)率将增加至\s*(\d+)\s*%$/.exec(c);
    if (m) {
      const id = matchStatus(m[2]);
      if (!id) return `几率条件状态无法识别「${m[2]}」`;
      this.use('dmg');
      const boostA = state.tag ?? { kind: 'multiplier', a: Number(m[3]) - Number(m[1]) };
      if (state.tag) state.tagUsed = true;
      const killSpec = jsonMod({ mod: boostA, source: { kind: 'enemyStatusCount', statusId: id } });
    state.segments.push(`dmg('lastTarget', 0, 0, { execute: true, chance: ${Number(m[1]) / 100}, chanceBoost: ${killSpec} })`);
      state.lastChanceSeg = state.segments.length - 1;
      return '';
    }
    // 「有 N% 的几率(直接)杀死敌人/对方」（独立子句；8664 族在伤害句内联处理）
    m = /^(?:有)?\s*(\d+)\s*%\s*的(?:几|机)率(?:直接)?(?:杀死|杀戮|击杀)(?:敌人|对方|其)?$/.exec(c);
    if (m) {
      this.use('dmg');
      state.segments.push(`dmg('lastTarget', 0, 0, { execute: true, chance: ${Number(m[1]) / 100} })`);
      state.lastChanceSeg = state.segments.length - 1;
      return '';
    }
    // 「每有一颗X则几率增强 N%」→ 挂最近 execute 段的 chanceBoost（8664）
    m = /^每有一颗?(.+?)则(?:几率|机率)(?:将)?增强\s*(\d+)\s*%$/.exec(c);
    if (m) {
      const idx = state.lastChanceSeg >= 0 ? state.lastChanceSeg : lastKind(state.segments, /execute: true/);
      if (idx < 0) return '几率增强找不到前置 execute 段';
      const src = parseModifierSource(m[1]);
      if (!src?.source) return `几率来源无法解析「${m[1]}」`;
      const mod = { mod: state.tag ?? { kind: 'multiplier', a: Number(m[2]) }, ...src };
      if (state.tag) state.tagUsed = true;
      state.segments[idx] = appendOpt(state.segments[idx], `chanceBoost: ${jsonMod(mod)}`);
      return '';
    }
    // 「几率因X而增强」（8083，无量化 N）——倍率取尾部 [xN] 标签（EN boosted by Doomskulls [x2]
    // = 每颗末日骷髅 +2%）；无标签 → 模糊增幅，记省略不硬凑
    m = /^几率因(.+?)而增强$/.exec(c);
    if (m) {
      const idx = state.lastChanceSeg >= 0 ? state.lastChanceSeg : lastKind(state.segments, /execute: true/);
      if (idx < 0 || !state.tag) {
        state.skippedClauses.push(c);
        classifyClause(c, '修饰来源无法解析（§1 exotic 来源）', state.features);
        return '';
      }
      const src = parseModifierSource(m[1]);
      if (!src?.source) return `几率来源无法解析「${m[1]}」`;
      const mod = { mod: state.tag, ...src };
      state.tagUsed = true;
      state.segments[idx] = appendOpt(state.segments[idx], `chanceBoost: ${jsonMod(mod)}`);
      return '';
    }
    // 「有 N% 的几率吞噬一名(随机)敌人」（7293）＝官方 Devour（R22 devour 原语：即杀+
    // 吞噬者成长；掷签在原语内部，chance 恒必填）
    m = /^(?:有)?\s*(\d+)\s*%\s*的(?:几|机)率吞噬一名?(随机的?)?(敌人|盟友)$/.exec(c);
    if (m) {
      const mode = m[3] === '盟友' ? 'allyRandom' : /随机/.test(m[2] ?? '') ? 'enemyRandom' : 'enemyChosen';
      this.use('devour');
      state.segments.push(`devour('${mode}', { chance: ${Number(m[1]) / 100} })`);
      return '';
    }
    // 「(并)将其吞噬」跨段回指变体（ devour 无几率口径=必中）
    m = /^(?:并)?将(?:其|该敌人|该|一名随机敌人|一名敌人)吞噬$/.exec(c);
    if (m) {
      const mode = /随机/.test(m[0]) ? 'enemyRandom' : /其|该/.test(m[0]) ? refTargetOf(state) : 'enemyChosen';
      this.use('devour');
      state.segments.push(`devour('${mode}', { chance: 1 })`);
      return '';
    }
    if (/^净化(自身|所有盟友|一名盟友|一名随机盟友|所有其他的?盟友|所有其他的?)?$/.test(c)) {
      this.use('cleanse');
      const mode = /自身/.test(c) ? 'allySelf' : /其他/.test(c) ? 'allyOthers' : /随机/.test(c) ? 'allyRandom' : 'allyAll';
      state.segments.push(`cleanse('${mode}')`);
      return '';
    }
    if (/^净化一名盟友$/.test(c)) {
      this.use('cleanse');
      state.segments.push("cleanse('allyChosen')");
      return '';
    }
    m = /^(?:再)?(?:可)?获得(?:一个|\s*1\s*个)?额外(?:的)?回合$/.exec(c) || /^(?:可)?获得额外的?回合$/.exec(c);
    if (m) {
      this.use('extraTurn');
      state.segments.push('extraTurn()');
      return '';
    }
    m = /^有\s*(\d+)\s*%\s*的几率获得一个额外回合(?:，几率因(.+?)而增强)?$/.exec(c);
    if (m) {
      this.use('extraTurn');
      const opts = [`chance: ${Number(m[1]) / 100}`];
      if (m[2]) {
        const src = parseModifierSource(m[2]);
        if (!src) return `几率来源无法解析「${m[2]}」`;
        const mod = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
        if (state.tag) state.tagUsed = true;
        opts.push(`chanceBoost: ${jsonMod(mod)}`);
      }
      state.segments.push(`extraTurn({ ${opts.join(', ')} })`);
      return '';
    }
    // 「有 N% 个别几率获得 A 和 B」＝多项独立掷签（8283；EN There are independent N% chances
    // to gain an extra turn and half my mana back）——各段各挂 chance，非 oneOf 二选一。
    // 「几率因X而增强」无量化倍率（模糊增幅）→ 增项略去（主效果照编，9720 vague 同款）。
    m = /^有\s*(\d+)\s*%\s*的?(?:个别|分别|独立)?(?:几|机)率(?:地)?获得(.+)$/.exec(c);
    if (m && !/下列其一/.test(c)) { // 「获得下列其一」= 经济多选一（8153/7304 族），交 hEconomy
      const chance = Number(m[1]) / 100;
      let payload = m[2];
      let boost = null;
      const vague = payload.match(/，几率因(.+?)而增强$/);
      if (vague) {
        // K-B 收官轮：几率增幅先尝试解析来源（8283「几率因棕色宝石数而增强」= boardGems），
        // 可解析 → chanceBoost 挂段；不可解析才按模糊增幅记省略
        const src = parseModifierSource(vague[1]);
        if (src?.source) {
          boost = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
          if (state.tag) state.tagUsed = true;
          payload = payload.slice(0, vague.index);
        } else {
          state.skippedClauses.push(`几率因${vague[1]}而增强`);
          classifyClause(`几率因${vague[1]}而增强`, '修饰来源无法解析（§1 exotic 来源）', state.features);
          payload = payload.slice(0, vague.index);
        }
      }
      const parts2 = payload.split('和').map((s) => s.trim());
      const segs2 = [];
      for (const p of parts2) {
        const b = boost ? `, chanceBoost: ${jsonMod(boost)}` : '';
        if (/额外(?:的)?回合/.test(p)) {
          this.use('extraTurn');
          segs2.push(`extraTurn({ chance: ${chance}${b} })`);
        } else if (/半数法力值|一半法力值/.test(p)) {
          this.use('mana');
          segs2.push(`mana('allySelf', 0, 0, { halve: true, chance: ${chance}${b} })`);
        } else {
          return `独立几率项无法解析「${p}」`;
        }
      }
      state.segments.push(...segs2);
      return '';
    }
    return null;
  }

  // —— 风暴 / 召唤 ——
  hStormSummon(c, state) {
    let m = /^(?:创造|发起|召唤)(?:一个|一场|一名)?(尘|冰|叶|火|光|暗|地狱|电)?风暴$/.exec(c);
    if (m) {
      const cn = m[1];
      if (!cn) return '风暴颜色缺失（语义拿不准）';
      const color = STORM_COLORS[cn];
      if (!color) return `风暴颜色无法映射「${cn}」`;
      this.use('createStorm');
      state.segments.push(`createStorm(BaseColor.${color})`);
      return '';
    }
    // 群体召唤（后缀 军队/部队/军团/盟友 可省略——「召唤一名随机恶魔」）；「召唤 1 到 3 名X军队」countRange（§12.4）
    // K-B3：「召唤一条龙」9649 量词变体、「召唤地狱岩部队」9577 冠词省略变体（群体后缀锚定）、
    // 「随机召唤」前缀（9649 条件 payload）
    const SUMMON_HEAD = String.raw`(?:随机(?:的)?)?召唤`;
    const GROUP_WORD_RE = /军队|部队|军团|盟友|恶魔|不死族|亡灵|元素|神祇|纳迦|半人马|人马|巨人|矮人|人类|兽人|骑士|龙族|龙|野兽|哥布林|妖仙|精灵|怪兽|怪物|构装体|建造|猫族|罗刹|金牛座|牛头族|狼族|战神|蛮族|厄什卡|乌尔斯卡|罗格|冥河|猎鹰|美人鱼|魔头|小鬼|科博|Stryx|Dhrak-Zum/;
    // K-B 收官轮：群体词表之外的王国名（毒菇林/滴答洞穴等经 KINGDOM_ALIAS 归一后命中）
    // 亦可召唤 → isKingdomGroup 兜底（8529/8140/8816）
    m = (GROUP_WORD_RE.test(c) || isKingdomGroup(c))
      ? (new RegExp(`^${SUMMON_HEAD}\\s*(\\d+)\\s*到\\s*(\\d+)\\s*[名个](?:随机的?|一名随机)?(.+?)$`).exec(c)
        || new RegExp(`^${SUMMON_HEAD}(?:一名|一个|一支|一条|一头|一名随机的?)(?:随机的?|一名随机)?(.+?)$`).exec(c)
        || new RegExp(`^${SUMMON_HEAD}(?:随机的?)?(.+?)(?:军队|部队|军团)$`).exec(c))
      : null;
    if (m) {
      const countRange = m[2] !== undefined && /^\d+$/.test(m[2]) ? { min: Number(m[1]), max: Number(m[2]) } : undefined;
      const grp = (countRange ? m[3] : m[1]).replace(/(?:军队|部队|军团|盟友)$/, '').replace(/的$/, '').trim();
      const refs = this.resolveGroupRefs(grp);
      if (typeof refs === 'string') return refs;
      const opts = countRange ? `, undefined, { countRange: { min: ${countRange.min}, max: ${countRange.max} } }` : ', undefined';
      // K-E：王国随机召唤（「召唤一名盖塔尔军队」「召唤 1 到 3 名迈纳杰之罪军队」7816）
      if (refs && refs.kingdom) {
        this.use('summonRandomOfKingdom');
        state.segments.push(`summonRandomOfKingdom('${refs.kingdom}'${opts})`);
        return '';
      }
      this.use('summonRandom', 'summonRef');
      if (refs.length === 1) state.segments.push(`summonRef('${refs[0]}'${opts})`);
      else state.segments.push(`summonRandom([${refs.map((r) => `'${r}'`).join(', ')}]${opts})`);
      return '';
    }
    // 召唤一颗龙蛋或恶龙蛋（具名二选一）
    m = /^召唤一颗(.+?)或(.+?)$/.exec(c);
    if (m) {
      const a = this.resolveTroopName(m[1]);
      const b = this.resolveTroopName(m[2]);
      const refA = a ? troopsRefByName(a) : null;
      const refB = b ? troopsRefByName(b) : null;
      if (refA && refB) {
        this.use('summonRandom');
        state.segments.push(`summonRandom(['${refA}', '${refB}'], undefined)`);
        return '';
      }
      return `召唤引用无法解析「${m[1]} / ${m[2]}」`;
    }
    // 召唤一个X（具名单体，如亡魂）
    m = /^召唤(?:一个|一名)(?:的)?(.+?)$/.exec(c);
    if (m) {
      const name = this.resolveTroopName(m[1]);
      if (!name) return `召唤引用无法解析「${m[1]}」（troops.json 无此中文名）`;
      const ref = troopsRefByName(name);
      this.use('summonRef');
      state.segments.push(`summonRef('${ref}', undefined)`);
      return '';
    }
    return null;
  }

  // —— 调位 / 打乱 ——
  hRepositionMisc(c, state) {
    // 「将 1-2 位敌人由首位打到末位」（8074）＝数量区间的调位（reposition 仅支持固定 n）→ 定性略去
    if (/由首位打到末位|从首位打到末位/.test(c)) {
      return `「由首位打到末位」数量区间调位（reposition 无 nRange）→ 原语请求：reposition nRange`;
    }
    // 「爆破一颗宝石，并摧毁该行」：行绑定爆破宝石位置，无对应原语
    if (/爆破一颗宝石.*摧毁该行/.test(c)) {
      return '「摧毁该行」绑定被爆破宝石的位置，无对应清除原语 → 原语请求：clear line-of-gem';
    }
    let m = /^(?:将)?一名敌人拉到首位$/.exec(c);
    if (m) {
      this.use('reposition');
      state.segments.push("reposition('enemyChosen', 'front')");
      return '';
    }
    // K-B 收官轮：「将一名军队拉到首位」（7295；EN "Pull an Enemy to first position"——
    // 「军队」= MT 对 Enemy troop 的泛称，与既有「将一名敌人拉到首位」同口径）
    m = /^将(?:一名|一个)(?:军队|部队)拉到首位$/.exec(c);
    if (m) {
      this.use('reposition');
      state.segments.push("reposition('enemyChosen', 'front')");
      return '';
    }
    if (/^将一名敌人和自身拉到首位$/.test(c)) {
      this.use('reposition');
      state.segments.push("reposition('enemyChosen', 'front')", "reposition('allySelf', 'front')");
      return '';
    }
    // 「将末位/最后一名敌人拉到前方/首位」（8643）
    m = /^将(末位|末名|最后(?:一名|一位|一个)?|最末位|首位|第一名)的?敌人拉到(?:队伍)?(前方|首位|最前)$/.exec(c);
    if (m) {
      this.use('reposition');
      const mode = /末|最后|最末/.test(m[1]) ? 'enemyLast' : 'enemyFront';
      state.segments.push(`reposition('${mode}', 'front')`);
      return '';
    }
    // 「将敌人打回末位/最后」（9383 条件 payload）、「将其打回末位」（8130）
    m = /^将(?:该|其|这名|一名)?敌人打回(?:队伍)?(末位|最后|末端)$/.exec(c) || /^将其打回(?:队伍)?(末位|最后|末端)$/.exec(c);
    if (m) {
      this.use('reposition');
      state.segments.push(`reposition('${/其|该|这名/.test(m[0]) ? refTargetOf(state) : 'lastTarget'}', 'back')`);
      return '';
    }
    // 「将其击回末位」
    m = /^将(?:其|他|该敌人)击回末位$/.exec(c);
    if (m) {
      this.use('reposition');
      state.segments.push(`reposition('${refTargetOf(state)}', 'back')`);
      return '';
    }
    if (/^(?:并)?(?:使自身)?移至队伍首位$/.test(c) || /^使自身转移至首位$/.test(c)) {
      this.use('reposition');
      state.segments.push("reposition('allySelf', 'front')");
      return '';
    }
    // 「再将其拉到首位」（跨段回指）
    if (/^(?:再)?将其?拉到(首位|最前)$/.test(c)) {
      this.use('reposition');
      state.segments.push(`reposition('${refTargetOf(state)}', 'front')`);
      return '';
    }
    if (/^打乱板面$/.test(c)) {
      this.use('shuffleBoard');
      state.segments.push('shuffleBoard()');
      return '';
    }
    if (/^打乱敌方队伍(?:队形|阵容)?$/.test(c)) {
      this.use('shuffleTeam');
      state.segments.push("shuffleTeam('enemy')");
      return '';
    }
    return null;
  }

  // —— 经济（§10）——
  hEconomy(c, state) {
    // 「有 N% 的几率获得下列其一：A、B 或 C」→ 段级 chance + oneOf（8153 族）
    let m = /^(?:有)?\s*(\d+)\s*%\s*的几率获得下列其一：(.+)$/.exec(c);
    if (m) {
      const arms = m[2].split(/[、或]/).map((s) => s.trim()).filter(Boolean);
      const branches = [];
      for (const arm of arms) {
        const am = arm.match(/^(\d+)\s*[个张点]?(灵魂|黄金|金币|藏宝图)$/);
        if (!am) return `经济选项无法解析「${arm}」`;
        if (/灵魂/.test(am[2])) { this.use('gainSouls'); branches.push(`gainSouls(${am[1]}, 0)`); }
        else if (/藏宝图/.test(am[2])) { this.use('gainMaps'); branches.push(`gainMaps(${am[1]}, 0)`); }
        else { this.use('gainGold'); branches.push(`gainGold(${am[1]}, 0)`); }
      }
      // oneOf 构造器不带 opts → 直写段对象（段联合支持 chance）
      state.segments.push(`{ kind: 'oneOf', options: [${branches.map((b) => `[${b}]`).join(', ')}], chance: ${Number(m[1]) / 100} }`);
      return '';
    }
    m = /^获得\s*([[\]魔法+ x×/()\d.]+?)\s*(?:点)?(?:黄金|金币)$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1].trim());
      if (!f || f.rangeSpec) return `黄金数值无法解析「${m[1]}」`;
      this.use('gainGold');
      state.segments.push(`gainGold(${f.base}, ${f.mult})`);
      return '';
    }
    m = /^获得\s*([[\]魔法+ x×/()\d.]+?)\s*(?:点|个)?灵魂$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1].trim());
      if (!f || f.rangeSpec) return `灵魂数值无法解析「${m[1]}」`;
      this.use('gainSouls');
      state.segments.push(`gainSouls(${f.base}, ${f.mult})`);
      return '';
    }
    m = /^(?:有)?\s*(\d+)\s*%\s*的几率获得一张藏宝图$/.exec(c);
    if (m) {
      this.use('gainMaps');
      state.segments.push(`gainMaps(1, 0, { chance: ${Number(m[1]) / 100} })`);
      return '';
    }
    return null;
  }

  /** 群体名 → 召唤引用清单；王国 → { kingdom }（K-E summonRandomOfKingdom）；失败返回错误字符串 */
  resolveGroupRefs(grp) {
    if (grp === '全视之眼') return OCULAREN_REFS;
    // 具名部队族（K-B 收官轮：小鬼=Imp 族、科博=Kobold 族——troops.json 无该 troopType，
    // 按 name/referenceName 反查固定清单，batch-08 全视之眼先例）
    if (NAMED_GROUP_REFS[grp]) return NAMED_GROUP_REFS[grp];
    if (RACE_ALIAS[grp]) {
      const race = RACE_ALIAS[grp];
      const refs = this.raceRefs.get(race);
      if (!refs || refs.length === 0) return `种族 ${race} 在 troops.json 无成员`;
      return refs;
    }
    // 王国随机召唤（K-E 第五轮接线，summonRandomOfKingdom）；机翻变体先归一（K-B3）
    if (isKingdomGroup(grp)) return { kingdom: normalizeGroupName(grp) };
    return `群体名称无法可靠映射到种族/王国「${grp}」（语义拿不准）`;
  }

  /** 条件里的兵种名 → troops.json name（永生神系等）；失败 null。
   *  机翻称号归一：「不朽者X」→「不朽的X」（troops.json 既有拼写）。
   *  K-B3：机翻译名差一位/丢「的」——「不朽的拉奇亚」→「不朽的拉基亚」、「永生塞勒涅」→
   *  「不朽的塞勒涅」、「不朽的怪物」→「不朽的龟背竹」（EN 原文 Monstera 实锤）等，
   *  经 TROOP_NAME_ALIAS + 前缀补全二次尝试；仍无 → null 不硬凑。 */
  resolveTroopName(text) {
    const troops = loadTroops();
    const names = troops.map((x) => x.name);
    const attempt = (t) => {
      const v = t.replace(/^不朽者/, '不朽的').trim();
      if (names.includes(v)) return v;
      for (const [mt, canon] of Object.entries(TROOP_NAME_ALIAS)) {
        const v2 = v.split(mt).join(canon);
        if (v2 !== v && names.includes(v2)) return v2;
      }
      return null;
    };
    const direct = attempt(text);
    if (direct) return direct;
    // K-B 收官轮：zh 快照里残留 EN 原文名（9490「Immortal Furnax」）→ referenceName
    // 去空格回退（ImmortalFurnax），取回官方 zh name
    const refHit = troops.find((x) => x.referenceName === text.replace(/\s+/g, ''));
    if (refHit) return refHit.name;
    // 「永生塞勒涅 / 不朽双子 / 永生的 Scoprio」类前缀缺失/变体 → 前缀归一重试
    const stripped = text.replace(/^(?:永生神|永生|不朽的|不朽)的?\s*/, '').trim();
    if (stripped && stripped !== text) {
      for (const prefix of ['不朽的', '永生神']) {
        const hit = attempt(prefix + stripped);
        if (hit) return hit;
      }
    }
    return null;
  }
}

// —— 段构造小工具 ——
/** 段构造：成功 { seg }，失败 { err }（调用方据此区分错误与产物）。
 *  Wave B 六色族（龙/巨人/灵力/法力药水/糖果）文本带色时经 spec.color 通道携带；
 *  石像鬼以 tier 区分善/恶。 */
function createGemCall(compiler, what, n, mod, allowBareColor = false) {
  compiler.use('createGems', 'createSkulls', 'createSpecialGems', 'scale', 'flat');
  const color = matchColor(what);
  // 始终带满 (base, mult, opts) 形态：mult=0 常数；opts 占位保证后续 appendOpt 落位
  const optsSuffix = mod ? `, 0, { modifier: ${jsonMod(mod)} }` : ', 0';
  if (!what || color) {
    if (!allowBareColor && !color && !what) return { err: '创造目标缺失' };
    // 六色族特殊宝石（「创造 1 颗蓝色巨人宝石」）：kind+spec.color，不吃普通 createGems 分支
    if (color) {
      const gem = matchSpecialGem(what);
      if (gem && SIX_COLOR_GEMS.has(gem.kind)) {
        return { seg: `createSpecialGems({ kind: '${gem.kind}', color: BaseColor.${color} }, ${n}${optsSuffix})` };
      }
    }
    return { seg: `createGems(${colorRef(color)}, ${n}${optsSuffix})` };
  }
  if (/骷髅头/.test(what)) return { seg: `createSkulls(${n}${optsSuffix})` };
  const gem = matchSpecialGem(what);
  if (gem) {
    const spec = gem.tier !== undefined ? `{ kind: '${gem.kind}', tier: ${gem.tier} }` : `{ kind: '${gem.kind}' }`;
    return { seg: `createSpecialGems(${spec}, ${n}${optsSuffix})` };
  }
  return { err: `创造目标无法识别「${what}」` };
}
/** 顶层「或」拆分（不在括号内） */
function splitTopLevel(c, sep) {
  const idx = c.indexOf(sep);
  if (idx < 0) return [];
  return [c.slice(0, idx).trim(), c.slice(idx + sep.length).trim()];
}
/** 转换端点 tier 哨兵：K-B 收官轮起 tier 通道已开（toSpecial spec 形态）→ 本符号仅保留
 *  供历史批次排查引用，现行 transformGemCall 不再返回（带档通配/恶石像鬼可编译）。 */
export const TRANSFORM_TIER_UNSUPPORTED = Symbol('transform-tier-unsupported');
function transformGemCall(compiler, fromColor, what, count, _clause) {
  compiler.use('transformToSpecial', 'transform');
  const gem = matchSpecialGem(what);
  if (!gem) return null;
  // tier 端点（带档通配/恶石像鬼）→ toSpecial spec 形态（K-B 收官轮，引擎 toSpecial
  // 扩 { kind, tier? } 对齐 createSpecialGems）；善石像鬼 tier1 仍省略（引擎缺省=善）。
  const spec = gem.tier !== undefined && !(gem.kind === 'gargoyleGem' && gem.tier === 1)
    ? `{ kind: '${gem.kind}', tier: ${gem.tier} }`
    : `'${gem.kind}'`;
  const from = fromColor ? `BaseColor.${fromColor}` : "'ANY'";
  const opts = [];
  if (count !== undefined) opts.push(`count: ${count}`);
  const optStr = opts.length ? `, { ${opts.join(', ')} }` : '';
  return `transformToSpecial(${from}, ${spec}${optStr})`;
}
function allyTargetOf(grp, others) {
  const g = grp.trim();
  if (g === '所有' || g === '全体' || g === '') return others ? 'allyOthers' : 'allyAll';
  if (/两名随机|2 名随机/.test(g)) return 'allyRandomN';
  if (/随机/.test(g)) return 'allyRandom';
  // 「一名/一个/1 名盟友」＝施法方选定（GoW Give an ally X 官方口径），非全体（8404 曾误落 allyAll）
  if (/^一[名个]$|^1\s*[名个]$|选定/.test(g)) return 'allyChosen';
  return 'allyAll';
}
/** 状态片段解析：「N 次X」→ { id, stacks }；「X」→ { id }；认不出 → null */
function parseStatusPiece(p) {
  const t = (p ?? '').trim().replace(/^(一个|所有)/, '').trim();
  const sm = t.match(/^(\d+)\s*[次层的?]*$/);
  const cnt = t.match(/^(\d+)\s*[次层]的?(.*)$/);
  if (cnt) {
    const id = matchStatus(cnt[2]);
    return id ? { id, stacks: Number(cnt[1]) } : null;
  }
  const id = matchStatus(t);
  return id ? { id } : null;
}

/**
 * 状态目标解析（第三轮扩展）：
 * - 色限定（「所有蓝色盟友/敌人」）→ 群体模式 + condColor（段级 ifCond targetColor 过滤）；
 * - 种族限定（「所有哥布林盟友/神祇军队」）→ 群体模式 + race（段级 targetRace）；
 * - 数量词（「两名随机盟友/前 3 名敌人」）→ N 系模式 + n；
 * - 「该颜色/此颜色/该军队」→ null（无法解析的指代，诚实略去）。
 */
function statusTarget(prefix, state) {
  const p = (prefix ?? '').trim();
  if (p === '' || /^(使其?|令其?|对他|让她|给它|并)$/.test(p)) {
    return { mode: state?.lastTargetMode ?? 'lastTarget' };
  }
  // 代词（「赋予其屏障」「祝福他们」「使对方陷入X」8776）→ 跨段追踪目标
  // （「再/然后/并」连接头与「使/让/给」动词头剥除后再判定——8946「再使他们」族）
  const pStripped = p.replace(/^(?:再|然后|并)?(?:使|让|给)/, '');
  if (/^(其|他|她|他们|他俩|之|对方|该敌人|目标)$/.test(pStripped)) return { mode: 'lastTarget' };
  // 指代颜色/军队法力颜色 → 组装器无法解析（引擎无运行时「该敌色」条件通道给状态段）
  if (/该颜色|此颜色|该军队|其法力颜色/.test(p)) return null;
  const q0 = pStripped;
  // 「敌方队伍/敌方全体」
  if (/^(敌方|敌方全体|敌人全体)(队伍|全体)?$/.test(q0)) return { mode: 'enemyAll' };
  // —— 色限定（先于其他判定；「所有蓝色敌人」） ——
  const colorM = q0.match(/^(所有|全体|全部|一名|一个|随机一名|一名随机|一名|前\s*\d+\s*[名个位])?(红|蓝|绿|黄|紫|棕)色?(盟友|敌人|军队|部队)$/);
  if (colorM) {
    const color = COLORS[colorM[2]];
    const scope = colorM[1] ?? '';
    const side = colorM[3] === '盟友' ? 'ally' : 'enemy';
    if (/随机/.test(scope)) return { mode: `${side}Random`, condColor: color };
    if (/^一名?$/.test(scope) || scope === '') return { mode: side === 'ally' ? 'allyChosen' : 'enemyChosen', condColor: color };
    const mode = side === 'ally' ? 'allyAll' : 'enemyAll';
    return { mode, condColor: color };
  }
  // —— 种族限定（「所有哥布林盟友」「所有神祇军队」「所有骑士」） ——
  // K-B3：q0 先过王国机翻归一，再进种族表（「所有冰封之巅盟友」→ 王国 → 走 kingdom 拒绝口）
  const q0n = normalizeGroupName(q0);
  for (const [zh, race] of Object.entries(RACE_ALIAS)) {
    const raceM = q0n.match(new RegExp(`^(所有|全体|全部|一名|一个|随机一名|一名随机|前\\s*\\d+\\s*[名个位]|两名|2 名|两名随机|2 名随机|\\d+\\s*[名个位])?(?:的)?${zh}(?:族)?(盟友|敌人|军队|部队|生物)$`));
    if (raceM) {
      const scope = raceM[1] ?? '';
      const sideWord = raceM[2];
      const side = sideWord === '盟友' ? 'ally' : 'enemy';
      if (/随机/.test(scope)) return { mode: /两名|2 名|\d+/.test(scope) ? `${side}RandomN` : `${side}Random`, race, n: numIn(scope) };
      if (/^一名?$/.test(scope) || scope === '') return { mode: side === 'ally' ? 'allyChosen' : 'enemyChosen', race };
      const mode = side === 'ally' ? 'allyAll' : 'enemyAll';
      return { mode, race, n: numIn(scope) ?? (mode.endsWith('N') ? undefined : undefined) };
    }
  }
  const q = q0;
  // 盟友系优先（「第一名盟友」不是 enemyFront）
  if (/盟友/.test(q)) {
    if (/所有其他盟友|其他盟友/.test(q)) return { mode: 'allyOthers' };
    if (/所有盟友|^所有$/.test(q)) return { mode: 'allyAll' };
    if (/随机一名|一名随机|随机/.test(q)) return { mode: /两名|2 名|\d+/.test(q) ? 'allyRandomN' : 'allyRandom', n: numIn(q) };
    if (/第\s*[一1]\s*名|第一名|首位/.test(q)) return { mode: 'allyFront' };
    if (/前\s*(\d+)/.test(q)) return { mode: 'allyFirstN', n: Number(q.match(/前\s*(\d+)/)[1]) };
    if (/一名|一个/.test(q)) return { mode: 'allyChosen' };
    return { mode: 'allyAll' };
  }
  // 敌人系
  // 「其他所有敌人」（7754）＝除追踪目标外的敌方——引擎无 enemyOthers 目标模式，诚实略去；
  // 「另一名敌人」（7285）＝再随机一名（不与前者重复）——无对应模式，诚实略去
  if (/其他|另一[名个]/.test(q) && /敌人/.test(q)) return null;
  // 「其上方/下方的所有敌人」（9162）＝编队位相对目标（R13 批 AboveTarget/BelowTarget 原语）
  if (/上方|上面/.test(q) && /敌人/.test(q)) return { mode: 'enemyAboveTarget' };
  if (/下方|下面/.test(q) && /敌人/.test(q)) return { mode: 'enemyBelowTarget' };
  if (/第\s*[一1]\s*名|第一名|首位|第一位的?/.test(q)) return { mode: 'enemyFront' };
  if (/最后一名|最后一个|最末位|末位|末名/.test(q)) return { mode: 'enemyLast' };
  if (/最虚弱的?/.test(q)) return { mode: /两/.test(q) ? 'enemyWeakestN' : 'enemyWeakest', n: numIn(q) };
  if (/最健康的?|最强的/.test(q)) return { mode: 'enemyHealthiest', n: numIn(q) };
  if (/敌人$/.test(q)) {
    if (/所有|全体/.test(q)) return { mode: 'enemyAll' };
    const n = q.match(/(\d+)\s*[名个位]/);
    if (/随机/.test(q)) return { mode: 'enemyRandomN', n: n ? Number(n[1]) : undefined };
    if (/前\s*(\d+)/.test(q)) return { mode: 'enemyFirstN', n: Number(q.match(/前\s*(\d+)/)[1]) };
    return { mode: 'enemyChosen' };
  }
  // 盟友系
  if (/所有其他盟友|其他盟友/.test(q)) return { mode: 'allyOthers' };
  if (/所有盟友|^所有$/.test(q)) return { mode: 'allyAll' };
  if (/盟友$/.test(q)) {
    if (/随机一名|一名随机|随机/.test(q)) return { mode: /两名|2 名|\d+/.test(q) ? 'allyRandomN' : 'allyRandom', n: numIn(q) };
    if (/一名|一个/.test(q)) return { mode: 'allyChosen' };
    return { mode: 'allyAll' };
  }
  if (q === '自身' || q === '自己') return { mode: 'allySelf' };
  return null;
}
/** 从目标短语提取数字（「两名/2 名/4名」→ 2/2/4） */
function numIn(s) {
  if (!s) return undefined;
  if (/两名|两个|俩/.test(s)) return 2;
  const m = s.match(/(\d+)\s*[名个位]/);
  return m ? Number(m[1]) : undefined;
}
/** 按 statusTarget 解析结果给 inflict 调用串追加段级 opts（n/targetRace/ifCond） */
function statusSegOpts(base, tgt) {
  const opts = [];
  if (tgt?.n !== undefined) opts.push(`n: ${tgt.n}`);
  if (tgt?.race) opts.push(`targetRace: '${tgt.race}'`);
  if (tgt?.condColor) opts.push(`ifCond: { kind: 'targetColor', color: BaseColor.${tgt.condColor} }`);
  return opts.length ? `${base.slice(0, -1)}, { ${opts.join(', ')} })` : base;
}
/** 「所有哥布林盟友」大族目标 → { seg }；王国/未知群体 → { err } */
function allyRandomStatusSeg(grp, _compiler) {
  let g = (grp ?? '').replace(/^所有/, '').replace(/^其他/, '').trim();
  g = normalizeGroupName(g);
  if (g === '') return { seg: "inflictRandom('allyAll', { pool: 'positive' })" };
  if (RACE_ALIAS[g]) return { seg: `inflictRandom('allyAll', { targetRace: '${RACE_ALIAS[g]}', pool: 'positive' })` };
  // 机翻族名带「族」尾（「蛮族盟友」8907 Wildfolk）——去尾重试一次
  const g2 = g.replace(/族$/, '');
  if (RACE_ALIAS[g2]) return { seg: `inflictRandom('allyAll', { targetRace: '${RACE_ALIAS[g2]}', pool: 'positive' })` };
  if (isKingdomGroup(g) || isKingdomGroup(g2)) {
    // K-E 第五轮接线：王国限定盟友 → 段级 targetKingdom 过滤（「赋予所有圣唐盟友一个随机状态效果」8399）
    const kg = isKingdomGroup(g) ? normalizeGroupName(g) : normalizeGroupName(g2);
    return { seg: `inflictRandom('allyAll', { targetKingdom: ${krefCode(kg)}, pool: 'positive' })` };
  }
  return { err: `群体名称无法可靠映射到种族/王国「${g}」（语义拿不准）` };
}
/** 跨段回指目标（其/他/该）：前段确定性群体/单体模式重放同目标；随机/指定单体 §12.3 lastTarget */
function refTargetOf(state) {
  const last = state?.lastTargetMode;
  if (last && ['enemyAll', 'enemyFirstN', 'enemyLastN', 'enemyWeakestN', 'enemyHealthiestN', 'allyAll'].includes(last)) return last;
  return 'lastTarget';
}
function fnOfStat(st) {
  return { 生命值: 'heal', 护甲值: 'armor', 护甲: 'armor', 攻击力: 'attack', 魔力值: 'magic', 法力值: 'mana' }[st] ?? 'armor';
}
function statOf(zh) {
  return { 护甲值: 'armor', 护甲: 'armor', 攻击力: 'attack', 魔力值: 'magic', 法力值: 'mana', 生命值: 'hp' }[zh];
}
function matchColor(s) {
  if (!s) return null;
  for (const [zh, en] of Object.entries(COLORS)) if (s.includes(zh)) return en;
  return null;
}
function matchStatus(s) {
  const t = (s ?? '').trim();
  for (const [zh, id] of STATUSES) if (t === zh || t.includes(zh)) return id;
  return null;
}
/** 特殊宝石匹配：{ kind, tier? }（善/恶石像鬼带 tier）；六色族颜色由调用方从原文提取 */
function matchSpecialGem(what) {
  const t = what ?? '';
  for (const entry of SPECIAL_GEMS) {
    const [zh, kind, tier] = entry;
    const core = zh.replace('宝石', '');
    if (t.includes(zh) || t.includes(core)) {
      return tier !== undefined ? { kind, tier } : { kind };
    }
  }
  return null;
}
function allySourceOf(grp, isEnemy) {
  // K-E 第五轮：敌侧计数接线（enemiesOfColor/enemiesOfRace/enemiesOfKingdom）；
  // 王国分支先于种族表（「龙爪盟友」≠ 龙族，王国名含种族子串）。
  const g = normalizeGroupName(grp);
  const color = matchColor(g);
  if (isKingdomGroup(g)) {
    const kg = normalizeGroupName(g);
    return isEnemy
      ? { source: { kind: 'enemiesOfKingdom', kingdom: kref(kg) } }
      : { source: { kind: 'alliesOfKingdom', kingdom: kref(kg) } };
  }
  if (isEnemy) {
    if (color) return { source: { kind: 'enemiesOfColor', color } };
    for (const [zh, race] of Object.entries(RACE_ALIAS)) {
      if (g.includes(zh)) return { source: { kind: 'enemiesOfRace', race } };
    }
    return null;
  }
  if (color) {
    return { sources: [{ kind: 'alliesOfColor', color }, { kind: 'teamSize', side: 'ally' }] };
  }
  for (const [zh, race] of Object.entries(RACE_ALIAS)) {
    if (g.includes(zh)) return { sources: [{ kind: 'alliesOfRace', race }] };
  }
  return null;
}
function troopsRefByName(name) {
  const t = loadTroops().find((x) => x.name === name);
  return t ? t.referenceName : null;
}
function targetRef(mode) {
  return `'${mode}'`;
}
function colorRef(c) {
  return c ? `BaseColor.${c}` : 'CHOSEN';
}
function tagText(tag) {
  return tag.kind === 'multiplier' ? `[x${tag.a}]` : `[${tag.a}:${tag.b}]`;
}
function fmtN(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}
function jsonMod(mod) {
  const modPart = mod.mod.kind === 'multiplier'
    ? `{ kind: 'multiplier', a: ${mod.mod.a} }`
    : `{ kind: 'ratio', a: ${mod.mod.a}, b: ${mod.mod.b} }`;
  if (mod.source) return `{ mod: ${modPart}, source: ${jsonSrc(mod.source)} }`;
  if (mod.sources) return `{ mod: ${modPart}, sources: [${mod.sources.map(jsonSrc).join(', ')}] }`;
  return `{ mod: ${modPart} }`;
}
function jsonSrc(s) {
  const parts = [];
  for (const [k, v] of Object.entries(s)) {
    if (k === 'color' && typeof v === 'string') parts.push(`color: BaseColor.${v}`);
    else if (typeof v === 'string') parts.push(`${k}: '${v}'`);
    else if (v !== undefined) parts.push(`${k}: ${v}`);
  }
  return `{ ${parts.join(', ')} }`;
}
function jsonCond(cond) {
  const parts = [];
  for (const [k, v] of Object.entries(cond)) {
    if (k === 'color') parts.push(`color: BaseColor.${v}`);
    else if (typeof v === 'string') parts.push(`${k}: '${v}'`);
    else if (Array.isArray(v)) parts.push(`${k}: [${v.map((c) => jsonCond(c)).join(', ')}]`); // anyOf/allOf
    else if (v !== null && typeof v === 'object') parts.push(`${k}: ${jsonCond(v)}`); // not.cond 等嵌套条件
    else if (v !== undefined) parts.push(`${k}: ${v}`);
  }
  return `{ ${parts.join(', ')} }`;
}
function lastNumericSegment(segs, from = 0) {
  for (let i = segs.length - 1; i >= from; i--) {
    // K-B 收官轮：destroyRandomRows/Cols 计数段可作尾部 [xN] 挂载宿主（9484 标签孤儿回收；
    // 修改数 = 随机行列的 N，与「创造 N 颗」同类数值段）
    if (/\b(dmg|dmgAll|dmgSplash|trueDmg|heal|armor|attack|magic|mana|reduce|randomStat|gainGold|gainSouls|gainGems|gainMaps|createGems|createSkulls|createSpecialGems|createGemsMixAny|steal|drainMana|inflictRandom|destroyRandomRows|destroyRandomCols|explodeRandomRows|explodeRandomCols)\(/.test(segs[i])) return i;
  }
  return -1;
}
function lastKind(segs, re) {
  for (let i = segs.length - 1; i >= 0; i--) if (re.test(segs[i])) return i;
  return -1;
}
/**
 * 段追加键值（括号配对扫描，支持嵌套 opts）：
 * - 末参已是 opts 对象（含嵌套）→ 插到对象内；
 * - 零参调用 `fn()` → `fn({ kv })`；
 * - 其余 → 追加新参 `, { kv }`。
 */
function appendOpt(segCall, kv) {
  const close = segCall.lastIndexOf(')');
  if (close < 0) return segCall;
  const before = segCall.slice(0, close);
  const trimmed = before.replace(/\s+$/, '');
  if (trimmed.endsWith('}')) {
    let depth = 0;
    let open = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const ch = trimmed[i];
      if (ch === '}') depth += 1;
      else if (ch === '{') {
        depth -= 1;
        if (depth === 0) {
          open = i;
          break;
        }
      }
    }
    if (open < 0) return segCall;
    const inner = trimmed.slice(open + 1, trimmed.length - 1).trim();
    const merged = inner === '' ? `{ ${kv} }` : `{ ${inner}, ${kv} }`;
    return trimmed.slice(0, open) + merged + segCall.slice(close);
  }
  if (trimmed.endsWith('(')) {
    return trimmed + `{ ${kv} })` + segCall.slice(close + 1);
  }
  return trimmed + `, { ${kv} })` + segCall.slice(close + 1);
}
function withModifierAt(segs, idx, mod) {
  return segs.map((s, i) => (i === idx ? appendOpt(s, `modifier: ${jsonMod(mod)}`) : s));
}
function withCondMultAt(segs, idx, times, cond) {
  const kv = `condMult: { times: ${times}, cond: ${jsonCond(cond)} }`;
  return segs.map((s, i) => (i === idx ? appendOpt(s, kv) : s));
}
function withCondBonusAt(segs, idx, n, cond) {
  const kv = `condBonus: { n: ${n}, cond: ${jsonCond(cond)} }`;
  return segs.map((s, i) => (i === idx ? appendOpt(s, kv) : s));
}
function withIfTargetDied(s) {
  return appendOpt(s, 'ifTargetDied: true');
}
function withIfCond(s, cond) {
  return appendOpt(s, `ifCond: ${jsonCond(cond)}`);
}

// —— 公式/数值解析 ——
/**
 * 伤害尾段解析：[公式] + 类型词（真实/溅射/散射，含「严重的溅射/轻微的溅射/轻量溅射」
 * 等机翻变体）+ 尾部 rider（移除C色宝石以增强 / 移除该军队法力颜色宝石来强化）。
 * 成功 { base, mult, rangeSpec?, dtype, rest, riderColor?, riderSelfColor?, optStr() }，失败 null。
 */
function parseDamageTail(text) {
  let t = text.trim();
  const f = parseFormulaPrefix(t);
  if (!f) return null;
  t = f.rest;
  const dt = /^(点)?\s*(真实的?(?:散射|溅射)?|(?:严重|轻微|轻量|轻度|重度|普通)?的?(?:溅射|散射))?\s*伤害?(值)?/.exec(t);
  if (!dt) return null;
  const dtype = dt[2] ?? '';
  t = t.slice(dt[0].length).trim();
  let riderColor = null;
  let riderSelfColor = false;
  const rider = /(?:，|,)?(?:并|且)?移除所有(红|蓝|绿|黄|紫|棕)色宝石以(?:增强|强化)(?:伤害)?效果$/.exec(t);
  if (rider) {
    riderColor = COLORS[rider[1]];
    t = t.slice(0, rider.index).trim();
  } else if (/(?:，|,)?(?:并|且)?移除所有(?:该军队|自己|自身)法力颜色的宝石来(?:强化|增强)此效果$/.test(t)) {
    // 「移除所有该军队法力颜色的宝石来强化此效果」→ CASTER 色清除（ColorSpec 占位符）
    riderSelfColor = true;
    t = t.replace(/(?:，|,)?(?:并|且)?移除所有(?:该军队|自己|自身)法力颜色的宝石来(?:强化|增强)此效果$/, '').trim();
  }
  const base = f.base;
  const mult = f.mult;
  const rangeSpec = f.rangeSpec;
  return {
    base, mult, rangeSpec, dtype, rest: t, riderColor, riderSelfColor,
    /** 双目标分支用：按类型生成公共 opts 串 */
    optStr() {
      const parts = [];
      if (/溅射|散射/.test(dtype)) parts.push("range: 'splash'");
      if (/真实/.test(dtype)) parts.push('trueDamage: true');
      return parts.length ? `, { ${parts.join(', ')} }` : '';
    },
  };
}

function parseFormulaPrefix(text) {
  let m;
  // A 到 [公式] 区间（「3 到 [魔法 + 12]」→ 7096；min 为常数 flat）
  m = /^(\d+)\s*到\s*\[\s*(魔法[^\]]*)\s*\]\s*(点)?/.exec(text);
  if (m) {
    const inner = parseMagicBracket(m[2]);
    if (!inner) return null;
    return { rest: text.slice(m[0].length), rangeSpec: { min: `flat(${m[1]})`, max: `scale(${inner.base}, ${fmtN(inner.mult)})` } };
  }
  // [公式] – [公式]（7213 先例；K-B 收官轮：两侧内文放宽为任意含「魔法」片段——
  // 9524/9525「[(魔法 / 2) + 4] – [魔法 + 9]」混合括号形，parseMagicBracket 可解析两侧）
  m = /^\[\s*([^\]]*魔法[^\]]*)\s*\]\s*[–—-]\s*\[\s*([^\]]*魔法[^\]]*)\s*\]\s*(点)?/.exec(text);
  if (m) {
    const a = parseMagicBracket(m[1]);
    const b = parseMagicBracket(m[2]);
    if (!a || !b) return null;
    return { rest: text.slice(m[0].length), rangeSpec: { min: `scale(${a.base}, ${fmtN(a.mult)})`, max: `scale(${b.base}, ${fmtN(b.mult)})` } };
  }
  // [(魔法 / N) + B] / [(魔法 x N) + B]（带外层括号）
  m = /^\[\s*\(\s*魔法\s*\/\s*(\d+(?:\.\d+)?)\s*\)\s*(?:\+\s*(\d+(?:\.\d+)?))?\s*\]\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: m[2] ? Number(m[2]) : 0, mult: fmtN(1 / Number(m[1])) };
  m = /^\[\s*\(\s*魔法\s*[xX×]\s*(\d+(?:\.\d+)?)\s*\)\s*(?:\+\s*(\d+(?:\.\d+)?))?\s*\]\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: m[2] ? Number(m[2]) : 0, mult: fmtN(Number(m[1])) };
  // [(魔法 / N)]（无 +B，无外层括号场景由上一条覆盖）
  m = /^\[\s*魔法\s*\/\s*(\d+(?:\.\d+)?)\s*\]\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: 0, mult: fmtN(1 / Number(m[1])) };
  m = /^\[\s*魔法\s*[xX×]\s*(\d+(?:\.\d+)?)\s*\]\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: 0, mult: fmtN(Number(m[1])) };
  m = /^\[\s*魔法\s*\+\s*(\d+(?:\.\d+)?)\s*\]\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: Number(m[1]), mult: 1 };
  m = /^\[\s*魔法\s*\]\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: 0, mult: 1 };
  // 纯常数
  m = /^(\d+)\s*(点)?/.exec(text);
  if (m) return { rest: text.slice(m[0].length), base: Number(m[1]), mult: 0 };
  return null;
}
function parseMagicBracket(inner) {
  const div = MAGIC_DIV_RE.exec(inner);
  const mul = MAGIC_MUL_RE.exec(inner);
  const plus = PLUS_N_RE.exec(inner);
  let mult = 1;
  if (div) mult = 1 / Number(div[1]);
  else if (mul) mult = Number(mul[1]);
  return { base: plus ? Number(plus[1]) : 0, mult };
}

// —— 修饰来源（§1 来源计数表） ——
/**
 * 卡点子句特征分类（missingFeatures 单源）：从子句原文 + 处理器错误归因出机器可读特征键。
 * 特征键即 weapon-skill-meta.json 的 missingFeatures 词表；与原语请求映射见 cmdReport。
 */
function classifyClause(clause, err, features) {
  const before = features.size;
  const text = (clause ?? '') + ' ' + (err ?? '');
  if (/\{\d+\}/.test(clause)) features.add('mt-garbage');
  const bg = clause.match(BLOCKED_GEM_RE);
  if (bg) features.add('special-gem:' + bg[0]);
  // 第三轮：法印/赐福/祝福/反射/狼化/附魔已进引擎（status.ts）——不再是卡点特征
  const ms = clause.match(/石化/);
  if (ms) features.add('status:' + ms[0]);
  if (TEMPERING_RE.test(clause) || /tempering/.test(err ?? '')) features.add('tempering-scaling');
  if (/转换端点不支持 tier/.test(text)) features.add('transform-tier');
  if (/王国条件倍率|战斗发生在|敌人来自/.test(text)) features.add('kingdom-condition');
  if (/限定盟友目标|限定目标/.test(text)) features.add('kingdom-target');
  if (/计数无对应来源/.test(text)) features.add('kingdom-count');
  if (/随机召唤无对应原语/.test(text)) features.add('kingdom-summon');
  if (/群体名称无法可靠映射/.test(text)) features.add('unknown-group');
  if (/数值型区间/.test(text)) features.add('numeric-range');
  if (/随机属性削减/.test(text)) features.add('random-stat-reduce');
  if (/反向属性比较/.test(text)) features.add('targetStatBeatsCaster');
  if (/stat 翻倍/.test(text)) features.add('stat-double');
  if (/dmg base = targetStat/.test(text)) features.add('dmg-base-targetStat');
  if (/anyEnemyDied/.test(text)) features.add('anyEnemyDied');
  if (/clear line-of-gem/.test(text)) features.add('clear-line-of-gem');
  if (/吞噬/.test(clause)) features.add('devour');
  if (/法力灼烧/.test(clause)) features.add('mana-burn');
  if (/正面增益」不做/.test(text)) features.add('dispel-all');
  if (/召唤引用无法解析|条件兵种引用无法解析/.test(text)) features.add('unresolved-ref');
  if (/随机风暴/.test(clause)) features.add('random-storm');
  if (/终止风暴/.test(clause)) features.add('storm-end');
  if (/敌我双方的|每有一名\S{1,6}敌人/.test(text)) features.add('enemy-color-count');
  if (/enemiesOfColor|enemiesOfRace/.test(text)) features.add('enemy-color-count');
  if (/targetHasDoom|末日(?!骷髅头)|厄运(?!骷髅头)|劫数|毁灭之力/.test(text)) features.add('doom-condition');
  if (/columnGems/.test(text)) features.add('column-gem-count');
  if (/destroyedSpecialGems/.test(text)) features.add('destroyed-special-count');
  if (/en-only-text/.test(text)) features.add('en-only-text');
  if (/条件子句内含不支持 opts/.test(text)) features.add('conditional-clear');
  if (/被减除的/.test(text)) features.add('exotic-modifier-source');
  // —— 2026-09-18 第四轮（K-B3）新特征键 ——
  if (/createMix 扩特殊宝石端点/.test(text)) features.add('createMix-special');
  if (/魔头/.test(clause)) features.add('boss-condition');
  if (/randomStatus nRange/.test(text)) features.add('random-status-nrange');
  if (/destroyed-gem-status-trigger/.test(text)) features.add('destroyed-gem-status-trigger');
  if (/reposition nRange/.test(text)) features.add('reposition-nrange');
  if (/all-status grant/.test(text)) features.add('all-status-grant');
  if (/石块|石墩/.test(clause)) features.add('stone-block-count');
  // 王国盟友计数（「因玉银林地盟友数而增强」）：修饰来源被诚实拒绝后归 kingdom-count（待王国批接线）
  if (/盟友数|盟友的加成|盟友可提升|盟友而增强|盟友激发/.test(clause) && isKingdomGroup(clause)) features.add('kingdom-count');
  if (/尾部增幅标签/.test(text)) features.add('modifier-tag');
  if (/修饰来源无法解析/.test(text)) features.add('modifier-source');
  // K-B 收官轮：单 modifier 通道被主效果占用（法力灼烧主源=drainedMana），第二来源诚实略去
  if (/修饰来源通道已占用/.test(text)) features.add('modifier-source');
  if (features.size === before) features.add('unparsed-clause');
}

function parseModifierSource(body) {
  const b = body.replace(/数量|数/g, '');
  const colorKeys = Object.keys(COLORS).sort((x, y) => y.length - x.length);
  const colorsIn = (s) => colorKeys.filter((k) => s.includes(k)).map((k) => COLORS[k]);
  // —— K-B3：双盟友来源「红色盟友和金牛座盟友(的数量)」「棕色盟友和建造盟友数」（9510/9833/9915/8811/9690 族）——
  {
    const halves = body.split('和').map((s) => s.trim().replace(/的数量?$/, '').replace(/数$/, ''));
    if (halves.length === 2 && halves.every((h) => /盟友$/.test(h))) {
      const srcs = [];
      for (const h of halves) {
        const cm = h.match(/^(红|蓝|绿|黄|紫|棕)色?盟友$/);
        if (cm) { srcs.push({ kind: 'alliesOfColor', color: COLORS[cm[1]] }); continue; }
        const core = normalizeGroupName(h.replace(/盟友$/, ''));
        const race = Object.entries(RACE_ALIAS).find(([zh]) => core === zh || core.includes(zh));
        if (race) { srcs.push({ kind: 'alliesOfRace', race: race[1] }); continue; }
        srcs.push(null);
      }
      if (srcs.length === 2 && srcs.every(Boolean)) return { sources: srcs };
    }
  }
  for (const [zh, id] of STATUSES) {
    if (b.includes(zh)) {
      if (/盟友/.test(b)) return { source: { kind: 'allyStatusCount', statusId: id } };
      return { source: { kind: 'enemyStatusCount', statusId: id } };
    }
  }
  // 特殊宝石计数（boardSpecial）；元素星/暗影之星无「宝石」后缀，放宽星族匹配
  for (const [zh] of SPECIAL_GEMS) {
    const core = zh.replace('宝石', '');
    if (b.includes(core) && (/宝石/.test(b) || /星/.test(core) || /石块|石墩/.test(core))) {
      if (core.includes('末日') || core.includes('厄运')) return { source: { kind: 'boardSkulls' } };
      const kind = matchSpecialGem(core);
      if (kind) return { source: { kind: 'boardSpecial', gem: kind.kind } };
    }
  }
  if (/骷髅头/.test(b)) return { source: { kind: 'boardSkulls' } };
  if (/所耗尽的法力|耗尽的法力|耗掉的法力/.test(body)) return { source: { kind: 'drainedMana' } };
  // K-B 收官轮：「被减除/降低的X值」＝前序 reduce 段实际削减额（引擎 Wave4 lastReduce 来源；
  // 7752/7757/7758/7759/7799「数量因被减除的护甲值(数)而增强」族——此前按 exotic 拒绝）
  if (/被?(?:减除|降低)的(护甲值|攻击力|魔力值|生命值)/.test(b)) return { source: { kind: 'lastReduce' } };
  // 「被摧毁的骷髅头和棕色宝石数」= 骷髅 + 色宝石双来源（7769）
  const skullAndColor = b.match(/被摧毁的骷髅头和(红|蓝|绿|黄|紫|棕)色?宝石/);
  if (skullAndColor) return { sources: [{ kind: 'destroyedGems' }, { kind: 'destroyedGems', color: COLORS[skullAndColor[1]] }] };
  if (/被移除的宝石|移除的宝石|被摧毁的宝石|摧毁的宝石/.test(b)) return { source: { kind: 'destroyedGems' } };
  if (/转换的宝石|转化的宝石/.test(b)) return { source: { kind: 'transformedGems' } };
  if (/被减除的/.test(b)) return null; // exotic（§1 明确 blocked）
  if (/所有敌人的(护甲值|攻击力|魔力值|生命值)/.test(b)) {
    const stat = b.match(/所有敌人的(护甲值|攻击力|魔力值|生命值)/)[1];
    return { source: { kind: 'enemyStatSum', stat: statOf(stat) } };
  }
  if (/敌我双方的(护甲值|攻击力|魔力值|生命值)/.test(b)) {
    const stat = b.match(/敌我双方的(护甲值|攻击力|魔力值|生命值)/)[1];
    const st = statOf(stat);
    return { sources: [{ kind: 'allyStatSum', stat: st }, { kind: 'enemyStatSum', stat: st }] };
  }
  if (/自身的(护甲值|攻击力|生命值|魔力值)/.test(b)) {
    const stat = b.match(/自身的(护甲值|攻击力|生命值|魔力值)/)[1];
    const map = { 护甲值: 'armor', 攻击力: 'attack', 生命值: 'hp', 魔力值: 'magic' };
    return { source: { kind: 'selfStat', stat: map[stat] } };
  }
  if (/自身损失的生命值/.test(b)) return { source: { kind: 'selfStat', stat: 'missingHp' } };
  if (/敌人现有生命值/.test(b)) return { source: { kind: 'targetStat', stat: 'hp' } };
  // K-B 收官轮：「敌人所需的法力值」＝目标 manaCost（R22 targetStat stat 扩展，7815）
  if (/敌人所需的法力值/.test(b)) return { source: { kind: 'targetStat', stat: 'manaCost' } };
  const tgtStat = b.match(/敌人(的)?(攻击力|护甲值|魔力值)/);
  if (tgtStat) return { source: { kind: 'targetStat', stat: { 攻击力: 'attack', 护甲值: 'armor', 魔力值: 'magic' }[tgtStat[2]] } };
  // K-B 收官轮：「自身灵魂数/我的灵魂」＝战场经济灵魂池（battleSouls，8401「因自身灵魂数」）
  if (/灵魂数|我的灵魂|自身灵魂/.test(body)) return { source: { kind: 'battleSouls' } };
  if (/所收集的灵魂数|收集的灵魂数/.test(body)) return { source: { kind: 'battleSouls' } };
  // K-B3：战场经济来源（§10.2）——「摧毁数因收集到的黄金数量而增强」7447 族
  if (/收集到的黄金|黄金数量/.test(body)) return { source: { kind: 'battleGold' } };
  if (/(红|蓝|绿|黄|紫|棕)色盟友和敌人数/.test(b)) {
    const c = colorsIn(b)[0];
    return { sources: [{ kind: 'alliesOfColor', color: c }, { kind: 'teamSize', side: 'enemy' }] };
  }
  // K-E：「因敌我双方的X色军队/巨人军队数量而增强」（7250/7445）＝双侧计数 → 两来源
  {
    const bothM = b.match(/敌我双方的(红|蓝|绿|黄|紫|棕)色?(?:军队|盟友|敌人)/);
    if (bothM) return { sources: [{ kind: 'alliesOfColor', color: COLORS[bothM[1]] }, { kind: 'enemiesOfColor', color: COLORS[bothM[1]] }] };
    const bothR = b.match(/敌我双方的([\u4e00-\u9fa5]{1,4}?)(?:族)?(?:军队|盟友|敌人|部队)?(?:数|数量)?$/);
    if (bothR) {
      const race = RACE_ALIAS[bothR[1]] ?? RACE_ALIAS[normalizeGroupName(bothR[1] + '族')];
      if (race) return { sources: [{ kind: 'alliesOfRace', race }, { kind: 'enemiesOfRace', race }] };
    }
    // 「伤害值因敌我双方的黄金数而增强」（8073）：双方独立计数求和 → bothGold（仅一次取整）
    if (/敌我双方的黄金/.test(b)) return { source: { kind: 'bothGold' } };
  }
  if (/(红|蓝|绿|黄|紫|棕)色?盟友数?/.test(b)) return { source: { kind: 'alliesOfColor', color: colorsIn(b)[0] } };
  // K-E：王国盟友/敌人计数（第五轮接线，alliesOfKingdom/enemiesOfKingdom）——先于种族表判定：
  // 王国名含种族子串（「龙爪盟友」≠ 龙族）。王国名用 zh 原文名；
  // 「潘神之谷友数」（机翻脱「盟」）经宽松尾缀剥除覆盖。
  if (/盟友|盟军|敌人|敌军|友/.test(b)) {
    // K-B 收官轮修：先剥句尾「的」（9977「受到荒野平原盟友的加成」→ body 带尾「的」，
    // 剥「盟友」前不先剥「的」会残留「狂野平原盟友」作王国名——运行时永不命中）
    const kgRaw = normalizeGroupName(b)
      .replace(/的$/u, '')
      .replace(/的?(?:盟友|盟军|敌军|敌人|部队|军队|友)数?$/u, '')
      .replace(/的$/u, '');
    if (kgRaw && isKingdomGroup(kgRaw)) {
      const kg = normalizeGroupName(kgRaw);
      return /敌/.test(b)
        ? { source: { kind: 'enemiesOfKingdom', kingdom: kref(kg) } }
        : { source: { kind: 'alliesOfKingdom', kingdom: kref(kg) } };
    }
  }
  for (const [zh, race] of Object.entries(RACE_ALIAS)) {
    if (b.includes(zh) && /盟友|敌人|敌军/.test(b)) {
      // K-E：敌侧种族计数（「几率因恶魔敌人数而增强」8391/8392 族）
      return /敌/.test(b) ? { source: { kind: 'enemiesOfRace', race } } : { source: { kind: 'alliesOfRace', race } };
    }
  }
  const cs = colorsIn(b);
  if (cs.length >= 1 && /宝石/.test(b)) {
    if (cs.length === 1) return { source: { kind: 'boardGems', color: cs[0] } };
    return { sources: cs.map((c) => ({ kind: 'boardGems', color: c })) };
  }
  if (/敌人$/.test(b)) return { source: { kind: 'teamSize', side: 'enemy' } };
  if (/盟友$/.test(b)) return { source: { kind: 'teamSize', side: 'ally' } };
  return null;
}

// =====================================================================
// 命令实现
// =====================================================================
function cmdPool() {
  const weapons = loadWeapons();
  const pool = weapons.map((w) => ({
    spellId: w.spellId,
    weaponRef: w.weaponRef,
    weaponName: w.weaponName,
    spellName: w.spellName,
    desc: w.desc,
    scalings: w.scalings,
    modifier: w.modifier,
    manaCost: w.manaCost,
    colors: w.colors,
  }));
  mkdirSync(path.dirname(POOL_OUT), { recursive: true });
  writeFileSync(POOL_OUT, JSON.stringify(pool, null, 1) + '\n', 'utf8');
  console.log(`pool-w01.json 生成：${pool.length} 条 → ${path.relative(ROOT, POOL_OUT)}`);
}

function compileAll() {
  const weapons = loadWeapons();
  const troops = loadTroops();
  const results = weapons.map((w) => {
    const compiler = new Compiler(troops);
    let out;
    try {
      out = compiler.compile(w);
    } catch (e) {
      out = { manaOnly: true, features: ['compiler-error'], skippedClauses: [`编译器异常：${String(e).slice(0, 120)}`] };
    }
    const reviewed = reviewedWeaponRows[String(w.spellId)];
    const fidelity = reviewed?.metadata?.fidelity ?? (out.manaOnly ? 'mana-only' : (out.fidelity ?? 'full'));
    return {
      ...w,
      fidelity,
      compiled: fidelity !== 'mana-only',
      build: reviewed?.prototype && w.spellId !== 7189
        ? `(${JSON.stringify(reviewed.prototype)} as SkillPrototype)`
        : (out.build ?? null),
      imports: out.imports ?? null,
      features: reviewed?.metadata?.missingFeatures ?? out.features ?? [],
      skippedClauses: reviewed?.metadata?.skippedClauses ?? out.skippedClauses ?? [],
    };
  });
  return results;
}

function familyOf(desc) {
  if (TEMPERING_RE.test(desc)) return '淬炼段位（Doomed 档）';
  if (/伤害/.test(desc) && /散射|溅射/.test(desc)) return '散射/溅射伤害';
  if (/伤害/.test(desc) && /真实/.test(desc)) return '真实伤害';
  if (/伤害/.test(desc)) return '直接伤害';
  if (/召唤/.test(desc) || /风暴/.test(desc)) return '召唤/风暴';
  if (/宝石/.test(desc)) return '宝石操作';
  if (/护甲值|攻击力|生命值|魔力值|法力值/.test(desc)) return '增益/削弱';
  if (/状态/.test(desc)) return '状态';
  return '其它';
}

function cmdTriage() {
  const results = compileAll();
  const tier = { full: 0, partial: 0, 'mana-only': 0 };
  for (const r of results) tier[r.fidelity] += 1;
  console.log(`full ${tier.full} / partial ${tier.partial} / mana-only ${tier['mana-only']} / 共 ${results.length}`);
  const fam = new Map();
  for (const r of results) {
    const f = familyOf(r.desc);
    fam.set(f, { total: (fam.get(f)?.total ?? 0) + 1, ok: (fam.get(f)?.ok ?? 0) + (r.fidelity !== 'mana-only' ? 1 : 0) });
  }
  console.log('-- 家族（绑定/总数） --');
  for (const [f, v] of [...fam.entries()].sort((a, b) => b[1].total - a[1].total)) console.log(`  ${String(v.ok).padStart(3)}/${String(v.total).padStart(3)}  ${f}`);
  const feat = new Map();
  for (const r of results) for (const f of r.features) feat.set(f, (feat.get(f) ?? 0) + 1);
  console.log('-- missingFeatures 直方图 --');
  for (const [k, n] of [...feat.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), k);
}

function cmdLeft() {
  const results = compileAll();
  for (const r of results.filter((x) => x.fidelity === 'mana-only')) {
    console.log(`${r.spellId}\t${r.desc}\t|| ${r.skippedClauses.join(' ; ')}`);
  }
}

/** 调试：node scripts/_weapon_pools.mjs debug 7124 —— 逐子句展示编译轨迹 */
function cmdDebug(id) {
  const weapons = loadWeapons();
  const sp = weapons.find((w) => w.spellId === Number(id));
  if (!sp) return console.log('no spell', id);
  const compiler = new Compiler(loadTroops());
  const out = compiler.compile(sp);
  console.log('desc:', sp.desc);
  console.log('=>', out.skip ?? out.build);
  // 逐子句 × 逐处理器追踪
  let desc = sp.desc.replace(/\s*\[((?:[xX×]\s*\d+)|\d+\s*:\s*\d+)\]\s*$/, '');
  const clauses = desc.split(/。|；|&&|\n/).map((c) => c.trim()).filter(Boolean);
  for (const cl of clauses) {
    console.log('== 子句:', cl);
    for (const name of ['hPureCondMult', 'hKingdomCond', 'hIfPayload', 'hDamage', 'hStandaloneModifier', 'hStatus', 'hGemOps', 'hBuffHeal', 'hReduceDrain', 'hCleanseExtraTurn', 'hStormSummon', 'hRepositionMisc', 'hEconomy']) {
      const c2 = new Compiler(loadTroops());
      const st = { segments: [], tag: null, tagUsed: false };
      let r;
      try {
        r = c2[name].call(c2, cl.replace(/\s+/g, ' ').trim(), st);
      } catch (e) {
        r = `EXC ${String(e).slice(0, 80)}`;
      }
      if (r !== null) console.log(`   ${name} -> ${r === '' ? 'HANDLED: ' + st.segments.join(' ; ') : 'ERR: ' + r}`);
    }
  }
}

// =====================================================================
// gen：生成 batch-w*.ts（每批 ≤180 条，spellId 升序；compiled + skipped 同批）
// =====================================================================
function esc(s) {
  const single = "'";
  return `'${s.replace(/\\/g, '\\\\').split(single).join("\\'")}'`;
}

const BATCH_CHUNK = 180;

function cmdGen() {
  const all = compileAll().sort((a, b) => a.spellId - b.spellId);
  // 分保真度：full + partial 进批次；mana-only 仅入 meta（占位绑定，运行时回退仅扣法力）
  // 7189 belongs to the preserved handwritten W05 batch; never emit a second binding.
  const w05Ids = new Set([7071, 7188, 7189, 7190, 7199, 7217, 10045, 10063, 10065]);
  const results = all.filter((r) => r.fidelity !== 'mana-only' && !w05Ids.has(r.spellId));
  const batches = [];
  for (let i = 0; i < results.length; i += BATCH_CHUNK) batches.push(results.slice(i, i + BATCH_CHUNK));
  const names = batches.map((_, i) => `W${String(i + 1).padStart(2, '0')}`);
  batches.forEach((chunk, bi) => {
    const name = names[bi];
    const spells = chunk.filter((r) => r.compiled);
    const imports = new Set(['skill']);
    let useBaseColor = false;
    let useChosen = false;
    const useReviewedPrototype = spells.some((s) => reviewedWeaponRows[String(s.spellId)]?.prototype);
    for (const s of spells) {
      for (const f of s.imports ?? []) imports.add(f);
      if (/\bBaseColor\./.test(s.build)) useBaseColor = true;
      if (/CHOSEN/.test(s.build)) useChosen = true;
    }
    // 按批次 build 实际引用剪裁（避免 eslint no-unused-vars）
    const allBuilds = spells.map((s) => s.build).join('\n');
    const importNames = [...imports]
      .filter((f) => f !== 'CHOSEN' && f !== 'CASTER' && f !== 'CELL')
      .filter((f) => new RegExp(`\\b${f}\\s*\\(`).test(allBuilds))
      .sort();
    useChosen = useChosen && /(?<!')\bCHOSEN\b(?!')/.test(allBuilds);
    // CASTER 占位符（「该军队法力颜色」）为常量非函数，单独按词检测
    const useCaster = /(?<!')\bCASTER\b(?!')/.test(allBuilds);
    const useCell = /(?<!['"])\bCELL\b(?!['"])/.test(allBuilds);
    const placeholderImports = [useChosen ? 'CHOSEN' : '', useCaster ? 'CASTER' : '', useCell ? 'CELL' : ''].filter(Boolean);
    const allImports = [...importNames, ...placeholderImports];
    const importLines = `import { ${allImports.join(', ')} } from '../builders';${useBaseColor ? "\nimport { BaseColor } from '../../types';" : ''}${useReviewedPrototype ? "\nimport type { SkillPrototype } from '../prototypes';" : ''}`;
    const spellRows = spells.map((s) => `  {\n    id: ${s.spellId},\n    desc: ${esc(s.desc)},\n    build: ${s.build},\n  },`).join('\n');
    const out = `/**
 * 窗口 K-B · 武器法术批次 ${name}（池：scripts/curated-pools/pool-w01.json；分保真度绑定）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 保真度：本批全部为 full/partial（partial = 可编译子句照常入 build、卡点子句按
 * missingFeatures/skippedClauses 略去；mana-only 占位绑定不进批次，见
 * src/data/weapon-skill-meta.json）。组装规则锚定 scripts/spell-rules.md 与
 * 既有部队批次先例；生成器 scripts/_weapon_pools.mjs gen。
 */
${importLines}
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
${spellRows}
];

export const BATCH_${name}: CuratedBatch = { batch: '${name}', spells: SPELLS, skipped: SKIPPED };
`;
    writeFileSync(path.join(CURATED_DIR, `batch-${name.toLowerCase()}.ts`), out, 'utf8');
    console.log(`batch-${name.toLowerCase()}.ts：${spells.length} 条（${chunk.filter((r) => r.fidelity === 'full').length} full + ${chunk.filter((r) => r.fidelity === 'partial').length} partial）`);
  });
  // —— 分保真度元数据（运行时/meta 层单源）——
  const meta = {};
  for (const r of all) {
    meta[String(r.spellId)] = {
      fidelity: r.fidelity,
      missingFeatures: r.features,
      skippedClauses: r.skippedClauses,
    };
  }
  const metaPath = path.join(ROOT, 'src', 'data', 'weapon-skill-meta.json');
  writeFileSync(metaPath, JSON.stringify(meta, null, 1) + '\n', 'utf8');
  const tier = { full: 0, partial: 0, 'mana-only': 0 };
  for (const r of all) tier[r.fidelity] += 1;
  console.log(`weapon-skill-meta.json：full ${tier.full} / partial ${tier.partial} / mana-only ${tier['mana-only']}（计 718）`);
  console.log(`共 ${names.length} 个批次：${names.join(', ')}`);
  console.log('index.ts 注册（W 系独立注册表，与部队 BATCHES 分离）：');
  console.log(names.map((n) => `  import { BATCH_${n} } from './batch-${n.toLowerCase()}';`).join('\n'));
}

// =====================================================================
// report：生成 artifacts/weapon-spell-triage.md
// =====================================================================
function cmdReport() {
  const results = compileAll().sort((a, b) => a.spellId - b.spellId);
  const full = results.filter((r) => r.fidelity === 'full');
  const partial = results.filter((r) => r.fidelity === 'partial');
  const manaOnly = results.filter((r) => r.fidelity === 'mana-only');
  const bound = results.filter((r) => r.fidelity !== 'mana-only');
  // missingFeatures 直方图（特征 → 条数 + 样例）
  const featHist = new Map();
  for (const r of results) {
    for (const f of r.features) {
      const cur = featHist.get(f) ?? { count: 0, sample: r };
      cur.count += 1;
      featHist.set(f, cur);
    }
  }
  // 家族分布
  const fam = new Map();
  for (const r of results) {
    const f = familyOf(r.desc);
    const cur = fam.get(f) ?? { total: 0, bound: 0 };
    cur.total += 1;
    if (r.fidelity !== 'mana-only') cur.bound += 1;
    fam.set(f, cur);
  }
  // 原语请求聚合（partial 化不消掉请求——战斗可用性与引擎补齐解耦）
  // 第三轮：allyOfColor-target 已用 ifCond targetColor 消化（TargetMode 无需扩）；新增 doom/columnGems/destroyedSpecialGems 等
  const PRIM = [
    // —— 第六轮（K-B 收官）已接线：createMix-special / anyEnemyDied / conditional-clear /
    //     transform-tier / destroyed-gem-status-trigger / random-stat-reduce（R12 random 通道
    //     回收）/ exotic-modifier-source（lastReduce 回收）——残余条目见各行标注 ——
    ['tempering-scaling', 'tempering 段位缩放（第五轮已接线）', '残余=无挂载段的特例；来源 { kind: tempering }'],
    ['doom-condition', 'targetHasDoom 劫数条件（第五轮已接线）', '残余=结论子句超出 condBonus/condMult/ifCond 三形态'],
    ['kingdom-condition', 'kingdomPresent/kingdomOf 条件（第五轮已接线）', '残余=复合条件特例（9827 多条件连排）'],
    ['enemy-color-count', 'enemiesOfColor 计数（第五轮已接线）', '残余=createMix 骷髅端点句（7655-7660，归 createMix-special）'],
    ['kingdom-count', 'alliesOfKingdom 计数（第五轮已接线）', '残余=列内计数特例'],
    ['createMix-special', 'createMix 特殊端点（第六轮已接线：createGemsMixAny）', '残余=无'],
    ['anyEnemyDied', 'anyEnemyDied 条件（第六轮已接线：anyTrackedDied 专名形态）', '残余=无'],
    ['conditional-clear', '条件化清除段（第六轮已接线：clear 构造器补 opts + ifCond）', '残余=无'],
    ['transform-tier', '转换端点 tier 通道（第六轮已接线：toSpecial spec 形态）', '残余=无'],
    ['destroyed-gem-status-trigger', '逐摧毁宝石触发状态（第六轮回收：perDestroyed 原语）', '残余=无'],
    ['random-stat-reduce', '随机属性削减（第六轮回收：R12 stat=random 通道）', '残余=无'],
    ['exotic-modifier-source', '被减除属性来源（第六轮回收：lastReduce 跨段来源）', '残余=敌方高塔计数等无来源特例（7800）'],
    ['modifier-tag', '尾部增幅标签归属', '非缺失原语：归属子句被略去时标签暂不挂载；卡点消解后自动回收'],
    ['modifier-source', '修饰来源无法解析（§1 exotic 大族）', '逐条见 meta skippedClauses'],
    ['unknown-group', '群体名无法映射种族/王国', '无官方口径的群体词（7567 满额幼龙等）；待术语表'],
    ['unresolved-ref', '机翻引用无法回译', '随机风暴等官方步骤未证实句（7492）'],
    ['stat-double', 'stat 翻倍 buff', 'buff opts.double（现仅 reduce.halve）'],
    ['dmg-base-targetStat', 'dmg 基数取目标属性', 'dmg 支持 base 来源 targetStat'],
    ['targetStatBeatsCaster', '反向属性比较', 'Condition casterStatBeatsTarget 加 reversed'],
    ['clear-line-of-gem', '清除随机宝石所在行（绑定被爆宝石位置）', 'clear target { kind: lineOfGem, mode }（7217）'],
    ['numeric-range', '数值型区间', '段级 rangeSpec 扩 create'],
    ['mana-burn', '法力灼烧第二增幅来源', '灼烧主源已按 drainedMana 接线（7412）；magic 增幅与主源争用单 modifier 通道'],
    ['random-storm', '随机风暴', 'createStorm 支持随机色'],
    ['storm-end', '终止风暴', 'createStorm 对立操作'],
    ['dispel-all', '驱散全部正面增益', '泛指驱散（§6 维持不做）'],
    ['column-gem-count', '列内宝石计数来源', 'ModifierSource { kind: columnGems, col: chosen }（「所选的列每有一颗X色宝石」8805）'],
    ['en-only-text', 'EN-only 快照条目', '非引擎缺口：2 把新武器 zh 法术文本缺失，数据补全后回收'],
    ['boss-condition', '魔头（Boss troopType）条件', '7754 残余=「其他所有敌人」目标模式（enemyOthers）'],
    ['random-status-nrange', '随机状态条数区间', 'inflictRandom 支持 times nRange（7986/7996/9910）'],
    ['reposition-nrange', '数量区间调位', 'reposition 支持 nRange（8074）'],
    ['all-status-grant', '全状态池授予', '「所有状态效果」官方口径考证（8084）'],
    ['stone-block-count', '石墩激活（场上石块触发器）', '石块计数/创造已接线（8769）；「石墩激活」=盘上光环触发（8400）待考证'],
  ];
  const lines = [];
  lines.push('# 武器法术组装分诊报告（窗口 K-B · 分保真度绑定）');
  lines.push('');
  lines.push('> 数据源 `artifacts/gowhead-weapons/weapons.json`（718 条，zh 文本锚定）；');
  lines.push('> 语义依据 `scripts/spell-rules.md`（§0 裸散射 2026-09-18 官方重裁=enemyAll、§9 风暴/oneOf、§11 随机状态分池、§12 lastTarget、§13 && 切分）；');
  lines.push('> 分保真度绑定：可编译子句照常入 build，卡点子句不硬编，按 missingFeatures/skippedClauses 略去；');
  lines.push('> 元数据单源：`src/data/weapon-skill-meta.json`（718 条 fidelity/missingFeatures/skippedClauses）。');
  lines.push('> 生成器：`scripts/_weapon_pools.mjs`（pool / triage / left / debug / gen / report）。');
  lines.push('');
  lines.push('## 三级总账');
  lines.push('');
  lines.push('| 保真度 | 条数 | 说明 |');
  lines.push('|---|---|---|');
  lines.push(`| full | ${full.length} | 全部子句可编译 |`);
  lines.push(`| partial | ${partial.length} | ≥1 子句编译 + ≥1 子句略去（含 Doomed 淬炼 0 级参数化编译） |`);
  lines.push(`| mana-only | ${manaOnly.length} | 零子句可编译 → 占位绑定，运行时回退仅扣法力 |`);
  lines.push(`| **合计** | **${results.length}** | 与 pool-w01.json 逐条对应 |`);
  lines.push('');
  lines.push(`战斗可用绑定（full+partial）${bound.length}/718 = ${(100 * bound.length / results.length).toFixed(1)}%。`);
  lines.push('');
  lines.push('## 第六轮升级对比（K-B 收官 · 小引擎批+解析收尾，2026-09-19 · 第五轮 610/96/12 → 本轮）');
  lines.push('');
  lines.push('| 保真度 | 第五轮 | 本轮 | 增量 |');
  lines.push('|---|---|---|---|');
  lines.push(`| full | 610 | ${full.length} | ${full.length - 610 >= 0 ? '+' : ''}${full.length - 610} |`);
  lines.push(`| partial | 96 | ${partial.length} | ${partial.length - 96 >= 0 ? '+' : ''}${partial.length - 96} |`);
  lines.push(`| mana-only | 12 | ${manaOnly.length} | ${manaOnly.length - 12} |`);
  lines.push(`| 战斗可用 | 706 | ${bound.length} | ${bound.length - 706 >= 0 ? '+' : ''}${bound.length - 706} |`);
  lines.push('');
  lines.push('**本轮（收官）新消化**（四原语 + 解析长尾，裁定见 spell-rules §14.6）：');
  lines.push('');
  lines.push('- anyEnemyDied 接线：EN 考证（7117/7861/8075/8076/9629/9903）「If an Enemy dies, …」＝本咒语执行中任一敌人被击杀，与部队批 R22 已落地的 anyTrackedDied 同口径（9986/9812 先例）→ builders.anyEnemyDied() 专名形态 + ifCond（6 把全升 full，含 8076「使他们下潜」盟友回指修正）；');
  lines.push('- createMix 特殊端点开放：createGemsMixAny（R22 mixAny）接线——「混合蓝色和骷髅头的宝石」（9110）、「混合骷髅头和恐怖宝石」（9167）、「混合鬼魂宝石和冻结宝石」（9300）、7655-7660 Doomed 族「每有一名X色敌人则创造 N 颗混合X色和骷髅头的宝石」（base 0 × enemiesOfColor 倍率，官方「N per Enemy」口径）、8578「制造 3 种药水」（五色法力药水 spec 混合）；');
  lines.push('- TransformOpts tier 通道：TransformGemParams.toSpecial 扩 spec 形态 { kind, tier }（对齐 createSpecialGems）——8966「将选定的法力宝石转换为 x3 通配符」＝transformToSpecial(CELL, {kind: wildcard, tier: 3})；不带 tier 的既有转换序列化为 kind 字符串、rng 序列逐字节不变（护栏测试）；');
  lines.push('- 条件化清除段：destroyColor/explodeColor/destroySkulls/explodeSkulls/destroySpecialGems/explodeSpecialGems 六构造器补 opts 形参（段级 ifCond 经既有 attach/runSegment 管线生效）——7286 尘风暴条件清除、7955 魔头条件爆破、9381/9486/9809/9983 永生神条件引爆全族回收；');
  lines.push('- 陈旧拒绝回收（引擎原语已在、生成器口径未更）：随机属性削减 → stealRandomStat/reduce random（R12 通道，7240/7244/8440）、「获得等同于减除的护甲值」→ lastReduce 跨段来源（Wave4，7247/7752/7756-7759/7799）、逐摧毁宝石触发状态 → perDestroyed（Wave4，8518/8965）、吞噬 → devour（R22，7293）、「摧毁宝石的行和列」→ destroyChosenCross（R22，8721）、石块计数/创造 → boardSpecial stoneBlock（8769）、8400「可摧毁所选颜色的宝石」→ destroyColor(CHOSEN)；');
  lines.push('- 解析长尾攻坚（EN 原文逐句对照）：选定色目标族（7862/8152/9831「使用所选定法力宝石颜色的敌人」→ ifCond targetColor CHOSEN）、骷髅/选定色转化（9379→uberDoomSkull、8900→spiritGem）、王国改名考证（双语 dump 按 troop Id 配对：Zaejin→Amanithrax=齐埃金、Hellcrag→Obsidian Depths=地狱悬崖、Grosh-Nak→Dripping Caverns=葛洛什奈克、Divinion Fields=卜筮之原——8140 毒菇林/8529 滴答洞穴/8816 黑曜石深渊/9749 圣力场/9977 荒野平原(狂→荒机翻) 全回收）、机翻译名补全（盗贼=Rogue、海族=Merfolk、神祗=Divine、潘之谷/银林地/狐狸座截断形）、具名族召唤（小鬼=Imp 族 5 只、科博=Kobold 族 5 只，8461/7991）、EN 名残留回退（9490 Immortal Furnax→不朽熔炉）、调价/词序归一（9524/9525「-{2}」MT 残渣、8529「对多→最多」、9826/9827「优先」剥除+「使用了」、8191「而加强」、8283 几率来源先解析、8397 耗蓝目标扩形、8409 消除目标扩形+电风暴=Yellow 裁定、7204 CHOSEN_TARGET、7295 军队拉到首位、9566 lastDamaged、9111「则伤害翻倍」尾形、8401 自身灵魂=battleSouls、7815 manaCost 来源+神祗+再加成、7414 rangeSpec 区间、7412 法力灼烧=drainMana+drainedMana 主源）——零降级（无一带既 full 降 partial）。');
  lines.push('');
  lines.push('## 第五轮升级对比（K-E 引擎原语批接线，2026-09-18 · 第四轮 418/288/12 → 本轮）');
  lines.push('');
  lines.push('| 保真度 | 第四轮 | 第五轮 | 增量 |');
  lines.push('|---|---|---|---|');
  lines.push(`| full | 418 | 610 | +192 |`);
  lines.push(`| partial | 288 | 96 | -192 |`);
  lines.push(`| mana-only | 12 | 12 | 0 |`);
  lines.push(`| 战斗可用 | 706 | 706 | 0 |`);
  lines.push('');
  lines.push('**本轮（K-E 原语接线）新消化**（四族，裁定见 spell-rules §14 第五轮记录）：');
  lines.push('');
  lines.push('- tempering 完整编译：76 把 Doomed 淬炼增项从「参数化省略」升级为 `tempering` 来源修饰（level 0 增项=0、随段位缩放；「每级回火 +N 点」「每提升一级强化等级额外增加 N 点」「+N 颗宝石」全形态）；「回火等级有 N% 几率杀死」→ execute 段 chanceBoost（8726-8728 chance 0+boost=level 0 恒不触发的诚实语义）；');
  lines.push('- 劫数条件接线：enemyHasDoom()（targetHasDoom，敌方存活者 troopTypes 含 Doom）——「则再增加/给予 N 点」→ condBonus 挂前段（7655-7660/7952-8083 官方形态）、「可造成双倍伤害」→ condMult（8726-8728）、「再创造 N 颗」→ lastCreate 复用 + ifCond（7952）、「恢复我四分之一的法力值」→ mana fraction 0.25（9580-9582，R12 fraction 原语）、「先破坏其护甲」→ reduce drainAll（9825-9830）；');
  lines.push('- 王国族接线：条件「若敌人来自X，或战斗发生在/位于X，则 N 倍」→ anyOf(kingdomOf enemy, kingdomPresent) condMult（8322-8360 族 37 把，样例 8322 阿达纳手枪）；「盟友来自X则…」→ 段级 targetKingdom（8971）；「因X王国盟友数而增强」→ alliesOfKingdom（9302/9354/8877 等，修正第四轮 teamSize 误读）；「每有一名X王国盟友则创造 N 颗宝石」→ alliesOfKingdom 修饰；「召唤一名/1 到 3 名X王国军队」→ summonRandomOfKingdom（7816 countRange、8399/8451/8505/8510/8513/9210 等）；「赋予所有X王国盟友随机正面」→ inflictRandom targetKingdom；王国判定先于种族表（「龙爪盟友」≠ 龙族）；');
  lines.push('- 敌侧计数接线：enemiesOfColor/enemiesOfRace/enemiesOfKingdom——「几率因恶魔敌人数而增强」（8391/8392）、「每有一名X色敌人则创造/给予…」（7982/8047/8872/8873）、「因敌我双方的X色军队/巨人军队数」（7250/7445 双来源）、「敌我双方的黄金数」→ battleGold 共用池（8073）；');
  lines.push('- 修饰 rider 词序补全：「伤害只因X而增强」（8877）、「伤害力由X而增强」（8726-8728 机翻 伤害值→伤害力）；');
  lines.push('');
  lines.push('**上一轮（K-B3 解析器冲刺）消化的句式家族**（引擎原语零新增，全部为生成器规则/词表扩展，裁定见 spell-rules §14）：');
  lines.push('');
  lines.push('- 「boosted by」修饰句大族归一：「X盟友可提升伤害」「由X激发/增强」「受到X的加成」「被蛛网束缚的敌人伤害加成」「而加强/而激发」机翻词序——9833/9834/9836/9837/9842/9876/9912/9913/9915/9972/9974/9975/9977/10015/10047/10048/10049/8453/8620/8398/8052 等 30+ 把回收，尾部 [xN] 随归属子句挂载；');
  lines.push('- 机翻族名/兵种名补全（EN 原文 + troops.json troopTypes 反查）：猫族/罗刹=Raksha、金牛座/牛头族=Tauros、人马=Centaur、狼族/战神=Wargare、蛮族=Wildfolk、厄什卡/乌尔斯卡=Urska、建造=Construct、罗格=Rogue、冥河/猎鹰/鸟族=Stryx、美人鱼=Merfolk、魔头=Boss——「爆炸+赋予随机正面+召唤」三连武器族（7531/8455/8708/8771/8907/8908/9207/9210/9266/9301/9508/9511/9575/9754/9916 等 20+ 把）整族回收；');
  lines.push('- 不朽/永生神兵种引用机翻归一：拉奇亚→拉基亚、阿巴顿→亚巴顿、Scoprio→天蝎座、卡奥玛尼→考马尼、不朽双子→双子座、不朽的怪物→龟背竹（EN Monstera）、不朽巨龟→穴居人（EN Trogolin）、不朽牛头怪→陶拉乌斯——troopPresent 条件族（9378/9381/9387/9484/9486/9488/9564/9566/9649/9720/9809/9811/9840/9842/9934/9936/9983）条件半边全通；');
  lines.push('- 条件伤害半边：风暴「翻倍」（8135）、目标色三倍（8145）、目标状态双倍/三倍（8186/8508/9687）、动词省略（「已中毒」9687）、数值空格（「造成 3 倍」）、任意族 Boss 条件（7754/7803/7955）、boardAtLeast「N 或更多颗」（8436）、anyOf 状态计加（8640「每陷入以下一个状态…：缠绕、燃烧、冻结、击晕」）；');
  lines.push('- 修饰/创造/清除 rider：「随机摧毁 N 颗宝石，摧毁数因X而增强」（7447 battleGold、9720 allyStatusCount）、「创造 N 颗X色宝石，宝石数因拥有法印效果的盟友数而增强」（7491）、逐摧毁创造修正（7178/8518 族——修复正则失配套\\d 的预存 bug）、创造+modifier 宾语提取修正（7491 曾丢颜色）；');
  lines.push('- 窃取/耗蓝扩形：「窃取一名敌人全部护甲值」（7754 drainAll）、「窃取其 N 点生命值」（8952 条件化）、「窃取 [魔法+1] 点攻击力和护甲值」双段（7803）、「耗尽最高 N 点法力值」（7866 up-to=夹零等价）、「吸取目标的所有法力值」（9811）、「每有一名亡灵盟友则消耗 3 点法力值」（9579 alliesOfRace 修饰）；');
  lines.push('- 其他：三支 oneOf（8253 耗蓝或增益或创造）、独立掷签（8283 个别几率）、全部技能值四段展开（7294/7864）、编队上方敌人（9162 enemyAboveTarget）、随机摧毁列（8619/9387/9484 destroyRandomCols）、爆破一行或一列 oneOf（8448）、具名特殊宝石定量爆破（9747/9840）、选定颜色清除（8511）、八种「每有一名X盟友则创造 N 颗混合宝石」语序（8161/8260-8266/8313-8315/8386/8394/8402/8434/8435/8452/8487/8506/8645/8669/8809/8877 族——种族半边回收、王国半边诚实略去）。');
  lines.push('');
  lines.push(`**mana-only 余量 ${manaOnly.length} 条构成**（全部为引擎/数据真实缺口，不为凑数硬收）：机翻占位符 {1}（7071）、stat 翻倍 2（7188/7199）、基数取目标属性（7190）、行绑定清除（7217）、随机倍率通配创造（8577）、EN-only 快照 3（10045/10063/10065）。`);
  lines.push('');
  lines.push('## SpellId 冲突检查（动工前扫描）');
  lines.push('');
  lines.push('- 718 个武器 spellId（7064–10065，跨 7k/8k/9k/10k 四段）与 `troops.json` 全部 spell id **零交集**；');
  lines.push('- 与 curated 既有 52 个批次（含 batch-r1~r9、batch-p37~p40）的 compiled+skipped id **零交集**；');
  lines.push('- 与 `library.ts` SKILL_OVERRIDES（7004/7062/7063/7132/7155）**零交集**。');
  lines.push('- 结论：**无冲突**；W 系批次仍采用独立注册表（`collectWeaponCurated`），');
  lines.push('  因为部队侧对号入座校验（tests/unit/spellData.test.ts）要求 curated id 必须存在于 troops.json，武器 id 不满足。');
  lines.push('');
  lines.push('## 批次文件清单（full + partial 入批）');
  lines.push('');
  {
    const batches = [];
    for (let i = 0; i < bound.length; i += BATCH_CHUNK) batches.push(bound.slice(i, i + BATCH_CHUNK));
    batches.forEach((chunk, bi) => {
      const name = `W${String(bi + 1).padStart(2, '0')}`;
      const fu = chunk.filter((r) => r.fidelity === 'full').length;
      const pa = chunk.filter((r) => r.fidelity === 'partial').length;
      lines.push(`- \`src/engine/skills/curated/batch-${name.toLowerCase()}.ts\`（BATCH_${name}）：full ${fu} + partial ${pa}`);
    });
  }
  lines.push('');
  lines.push('## missingFeatures 直方图（按条数）');
  lines.push('');
  lines.push('| 特征 | 条数 | 样例 spellId |');
  lines.push('|---|---|---|');
  for (const [f, v] of [...featHist.entries()].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${f} | ${v.count} | ${v.sample.spellId} |`);
  }
  lines.push('');
  lines.push('## 句式家族分布（绑定视角）');
  lines.push('');
  lines.push('| 家族 | 绑定(full+partial) | 总数 |');
  lines.push('|---|---|---|');
  for (const [f, v] of [...fam.entries()].sort((a, b) => b[1].total - a[1].total)) {
    lines.push(`| ${f} | ${v.bound} | ${v.total} |`);
  }
  lines.push('');
  lines.push('## 原语请求清单（供 G 窗口评估；partial 化不消掉请求——只是战斗可用性先解耦）');
  lines.push('');
  lines.push('| 特征 | 受影响条数 | 期望形态 | 样例（spellId） |');
  lines.push('|---|---|---|---|');
  for (const [feat, label, form] of PRIM) {
    const cur = featHist.get(feat);
    if (!cur) continue;
    lines.push(`| ${label} | ${cur.count} | ${form} | ${cur.sample.spellId} |`);
  }
  lines.push('');
  lines.push('## 其余放弃说明（诚实原则）');
  lines.push('');
  lines.push('- partial/mana-only 的被略去子句逐字保存在 meta 的 skippedClauses，可随时复核与回收；');
  lines.push('- 机翻噪声（「造成l」「{1}」占位符、错字语序）不硬凑，EN 原文仅作对照、zh 为锚；');
  lines.push('- 中英快照不同步的个别条目由独立英文及 native 步骤确认后显式纠正文案（7074/7089 恢复前两名敌人伤害），不默认以 zh 覆盖。');
  lines.push('');
  mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
  writeFileSync(REPORT_OUT, lines.join('\n') + '\n', 'utf8');
  console.log(`report → ${path.relative(ROOT, REPORT_OUT)}`);
}

// 直接运行才执行命令（被 import 时不产生副作用，便于分析脚本复用 compileAll）
const INVOKED = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (INVOKED) {
  const cmd = process.argv[2] ?? 'pool';
  if (cmd === 'pool') cmdPool();
  else if (cmd === 'triage') cmdTriage();
  else if (cmd === 'left') cmdLeft();
  else if (cmd === 'debug') cmdDebug(process.argv[3]);
  else if (cmd === 'gen') cmdGen();
  else if (cmd === 'report') cmdReport();
  else console.log('用法: pool | triage | left | debug <id> | gen | report');
}
export { compileAll, loadWeapons, loadTroops, Compiler, parseScalings, familyOf, classifyClause };

