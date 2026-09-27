// sa-L76 helper: list rows whose native steps include a given Type (argv[2]); prints English + step list + prototype kinds.
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
const type = process.argv[2];
let n = 0;
for (const r of l.rows) {
  const steps = r.source?.native?.SpellSteps ?? [];
  if (!steps.some(s => s.Type === type)) continue;
  n++;
  if (process.argv[3] === 'count') continue;
  console.log(`${r.key}\t${r.spellId}\tacc=${!!r.acceptance?.accepted}\t${r.source.englishDescription}`);
  console.log(`   steps: ${steps.map(s => `${s.Type}:${s.Target ?? ''}:${s.Amount ?? ''}`).join(' | ')}`);
  console.log(`   proto: ${JSON.stringify(r.runtime?.prototype)?.slice(0, 400)}`);
}
console.log('total', n);
