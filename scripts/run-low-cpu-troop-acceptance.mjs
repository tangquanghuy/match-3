#!/usr/bin/env node
/** Low-CPU continuation of an EXACT frozen baseline, never a mixed-version run.
 * Must be launched by scripts/windows/run-acceptance-cpu-job.ps1.
 * Configurable bounded concurrency/CPU budget; finalized video per case and batch cooldown.
 */
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {acceptanceSourceHash,checkpointRows,checkpointDone,renderOK} from './theater/acceptance-evidence.mjs';
const root='artifacts/troop-audit';
const runDir=process.env.ACCEPTANCE_CPU_RUN_DIR;
const cpuCapPercent=Number(process.env.ACCEPTANCE_CPU_CAP_PERCENT);
if(!runDir||!process.env.ACCEPTANCE_CPU_JOB_NAME||!Number.isInteger(cpuCapPercent)||cpuCapPercent<1||cpuCapPercent>50)throw new Error('Verified Windows recording job with 1..50% CPU cap required');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const config=await read(path.join(runDir,'run-config.json'));
const bounded=(name,fallback,min,max)=>{
 const value=config[name]??fallback;
 if(!Number.isInteger(value)||value<min||value>max)throw new Error(`Invalid ${name}: ${value}`);
 return value;
};
const workers=bounded('workers',1,1,3),casesPerBatch=bounded('casesPerBatch',4,1,32);
const cooldownSeconds=bounded('cooldownSeconds',20,0,120),systemCpuThreshold=bounded('systemCpuThreshold',65,50,85);
if(config.cpuCapPercent!==cpuCapPercent)throw new Error('Configured and verified CPU budgets differ');
if(casesPerBatch<workers)throw new Error('Batch size must cover all workers');
const sourceHash=await acceptanceSourceHash();
if(sourceHash!==config.sourceHash)throw new Error('Frozen baseline hash mismatch');
const roster=await read(`${root}/roster.json`),traits=await read(`${root}/trait-contexts.json`);
const deferred=traits.rows.filter(r=>r.status==='mode-unwired'||r.scenario==='mode-unwired');
const phases=[{name:'skills',runner:'scripts/troop-presentation-audit.mjs',out:`${root}/final-20260925`,keys:roster.rows.filter(r=>r.skillBound).map(r=>`troop-${r.troopId}`),extra:['--all']},
 {name:'traits',runner:'scripts/trait-presentation-audit.mjs',out:`${root}/traits-20260925`,keys:traits.rows.filter(r=>!deferred.includes(r)).map(r=>r.key),extra:[]}];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
let progress={sourceHash,workspace:process.cwd(),cpuCapPercent,workers,casesPerBatch,cooldownSeconds,systemCpuThreshold,deferredModeContexts:deferred.length,visualReview:'pending-not-automatically-approved',timingEnvironment:workers>1?'Concurrent CPU-budgeted recording, not a single-device latency benchmark; full action clock retained':'Single-worker CPU-budgeted recording; full action clock retained'};
async function status(extra){progress={...progress,...extra,updatedAt:new Date().toISOString()};await writeFile(path.join(runDir,'progress.json'),JSON.stringify(progress,null,2));}
async function stopRequested(){return exists(path.join(runDir,'STOP'));}
async function resourceGate(){
 let quiet=0;
 while(quiet<2){
  if(await stopRequested())return false;
  const sample=await read(path.join(runDir,'cpu-current.json')).catch(()=>null);
  const fresh=sample && Date.now()-Date.parse(sample.at)<20000;
  const available=os.freemem()/1024**3;
  const ready=fresh&&sample.systemCpuPercent<systemCpuThreshold&&available>=2;
  quiet=ready?quiet+1:0;
  await status({state:ready?'resource-check':'waiting-for-resources',systemCpuPercent:sample?.systemCpuPercent??null,freeMemoryGiB:+available.toFixed(2)});
  if(quiet<2)await sleep(5000);
 }
 return true;
}
async function childRun(script,args=[],watchdogMs=300000,logTotal=null){
 const child=spawn(process.execPath,[script,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let activity=Date.now(),killed=false;
 child.stdout.on('data',d=>{process.stdout.write(logTotal?String(d).replace(/\[(\d+)\/\d+\]/g,`[$1/${logTotal}]`):d);if(/\[\d+\/\d+\]/.test(String(d)))activity=Date.now();});
 child.stderr.on('data',d=>process.stderr.write(d));
 await status({childPid:child.pid,childScript:script});
 const timer=setInterval(()=>{
  if(killed||Date.now()-activity<watchdogMs)return;killed=true;
  console.error(`Watchdog: recording child ${child.pid}; retaining checkpoints, tree-specific shutdown.`);
  spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
 },5000);
 try{return {code:await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);}),killed};}
 finally{clearInterval(timer);await status({childPid:null});}
}
async function summarize(){
 for(const script of ['summarize-troop-audit','build-acceptance-review']){
  const result=await childRun(`scripts/${script}.mjs`,[],300000);
  if(result.code!==0)throw new Error(`${script} failed (${result.code})`);
 }
}
try {
 await status({state:'starting',deferredModeMechanisms:[...new Set(deferred.map(r=>r.mechanismKey))]});
 console.log(JSON.stringify({event:'low-cpu-start',...progress}));
 for(const phase of phases){
  await mkdir(phase.out,{recursive:true});let stalls=0,round=0;
  while(true){
   if(await acceptanceSourceHash()!==sourceHash)throw new Error('Frozen source changed; stopping instead of mixing evidence');
   const rows=await checkpointRows(phase.out,sourceHash),byKey=new Map(rows.map(r=>[r.key,r]));
   const selected=phase.keys.filter(k=>!byKey.has(k)||!checkpointDone(byKey.get(k))).slice(0,casesPerBatch);
   const completed=phase.keys.filter(k=>byKey.has(k)&&checkpointDone(byKey.get(k))).length;
   const valid=phase.keys.map(k=>byKey.get(k)).filter(Boolean);
   await status({state:'checkpoint',phase:phase.name,expected:phase.keys.length,executed:valid.length,completedOrQuarantined:completed,renderPassed:valid.filter(renderOK).length,round});
   console.log(JSON.stringify({event:'progress',phase:phase.name,executed:valid.length,completedOrQuarantined:completed,expected:phase.keys.length,round}));
   if(!selected.length)break;
   if(stalls>=3)throw new Error(`Three no-progress/stalled batches in ${phase.name}; checkpoints retained`);
   if(!await resourceGate()){await status({state:'stopped-at-batch-boundary'});process.exit(0);}
   await status({state:'recording',selected,round:++round});
   const result=await childRun(phase.runner,[...phase.extra,'--workers',String(workers),'--page-batch','1','--max-cases',String(casesPerBatch),'--keys',selected.join(','),'--port','5191','--resume','--out',phase.out],300000,phase.keys.length);
   const after=await checkpointRows(phase.out,sourceHash);
   for(const row of after.filter(r=>selected.includes(r.key) && (!byKey.has(r.key)||r.startedAt!==byKey.get(r.key).startedAt))){
    row.recordingEnvironment={kind:'cpu-budgeted',cpuCapPercent,workers,runDirectory:runDir,fullActionClockUnchanged:true,timingCaveat:workers>1?'Concurrent resource-constrained capture; not a single-device latency benchmark. Repeat timing outliers without concurrent cases':'Resource-constrained capture; inspect frame pacing and repeat timing outliers on an unloaded machine'};
    await writeFile(path.join(phase.out,`${row.key}.json`),JSON.stringify(row,null,2));
   }
   const relevant=after.filter(r=>phase.keys.includes(r.key));
   await status({executed:relevant.length,completedOrQuarantined:relevant.filter(checkpointDone).length,renderPassed:relevant.filter(renderOK).length});
   const attempts=rs=>rs.filter(r=>selected.includes(r.key)).reduce((n,r)=>n+(r.attempt??0),0);
   stalls=result.killed||attempts(after)<=attempts(rows)?stalls+1:0;
   // Only check closed browser batches. This serial ffprobe work remains in the same CPU job.
   await status({state:'checking-evidence',lastBatchExitCode:result.code});
   const verification=await childRun('scripts/verify-acceptance-evidence.mjs',[phase.out],600000);
   if(verification.code!==0)throw new Error('Evidence integrity task failed');
   await summarize();
   const cooldownEnd=Date.now()+cooldownSeconds*1000;
   await status({state:'cooldown',cooldownUntil:new Date(cooldownEnd).toISOString()});
   do {
    if(await stopRequested()){await status({state:'stopped-at-batch-boundary'});process.exit(0);}
    const remaining=cooldownEnd-Date.now();
    if(remaining<=0)break;
    await sleep(Math.min(1000,remaining));
   } while(true);
  }
 }
 await status({state:'recording-finished',selected:[],visualReview:'pending-not-automatically-approved'});
 console.log('All non-deferred entries recorded or quarantined. Individual visual review is still required.');
} catch(error){await status({state:'stopped-error',error:String(error.stack??error)});console.error(error);process.exitCode=1;}