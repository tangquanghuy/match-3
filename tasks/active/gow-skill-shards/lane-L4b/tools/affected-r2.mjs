// List accepted keys (stored reviews + lane signoff files) whose runtime prototype uses a primitive changed in round 2:
//  - gem create with a colour placeholder (resolved once per cast now)
//  - status readers (counts / conditions) naming rage or enraged (alias-aware now)
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const rows = new Map(l.rows.map(r => [r.key, r]));
const base = 'tasks/active/gow-skill-shards';
const files = ['data/audit/gow-skill-reviews.json', ...fs.readdirSync(base).filter(d => d.startsWith('lane-')).flatMap(d => fs.readdirSync(`${base}/${d}`).filter(f => /^signoff-.*\.json$/.test(f)).map(f => `${base}/${d}/${f}`)), ...fs.readdirSync(base).filter(f => /^signoff-.*\.json$/.test(f)).map(f => `${base}/${f}`)];
const PH = new Set(['CHOSEN_TARGET', 'ENEMY', 'TRACKED_ENEMY', 'LAST_TARGET', 'ENEMY_MOST_USED', 'ALLY_MOST_USED']);
const out = [];
for (const f of files) for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).reviews) {
  if (r.decision !== 'accept') continue;
  const p = rows.get(r.key)?.runtime?.prototype; if (!p) continue;
  const s = JSON.stringify(p);
  const reasons = [];
  const walk = o => { if (!o || typeof o !== 'object') return; if (o.op === 'create' && o.gem) { const g = o.gem; const cs = g.kind === 'color' ? [g.color] : g.kind === 'mix' ? g.colors : g.kind === 'mixAny' ? g.entries.filter(e => typeof e === 'string') : []; if (cs.some(c => PH.has(c))) reasons.push('create-placeholder'); } for (const v of Object.values(o)) walk(v); };
  walk(p);
  if (/"statusId":"(enraged|rage)"/.test(s) && /(StatusCount|Status"|selfStatus|targetStatus|anyEnemyStatus|anyAllyStatus|lastTargetStatus)/.test(s)) reasons.push('rage-reader');
  if (reasons.length) out.push({ key: r.key, file: f, reasons: [...new Set(reasons)] });
}
console.log(JSON.stringify(out, null, 1));
