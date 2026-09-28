// Lane L2 batch B01 (sa-L2): per-entity source/prototype binding and real castSkill evidence for
// troop:7468 (Choose, source dispute), weapon:1498 (Choose, source dispute), troop:7475 (random AB-CD),
// troop:6775 (Curse + 2x DecreaseRandom, pool dispute), troop:7377 (Choose ABC-DEF).
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
 paint?:(row:number,col:number)=>BaseColor}
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
 engine.setBranchChooser(new FixedBranchChooser(o.branch===undefined?0:o.branch));
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

// ---------------------------------------------------------------- troop:7468 / spell 9185
describe('L2B01 troop:7468 Judgement spell 9185 Choose:ABC-DEF lightning + extra-turn chance',()=>{
 const C={spell:9185,cost:6,colors:[BaseColor.Blue]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7468,9185,6,C.colors);
  expect(o.stats.spell.desc).toBe('&& Create a Blue Lightning Gem. There is a 7% chance of an extra turn for each Blue Gem on the Board. && Create a Yellow Lightning Gem. There is a 7% chance of an extra turn for each Blue Gem on the Board. [x7]');
  expect(n).toMatchObject({Target:'None',Cost:6,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'Yellow',Amount:700,Type:'CountGems'},{Color1:'LightningBlue',Amount:1,Type:'CreateGems'},
   {Target:'Self',UseCounterForAmount:true,Type:'ExtraTurnConditional'},
   {Color1:'Yellow',Amount:700,Type:'CountGems'},{Color1:'LightningYellow',Amount:1,Type:'CreateGems'},
   {Target:'Self',UseCounterForAmount:true,Type:'ExtraTurnConditional'}]);
  const et={kind:'extraTurn',chance:0,chanceBoost:{mod:{kind:'multiplier',a:7},source:{kind:'boardGems',color:'Yellow'}}};
  const g=(k:string)=>({kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:k}},count:{base:1,mult:0}}});
  expect(proto).toEqual({segments:[{kind:'choose',labels:['蓝闪电宝石与额外回合','黄闪电宝石与额外回合'],options:[[g('lightningRow'),et],[g('lightningCol'),et]]}]});
  expect(t.spell.description).toBe('&&创造一颗蓝色闪电宝石。板面上每有一颗蓝色宝石，则有 7% 的几率获得一个额外回合 && 创造一颗黄色闪电宝石。板面上每有一颗蓝色宝石，则有 7% 的几率获得一个额外回合 [x7]');
 });
 for(const side of SIDES)for(const [branch,kind,other] of [[0,'lightningRow','lightningCol'],[1,'lightningCol','lightningRow']] as const)
 it(`real cast ${side} branch ${branch}: exactly one ${kind}; 16 Yellow on board -> 112% -> extra turn`,()=>{
  const f=setup({...C,side,branch,paint:diag(DIAG)});const ev=f.cast();
  expect(created(ev,kind)).toBe(1);expect(created(ev,other)).toBe(0);
  expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(side);
 });
 for(const branch of [0,1])it(`branch ${branch}: 0 Yellow (Blue-heavy board) -> 0% -> turn passes (runtime counts Yellow as native)`,()=>{
  const f=setup({...C,branch,paint:diag([BaseColor.Blue,BaseColor.Red,BaseColor.Purple,BaseColor.Brown])});f.cast();turnPassed(f);
 });
 it('low mana / silence / cancelled choice leave the board and mana untouched',()=>blocked({...C,paint:diag(DIAG)}));
});

// ---------------------------------------------------------------- weapon:1498 / spell 8869
describe('L2B01 weapon:1498 VulpineProtector spell 8869 Choose:ABC-DEF armor OR barrier',()=>{
 const C={spell:8869,cost:14,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, numeric + gw_ binding, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1498)!,w=weapons.find(v=>v.id===1498)!,n=native.get(8869).raw;
  expect(o).toMatchObject({SpellId:8869,ManaCost:14,ReferenceName:'VulpineProtector'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorGreen']);
  expect(o.stats.spell).toMatchObject({id:8869,desc:'&& Give [Magic + 1] Armor to all Allies. && Barrier all other Allies.'});
  expect(n).toMatchObject({Target:'None',Cost:14,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {SpellPowerMultiplier:1,Target:'AllAllies',Amount:1,Primarypower:true,Type:'IncreaseArmor'},
   {PercentageChance:0,Type:'None'},{PercentageChance:0,Type:'None'},
   {Target:'AllAllies',Amount:1,Type:'CauseBarrier',Delay:400,ResetTargets:true}]);
  expect(w).toMatchObject({id:1498,referenceName:'VulpineProtector',manaCost:14,manaColors:['Blue','Green'],spell:{id:8869}});
  expect(w.spell.description).toBe('&& 给予所有盟友 [魔法 + 1] 点护甲值 &&给予所有其他盟友屏障效果');
  const proto={segments:[{kind:'choose',labels:['全体盟友增加护甲','其他盟友获得屏障'],options:[
   [{kind:'buff',target:'allyAll',stat:'armor',scaling:{base:1,mult:1}}],[{kind:'status',target:'allyOthers',statusId:'barrier',turns:3}]]}]};
  expect(registry.prototypes.get('8869')).toEqual(proto);expect(registry.prototypes.get('gw_VulpineProtector')).toEqual(proto);
 });
 for(const side of SIDES)for(const alias of ['8869','gw_VulpineProtector'])it(`real cast ${side}/${alias} branch 0: every living ally incl. caster +[Magic+1] armor, no barrier`,()=>{
  const f=setup({...C,spell:alias,side,branch:0,casterArmor:2,allies:[{armor:3},{armor:0,hp:0,defeated:true}]});f.cast();
  expect([f.caster.armor,f.allies[0].armor,f.allies[1].armor]).toEqual([13,14,0]);
  expect(has(f.caster,'barrier')||has(f.allies[0],'barrier')).toBe(false);expect(f.enemies.every(e=>e.armor===0)).toBe(true);turnPassed(f);
 });
 for(const side of SIDES)it(`real cast ${side} branch 1: other living allies get Barrier, caster does not (runtime follows English; native AllAllies disputed)`,()=>{
  const f=setup({...C,side,branch:1,allies:[{},{}]});f.cast();
  expect([has(f.caster,'barrier'),...f.allies.map(a=>has(a,'barrier'))]).toEqual([false,true,true]);
  expect(f.caster.armor).toBe(0);expect(f.enemies.some(e=>has(e,'barrier'))).toBe(false);turnPassed(f);
 });
 it('low mana / silence / cancelled choice block the cast',()=>blocked({...C,allies:[{}]}));
});

// ---------------------------------------------------------------- troop:7475 / spell 9192
describe('L2B01 troop:7475 DarkHerald spell 9192 Randomize AB-CD: Barrier + 11 Blue OR 11 Yellow Lightning',()=>{
 const C={spell:9192,cost:12,colors:[BaseColor.Blue,BaseColor.Purple]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7475,9192,12,C.colors);
  expect(o.stats.spell.desc).toBe('Gain Barrier. Create 11 Blue Lightning Gems. OR Create 11 Yellow Lightning Gems.');
  expect(n).toMatchObject({Target:'None',Cost:12,Randomize:'AB-CD'});
  expect(n.SpellSteps).toEqual([
   {Target:'Self',Type:'CauseBarrier'},{Color1:'LightningBlue',Amount:11,Type:'CreateGems'},
   {Target:'Self',Type:'CauseBarrier'},{Color1:'LightningYellow',Amount:11,Type:'CreateGems'}]);
  const g=(k:string)=>[{kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:k}},count:{base:11,mult:0}}}];
  expect(proto).toEqual({segments:[{kind:'status',target:'allySelf',statusId:'barrier',turns:3},{kind:'oneOf',options:[g('lightningRow'),g('lightningCol')]}]});
  expect(t.spell.description).toBe('获得屏障效果。创造 11 颗蓝色闪电宝石或 11 颗黄色闪电宝石。');
 });
 const branchOf=(seed:number,side=PlayerSide.Left)=>{
  const f=setup({...C,seed,side,magic:0,paint:diag(DIAG)});const ev=f.cast();
  const row=created(ev,'lightningRow'),col=created(ev,'lightningCol');
  expect(has(f.caster,'barrier')).toBe(true);expect(f.enemies.some(e=>has(e,'barrier'))).toBe(false);
  expect(f.state.actionLog).toHaveLength(1); // caster mana may refill from lightning cascades
  expect([row,col].sort((a,b)=>a-b)).toEqual([0,11]);return row===11?'AB':'CD';
 };
 for(const side of SIDES)it(`real cast ${side}: each seed runs exactly one branch; both branches reachable`,()=>{
  const seen=new Set<string>();for(let s=1;s<=12;s++)seen.add(branchOf(s,side));expect([...seen].sort()).toEqual(['AB','CD']);
 });
 it('branch probability is even: 200 seeds split within 80..120',()=>{
  let ab=0;for(let s=1;s<=200;s++)if(branchOf(s)==='AB')ab++;expect(ab).toBeGreaterThanOrEqual(80);expect(ab).toBeLessThanOrEqual(120);
 });
 it('Barrier is magic-independent, applied once to the caster only; low mana / silence block',()=>{
  const f=setup({...C,magic:25,paint:diag(DIAG)});f.cast();expect(f.caster.statuses.filter(s=>s.id==='barrier')).toHaveLength(1);
  const b=setup({...C,paint:diag(DIAG)});for(const mode of ['low','silence']){const g=setup({...C,paint:diag(DIAG)});
   if(mode==='low')g.caster.mana=11;else g.caster.statuses=[{id:'silence',turns:3}];
   expect(g.cast()).toEqual([]);expect(has(g.caster,'barrier')).toBe(false);expect(g.state.actionLog).toHaveLength(0);}
  expect(b.caster.statuses).toEqual([]);
 });
});

// ---------------------------------------------------------------- troop:6775 / spell 8165
describe('L2B01 troop:6775 CorruptMagus spell 8165 Curse + 2x DecreaseRandom (pool disputed, see issues)',()=>{
 const C={spell:8165,cost:9,colors:[BaseColor.Red,BaseColor.Purple]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(6775,8165,9,C.colors);
  expect(o.stats.spell.desc).toBe('Curse an Enemy and eliminate [Magic + 1] from 2 random Skills.');
  expect(n).toMatchObject({Target:'Enemy',Cost:9});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseCursed'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'DecreaseRandom'},
   {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Type:'DecreaseRandom'}]);
  expect(proto).toEqual({segments:[{kind:'status',target:'enemyChosen',statusId:'curse',turns:3},
   {kind:'reduce',target:'lastTarget',stat:'random',scaling:{base:1,mult:1},times:2}]});
  expect(t.spell.description).toBe('诅咒一名敌人，并从其 2 个随机技能值消除 [魔法 + 1] 点。');
 });
 for(const side of SIDES)it(`real cast ${side}: chosen enemy Cursed and loses 2 x [Magic+1] over attack/armor/life/magic (R007-2); others untouched`,()=>{
  const f=setup({...C,side,enemies:[{},{},{attack:40,armor:40,magic:40},{}]});f.cast();
  const e=f.enemies[2];expect(has(e,'curse')).toBe(true);
  // R007-2 (sa-P P-random-stat-pool): Life is in the pool and is reduced directly
  expect(1120-(e.attack+e.armor+e.magic+e.hp)).toBe(22);
  expect(f.enemies.filter((_,i)=>i!==2).every(x=>!has(x,'curse')&&x.attack===17&&x.magic===11)).toBe(true);turnPassed(f);
 });
});

// ---------------------------------------------------------------- troop:7377 / spell 9017
describe('L2B01 troop:7377 GuardianOfLaw spell 9017 Choose:ABC-DEF',()=>{
 const C={spell:9017,cost:24,colors:[BaseColor.Blue,BaseColor.Yellow,BaseColor.Brown]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7377,9017,24,C.colors);
  expect(o.stats.spell.desc).toBe('&& Deal [(Magic x 2) + 4] true damage to a chosen Enemy, Death Mark them and Drain their Mana. && Deal [(Magic x 2) + 4] damage to all other Enemies.');
  expect(n).toMatchObject({Target:'Enemy',Cost:24,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Amount:1,Type:'CauseDeathMark'},{Target:'FromTarget',Amount:100,Type:'DecreaseMana'},
   {SpellPowerMultiplier:2,Target:'FromTarget',Amount:4,Primarypower:true,Type:'TrueDamage'},
   {SpellPowerMultiplier:2,Target:'AboveTarget',Amount:4,Type:'Damage'},{SpellPowerMultiplier:2,Target:'BelowTarget',Amount:4,Type:'Damage'}]);
  expect(proto).toEqual({inputTarget:'enemyChosen',segments:[{kind:'choose',
   labels:['对所选敌人施加死亡标记、耗尽法力并造成［魔法×2＋4］真实伤害','对所选目标之外的其他敌人造成［魔法×2＋4］伤害'],options:[
    [{kind:'status',target:'enemyChosen',statusId:'death-mark',turns:3},{kind:'reduce',target:'enemyChosen',stat:'mana',scaling:{base:0,mult:0},drainAll:true},
     {kind:'damage',target:'enemyChosen',scaling:{base:4,mult:2},trueDamage:true}],
    [{kind:'damage',target:'enemyAboveTarget',scaling:{base:4,mult:2},range:'all'},{kind:'damage',target:'enemyBelowTarget',scaling:{base:4,mult:2},range:'all'}]]}]});
  expect(t.spell.description).toBe('选择一项：对选定敌人施加死亡标记、耗尽其法力，并造成 [魔法 × 2 + 4] 点真实伤害；或对选定目标之外的所有其他敌人各造成 [魔法 × 2 + 4] 点伤害。');
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast ${side} magic=${magic} branch 0: chosen enemy Death Marked, mana 0, true damage 2M+4 through armor`,()=>{
  const f=setup({...C,side,magic,branch:0,enemies:[{},{},{armor:50,mana:9},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,2*magic+4,0]);expect(f.enemies[2].armor).toBe(50);expect(f.enemies[2].mana).toBe(0);
  expect(has(f.enemies[2],'death-mark')).toBe(true);expect(f.enemies.filter((_,i)=>i!==2).every(e=>!has(e,'death-mark')&&e.mana===16)).toBe(true);turnPassed(f);
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast ${side} magic=${magic} branch 1: every other living enemy takes 2M+4 normal damage, chosen untouched`,()=>{
  const f=setup({...C,side,magic,branch:1,enemies:[{armor:3},{},{mana:9},{}]});f.cast();
  const d=2*magic+4;expect(f.loss()).toEqual([d-3,d,0,d]);expect(f.enemies[0].armor).toBe(0);
  expect(f.enemies[2].mana).toBe(9);expect(f.enemies.some(e=>has(e,'death-mark'))).toBe(false);turnPassed(f);
 });
 it('branch 1 edges: chosen at top -> only below; chosen at bottom -> only above; dead enemy skipped; barrier absorbs',()=>{
  const a=setup({...C,branch:1,target:10});a.cast();expect(a.loss()).toEqual([0,24,24,24]);
  const b=setup({...C,branch:1,target:13,enemies:[{},{hp:0,defeated:true},{statuses:[{id:'barrier',turns:99}]},{}]});b.cast();
  expect(b.loss()).toEqual([24,0,0,0]);expect(has(b.enemies[2],'barrier')).toBe(false);
 });
 it('branch 0 edge: barrier on chosen blocks the true damage but Death Mark and drain still land (native order)',()=>{
  const f=setup({...C,branch:0,enemies:[{},{},{statuses:[{id:'barrier',turns:99}]},{}]});f.cast();
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.enemies[2].mana).toBe(0);expect(has(f.enemies[2],'death-mark')).toBe(true);
 });
 it('low mana / silence / cancelled choice block the cast',()=>blocked(C));
});
