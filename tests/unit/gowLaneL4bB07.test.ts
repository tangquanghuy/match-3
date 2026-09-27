// Lane L4b batch B07 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
// Every entity has its own source/prototype binding and real TurnEngine.castSkill cases.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {BaseColor,PlayerSide,colorGem,skullGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
type BoardFn=(r:number,c:number)=>GemType|null;
/** (r+c)%4 diagonal pattern: no line of 3 unless three of the four classes share a colour. */
const pattern=(cols:BaseColor[]):BoardFn=>(r,c)=>colorGem(cols[(r+c)%4]);
interface Opts{skill:string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;board?:BoardFn;
 before?:Partial<Character>[];allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();const fn=o.board??pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const t=fn(r,c);board.set({row:r,col:c},t?{id:id++,type:t}:null);}
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10});
 const before=(o.before??[]).map((a,i)=>damageCharacter(5+i,{mana:0,...a}));
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const mine={player:side,characters:[...before,caster,...allies]};const theirs={player:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,characters:[...enemies]};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setColorChooser(new FixedColorChooser(BaseColor.Red));engine.setTargetChooser(new FixedTargetChooser(o.target??11));
 return {board,state,engine,caster,before,allies,enemies,side,opponent:theirs.player,cast:()=>engine.castSkill(caster.id)};
}
function skillPhase(ev:GameEvent[]){const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);}
function changes(ev:GameEvent[]){
 const out:{pos:string;from:GemType|null;to:GemType}[]=[];
 for(const e of skillPhase(ev)){
  if(e.type==='gem-create')for(const s of e.spawns)out.push({pos:`${s.pos.row},${s.pos.col}`,from:null,to:s.gemType});
  if(e.type==='gem-transform')for(const s of e.changes)out.push({pos:`${s.pos.row},${s.pos.col}`,from:s.from,to:s.to});
 }
 return out;
}
const isColor=(t:GemType|null|undefined,c:BaseColor)=>!!t&&t.kind==='color'&&t.color===c;
const cellsWhere=(fn:BoardFn,pred:(t:GemType|null)=>boolean)=>{const s:string[]=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(pred(fn(r,c)))s.push(`${r},${c}`);return s;};
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId,e.turns]:[]);
function manaFromMatches(ev:GameEvent[],id:number){return ev.filter(e=>e.type==='mana-gain'&&e.characterId===id).reduce((a,e)=>a+(e.type==='mana-gain'?e.amount:0),0);}
function assertTurnAndMana(f:ReturnType<typeof setup>,ev:GameEvent[]){
 expect(ev[0]).toMatchObject({type:'skill-cast',characterId:0});
 expect(skillPhase(ev).some(e=>e.type==='extra-turn')).toBe(false);
 const extra=ev.some(e=>e.type==='extra-turn');
 expect(f.state.activePlayer).toBe(extra?f.side:f.opponent);
 expect(f.state.actionLog).toHaveLength(1);
 expect(f.caster.mana).toBe(Math.min(f.caster.manaCost,manaFromMatches(ev,0)));
}
function troopBinding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string){
 const en=original.find((t:{id:number})=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.SpellSteps).toEqual(steps);
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description).toBe(zh);
}
function refusal(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses, board/turn/mana untouched`,()=>{
  const f=setup(o);const before:string[]=[];f.board.forEach(g=>before.push(JSON.stringify(g)));
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);const after:string[]=[];f.board.forEach(g=>after.push(JSON.stringify(g)));
  expect(after).toEqual(before);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
  expect([...f.allies,...f.enemies].every(c=>c.statuses.length===0&&c.maxHp===1000)).toBe(true);
 });
}
const sides=[PlayerSide.Left,PlayerSide.Right];


const isSpecial=(t:GemType|null|undefined,k:string)=>!!t&&t.kind==='special'&&t.spec.kind===k;
void cellsWhere;void skullGem;void weapons;void rawWeapons;
/** Board without Purple/Brown/Blue/Red/Green-skull matches for create cases: Yellow/Purple/Blue/Green-free pick per spell. */
const col=(k:GemType,c:BaseColor)=>isColor(k,c);

// ——— troop:7795 / spell 9815 ———
describe('L4b troop:7795/spell:9815 Eliminate up to 14 Armor, create 5 Purple + 1 per 2 Armor eliminated',()=>{
 const base={skill:'9815',cost:13,colors:[BaseColor.Red,BaseColor.Brown],target:11};
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Red,BaseColor.Brown]);
 it('source/native/prototype/display binding (CountArmor 50% capped by CountMax 7 == floor(min(armor,14)/2))',()=>{
  troopBinding(7795,9815,13,base.colors,'Eliminate up to 14 Armor from an Enemy. Create 5 Purple Gems, boosted by Armor eliminated. [2:1]',
   [{Target:'FromTarget',Amount:50,Type:'CountArmor'},{Amount:7,Type:'CountMax'},{Target:'FromTarget',Amount:14,Type:'DecreaseArmor',Delay:200},{UseCounterForAmount:true,Color1:'Purple',Amount:5,Type:'CreateGems'}],
   '消除敌人最多14点护甲。生成5颗紫色宝石，宝石数量根据消除的护甲值提升。 [2:1]');
  expect(native.get(9815).raw.Target).toBe('Enemy');
  const mod={mod:{kind:'ratio',a:2,b:1},source:{kind:'lastReduce'}};
  expect(registry.prototypes.get('9815')).toEqual({segments:[{kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:14,mult:0}},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'Purple'},count:{base:5,mult:0},modifier:mod},modifier:mod}]});
  // Native counter = min(floor(armor*50/100),7) (R003 percent); runtime = floor(min(armor,14)/2). Equal for every armor value.
  for(let a=0;a<=60;a++)expect(Math.min(Math.floor(a*50/100),7)).toBe(Math.floor(Math.min(a,14)/2));
 });
 for(const side of sides)for(const [armor,gems] of [[0,5],[5,7],[14,12],[30,12]] as const)
 it(`real cast side=${side} armor=${armor}: armor -> ${Math.max(0,armor-14)}, ${gems} Purple`,()=>{
  const f=setup({...base,side,board,enemies:[{},{armor},{},{}]});const ev=f.cast();
  expect(f.enemies[1].armor).toBe(Math.max(0,armor-14));expect(f.enemies[1].hp).toBe(1000);
  const made=changes(ev);expect(made).toHaveLength(gems);expect(made.every(m=>col(m.to,BaseColor.Purple)&&!isColor(m.from,BaseColor.Purple))).toBe(true);
  expect(f.enemies.filter((_,i)=>i!==1).every(e=>e.armor===0&&e.hp===1000)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('odd armor rounds down (armor 9 -> +4 = 9 Purple); Barrier does not stop armor elimination',()=>{
  const a=setup({...base,board,enemies:[{},{armor:9}]});expect(changes(a.cast())).toHaveLength(9);
  const b=setup({...base,board,enemies:[{},{armor:6,statuses:[{id:'barrier',turns:3}]}]});const ev=b.cast();
  expect(b.enemies[1].armor).toBe(0);expect(changes(ev)).toHaveLength(8);
 });
 it('ally is not a legal target',()=>{const f=setup({...base,board,target:0});expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(13);});
 refusal({...base,board});
});

// ——— troop:7080 / spell 8608 ———
describe('L4b troop:7080/spell:8608 Create 4 Skulls + 4 per Blue ally',()=>{
 const base={skill:'8608',cost:12,colors:[BaseColor.Blue,BaseColor.Red]};
 const board=pattern([BaseColor.Yellow,BaseColor.Purple,BaseColor.Green,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7080,8608,12,base.colors,'Create 4 Skulls, boosted by Blue Allies. [x4]',
   [{Target:'AllAllies',Amount:400,Type:'CountArmyColor',Data:'0'},{UseCounterForAmount:true,Color1:'Skull',Amount:4,Type:'CreateGems'}],
   '制造4个头骨，由蓝色盟友激发。 [x4]');
  const mod={mod:{kind:'multiplier',a:4},source:{kind:'alliesOfColor',color:'Blue'}};
  expect(registry.prototypes.get('8608')).toEqual({segments:[{kind:'gem',params:{op:'create',gem:{kind:'skull'},count:{base:4,mult:0},modifier:mod},modifier:mod}]});
 });
 const cases7080:[Partial<Character>[],number][]=[[[],8],[[{colors:[BaseColor.Blue,BaseColor.Green]},{colors:[BaseColor.Red]}],12],[[{colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]}],20]];
 for(const side of sides)for(const [allies,n] of cases7080)
 it(`real cast side=${side}: caster Blue + ${allies.filter(a=>(a.colors??[]).includes(BaseColor.Blue)).length} Blue allies -> ${n} Skulls`,()=>{
  const f=setup({...base,side,board,allies:[...allies]});const ev=f.cast();
  const made=changes(ev);expect(made).toHaveLength(n);expect(made.every(m=>m.to.kind==='skull'&&m.from?.kind==='color')).toBe(true);
  expect(new Set(made.map(m=>m.pos)).size).toBe(n);
  assertTurnAndMana(f,ev);
 });
 it('Blue enemies and dead Blue allies do not count; non-Blue caster alone -> 4',()=>{
  const f=setup({...base,colors:[BaseColor.Red],board,allies:[{colors:[BaseColor.Blue],defeated:true,hp:0}],enemies:[{colors:[BaseColor.Blue]}]});
  expect(changes(f.cast())).toHaveLength(4);
 });
 refusal({...base,board});
});

// ——— troop:6941 / spell 8422 ———
describe('L4b troop:6941/spell:8422 Create 4 Brown + 3 per Blue ally, Freeze a random enemy',()=>{
 const base={skill:'8422',cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 const board=pattern([BaseColor.Yellow,BaseColor.Purple,BaseColor.Green,BaseColor.Red]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(6941,8422,12,base.colors,'Create 4 Brown Gems, boosted by Blue Allies. Freeze a random Enemy. [x3]',
   [{Target:'AllAllies',Amount:300,Type:'CountArmyColor',Data:'0'},{UseCounterForAmount:true,Color1:'Brown',Amount:4,Type:'CreateGems',Delay:0},{Target:'RandomEnemy',Type:'CauseFrozen'}],
   '创造 4 颗棕色宝石，数量因蓝色盟友数而增强。冻结一名随机敌人。 [x3]');
  const mod={mod:{kind:'multiplier',a:3},source:{kind:'alliesOfColor',color:'Blue'}};
  expect(registry.prototypes.get('8422')).toEqual({segments:[{kind:'gem',params:{op:'create',gem:{kind:'color',color:'Brown'},count:{base:4,mult:0},modifier:mod},modifier:mod},
   {kind:'status',target:'enemyRandom',statusId:'frozen',turns:3}]});
 });
 const cases6941:[Partial<Character>[],number][]=[[[],7],[[{colors:[BaseColor.Blue]},{colors:[BaseColor.Red]}],10]];
 for(const side of sides)for(const [allies,n] of cases6941)
 it(`real cast side=${side}: ${n} Brown, one random enemy Frozen`,()=>{
  const f=setup({...base,side,board,allies:[...allies]});const ev=f.cast();
  const made=changes(ev);expect(made).toHaveLength(n);expect(made.every(m=>col(m.to,BaseColor.Brown)&&!isColor(m.from,BaseColor.Brown))).toBe(true);
  const ap=applied(ev);expect(ap).toHaveLength(1);expect(ap[0][1]).toBe('frozen');expect(ap[0][2]).toBe(3);
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='gem-transform')).toBeLessThan(sp.findIndex(e=>e.type==='status-apply'));
  assertTurnAndMana(f,ev);
 });
 it('random Freeze never picks a dead enemy; Blessed lone enemy resists',()=>{
  for(let seed=1;seed<=12;seed++){const f=setup({...base,seed,board,enemies:[{defeated:true,hp:0},{},{}]});const ap=applied(f.cast());expect(ap[0][0]).not.toBe(10);}
  const b=setup({...base,board,enemies:[{statuses:[{id:'blessed',turns:3}]}]});expect(applied(b.cast())).toEqual([]);
 });
 refusal({...base,board});
});

// ——— troop:7197 / spell 8784 ———
describe('L4b troop:7197/spell:8784 Create a mix of 3 Green/Red per Green ally and enemy',()=>{
 const base={skill:'8784',cost:13,colors:[BaseColor.Green,BaseColor.Yellow]};
 const board=pattern([BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue,BaseColor.Brown]);
 it('source/native/prototype/display binding (CreateGems2Colors without Amount = counter only)',()=>{
  troopBinding(7197,8784,13,base.colors,'Create a mix of 3 Green and Red Gems for each Green Ally and Enemy. [x3]',
   [{Target:'AllAllies',Amount:300,Type:'CountArmyColor',Data:'1'},{Target:'AllEnemies',UseCounterForAmount:true,Amount:300,Type:'CountArmyColor',Data:'1'},{UseCounterForAmount:true,Color1:'Green',Color2:'Red',Type:'CreateGems2Colors'}],
   '每有一名绿色盟友或敌人，则创建 3 颗混合绿色和红色的宝石。 [x3]');
  const mod={mod:{kind:'multiplier',a:3},sources:[{kind:'alliesOfColor',color:'Green'},{kind:'enemiesOfColor',color:'Green'}]};
  expect(registry.prototypes.get('8784')).toEqual({segments:[{kind:'gem',params:{op:'create',gem:{kind:'mix',colors:['Green','Red']},count:{base:0,mult:0},modifier:mod},modifier:mod}]});
 });
 for(const side of sides)it(`real cast side=${side}: caster + 1 Green ally + 2 Green enemies -> 12 Green/Red on distinct cells`,()=>{
  const f=setup({...base,side,board,allies:[{colors:[BaseColor.Green]},{colors:[BaseColor.Blue]}],enemies:[{colors:[BaseColor.Green]},{colors:[BaseColor.Green,BaseColor.Red]},{colors:[BaseColor.Blue]}]});
  const ev=f.cast();const made=changes(ev);expect(made).toHaveLength(12);expect(new Set(made.map(m=>m.pos)).size).toBe(12);
  expect(made.every(m=>col(m.to,BaseColor.Green)||col(m.to,BaseColor.Red))).toBe(true);
  expect(made.some(m=>col(m.to,BaseColor.Green))).toBe(true);expect(made.some(m=>col(m.to,BaseColor.Red))).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('no Green troop anywhere (non-Green caster): nothing created; dead Green enemy not counted',()=>{
  const f=setup({...base,colors:[BaseColor.Yellow],board,enemies:[{colors:[BaseColor.Green],defeated:true,hp:0},{colors:[BaseColor.Blue]}]});
  const ev=f.cast();expect(changes(ev)).toEqual([]);expect(f.state.activePlayer).toBe(PlayerSide.Right);
 });
 it('lone Green caster vs non-Green enemies: 3 gems',()=>{
  const f=setup({...base,board,enemies:[{colors:[BaseColor.Blue]}]});expect(changes(f.cast())).toHaveLength(3);
 });
 refusal({...base,board});
});

// ——— troop:7370 / spell 9010 ———
describe('L4b troop:7370/spell:9010 [Magic+3] +3 per Brown ally damage to an enemy, create 3 Good Gargoyle Gems',()=>{
 const base={skill:'9010',cost:12,colors:[BaseColor.Red,BaseColor.Brown],target:12};
 const board=pattern([BaseColor.Yellow,BaseColor.Purple,BaseColor.Blue,BaseColor.Green]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7370,9010,12,base.colors,'Deal [Magic + 3] damage to an Enemy, boosted by Brown Allies. Then create 3 Good Gargoyle Gems. [x3]',
   [{Target:'AllAllies',Amount:300,Type:'CountArmyColor',Data:'5'},{SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:3,Primarypower:true,Type:'Damage',Delay:200},{Color1:'GoodGargoyle',Amount:3,Type:'CreateGems'}],
   '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因棕色盟友数而增强。再创造 3 颗善石像鬼宝石。 [x3]');
  expect(registry.prototypes.get('9010')).toEqual({segments:[{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1},modifier:{mod:{kind:'multiplier',a:3},source:{kind:'alliesOfColor',color:'Brown'}}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'gargoyleGem',tier:1}},count:{base:3,mult:0}}}]});
 });
 for(const side of sides)for(const [magic,browns,dmg] of [[0,0,6],[10,1,19],[10,3,25]] as const)
 it(`real cast side=${side} magic=${magic} +${browns} Brown allies: chosen enemy takes ${dmg}, then 3 Good Gargoyles`,()=>{
  const allies=[...Array(browns)].map(()=>({colors:[BaseColor.Brown]})).concat([{colors:[BaseColor.Blue]}]);
  const f=setup({...base,side,magic,board,allies});const ev=f.cast();
  expect(f.enemies[2].hp).toBe(1000-dmg);expect(f.enemies.filter((_,i)=>i!==2).every(e=>e.hp===1000)).toBe(true);
  const made=changes(ev);expect(made).toHaveLength(3);expect(made.every(m=>isSpecial(m.to,'gargoyleGem')&&m.to.kind==='special'&&m.to.spec.tier===1)).toBe(true);
  const sp=skillPhase(ev);expect(sp.findIndex(e=>e.type==='skill-damage')).toBeLessThan(sp.findIndex(e=>e.type==='gem-transform'));
  assertTurnAndMana(f,ev);
 });
 it('Good Gargoyle is unmatchable; lethal hit still creates the Gargoyles; ally not a legal target',async()=>{
  const {matchJoinKey,specialGem}=await import('@engine/types');expect(matchJoinKey(specialGem('gargoyleGem',1))).toBeNull();
  const f=setup({...base,board,enemies:[{},{},{hp:3}]});const ev=f.cast();expect(f.enemies[2].defeated).toBe(true);expect(changes(ev)).toHaveLength(3);
  const g=setup({...base,board,target:0});expect(g.cast()).toEqual([]);
 });
 refusal({...base,board});
});
