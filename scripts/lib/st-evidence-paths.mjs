import fs from 'node:fs';
import path from 'node:path';

/** Resolve evidence files inside the real workspace, including existing parent links. */
export function evidencePath(root, relative, {allowMissing=true}={}) {
 if(typeof relative!=='string'||!relative||relative!==relative.trim()||/[:\0]/.test(relative)
  ||path.posix.isAbsolute(relative)||path.win32.isAbsolute(relative))throw new Error('Expected a workspace-relative evidence path');
 const normalized=relative.replaceAll('\\','/');
 const segments=normalized.split('/');
 if(segments.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)))throw new Error('Ambiguous or escaping evidence path');
 const canonicalRoot=fs.realpathSync(path.resolve(root));
 if(!fs.statSync(canonicalRoot).isDirectory())throw new Error('Evidence root must be a directory');
 const inside=target=>{const back=path.relative(canonicalRoot,target);return back===''||back!=='..'&&!back.startsWith('..'+path.sep)&&!path.isAbsolute(back);};
 let absolute=canonicalRoot;
 for(let index=0;index<segments.length;index++){
  absolute=path.join(absolute,segments[index]);
  const entry=fs.lstatSync(absolute,{throwIfNoEntry:false});
  if(!entry){
   if(!allowMissing)throw new Error('Evidence file is missing: '+relative);
   // Every existing ancestor was resolved and checked. Remaining segments are normalized.
   return path.join(absolute,...segments.slice(index+1));
  }
  const real=fs.realpathSync(absolute); // Broken links fail, rather than appearing to be new files.
  if(!inside(real))throw new Error('Evidence path leaves real workspace: '+relative);
  const stat=fs.statSync(real);
  if(index<segments.length-1&&!stat.isDirectory())throw new Error('Evidence parent must be a directory: '+relative);
  if(index===segments.length-1&&!stat.isFile())throw new Error('Evidence target must be a file: '+relative);
 }
 return absolute;
}

/** Resolve anew before both directory creation and receipt writing. */
export function writeEvidenceFile(root, relative, content) {
 const destination=evidencePath(root,relative);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(evidencePath(root,relative),content);
}
