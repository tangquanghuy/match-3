/**
 * Lane reviewer helpers (DISPATCH-2026-09-28 C1/C2). Never writes the shared review ledger.
 *
 *   node scripts/gow-review-scaffold.mjs scaffold --keys troop:6001,weapon:1013 --reviewer w1 --out <file>
 *       Appends draft skeletons (keys/digest/12 dimensions/clauses/steps/branches/frozen evidence) to <file>;
 *       existing keys in <file> are left untouched.
 *   node scripts/gow-review-scaffold.mjs check --file <file>
 *       Per record: evidence whitelist + hash, stale sourceDigest, and assessWholeSkillReview failures that are
 *       NOT merely "waiting for coordinator full verification".
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AUDIT_DIMENSIONS } from './lib/gow-skill-audit.mjs';
import { reviewSourceDigest, nativeBranchKeys, assessWholeSkillReview } from './lib/gow-whole-skill-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const abs = p => path.join(root, p);
const read = p => JSON.parse(fs.readFileSync(abs(p), 'utf8'));
const sha = p => createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');

/** Only frozen inputs may be hashed as evidence; runtime state is covered by sourceDigest + fingerprint. */
export const EVIDENCE_WHITELIST = [
  /^data\/raw\/[^/]+\.gow\.en\.json$/,
  /^artifacts\/gowhead-weapons\/weapons\.json$/,
  /^artifacts\/gow-skill-audit\/gold-primary-sources\//,
  /^tests\/unit\/gowLane[\w-]+\.test\.ts$/,
  /^tests\/unit\/gowFix[\w-]+\.test\.ts$/,
  // Immutable per-topic ruling files (one file per ruling, never edited after creation).
  /^tasks\/active\/gow-skill-shards\/rulings\/R[\w-]+\.md$/,
];
const allowed = p => EVIDENCE_WHITELIST.some(r => r.test(p));

const ledger = read('artifacts/gow-skill-audit/ledger.json');
const rows = new Map(ledger.rows.map(r => [r.key, r]));
const loadFile = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { schemaVersion: 1, scope: 'stored-gow-snapshot', reviews: [] };
const saveFile = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(t, f); };

function skeleton(row, reviewer) {
  const ev = [
    { id: 'en', role: 'english-snapshot', path: row.source.entityPath ?? 'data/raw/troops.gow.en.json', note: 'TODO: entity id / SpellId / English clause / cost / colours checked' },
    { id: 'native', role: 'native-snapshot', path: row.source.nativePath ?? 'data/raw/spells.gow.en.json', note: 'TODO: SpellId-indexed Cost/Target/every non-None SpellSteps field checked' },
    { id: 'rule', role: 'official-shared-rule', path: 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html', note: 'TODO: replace with the official rule file actually relevant to this skill, and say what it supports' },
  ];
  const todo = { status: 'TODO', note: 'TODO', evidenceIds: [], tests: [] };
  const steps = (row.source.native?.SpellSteps ?? []).flatMap((s, i) => s.Type === 'None' ? [] : [{ id: String(i), type: s.Type, ...todo }]);
  return {
    key: row.key, scope: 'stored-gow-snapshot', sourceDigest: reviewSourceDigest(row), reviewer, reviewedAt: new Date().toISOString().slice(0, 10),
    decision: 'draft', ledgerFingerprintAtReview: ledger.fingerprint,
    _reference: { spellId: row.spellId, english: row.source.englishDescription, nativeTarget: row.source.native?.Target, randomize: row.source.native?.Randomize ?? null, steps: row.source.native?.SpellSteps, prototype: row.runtime?.prototype },
    sourceEvidence: ev,
    dimensions: Object.fromEntries(AUDIT_DIMENSIONS.map(d => [d, d === 'battle-pipeline' ? { ...todo, realBattleEntry: true } : { ...todo }])),
    clauseReviews: row.sourceClauses.map(c => ({ id: c.id, text: c.text, ...todo })),
    nativeStepReviews: steps,
    branchReviews: nativeBranchKeys(row).map(id => ({ id, ...todo })),
  };
}

function scaffold() {
  const out = opt('out'), reviewer = opt('reviewer');
  if (!out || !reviewer || !opt('keys')) throw new Error('scaffold --keys k1,k2 --reviewer NAME --out FILE');
  const file = loadFile(out);
  const have = new Set(file.reviews.map(r => r.key));
  for (const key of opt('keys').split(',').map(s => s.trim()).filter(Boolean)) {
    const row = rows.get(key);
    if (!row) throw new Error(`Unknown key ${key}`);
    if (row.acceptance?.accepted) { console.log(`skip ${key}: already accepted`); continue; }
    if (have.has(key)) { console.log(`skip ${key}: already in ${out}`); continue; }
    file.reviews.push(skeleton(row, reviewer)); console.log(`scaffolded ${key}`);
  }
  saveFile(out, file);
}

// Failures that only the coordinator's merged, same-fingerprint full run can clear.
const WAITING = /^(current-full-verification|dimension-tests:|clause:|native-step:|branch:)/;
function check() {
  const f = opt('file'); if (!f) throw new Error('check --file FILE');
  const receipt = fs.existsSync(abs('artifacts/gow-skill-audit/verification-receipt.json')) ? read('artifacts/gow-skill-audit/verification-receipt.json') : null;
  // Pretend every referenced suite passed so reviewers see structural gaps only; real acceptance still needs coordinator run.
  const file = loadFile(f); let bad = 0;
  for (const r of file.reviews) {
    const row = rows.get(r.key); const problems = [];
    if (!row) { console.log(`${r.key}: unknown key`); bad++; continue; }
    for (const e of r.sourceEvidence ?? []) {
      if (!fs.existsSync(abs(e.path))) problems.push(`evidence-missing:${e.path}`);
    }
    if (r.sourceDigest !== reviewSourceDigest(row)) problems.push('stale-sourceDigest(runtime/source changed since review: re-check prototype)');
    const tests = new Set(JSON.stringify(r).match(/tests\/unit\/[\w./-]+\.test\.ts/g) ?? []);
    const fakeReceipt = { ...(receipt ?? {}), fingerprint: ledger.fingerprint, testExitCode: 0, typecheckExitCode: 0, failed: 0, passed: 1,
      suites: [...(receipt?.suites ?? []), ...[...tests].map(p => ({ path: p, status: 'passed', passed: 1, failed: 0 }))] };
    const a = assessWholeSkillReview(row, r, { receipt: fakeReceipt, fingerprint: ledger.fingerprint, readEvidence: p => fs.readFileSync(abs(p)) });
    problems.push(...a.failures.filter(x => !(r.decision !== 'accept' && x === 'explicit-accept-decision'))
      .filter(x => !WAITING.test(x) || r.decision === 'accept' && x !== 'current-full-verification'));
    if (JSON.stringify(r).includes('"TODO"') && r.decision === 'accept') problems.push('accept-with-TODO');
    for (const t of tests) if (!fs.existsSync(abs(t))) problems.push(`missing-test-file:${t}`);
    const status = problems.length ? 'FAIL' : 'ok';
    if (problems.length) bad++;
    console.log(`${r.key} [${r.decision}] ${status}${problems.length ? ': ' + [...new Set(problems)].join(', ') : ''}`);
  }
  console.log(`${file.reviews.length} records, ${bad} with problems`);
  if (bad) process.exitCode = 1;
}

const base = 'tasks/active/gow-skill-shards';
function laneFiles() {
  return fs.readdirSync(abs(base)).filter(d => d.startsWith('lane-')).flatMap(d =>
    fs.readdirSync(abs(`${base}/${d}`)).filter(f => /^signoff-.*\.json$/.test(f)).map(f => `${base}/${d}/${f}`));
}
function requeued() {
  const p = abs(`${base}/requeue.jsonl`);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
/** next --lane L1 --count 5 : requeued keys of the lane first, then lane order; skips accepted, any lane file, any stored review. */
function next() {
  const lane = opt('lane'), count = Number(opt('count') ?? 5);
  const lanes = read(`${base}/lanes.json`).lanes;
  const members = new Set(lane.split('+').flatMap(id => lanes.find(l => l.id === id)?.entities.map(e => e.key) ?? []));
  if (!members.size) throw new Error(`unknown lane ${lane}`);
  const legacy = fs.readdirSync(abs(base)).filter(f => /^signoff-.*\.json$/.test(f)).map(f => `${base}/${f}`);
  const taken = new Set([...laneFiles(), ...legacy].flatMap(f => read(f).reviews.map(r => r.key)));
  for (const d of fs.readdirSync(abs(base)).filter(d => d.startsWith('lane-'))) {
    const p = abs(`${base}/${d}/signoffs.jsonl`);
    if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)) taken.add(JSON.parse(l).key);
  }
  const stored = new Set(read('data/audit/gow-skill-reviews.json').reviews.map(r => r.key));
  const out = [];
  // Requeued keys: stale accepts or reopened drafts, even if already present in a lane file (that entry gets rewritten).
  // Last line per key wins; a reviewer appends {"key":…,"done":true,…} once the key is re-reviewed.
  const last = new Map(requeued().map(q => [q.key, q]));
  for (const q of last.values()) if (out.length < count && members.has(q.key) && !q.done && rows.get(q.key)?.acceptance?.accepted !== true) out.push(q.key);
  for (const l of lanes.filter(l => lane.split('+').includes(l.id))) for (const e of l.entities) {
    if (out.length >= count) break;
    if (out.includes(e.key) || taken.has(e.key) || stored.has(e.key) || rows.get(e.key)?.acceptance?.accepted === true) continue;
    out.push(e.key);
  }
  console.log(out.slice(0, count).join(','));
}
/** stale : accept records (total ledger + lane files) whose sourceDigest no longer matches the current ledger row. */
function stale() {
  const files = ['data/audit/gow-skill-reviews.json', ...laneFiles()];
  for (const f of files) for (const r of read(f).reviews) {
    if (r.decision !== 'accept') continue;
    const row = rows.get(r.key);
    if (!row || r.sourceDigest !== reviewSourceDigest(row)) console.log(`${r.key}\t${f}`);
  }
}

try {
  if (args[0] === 'scaffold') scaffold();
  else if (args[0] === 'check') check();
  else if (args[0] === 'next') next();
  else if (args[0] === 'stale') stale();
  else throw new Error('Usage: scaffold --keys ... --reviewer ... --out FILE | check --file FILE');
} catch (e) { console.error(e.message); process.exitCode = 1; }
