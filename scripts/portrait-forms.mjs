/** Offline portrait form annotations and four-dimension lookup; no battle mutation. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const labelsFile = 'data/portrait-forms.json';
const portraitDir = 'game-assets/public/static/portraits';
export const FORMS = ['人形', '野兽', '类人', '怪物', '异形体'];
export const RANKS = ['杂兵', '精锐', '首领', '领主', '传奇'];
export const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'];
const colorNames = ['红', '蓝', '绿', '黄', '紫', '棕'];
const roleSource = fs.readFileSync(path.join(root, 'src/meta/data/roles.ts'), 'utf8');
// Consume the project's existing single-source role names instead of maintaining a second table.
const roleNamesBlock = roleSource.match(/export const ROLE_NAMES:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1];
if (!roleNamesBlock) throw new Error('Project ROLE_NAMES definition not found');
export const ROLES = Object.fromEntries([...roleNamesBlock.matchAll(/^  (\w+): '([^']+)',/gm)]
  .map(([, key, name]) => [key, name]));
const rankByIndex = ['杂兵', '杂兵', '精锐', '首领', '领主', '传奇'];
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const sortedColors = values => COLORS.filter(c => values.includes(c));

export function catalog() {
  const annotations = read(labelsFile);
  const byPortrait = new Map(annotations.entries.map(x => [x.portrait, x]));
  return read('src/data/troops.json').map(t => {
    const a = byPortrait.get(t.portrait);
    if (!a) throw new Error(`Missing form annotation: ${t.portrait}`);
    return { assetId: t.portrait, troopId: t.id, manaColors: sortedColors(t.manaColors),
      rank: rankByIndex[t.rarityIdx], form: a.form, role: t.role,
      portraitUrl: `/static/portraits/${t.portrait}.webp`,
      review: a.review, contentHash: a.contentHash };
  });
}

export function lookup(query, entries = catalog()) {
  if (!query || !Array.isArray(query.manaColors)) throw new Error('manaColors 必须是六色数组');
  if (!FORMS.includes(query.form)) throw new Error('form 必须为：' + FORMS.join('、'));
  if (!RANKS.includes(query.rank)) throw new Error('rank 必须为：' + RANKS.join('、'));
  const role = Object.keys(ROLES).find(k => k === query.role || ROLES[k] === query.role);
  if (!role) throw new Error('role 必须为：' + Object.values(ROLES).join('、'));
  const colors = query.manaColors.map(c => COLORS.includes(c) ? c : COLORS[colorNames.indexOf(c)]);
  if (!colors.length || colors.some(c => !c) || new Set(colors).size !== colors.length)
    throw new Error('manaColors 必须是无重复的六色数组');
  const colorKey = sortedColors(colors).join(',');
  const matches = entries.filter(x => x.form === query.form && x.rank === query.rank
    && x.role === role && x.manaColors.join(',') === colorKey);
  // Dedup only after matching: shared art may have different source troop metadata.
  const unique = [...new Map(matches.map(x => [x.contentHash, x])).values()];
  return { query: { manaColors: sortedColors(colors), rank: query.rank, form: query.form, role },
    count: unique.length,
    candidates: unique.map(({ contentHash, ...x }) => x),
    status: unique.length ? 'matched' : 'no_exact_match' };
}

function stats(entries) {
  const counts = key => Object.fromEntries([...new Set(entries.map(x => x[key]))]
    .map(k => [k, entries.filter(x => x[key] === k).length]));
  const pools = new Set(entries.map(x => [x.manaColors.join('+'), x.rank, x.form, x.role].join('|')));
  const colorSets = new Set(entries.map(x => x.manaColors.join('+')));
  return { records: entries.length, uniqueImages: new Set(entries.map(x => x.contentHash)).size,
    forms: counts('form'), ranks: counts('rank'), roles: counts('role'), review: counts('review'),
    exactPools: pools.size, sourceColorSets: colorSets.size,
    possiblePoolsWithSourceColorSets: colorSets.size * RANKS.length * FORMS.length * Object.keys(ROLES).length };
}

export function availability(entries = catalog()) {
  const pools = new Map();
  for (const entry of entries) {
    if (!FORMS.includes(entry.form)) continue;
    const key = [entry.manaColors.join(','), entry.rank, entry.form, entry.role].join('|');
    if (!pools.has(key)) pools.set(key, { manaColors: entry.manaColors,
      rank: entry.rank, form: entry.form, role: entry.role, hashes: new Set() });
    pools.get(key).hashes.add(entry.contentHash);
  }
  return [...pools.values()].map(({ hashes, ...pool }) => ({ ...pool, count: hashes.size }));
}

function validate() {
  const annotations = read(labelsFile);
  const troops = read('src/data/troops.json');
  const portraits = new Set(troops.map(t => t.portrait));
  const seen = new Set();
  const shapesByHash = new Map();
  for (const a of annotations.entries) {
    if (seen.has(a.portrait) || !portraits.has(a.portrait)) throw new Error(`Invalid/duplicate portrait: ${a.portrait}`);
    seen.add(a.portrait);
    if (!FORMS.includes(a.form)) throw new Error(`Invalid form: ${a.portrait}`);
    if (!['thumbnail-reviewed', 'image-reviewed'].includes(a.review)) throw new Error(`Invalid review: ${a.portrait}`);
    if (!a.evidence) throw new Error(`Missing evidence: ${a.portrait}`);
    const actual = hash(fs.readFileSync(path.join(root, portraitDir, a.portrait + '.webp')));
    if (actual !== a.contentHash) throw new Error(`Image changed; relabel required: ${a.portrait}`);
    if (shapesByHash.has(actual) && shapesByHash.get(actual) !== a.form) throw new Error(`Shared image form conflict: ${a.portrait}`);
    shapesByHash.set(actual, a.form);
  }
  if (seen.size !== portraits.size) throw new Error('Incomplete portrait coverage');
  for (const t of troops) {
    if (!ROLES[t.role] || !rankByIndex[t.rarityIdx] || !t.manaColors.length
      || t.manaColors.some(c => !COLORS.includes(c))) throw new Error(`Unknown metadata: ${t.id}`);
  }
  console.log(JSON.stringify({ valid: true, ...stats(catalog()) }, null, 2));
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'check') return validate();
  if (cmd === 'stats') return console.log(JSON.stringify(stats(catalog()), null, 2));
  if (cmd === 'availability') return console.log(JSON.stringify(availability(), null, 2));
  if (cmd === 'query') {
    const [form, rank, role, colors] = args;
    return console.log(JSON.stringify(lookup({ form, rank, role, manaColors: (colors ?? '').split(',') }), null, 2));
  }
  throw new Error('Usage: node scripts/portrait-forms.mjs check|stats|availability|query <形态> <稀有度> <职责> <颜色,颜色>');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
