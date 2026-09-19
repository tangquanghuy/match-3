#!/usr/bin/env node
/**
 * build_portrait_prompts.mjs — 敌人立绘 Krea2 提示词「渲染器 + 分片器 + 校验器」
 *
 * 用法（分片 agent 常用命令）:
 *   node scripts/build_portrait_prompts.mjs --kingdom 破碎尖塔
 *   node scripts/build_portrait_prompts.mjs --rarity Legendary,Epic --limit 20
 *   node scripts/build_portrait_prompts.mjs --kingdom 白盔国 --overrides artifacts/prompt-overrides/白盔国.json
 *   node scripts/build_portrait_prompts.mjs --name 食人魔 --show          # 只打印正面版调试
 *
 * 参数:
 *   --rarity     逗号分隔，如 Legendary,Epic（大小写不敏感）
 *   --kingdom    逗号分隔，中文王国名（子串匹配）
 *   --name       逗号分隔，精确兵种中文名（调试用）
 *   --limit      截取前 N 个（去重排序后）
 *   --overrides  逗号分隔的 override JSON 文件/目录路径；缺省自动加载 artifacts/prompt-overrides/*.json
 *   --out        输出目录，默认 assets/prompt/立绘
 *   --show       渲染指定 --name 的正面提示词到 stdout，不写文件
 *
 * 机制（极简 6 标签模板 v2）:
 *   - 模板固定为 6 个标签：<subject> <details> <pose> <environment> <lighting> <style>。
 *     每个概念只允许出现一次（数量词只写在 subject）；caption 已整体删除。
 *   - 脚本锁死的锚：
 *     · 头部两行（中文名： + wlopk2style, Yoneyama Mai Style,）
 *     · <lighting> 逐字锁死为 "strong key light on the subject, clear readable details"
 *     · <style> 前后框架（clean anime-style monster design over a photorealistic background,
 *       …{palette} palette, thumbnail-readable silhouette）
 *     · <environment> 收尾脚手架（compressed framing, no large empty space；明暗完全交给 override）
 *     · 正/侧视角差异措辞（正面 facing the viewer / 侧面 from side）
 *   - 创意内容一律来自 artifacts/prompt-overrides/*.json（新 schema：name / subject_en / subject /
 *     details / pose_front / pose_side / expression_front / expression_side / environment /
 *     palette / pronoun），逐角色由 agent 撰写，脚本绝不内置词汇表。场景明暗与题材完全放开，
 *     唯一硬约束是主体清晰受光、细节可读、缩略图可辨识；environment 禁止为打光编戏的光源装置。
 *   - 每个(唯一)兵种输出两个无扩展名文件：{净化名}-正面 与 {净化名}-侧面（CRLF，与范例一致）。
 *   - 缺 override 的兵种渲染 GENERIC_PLACEHOLDER 通用版，并写入 _missing-overrides.txt 名单。
 *   - 渲染后逐文件校验（头部两行 / 6 标签齐全且非空 / lighting 逐字一致 / style 框架一致 /
 *     environment 脚手架一致 / 无 caption 残留 / 侧视角确有 from side 措辞 / 王国名泄漏 /
 *     正文混入中文），并对 environment/details/pose 里的氛围填充词
 *     （drifting / falling / mist / fog / haze / floating particles / smoke sheets /
 *     cinder drift settling / heat shimmer 等微粒·雾气类短语）输出软警戒 WARNING：
 *     不阻断、不计入错误——个别角色概念本体（如雾体幽灵、梦境萨满的烟）合理需要，
 *     由撰写者自查；统计单独记入 _build-report.json（totals.fillerWarnings 等）。
 *   - 汇总写 _build-report.json。
 *
 * 红线：本脚本只读取 artifacts/portrait-manifest.json 与 src/data/troops.json（只读），
 *       只写入 assets/prompt/立绘/**；绝不触碰 src/** tests/** 或范例 assets/prompt/提示词。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'artifacts', 'portrait-manifest.json');
const TROOPS_JSON = path.join(ROOT, 'src', 'data', 'troops.json');
const OVERRIDES_DIR = path.join(ROOT, 'artifacts', 'prompt-overrides');
const DEFAULT_OUT = path.join(ROOT, 'assets', 'prompt', '立绘');

// ---------------------------------------------------------------------------
// 内置常量（取自用户认可的范例 assets/prompt/提示词，逐字沿用骨架与质量锚）
// ---------------------------------------------------------------------------
const STYLE_LINES = [
  'wlopk2style, Yoneyama Mai Style, ',
  'western fantasy style, DnD monster manual illustration, painterly fantasy,',
];
const STYLE_LINE = STYLE_LINES.join('\n');

// 极简模板锁死锚（逐字）
const TAG_ORDER = ['subject', 'details', 'pose', 'environment', 'lighting', 'style'];
const LIGHTING_LINE = 'strong key light on the subject, clear readable details';
const STYLE_FRAME_START = 'clean anime-style monster design over a photorealistic background, ';
const STYLE_FRAME_END = ' palette, thumbnail-readable silhouette';
const ENV_SCAFFOLD_SUFFIX = ', compressed framing, no large empty space';
const POSE_FRONT_SUFFIX = ', facing the viewer';
const POSE_SIDE_SUFFIX = ', from side';

const RARITY_RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, UltraRare: 4, Legendary: 5 };

const KINGDOMS = [
  '破碎尖塔', '阿达纳', '卡拉考斯', '蛛尔卡里', '卜筮之原', '鳞雾沼泽', '荆棘森林', '白盔国',
  '潘神之谷', '盖塔尔', '卡其尔', '齐埃金', '荣耀之地', '加尔凡尼亚', '剑锋崖', '风暴峡湾',
  '毛格瑞姆森林', '葛洛什奈克', '混沌', '狂野平原', '黑石', '聚沙之地', '荒芜之地', '冰峰之巅',
  '天启', '狮心帝国', '龙爪', '守护者', '黑鹰', '玉银林地', '日冕', '厄什卡亚', '藏宝库',
  '梅兰堤斯', '圣唐', '皓彩森林', '卓克祖', '迈纳杰之罪', '沃尔帕克', '诺斯', '地狱悬崖', '午夜城市',
];

const MANA_ACCENT = {
  Red: 'ember red', Blue: 'cold blue', Green: 'moss green',
  Yellow: 'pale gold', Purple: 'violet', Brown: 'earthy brown',
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    a = a.slice(2);
    let key = a, val = '';
    const eq = a.indexOf('=');
    if (eq >= 0) { key = a.slice(0, eq); val = a.slice(eq + 1); }
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { val = argv[++i]; }
    else { val = 'true'; }
    (args[key] ||= []).push(val);
  }
  return args;
}
const csv = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function printUsageAndExit() {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0] + '*/');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 文件名净化（Windows 非法字符 → 全角，保留 · - . 空格 、）
// ---------------------------------------------------------------------------
const ILLEGAL_MAP = new Map(Object.entries({
  '<': '＜', '>': '＞', ':': '：', '"': '＂', '/': '／', '\\': '＼', '|': '｜', '?': '？', '*': '＊',
}));
function sanitizeFilename(name, renames, context) {
  let out = '';
  let changed = false;
  for (const ch of name) {
    if (ILLEGAL_MAP.has(ch)) { out += ILLEGAL_MAP.get(ch); changed = true; }
    else out += ch;
  }
  const trimmed = out.replace(/[. ]+$/, '');
  if (trimmed !== out) { changed = true; out = trimmed; }
  if (changed) renames.push({ context, from: name, to: out });
  return out;
}

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------
function loadTroopManaColors() {
  try {
    const raw = JSON.parse(fs.readFileSync(TROOPS_JSON, 'utf8'));
    const map = new Map();
    for (const t of raw) {
      if (t && typeof t.name === 'string' && Array.isArray(t.manaColors) && !map.has(t.name)) {
        map.set(t.name, t.manaColors);
      }
    }
    return map;
  } catch (err) {
    console.warn(`[warn] 无法读取 ${TROOPS_JSON}（只读失败不影响主流程）: ${err.message}`);
    return new Map();
  }
}

function loadOverrides(paths) {
  const files = [];
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
    const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
    if (st && st.isDirectory()) {
      for (const f of fs.readdirSync(abs).filter((f) => f.endsWith('.json')).sort()) {
        files.push(path.join(abs, f));
      }
    } else if (st && st.isFile()) {
      files.push(abs);
    } else {
      throw new Error(`override 路径不存在: ${abs}`);
    }
  }
  const map = new Map(); // name -> { override, file }
  for (const file of files) {
    let json = fs.readFileSync(file, 'utf8');
    if (json.charCodeAt(0) === 0xfeff) json = json.slice(1); // strip BOM
    const data = JSON.parse(json);
    const list = Array.isArray(data) ? data : Array.isArray(data?.overrides) ? data.overrides : null;
    if (!list) throw new Error(`${file}: 顶层必须是数组或 { "overrides": [...] }`);
    for (const entry of list) {
      if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new Error(`${file}: 每条 override 必须有非空 name`);
      }
      map.set(entry.name.trim(), { override: entry, file });
    }
  }
  return map;
}

function loadFilteredTroops(args) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rarityFilter = args.rarity ? csv(args.rarity).map((s) => s.toLowerCase()) : null;
  const kingdomFilter = args.kingdom ? csv(args.kingdom) : null;
  const nameFilter = args.name ? csv(args.name) : null;

  // 撞名去重：每个唯一 name 保留最高稀有度记录（其元数据做风味）
  const byName = new Map();
  for (const t of manifest) {
    const prev = byName.get(t.name);
    if (!prev || (RARITY_RANK[t.rarity] ?? -1) > (RARITY_RANK[prev.rarity] ?? -1)) byName.set(t.name, t);
  }
  let troops = [...byName.values()];
  troops.sort((a, b) => (RARITY_RANK[b.rarity] ?? -1) - (RARITY_RANK[a.rarity] ?? -1) || a.name.localeCompare(b.name, 'zh'));

  if (rarityFilter) troops = troops.filter((t) => rarityFilter.includes(String(t.rarity).toLowerCase()));
  if (kingdomFilter) troops = troops.filter((t) => kingdomFilter.some((k) => String(t.kingdom).includes(k)));
  if (nameFilter) troops = troops.filter((t) => nameFilter.includes(t.name));
  if (args.limit) troops = troops.slice(0, Math.max(0, Number(args.limit) || 0));
  return { troops, totalManifest: manifest.length, totalUnique: byName.size };
}

// ---------------------------------------------------------------------------
// override 可选槽位（仅 pronoun；其余全部必填，缺失即报错）
// ---------------------------------------------------------------------------
const PRONOUNS = new Set(['it', 'he', 'she']);
const DEFAULT_PRONOUN = 'it';

// ---------------------------------------------------------------------------
// 正文（英文）渲染：头部两行 + 6 标签（每个概念只出现一次，caption 已删除）
// ---------------------------------------------------------------------------
function renderPose(o, viewKind) {
  return viewKind === 'front'
    ? `${o.expression_front}, ${o.pose_front}${POSE_FRONT_SUFFIX}`
    : `${o.expression_side}, ${o.pose_side}${POSE_SIDE_SUFFIX}`;
}

function renderPrompt(o, viewKind) {
  const lines = [];
  lines.push(`${o.name_cn}：`);
  lines.push(...STYLE_LINES);
  if (o.generic) {
    lines.push('<!-- GENERIC_PLACEHOLDER: no override written for this troop yet; quality anchors and the generic fallback environment were applied. Write artifacts/prompt-overrides/<shard>.json for this troop and re-run to overwrite. -->');
  }
  lines.push('<krea2_prompt>');
  lines.push(`  <subject>${o.subject}</subject>`);
  lines.push(`  <details>${o.details}</details>`);
  lines.push(`  <pose>${renderPose(o, viewKind)}</pose>`);
  lines.push(`  <environment>${o.environment}${ENV_SCAFFOLD_SUFFIX}</environment>`);
  lines.push(`  <lighting>${LIGHTING_LINE}</lighting>`);
  lines.push(`  <style>${STYLE_FRAME_START}${o.palette}${STYLE_FRAME_END}</style>`);
  lines.push('</krea2_prompt>');
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// override 规范化（必填缺失 → 报错；pronoun 缺省 it）
// ---------------------------------------------------------------------------
const REQUIRED_OVERRIDE_FIELDS = [
  'name', 'subject_en', 'subject', 'details', 'pose_front', 'pose_side',
  'expression_front', 'expression_side', 'environment', 'palette',
];

function normalizeOverride(entry, file) {
  const o = { ...entry };
  o.name_cn = entry.name;
  const missing = REQUIRED_OVERRIDE_FIELDS.filter((f) => o[f] === undefined || o[f] === null || o[f] === '');
  if (missing.length) {
    throw new Error(`${file}: 「${entry.name}」缺少必填字段: ${missing.join(', ')}`);
  }
  o.pronoun = o.pronoun || DEFAULT_PRONOUN;
  if (!PRONOUNS.has(o.pronoun)) throw new Error(`${file}: 「${entry.name}」pronoun 只能是 it/he/she`);
  return o;
}

// ---------------------------------------------------------------------------
// GENERIC_PLACEHOLDER 通用版（6 标签齐全 + 最通用兜底环境：紧框石造内景+浮尘）
// ---------------------------------------------------------------------------
function referenceToSubjectEn(referenceName) {
  return String(referenceName || 'monster')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'monster';
}

function buildPlaceholder(troop, manaColors) {
  const accent = MANA_ACCENT[manaColors?.[0]] || 'ember red';
  const subjectEn = referenceToSubjectEn(troop.referenceName);
  return {
    name: troop.name,
    subject_en: subjectEn,
    generic: true,
    pronoun: 'it',
    subject: `${subjectEn} monster defined by its troop design, solid monstrous build with a broad readable outline, filling most of the frame`,
    details: `luminous eyes, a menacing fanged maw, rugged hide crossed by an ${accent} accent marking, tattered fantasy gear cinched tight`,
    pose_front: 'grounded forward-facing stance, weight settled, torso squared to the front',
    pose_side: 'grounded stance, weight settled, broad silhouette edge clearly readable',
    expression_front: 'menacing battle-ready scowl',
    expression_side: 'menacing battle-ready scowl',
    environment: 'weathered stone vault interior crowded with broken pillars and rubble, cracked flagstones underfoot',
    palette: `muted charcoal and slate greys with a single bright ${accent} accent`,
  };
}

// ---------------------------------------------------------------------------
// 氛围填充词软警戒表（WARNING，不阻断）：微粒/雾气类短语污染背景、干扰主体，
// 默认应从 environment/details/pose 清除；仅当它是角色概念本体（雾体幽灵、
// 梦境萨满的烟等）时允许保留，由撰写者按 WARN 自查。
// ---------------------------------------------------------------------------
const FILLER_WARN_PATTERNS = [
  [/\bdrifting\b/i, 'drifting（飘移）'],
  [/\bdrift settling\b/i, 'cinder/dust drift settling（飘尘沉降）'],
  [/\badrift\b/i, 'adrift（漂浮）'],
  [/\bfalling\b/i, 'falling（飘落）'],
  [/\b(?:fog|mist|haze)s?\b/i, 'fog/mist/haze（雾）'],
  [/\bfloating (?:particles|dust|ash|embers|spores|motes|grit)\b/i, 'floating particles（浮游颗粒）'],
  [/\bsmoke sheets?\b/i, 'smoke sheets（烟幕片）'],
  [/\b(?:smoke|steam|fumes|gas|ash|embers|dust) (?:drifting|rolling|crawling|billowing|threading)\b/i, 'drifting/rolling smoke·steam（漂移烟/汽）'],
  [/\bheat[- ](?:shimmer\w*|ripple\w*|veils?|haze|bent|dust)\b/i, 'heat shimmer/veils（热浪空气）'],
];

const FILLER_WARN_TAGS = ['environment', 'details', 'pose'];

function collectFillerWarnings(body) {
  const warnings = [];
  for (const tag of FILLER_WARN_TAGS) {
    const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    if (!m) continue;
    for (const [re, label] of FILLER_WARN_PATTERNS) {
      if (re.test(m[1])) {
        warnings.push(`${tag}: 疑似氛围填充词「${label}」——若为角色概念本体可保留，否则请改写为实体场景元素`);
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// 校验器
// ---------------------------------------------------------------------------
function validatePromptFile(text, troop, expectGeneric, viewKind) {
  const errors = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const body = lines.slice(2).join('\n');

  if (lines[0] !== `${troop.name}：`) errors.push(`头部第一行不是「${troop.name}：」`);
  const styleBlock = lines[1] + '\n' + lines[2];
  if (styleBlock !== STYLE_LINE) errors.push('头部风格行两行不符');
  const hasMarker = text.includes('GENERIC_PLACEHOLDER');
  if (hasMarker !== !!expectGeneric) {
    errors.push(expectGeneric ? '缺 GENERIC_PLACEHOLDER 标记' : '出现了不该有的 GENERIC_PLACEHOLDER 标记（override 已存在？）');
  }

  for (const tag of TAG_ORDER) {
    const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    if (!m || !m[1].trim()) errors.push(`缺少标签或为空: ${tag}`);
  }
  // 旧模板残留警戒
  for (const legacy of ['<general_tags>', '<character_1>', '<caption>']) {
    if (body.includes(legacy)) errors.push(`残留旧模板结构: ${legacy}`);
  }

  const lighting = body.match(/<lighting>([\s\S]*?)<\/lighting>/);
  if (lighting && lighting[1].trim() !== LIGHTING_LINE) {
    errors.push('lighting 标签与锁死锚不一致（必须逐字）');
  }
  if ((body.match(/key light/g) || []).length !== 1) {
    errors.push(`「key light」应只出现 1 次（当前 ${(body.match(/key light/g) || []).length}）`);
  }
  const style = body.match(/<style>([\s\S]*?)<\/style>/);
  if (style) {
    const s = style[1].trim();
    if (!s.startsWith(STYLE_FRAME_START) || !s.endsWith(STYLE_FRAME_END)) {
      errors.push('style 标签不符合锁死框架（前缀/后缀不符）');
    }
    const palette = s.slice(STYLE_FRAME_START.length, s.length - STYLE_FRAME_END.length).trim();
    if (!palette) errors.push('style 标签缺少 palette 短语');
  }
  const env = body.match(/<environment>([\s\S]*?)<\/environment>/);
  if (env && !env[1].trim().endsWith(ENV_SCAFFOLD_SUFFIX.trim())) {
    errors.push(`environment 未以脚手架收尾「${ENV_SCAFFOLD_SUFFIX.trim()}」`);
  }

  const strayVars = body.match(/\$([a-z0-9_]+)\$/g) || [];
  if (strayVars.length) errors.push(`出现未知占位符: ${[...new Set(strayVars)].join(', ')}`);

  if (viewKind === 'side') {
    const pose = body.match(/<pose>([\s\S]*?)<\/pose>/);
    if (!pose || !pose[1].includes(POSE_SIDE_SUFFIX.trim())) {
      errors.push('侧面版 pose 缺少 from side 视角措辞');
    }
  } else {
    const pose = body.match(/<pose>([\s\S]*?)<\/pose>/);
    if (!pose || !pose[1].includes(POSE_FRONT_SUFFIX.trim())) {
      errors.push('正面版 pose 缺少 facing the viewer 视角措辞');
    }
  }
  for (const k of KINGDOMS) {
    if (body.includes(k)) { errors.push(`泄漏王国名: ${k}`); break; }
  }
  const cjk = body.match(/[\u4e00-\u9fff\u3400-\u4dbf]/);
  if (cjk) errors.push(`正文（头部两行之后）混入中文字符: ${JSON.stringify(cjk[0])}`);

  return { errors, warnings: collectFillerWarnings(body) };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) printUsageAndExit();
  // 单值参数取最后一次出现，避免数组泄漏进路径/过滤逻辑
  for (const k of ['rarity', 'kingdom', 'name', 'limit', 'overrides', 'out', 'show']) {
    if (Array.isArray(args[k])) args[k] = args[k][args[k].length - 1];
  }

  const outDir = args.out ? (path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out)) : DEFAULT_OUT;
  const overridePaths = args.overrides ? csv(args.overrides) : [OVERRIDES_DIR];
  const overrides = fs.existsSync(overridePaths[0]) || args.overrides
    ? loadOverrides(overridePaths)
    : new Map();

  const { troops, totalManifest, totalUnique } = loadFilteredTroops(args);
  if (!troops.length) {
    console.error('没有匹配的兵种（检查 --kingdom/--rarity/--name/--limit）。');
    process.exit(1);
  }
  const manaMap = loadTroopManaColors();
  const renames = [];
  const filesIndex = [];
  const missing = [];
  let written = 0;
  let validationErrors = 0;
  let fillerWarnings = 0;

  for (const troop of troops) {
    const entry = overrides.get(troop.name);
    let o;
    if (entry) {
      o = normalizeOverride(entry.override, entry.file);
    } else {
      o = buildPlaceholder(troop, manaMap.get(troop.name));
      missing.push(troop.name);
    }
    o.name_cn = troop.name;

    if (args.show) {
      console.log(renderPrompt(o, 'front'));
      console.log('='.repeat(80));
      console.log(renderPrompt(o, 'side'));
      return;
    }

    const dir = path.join(outDir, sanitizeFilename(troop.kingdom, renames, `kingdom:${troop.kingdom}`));
    fs.mkdirSync(dir, { recursive: true });
    const base = sanitizeFilename(troop.name, renames, `troop:${troop.name}`);
    const record = {
      name: troop.name, kingdom: troop.kingdom, rarity: troop.rarity,
      role: troop.role, troopTypes: troop.troopTypes, spellName: troop.spellName,
      portrait: troop.portrait, manaColors: manaMap.get(troop.name) || [],
      generic: !!o.generic, dir: path.relative(ROOT, dir),
      front: `${base}-正面`, side: `${base}-侧面`, errors: [],
    };
    for (const [viewKind, suffix] of [['front', '-正面'], ['side', '-侧面']]) {
      const text = renderPrompt(o, viewKind);
      const file = path.join(dir, base + suffix);
      fs.writeFileSync(file, text, 'utf8');
      written++;
      const outcome = validatePromptFile(text, troop, o.generic, viewKind);
      if (outcome.errors.length) record.errors.push(...outcome.errors.map((e) => `${suffix}: ${e}`));
      if (outcome.warnings.length) {
        record.warnings = (record.warnings || []).concat(outcome.warnings.map((w) => `${suffix}: ${w}`));
        fillerWarnings += outcome.warnings.length;
      }
    }
    if (record.errors.length) validationErrors++;
    filesIndex.push(record);
  }

  // 对账清单
  const report = {
    generatedAt: new Date().toISOString(),
    options: {
      rarity: args.rarity || null, kingdom: args.kingdom || null,
      name: args.name || null, limit: args.limit || null,
      overrides: overridePaths, out: path.relative(ROOT, outDir),
    },
    totals: {
      manifestEntries: totalManifest, uniqueTroops: totalUnique,
      selected: troops.length, filesWritten: written,
      missingOverrides: missing.length, filesWithValidationErrors: validationErrors,
      fillerWarnings,
    },
    sanitizedRenames: renames,
    missingOverrides: missing,
    files: filesIndex,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, '_build-report.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(outDir, '_missing-overrides.txt'),
    missing.map((n) => n).join('\n') + (missing.length ? '\n' : ''),
    'utf8',
  );

  console.log(`manifest ${totalManifest} 条 → 唯一名 ${totalUnique} 个；本次选中 ${troops.length} 个兵种，写入 ${written} 个文件。`);
  console.log(`GENERIC_PLACEHOLDER（缺 override）: ${missing.length} 个${missing.length ? ' → 见 _missing-overrides.txt' : ''}`);
  console.log(`校验错误文件数: ${validationErrors}${validationErrors ? ' → 详见 _build-report.json 的 files[].errors' : ''}`);
  console.log(`氛围填充词 WARNING: ${fillerWarnings}${fillerWarnings ? ' → 详见 _build-report.json 的 files[].warnings' : ''}`);
  if (renames.length) console.log(`文件名净化映射 ${renames.length} 处 → 见 _build-report.json 的 sanitizedRenames`);
  if (validationErrors) process.exit(1);
}

main();
