import {RULESET_VERSION} from '../session/contract';
import {compileEnemyBlueprint,restoreEnemyBlueprint} from './enemyBlueprint';
import type {EnemyBlueprint} from './enemyBlueprint';
import {stEnvironmentScaling} from './environmentScaling';
import type {EnvironmentScaling} from './environmentScaling';
import {stableJson} from './json';
import {COLORS} from './portraits';
import {assertEnemyBudget} from './enemyBudget';
import type {EnemyBudgetPolicy,EnemyBudgetEvaluation} from './enemyBudget';

export const FORMATION_VERSION=1;
export interface EnemyFormation {
 version:typeof FORMATION_VERSION;
 rulesetVersion:string;
 members:EnemyBlueprint[];
 budgetPolicy?:EnemyBudgetPolicy;
}
export interface EnemyFormationSummary {
 memberCount:number;
 stats:{hp:number;armor:number;attack:number;magic:number};
 manaCost:number;
 colors:{color:string;positions:number[]}[];
 environment:EnvironmentScaling;
 budget:EnemyBudgetEvaluation;
}

/** Preserve full designs while rebinding their identities to the ordered positions. */
export function buildEnemyFormation(input:readonly EnemyBlueprint[],budgetPolicy?:EnemyBudgetPolicy):EnemyFormation {
 if(!Array.isArray(input)||input.length<1||input.length>4)throw new Error('敌方阵容需要 1 至 4 名成员');
 const members=Array.from(input,(value,index)=>{
  const member=restoreEnemyBlueprint(value);
  return structuredClone(compileEnemyBlueprint({...(member.presentation?{presentation:member.presentation}:{}),portrait:member.portrait,recipeTroopId:Number(member.recipeId.slice(6)),...(member.assembly?{assembly:member.assembly}:{}),externalId:`enemy-${index+1}`,level:member.level,difficulty:member.difficulty,...(member.statVariationSeed!==undefined?{statVariationSeed:member.statVariationSeed}:{})}));
 });
 const budget=assertEnemyBudget(members.map(member=>member.snapshot),budgetPolicy);
 return {version:FORMATION_VERSION,rulesetVersion:RULESET_VERSION,members,...(budget.policy?{budgetPolicy:budget.policy}:{})};
}

/** Restore the entire formation atomically; persisted positions must already be canonical. */
export function restoreEnemyFormation(value:unknown):EnemyFormation {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('敌方阵容配置格式有误');
 const saved=value as EnemyFormation;
 if(saved.version!==FORMATION_VERSION||saved.rulesetVersion!==RULESET_VERSION)throw new Error('敌方阵容配置版本已变更，请重新组装');
 const canonical=buildEnemyFormation(saved.members,saved.budgetPolicy);
 if(stableJson(saved)!==stableJson(canonical))throw new Error('敌方阵容站位或配置已变更，请重新组装');
 return canonical;
}

/** Base panels are summed directly; environmental scaling follows the initial enemy roster. */
export function summarizeEnemyFormation(formation:EnemyFormation):EnemyFormationSummary {
 const {members,budgetPolicy}=restoreEnemyFormation(formation);
 const stats={hp:0,armor:0,attack:0,magic:0};let manaCost=0;
 for(const {snapshot}of members){
  for(const key of ['hp','armor','attack','magic'] as const)stats[key]+=snapshot.stats[key];
  manaCost+=snapshot.manaCost;
 }
 const colors=COLORS.flatMap(color=>{
  const positions=members.flatMap(({snapshot},index)=>snapshot.manaColors.some(c=>c===color)?[index+1]:[]);
  return positions.length?[{color,positions}]:[];
 });
 const environment=stEnvironmentScaling({playerTeam:[],enemyTeam:members.map(member=>member.snapshot)}).enemy;
 const budget=assertEnemyBudget(members.map(member=>member.snapshot),budgetPolicy);
 return {memberCount:members.length,stats,manaCost,colors,environment,budget};
}
