import {describe,expect,it,vi} from 'vitest';
import {BoardGenerator} from '../../src/engine/boardGen';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import {executePrototype} from '../../src/engine/skills/prototypes';
import type {EffectSegment} from '../../src/engine/skills/prototypes';
import type {BattleEconomyAudit} from '../../src/engine/battleEconomyLedger';
import {buildBattleResult} from '../../src/session/battleResult';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {createSave,emptyRoot,recordEncounter,settleSave,validateSave} from '../../src/sillytavern/save';

function fixture({enabled=true,maps=true,winner='player',id='battle'}:{enabled?:boolean;maps?:boolean;winner?:'player'|'enemy';id?:string}={}){
 const actor=(externalId:string):CombatantSnapshot=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'});
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:id,requestId:`${id}-request`,seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]};
 const mapped=mapRequestToTeams(request);const rng=new SeededRNG(request.seed);let gid=1000;const nextId=()=>gid++;
 const state=createGameState(new BoardGenerator(rng,nextId).generate(),mapped.playerTeam,mapped.enemyTeam);
 const runtime=prepareStBattle(request);
 const engine=new TurnEngine(state,rng,nextId,runtime.registry,enabled?runtime.configureEngine:undefined);
 const events=engine.takeInitialEvents();
 const apply=(side:PlayerSide,segments:EffectSegment[])=>{
   const casterId=state.teams[side].characters[0]!.id;
   events.push(...executePrototype({segments},{state,casterId,rng,nextGemId:nextId}));
 };
 apply(PlayerSide.Left,[{kind:'gainEconomy',currency:'gold',scaling:{base:25,mult:0}}]);
 apply(PlayerSide.Right,[
   {kind:'gainEconomy',currency:'gold',scaling:{base:19,mult:0}},
   {kind:'gainEconomy',currency:'souls',scaling:{base:4,mult:0}},
   {kind:'gainEconomy',currency:'gems',scaling:{base:3,mult:0}},
   ...(maps?[{kind:'gainEconomy' as const,currency:'maps' as const,scaling:{base:1,mult:0}}]:[]),
 ]);
 apply(PlayerSide.Left,[{kind:'spendEconomy',currency:'gold',scaling:{base:7,mult:0}},{kind:'stealGold',scaling:{base:5,mult:0}}]);
 state.winner=winner==='player'?PlayerSide.Left:PlayerSide.Right;
 const loser=state.teams[winner==='player'?PlayerSide.Right:PlayerSide.Left].characters[0]!;loser.hp=0;loser.defeated=true;
 const build=()=>buildBattleResult({request,state,idMap:mapped.idMap,events});
 const result=build();
 const encounter=recordEncounter(request,[{sourceId:'source',abilityId:'active:ice',abilityName:'冰矢',rank:4,enemyExternalId:'enemy'}],'normal','encounter');
 const save=createSave(emptyRoot(),{hostId:'host',characterId:'hero',chatId:'chat'},'save',1);
 const input={kind:'story' as const,encounter,request,result,events,storyGrants:[{kind:'currency' as const,id:'gems',name:'宝石',quantity:5},{kind:'material' as const,id:'iron',name:'铁矿石',quantity:2}]};
 return {save,input,state,build,rng};
}
const auditOf=(result:BattleResult):BattleEconomyAudit=>result.economyAudit!;

describe('ST-04 battle economy result and receipt',()=>{
 it('exports a reconciled snapshot of real engine effects, with independent enemy Gold and native shared pools',()=>{
   const {input,state,build,rng}=fixture();const result=input.result;const audit=auditOf(result);
   expect(result.economy).toEqual({gold:23,souls:4,gems:3,maps:1});
   expect(audit.final).toEqual({leftGold:23,rightGold:14,souls:4,gems:3,maps:1});
   expect(audit.entries).toEqual(expect.arrayContaining([
     expect.objectContaining({currency:'gold',side:PlayerSide.Right,account:PlayerSide.Right,delta:19}),
     expect.objectContaining({currency:'souls',side:PlayerSide.Right,account:'shared',delta:4}),
     expect.objectContaining({currency:'gold',source:'skill-spend',before:25,after:18,delta:-7}),
     expect.objectContaining({currency:'gold',operation:'steal-debit',actorId:0,actionIndex:0,before:19,after:14,delta:-5}),
     expect.objectContaining({currency:'gold',operation:'steal-credit',actorId:0,actionIndex:0,cap:500,multiplier:1,before:18,after:23,delta:5}),
   ]));
   expect(audit).not.toBe(state.economyAudit);expect(audit.entries[0]).not.toBe(state.economyAudit!.entries[0]);
   const draw=vi.spyOn(rng,'next');expect(build()).toEqual(result);expect(draw).not.toHaveBeenCalled();draw.mockRestore();
   state.economyAudit!.entries[0]!.requested=999;
   state.economyAudit!.initial.leftGold=999;state.economyAudit!.final.rightGold=999;
   state.economy.gold=999;
   expect(audit.initial.leftGold).toBe(0);expect(audit.entries[0]!.requested).toBe(25);
   expect(audit.final.rightGold).toBe(14);expect(result.economy!.gold).toBe(23);
 });
 it('omits the audit when disabled and fails visibly on an unrecorded balance mutation',()=>{
   expect(fixture({enabled:false}).input.result).not.toHaveProperty('economyAudit');
   const {state,build}=fixture();state.economy.gems++;
   expect(build).toThrow();
 });
 it('persists the actual snapshot and grants once; retries and reopened receipts neither roll nor credit again',()=>{
   const {save,input}=fixture();const original=structuredClone(input.result);const receipt=settleSave(save,input);
   expect(receipt.result).toEqual(original);expect(receipt.grants.map(g=>g.name)).toEqual(['enemy的灵魂碎片','宝石','铁矿石']);
   expect(save.balances).toEqual({'currency:gems':5,'material:iron':2});
   const committed=structuredClone(save);const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('unexpected roll');});
   try{
     expect(settleSave(save,{...input,events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:999}]})).toEqual(receipt);
     expect(save).toEqual(committed);
     const reopened=validateSave(JSON.parse(JSON.stringify(save)));
     expect(settleSave(reopened,{...input,events:[]})).toEqual(receipt);expect(reopened).toEqual(committed);
     expect(random).not.toHaveBeenCalled();
   }finally{random.mockRestore();}
   receipt.result.economyAudit!.entries[0]!.after=999;input.result.economyAudit!.final.leftGold=999;
   expect(save.settlements[0]!.result).toEqual(original);
 });
 it('preserves legacy fragment names and source identities on import and repeated settlement',()=>{
   const {save,input}=fixture();settleSave(save,input);
   save.settlements[0]!.grants[0]!.name='冰矢〔08hzkdw〕灵魂碎片';
   const committed=structuredClone(save);const reopened=validateSave(JSON.parse(JSON.stringify(save)));
   expect(settleSave(reopened,input)).toEqual(committed.settlements[0]);
   expect(reopened.settlements[0]!.grants[0]).toEqual({kind:'fragment',id:'source',name:'冰矢〔08hzkdw〕灵魂碎片',quantity:1});
   expect(reopened).toEqual(committed);
 });
 it('retains a losing battle audit without adding any grants, wallet balance or learning progress',()=>{
   const {save,input}=fixture({winner:'enemy'});const receipt=settleSave(save,input);
   expect(receipt.result.economyAudit!.final.gems).toBe(3);expect(receipt.grants).toEqual([]);
   expect(save.balances).toEqual({});expect(save.sources).toEqual([]);expect(save.encounters).toEqual([]);
   expect(validateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
   expect(settleSave(save,input)).toEqual(receipt);
 });
 it('keeps replay fragment-only even when the replay has a nonzero audit',()=>{
   const {save,input}=fixture();settleSave(save,input);const before=structuredClone(save.balances);
   const replay=fixture({id:'replay'}).input;
   const replayInput={...replay,kind:'replay' as const,encounter:save.encounters[0]!,storyGrants:[]};
   const receipt=settleSave(save,replayInput);expect(receipt.grants.map(g=>g.kind)).toEqual(['fragment']);
   expect(save.balances).toEqual(before);expect(save.sources[0]!.wins).toBe(2);
   expect(settleSave(save,replayInput)).toEqual(receipt);expect(save.sources[0]!.wins).toBe(2);
   expect(validateSave(save).settlements).toHaveLength(2);
 });
 it('accepts omitted maps only for a zero final map balance, and keeps rightGold independent',()=>{
   const {save,input}=fixture({maps:false});expect(input.result.economy).not.toHaveProperty('maps');
   expect(auditOf(input.result).final.rightGold).toBe(14);
   settleSave(save,input);expect(validateSave(save)).toEqual(save);
   const zero=fixture({maps:false});zero.input.result.economy!.maps=0;
   expect(()=>settleSave(zero.save,zero.input)).not.toThrow();
 });
 it.each([true,false])('round trips and retries historical results without audit (economy present: %s)',withEconomy=>{
   const {save,input}=fixture({enabled:false});if(!withEconomy)delete input.result.economy;
   const receipt=settleSave(save,input);const reopened=validateSave(JSON.parse(JSON.stringify(save)));
   expect(reopened.settlements[0]!.result).not.toHaveProperty('economyAudit');
   expect(settleSave(reopened,input)).toEqual(receipt);expect(reopened.balances).toEqual(save.balances);
 });
 const corruptions:{name:string;edit:(r:BattleResult)=>void}[]=[
   {name:'null audit',edit:r=>{r.economyAudit=null as unknown as BattleEconomyAudit;}},
   {name:'unknown version',edit:r=>{Object.assign(auditOf(r),{version:2});}},
   {name:'unknown field',edit:r=>{Object.assign(auditOf(r),{grants:[]});}},
   {name:'invalid initial',edit:r=>{auditOf(r).initial.leftGold=-1;}},
   {name:'missing entries',edit:r=>{auditOf(r).entries.pop();}},
   {name:'sequence gap',edit:r=>{auditOf(r).entries[0]!.sequence=2;}},
   {name:'discontinuous balance',edit:r=>{const e=auditOf(r).entries[0]!;e.before++;e.delta--;}},
   {name:'forged delta',edit:r=>{auditOf(r).entries[0]!.delta++;}},
   {name:'forged account',edit:r=>{auditOf(r).entries[0]!.account='shared';}},
   {name:'forged shared account',edit:r=>{auditOf(r).entries.find(e=>e.currency==='souls')!.account=PlayerSide.Right;}},
   {name:'forged source',edit:r=>{Object.assign(auditOf(r).entries[0]!,{source:'invented'});}},
   {name:'forged side',edit:r=>{Object.assign(auditOf(r).entries[0]!,{side:'player'});}},
   {name:'forged transfer',edit:r=>{auditOf(r).entries.find(e=>e.operation==='steal-credit')!.transferId=1;}},
   {name:'missing theft credit cap',edit:r=>{delete auditOf(r).entries.find(e=>e.operation==='steal-credit')!.cap;}},
   {name:'missing theft credit multiplier',edit:r=>{delete auditOf(r).entries.find(e=>e.operation==='steal-credit')!.multiplier;}},
   {name:'mismatched theft actor',edit:r=>{auditOf(r).entries.find(e=>e.operation==='steal-credit')!.actorId=4;}},
   {name:'mismatched theft action',edit:r=>{auditOf(r).entries.find(e=>e.operation==='steal-credit')!.actionIndex=1;}},
   {name:'forged final',edit:r=>{auditOf(r).final.rightGold++;}},
   {name:'missing economy',edit:r=>{delete r.economy;}},
   {name:'missing gold',edit:r=>{Reflect.deleteProperty(r.economy!,'gold');}},
   ...(['gold','souls','gems','maps'] as const).map(currency=>({name:`mismatched ${currency}`,edit:(r:BattleResult)=>{r.economy![currency]=(r.economy![currency]??0)+1;}})),
   {name:'missing nonzero maps',edit:r=>{delete r.economy!.maps;}},
 ];
 it.each(corruptions)('rejects $name before settlement and when restoring an imported receipt',({edit})=>{
   const {save,input}=fixture();const original=structuredClone(save);const result=structuredClone(input.result);edit(result);
   expect(()=>settleSave(save,{...input,result})).toThrow();expect(save).toEqual(original);
   settleSave(save,input);const forged=JSON.parse(JSON.stringify(save));edit(forged.settlements[0].result);
   expect(()=>validateSave(forged)).toThrow();
 });
 it('rejects a changed but internally reconciled audit on retry, including independent rightGold',()=>{
   const {save,input}=fixture();settleSave(save,input);const before=structuredClone(save);
   const result=structuredClone(input.result);const audit=auditOf(result);
   audit.initial.rightGold++;
   for(const entry of audit.entries.filter(e=>e.currency==='gold'&&e.account===PlayerSide.Right)){entry.before++;entry.after++;}
   audit.final.rightGold++;
   expect(()=>settleSave(save,{...input,result})).toThrow('冲突');expect(save).toEqual(before);
 });
});
