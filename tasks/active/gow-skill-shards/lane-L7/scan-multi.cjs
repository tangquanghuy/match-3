// sa-L76 helper: damage segments whose target resolves several victims but has no explicit range.
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
const modes = new Set(process.argv[2].split(','));
const walk = (segs, out) => { for (const s of segs ?? []) { if (s.kind === 'damage' && modes.has(s.target) && s.range === undefined) out.push(s); for (const k of ['options', 'then', 'else', 'segments']) if (Array.isArray(s[k])) (Array.isArray(s[k][0]) ? s[k] : [s[k]]).forEach(x => walk(x, out)); } return out; };
for (const r of l.rows) {
  const hit = walk(r.runtime?.prototype?.segments, []);
  if (hit.length) console.log(`${r.key}\t${r.spellId}\tacc=${!!r.acceptance?.accepted}\t${hit.map(s => `${s.target}/n${s.n ?? ''}${s.split ? '/split' + s.split : ''}`).join(' ')}\t${r.source.englishDescription.slice(0, 110)}`);
}
