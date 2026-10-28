import {describe,expect,it} from 'vitest';
import {TROOPS,troopToSummonTemplate} from '../../src/data/troops';
import type {TroopData} from '../../src/data/troops';
import {TROOP_PROGRESSION,troopStatsAtLevel} from '../../src/data/leveling';
import type {GameEvent} from '../../src/engine/events';
import type {GameState} from '../../src/engine/GameState';
import {AiCellChooser} from '../../src/engine/skills/cellChooser';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import {ExtensionRegistry} from '../../src/engine/registry';
import {registerSkillLibrary} from '../../src/engine/skills/library';
import {getTrait,setSummonTemplateResolver} from '../../src/engine/traits';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

// Native inputs below come from the original troop catalogue, never adaptedPrototype,
// adaptedTrait, compiledSnapshot, or resolveAdaptedSummon. This is an adapter parity
// check, not an independent proof that the original spell implements its source text.
const typeNames=[...new Set(TROOPS.flatMap(t=>t.troopTypes))].sort();
const regionNames=[...new Set(TROOPS.map(t=>t.kingdom).filter((s):s is string=>!!s))].sort();
const regionIds=[...new Set(TROOPS.map(t=>t.kingdomId).filter((id):id is number=>id!=null))].sort((a,b)=>a-b);
const aliases=new Map<string,string>([...typeNames.map((s,i)=>[s,`affinity:${i+1}`] as [string,string]),...regionNames.map((s,i)=>[s,`region:${i+1}`] as [string,string])]);
for(const t of [...TROOPS].sort((a,b)=>a.id-b.id)){
 aliases.set(t.referenceName,`unit:${t.id}`);
 if(!aliases.has(t.name))aliases.set(t.name,`unit:${t.id}`);
}
// Only these user-excluded mode bonuses are ignored; ordinary mechanics stay compared.
const scopedFields=new Set(['onDelveGain','onDelveBounty','onDelveMiles','vsAscendedMultiplier']);
const scopedPassive=new Set(['onDelveGains','onDelveBounty','onDelveMiles','vsAscendedMultipliers']);
const pureScopedTraits=new Set(TROOPS.flatMap(t=>t.traits).map(t=>t.code).filter(code=>{
 const trait=getTrait(code)!;
 return Object.keys(trait).filter(k=>!['code','name','description','troops'].includes(k)).every(k=>scopedFields.has(k));
}));
const refAliases=new Map(TROOPS.map(t=>[t.referenceName,`unit:${t.id}`]));
// A reference name can equal a race name (Goblin). Normalize according to its domain.
typeNames.forEach((s,i)=>aliases.set(s,`affinity:${i+1}`));
regionNames.forEach((s,i)=>aliases.set(s,`region:${i+1}`));
const presentation=new Set(['name','displayName','portraitUrl','spellName','spellDescription','traitNames','displayTraitIds','economyAudit']);
function canonical(value:unknown,key=''):unknown {
 if(typeof value==='string')return value.startsWith('st:')?value.slice(3):['ref','referenceName','randomOf'].includes(key)?refAliases.get(value)??value:aliases.get(value)??value;
 if(typeof value==='number'&&['kingdom','kingdomId'].includes(key)&&regionIds.includes(value))return 100000+regionIds.indexOf(value);
 if(Array.isArray(value))return value.filter(v=>key!=='traitIds'||!pureScopedTraits.has(String(v).replace(/^st:/,''))).map(v=>canonical(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>!presentation.has(k)&&!scopedPassive.has(k)&&v!==undefined).map(([k,v])=>[aliases.get(k)??k,canonical(v,k)]));
 return value;
}
type Scaling={level:number;difficulty:number};
const defaultScaling:Scaling={level:20,difficulty:1};
// Only the selected ordinary imported troops/derived forms use non-default levels.
// Read their source growth rows directly: do not call ST statsFor/compiledSnapshot,
// or use adapted output as native input. >20 is the project's sandbox extension,
// not evidence of official growth above level 20. The broad legacy probe still
// uses troopStatsAtLevel at its original level-20 boundary (including immortals).
function sourceStats(t:TroopData,{level,difficulty}:Scaling):CombatantSnapshot['stats'] {
 const growth=TROOP_PROGRESSION[t.id];
 const value=(stat:'health'|'armor'|'attack'|'magic')=>{
  if(level===20)return troopStatsAtLevel(t,20)[stat];
  expect(growth,`${t.referenceName}: imported growth required`).toBeDefined();
  expect(t.referenceName.startsWith('Immortal')).toBe(false);
  const extension={health:[2,3],armor:[1,2],attack:[1,5],magic:[1,8]}[stat];
  const gain=growth.growth[stat].slice(0,Math.min(level,20)).reduce((sum,n)=>sum+n,0);
  return (t.base?.[stat]??0)+gain+Math.floor(Math.max(0,level-20)*extension[0]/extension[1]);
 };
 return {hp:Math.max(1,Math.round(value('health')*difficulty)),armor:Math.round(value('armor')*difficulty),attack:Math.round(value('attack')*difficulty),magic:Math.round(value('magic')*difficulty)};
}
function nativeSnapshot(t:TroopData,externalId:string,scaling:Scaling):CombatantSnapshot {
 return {externalId,name:t.name,role:t.role,stats:sourceStats(t,scaling),manaColors:[...t.manaColors],manaCost:t.manaCost,skillId:String(t.spell.id),traitIds:t.traits.map(tr=>tr.code),troopTypes:[...t.troopTypes],kingdom:t.kingdom??undefined,kingdomId:t.kingdomId??undefined};
}
// Same-name catalogue variants share mechanical identity. Derive it independently
// from TROOPS, not the adapter's private identity table or the assembled name.
function sourceIdentity(t:TroopData):string {
 return `unit:${Math.min(...TROOPS.filter(row=>row.name===t.name).map(row=>row.id))}`;
}
function assertSnapshotContext(native:CombatantSnapshot,assembled:CombatantSnapshot,t:TroopData,scaling:Scaling){
 expect(native.mechanicalIdentity).toBeUndefined();
 expect(native.battleScaling).toBeUndefined();
 expect(assembled.mechanicalIdentity).toBe(sourceIdentity(t));
 expect(assembled.battleScaling).toEqual(scaling);
 expect(assembled.stats).toEqual(sourceStats(t,scaling));
 expect(native.stats).toEqual(assembled.stats);
}
function board(){
 const b=new BoardModel(),colors=Object.values(BaseColor);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)b.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
 return b;
}
// ST carries the catalogue role into summoned characters. The original helper
// omits that context, so supply it independently from TROOPS for equivalent inputs;
// role remains compared because it affects AI color priority on later casts.
function nativeSummon(ref:string,scaling:Scaling){
 const template=troopToSummonTemplate(ref);
 const source=TROOPS.find(t=>t.referenceName===ref);
 if(!template||!source)return template;
 const s=sourceStats(source,scaling);
 return {...template,role:source.role,maxHp:s.hp,hp:s.hp,armor:s.armor,attack:s.attack,magic:s.magic};
}
type RunOptions={scaling?:Scaling;followTurns?:number;damaged?:boolean;enchanted?:boolean;observeCell?:boolean};
type Frame={state:GameState;rng:number;events:GameEvent[]};
function run(t:TroopData,adapted:boolean,side:PlayerSide,seed:number,options:RunOptions={}){
 const scaling=options.scaling??defaultScaling;
 const p=PORTRAITS.find(p=>p.troopId===t.id)!;
 const subject=adapted?compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'subject',...scaling}).snapshot:nativeSnapshot(t,'subject',scaling);
 // Audit the compiled panel before opening traits or fixture overrides change it.
 if(adapted)assertSnapshotContext(nativeSnapshot(t,'subject',scaling),subject,t,scaling);
 const ally:CombatantSnapshot={...structuredClone(subject),externalId:'ally',stats:{hp:160,armor:20,attack:13,magic:7},traitIds:[],skillId:'gw_KnightsSword',manaCost:12};
 const foes=Array.from({length:3},(_,i):CombatantSnapshot=>({...structuredClone(ally),externalId:`foe-${i}`,stats:{hp:180+i*20,armor:17,attack:11,magic:4},manaColors:[Object.values(BaseColor)[i]!]}));
 const own=[subject,ally];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'parity',requestId:'parity',seed,playerTeam:side===PlayerSide.Left?own:foes,enemyTeam:side===PlayerSide.Right?own:foes};
 let registry:ExtensionRegistry,configure:(engine:TurnEngine)=>void;
 if(adapted){const setup=prepareStBattle(request);registry=setup.registry;configure=setup.configureEngine;}
 else{
  registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
  const deathResolver:Parameters<typeof setSummonTemplateResolver>[0]=spec=>nativeSummon(spec.referenceName,scaling);
  setSummonTemplateResolver(deathResolver);
  configure=engine=>{
   engine.enableEconomyAudit();
   engine.setSummonResolver(ref=>nativeSummon(ref,scaling));
   engine.setEnvironmentSummonResolver(ref=>nativeSummon(ref,scaling));
   engine.setSummonKingdomResolver(kingdom=>TROOPS.filter(t=>typeof kingdom==='number'?t.kingdomId===kingdom:t.kingdom===kingdom).map(t=>t.referenceName));
   engine.setDaemonPool(TROOPS.filter(t=>t.troopTypes.includes('Daemon')).map(t=>t.referenceName));
   engine.setBeastPool(TROOPS.filter(t=>t.troopTypes.includes('Beast')).map(t=>t.referenceName));
   setSummonTemplateResolver(deathResolver);
  };
 }
 
 
 const mapped=mapRequestToTeams(request),state=createGameState(board(),mapped.playerTeam,mapped.enemyTeam),rng=new SeededRNG(seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,registry,configure);
 const capture=(events:GameEvent[]):Frame=>({state:structuredClone(state),rng:rng.getState(),events:structuredClone(events)});
 const caster=state.teams[side].characters.find(c=>c.id===(side===PlayerSide.Left?0:4))!;
 // Explicit status fixture makes turn-start mana observable before the refill.
 if(options.enchanted){caster.mana=0;caster.statuses.push({id:'enchanted',turns:3});}
 const opening=capture(engine.takeInitialEvents());
 const turnEvents=state.activePlayer===side?[]:engine.passTurn();
 const afterPass=capture(turnEvents); // Must precede every forced mana/HP edit.
 if(options.damaged)caster.hp=Math.max(1,caster.hp-2);
 const choices:{pos:{row:number;col:number};gem:unknown}[]=[];
 if(options.observeCell){
  const chooser=new AiCellChooser();
  engine.setCellChooser({choose(state,id,rng,rule,proto,color){
   const pos=chooser.choose(state,id,rng,rule,proto,color);
   if(pos)choices.push({pos:{...pos},gem:structuredClone(state.board.get(pos)?.type)});
   return pos;
  }});
 }
 caster.mana=caster.manaCost;
 const beforeCast=capture([]),events=engine.castSkill(caster.id),after=capture(events);
 const subsequent:Frame[]=[];
 for(let i=0;i<(options.followTurns??0);i++)subsequent.push(capture(engine.passTurn()));
 return {opening,afterPass,beforeCast,after,subsequent,choices,cast:events.some(e=>e.type==='skill-cast')};
}

function differences(expected:unknown,actual:unknown,path=''):string[]{
 if(Object.is(expected,actual))return [];
 if(!expected||!actual||typeof expected!=='object'||typeof actual!=='object')return [`${path}: native=${JSON.stringify(expected)}, assembled=${JSON.stringify(actual)}`];
 const a=expected as Record<string,unknown>,b=actual as Record<string,unknown>;
 return [...new Set([...Object.keys(a),...Object.keys(b)])].sort((x,y)=>Number(y==='events')-Number(x==='events')).flatMap(k=>differences(a[k],b[k],`${path}.${k}`)).slice(0,20);
}

// These fields have no native counterpart. Check their actual values on each
// actor and event-time form, then explicitly project that asymmetry for parity.
// They are never presentation fields and canonical() must preserve them.
function checkedPair(native:unknown,assembled:unknown,scaling:Scaling,path=''): [unknown,unknown] {
 if(!native||!assembled||typeof native!=='object'||typeof assembled!=='object')return [native,assembled];
 if(Array.isArray(native)&&Array.isArray(assembled)){
  const pairs=Array.from({length:Math.max(native.length,assembled.length)},(_,i)=>checkedPair(native[i],assembled[i],scaling,`${path}[${i}]`));
  return [pairs.map(p=>p[0]),pairs.map(p=>p[1])];
 }
 const a={...native} as Record<string,unknown>,b={...assembled} as Record<string,unknown>;
 if(typeof a.name==='string'&&typeof a.skillId==='string'&&typeof a.manaCost==='number'){
  const t=TROOPS.find(t=>t.name===a.name);
  expect(t,`${path}: native actor must identify a catalogue source`).toBeDefined();
  expect(a.mechanicalIdentity,`${path}: native identity absent`).toBeUndefined();
  expect(a.battleScaling,`${path}: native scaling absent`).toBeUndefined();
  expect(b.mechanicalIdentity,`${path}: assembled source identity`).toBe(sourceIdentity(t!));
  expect(b.battleScaling,`${path}: assembled input scaling`).toEqual(scaling);
  delete a.mechanicalIdentity;delete b.mechanicalIdentity;
  delete a.battleScaling;delete b.battleScaling;
 }
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  const pair=checkedPair(a[key],b[key],scaling,`${path}.${key}`);a[key]=pair[0];b[key]=pair[1];
 }
 return [a,b];
}
function expectFrameParity(native:Frame,assembled:Frame,scaling:Scaling,label:string){
 const pair=checkedPair(native,assembled,scaling,label);
 expect(differences(canonical(pair[0]),canonical(pair[1])).join('\n'),label).toBe('');
}
function expectRunParity(native:ReturnType<typeof run>,assembled:ReturnType<typeof run>,scaling=defaultScaling){
 expect(native.cast).toBe(true);expect(assembled.cast).toBe(true);
 for(const key of ['opening','afterPass','beforeCast','after'] as const)expectFrameParity(native[key],assembled[key],scaling,key);
 expect(assembled.subsequent).toHaveLength(native.subsequent.length);
 native.subsequent.forEach((frame,i)=>{
  expect(frame.events.some(e=>e.type==='turn-end'),`native pass ${i+1} must advance`).toBe(true);
  expect(assembled.subsequent[i].events.some(e=>e.type==='turn-end'),`assembled pass ${i+1} must advance`).toBe(true);
  expectFrameParity(frame,assembled.subsequent[i],scaling,`pass ${i+1}`);
 });
 expect(assembled.choices).toEqual(native.choices);
}

describe('ST native execution parity (not full source behavior acceptance)',()=>{
 it('accounts for all sources and explicitly excludes only the 21 missing portraits',()=>{
  expect(TROOPS).toHaveLength(1821);
  expect(TROOPS.filter(t=>PORTRAITS.some(p=>p.troopId===t.id))).toHaveLength(1800);
  const missing=TROOPS.filter(t=>!PORTRAITS.some(p=>p.troopId===t.id));
  expect(missing).toHaveLength(21);
 });
 for(const t of TROOPS.filter(t=>PORTRAITS.some(p=>p.troopId===t.id))){
  it(`${t.id} ${t.referenceName}: native and assembled opening/first cast agree`,()=>{
   const side=PlayerSide.Right,seed=6817;
   expectRunParity(run(t,false,side,seed),run(t,true,side,seed));
  });
 }
});
// Real failures from the first catalogue probe, now exercised with both owners and
// multiple RNG streams. They cover choice metadata, kingdom filters and delayed clear.
describe('ST adapter counterexamples across sides and seeds',()=>{
 for(const id of [6139,6263,6961,7029,7079,7155]){
  const t=TROOPS.find(t=>t.id===id)!;
  for(const side of [PlayerSide.Left,PlayerSide.Right])for(const seed of [17,6817,9401]){
   it(`${id} ${side} seed ${seed}`,()=>{
    expectRunParity(run(t,false,side,seed),run(t,true,side,seed));
   });
  }
 }
});

// Small, source-named probes, not another catalogue sweep or whole-spell acceptance.
// All inputs (including derived templates) are independently levelled on the native
// side. Two real passes after casting cover retained/changed forms and turn hooks;
// no follow-up mana refill can erase differences in those states.
describe('ST bounded scaled mechanism parity (not full source acceptance)',()=>{
 const contexts=[{level:7,difficulty:1.3},{level:49,difficulty:1.6}];
 for(const scaling of contexts)for(const side of [PlayerSide.Left,PlayerSide.Right]){
  for(const [ref,derivedRef,eventType] of [
   ['GiantSpider','SpiderSwarm','summon'], // TROOPS 6110, spell 7180
   ['Werewolf','Villager','troop-transform'], // TROOPS 6294, spell 7440
  ] as const){
   it(`${ref} level ${scaling.level} difficulty ${scaling.difficulty} ${side}: derived form and two later turns`,()=>{
    const t=TROOPS.find(t=>t.referenceName===ref)!,derived=TROOPS.find(t=>t.referenceName===derivedRef)!;
    const options={scaling,followTurns:2};
    const native=run(t,false,side,6817,options),assembled=run(t,true,side,6817,options);
    expectRunParity(native,assembled,scaling);
    for(const result of [native,assembled]){
     const event=result.after.events.find(e=>e.type===eventType);
     expect(event,`${derivedRef}: actual derivation must run`).toBeDefined();
     if(event?.type!=='summon'&&event?.type!=='troop-transform')throw new Error('Missing derived event');
     const form=event.form!;expect(form).toBeDefined();
     expect(form.skillId.replace(/^st:/,'')).toBe(String(derived.spell.id));
     const stats=sourceStats(derived,scaling);
     expect({hp:form.maxHp,armor:form.armor,attack:form.attack,magic:form.magic}).toEqual(stats);
     expect(result.subsequent).toHaveLength(2);
    }
   });
  }
  for(const damaged of [false,true])it(`ArchonStatue level ${scaling.level} difficulty ${scaling.difficulty} ${side}: damaged=${damaged}`,()=>{
   const t=TROOPS.find(t=>t.referenceName==='ArchonStatue')!; // 6030, spell 7030: damaged self adds 8
   const options={scaling,damaged,followTurns:2};
   const native=run(t,false,side,17,options),assembled=run(t,true,side,17,options);
   expectRunParity(native,assembled,scaling);
   for(const result of [native,assembled]){
    const caster=result.beforeCast.state.teams[side].characters[0]!;
    expect(caster.hp<caster.maxHp).toBe(damaged);
    const hits=result.after.events.filter(e=>e.type==='skill-damage'&&e.casterId===caster.id);
    expect(hits).toHaveLength(1);
    const hit=hits[0];
    if(hit.type!=='skill-damage')throw new Error('Missing conditional damage');
    expect(hit.damage).toBe(caster.magic+3+(damaged?8:0));
   }
  });
  it(`Soothsayer level ${scaling.level} difficulty ${scaling.difficulty} ${side}: real purple selection and two later turns`,()=>{
   const t=TROOPS.find(t=>t.referenceName==='Soothsayer')!; // 6139, spell 7253
   const options={scaling,observeCell:true,followTurns:2};
   const native=run(t,false,side,9401,options),assembled=run(t,true,side,9401,options);
   expectRunParity(native,assembled,scaling);
   for(const result of [native,assembled]){
    expect(result.choices).toHaveLength(1);
    const choice=result.choices[0];expect(choice.gem).toEqual(colorGem(BaseColor.Purple));
    const clear=result.after.events.find(e=>e.type==='gem-destroy');
    expect(clear?.type).toBe('gem-destroy');
    if(clear?.type!=='gem-destroy')throw new Error('Missing cross clear');
    const expected=Array.from({length:8},(_,i)=>[{row:choice.pos.row,col:i},{row:i,col:choice.pos.col}]).flat();
    expect(new Set(clear.cells.map(c=>`${c.pos.row},${c.pos.col}`))).toEqual(new Set(expected.map(c=>`${c.row},${c.col}`)));
   }
  });
 }
 it('captures actual enchanted turn-start mana before the test forces full mana',()=>{
  const t=TROOPS.find(t=>t.referenceName==='ArchonStatue')!,scaling=contexts[0];
  const native=run(t,false,PlayerSide.Right,17,{scaling,enchanted:true}),assembled=run(t,true,PlayerSide.Right,17,{scaling,enchanted:true});
  expectRunParity(native,assembled,scaling);
  for(const result of [native,assembled]){
   const mana=(frame:Frame)=>frame.state.teams.Right.characters[0].mana;
   expect(mana(result.opening)).toBe(0);expect(mana(result.afterPass)).toBe(2);
   expect(mana(result.beforeCast)).toBe(result.beforeCast.state.teams.Right.characters[0].manaCost);
  }
 });
});
