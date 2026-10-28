import {describe,it,expect} from 'vitest';
import {BaseColor} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import {beginStory,completeStory} from '../../src/sillytavern/storySession';
import {beginReplay,completeReplay,createSave,emptyRoot,validateSave} from '../../src/sillytavern/save';
import type {AbilitySource,PendingStory,StSave} from '../../src/sillytavern/save';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {BoardGenerator} from '../../src/engine/boardGen';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {createGameState} from '../../src/engine/GameState';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BattleSession} from '../../src/session/BattleSession';
import {chooseAiAction} from '../../src/engine/aiPolicy';

function actor(externalId:string):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:7},initialHp:25,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'};
}
function fixture(n=0) {
 const save=createSave(emptyRoot(),{hostId:'host',characterId:'character',chatId:'chat'},'save');
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`story-${n}`,requestId:`request-${n}`,seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy1'),actor('enemy2')],playerBanner:{boosts:{Blue:2}},enemyBanner:{boosts:{Blue:1}},playerManaMastery:{Blue:12},enemyManaMastery:{Blue:7},arenaRules:true,kingdom:'测试王国',mode:'pvp',rules:{turnLimit:{turns:8,onExpire:'playerWins'}}};
 const sources:AbilitySource[]=request.enemyTeam.map(e=>({sourceId:'source',abilityId:'ability',abilityName:'骑士剑技',rank:4,enemyExternalId:e.externalId}));
 const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner:'player',turns:5,combatants:[{externalId:'hero',side:'player',hp:25,maxHp:100,armor:0,defeated:false,statuses:[]},...request.enemyTeam.map(e=>({externalId:e.externalId,side:'enemy' as const,hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}))],defeatedExternalIds:['enemy1','enemy2'],summonedCount:0,actionLogDigest:`digest-${n}`,economy:{gold:99,souls:42,gems:3,maps:1},eventSummary:[{type:'defeat',count:2}]};
 const events:GameEvent[]=[{type:'skill-damage',casterId:0,targetId:4,range:'single',damage:25,hpLoss:25,resultingHp:0,resultingArmor:0},{type:'defeat',characterId:4},{type:'defeat',characterId:5}];
 const begin=()=>beginStory(save,request,sources,'hard',`encounter-${n}`);
 return {save,request,sources,result,events,begin};
}
function restore(save:StSave):StSave {return validateSave(JSON.parse(JSON.stringify(save)));}

describe('ST durable story lifecycle',()=>{
 it('freezes the complete original request and sources without registering a victory',()=>{
   const f=fixture();const original=structuredClone(f.request);const sources=structuredClone(f.sources);const ticket=f.begin();
   expect(ticket).toEqual({request:original,sources,difficulty:'hard',encounterId:'encounter-0'});
   f.request.enemyTeam[0]!.name='changed input';f.sources[0]!.abilityName='changed input';ticket.request.playerTeam[0]!.initialHp=100;ticket.sources.length=0;
   expect(f.save.pendingStory).toEqual({request:original,sources,difficulty:'hard',encounterId:'encounter-0'});
   expect(f.save.encounters).toEqual([]);expect(f.save.sources).toEqual([]);expect(f.save.settlements).toEqual([]);
   expect(restore(f.save).pendingStory).toEqual(f.save.pendingStory);
   const before=JSON.stringify(f.save);expect(f.begin).toThrow('待完成');expect(JSON.stringify(f.save)).toBe(before);
 });
 it('settles against the durable original, grants one actual fragment per source and retains a complete receipt',()=>{
   const f=fixture();f.begin();const original=structuredClone(f.request);const save=restore(f.save);
   f.request.playerTeam[0]!.initialHp=100;f.request.enemyTeam[0]!.stats.attack=999;f.sources.length=0;
   const receipt=completeStory(save,f.result,f.events);
   expect(save.pendingStory).toBeUndefined();expect(receipt.request).toEqual(original);expect(receipt.result).toEqual(f.result);
   expect(receipt.grants).toEqual([{kind:'fragment',id:'source',name:'骑士剑技灵魂碎片',quantity:1}]);expect(save.balances).toEqual({});
   expect(save.sources[0]!.wins).toBe(1);expect(save.encounters).toHaveLength(1);expect(save.encounters[0]).toMatchObject({id:'encounter-0',difficulty:'hard',enemyTeam:original.enemyTeam,sources:fixture().sources,rules:original.rules,seed:original.seed});
   expect(receipt.report.defeatedEnemyIds).toEqual(['enemy1','enemy2']);expect(receipt.report.units[0]!.initialHp).toBe(25);expect(receipt.report.units[1]!.hpDamage).toBe(25);
   expect(restore(save)).toEqual(save);
   const before=JSON.stringify(save);expect(completeStory(save,f.result,[])).toEqual(receipt);expect(JSON.stringify(save)).toBe(before);
   receipt.request.playerTeam[0]!.name='changed response';receipt.grants[0]!.quantity=999;expect(save.settlements[0]!.grants[0]!.quantity).toBe(1);expect(save.settlements[0]!.request).toEqual(original);
 });
 // Native settlement DOM, grant names and quantities are covered in stMessageStory.spec.ts.
 it('records defeat without a codex entry, grants or learning progress, and retries it idempotently',()=>{
   const f=fixture();f.result.winner='enemy';f.begin();const receipt=completeStory(f.save,f.result,f.events);
   expect(receipt.grants).toEqual([]);expect(receipt.learnedAbilityIds).toEqual([]);expect(f.save.encounters).toEqual([]);expect(f.save.sources).toEqual([]);expect(f.save.balances).toEqual({});
   expect(f.save.pendingStory).toBeUndefined();expect(restore(f.save).settlements[0]!.result).toEqual(f.result);
   expect(completeStory(f.save,f.result,[])).toEqual(receipt);expect(f.save.settlements).toHaveLength(1);
 });
 it('excludes fleeing or surviving sources and still registers the actual story victory',()=>{
   const f=fixture();f.result.combatants[1]={...f.result.combatants[1]!,hp:25,defeated:false,fled:true};f.result.combatants[2]={...f.result.combatants[2]!,hp:25,defeated:false};f.result.defeatedExternalIds=[];f.result.fledExternalIds=['enemy1'];f.begin();
   const receipt=completeStory(f.save,f.result,[]);expect(receipt.grants).toEqual([]);expect(f.save.sources).toEqual([]);expect(f.save.encounters[0]!.sources).toEqual([]);expect(restore(f.save).encounters).toHaveLength(1);
 });
 it('learns at the existing threshold, retaining the learned name and stopping later fragments',()=>{
   const f=fixture();f.save.sources=[{sourceId:'source',abilityId:'ability',abilityName:'骑士剑技',rank:4,wins:4}];f.begin();
   const receipt=completeStory(f.save,f.result,f.events);expect(receipt.learnedAbilityIds).toEqual(['ability']);expect(receipt.learnedAbilityNames).toEqual({ability:'骑士剑技'});expect(f.save.sources[0]!.wins).toBe(5);
   const next=fixture(1);beginStory(f.save,next.request,next.sources,'normal','encounter-1');expect(completeStory(f.save,next.result,next.events).grants).toEqual([]);expect(f.save.sources[0]!.wins).toBe(5);expect(restore(f.save).encounters).toHaveLength(2);
 });
 it('rejects unbound results, mismatches and partial reports atomically, then allows the real result',()=>{
   const f=fixture();expect(()=>completeStory(f.save,f.result,[])).toThrow('对应');f.begin();const before=JSON.stringify(f.save);
   for(const patch of [{battleId:'foreign'},{requestId:'foreign'},{seed:43},{rulesetVersion:'foreign'},{combatants:[]}]){
     expect(()=>completeStory(f.save,{...f.result,...patch},f.events)).toThrow();expect(JSON.stringify(f.save)).toBe(before);
   }
   expect(()=>completeStory(f.save,f.result,[{type:'troop-transform',targetId:0,name:'incomplete'}])).toThrow();expect(JSON.stringify(f.save)).toBe(before);
   completeStory(f.save,f.result,f.events);const after=JSON.stringify(f.save);expect(()=>completeStory(f.save,{...f.result,turns:99},[])).toThrow('冲突');expect(()=>completeStory(f.save,{...f.result,winner:'enemy'},[])).toThrow('冲突');expect(JSON.stringify(f.save)).toBe(after);
 });
 it('keeps a newer story or replay ticket when retrying an older complete receipt',()=>{
   const f=fixture();f.begin();const receipt=completeStory(f.save,f.result,f.events);const next=fixture(1);beginStory(f.save,next.request,next.sources,'normal','encounter-1');
   expect(completeStory(f.save,f.result,[])).toEqual(receipt);expect(f.save.pendingStory!.request).toEqual(next.request);completeStory(f.save,next.result,next.events);
   beginReplay(f.save,'encounter-0',[actor('hero')],{battleId:'replay',requestId:'replay-request'});expect(completeStory(f.save,f.result,[])).toEqual(receipt);expect(f.save.pendingReplay!.request.battleId).toBe('replay');expect(restore(f.save).pendingReplay).toBeDefined();
 });
 it('enforces story/replay mutual exclusion from both entry points and during import',()=>{
   const f=fixture();const story=f.begin();expect(()=>beginReplay(f.save,'missing',[actor('hero')],{battleId:'replay',requestId:'replay-request'})).toThrow('剧情');
   completeStory(f.save,f.result,f.events);beginReplay(f.save,'encounter-0',[actor('hero')],{battleId:'replay',requestId:'replay-request'});
   const next=fixture(1);const before=JSON.stringify(f.save);expect(()=>beginStory(f.save,next.request,next.sources,'normal','next')).toThrow('互斥');expect(JSON.stringify(f.save)).toBe(before);
   const mixed=structuredClone(f.save);mixed.pendingStory={...story,request:next.request,encounterId:'next'};expect(()=>restore(mixed)).toThrow('互斥');
   expect(()=>completeReplay({...next.save,pendingStory:story},f.result,[])).toThrow();
 });
 it('rejects IDs belonging to replay receipts and preserves the replay ticket',()=>{
   const f=fixture();f.begin();completeStory(f.save,f.result,f.events);const ticket=beginReplay(f.save,'encounter-0',[actor('hero')],{battleId:'replay',requestId:'replay-request'});
   const result={...f.result,battleId:'replay',requestId:'replay-request'};completeReplay(f.save,result,[]);const before=JSON.stringify(f.save);
   expect(()=>completeStory(f.save,result,[])).toThrow('往昔');expect(JSON.stringify(f.save)).toBe(before);expect(ticket.request.battleId).toBe('replay');
 });
 it.each(['battle','request','encounter'] as const)('rejects reused %s IDs before changing the save',field=>{
   const f=fixture();f.begin();completeStory(f.save,f.result,f.events);const next=fixture(1);if(field==='battle')next.request.battleId=f.request.battleId;if(field==='request')next.request.requestId=f.request.requestId;
   const before=JSON.stringify(f.save);expect(()=>beginStory(f.save,next.request,next.sources,'hard',field==='encounter'?'encounter-0':'encounter-1')).toThrow('标识');expect(JSON.stringify(f.save)).toBe(before);
 });
 it('does not reuse the encounter ID of a defeated story receipt',()=>{
   const f=fixture();f.result.winner='enemy';f.begin();completeStory(f.save,f.result,[]);const next=fixture(1);expect(()=>beginStory(f.save,next.request,next.sources,'normal','encounter-0')).toThrow('标识');
 });
});

const corruptions:[string,(ticket:PendingStory)=>void][]=[
 ['empty encounter',t=>{t.encounterId=' ';}],['empty difficulty',t=>{t.difficulty=' ';}],
 ['unknown ticket data',t=>{Object.assign(t,{encounter:{id:'forged'}});}],['missing request',t=>{Object.assign(t,{request:null});}],
 ['invalid schema',t=>{Object.assign(t.request,{schemaVersion:999});}],['unknown ruleset',t=>{t.request.rulesetVersion='future';}],
 ['missing players',t=>{t.request.playerTeam=[];}],['unknown skill',t=>{t.request.enemyTeam[0]!.skillId='forged';}],
 ['unknown trait',t=>{t.request.enemyTeam[0]!.traitIds=['forged'];}],['unknown affinity',t=>{t.request.enemyTeam[0]!.troopTypes=['forged'];}],
 ['invalid HP',t=>{t.request.playerTeam[0]!.initialHp=101;}],['invalid banner',t=>{t.request.enemyBanner={boosts:{Blue:999}};}],
 ['invalid rules',t=>{t.request.rules={turnLimit:{turns:999,onExpire:'playerWins'}};}],['missing sources',t=>{Object.assign(t,{sources:null});}],
 ['unknown enemy',t=>{t.sources[0]!.enemyExternalId='summoned';}],['empty ability',t=>{t.sources[0]!.abilityId=' ';}],
 ['invalid rank',t=>{t.sources[0]!.rank=5;}],['conflicting source',t=>{t.sources[1]!.abilityId='forged';}],
];
describe('ST imported story tickets',()=>{
 it('retains a persisted economic story snapshot and accepts the same native mechanics in a new story',()=>{
   const f=fixture();f.request.enemyTeam[0]!.skillId='st:7037';
   // Historical snapshots retain the exact source recipe when ordinary mechanics are available.
   const historical:PendingStory={encounterId:'encounter-0',request:structuredClone(f.request),sources:structuredClone(f.sources),difficulty:'hard'};
   f.save.pendingStory=historical;const before=structuredClone(f.save);
   const restored=restore(f.save);expect(restored).toEqual(before);expect(f.save).toEqual(before);
   expect(()=>prepareStBattle(restored.pendingStory!.request)).not.toThrow();
   const fresh=fixture();fresh.request.enemyTeam[0]!.skillId='st:7037';const untouched=structuredClone(fresh.save);
   expect(()=>fresh.begin()).not.toThrow();
   expect(fresh.save.pendingStory!.request).toEqual(fresh.request);
   expect(fresh.save.encounters).toEqual(untouched.encounters);expect(fresh.save.sources).toEqual(untouched.sources);
   expect(fresh.save.balances).toEqual(untouched.balances);expect(restore(fresh.save)).toEqual(fresh.save);
 });
 it.each(corruptions)('rejects %s without registering encounters or fragments',(_name,mutate)=>{
   const f=fixture();f.begin();mutate(f.save.pendingStory!);const before=JSON.stringify(f.save);expect(()=>restore(f.save)).toThrow();expect(JSON.stringify(f.save)).toBe(before);expect(f.save.encounters).toEqual([]);expect(f.save.sources).toEqual([]);
 });
 it('rejects fabricated codex entries with pending alone and validates both settled-ID collisions',()=>{
   const f=fixture();f.begin();const ticket=structuredClone(f.save.pendingStory!);completeStory(f.save,f.result,f.events);
   f.save.pendingStory=ticket;expect(()=>restore(f.save)).toThrow('标识');delete f.save.pendingStory;
   const next=fixture(1);beginStory(f.save,next.request,next.sources,'normal','encounter-1');f.save.pendingStory!.request.requestId=f.result.requestId;expect(()=>restore(f.save)).toThrow('标识');
   const forged=fixture();forged.begin();forged.save.encounters.push(structuredClone(f.save.encounters[0]!));expect(()=>restore(forged.save)).toThrow('胜利');
 });
 it('keeps existing saves without pendingStory compatible and permits an empty source list',()=>{
   const f=fixture();expect(restore(f.save)).toEqual(f.save);beginStory(f.save,f.request,[],'normal','encounter-0');const receipt=completeStory(restore(f.save),f.result,[]);expect(receipt.grants).toEqual([]);
 });
});

describe('ST story actual engine integration',()=>{
 it('completes from a real deterministic match-3 engine result and persists its factual report',()=>{
   const f=fixture();f.request.playerTeam[0]!.stats={hp:500,attack:60,armor:40,magic:60};f.request.playerTeam[0]!.initialHp=500;f.begin();
   const input=restore(f.save).pendingStory!.request;const setup=prepareStBattle(input);const rng=new SeededRNG(input.seed);let next=10000;const id=()=>next++;
   const board=new BoardGenerator(rng,id).generate();const mapped=mapRequestToTeams(input);const state=createGameState(board,mapped.playerTeam,mapped.enemyTeam);const engine=new TurnEngine(state,rng,id,setup.registry,setup.configureEngine);
   const session=new BattleSession({request:input,engine,idMap:mapped.idMap});
   for(let i=0;i<300&&!session.isFinished();i++){
     const choice=chooseAiAction({state,side:state.activePlayer,rng,registry:setup.registry});if(!choice||!session.resolve(choice.action).length)session.passTurn();
   }
   expect(session.isFinished()).toBe(true);const result=session.buildResult();expect(result.winner).toBe('player');
   const receipt=completeStory(f.save,result,session.recordedEvents());expect(receipt.result).toEqual(result);expect(receipt.grants).toHaveLength(1);expect(f.save.sources[0]!.wins).toBe(1);expect(restore(f.save).settlements[0]).toEqual(receipt);
 });
});
