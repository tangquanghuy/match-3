// Lane L4b helper: compact ledger dump for review. Usage: node dump.mjs troop:6340,weapon:1434 [out.txt]
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const rows = new Map(l.rows.map(r => [r.key, r]));
const out = [];
const log = (...a) => out.push(a.join(' '));
// keys may be given as t7468,w1498 (shorthand avoids host:port false positives in the shell wrapper)
const expand = k => k.replace(/^t(\d+)$/, 'troop:$1').replace(/^w(\d+)$/, 'weapon:$1');
for (const key of process.argv[2].split(',').map(expand)) {
  const r = rows.get(key);
  if (!r) { log(key, 'MISSING'); continue; }
  const n = r.source.native ?? {};
  log(`=== ${key} ${r.referenceName} spell ${r.spellId} cost ${r.runtime.manaCost}/${n.Cost} colors ${r.runtime.manaColors} status ${r.status} target ${n.Target} rand ${n.Randomize ?? '-'}`);
  log('EN :', r.source.englishDescription);
  log('ZH :', r.runtime.description);
  log('CL :', r.sourceClauses.map(c => `${c.id}=${c.text}`).join(' | '));
  n.SpellSteps?.forEach((s, i) => log(`  ${i}`, JSON.stringify(s)));
  log('PROTO', JSON.stringify(r.runtime.prototype));
  if (r.confirmedDifferences?.length) log('DIFF', JSON.stringify(r.confirmedDifferences));
  if (r.compilerMetadata?.fidelity !== 'full') log('META', JSON.stringify(r.compilerMetadata));
  if (r.source.entityPath && !r.source.entityPath.includes('troops')) log('SRC', r.source.entityPath, JSON.stringify(r.identity ?? r.source.identity ?? null));
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], out.join('\n') + '\n', 'utf8'); else console.log(out.join('\n'));
