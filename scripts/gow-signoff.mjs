/**
 * Compact lane signoff (one JSON line per entity) -> tasks/active/gow-skill-shards/lane-<L>/signoffs.jsonl
 *
 *   node scripts/gow-signoff.mjs show   --keys troop:6001,weapon:1013            # what to compare: English, native steps, prototype
 *   node scripts/gow-signoff.mjs accept --lane L4a --by sa-L4a --test tests/unit/gowLaneL4aB01.test.ts --keys k1,k2 [--note "..."]
 *        [--waive "troop:7501:clause:c2:boss,troop:7501:step:1:boss"]
 *   node scripts/gow-signoff.mjs issue  --lane L4a --by sa-L4a --keys k1 --id L4a-012 --note "prototype hits 1 target, native 2"
 *   node scripts/gow-signoff.mjs check  --lane L4a       # keys exist, test files exist, waivers match source text
 * A later line for the same key replaces an earlier one (re-review after a fix = just accept again).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WAIVED_MODES } from './lib/gow-whole-skill-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const list = s => (s ?? '').split(',').map(x => x.trim()).filter(Boolean);
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/gow-skill-audit/ledger.json'), 'utf8'));
const rows = new Map(ledger.rows.map(r => [r.key, r]));
const file = lane => path.join(root, 'tasks/active/gow-skill-shards', `lane-${lane}`, 'signoffs.jsonl');
const need = (...ns) => { for (const n of ns) if (!opt(n)) throw new Error(`missing --${n}`); };
const append = (lane, e) => { fs.mkdirSync(path.dirname(file(lane)), { recursive: true }); fs.appendFileSync(file(lane), JSON.stringify(e) + '\n'); };
export const readSignoffs = p => fs.existsSync(p) ? [...new Map(fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)
  .map(l => JSON.parse(l)).map(e => [e.key, e])).values()] : [];

function waiverProblems(key, w) {
  const row = rows.get(key); if (!row) return ['unknown key'];
  const src = w.part === 'step' ? row.source.native?.SpellSteps?.[Number(w.id)] : row.sourceClauses.find(c => c.id === w.id);
  if (!src) return [`no ${w.part} ${w.id}`];
  const text = w.part === 'step' ? JSON.stringify(src) : src.text;
  return WAIVED_MODES[w.mode]?.test(text) ? [] : [`${w.part} ${w.id} does not mention mode ${w.mode}`];
}
const cmd = args[0];
try {
  if (cmd === 'show') {
    for (const k of list(opt('keys'))) {
      const r = rows.get(k); if (!r) { console.log(`${k}: unknown`); continue; }
      console.log(JSON.stringify({ key: k, name: r.referenceName, spellId: r.spellId, accepted: !!r.acceptance?.accepted,
        english: r.source.englishDescription, clauses: r.sourceClauses.map(c => `${c.id}: ${c.text}`),
        nativeTarget: r.source.native?.Target, randomize: r.source.native?.Randomize ?? null,
        steps: (r.source.native?.SpellSteps ?? []).map((s, i) => ({ i, ...s })).filter(s => s.Type !== 'None'),
        cost: r.runtime?.manaCost, colors: r.runtime?.manaColors, zh: r.runtime?.description, prototype: r.runtime?.prototype }, null, 1));
    }
  } else if (cmd === 'accept') {
    need('lane', 'by', 'test', 'keys');
    if (!fs.existsSync(path.join(root, opt('test')))) throw new Error(`test file not found: ${opt('test')}`);
    const waives = list(opt('waive')).map(s => { const [t, id, part, sid, mode] = s.split(':'); return { key: `${t}:${id}`, part, id: sid, mode }; });
    for (const k of list(opt('keys'))) {
      if (!rows.has(k)) throw new Error(`unknown key ${k}`);
      const waived = waives.filter(w => w.key === k).map(({ key, ...w }) => w);
      const bad = waived.flatMap(w => waiverProblems(k, w)); if (bad.length) throw new Error(`${k}: ${bad.join('; ')}`);
      append(opt('lane'), { format: 'compact', key: k, decision: 'accept', reviewer: opt('by'), reviewedAt: new Date().toISOString(),
        tests: [opt('test')], ...(opt('note') ? { note: opt('note') } : {}), ...(waived.length ? { waived } : {}) });
    }
    console.log(`accepted ${list(opt('keys')).length}`);
  } else if (cmd === 'issue') {
    need('lane', 'by', 'keys', 'id', 'note');
    for (const k of list(opt('keys'))) append(opt('lane'), { format: 'compact', key: k, decision: 'issue', reviewer: opt('by'),
      reviewedAt: new Date().toISOString(), issue: opt('id'), note: opt('note') });
    console.log(`issue ${opt('id')} on ${list(opt('keys')).length}`);
  } else if (cmd === 'check') {
    need('lane'); let bad = 0; const all = readSignoffs(file(opt('lane')));
    for (const e of all) {
      const p = [];
      if (!rows.has(e.key)) p.push('unknown key');
      for (const t of e.tests ?? []) if (!fs.existsSync(path.join(root, t))) p.push(`missing test ${t}`);
      for (const w of e.waived ?? []) p.push(...waiverProblems(e.key, w));
      if (e.decision === 'accept' && !(e.tests ?? []).length) p.push('accept without test');
      if (p.length) { bad++; console.log(`${e.key}: ${p.join('; ')}`); }
    }
    console.log(`${all.length} keys (${all.filter(e => e.decision === 'accept').length} accept, ${all.filter(e => e.decision === 'issue').length} issue), ${bad} problems`);
    if (bad) process.exitCode = 1;
  } else throw new Error('show | accept | issue | check');
} catch (e) { console.error(e.message); process.exitCode = 1; }
