import {beforeAll,describe,expect,it,vi} from 'vitest';
import {prototypeEconomyIssues,traitEconomyIssues} from '../../src/sillytavern/economyAvailability';
import {executePrototype} from '../../src/engine/skills/prototypes';
import type {EffectSegment,SkillPrototype} from '../../src/engine/skills/prototypes';
import type {ModifierSource,ModifierSpec} from '../../src/engine/skills/effects/secondary';
import {createGameState} from '../../src/engine/GameState';
import {BoardModel} from '../../src/engine/BoardModel';
import {BoardGenerator} from '../../src/engine/boardGen';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BaseColor,PlayerSide,colorGem,specialGem} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {SeededRNG} from '../../src/engine/rng';
import {enableBattleEconomyAudit,exportBattleEconomyAudit} from '../../src/engine/battleEconomyLedger';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {registerStSkillLibrary,registerAdaptedCatalog,resolveAdaptedSummon} from '../../src/sillytavern/enemyBlueprint';
import {ExtensionRegistry} from '../../src/engine/registry';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {CELL,explodeAt} from '../../src/engine/skills/builders';
import {getTrait} from '../../src/engine/traits';
import {setGoldForSide} from '../../src/engine/battleGold';
import {TROOPS} from '../../src/data/troops';

type Currency='gold'|'souls'|'gems'|'maps';
const counter:Record<Currency,ModifierSource['kind']>={gold:'battleGold',souls:'battleSouls',gems:'battleGems',maps:'battleMaps'};
const gain=(currency:Currency,base=2):Extract<EffectSegment,{kind:'gainEconomy'}>=>({kind:'gainEconomy',currency,scaling:{base,mult:0}});
const modifier=(kind:ModifierSource['kind'],a=1):ModifierSpec=>({mod:{kind:'multiplier',a},source:{kind} as ModifierSource});
const hit=(spec?:ModifierSpec):Extract<EffectSegment,{kind:'damage'}>=>({kind:'damage',target:'enemyFront',scaling:{base:5,mult:0},modifier:spec});
const buff=(stat:'hp'|'armor',spec?:ModifierSpec):Extract<EffectSegment,{kind:'buff'}>=>({kind:'buff',target:'allySelf',stat,scaling:{base:5,mult:0},modifier:spec});
function runtime(proto:SkillPrototype){
 const actor=(id:number):Character=>({id,name:String(id),hp:500,maxHp:1000,armor:0,attack:1,magic:0,colors:[BaseColor.Blue],manaCost:3,mana:0,skillId:'test',statuses:[],defeated:false});
 const player=actor(0),enemy=actor(1),rng=new SeededRNG(42);
 const state=createGameState(new BoardModel(),{player:PlayerSide.Left,characters:[player]},{player:PlayerSide.Right,characters:[enemy]});
 enableBattleEconomyAudit(state);
 const cast=(side=PlayerSide.Left)=>executePrototype(proto,{state,casterId:side===PlayerSide.Left?0:1,chosenTargetId:side===PlayerSide.Left?1:0,rng,nextGemId:()=>1});
 return {state,player,enemy,rng,cast};
}
function battle(skillId:string,traitIds:string[]=[]):BattleRequest {
 const actor=(externalId:string,skill:string)=>({externalId,name:externalId,stats:{hp:500,armor:0,attack:1,magic:3},manaCost:3,manaColors:[BaseColor.Blue],skillId:skill});
 return {schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'combat-resource',requestId:'combat-resource-request',seed:42,playerTeam:[actor('hero','gw_KnightsSword')],enemyTeam:[{...actor('foe',skillId),traitIds}]};
}

describe('ST native in-battle economy',()=>{
 it.each((['gold','souls','gems','maps'] as const).flatMap(currency=>(['damage','heal','armor'] as const).map(sink=>({currency,sink}))))('opens $currency -> $sink and proves the actual combat delta',({currency,sink})=>{
   const spec=modifier(counter[currency]);
   const end=sink==='damage'?hit(spec):buff(sink==='heal'?'hp':'armor',spec);
   const proto={segments:[gain(currency),end]},f=runtime(proto),before=JSON.stringify(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   const draw=vi.spyOn(f.rng,'next');prototypeEconomyIssues(proto);expect(draw).not.toHaveBeenCalled();draw.mockRestore();
   const events=f.cast();
   if(sink==='damage')expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:7}));
   else expect(events).toContainEqual(expect.objectContaining({type:'buff',stat:sink==='heal'?'hp':'armor',amount:7}));
   expect(exportBattleEconomyAudit(f.state)!.final[currency==='gold'?'leftGold':currency]).toBe(2);
   expect(JSON.stringify(proto)).toBe(before);
 });
 it('keeps damage-before-income order: only the following cast receives the boost',()=>{
   const proto={segments:[hit(modifier('battleSouls')),gain('souls',10)]};expect(prototypeEconomyIssues(proto)).toEqual([]);
   const f=runtime(proto);expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:15}));
 });
 it('preserves once-per-battle income even when damage precedes its only credit',()=>{
   const proto:SkillPrototype={oncePerBattle:true,segments:[hit(modifier('battleSouls')),gain('souls',10)]};
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   const f=runtime(proto);expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(f.state.economy.souls).toBe(10);expect(proto.oncePerBattle).toBe(true);
   const incomeFirst:SkillPrototype={oncePerBattle:true,segments:[gain('souls',10),hit(modifier('battleSouls'))]};
   expect(prototypeEconomyIssues(incomeFirst)).toEqual([]);
   expect(runtime(incomeFirst).cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:15}));
 });
 it('spends actual own Gold before damage and never uses the nominal request as the bonus',()=>{
   const proto:SkillPrototype={segments:[gain('gold',10),{kind:'spendEconomy',currency:'gold',scaling:{base:30,mult:0}},hit(modifier('goldSpent'))]};
   expect(prototypeEconomyIssues(proto)).toEqual([]);const f=runtime(proto);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:15}));
   expect(f.state.economy.gold).toBe(0);expect(f.state.enemyGold??0).toBe(0);
   expect(exportBattleEconomyAudit(f.state)!.entries).toContainEqual(expect.objectContaining({operation:'spend',requested:30,delta:-10}));
 });
 it('resets goldSpent each cast and requires spending before its reader',()=>{
   const spend:EffectSegment={kind:'spendEconomy',currency:'gold',scaling:{base:0,mult:0},all:true};
   const readFirst={segments:[gain('gold',10),hit(modifier('goldSpent')),spend]},early=runtime(readFirst);
   expect(prototypeEconomyIssues(readFirst)).toEqual([]);
   for(let i=0;i<2;i++)expect(early.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(early.state.economy.gold).toBe(0);
   const proto={segments:[gain('gold',10),spend,hit(modifier('goldSpent'))]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   for(let i=0;i<2;i++)expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:15}));
 });
 it('supports resource-scaled skull creation without making maps an inventory reward',()=>{
   const proto:SkillPrototype={segments:[gain('maps'),{kind:'gem',params:{op:'create',gem:{kind:'skull'},count:{base:1,mult:0},modifier:modifier('battleMaps')}}]};
   expect(prototypeEconomyIssues(proto)).toEqual([]);const f=runtime(proto);const events=f.cast();
   expect(events.find(event=>event.type==='gem-create')).toEqual(expect.objectContaining({spawns:expect.arrayContaining([expect.objectContaining({})])}));
   expect(events.flatMap(event=>event.type==='gem-create'?event.spawns:[])).toHaveLength(3);
   expect(f.state.economy.maps).toBe(2);
 });
 it.each(['gold','souls','gems','maps'] as const)('executes standalone %s income and zero-balance readers without a local loop',currency=>{
   const proto={segments:[hit(),gain(currency)]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(exportBattleEconomyAudit(f.state)!.final[currency==='gold'?'leftGold':currency]).toBe(2);
   const readOnly={segments:[hit(modifier(counter[currency]))]},empty=runtime(readOnly);
   expect(prototypeEconomyIssues(readOnly)).toEqual([]);
   expect(empty.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
 });
 it('keeps every ordinary income segment in a mixed ability',()=>{
   const proto={segments:[gain('gold'),hit(modifier('battleGold')),gain('souls')]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:7}));
   expect(f.state.economy).toMatchObject({gold:2,souls:2});
 });
 it.each([0,-2])('executes a %s-valued producer with zero actual income and base damage',base=>{
   const proto={segments:[gain('gold',base),hit(modifier('battleGold'))]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   const events=f.cast();expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(events.some(event=>event.type==='economy-gain')).toBe(false);expect(f.state.economy.gold).toBe(0);
 });
 it.each([0,-1])('preserves native modifier coefficient %s and its actual damage',a=>{
   const proto={segments:[gain('gold'),hit(modifier('battleGold',a))]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:a===0?5:3}));
   expect(f.state.economy.gold).toBe(2);
 });
 it('uses the native map cap, per-source flooring and zero bonus limit',()=>{
   const overMapCap:ModifierSpec={mod:{kind:'ratio',a:3,b:1},source:{kind:'battleMaps'}};
   const cases=[
     {proto:{segments:[gain('maps',20),hit(overMapCap)]},damage:5},
     {proto:{segments:[gain('gold'),hit({...modifier('battleGold'),max:0})]},damage:5},
     {proto:{segments:[gain('gold',1),hit({mod:{kind:'ratio' as const,a:500,b:1},source:{kind:'battleGold' as const}})]},damage:5},
   ];
   for(const test of cases){
     expect(prototypeEconomyIssues(test.proto)).toEqual([]);
     const f=runtime(test.proto);expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:test.damage}));
     const producer=test.proto.segments[0]!;
     if(producer.kind==='gainEconomy'&&producer.currency==='maps')expect(f.state.economy.maps).toBe(2);
   }
 });
 it('executes spend-all before reading the remaining balance on every cast',()=>{
   const proto:SkillPrototype={segments:[gain('gold'),{kind:'spendEconomy',currency:'gold',scaling:{base:0,mult:0},all:true},hit(modifier('battleGold'))]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   for(let i=0;i<2;i++)expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(f.state.economy.gold).toBe(0);
 });
 it.each(['enemyGold','bothGold','goldStolen'] as const)('reads actual opponent context for %s instead of requiring local supply',kind=>{
   const proto={segments:[gain('gold'),hit(modifier(kind))]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);setGoldForSide(f.state,PlayerSide.Right,7);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:kind==='enemyGold'?12:kind==='bothGold'?14:5}));
   expect(f.state.enemyGold).toBe(7);expect(f.state.economy.gold).toBe(2);
 });
 it.each([false,true])('executes immediate/deferred theft against actual opponent funds (%s)',deferCredit=>{
   const proto:SkillPrototype={segments:[{kind:'stealGold',scaling:{base:50,mult:0},deferCredit},hit(modifier('goldStolen')),...(deferCredit?[{kind:'gainEconomy' as const,currency:'gold' as const,scaling:{base:0,mult:0},modifier:modifier('goldStolen')}]:[])]};
   expect(prototypeEconomyIssues(proto)).toEqual([]);const f=runtime(proto);setGoldForSide(f.state,PlayerSide.Right,7);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:12}));
   expect(f.state.enemyGold).toBe(0);expect(f.state.economy.gold).toBe(7);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(f.state.economy.gold).toBe(7);
   expect(exportBattleEconomyAudit(f.state)!.entries).toContainEqual(expect.objectContaining({operation:'steal-debit',delta:-7}));
 });
 it.each(['oneOf','choose'] as const)('retains complete native %s branches without merging their resources',kind=>{
   const options=[[gain('gold')],[hit(modifier('battleGold'))]];
   const branch:EffectSegment=kind==='choose'?{kind,options,labels:['income','combat']}:{kind,options};
   const proto={segments:[branch]},before=JSON.stringify(proto),f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   // Every possible branch is also executed independently with its original empty balance.
   const income=runtime({segments:options[0]!}),combat=runtime({segments:options[1]!});
   income.cast();expect(income.state.economy.gold).toBe(2);
   expect(combat.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   if(kind==='oneOf'){
     const events=f.cast();
     expect(events.some(event=>event.type==='economy-gain'||event.type==='skill-damage')).toBe(true);
   }
   expect(JSON.stringify(proto)).toBe(before);
 });
 it('evaluates chance, economy conditions and kill gates in the native executor',()=>{
   const sources=[{...gain('gold'),chance:.5},{...gain('gold'),ifCond:{kind:'economyAtLeast' as const,currency:'gold' as const,n:1}},{...gain('gold'),ifTargetDied:true}];
   for(const source of sources){
     const proto={segments:[source,hit(modifier('battleGold'))]},f=runtime(proto);
     expect(prototypeEconomyIssues(proto)).toEqual([]);
     const events=f.cast();expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
     expect(f.state.economy.gold).toBe(0);
   }
 });
 it('honors source precedence and native full-heal and execution semantics',()=>{
   const spec={...modifier('battleGold'),sources:[{kind:'battleSouls'} as const]};
   for(const [currency,damage] of [['gold',5],['souls',7]] as const){
     const proto={segments:[gain(currency),hit(spec)]};expect(prototypeEconomyIssues(proto)).toEqual([]);
     expect(runtime(proto).cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage}));
   }
   const heal={segments:[gain('gold'),{...buff('hp',modifier('battleGold')),full:true}]},healer=runtime(heal);
   expect(prototypeEconomyIssues(heal)).toEqual([]);healer.cast();expect(healer.player.hp).toBe(1000);
   const execute={segments:[gain('gold'),{...hit(modifier('battleGold')),execute:true}]},execution=runtime(execute);
   expect(prototypeEconomyIssues(execute)).toEqual([]);execution.cast();expect(execution.enemy.defeated).toBe(true);
 });
 it('executes each segment independently even when modifiers share the same object',()=>{
   const shared=modifier('battleGold'),proto={segments:[gain('gold'),hit(shared),{...gain('souls'),modifier:shared}]},f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   expect(f.cast()).toContainEqual(expect.objectContaining({type:'skill-damage',damage:7}));
   expect(f.state.economy).toMatchObject({gold:2,souls:4});
 });
 it('accepts ordinary income traits while retaining only the active PvP settlement restriction',()=>{
   expect(traitEconomyIssues({code:'local',name:'income',description:'income',turnStartEconomy:{currency:'gold',amount:5}})).toEqual([]);
   const trait={code:'pvp',name:'pvp',description:'pvp',pvpEconomyGain:{currency:'gold' as const,amount:1}};
   expect(traitEconomyIssues(trait)).toEqual([]);expect(traitEconomyIssues(trait,{mode:'pvp'})).toEqual(['竞技对战战后货币结算']);
 });
});

const registry=new ExtensionRegistry();
beforeAll(()=>{registerStSkillLibrary(registry.prototypes);registerAdaptedCatalog(registry);});
describe('real ST combat-resource availability',()=>{
 it.each([6276,6282,7513,7647])('prepares native income skill %s with its original effects',troopId=>{
   const form=resolveAdaptedSummon(`unit:${troopId}`)!;const proto=registry.prototypes.get(form.skillId!)!;
   const before=JSON.stringify(proto);expect(prototypeEconomyIssues(proto)).toEqual([]);
   expect(()=>prepareStBattle(battle(form.skillId!))).not.toThrow();expect(JSON.stringify(proto)).toBe(before);
 });
 const nativeCases=[
   {id:6276,currency:'gold' as const,amount:15,first:4,second:11,stat:'damage'},
   {id:6282,currency:'souls' as const,amount:10,first:4,second:9,stat:'damage'},
   {id:6297,currency:'souls' as const,amount:20,first:1,second:21,stat:'damage'},
   {id:7365,currency:'gold' as const,amount:10,first:2,second:12,stat:'damage'},
   {id:7513,currency:'gold' as const,amount:10,first:1,second:6,stat:'armor'},
   {id:7557,currency:'maps' as const,amount:1,first:2,second:6,stat:'damage'},
   {id:7647,currency:'souls' as const,amount:5,first:2,second:7,stat:'damage'},
 ];
 it.each(nativeCases)('executes native $id with original segment order and useful next-cast income',test=>{
   const form=resolveAdaptedSummon(`unit:${test.id}`)!;
   const proto=registry.prototypes.get(form.skillId!)!,f=runtime(proto);
   expect(prototypeEconomyIssues(proto)).toEqual([]);
   for(const expected of [test.first,test.second]){
     const events=f.cast();
     if(test.stat==='damage')expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:expected}));
     else expect(events).toContainEqual(expect.objectContaining({type:'buff',stat:'armor',amount:expected}));
   }
   const audit=exportBattleEconomyAudit(f.state)!;
   expect(audit.final[test.currency==='gold'?'leftGold':test.currency]).toBe(test.amount*2);
 });
 it.each([6276,6282,7513,7647].flatMap(id=>[PlayerSide.Left,PlayerSide.Right].map(side=>({id,side}))))('runs native $id on side $side via formal ST preparation and TurnEngine',({id,side})=>{
   const test=nativeCases.find(test=>test.id===id)!,form=resolveAdaptedSummon(`unit:${id}`)!;
   const input=battle(form.skillId!,form.traitIds);
   input.enemyTeam[0]={...input.enemyTeam[0]!,manaCost:form.manaCost,manaColors:form.colors,
     troopTypes:form.troopTypes,kingdom:form.kingdom,kingdomId:form.kingdomId,battleScaling:form.battleScaling};
   if(side===PlayerSide.Left)[input.playerTeam,input.enemyTeam]=[input.enemyTeam,input.playerTeam];
   for(const actor of [...input.playerTeam,...input.enemyTeam])actor.stats={hp:9999,armor:0,attack:1,magic:0};
   const setup=prepareStBattle(input),rng=new SeededRNG(input.seed);let gid=1000;
   const next=()=>gid++,teams=mapRequestToTeams(input);
   const state=createGameState(new BoardGenerator(rng,next).generate(),teams.playerTeam,teams.enemyTeam);
   const engine=new TurnEngine(state,rng,next,setup.registry,setup.configureEngine);
   const caster=state.teams[side].characters[0]!,other=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
   engine.setTargetChooser({choose:()=>state.teams[other].characters[0]!.id});
   // Keep real opening traits: Water Spirit adds one Magic to Red Rose.
   const openingMagic=caster.magic;
   expect(openingMagic).toBe(id===6276?1:0);
   expect(exportBattleEconomyAudit(state)!.final).toEqual({leftGold:0,rightGold:0,souls:0,gems:0,maps:0});
   for(const expected of [test.first,test.second]){
     if(state.activePlayer!==side)engine.passTurn();
     // Recharge is a fixture for the following legal cast, never assumed resource income.
     caster.mana=caster.manaCost;
     const events=engine.resolveAction({type:'cast',characterId:caster.id});
     expect(events).toContainEqual(expect.objectContaining({type:'skill-cast',characterId:caster.id,skillId:form.skillId}));
     if(test.stat==='damage')expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:expected+openingMagic}));
     else expect(events).toContainEqual(expect.objectContaining({type:'buff',stat:'armor',amount:expected+openingMagic}));
   }
   const audit=exportBattleEconomyAudit(state)!,key=test.currency==='gold'?(side===PlayerSide.Left?'leftGold':'rightGold'):test.currency;
   expect(audit.final[key]).toBe(test.amount*2);
   expect(audit.final[side===PlayerSide.Left?'rightGold':'leftGold']).toBe(0);
   expect(audit.entries.filter(entry=>entry.source==='skill-gain'&&entry.actorId===caster.id)).toHaveLength(2);
 });
 it('prepares every native income candidate with original traits and dependencies intact',()=>{
   const candidates:number[]=[];
   for(const troop of TROOPS){
     const form=resolveAdaptedSummon(`unit:${troop.id}`)!,proto=registry.prototypes.get(form.skillId!)!;
     if(!proto.segments.some(segment=>segment.kind==='gainEconomy'))continue;
     candidates.push(troop.id);const before=JSON.stringify({form,proto});
     expect(prototypeEconomyIssues(proto),`troop ${troop.id}`).toEqual([]);
     for(const id of form.traitIds??[])expect(traitEconomyIssues(getTrait(id)!)).toEqual([]);
     expect(()=>prepareStBattle(battle(form.skillId!,form.traitIds)),`troop ${troop.id}`).not.toThrow();
     expect(JSON.stringify({form,proto})).toBe(before);
   }
   expect(candidates).toEqual(expect.arrayContaining([6276,6282,6297,7365,7513,7557,7647]));
   expect(TROOPS).toHaveLength(1821);
 });
});

function formalRuntime(input:BattleRequest,side=PlayerSide.Left,native=false){
 const setup=prepareStBattle(input),rng=new SeededRNG(input.seed);let gid=1000;
 const next=()=>gid++,board=new BoardModel(),palette=[BaseColor.Green,BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:next(),type:colorGem(palette[(row+col)%4]!)});
 const teams=mapRequestToTeams(input),state=createGameState(board,teams.playerTeam,teams.enemyTeam,side);
 const engine=new TurnEngine(state,rng,next,setup.registry,native?engine=>engine.enableEconomyAudit():setup.configureEngine);
 engine.skullChance=0;engine.takeInitialEvents();
 return {state,board,engine,rng,next,registry:setup.registry};
}

describe('ST preparation preserves native economy execution',()=>{
 it.each([4,5].flatMap(size=>[PlayerSide.Left,PlayerSide.Right].map(side=>({size,side}))))('credits a real $size-match to side $side exactly as native',({size,side})=>{
   const input=battle('gw_KnightsSword'),before=JSON.stringify(input);
   const st=formalRuntime(input,side),native=formalRuntime(input,side,true);
   for(const f of [st,native]){
     for(let col=0;col<size;col++)f.board.set({row:7,col},{id:f.next(),type:colorGem(col===1?BaseColor.Green:BaseColor.Blue)});
     f.board.set({row:7,col:size},{id:f.next(),type:colorGem(BaseColor.Green)});
     f.board.set({row:6,col:1},{id:f.next(),type:colorGem(BaseColor.Blue)});
   }
   const action={type:'swap' as const,from:{row:7,col:1},to:{row:6,col:1}};
   const actual=st.engine.resolveAction(action),expected=native.engine.resolveAction(action);
   expect(actual).toContainEqual({type:'economy-gain',currency:'gold',amount:size,side});
   expect(actual).toEqual(expected);
   expect(exportBattleEconomyAudit(st.state)).toEqual(exportBattleEconomyAudit(native.state));
   expect(exportBattleEconomyAudit(st.state)!.entries).toContainEqual(expect.objectContaining({source:'match',account:side,delta:size}));
   expect(st.state.economy).toEqual(native.state.economy);expect(st.state.enemyGold).toBe(native.state.enemyGold);
   expect(st.rng.getState()).toBe(native.rng.getState());expect(JSON.stringify(input)).toBe(before);
 });
 it.each(['goldenhoard','soulverdict'].flatMap(code=>[PlayerSide.Left,PlayerSide.Right].map(side=>({code,side}))))('executes original $code on side $side after ST preparation',({code,side})=>{
   const input=battle('gw_KnightsSword',[code]);
   if(side===PlayerSide.Left)[input.playerTeam,input.enemyTeam]=[input.enemyTeam,input.playerTeam];
   const f=formalRuntime(input),holder=f.state.teams[side].characters[0]!;
   if(code==='goldenhoard'){
     // Real handovers trigger TurnEngine's turn-start income exactly once for this holder.
     f.engine.passTurn();if(side===PlayerSide.Left)f.engine.passTurn();
   }else{
     if(f.state.activePlayer!==side)f.engine.passTurn();holder.mana=holder.manaCost;
     const events=f.engine.resolveAction({type:'cast',characterId:holder.id});
     expect(events).toContainEqual(expect.objectContaining({type:'skill-cast',characterId:holder.id}));
     expect(events).toContainEqual({type:'economy-gain',currency:'souls',amount:3,side});
   }
   const audit=exportBattleEconomyAudit(f.state)!,currency=code==='goldenhoard'?'gold':'souls',amount=code==='goldenhoard'?5:3;
   const entries=audit.entries.filter(entry=>entry.source==='trait'&&entry.actorId===holder.id);
   expect(entries).toEqual([expect.objectContaining({currency,side,delta:amount})]);
   expect(audit.final[currency==='gold'?(side===PlayerSide.Left?'leftGold':'rightGold'):'souls']).toBe(amount);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('executes Booty destruction on side %s through the native effect pipeline',side=>{
   const input=battle('gw_KnightsSword'),f=formalRuntime(input,side);
   f.registry.prototypes.set('gw_KnightsSword',{segments:[explodeAt(CELL)]});
   f.board.set({row:0,col:0},{id:f.next(),type:specialGem('bootyGem')});
   f.engine.setCellChooser({choose:()=>({row:0,col:0})});
   const caster=f.state.teams[side].characters[0]!;caster.mana=caster.manaCost;
   const events=f.engine.resolveAction({type:'cast',characterId:caster.id});
   expect(events).toContainEqual(expect.objectContaining({type:'skill-cast',characterId:caster.id}));
   expect(events).toContainEqual(expect.objectContaining({type:'special-gem-trigger',kind:'bootyGem'}));
   expect(events).toContainEqual({type:'economy-gain',currency:'gold',amount:10,side});
   expect(exportBattleEconomyAudit(f.state)!.entries.filter(entry=>entry.source==='booty-gem')).toEqual([
     expect.objectContaining({currency:'gold',side,account:side,delta:10}),
   ]);
 });
 it('retains once-per-battle action rejection with unchanged balances and RNG',()=>{
   const f=formalRuntime(battle('gw_KnightsSword'));
   f.registry.prototypes.set('gw_KnightsSword',{oncePerBattle:true,segments:[hit(modifier('battleSouls')),gain('souls',10)]});
   const caster=f.state.teams[PlayerSide.Left].characters[0]!;caster.mana=caster.manaCost;
   const events=f.engine.resolveAction({type:'cast',characterId:caster.id});
   expect(events).toContainEqual(expect.objectContaining({type:'skill-cast',characterId:caster.id}));
   expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(f.state.economy.souls).toBe(10);
   if(f.state.activePlayer!==PlayerSide.Left)f.engine.passTurn();caster.mana=caster.manaCost;
   const before=JSON.stringify(f.state),rngBefore=f.rng.getState();
   expect(f.engine.resolveAction({type:'cast',characterId:caster.id})).toEqual([]);
   expect(JSON.stringify(f.state)).toBe(before);expect(f.rng.getState()).toBe(rngBefore);
 });
});
