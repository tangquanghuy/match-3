// sa-R5: write/refresh the reviewed weapon override row for a spell from the (freshly rebuilt) ledger prototype.
// usage: node patch-weapon-row.cjs <spellId> [zh description]
const fs=require('fs');
const [idArg,desc]=process.argv.slice(2);const id=Number(idArg);
const a=JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json','utf8'));
const f='src/data/gowWeaponReviewedOverrides.json';const doc=JSON.parse(fs.readFileSync(f,'utf8'));
const r=a.rows.find(r=>r.spellId===id&&r.key.startsWith('weapon'));if(!r)throw new Error('no weapon row '+id);
const prev=doc.entries[String(id)]||{};
doc.entries[String(id)]={...(desc||prev.description?{description:desc||prev.description}:{}),metadata:prev.metadata||{fidelity:'full',missingFeatures:[],skippedClauses:[]},prototype:r.runtime.prototype};
fs.writeFileSync(f,JSON.stringify(doc,null,2)+'\n');console.log(JSON.stringify(doc.entries[String(id)]));
