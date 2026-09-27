/** Full regression evidence tied to source hashes. Successful regression is not GoW acceptance. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out='artifacts/gow-skill-audit';
const run=(script,args=[],opts={})=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',maxBuffer:32*1024*1024,...opts});
const audit=()=>{const r=run('scripts/audit-gow-skills.mjs');if(r.status!==0)throw new Error(r.stderr||r.stdout);return JSON.parse(fs.readFileSync(`${out}/ledger.json`,'utf8'));};
const before=audit();
console.log(`Running all tests for source fingerprint ${before.fingerprint}`);
const tests=run('node_modules/vitest/vitest.mjs',['run','--reporter=json',`--outputFile=${out}/vitest-results.json`]);
fs.writeFileSync(`${out}/vitest-output.log`,tests.stdout+'\n'+tests.stderr);
const types=run('node_modules/typescript/bin/tsc',['--noEmit']);
fs.writeFileSync(`${out}/typecheck.log`,types.stdout+'\n'+types.stderr);
const after=audit();
if(after.fingerprint!==before.fingerprint)throw new Error('Source changed during verification; no receipt issued. Run again.');
const resultPath=`${out}/vitest-results.json`;
if(!fs.existsSync(resultPath)||tests.error)throw new Error('Vitest did not produce a result; no receipt issued.');
const results=JSON.parse(fs.readFileSync(resultPath,'utf8'));
const receipt={schemaVersion:1,generatedAt:new Date().toISOString(),fingerprint:after.fingerprint,resultSha256:createHash('sha256').update(fs.readFileSync(resultPath)).digest('hex'),
 testExitCode:tests.status,typecheckExitCode:types.status,passed:results.numPassedTests,failed:results.numFailedTests,
 suites:results.testResults.map(r=>({path:r.name.replaceAll('\\','/').replace(process.cwd().replaceAll('\\','/')+'/',''),status:r.status,passed:r.assertionResults.filter(t=>t.status==='passed').length,failed:r.assertionResults.filter(t=>t.status==='failed').length})),
 wholeSkillAcceptance:false};
fs.writeFileSync(`${out}/verification-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(audit().summary,null,2));
if(tests.status!==0||types.status!==0)process.exitCode=1;
