// Lane L2 batch B03 (sa-L2): troop:7760 (Choose, Mana Burn), troop:6416 (A+(B-C-D-E-F) weights, fixed), troop:7297, troop:7570 (Choose conversions), troop:7326 (random positive statuses, pool fixed).
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {FixedBranchChooser} from '@engine/skills/branchChooser';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {SeededRNG} from '@engine/rng';
import type {GameEvent} from '@engine/events';
import {BaseColor,PlayerSide,colorGem,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;

interface Opts{spell:number|string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;casterArmor?:number;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;branch?:number|null;seed?:number;
 paint?:(row:number,col:number)=>BaseColor;color?:BaseColor;cell?:{row:number;col:number}}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;
 const f=damageFixture(0,0,o.enemies??[{},{},{},{}]);
 if(o.paint)for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},{id:500+row*8+col,type:colorGem(o.paint(row,col))});
 Object.assign(f.caster,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,armor:o.casterArmor??0});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(20+i,{mana:0,...a}));
 const mine=[f.caster,...allies];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=mine;f.state.activePlayer=side;}
 else f.state.teams.Left.characters=mine;
 const engine=new TurnEngine(f.state,new SeededRNG(o.seed??42),f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 engine.setBranchChooser(new FixedBranchChooser(o.branch===undefined?0:o.branch));if(o.color!==undefined)engine.setColorChooser(new FixedColorChooser(o.color));if(o.cell)engine.setCellChooser({choose:()=>o.cell!});
 const opponent=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 const startHp=f.enemies.map(e=>e.hp);
 return {...f,engine,side,opponent,allies,cast:()=>engine.castSkill(f.caster.id) as GameEvent[],
  loss:()=>f.enemies.map((e,i)=>startHp[i]-e.hp)};
}
type F=ReturnType<typeof setup>;
function troopSource(id:number,spell:number,cost:number,colors:BaseColor[]){
 const o=original.find((t:{id:number})=>t.id===id)!;const t=TROOPS.find(t=>t.id===id)!;
 expect(o.stats.spell.id).toBe(spell);expect(o.ManaCost).toBe(cost);
 expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(colors.map(c=>`Color${c}`).sort());
 expect(t).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 return {o,t,n:native.get(spell).raw,proto:registry.prototypes.get(String(spell))};
}
const turnPassed=(f:F)=>{expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.opponent);};
function blocked(o:Opts){
 for(const mode of ['low-mana','silence','cancel'] as const){
  const f=setup({...o,branch:mode==='cancel'?null:o.branch});
  if(mode==='low-mana')f.caster.mana=o.cost-1;else if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
  const before=JSON.stringify(f.state.board);
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(JSON.stringify(f.state.board)).toBe(before);
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
 }
}
/** Special gems created by the cast (spawned or transformed in place). */
function created(ev:GameEvent[],kind:string){
 let n=0;
 for(const e of ev as unknown as Array<Record<string,unknown>>){
  if(e.type==='gem-create')for(const s of e.spawns as Array<{gemType:{kind:string;spec?:{kind:string}}}>)if(s.gemType.kind==='special'&&s.gemType.spec?.kind===kind)n++;
  if(e.type==='gem-transform')for(const c of e.changes as Array<{to:{kind:string;spec?:{kind:string}}}>)if(c.to.kind==='special'&&c.to.spec?.kind===kind)n++;
 }
 return n;
}
const DIAG=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
const diag=(cols:BaseColor[])=>(r:number,c:number)=>cols[(r+c)%4];
const has=(c:Character,id:string)=>c.statuses.some(s=>s.id===id);
void [DIAG,diag,has,created,blocked,turnPassed,troopSource,weapons,rawWeapons,SIDES];

/** Status ids applied during the cast per target (turn-start self-heal per R004 may later remove them). */
const applied=(ev:GameEvent[],id?:string)=>(ev as unknown as Array<{type:string;targetId:number;statusId:string}>).filter(e=>e.type==='status-apply'&&(id===undefined||e.statusId===id));
const gdesc=(t:{kind:string;color?:string;spec?:{kind:string}})=>t.kind==='color'?String(t.color):t.kind==='special'?String(t.spec?.kind):t.kind;
/** 'from>to' for every in-place gem transform of the cast. */
const transforms=(ev:GameEvent[])=>(ev as unknown as Array<{type:string;changes?:Array<{from:{kind:string};to:{kind:string}}>}>)
 .filter(e=>e.type==='gem-transform').flatMap(e=>e.changes!.map(c=>`${gdesc(c.from)}>${gdesc(c.to)}`));
const tally=(xs:string[])=>xs.reduce<Record<string,number>>((m,x)=>(m[x]=(m[x]??0)+1,m),{});
const OFFICIAL_POSITIVE=['barrier','blessed','enchanted','enraged','reflect','submerged'];

// ---------------------------------------------------------------- troop:7760 / spell 9745
describe('L2B03 troop:7760 SpiritcallerLila spell 9745 Choose:ABC-DEF Spirit Gems OR Curse + Mana Burn',()=>{
 const C={spell:9745,cost:12,colors:[BaseColor.Blue,BaseColor.Purple],paint:diag(DIAG)};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7760,9745,12,C.colors);
  expect(o.stats.spell.desc).toBe("&& Convert 9 Gems of a chosen Enemy's Mana Color to Spirit Gems. && Curse and Mana Burn an Enemy.");
  expect(n).toMatchObject({Target:'Enemy',Cost:12,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'FromTarget',Amount:9,Color2:'Spirit',Type:'ConvertGems'},{PercentageChance:0,Type:'None'},{PercentageChance:0,Type:'None'},
   {Target:'FromTarget',Type:'CauseCursed'},{SpellPowerMultiplier:1,Target:'FromTarget',Primarypower:true,Type:'ManaBurn'}]);
  expect(proto).toEqual({inputTarget:'enemyChosen',segments:[{kind:'choose',labels:['转化九颗精神宝石','诅咒并燃烧敌人法力'],options:[
   [{kind:'gem',params:{op:'transform',from:'LAST_TARGET',to:'SKULL',spiritColorFromSource:true,toSpecial:'spiritGem',count:{base:9,mult:0}}}],
   [{kind:'status',target:'enemyChosen',statusId:'curse',turns:3},{kind:'damage',target:'lastTarget',scaling:{base:0,mult:1},manaBurn:true}]]}]});
  expect(t.spell.description).toBe('&& 将 9 颗选定敌人法力颜色的宝石转换为精神宝石。&& 对敌人施加诅咒和法力燃烧。');
 });
 for(const side of SIDES)for(const [color,other] of [[BaseColor.Yellow,BaseColor.Purple],[BaseColor.Purple,BaseColor.Yellow]] as const)
 it(`real cast ${side} branch 0: chosen enemy colour ${color} -> exactly 9 ${color} gems become Spirit Gems; no damage/status`,()=>{
  const f=setup({...C,side,branch:0,enemies:[{colors:[other]},{},{colors:[color]},{}]});const ev=f.cast();
  expect(tally(transforms(ev))).toEqual({[`${color}>spiritGem`]:9});
  expect(f.loss()).toEqual([0,0,0,0]);expect(applied(ev)).toEqual([]);expect(f.state.actionLog).toHaveLength(1);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast ${side} magic=${magic} branch 1: Curse then Mana Burn = Magic + target mana, mana not drained`,()=>{
  const f=setup({...C,side,magic,branch:1,enemies:[{mana:20},{},{mana:9},{}]});const ev=f.cast();
  expect(applied(ev).map(e=>[e.targetId,e.statusId])).toEqual([[12,'curse']]);
  expect(f.loss()).toEqual([0,0,magic+9,0]);expect(f.enemies[2].mana).toBe(9);expect(transforms(ev)).toEqual([]);turnPassed(f);
 });
 it('branch 1 edges: 0 mana -> Magic only; armor absorbs; Blessed target: Curse and Blessed cancel, then Mana Burn lands',()=>{
  const a=setup({...C,branch:1,enemies:[{},{},{mana:0,armor:4},{}]});a.cast();expect(a.loss()).toEqual([0,0,6,0]);
  const b=setup({...C,branch:1,enemies:[{},{},{mana:5,statuses:[{id:'blessed',turns:99}]},{}]});const ev=b.cast();
  // official status list: Curse landing on a Blessed troop cancels both; Blessed no longer blocks the Mana Burn
  expect(applied(ev,'curse')).toEqual([]);expect(b.enemies[2].statuses.some(s=>s.id==='blessed'||s.id==='curse')).toBe(false);
  expect(b.loss()).toEqual([0,0,15,0]);
 });
 it('low mana / silence / cancelled choice block the cast',()=>blocked(C));
});

// ---------------------------------------------------------------- troop:6416 / spell 7574
describe('L2B03 troop:6416 Diviner spell 7574 A+(B-C-D-E-F): chosen colour -> Yellow, then Cleanse 2/5, Enchant 2/5, Magic 1/5',()=>{
 const C={spell:7574,cost:13,colors:[BaseColor.Green,BaseColor.Brown],color:BaseColor.Blue,paint:diag(DIAG)};
 it('English, native steps, binding, prototype (5 native-weighted options) and zh display',()=>{
  const {o,t,n,proto}=troopSource(6416,7574,13,C.colors);
  expect(o.stats.spell.desc).toBe("Transform a Chosen Color to Yellow, and one of the following: Enchant all allies, OR increase all allies' Magic by [(Magic / 2) + 1], OR Cleanse all allies.");
  expect(n).toMatchObject({Target:'NotYellowOrSkullGems',Cost:13,Randomize:'A+(B-C-D-E-F)'});
  expect(n.SpellSteps).toEqual([
   {Color1:'FromTarget',Amount:100,Color2:'Yellow',Type:'ConvertGems'},
   {Target:'AllAllies',Amount:1,Type:'Cleanse'},{Target:'AllAllies',Amount:1,Type:'CauseEnchanted'},
   {SpellPowerMultiplier:0.5,Target:'AllAllies',Amount:1,Primarypower:true,Type:'IncreaseSpellPower'},
   {Target:'AllAllies',Amount:1,Type:'Cleanse'},{Target:'AllAllies',Amount:1,Type:'CauseEnchanted'}]);
  const cl=[{kind:'cleanse',target:'allyAll'}],en=[{kind:'status',target:'allyAll',statusId:'enchanted',turns:3}];
  expect(proto).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'CHOSEN',to:'Yellow'}},
   {kind:'oneOf',options:[cl,en,[{kind:'buff',target:'allyAll',stat:'magic',scaling:{base:1,mult:0.5}}],cl,en]}]});
  expect(t.spell.description).toBe('将一个指定颜色转换为黄色，并获得下列其一：赋予所有盟友法印效果，或给予所有盟友 [(魔法 / 2) + 1] 点魔力值，或净化所有盟友。');
 });
 const run=(seed:number,o:Partial<Opts>={})=>{
  const f=setup({...C,seed,allies:[{magic:3,statuses:[{id:'poison',turns:3,magnitude:3}]},{hp:0,defeated:true,magic:3}],...o});const ev=f.cast();
  const tf=tally(transforms(ev));expect(tf).toEqual({[`${o.color??C.color}>${BaseColor.Yellow}`]:16});
  const ench=applied(ev,'enchanted').map(e=>e.targetId);
  const cleansed=(ev as unknown as Array<{type:string;targetId:number}>).filter(e=>e.type==='status-cleanse').map(e=>e.targetId);
  const magicUp=f.allies[0].magic-3;
  const b=ench.length?'enchant':cleansed.length?'cleanse':magicUp?'magic':'none';
  if(b==='enchant'){expect(ench).toEqual([0,20]);expect(magicUp).toBe(0);expect(cleansed).toEqual([]);}
  if(b==='cleanse'){expect(cleansed).toEqual([20]);expect(magicUp).toBe(0);expect(ench).toEqual([]);}
  if(b==='magic'){expect(ench).toEqual([]);expect(cleansed).toEqual([]);expect(f.allies[1].magic).toBe(3);}
  return {f,b,magicUp};
 };
 for(const side of SIDES)it(`real cast ${side}: all chosen-colour (Blue) gems -> Yellow; each seed runs exactly one follow-up; all three reachable`,()=>{
  const seen=new Set<string>();for(let s=1;s<=30;s++){const {f,b}=run(s,{side});seen.add(b);turnPassed(f);}
  expect([...seen].sort()).toEqual(['cleanse','enchant','magic']);
 });
 it('branch weights follow the 5 native options: Cleanse ~2/5, Enchant ~2/5, Magic ~1/5 (500 seeds)',()=>{
  const c:Record<string,number>={};for(let s=1;s<=500;s++){const b=run(s).b;c[b]=(c[b]??0)+1;}
  expect(c.none).toBeUndefined();
  for(const k of ['cleanse','enchant'])expect(c[k]).toBeGreaterThanOrEqual(160),expect(c[k]).toBeLessThanOrEqual(240);
  expect(c.magic).toBeGreaterThanOrEqual(65);expect(c.magic).toBeLessThanOrEqual(135);
 });
 it('Magic option = [(Magic/2)+1] to every living ally incl. caster: magic 10 -> +6, magic 11 -> +7 (convention:R006-C1 round)',()=>{
  for(const [magic,gain] of [[10,6],[11,7],[0,1]] as const){
   let done=false;for(let s=1;s<=40&&!done;s++){const r=run(s,{magic});if(r.b==='magic'){expect(r.magicUp).toBe(gain);expect(r.f.caster.magic).toBe(magic+gain);done=true;}}
   expect(done).toBe(true);}
 });
 it('chosen colour Purple converts only Purple; low mana / silence block',()=>{
  run(3,{color:BaseColor.Purple});
  for(const m of ['low','sil']){const g=setup({...C,allies:[{}]});if(m==='low')g.caster.mana=12;else g.caster.statuses=[{id:'silence',turns:3}];
   expect(g.cast()).toEqual([]);expect(g.state.actionLog).toHaveLength(0);}
 });
});

// ---------------------------------------------------------------- troop:7297 / spell 8898
describe('L2B03 troop:7297 ShadowFox spell 8898 Choose:ABC-DEF all Yellow -> Spirit Gems OR Skulls',()=>{
 const C={spell:8898,cost:13,colors:[BaseColor.Red,BaseColor.Purple],paint:diag(DIAG)};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7297,8898,13,C.colors);
  expect(o.stats.spell.desc).toBe('&& Convert all Yellow Gems to Spirit Gems. && Convert all Yellow Gems to Skulls.');
  expect(n).toMatchObject({Target:'None',Cost:13,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'Yellow',Amount:100,Color2:'Spirit',Type:'ConvertGems'},{PercentageChance:0,Type:'None'},{PercentageChance:0,Type:'None'},
   {Color1:'Yellow',Amount:100,Color2:'Skull',Type:'ConvertGems'}]);
  expect(proto).toEqual({segments:[{kind:'choose',labels:['将所有黄色宝石转化为灵魂宝石','将所有黄色宝石转化为骷髅'],options:[
   [{kind:'gem',params:{op:'transform',from:'Yellow',to:'SKULL',spiritColorFromSource:true,toSpecial:'spiritGem'}}],
   [{kind:'gem',params:{op:'transform',from:'Yellow',to:'SKULL'}}]]}]});
  expect(t.spell.description).toBe('选择一项：将所有黄色宝石转化为灵魂宝石；或将所有黄色宝石转化为骷髅。');
 });
 for(const side of SIDES)for(const [branch,to] of [[0,'spiritGem'],[1,'skull']] as const)it(`real cast ${side} branch ${branch}: all 16 Yellow -> ${to}; no other colour touched`,()=>{
  const f=setup({...C,side,branch});const ev=f.cast();expect(tally(transforms(ev))).toEqual({[`${BaseColor.Yellow}>${to}`]:16});
  expect(f.loss()).toEqual([0,0,0,0]);turnPassed(f);
 });
 it('no Yellow on the board -> no transform, cast still spends the turn; low mana / silence / cancel block',()=>{
  const f=setup({...C,branch:1,paint:diag([BaseColor.Blue,BaseColor.Red,BaseColor.Purple,BaseColor.Brown])});expect(transforms(f.cast())).toEqual([]);turnPassed(f);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7570 / spell 9366
describe('L2B03 troop:7570 Foxglove spell 9366 Choose:ABC-DEF Blue->Green+Red->Skulls OR Brown->Green+Purple->Skulls',()=>{
 const P=diag([BaseColor.Blue,BaseColor.Red,BaseColor.Brown,BaseColor.Purple]);
 const C={spell:9366,cost:18,colors:[BaseColor.Green,BaseColor.Yellow],paint:P};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7570,9366,18,C.colors);
  expect(o.stats.spell.desc).toBe('&& Convert Blue Gems to Green, and Red Gems to Skulls. && Convert Brown Gems to Green, and Purple Gems to Skulls.');
  expect(n).toMatchObject({Target:'None',Cost:18,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'Blue',Amount:100,Color2:'Green',Type:'ConvertGems'},{Color1:'Red',Amount:100,Color2:'Skull',Type:'ConvertGems'},{PercentageChance:0,Type:'None'},
   {Color1:'Brown',Amount:100,Color2:'Green',Type:'ConvertGems'},{Color1:'Purple',Amount:100,Color2:'Skull',Type:'ConvertGems'}]);
  const tr=(from:string,to:string)=>({kind:'gem',params:{op:'transform',from,to}});
  expect(proto).toEqual({segments:[{kind:'choose',labels:['蓝色转绿色，红色转骷髅','棕色转绿色，紫色转骷髅'],options:[
   [tr('Blue','Green'),tr('Red','SKULL')],[tr('Brown','Green'),tr('Purple','SKULL')]]}]});
  expect(t.spell.description).toBe('选择一项：将蓝色宝石转化为绿色宝石，红色宝石转化为骷髅；或将棕色宝石转化为绿色宝石，紫色宝石转化为骷髅。');
 });
 for(const side of SIDES)it(`real cast ${side}: branch 0 = 16 Blue->Green + 16 Red->Skull; branch 1 = 16 Brown->Green + 16 Purple->Skull`,()=>{
  const a=setup({...C,side,branch:0});expect(tally(transforms(a.cast()))).toEqual({[`${BaseColor.Blue}>${BaseColor.Green}`]:16,[`${BaseColor.Red}>skull`]:16});turnPassed(a);
  const b=setup({...C,side,branch:1});expect(tally(transforms(b.cast()))).toEqual({[`${BaseColor.Brown}>${BaseColor.Green}`]:16,[`${BaseColor.Purple}>skull`]:16});turnPassed(b);
 });
 it('order inside a branch: Blue->Green first, then Red->Skull (events in native order); low mana / silence / cancel block',()=>{
  const xs=transforms(setup({...C,branch:0}).cast());expect(xs.indexOf(`${BaseColor.Red}>skull`)).toBeGreaterThan(xs.lastIndexOf(`${BaseColor.Blue}>${BaseColor.Green}`));
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7326 / spell 8938
describe('L2B03 troop:7326 Beltane spell 8938 conversions + 1-3 random positive statuses to all allies (pool fixed L2-random-status-pools)',()=>{
 const C={spell:8938,cost:16,colors:[BaseColor.Green,BaseColor.Brown],paint:diag([BaseColor.Blue,BaseColor.Red,BaseColor.Purple,BaseColor.Brown])};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7326,8938,16,C.colors);
  expect(o.stats.spell.desc).toBe('Convert Blue Gems to Green and Purple Gems to Yellow. Give 1-3 random Status Effects to all Allies.');
  expect(n).toMatchObject({Target:'None',Cost:16});
  expect(n.SpellSteps).toEqual([
   {Color1:'Blue',Amount:100,Color2:'Green',Type:'ConvertGems'},{Color1:'Purple',Amount:100,Color2:'Yellow',Type:'ConvertGems'},
   {Target:'AllAllies',Type:'RandomPositiveStatusEffect'},{Target:'AllAllies',PercentageChance:50,Type:'RandomPositiveStatusEffect'},
   {Target:'AllAllies',PercentageChance:25,Type:'RandomPositiveStatusEffect'}]);
  expect(proto).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Blue',to:'Green'}},{kind:'gem',params:{op:'transform',from:'Purple',to:'Yellow'}},
   {kind:'randomStatus',target:'allyAll',pool:'positive'},{kind:'randomStatus',target:'allyAll',chance:0.5,pool:'positive'},{kind:'randomStatus',target:'allyAll',chance:0.25,pool:'positive'}]});
  expect(t.spell.description).toBe('将蓝色宝石转换成绿色，紫色宝石转换成黄色。给予所有盟友 1-3 个随机正面增益状态效果。');
 });
 for(const side of SIDES)it(`real cast ${side}: 16 Blue->Green, 16 Purple->Yellow; every living ally gets >=1 official positive status; enemies and dead ally none`,()=>{
  for(let s=1;s<=10;s++){const f=setup({...C,side,seed:s,allies:[{},{hp:0,defeated:true}]});const ev=f.cast();
   expect(tally(transforms(ev))).toEqual({[`${BaseColor.Blue}>${BaseColor.Green}`]:16,[`${BaseColor.Purple}>${BaseColor.Yellow}`]:16});
   const ap=applied(ev);for(const e of ap)expect(OFFICIAL_POSITIVE).toContain(e.statusId);
   for(const id of [0,20])expect(ap.filter(e=>e.targetId===id).length).toBeGreaterThanOrEqual(1);
   expect(ap.every(e=>e.targetId===0||e.targetId===20)).toBe(true);expect(f.loss()).toEqual([0,0,0,0]);turnPassed(f);}
 });
 it('pool = the 6 official positive statuses at equal odds (Enrage not double-weighted via the rage alias): first draw over 600 seeds',()=>{
  const first:Record<string,number>={};
  for(let s=1;s<=600;s++){const ev=setup({...C,seed:s}).cast();const id=applied(ev)[0].statusId;first[id]=(first[id]??0)+1;}
  expect(Object.keys(first).sort()).toEqual([...OFFICIAL_POSITIVE].sort());
  for(const k of OFFICIAL_POSITIVE)expect(first[k]).toBeGreaterThanOrEqual(65),expect(first[k]).toBeLessThanOrEqual(135);
 });
 it('count: 1 guaranteed + 50% + 25% (one roll per step for the whole team): lone caster gets 1-3 applications, >=2 in roughly half the casts',()=>{
  const c:Record<number,number>={};
  for(let s=1;s<=400;s++){const n=applied(setup({...C,seed:s}).cast()).length;c[n]=(c[n]??0)+1;}
  expect(Object.keys(c).map(Number).every(n=>n>=1&&n<=3)).toBe(true);
  const two=(c[2]??0)+(c[3]??0);expect(two).toBeGreaterThanOrEqual(140);expect(two).toBeLessThanOrEqual(260);expect(c[3]??0).toBeGreaterThan(0);
  const f=setup({...C,seed:7,allies:[{},{}]});const ap=applied(f.cast());
  const per=[0,20,21].map(id=>ap.filter(e=>e.targetId===id).length);expect(Math.min(...per)).toBeGreaterThanOrEqual(1);
 });
 it('low mana / silence block the cast',()=>{for(const m of ['low','sil']){const g=setup(C);if(m==='low')g.caster.mana=15;else g.caster.statuses=[{id:'silence',turns:3}];
  expect(g.cast()).toEqual([]);expect(g.state.actionLog).toHaveLength(0);expect(g.caster.statuses.length).toBe(m==='sil'?1:0);}});
});
