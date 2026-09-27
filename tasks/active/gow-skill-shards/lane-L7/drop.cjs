// sa-L76 helper: remove requeued keys from an old signoff file before re-scaffolding them into a new batch.
// usage: node drop.cjs <signoff.json> key1,key2
const fs = require('fs');
const [file, keys] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const drop = new Set(keys.split(','));
const before = doc.reviews.length;
doc.reviews = doc.reviews.filter(r => !drop.has(r.key));
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log(file, before, '->', doc.reviews.length);
