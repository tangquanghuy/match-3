// Lane L4b helper: fill scaffolded signoff records from a compact spec module.
// Usage: node fill.mjs <signoff.json> <spec.mjs>
// spec default export: { testFile, reviews: { [key]: { decision, en, native, rule:[path,note] | [[id,role,path,note],...],
//   extra?:[[id,role,path,note]], dims:{ [dim]: [status, note] }, clauses:{id:note|[status,note,exclusion?]},
//   steps:{id:note|[status,note,exclusion?]}, branches:{id:note} } } }
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [file, specPath] = process.argv.slice(2);
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const spec = (await import(pathToFileURL(path.resolve(specPath)).href)).default;
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const r of doc.reviews) {
  const s = spec.reviews[r.key];
  if (!s) continue;
  const test = s.testFile ?? spec.testFile;
  const tests = Array.isArray(test) ? test : [test];
  const rules = Array.isArray(s.rule[0]) ? s.rule : [['rule', 'official-shared-rule', s.rule[0], s.rule[1]]];
  const ev = [
    { id: 'en', role: 'english-snapshot', path: r.sourceEvidence.find(e => e.id === 'en').path, note: s.en },
    { id: 'native', role: 'native-snapshot', path: 'data/raw/spells.gow.en.json', note: s.native },
    ...rules.map(([id, role, p, note]) => ({ id, role, path: p, note })),
    ...(s.extra ?? []).map(([id, role, p, note]) => ({ id, role, path: p, note })),
    ...tests.map((t, i) => ({ id: i ? `laneTest${i + 1}` : 'laneTest', role: 'lane-battle-test', path: t, note: `Lane L4b frozen test file: binding + real castSkill cases for ${r.key}.` })),
  ].map(e => ({ ...e, sha256: sha(e.path) }));
  r.sourceEvidence = ev;
  const allIds = ev.map(e => e.id);
  const srcIds = ['en', 'native'];
  const stepIds = ['native', ...ev.filter(e => e.role === 'lane-battle-test').map(e => e.id)];
  for (const [d, entry] of Object.entries(r.dimensions)) {
    const v = s.dims[d];
    if (!v) throw new Error(`${r.key}: missing dim ${d}`);
    const [status, note] = v;
    Object.assign(entry, { status, note, evidenceIds: status === 'verified' ? allIds : srcIds, tests: status === 'verified' ? tests : [] });
    if (d === 'battle-pipeline') entry.realBattleEntry = true;
  }
  const apply = (list, map, ids, what) => {
    for (const c of list) {
      const v = map[c.id];
      if (v === undefined) throw new Error(`${r.key}: missing ${what} ${c.id}`);
      const [status, note, exclusion] = typeof v === 'string' ? ['verified', v] : v;
      Object.assign(c, { status, note, evidenceIds: exclusion ? [...ids, ...(exclusion.evidenceIds ?? [])] : ids, tests });
      if (exclusion) c.exclusion = { kind: exclusion.kind, mode: exclusion.mode };
      else delete c.exclusion;
    }
  };
  apply(r.clauseReviews, s.clauses, allIds, 'clause');
  apply(r.nativeStepReviews, s.steps, stepIds, 'step');
  apply(r.branchReviews, s.branches, stepIds, 'branch');
  r.decision = s.decision ?? 'accept';
  r.reviewedAt = new Date().toISOString().slice(0, 10);
  if (s.issues) r.openIssues = s.issues; else delete r.openIssues;
}
const tmp = `${file}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
fs.renameSync(tmp, file);
console.log('filled', Object.keys(spec.reviews).length, 'specs into', file);
