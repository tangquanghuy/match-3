// sa-F1: compact view of ledger rows (spell id, cost/colours, zh, curated location, prototype one segment per line).
//   node tasks/active/gow-skill-shards/lane-L2/tools/f1show.mjs troop:6871,troop:7341
import fs from 'node:fs';
const ledger = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const rows = new Map(ledger.rows.map(r => [r.key, r]));
const dir = 'src/engine/skills/curated';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => [f, fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')]);
for (const k of (process.argv[2] ?? '').split(',').filter(Boolean)) {
  const r = rows.get(k); if (!r) { console.log(`${k}: unknown`); continue; }
  const locs = files.flatMap(([f, ls]) => ls.map((l, i) => [f, i + 1, l]).filter(([, , l]) => new RegExp(`\\bid: ${r.spellId},`).test(l)).map(([f, n]) => `${f}:${n}`));
  console.log(`== ${k} spell=${r.spellId} ${r.referenceName} cost=${r.runtime?.manaCost} colors=${(r.runtime?.manaColors ?? []).join('/')} target=${r.source.native?.Target} rand=${r.source.native?.Randomize ?? '-'} at ${locs.join(' ')}`);
  console.log(`  en: ${r.source.englishDescription}`);
  console.log(`  zh: ${r.runtime?.description}`);
  (r.source.native?.SpellSteps ?? []).forEach((s, i) => { if (s.Type !== 'None') console.log(`  s${i}: ${JSON.stringify(s)}`); });
  for (const s of r.runtime?.prototype?.segments ?? []) console.log(`  > ${JSON.stringify(s)}`);
  if (r.runtime?.prototype?.inputTarget) console.log(`  inputTarget ${r.runtime.prototype.inputTarget}`);
}
