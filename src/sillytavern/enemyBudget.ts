import {combatantPower,combatantStatPower,teamPower} from '../meta/systems/combatPower';
import type {CombatantSnapshot} from '../session/contract';

/** Version of this use of the native comparison score; this is not a balance rating. */
export const ENEMY_POWER_SCORE_VERSION='native-combat-power-v1';
export interface EnemyBudgetPolicy {
 version:1;id:string;maxMemberPower?:number;maxTeamPower?:number;maxMembers?:number;
}
export interface EnemyPowerMeasurement {externalId:string;power:number;statPower:number}
export interface EnemyBudgetIssue {
 code:'member-count'|'member-power'|'team-power';path:string;actual:number;limit:number;message:string;
}
export interface EnemyBudgetEvaluation {
 scoreVersion:typeof ENEMY_POWER_SCORE_VERSION;calibration:'uncalibrated';
 policy:EnemyBudgetPolicy|null;members:EnemyPowerMeasurement[];totalPower:number;
 status:'measured'|'within-budget'|'over-budget';issues:EnemyBudgetIssue[];
}
export function validateEnemyBudgetPolicy(value:unknown):EnemyBudgetPolicy {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('敌人预算策略需要是对象');
 const raw=value as Record<string,unknown>;
 const keys=['version','id','maxMemberPower','maxTeamPower','maxMembers'] as const;
 if(Reflect.ownKeys(raw).some(k=>typeof k!=='string'||!keys.some(allowed=>allowed===k)))throw new Error('敌人预算策略包含未知字段');
 // Read each field once, then validate and return that same plain data. JS host callers
 // may supply inherited defaults or non-enumerable properties; cloning raw loses those limits.
 const p={version:raw.version,id:raw.id,maxMemberPower:raw.maxMemberPower,maxTeamPower:raw.maxTeamPower,maxMembers:raw.maxMembers};
 if(p.version!==1||typeof p.id!=='string'||!p.id.trim()||p.id.length>128)throw new Error('敌人预算策略需要有效版本和名称');
 for(const key of ['maxMemberPower','maxTeamPower','maxMembers'] as const){
  if(p[key]===undefined)continue;
  if(typeof p[key]!=='number'||!Number.isSafeInteger(p[key])||(p[key] as number)<(key==='maxMembers'?1:0)||(key==='maxMembers'&&(p[key] as number)>4))throw new Error('敌人预算 '+key+' 需要填写有效整数');
 }
 if(p.maxMemberPower===undefined&&p.maxTeamPower===undefined&&p.maxMembers===undefined)throw new Error('敌人预算策略至少需要一项限制');
 return {version:1,id:p.id,...(p.maxMemberPower!==undefined?{maxMemberPower:p.maxMemberPower as number}:{}),...(p.maxTeamPower!==undefined?{maxTeamPower:p.maxTeamPower as number}:{}),...(p.maxMembers!==undefined?{maxMembers:p.maxMembers as number}:{})};
}
export function measureEnemyPower(snapshot:CombatantSnapshot):EnemyPowerMeasurement {
 return {externalId:snapshot.externalId,power:combatantPower(snapshot),statPower:combatantStatPower(snapshot)};
}
/** Measure the final snapshots, including their actual level, difficulty, cost and ordinary traits. */
export function evaluateEnemyBudget(team:readonly CombatantSnapshot[],policy?:EnemyBudgetPolicy):EnemyBudgetEvaluation {
 const checked=policy===undefined?null:validateEnemyBudgetPolicy(policy);
 const members=team.map(measureEnemyPower),totalPower=teamPower(team),issues:EnemyBudgetIssue[]=[];
 const countLimit=checked?.maxMembers??4;
 if(team.length<1||team.length>countLimit)issues.push({code:'member-count',path:'enemyTeam',actual:team.length,limit:countLimit,message:'敌方人数 '+team.length+' 不符合 1 至 '+countLimit+' 人限制'});
 members.forEach((member,index)=>{if(checked?.maxMemberPower!==undefined&&member.power>checked.maxMemberPower)issues.push({code:'member-power',path:'enemyTeam['+index+']',actual:member.power,limit:checked.maxMemberPower,message:'敌方位置 '+(index+1)+' 的参考战力 '+member.power+' 超过单体上限 '+checked.maxMemberPower});});
 if(checked?.maxTeamPower!==undefined&&totalPower>checked.maxTeamPower)issues.push({code:'team-power',path:'enemyTeam',actual:totalPower,limit:checked.maxTeamPower,message:'敌方整队参考战力 '+totalPower+' 超过整队上限 '+checked.maxTeamPower});
 return {scoreVersion:ENEMY_POWER_SCORE_VERSION,calibration:'uncalibrated',policy:checked,members,totalPower,status:issues.length?'over-budget':checked?'within-budget':'measured',issues};
}
export class EnemyBudgetError extends Error {
 constructor(readonly evaluation:EnemyBudgetEvaluation){super(evaluation.issues.map(issue=>issue.message).join('；'));this.name='EnemyBudgetError';}
}
export function assertEnemyBudget(team:readonly CombatantSnapshot[],policy?:EnemyBudgetPolicy):EnemyBudgetEvaluation {
 const report=evaluateEnemyBudget(team,policy);if(report.issues.length)throw new EnemyBudgetError(report);return report;
}
