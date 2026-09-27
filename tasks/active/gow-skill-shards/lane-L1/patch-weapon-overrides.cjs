// Lane L1 helper (run under src lock): add reviewed weapon prototypes for the kingdom-3039 summon pool fix.
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json','utf8'));
const six=['OcularenLeech','Ocularen','BurningOcularen','GloomOcularen','Xerodar','WatchMother'];
const f='src/data/gowWeaponReviewedOverrides.json';let t=fs.readFileSync(f,'utf8');
const doc=JSON.parse(t);const out=[];
for(const id of [8357,7947]){
  if(doc.entries[String(id)])throw new Error('entry exists '+id);
  const r=a.rows.find(r=>r.spellId===id&&r.key.startsWith('weapon'));
  const p=JSON.parse(JSON.stringify(r.runtime.prototype));
  for(const s of p.segments)if(s.kind==='summon')s.params.source.randomOf=six;
  out.push(`    "${id}": {\n      "prototype": {\n        "segments": [\n${p.segments.map(s=>'          '+JSON.stringify(s)).join(',\n')}\n        ]\n      }\n    },`);
}
const k='"entries": {';const i=t.indexOf(k);const nl=t.indexOf('\n',i)+1;
t=t.slice(0,nl)+out.join('\n')+'\n'+t.slice(nl);JSON.parse(t);fs.writeFileSync(f,t);console.log(out.join('\n'));
