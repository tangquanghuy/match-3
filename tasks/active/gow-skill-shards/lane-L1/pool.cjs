// Lane L1 helper: compare a prototype summon pool with raw-data rosters (read-only).
// usage: node pool.cjs <key> type:<Type> | kingdom:<KingdomId>
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json','utf8'));
const troops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const [key0,spec]=process.argv.slice(2);const key=key0.replace(/^(troop|weapon)[-_]/,'$1:');
const r=a.rows.find(x=>x.key===key);
const pools=[];(function walk(o){if(!o||typeof o!=='object')return;if(Array.isArray(o.randomOf))pools.push(o.randomOf);for(const v of Object.values(o))walk(v);})(r.runtime.prototype);
const [kind,val]=spec.split(/[:=]/);
const roster=troops.filter(t=>kind==='type'?[t.TroopType,t.TroopType2].map(s=>String(s||'').toLowerCase()).includes(val.toLowerCase()):String(t.KingdomId)===val);
const refs=roster.map(t=>t.ReferenceName);
for(const p of pools){
 const missing=refs.filter(x=>!p.includes(x));const extra=p.filter(x=>!refs.includes(x));
 console.log('pool size',p.length,'roster size',refs.length,'dupes',p.length-new Set(p).size);
 console.log('missing from pool:',JSON.stringify(missing.map(m=>{const t=roster.find(t=>t.ReferenceName===m);return m+'('+t.id+','+t.stats?.pvp_type+',imm'+t.IsImmortal+',rar'+t.RarityIdx+',k'+t.KingdomId+')'})));
 console.log('extra in pool:',JSON.stringify(extra));
}
console.log('roster kinds:',JSON.stringify([...new Set(roster.map(t=>t.stats?.pvp_type))]));
