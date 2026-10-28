import {describe,it,expect} from 'vitest';
import {buildStBattleReport} from '../../src/sillytavern/battleReport';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import type {GameEvent} from '../../src/engine/events';
import {BaseColor} from '../../src/engine/types';
function actor(externalId:string):CombatantSnapshot{return {externalId,name:externalId,stats:{hp:100,attack:10,armor:40,magic:5},initialHp:80,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'};}
function fixture(){
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'battle',requestId:'request',seed:42,playerTeam:[actor('hero'),actor('friend')],enemyTeam:[actor('enemy')]};
 const result:BattleResult={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'battle',requestId:'request',seed:42,winner:'player',turns:3,combatants:[{externalId:'hero',side:'player',hp:50,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'friend',side:'player',hp:0,maxHp:100,armor:0,defeated:true,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['friend','enemy'],summonedCount:0,actionLogDigest:'digest',eventSummary:[]};
 return {request,result};
}
describe('ST factual battle reports',()=>{
 it('records falls and revival separately from final survival, and separates net HP from cumulative damage and healing',()=>{
   const {request,result}=fixture();const events:GameEvent[]=[
     {type:'skill-damage',casterId:4,targetId:0,range:'single',damage:200,hpLoss:80,resultingHp:0,resultingArmor:0},
     {type:'buff',targetId:0,stat:'hp',amount:50,revived:true},
     {type:'skill-damage',casterId:4,targetId:0,range:'single',damage:30,hpLoss:30,resultingHp:20,resultingArmor:0},
     {type:'buff',targetId:0,stat:'hp',amount:30},
     {type:'skill-damage',casterId:4,targetId:1,range:'single',damage:500,hpLoss:80,resultingHp:0,resultingArmor:0},
     {type:'defeat',characterId:1},{type:'defeat',characterId:4},
   ];
   const report=buildStBattleReport(request,result,events);
   expect(report.units[0]).toMatchObject({initialHp:80,finalHp:50,initialHpPercent:80,finalHpPercent:50,hpLostPercentagePoints:30,hpDamage:110,hpHealing:80,fellCount:1,revivedCount:1,finallyDefeated:false});
   expect(report.fallenAllyIds).toEqual(['hero','friend']);expect(report.revivedAllyIds).toEqual(['hero']);expect(report.defeatedEnemyIds).toEqual(['enemy']);
 });
 it('records HP growth and transformation without counting them as ordinary healing',()=>{
   const {request,result}=fixture();result.combatants[0]!.hp=60;result.combatants[0]!.maxHp=120;
   const events:GameEvent[]=[{type:'buff',targetId:0,stat:'hp',amount:20,maxHpGain:20},{type:'troop-transform',targetId:0,name:'形态',hp:60,maxHp:120}];
   const hero=buildStBattleReport(request,result,events).units[0]!;
   expect(hero).toMatchObject({hpGrowth:20,hpHealing:0,hpDamage:0,hpLostPercentagePoints:30,finalHpPercent:50});
 });
 it('uses actual hit HP loss even with startup HP bonuses, excludes fleeing enemies, and reports raw self-revival',()=>{
   const {request,result}=fixture();result.combatants[2] = {...result.combatants[2]!,hp:20,defeated:false,fled:true};
   const report=buildStBattleReport(request,result,[{type:'skill-damage',casterId:4,targetId:0,range:'single',damage:40,hpLoss:10,resultingHp:100,resultingArmor:0},{type:'buff',targetId:0,stat:'hp',amount:50,revived:true}]);
   expect(report.units[0]).toMatchObject({hpDamage:10,fellCount:1,revivedCount:1});expect(report.defeatedEnemyIds).toEqual([]);
 });
 it('requires every original participant and transformation life snapshots',()=>{
   const {request,result}=fixture();expect(()=>buildStBattleReport(request,{...result,combatants:[]},[])).toThrow('终局');
   expect(()=>buildStBattleReport(request,result,[{type:'troop-transform',targetId:0,name:'legacy'}])).toThrow('快照');
 });
});
