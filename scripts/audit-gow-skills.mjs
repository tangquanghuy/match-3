/** Full entity inventory + snapshot comparison backlog. node scripts/audit-gow-skills.mjs [--check] */
import fs from 'node:fs';
import { attachScopedEvidence } from './lib/gow-scoped-evidence.mjs';
import { applyWholeSkillReviews, REVIEW_PATH } from './lib/gow-whole-skill-reviews.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { buildAuditRows, summarizeAudit, AUDIT_DIMENSIONS } from './lib/gow-skill-audit.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const output = path.join(root, 'artifacts/gow-skill-audit');
const bundle = await build({ stdin: { contents: `
import {registerSkillLibrary,SKILL_OVERRIDES} from './src/engine/skills/library';
import {TROOPS} from './src/data/troops';
import {COMMUNITY_TROOPS} from './src/data/communityTroops';
import weapons from './src/data/weapons.json';
import {spellDescription} from './src/data/combatText';
import {runSkillAuditProbes} from './scripts/lib/gow-skill-probes';
const lib = new Map(); registerSkillLibrary(lib);
export default {prototypes:Object.fromEntries(lib),troops:TROOPS,
weapons:weapons.map(w=>({...w,spell:{...w.spell,description:spellDescription(w.spell.id,w.spell.description)}})),
communityIds:COMMUNITY_TROOPS.map(t=>t.id),overrides:Object.keys(SKILL_OVERRIDES),probes:runSkillAuditProbes()};`,
  resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false,
  loader: { '.png': 'empty', '.webp': 'empty' } });
const { default: runtime } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const rows = buildAuditRows({ ...runtime,
  originalTroops: read('data/raw/troops.gow.en.json').troops,
  originalWeapons: read('artifacts/gowhead-weapons/weapons.json').weapons,
  nativeSpells: read('data/raw/spells.gow.en.json').spells,
  weaponMetadata: read('src/data/weapon-skill-meta.json'),
});
for (const row of rows) {
  row.evidence = runtime.probes.filter(p => p.key === row.key);
  for (const issue of row.confirmedDifferences) row.dimensions[issue.dimension] = 'difference-confirmed';
}
const summary = summarizeAudit(rows);
summary.probeCriteria = runtime.probes.length;
summary.probeCriteriaMatching = runtime.probes.filter(p => p.criterionMatches).length;
summary.probeCriteriaDifferent = runtime.probes.filter(p => !p.criterionMatches).length;
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
  const p = `${dir}/${e.name}`;
  return e.isDirectory() ? walk(p) : /\.(?:ts|json)$/.test(p) ? [p] : [];
});
const files = [...new Set([
  'docs/gow-mana-burn-and-frozen-review.md',
  'docs/gow-musketeer-reflect-target-review.md',
  'artifacts/gow-skill-audit/gold-primary-sources/official-reflect-4-5.json',
  'docs/gow-cast-turn-lifecycle-review.md',
  '.kiro/specs/combat-mechanics/DECISIONS.md',
  '.kiro/specs/combat-mechanics/ACCEPTANCE.md',
  'docs/gow-reposition-stone-review.md',
  'artifacts/gow-skill-audit/gold-primary-sources/official-frozen-1-0-9.json',
  'artifacts/gow-skill-audit/gold-primary-sources/official-mana-burn-2-0.html',
  'artifacts/gow-skill-audit/gold-primary-sources/official-3-2-mana-burn-submerge.json',
  REVIEW_PATH, 'scripts/lib/gow-whole-skill-reviews.mjs', 'docs/gow-gold-ownership-review.md',
  'artifacts/gow-skill-audit/gold-primary-sources/57352.json',
  'artifacts/gow-skill-audit/gold-primary-sources/update-9-4-patch-notes.html',
  'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html',
  'artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html',
  'scripts/check-gow-9-4-weapon-costs.mjs',
  'artifacts/gow-skill-audit/official-9-4-weapon-cost-screen.json',
  'docs/gow-official-9-4-weapon-cost-screen.md',
  'docs/gow-submerged-rule-review.md',
  'docs/gow-first-two-weapon-review.md',
  ...walk('tests'), 'package.json', 'package-lock.json', 'vitest.config.ts', 'tsconfig.json',
  'scripts/lib/gow-native-source.mjs', 'scripts/lib/gow-life-oracle.mjs', 'scripts/build-gow-life-rules.mjs', 'docs/gow-life-semantics-review.md', 'docs/gow-gain-and-mongo-review.md', 'scripts/lib/gow-multi-target-oracle.mjs', 'scripts/lib/gow-per-ally-oracle.mjs', 'scripts/lib/gow-scoped-evidence.mjs',
  'scripts/lib/gow-weapon-desc-corrections.mjs',
  'scripts/_weapon_pools.mjs', 'scripts/build_troops.mjs', 'scripts/build_weapons.mjs',
  'scripts/check-gow-regeneration.mjs', 'scripts/verify-gow-snapshot.mjs',
  ...walk('src/engine'), ...walk('src/data'), ...walk('src/render'), ...walk('src/session'), ...walk('src/meta'), ...walk('scripts/lib'),
  'data/raw/troops.gow.en.json', 'data/raw/spells.gow.en.json', 'artifacts/gowhead-weapons/weapons.json',
  'scripts/audit-gow-skills.mjs', 'scripts/lib/gow-skill-audit.mjs', 'scripts/lib/gow-skill-probes.ts',
  'tests/helpers/damageFixture.ts', 'tests/unit/gowSkillAcceptanceAudit.test.ts', 'docs/gow-skill-acceptance-plan.md',
])].sort();
const sources = files.map(p => ({ path: p, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex') }));
const fingerprint = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
let receipt = null;
const receiptPath = path.join(output, 'verification-receipt.json');
if(fs.existsSync(receiptPath)) {
  const candidate = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const reportPath = path.join(output, 'vitest-results.json');
  const hash = fs.existsSync(reportPath) ? createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex') : null;
  if(candidate.fingerprint===fingerprint && candidate.resultSha256===hash) receipt=candidate;
}
Object.assign(summary, attachScopedEvidence(rows, receipt));
Object.assign(summary, applyWholeSkillReviews(rows,{reviews:read(REVIEW_PATH).reviews,receipt,fingerprint,readEvidence:p=>{
 const resolved=path.resolve(root,p);if(!resolved.startsWith(root+path.sep))throw new Error('Evidence must remain inside project');return fs.readFileSync(resolved);
}}));
Object.assign(summary,summarizeAudit(rows));
const originalTroopIds = new Set(runtime.troops.filter(t => !runtime.communityIds.includes(t.id)).map(t => t.id));
const sourceOnlyTroops = read('data/raw/troops.gow.en.json').troops.filter(t => !originalTroopIds.has(t.id))
  .map(t => ({ id: t.id, name: t.name_localized, spellId: t.stats.spell.id, status: 'not-in-project-roster' }));
const ledger = { schemaVersion: 2, generatedAt: new Date().toISOString(), fingerprint,
  scope: 'Every installed troop and weapon, separate per entity even when sharing a spell. Inventory and scoped discrepancy probes, NOT complete original-rule acceptance.',
  baseline: { kind: 'repository-source-snapshots', provider: 'gowhead.com', latestOfficialVersionVerified: false,
    weaponFetchedAt: read('artifacts/gowhead-weapons/weapons.json').fetchedAt,
    notes: 'English and native extracted snapshots are independent of the compiled project, but are not a live official API or sufficient evidence for hidden mechanics.' },
  exclusions: { customEntityIds: runtime.communityIds, allowedClauseCategories: ['unimplemented-mode', 'ascension-dependent'],
    appliedOriginalClauses: [], rule: 'Apply only to an identified clause with rationale. Do not exclude a whole skill, all Boss effects, ordinary rewards, or tempering by keyword.' },
  acceptanceDimensions: AUDIT_DIMENSIONS, summary, sources, sourceOnlyTroops, rows };
fs.mkdirSync(output, { recursive: true });
const write = (name, content) => fs.writeFileSync(path.join(output, name), content);
write('ledger.json', JSON.stringify(ledger, null, 2) + '\n');
write('summary.json', JSON.stringify({ generatedAt: ledger.generatedAt, fingerprint, scope: ledger.scope, baseline: ledger.baseline, summary }, null, 2) + '\n');
write('probes.json', JSON.stringify(runtime.probes, null, 2) + '\n');
const csv = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
write('checklist.csv', '\uFEFF' + [
  ['key','kind','name','spellId','status','sourceStatus','costMatch','colorMatch','compilerFidelity','confirmedDifferences','reviewCandidates','originalEnglish','currentDescription'],
  ...rows.map(r => [r.key,r.kind,r.name,r.spellId,r.status,r.sourceStatus,r.bindingChecks.manaCost,r.bindingChecks.manaColors,
    r.compilerMetadata?.fidelity,r.confirmedDifferences.map(i=>`${i.expected} / current: ${i.actual}`).join('; '),
    r.candidates.map(c=>c.note).join('; '),r.source.englishDescription,r.runtime.description]),
].map(r => r.map(csv).join(',')).join('\r\n') + '\r\n');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = { 'custom-excluded':'Custom', 'pending-review':'Pending', 'differences-confirmed':'Differences confirmed', 'source-missing':'Missing source', 'accepted-snapshot':'Accepted (snapshot)' };
const priority = r => r.confirmedDifferences.length ? 0 : r.sourceStatus === 'missing-source' ? 1 : r.compilerMetadata?.fidelity === 'partial' ? 2 : r.candidates.some(c=>c.code==='priority-override') ? 3 : 4;
const ordered = [...rows].sort((a,b) => priority(a)-priority(b) || a.kind.localeCompare(b.kind) || a.entityId-b.entityId);
write('review.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>GoW skill signoff</title>
<style>body{font:15px/1.65 system-ui;margin:24px;background:#131923;color:#e0e6ef}h1{font-size:25px}input,select{padding:9px;margin:5px;border-radius:5px}article{border:1px solid #39465c;padding:15px;margin:12px 0;border-radius:8px}summary{cursor:pointer}small{color:#b3c1d7}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0d1119;padding:10px}.warn{color:#ffd498}li{margin:5px 0}[hidden]{display:none!important}</style>
<h1>GoW troop and weapon skill signoff</h1><p>Original troops ${summary.originalTroops} / weapons ${summary.weapons} / custom excluded ${summary.customExcluded} / accepted ${summary.accepted} of ${summary.originalEntities}</p>
<p class="warn">Source baseline is a stored snapshot, not a live official API. Partial probes and compiler metadata do not constitute whole-skill acceptance.</p>
<p><small>Generated: ${esc(ledger.generatedAt)} / fingerprint: ${fingerprint}. Full rows: ledger.json, checklist.csv, probes.json.</small></p>
<input id="q" placeholder="Search name, ID, or description" size="35"><select id="kind"><option value="">All kinds</option><option value="troop">Troops</option><option value="weapon">Weapons</option></select>
<select id="status"><option value="">All statuses</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><span id="count"></span>
<section>${ordered.map(r=>`<article data-kind="${r.kind}" data-status="${r.status}"><details><summary><b>${esc(r.name)}</b> / ${r.kind} ${r.entityId} / spell ${r.spellId} / ${labels[r.status]??esc(r.status)}</summary>
<p><b>Original English:</b> ${esc(r.source.englishDescription ?? 'No original English source')}</p><p><b>Current description:</b> ${esc(r.runtime.description)}</p>
${r.confirmedDifferences.length ? '<h3 class="warn">Confirmed differences (stored snapshot)</h3><ul>'+r.confirmedDifferences.map(i=>`<li>Expected ${esc(i.expected)} / current ${esc(i.actual)}</li>`).join('')+'</ul>' : ''}
<p>Original source: ${esc(r.sourceStatus)} / compiler: ${esc(r.compilerMetadata?.fidelity ?? 'n/a')} / accepted: ${r.acceptance?.accepted===true?'yes':'no'}</p>
<p><b>Review candidates</b></p><ul>${r.candidates.map(c=>`<li>${esc(c.note)}</li>`).join('')}</ul>
<pre>${esc(JSON.stringify({binding:r.bindingChecks,dimensions:r.dimensions,clauses:r.sourceClauses,review:r.wholeSkillReview},null,2))}</pre></details></article>`).join('')}</section>
<script>const q=document.querySelector('#q'),k=document.querySelector('#kind'),s=document.querySelector('#status'),count=document.querySelector('#count');function filter(){let n=0;document.querySelectorAll('article').forEach(a=>{a.hidden=(k.value&&a.dataset.kind!==k.value)||(s.value&&a.dataset.status!==s.value)||(q.value&&!a.textContent.toLowerCase().includes(q.value.toLowerCase()));if(!a.hidden)n++});count.textContent=' Showing '+n;}[q,k,s].forEach(el=>el.addEventListener(el===q?'input':'change',filter));filter();</script>`);
const md = [
  '# GoW skill signoff progress', '',
  `Generated: ${ledger.generatedAt}; source fingerprint: ${fingerprint}.`,
  'Baseline: stored English and native spell snapshots, not a live official API.', '',
  '| Item | Count |', '|---|---:|',
  `| Original troops | ${summary.originalTroops} |`, `| Original weapons | ${summary.weapons} |`,
  `| Custom excluded | ${summary.customExcluded} |`,
  `| Original entities | ${summary.originalEntities} |`,
  `| Accepted whole skills | ${summary.accepted} / ${summary.originalEntities} |`,
  `| Review records | ${summary.wholeSkillReviewRecords} |`,
  `| Eligible reviews | ${summary.wholeSkillReviewEligible} |`,
  `| Confirmed difference entities | ${summary.confirmedDifferenceEntities} |`,
  `| Remaining pending reviews | ${summary.pendingReview} |`, '',
  receipt ? `Full regression: ${receipt.passed} passed, ${receipt.failed} failed; TypeScript exit code ${receipt.typecheckExitCode}.` : 'No full regression receipt for current source fingerprint.', '',
  '## Evidence and limitations', '',
  '- Per-entity reviews: `data/audit/gow-skill-reviews.json`; drafts are not accepted.',
  '- Full acceptance requires matching source digest, independent English/native source, file hashes, all 12 dimensions, every native step and branch, real-cast tests and a passing same-fingerprint regression.',
  '- Mode- and ascension-dependent exclusions must be scoped to actual source clauses.',
  '- Partial battle probes and scoped checks never promote an entity to whole-skill accepted.', '',
  '## Confirmed differences', '',
  '| Entity | Spell | Expected from snapshot | Runtime |', '|---|---:|---|---|',
  ...ordered.flatMap(r=>r.confirmedDifferences.map(i=>`| ${r.kind} ${r.entityId} | ${r.spellId} | ${String(i.expected).replaceAll('|','\\|')} | ${String(i.actual).replaceAll('|','\\|')} |`)), '',
  '## Files', '',
  '- `artifacts/gow-skill-audit/review.html`: searchable entity listing.',
  '- `artifacts/gow-skill-audit/checklist.csv`: sortable entity list.',
  '- `artifacts/gow-skill-audit/ledger.json`: source, source clauses, runtime, review failures and fingerprint.',
  '- `artifacts/gow-skill-audit/probes.json`: scoped cast probes.', '',
  '```powershell', 'node scripts/verify-gow-snapshot.mjs', 'node scripts/audit-gow-skills.mjs', 'node scripts/audit-gow-skills.mjs --check', '```',
];
fs.writeFileSync(path.join(root, 'docs/gow-skill-acceptance-progress.md'), md.join('\n') + '\n');
console.log(JSON.stringify({ output: 'artifacts/gow-skill-audit', summary }, null, 2));
if (process.argv.includes('--check') && !summary.complete) process.exitCode = 1;
