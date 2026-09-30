// @ts-expect-error Node snapshot read
import fs from 'node:fs';
// @ts-expect-error Node crypto
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Node audit library
import {assessWholeSkillReview,assessCompactSignoff,applyWholeSkillReviews,reviewSourceDigest,nativeBranchKeys} from '../../scripts/lib/gow-whole-skill-reviews.mjs';
// @ts-expect-error Node audit dimensions
import {AUDIT_DIMENSIONS} from '../../scripts/lib/gow-skill-audit.mjs';
interface ReviewPart {
 id?: string; status: string; note: string; evidenceIds: string[]; tests: string[];
 realBattleEntry?: boolean; exclusion?: { kind: string; mode?:string };
}
interface ReviewFixture {
 key: string; scope: string; sourceDigest: string; reviewer: string; reviewedAt: string; decision: string;
 sourceEvidence: {id:string;role:string;path:string;sha256?:string;note:string}[];
 dimensions: Record<string, ReviewPart>;
 clauseReviews: ReviewPart[]; nativeStepReviews: ReviewPart[]; branchReviews: ReviewPart[];
}
function fixture(){
 const row={key:'troop:1',spellId:7001,status:'pending-review',sourceStatus:'native-and-english-snapshot',source:{englishDescription:'Deal damage.',native:{SpellSteps:[{Type:'Damage'}] as Record<string,unknown>[],Randomize:undefined as string|undefined}},runtime:{manaCost:6,prototype:{segments:[]}},bindingChecks:{binding:true},sourceClauses:[{id:'c1',text:'Deal damage.'}],confirmedDifferences:[] as {id:string}[],acceptance:{accepted:false,waived:undefined as {part:string;id:string;mode:string;note:string}[]|undefined},wholeSkillReview:undefined as {failures:string[]}|undefined};
 const data='synthetic independent fixture, not production evidence';const hash=createHash('sha256').update(data).digest('hex');
 const entry={status:'verified',note:'Explicit synthetic gate test',evidenceIds:['en','native','rule'],tests:['tests/unit/fixture.test.ts']};
 const review:ReviewFixture={key:row.key,scope:'stored-gow-snapshot',sourceDigest:reviewSourceDigest(row),reviewer:'gate-test',reviewedAt:'2026-09-26',decision:'accept',sourceEvidence:[['en','english-snapshot'],['native','native-snapshot'],['rule','official-shared-rule']].map(([id,role])=>({id,role,path:`fixture/${id}`,sha256:hash,note:'Synthetic fixture only'})),dimensions:Object.fromEntries(AUDIT_DIMENSIONS.map((d:string)=>[d,{...entry,...(d==='battle-pipeline'?{realBattleEntry:true}:{})}])),clauseReviews:[{id:'c1',...entry}],nativeStepReviews:[{id:'0',...entry}],branchReviews:[{id:'main',...entry}]};
 const receipt={fingerprint:'current',testExitCode:0,typecheckExitCode:0,passed:1,failed:0,suites:[{path:'tests/unit/fixture.test.ts',status:'passed',passed:1,failed:0}]};
 const opts={fingerprint:'current',receipt:receipt as typeof receipt|null,readEvidence:()=>data};
 return {row,review,opts};
}
describe('explicit whole-skill signoff, never compiler/scoped default pass',()=>{
 it('positive synthetic gate fixture has every source/clause/step/dimension and current real-entry evidence',()=>{
  const f=fixture();expect(assessWholeSkillReview(f.row,f.review,f.opts)).toEqual({eligible:true,failures:[]});
  applyWholeSkillReviews([f.row],{...f.opts,reviews:[f.review]});expect(f.row.acceptance).toMatchObject({accepted:true,scope:'stored-gow-snapshot',fingerprint:'current'});
 });
 it('absence of review never changes acceptance',()=>{
  const f=fixture();applyWholeSkillReviews([f.row],{...f.opts,reviews:[]});expect(f.row.acceptance.accepted).toBe(false);
 });
 for(const mutate of [
  (f:ReturnType<typeof fixture>)=>f.review.decision='draft',
  (f:ReturnType<typeof fixture>)=>f.review.scope='latest-official',
  (f:ReturnType<typeof fixture>)=>f.review.reviewer='',
  (f:ReturnType<typeof fixture>)=>delete f.review.dimensions['status-duration-immunity'],
  (f:ReturnType<typeof fixture>)=>f.review.dimensions['battle-pipeline'].realBattleEntry=false,
  (f:ReturnType<typeof fixture>)=>f.review.dimensions['mana-economy-extra-turn'].status='pending',
  (f:ReturnType<typeof fixture>)=>f.review.dimensions['target-count-range'].tests=[],
  (f:ReturnType<typeof fixture>)=>f.review.clauseReviews=[],
  (f:ReturnType<typeof fixture>)=>f.review.nativeStepReviews=[],
  (f:ReturnType<typeof fixture>)=>f.review.branchReviews=[],
  (f:ReturnType<typeof fixture>)=>f.row.confirmedDifferences=[{id:'unresolved'}],
  (f:ReturnType<typeof fixture>)=>f.row.sourceStatus='english-snapshot-only',
  (f:ReturnType<typeof fixture>)=>f.opts.receipt=null,
  (f:ReturnType<typeof fixture>)=>f.opts.receipt!.fingerprint='outdated',
  (f:ReturnType<typeof fixture>)=>f.opts.receipt!.testExitCode=1,
  (f:ReturnType<typeof fixture>)=>f.opts.receipt!.typecheckExitCode=1,
  (f:ReturnType<typeof fixture>)=>f.opts.receipt!.failed=1,
  (f:ReturnType<typeof fixture>)=>f.opts.receipt!.suites[0].status='failed',
  (f:ReturnType<typeof fixture>)=>f.opts.readEvidence=()=>{throw new Error('missing');},
  (f:ReturnType<typeof fixture>)=>f.row.runtime.manaCost=99,
  (f:ReturnType<typeof fixture>)=>f.row.source.native.SpellSteps.push({Type:'CauseBurning'}),
  (f:ReturnType<typeof fixture>)=>f.row.sourceClauses[0].text='Changed source clause.',
  (f:ReturnType<typeof fixture>)=>f.row.status='custom-excluded',
 ])it(`rejects incomplete, stale or incompatible review: ${mutate.toString()}`,()=>{
  const f=fixture();mutate(f);expect(assessWholeSkillReview(f.row,f.review,f.opts).eligible).toBe(false);
  applyWholeSkillReviews([f.row],{...f.opts,reviews:[f.review]});expect(f.row.acceptance.accepted).toBe(false);
 });
 it('duplicate review keys never accept by choosing a convenient record',()=>{
  const f=fixture();applyWholeSkillReviews([f.row],{...f.opts,reviews:[f.review,f.review]});expect(f.row.wholeSkillReview!.failures).toContain('duplicate-review-key');expect(f.row.acceptance.accepted).toBe(false);
 });
 it('native choice/random branches must all be reviewed separately',()=>{
  const f=fixture();f.row.source.native.Randomize='Choose:ABC-DEF';expect(nativeBranchKeys(f.row)).toEqual(['ABC','DEF']);
  f.review.sourceDigest=reviewSourceDigest(f.row);expect(assessWholeSkillReview(f.row,f.review,f.opts).failures).toContain('all-native-branches');
 });
 it('inventory/test-only evidence never substitutes for named official rule provenance',()=>{
  const f=fixture();f.review.sourceEvidence=f.review.sourceEvidence.filter((e:{role:string})=>e.role!=='official-shared-rule');expect(assessWholeSkillReview(f.row,f.review,f.opts).failures).toContain('source-evidence:official-shared-rule');
 });
 it('unsupported exclusions cannot silently remove skill clauses or steps',()=>{
  const f=fixture();f.review.clauseReviews[0]={...f.review.clauseReviews[0],status:'excluded',exclusion:{kind:'engine-not-supported'}};
  f.review.nativeStepReviews[0]={...f.review.nativeStepReviews[0],status:'excluded',exclusion:{kind:'unsupported-status'}};
  const r=assessWholeSkillReview(f.row,f.review,f.opts);expect(r.failures).toContain('explicit-clause-exclusion');expect(r.failures).toContain('explicit-step-exclusion');
 });
 for(const kind of ['unimplemented-mode','ascension-dependent'])it(`a recognized ${kind} label cannot exclude ordinary damage`,()=>{
  const f=fixture();for(const e of [f.review.clauseReviews[0],f.review.nativeStepReviews[0]]){e.status='excluded';e.exclusion={kind};}
  const result=assessWholeSkillReview(f.row,f.review,f.opts);expect(result.failures).toContain('explicit-clause-exclusion');expect(result.failures).toContain('explicit-step-exclusion');
 });
 it('ascension in a damage modifier does not remove its base damage from acceptance',()=>{
  const f=fixture();f.row.source.native.SpellSteps[0]={Type:'Damage',Primarypower:true,StatusModifier:'MultiplyForAscensionBoss',Amount:4};
  f.row.sourceClauses[0].text='Deal damage to an Enemy, multiplied based on Ascension.';f.review.sourceDigest=reviewSourceDigest(f.row);
  for(const e of [f.review.clauseReviews[0],f.review.nativeStepReviews[0]]){e.status='excluded';e.exclusion={kind:'ascension-dependent'};}
  const result=assessWholeSkillReview(f.row,f.review,f.opts);expect(result.failures).toContain('explicit-clause-exclusion');expect(result.failures).toContain('explicit-step-exclusion');
 });
 it('a standalone ascension multiplier clause may be excluded without excluding verified base damage',()=>{
  const f=fixture();f.row.sourceClauses.push({id:'c2',text:'The multiplier increases based on Ascension.'});
  f.review.clauseReviews.push({...f.review.clauseReviews[0],id:'c2',status:'excluded',exclusion:{kind:'ascension-dependent'}});f.review.sourceDigest=reviewSourceDigest(f.row);
  expect(assessWholeSkillReview(f.row,f.review,f.opts).eligible).toBe(true);
 });
 it('user-waived-mode (2026-09-28 ruling) may exclude a Boss/Tower/Ascension clause and step, and is recorded as waived',()=>{
  const f=fixture();f.row.source.native.SpellSteps[0]={Type:'Damage',Primarypower:true,StatusModifier:'MultiplyForAscensionBoss',Amount:4};
  f.row.sourceClauses[0].text='If they are a Boss, deal 3x - 5x damage, based on my Ascensions.';f.review.sourceDigest=reviewSourceDigest(f.row);
  for(const e of [f.review.clauseReviews[0],f.review.nativeStepReviews[0]]){e.status='excluded';e.exclusion={kind:'user-waived-mode',mode:'boss'};}
  expect(assessWholeSkillReview(f.row,f.review,f.opts)).toEqual({eligible:true,failures:[]});
  applyWholeSkillReviews([f.row],{...f.opts,reviews:[f.review]});
  expect(f.row.acceptance.waived).toEqual([{part:'clause',id:'c1',mode:'boss',note:expect.any(String)},{part:'step',id:'0',mode:'boss',note:expect.any(String)}]);
 });
 it('user-waived-mode needs a mode that the source text actually references',()=>{
  const f=fixture();for(const e of [f.review.clauseReviews[0],f.review.nativeStepReviews[0]]){e.status='excluded';e.exclusion={kind:'user-waived-mode',mode:'boss'};}
  const r=assessWholeSkillReview(f.row,f.review,f.opts);expect(r.failures).toContain('explicit-clause-exclusion');expect(r.failures).toContain('explicit-step-exclusion');
  f.row.sourceClauses[0].text='Deal damage to a Boss.';f.review.sourceDigest=reviewSourceDigest(f.row);f.review.clauseReviews[0].exclusion={kind:'user-waived-mode'};
  expect(assessWholeSkillReview(f.row,f.review,f.opts).failures).toContain('explicit-clause-exclusion');
 });
 it('evidence files are not content-hashed: an edited evidence file keeps the record eligible',()=>{
  const f=fixture();f.review.sourceEvidence[0].sha256='outdated';delete f.review.sourceEvidence[1].sha256;
  expect(assessWholeSkillReview(f.row,f.review,f.opts)).toEqual({eligible:true,failures:[]});
 });
 const compact=(o:Record<string,unknown>={})=>({format:'compact',key:'troop:1',decision:'accept',reviewer:'sa-x',reviewedAt:'2026-09-28T10:00:00Z',tests:['tests/unit/fixture.test.ts'],...o});
 it('compact signoff: one line with key/decision/reviewer/time/test is enough and is applied as accepted',()=>{
  const f=fixture();const r=compact();
  expect(assessCompactSignoff(f.row,r,f.opts)).toEqual({eligible:true,failures:[]});
  applyWholeSkillReviews([f.row],{...f.opts,reviews:[r]});expect(f.row.acceptance).toMatchObject({accepted:true,reviewer:'sa-x',tests:['tests/unit/fixture.test.ts']});
 });
 for(const [label,mut,code] of [
  ['issue decision',{decision:'issue',issue:'X-1'},'explicit-accept-decision'],
  ['no test',{tests:[]},'real-cast-tests'],
  ['test not in passing receipt',{tests:['tests/unit/other.test.ts']},'real-cast-tests'],
  ['no reviewer',{reviewer:''},'named-dated-review'],
 ] as const)it(`compact signoff rejected: ${label}`,()=>{
  const f=fixture();expect(assessCompactSignoff(f.row,compact(mut),f.opts).failures).toContain(code);
 });
 it('compact signoff is revoked by a later CHANGES.jsonl entry for the same spell or key, not by an earlier one',()=>{
  const f=fixture();
  expect(assessCompactSignoff(f.row,compact(),{...f.opts,changes:[{at:'2026-09-28T09:00:00Z',spells:['7001']}]}).eligible).toBe(true);
  expect(assessCompactSignoff(f.row,compact(),{...f.opts,changes:[{at:'2026-09-28T11:00:00Z',spells:['7001']}]}).failures).toContain('changed-after-signoff');
  expect(assessCompactSignoff(f.row,compact(),{...f.opts,changes:[{at:'2026-09-28T11:00:00Z',keys:['troop:1']}]}).failures).toContain('changed-after-signoff');
  expect(assessCompactSignoff(f.row,compact(),{...f.opts,changes:[{at:'2026-09-28T11:00:00Z',spells:['9999']}]}).eligible).toBe(true);
 });
 it('compact waiver must match the R000 mode in the source text',()=>{
  const f=fixture();f.row.sourceClauses[0].text='If they are a Boss, deal 3x damage.';
  expect(assessCompactSignoff(f.row,compact({waived:[{part:'clause',id:'c1',mode:'boss'}]}),f.opts).eligible).toBe(true);
  expect(assessCompactSignoff(f.row,compact({waived:[{part:'clause',id:'c1',mode:'tower'}]}),f.opts).failures).toContain('waiver:clause:c1');
 });
 it('ordinary Boss damage is not an unimplemented-mode exclusion',()=>{
  const f=fixture();f.row.sourceClauses[0].text='Deal damage to a Boss.';f.review.sourceDigest=reviewSourceDigest(f.row);
  f.review.clauseReviews[0].status='excluded';f.review.clauseReviews[0].exclusion={kind:'unimplemented-mode'};
  expect(assessWholeSkillReview(f.row,f.review,f.opts).failures).toContain('explicit-clause-exclusion');
 });

 it('nine Gold records remain drafts while the two reviewed first-two weapons have complete explicit decisions',()=>{
  const stored=JSON.parse(fs.readFileSync('data/audit/gow-skill-reviews.json','utf8'));
  // Fix round A (2026-09-28) re-reviewed some of these keys with compact one-line decisions; those replace the
  // legacy detailed drafts and are validated by the compact gate, so only the remaining detailed records are pinned.
  const draft=stored.reviews.filter((r:{key:string;format?:string;scopedEvidence?:{testPath:string}[]})=>r.format!=='compact'&&(['weapon:1008','weapon:1023'].includes(r.key)||r.scopedEvidence?.some((e:{testPath:string})=>e.testPath==='tests/unit/gowGoldOwnershipAudit.test.ts')));
  expect(draft.length).toBeGreaterThanOrEqual(2);expect(draft.length).toBeLessThanOrEqual(11);expect(new Set(draft.map((r:{key:string})=>r.key)).size).toBe(draft.length);
  for(const r of draft){
   expect(r.decision).toBe(['weapon:1008','weapon:1023'].includes(r.key)?'accept':'draft');
   expect(r.scope).toBe('stored-gow-snapshot');
   if(r.decision==='draft')expect(r.pendingReasons.length).toBeGreaterThan(0);
   expect(Object.keys(r.dimensions).sort()).toEqual([...AUDIT_DIMENSIONS].sort());
   expect(r.clauseReviews.length).toBeGreaterThan(0);expect(r.nativeStepReviews.length).toBeGreaterThan(0);expect(r.branchReviews.length).toBeGreaterThan(0);
  }
 });

});
