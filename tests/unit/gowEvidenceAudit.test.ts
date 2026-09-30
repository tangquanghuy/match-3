import {describe,it,expect} from 'vitest';
// @ts-expect-error Node-only evidence module
import {attachScopedEvidence} from '../../scripts/lib/gow-scoped-evidence.mjs';
interface ScopedCheck { testPath: string; status: string; wholeSkillAccepted: boolean }
function row(kind='weapon',spellId=7192){
 const result: {kind:string;spellId:number;entityId:number;status:string;source:{englishDescription:string};acceptance:{accepted:boolean};repairHistory?:ScopedCheck[];scopedChecks?:ScopedCheck[]} =
  {kind,spellId,entityId:100,status:'pending-review',source:{englishDescription:''},acceptance:{accepted:false}};
 return result;
}
describe('scoped repair history never turns inventory or compiler coverage into acceptance',()=>{
 it('keeps repair history even when the known-difference detector becomes empty',()=>{
  const r=row();const s=attachScopedEvidence([r]);expect(s.repairedEntities).toBe(1);
  expect(r.repairHistory![0].status).toBe('tests-not-attested-for-current-fingerprint');expect(r.acceptance.accepted).toBe(false);
 });
 it('requires a current passed suite before attesting the scope',()=>{
  const r=row();const s=attachScopedEvidence([r],{suites:[{path:'tests/unit/gowSkillConfirmedRepairs.test.ts',status:'passed'}]});
  expect(s.behavioralScopeTestedEntities).toBe(1);expect(s.nativeIdentityCostTested).toBe(0);expect(r.acceptance.accepted).toBe(false);
 });
 it('does not promote a failed suite',()=>{
  expect(attachScopedEvidence([row()],{suites:[{path:'tests/unit/gowSkillConfirmedRepairs.test.ts',status:'failed'}]}).behavioralScopeTestedEntities).toBe(0);
 });
 it('identity/cost passes alone are not behavioral passes',()=>{
  const s=attachScopedEvidence([row()],{suites:[{path:'tests/unit/gowNativeSourceAudit.test.ts',status:'passed'}]});expect(s.nativeIdentityCostTested).toBe(1);expect(s.behavioralScopeTestedEntities).toBe(0);
 });
 it('keeps custom units out of original-source scoped coverage',()=>{
  const r={...row(),status:'custom-excluded'};const s=attachScopedEvidence([r]);expect(s.repairedEntities).toBe(0);expect(r.scopedChecks!).toEqual([]);
 });
});


describe('new gain/random-branch repair evidence is bounded',()=>{
 for(const [kind,id,test] of [['troop',9783,'gowGoldenThiefDamageAudit'],['troop',7493,'gowMongoBranchesAudit'],['troop',8144,'gowGoldStatBoostAudit'],['troop',8498,'gowStatGainFormulaAudit'],...([9837,9911,9914,9976,10046,10050] as number[]).map(id=>['weapon',id,'gowStatGainFormulaAudit'])] as [string,number,string][])it(`${kind}:${id} has scoped repair evidence only after its suite passes`,()=>{
  const r=row(kind,id);const s=attachScopedEvidence([r],{suites:[{path:`tests/unit/${test}.test.ts`,status:'passed'}]});
  expect(s.repairedEntities).toBe(1);expect(s.behavioralScopeTestedEntities).toBe(1);expect(r.acceptance.accepted).toBe(false);
  const matching=r.scopedChecks!.find((c:{testPath:string})=>c.testPath===`tests/unit/${test}.test.ts`);
  expect(matching).toMatchObject({status:'tested-pass',wholeSkillAccepted:false});
 });
});


describe('Gold ownership evidence does not certify unrelated full spell rules',()=>{
 for(const [kind,id] of [...[7505,8087,8141,8568,8859,8904,9189,9783].map(id=>['troop',id]),['weapon',8073]] as [string,number][])it(`${kind}:${id} records Gold ownership only after its dedicated suite passes`,()=>{
  const r=row(kind,id);const summary=attachScopedEvidence([r],{suites:[{path:'tests/unit/gowGoldOwnershipAudit.test.ts',status:'passed'}]});
  expect(summary.repairedEntities).toBe(1);expect(summary.behavioralScopeTestedEntities).toBe(1);expect(r.acceptance.accepted).toBe(false);
  expect(r.scopedChecks!.some((s:{testPath:string;wholeSkillAccepted:boolean})=>s.testPath==='tests/unit/gowGoldOwnershipAudit.test.ts'&&!s.wholeSkillAccepted)).toBe(true);
 });
});


describe('native source repair suites stay tied to the exact spell and keep whole acceptance pending',()=>{
 for(const [kind,id,test] of [
  ...[7328,7332,7652,8897,9745].map(id=>['troop',id,'gowManaBurnTowerAudit']),
  ...[7412,7800].map(id=>['weapon',id,'gowManaBurnTowerAudit']),
  ...[7755,8153].map(id=>['weapon',id,'gowHopeCrescentThunderbirdAudit']),
  ...[7754,7815,9378].map(id=>['weapon',id,'gowConditionalWeaponClausesAudit']),
  ...[8074,8400].map(id=>['weapon',id,'gowRepositionStoneAudit']),
 ] as [string,number,string][]) it(kind+':'+id+' scoped suite '+test,()=>{
  const r=row(kind,id);const path='tests/unit/'+test+'.test.ts';
  const summary=attachScopedEvidence([r],{suites:[{path,status:'passed'}]});
  expect(summary.repairedEntities).toBe(1);expect(summary.behavioralScopeTestedEntities).toBe(1);
  expect(r.acceptance.accepted).toBe(false);
  expect(r.repairHistory!.some((c:{testPath:string;status:string;wholeSkillAccepted:boolean})=>c.testPath===path&&c.status==='tested-pass'&&!c.wholeSkillAccepted)).toBe(true);
 });
});
