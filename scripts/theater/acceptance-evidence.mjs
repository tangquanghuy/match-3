/** Shared identity/checkpoint rules for exhaustive acceptance. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function acceptanceSourceHash() {
  const hash = createHash('sha256');
  async function add(file) { hash.update(file.replaceAll('\\', '/')); hash.update(await readFile(file)); }
  async function walk(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(ts|json|js|css)$/.test(entry.name)) await add(file);
    }
  }
  await walk('src');
  for (const file of ['tests/helpers/traitAcceptanceFixtures.ts', 'tests/helpers/boardEventContract.ts',
    'tests/e2e/theater.html', 'scripts/theater/acceptance-probe.js',
    'scripts/theater/trait-acceptance-probe.js', 'scripts/theater/presentation-assertions.js',
    'scripts/troop-presentation-audit.mjs', 'scripts/trait-presentation-audit.mjs']) await add(file);
  return hash.digest('hex');
}
export const executionOK = r => !!r.profile && !r.error && !r.pageErrors?.length && !r.profile.errors?.length;
export const renderOK = r => executionOK(r) && !!r.renderInspection && !r.renderInspection.errors?.length;
export const checkpointDone = r => r.attempt >= 2 || (renderOK(r) && !['failed','missing'].includes(r.videoEvidence?.status));
export async function checkpointRows(dir, sourceHash) {
  const rows=[];
  for (const file of await readdir(dir).catch(e => { if(e.code==='ENOENT')return [];throw e; })) {
    if (!/^(troop-|trait-|stress-).+\.json$/.test(file)) continue;
    try { const r=JSON.parse(await readFile(path.join(dir,file),'utf8')); if (!sourceHash || r.sourceHash===sourceHash) rows.push(r); }
    catch(e) { if (!(e instanceof SyntaxError) && e.code !== 'ENOENT') throw e; }
  }
  return rows;
}
