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
/** 状态词表（spell-rules §6，规范拼写；长词在前防误配） */
const STATUSES = [
  ['死亡标记', 'death-mark'], ['猎人标记', 'marked'], ['中毒', 'poison'], ['燃烧', 'burning'],
  ['流血', 'bleed'], ['出血', 'bleed'], ['沉默', 'silence'], ['冻结', 'frozen'], ['冰冻', 'frozen'],
  ['打昏', 'stun'], ['击晕', 'stun'], ['眩晕', 'stun'], ['纠缠', 'entangle'], ['缠绕', 'entangle'],
  ['屏障', 'barrier'], ['下潜', 'submerged'], ['沉没', 'submerged'], ['疾病', 'disease'],
  ['诅咒', 'curse'], ['狂怒', 'rage'], ['魅惑', 'charm'], ['恐怖', 'terror'], ['妖火', 'faerie-fire'],
  ['织网', 'web'], ['蛛网', 'web'],
];
/** 可组装特殊宝石 → SpecialGemKind（窗口 C 落地集合 + R 系扩展；长词在前） */
const SPECIAL_GEMS = [
  ['极度末日骷髅头', 'uberDoomSkull'], ['超级末日骷髅头', 'uberDoomSkull'],
  ['末日骷髅头', 'doomSkull'], ['厄运骷髅头', 'doomSkull'],
  ['燃烧宝石', 'burningGem'], ['冻结宝石', 'freezeGem'], ['诅咒宝石', 'curseGem'],
  ['流血宝石', 'bleedGem'], ['毒药宝石', 'poisonGem'], ['毒宝石', 'poisonGem'],
  ['死亡标记宝石', 'deathMarkGem'], ['恐怖宝石', 'terrorGem'], ['缠绕宝石', 'entangleGem'],
  ['激怒宝石', 'enrageGem'], ['沉没宝石', 'submergeGem'], ['妖仙宝石', 'faerieFireGem'],
  ['精灵火宝石', 'faerieFireGem'], ['打昏宝石', 'stunGem'], ['击晕宝石', 'stunGem'],
  ['屏障宝石', 'barrierGem'], ['织网宝石', 'web'], ['蛛网宝石', 'web'], ['许愿宝石', 'wish'],
  ['幽魂宝石', 'ghost'], ['鬼魂宝石', 'ghost'], ['沙漏宝石', 'hourglass'],
  ['赃物宝石', 'bootyGem'], ['战利品宝石', 'bootyGem'], ['炸弹宝石', 'bomb'],
];
/** 不可组装宝石族（DECISIONS 翻案记录②：等 GEMS-SEMANTICS-2 后续波） */
const BLOCKED_GEM_RE = /元素星|临界星|龙族宝石|蓝龙宝石|石像鬼宝石|善石像鬼|灵力宝石|腐烂宝石|法力药水|传送门|天使宝石|暗影之星|巨人宝石|贪婪宝石/;
/** 种族别名（高置信；「怪兽=Monster」batch-10 先例、「仙灵/妖仙=Fey」batch-17 先例） */
const RACE_ALIAS = {
  恶魔: 'Daemon', 不死族: 'Undead', 元素: 'Elemental', 元素生物: 'Elemental', 神祇: 'Divine',
  纳迦: 'Naga', 半人马: 'Centaur', 巨人: 'Giant', 矮人: 'Dwarf', 人类: 'Human', 兽人: 'Orc',
  骑士: 'Knight', 机械: 'Mech', 秘士: 'Mystic', 龙: 'Dragon', 龙族: 'Dragon', 野兽: 'Beast', 哥布林: 'Goblin', 妖仙: 'Fey', 精灵: 'Elf',
  怪兽: 'Monster', 怪物: 'Monster',
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

  /** 编译一条；成功 → { build }，失败 → { skip: reason } */
  compile(sp) {
    this.imports = new Set();
    const pre = this.prejudge(sp.desc);
    if (pre) return { skip: pre };
    let desc = sp.desc;
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
    const clauses = desc.split(/。|；|&&|\n/).map((c) => c.trim()).filter(Boolean);
    if (clauses.length === 0) return { skip: '空描述' };
    const state = { segments: [], tag, tagUsed: false };
    for (const clause of clauses) {
      const err = this.clause(clause, state);
      if (err) return { skip: `未识别子句「${clause}」（${err}）` };
    }
    if (state.segments.length === 0) return { skip: '未产出任何效果段' };
    if (state.tag && !state.tagUsed) {
      // §1 修饰段归属：未点名 → 挂最近数值段
      const idx = lastNumericSegment(state.segments);
      if (idx < 0) return { skip: `尾部增幅标签 ${tagText(state.tag)} 找不到挂载段` };
      state.segments = withModifierAt(state.segments, idx, { mod: state.tag });
    }
    this.use('skill');
    return {
      build: `skill(\n${state.segments.map((s) => `      ${s}`).join(',\n')},\n    )`,
      imports: this.imports,
    };
  }

  /** 命中预判 → 返回 skip 原因（诚实原则：整条不硬凑） */
  prejudge(desc) {
    if (TEMPERING_RE.test(desc)) {
      return '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源';
    }
    if (BLOCKED_GEM_RE.test(desc)) {
      const m = desc.match(BLOCKED_GEM_RE);
      return `特殊宝石家族未实现（${m[0]}，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）`;
    }
    if (/\{\d+\}/.test(desc)) return '译文异常（模板占位符 {N} 未填充）';
    const miss = desc.match(/法印|赐福|祝福|反射|狼化|石化|附魔/);
    if (miss) return `缺失状态（${miss[0]}，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）`;
    return null;
  }

  /**
   * 单个子句 → 段串。
   * 处理器契约：null = 本子句不属于该处理器（继续下一条）；'' = 已处理；其他字符串 = 错误原因。
   */
  clause(raw, state) {
    const c = raw.replace(/\s+/g, ' ').trim();
    for (const handler of [
      this.hPureCondMult, this.hKingdomCond, this.hIfPayload, this.hDamage, this.hStandaloneModifier, this.hStatus,
      this.hGemOps, this.hBuffHeal, this.hReduceDrain, this.hCleanseExtraTurn,
      this.hStormSummon, this.hRepositionMisc, this.hEconomy,
    ]) {
      const r = handler.call(this, c, state);
      if (r === null) continue;
      if (r === '') return null;
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
      if (dbg) console.log('   [e1]', JSON.stringify(m[1]), '->', e1 ?? 'OK');
      if (e1) return e1;
      const e2 = this.clause(m[2].trim(), state);
      if (dbg) console.log('   [e2]', JSON.stringify(m[2]), '->', e2 ?? 'OK');
      if (e2) return e2;
      return null;
    }
    return '无法拆分';
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
    // 「如果敌人已陷入X状态，则<payload>」→ ifCond anyEnemyStatus（全局聚合，§9.7）
    m = /^(?:如果|若)敌人已?(?:陷入|身中|被)(.+?)(?:状态)?[，,]?则(.+)$/.exec(c);
    if (m) {
      const id = matchStatus(m[1]);
      if (!id) return `状态词无法识别「${m[1]}」`;
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
    // 「如果有 N 名敌人身亡」= 任意敌人阵亡，与 §4 ifTargetDied（追踪主目标）口径不一致 → 语义拿不准
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
    m = /^(?:如果|若)(?:自身)?队伍(?:里|中)?有(?:一名)?(.+?)[，,]?则(.+)$/.exec(c);
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

  /** 解析条件 payload（复用规则表到临时段数组） */
  parseSub(text, state) {
    const stash = [];
    const tmp = { ...state, segments: stash };
    const subs = text.split(/，|,|再|并/).map((s) => s.trim()).filter(Boolean);
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
      { re: /^对(?:第\s*[一1]\s*名|第一名|第\s*1\s*[名位个]|第一位的?|首位|首名)的?敌人/, t: () => ({ mode: 'enemyFront' }) },
      { re: /^对最虚弱的敌人/, t: () => ({ mode: 'enemyWeakest' }) },
      { re: /^对最强大的敌人|^对最强悍的敌人/, t: () => ({ mode: 'enemyHealthiest' }) },
      { re: /^对最健康的敌人/, t: () => ({ mode: 'enemyHealthiest' }) },
      { re: /^对最后(?:一名|一个|一位|的|\s*1\s*[名个]|两[名个])敌人|^对最末位的敌人/, t: () => ({ mode: 'enemyLast' }) },
      { re: /^对最后\s*(\d+)\s*[位名个]敌人/, t: (m) => ({ mode: 'enemyLastN', n: Number(m[1]) }) },
      { re: /^对(?:前|首)两[名位个]敌人/, t: () => ({ mode: 'enemyFirstN', n: 2 }) },
      { re: /^对最虚弱的两名敌人/, t: () => ({ mode: 'enemyWeakestN', n: 2 }) },
      { re: /^对最虚弱的\s*(\d+)\s*名敌人/, t: (m) => ({ mode: 'enemyWeakestN', n: Number(m[1]) }) },
      { re: /^对最健康的\s*(\d+)\s*名敌人/, t: (m) => ({ mode: 'enemyHealthiestN', n: Number(m[1]) }) },
      { re: /^对两?名最强大的敌人/, t: () => ({ mode: 'enemyHealthiestN', n: 2 }) },
      { re: /^对(?:前|首)两名敌人/, t: () => ({ mode: 'enemyFirstN', n: 2 }) },
      { re: /^对所有敌人/, t: () => ({ mode: 'enemyAll' }) },
      { re: /^对(?:另)?一名随机敌人|^对随机(?:的)?一名敌人|^对s*1s*[名个]s*随机的?敌人/, t: () => ({ mode: 'enemyRandom' }) },
      { re: /^对(?:另)?\s*(\d+)\s*[名个]\s*随机(?:的)?敌人/, t: (m) => ({ mode: 'enemyRandomN', n: Number(m[1]) }) },
      { re: /^对\s*(\d+)\s*[名个]\s*的?随机敌人/, t: (m) => ({ mode: 'enemyRandomN', n: Number(m[1]) }) },
      { re: /^对(?:一名|一个)?随机的?敌人/, t: () => ({ mode: 'enemyRandom' }) },
      { re: /^对敌人造成l\s/, t: () => ({ mode: 'enemyChosen', typo: true }) },
      { re: /^对其下方的所有敌人/, t: () => ({ mode: 'enemyChosenAndBelow' }) },
      { re: /^对(?:一名|一个|\s*1\s*[名个]|1名|1个|第?\s*1\s*名)?(?:随机的?|一个随机的?)?敌人|^对敌人|^对指定的敌人/, t: () => ({ mode: 'enemyChosen' }) },
    ];
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
    // 「对 1 名敌人和另 1 名随机敌人造成 X」→ 指定 + 随机 各一段（同数值）
    let m = /^对 1 名敌人和另\s*1\s*名随机敌人造成\s*([[\]()魔法x×/ +\d.]+?)\s*点伤害$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[1]);
      if (!f || f.rangeSpec) return `数值公式无法解析「${m[1]}」`;
      this.use('dmg');
      state.segments.push(`dmg('enemyChosen', ${f.base}, ${f.mult})`, `dmg('enemyRandom', ${f.base}, ${f.mult})`);
      return '';
    }
    // 「使最强和最弱的敌人陷入 X 状态」→ 双段（最高/最低生命各一）
    m = /^使最强和最弱的敌人陷入(.+?)(?:状态|效果)?$/.exec(c);
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
    const formula = parseFormulaPrefix(rest);
    if (!formula) return '数值公式无法解析';
    rest = formula.rest;
    const dt = /^(点)?\s*(真实的?|轻微溅射|严重溅射|溅射|散射)?\s*伤害?(值)?/.exec(rest);
    if (!dt) return '伤害类型无法解析';
    const dtype = dt[2] ?? '';
    rest = rest.slice(dt[0].length).trim();
    // 裸散射句式重裁（2026-09-18 官方 SpellSteps）：无目标词 + 散射 = enemyAll 全体散射
    if (head.bare && /散射/.test(dtype)) head = { ...head, mode: 'enemyAll' };
    // 同子句 rider：，并移除所有C色宝石以增强伤害效果 → 清除段先行（batch-05 7059 先例）
    let destroyColorBefore = null;
    const rider = /(?:，|,)?(?:并|且)?移除所有(红|蓝|绿|黄|紫|棕)色宝石以增强(?:伤害)?效果$/.exec(rest);
    if (rider) {
      destroyColorBefore = COLORS[rider[1]];
      rest = rest.slice(0, rider.index).trim();
    }
    // 同子句 rider：，同时每摧毁一颗C色宝石则增加 N 点伤害 → modifier（7178）
    const perDestroy = /(?:，|,)?(?:同时|并且)?每摧毁一颗(红|蓝|绿|黄|紫|棕)色?宝石则增加s*(d+)s*点伤害$/.exec(rest);
    let perDestroyMod = null;
    if (perDestroy) {
      perDestroyMod = { mod: { kind: 'multiplier', a: Number(perDestroy[2]) }, source: { kind: 'destroyedGems', color: COLORS[perDestroy[1]] } };
      rest = rest.slice(0, perDestroy.index).trim();
    }
    // 同子句 rider：，并窃取其半数攻击力（7805：steal halve 跨段回指）
    const halveSteal = /(?:，|,)?并?窃取其?半数(攻击力|护甲值|魔法值|法力值)$/.exec(rest);
    let halveStealStat = null;
    if (halveSteal) {
      halveStealStat = statOf(halveSteal[1]);
      rest = rest.slice(0, halveSteal.index).trim();
    }
    // 同子句 rider：，伤害值因X而增强（tag 缺省按 [1:1]，7059 系先例）
    let modifier = null;
    const modm = /(?:，|,)?(?:伤害值|数值|点数|效果)?并?因(.+?)而增强$/.exec(rest);
    if (modm) {
      const src = parseModifierSource(modm[1]);
      if (!src) return `修饰来源无法解析「${modm[1]}」`;
      modifier = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
      if (state.tag) state.tagUsed = true;
      rest = rest.slice(0, modm.index).trim();
    }
    const tail = rest.replace(/^[，,、和及]/, '').trim();
    if (tail !== '') return `伤害句残留无法解析「${tail}」`;

    const segs = [];
    if (destroyColorBefore) {
      this.use('destroyColor');
      segs.push(`destroyColor(${colorRef(destroyColorBefore)})`);
    }
    const dmgAllFlag = head.mode === 'enemyAll';
    this.use('dmg', 'dmgAll', 'dmgSplash', 'trueDmg', 'scale', 'flat');
    const optParts = [];
    if (!dmgAllFlag && /溅射|散射/.test(dtype)) optParts.push(`range: 'splash'`);
    if (/真实/.test(dtype)) optParts.push(`trueDamage: true`);
    if (head.n !== undefined) optParts.push(`n: ${head.n}`);
    if (modifier) optParts.push(`modifier: ${jsonMod(modifier)}`);
    let call;
    if (formula.rangeSpec) {
      call = `dmg(${targetRef(head.mode)}, 0, 0, { rangeSpec: { min: ${formula.rangeSpec.min}, max: ${formula.rangeSpec.max} }${optParts.length ? ', ' + optParts.join(', ') : ''} })`;
    } else if (dmgAllFlag) {
      const base = formula.base;
      const mult = formula.mult;
      call = `dmg('enemyAll', ${base}, ${mult}, { range: 'all'${optParts.length ? ', ' + optParts.join(', ') : ''} })`;
    } else {
      let fn = 'dmg';
      if (/溅射|散射/.test(dtype)) fn = 'dmgSplash';
      else if (/真实/.test(dtype)) fn = 'trueDmg';
      const o = optParts.length ? `, { ${optParts.join(', ')} }` : '';
      call = `${fn}(${targetRef(head.mode)}, ${formula.base}, ${formula.mult}${o})`;
    }
    if (perDestroyMod) {
      if (state.tag) { perDestroyMod.mod = state.tag; state.tagUsed = true; }
      call = appendOpt(call, `modifier: ${jsonMod(perDestroyMod)}`);
      segs[segs.length - 1] = call;
    }
    segs.push(call);
    state.segments.push(...segs);
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
    // 「赋予 X盟友 Y状态」（「赋予第一名盟友狂怒状态」）
    let asg = /^(?:赋予|给予)(.+?)盟友(.+?)(?:状态|效果)?$/.exec(c);
    if (asg && !/随机/.test(c)) {
      const id = matchStatus(asg[2]);
      if (id) {
        const tgt = statusTarget(asg[1] + '盟友', state);
        if (tgt === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        state.segments.push(`inflict('${id}', '${tgt.mode}')`);
        return '';
      }
    }
    // 「给予所有X色盟友 N 点攻击力」= 按法力色限定盟友目标，无对应 TargetMode（batch-14 8465 同款）
    if (/^(?:给予|为|使|让)所有(红|蓝|绿|黄|紫|棕)色?盟友/.test(c)) {
      return '按法力色限定盟友目标无对应 TargetMode（batch-14 8465 同款）→ 原语请求：allyOfColor 目标';
    }
    // 「赋予/给予 X盟友 一个随机(正面增益)状态效果」大族（§11.3/§11 补充：盟友=正面池）
    m = /^(?:赋予|给予|使)(.*?)盟友(?:获得)?一个?随机(?:的)?(?:正面增益|正面增益状态)?(?:状态)?(?:状态效果|效果|状态)$/.exec(c);
    if (m) {
      const seg = allyRandomStatusSeg(m[1], this);
      if (seg.err) return seg.err;
      this.use('inflictRandom');
      state.segments.push(seg.seg);
      return '';
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
    // 「X（目标）陷入 Y 状态」/「陷入 Y 状态」（目标在句首：所有敌人/一名敌人/…）
    m = /^(.*?)陷入(.+?)$/.exec(c);
    if (m) {
      const statusText = m[2].replace(/(状态|效果)$/, '').trim();
      const id = matchStatus(statusText);
      if (id) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `状态目标无法解析「${c}」`;
        this.use('inflict');
        state.segments.push(`inflict('${id}', '${tgt.mode}'${tgt.n !== undefined ? `, { n: ${tgt.n} }` : ''})`);
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
    }
    // 状态动词开头：「缠绕第一名敌人」「点燃一名敌人（=燃烧）」
    const verbMap = [['缠绕', 'entangle'], ['冻结', 'frozen'], ['冰冻', 'frozen'], ['沉默', 'silence'], ['打昏', 'stun'], ['击晕', 'stun'], ['点燃', 'burning'], ['魅惑', 'charm'], ['诅咒', 'curse']];
    for (const [verb, id] of verbMap) {
      m = new RegExp(`^${verb}(.+?)$`).exec(c);
      if (m) {
        const tgt = statusTarget(m[1], state);
        if (tgt === null) return `状态动词目标无法解析「${c}」`;
        this.use('inflict');
        state.segments.push(`inflict('${id}', '${tgt.mode}'${tgt.n !== undefined ? `, { n: ${tgt.n} }` : ''})`);
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
    return null;
  }

  // —— 宝石操作（创造/转化/清除）——
  hGemOps(c, state) {
    // 混合宝石（骷髅/特殊端点 → 无 mix 原语；色+色 → createMix）
    let m = /^创造(?:\d+|[\]魔法（）/ +x×.0-9[]+)?颗?混合(.+?)的?宝石$/.exec(c);
    if (m) {
      const parts = m[1].split('和').map((s) => s.trim());
      const colorParts = parts.filter((p) => matchColor(p));
      if (parts.length === colorParts.length && parts.length >= 2) {
        const n = m[0].match(/(\d+)\s*颗/);
        const cnt = n ? Number(n[1]) : 0;
        this.use('createMix');
        state.segments.push(`createMix([${colorParts.map((p) => `BaseColor.${matchColor(p)}`).join(', ')}], ${cnt})`);
        return '';
      }
      return `混合宝石含骷髅头/特殊宝石端点，无 mix 原语（原语请求：createMix 扩特殊宝石端点）`;
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
      const createCall = createGemCall(this, what, n, { mod: state.tag ?? { kind: 'multiplier', a: n }, source });
      if (createCall.err) return createCall.err;
      if (state.tag) state.tagUsed = true;
      state.segments.push(createCall.seg);
      return '';
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
    // 「创造 N 颗X宝石，宝石数量因Y而增强」rider（create + modifier）
    m = /^(创造\s*(\d+)\s*颗?.+?宝石)，(?:宝石数?量|数量|宝石数)因(.+?)而增强$/.exec(c);
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
    // 创造 N 颗 X（色宝石/骷髅头/特殊宝石），含「随机的蓝色宝石」「6 红色宝石」变体
    m = /^(?:再|然后|随机)?创造(?:选定(?:颜色)?的)?\s*(\d+)\s*颗?(?:随机的?)?(.+?)?(?:色的)?(?:的)?宝石$/.exec(c);
    if (m) {
      const what = (m[2] ?? '').trim();
      const call = createGemCall(this, what, Number(m[1]), null, true);
      if (call.err) return call.err;
      state.segments.push(call.seg);
      return '';
    }
    // 创造 N 颗骷髅头 / 8-12 个骷髅（countRange §9.8）
    m = /^(?:再|然后)?创造?\s*(\d+)\s*[颗个]骷髅头$/.exec(c);
    if (m) {
      this.use('createSkulls');
      state.segments.push(`createSkulls(${m[1]})`);
      return '';
    }
    m = /^(?:制作|制造|创造)\s*(\d+)-(\d+)\s*[颗个]骷髅头$/.exec(c);
    if (m) {
      this.use('createSkulls');
      state.segments.push(`createSkulls(0, 0, { countRange: { min: ${m[1]}, max: ${m[2]} } })`);
      return '';
    }
    // 转化
    m = /^将\s*(\d+)\s*颗宝石转换成(红|蓝|绿|黄|紫|棕)色$/.exec(c);
    if (m) {
      // raw GemSegment：TransformGemParams.from 支持 'ANY'（transform 构造器形参为 ColorSpec）
      state.segments.push(`{ kind: 'gem', params: { op: 'transform', from: 'ANY', to: BaseColor.${COLORS[m[2]]}, count: { base: ${m[1]}, mult: 0 } } }`);
      return '';
    }
    m = /^将所有(红|蓝|绿|黄|紫|棕)色宝石转换成(红|蓝|绿|黄|紫|棕)色$/.exec(c);
    if (m) {
      this.use('transform');
      state.segments.push(`transform(BaseColor.${COLORS[m[1]]}, BaseColor.${COLORS[m[2]]})`);
      return '';
    }
    m = /^将所有(红|蓝|绿|黄|紫|棕)色宝石转换成一个选定颜色$/.exec(c);
    if (m) {
      this.use('transform');
      state.segments.push(`transform(BaseColor.${COLORS[m[1]]}, CHOSEN)`);
      return '';
    }
    // 将(所有C色|N 颗选定颜色|C色)宝石转换成X宝石 / 转换为 x3 通配符
    m = /^(?:再)?将(?:所有)?(?:(红|蓝|绿|黄|紫|棕)色|(\d+)\s*颗选定颜色(?:的)?)?的?宝石转换为?成?(.+?)$/.exec(c);
    if (m && /宝石/.test(c)) {
      const what = m[3].replace(/宝石|头$/g, '').trim();
      const fromColor = m[1] ? COLORS[m[1]] : null;
      const count = m[2] ? Number(m[2]) : undefined;
      const call = transformGemCall(this, fromColor, what, count, c);
      if (call) {
        state.segments.push(call);
        return '';
      }
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
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*(\d+)\s*[颗枚]选定颜色(?:的)?宝石$/.exec(c);
    if (m) {
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${m[2]}, 0, 'color', CHOSEN)`);
      return '';
    }
    // 爆破/摧毁 [公式] 颗（的）X色宝石
    m = /^(?:随机)?(爆破|摧毁|引爆|爆炸)\s*([[\]()魔法x×/ +\d.]+?)\s*[颗枚](?:的)?(红|蓝|绿|黄|紫|棕)色?宝石$/.exec(c);
    if (m) {
      const f = parseFormulaPrefix(m[2]);
      if (!f || f.rangeSpec) return `宝石数量公式无法解析「${m[2]}」`;
      this.use('explodeRandomGems', 'destroyRandomGems');
      const fn = m[1] === '摧毁' ? 'destroyRandomGems' : 'explodeRandomGems';
      state.segments.push(`${fn}(${f.base}, ${f.mult}, 'color', BaseColor.${COLORS[m[3]]})`);
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
    m = /^(摧毁|爆破)一列$/.exec(c) || /^摧毁 1 列$/.exec(c);
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
    m = /^(摧毁|移除)选定颜色(?:的所有|所有)?宝石$/.exec(c) || /^摧毁选定颜色的所有宝石$/.test(c) && 'm2' && null;
    if (/^(摧毁|移除)选定颜色的?所有?宝石$/.test(c) || /^移除所有一个选定颜色的宝石$/.test(c) || /^摧毁选定颜色的所有宝石$/.test(c)) {
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
    // 恢复自身所有生命值
    if (/^(恢复|回复)自身所有生命值$/.test(c)) {
      this.use('heal');
      state.segments.push("heal('allySelf', 0, 0, { full: true })");
      return '';
    }
    // 目标头：获得(自身) / 给予(为)X盟友 / 代词回指（给予其/他们）
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
      m = /^(?:给予|给|为|使|让)\s*(所有|全体|一名|一位|1 名|1 个|两名随机|2 名随机|两名|随机一名|一名随机|前 2 位|前 2 名|选定一名|一名选定|1 名选定)?\s*(?:其他|其他的)?\s*(?:随机一名|一名随机的?)?\s*盟友\s*(?:提供|获得|恢复)?\s*(.+)$/.exec(c);
      if (!m) return null;
      const grp = m[1] ?? '';
      target = allyTargetOf(grp, /其他/.test(c));
      rest = m[2];
    }
    // 属性词预检：rest 不含属性词 → 非增益句，放行给后续处理器（如「获得一个额外回合」）
    if (!/(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值)/.test(rest)) return null;
    // 数值区间（3 - 15 点法力）= 数值型区间 blocked（§9.8 注意）
    if (/\d+\s*-\s*\d+\s*点/.test(rest)) return '数值型区间（§9.8：数值不明）不做';
    // 按「和」拆分属性段：每段独立取值；无方括号的后续段沿用前段公式（R4「一个方括号管两段」同值口径）
    this.use('heal', 'armor', 'attack', 'magic', 'mana', 'randomStat', 'scale', 'flat');
    state.lastAllyTarget = target;
    // rider：「，数量因X而增强」→ modifier 挂本段（被减除/黄金等 exotic → 来源解析失败 → SKIP）
    let buffMod = null;
    const modRider = /，数量因(.+?)而增强$/.exec(rest);
    let restBase = rest;
    if (modRider) {
      const src = parseModifierSource(modRider[1]);
      if (!src) return `修饰来源无法解析「${modRider[1]}」（被减除的护甲值/黄金等为 §1 exotic 来源）`;
      buffMod = { mod: state.tag ?? { kind: 'ratio', a: 1, b: 1 }, ...src };
      if (state.tag) state.tagUsed = true;
      restBase = rest.slice(0, modRider.index);
    }
    const statRe = /(生命值|护甲值|护甲|攻击力|魔法值|法力值|随机技能值)/;
    const parts = [];
    let lastFormula = null;
    const pieces = restBase.includes('和') ? splitTopLevel(restBase, '和') : [restBase];
    for (const piece of pieces) {
      const p = piece.trim();
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
    for (const { stat: st, f } of parts) {
      let seg;
      if (f.rangeSpec) {
        seg = `${fnOfStat(st)}('${mode}', 0, 0, { rangeSpec: { min: ${f.rangeSpec.min}, max: ${f.rangeSpec.max} } })`;
      } else if (st === '随机技能值') {
        seg = `randomStat('${mode}', ${f.base}, ${f.mult})`;
      } else {
        seg = `${fnOfStat(st)}('${mode}', ${f.base}, ${f.mult})`;
      }
      if (buffMod) seg = appendOpt(seg, `modifier: ${jsonMod(buffMod)}`);
      state.segments.push(seg);
    }
    return '';
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

  // —— 净化 / 额外回合 ——
  hCleanseExtraTurn(c, state) {
    let m = /^净化(自身|所有盟友|一名盟友|一名随机盟友|他)$/.exec(c) || /^净化所有盟友并给予其\s*(.+)$/.exec(c);
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
      const opts = countRange ? `, undefined, { countRange: { min: ${countRange.min}, max: ${countRange.max} } }` : '';
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
        state.segments.push(`summonRandom(['${refA}', '${refB}'])`);
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
      state.segments.push(`summonRef('${ref}')`);
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
    let m = /^获得\s*([[\]魔法+ x×/()\d.]+?)\s*(?:点)?(?:黄金|金币)$/.exec(c);
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

  /** 条件里的兵种名 → troops.json name（永生神系等）；失败 null */
  resolveTroopName(text) {
    const t = text.replace(/^永生神/, '永生神').trim();
    const names = loadTroops().map((x) => x.name);
    if (names.includes(t)) return t;
    // 「不朽的拉奇亚」等音译差异不硬凑
    return null;
  }
}

// —— 段构造小工具 ——
/** 段构造：成功 { seg }，失败 { err }（调用方据此区分错误与产物） */
function createGemCall(compiler, what, n, mod, allowBareColor = false) {
  compiler.use('createGems', 'createSkulls', 'createSpecialGems', 'scale', 'flat');
  const color = matchColor(what);
  // 始终带满 (base, mult, opts) 形态：mult=0 常数；opts 占位保证后续 appendOpt 落位
  const optsSuffix = mod ? `, 0, { modifier: ${jsonMod(mod)} }` : ', 0';
  if (!what || color) {
    if (!allowBareColor && !color && !what) return { err: '创造目标缺失' };
    return { seg: `createGems(${colorRef(color)}, ${n}${optsSuffix})` };
  }
  if (/骷髅头/.test(what)) return { seg: `createSkulls(${n}${optsSuffix})` };
  const gem = matchSpecialGem(what);
  if (gem) return { seg: `createSpecialGems({ kind: '${gem}' }, ${n}${optsSuffix})` };
  return { err: `创造目标无法识别「${what}」` };
}
/** 顶层「或」拆分（不在括号内） */
function splitTopLevel(c, sep) {
  const idx = c.indexOf(sep);
  if (idx < 0) return [];
  return [c.slice(0, idx).trim(), c.slice(idx + sep.length).trim()];
}
function transformGemCall(compiler, fromColor, what, count, _clause) {
  compiler.use('transformToSpecial', 'transform');
  const gem = matchSpecialGem(what);
  if (!gem) {
    if (/x3|×3|三倍/.test(what)) {
      // 「将选定的法力宝石转换为 x3 通配符」（batch-r9 WildCard3 = tier 3 先例）
      compiler.use('transformToSpecial');
      return `transformToSpecial(CHOSEN, 'wildcard', { tier: 3 }${count !== undefined ? '' : ''})`.replace('{ tier: 3 }', '{ count: 1, tier: 3 }');
    }
    return null;
  }
  const from = fromColor ? `BaseColor.${fromColor}` : "'ANY'";
  const opts = count !== undefined ? `, { count: ${count} }` : '';
  return `transformToSpecial(${from}, '${gem}'${opts})`;
}
function allyTargetOf(grp, others) {
  const g = grp.trim();
  if (g === '所有' || g === '全体' || g === '') return others ? 'allyOthers' : 'allyAll';
  if (/两名随机|2 名随机/.test(g)) return 'allyRandomN';
  if (/随机/.test(g)) return 'allyRandom';
  if (/选定/.test(g)) return 'allyChosen';
  return 'allyAll';
}
function statusTarget(prefix, state) {
  const p = (prefix ?? '').trim();
  if (p === '' || /^(使其?|令其?|对他|让她|给它|并)$/.test(p)) {
    return { mode: state?.lastTargetMode ?? 'lastTarget' };
  }
  const q = p.replace(/^(使|让|给)/, '');
  // 盟友系优先（「第一名盟友」不是 enemyFront）
  if (/盟友/.test(q)) {
    if (/所有其他盟友|其他盟友/.test(q)) return { mode: 'allyOthers' };
    if (/所有盟友|^所有$/.test(q)) return { mode: 'allyAll' };
    if (/随机一名|一名随机|随机/.test(q)) return { mode: /两名|2 名/.test(q) ? 'allyRandomN' : 'allyRandom' };
    if (/第\s*[一1]\s*名|第一名|首位/.test(q)) return { mode: 'allyFront' };
    if (/前\s*(\d+)/.test(q)) return { mode: 'allyFirstN', n: Number(q.match(/前\s*(\d+)/)[1]) };
    if (/一名|一个/.test(q)) return { mode: 'allyChosen' };
    return { mode: 'allyAll' };
  }
  // 敌人系
  if (/第\s*[一1]\s*名|第一名|首位|第一位的?/.test(q)) return { mode: 'enemyFront' };
  if (/最后一名|最后一个|最末位/.test(q)) return { mode: 'enemyLast' };
  if (/最虚弱的?/.test(q)) return { mode: /两/.test(q) ? 'enemyWeakestN' : 'enemyWeakest' };
  if (/最健康的?|最强的/.test(q)) return { mode: 'enemyHealthiest' };
  if (/敌人$/.test(q)) {
    if (/所有/.test(q)) return { mode: 'enemyAll' };
    const n = q.match(/(\d+)\s*[名个位]/);
    if (/随机/.test(q)) return { mode: 'enemyRandomN', n: n ? Number(n[1]) : undefined };
    if (/前\s*(\d+)/.test(q)) return { mode: 'enemyFirstN', n: Number(q.match(/前\s*(\d+)/)[1]) };
    return { mode: 'enemyChosen' };
  }
  // 盟友系
  if (/所有其他盟友|其他盟友/.test(q)) return { mode: 'allyOthers' };
  if (/所有盟友|^所有$/.test(q)) return { mode: 'allyAll' };
  if (/盟友$/.test(q)) {
    if (/随机一名|一名随机|随机/.test(q)) return { mode: /两名|2 名/.test(q) ? 'allyRandomN' : 'allyRandom' };
    if (/一名|一个/.test(q)) return { mode: 'allyChosen' };
    return { mode: 'allyAll' };
  }
  if (q === '自身') return { mode: 'allySelf' };
  return null;
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
function matchSpecialGem(what) {
  for (const [zh, kind] of SPECIAL_GEMS) if (what.includes(zh.replace('宝石', '')) || what.includes(zh)) return kind;
  return null;
}
function allySourceOf(grp, isEnemy) {
  const color = matchColor(grp);
  if (color) {
    return { sources: [{ kind: 'alliesOfColor', color }, { kind: 'teamSize', side: isEnemy ? 'enemy' : 'ally' }] };
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
  // 特殊宝石计数（boardSpecial）
  for (const [zh] of SPECIAL_GEMS) {
    const core = zh.replace('宝石', '');
    if (b.includes(core) && /宝石/.test(b)) {
      if (core.includes('末日') || core.includes('厄运')) return { source: { kind: 'boardSkulls' } };
      const kind = matchSpecialGem(core);
      if (kind) return { source: { kind: 'boardSpecial', gem: kind } };
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
      out = { skip: `编译器异常：${String(e).slice(0, 160)}` };
    }
    return { ...w, compiled: !out.skip, build: out.build ?? null, imports: out.imports ?? null, reason: out.skip ?? null };
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
  const ok = results.filter((r) => r.compiled);
  const bad = results.filter((r) => !r.compiled);
  console.log(`编译 ${ok.length} / 放弃 ${bad.length} / 共 ${results.length}`);
  const fam = new Map();
  for (const r of results) {
    const f = familyOf(r.desc);
    fam.set(f, { total: (fam.get(f)?.total ?? 0) + 1, ok: (fam.get(f)?.ok ?? 0) + (r.compiled ? 1 : 0) });
  }
  console.log('-- 家族（编译/总数） --');
  for (const [f, v] of [...fam.entries()].sort((a, b) => b[1].total - a[1].total)) console.log(`  ${String(v.ok).padStart(3)}/${String(v.total).padStart(3)}  ${f}`);
  const hist = new Map();
  for (const b of bad) {
    const key = (b.reason.match(/未识别子句「([^」]+)」/) ?? [])[1] ?? b.reason.slice(0, 60);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  console.log('-- 未识别/放弃原因 top50 --');
  for (const [k, n] of [...hist.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 50)) console.log(String(n).padStart(4), k);
}

function cmdLeft() {
  const results = compileAll();
  for (const r of results.filter((x) => !x.compiled)) {
    console.log(`${r.spellId}\t${r.desc}\t|| ${r.reason}`);
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
  const results = compileAll().sort((a, b) => a.spellId - b.spellId);
  const batches = [];
  for (let i = 0; i < results.length; i += BATCH_CHUNK) batches.push(results.slice(i, i + BATCH_CHUNK));
  const names = batches.map((_, i) => `W${String(i + 1).padStart(2, '0')}`);
  batches.forEach((chunk, bi) => {
    const name = names[bi];
    const spells = chunk.filter((r) => r.compiled);
    const skipped = chunk.filter((r) => !r.compiled).map((r) => ({ id: r.spellId, reason: r.reason }));
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
      .filter((f) => f !== 'CHOSEN')
      .filter((f) => new RegExp(`\\b${f}\\s*\\(`).test(allBuilds))
      .sort();
    useChosen = useChosen && /\bCHOSEN\b/.test(allBuilds);
    const importLines = `import { ${importNames.join(', ')}${useChosen ? (importNames.length ? ', ' : '') + 'CHOSEN' : ''} } from '../builders';${useBaseColor ? "\nimport { BaseColor } from '../../types';" : ''}`;
    const spellRows = spells.map((s) => `  {\n    id: ${s.spellId},\n    desc: ${esc(s.desc)},\n    build: ${s.build},\n  },`).join('\n');
    const skipRows = skipped.map((s) => `  { id: ${s.id}, reason: ${esc(s.reason)} },`).join('\n');
    const out = `/**
 * 窗口 K-B · 武器法术批次 ${name}（池：scripts/curated-pools/pool-w01.json）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 组装规则全部锚定 scripts/spell-rules.md 与既有部队批次先例（详见各 skipped 原因
 * 与 artifacts/weapon-spell-triage.md 的家族分布/原语请求节）。
 * 生成器：scripts/_weapon_pools.mjs gen（规则表 + 人工裁定；机器不猜语义）。
 */
${importLines}
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
${skipRows}
];

const SPELLS: CuratedBatch['spells'] = [
${spellRows}
];

export const BATCH_${name}: CuratedBatch = { batch: '${name}', spells: SPELLS, skipped: SKIPPED };
`;
    writeFileSync(path.join(CURATED_DIR, `batch-${name.toLowerCase()}.ts`), out, 'utf8');
    console.log(`batch-${name.toLowerCase()}.ts：${spells.length} 编译 + ${skipped.length} 放弃`);
  });
  console.log(`共 ${names.length} 个批次：${names.join(', ')}`);
  console.log('index.ts 注册（W 系独立注册表，与部队 BATCHES 分离）：');
  console.log(names.map((n) => `  import { BATCH_${n} } from './batch-${n.toLowerCase()}';`).join('\n'));
}

// =====================================================================
// report：生成 artifacts/weapon-spell-triage.md
// =====================================================================
function cmdReport() {
  const results = compileAll().sort((a, b) => a.spellId - b.spellId);
  const ok = results.filter((r) => r.compiled);
  const bad = results.filter((r) => !r.compiled);
  const primitives = bad.filter((r) => r.reason.includes('原语请求'));
  // 家族分布
  const fam = new Map();
  for (const r of results) {
    const f = familyOf(r.desc);
    const cur = fam.get(f) ?? { total: 0, ok: 0 };
    cur.total += 1;
    if (r.compiled) cur.ok += 1;
    fam.set(f, cur);
  }
  // 放弃原因分布（归并到句式级主因）
  const reasonHist = new Map();
  for (const b of bad) {
    const key = b.reason.replace(/→ 原语请求.*$/, '').replace(/「[^」]*」/g, '「…」').slice(0, 60);
    reasonHist.set(key, (reasonHist.get(key) ?? 0) + 1);
  }
  // 原语请求清单（去重 + 样例）
  const primMap = new Map();
  for (const p of primitives) {
    const key = p.reason;
    if (!primMap.has(key)) primMap.set(key, { count: 0, sample: p });
    primMap.get(key).count += 1;
  }
  const lines = [];
  lines.push('# 武器法术组装分诊报告（窗口 K-B）');
  lines.push('');
  lines.push('> 2026-09-17。数据源 `artifacts/gowhead-weapons/weapons.json`（718 条，zh 文本锚定）；');
  lines.push('> 语义依据 `scripts/spell-rules.md`（含 §0 裸伤害/§9 风暴 oneOf/§11 随机状态分池/§12 lastTarget/§13 && 切分）；');
  lines.push('> 组装规则锚定既有部队批次先例；机器不猜语义，规则外一律 SKIPPED 并注明原因。');
  lines.push('> 生成器：`scripts/_weapon_pools.mjs`（pool / triage / left / debug / gen / report）。');
  lines.push('');
  lines.push('## 总账');
  lines.push('');
  lines.push(`| 类别 | 条数 |`);
  lines.push(`|---|---|`);
  lines.push(`| 编译（curated W 系批次） | ${ok.length} |`);
  lines.push(`| 放弃（SKIPPED，其中原语请求 ${primitives.length}） | ${bad.length} |`);
  lines.push(`| **合计** | **${results.length}** |`);
  lines.push('');
  lines.push(`编译率 ${(100 * ok.length / results.length).toFixed(1)}%（目标 ≥50% 未达标，卡点分布见下——`);
  lines.push(`最大三块为 Doomed 档淬炼加成（${results.filter((r) => TEMPERING_RE.test(r.desc)).length} 条，武器系统机制、战斗引擎无对应）、`);
  lines.push(`缺失状态（${results.filter((r) => /缺失状态/.test(r.reason ?? '')).length} 条）与未实现特殊宝石（${results.filter((r) => /特殊宝石家族未实现/.test(r.reason ?? '')).length} 条），`);
  lines.push('均为数据驱动的硬缺口而非规则缺失；其余为长尾机翻变体（每条 1-2 例）。');
  lines.push('');
  lines.push('## SpellId 冲突检查（动工前扫描）');
  lines.push('');
  lines.push('- 718 个武器 spellId（7064–10065，跨 7k/8k/9k/10k 四段）与 `troops.json` 全部 spell id **零交集**；');
  lines.push('- 与 curated 既有 52 个批次（含 batch-r1~r9、batch-p37~p40）的 compiled+skipped id **零交集**；');
  lines.push('- 与 `library.ts` SKILL_OVERRIDES（7004/7062/7063/7132/7155）**零交集**。');
  lines.push('- 结论：**无冲突**；W 系批次仍采用独立注册表（`collectWeaponCurated`），');
  lines.push('  因为部队侧对号入座校验（tests/unit/spellData.test.ts）要求 curated id 必须存在于 troops.json，武器 id 不满足。');
  lines.push('');
  lines.push('## 批次文件清单');
  lines.push('');
  {
    const batches = [];
    for (let i = 0; i < results.length; i += BATCH_CHUNK) batches.push(results.slice(i, i + BATCH_CHUNK));
    batches.forEach((chunk, bi) => {
      const name = `W${String(bi + 1).padStart(2, '0')}`;
      const s = chunk.filter((r) => r.compiled).length;
      const k = chunk.length - s;
      lines.push(`- \`src/engine/skills/curated/batch-${name.toLowerCase()}.ts\`（BATCH_${name}）：编译 ${s} + 放弃 ${k}`);
    });
  }
  lines.push('');
  lines.push('## 句式家族分布（top10，按总数）');
  lines.push('');
  lines.push('| 家族 | 编译 | 总数 |');
  lines.push('|---|---|---|');
  for (const [f, v] of [...fam.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10)) {
    lines.push(`| ${f} | ${v.ok} | ${v.total} |`);
  }
  lines.push('');
  lines.push('## SKIPPED 原因分布');
  lines.push('');
  lines.push('| 原因（归并后） | 条数 |');
  lines.push('|---|---|');
  for (const [k, n] of [...reasonHist.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${n} |`);
  lines.push('');
  lines.push('## 原语请求清单（供 G 窗口评估）');
  lines.push('');
  lines.push('以下机制在武器法术中出现但 builders/prototypes 无对应原语；K-B 未自行实现。');
  lines.push('');
  lines.push('| # | 机制 | 出现 | 句式样例（spellId） | 期望形态 |');
  lines.push('|---|---|---|---|---|');
  let pi = 1;
  for (const [key, v] of primMap) {
    const form = key.includes('tempering') ? 'modifier 来源 { kind: tempering, n }（或组装期常量注入）'
      : key.includes('kingdom 条件') ? 'Condition { kind: kingdomPresent, kingdom }'
      : key.includes('kingdom 计数') ? 'ModifierSource { kind: alliesOfKingdom, kingdom }'
      : key.includes('kingdom 目标限定') ? 'TargetMode allyKingdom { kingdom } / Condition kingdom'
      : key.includes('kingdom 召唤') ? 'summonRandom 支持按 troops.json kingdom 字段取引用清单'
      : key.includes('stat 翻倍') ? 'buff opts.double（现仅 reduce.halve）'
      : key.includes('dmg base = targetStat') ? 'dmg 支持 base 来源 targetStat'
      : key.includes('targetStatBeatsCaster') ? 'Condition { kind: casterStatBeatsTarget, stat, reversed }'
      : key.includes('anyEnemyDied') ? 'Condition { kind: anyEnemyDied }'
      : key.includes('allyOfColor') ? 'TargetMode allyOfColor { color }'
      : key.includes('createMix 扩特殊') ? 'createMix 端点扩特殊宝石/骷髅'
      : key.includes('clear line-of-gem') ? 'clear target { kind: lineOfGem, mode }'
      : '（见样例句）';
    lines.push(`| ${pi++} | ${key.replace('→ 原语请求：', ' → ').replace(/（batch[^）]*）/, '')} | ${v.count} | ${v.sample.desc.slice(0, 40)}（${v.sample.spellId}） | ${form} |`);
  }
  lines.push('');
  lines.push('## 其余放弃说明（诚实原则）');
  lines.push('');
  lines.push('- 全部 SKIPPED 均带首因（首个未识别子句或预判命中），逐条见批次文件 SKIPPED 数组；');
  lines.push('- 机翻噪声（「造成l」「{1}」占位符、错字语序）不硬凑，EN 原文仅作对照、zh 为锚；');
  lines.push('- 中英快照不同步的个别条目（如 7074 两版法术不同）以 zh 为准编译。');
  lines.push('');
  mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
  writeFileSync(REPORT_OUT, lines.join('\n') + '\n', 'utf8');
  console.log(`report → ${path.relative(ROOT, REPORT_OUT)}`);
}

const cmd = process.argv[2] ?? 'pool';
if (cmd === 'pool') cmdPool();
else if (cmd === 'triage') cmdTriage();
else if (cmd === 'left') cmdLeft();
else if (cmd === 'debug') cmdDebug(process.argv[3]);
else if (cmd === 'gen') cmdGen();
else if (cmd === 'report') cmdReport();
else console.log('用法: pool | triage | left | debug <id> | gen | report');

