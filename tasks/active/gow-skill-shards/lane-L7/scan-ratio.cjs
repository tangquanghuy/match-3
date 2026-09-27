// sa-L76 helper: for every prototype ratio modifier, compare ceil(100*b/a) with the native Count* Amounts.
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
const stats = new Map();
const mism = [];
for (const r of l.rows) {
  const proto = JSON.stringify(r.runtime?.prototype ?? null);
  const mods = [...proto.matchAll(/"mod":\{"kind":"ratio","a":([\d.]+),"b":([\d.]+)[^}]*\}/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!mods.length) continue;
  const steps = r.source?.native?.SpellSteps ?? [];
  const amts = steps.filter(s => /^Count/.test(s.Type) && s.Type !== 'CountMax' && s.Type !== 'CountMin').map(s => s.Amount);
  for (const [a, b] of mods) {
    const pct = Math.ceil(100 * b / a);
    const k = `${a}:${b}`;
    const st = stats.get(k) ?? { n: 0, match: 0, amts: new Map() };
    st.n++;
    if (amts.includes(pct)) st.match++; else mism.push(`${r.key}\t${k}\tpct=${pct}\tnative=${JSON.stringify(steps.map(s => `${s.Type}:${s.Amount ?? ''}`))}`);
    for (const x of amts) st.amts.set(x, (st.amts.get(x) ?? 0) + 1);
    stats.set(k, st);
  }
}
for (const [k, v] of stats) console.log(k, 'n', v.n, 'match', v.match, 'amts', JSON.stringify([...v.amts]));
console.log('--- mismatches', mism.length);
console.log(mism.slice(0, 80).join('\n'));
