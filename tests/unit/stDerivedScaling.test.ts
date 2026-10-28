import {describe,it,expect} from 'vitest';
import {TROOPS,troopToSummonTemplate} from '../../src/data/troops';
import {compileEnemyBlueprint,resolveAdaptedSummon} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {mapRequestToTeams,snapshotToCharacter} from '../../src/session/combatantMapping';
import {BoardGenerator} from '../../src/engine/boardGen';
import {SeededRNG} from '../../src/engine/rng';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {PlayerSide} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {registerDynamicTraits} from '../../src/engine/traits';
import {transformTroopEffect,summonCopyEffect} from '../../src/engine/skills/effects/summon';
import {dmg} from '../../src/engine/skills/builders';

function snapshot(ref:string,level:number,difficulty=1):CombatantSnapshot{
 const t=TROOPS.find(t=>t.referenceName===ref)!;const p=PORTRAITS.find(p=>p.troopId===t.id)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:ref,level,difficulty}).snapshot;
}
function battle(source:CombatantSnapshot,enemy?:CombatantSnapshot){
 const input:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'derived',requestId:'derived-request',seed:43,
 playerTeam:[source],enemyTeam:[enemy??{...snapshot('QueenYsabelle',5),externalId:'enemy',stats:{hp:9999,attack:0,armor:0,magic:0}}]};
 const setup=prepareStBattle(input);const mapped=mapRequestToTeams(JSON.parse(JSON.stringify(input)));const rng=new SeededRNG(input.seed);let gid=1000;
 const state=createGameState(new BoardGenerator(rng,()=>gid++).generate(),mapped.playerTeam,mapped.enemyTeam);
 const engine=new TurnEngine(state,rng,()=>gid++,setup.registry,setup.configureEngine);engine.skullChance=0;
 const caster=state.teams.Left.characters[0]!;caster.mana=caster.manaCost;
 return {input,state,engine,caster,registry:setup.registry,ctx:{state,casterId:caster.id,rng,nextGemId:()=>gid++,resolveSummonRef:resolveAdaptedSummon}};
}
function withoutBattleId(c:Character){const {id:_id,statuses:_statuses,defeated:_defeated,passive:_passive,...template}=c;return template;}

describe('ST derived forms keep frozen scaling and artwork',()=>{
 it('freezes and independently maps level/difficulty and explicit artwork',()=>{
  const source=snapshot('GiantSpider',49,1.2);const restored=JSON.parse(JSON.stringify(source));const actor=snapshotToCharacter(restored,0);
  expect(actor.battleScaling).toEqual({level:49,difficulty:1.2});expect(actor.portraitUrl).toBe(source.portraitUrl);
  actor.battleScaling!.level=1;expect(restored.battleScaling.level).toBe(49);
  const invalid={...source,battleScaling:{level:101,difficulty:1}};expect(()=>battle(invalid)).toThrow('battleScaling');
 });
 it('runs actual Giant Spider summons using each caster level and difficulty after JSON persistence',()=>{
  const observed:number[]=[];
  for(const level of [1,95]){
   const f=battle(snapshot('GiantSpider',level,2));const ev=f.engine.castSkill(f.caster.id);const event=ev.find(e=>e.type==='summon');expect(event).toBeDefined();
   const child=f.state.teams.Left.characters.find(c=>c.id!==f.caster.id)!;expect(child.battleScaling).toEqual({level,difficulty:2});
   const expected=resolveAdaptedSummon(child.mechanicalIdentity!,{level,difficulty:2})!;
   expect(child.maxHp).toBe(expected.maxHp);expect(child.magic).toBe(expected.magic);expect(child.portraitUrl).toMatch(/static\/portraits\/.*\.webp$/);
   observed.push(child.maxHp);
  }
  expect(observed[1]).toBeGreaterThan(observed[0]!);
 });
 it('keeps the source scaling when the actual Sunbird caster dies before summoning itself',()=>{
  const f=battle(snapshot('Sunbird',49,1.2));const ev=f.engine.castSkill(f.caster.id);expect(ev.some(e=>e.type==='defeat'&&e.characterId===f.caster.id)).toBe(true);
  const child=f.state.teams.Left.characters.find(c=>c.id!==f.caster.id)!;expect(child).toBeDefined();expect(child.battleScaling).toEqual({level:49,difficulty:1.2});
  expect(child.maxHp).toBe(resolveAdaptedSummon(`unit:${TROOPS.find(t=>t.referenceName==='Sunbird')!.id}`,{level:49,difficulty:1.2})!.maxHp);
 });
 it('uses each transform target scaling and preserves stable IDs, artwork and per-event form',()=>{
  const f=battle(snapshot('GiantSpider',49,1.2));const low=snapshotToCharacter(snapshot('QueenYsabelle',1),8);const high=snapshotToCharacter(snapshot('QueenYsabelle',95,2),9);
  f.state.teams.Right.characters=[low,high];const ref=`unit:${TROOPS.find(t=>t.referenceName==='BabyDragon')!.id}`;
  const ev=transformTroopEffect({targets:[low,high],ref}).apply(f.ctx);expect(ev).toHaveLength(2);
  for(const [target,scaling] of [[low,{level:1,difficulty:1}],[high,{level:95,difficulty:2}]] as const){
   const expected=resolveAdaptedSummon(ref,scaling)!;expect(target.maxHp).toBe(expected.maxHp);expect(target.battleScaling).toEqual(scaling);expect(target.portraitUrl).toBe(expected.portraitUrl);
   expect(ev.find(e=>e.type==='troop-transform'&&e.targetId===target.id)).toMatchObject({portraitUrl:expected.portraitUrl});
  }
  expect([low.id,high.id]).toEqual([8,9]);expect(high.maxHp).toBeGreaterThan(low.maxHp);
 });
 it('copies actual form scaling/artwork without aliasing metadata',()=>{
  const f=battle(snapshot('QueenYsabelle',49,1.2));const original={...f.caster};summonCopyEffect({targets:[f.caster]}).apply(f.ctx);
  const copy=f.state.teams.Left.characters.find(c=>c.id!==f.caster.id)!;expect(copy.battleScaling).toEqual(f.caster.battleScaling);expect(copy.portraitUrl).toBe(f.caster.portraitUrl);
  copy.battleScaling!.level=1;expect(f.caster.battleScaling!.level).toBe(49);
  transformTroopEffect({targets:[f.caster],copyOf:[copy]}).apply(f.ctx);expect(f.caster.battleScaling!.level).toBe(1);expect(f.caster.id).toBe(original.id);
 });
 it('resolves real engine death-trigger summons from the dead holder rather than attacker',()=>{
  const child=TROOPS.find(t=>t.referenceName==='SpiderSwarm')!;
  registerDynamicTraits([{code:'test-derived-death',name:'派生测试',description:'死亡召唤',summonOnDeath:{chance:1,troopId:child.id,referenceName:`unit:${child.id}`,displayName:'召唤体'}}]);
  const victim={...snapshot('QueenYsabelle',49,1.2),stats:{hp:1,attack:0,armor:0,magic:0},traitIds:['test-derived-death']};
  const f=battle(snapshot('GiantSpider',5),victim);f.registry.prototypes.set('test-derived-kill',{segments:[dmg('enemyAll',1000,0)]});f.caster.skillId='test-derived-kill';
  const ev=f.engine.castSkill(f.caster.id);expect(ev.some(e=>e.type==='summon'&&e.player===PlayerSide.Right)).toBe(true);
  const summoned=f.state.teams.Right.characters.find(c=>c.mechanicalIdentity===`unit:${child.id}`)!;expect(summoned.battleScaling).toEqual({level:49,difficulty:1.2});
 });
 it('keeps the native arena boolean contract when a source actor is supplied',()=>{
  const source=snapshotToCharacter(snapshot('GiantSpider',49,1.2),0);
  expect(troopToSummonTemplate('BabyDragon',source)).toEqual(troopToSummonTemplate('BabyDragon',false));
  expect(troopToSummonTemplate('BabyDragon',true)!.traitIds).toEqual([]);
  expect(withoutBattleId({...source,id:0})).toHaveProperty('battleScaling');
 });
 it('uses a real placeholder for missing indexed artwork and rejects invalid scaling before resolving',()=>{
  const missing=TROOPS.find(t=>!PORTRAITS.some(p=>p.troopId===t.id))!;expect(resolveAdaptedSummon(`unit:${missing.id}`)!.portraitUrl).toMatch(/static\/hero\/character-unknown\.webp$/);
  expect(()=>resolveAdaptedSummon(`unit:${missing.id}`,{level:0,difficulty:1})).toThrow('超出范围');
 });
});
