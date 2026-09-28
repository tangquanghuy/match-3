/** Explicit persistent per-entity signoff. No inventory, compiler or scoped check promotes a row. */
import {createHash} from 'node:crypto';
import {AUDIT_DIMENSIONS} from './gow-skill-audit.mjs';
export const REVIEW_PATH='data/audit/gow-skill-reviews.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function reviewSourceDigest(row){
 return sha(JSON.stringify({key:row.key,spellId:row.spellId,source:row.source,runtime:row.runtime,bindingChecks:row.bindingChecks,clauses:row.sourceClauses.map(c=>({id:c.id,text:c.text}))}));
}
export function nativeBranchKeys(row){
 const random=row.source.native?.Randomize;
 return random?String(random).replace(/^Choose:/,'').split('-'):['main'];
}
const nonempty=s=>typeof s==='string'&&s.trim().length>0;
function exactKeys(items,keys){return Array.isArray(items)&&items.length===keys.length&&new Set(items.map(x=>x.id)).size===keys.length&&keys.every(k=>items.some(x=>x.id===k));}
/** Exclusions apply to an actual source clause/step, not a convenient label.
 * A base damage/buff/reward step with an ascension modifier is still in scope. */
/** User ruling 2026-09-28: game modes/targets not implemented in this project (Boss, Tower/Castle, Ascension,
 * Delve/Faction/Treasure Hunt/gold-rush, events) are waived: the referencing clause/step may be excluded even when
 * it carries damage. Every such exclusion is listed separately in data/audit/gow-waived-modes.json. */
export const WAIVED_MODES={
 boss:/\bBoss(?:es)?\b|Boss/,tower:/\bTowers?\b|Castle/,ascension:/ascen(?:sion|ded)/i,
 delve:/\b(?:Delve|Faction)s?\b/i,'treasure-hunt':/Treasure Hunt|Gold Rush|淘金/i,
 event:/\b(?:Arena|Raid|Invasion|Guild Wars|World Event|Journey|Bounty|Pet Rescue|Doom)\b/i,
};
export const WAIVED_KIND='user-waived-mode';
export const EXCLUSION_KINDS=['unimplemented-mode','ascension-dependent',WAIVED_KIND];
function sourceAllowsExclusion(source,kind,isNative,mode){
 const text=isNative?JSON.stringify(source):source?.text??'';
 if(kind===WAIVED_KIND)return Object.hasOwn(WAIVED_MODES,mode??'')&&WAIVED_MODES[mode].test(text);
 if(kind==='ascension-dependent'){
  if(!/ascens(?:ion|ionBoss|ionCastle)|ascended/i.test(text))return false;
 }else if(kind==='unimplemented-mode'){
  // Boss, Doom and Tower are ordinary target/race conditions, not proof of a mode.
  if(!/\b(?:Arena|Delve|Raid Boss event|Invasion event|Guild Wars|World Event|Journey event)\b/i.test(text))return false;
 }else return false;
 if(isNative)return source?.Primarypower!==true&&!/^(?:Damage|TrueDamage|Splash.*Damage|Increase.*|Heal|Give.*|Take.*|CreateGems|DestroyGems|TransformGems|Summoning.*|ExtraTurn|Cause.*)$/.test(source?.Type??'');
 // Whole clauses containing ordinary battle actions retain those actions.
 return !/\b(?:deal|damage|gain|give|steal|summon|create|destroy|explode|convert|transform|heal|restore|cleanse|enchant|barrier|extra turn)\b/i.test(text);
}
/** readEvidence(path) returns raw file bytes. File existence and referenced role are mandatory.
 * No file content hash (decision 2026-09-28): the skill's own runtime is bound by sourceDigest, and test evidence by the
 * same-fingerprint full-run receipt; hashing whole source/test files only invalidated unrelated records on every edit. */
export function assessWholeSkillReview(row,review,{receipt,fingerprint,readEvidence}){
 const failures=[];const fail=(condition,code)=>{if(!condition)failures.push(code);};
 fail(review?.key===row.key,'entity-key');
 fail(row.status!=='custom-excluded','custom-out-of-scope');
 fail(review?.sourceDigest===reviewSourceDigest(row),'changed-source-or-runtime');
 fail(review?.scope==='stored-gow-snapshot','explicit-snapshot-scope');
 fail(nonempty(review?.reviewer)&&nonempty(review?.reviewedAt),'named-dated-review');
 fail(review?.decision==='accept','explicit-accept-decision');
 fail(row.confirmedDifferences.length===0,'confirmed-differences');
 fail(Object.values(row.bindingChecks).every(v=>v!==false),'binding-identity-cost-colors');
 fail(row.sourceStatus==='native-and-english-snapshot','independent-snapshot-sources');
 fail(receipt?.fingerprint===fingerprint&&receipt?.testExitCode===0&&receipt?.typecheckExitCode===0&&receipt?.failed===0&&receipt?.passed>0,'current-full-verification');
 const evidence=new Map();
 for(const e of review?.sourceEvidence??[]){
  let bytes;try{bytes=readEvidence(e.path);}catch{bytes=null;}
  if(nonempty(e.id)&&nonempty(e.role)&&nonempty(e.note)&&bytes&&!evidence.has(e.id))evidence.set(e.id,e);
 }
 for(const role of ['english-snapshot','native-snapshot','official-shared-rule'])fail([...evidence.values()].some(e=>e.role===role),`source-evidence:${role}`);
 const hasEvidence=entry=>Array.isArray(entry.evidenceIds)&&entry.evidenceIds.length>0&&entry.evidenceIds.every(id=>evidence.has(id));
 const testPass=entry=>Array.isArray(entry.tests)&&entry.tests.length>0&&entry.tests.every(p=>receipt?.suites?.some(s=>s.path===p&&s.status==='passed'&&s.failed===0&&s.passed>0));
 const dimensions=review?.dimensions??{};
 fail(Object.keys(dimensions).length===AUDIT_DIMENSIONS.length&&AUDIT_DIMENSIONS.every(d=>Object.hasOwn(dimensions,d)),'all-twelve-dimensions');
 for(const d of AUDIT_DIMENSIONS){
  const entry=dimensions[d];
  fail(!!entry&&['verified','not-applicable'].includes(entry.status)&&nonempty(entry.note)&&hasEvidence(entry),`dimension:${d}`);
  if(entry?.status==='verified')fail(testPass(entry),`dimension-tests:${d}`);
  if(d==='battle-pipeline')fail(entry?.status==='verified'&&entry?.realBattleEntry===true, 'real-battle-entry');
 }
 const clauses=review?.clauseReviews??[];
 fail(row.sourceClauses.length>0&&exactKeys(clauses,row.sourceClauses.map(c=>c.id)),'all-source-clauses');
 for(const c of clauses){
  if(c.status==='excluded'){
   fail(EXCLUSION_KINDS.includes(c.exclusion?.kind)&&nonempty(c.note)&&hasEvidence(c)&&sourceAllowsExclusion(row.sourceClauses.find(x=>x.id===c.id),c.exclusion?.kind,false,c.exclusion?.mode),'explicit-clause-exclusion');
  }else fail(c.status==='verified'&&nonempty(c.note)&&hasEvidence(c)&&testPass(c),`clause:${c.id}`);
 }
 const steps=(row.source.native?.SpellSteps??[]).flatMap((s,i)=>s.Type==='None'?[]:[String(i)]);
 fail(steps.length>0&&exactKeys(review?.nativeStepReviews,steps),'all-native-steps');
 for(const s of review?.nativeStepReviews??[]){
  if(s.status==='excluded')fail(EXCLUSION_KINDS.includes(s.exclusion?.kind)&&nonempty(s.note)&&hasEvidence(s)&&sourceAllowsExclusion(row.source.native?.SpellSteps?.[Number(s.id)],s.exclusion?.kind,true,s.exclusion?.mode),'explicit-step-exclusion');
  else fail(s.status==='verified'&&nonempty(s.note)&&hasEvidence(s)&&testPass(s),`native-step:${s.id}`);
 }
 const branches=nativeBranchKeys(row);
 fail(exactKeys(review?.branchReviews,branches),'all-native-branches');
 for(const b of review?.branchReviews??[])fail(b.status==='verified'&&nonempty(b.note)&&hasEvidence(b)&&testPass(b),`branch:${b.id}`);
 return {eligible:failures.length===0,failures};
}
/** Compact signoff (user decision 2026-09-28): one line per entity.
 *  {format:'compact', key, decision:'accept'|'issue', reviewer, reviewedAt:ISO, tests:[path], note?, issue?, waived?:[{part:'clause'|'step', id, mode}]}
 * Accepted only if: decision accept, named/dated, no confirmed ledger difference, binding ok, both snapshot sources,
 * current passing full run that includes every listed test file, every waiver matches R000 source text, and no
 * CHANGES.jsonl entry touching this spell/key after reviewedAt (changes: [{at, spells[], keys[]}]). */
export function assessCompactSignoff(row,review,{receipt,fingerprint,changes=[]}){
 const failures=[];const fail=(condition,code)=>{if(!condition)failures.push(code);};
 fail(review?.key===row.key,'entity-key');
 fail(row.status!=='custom-excluded','custom-out-of-scope');
 fail(nonempty(review?.reviewer)&&nonempty(review?.reviewedAt)&&!Number.isNaN(Date.parse(review.reviewedAt)),'named-dated-review');
 fail(review?.decision==='accept','explicit-accept-decision');
 fail(row.confirmedDifferences.length===0,'confirmed-differences');
 fail(Object.values(row.bindingChecks).every(v=>v!==false),'binding-identity-cost-colors');
 fail(row.sourceStatus==='native-and-english-snapshot','independent-snapshot-sources');
 fail(receipt?.fingerprint===fingerprint&&receipt?.testExitCode===0&&receipt?.typecheckExitCode===0&&receipt?.failed===0&&receipt?.passed>0,'current-full-verification');
 const tests=review?.tests??[];
 fail(tests.length>0&&tests.every(p=>receipt?.suites?.some(s=>s.path===p&&s.status==='passed'&&s.failed===0&&s.passed>0)),'real-cast-tests');
 for(const w of review?.waived??[]){
  const src=w.part==='step'?row.source.native?.SpellSteps?.[Number(w.id)]:row.sourceClauses.find(c=>c.id===w.id);
  fail(!!src&&sourceAllowsExclusion(src,WAIVED_KIND,w.part==='step',w.mode),`waiver:${w.part}:${w.id}`);
 }
 const t=Date.parse(review?.reviewedAt??'');
 // Only direct edits of this skill (assembler / data) revoke the signoff. Shared-primitive changes list every
 // potentially affected key; their behaviour impact is guarded by gowCastGolden + the full-run receipt instead.
 const later=changes.find(c=>c.kind!=='primitive'&&Date.parse(c.at)>t&&((c.spells??[]).map(String).includes(String(row.spellId))||(c.keys??[]).includes(row.key)));
 fail(!later,'changed-after-signoff');
 return {eligible:failures.length===0,failures,...(later?{changedBy:`${later.issue??''} ${later.at}`}:{})};
}
export function applyWholeSkillReviews(rows,{reviews=[],...opts}){
 const groups=new Map();for(const r of reviews){const list=groups.get(r.key)??[];list.push(r);groups.set(r.key,list);}
 for(const row of rows){
  const matches=groups.get(row.key)??[];if(!matches.length)continue;
  const compact=matches[0].format==='compact';
  const assessment=matches.length!==1?{eligible:false,failures:['duplicate-review-key']}:compact?assessCompactSignoff(row,matches[0],opts):assessWholeSkillReview(row,matches[0],opts);
  row.wholeSkillReview={recordPath:REVIEW_PATH,format:compact?'compact':'detailed',decision:matches[0].decision,issue:matches[0].issue??null,note:matches[0].note??null,...assessment};
  if(!assessment.eligible)continue;
  const review=matches[0];
  if(compact){
   const waivedClause=new Map((review.waived??[]).filter(w=>w.part==='clause').map(w=>[w.id,w]));
   row.dimensions=Object.fromEntries(AUDIT_DIMENSIONS.map(d=>[d,'verified']));
   row.sourceClauses=row.sourceClauses.map(c=>({...c,review:waivedClause.has(c.id)?'excluded':'verified',exclusion:waivedClause.has(c.id)?{kind:WAIVED_KIND,mode:waivedClause.get(c.id).mode}:null}));
   row.acceptance={accepted:true,scope:'stored-gow-snapshot',reviewer:review.reviewer,reviewedAt:review.reviewedAt,tests:review.tests,note:review.note??'',fingerprint:opts.fingerprint,waived:review.waived??[]};
   row.status='accepted-snapshot';continue;
  }
  row.dimensions=Object.fromEntries(AUDIT_DIMENSIONS.map(d=>[d,review.dimensions[d].status]));
  row.sourceClauses=row.sourceClauses.map(c=>({...c,review:review.clauseReviews.find(x=>x.id===c.id).status,exclusion:review.clauseReviews.find(x=>x.id===c.id).exclusion??null}));
  row.acceptance={accepted:true,scope:review.scope,reviewer:review.reviewer,reviewedAt:review.reviewedAt,sourceDigest:review.sourceDigest,tests:[...new Set(Object.values(review.dimensions).flatMap(d=>d.tests??[]))],fingerprint:opts.fingerprint,
   waived:[...review.clauseReviews.map(c=>['clause',c]),...review.nativeStepReviews.map(s=>['step',s])].filter(([,x])=>x.exclusion?.kind===WAIVED_KIND).map(([part,x])=>({part,id:x.id,mode:x.exclusion.mode,note:x.note}))};
  row.status='accepted-snapshot';
 }
 return {wholeSkillReviewRecords:reviews.length,wholeSkillReviewEligible:rows.filter(r=>r.wholeSkillReview?.eligible).length};
}
