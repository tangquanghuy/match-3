import { describe, expect, it } from 'vitest';
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
// @ts-expect-error Node crypto
import {createHash} from 'node:crypto';
// @ts-expect-error Node process API
import {spawnSync} from 'node:child_process';
declare const process: {execPath:string};

const reportPath='artifacts/gow-skill-audit/official-9-4-weapon-cost-screen.json';
const report=JSON.parse(fs.readFileSync(reportPath,'utf8')) as {
 sourcePath:string;sourceSha256:string;rows:{weaponId:number;official94Cost:number;projectCost:number;snapshotCost:number;status:string}[];
 conflicts:{weaponId:number;official94Cost:number;projectCost:number;snapshotCost:number;status:string}[];
};
describe('Official 9.4 weapon mana-cost note cross-check (scope: explicit notes only)',()=>{
 it('anchors stored official HTML and has 18 separate weapon entries',()=>{
  expect(createHash('sha256').update(fs.readFileSync(report.sourcePath)).digest('hex')).toBe(report.sourceSha256);
  expect(report.rows).toHaveLength(18);
  expect(new Set(report.rows.map(r=>r.weaponId)).size).toBe(18);
 });
 it('recomputes official notes against the stored snapshot and project, not a stale report',()=>{
  const result=spawnSync(process.execPath,['scripts/check-gow-9-4-weapon-costs.mjs'],{encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);
  const output=JSON.parse(result.stdout) as {screened:number;conflicts:typeof report.conflicts};
  expect(output.screened).toBe(report.rows.length);
  expect(output.conflicts).toEqual(report.conflicts);
 });
 it('leaves Sword of Heroes source/version conflict explicitly unresolved',()=>{
  expect(report.conflicts).toEqual([expect.objectContaining({
   weaponId:1166,official94Cost:5,snapshotCost:6,projectCost:6,
   status:'version-or-source-conflict-pending-review',
  })]);
  expect(report.rows.filter(r=>r.status==='cost-matches-official-9.4-note')).toHaveLength(17);
 });
});
