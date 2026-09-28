// 从 gowhead 原始 dump 抽取引擎所需的精简兵种数据。
// 用法: node scripts/build_troops.mjs
// 输入: data/raw/troops.gow.zh.json
// 输出: src/data/troops.json （引擎/表现层消费的干净数据）
import fs from 'node:fs';
import path from 'node:path';

const IN = 'data/raw/troops.gow.zh.json';
const OUT = 'src/data/troops.json';
const SNAPSHOT_OVERRIDES = JSON.parse(fs.readFileSync('src/data/gowSnapshotOverrides.json', 'utf8')).troops;

/** gowhead 颜色键 → 引擎 BaseColor 值 */
const COLOR_MAP = {
  ColorRed: 'Red',
  ColorGreen: 'Green',
  ColorBlue: 'Blue',
  ColorYellow: 'Yellow',
  ColorPurple: 'Purple',
  ColorBrown: 'Brown',
};

const RARITY = ['Common', 'Uncommon', 'Rare', 'UltraRare', 'Epic', 'Legendary'];

// --- 技能缩放解析（内联，与 src/engine/skills/scaling.ts 逐字保持一致） ---
// 需求 2：数据构建期一次性把技能描述预解析为结构化元数据 SkillMetadata，
// 运行时逻辑层不再解析中文文本。此处逻辑必须与 scaling.ts 的 parseScalings/
// buildSkillMetadata 完全等价，二者共同的单元测试保证一致性。
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

/** 从描述构建技能元数据；无法识别时 parsed=false 且保留 raw（需求 2.1/2.3）。 */
function buildSkillMetadata(desc) {
  const { scalings, modifier } = parseScalings(desc);
  const parsed = scalings.length > 0 || modifier !== undefined;
  // 键顺序固定，保证 JSON dump 确定性（需求 2.5）
  const meta = { scalings, raw: desc, parsed };
  if (modifier !== undefined) meta.modifier = modifier;
  return meta;
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
// P-E-faction-kingdom: the zh dump's KingdomId folds faction kingdoms into their parent (5 Dripping Caverns 3058 troops
// carry Grosh-Nak 3018, like kingdom_name). The en dump keeps the raw native KingdomId that SpellSteps use.
const RAW_EN = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8'));
const RAW_KINGDOM_ID = new Map((Array.isArray(RAW_EN) ? RAW_EN : RAW_EN.troops ?? Object.values(RAW_EN)).map((t) => [t.Id, t.KingdomId]));
const rawKingdomId = (id) => (Number.isFinite(RAW_KINGDOM_ID.get(id)) ? RAW_KINGDOM_ID.get(id) : null);

const troops = raw.troops.map((t) => {
  const s = t.stats ?? {};
  const spellDescription = SNAPSHOT_OVERRIDES[t.id]?.spellDescription ?? s.spell?.desc ?? '';
  const spellMeta = buildSkillMetadata(spellDescription);
  if (SNAPSHOT_OVERRIDES[t.id]?.spellModifier) spellMeta.modifier = SNAPSHOT_OVERRIDES[t.id].spellModifier;
  const colors = (t.mana_colors ?? [])
    .map((c) => COLOR_MAP[c])
    .filter(Boolean);
  return {
    id: t.id,
    name: t.name_localized,
    referenceName: t.ReferenceName,
    rarity: RARITY[t.RarityIdx] ?? 'Common',
    rarityIdx: t.RarityIdx,
    kingdom: s.kingdom_name ?? null,
    kingdomId: rawKingdomId(t.id),
    troopTypes: [t.TroopType, t.TroopType2].filter(Boolean),
    role: t._TroopRole_parsed?.[0] ?? null,
    // 战斗数值：顶层字段是 GoW 的 20 级（满级）值
    attack: t.Attack ?? 0,
    armor: t.Armor ?? 0,
    health: t.Health ?? 0,
    magic: t.Magic ?? 0,
    // 1 级基础值（GoW 官方 *_Base）。与上面的 20 级值一起作为等级曲线的两个锚点，
    // 缺字段按 0 处理（原始 dump 里部分兵种确实没有该键）。
    base: {
      attack: t.raw_data?.Attack_Base ?? 0,
      armor: t.raw_data?.Armor_Base ?? 0,
      health: t.raw_data?.Health_Base ?? 0,
      magic: t.raw_data?.SpellPower_Base ?? 0,
    },
    // 法力
    manaColors: colors,
    manaCost: SNAPSHOT_OVERRIDES[t.id]?.manaCost ?? t.ManaCost ?? 0,
    // 技能：描述符 + 预解析元数据（缩放/修饰/原文/是否识别），运行时不再解析文本
    spell: {
      id: t.SpellId,
      name: s.spell?.name ?? '',
      description: SNAPSHOT_OVERRIDES[t.id]?.spellDescription ?? s.spell?.desc ?? '',
      meta: buildSkillMetadata(SNAPSHOT_OVERRIDES[t.id]?.spellDescription ?? s.spell?.desc ?? ''),
    },
    // 特质（仅保留代码 + 名称 + 描述，丢弃 traitstone 图标等元数据）
    traits: (s.traits ?? []).map((x) => ({
      code: x.code,
      name: SNAPSHOT_OVERRIDES[t.id]?.traitNames?.[x.code] ?? x.name,
      description: SNAPSHOT_OVERRIDES[t.id]?.traitDescriptions?.[x.code] ?? x.description,
    })),
    portrait: t.FileBase ?? null,
  };
});

// Preserve separately sourced installed entries absent from the Chinese snapshot.
const supplements = JSON.parse(fs.readFileSync('src/data/gowTroopSnapshotSupplements.json', 'utf8')).troops;
for (const entry of supplements) {
  if (!troops.some((troop) => troop.id === entry.id)) troops.push({ ...entry, kingdomId: entry.kingdomId ?? rawKingdomId(entry.id) });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(troops, null, 2), 'utf8');

const inSize = (fs.statSync(IN).size / 1024 / 1024).toFixed(1);
const outSize = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`抽取完成: ${troops.length} 个兵种`);
console.log(`原始 ${inSize}MB → 精简 ${outSize}MB`);
console.log(`示例:`, JSON.stringify(troops[0], null, 2));
