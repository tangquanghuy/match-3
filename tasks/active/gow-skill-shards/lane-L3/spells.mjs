// Lane L3 helper: print native steps + ledger prototype for spell ids. node spells.mjs 8634,8635
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const ids = process.argv[2].split(',').map(Number);
for (const r of l.rows) {
  if (!ids.includes(r.spellId)) continue;
  const n = r.source.native ?? {};
  console.log(`=== ${r.key} ${r.referenceName} spell ${r.spellId} cost ${r.runtime.manaCost} target ${n.Target} status ${r.status}`);
  console.log('EN :', r.source.englishDescription);
  n.SpellSteps?.forEach((s, i) => console.log(`  ${i}`, JSON.stringify(s)));
  console.log('PROTO', JSON.stringify(r.runtime.prototype));
}
