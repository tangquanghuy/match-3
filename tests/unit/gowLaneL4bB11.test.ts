// Lane L4b batch B11 (reviewer sa-L4b): convert-colour / create special gem skills, stored-snapshot scope.
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
/** Chinese kingdom name that src troops carry for a native KingdomId (majority over all raw troops of that id). */
function kingdomNameOf(kid:number){const m=new Map<string,number>();for(const r of original.filter((t:{KingdomId:number})=>t.KingdomId===kid)){const s=TROOPS.find(t=>t.id===r.id);if(s&&s.kingdom)m.set(s.kingdom,(m.get(s.kingdom)??0)+1);}
 return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];}
interface KW{id:number;ref:string;spell:number;cost:number;colors:BaseColor[];kid:number;kingdom:string;enName:string;mix:[BaseColor,BaseColor];protoMix:BaseColor[];c0:boolean;desc:string;zh:string}
const KWS:KW[]=[
 {id:1288,ref:'MedusaTome',spell:8197,cost:14,colors:[BaseColor.Green,BaseColor.Yellow],kid:3016,kingdom:'鳞雾沼泽',enName:"Mist of Scales",mix:[BaseColor.Red,BaseColor.Blue],protoMix:[BaseColor.Blue,BaseColor.Red],c0:false,
  desc:"Deal [Magic + 7] damage to an Enemy boosted by Mist of Scales Allies. Then create a mix of 6 Blue and Red Gems for each Mist of Scales Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因鳞雾沼泽盟友的数量而增强。每有一名鳞雾沼泽盟友，则创造混合蓝色和红色的 6 颗宝石。 [x6]"},
 {id:1290,ref:'CatsPaw',spell:8199,cost:14,colors:[BaseColor.Blue,BaseColor.Yellow],kid:3005,kingdom:'荣耀之地',enName:"Pridelands",mix:[BaseColor.Green,BaseColor.Red],protoMix:[BaseColor.Green,BaseColor.Red],c0:false,
  desc:"Deal [Magic + 7] damage to an Enemy boosted by Pridelands Allies. Then create a mix of 6 Green and Red Gems for each Pridelands Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因荣耀之地盟友的数量而增强。每有一名荣耀之地盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]"},
 {id:1292,ref:'OakenCrown',spell:8201,cost:14,colors:[BaseColor.Purple,BaseColor.Brown],kid:3015,kingdom:'荆棘森林',enName:"Forest of Thorns",mix:[BaseColor.Green,BaseColor.Yellow],protoMix:[BaseColor.Green,BaseColor.Yellow],c0:false,
  desc:"Deal [Magic + 7] damage to an Enemy boosted by Forest of Thorns Allies. Then create a mix of 6 Green and Yellow Gems for each Forest of Thorns Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因荆棘森林盟友的数量而增强。每有一名荆棘森林盟友，则创造混合绿色和黄色的 6 颗宝石。 [x6]"},
 {id:1303,ref:'SickleOfSin',spell:8260,cost:14,colors:[BaseColor.Blue,BaseColor.Green],kid:3037,kingdom:'迈纳杰之罪',enName:"Sin of Maraj",mix:[BaseColor.Red,BaseColor.Purple],protoMix:[BaseColor.Red,BaseColor.Purple],c0:false,
  desc:"Deal [Magic + 7] damage to an Enemy boosted by Sin of Maraj Allies. Then create a mix of 6 Red and Purple Gems for each Sin of Maraj Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因迈纳杰之罪盟友数而增强。每有一名迈纳杰之罪盟友，则创造 6 颗混合红色和紫色的宝石。 [x6]"},
 {id:1304,ref:'StingingWind',spell:8261,cost:14,colors:[BaseColor.Blue,BaseColor.Red],kid:3024,kingdom:'聚沙之地',enName:"Drifting Sands",mix:[BaseColor.Yellow,BaseColor.Brown],protoMix:[BaseColor.Yellow,BaseColor.Brown],c0:false,
  desc:"Deal [Magic + 7] damage to an Enemy boosted by Drifting Sands Allies. Then create a mix of 6 Yellow and Brown Gems for each Drifting Sands Ally. [x6]",
  zh:"对一名敌人造成 [魔法 + 7] 点伤害，伤害值因聚沙之地盟友数而增强。每有一名聚沙之地盟友，则创造 6 颗混合黄色和棕色的宝石。 [x6]"},
];
const ALL=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
for(const w of KWS)describe(`L4b weapon:${w.id}/spell:${w.spell} [Magic+7] +6 per ${w.enName} ally to an enemy, then a mix of 6 ${w.mix.join('/')} per ${w.enName} ally`,()=>{
 const mod={mod:{kind:'multiplier',a:6},source:{kind:'alliesOfKingdom',kingdom:w.kingdom}};
 // Prototype mix order may differ from native Color1/Color2 (per-gem uniform pick: order-insensitive, set asserted below).
 const proto={segments:[{kind:'damage',target:'enemyChosen',scaling:{base:7,mult:1},modifier:mod},
  {kind:'gem',params:{op:'create',gem:{kind:'mix',colors:[...w.protoMix]},count:{base:0,mult:0},modifier:mod},modifier:mod}]};
 const others=ALL.filter(c=>!w.mix.includes(c));
 const board=pattern([others[0],others[1],others[2],others[3]]);
 it(`gowhead English, native steps (CountArmyKingdom ${w.kid} = ${w.kingdom}), numeric + gw_${w.ref} aliases, cost/colour, Chinese display`,()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===w.id)!;
  expect(o.stats.spell).toMatchObject({id:w.spell,desc:w.desc});
  expect(o.ManaCost??o.manaCost).toBe(w.cost);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(w.colors.map(c=>`Color${c}`).sort());
  const n=native.get(w.spell).raw;expect(n.Cost).toBe(w.cost);expect(n.Target).toBe('Enemy');
  expect([...w.protoMix].sort()).toEqual([...w.mix].sort());
  expect(n.SpellSteps).toEqual([{Target:'AllAllies',...(w.c0?{UseCounterForAmount:true}:{}),Amount:600,Type:'CountArmyKingdom',Data:String(w.kid)},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:7,Primarypower:true,Type:'Damage'},
   {UseCounterForAmount:true,Color1:w.mix[0],Color2:w.mix[1],Type:'CreateGems2Colors'}]);
  expect(kingdomNameOf(w.kid)).toBe(w.kingdom);
  const x=weapons.find(v=>v.id===w.id)!;
  expect(x).toMatchObject({id:w.id,referenceName:w.ref,manaCost:w.cost,manaColors:[...w.colors],spell:{id:w.spell}});
  expect(x.spell.description).toBe(w.zh);
  expect(registry.prototypes.get(String(w.spell))).toEqual(proto);expect(registry.prototypes.get(`gw_${w.ref}`)).toEqual(proto);
 });
 for(const side of sides)for(const alias of [String(w.spell),`gw_${w.ref}`])for(const [magic,n] of [[0,0],[10,2]] as const)
 it(`real cast side=${side} alias=${alias} magic=${magic}, ${n} ${w.enName} allies: chosen enemy takes ${magic+7+6*n}, ${6*n} gems`,()=>{
  const allies=[...Array(n)].map(()=>({kingdom:w.kingdom})).concat([{kingdom:'其他'}]);
  const f=setup({skill:alias,cost:w.cost,colors:w.colors,side,magic,board,target:11,allies});const ev=f.cast();
  expect(f.enemies[1].hp).toBe(1000-(magic+7+6*n));expect(f.enemies.filter((_,i)=>i!==1).every(e=>e.hp===1000)).toBe(true);
  const made=changes(ev);expect(made).toHaveLength(6*n);expect(new Set(made.map(m=>m.pos)).size).toBe(6*n);
  expect(made.every(m=>isColor(m.to,w.mix[0])||isColor(m.to,w.mix[1]))).toBe(true);
  if(n>0){expect(made.some(m=>isColor(m.to,w.mix[0]))).toBe(true);expect(made.some(m=>isColor(m.to,w.mix[1]))).toBe(true);}
  const sp=skillPhase(ev);if(n>0)expect(sp.findIndex(e=>e.type==='skill-damage')).toBeLessThan(sp.findIndex(e=>e.type==='gem-transform'));
  assertTurnAndMana(f,ev);
 });
 it('caster of that kingdom counts itself; dead kingdom ally and enemy of that kingdom do not count',()=>{
  const f=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11,allies:[{kingdom:w.kingdom,defeated:true,hp:0}],enemies:[{kingdom:w.kingdom},{}]});
  f.caster.kingdom=w.kingdom;const ev=f.cast();expect(f.enemies[1].hp).toBe(1000-(10+7+6));expect(changes(ev)).toHaveLength(6);
 });
 it('ally is not a legal target; Barrier absorbs the damage but gems are still created',()=>{
  const a=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:0});expect(a.cast()).toEqual([]);expect(a.caster.mana).toBe(w.cost);
  const b=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11,allies:[{kingdom:w.kingdom}],enemies:[{},{statuses:[{id:'barrier',turns:3}]}]});
  const ev=b.cast();expect(b.enemies[1].hp).toBe(1000);expect(changes(ev)).toHaveLength(6);
 });
 refusal({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11});
});
