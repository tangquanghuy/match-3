#!/usr/bin/env node
/** Full manifest, execution, structural rendering, human visual review and semantic
 * acceptance are deliberately separate columns. Never turn a recording into approval.
 * Usage: node scripts/summarize-troop-audit.mjs [skill-results.json] [trait-results.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { acceptanceSourceHash, checkpointRows } from './theater/acceptance-evidence.mjs';
const sourceHash=await acceptanceSourceHash();
const root='artifacts/troop-audit';
const read=async(file,fallback)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}};
const roster=await read(`${root}/roster.json`);
const mechanisms=await read(`${root}/trait-triggers.json`);
const triggers=await read(`${root}/trait-contexts.json`);
const files=process.argv.slice(2);
if(!files.length)files.push(`${root}/final-20260925/results.json`,`${root}/traits-20260925/results.json`);
const captures=[];
for(const file of files){
  const rows=await checkpointRows(path.dirname(file),sourceHash);
  captures.push(...rows.map(r=>({...r,evidence:path.relative(root,path.dirname(file)).replaceAll('\\','/')+'/'+r.key+'.json',directory:path.dirname(file)})));
}
const reviews=await read(`${root}/visual-reviews.json`,{rows:[]});
const findings=await read(`${root}/visual-findings.json`,{rows:[]});
const currentFindings=c=>c?findings.rows.filter(f=>f.key===c.key&&f.sourceHash===c.sourceHash&&f.startedAt===c.startedAt&&f.status==='open'):[];
const reviewed=r=>reviews.rows.find(x=>x.key===r.key&&x.sourceHash===r.sourceHash&&x.startedAt===r.startedAt);
const ok=r=>!!r.profile&&!r.error&&!r.pageErrors?.length&&!r.profile.errors?.length;
const renderOK=r=>ok(r)&&!!r.renderInspection&&!r.renderInspection.errors.length;
const latest=key=>captures.filter(r=>r.key===key).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];
const csv=rows=>{
  const keys=Object.keys(rows[0]??{}),q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return '\ufeff'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(q).join(',')).join('\r\n');
};
const evidenceColumns=c=>({execution:!c?'pending':ok(c)?'completed':'failed',
  renderState:!c?'pending':renderOK(c)?'passed':'failed',
  videoEvidence:c?.videoEvidence?.status??'pending',
  visualReview:c?reviewed(c)?.status??'pending':'pending',
  measuredTotalMs:c?.profile?Math.round(c.profile.totalMs):'',
  inputReadyMs:c?.profile?Math.round(c.profile.inputReadyMs??0):'',
  visualTailMs:c?.profile?Math.round(c.profile.visualTailMs??0):'',
  flags:[...(c?.profile?.flags??[]),...currentFindings(c).map(f=>f.flag)].join(' | '),
  renderErrors:(c?.renderInspection?.errors??[]).join(' | '),
  evidence:c?.evidence??'',sourceHash:c?.sourceHash??''});
const matrix=roster.rows.map(r=>{
  const worst=r.runs.filter(s=>s.presentation).sort((a,b)=>b.presentation.timelineMs-a.presentation.timelineMs)[0];
  const c=latest(`troop-${r.troopId}`);
  const cases=triggers.rows.filter(t=>t.users.includes(r.troopId));
  return {troopId:r.troopId,troopName:r.troopName,spellId:r.spellId,spellName:r.spellName,
    skillBound:r.skillBound,traits:r.traits.map(t=>`${t.code}:${t.implemented?'defined':'missing'}`).join(' | '),
    smokeRuns:r.runs.length,runtimeFailures:r.runs.filter(s=>s.errors.length).length,
    worstPlannedTimelineMs:worst?Math.round(worst.presentation.timelineMs):'',worstSeed:worst?.seed??'',
    ...evidenceColumns(c),traitMechanismCases:cases.length,
    traitMechanismGaps:cases.filter(t=>t.status!=='effect-observed').map(t=>`${t.code}/${t.field}:${t.status}`).join(' | '),
    traitBrowserPending:cases.filter(t=>!latest(t.key)).length,
    summonMetadataGaps:r.summonMetadataGaps.join(' | '),dependencies:r.mechanismDependencies.join(' | '),
    semanticAcceptance:'pending-conditional-branch-signoff'};
});
const traitMatrix=triggers.rows.map(r=>({key:r.key,mechanismKey:r.mechanismKey,troopId:r.troopId,troopName:r.troopName,code:r.code,name:r.name,field:r.field,scenario:r.scenario,
  engineObservation:r.status,seed:r.seed,users:r.users.join(' | '),...evidenceColumns(latest(r.key)),
  startupPresentationGap:latest(r.key)?.profile?.unpresentedStartupEvents?.map(e=>e.type).join(' | ')??'',
  semanticAcceptance:'observation-is-not-semantic-signoff'}));
const issues=captures.flatMap(r=>{
 const p=r.profile??{};
 const list=[...(p.flags??[]),...(r.renderInspection?.errors??[]).map(e=>`render:${e}`),...(r.error?[`execution:${r.error.split('\n')[0]}`]:[]),...(r.pageErrors??[]).map(e=>`execution:${e}`),...(p.errors??[]).map(e=>`execution:${e}`),...(r.videoEvidence?.errors??[]).map(e=>`evidence:${e}`)];
 return list.map(flag=>({key:r.key,troopId:r.troopId,name:r.troopName,trait:r.traitCase?.code??'',flag,
 priority:flag.startsWith('P1')||flag.startsWith('render:')||flag.startsWith('execution:')||flag.startsWith('evidence:')?'P1':flag.startsWith('gap:')?'gap':'review',
 totalMs:Math.round(p.totalMs??0),timelineMs:Math.round(p.timelineMs??0),visualTailMs:Math.round(p.visualTailMs??0),
 stageMs:JSON.stringify(p.stageMs??{}),fxCounts:JSON.stringify(p.fxCounts??{}),evidence:r.evidence,
 observation:'',reviewEvidence:'',recommendation:flag.includes('dense-')?'Reduce simultaneous blast density/brightness; preserve gem identity and order':
 flag.includes('repeated-heavy')?'Coalesce same-cause heavy FX; never suppress damage or cross causal barriers':
 flag.includes('full-chain')?'Prioritize largest stage: batch same-wave mana/team buffs/DOT; preserve all downstream cascades':
 flag.includes('finite-visual-tail')?'Review whether tail is non-blocking text or unfinished gameplay animation':
 flag.includes('startup')?'Connect actual startup event replay before input; do not synthesize replay only in audit':'Inspect evidence and conditional fixture'}));
});
for(const c of captures)for(const f of currentFindings(c))issues.push({key:c.key,troopId:c.troopId,name:c.troopName,trait:c.traitCase?.code??'',
 flag:f.flag,priority:f.priority,totalMs:Math.round(c.profile?.totalMs??0),timelineMs:Math.round(c.profile?.timelineMs??0),visualTailMs:Math.round(c.profile?.visualTailMs??0),
 stageMs:JSON.stringify(c.profile?.stageMs??{}),fxCounts:JSON.stringify(c.profile?.fxCounts??{}),evidence:c.evidence,
 observation:f.observation,reviewEvidence:f.evidence,recommendation:f.recommendation});
await writeFile(`${root}/troop-matrix.csv`,csv(matrix));
await writeFile(`${root}/trait-matrix.csv`,csv(traitMatrix));
await writeFile(`${root}/presentation-issues.csv`,csv(issues));
await writeFile(`${root}/slow-chains.csv`,csv(matrix.filter(r=>r.worstPlannedTimelineMs>6000).sort((a,b)=>b.worstPlannedTimelineMs-a.worstPlannedTimelineMs)));
const count=(rows,field,value)=>rows.filter(r=>r[field]===value).length;
const summary={generatedAt:new Date().toISOString(),sourceHash,overallStatus:'not-fully-accepted',roster:roster.summary,assembly:roster.assembly,
 scope:'All troop IDs and every troop x referenced trait field are required; missing items stay pending. A cast is not all branches. Recorded is not visually reviewed. All timing includes downstream board events and finite tails.',
 skills:{expected:matrix.length,executed:count(matrix,'execution','completed'),executionFailed:count(matrix,'execution','failed'),pending:count(matrix,'execution','pending'),renderPassed:count(matrix,'renderState','passed'),videoVerified:count(matrix,'videoEvidence','passed'),visuallyReviewed:matrix.filter(r=>r.visualReview!=='pending').length},
 traits:{...mechanisms.summary,holderContexts:triggers.summary,browserExpected:traitMatrix.length,browserExecuted:count(traitMatrix,'execution','completed'),browserPending:count(traitMatrix,'execution','pending'),browserFailed:count(traitMatrix,'execution','failed'),videoVerified:count(traitMatrix,'videoEvidence','passed'),renderPassed:count(traitMatrix,'renderState','passed'),startupPresentationGaps:traitMatrix.filter(r=>r.startupPresentationGap).length,visuallyReviewed:traitMatrix.filter(r=>r.visualReview!=='pending').length},
 proposedThresholds:{reviewMs:6000,priorityMs:12000},issues:issues.length,sourceHashes:[...new Set(captures.map(r=>r.sourceHash))],
 slowestMeasured:captures.filter(r=>r.profile).sort((a,b)=>b.profile.totalMs-a.profile.totalMs).slice(0,25).map(r=>({key:r.key,name:r.troopName,totalMs:Math.round(r.profile.totalMs),stageMs:r.profile.stageMs,flags:r.profile.flags,evidence:r.evidence}))};
await writeFile(`${root}/summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
