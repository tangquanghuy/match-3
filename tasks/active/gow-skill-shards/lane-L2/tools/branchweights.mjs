// Lane L2 helper: list rows whose native random-branch count differs from the prototype oneOf option count
// (unequal branch weights when the engine picks options uniformly).
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const find = (segs, out = []) => { for (const s of segs ?? []) { if (s.kind === 'oneOf') out.push(s.options.length); if (s.options) for (const o of s.options) find(o, out); } return out; };
for (const r of l.rows) {
  const rnd = r.source.native?.Randomize;
  if (!rnd || rnd.startsWith('Choose:')) continue;
  const inner = rnd.includes('(') ? rnd.slice(rnd.indexOf('(') + 1, rnd.lastIndexOf(')')) : rnd;
  const groups = inner.split('-').length;
  const opts = find(r.runtime.prototype?.segments);
  if (!opts.length || opts[0] !== groups) console.log(`${r.key} ${r.spellId} ${r.status} rand=${rnd} groups=${groups} oneOf=${JSON.stringify(opts)}`);
}
