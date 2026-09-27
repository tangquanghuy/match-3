#!/usr/bin/env node
/** Run between closed browser batches. Verify every finalized video, not a sample.
 * Container duration/stream checks are not aesthetic or full-frame decode approval. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { acceptanceSourceHash, checkpointRows } from './theater/acceptance-evidence.mjs';
const run = promisify(execFile), root='artifacts/troop-audit';
const dirs=process.argv.slice(2);
if(!dirs.length)dirs.push(`${root}/final-20260925`,`${root}/traits-20260925`);
const sourceHash=await acceptanceSourceHash();
const probeCache=new Map(), entries=[];
async function probe(file) {
  if(probeCache.has(file)) return probeCache.get(file);
  const promise=(async()=>{
    try {
      const metadata=await stat(file);
      const {stdout}=await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',file],{windowsHide:true,timeout:30000});
      const p=JSON.parse(stdout),video=p.streams?.find(s=>s.codec_type==='video');
      const durationMs=Number(p.format?.duration)*1000;
      return {durationMs:Number.isFinite(durationMs)?durationMs:null,bytes:metadata.size,modifiedMs:metadata.mtimeMs,
        hasVideo:!!video?.width&&!!video?.height,error:!video?'missing-video-stream':!Number.isFinite(durationMs)?'unfinalized-duration':null};
    } catch(e) { return {error:e.code==='ENOENT'?'missing-file-or-ffprobe':String(e.message).slice(0,600)}; }
  })();probeCache.set(file,promise);return promise;
}
for(const dir of dirs){
 const rows=await checkpointRows(dir,sourceHash);
 for(const r of rows){
  const previous=r.videoEvidence;const file=r.video?path.resolve(dir,r.video):null;
  // Reuse only metadata checks bound to both exact run and unchanged file.
  let reuse=false;
  if(file && previous?.status==='passed' && previous.startedAt===r.startedAt){
   try {const s=await stat(file);reuse=s.size===previous.bytes&&s.mtimeMs===previous.modifiedMs;}catch{}
  }
  if(!reuse){
   const v=file?await probe(file):{error:'missing-video'};
   const requiredEndMs=Number(r.measurementVideoOffsetMs)+Number(r.profile?.totalMs);
   const errors=[];
   if(v.error)errors.push(v.error);
   if(!Number.isFinite(requiredEndMs))errors.push('missing-full-action-timing');
   else if(v.durationMs!=null && v.durationMs+100<requiredEndMs)errors.push('video-truncated-before-full-action-end');
   for(const suffix of ['mid','end']){
    try {const s=await stat(path.join(dir,`${r.key}.${suffix}.jpg`));if(!s.size)errors.push(`empty-${suffix}-screenshot`);}
    catch{errors.push(`missing-${suffix}-screenshot`);}
   }
   r.videoEvidence={status:errors.length?'failed':'passed',checkedAt:new Date().toISOString(),startedAt:r.startedAt,
    ...v,requiredEndMs:Number.isFinite(requiredEndMs)?requiredEndMs:null,errors,
    scope:'finalized video container + full action duration (100ms frame-boundary tolerance) + screenshot presence; not frame-by-frame or aesthetic approval'};
   await writeFile(path.join(dir,`${r.key}.json`),JSON.stringify(r,null,2));
  }
  entries.push({key:r.key,sourceHash:r.sourceHash,startedAt:r.startedAt,directory:dir,video:r.video,...r.videoEvidence});
 }
 if(rows.length){
  const file=path.join(dir,'results.json');let report={};try{report=JSON.parse(await readFile(file,'utf8'));}catch{}
  await writeFile(file,JSON.stringify({...report,sourceHash,generatedAt:new Date().toISOString(),results:rows},null,2));
 }
}
const summary={generatedAt:new Date().toISOString(),sourceHash,checked:entries.length,passed:entries.filter(r=>r.status==='passed').length,
 failed:entries.filter(r=>r.status!=='passed').length,rows:entries};
await writeFile(`${root}/evidence-integrity.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({checked:summary.checked,passed:summary.passed,failed:summary.failed}));
