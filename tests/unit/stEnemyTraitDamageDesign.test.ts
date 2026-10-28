import {describe,expect,it} from 'vitest';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {ExtensionRegistry} from '../../src/engine/registry';
import {SeededRNG} from '../../src/engine/rng';
import {applyBigMatchTriggers,attachPassives,registerDynamicTraits} from '../../src/engine/traits';
import type {TraitDefinition} from '../../src/engine/traits';
import {BaseColor,PlayerSide,colorGem,skullGem} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import {adaptedPrototype,adaptedTrait,compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {inspectEnemyDesignSignature} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

const trait=(fields:Partial<TraitDefinition>):TraitDefinition=>({code:'st:damage-fixture',name:'fixture',description:'fixture',...fields});
const inspect=(value:TraitDefinition)=>inspectEnemyDesignSignature({segments:[]},[value]);
function actor(id:number,traits:TraitDefinition[]=[],over:Partial<Character>={}):Character {
 registerDynamicTraits(traits);
 return {id,name:`C${id}`,hp:50,maxHp:50,armor:0,attack:5,magic:8,mana:0,manaCost:20,
  colors:[BaseColor.Red],skillId:'fixture',statuses:[],defeated:false,traitIds:traits.map(t=>t.code),...over};
}
function battle(left:Character[],right:Character[],n=4,color:BaseColor|'skull'=BaseColor.Red){
 const board=new BoardModel(),palette=[BaseColor.Green,BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple];
 let id=800;
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:++id,type:colorGem(palette[(row+col)%4])});
 const type=color==='skull'?skullGem():colorGem(color);
 for(let col=0;col<n;col++)if(col!==2)board.set({row:7,col},{id:++id,type});
 board.set({row:6,col:2},{id:++id,type});
 board.set({row:5,col:2},{id:++id,type:colorGem(BaseColor.Green)});
 const state=createGameState(board,{player:PlayerSide.Left,characters:left},{player:PlayerSide.Right,characters:right});
 const registry=new ExtensionRegistry();registry.prototypes.set('fixture',{segments:[]});
 const engine=new TurnEngine(state,new SeededRNG(5),()=>++id,registry);
 return {engine,state,swap:()=>engine.resolveSwap({row:7,col:2},{row:6,col:2})};
}

const bigHits=[
 {code:'shock',amount:2,target:'randomEnemy'},
 {code:'tentacles',amount:3,target:'enemyAll'},
 {code:'lightningbolt',amount:10,target:'randomEnemy'},
 {code:'attackfrombelow',amount:8,target:'lastEnemy'},
 {code:'huntersclaw',amount:6,target:'randomEnemy'},
];
describe('ST damage traits describe actual hostile trigger capabilities',()=>{
 it.each(bigHits)('$code has fixed damage and the actual target role',({code,amount,target})=>{
  const native=adaptedTrait(code)!;
  expect(native.onBigMatchDamage).toMatchObject({amount,scope:target});
  const signature=inspect(native);
  expect(signature.effects).toEqual(['damage']);
  expect(signature.roles).toEqual(target==='lastEnemy'?['Striker','Assassin']:['Striker']);
  expect(signature.evidence).toContainEqual(expect.objectContaining({effect:'damage',source:`st:${code}`,path:`traits.st:${code}.onBigMatchDamage`,detail:expect.stringContaining(target)}));
 });
 it.each(['lumpofcoal','dawnslayer','sleetstorm','spiny','spiky','manyheads','serpentsfang','artillerysupport'])('%s is damage without invented Magic scaling or skull offense',code=>{
  expect(inspect(adaptedTrait(code)!)).toMatchObject({effects:['damage'],roles:['Striker']});
 });
 it.each([
  adaptedTrait('corruption')!,adaptedTrait('aspectofdeath')!,trait({onBigMatchDrainLife:{amount:2}}),
 ])('$code steals Life through true damage without promising healing or support',native=>{
  expect(inspect(native)).toMatchObject({effects:['damage','trueDamage'],roles:['Striker','Assassin']});
 });
 it.each(['onBigMatchKill','onSkullHitKill','onEnemyDeathKill'] as const)('%s retains probability and lethal-immunity conditions',key=>{
  const signature=inspect(trait({[key]:{chance:.08,scope:'lastEnemy'}}));
  expect(signature.effects).toEqual(['damage','execute']);expect(signature.roles).toEqual(['Striker','Assassin']);
  expect(signature.evidence).toContainEqual(expect.objectContaining({effect:'damage',detail:expect.stringContaining('0.08')}));
 });
});

const amountFields=[
 ['onBigMatchDamage',{scope:'randomEnemy'}],['onColorMatchDamage',{color:BaseColor.Red}],
 ['onSkullDamagedEnemyDamage',{}],['onAllyCastEnemyDamage',{scope:'enemyAll'}],
 ['onColorMatchDrain',{color:BaseColor.Red}],['turnStartStealLife',{}],['onBigMatchDrainLife',{}],
] as const;
describe('ST damage trigger boundaries',()=>{
 it.each(amountFields)('%s rejects zero, negative, non-finite and malformed amounts', (key,extra)=>{
  for(const amount of [0,-1,NaN,Infinity,-Infinity,'2',undefined]){
   expect(inspect(trait({[key]:{...extra,amount}}))).toMatchObject({roles:[],effects:[],evidence:[]});
  }
 });
 it.each(['onBigMatchDamage','onAllyCastEnemyDamage','onColorMatchDamage'] as const)('%s rejects friendly or unsupported explicit targets',key=>{
  for(const scope of ['self','randomAlly','allAllies','unknown',['lastEnemy'],['enemyAll']]){
   expect(inspect(trait({[key]:{amount:2,color:BaseColor.Red,scope}})).effects).toEqual([]);
  }
 });
 it("keeps each family's native target spelling and the color damage default",()=>{
  expect(inspect(trait({onColorMatchDamage:{color:BaseColor.Red,amount:2}})).effects).toEqual(['damage']);
  for(const [key,scope]of [['onBigMatchDamage','allEnemies'],['onAllyCastEnemyDamage','allEnemies'],['onColorMatchDamage','enemyAll']]){
   expect(inspect(trait({[key]:{amount:2,color:BaseColor.Red,scope}})).effects).toEqual([]);
  }
 });
 it.each(['onColorMatchDamage','onColorMatchDrain'] as const)('%s requires a matchable native color',key=>{
  for(const color of ['',undefined,'red','random','not-a-color'])expect(inspect(trait({[key]:{amount:2,color}})).effects).toEqual([]);
  expect(inspect(trait({[key]:{amount:2,color:'skull'}})).effects).toContain('damage');
 });
 it.each(['onBigMatchDamage','onBigMatchDrainLife','onBigMatchKill'] as const)('%s rejects unreachable or malformed match sizes',key=>{
  for(const minSize of [65,Infinity,-Infinity,NaN,'4']){
   expect(inspect(trait({[key]:{amount:2,scope:'lastEnemy',chance:1,minSize}})).effects).toEqual([]);
  }
  // Native size checks are lower bounds, so zero and fractional lower bounds are meaningful.
  for(const minSize of [0,4,4.5,64])expect(inspect(trait({[key]:{amount:2,scope:'lastEnemy',chance:1,minSize}})).effects).toContain('damage');
 });
 it.each(['onBigMatchKill','onSkullHitKill','onEnemyDeathKill'] as const)('%s rejects zero or invalid chance and friendly scope',key=>{
  for(const chance of [0,-.01,NaN,Infinity,-Infinity,undefined,'1'])expect(inspect(trait({[key]:{chance,scope:'lastEnemy'}})).effects).toEqual([]);
  expect(inspect(trait({[key]:{chance:1,scope:'self'}})).effects).toEqual([]);
  expect(inspect(trait({[key]:{chance:1,scope:'lastEnemy'}})).effects).toContain('execute');
 });
});

describe('ST classified traits reach real TurnEngine actions',()=>{
 it.each(bigHits)('$code: four-match hits actual targets for $amount',({code,amount,target})=>{
  const holder=actor(0,[adaptedTrait(code)!]),foes=[actor(4),actor(5)],game=battle([holder],foes);
  const hits=game.swap().filter(e=>e.type==='skill-damage'&&e.casterId===holder.id);
  expect(hits).toHaveLength(target==='enemyAll'?2:1);
  expect(hits.every(e=>e.type==='skill-damage'&&e.damage===amount)).toBe(true);
  if(target==='lastEnemy')expect(hits[0]).toMatchObject({targetId:5});
  if(target==='enemyAll')expect(hits.map(e=>e.type==='skill-damage'?e.targetId:undefined)).toEqual([4,5]);
  expect(foes.map(f=>50-f.hp).reduce((a,b)=>a+b,0)).toBe(amount*hits.length);
 });
 it('shock remains gated by four-match size, and damage amount zero produces no hit',()=>{
  for(const [amount,size]of [[2,3],[0,4]]){
   const native=trait({onBigMatchDamage:{amount,scope:'randomEnemy'}}),foe=actor(4);
   const hits=battle([actor(0,[native])],[foe],size).swap().filter(e=>e.type==='skill-damage');
   expect(hits).toEqual([]);expect(foe.hp).toBe(50);
  }
 });
 it('color damage uses the matched color and allEnemies actually hits both foes',()=>{
  const native=trait({onColorMatchDamage:{color:BaseColor.Red,amount:2,scope:'allEnemies'}});
  expect(inspect(native).effects).toEqual(['damage']);
  const foes=[actor(4),actor(5)];
  expect(battle([actor(0,[native])],foes,3).swap().filter(e=>e.type==='skill-damage')).toHaveLength(2);
  expect(foes.map(f=>f.hp)).toEqual([48,48]);
  const other=actor(4);battle([actor(0,[native])],[other],3,BaseColor.Blue).swap();expect(other.hp).toBe(50);
 });
 it('manyheads retaliates against the attacking team, including members other than the skull attacker',()=>{
  const attackers=[actor(0),actor(1)],holder=actor(4,[adaptedTrait('manyheads')!]);
  const hits=battle(attackers,[holder],3,'skull').swap().filter(e=>e.type==='skill-damage');
  expect(hits).toEqual(expect.arrayContaining([expect.objectContaining({casterId:4,targetId:0,damage:3}),expect.objectContaining({casterId:4,targetId:1,damage:3})]));
  expect(attackers.map(c=>c.hp)).toEqual([47,47]);
 });
 it.each([{code:'serpentsfang',amount:3,count:1},{code:'artillerysupport',amount:5,count:2}])('$code damages enemies when another ally casts',({code,amount,count})=>{
  const caster=actor(0,[],{mana:20}),holder=actor(1,[adaptedTrait(code)!]),foes=[actor(4),actor(5)];
  const hits=battle([caster,holder],foes).engine.castSkill(caster.id).filter(e=>e.type==='skill-damage');
  expect(hits).toHaveLength(count);expect(hits.every(e=>e.type==='skill-damage'&&e.casterId===1&&e.damage===amount)).toBe(true);
 });
 it.each([
  {name:'color',native:adaptedTrait('corruption')!,amount:3},
  {name:'big match',native:trait({onBigMatchDrainLife:{amount:2}}),amount:2},
 ])('$name Life steal bypasses Armor and grows maximum Life instead of healing',({native,amount})=>{
  const holder=actor(0,[native],{hp:40}),foe=actor(4,[],{armor:20});
  const events=battle([holder],[foe]).swap();
  expect([foe.hp,foe.armor,holder.hp,holder.maxHp]).toEqual([50-amount,20,40+amount,50+amount]);
  expect(events).toContainEqual(expect.objectContaining({type:'buff',targetId:0,stat:'hp',amount,maxHpGain:amount}));
  expect(inspect(native).effects).not.toContain('heal');
 });
 it('turn-start Life steal hits the opposing front, bypasses Armor and grows maximum Life',()=>{
  const holder=actor(4,[adaptedTrait('aspectofdeath')!],{hp:40}),front=actor(0,[],{armor:20});
  const events=battle([front,actor(1)],[holder]).engine.passTurn();
  expect([front.hp,front.armor,holder.hp,holder.maxHp]).toEqual([48,20,42,52]);
  expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',casterId:4,targetId:0,damage:2}));
 });
 it('big-match execution follows the exact probability boundary and selects the living last enemy',()=>{
  const native=adaptedTrait('deathbelow')!,holder=actor(0,[native]);attachPassives(holder);
  expect(inspect(native).effects).toContain('execute');expect(native.onBigMatchKill!.chance).toBe(.08);
  const foes=[actor(4),actor(5),actor(6,[],{defeated:true,hp:0})];
  for(const [roll,expected]of [[.079,1],[.08,0]]){
   const targets:number[]=[];
   applyBigMatchTriggers([holder],{size:4,enemyTeam:foes,rng:{next:()=>roll},kill:target=>{targets.push(target.id);return [];}});
   expect(targets).toEqual(expected?[5]:[]);
  }
 });
 it.each([0,1])('a real match with execution chance %s obeys the same classification gate',chance=>{
  const native=trait({onBigMatchKill:{chance,scope:'lastEnemy'}}),front=actor(4),last=actor(5);
  const events=battle([actor(0,[native])],[front,last]).swap();
  expect(inspect(native).effects.includes('execute')).toBe(chance>0);
  expect(last.defeated).toBe(chance>0);expect(front.defeated).toBe(false);
  expect(events.some(e=>e.type==='defeat'&&e.characterId===5)).toBe(chance>0);
 });
});

const directDamageCombinations=[
 {code:'artillerysupport',amount:5,count:2,steal:false},
 {code:'serpentsfang',amount:3,count:1,steal:false},
 {code:'aspectofdeath',amount:2,count:1,steal:true},
].flatMap(fixture=>[
 {...fixture,order:'damage first',traitCodes:[fixture.code,'armored']},
 {...fixture,order:'armored first',traitCodes:['armored',fixture.code]},
]);
describe('ST direct-read damage survives aggregate pruning and blueprint restore',()=>{
 it.each(directDamageCombinations)('$code + armored ($order) retains its signature and actual restored trigger',({code,traitCodes,amount,count,steal})=>{
  const traits=traitCodes.map(value=>adaptedTrait(value)!);
  const before=structuredClone(traits),signature=inspectEnemyDesignSignature({segments:[]},traits);
  const expectedEffects=steal?['damage','trueDamage','damageReduction']:['damage','damageReduction'];
  expect(signature.effects).toHaveLength(expectedEffects.length);
  expect(signature.effects).toEqual(expect.arrayContaining(expectedEffects));
  expect(signature.roles).toContain('Striker');
  if(steal)expect(signature.roles).toContain('Assassin');
  const field=steal?'turnStartStealLife':'onAllyCastEnemyDamage';
  expect(signature.evidence).toContainEqual(expect.objectContaining({effect:'damage',source:`st:${code}`,path:`traits.st:${code}.${field}`}));
  expect(traits).toEqual(before);

  const portrait=PORTRAITS.find(entry=>entry.troopId===6991)!;
  const blueprint=compileEnemyBlueprint({
   portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),
   recipeTroopId:6991,assembly:{version:1,activeTroopId:6991,traitCodes},externalId:`direct-damage-${traitCodes.join('-')}`,
  });
  const restored=restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)));
  expect(restored).toEqual(blueprint);
  expect(restored.assembly!.traitCodes).toEqual(traitCodes);
  expect(restored.snapshot.traitIds).toEqual(traitCodes.map(value=>`st:${value}`));
  const restoredTraits=restored.assembly!.traitCodes.map(value=>adaptedTrait(value)!);
  const restoredSignature=inspectEnemyDesignSignature(adaptedPrototype(Number(restored.snapshot.skillId!.slice(3))),restoredTraits);
  expect(restoredSignature.effects).toEqual(expect.arrayContaining(expectedEffects));
  expect(restoredSignature.evidence).toContainEqual(expect.objectContaining({effect:'damage',source:`st:${code}`,path:`traits.st:${code}.${field}`}));
  registerDynamicTraits(restoredTraits);
  const holder=snapshotToCharacter(restored.snapshot,steal?4:1);
  expect(holder.traitIds).toEqual(restored.snapshot.traitIds);
  if(steal){
   const front=actor(0,[],{armor:20}),other=actor(1),hp=holder.hp,maxHp=holder.maxHp;
   const events=battle([front,other],[holder]).engine.passTurn();
   const hits=events.filter(event=>event.type==='skill-damage'&&event.casterId===holder.id);
   expect(hits).toEqual([expect.objectContaining({type:'skill-damage',casterId:4,targetId:0,damage:amount})]);
   expect([front.hp,front.armor,other.hp,holder.hp,holder.maxHp]).toEqual([50-amount,20,50,hp+amount,maxHp+amount]);
   expect(events).toContainEqual(expect.objectContaining({type:'buff',targetId:holder.id,stat:'hp',amount,maxHpGain:amount}));
  }else{
   const caster=actor(0,[],{mana:20}),foes=[actor(4),actor(5)];
   const events=battle([caster,holder],foes).engine.castSkill(caster.id);
   const hits=events.filter(event=>event.type==='skill-damage'&&event.casterId===holder.id);
   expect(hits).toHaveLength(count);
   expect(hits.every(event=>event.type==='skill-damage'&&event.damage===amount&&[4,5].includes(event.targetId))).toBe(true);
   expect(foes.map(foe=>50-foe.hp).reduce((sum,damage)=>sum+damage,0)).toBe(amount*count);
   if(count===2)expect(hits.map(event=>event.type==='skill-damage'?event.targetId:undefined)).toEqual([4,5]);
   else expect(foes.filter(foe=>foe.hp===50-amount)).toHaveLength(1);
  }
 });
});
