// sa-L76 helper: L7/L6 rows where native has more non-Count steps using the counter than runtime segments carry a modifier.
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
const lanes = require('../lanes.json').lanes;
const ids = (process.argv[2] ?? 'L7,L6').split(',');
const mine = new Set(lanes.filter(x => ids.includes(x.id)).flatMap(x => x.entities.map(e => e.key)));
let n = 0;
for (const r of l.rows) {
  if (!mine.has(r.key)) continue;
  const st = (r.source.native?.SpellSteps ?? []).filter(s => s.UseCounterForAmount && !/^Count/.test(s.Type));
  const p = JSON.stringify(r.runtime?.prototype ?? {});
  const mods = (p.match(/"(modifier|modifiers|chanceBoost)"/g) || []).length;
  if (st.length > mods) { n++; console.log(r.key, r.spellId, 'counterSteps', st.length, 'mods', mods, st.map(s => s.Type).join(',')); }
}
console.log('total', n);
