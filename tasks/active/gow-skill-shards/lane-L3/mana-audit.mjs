// Lane L3 helper: compare native mana steps (Amount / SpellPowerMultiplier) with prototype mana segments.
// node mana-audit.mjs [out.txt]
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const MANA = /^(DecreaseMana|StealMana|GenerateMana|GenerateHalfMana|GenerateQuarterMana|GenerateFullMana|ManaBurn|DrainMana)/;
const out = [];
const walk = (segs, acc) => { for (const s of segs ?? []) { acc.push(s); if (s.branches) s.branches.forEach(b => walk(b, acc)); if (s.segments) walk(s.segments, acc); if (s.options) s.options.forEach(o => walk(o.segments ?? o, acc)); } return acc; };
for (const r of l.rows) {
  const steps = (r.source.native?.SpellSteps ?? []).filter(s => MANA.test(s.Type));
  if (!steps.length) continue;
  const segs = walk(r.runtime.prototype?.segments, []).filter(s => s.stat === 'mana' || s.kind === 'manaBurn' || s.gainStat === 'mana');
  const nat = steps.map(s => `${s.Type}(${s.Target ?? '-'} A=${s.Amount ?? '-'} SPM=${s.SpellPowerMultiplier ?? '-'}${s.UseCounterForAmount ? ' ctr' : ''}${s.StatusModifier ? ' ' + s.StatusModifier + ':' + s.StatusAmount : ''})`).join(' ; ');
  const pro = segs.map(s => `${s.kind}:${s.target}${s.stat ? ' ' + s.stat : ''}${s.gainStat ? '->' + s.gainStat : ''} ${s.scaling ? s.scaling.base + '+' + s.scaling.mult + 'M' : ''}${s.drainAll ? ' drainAll' : ''}${s.halve ? ' halve' : ''}${s.fraction ? ' frac' + s.fraction : ''}${s.modifier ? ' mod' : ''}`).join(' ; ');
  // suspicious: native fixed amount (no SPM) but proto mult != 0
  const fixedNative = steps.some(s => /DecreaseMana|StealMana|GenerateMana$/.test(s.Type) && s.SpellPowerMultiplier === undefined && !s.UseCounterForAmount && s.Amount !== undefined && s.Amount !== 100);
  const multProto = segs.some(s => s.scaling && s.scaling.mult !== 0 && !s.drainAll && !s.halve && s.fraction === undefined);
  const flag = fixedNative && multProto ? 'SUSPECT-MULT ' : '';
  out.push(`${flag}${r.key} ${r.spellId} ${r.status} | ${nat} || ${pro}`);
}
out.sort();
const text = out.join('\n') + '\n';
if (process.argv[2]) fs.writeFileSync(process.argv[2], text); else process.stdout.write(text);
console.error('rows', out.length, 'suspect', out.filter(x => x.startsWith('SUSPECT')).length);
