// sa-L76 helper: list rows whose native Count* steps use a non-integer ratio percentage.
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
const out = [];
for (const r of l.rows) {
  const steps = r.source?.native?.SpellSteps ?? [];
  const counts = steps.filter(s => /^Count/.test(s.Type) && s.Type !== 'CountMax' && typeof s.Amount === 'number');
  const odd = counts.filter(s => s.Amount > 0 && (s.Amount < 100 ? 100 % s.Amount !== 0 : s.Amount % 100 !== 0));
  if (!odd.length) continue;
  const mods = JSON.stringify(r.runtime?.prototype ?? null).match(/"mod":\{[^}]*\}/g) ?? [];
  out.push(`${r.key}\t${r.spellId}\t${odd.map(s => `${s.Type}:${s.Target ?? ''}:${s.Amount}`).join(',')}\t${[...new Set(mods)].join(' ')}\taccepted=${!!r.acceptance?.accepted}`);
}
console.log(out.join('\n'));
console.log(out.length);
