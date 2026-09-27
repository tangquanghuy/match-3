// sa-L76 helper: fill scaffolded records in a signoff file from a compact spec module.
// usage: node fill.cjs <signoff.json> <spec.cjs>
// spec.cjs exports [{key, decision, reviewer, en, native, rule:{path,note}, test, testNote, rulings:[{id,path,note}],
//   dims:{name:[status,note]}, clauses:{id:note|['excluded',mode,note]}, steps:{id:...}, branches:{id:note}}]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../../..');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const [file, specFile] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const specs = require(path.resolve(specFile));
const DIMS = ['identity-cost-colors', 'target-count-range', 'base-formula-rounding', 'boost-source-ratio-cap',
  'conditions-probabilities-branches', 'status-duration-immunity', 'gems-types-selection-resolution', 'summon-transform-pools',
  'order-death-retargeting', 'mana-economy-extra-turn', 'display-description', 'battle-pipeline'];
for (const s of specs) {
  const r = doc.reviews.find(r => r.key === s.key);
  if (!r) throw new Error(`no record ${s.key}`);
  const tests = [s.test];
  const ev = [
    { id: 'en', role: 'english-snapshot', path: r.sourceEvidence.find(e => e.id === 'en').path, note: s.en },
    { id: 'native', role: 'native-snapshot', path: 'data/raw/spells.gow.en.json', note: s.native },
    { id: 'rule', role: 'official-shared-rule', path: s.rule.path, note: s.rule.note },
    { id: 'laneTest', role: 'lane-battle-test', path: s.test, note: s.testNote },
    ...(s.rulings ?? []).map(x => ({ id: x.id, role: x.role ?? 'user-ruling', path: x.path, note: x.note })),
  ].map(e => ({ ...e, sha256: sha(e.path) }));
  const ids = ev.map(e => e.id);
  const baseIds = ['en', 'native', 'rule', 'laneTest'];
  r.sourceEvidence = ev;
  r.reviewer = s.reviewer ?? 'sa-L76';
  r.reviewedAt = new Date().toISOString().slice(0, 10);
  r.decision = s.decision ?? 'accept';
  const entry = (v, dflt) => {
    if (v === undefined) v = dflt;
    if (Array.isArray(v) && v[0] === 'excluded') {
      const ruling = (s.rulings ?? [])[0]?.id;
      return { status: 'excluded', exclusion: { kind: 'user-waived-mode', mode: v[1] }, note: v[2], evidenceIds: [...baseIds, ruling].filter(Boolean), tests };
    }
    if (Array.isArray(v) && v[0] === 'TODO') return { status: 'TODO', note: v[1] ?? 'TODO', evidenceIds: baseIds, tests: [] };
    return { status: 'verified', note: v, evidenceIds: baseIds, tests };
  };
  r.dimensions = Object.fromEntries(DIMS.map(d => {
    const v = s.dims?.[d];
    if (v === undefined) throw new Error(`${s.key} missing dim ${d}`);
    const [status, note] = Array.isArray(v) ? v : ['verified', v];
    const o = { status, note, evidenceIds: status === 'verified' ? ids : baseIds, tests: status === 'verified' ? tests : [] };
    if (d === 'battle-pipeline') o.realBattleEntry = true;
    return [d, o];
  }));
  r.clauseReviews = r.clauseReviews.map(c => ({ id: c.id, text: c.text, ...entry(s.clauses?.[c.id]) }));
  r.nativeStepReviews = r.nativeStepReviews.map(st => ({ id: st.id, type: st.type, ...entry(s.steps?.[st.id]) }));
  r.branchReviews = r.branchReviews.map(b => ({ id: b.id, ...entry(s.branches?.[b.id]) }));
  for (const x of [...r.clauseReviews, ...r.nativeStepReviews, ...r.branchReviews]) if (x.note === undefined) throw new Error(`${s.key} missing note ${x.id}`);
  console.log('filled', s.key, r.decision);
}
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
