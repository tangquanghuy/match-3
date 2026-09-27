// sa-L76 helper: patch or append issues. usage: node issue.cjs <issues.json> <patch.json>
// patch.json: [{match:{id|key+kind}, set:{...}} | {add:{...}}]
const fs = require('fs');
const [file, patchFile] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const p of JSON.parse(fs.readFileSync(patchFile, 'utf8').replace(/^\uFEFF/, ''))) {
  if (p.add) { list.push(p.add); console.log('added', p.add.id ?? p.add.key); continue; }
  const hits = list.filter(i => Object.entries(p.match).every(([k, v]) => i[k] === v));
  if (hits.length !== 1) throw new Error(`match ${JSON.stringify(p.match)} -> ${hits.length}`);
  Object.assign(hits[0], p.set); console.log('patched', JSON.stringify(p.match));
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
