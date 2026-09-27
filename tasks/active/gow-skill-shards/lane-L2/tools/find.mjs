// Lane L2 helper: search ledger rows by English regex and/or native step type.
// Usage: node find.mjs "<englishRegex>" [nativeStepTypeRegex] [max]
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const [re, stepRe, max = '40'] = process.argv.slice(2);
const r1 = new RegExp(re || '.', 'i'), r2 = stepRe ? new RegExp(stepRe) : null;
let n = 0;
for (const r of l.rows) {
  const en = r.source.englishDescription ?? '';
  if (!r1.test(en)) continue;
  const steps = r.source.native?.SpellSteps ?? [];
  if (r2 && !steps.some(s => r2.test(s.Type))) continue;
  if (n++ >= Number(max)) break;
  console.log(`${r.key} ${r.spellId} ${r.status} | ${en.slice(0, 160)}`);
}
console.log('total shown', Math.min(n, Number(max)));
