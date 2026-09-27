/**
 * Skill change log (append-only): tasks/active/gow-skill-shards/CHANGES.jsonl -> CHANGES.md
 *   node scripts/gow-changelog.mjs add --by sa-L5 --issue L5-006 --files "src/a.ts,src/b.ts" \
 *        --spells 7338,7444 --keys weapon:1142,weapon:1147 --kind primitive|assembler|data|test \
 *        --before "..." --after "..." [--affects "all CauseBarrier prototypes"]
 *   node scripts/gow-changelog.mjs render        # rebuild CHANGES.md (by spell id and by issue)
 *   node scripts/gow-changelog.mjs backfill      # one-off: import fixed entries from lane-* /issues.json
 * Entity keys are resolved to spell ids and names from the ledger when --spells is omitted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'tasks/active/gow-skill-shards');
const logPath = path.join(base, 'CHANGES.jsonl');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const list = s => (s ?? '').split(',').map(x => x.trim()).filter(Boolean);
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/gow-skill-audit/ledger.json'), 'utf8'));
const rows = new Map(ledger.rows.map(r => [r.key, r]));
const load = () => fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const append = e => fs.appendFileSync(logPath, JSON.stringify(e) + '\n');
function entry(o) {
  const keys = o.keys ?? [];
  const spells = o.spells?.length ? o.spells : [...new Set(keys.map(k => rows.get(k)?.spellId).filter(Boolean).map(String))];
  return { at: o.at ?? new Date().toISOString(), by: o.by, issue: o.issue, kind: o.kind ?? null, files: o.files ?? [], spells, keys,
    names: keys.map(k => `${k} ${rows.get(k)?.referenceName ?? ''}`.trim()), before: o.before ?? '', after: o.after ?? '', affects: o.affects ?? '' };
}
function render() {
  const all = load();
  const bySpell = new Map();
  for (const e of all) for (const s of e.spells.length ? e.spells : ['(shared)']) { const l = bySpell.get(s) ?? []; l.push(e); bySpell.set(s, l); }
  const esc = s => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const md = ['# GoW 技能改动留档', '', `自动生成（\`node scripts/gow-changelog.mjs render\`），源数据 [CHANGES.jsonl](CHANGES.jsonl)，共 ${all.length} 条改动，涉及 ${bySpell.size} 个技能 ID。`, '',
    '## 按时间', '', '| 时间 | 执行者 | 问题 | 类型 | 技能 ID | 实体 | 文件 | 改前 → 改后 | 影响面 |', '|---|---|---|---|---|---|---|---|---|',
    ...all.map(e => `| ${e.at.slice(0, 16)} | ${e.by} | ${esc(e.issue)} | ${e.kind ?? ''} | ${e.spells.join(', ')} | ${esc(e.names.join('；'))} | ${e.files.map(f => '`' + f + '`').join('<br>')} | ${esc(e.before)} → ${esc(e.after)} | ${esc(e.affects)} |`),
    '', '## 按技能 ID', '', '| 技能 ID | 改动次数 | 问题 |', '|---|---:|---|',
    ...[...bySpell].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([s, l]) => `| ${s} | ${l.length} | ${l.map(e => e.issue).join('、')} |`), ''];
  fs.writeFileSync(path.join(base, 'CHANGES.md'), md.join('\n'));
  console.log(`CHANGES.md: ${all.length} entries, ${bySpell.size} spell ids`);
}
if (args[0] === 'add') {
  if (!opt('by') || !opt('issue') || !opt('files')) throw new Error('add needs --by --issue --files');
  append(entry({ by: opt('by'), issue: opt('issue'), kind: opt('kind'), files: list(opt('files')), spells: list(opt('spells')), keys: list(opt('keys')),
    before: opt('before'), after: opt('after'), affects: opt('affects') }));
  render();
} else if (args[0] === 'render') render();
else if (args[0] === 'backfill') {
  const have = new Set(load().map(e => e.issue));
  let n = 0;
  for (const d of fs.readdirSync(base).filter(d => d.startsWith('lane-'))) {
    const p = path.join(base, d, 'issues.json'); if (!fs.existsSync(p)) continue;
    for (const i of JSON.parse(fs.readFileSync(p, 'utf8'))) {
      if (!i.fixedBy || have.has(i.id)) continue;
      const note = i.fixNote ?? i.fix ?? '';
      const files = [...new Set((note.match(/[\w./-]+\.(?:ts|json|mjs|md)/g) ?? []).map(f => f.includes('/') ? f : f.startsWith('batch') ? `src/engine/skills/curated/${f}` : f))];
      const spells = [...new Set([...(note.match(/\b\d{4,5}\b/g) ?? [])])];
      append(entry({ at: new Date(i.fixedAt).toISOString(), by: i.fixedBy, issue: i.id, kind: i.layer ?? i.suspectedLayer ?? null, files, spells,
        keys: i.keys ?? (i.key ? [i.key] : []), before: i.actual ?? '', after: note, affects: i.affects ? [].concat(i.affects).join(', ') : (i.layerNote ?? '') }));
      n++;
    }
  }
  console.log(`backfilled ${n}`); render();
} else { console.error('add | render | backfill'); process.exitCode = 1; }
