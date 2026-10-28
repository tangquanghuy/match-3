import {describe,expect,it,vi} from 'vitest';
import type {TroopData} from '../../src/data/troops';
import type {TraitDefinition} from '../../src/engine/traits';
import * as troopData from '../../src/data/troops';
import {SKILL_LIBRARY} from '../../src/engine/skills/library';
import {compileEnemyDesign,restoreEnemyDesign,DEFAULT_ENEMY_DESIGN_INPUT,EnemyDesignError} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS} from '../../src/sillytavern/portraits';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {gemEffect} from '../../src/engine/skills/effects/gems';
import type {GemParams} from '../../src/engine/skills/effects/gems';
import type {EffectSegment,GemSegment} from '../../src/engine/skills/prototypes';
import {enemyGenerationIssues,enemyTeamGenerationIssues,profileEnemyAssembly} from '../../src/sillytavern/enemyAssemblyPolicy';

const {Red,Blue,Green}=BaseColor;
const troop:TroopData={
 id:1,name:'fixture',referenceName:'fixture',rarity:'Common',rarityIdx:0,kingdom:null,
 troopTypes:[],role:'Generator',attack:5,armor:5,health:10,magic:3,manaColors:[Red],manaCost:12,
 spell:{id:2,name:'fixture',description:'',meta:{scalings:[],raw:'',parsed:false}},traits:[],portrait:null,
};
const gem=(params:GemParams):GemSegment=>({kind:'gem',params});
const create=(color:BaseColor,count=5)=>gem({op:'create',gem:{kind:'color',color},count:{base:count,mult:0}});
const lethal:EffectSegment={kind:'devour',target:'enemyFront',chance:.25};
const extra:EffectSegment={kind:'extraTurn'};
const mass:EffectSegment={kind:'status',target:'enemyAll',statusId:'silence',turns:2};
const profile=(color:BaseColor,segments:EffectSegment[],version:1|2=2,cost=12)=>
 profileEnemyAssembly({...troop,manaColors:[color],manaCost:cost},{segments},[],[],version);
const clear=(mode:'destroy'|'explode'|'remove',color:BaseColor=Red)=>gem({op:'clear',mode,target:{kind:'color',color}});
const issues=(...profiles:ReturnType<typeof profile>[])=>enemyTeamGenerationIssues(profiles,2);
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

describe('v2 closed team mana supply risk',()=>{
 it('does not treat skull-damaged devour as an active-loop hazard without its event',()=>{
  const trait:TraitDefinition={code:'event-devour',name:'fixture',description:'',onSkullDamagedDevour:{chance:1}};
  const prototype={segments:[create(Red),extra]};
  const member=profileEnemyAssembly(troop,prototype,[trait],[],2);
  expect(member.highImpact).toEqual(['devour','extraTurn']);
  expect(member.manaFlow!.paths[0]!.lethal).toBe(false);
  expect(issues(member)).toEqual([]);
  expect(enemyGenerationIssues(member,'\u4f20\u5947','special',2)).toEqual([]);
  expect(enemyGenerationIssues(member,'\u6742\u5175','ordinary',2)).toContain('highImpactLimit');
  const legacy=profileEnemyAssembly(troop,prototype,[trait],[],1);
  const {manaFlow,...base}=member;
  expect(legacy).toEqual(base);
  expect(enemyGenerationIssues(legacy,'\u4f20\u5947','special',1)).toContain('lethalManaLoop');
 });
 it('does not treat death-triggered team control as an active-loop hazard',()=>{
  const trait:TraitDefinition={code:'event-control',name:'fixture',description:'',
   onSelfDeathEnemyAllStatus:{statuses:[{id:'silence'}],turns:2}};
  const prototype={segments:[create(Red),extra]};
  const member=profileEnemyAssembly(troop,prototype,[trait],[],2);
  expect(member.manaFlow!.paths[0]!.cheapControl).toBe(false);
  expect(issues(member)).toEqual([]);
  expect(enemyGenerationIssues(member,'\u4f20\u5947','special',2)).toEqual([]);
  const {manaFlow,...base}=member;
  expect(profileEnemyAssembly(troop,prototype,[trait],[],1)).toEqual(base);
 });

 it('finds red to blue / blue to red despite neither member feeding itself',()=>{
  const a=profile(Red,[create(Blue),lethal,extra]),b=profile(Blue,[create(Red)]);
  expect(a.selfMana).toBe(false);expect(b.selfMana).toBe(false);
  expect(issues(a,b)).toEqual(['teamLethalManaLoop']);
  expect(issues(b,a)).toEqual(issues(a,b));
 });
 it('finds hazards and extra turns on different members of the same cycle',()=>{
  expect(issues(profile(Red,[create(Blue),lethal]),profile(Blue,[create(Red),extra])))
   .toEqual(['teamLethalManaLoop']);
 });
 it('allows ordinary mutual supply without a hazardous effect',()=>{
  expect(issues(profile(Red,[create(Blue),extra]),profile(Blue,[create(Red)]))).toEqual([]);
 });
 it('allows a hazardous cycle without an explicit extra turn',()=>{
  expect(issues(profile(Red,[create(Blue),lethal]),profile(Blue,[create(Red)]))).toEqual([]);
 });
 it('allows one-way supply even with lethal and extra-turn effects',()=>{
  expect(issues(profile(Red,[create(Blue),lethal,extra]),profile(Blue,[create(Green)]))).toEqual([]);
 });
 it('does not attach unrelated lethal and extra-turn effects to a benign cycle',()=>{
  expect(issues(profile(Red,[create(Red)]),profile(Blue,[lethal,extra]))).toEqual([]);
 });
 it('does not attach an extra-turn recipient to a closed lethal self-feeder',()=>{
  expect(issues(profile(Red,[create(Red),lethal]),profile(Blue,[extra]))).toEqual([]);
 });
 it('finds a three-member cycle',()=>{
  expect(issues(profile(Red,[create(Blue),lethal]),profile(Blue,[create(Green)]),profile(Green,[create(Red),extra])))
   .toEqual(['teamLethalManaLoop']);
 });
 it.each(['destroy','explode'] as const)('includes native %s collected mana without inventing a color output',mode=>{
  const a=profile(Red,[clear(mode),lethal,extra]);
  expect(a.generatedColors).toEqual([]);expect(a.selfMana).toBe(false);
  expect(a.manaFlow!.paths[0]!.collectedColors).toContain(Red);
  expect(issues(a)).toEqual(['teamLethalManaLoop']);
 });
 it('finds cross-member destroy collection edges',()=>{
  expect(issues(profile(Red,[clear('destroy',Blue),lethal,extra]),profile(Blue,[clear('destroy',Red)])))
   .toEqual(['teamLethalManaLoop']);
 });
 it('excludes remove, skull-only destruction and empty clear targets',()=>{
  for(const segment of [clear('remove'),gem({op:'clear',mode:'destroy',target:{kind:'skulls'}}),
   gem({op:'clear',mode:'destroy',target:{kind:'lines',rows:[],cols:[]}}),
   gem({op:'clear',mode:'destroy',target:{kind:'randomGems',count:{base:0,mult:0}}})]){
   const a=profile(Red,[segment,lethal,extra]);
   expect(a.manaFlow!.paths[0]!.collectedColors).toEqual([]);expect(issues(a)).toEqual([]);
  }
 });
 it('uses destroy filters and explosion neighbours with the native priority of colors',()=>{
  const random=(mode:'destroy'|'explode')=>gem({op:'clear',mode,target:{kind:'randomGems',count:{base:5,mult:0},colors:[Blue],color:Red}});
  expect(issues(profile(Red,[random('destroy'),lethal,extra]))).toEqual([]);
  expect(issues(profile(Red,[random('explode'),lethal,extra]))).toEqual(['teamLethalManaLoop']);
 });
 it('checks cheap mass-control cycles and preserves the cost boundary',()=>{
  expect(issues(profile(Red,[create(Blue),mass,extra],2,14),profile(Blue,[create(Red)])))
   .toEqual(['teamCheapControlLoop']);
  expect(issues(profile(Red,[create(Blue),mass,extra],2,15),profile(Blue,[create(Red)]))).toEqual([]);
 });
 it.each(['choose','oneOf'] as const)('keeps mutually exclusive %s branches separate',kind=>{
  const branches:EffectSegment=kind==='choose'
   ?{kind,labels:['supply','hazard'],options:[[create(Blue)],[lethal,extra]]}
   :{kind,options:[[create(Blue)],[lethal,extra]]};
  expect(issues(profile(Red,[branches]),profile(Blue,[create(Red)]))).toEqual([]);
 });
 it('detects an actual hazardous branch without merging its siblings',()=>{
  const branch:EffectSegment={kind:'oneOf',options:[[create(Blue),lethal,extra],[create(Green)]]};
  expect(issues(profile(Red,[branch]),profile(Blue,[create(Red)]))).toEqual(['teamLethalManaLoop']);
 });
 it.each([
  {...create(Blue),chance:0}, {...create(Blue),chance:.5}, {...create(Blue),ifTargetDied:true},
  {...create(Blue),ifCond:{kind:'selfHpDamaged' as const}},create(Blue,0),
  {kind:'oneOf' as const,chance:.5,options:[[create(Blue)]]},
 ])('leaves gated or empty supply out of the conservative cycle: %j',supply=>{
  expect(issues(profile(Red,[supply,lethal,extra]),profile(Blue,[create(Red)]))).toEqual([]);
 });
 it('does not convert a chance-based extra turn or natural four-matches into guaranteed turn retention',()=>{
  expect(issues(profile(Red,[create(Blue),lethal,{...extra,chance:.5}]),profile(Blue,[create(Red)]))).toEqual([]);
 });
 it('includes unconditional self/all direct mana but excludes zero grants',()=>{
  const mana=(target:'allySelf'|'allyAll',amount=5):EffectSegment=>({kind:'buff',stat:'mana',target,scaling:{base:amount,mult:0}});
  expect(issues(profile(Red,[mana('allySelf'),lethal,extra]))).toEqual(['teamLethalManaLoop']);
  expect(issues(profile(Red,[mana('allyAll'),lethal]),profile(Blue,[mana('allyAll'),extra])))
   .toEqual(['teamLethalManaLoop']);
  expect(issues(profile(Red,[mana('allySelf',0),lethal,extra]))).toEqual([]);
 });
 it('persists instance palettes and branch evidence through JSON without mutating inputs',()=>{
  const segments=[create(Blue),lethal,extra],before=clone(segments);
  const a=profile(Red,segments),b=profile(Blue,[create(Red)]);
  expect(segments).toEqual(before);expect(profile(Red,segments)).toEqual(a);
  expect(a.manaFlow!.consumedColors).toEqual([Red]);
  expect(issues(clone(a),clone(b))).toEqual(issues(a,b));
 });
 it('defaults to v2 but preserves the entire v1 profile shape and old admission',()=>{
  const segments=[create(Blue),lethal,extra],a=profile(Red,segments,1),b=profile(Blue,[create(Red)],1);
  const {manaFlow,...v2base}=profileEnemyAssembly(troop,{segments},[],[]);
  expect(manaFlow).toBeDefined();expect(a).toEqual(v2base);expect(a).not.toHaveProperty('manaFlow');
  expect(enemyTeamGenerationIssues([a,b],1)).toEqual([]);
  expect(enemyTeamGenerationIssues([profile(Red,[create(Red),lethal,extra],1)],1)).toEqual(['teamLethalManaLoop']);
  expect(issues(a,b)).toEqual([]);
 });
});

describe('versioned individual admission and real assembly entry',()=>{
 it.each(['choose','oneOf'] as const)('does not merge mutually exclusive %s paths in individual admission',kind=>{
  for(const [hazard,code] of [[lethal,'lethalManaLoop'],[mass,'cheapMassControlLoop']] as const){
   const branch:EffectSegment=kind==='choose'
    ?{kind,labels:['supply','hazard'],options:[[create(Red)],[hazard,extra]]}
    :{kind,options:[[create(Red)],[hazard,extra]]};
   const v2=profile(Red,[branch]),v1=profile(Red,[branch],1);
   expect(enemyGenerationIssues(v2,'\u4f20\u5947','special')).toEqual([]);
   expect(enemyGenerationIssues(v1,'\u4f20\u5947','special',1)).toContain(code);
  }
 });
 it.each([[lethal,'lethalManaLoop'],[mass,'cheapMassControlLoop']] as const)('retains same-branch single-member hazard: %s', (hazard,code)=>{
  const branch:EffectSegment={kind:'oneOf',options:[[create(Red),hazard,extra],[create(Blue)]]};
  expect(enemyGenerationIssues(profile(Red,[branch]),'\u4f20\u5947','special')).toEqual([code]);
  expect(enemyGenerationIssues(profile(Red,[clear('destroy'),hazard,extra]),'\u4f20\u5947','special')).toEqual([code]);
 });
 it('requires a self-feeding edge for single-member control and preserves v1',()=>{
  const v2=profile(Red,[create(Blue),mass,extra]),v1=profile(Red,[create(Blue),mass,extra],1);
  expect(enemyGenerationIssues(v2,'\u4f20\u5947','special')).toEqual([]);
  expect(enemyGenerationIssues(v1,'\u4f20\u5947','special',1)).toEqual(['cheapMassControlLoop']);
 });
 it('preserves rank complexity and aggregate high-impact limits for both versions',()=>{
  const segments:EffectSegment[]=[{kind:'oneOf',options:[[create(Red)],[lethal,extra]]},
   {kind:'damage',target:'enemyFront',scaling:{base:5,mult:0}},mass,
   {kind:'buff',target:'allySelf',stat:'armor',scaling:{base:5,mult:0}}];
  for(const version of [1,2] as const){
   const actual=enemyGenerationIssues(profile(Red,segments,version),'\u6742\u5175','ordinary',version);
   expect(actual).toContain('activeComplexity');expect(actual).toContain('highImpactLimit');
   expect(enemyGenerationIssues(profile(Red,segments,version),'missing','special',version)).toEqual(['unknownRank']);
  }
 });
 // Install a complete temporary source/prototype fixture. Compilation, profile,
 // both admission stages, blueprint creation and restoration all run normally.
 it.each([[lethal,'lethalManaLoop'],[mass,'cheapMassControlLoop']] as const)('checks branch admission through compileEnemyDesign: %s',(hazard,code)=>{
  const art=PORTRAITS.find(p=>p.rank==='\u4f20\u5947'&&troopData.getTroopById(p.troopId)?.role==='Generator')!;
  const source=troopData.getTroopById(art.troopId)!;
  const catalogue=troopData.TROOPS as TroopData[],before=[...catalogue];
  const lookup=troopData.getTroopById;
  const fixture:TroopData={...source,manaCost:12,traits:[],spell:{...source.spell,id:code==='lethalManaLoop'?990001:990002}};
  const unsafe:TroopData={...fixture,spell:{...fixture.spell,id:fixture.spell.id+10}};
  const split:EffectSegment={kind:'oneOf',options:[[create(Red)],[hazard,extra]]};
  SKILL_LIBRARY[fixture.spell.id]={segments:[split]};
  SKILL_LIBRARY[unsafe.spell.id]={segments:[{kind:'oneOf',options:[[create(Red),hazard,extra],[create(Blue)]]}]};
  let current=fixture;
  const spy=vi.spyOn(troopData,'getTroopById').mockImplementation(id=>id===fixture.id?current:lookup(id));
  const input={...DEFAULT_ENEMY_DESIGN_INPUT,rank:art.rank,form:art.form,role:'Generator',manaColors:[Red,Blue,Green]};
  try{
   catalogue.splice(0,catalogue.length,fixture);
   const compiled=compileEnemyDesign(input,{seed:17,externalId:'branch-fixture'});
   expect(compiled.generation!.version).toBe(2);
   expect(compiled.generation!.profile.selfMana).toBe(true);
   expect(compiled.generation!.profile.highImpact).toContain('extraTurn');
   expect(enemyGenerationIssues(compiled.generation!.profile,art.rank,'ordinary')).toEqual([]);
   expect(compiled.blueprint.snapshot.skillId).toBe(`st:${fixture.spell.id}`);
   expect(restoreEnemyDesign(clone(compiled))).toEqual(compiled);
   current=unsafe;catalogue.splice(0,catalogue.length,unsafe);
   let rejection:unknown;
   try{compileEnemyDesign(input,{seed:17,externalId:'branch-fixture'});}catch(error){rejection=error;}
   expect(rejection).toBeInstanceOf(EnemyDesignError);
   expect(JSON.stringify(rejection)).toContain(code);
  }finally{
   spy.mockRestore();catalogue.splice(0,catalogue.length,...before);
   delete SKILL_LIBRARY[fixture.spell.id];delete SKILL_LIBRARY[unsafe.spell.id];
  }
 });
});

describe('bounded team traversal',()=>{
 it.each(['no-extra','no-hazard'])('returns before inspecting supply edges when %s',kind=>{
  const member=profile(Red,[create(Red),kind==='no-extra'?lethal:extra]);
  for(const path of member.manaFlow!.paths)Object.defineProperty(path,'generatedColors',{get:()=>{throw new Error('unnecessary traversal');}});
  expect(issues(member)).toEqual([]);
 });
 it('shares equivalent branch prefixes while retaining disconnected-hazard semantics',()=>{
  let reads=0;
  const members=Array.from({length:4},()=>profile(Red,[create(Red),extra]));
  for(const member of members){
   const path=member.manaFlow!.paths[0]!;
   member.manaFlow!.paths=Array.from({length:40},()=>({...path,get generatedColors(){reads++;return [Red];}}));
  }
  // This member enables the hazard preflight but has no route into the dense cycle.
  expect(issues(...members,profile(Blue,[lethal]))).toEqual([]);
  expect(reads).toBeLessThan(1500);
 });
});

describe('native clear collection used by v2 evidence',()=>{
 it.each(['destroy','explode','remove'] as const)('%s agrees with actual pre-gravity mana settlement',mode=>{
  const board=new BoardModel(),palette=Object.values(BaseColor);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col,type:colorGem(palette[(row+col)%6]!)});
  const actor=(id:number):Character=>({id,name:'fixture',hp:1000,maxHp:1000,armor:0,attack:0,magic:3,
   colors:[Red],manaCost:100,mana:0,skillId:'none',statuses:[],defeated:false});
  const state=createGameState(board,{player:PlayerSide.Left,characters:[actor(1)]},{player:PlayerSide.Right,characters:[actor(2)]});
  let id=1000;
  const engine=new TurnEngine(state,new SeededRNG(9),()=>id++);
  const events=gemEffect(clear(mode).params).apply({state,casterId:1,rng:new SeededRNG(9),nextGemId:()=>id++,
   resolveBoardChange:(destroyed,produced,clearMode)=>engine.resolveBoardChange(destroyed,produced,PlayerSide.Left,clearMode)});
  const gravity=events.findIndex(e=>e.type==='gravity');
  const direct=events.slice(0,gravity<0?events.length:gravity).filter(e=>e.type==='mana-gain');
  if(mode==='remove')expect(direct).toEqual([]);
  else expect(direct).toEqual(expect.arrayContaining([expect.objectContaining({type:'mana-gain',color:Red,characterId:1})]));
  expect(profile(Red,[clear(mode)]).manaFlow!.paths[0]!.collectedColors.includes(Red)).toBe(mode!=='remove');
 });
});
