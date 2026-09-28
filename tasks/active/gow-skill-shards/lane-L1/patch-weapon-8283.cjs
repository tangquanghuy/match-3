// sa-R5 (L1-1310-brown): reviewed weapon row for spell 8283 Honeydipper (no Brown-gem boost; zh clause dropped).
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json','utf8'));
const f='src/data/gowWeaponReviewedOverrides.json';let t=fs.readFileSync(f,'utf8');
const doc=JSON.parse(t);const id=8283;
if(doc.entries[String(id)])throw new Error('entry exists '+id);
const r=a.rows.find(r=>r.spellId===id&&r.key.startsWith('weapon'));
const p=r.runtime.prototype;
if(JSON.stringify(p).includes('Brown'))throw new Error('rebuild ledger first');
const desc='对一名敌人造成 [魔法 + 2] 点伤害，并魅惑敌人。有 30% 个别几率获得一个额外回合和半数法力值。';
const out=`    "${id}": {\n      "description": ${JSON.stringify(desc)},\n      "metadata": {"fidelity":"full","missingFeatures":[],"skippedClauses":[]},\n      "prototype": {\n        "segments": [\n${p.segments.map(s=>'          '+JSON.stringify(s)).join(',\n')}\n        ]\n      }\n    },`;
const k='"entries": {';const i=t.indexOf(k);const nl=t.indexOf('\n',i)+1;
t=t.slice(0,nl)+out+'\n'+t.slice(nl);JSON.parse(t);fs.writeFileSync(f,t);console.log(out);
