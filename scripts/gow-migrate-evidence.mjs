/**
 * DISPATCH C2 migration for stored reviews in data/audit/gow-skill-reviews.json.
 *   node scripts/gow-migrate-evidence.mjs [--dry]
 * For every record whose sourceDigest is still current:
 *  - evidence under src/** is dropped (runtime state is bound by sourceDigest = runtime.prototype + binding, and by
 *    the same-fingerprint full-run receipt); its id is removed from every evidenceIds list
 *  - evidence on a tests/** file whose hash changed is re-hashed ONLY if that suite passed in the current receipt
 *    (the receipt fingerprint must equal the ledger fingerprint); otherwise the record is left untouched
 *  - an entry left with zero evidenceIds keeps the frozen english/native snapshot ids
 * Each touched record gets evidenceMigration {at, dropped[], rehashed[]} for traceability.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reviewSourceDigest } from './lib/gow-whole-skill-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = p => path.join(root, p);
const read = p => JSON.parse(fs.readFileSync(abs(p), 'utf8'));
const sha = p => createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
const ledger = read('artifacts/gow-skill-audit/ledger.json');
const receipt = read('artifacts/gow-skill-audit/verification-receipt.json');
if (receipt.fingerprint !== ledger.fingerprint || receipt.failed !== 0) throw new Error('Receipt not current/passing; run verify first.');
const passed = new Set(receipt.suites.filter(s => s.status === 'passed' && s.failed === 0 && s.passed > 0).map(s => s.path));
const rows = new Map(ledger.rows.map(r => [r.key, r]));
const total = read('data/audit/gow-skill-reviews.json');
let touched = 0, skipped = [];
for (const r of total.reviews) {
  const row = rows.get(r.key);
  if (!row || r.sourceDigest !== reviewSourceDigest(row)) continue;
  const dropped = [], rehashed = []; let blocked = false;
  for (const e of r.sourceEvidence ?? []) {
    const exists = fs.existsSync(abs(e.path)); const cur = exists ? sha(e.path) : null;
    if (e.path.startsWith('src/')) { dropped.push(e.id); continue; }
    if (cur === e.sha256) continue;
    if (e.path.startsWith('tests/') && exists && passed.has(e.path)) { rehashed.push({ id: e.id, path: e.path, from: e.sha256, to: cur }); continue; }
    blocked = true; skipped.push(`${r.key}: ${e.path}`);
  }
  if (blocked || (!dropped.length && !rehashed.length)) continue;
  r.sourceEvidence = r.sourceEvidence.filter(e => !dropped.includes(e.id));
  for (const x of rehashed) r.sourceEvidence.find(e => e.id === x.id).sha256 = x.to;
  const fallback = r.sourceEvidence.filter(e => ['english-snapshot', 'native-snapshot'].includes(e.role)).map(e => e.id);
  const fix = entry => { if (!entry?.evidenceIds) return; entry.evidenceIds = entry.evidenceIds.filter(id => !dropped.includes(id)); if (!entry.evidenceIds.length) entry.evidenceIds = [...fallback]; };
  Object.values(r.dimensions ?? {}).forEach(fix); (r.clauseReviews ?? []).forEach(fix); (r.nativeStepReviews ?? []).forEach(fix); (r.branchReviews ?? []).forEach(fix);
  r.evidenceMigration = { at: new Date().toISOString(), rule: 'DISPATCH C2', dropped, rehashed: rehashed.map(x => x.path) };
  touched++;
}
console.log(`migrated ${touched} records; skipped ${skipped.length}`); if (skipped.length) console.log(skipped.join('\n'));
if (!process.argv.includes('--dry')) fs.writeFileSync(abs('data/audit/gow-skill-reviews.json'), JSON.stringify(total, null, 2) + '\n');
