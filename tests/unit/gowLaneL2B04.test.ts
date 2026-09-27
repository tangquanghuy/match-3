// Lane L2 batch B04 (sa-L2): weapon:1504, weapon:1500 (Choose), troop:7169 (AB-CD, chosen gem fixed), troop:7817 (DecreaseRandom, pool disputed), troop:7214 (AB-CD gargoyle tiers).
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

type Gt={kind:string;color?:string;spec?:{kind:string;tier?:number;color?:string}};
const gdesc=(t:Gt)=>t.kind==='color'?String(t.color):t.kind==='special'?String(t.spec?.kind)+(t.spec?.tier?`#${t.spec.tier}`:''):t.kind;
const evs=(ev:GameEvent[])=>ev as unknown as Array<Record<string,unknown>>;
const transforms=(ev:GameEvent[])=>evs(ev).filter(e=>e.type==='gem-transform').flatMap(e=>(e.changes as Array<{from:Gt;to:Gt}>).map(c=>`${gdesc(c.from)}>${gdesc(c.to)}`));
const spawned=(ev:GameEvent[])=>[...evs(ev).filter(e=>e.type==='gem-create').flatMap(e=>(e.spawns as Array<{gemType:Gt}>).map(s=>gdesc(s.gemType))),
 ...evs(ev).filter(e=>e.type==='gem-transform').flatMap(e=>(e.changes as Array<{from:Gt;to:Gt}>).map(c=>gdesc(c.to)))];
const exploded=(ev:GameEvent[])=>evs(ev).filter(e=>e.type==='gem-explode').map(e=>(e.cells as unknown[]).length);
const tally=(xs:string[])=>xs.reduce<Record<string,number>>((m,x)=>(m[x]=(m[x]??0)+1,m),{});
const special=(kind:string,color?:BaseColor,tier?:number)=>({kind:'special',spec:{kind,...(tier!==undefined?{tier}:{}),...(color!==undefined?{color}:{})}}) as unknown as import('@engine/types').GemType;
const place=(f:F,cells:Array<[number,number]>,type:import('@engine/types').GemType)=>cells.forEach(([row,col],i)=>f.board.set({row,col},{id:900+i+row*8+col,type}));

// ---------------------------------------------------------------- weapon:1504 / spell 8900
describe('L2B04 weapon:1504 CourtScepter spell 8900 Choose:ABC-DEF enemy colour -> Spirit Gems OR [Magic+2] +4 per Spirit Gem',()=>{
 const C={spell:8900,cost:14,colors:[BaseColor.Green,BaseColor.Red],paint:diag(DIAG)};
 it('English, native steps, numeric + gw_ binding, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1504)!,w=weapons.find(v=>v.id===1504)!,n=native.get(8900).raw;
  expect(o).toMatchObject({SpellId:8900,ManaCost:14,ReferenceName:'CourtScepter'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorGreen','ColorRed']);
  expect(o.stats.spell).toMatchObject({id:8900,desc:'&& Convert all Gems of a chosen Enemy Mana Color to Spirit Gems. && Deal [Magic + 2] damage to an Enemy, boosted by Spirit Gems. [x4]'});
  expect(n).toMatchObject({Target:'Enemy',Cost:14,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'FromTarget',Amount:100,Color2:'Spirit',Type:'ConvertGems'},{PercentageChance:0,Type:'None'},{PercentageChance:0,Type:'None'},
   {Color1:'Spirit',Amount:400,Type:'CountGems'},{SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:2,Primarypower:true,Type:'Damage'}]);
  expect(w).toMatchObject({id:1504,referenceName:'CourtScepter',manaCost:14,manaColors:['Green','Red'],spell:{id:8900}});
  expect(w.spell.description).toBe('选择一项：将选定敌人一种法力颜色的所有宝石转化为灵魂宝石；或对一名敌人造成 [魔法 + 2] 点伤害，每颗灵魂宝石增加 4 点伤害。');
  const proto={inputTarget:'enemyChosen',segments:[{kind:'choose',labels:['将所选敌人一种法力颜色的宝石转化为灵魂宝石','对所选敌人造成［魔法＋2］伤害，每颗灵魂宝石增强4点'],options:[
   [{kind:'gem',params:{op:'transform',from:'CHOSEN_TARGET',to:'SKULL',spiritColorFromSource:true,toSpecial:'spiritGem'}}],
   [{kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1},modifier:{mod:{kind:'multiplier',a:4},source:{kind:'boardSpecial',gem:'spiritGem'}}}]]}]};
  expect(registry.prototypes.get('8900')).toEqual(proto);expect(registry.prototypes.get('gw_CourtScepter')).toEqual(proto);
 });
 for(const side of SIDES)for(const alias of ['8900','gw_CourtScepter'])it(`real cast ${side}/${alias} branch 0: all 16 gems of the chosen enemy's colour (Purple) -> Spirit Gems; no damage`,()=>{
  const f=setup({...C,spell:alias,side,branch:0,enemies:[{colors:[BaseColor.Yellow]},{},{colors:[BaseColor.Purple]},{}]});const ev=f.cast();
  expect(tally(transforms(ev))).toEqual({[`${BaseColor.Purple}>spiritGem`]:16});expect(f.loss()).toEqual([0,0,0,0]);turnPassed(f);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast ${side} magic=${magic} branch 1: chosen enemy takes [Magic+2] + 4 x Spirit Gems on board (3 -> +12; 0 -> +0)`,()=>{
  const f=setup({...C,side,magic,branch:1});place(f,[[0,1],[3,6],[7,2]],special('spiritGem',BaseColor.Yellow));f.cast();
  expect(f.loss()).toEqual([0,0,magic+2+12,0]);turnPassed(f);
  const g=setup({...C,side,magic,branch:1});g.cast();expect(g.loss()).toEqual([0,0,magic+2,0]);
 });
 it('branch 1: armor absorbs, other Spirit Gem colours all count; low mana / silence / cancelled choice block',()=>{
  const f=setup({...C,branch:1,enemies:[{},{},{armor:5},{}]});place(f,[[0,1]],special('spiritGem',BaseColor.Blue));place(f,[[5,5]],special('spiritGem',BaseColor.Red));
  f.cast();expect(f.loss()).toEqual([0,0,12+8-5,0]);expect(f.enemies[2].armor).toBe(0);
  blocked(C);
 });
});

// ---------------------------------------------------------------- troop:7169 / spell 8722
describe('L2B04 troop:7169 Limpet-bot spell 8722 AB-CD: chosen gem -> Bomb, then 3 more Bombs OR explode all Bombs (fixed L2-singlegem-cell)',()=>{
 const C={spell:8722,cost:10,colors:[BaseColor.Blue,BaseColor.Brown],paint:diag(DIAG),cell:{row:2,col:5}};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7169,8722,10,C.colors);
  expect(o.stats.spell.desc).toBe('Convert a Gem into a Bomb Gem, and either create 3 more Bomb Gems, or explode all Bomb Gems.');
  expect(n).toMatchObject({Target:'Board',Cost:10,Randomize:'AB-CD'});
  expect(n.SpellSteps).toEqual([
   {Color1:'FromTarget',Amount:1,Color2:'Bomb',BoardTarget:'SingleGem',Type:'ConvertGems',Delay:800},{Color1:'Bomb',Amount:3,Type:'CreateGems'},
   {Color1:'FromTarget',Amount:1,Color2:'Bomb',BoardTarget:'SingleGem',Type:'ConvertGems',Delay:800},{Color1:'Bomb',Amount:100,Type:'ExplodeColor'}]);
  expect(proto).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'CELL',to:'SKULL',toSpecial:'bomb',count:{base:1,mult:0}}},
   {kind:'oneOf',options:[[{kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'bomb'}},count:{base:3,mult:0}}}],
    [{kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'special',gem:'bomb'}}}]]}]});
  expect(t.spell.description).toBe('将一颗宝石转换成炸弹宝石。再创造 3 颗炸弹宝石或爆破所有炸弹宝石。');
 });
 const run=(seed:number,o:Partial<Opts>={})=>{
  const f=setup({...C,seed,...o});const before=f.board.get(o.cell??C.cell);const ev=f.cast();
  const first=evs(ev).find(e=>e.type==='gem-transform') as {changes:Array<{pos:{row:number;col:number};gemId:number;to:Gt}>}|undefined;
  expect(first?.changes).toHaveLength(1);expect(first!.changes[0].pos).toEqual(o.cell??C.cell);expect(first!.changes[0].gemId).toBe(before!.id);
  expect(gdesc(first!.changes[0].to)).toBe('bomb');
  const bombsMade=spawned(ev).filter(x=>x==='bomb').length;
  const b=exploded(ev).length&&bombsMade===1?'CD':'AB';
  if(b==='AB')expect(bombsMade).toBe(4);
  return {f,b,ev};
 };
 for(const side of SIDES)it(`real cast ${side}: the chosen gem (2,5) becomes the Bomb; both follow-ups reachable`,()=>{
  const seen=new Set<string>();for(let s=1;s<=12;s++){const {f,b}=run(s,{side});seen.add(b);expect(f.state.actionLog).toHaveLength(1);}
  expect([...seen].sort()).toEqual(['AB','CD']);
 });
 it('even odds over 200 seeds (80..120); another chosen cell (6,1) is honoured',()=>{
  let ab=0;for(let s=1;s<=200;s++)if(run(s).b==='AB')ab++;expect(ab).toBeGreaterThanOrEqual(80);expect(ab).toBeLessThanOrEqual(120);
  run(5,{cell:{row:6,col:1}});
 });
 it('low mana / silence block the cast',()=>{for(const m of ['low','sil']){const g=setup(C);if(m==='low')g.caster.mana=9;else g.caster.statuses=[{id:'silence',turns:3}];
  const b=JSON.stringify(g.board);expect(g.cast()).toEqual([]);expect(JSON.stringify(g.board)).toBe(b);expect(g.state.actionLog).toHaveLength(0);}});
});

// ---------------------------------------------------------------- troop:7817 / spell 9861
describe('L2B04 troop:7817 GreenHag spell 9861 chosen colour -> Poison Gems, DecreaseRandom on a random enemy (pool disputed)',()=>{
 const C={spell:9861,cost:12,colors:[BaseColor.Blue,BaseColor.Green],color:BaseColor.Purple,paint:diag(DIAG)};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7817,9861,12,C.colors);
  expect(o.stats.spell.desc).toBe('Convert all Gems of a chosen Color to Poison Gems. Then eliminate [Magic + 1] points of a random skill from a random Enemy.');
  expect(n).toMatchObject({Target:'ManaGemsOnly',Cost:12});
  expect(n.SpellSteps).toEqual([
   {Color1:'FromTarget',Amount:100,Color2:'Poison',Type:'ConvertGems'},
   {SpellPowerMultiplier:1,Target:'RandomEnemy',Amount:1,Primarypower:true,Type:'DecreaseRandom'}]);
  expect(proto).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL',toSpecial:'poisonGem'}},
   {kind:'reduce',target:'enemyRandom',stat:'random',scaling:{base:1,mult:1}}]});
  expect(t.spell.description).toBe('将指定颜色的所有宝石转化为毒宝石。然后随机减少一名敌人的[魔法 + 1]点随机技能点数。');
 });
 for(const side of SIDES)it(`real cast ${side}: all 16 chosen-colour gems -> Poison Gems; one random living enemy loses [Magic+1] from attack/armor/magic`,()=>{
  const hit=new Set<number>();
  for(let s=1;s<=20;s++){const f=setup({...C,side,seed:s,enemies:[{attack:40,armor:40,magic:40},{attack:40,armor:40,magic:40},{hp:0,defeated:true},{attack:40,armor:40,magic:40}]});
   const ev=f.cast();expect(tally(transforms(ev))).toEqual({[`${BaseColor.Purple}>poisonGem`]:16});
   const lost=f.enemies.map(e=>e.defeated?0:120-(e.attack+e.armor+e.magic));expect(lost.filter(x=>x>0)).toEqual([11]);
   hit.add(lost.findIndex(x=>x>0));expect(f.enemies.every(e=>e.hp===(e.defeated?0:1000))).toBe(true);turnPassed(f);}
  expect([...hit].sort()).toEqual([0,1,3]);
 });
});

// ---------------------------------------------------------------- troop:7214 / spell 8801
describe('L2B04 troop:7214 StoneZombie spell 8801 AB-CD: 4 Stone Blocks -> Good OR Evil Gargoyle Gems, then explode the chosen gem',()=>{
 const C={spell:8801,cost:10,colors:[BaseColor.Blue,BaseColor.Brown],paint:diag(DIAG),cell:{row:4,col:4}};
 const BLOCKS:Array<[number,number]>=[[0,0],[0,7],[7,0],[7,7],[1,3]];
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7214,8801,10,C.colors);
  expect(o.stats.spell.desc).toBe('Convert 4 Stone Blocks to either Good or Evil Gargoyle Gems. Then explode a Gem.');
  expect(n).toMatchObject({Target:'Board',Cost:10,Randomize:'AB-CD'});
  expect(n.SpellSteps).toEqual([
   {Color1:'Block',Amount:4,Color2:'GoodGargoyle',Type:'ConvertGems',Delay:400},{Amount:1,BoardTarget:'SingleGem',Type:'ExplodeGems'},
   {Color1:'Block',Amount:4,Color2:'BadGargoyle',Type:'ConvertGems',Delay:400},{Amount:1,BoardTarget:'SingleGem',Type:'ExplodeGems'}]);
  expect(proto).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'ANY',to:'SKULL',fromSpecial:'stoneBlock',toSpecial:'gargoyleGem',count:{base:4,mult:0},tiers:[1,2]}},
   {kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'cell',cell:'CELL'}}}]});
  expect(t.spell.description).toBe('将 4 颗石块转换成善或恶石像鬼宝石。再爆破一颗宝石。');
 });
 const run=(seed:number,o:Partial<Opts>={},blocks=BLOCKS)=>{
  const f=setup({...C,seed,...o});place(f,blocks,special('stoneBlock'));const ev=f.cast();
  const tf=transforms(ev).filter(x=>x.startsWith('stoneBlock>'));
  return {f,ev,tf,kinds:new Set(tf)};
 };
 for(const side of SIDES)it(`real cast ${side}: exactly 4 of 5 Stone Blocks convert, all to one Gargoyle tier per cast; both tiers reachable; chosen gem (4,4) explodes`,()=>{
  const seen=new Set<string>();
  for(let s=1;s<=12;s++){const {f,ev,tf,kinds}=run(s,{side});expect(tf).toHaveLength(4);expect(kinds.size).toBe(1);seen.add([...kinds][0]);
   const ex=evs(ev).filter(e=>e.type==='gem-explode')[0] as {cells:Array<{pos:{row:number;col:number}}>};
   expect(ex.cells.map(c=>c.pos)).toContainEqual({row:4,col:4});expect(ex.cells).toHaveLength(9);expect(f.state.actionLog).toHaveLength(1);}
  expect([...seen].sort()).toEqual(['stoneBlock>gargoyleGem#1','stoneBlock>gargoyleGem#2']);
 });
 it('tier odds even over 200 seeds (80..120); fewer blocks -> all of them; no block -> explosion still happens; corner cell explodes 4 gems',()=>{
  let good=0;for(let s=1;s<=200;s++)if(run(s).tf[0]==='stoneBlock>gargoyleGem#1')good++;expect(good).toBeGreaterThanOrEqual(80);expect(good).toBeLessThanOrEqual(120);
  expect(run(1,{},[[0,0],[5,2]]).tf).toHaveLength(2);
  const none=run(1,{},[]);expect(none.tf).toEqual([]);expect(exploded(none.ev)[0]).toBe(9);
  expect(exploded(run(1,{cell:{row:0,col:3}},[[7,7]]).ev)[0]).toBe(6);
 });
 it('low mana / silence block the cast',()=>{for(const m of ['low','sil']){const g=setup(C);if(m==='low')g.caster.mana=9;else g.caster.statuses=[{id:'silence',turns:3}];
  expect(g.cast()).toEqual([]);expect(g.state.actionLog).toHaveLength(0);}});
});

// ---------------------------------------------------------------- weapon:1500 / spell 8876
describe('L2B04 weapon:1500 Foxglove spell 8876 Choose:ABC-DEF all Green -> chosen colour OR explode chosen gem + create 10 Green',()=>{
 const C={spell:8876,cost:14,colors:[BaseColor.Blue,BaseColor.Purple],paint:diag([BaseColor.Blue,BaseColor.Green,BaseColor.Purple,BaseColor.Brown]),color:BaseColor.Red,cell:{row:3,col:3}};
 it('English, native steps, numeric + gw_ binding, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1500)!,w=weapons.find(v=>v.id===1500)!,n=native.get(8876).raw;
  expect(o).toMatchObject({SpellId:8876,ManaCost:14,ReferenceName:'Foxglove'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorPurple']);
  expect(o.stats.spell).toMatchObject({id:8876,desc:'&& Convert all Green Gems to a chosen Color. && Explode a Gem, and create 10 Green Gems.'});
  expect(n).toMatchObject({Target:'NotGreenOrSkullGems',Cost:14,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'Green',Amount:100,Color2:'FromTarget',Type:'ConvertGems'},{PercentageChance:0,Type:'None'},{PercentageChance:0,Type:'None'},
   {Amount:1,BoardTarget:'SingleGem',Type:'ExplodeGems'},{Color1:'Green',Amount:10,Type:'CreateGems'}]);
  expect(w).toMatchObject({id:1500,referenceName:'Foxglove',manaCost:14,manaColors:['Blue','Purple'],spell:{id:8876}});
  expect(w.spell.description).toBe('选择一项：将所有绿色宝石转化为选定颜色；或爆破一颗选定宝石，再创造 10 颗绿色宝石。');
  const proto={segments:[{kind:'choose',labels:['将所有绿色宝石转化为所选颜色','爆破所选宝石，创造10颗绿色宝石'],options:[
   [{kind:'gem',params:{op:'transform',from:'Green',to:'CHOSEN'}}],
   [{kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'cell',cell:'CELL'}}},{kind:'gem',params:{op:'create',gem:{kind:'color',color:'Green'},count:{base:10,mult:0}}}]]}]};
  expect(registry.prototypes.get('8876')).toEqual(proto);expect(registry.prototypes.get('gw_Foxglove')).toEqual(proto);
 });
 for(const side of SIDES)for(const [color,alias] of [[BaseColor.Red,'8876'],[BaseColor.Yellow,'gw_Foxglove']] as const)it(`real cast ${side}/${alias} branch 0: all 16 Green -> chosen ${color}; nothing exploded`,()=>{
  const f=setup({...C,spell:alias,side,branch:0,color});const ev=f.cast();
  expect(tally(transforms(ev))).toEqual({[`${BaseColor.Green}>${color}`]:16});expect(exploded(ev)).toEqual([]);turnPassed(f);
 });
 for(const side of SIDES)it(`real cast ${side} branch 1: the chosen gem (3,3) explodes (3x3 = 9 gems), then exactly 10 Green gems are created`,()=>{
  const f=setup({...C,side,branch:1});const ev=f.cast();
  const ex=evs(ev).filter(e=>e.type==='gem-explode')[0] as {cells:Array<{pos:{row:number;col:number}}>};
  expect(ex.cells).toHaveLength(9);expect(ex.cells.map(c=>c.pos)).toContainEqual({row:3,col:3});
  const iEx=evs(ev).findIndex(e=>e.type==='gem-explode'),iCr=evs(ev).findIndex(e=>e.type==='gem-create'||(e.type==='gem-transform'&&(e.changes as Array<{to:Gt}>).some(c=>c.to.kind==='color'&&c.to.color===BaseColor.Green)));
  expect(iCr).toBeGreaterThan(iEx);
  const firstCreate=evs(ev).slice(iEx).find(e=>e.type==='gem-create'||e.type==='gem-transform')!;
  const made=firstCreate.type==='gem-create'?(firstCreate.spawns as Array<{gemType:Gt}>).map(s=>gdesc(s.gemType)):(firstCreate.changes as Array<{to:Gt}>).map(c=>gdesc(c.to));
  expect(made).toEqual(Array(10).fill(BaseColor.Green));expect(f.state.actionLog).toHaveLength(1);
 });
 it('corner chosen gem explodes 4; low mana / silence / cancelled choice block',()=>{
  const f=setup({...C,branch:1,cell:{row:0,col:0}});expect(exploded(f.cast())[0]).toBe(4);
  blocked(C);
 });
});
