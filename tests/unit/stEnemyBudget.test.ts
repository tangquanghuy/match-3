import {beforeAll,describe,expect,it} from 'vitest';
import {combatantPower,combatantStatPower,teamPower} from '../../src/meta/systems/combatPower';
import {assertEnemyBudget,EnemyBudgetError,evaluateEnemyBudget,measureEnemyPower,validateEnemyBudgetPolicy} from '../../src/sillytavern/enemyBudget';
import type {EnemyBudgetPolicy} from '../../src/sillytavern/enemyBudget';
import {compileEnemyDesign,compileEnemyEncounterDesigns,compileEnemyEncounterPlan,DEFAULT_ENEMY_DESIGN_INPUT,restoreEnemyDesign} from '../../src/sillytavern/enemyDesign';
import type {CompiledEnemyDesign} from '../../src/sillytavern/enemyDesign';

const policy=(limits:Partial<Omit<EnemyBudgetPolicy,'version'|'id'>>):EnemyBudgetPolicy=>({version:1,id:'test-explicit-budget',...limits});
const input=()=>structuredClone(DEFAULT_ENEMY_DESIGN_INPUT);
let baseline:CompiledEnemyDesign;
beforeAll(()=>{baseline=compileEnemyDesign(input(),{seed:42,externalId:'enemy-1'});});

describe('ST enemy budget uses final native snapshots',()=>{
 it('reuses the native score, preserves snapshots and separates measurement from balance calibration',()=>{
  const snapshot=structuredClone(baseline.blueprint.snapshot),before=structuredClone(snapshot);
  expect(measureEnemyPower(snapshot)).toEqual({externalId:snapshot.externalId,power:combatantPower(snapshot),statPower:combatantStatPower(snapshot)});
  const report=evaluateEnemyBudget([snapshot]);
  expect(report.totalPower).toBe(teamPower([snapshot]));expect(report.status).toBe('measured');
  expect(report.calibration).toBe('uncalibrated');expect(report.policy).toBeNull();expect(snapshot).toEqual(before);
 });
 it('allows the exact boundary and reports all excessive limits with actual values and positions',()=>{
  const snapshot=baseline.blueprint.snapshot,power=combatantPower(snapshot);
  expect(assertEnemyBudget([snapshot],policy({maxMemberPower:power,maxTeamPower:power,maxMembers:1})).status).toBe('within-budget');
  const report=evaluateEnemyBudget([snapshot,{...snapshot,externalId:'enemy-2'}],policy({maxMemberPower:power-1,maxTeamPower:power*2-1,maxMembers:1}));
  expect(report.issues.map(i=>i.code)).toEqual(['member-count','member-power','member-power','team-power']);
  expect(report.issues[2]).toMatchObject({path:'enemyTeam[1]',actual:power,limit:power-1});
  expect(report.issues[3]).toMatchObject({actual:power*2,limit:power*2-1});
  expect(()=>assertEnemyBudget([snapshot],policy({maxTeamPower:power-1}))).toThrow(EnemyBudgetError);
 });
 it.each([0,5])('checks encounter size %i even without a policy',count=>{
  const snapshots=Array.from({length:count},()=>baseline.blueprint.snapshot);
  expect(evaluateEnemyBudget(snapshots).issues).toContainEqual(expect.objectContaining({code:'member-count'}));
 });
 it.each([null,{}, {version:2,id:'test',maxTeamPower:1},{version:1,id:' ',maxTeamPower:1},
  {version:1,id:'test'}, {version:1,id:'test',maxMembers:5},{version:1,id:'test',maxMemberPower:-1},
  {version:1,id:'test',maxTeamPower:1.1},{version:1,id:'test',maxTeamPower:Infinity},
  {version:1,id:'test',maxTeamPower:Number.MAX_SAFE_INTEGER+1},{version:1,id:'test',maxTeamPower:1,unknown:1},
 ])('rejects a malformed policy %#',value=>{expect(()=>validateEnemyBudgetPolicy(value)).toThrow();});
 it.each(['inherited','non-enumerable'])('preserves a validated %s limit supplied through the JS API',kind=>{
  const value=kind==='inherited'?Object.assign(Object.create({maxTeamPower:0}),{version:1,id:'zero-cap',maxMembers:4}):Object.defineProperty({version:1,id:'zero-cap',maxMembers:4},'maxTeamPower',{value:0,enumerable:false});
  expect(validateEnemyBudgetPolicy(value)).toEqual({version:1,id:'zero-cap',maxTeamPower:0,maxMembers:4});
  expect(evaluateEnemyBudget([baseline.blueprint.snapshot],value).issues).toContainEqual(expect.objectContaining({code:'team-power',limit:0}));
 });
 it('reads accessor limits only once and evaluates the exact validated value',()=>{
  let reads=0;const value={version:1 as const,id:'accessor-cap',get maxTeamPower(){return reads++===0?0:100000;}};
  const report=evaluateEnemyBudget([baseline.blueprint.snapshot],value);
  expect(reads).toBe(1);expect(report.policy!.maxTeamPower).toBe(0);expect(report.status).toBe('over-budget');
 });
 it('clones accepted policy data so later caller edits do not change the report',()=>{
  const limits=policy({maxTeamPower:100000});const report=evaluateEnemyBudget([baseline.blueprint.snapshot],limits);
  limits.maxTeamPower=0;expect(report.policy!.maxTeamPower).toBe(100000);
  expect(validateEnemyBudgetPolicy(policy({maxMemberPower:0})).maxMemberPower).toBe(0);
 });
});

describe('ST semantic budget selection and launch plan',()=>{
 it('preserves the legacy configuration and array API when no policy is requested',()=>{
  expect(baseline.budget).toBeUndefined();
  const plan=compileEnemyEncounterPlan([input(),input()],{seed:42});
  expect(plan.members).toEqual(compileEnemyEncounterDesigns([input(),input()],42));
  expect(plan.budget.status).toBe('measured');expect(restoreEnemyDesign(JSON.parse(JSON.stringify(baseline)))).toEqual(baseline);
 });
 it('filters before seeded selection so a valid cheaper recipe remains available',()=>{
  const variants=Array.from({length:16},(_,seed)=>compileEnemyDesign(input(),{seed,externalId:'enemy-1'}));
  const scores=variants.map(v=>combatantPower(v.blueprint.snapshot)),minimum=Math.min(...scores);
  const expensiveSeed=scores.findIndex(score=>score>minimum);expect(expensiveSeed).toBeGreaterThanOrEqual(0);
  const limits=policy({maxMemberPower:minimum});
  const result=compileEnemyDesign(input(),{seed:expensiveSeed,externalId:'enemy-1',budgetPolicy:limits});
  expect(result.budget!.status).toBe('within-budget');expect(combatantPower(result.blueprint.snapshot)).toBeLessThanOrEqual(minimum);
  expect(result).toEqual(compileEnemyDesign(input(),{seed:expensiveSeed,externalId:'enemy-1',budgetPolicy:limits}));
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
  const tampered=structuredClone(result);tampered.budget!.totalPower++;
  expect(()=>restoreEnemyDesign(tampered)).toThrow();
 });
 it('reports an impossible single cap with actual and allowed values',()=>{
  expect(()=>compileEnemyDesign(input(),{seed:42,externalId:'enemy-1',budgetPolicy:policy({maxMemberPower:0})})).toThrow(/参考战力.*超过单体上限 0/);
 });
 it('rejects the complete team even if each chosen member passes individually',()=>{
  const designs=[input(),input()],before=structuredClone(designs);
  const base=compileEnemyEncounterPlan(designs,{seed:42});
  const cap=base.budget.totalPower-1;
  expect(base.budget.members.every(m=>m.power<=cap)).toBe(true);
  try{compileEnemyEncounterPlan(designs,{seed:42,budgetPolicy:policy({maxTeamPower:cap})});throw new Error('Expected budget rejection');}
  catch(error){expect(error).toBeInstanceOf(EnemyBudgetError);expect((error as EnemyBudgetError).evaluation.issues).toContainEqual(expect.objectContaining({code:'team-power',actual:base.budget.totalPower,limit:cap}));}
  expect(designs).toEqual(before);
  const allowed=compileEnemyEncounterPlan(designs,{seed:42,budgetPolicy:policy({maxTeamPower:base.budget.totalPower})});
  expect(allowed.members.map(m=>m.blueprint)).toEqual(base.members.map(m=>m.blueprint));
 });
 it('retains structured validation for malformed options',()=>{
  expect(()=>compileEnemyDesign(input(),null as never)).toThrow('seed');
  expect(()=>compileEnemyEncounterPlan([input()],null as never)).toThrow('整数');
 });
});
