// Lane L1 helper: dump source/native/prototype for keys (read-only).
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json','utf8'));
const troops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const src=JSON.parse(fs.readFileSync('src/data/troops.json','utf8'));
const srcT=Array.isArray(src)?src:(src.troops||Object.values(src));
for(const key0 of process.argv.slice(2).flatMap(s=>s.split(','))){
 const key=key0.replace(/^(troop|weapon)[-_]/,'$1:');
 const r=a.rows.find(x=>x.key===key);
 if(!r){console.log(key,'NOT FOUND');continue;}
 const id=Number(key.split(':')[1]);
 const o=key.startsWith('troop')?troops.find(t=>t.id===id):null;
 const t=key.startsWith('troop')?srcT.find(t=>t.id===id):null;
 console.log('=====',key,'spell',r.spellId);
 if(o)console.log('raw:',JSON.stringify({name:o.name,cost:o.ManaCost,colors:Object.keys(o._ManaColors_parsed||{}),kingdom:o.kingdom?.name??o.kingdomId,type:o.type??o.types,desc:o.stats?.spell?.desc}));
 if(t)console.log('src:',JSON.stringify({name:t.name,cost:t.manaCost,colors:t.manaColors,spell:t.spell}));
 console.log('english:',r.source.englishDescription);
 console.log('native:',JSON.stringify(r.source.native?.SpellSteps));
 console.log('nativeMeta:',JSON.stringify(Object.fromEntries(Object.entries(r.source.native||{}).filter(([k])=>k!=='SpellSteps'))));
 console.log('proto:',JSON.stringify(r.runtime.prototype));
 console.log('diffs:',JSON.stringify(r.confirmedDifferences),'digest:',r.sourceDigest??r.wholeSkillReview?.sourceDigest);
}
