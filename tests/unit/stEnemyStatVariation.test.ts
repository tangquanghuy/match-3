import {describe,it,expect,vi} from 'vitest';
import * as leveling from '../../src/data/leveling';
import {BaseColor} from '../../src/engine/types';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {STAT_LIMITS} from '../../src/session/validateRequest';
import {compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import type {EnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {compileEnemyEncounterPlan,DEFAULT_ENEMY_DESIGN_INPUT,restoreEnemyDesign} from '../../src/sillytavern/enemyDesign';
import {buildEnemyFormation,restoreEnemyFormation} from '../../src/sillytavern/enemyFormation';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';
import {createSave,emptyRoot,recordEncounter,replayRequest} from '../../src/sillytavern/save';

function input(){
 const p=PORTRAITS[0]!;
 return {portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'enemy-1',level:20,difficulty:1};
}
function standard(blueprint:EnemyBlueprint){
 return compileEnemyBlueprint({portrait:blueprint.portrait,recipeTroopId:Number(blueprint.recipeId.slice(6)),assembly:blueprint.assembly,externalId:blueprint.snapshot.externalId,level:blueprint.level,difficulty:blueprint.difficulty});
}
describe('program-owned enemy HP, attack, armor and magic variation',()=>{
 it('varies all four stats independently up or down by 5–10 percent before integer rounding',()=>{
  const growth=vi.spyOn(leveling,'troopStatsAtLevel').mockReturnValue({health:200,attack:100,armor:100,magic:100});
  try{
   const base=compileEnemyBlueprint(input());
   const signs=new Set<string>();
   const values={hp:new Set<number>(),attack:new Set<number>(),armor:new Set<number>(),magic:new Set<number>()};
   for(let seed=1;seed<=128;seed++){
    const result=compileEnemyBlueprint({...input(),statVariationSeed:seed});
    const directions=[];
    for(const key of ['hp','attack','armor','magic'] as const){
     const actual=result.snapshot.stats[key],value=base.snapshot.stats[key];
     const change=Math.abs(actual-value);
     expect(change).toBeGreaterThanOrEqual(value*.05-.5);
     expect(change).toBeLessThanOrEqual(value*.10+.5);
     expect(Number.isInteger(actual)).toBe(true);
     directions.push(Math.sign(actual-value));values[key].add(actual);
    }
    signs.add(directions.join(','));
    expect(result.abilityId).toBe(base.abilityId);
    expect(result.snapshot.battleScaling).toEqual(base.snapshot.battleScaling);
   }
   expect(signs.size).toBe(16);
   for(const set of Object.values(values))expect(set.size).toBeGreaterThan(4);
  }finally{growth.mockRestore();}
 });
 it('keeps zero stats, minimum HP and existing panel limits valid',()=>{
  const growth=vi.spyOn(leveling,'troopStatsAtLevel');
  try{
   for(const stats of [{health:1,attack:0,armor:0,magic:0},{health:9999,attack:999,armor:999,magic:999}]){
    growth.mockReturnValue(stats);
    for(let seed=1;seed<=16;seed++){
     const result=compileEnemyBlueprint({...input(),statVariationSeed:seed});
     for(const key of ['hp','attack','armor','magic'] as const){
      expect(result.snapshot.stats[key]).toBeGreaterThanOrEqual(STAT_LIMITS[key].min);
      expect(result.snapshot.stats[key]).toBeLessThanOrEqual(STAT_LIMITS[key].max);
     }
     if(stats.attack===0)expect(result.snapshot.stats).toMatchObject({hp:1,attack:0,armor:0,magic:0});
    }
   }
  }finally{growth.mockRestore();}
 });
 it('keeps old blueprints unchanged and rejects changed saved stats or invalid variation seeds',()=>{
  const old=compileEnemyBlueprint(input());
  expect(old).not.toHaveProperty('statVariationSeed');
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(old)))).toEqual(old);
  const current=compileEnemyBlueprint({...input(),statVariationSeed:42});
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(current)))).toEqual(current);
  const corrupt=structuredClone(current);corrupt.snapshot.stats.hp++;
  expect(()=>restoreEnemyBlueprint(corrupt)).toThrow('已变更');
  for(const seed of [null,1.5,NaN,Infinity,'42']){
   expect(()=>compileEnemyBlueprint({...input(),statVariationSeed:seed as number})).toThrow('安全整数');
  }
 });
 it('applies separate variation seeds to every encounter slot and restores full designs and formations',()=>{
  const designs=Array.from({length:4},()=>({...structuredClone(DEFAULT_ENEMY_DESIGN_INPUT),assembly:'classified'}));
  const before=structuredClone(designs),plan=compileEnemyEncounterPlan(designs,{seed:42});
  expect(new Set(plan.members.map(m=>m.blueprint.statVariationSeed)).size).toBe(4);
  expect(compileEnemyEncounterPlan(designs,{seed:42})).toEqual(plan);
  expect(designs).toEqual(before);
  for(const member of plan.members){
   expect(restoreEnemyDesign(JSON.parse(JSON.stringify(member)))).toEqual(member);
   expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(member.blueprint)))).toEqual(member.blueprint);
   expect(member.blueprint.snapshot.stats).not.toEqual(standard(member.blueprint).snapshot.stats);
  }
  const formation=buildEnemyFormation(plan.members.map(m=>m.blueprint));
  expect(formation.members).toEqual(plan.members.map(m=>m.blueprint));
  expect(restoreEnemyFormation(JSON.parse(JSON.stringify(formation)))).toEqual(formation);
  expect(compileEnemyEncounterPlan(designs,{seed:43}).members.map(m=>m.blueprint.statVariationSeed))
   .not.toEqual(plan.members.map(m=>m.blueprint.statVariationSeed));
 });
 it('reuses the saved enemy stats for repeated replays without changing the original snapshot',()=>{
  const plan=compileEnemyEncounterPlan([DEFAULT_ENEMY_DESIGN_INPUT],{seed:42});
  const player={externalId:'hero',name:'Hero',stats:{hp:100,attack:10,armor:0,magic:7},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword'};
  const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'story',requestId:'story-request',seed:42,playerTeam:[player],enemyTeam:plan.members.map(m=>m.blueprint.snapshot)};
  const sources=plan.members.map(m=>({sourceId:m.blueprint.sourceId,abilityId:m.blueprint.abilityId,abilityName:m.blueprint.snapshot.spellName!,rank:0,enemyExternalId:m.externalId}));
  const record=recordEncounter(request,sources,'基础','encounter');
  const save=createSave(emptyRoot(),{hostId:'test',characterId:'c',chatId:'chat'},'save',1);
  save.encounters.push(record);
  const reopened=JSON.parse(JSON.stringify(save));
  const versions:Pick<BattleRequest,'schemaVersion'|'rulesetVersion'>={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION};
  for(let n=0;n<3;n++){
   const replay=replayRequest(reopened,'encounter',[player],{battleId:`replay-${n}`,requestId:`request-${n}`},versions);
   expect(replay.enemyTeam).toEqual(request.enemyTeam);expect(replay.seed).toBe(request.seed);
   replay.enemyTeam[0]!.stats.hp=1;
   expect(record.enemyTeam).toEqual(request.enemyTeam);
  }
 });
});
