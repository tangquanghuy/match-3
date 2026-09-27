// sa-L76 helper: dump ledger rows (english, clauses, native steps, prototype, zh) for review.
// usage: node dump.cjs troop:6211,weapon:1075
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
const keys = process.argv[2].split(',');
for (const k of keys) {
  const r = l.rows.find(r => r.key === k);
  if (!r) { console.log(k, 'MISSING'); continue; }
  console.log('=====', k, 'spell', r.spellId, 'name', r.name ?? r.source?.name, 'accepted', !!r.acceptance?.accepted);
  console.log('entityPath', r.source.entityPath, 'nativePath', r.source.nativePath);
  console.log('EN:', r.source.englishDescription);
  console.log('clauses:', JSON.stringify(r.sourceClauses.map(c => [c.id, c.text])));
  const n = r.source.native ?? {};
  console.log('native Target', n.Target, 'Randomize', n.Randomize, 'Cost', n.Cost);
  (n.SpellSteps ?? []).forEach((s, i) => console.log('  step', i, JSON.stringify(s)));
  console.log('proto:', JSON.stringify(r.runtime?.prototype));
  console.log('zh:', r.runtime?.description ?? r.runtime?.zhDescription ?? '');
  const extra = Object.keys(r).filter(x => !['source', 'sourceClauses', 'runtime'].includes(x));
  console.log('other keys:', extra.join(','));
}
