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
  ['反射', 'reflect'], ['狼化', 'lycanthropy'],
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
  ['末日骷髅头', 'doomSkull'], ['厄运骷髅头', 'doomSkull'],
  ['燃烧宝石', 'burningGem'], ['冻结宝石', 'freezeGem'], ['诅咒宝石', 'curseGem'],
  ['流血宝石', 'bleedGem'], ['毒药宝石', 'poisonGem'], ['毒宝石', 'poisonGem'],
  ['死亡标记宝石', 'deathMarkGem'], ['恐怖宝石', 'terrorGem'], ['缠绕宝石', 'entangleGem'],
  ['激怒宝石', 'enrageGem'], ['沉没宝石', 'submergeGem'], ['妖仙宝石', 'faerieFireGem'],
  ['精灵火宝石', 'faerieFireGem'], ['打昏宝石', 'stunGem'], ['击晕宝石', 'stunGem'],
  ['屏障宝石', 'barrierGem'], ['织网宝石', 'web'], ['蛛网宝石', 'web'], ['许愿宝石', 'wish'],
  ['幽魂宝石', 'ghost'], ['鬼魂宝石', 'ghost'], ['沙漏宝石', 'hourglass'],
  ['赃物宝石', 'bootyGem'], ['战利品宝石', 'bootyGem'], ['炸弹宝石', 'bomb'],
  // —— Wave B（提交 2813774）：龙/巨人/灵力/法力药水/糖果 = 六色族，spec.color 携带归属色 ——
  ['龙宝石', 'dragonGem'], ['巨人宝石', 'giantGem'], ['灵力宝石', 'spiritGem'],
  ['法力药水宝石', 'manaPotionGem'], ['糖果宝石', 'candyGem'],
  ['元素星', 'elementalStar'], ['临界星', 'umbralStar'], ['暗影之星', 'umbralStar'],
  ['天使宝石', 'angelGem'], ['石像鬼宝石', 'gargoyleGem'],
  ['传送门宝石', 'daemonicPortalGem'], ['狼化宝石', 'lycanthropyGem'],
  ['腐朽宝石', 'decayGem'], ['腐烂宝石', 'decayGem'], ['陷阱宝石', 'trapGem'], ['火山宝石', 'volcanoGem'],
];
/** 六色族：文本带颜色时经 spec.color 通道携带（GEMS-SEMANTICS-2 拍板方案） */
const SIX_COLOR_GEMS = new Set(['dragonGem', 'giantGem', 'spiritGem', 'manaPotionGem', 'candyGem']);
/** 仍不可组装的宝石族（贪婪宝石无 kind；「龙族宝石/蓝龙宝石」官方句未考证到可组装口径） */
const BLOCKED_GEM_RE = /龙族宝石|蓝龙宝石|贪婪宝石/;
/** 种族别名（高置信；「怪兽=Monster」batch-10 先例、「仙灵/妖仙=Fey」batch-17 先例）。
 *  2026-09-18 第三轮：机翻别名补全（亡灵=Undead、神秘=Mystic、构装体=Construct——
 *  均经 troops.json troopTypes 反查确认该族有成员）。 */
const RACE_ALIAS = {
  恶魔: 'Daemon', 不死族: 'Undead', 亡灵: 'Undead', 元素: 'Elemental', 元素生物: 'Elemental', 神祇: 'Divine',
  纳迦: 'Naga', 半人马: 'Centaur', 巨人: 'Giant', 矮人: 'Dwarf', 人类: 'Human', 兽人: 'Orc',
  骑士: 'Knight', 机械: 'Mech', 秘士: 'Mystic', 神秘: 'Mystic', 龙: 'Dragon', 龙族: 'Dragon', 野兽: 'Beast', 哥布林: 'Goblin', 妖仙: 'Fey', 精灵: 'Elf',
  怪兽: 'Monster', 怪物: 'Monster', 构装体: 'Construct',
};
/** 王国名清单（troops.json 42 王国；按王国限定目标/随机召唤 = 无对应原语，batch-16 8831 先例） */
const KINGDOM_NAMES = ['破碎尖塔', '阿达纳', '卡拉考斯', '蛛尔卡里', '卜筮之原', '鳞雾沼泽', '荆棘森林', '白盔国', '潘神之谷', '盖塔尔', '卡其尔', '齐埃金', '荣耀之地', '加尔凡尼亚', '剑锋崖', '风暴峡湾', '毛格瑞姆森林', '葛洛什奈克', '混沌', '狂野平原', '黑石', '聚沙之地', '荒芜之地', '冰峰之巅', '天启', '狮心帝国', '龙爪', '守护者', '黑鹰', '玉银林地', '日冕', '厄什卡亚', '藏宝库', '梅兰堤斯', '圣唐', '皓彩森林', '卓克祖', '迈纳杰之罪', '沃尔帕克', '诺斯', '地狱悬崖', '午夜城市', '盛唐'];
/** 全视之眼 = Ocularen 族（batch-08 7752 先例的引用清单） */
const OCULAREN_REFS = ['OcularenLeech', 'Ocularen', 'BurningOcularen', 'GloomOcularen'];
/** 风暴颜色（spell-rules §9.1；地狱≈火 = batch-p37 8560 先例） */
const STORM_COLORS = { 尘: 'Brown', 冰: 'Blue', 叶: 'Green', 火: 'Red', 光: 'Yellow', 暗: 'Purple', 地狱: 'Red' };

// —— 数据加载 ——
function loadWeapons() {
  const raw = JSON.parse(readFileSync(WEAPONS, 'utf8')).weapons;
  return raw.map((x) => {
    const { scalings, modifier } = parseScalings(x._zh.spellDesc);
    return {
      spellId: x.SpellId,
      weaponRef: x.ReferenceName,
      weaponName: x._zh.name,
      spellName: x._zh.spellName,
      desc: x._zh.spellDesc,
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
    if (clauses.length === 0) return { manaOnly: true, features: [], skippedClauses: [] };
    const state = {
      segments: [], tag, tagUsed: false, skippedClauses: [], features: new Set(),
      temperingOnly: 0, lastCreate: null, lastChanceSeg: -1, lastAllyRace: null, buffRace: null,
    };
    for (let raw of clauses) {
      // 子句归一：机翻噪声与连接词头（&&/然后/再/接着/并/同时/而且）——
      // 只剥离「句首」连接词，句中的交由 tryCompound 拆分；已知机翻错字定点修复
      raw = raw.replace(/^[\s,，。;；&]+/, '');
      raw = raw.replace(/^(?:然后|再|接着|同时|并|而且|且|随之)/, '').trim();
      raw = raw.replace(/^[\s,，。;；&]+/, '').trim();
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
      // 淬炼增项是「参数化省略」（用户裁定 #2，0 级时增项=0），不算语义缺口：
      // 略去的全是淬炼碎片时，尾部标签仍可靠挂载到最近数值段（战斗语义完整）
      const onlyTempering = state.skippedClauses.length === state.temperingOnly && state.temperingOnly > 0;
      if (!onlyTempering && state.skippedClauses.length > 0) {
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
    // 机翻错字定点归一（gowhead zh 快照噪声；EN 侧核实为同义句）
    c = c.replace('反射教过', '反射效果');
    // 淬炼增项：参数化省略（用户新裁定 #2）——增项略去、主效果照编
    const tFrag = c.match(/[,，]?\s*(?:每锻炼|每级回火|每提升一级强化|回火等级)[^，。；]*/);
    if (tFrag) {
      state.features.add('tempering-scaling');
      state.temperingOnly += 1;
      state.skippedClauses.push(tFrag[0].replace(/^[，,]\s*/, ''));
      c = c.replace(tFrag[0], '').replace(/[,，、]\s*$/, '').replace(/^\s*[,，、]/, '').trim();
      if (c === '') return ''; // 本子句仅剩淬炼增项 → 整句略去
    }
    for (const handler of [
      this.hPureCondMult, this.hKingdomCond, this.hIfPayload, this.hDamage, this.hStandaloneModifier, this.hStatus,
      this.hGemOps, this.hBuffHeal, this.hReduceDrain, this.hCleanseExtraTurn,
      this.hStormSummon, this.hRepositionMisc, this.hEconomy,
    ]) {
      const r = handler.call(this, c, state);
      if (r === null) continue;
      if (r === '') return null;
      // 定性原因（缺失状态/特殊宝石/王国/原语请求等）→ 整句记录一次，不做或拆碎片化
      if (/原语请求|缺失状态|特殊宝石家族|语义拿不准|无对应原语|译文异常|不属于该处理器/.test(r)) return r;
      // 处理器报错：若含复合拆分标记，先试拆分（拆分成功即修复；否则保留原错误）
      if (/，|并|或/.test(c)) {
        const splitErr = this.tryCompound(c, state);
        if (splitErr === null) return null;
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
    // 「X 或 Y」= 掷签二选一（§9.3 裁定；8459 先例）
    const orParts = splitTopLevel(c, '或');
    if (dbg) console.log('   [tryCompound]', JSON.stringify(c), 'or:', JSON.stringify(orParts));
    if (orParts.length === 2) {
      const s1 = [];
      const s2 = [];
      const t1 = { ...state, segments: s1 };
      const t2 = { ...state, segments: s2 };
      const e1 = this.clause(orParts[0], t1);
      const e2 = e1 ? e1 : this.clause(orParts[1], t2);
      if (!e1 && !e2) {
        this.use('oneOf');
        state.segments.push(`oneOf([${s1.join(', ')}], [${s2.join(', ')}])`);
        return null;
      }
      // 单侧可编译 → 收下该侧，另一侧记省略（partial；一侧卡点不代表另一侧不可用）
      if (!e1) {
        state.segments.push(...s1);
        this.recordSkip(orParts[1], e2, state);
        return null;
      }
      if (!e2) {
        state.segments.push(...s2);
        this.recordSkip(orParts[0], e1, state);
        return null;
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

  /** 王国条件倍率：显式 SKIP（batch-23 9376 / batch-24 9593 同款不做） */
  hKingdomCond(c, _state) {
    const m = /^(?:如果|若)敌人来自([\u4e00-\u9fa5]+?)(?:，或战斗发生在[\u4e00-\u9fa5]+?)?[，,]?则造成双倍伤害$/.exec(c);
    if (m) return `王国条件倍率（「若敌人来自${m[1]}/战斗发生在该王国」无对应条件原语，batch-23 9376 同款）→ 原语请求：kingdom 条件`;
    return null;
  }

  // —— 纯条件倍率子句（回挂最近伤害/数值段；8934 / batch-05 7059 系口径）——
  hPureCondMult(c, state) {
    let m = /^(?:如果|若)(?:现有|存在)(?:一个|一种)?([\u4e00-\u9fa5]?)风暴[，,]?(?:则)?(?:造成)?(?:伤害)?双倍$/.exec(c);
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
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?造成三倍伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '三倍伤害条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, 3, { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?造成(\d+)倍伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '倍率条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, Number(m[2]), { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    m = /^(?:如果|若)(?:敌人|对方)使用(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则)?造成双倍伤害$/.exec(c);
    if (m) {
      const idx = lastKind(state.segments, /dmg/i);
      if (idx < 0) return '双倍伤害条件找不到前置伤害段';
      state.segments = withCondMultAt(state.segments, idx, 2, { kind: 'targetColor', color: COLORS[m[1]] });
      return '';
    }
    // 「如果对方攻击力大于自身，则造成多 N 点伤害 / N 倍伤害」= 反向属性比较（§13.2 仅支持正向）
    m = /^(?:如果|若)(?:敌人|对方)(?:的)?(生命值|攻击力|护甲值|魔法值)(?:值)?高于自身[，,]?(?:则)?造成(?:多\s*\d+\s*点|\d+\s*倍)伤害$/.exec(c);
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
    // 「若盟友使用红色法力，则效果翻倍」→ 回挂最近 buff 段（7955 先例口径：目标相对条件）
    m = /^(?:如果|若)盟友使用(红|蓝|绿|黄|紫|棕)色?法力[，,]?(?:则)?效果?翻倍$/.exec(c);
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
    {
      const cc = c.replace('已下潜', '已陷入下潜');
      m = /^(?:如果|若)敌人已?(?:陷入|身中|被)(.+?)(?:状态)?[，,]?(?:则)?造成(双倍|三倍|\d+倍)伤害$/.exec(cc);
      if (m) {
        const id = matchStatus(m[1]);
        if (!id) return `状态词无法识别「${m[1]}」`;
        const idx = lastKind(state.segments, /dmg/i);
        if (idx < 0) return '状态条件找不到前置伤害段';
        const times = m[2] === '双倍' ? 2 : m[2] === '三倍' ? 3 : Number(m[2].replace('倍', ''));
        state.segments = withCondMultAt(state.segments, idx, times, { kind: 'targetStatus', statusId: id });
        return '';
      }
    }
    m = /^(?:如果|若)敌人已?(?:陷入|身中|被)(.+?)(?:状态)?[，,]?(?:则)?(?:增加|造成额外)\s*(\d+)\s*点伤害$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      if (!id) return `状态词无法识别「${m[1]}」`;
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
    m = /^(?:如果|若)(?:敌人|对方)是一?名?([\u4e00-\u9fa5]+?)(?:族|军队|生物)?[，,]?(?:则)?造成(三|\d+|双)倍?伤害$/.exec(c);
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
    // 「如果现有X风暴，则<payload>」→ ifCond stormPresent
    m = /^(?:如果|若)现有([\u4e00-\u9fa5]?)风暴[，,]?则(.+)$/.exec(c);
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
    // 「如果敌方有X军队，则<payload>」→ ifCond enemyRacePresent（§ enemyRacePresent 全局条件）
    m = /^(?:如果|若)敌方有([\u4e00-\u9fa5]+?)(?:军队|部队|盟友)[，,]?则(.+)$/.exec(c);
    if (m) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌方种族条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'enemyRacePresent', race })));
      return '';
    }
    // 「如果敌人已陷入/已带有X状态，则<payload>」→ ifCond anyEnemyStatus（全局聚合，§9.7；动词可省略——「已中毒」7380 族）。
    // 状态词认不出 → 交回后续处理器（身亡/末日/用法力等专属规则），本规则不认领
    m = /^(?:如果|若)敌人已?(?:陷入|身中|被|带有|拥有)?(.+?)(?:状态|效果)?[，,]?(?:则|那么)(.+)$/.exec(c);
    if (m && !/(末日|厄运|劫数|毁灭之力)/.test(m[1])) {
      const id = matchStatus(m[1]);
      if (!id) return null;
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
    // 「如果敌人/敌方(拥有|带有|有)(末日|厄运|劫数|毁灭之力)(效果)?，则X」= Doomed 机制条件（引擎无对应）→ 定性原语请求
    m = /^(?:如果|若)(?:敌方|敌人|对方|目标|他们)(?:拥有|带有|有|身上有)(?:一个)?(末日|厄运|劫数|毁灭之力)(?:效果|标记)?/.exec(c);
    if (m) {
      return `「敌方拥有${m[1]}」Doomed 机制条件无对应 Condition kind → 原语请求：targetHasDoom 条件`;
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
    // 「如果(敌人|目标)使用(色)法力(值)?，则X」→ ifCond targetColor（目标相对过滤；9825 族）
    m = /^(?:如果|若)(?:敌人|对方|目标)(?:使用|用的是)(红|蓝|绿|黄|紫|棕)色?法力(?:值)?[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m) {
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌色条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'targetColor', color: COLORS[m[1]] })));
      return '';
    }
    // 「若自身已有X(效果|状态)，则X」→ ifCond selfStatus（8842）
    m = /^(?:如果|若)自身已有(.+?)(?:状态|效果)[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      if (!id) return `状态词无法识别「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `自身状态条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'selfStatus', statusId: id })));
      return '';
    }
    // 「如果敌人是X(族)，则X」→ ifCond targetRace（目标相对过滤）
    m = /^(?:如果|若)(?:敌人|对方|目标)是一?名?([\u4e00-\u9fa5]+?)(?:族|军队|生物)[，,]?(?:则|那么)?(.+)$/.exec(c);
    if (m && !/造成(双倍|三倍|\d+倍)伤害/.test(c)) {
      const race = RACE_ALIAS[m[1]];
      if (!race) return `种族别名无法映射「${m[1]}」`;
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `敌族条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'targetRace', race })));
      return '';
    }
    // 「有 N 名敌人身亡」= 任意敌人阵亡，与 §4 ifTargetDied（追踪主目标）口径不一致 → 语义拿不准
    m = /^(?:如果|若)有\s*\d+\s*[名个]敌人(?:身亡|死亡)[，,]?则(.+)$/.exec(c);
    if (m) {
      return '「有 N 名敌人身亡」为任意阵亡口径，与 ifTargetDied（追踪主目标）不一致（语义拿不准）→ 原语请求：anyEnemyDied 条件';
    }
    m = /^(?:如果|若)(?:板面上有|有|存在)\s*(\d+)\s*颗或更多(?:的)?(红|蓝|绿|黄|紫|棕)色?宝石[，,]?则(.+)$/.exec(c);
    if (m) {
      const stash = this.parseSub(m[3], state);
      if (typeof stash === 'string') return `宝石数量条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'boardAtLeast', color: COLORS[m[2]], n: Number(m[1]) })));
      return '';
    }
    m = /^(?:如果|若)(?:自身)?(生命值|攻击力|护甲值|魔法值)(?:值)?高于敌人[，,]?则(.+)$/.exec(c);
    if (m) {
      const statMap = { 生命值: 'hp', 攻击力: 'attack', 护甲值: 'armor', 魔法值: 'magic' };
      const stash = this.parseSub(m[2], state);
      if (typeof stash === 'string') return `属性比较条件 payload：${stash}`;
      state.segments.push(...stash.map((s) => withIfCond(s, { kind: 'casterStatBeatsTarget', stat: statMap[m[1]] })));
      return '';
    }
    // 「若自身队伍中有X / 若队伍里有永生神X / 如果我的队伍中有X，则<payload>」→ troopPresent（§11.5）
    // 「则」必须显式存在：懒匹配 m[1] 依赖它锚定兵种名边界
    m = /^(?:如果|若)(?:自身)?我?的?队伍(?:里|中)?有(?:一名)?(.+?)[，,]?(?:则|那么)(.+)$/.exec(c);
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

  /** 不可携带 opts 的段族（无 opts 形参，条件挂载会错位） */
  static NO_OPTS_RE = /^(destroyColor|explodeColor|destroySkulls|explodeSkulls|destroyChosenRow|destroyChosenCol|explodeChosenRow|explodeChosenCol|oneOf|cleanse)\(/;

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
      { re: /^对(?:另)?一名随机敌人|^对随机(?:的)?一名敌人|^对s*1s*[名个]s*随机的?敌人/, t: () => ({ mode: 'enemyRandom' }) },
      { re: /^对(?:另)?\s*(\d+)\s*[名个]\s*随机(?:的)?敌人/, t: (m) => ({ mode: 'enemyRandomN', n: Number(m[1]) }) },
      { re: /^对\s*(\d+)\s*[名个]\s*的?随机敌人/, t: (m) => ({ mode: 'enemyRandomN', n: Number(m[1]) }) },
      { re: /^对(?:一名|一个)?随机的?敌人/, t: () => ({ mode: 'enemyRandom' }) },
      { re: /^对敌人造成l\s/, t: () => ({ mode: 'enemyChosen', typo: true }) },
      // 「对其下方的所有敌人」须先于代词头（否则「对其」截断）
      { re: /^对其下方的所有敌人/, t: () => ({ mode: 'enemyChosenAndBelow' }) },
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
    const perDestroy = /(?:，|,)?(?:同时|并且)?每摧毁一颗(红|蓝|绿|黄|紫|棕)色?宝石则增加s*(d+)s*点伤害$/.exec(rest2);
    let perDestroyMod = null;
    if (perDestroy) {
      perDestroyMod = { mod: { kind: 'multiplier', a: Number(perDestroy[2]) }, source: { kind: 'destroyedGems', color: COLORS[perDestroy[1]] } };
      rest2 = rest2.slice(0, perDestroy.index).trim();
    }
    // 同子句 rider：，并窃取其半数攻击力（7805：steal halve 跨段回指）
    let halveStealStat = null;
    const halveSteal = /(?:，|,)?并?窃取其?半数(攻击力|护甲值|魔法值|法力值)$/.exec(rest2);
    if (halveSteal) {
      halveStealStat = statOf(halveSteal[1]);
      rest2 = rest2.slice(0, halveSteal.index).trim();
    }
    // 同子句 rider：，伤害值因X而增强/加强（tag 缺省按 [1:1]，7059 系先例）；来源不可解析 → 增项略去（partial 化）
    let modifier = null;
    const modm = /(?:，|,)?(?:伤害值|数值|点数|效果)?并?因(.+?)而增[强加]$/.exec(rest2);
    if (modm) {
      const src = parseModifierSource(modm[1]);
      if (!src) {
        state.skippedClauses.push(modm[0].replace(/^[，,]/, ''));
        classifyClause(modm[1], '修饰来源无法解析', state.features);
        rest2 = rest2.slice(0, modm.index).trim();
      } else {
        modifier = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
        if (state.tag) state.tagUsed = true;
        rest2 = rest2.slice(0, modm.index).trim();
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
      this.use('steal');
      state.segments.push(`steal('${refTargetOf(state)}', '${halveStealStat}', '${halveStealStat}', 0, 0, { halve: true })`);
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
    // 「陷入叠加 N 的出血状态」（9167）
    let m = /^(?:使其?|令其?|让他|对她|对目标)?(?:陷入|施加)叠加\s*(\d+)\s*的?(.+?)(?:状态|效果)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[2]);
      if (!id) return `状态词无法识别「${m[2]}」`;
      this.use('inflict');
      state.segments.push(`inflict('${id}', 'enemyChosen', { stacks: ${m[1]} })`);
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
    let asg = /^(?:赋予|给予)(.+?)盟友(.+?)(?:状态|效果)?$/.exec(c);
    if (asg && !/随机/.test(c)) {
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
      if (!/(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值|技能点数)/.test(c)) {
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
    // 「赋予/给予 X盟友 一个随机(正面增益)状态效果」大族（§11.3/§11 补充：盟友=正面池）
    m = /^(?:赋予|给予|使)(.*?)盟友(?:获得)?一个?随机(?:的)?(?:正面增益|正面增益状态)?(?:状态)?(?:状态效果|效果|状态)$/.exec(c);
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
    if (m && !/点/.test(m[2]) && !/伤害|生命值|护甲值|攻击力|魔法值|法力值/.test(c)) {
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
    m = /^(获得|赋予自身|赋予他|赋予一名盟友|赋予所有盟友|赋予所有其他盟友|获得屏障|赋予其)(屏障|狂怒|下潜|沉没|死亡标记|猎人标记|疾病)(?:效果|状态)?$/.exec(c);
    if (m) {
      const id = matchStatus(m[2]);
      const mode = m[1] === '获得' || m[1] === '获得屏障' ? 'allySelf'
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
    // 「X（目标）陷入 Y 状态」/「陷入 Y 状态」（目标在句首：所有敌人/一名敌人/…）
    m = /^(.*?)陷入(.+?)$/.exec(c);
    if (m) {
      const statusText = m[2].replace(/(状态|效果)$/, '').trim();
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
    // 状态动词开头：「缠绕第一名敌人」「点燃一名敌人（=燃烧）」
    const verbMap = [['缠绕', 'entangle'], ['冻结', 'frozen'], ['冰冻', 'frozen'], ['沉默', 'silence'], ['打昏', 'stun'], ['击晕', 'stun'], ['点燃', 'burning'], ['燃烧', 'burning'], ['魅惑', 'charm'], ['诅咒', 'curse']];
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
    if (!/(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值|技能点数)/.test(c)) {
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
    // 创造动词族（机翻译名不统一：创造/制作/制造/创建/生成）
    const CREATE_V = '(?:创造|制作|制造|创建|生成)';
    // 混合宝石（骷髅/特殊端点 → 无 mix 原语；色+色 → createMix）；
    // 「创造 15 颗 红色和绿色的宝石」（无「混合」二字，7654）同 createMix 口径
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
      const colorParts = parts.filter((p) => matchColor(p));
      if (parts.length === colorParts.length && parts.length >= 2) {
        this.use('createMix');
        state.segments.push(`createMix([${colorParts.map((p) => `BaseColor.${matchColor(p)}`).join(', ')}], ${cnt})`);

        return '';
      }
      return `混合宝石含骷髅头/特殊宝石端点，无 mix 原语（原语请求：createMix 扩特殊宝石端点）`;
    }
    // 「创造 N 颗A色宝石和 M 颗B色宝石」→ 两段 createGems（7529；修复旧版吞色 bug）
    m = new RegExp(`^${CREATE_V}\\s*(\\d+)\\s*颗?(红|蓝|绿|黄|紫|棕)色?宝石和\\s*(\\d+)\\s*颗?(红|蓝|绿|黄|紫|棕)色?宝石$`).exec(c);
    if (m) {
      this.use('createGems');
      state.segments.push(`createGems(BaseColor.${COLORS[m[2]]}, ${m[1]}, 0)`, `createGems(BaseColor.${COLORS[m[4]]}, ${m[3]}, 0)`);

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
    // 每有一颗X色宝石（在所选的列），则创造 N 颗Y → 列内计数来源缺失（8805 族）诚实略去
    m = /^(?:所选的列)?每有一颗?(红|蓝|绿|黄|紫|棕)?色?或?(红|蓝|绿|黄|紫|棕)?色?宝石[，,]?则(?:再)?创造/.exec(c);
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
      state.segments.push(`${fn}(${n}, 0, 'color', undefined, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 每有一名X盟友，则创造 N 颗宝石，所创造的宝石混合A和B两种颜色 [xN]
    m = /^每有一名(.+?)盟友[，,]?则创造\s*(\d+)\s*颗宝石[，,]?所创造的宝石混合(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?两种颜色$/.exec(c)
      // 语序变体：「每有一名骑士盟友，则创造混合蓝色和红色的 6 颗宝石」（7863）
      || /^每有一名(.+?)盟友[，,]?则创造混合(红|蓝|绿|黄|紫|棕)色?和(红|蓝|绿|黄|紫|棕)色?的\s*(\d+)\s*颗宝石$/.exec(c);
    if (m) {
      let src2; let n; let cA; let cB;
      if (/所创造的宝石混合/.test(c)) {
        src2 = allySourceOf(m[1], false);
        n = Number(m[2]); cA = m[3]; cB = m[4];
      } else {
        src2 = allySourceOf(m[1], false);
        cA = m[2]; cB = m[3]; n = Number(m[4]);
      }
      if (typeof src2 === 'string') return src2;
      if (!src2) return `每一名来源无法解析「${m[1]}」`;
      const mods = { mod: state.tag ?? { kind: 'multiplier', a: n }, ...src2 };
      if (state.tag) state.tagUsed = true;
      this.use('createMix');
      state.segments.push(`createMix([BaseColor.${COLORS[cA]}, BaseColor.${COLORS[cB]}], ${n}, 0, { modifier: ${jsonMod(mods)} })`);
      return '';
    }
    // 「创造 N 颗X宝石，宝石数量因Y而增强/受Y影响」rider（create + modifier）
    m = new RegExp(`^(${CREATE_V}\\s*(\\d+)\\s*颗?.+?宝石)[，,]?(?:宝石数?量|数量|宝石数|摧毁数)?(?:因|受|随)(.+?)(?:而增强|而加强|影响)$`).exec(c);
    if (m) {
      const src = parseModifierSource(m[3]);
      if (!src) return `修饰来源无法解析「${m[3]}」`;
      const what = (m[2].replace(/^\d+\s*颗?/, '').trim());
      const call = createGemCall(this, what.replace(/^(再|然后|随机)/, '').trim(), Number(m[2].match(/\d+/)[0]), { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src });
      if (call.err) return call.err;
      if (state.tag) state.tagUsed = true;
      state.segments.push(call.seg);
      return '';
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
    m = new RegExp(`^(?:再|然后|随机)?${CREATE_V}(?:选定(?:颜色)?的)?\\s*(\\d+)\\s*[颗个]?(?:随机的?)?(.+?)?(?:色的)?(?:的)?(?:宝石|骷髅)?$`).exec(c);
    if (m && /宝石|骷髅|星/.test(c)) {
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
    m = /^(?:再)?将所有(红|蓝|绿|黄|紫|棕)色?宝石转换?为?成?(?:一个)?选定颜色$/.exec(c);
    if (m) {
      this.use('transform');
      state.segments.push(`transform(BaseColor.${COLORS[m[1]]}, CHOSEN)`);
      return '';
    }
    // 「将他/其(其中一个)法力颜色的 N 颗宝石转换成X宝石」→ from LAST_TARGET（ColorSpec 占位符）
    m = /^(?:再)?将(?:其|他|她|该敌人)(?:其中的?一个?)?法力颜色的\s*(\d+)\s*颗(?:的)?宝石转[换化]为?成?(.+?)$/.exec(c);
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
    // 「将 N 颗(色)宝石转换成X宝石」→ 定量转化（9031）
    m = /^(?:再)?将\s*(\d+)\s*颗(红|蓝|绿|黄|紫|棕)色?宝石转[换化]为?成?(.+?)$/.exec(c);
    if (m) {
      const what = m[3].replace(/宝石/g, '').trim();
      const call = transformGemCall(this, COLORS[m[2]], what, Number(m[1]), c);
      if (call === TRANSFORM_TIER_UNSUPPORTED) return '原语请求：转换端点不支持 tier（带倍率通配/恶石像鬼）';
      if (call) {
        state.segments.push(call);
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
      if (call === TRANSFORM_TIER_UNSUPPORTED) return '原语请求：转换端点不支持 tier（带倍率通配/恶石像鬼）';
      if (call) {
        state.segments.push(chosenFrom ? call.replace(`transformToSpecial('ANY'`, `transformToSpecial('CHOSEN'`) : call);
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
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(?:一颗|1 颗|1枚|一枚)宝石$/.exec(c);
    if (m) {
      // 裸单颗宝石操作 = 随机一颗（R4 §11 追加）；「宝石」不含骷髅 → include:'color'
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(1, 0, 'color', undefined)`);
      return '';
    }
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(\d+)\s*[颗枚]的?宝石$/.exec(c);
    if (m) {
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${m[2]}, 0, 'color', undefined)`);
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
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*([[\]()魔法x×/ +\d.]+?)\s*[颗枚](?:的)?宝石$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[2]);
      if (!f || f.rangeSpec) return `宝石数量公式无法解析「${m[2]}」`;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${f.base}, ${f.mult}, 'color')`);
      return '';
    }
    // 行列
    m = /^摧毁\s*(\d+)\s*个随机行$/.exec(c);
    if (m) {
      this.use('destroyRandomRows');
      state.segments.push(`destroyRandomRows(${m[1]})`);
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
    // 摧毁/移除所有：选定颜色 / C色
    if (/^(?:摧毁|移除)(?:所有)?(?:指定|选定)颜色的?(?:所有)?宝石$/.test(c) || /^移除所有一个选定颜色的宝石$/.test(c)) {
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
    const doubleM = /^使\s*\d+\s*[名个]盟友的?(护甲值|攻击力|生命值|魔法值)翻倍/.exec(c);
    if (doubleM) return `「使${doubleM[1]}翻倍」无对应原语（减半有 halve、翻倍无）→ 原语请求：stat 翻倍 buff`;
    // 「造成等同于其(目标)X的伤害」= 基数取目标属性，无对应缩放原语
    if (/造成等同于其/.test(c)) return '「等同于其攻击力的伤害」基数取目标属性无对应原语 → 原语请求：dmg base = targetStat';
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
      const subj = /^(所有|全体|其他的?)?盟友(?:全体)?(?:获得|恢复|回复)\s*(.+)$/.exec(c);
      const rand = /^随机(?:给予|给予一名|给一名)(一名|一个)?(盟友)\s*(.+)$/.exec(c);
      // 种族限定盟友（「赋予所有怪物盟友/使所有亡灵盟友」9691-10050 族）→ targetRace 通道
      const raceM = /^(?:给予|给|为|使|让|赋予)\s*(所有|全体|一名|一名随机|两名随机|随机一名|2 名随机)?\s*(?:其他|其他的)?([\u4e00-\u9fa5]{1,4}?)族?盟友\s*(?:提供|获得|恢复)?\s*(.+)$/.exec(c);
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
      } else if (raceM && RACE_ALIAS[raceM[2].replace(/族$/, '')]) {
        state.buffRace = RACE_ALIAS[raceM[2].replace(/族$/, '')];
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
    if (!/(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值|技能点数)/.test(rest)) return null;
    // 数值区间（3 - 15 点法力）= 数值型区间 blocked（§9.8 注意）
    if (/\d+\s*-\s*\d+\s*点/.test(rest)) return '数值型区间（§9.8：数值不明）不做';
    // 按「和」拆分属性段：每段独立取值；无方括号的后续段沿用前段公式（R4「一个方括号管两段」同值口径）
    this.use('heal', 'armor', 'attack', 'magic', 'mana', 'randomStat', 'scale', 'flat');
    state.lastAllyTarget = target;
    // rider：「，数量因X而增强/受X影响」→ modifier 挂本段；来源不可解析 → 增项略去（partial 化，主效果保留）
    let buffMod = null;
    const modRider = /[,，]\s*(?:数值|数量|宝石数?量)?(?:因|受|随)(.+?)(?:而增[强加]|影响)$/.exec(rest);
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
    state.buffRace = null;
    state.buffColor = null;
    const stash = this.buffPieces(restBase, target, state, buffMod, race, buffColor);
    if (typeof stash === 'string') return stash;
    state.segments.push(...stash);
    if (race) state.lastAllyRace = race;
    return '';
  }

  /** 增益/状态混合段解析：属性段 → buff 族段；状态段（「反射效果」）→ inflict；出错返回字符串 */
  buffPieces(restBase, target, state, buffMod = null, race = null, color = null) {
    const statRe = /(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值|技能点数)/;
    const parts = [];
    const segs = [];
    let lastFormula = null;
    const pieces = restBase.includes('和') ? splitTopLevel(restBase, '和') : [restBase];
    for (const piece of pieces) {
      const p = piece.trim();
      // 「一半的法力值」= mana halve（§9.6 口径）
      const halveM = p.match(/^(?:一半|半数)的?(法力值)$/);
      if (halveM) {
        parts.push({ halveMana: true });
        continue;
      }
      // 纯状态段（「反射效果」「屏障和法印」族）：hBuffHeal 的增益/状态混合分支（8842/7624）
      const bareStatus = p.replace(/点/g, '').replace(/^(一个|所有)/, '').trim();
      const statusId = matchStatus(bareStatus);
      if (!/(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值|技能点数)/.test(p) && statusId && bareStatus.length <= 6 && !parseFormulaPrefix(p)) {
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
        rest2 = f.rest.replace(/点/g, '').trim();
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
      // 「一半的法力值」= mana halve（§9.6：获得 floor(manaCost/2)，受上限夹取）
      if (part.halveMana) {
        segs.push(`mana('${mode}', 0, 0, { halve: true })`);
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
    let m = /^(?:减除|消除)(一名|所有)?敌人全部(护甲值|攻击力|魔法值|生命值)$/.exec(c);
    if (m) {
      const mode = m[1] === '所有' ? 'enemyAll' : refTargetOf(state);
      this.use('reduce');
      state.segments.push(`reduce('${mode}', '${statOf(m[2])}', 0, 0, { drainAll: true })`);
      return '';
    }
    m = /^减除(?:所有|一名|其|该)?\s*敌人\s*([[\]魔法+ x×/()\d.]+?)\s*点(护甲值|攻击力|魔法值)$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1].trim());
      if (!f || f.rangeSpec) return `削减数值无法解析「${m[1]}」`;
      const head = m[0].match(/^(减除(?:所有|一名|其|该)?)/)[1];
      const mode = /所有/.test(head) ? 'enemyAll' : /其|该/.test(head) ? refTargetOf(state) : /一名/.test(head) ? 'enemyChosen' : 'enemyAll';
      this.use('reduce');
      state.segments.push(`reduce('${mode}', '${statOf(m[2])}', ${f.base}, ${f.mult})`);
      return '';
    }
    m = /^(?:耗掉|消除)(所有|一位随机|一名随机)敌人\s*(\d+)\s*点(护甲值|法力值|攻击力)$/.exec(c);
    if (m) {
      const mode = m[1] === '所有' ? 'enemyAll' : 'enemyRandom';
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
    m = /^耗掉(?:该|其|这名)?敌人(所有的)?法力值$/.exec(c) || /^耗尽(?:该|其|这名|他)(?:的)?法力值$/.exec(c);
    if (m) {
      this.use('drainMana');
      state.segments.push(`drainMana('${refTargetOf(state)}')`);
      return '';
    }
    // 窃取生命 = 伤害 drain（batch-01 口径）；目标词可在前可在后
    m = /^(?:从)?(?:第一名敌人|一名敌人|最后两名敌人|最弱的两名敌人|一名随机敌人)窃取\s*([[\]（）()魔法x×/ +\d.]+?)\s*点生命值$/.exec(c)
      || /^窃取(?:第一名敌人|一名敌人|最后两名敌人|最弱的两名敌人|一名随机敌人)?\s*([[\]（）()魔法x×/ +\d.]+?)\s*点生命值$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1]);
      if (!f || f.rangeSpec) return `窃取数值无法解析「${m[1]}」`;
      const mode = /第一名/.test(c) ? 'enemyFront' : /最后两名/.test(c) ? 'enemyLastN' : /最弱的两名/.test(c) ? 'enemyWeakestN' : /随机/.test(c) ? 'enemyRandom' : 'enemyChosen';
      const n = /最后两名|最弱的两名/.test(c) ? `, { n: 2, drain: true }` : `, { drain: true }`;
      this.use('dmg');
      state.segments.push(`dmg('${mode}', ${f.base}, ${f.mult}${n})`);
      state.lastTargetMode = mode;
      return '';
    }
    // 窃取属性（无「转为X」子句 → 同属性自得，§3 窃取口径；有 → steal 换属性）
    m = /^(?:并)?窃取(?:一名敌人|一名随机敌人|敌人身上的?|从敌人身上)?\s*(\d+)\s*点(护甲值|护甲|攻击力|魔法值)$/.exec(c)
      || /^从敌人身上窃取\s*(\d+)\s*点(护甲值|护甲|攻击力|魔法值)$/.exec(c);
    if (m) {
      this.use('steal');
      const st = statOf(m[2]);
      const mode = /随机/.test(c) ? 'enemyRandom' : /敌人/.test(c) ? 'enemyChosen' : refTargetOf(state);
      state.segments.push(`steal('${mode}', '${st}', '${st}', ${m[1]}, 0)`);
      return '';
    }
    // 窃取属性转属性（公式变体：「窃取一名敌人 [魔法 + 1] 点魔法值，并将之转换成攻击力」8378）
    m = /^(?:并)?窃取(?:一名敌人|一名随机敌人|敌人身上的?|从敌人身上)?\s*([[\]（）()魔法x×/ +\d.]+?)\s*点(护甲值|护甲|攻击力|魔法值)(?:，?并将之转为|，?并将之转换成|，?并将之转换为)(护甲值|攻击力|魔法值|法力值)$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1].trim());
      if (!f || f.rangeSpec) return `窃取数值无法解析「${m[1]}」`;
      this.use('steal');
      const mode = /随机/.test(c) ? 'enemyRandom' : 'enemyChosen';
      state.segments.push(`steal('${mode}', '${statOf(m[2])}', '${statOf(m[3])}', ${f.base}, ${f.mult})`);
      return '';
    }
    // 「降低一名敌人1点攻击力和4点魔法值」→ reduce 双段（9985 族）
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
      // buffPieces 产出 buff 族段；reduce 复用同一解析（攻击力/魔法值/护甲值段）
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
    // 「窃取其/该敌人法力值」= 耗尽+自得（steal mana drainAll）
    m = /^窃取其?(法力值|护甲值|攻击力)$/.exec(c);
    if (m) {
      this.use('steal');
      const st = statOf(m[1]);
      state.segments.push(`steal('${refTargetOf(state)}', '${st}', '${st}', 0, 0, { drainAll: true })`);
      return '';
    }
    // 「随机窃取 N 点能力值」/「每名敌人身上窃取随机技能值」= 随机属性削减，无对应原语（batch-01 7319 先例）
    if (/窃取\s*\d+\s*点(随机|能力值)|每名敌人.*窃取.*随机技能值/.test(c)) {
      return '随机属性削减无对应原语（batch-01 7319 同款）';
    }
    // 窃取属性转属性
    m = /^窃取一名敌人\s*(\d+)\s*点(护甲值|攻击力|魔法值)(?:并将之转为|并将之转换成|，并将之转换为)(护甲值|攻击力|魔法值|法力值)$/.exec(c);
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
    m = /^(?:再)?获得(?:一个|\s*1\s*个)额外(?:的)?回合$/.exec(c) || /^获得额外的?回合$/.exec(c);
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
    return null;
  }

  // —— 风暴 / 召唤 ——
  hStormSummon(c, state) {
    let m = /^(?:创造|发起|召唤)(?:一个|一场|一名)?(尘|冰|叶|火|光|暗|地狱)?风暴$/.exec(c);
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
    const GROUP_WORD_RE = /军队|部队|军团|盟友|恶魔|不死族|元素|神祇|纳迦|半人马|巨人|矮人|人类|兽人|骑士|龙族|野兽|哥布林|妖仙|精灵|怪兽|怪物/;
    m = GROUP_WORD_RE.test(c)
      ? (/^召唤\s*(\d+)\s*到\s*(\d+)\s*[名个](?:随机的?|一名随机)?(.+?)$/.exec(c) || /^召唤(?:一名|一个|一支)(?:随机的?|一名随机)?(.+?)$/.exec(c))
      : null;
    if (m) {
      const countRange = m[2] !== undefined && /^\d+$/.test(m[2]) ? { min: Number(m[1]), max: Number(m[2]) } : undefined;
      const grp = (countRange ? m[3] : m[1]).replace(/(?:军队|部队|军团|盟友)$/, '').replace(/的$/, '').trim();
      const refs = this.resolveGroupRefs(grp);
      if (typeof refs === 'string') return refs;
      this.use('summonRandom', 'summonRef');
      const opts = countRange ? `, undefined, { countRange: { min: ${countRange.min}, max: ${countRange.max} } }` : ', undefined';
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
    // 「将敌人打回末位/最后」（9383 条件 payload）
    m = /^将(?:该|其|这名|一名)?敌人打回(?:队伍)?(末位|最后|末端)$/.exec(c);
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
    if (/^打乱敌方队伍$/.test(c)) {
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

  /** 群体名 → 召唤引用清单；失败返回错误字符串 */
  resolveGroupRefs(grp) {
    if (grp === '全视之眼') return OCULAREN_REFS;
    if (RACE_ALIAS[grp]) {
      const race = RACE_ALIAS[grp];
      const refs = this.raceRefs.get(race);
      if (!refs || refs.length === 0) return `种族 ${race} 在 troops.json 无成员`;
      return refs;
    }
    // 王国随机 = 无对应原语（batch-16 8831 / batch-26 头注先例）
    if (KINGDOM_NAMES.some((k) => grp.includes(k))) {
      return `按王国（${grp}）随机召唤无对应原语（batch-16 8831 同款）→ 原语请求：kingdom 召唤/目标限定`;
    }
    return `群体名称无法可靠映射到种族/王国「${grp}」（语义拿不准）`;
  }

  /** 条件里的兵种名 → troops.json name（永生神系等）；失败 null。
   *  机翻称号归一：「不朽者X」→「不朽的X」（troops.json 既有拼写）。 */
  resolveTroopName(text) {
    const t = text.replace(/^永生神/, '永生神').replace(/^不朽者/, '不朽的').trim();
    const names = loadTroops().map((x) => x.name);
    if (names.includes(t)) return t;
    // 「不朽的拉奇亚」等音译差异不硬凑
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
/** 转换端点 tier 哨兵：builders.TransformOpts 无 tier 通道（只有 count），tier 转换是原语缺口 */
export const TRANSFORM_TIER_UNSUPPORTED = Symbol('transform-tier-unsupported');
function transformGemCall(compiler, fromColor, what, count, _clause) {
  compiler.use('transformToSpecial', 'transform');
  const gem = matchSpecialGem(what);
  if (!gem) {
    if (/x3|×3|三倍/.test(what)) {
      // 「将选定的法力宝石转换为 x3 通配符」——通配倍率=WildCard3(tier3)，
      // 转换端点无 tier 通道（batch-r9 先例用 createSpecialGems spec 表达，此处是转换）→ 原语缺口
      return TRANSFORM_TIER_UNSUPPORTED;
    }
    return null;
  }
  // 石像鬼 tier1(善)=引擎缺省（TurnEngine.applyGargoyleGem: evil = tier===2），省略 tier 等价；
  // tier2(恶) 及其他带档宝石（wildcard 倍率族）无法表达 → 原语缺口
  if (gem.tier !== undefined && !(gem.kind === 'gargoyleGem' && gem.tier === 1)) {
    return TRANSFORM_TIER_UNSUPPORTED;
  }
  const from = fromColor ? `BaseColor.${fromColor}` : "'ANY'";
  const opts = [];
  if (count !== undefined) opts.push(`count: ${count}`);
  const optStr = opts.length ? `, { ${opts.join(', ')} }` : '';
  return `transformToSpecial(${from}, '${gem.kind}'${optStr})`;
}
function allyTargetOf(grp, others) {
  const g = grp.trim();
  if (g === '所有' || g === '全体' || g === '') return others ? 'allyOthers' : 'allyAll';
  if (/两名随机|2 名随机/.test(g)) return 'allyRandomN';
  if (/随机/.test(g)) return 'allyRandom';
  if (/选定/.test(g)) return 'allyChosen';
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
  // 代词（「赋予其屏障」「祝福他们」）→ 跨段追踪目标
  if (/^(其|他|她|他们|他俩|之)$/.test(p)) return { mode: 'lastTarget' };
  // 指代颜色/军队法力颜色 → 组装器无法解析（引擎无运行时「该敌色」条件通道给状态段）
  if (/该颜色|此颜色|该军队|其法力颜色/.test(p)) return null;
  const q0 = p.replace(/^(使|让|给)/, '');
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
  for (const [zh, race] of Object.entries(RACE_ALIAS)) {
    const raceM = q0.match(new RegExp(`^(所有|全体|全部|一名|一个|随机一名|一名随机|前\\s*\\d+\\s*[名个位]|两名|2 名|两名随机|2 名随机|\\d+\\s*[名个位])?(?:的)?${zh}(?:族)?(盟友|敌人|军队|部队|生物)$`));
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
  const g = (grp ?? '').replace(/^所有/, '').replace(/^其他/, '').trim();
  if (g === '') return { seg: "inflictRandom('allyAll')" };
  if (RACE_ALIAS[g]) return { seg: `inflictRandom('allyAll', { targetRace: '${RACE_ALIAS[g]}' })` };
  if (KINGDOM_NAMES.some((k) => g.includes(k))) {
    return { err: `按王国（${g}）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定` };
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
  return { 生命值: 'heal', 护甲值: 'armor', 护甲: 'armor', 攻击力: 'attack', 魔法值: 'magic', 法力值: 'mana' }[st] ?? 'armor';
}
function statOf(zh) {
  return { 护甲值: 'armor', 护甲: 'armor', 攻击力: 'attack', 魔法值: 'magic', 法力值: 'mana', 生命值: 'hp' }[zh];
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
  // 「每有一名X色敌人」= 敌方色计数 → enemiesOfColor 缺失（诚实略去，8806/8872 族）
  const color = matchColor(grp);
  if (isEnemy) {
    if (color) return `敌方法力色计数无对应来源 kind → 原语请求：enemiesOfColor 计数`;
    for (const [zh, race] of Object.entries(RACE_ALIAS)) {
      if (grp.includes(zh)) return `敌方种族计数无对应来源 kind → 原语请求：enemiesOfRace 计数`;
    }
    return null;
  }
  if (color) {
    return { sources: [{ kind: 'alliesOfColor', color }, { kind: 'teamSize', side: 'ally' }] };
  }
  for (const [zh, race] of Object.entries(RACE_ALIAS)) {
    if (grp.includes(zh)) return { sources: [{ kind: 'alliesOfRace', race }] };
  }
  if (KINGDOM_NAMES.some((k) => (grp ?? '').includes(k))) {
    return `按王国（${grp}）计数无对应来源 kind（batch-08 8365 / batch-15 8723 同款）→ 原语请求：kingdom 计数`;
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
function lastNumericSegment(segs) {
  for (let i = segs.length - 1; i >= 0; i--) {
    if (/\b(dmg|dmgAll|dmgSplash|trueDmg|heal|armor|attack|magic|mana|reduce|randomStat|gainGold|gainSouls|gainGems|gainMaps|createGems|createSkulls|createSpecialGems|steal|drainMana|inflictRandom)\(/.test(segs[i])) return i;
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
  const dt = /^(点)?\s*(真实的?(?:散射|溅射)?|(?:严重|轻微|轻量|重度)?的?(?:溅射|散射))?\s*伤害?(值)?/.exec(t);
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
  // [公式] – [公式]（7213 先例）
  m = /^\[\s*(魔法[^\]]*)\s*\]\s*[–—-]\s*\[\s*(魔法[^\]]*)\s*\]\s*(点)?/.exec(text);
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
  if (/targetHasDoom|末日|厄运|劫数|毁灭之力/.test(text)) features.add('doom-condition');
  if (/columnGems/.test(text)) features.add('column-gem-count');
  if (/destroyedSpecialGems/.test(text)) features.add('destroyed-special-count');
  if (/en-only-text/.test(text)) features.add('en-only-text');
  if (/条件子句内含不支持 opts/.test(text)) features.add('conditional-clear');
  if (/被减除的/.test(text)) features.add('exotic-modifier-source');
  if (/尾部增幅标签/.test(text)) features.add('modifier-tag');
  if (/修饰来源无法解析/.test(text)) features.add('modifier-source');
  if (features.size === before) features.add('unparsed-clause');
}

function parseModifierSource(body) {
  const b = body.replace(/数量|数/g, '');
  const colorKeys = Object.keys(COLORS).sort((x, y) => y.length - x.length);
  const colorsIn = (s) => colorKeys.filter((k) => s.includes(k)).map((k) => COLORS[k]);
  for (const [zh, id] of STATUSES) {
    if (b.includes(zh)) {
      if (/盟友/.test(b)) return { source: { kind: 'allyStatusCount', statusId: id } };
      return { source: { kind: 'enemyStatusCount', statusId: id } };
    }
  }
  // 特殊宝石计数（boardSpecial）；元素星/暗影之星无「宝石」后缀，放宽星族匹配
  for (const [zh] of SPECIAL_GEMS) {
    const core = zh.replace('宝石', '');
    if (b.includes(core) && (/宝石/.test(b) || /星/.test(core))) {
      if (core.includes('末日') || core.includes('厄运')) return { source: { kind: 'boardSkulls' } };
      const kind = matchSpecialGem(core);
      if (kind) return { source: { kind: 'boardSpecial', gem: kind.kind } };
    }
  }
  if (/骷髅头/.test(b)) return { source: { kind: 'boardSkulls' } };
  if (/所耗尽的法力/.test(body)) return { source: { kind: 'drainedMana' } };
  // 「被摧毁的骷髅头和棕色宝石数」= 骷髅 + 色宝石双来源（7769）
  const skullAndColor = b.match(/被摧毁的骷髅头和(红|蓝|绿|黄|紫|棕)色?宝石/);
  if (skullAndColor) return { sources: [{ kind: 'destroyedGems' }, { kind: 'destroyedGems', color: COLORS[skullAndColor[1]] }] };
  if (/被移除的宝石|移除的宝石|被摧毁的宝石|摧毁的宝石/.test(b)) return { source: { kind: 'destroyedGems' } };
  if (/转换的宝石|转化的宝石/.test(b)) return { source: { kind: 'transformedGems' } };
  if (/被减除的/.test(b)) return null; // exotic（§1 明确 blocked）
  if (/所有敌人的(护甲值|攻击力|魔法值|生命值)/.test(b)) {
    const stat = b.match(/所有敌人的(护甲值|攻击力|魔法值|生命值)/)[1];
    return { source: { kind: 'enemyStatSum', stat: statOf(stat) } };
  }
  if (/敌我双方的(护甲值|攻击力|魔法值|生命值)/.test(b)) {
    const stat = b.match(/敌我双方的(护甲值|攻击力|魔法值|生命值)/)[1];
    const st = statOf(stat);
    return { sources: [{ kind: 'allyStatSum', stat: st }, { kind: 'enemyStatSum', stat: st }] };
  }
  if (/自身的(护甲值|攻击力|生命值|魔法值)/.test(b)) {
    const stat = b.match(/自身的(护甲值|攻击力|生命值|魔法值)/)[1];
    const map = { 护甲值: 'armor', 攻击力: 'attack', 生命值: 'hp', 魔法值: 'magic' };
    return { source: { kind: 'selfStat', stat: map[stat] } };
  }
  if (/自身损失的生命值/.test(b)) return { source: { kind: 'selfStat', stat: 'missingHp' } };
  if (/敌人现有生命值/.test(b)) return { source: { kind: 'targetStat', stat: 'hp' } };
  const tgtStat = b.match(/敌人(的)?(攻击力|护甲值|魔法值)/);
  if (tgtStat) return { source: { kind: 'targetStat', stat: { 攻击力: 'attack', 护甲值: 'armor', 魔法值: 'magic' }[tgtStat[2]] } };
  if (/所收集的灵魂数|收集的灵魂数/.test(body)) return { source: { kind: 'battleSouls' } };
  if (/(红|蓝|绿|黄|紫|棕)色盟友和敌人数/.test(b)) {
    const c = colorsIn(b)[0];
    return { sources: [{ kind: 'alliesOfColor', color: c }, { kind: 'teamSize', side: 'enemy' }] };
  }
  if (/(红|蓝|绿|黄|紫|棕)色?盟友数/.test(b)) return { source: { kind: 'alliesOfColor', color: colorsIn(b)[0] } };
  for (const [zh, race] of Object.entries(RACE_ALIAS)) {
    if (b.includes(zh) && /盟友/.test(b)) return { source: { kind: 'alliesOfRace', race } };
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
    const fidelity = out.manaOnly ? 'mana-only' : (out.fidelity ?? 'full');
    return {
      ...w,
      fidelity,
      compiled: fidelity !== 'mana-only',
      build: out.build ?? null,
      imports: out.imports ?? null,
      features: out.features ?? [],
      skippedClauses: out.skippedClauses ?? [],
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
  if (/护甲值|攻击力|生命值|魔法值|法力值/.test(desc)) return '增益/削弱';
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
  const results = all.filter((r) => r.fidelity !== 'mana-only');
  const batches = [];
  for (let i = 0; i < results.length; i += BATCH_CHUNK) batches.push(results.slice(i, i + BATCH_CHUNK));
  const names = batches.map((_, i) => `W${String(i + 1).padStart(2, '0')}`);
  batches.forEach((chunk, bi) => {
    const name = names[bi];
    const spells = chunk.filter((r) => r.compiled);
    const imports = new Set(['skill']);
    let useBaseColor = false;
    let useChosen = false;
    for (const s of spells) {
      for (const f of s.imports ?? []) imports.add(f);
      if (/\bBaseColor\./.test(s.build)) useBaseColor = true;
      if (/CHOSEN/.test(s.build)) useChosen = true;
    }
    // 按批次 build 实际引用剪裁（避免 eslint no-unused-vars）
    const allBuilds = spells.map((s) => s.build).join('\n');
    const importNames = [...imports]
      .filter((f) => f !== 'CHOSEN' && f !== 'CASTER')
      .filter((f) => new RegExp(`\\b${f}\\s*\\(`).test(allBuilds))
      .sort();
    useChosen = useChosen && /\bCHOSEN\b/.test(allBuilds);
    // CASTER 占位符（「该军队法力颜色」）为常量非函数，单独按词检测
    const useCaster = /\bCASTER\b/.test(allBuilds);
    const placeholderImports = [useChosen ? 'CHOSEN' : '', useCaster ? 'CASTER' : ''].filter(Boolean);
    const allImports = [...importNames, ...placeholderImports];
    const importLines = `import { ${allImports.join(', ')} } from '../builders';${useBaseColor ? "\nimport { BaseColor } from '../../types';" : ''}`;
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
    ['tempering-scaling', 'tempering 段位缩放来源', 'modifier 来源 { kind: tempering, n }（或组装期常量注入）'],
    ['doom-condition', 'targetHasDoom 条件（Doomed 机制）', 'Condition { kind: targetHasDoom }——「如果敌人拥有劫数/末日/厄运/毁灭之力」'],
    ['kingdom-condition', 'kingdomPresent 条件', 'Condition { kind: kingdomPresent, kingdom }'],
    ['enemy-color-count', 'enemiesOfColor / enemiesOfRace 计数来源', 'ModifierSource { kind: enemiesOfColor | enemiesOfRace }（alliesOfColor 已有，敌方侧仍缺）'],
    ['kingdom-target', 'kingdom 目标限定', 'TargetMode allyKingdom { kingdom }'],
    ['kingdom-count', 'alliesOfKingdom 计数来源', 'ModifierSource { kind: alliesOfKingdom, kingdom }'],
    ['kingdom-summon', 'kingdom 随机召唤', 'summonRandom 按 troops.json kingdom 字段取引用清单'],
    ['modifier-tag', '尾部增幅标签归属', '非缺失原语：归属子句被略去时标签暂不挂载；卡点消解后自动回收'],
    ['modifier-source', '修饰来源无法解析（§1 exotic 大族）', '逐条见 meta skippedClauses'],
    ['unknown-group', '群体名无法映射种族/王国', '毒菇林/罗格/滴答洞穴等机翻族名；待术语表'],
    ['unresolved-ref', '机翻引用无法回译', '小鬼/科博等泛称与电风暴等；待术语表'],
    ['stat-double', 'stat 翻倍 buff', 'buff opts.double（现仅 reduce.halve）'],
    ['dmg-base-targetStat', 'dmg 基数取目标属性', 'dmg 支持 base 来源 targetStat'],
    ['targetStatBeatsCaster', '反向属性比较', 'Condition casterStatBeatsTarget 加 reversed'],
    ['clear-line-of-gem', '清除宝石所在行/列', 'clear target { kind: lineOfGem, mode }'],
    ['createMix-special', 'createMix 特殊端点', 'createMix 端点扩特殊宝石/骷髅'],
    ['random-stat-reduce', '随机属性削减', 'reduce 支持 stat=random'],
    ['conditional-clear', '条件化清除段', 'clear 段支持 ifCond'],
    ['exotic-modifier-source', 'exotic 来源（被减除护甲值/黄金等）', '按 §1 维持不做；如要做需新来源 kind'],
    ['numeric-range', '数值型区间', '段级 rangeSpec 扩 buff/create'],
    ['devour', '吞噬（吞并敌人）', 'devour 效果段'],
    ['mana-burn', '法力灼烧伤害', 'damage 来源 manaBurn'],
    ['random-storm', '随机风暴', 'createStorm 支持随机色'],
    ['storm-end', '终止风暴', 'createStorm 对立操作'],
    ['dispel-all', '驱散全部正面增益', '泛指驱散（§6 维持不做）'],
    ['column-gem-count', '列内宝石计数来源', 'ModifierSource { kind: columnGems, col: chosen }（「所选的列每有一颗X色宝石」8805）'],
    ['destroyed-special-count', '按特殊宝石筛选被摧毁数', 'ModifierSource { kind: destroyedSpecialGems, gem }（8806）'],
    ['anyEnemyDied', 'anyEnemyDied 条件', 'Condition { kind: anyEnemyDied }'],
    ['en-only-text', 'EN-only 快照条目', '非引擎缺口：2 把新武器 zh 法术文本缺失，数据补全后回收'],
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
  lines.push('## 第三轮升级对比（2026-09-18 · 前轮 245/406/67 → 本轮）');
  lines.push('');
  lines.push('| 保真度 | 前轮 | 本轮 | 增量 |');
  lines.push('|---|---|---|---|');
  lines.push(`| full | 245 | ${full.length} | ${full.length - 245 >= 0 ? '+' : ''}${full.length - 245} |`);
  lines.push(`| partial | 406 | ${partial.length} | ${partial.length - 406 >= 0 ? '+' : ''}${partial.length - 406} |`);
  lines.push(`| mana-only | 67 | ${manaOnly.length} | ${manaOnly.length - 67} |`);
  lines.push(`| 战斗可用 | 651 | ${bound.length} | ${bound.length - 651 >= 0 ? '+' : ''}${bound.length - 651} |`);
  lines.push('');
  lines.push('**本轮新消化的引擎词汇**（引擎提交 2813774 特殊宝石 Wave B、47a30a8 正面状态族之后）：');
  lines.push('');
  lines.push('- 正面状态族：赐福/祝福→`blessed`、法印/附魔→`enchanted`（gowhead EN 侧核实 Enchant 译名）、反射→`reflect`、狼化→`lycanthropy`——前轮 status:祝福/赐福/法印/反射 卡点全部消解；');
  lines.push('- Wave B 宝石 17 kind 全部开放组装（元素星/临界星(=umbralStar，8623 EN 侧核实)/龙/巨人/灵力/法力药水/糖果（六色族经 spec.color）/天使/恶魔传送门(含机翻「噩梦传送门」)/善恶心像鬼(tier)/狼化/腐朽/陷阱/火山等），前轮 special-gem:* 卡点全部消解；');
  lines.push('- `alliesOfColor` 计数来源（提交 47a30a8）已在 parseModifierSource 启用；色限定目标（「对所有紫色敌人」「赐福所有蓝色盟友」）经段级 `ifCond targetColor` 过滤精确表达，无需新 TargetMode——前轮 allyOfColor-target 请求撤销；');
  lines.push('- `ColorSpec` 的 `LAST_TARGET`/`CASTER`/`CHOSEN` 通道：7928/7986/8084「爆破其法力颜色的宝石」、8554「将其法力颜色的宝石转换成狼化宝石」、8966「选定法力宝石→x3 通配符」一族解锁；');
  lines.push('- `execute` + `chance`/`chanceBoost`：处决几率族（7380/8664——「每有一颗末日骷髅头几率增强 6%」挂 boardSkulls 来源）；');
  lines.push('- 淬炼增项维持「参数化省略」，但纯淬炼略去不再阻塞尾部 [xN] 标签挂载（前轮 134 条孤儿标签大幅清账）；');
  lines.push('- 解析长尾回收：双目标伤害句（9825-9830）、首末双点（8698-8703）、首 N 名/末位/对其/严重轻微溅射机翻变体、条件尾句（「，则…」不再劈成两半）、降低/技能点数/种族限定盟友增益（targetRace）、全负面/全正面状态池展开、净化和赋予复合句、创造动词族（制作/制造/创建）、骷髅省「头」、转化句大重构（定量/选定色/LAST_TARGET/善恶石像鬼 tier）等 90+ 句式家族；');
  lines.push('');
  lines.push('**mana-only 余量 15 条构成**：机翻语义丢失 6（8400/8512/8521/8529/8577/8578）、占位符 {1} 1（7071）、缺原语 5（7188/7199 翻倍、7190 基数取目标属性、7217 行绑定清除、8965 逐摧毁触发祝福）、EN-only 快照 3（10045/10063/10065）。');
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
  lines.push('- 中英快照不同步的个别条目（如 7074 两版法术不同）以 zh 为准编译。');
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

