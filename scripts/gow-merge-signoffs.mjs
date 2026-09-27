/**
 * Coordinator merge (DISPATCH C3): copy lane accept records into data/audit/gow-skill-reviews.json.
 *   node scripts/gow-merge-signoffs.mjs            # merge tasks/active/gow-skill-shards/lane-* /signoff-*.json
 *   node scripts/gow-merge-signoffs.mjs --dry
 * - only decision "accept" records whose sourceDigest is current are merged; a lane accept replaces an older record for the key
 * - the same key accepted in two lane files is rejected (both skipped, reported)
 * - lane membership is checked against lanes.json (warn only: agents may review items handed over by another lane)
 * - writes data/audit/gow-waived-modes.json: every user-waived-mode exclusion across the total ledger (separate record)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { reviewSourceDigest, WAIVED_KIND } from './lib/gow-whole-skill-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = p => path.join(root, p);
const read = p => JSON.parse(fs.readFileSync(abs(p), 'utf8'));
const base = 'tasks/active/gow-skill-shards';
const ledger = read('artifacts/gow-skill-audit/ledger.json');
const rows = new Map(ledger.rows.map(r => [r.key, r]));
const laneOf = new Map(read(`${base}/lanes.json`).lanes.flatMap(l => l.entities.map(e => [e.key, l.id])));
const total = read('data/audit/gow-skill-reviews.json');

const found = new Map();
for (const d of fs.readdirSync(abs(base)).filter(d => d.startsWith('lane-'))) {
  for (const f of fs.readdirSync(abs(`${base}/${d}`)).filter(f => /^signoff-.*\.json$/.test(f))) {
    const p = `${base}/${d}/${f}`;
    for (const r of read(p).reviews ?? []) {
      if (r.decision !== 'accept') continue;
      const list = found.get(r.key) ?? []; list.push({ p, lane: d.slice(5), r }); found.set(r.key, list);
    }
  }
}
const report = { merged: [], replaced: [], stale: [], duplicate: [], laneMismatch: [], compactAccept: [], compactIssue: [] };
const byKey = new Map(total.reviews.map((r, i) => [r.key, i]));
// Compact signoffs (lane-*/signoffs.jsonl): last line per key wins inside a lane; both accept and issue are stored,
// so the ledger shows which entities have a problem. A compact line always replaces an older record for the key.
const compact = new Map();
for (const d of fs.readdirSync(abs(base)).filter(d => d.startsWith('lane-'))) {
  const p = `${base}/${d}/signoffs.jsonl`; if (!fs.existsSync(abs(p))) continue;
  for (const l of fs.readFileSync(abs(p), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(l); const prev = compact.get(e.key);
    if (!prev || Date.parse(e.reviewedAt) >= Date.parse(prev.reviewedAt)) compact.set(e.key, { ...e, lane: d.slice(5) });
  }
}
for (const [key, { lane, ...e }] of compact) {
  if (!rows.has(key)) { report.stale.push(`${key} unknown`); continue; }
  found.delete(key); // compact line supersedes any detailed lane record for the same key
  if (laneOf.has(key) && laneOf.get(key) !== lane) report.laneMismatch.push(`${key}: lane ${laneOf.get(key)} reviewed in ${lane}`);
  (e.decision === 'accept' ? report.compactAccept : report.compactIssue).push(key);
  if (byKey.has(key)) { if (JSON.stringify(total.reviews[byKey.get(key)]) !== JSON.stringify(e)) { total.reviews[byKey.get(key)] = e; report.replaced.push(key); } }
  else { byKey.set(key, total.reviews.length); total.reviews.push(e); report.merged.push(key); }
}
for (const [key, list] of found) {
  if (list.length > 1) { report.duplicate.push(`${key}: ${list.map(x => x.p).join(' , ')}`); continue; }
  const { r, lane, p } = list[0]; const row = rows.get(key);
  if (!row || r.sourceDigest !== reviewSourceDigest(row)) { report.stale.push(`${key} (${p}) sourceDigest`); continue; }
  const badEv = (r.sourceEvidence ?? []).find(e => !fs.existsSync(abs(e.path)));
  if (badEv) { report.stale.push(`${key} (${p}) evidence ${badEv.path}`); continue; }
  if (laneOf.has(key) && laneOf.get(key) !== lane) report.laneMismatch.push(`${key}: lane ${laneOf.get(key)} reviewed in ${lane}`);
  const clean = { ...r, sourceEvidence: (r.sourceEvidence ?? []).map(({ sha256, ...e }) => e) };
  delete clean._reference; delete clean.ledgerFingerprintAtReview;
  if (byKey.has(key)) { if (JSON.stringify(total.reviews[byKey.get(key)]) === JSON.stringify(clean)) continue; total.reviews[byKey.get(key)] = clean; report.replaced.push(key); }
  else { byKey.set(key, total.reviews.length); total.reviews.push(clean); report.merged.push(key); }
}
const waived = total.reviews.flatMap(r => r.format === 'compact' ? (r.decision === 'accept' ? (r.waived ?? []).map(w => ({ key: r.key, name: rows.get(r.key)?.referenceName ?? null, ...w,
  text: w.part === 'clause' ? rows.get(r.key)?.sourceClauses.find(c => c.id === w.id)?.text ?? null : JSON.stringify(rows.get(r.key)?.source.native?.SpellSteps?.[Number(w.id)] ?? null), note: r.note ?? '' })) : []) : [...(r.clauseReviews ?? []).map(c => ['clause', c]), ...(r.nativeStepReviews ?? []).map(s => ['step', s])]
  .filter(([, x]) => x.exclusion?.kind === WAIVED_KIND)
  .map(([part, x]) => ({ key: r.key, name: rows.get(r.key)?.referenceName ?? null, part, id: x.id, mode: x.exclusion.mode, text: x.text ?? rows.get(r.key)?.sourceClauses.find(c => c.id === x.id)?.text ?? null, note: x.note })));
console.log(JSON.stringify({ ...report, counts: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.length])), waivedEntries: waived.length }, null, 1));
if (!process.argv.includes('--dry')) {
  fs.writeFileSync(abs('data/audit/gow-skill-reviews.json'), JSON.stringify(total, null, 2) + '\n');
  fs.writeFileSync(abs('data/audit/gow-waived-modes.json'), JSON.stringify({ schemaVersion: 1,
    rule: 'User ruling 2026-09-28: Boss / Tower(Castle) / Ascension / Delve / Treasure-hunt(gold rush) / event-mode clauses are not implemented and are waived; listed here separately from verified behaviour.',
    entries: waived }, null, 1) + '\n');
}
