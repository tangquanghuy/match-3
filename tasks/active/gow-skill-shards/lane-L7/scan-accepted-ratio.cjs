// sa-L76 helper: accept records (stored ledger reviews + every lane signoff file) whose prototype uses a
// non-terminating [N:1] ratio (R003 percentage change: 3:1 -> 34%, 6:1 -> 17%, 8:1 -> 13%).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../..');
const l = require(path.join(root, 'artifacts/gow-skill-audit/ledger.json'));
const rows = new Map(l.rows.map(r => [r.key, r]));
const base = path.join(root, 'tasks/active/gow-skill-shards');
const files = [path.join(root, 'data/audit/gow-skill-reviews.json'),
  ...fs.readdirSync(base).filter(d => d.startsWith('lane-')).flatMap(d => fs.readdirSync(path.join(base, d)).filter(f => /^signoff-.*\.json$/.test(f)).map(f => path.join(base, d, f))),
  ...fs.readdirSync(base).filter(f => /^signoff-.*\.json$/.test(f)).map(f => path.join(base, f))];
for (const f of files) for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).reviews) {
  if (r.decision !== 'accept') continue;
  const p = JSON.stringify(rows.get(r.key)?.runtime?.prototype ?? null);
  const m = [...p.matchAll(/"kind":"ratio","a":(\d+),"b":(\d+)/g)].map(x => [Number(x[1]), Number(x[2])]).filter(([a, b]) => !Number.isInteger(100 * b / a));
  if (m.length) console.log(`${r.key}\t${path.relative(root, f)}\t${m.map(x => x.join(':')).join(',')}`);
}
