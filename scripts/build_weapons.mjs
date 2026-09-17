// 从 gowhead 武器快照抽取引擎所需的精简武器数据（窗口 K · 子包 K-A）。
// 用法: node scripts/build_weapons.mjs
// 输入: artifacts/gowhead-weapons/raw/weapons.gow.zh.json（主数据，716/718 条法术全中文）
//       artifacts/gowhead-weapons/raw/weapons.gow.en.json（对照兜底：nameEn / 中文名缺口时的英文回退）
//       src/data/weapon-skill-meta.json（输入之一，由窗口 K-B 的 _weapon_pools.mjs 管线产出：
//         spellId → {fidelity, missingFeatures, skippedClauses} 绑定保真度登记，按 spell.id 合并进 spell.meta）
// 输出: src/data/weapons.json （主角武器数据，schema 对齐 troops.json，产物勿手改）
// 报告: artifacts/weapons-build-report.txt （统计 + 王国映射差异清单 + 绑定保真度分布）
import fs from 'node:fs';
import path from 'node:path';

const IN_ZH = 'artifacts/gowhead-weapons/raw/weapons.gow.zh.json';
const IN_EN = 'artifacts/gowhead-weapons/raw/weapons.gow.en.json';
const IN_TROOPS = 'src/data/troops.json';
// K-B 登记输入：绑定保真度元数据（只读消费，产物归 K-B 的 _weapon_pools.mjs 管线所有）
const IN_SKILL_META = 'src/data/weapon-skill-meta.json';
const OUT = 'src/data/weapons.json';
const REPORT = 'artifacts/weapons-build-report.txt';

/** gowhead 颜色键 → 引擎 BaseColor 值（与 build_troops.mjs 同款映射） */
const COLOR_MAP = {
  ColorRed: 'Red',
  ColorGreen: 'Green',
  ColorBlue: 'Blue',
  ColorYellow: 'Yellow',
  ColorPurple: 'Purple',
  ColorBrown: 'Brown',
};

// 武器稀有度比兵种多一档「Doomed（末日）」且没有 Legendary：
// RarityIdx 0~6 ↔ data.WeaponRarity 逐条一致（生成时交叉校验，不一致进报告）。
const RARITY = ['Common', 'Uncommon', 'Rare', 'UltraRare', 'Epic', 'Mythic', 'Doomed'];

/** 判定字符串是否含 CJK（中文名/中文法术优先；纯英文视为「无中文」走回退） */
const CJK_RE = /[\u4e00-\u9fff]/;
const hasCJK = (s) => CJK_RE.test(s ?? '');

// --- 技能缩放解析（内联，必须与 src/engine/skills/scaling.ts 等价） ---
// 与 build_troops.mjs 相同的约定：数据构建期一次性把技能描述预解析为结构化元数据
// SkillMetadata，运行时逻辑层不再解析中文文本。此处逻辑必须与 scaling.ts 的
// parseScalings/buildSkillMetadata 完全等价，二者共同的单元测试保证一致性。
// 武器 zh 法术文本已验证与该解析器句式吻合（[魔法 + 4] / [(魔法 / 2) + 3] / [x3] / [3:1]）。
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

/** 从描述构建技能元数据；无法识别时 parsed=false 且保留 raw（与 build_troops.mjs 一致）。 */
function buildSkillMetadata(desc) {
  const { scalings, modifier } = parseScalings(desc);
  const parsed = scalings.length > 0 || modifier !== undefined;
  // 键顺序固定，保证 JSON dump 确定性（重跑幂等）
  const meta = { scalings, raw: desc, parsed };
  if (modifier !== undefined) meta.modifier = modifier;
  return meta;
}

const zh = JSON.parse(fs.readFileSync(IN_ZH, 'utf8'));
const en = JSON.parse(fs.readFileSync(IN_EN, 'utf8'));
const enById = new Map(en.weapons.map((w) => [w.Id, w]));

// --- 王国中文名映射（复用 build_troops 的取名方式：zh dump 的 kingdom_name 即中文名） ---
// 校验基准 = troops.json 已有的 42 个王国中文名。武器王国若不在集合内（映射缺口），
// 原样英文落盘并在报告列差异，禁止自造译名。
const troops = JSON.parse(fs.readFileSync(IN_TROOPS, 'utf8'));
const TROOP_KINGDOM_ZH = new Set(troops.map((t) => t.kingdom).filter((k) => k && hasCJK(k)));

// --- 绑定保真度元数据（窗口 K-B 产物，登记输入） ---
// 与武器 spell.id 必须严格 718 对齐：武器缺登记或多出登记都是构建错误（直接 throw）。
const FIDELITIES = new Set(['full', 'partial', 'mana-only']);
const skillMeta = JSON.parse(fs.readFileSync(IN_SKILL_META, 'utf8'));
const skillMetaIds = new Set(Object.keys(skillMeta).map(Number));

/** 取某 spellId 的绑定登记；缺条目/形状不合法/保真度非法一律 throw（对齐错误不允许静默落盘） */
function requireSkillMeta(spellId, referenceName) {
  const m = skillMeta[String(spellId)];
  if (!m) {
    throw new Error(`weapon-skill-meta.json 缺少 spellId ${spellId}（武器 ${referenceName}）——与武器登记必须严格 718 对齐`);
  }
  if (typeof m.fidelity !== 'string' || !FIDELITIES.has(m.fidelity)
    || !Array.isArray(m.missingFeatures) || !Array.isArray(m.skippedClauses)) {
    throw new Error(`weapon-skill-meta.json 的 spellId ${spellId} 形状非法（需要 fidelity ∈ full/partial/mana-only + 两个数组）`);
  }
  return m;
}

// --- 统计收集（报告用；不含时间戳，保证重跑幂等） ---
const stats = {
  byRarity: {},
  byType: {},
  byColor: {},
  byColorCount: {},
  rarityIdxMismatch: [],
  nameEnFallback: [], // 中文名缺口（zh 名非中文）→ name 落英文
  spellDescEnFallback: [], // zh 法术描述缺失 → 英文兜底
  spellFullyZh: 0, // 法术描述全中文
  spellSemiZh: [], // zh 法术描述存在但夹英文（如新武器半翻译）
  affixFallback: 0, // 词缀名称/描述走了英文兜底的条数
  kingdomGaps: [], // 王国映射缺口（原样英文落盘）
  unrecognizedBrackets: {}, // 括号公式里解析器不认识的 token
  byFidelity: {}, // 绑定保真度分布（K-B 登记）
  withReleaseDate: 0,
  immortal: 0,
  affixEntries: 0,
  affixWeapons: 0,
  parsedTrue: 0,
  parsedFalse: 0,
  modifierOnly: 0,
};

const weapons = zh.weapons.map((w) => {
  const enW = enById.get(w.Id);
  const d = JSON.parse(w.data || '{}');
  const s = w.stats ?? {};
  const enS = enW?.stats ?? {};

  // 稀有度：data.WeaponRarity 为准，与 RarityIdx 查表交叉校验
  const rarity = d.WeaponRarity ?? RARITY[w.RarityIdx] ?? 'Common';
  if (RARITY[w.RarityIdx] !== rarity) {
    stats.rarityIdxMismatch.push(`${w.Id}: idx=${w.RarityIdx} → ${RARITY[w.RarityIdx]} 但 data=${rarity}`);
  }
  stats.byRarity[rarity] = (stats.byRarity[rarity] ?? 0) + 1;
  stats.byType[w.TroopType] = (stats.byType[w.TroopType] ?? 0) + 1;

  // 法力颜色
  const colors = (w.mana_colors ?? [])
    .map((c) => COLOR_MAP[c])
    .filter(Boolean);
  for (const c of colors) stats.byColor[c] = (stats.byColor[c] ?? 0) + 1;
  stats.byColorCount[colors.length] = (stats.byColorCount[colors.length] ?? 0) + 1;

  // 中文名优先：zh 名非中文（新武器未翻译）→ 回退英文名
  const nameEn = enW?.name_localized || enW?.Name || w.name_localized || '';
  let name = w.name_localized || '';
  if (!hasCJK(name)) {
    stats.nameEnFallback.push({ id: w.Id, referenceName: w.ReferenceName, name });
    name = nameEn;
  }

  // 法术：zh 描述为主（含公式里的「魔法」标记，英文兜底会丢解析），zh 缺失才回退 en
  const zhSpell = s.spell ?? {};
  const enSpell = enS.spell ?? {};
  let description = zhSpell.desc ?? '';
  if (description === '' && enSpell.desc) {
    stats.spellDescEnFallback.push({ id: w.Id, referenceName: w.ReferenceName });
    description = enSpell.desc;
  } else if (!CJK_RE.test(description.replace(/\[魔法[^\]]*\]/g, ''))) {
    // 去掉「魔法」标记后不含中文 = 半翻译（官方数据现状，非管线缺口；保留 zh 文本保证可解析）
    stats.spellSemiZh.push({ id: w.Id, referenceName: w.ReferenceName });
  } else {
    stats.spellFullyZh++;
  }
  const meta = buildSkillMetadata(description);
  for (const m of description.matchAll(BRACKET_RE)) {
    if (!classifyToken(m[1])) {
      const token = m[1].trim();
      stats.unrecognizedBrackets[token] = (stats.unrecognizedBrackets[token] ?? 0) + 1;
    }
  }
  if (meta.parsed) stats.parsedTrue++;
  else stats.parsedFalse++;
  if (/\[[^\]]*\]/.test(description) && meta.scalings.length === 0 && meta.modifier !== undefined) {
    stats.modifierOnly++;
  }

  // 绑定保真度合并（K-B 登记）：fidelity / missingFeatures / skippedClauses 进 spell.meta。
  // spellId 缺登记即 throw（见 requireSkillMeta）；多出的登记在映射完成后统一检查。
  const spellId = w.SpellId ?? zhSpell.id;
  const bound = requireSkillMeta(spellId, w.ReferenceName);
  meta.fidelity = bound.fidelity;
  meta.missingFeatures = bound.missingFeatures;
  meta.skippedClauses = bound.skippedClauses;
  stats.byFidelity[bound.fidelity] = (stats.byFidelity[bound.fidelity] ?? 0) + 1;

  // 淬炼词缀：有中文用中文，zh 缺失按序回退 en
  const zhAffixes = s.affixes ?? [];
  const enAffixes = enS.affixes ?? [];
  if (zhAffixes.length > 0) stats.affixWeapons++;
  const affixes = zhAffixes.map((a, i) => {
    stats.affixEntries++;
    const e = enAffixes[i] ?? {};
    const aName = a.name || e.name || '';
    const aDesc = a.description || e.description || '';
    if (!a.name || !a.description) stats.affixFallback++;
    return { name: aName, description: aDesc, rarity: a.rarity ?? e.rarity ?? '' };
  });

  // 王国：zh kingdom_name 即中文名；不在 troops.json 王国集合 = 映射缺口 → 原样英文落盘
  const zhKingdom = s.kingdom_name ?? null;
  const enKingdom = enS.kingdom_name ?? null;
  let kingdom;
  if (zhKingdom && TROOP_KINGDOM_ZH.has(zhKingdom)) {
    kingdom = zhKingdom;
  } else {
    kingdom = enKingdom ?? zhKingdom ?? null;
    stats.kingdomGaps.push({
      id: w.Id,
      referenceName: w.ReferenceName,
      zh: zhKingdom,
      en: enKingdom,
      used: kingdom,
    });
  }

  if (d.releaseDate !== undefined) stats.withReleaseDate++;
  const immortal = Boolean(w.IsImmortal);
  if (immortal) stats.immortal++;

  // 键顺序固定（对齐任务书 schema 列序），保证 JSON dump 确定性
  return {
    id: w.Id,
    name,
    nameEn,
    referenceName: w.ReferenceName,
    rarity,
    rarityIdx: w.RarityIdx,
    kingdom,
    weaponType: w.TroopType,
    attack: w.Attack ?? 0,
    armor: w.Armor ?? 0,
    health: w.Health ?? 0,
    magic: w.Magic ?? 0,
    manaColors: colors,
    manaCost: w.ManaCost ?? 0,
    spell: {
      id: spellId,
      name: zhSpell.name || enSpell.name || '',
      description,
      meta,
    },
    affixes,
    masteryRequirement: d.MasteryRequirement ?? null,
    releaseDate: d.releaseDate ?? null,
    immortal,
    imageFile: `${w.Id}_${w.ReferenceName}.webp`,
  };
});

// 按 id 升序（输入已有序，显式排序保证确定性）
weapons.sort((a, b) => a.id - b.id);

// 登记对齐的反向校验：武器侧用掉的 spellId 之外，登记里多出的 spellId 也是构建错误
const usedSpellIds = new Set(weapons.map((x) => x.spell.id));
const extraMetaIds = [...skillMetaIds].filter((id) => !usedSpellIds.has(id));
if (extraMetaIds.length > 0) {
  throw new Error(
    `weapon-skill-meta.json 多出 ${extraMetaIds.length} 个武器不存在的 spellId: ${extraMetaIds.slice(0, 10).join(', ')}——与武器登记必须严格 718 对齐`,
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(weapons, null, 2), 'utf8');

// --- 统计报告（纯数据派生，无时间戳 → 重跑幂等） ---
const lines = [];
lines.push('============================================================');
lines.push('武器数据构建报告（scripts/build_weapons.mjs → src/data/weapons.json）');
lines.push('============================================================');
lines.push(`武器总数: ${weapons.length}`);
lines.push(`输入快照: ${IN_ZH} (exported_at ${zh.exported_at}) + ${IN_EN} (exported_at ${en.exported_at})`);
lines.push('');
lines.push('-- 按稀有度分布 --');
for (const [r, n] of Object.entries(stats.byRarity)) lines.push(`  ${r.padEnd(10)} ${n}`);
lines.push('');
lines.push('-- 按武器类型分布 --');
for (const [t, n] of Object.entries(stats.byType)) lines.push(`  ${t.padEnd(10)} ${n}`);
lines.push('');
lines.push('-- 按法力颜色分布 --');
for (const [c, n] of Object.entries(stats.byColor)) lines.push(`  ${c.padEnd(7)} ${n}`);
lines.push(`  颜色组数分布: ${JSON.stringify(stats.byColorCount)}`);
lines.push('');
lines.push('-- 中文名覆盖率 --');
const zhNameCount = weapons.length - stats.nameEnFallback.length;
lines.push(`  中文名 name: ${zhNameCount}/${weapons.length} (${((zhNameCount / weapons.length) * 100).toFixed(1)}%)`);
lines.push(`  英文回退 name（nameEn 字段保留英文名）: ${stats.nameEnFallback.length} 把`);
for (const f of stats.nameEnFallback) {
  lines.push(`    - ${f.id} ${f.referenceName} → "${f.name}"`);
}
lines.push(`  法术描述全中文: ${stats.spellFullyZh}/${weapons.length}`);
lines.push(`  法术描述半翻译（zh 文本夹英文，保留原文保证 [魔法] 公式可解析）: ${stats.spellSemiZh.length} 把`);
for (const f of stats.spellSemiZh) {
  lines.push(`    - ${f.id} ${f.referenceName}`);
}
lines.push(`  法术描述英文兜底（zh 缺失）: ${stats.spellDescEnFallback.length} 把`);
lines.push('');
lines.push('-- 缩放预解析统计（内联解析器，与 src/engine/skills/scaling.ts 等价） --');
lines.push(`  meta.parsed=true（含括号公式且解析成功）: ${stats.parsedTrue}`);
lines.push(`  meta.parsed=false（描述无括号公式）: ${stats.parsedFalse}`);
lines.push(`  其中括号仅为二级修饰 [xN]/[N:M]（scalings 空、modifier 兜底）: ${stats.modifierOnly}`);
lines.push(`  括号公式识别失败 token 数: ${Object.keys(stats.unrecognizedBrackets).length}`);
for (const [token, n] of Object.entries(stats.unrecognizedBrackets)) {
  lines.push(`    - "${token}" x${n}`);
}
lines.push(`  RarityIdx ↔ WeaponRarity 不一致: ${stats.rarityIdxMismatch.length}`);
for (const m of stats.rarityIdxMismatch) lines.push(`    - ${m}`);
lines.push('');
lines.push('-- 绑定保真度分布（spell.meta 合并自 src/data/weapon-skill-meta.json，K-B 登记输入） --');
lines.push(`  full（法术全语义绑定）: ${stats.byFidelity.full ?? 0}`);
lines.push(`  partial（有缺失特性/跳过子句）: ${stats.byFidelity.partial ?? 0}`);
lines.push(`  mana-only（仅扣法力占位）: ${stats.byFidelity['mana-only'] ?? 0}`);
const fidelityTotal = Object.values(stats.byFidelity).reduce((s, n) => s + n, 0);
lines.push(`  对齐校验: 武器 spell.id ↔ 登记键 ${fidelityTotal}/${weapons.length}（缺/多即构建 throw，禁止静默落盘）`);
lines.push('  missingFeatures/skippedClauses 原样合并进 spell.meta，逐条与登记一致（审计测试锁定）');
lines.push('');
lines.push('-- 淬炼词缀（affixes） --');
lines.push(`  带词缀武器: ${stats.affixWeapons}/${weapons.length}，词缀共 ${stats.affixEntries} 条`);
lines.push(`  词缀名称/描述英文兜底条数: ${stats.affixFallback}`);
lines.push('');
lines.push('-- 王国中文名映射（复用 build_troops 取名：zh dump kingdom_name；基准 = troops.json 王国中文名集合） --');
const weaponKingdoms = [...new Set(weapons.map((w) => w.kingdom))].sort();
lines.push(`  武器去重王国数: ${weaponKingdoms.length}`);
lines.push(`  映射缺口（原样英文落盘）: ${stats.kingdomGaps.length} 把武器`);
for (const g of stats.kingdomGaps) {
  lines.push(`    - ${g.id} ${g.referenceName}: zh="${g.zh}" en="${g.en}" → 落盘 "${g.used}"`);
}
lines.push(`  差异清单（武器王国 ∩ troops.json 42 王国 = 全部命中则空）: ${stats.kingdomGaps.length === 0 ? '（空，无差异）' : `见上 ${stats.kingdomGaps.length} 条`}`);
lines.push(`  禁止自造译名：缺口的王国只允许原样英文，不新增中文译名`);
lines.push('');
lines.push('-- 其他 --');
lines.push(`  immortal=true: ${stats.immortal}`);
lines.push(`  带 releaseDate（unix 秒）: ${stats.withReleaseDate}`);
lines.push(`  imageFile 全部按 {Id}_{ReferenceName}.webp 生成: ${weapons.filter((w) => w.imageFile === `${w.id}_${w.referenceName}.webp`).length}/${weapons.length}`);
lines.push('');
lines.push('-- 给 K-B（法术组装）的备注 --');
const seg = {};
for (const w of weapons) {
  const k = Math.floor(w.spell.id / 1000);
  seg[k] = (seg[k] ?? 0) + 1;
}
lines.push(`  武器 spell.id 千位段分布: ${JSON.stringify(seg)}`);
const troopSpellIds = new Set(troops.map((t) => t.spell.id));
const collide = weapons.filter((w) => troopSpellIds.has(w.spell.id)).length;
lines.push(`  与 troops.json 法术 id 冲突数: ${collide}（${collide === 0 ? '无冲突' : '有冲突，K-B 动工前必须核对'}）`);

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');

const inSize = (fs.statSync(IN_ZH).size / 1024 / 1024).toFixed(1);
const outSize = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`抽取完成: ${weapons.length} 把武器`);
console.log(`原始 ${inSize}MB → 精简 ${outSize}MB`);
console.log(`中文名 ${zhNameCount}/${weapons.length}，缩放解析 parsed=true ${stats.parsedTrue} / false ${stats.parsedFalse}，王国映射缺口 ${stats.kingdomGaps.length}`);
console.log(`绑定保真度 full ${stats.byFidelity.full ?? 0} / partial ${stats.byFidelity.partial ?? 0} / mana-only ${stats.byFidelity['mana-only'] ?? 0}`);
console.log(`报告 → ${REPORT}`);
