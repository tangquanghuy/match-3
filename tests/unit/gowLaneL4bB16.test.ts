// Lane L4b batch B16 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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


void cellsWhere;void skullGem;void applied;void troopBinding;
interface RW{id:number;ref:string;spell:number;cost:number;colors:BaseColor[];data:string;race:string;enName:string;mix:[BaseColor,BaseColor];protoMix:BaseColor[];desc:string;zh:string}
const RWS:RW[]=[
 {id:1232,ref:"NimbusBow",spell:7971,cost:14,colors:[BaseColor.Green,BaseColor.Purple],data:"stryx",race:"Stryx",enName:"Stryx",mix:[BaseColor.Blue,BaseColor.Yellow],protoMix:[BaseColor.Blue,BaseColor.Yellow],
  desc:"Deal [Magic + 7] damage to an Enemy, boosted by Stryx Allies, then create a mix of 6 Blue and Yellow Gems for each Stryx Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因鸟族盟友的数量而增强。每有一名鸟族盟友，则创造混合蓝色和黄色的 6 颗宝石。 [x6]"},
 {id:1235,ref:"CobrasCurse",spell:7980,cost:14,colors:[BaseColor.Green,BaseColor.Brown],data:"naga",race:"Naga",enName:"Naga",mix:[BaseColor.Red,BaseColor.Green],protoMix:[BaseColor.Green,BaseColor.Red],
  desc:"Deal [Magic + 7] damage to an Enemy, boosted by Naga Allies, then create a mix of 6 Red and Green Gems for each Naga Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因纳迦盟友的数量而增强。每有一名纳迦盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]"},
 {id:1241,ref:"CrystalAxe",spell:8046,cost:14,colors:[BaseColor.Blue,BaseColor.Red],data:"monster",race:"Monster",enName:"Monster",mix:[BaseColor.Green,BaseColor.Brown],protoMix:[BaseColor.Green,BaseColor.Brown],
  desc:"Deal [Magic + 7] damage to an Enemy, boosted by Monster Allies. Then create a mix of 6 Green and Brown Gems for each Monster Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因怪兽盟友的数量而增强。每有一名怪兽盟友，则创造混合绿色和棕色的 6 颗宝石。 [x6]"},
 {id:1244,ref:"DeadGauntlet",spell:8049,cost:14,colors:[BaseColor.Red,BaseColor.Brown],data:"undead",race:"Undead",enName:"Undead",mix:[BaseColor.Blue,BaseColor.Purple],protoMix:[BaseColor.Blue,BaseColor.Purple],
  desc:"Deal [Magic + 7] damage to an Enemy, boosted by Undead Allies. Then create a mix of 6 Blue and Purple Gems for each Undead Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因不死族盟友的数量而增强。每有一名不死族盟友，则创造混合蓝色和紫色的 6 颗宝石。 [x6]"},
 {id:1264,ref:"CaptainsCutlass",spell:8118,cost:14,colors:[BaseColor.Purple,BaseColor.Brown],data:"rogue",race:"Rogue",enName:"Rogue",mix:[BaseColor.Blue,BaseColor.Red],protoMix:[BaseColor.Red,BaseColor.Blue],
  desc:"Deal [Magic + 7] damage to an Enemy boosted by Rogue Allies. Then create a mix of 6 Blue and Red Gems for each Rogue Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因盗贼盟友的数量而增强。每有一名盗贼盟友，则创造混合红色和蓝色的 6 颗宝石。 [x6]"},
];
const ALL=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
for(const w of RWS)describe(`L4b weapon:${w.id}/spell:${w.spell} [Magic+7] +6 per ${w.enName} ally to an enemy, then a mix of 6 ${w.mix.join('/')} per ${w.enName} ally`,()=>{
 const src={kind:'alliesOfRace',race:w.race};
 // Prototype mix order may differ from native Color1/Color2 (per-gem uniform pick: order-insensitive, set asserted).
 const proto={segments:[{kind:'damage',target:'enemyChosen',scaling:{base:7,mult:1},modifier:{mod:{kind:'multiplier',a:6},source:src}},
  {kind:'gem',params:{op:'create',gem:{kind:'mix',colors:[...w.protoMix]},count:{base:0,mult:0},modifier:{mod:{kind:'multiplier',a:6},sources:[src]}},modifier:{mod:{kind:'multiplier',a:6},sources:[src]}}]};
 const others=ALL.filter(c=>!w.mix.includes(c));
 const board=pattern([others[0],others[1],others[2],others[3]]);
 it(`gowhead English, native steps (CountArmyType ${w.data} = troopType ${w.race}), numeric + gw_${w.ref} aliases, cost/colour, Chinese display`,()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===w.id)!;
  expect(o.stats.spell).toMatchObject({id:w.spell,desc:w.desc});
  expect(o.ManaCost??o.manaCost).toBe(w.cost);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(w.colors.map(c=>`Color${c}`).sort());
  const n=native.get(w.spell).raw;expect(n.Cost).toBe(w.cost);expect(n.Target).toBe('Enemy');
  expect(n.SpellSteps).toEqual([{Target:'AllAllies',Amount:600,Type:'CountArmyType',Data:w.data},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:7,Primarypower:true,Type:'Damage'},
   {UseCounterForAmount:true,Color1:w.mix[0],Color2:w.mix[1],Type:'CreateGems2Colors'}]);
  expect([...w.protoMix].sort()).toEqual([...w.mix].sort());
  expect(w.race.toLowerCase()).toBe(w.data);expect(TROOPS.some(t=>t.troopTypes?.includes(w.race))).toBe(true);
  const x=weapons.find(v=>v.id===w.id)!;
  expect(x).toMatchObject({id:w.id,referenceName:w.ref,manaCost:w.cost,manaColors:[...w.colors],spell:{id:w.spell}});
  expect(x.spell.description).toBe(w.zh);
  expect(registry.prototypes.get(String(w.spell))).toEqual(proto);expect(registry.prototypes.get(`gw_${w.ref}`)).toEqual(proto);
 });
 for(const side of sides)for(const alias of [String(w.spell),`gw_${w.ref}`])for(const [magic,n] of [[0,0],[10,2]] as const)
 it(`real cast side=${side} alias=${alias} magic=${magic}, ${n} ${w.enName} allies: chosen enemy takes ${magic+7+6*n}, ${6*n} gems`,()=>{
  const allies=[...Array(n)].map((_,i)=>({troopTypes:i?[w.race]:['Human',w.race]})).concat([{troopTypes:['Other']}]);
  const f=setup({skill:alias,cost:w.cost,colors:w.colors,side,magic,board,target:11,allies});const ev=f.cast();
  expect(f.enemies[1].hp).toBe(1000-(magic+7+6*n));expect(f.enemies.filter((_,i)=>i!==1).every(e=>e.hp===1000)).toBe(true);
  const made=changes(ev);expect(made).toHaveLength(6*n);expect(new Set(made.map(m=>m.pos)).size).toBe(6*n);
  expect(made.every(m=>isColor(m.to,w.mix[0])||isColor(m.to,w.mix[1]))).toBe(true);
  if(n>0){expect(made.some(m=>isColor(m.to,w.mix[0]))).toBe(true);expect(made.some(m=>isColor(m.to,w.mix[1]))).toBe(true);}
  const sp=skillPhase(ev);if(n>0)expect(sp.findIndex(e=>e.type==='skill-damage')).toBeLessThan(sp.findIndex(e=>e.type==='gem-transform'));
  assertTurnAndMana(f,ev);
 });
 it('caster of that type counts itself; dead ally and enemy of that type do not count',()=>{
  const f=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11,allies:[{troopTypes:[w.race],defeated:true,hp:0}],enemies:[{troopTypes:[w.race]},{}]});
  f.caster.troopTypes=[w.race];const ev=f.cast();expect(f.enemies[1].hp).toBe(1000-(10+7+6));expect(changes(ev)).toHaveLength(6);
 });
 it('ally is not a legal target; Barrier absorbs the damage but gems are still created',()=>{
  const a=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:0});expect(a.cast()).toEqual([]);expect(a.caster.mana).toBe(w.cost);
  const b=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11,allies:[{troopTypes:[w.race]}],enemies:[{},{statuses:[{id:'barrier',turns:3}]}]});
  const ev=b.cast();expect(b.enemies[1].hp).toBe(1000);expect(changes(ev)).toHaveLength(6);
 });
 refusal({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11});
});
