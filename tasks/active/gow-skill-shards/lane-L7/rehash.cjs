// sa-L76 helper: refresh sha256 of evidence entries pointing at the given test file(s) in a signoff file.
// usage: node rehash.cjs <signoff.json> <testPath>[,<testPath>...]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../../..');
const [file, tests] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const want = new Set(tests.split(','));
let n = 0;
for (const r of doc.reviews) for (const e of r.sourceEvidence ?? []) {
  if (!want.has(e.path)) continue;
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, e.path))).digest('hex');
  if (e.sha256 !== h) { e.sha256 = h; n++; console.log(`${r.key} ${e.id} -> ${h.slice(0, 12)}`); }
}
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log(file, 'updated', n);
