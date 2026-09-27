// Lane L3 helper: refresh sourceDigest / ledgerFingerprintAtReview / _reference of records in a signoff file
// from a fresh scaffold (after an in-lane fix changed the prototype). node refresh.mjs <signoff.json>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const file = process.argv[2];
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const tmp = `${file}.fresh.json`;
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
execFileSync('node', ['scripts/gow-review-scaffold.mjs', 'scaffold', '--keys', doc.reviews.map(r => r.key).join(','), '--reviewer', 'sa-L3', '--out', tmp]);
const fresh = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.unlinkSync(tmp);
for (const r of doc.reviews) {
  const f = fresh.reviews.find(x => x.key === r.key);
  if (r.sourceDigest !== f.sourceDigest) console.log('refreshed', r.key);
  r.sourceDigest = f.sourceDigest; r.ledgerFingerprintAtReview = f.ledgerFingerprintAtReview; r._reference = f._reference;
}
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
