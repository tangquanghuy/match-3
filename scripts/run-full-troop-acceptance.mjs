#!/usr/bin/env node
/** Exhaustive manifests, bounded browser lifetimes, durable source-bound checkpoints.
 * --traits-first --workers 2. No automatic semantic/aesthetic sign-off. */
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {acceptanceSourceHash,checkpointRows,checkpointDone,renderOK} from './theater/acceptance-evidence.mjs';
const root='artifacts/troop-audit',args=process.argv.slice(2);
const wi=args.indexOf('--workers'),workers=wi<0?'2':args[wi+1];
await mkdir(root,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const roster=await read(`${root}/roster.json`),traits=await read(`${root}/trait-contexts.json`);
const sourceHash=await acceptanceSourceHash();
const phases=[{name:'skills',runner:'scripts/troop-presentation-audit.mjs',out:`${root}/final-20260925`,expected:roster.rows.length,extra:['--all']},
 {name:'traits',runner:'scripts/trait-presentation-audit.mjs',out:`${root}/traits-20260925`,expected:traits.rows.length,extra:[]}];
if(args.includes('--traits-first'))phases.reverse();
async function maintenance(){
 for(const script of ['verify-acceptance-evidence','summarize-troop-audit','build-acceptance-review']){
  const child=spawn(process.execPath,[`scripts/${script}.mjs`],{stdio:'ignore',windowsHide:true});
  const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
  if(code!==0)throw new Error(`Acceptance maintenance ${script} exited ${code}`);
 }
}
await maintenance();
let last=null;
for(const phase of phases){
 await mkdir(phase.out,{recursive:true});let stalls=0,round=0;
 while(true){
  if(await acceptanceSourceHash()!==sourceHash)throw new Error('Source or browser fixture changed: stop instead of mixing evidence versions. Restart to record the new version.');
  const rows=await checkpointRows(phase.out,sourceHash),done=rows.filter(checkpointDone).length;
  const failed=rows.filter(r=>!renderOK(r)||r.videoEvidence?.status!=='passed').length;
  const progress={updatedAt:new Date().toISOString(),sourceHash,phase:phase.name,expected:phase.expected,executed:rows.length,
   completedOrQuarantined:done,failed,round,visualReview:'pending-not-automatically-approved'};
  await writeFile(`${root}/audit-progress.json`,JSON.stringify(progress,null,2));console.log(JSON.stringify(progress));
  if(done>=phase.expected)break;
  if(stalls>=3)throw new Error(`Three consecutive stalled/no-progress rounds in ${phase.name}; checkpoints retained for diagnosis.`);
  round++;let progressAt=Date.now(),killed=false;
  const child=spawn(process.execPath,[phase.runner,...phase.extra,'--workers',workers,'--page-batch','4','--max-cases','64','--resume','--out',phase.out],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.on('data',d=>{process.stdout.write(d);if(/\[\d+\/\d+\]/.test(String(d)))progressAt=Date.now();});
  child.stderr.on('data',d=>process.stderr.write(d));
  const timer=setInterval(()=>{
   if(Date.now()-progressAt<180000||killed)return;killed=true;
   console.error(`Watchdog: ${phase.name} PID ${child.pid} stalled; retain checkpoints and restart.`);
   if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else child.kill('SIGKILL');
  },10000);
  try{last=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});}finally{clearInterval(timer);}
  await maintenance();
  const after=await checkpointRows(phase.out,sourceHash);
  const madeProgress=after.reduce((n,r)=>n+(r.attempt??0),0)>rows.reduce((n,r)=>n+(r.attempt??0),0);
  stalls=killed||!madeProgress?stalls+1:0;
 }
}
console.log('Every manifest entry executed or quarantined. Inspect issues and review every recording; no automatic visual or semantic approval.');
await writeFile(`${root}/audit-progress.json`,JSON.stringify({updatedAt:new Date().toISOString(),sourceHash,phase:'execution-finished',visualReview:'pending',lastChildExitCode:last},null,2));
