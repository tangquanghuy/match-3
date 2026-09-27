// Lane L2 helper: accepted records (merged reviews + all lane signoffs) whose prototype matches a predicate.
// Usage: node affected.mjs <jsSubstringInPrototypeJSON> [...more]
import fs from 'node:fs';
import path from 'node:path';
const needles = process.argv.slice(2);
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const hit = new Set(l.rows.filter(r => { const s = JSON.stringify(r.runtime.prototype ?? {}); return needles.some(n => s.includes(n)); }).map(r => r.key));
const acc = new Map();
const add = (file, recs) => { for (const r of recs ?? []) if (r.decision === 'accept' && hit.has(r.key)) acc.set(r.key, [...(acc.get(r.key) ?? []), file]); };
try { add('data/audit/gow-skill-reviews.json', JSON.parse(fs.readFileSync('data/audit/gow-skill-reviews.json', 'utf8')).reviews); } catch {}
const root = 'tasks/active/gow-skill-shards';
for (const d of fs.readdirSync(root)) {
  const p = path.join(root, d);
  const files = d.startsWith('lane-') ? fs.readdirSync(p).filter(f => /^signoff-.*\.json$/.test(f)).map(f => path.join(p, f)) : /^signoff-.*\.json$/.test(d) ? [p] : [];
  for (const f of files) { try { add(f.replace(/\\/g, '/'), JSON.parse(fs.readFileSync(f, 'utf8')).reviews); } catch {} }
}
console.log('rows matching', hit.size, 'accepted', acc.size);
for (const [k, v] of acc) console.log(k, v.join(' '));
