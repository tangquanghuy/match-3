#!/usr/bin/env node
/** Fetch a fresh gowhead snapshot and compare it to the actual runtime troop registry.
 * node scripts/audit-live-gowhead-troops.mjs [--offline]
 * --offline ONLY reads the snapshot produced by this script; never reads legacy dumps.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data/raw/gowhead-live-troops');
const OUT = path.join(ROOT, 'artifacts/gowhead-troop-audit');
const BASE_API = 'https://gowhead.com/api/entities';
const API = `${BASE_API}?type=troop`;
const SPELL_API = `${BASE_API}?type=spell`;
const COLORS = { ColorRed: 'Red', ColorBlue: 'Blue', ColorGreen: 'Green', ColorYellow: 'Yellow', ColorPurple: 'Purple', ColorBrown: 'Brown' };
const norm = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
const formatNorm = (value) => norm(value).normalize('NFKC').replace(/[\s\uFF0C,\u3002\uFF01!\uFF1F?\uFF1B;\u3001]/gu, '').replace(/[\u2013\u2014]/gu, '-');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const index = (records, label) => {
  const map = new Map();
  for (const record of records) {
    const id = Number(record.id ?? record.Id);
    if (!Number.isInteger(id) || map.has(id)) throw new Error(`${label}: missing/duplicate troop ID ${id}`);
    map.set(id, record);
  }
  return map;
};

export async function fetchPage(language, page, entity = 'troop') {
  const url = `${BASE_API}?type=${entity}&lang=${language}&page=${page}&limit=100`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.data) || !Number.isInteger(body.total) || !Number.isInteger(body.limit) || body.limit < 1 || body.page !== page) {
        throw new Error('unexpected response shape');
      }
      return body;
    } catch (error) {
      if (attempt === 3) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
}

async function fetchLanguage(language, entity = 'troop') {
  const first = await fetchPage(language, 1, entity);
  const pages = Math.ceil(first.total / first.limit);
  const results = new Array(pages);
  results[0] = first;
  for (let start = 2; start <= pages; start += 5) {
    const batch = await Promise.all(Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => fetchPage(language, start + i, entity)));
    batch.forEach((result, i) => { results[start - 1 + i] = result; });
  }
  if (results.some((result) => result.total !== first.total || result.limit !== first.limit)) throw new Error(`${language}: pagination changed during download; rerun`);
  const records = results.flatMap((result) => result.data);
  if (records.length !== first.total) throw new Error(`${language} ${entity}: expected ${first.total}, received ${records.length}`);
  index(records, `gowhead ${language} ${entity}`);
  return { source: entity === 'spell' ? SPELL_API : API, fetchedAt: new Date().toISOString(), language, total: first.total, [entity === 'spell' ? 'spells' : 'troops']: records };
}

export function compareTroops(installed, english, chinese, displayNames = {}) {
  const byEn = index(english, 'live English');
  const byZh = index(chinese, 'live Chinese');
  index(installed, 'installed');
  const rows = [];
  const diffs = [];
  const translations = [];
  const checks = {};
  const zhFallsBackToEnglish = english.every((t) => { const z = byZh.get(t.id); return z?.name_localized === t.name_localized && z?.stats?.spell?.name === t.stats?.spell?.name && z?.stats?.spell?.desc === t.stats?.spell?.desc && same(z?.stats?.traits?.map((x) => [x.name, x.description]), t.stats?.traits?.map((x) => [x.name, x.description])); });
  const check = (row, field, local, source, en = null, type = 'data') => {
    if (source === undefined || source === null) return; // No source value, not an asserted discrepancy.
    checks[field] = (checks[field] ?? 0) + 1;
    if (same(local, source)) return;
    const difference = { id: row.id, referenceName: row.referenceName, field, type, local, gowheadZh: source, gowheadEn: en ?? (type === 'data' ? source : null) };
    row.differences.push(difference);
    diffs.push(difference);
  };
  const text = (row, field, local, zh, en) => {
    if (en == null) return;
    const pair = { id: row.id, referenceName: row.referenceName, field, local: local ?? '', gowheadEn: en, gowheadZh: zh ?? null };
    row.translations.push(pair);
    translations.push(pair);
    if (zh && norm(zh) === norm(en) && /[A-Za-z]{3}/u.test(zh)) row.untranslatedSourceFields.push(field);
    // Only compare localized strings when the live zh endpoint actually has a translation.
    if (zh && norm(zh) !== norm(en)) {
      const category = field === 'kingdom' || field.endsWith('.display') ? 'label_review' : formatNorm(local) === formatNorm(zh) ? 'format_only' : 'content_review';
      check(row, field, norm(local), norm(zh), en, category);
    }
    if (norm(local) === norm(en) && /[A-Za-z]{4}/u.test(local ?? '')) row.reviewFlags.push(`${field}: still English`);
    // Arabic digits only: heuristic for human review, not a semantic verdict.
    const numbers = (value) => [...String(value ?? '').matchAll(/\d+(?:\.\d+)?/gu)].map((match) => match[0]).sort();
    if (field.endsWith('description') && !same(numbers(local), numbers(zh && norm(zh) !== norm(en) ? zh : en))) row.reviewFlags.push(`${field}: numeric tokens differ; inspect English/Chinese (Chinese numerals or localization may be intentional)`);
  };
  for (const local of [...installed].sort((a, b) => a.id - b.id)) {
    const en = byEn.get(local.id);
    const zh = byZh.get(local.id);
    const row = { id: local.id, referenceName: local.referenceName, localName: local.name, gowheadEnName: en?.name_localized ?? null, gowheadZhName: zh?.name_localized ?? null, status: !en ? 'missing_en' : !zh ? 'missing_zh' : 'matched', differences: [], translations: [], reviewFlags: [], untranslatedSourceFields: [] };
    rows.push(row);
    if (!en || !zh) continue;
    check(row, 'referenceName', local.referenceName, en.ReferenceName, en.ReferenceName);
    text(row, 'name', local.name, zh.name_localized, en.name_localized);
    text(row, 'kingdom', local.kingdom, zh.stats?.kingdom_name, en.stats?.kingdom_name);
    check(row, 'rarityIdx', local.rarityIdx, zh.RarityIdx, en.RarityIdx);
    check(row, 'kingdomId', local.kingdomId, en.KingdomId, en.KingdomId); // Factions: English preserves native ID.
    check(row, 'troopTypes', local.troopTypes, [en.TroopType, en.TroopType2].filter(Boolean));
    (zh.stats?.types ?? []).forEach((type, i) => text(row, `troopTypes.${i}.display`, displayNames.raceNames?.[local.troopTypes?.[i]] ?? local.troopTypes?.[i], type.name, en.stats?.types?.[i]?.name));
    check(row, 'role', local.role, en._TroopRole_parsed?.[0] ?? en.stats?.role?.code);
    text(row, 'role.display', displayNames.roleNames?.[local.role] ?? local.role, zh.stats?.role?.name, en.stats?.role?.name);
    for (const key of ['attack', 'armor', 'health', 'magic']) check(row, key, local[key], en[key[0].toUpperCase() + key.slice(1)]);
    for (const key of ['attack', 'armor', 'health', 'magic']) {
      const rawKey = { attack: 'Attack_Base', armor: 'Armor_Base', health: 'Health_Base', magic: 'SpellPower_Base' }[key];
      check(row, `base.${key}`, local.base?.[key], zh.raw_data?.[rawKey], null);
    }
    check(row, 'manaCost', local.manaCost, en.ManaCost);
    check(row, 'manaColors', local.manaColors, (en.mana_colors ?? en._ManaColors_parsed ?? []).map((c) => COLORS[c] ?? c));
    check(row, 'spell.id', local.spell?.id, en.SpellId);
    text(row, 'spell.name', local.spell?.name, zh.stats?.spell?.name, en.stats?.spell?.name);
    text(row, 'spell.description', local.spell?.description, zh.stats?.spell?.desc, en.stats?.spell?.desc);
    check(row, 'portrait', local.portrait, en.FileBase);
    const localTraits = local.traits ?? [];
    const enTraits = en.stats?.traits ?? [];
    const zhTraits = zh.stats?.traits ?? [];
    check(row, 'traits.length', localTraits.length, enTraits.length);
    for (let i = 0; i < Math.max(localTraits.length, enTraits.length, zhTraits.length); i++) {
      check(row, `traits.${i}.code`, localTraits[i]?.code, enTraits[i]?.code);
      text(row, `traits.${i}.name`, localTraits[i]?.name, zhTraits[i]?.name, enTraits[i]?.name);
      text(row, `traits.${i}.description`, localTraits[i]?.description, zhTraits[i]?.description, enTraits[i]?.description);
    }

  }
  const uninstalled = [...byEn.values()].filter((source) => !installed.some((t) => t.id === source.id)).map((source) => ({ id: source.id, name: source.name_localized, referenceName: source.ReferenceName }));
  const summary = { untranslatedSourceFields: rows.reduce((count, row) => count + row.untranslatedSourceFields.length, 0), contentReviews: diffs.filter((d) => d.type === 'content_review').length, formatOnly: diffs.filter((d) => d.type === 'format_only').length, displayLabelReviews: diffs.filter((d) => d.type === 'label_review').length, zhFallsBackToEnglish, translationPairs: translations.length, troopsWithReviewFlags: rows.filter((r) => r.reviewFlags.length).length, installed: installed.length, liveEnglish: english.length, liveChinese: chinese.length, matched: rows.filter((r) => r.status === 'matched').length, missingEnglish: rows.filter((r) => r.status === 'missing_en').length, missingChinese: rows.filter((r) => r.status === 'missing_zh').length, uninstalled: uninstalled.length, troopsWithDifferences: rows.filter((r) => r.differences.length).length, fieldDifferences: diffs.length, differencesByField: Object.fromEntries([...new Set(diffs.map((d) => d.field))].sort().map((field) => [field, diffs.filter((d) => d.field === field).length])), checksByField: checks };
  return { summary, rows, fieldDifferences: diffs, translationPairs: translations, uninstalled };
}

async function loadDisplayNames() {
  // Bundle the REAL runtime UI dictionaries; do not mirror a second, drift-prone mapping.
  const bundle = await build({ stdin: { contents: `
    import { ROLE_NAMES as roleNames } from './src/meta/data/roles';
    import { RACE_NAMES as raceNames } from './src/meta/data/races';
    import {registerSkillLibrary} from './src/engine/skills/library';
    const lib = new Map(); registerSkillLibrary(lib);
    export default { roleNames, raceNames, skills: Object.fromEntries(lib) };
  `, resolveDir: ROOT, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.png': 'empty', '.webp': 'empty' } });
  return (await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
}

// Chinese chance-boost qualifiers are compared as meaning-bearing clauses, not as string edits.
const CHANCE_COLORS = ['红色', '绿色', '蓝色', '黄色', '紫色', '棕色'];
const EN_CHANCE_COLORS = ['Red', 'Green', 'Blue', 'Yellow', 'Purple', 'Brown'];
function chanceBoostColors(description) {
  const sentences = String(description ?? '').split(/[。！？!?]/u);
  const colors = new Set();
  for (const sentence of sentences) {
    if (!sentence.includes('额外回合') || !/(?:几率|概率)/u.test(sentence)) continue;
    if (!/(?:增强|加成|提高|提升|每有|每多)/u.test(sentence)) continue;
    for (const color of CHANCE_COLORS) if (sentence.includes(`${color}宝石`)) colors.add(color);
  }
  return [...colors];
}
export function enrichSemanticFindings(rows, installed, enTroops, zhTroops, liveSpells, skills) {
  const localById = index(installed, 'runtime semantic input');
  const enById = index(enTroops, 'live English semantic input');
  const zhById = index(zhTroops, 'live Chinese semantic input');
  const spellsById = index(liveSpells, 'live native spell input');
  const findings = [];
  for (const row of rows) {
    row.semanticFindings = [];
    const local = localById.get(row.id);
    const en = enById.get(row.id);
    const zh = zhById.get(row.id);
    if (!en || !zh) continue;
    const sourceColors = chanceBoostColors(zh.stats?.spell?.desc);
    const localColors = chanceBoostColors(local.spell?.description);
    for (const color of sourceColors.filter((c) => !localColors.includes(c))) {
      const enColor = EN_CHANCE_COLORS[CHANCE_COLORS.indexOf(color)];
      const english = en.stats?.spell?.desc ?? '';
      const native = spellsById.get(en.SpellId);
      let steps = [];
      try { steps = JSON.parse(native?.RawData ?? '{}').SpellSteps ?? []; } catch { /* report unknown provenance */ }
      const countStep = steps.some((step) => step.Type === 'CountGems' && (step.Color1 === enColor || step.Color2 === enColor));
      const englishClause = english.split(/[.!?]/u).some((sentence) => /extra turn/i.test(sentence) && new RegExp(`boosted by ${enColor} Gems`, 'i').test(sentence));
      const proto = skills?.[local.spell?.id];
      const runtimeExtraTurns = proto?.segments?.filter((segment) => segment.kind === 'extraTurn') ?? [];
      const conflict = !englishClause && !countStep;
      const finding = {
        id: row.id, referenceName: row.referenceName, field: 'spell.description', color,
        kind: conflict ? 'chinese_source_vs_english_native_conflict' : 'local_omits_chinese_chance_boost',
        sourceChinese: zh.stats?.spell?.desc, localChinese: local.spell?.description,
        sourceEnglish: english, nativeSpellId: en.SpellId,
        nativeCountGemsForColor: countStep, englishMentionsChanceBoost: englishClause,
        nativeRelevantSteps: steps.filter((step) => ['CountGems', 'ExtraTurnConditional', 'GenerateHalfMana'].includes(step.Type)),
        runtimeExtraTurnSegments: runtimeExtraTurns,
        judgment: conflict ? 'Chinese source claims a boost; English description and native SpellSteps do not. Source conflict, not a verified runtime bug.' : 'Chinese source describes a color-dependent chance; local Chinese description omits it. Review native steps and runtime behavior.',
      };
      row.semanticFindings.push(finding);
      findings.push(finding);
    }
  }
  return findings;
}
function csvCell(v) { return `"${String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replaceAll('"', '""')}"`; }
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');

async function main() {
  const offline = process.argv.includes('--offline');
  await fs.mkdir(RAW, { recursive: true });
  await fs.mkdir(OUT, { recursive: true });
  const snapshots = {};
  if (offline) {
    for (const language of ['en', 'zh']) snapshots[language] = JSON.parse(await fs.readFile(path.join(RAW, `troops.${language}.json`), 'utf8'));
  } else {
    // Write each complete language atomically; never mistake an incomplete download for a snapshot.
    for (const language of ['en', 'zh']) {
      console.log(`Downloading live gowhead ${language} ...`);
      const snapshot = await fetchLanguage(language);
      const target = path.join(RAW, `troops.${language}.json`);
      await writeJson(`${target}.tmp`, snapshot);
      await fs.rename(`${target}.tmp`, target);
      snapshots[language] = snapshot;
      console.log(`  ${snapshot.total} troops (${snapshot.fetchedAt})`);
    }
  }
  for (const language of ['en', 'zh']) {
    const s = snapshots[language];
    if (s.source !== API || s.language !== language || s.total !== s.troops?.length) throw new Error(`${language} is not a complete live snapshot from this tool`);
  }
  let liveSpells;
  const spellFile = path.join(RAW, 'spells.en.json');
  if (offline) liveSpells = JSON.parse(await fs.readFile(spellFile, 'utf8'));
  else {
    console.log('Downloading live gowhead en spells ...');
    liveSpells = await fetchLanguage('en', 'spell');
    await writeJson(`${spellFile}.tmp`, liveSpells);
    await fs.rename(`${spellFile}.tmp`, spellFile);
    console.log(`  ${liveSpells.total} spells (${liveSpells.fetchedAt})`);
  }
  if (liveSpells.source !== SPELL_API || liveSpells.total !== liveSpells.spells?.length) throw new Error('live spell snapshot incomplete or outdated format');
  const runtimeFile = path.join(ROOT, 'src/data/troops.json');
  const installed = JSON.parse(await fs.readFile(runtimeFile, 'utf8'));
  const display = await loadDisplayNames();
  const { summary, rows, fieldDifferences, translationPairs, uninstalled } = compareTroops(installed, snapshots.en.troops, snapshots.zh.troops, display);
  const semanticFindings = enrichSemanticFindings(rows, installed, snapshots.en.troops, snapshots.zh.troops, liveSpells.spells, display.skills);
  summary.semanticFindings = semanticFindings.length;
  summary.chineseEnglishNativeConflicts = semanticFindings.filter((item) => item.kind === 'chinese_source_vs_english_native_conflict').length;
  const report = { source: API, spellSource: { path: 'data/raw/gowhead-live-troops/spells.en.json', fetchedAt: liveSpells.fetchedAt }, runtimeFile: 'src/data/troops.json', snapshots: Object.fromEntries(['en', 'zh'].map((lang) => [lang, { path: `data/raw/gowhead-live-troops/troops.${lang}.json`, fetchedAt: snapshots[lang].fetchedAt }])), generatedAt: new Date().toISOString(), summary, rows, semanticFindings, uninstalled };
  await writeJson(path.join(OUT, 'report.json'), report);
  const csv = [['id', 'referenceName', 'field', 'type', 'local', 'gowheadZh', 'gowheadEn'].map(csvCell).join(',')];
  for (const diff of fieldDifferences) csv.push(['id', 'referenceName', 'field', 'type', 'local', 'gowheadZh', 'gowheadEn'].map((key) => csvCell(diff[key])).join(','));
  await fs.writeFile(path.join(OUT, 'differences.csv'), '\uFEFF' + csv.join('\n') + '\n', 'utf8');
  for (const [name, category] of [['content-review', 'content_review'], ['labels-review', 'label_review'], ['format-only', 'format_only'], ['data-differences', 'data']]) {
    const lines = [csv[0], ...fieldDifferences.filter((d) => d.type === category).map((d) => ['id', 'referenceName', 'field', 'type', 'local', 'gowheadZh', 'gowheadEn'].map((key) => csvCell(d[key])).join(','))];
    await fs.writeFile(path.join(OUT, `${name}.csv`), '\uFEFF' + lines.join('\n') + '\n', 'utf8');
  }
  await writeJson(path.join(OUT, 'semantic-findings.json'), { spellSource: liveSpells.fetchedAt, findings: semanticFindings });  const rowById = new Map(rows.map((row) => [row.id, row]));
  const translationCsv = [['id', 'referenceName', 'field', 'local', 'gowheadEn', 'gowheadZh', 'reviewFlags'].map(csvCell).join(',')];
  for (const pair of translationPairs) {
    const flags = rowById.get(pair.id)?.reviewFlags.filter((flag) => flag.startsWith(`${pair.field}:`)) ?? [];
    translationCsv.push(['id', 'referenceName', 'field', 'local', 'gowheadEn', 'gowheadZh'].map((key) => csvCell(pair[key])).concat(csvCell(flags.join('; '))).join(','));
  }
  await fs.writeFile(path.join(OUT, 'translations-to-review.csv'), '\uFEFF' + translationCsv.join('\n') + '\n', 'utf8');
  const md = [
    '# gowhead 本次中文数据 vs 项目实装部队',
    '',
    `抓取时间（UTC）：中文 ${snapshots.zh.fetchedAt}；英文 ${snapshots.en.fetchedAt}；法术原生步骤 ${liveSpells.fetchedAt}。`,
    '项目实装取自 `src/data/troops.json`，职责/种族中文展示词典取自运行时代码 `src/meta/data/{roles,races}.ts`；旧快照不参与。',
    'gowhead 使用 `lang=zh` 获取原版中文；`language=zh` 会被忽略并回退英文。',
    '',
    `- 实装 ${summary.installed} 条，本次 gowhead 中英各 ${summary.liveEnglish} 条，按部队 ID 匹配 ${summary.matched} 条；尚未实装 ${summary.uninstalled} 条。`,
    `- 实质中文文本差异（待审，不等于错误）${summary.contentReviews} 项；格式差异 ${summary.formatOnly} 项；中文源未翻译的字段 ${summary.untranslatedSourceFields} 项。`,
    `- 种族/职责展示译名、王国标签差异 ${summary.displayLabelReviews} 项；这类译名往往是有意采用社区术语，英文 code 对照结果见逐部队数据。`,
    `- 数值/结构差异 ${fieldDifferences.filter((d) => d.type === 'data').length} 项；额外回合颜色加成遗漏线索 ${summary.semanticFindings} 项（其中中文与英文/原生步骤存在冲突 ${summary.chineseEnglishNativeConflicts} 项）。`,
    '',
    '## 名称差异', '',
    '| ID | 英文键 | 项目名 | gowhead 中文名 |', '|---:|---|---|---|',
    ...fieldDifferences.filter((d) => d.field === 'name').map((d) => `| ${d.id} | ${d.referenceName} | ${d.local} | ${d.gowheadZh} |`),
    '',
    '## 数值差异', '',
    '| ID | 英文键 | 字段 | 项目值 | gowhead 值 |', '|---:|---|---|---:|---:|',
    ...fieldDifferences.filter((d) => d.type === 'data').map((d) => `| ${d.id} | ${d.referenceName} | ${d.field} | ${d.local} | ${d.gowheadZh} |`),
    '',
    '## 蜜蜂女王：翻译文本与原生行为冲突', '',
    '部队 6863 的 gowhead 中文称「几率因棕色宝石数而增强」，项目中文没写；这是明确的中文数据差异。',
    '但本次英文原文没有该从句，SpellId 8282 的原生步骤只有 40% 的 ExtraTurnConditional 与 40% 的 GenerateHalfMana，没有 CountGems；运行时 `extraTurn` 也只有固定 `chance: 0.4`。故此条标记为「中文数据 vs 英文/原生步骤冲突」，暂不据机翻中文改变战斗概率。',
    '',
    '## 结果文件', '',
    '- `report.json`：1800 个部队逐一比对，含每项原版中文、本地中文、英文原文、差异类型与语义线索。',
    '- `content-review.csv`：名称/技能/特质等实质文字不同的条目；`labels-review.csv`：职责、种族、王国显示译名不同；`format-only.csv`：格式差异。',
    '- `data-differences.csv`：数值与结构差异；`semantic-findings.json`：中文漏写概率加成等效果条件的证据及原生步骤；`differences.csv` 包含全部类别。',
    '- `translations-to-review.csv`：所有实装部队的中文逐字段并排，含最新 gowhead 中文和英文，方便逐个筛选。',
    '- 文本不同不自动等于译错；中文与原生步骤冲突需独立判定，特质和技能的所有行为仍需结合对应代码逐项验收。',
    '',
  ];
  await fs.writeFile(path.join(OUT, 'README.md'), md.join('\n'), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log('Wrote artifacts/gowhead-troop-audit/{README.md,report.json,differences.csv,translations-to-review.csv}');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
