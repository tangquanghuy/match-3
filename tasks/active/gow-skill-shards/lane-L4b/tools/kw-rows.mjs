// Emit KW table rows (kingdom x6 weapons) for a lane test. Usage: node kw-rows.mjs 1240,1243 out.txt
import fs from 'node:fs';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const rows = new Map(l.rows.map(r => [r.key, r]));
const w = JSON.parse(fs.readFileSync('src/data/weapons.json', 'utf8'));
const out = [];
for (const id of process.argv[2].split(',').map(Number)) {
  const r = rows.get('weapon:' + id); const x = w.find(v => v.id === id);
  const st = r.source.native.SpellSteps; const en = r.source.englishDescription;
  const m = en.match(/boosted by (.+?) Allies/);
  out.push(` {id:${id},ref:'${x.referenceName}',spell:${r.spellId},cost:${x.manaCost},colors:[${x.manaColors.map(c => 'BaseColor.' + c).join(',')}],kid:${st[0].Data},kingdom:'${r.runtime.prototype.segments[0].modifier.source.kingdom}',enName:${JSON.stringify(m[1])},mix:[BaseColor.${st[2].Color1},BaseColor.${st[2].Color2}],protoMix:[${r.runtime.prototype.segments[1].params.gem.colors.map(c => 'BaseColor.' + c).join(',')}],c0:${st[0].UseCounterForAmount ? 'true' : 'false'},\n  desc:${JSON.stringify(en)},\n  zh:${JSON.stringify(x.spell.description)}},`);
}
fs.writeFileSync(process.argv[3], out.join('\n') + '\n', 'utf8');
