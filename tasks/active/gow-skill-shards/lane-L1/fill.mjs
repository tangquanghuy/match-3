// Lane L5 helper: fill scaffolded signoff records from a compact spec (lane-owned, not evidence).
//   node tasks/active/gow-skill-shards/lane-L5/fill.mjs <signoff.json> <spec.json>
// spec: { "<key>": { decision, test, en, native, rule:{path,note}, extra:[{id,role,path,note}],
//   dims:{<dim>:[status,note]}, clauses:{<id>:[status,note,mode?]}, steps:{<id>:[status,note,mode?]},
//   branches:{<id>:[status,note]} } }
// status 'v' = verified, 'na' = not-applicable, 'x' = excluded (user-waived-mode; mode required).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const [file, specFile] = process.argv.slice(2);
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const S = { v: 'verified', na: 'not-applicable', x: 'excluded' };
for (const [key, s] of Object.entries(spec)) {
  const r = doc.reviews.find(x => x.key === key);
  if (!r) throw new Error(`no record ${key}`);
  const ev = r.sourceEvidence.filter(e => ['en', 'native', 'rule'].includes(e.id));
  const en = ev.find(e => e.id === 'en'); en.note = s.en;
  const nat = ev.find(e => e.id === 'native'); nat.note = s.native;
  const rule = ev.find(e => e.id === 'rule');
  if (s.rule) { rule.path = s.rule.path; rule.note = s.rule.note; rule.sha256 = sha(s.rule.path); }
  ev.push({ id: 'laneTest', role: 'lane-battle-test', path: s.test, note: s.testNote ?? `${key}: real TurnEngine.castSkill both sides + boundaries`, sha256: sha(s.test) });
  for (const x of s.extra ?? []) ev.push({ ...x, sha256: sha(x.path) });
  r.sourceEvidence = ev;
  const ids = ev.map(e => e.id);
  const base = ['en', 'native', 'rule', 'laneTest'];
  const entry = ([st, note, mode], extraIds = []) => {
    const o = { status: S[st] ?? st, note };
    if (o.status === 'excluded') o.exclusion = { kind: 'user-waived-mode', mode };
    o.evidenceIds = o.status === 'excluded' ? ids : [...base, ...extraIds.filter(i => ids.includes(i))];
    o.tests = o.status === 'not-applicable' ? [] : [s.test];
    return o;
  };
  const extraIds = (s.extra ?? []).map(x => x.id);
  for (const [d, v] of Object.entries(s.dims)) {
    if (!r.dimensions[d]) throw new Error(`${key} unknown dim ${d}`);
    r.dimensions[d] = { ...entry(v, extraIds), ...(d === 'battle-pipeline' ? { realBattleEntry: true } : {}) };
  }
  const fillList = (list, m, what) => {
    for (const it of list) {
      const v = m?.[it.id];
      if (!v) throw new Error(`${key} missing ${what} ${it.id}`);
      Object.assign(it, entry(v, extraIds));
      if (it.status !== 'excluded') delete it.exclusion;
    }
  };
  fillList(r.clauseReviews, s.clauses, 'clause');
  fillList(r.nativeStepReviews, s.steps, 'step');
  fillList(r.branchReviews, s.branches, 'branch');
  if (s.decision) r.decision = s.decision;
  r.reviewedAt = new Date().toISOString().slice(0, 10);
  if (JSON.stringify(r.dimensions).includes('"TODO"')) throw new Error(`${key} dims left TODO`);
}
const t = `${file}.tmp`; fs.writeFileSync(t, JSON.stringify(doc, null, 2) + '\n'); fs.renameSync(t, file);
console.log('filled', Object.keys(spec).join(','));
