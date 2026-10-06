// Lane L2 batch B02 (sa-L2): troop:6876 (AB-CD), troop:6958 (AB+(C-D-E-F), fixed order), troop:6383 (random Skill), weapon:1620 (random Bleed, fixed), troop:7698 (Choose + chosen colour).
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
 paint?:(row:number,col:number)=>BaseColor;color?:BaseColor}
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
 engine.setBranchChooser(new FixedBranchChooser(o.branch===undefined?0:o.branch));if(o.color!==undefined)engine.setColorChooser(new FixedColorChooser(o.color));
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

/** Ids that received a status-apply of this status during the cast (turn-start self-heal per R004 may later remove it). */
const applied=(ev:GameEvent[],id:string)=>(ev as unknown as Array<{type:string;targetId:number;statusId:string}>).filter(e=>e.type==='status-apply'&&e.statusId===id).map(e=>e.targetId);

// ---------------------------------------------------------------- troop:6876 / spell 8292
describe('L2B02 troop:6876 Goblette spell 8292 Randomize AB-CD: Entangle first 2 OR half mana to first 2 allies; extra turn',()=>{
 const C={spell:8292,cost:11,colors:[BaseColor.Blue,BaseColor.Green]};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(6876,8292,11,C.colors);
  expect(o.stats.spell.desc).toBe('Entangle the first 2 Enemies or give half mana to the first 2 Allies. Gain an extra turn.');
  expect(n).toMatchObject({Target:'None',Cost:11,Randomize:'AB-CD'});
  expect(n.SpellSteps).toEqual([
   {Target:'FirstTwoEnemies',Amount:1,Type:'CauseEntangle'},{Target:'Self',Amount:100,Type:'ExtraTurn'},
   {Target:'FirstTwoAllies',Type:'GenerateHalfMana'},{Target:'Self',Amount:100,Type:'ExtraTurn'}]);
  expect(proto).toEqual({segments:[{kind:'oneOf',options:[
   [{kind:'status',target:'enemyFirstN',statusId:'entangle',turns:3,n:2}],
   [{kind:'buff',target:'allyFirstN',stat:'mana',scaling:{base:0,mult:0},n:2,halve:true}]]},{kind:'extraTurn'}]});
  expect(t.spell.description).toBe('缠绕首 2 名敌人，或给予首 2 名盟友半数法力值。获得一个额外回合。');
 });
 const run=(seed:number,side=PlayerSide.Left,enemies?:Partial<Character>[])=>{
  const f=setup({...C,seed,side,enemies,allies:[{manaCost:16},{manaCost:20}]});const ev=f.cast();
  expect(f.state.activePlayer).toBe(side);expect(f.state.actionLog).toHaveLength(1);
  const hit=applied(ev,'entangle');const ent=f.enemies.map(e=>hit.includes(e.id));
  const manaGain=(ev as unknown as Array<{type:string;targetId?:number;characterId?:number;stat?:string}>).filter(e=>e.type==='buff').map(e=>e.characterId??e.targetId);
  if(hit.length){expect(manaGain).toEqual([]);expect(f.allies.map(a=>a.mana)).toEqual([0,0]);return {b:'AB',f,ent};}
  // caster: spends 11, then +floor(11/2)=5 (reshuffle cascades may add more); ally 20: +floor(16/2)=8; ally 21 untouched
  expect(manaGain).toEqual([0,20]);expect(f.caster.mana).toBeGreaterThanOrEqual(5);expect(f.allies.map(a=>a.mana)).toEqual([8,0]);return {b:'CD',f,ent};
 };
 for(const side of SIDES)it(`real cast ${side}: branch AB entangles exactly the first 2 enemies, CD gives floor(manaCost/2) to caster + ally 20; extra turn always`,()=>{
  const seen=new Set<string>();
  for(let s=1;s<=12;s++){const r=run(s,side);seen.add(r.b);if(r.b==='AB')expect(r.ent).toEqual([true,true,false,false]);}
  expect([...seen].sort()).toEqual(['AB','CD']);
 });
 it('branch odds are even (200 seeds within 80..120); dead front enemy -> first 2 living are entangled',()=>{
  let ab=0;for(let s=1;s<=200;s++)if(run(s).b==='AB')ab++;expect(ab).toBeGreaterThanOrEqual(80);expect(ab).toBeLessThanOrEqual(120);
  for(let s=1;s<=12;s++){const r=run(s,PlayerSide.Left,[{hp:0,defeated:true},{},{},{}]);if(r.b==='AB'){expect(r.ent).toEqual([false,true,true,false]);return;}}
  throw new Error('no AB seed');
 });
 it('low mana / silence block the cast',()=>{for(const m of ['low','sil']){const f=setup({...C,allies:[{}]});
  if(m==='low')f.caster.mana=10;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.enemies.some(e=>has(e,'entangle'))).toBe(false);expect(f.allies[0].mana).toBe(0);}});
});

// ---------------------------------------------------------------- troop:6958 / spell 8458
describe('L2B02 troop:6958 KoboldKnight spell 8458 AB+(C-D-E-F): Stun + damage first 2, then extra turn OR 12 armor',()=>{
 const C={spell:8458,cost:13,colors:[BaseColor.Blue,BaseColor.Yellow]};
 it('English, native steps, binding, prototype (native Stun-before-Damage order) and zh display',()=>{
  const {o,t,n,proto}=troopSource(6958,8458,13,C.colors);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 2] damage to the first 2 Enemies and Stun them. Then either gain an extra turn, OR gain 12 Armor.');
  expect(n).toMatchObject({Target:'None',Cost:13,Randomize:'AB+(C-D-E-F)'});
  expect(n.SpellSteps).toEqual([
   {Target:'FirstTwoEnemies',Amount:1,Type:'CauseStun'},
   {SpellPowerMultiplier:1,Target:'FirstTwoEnemies',Amount:2,Primarypower:true,Type:'Damage'},
   {Target:'Self',Type:'ExtraTurn'},{Target:'Self',Amount:12,Type:'IncreaseArmor'},
   {Target:'Self',Type:'ExtraTurn'},{Target:'Self',Amount:12,Type:'IncreaseArmor'}]);
  expect(proto).toEqual({segments:[{kind:'status',target:'enemyFirstN',statusId:'stun',turns:3,n:2},
   {kind:'damage',target:'enemyFirstN',scaling:{base:2,mult:1},n:2},
   {kind:'oneOf',options:[[{kind:'extraTurn'}],[{kind:'buff',target:'allySelf',stat:'armor',scaling:{base:12,mult:0}}]]}]});
  expect(t.spell.description).toBe('对前 2 位敌人造成 [魔法 + 2] 点伤害，再将他们击晕。再获得一个额外回合或获得 12 点护甲值。');
 });
 const run=(seed:number,side=PlayerSide.Left,o:Partial<Opts>={})=>{
  const f=setup({...C,seed,side,...o});const ev=f.cast();
  const extra=f.state.activePlayer===side;
  if(extra)expect(f.caster.armor).toBe(o.casterArmor??0);else expect(f.caster.armor).toBe((o.casterArmor??0)+12);
  const stunned=applied(ev,'stun');
  const types=(ev as unknown as Array<{type:string}>).map(e=>e.type);
  // native order: every stun status-apply precedes the first skill-damage
  if(stunned.length&&types.includes('skill-damage'))expect(types.lastIndexOf('status-apply')).toBeLessThan(types.indexOf('skill-damage'));
  return {f,b:extra?'CE':'DF',stunned};
 };
 for(const side of SIDES)for(const magic of [0,10])it(`real cast ${side} magic=${magic}: first 2 enemies take [Magic+2] and are Stunned; both tails reachable`,()=>{
  const seen=new Set<string>();
  for(let s=1;s<=12;s++){const {f,b,stunned}=run(s,side,{magic});seen.add(b);
   expect(f.loss()).toEqual([magic+2,magic+2,0,0]);expect(stunned).toEqual([10,11]);
   expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);}
  expect([...seen].sort()).toEqual(['CE','DF']);
 });
 it('tail odds are even (C-D-E-F = 2 extra-turn + 2 armor options): 200 seeds within 80..120',()=>{
  let ce=0;for(let s=1;s<=200;s++)if(run(s).b==='CE')ce++;expect(ce).toBeGreaterThanOrEqual(80);expect(ce).toBeLessThanOrEqual(120);
 });
 it('native order: Stun lands first, so a spellblock (50% spell reduction) front enemy takes the full 12',()=>{
  const {f}=run(1,PlayerSide.Left,{enemies:[{traitIds:['spellblock']},{},{},{}]});expect(f.loss()).toEqual([12,12,0,0]);
 });
 it('edges: armor absorbs; dead front -> next two living; lone enemy hit once; barrier blocks damage but Stun still lands; low mana / silence block',()=>{
  expect(run(1,PlayerSide.Left,{enemies:[{armor:5},{},{},{}]}).f.loss()).toEqual([7,12,0,0]);
  const d=run(1,PlayerSide.Left,{enemies:[{hp:0,defeated:true},{},{},{}]}).f;expect(d.loss()).toEqual([0,12,12,0]);
  const l=run(1,PlayerSide.Left,{enemies:[{},{hp:0,defeated:true},{hp:0,defeated:true},{hp:0,defeated:true}]}).f;expect(l.loss()).toEqual([12,0,0,0]);
  const b=run(1,PlayerSide.Left,{enemies:[{statuses:[{id:'barrier',turns:99}]},{},{},{}]});expect(b.f.loss()).toEqual([0,12,0,0]);expect(b.stunned).toEqual([10,11]);
  expect(run(1,PlayerSide.Left,{enemies:[{hp:0,defeated:true},{},{},{}]}).stunned).toEqual([11,12]);
  for(const m of ['low','sil']){const f=setup(C);if(m==='low')f.caster.mana=12;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.loss()).toEqual([0,0,0,0]);expect(f.state.actionLog).toHaveLength(0);}
 });
});

// ---------------------------------------------------------------- troop:6383 / spell 7538
describe('L2B02 troop:6383 Nax spell 7538 Cleanse ally + [Magic+1] to one random Skill + 2 Magic, x2 for Wildfolk',()=>{
 const C={spell:7538,cost:12,colors:[BaseColor.Purple,BaseColor.Brown],target:20};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(6383,7538,12,C.colors);
  expect(o.stats.spell.desc).toBe('Cleanse an Ally, then give [Magic + 1] points of a random Skill to them, and 2 Magic. If the Ally is a Wildfolk, give double the effects.');
  expect(n).toMatchObject({Target:'Ally',Cost:12});
  expect(n.SpellSteps).toEqual([
   {Target:'FromTarget',Type:'Cleanse'},
   {SpellPowerMultiplier:1,Target:'FromTarget',StatusAmount:2,Amount:1,Primarypower:true,StatusModifier:'MultiplyForWildfolk',Type:'IncreaseRandom'},
   {Amount:1000,Type:'Delay'},
   {Target:'FromTarget',StatusAmount:2,Amount:2,StatusModifier:'MultiplyForWildfolk',Type:'IncreaseSpellPower'}]);
  expect(proto).toEqual({segments:[{kind:'cleanse',target:'allyChosen'},
   {kind:'randomStat',target:'allyChosen',scaling:{base:1,mult:1},oneSkill:true,raceDouble:'Wildfolk'},
   {kind:'buff',target:'allyChosen',stat:'magic',scaling:{base:2,mult:0},raceDouble:'Wildfolk'}]});
  expect(t.spell.description).toBe('净化一名盟友。使其一项随机属性获得 [魔法 + 1] 点，并获得 2 点魔力值。如果盟友是蛮族，则效果两倍。');
 });
 const gain=(seed:number,o:Partial<Opts>={},ally:Partial<Character>={})=>{
  const f=setup({...C,seed,...o,allies:[{attack:5,armor:5,magic:5,hp:500,maxHp:1000,...ally},{}]});f.cast();const a=f.allies[0];
  return {f,d:{attack:a.attack-5,armor:a.armor-5,magic:a.magic-5,hp:a.hp-500}};
 };
 for(const side of SIDES)for(const magic of [0,10])it(`real cast ${side} magic=${magic}: exactly one Skill gets [Magic+1], Magic also +2; all four Skills reachable; other ally untouched`,()=>{
  const hit=new Set<string>();
  for(let s=1;s<=40;s++){const {f,d}=gain(s,{side,magic});
   const got=Object.entries(d).map(([k,v])=>[k,v-(k==='magic'?2:0)] as const).filter(([,v])=>v!==0);
   expect(got).toHaveLength(1);expect(got[0][1]).toBe(magic+1);hit.add(got[0][0]);
   expect(f.allies[1]).toMatchObject({attack:17,armor:0,magic:11,hp:1000});expect(f.caster.magic).toBe(magic);turnPassed(f);}
  expect([...hit].sort()).toEqual(['armor','attack','hp','magic']);
 });
 it('Wildfolk ally: both effects doubled (2 x [Magic+1] to one Skill, +4 Magic); non-Wildfolk not doubled',()=>{
  for(let s=1;s<=10;s++){const {d}=gain(s,{},{troopTypes:['Wildfolk']});
   const tot=d.attack+d.armor+d.magic+d.hp;expect(tot).toBe(22+4);expect(d.magic===4||d.magic===26).toBe(true);}
  const {d}=gain(1,{},{troopTypes:['Goblin']});expect(d.attack+d.armor+d.magic+d.hp).toBe(11+2);
 });
 it('Cleanse removes negative statuses and keeps Barrier (R002); low mana / silence block',()=>{
  const {f}=gain(1,{},{statuses:[{id:'poison',turns:3,magnitude:3},{id:'barrier',turns:99}]});
  expect(f.allies[0].statuses.map(s=>s.id)).toEqual(['barrier']);
  for(const m of ['low','sil']){const g=setup({...C,allies:[{}]});if(m==='low')g.caster.mana=11;else g.caster.statuses=[{id:'silence',turns:3}];
   expect(g.cast()).toEqual([]);expect(g.allies[0].magic).toBe(11);expect(g.state.actionLog).toHaveLength(0);}
 });
});

// ---------------------------------------------------------------- weapon:1620 / spell 9523
describe('L2B02 weapon:1620 FloweringThorn spell 9523 Cleanse self + 9 random Bleed applications (fixed L2-1620-random-bleed)',()=>{
 const C={spell:9523,cost:16,colors:[BaseColor.Purple,BaseColor.Brown]};
 it('English, native steps, numeric + gw_ binding, prototype and zh display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1620)!,w=weapons.find(v=>v.id===1620)!,n=native.get(9523).raw;
  expect(o).toMatchObject({SpellId:9523,ManaCost:16,ReferenceName:'FloweringThorn'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBrown','ColorPurple']);
  expect(o.stats.spell).toMatchObject({id:9523,desc:'Cleanse myself, and then inflict 9 stacks of Bleed randomly to the Enemy team.'});
  expect(n).toMatchObject({Target:'None',Cost:16});
  const b=(a:number)=>({Target:'AllEnemies',Amount:a,Type:'InflictEffectOnRandomTroops',Data:'bleed'});
  expect(n.SpellSteps).toEqual([{Target:'Self',Type:'Cleanse'},b(2),b(2),b(2),b(2),b(1)]);
  expect(w).toMatchObject({id:1620,referenceName:'FloweringThorn',manaCost:16,manaColors:['Purple','Brown'],spell:{id:9523}});
  expect(w.spell.description).toBe('净化自身，然后随机对敌方队伍造成 9 层流血效果。');
  const s=(k:number)=>({kind:'status',target:'enemyRandomN',statusId:'bleed',turns:3,magnitude:1,n:k});
  const proto={segments:[{kind:'cleanse',target:'allySelf'},s(2),s(2),s(2),s(2),s(1)]};
  expect(registry.prototypes.get('9523')).toEqual(proto);expect(registry.prototypes.get('gw_FloweringThorn')).toEqual(proto);
 });
 const bleeds=(ev:GameEvent[])=>(ev as unknown as Array<{type:string;statusId?:string;status?:{id:string}}>).filter(e=>e.type==='status-apply'&&(e.statusId??e.status?.id)==='bleed').length;
 const stacks=(f:F)=>f.enemies.map(e=>e.statuses.find(s=>s.id==='bleed')?.magnitude??0);
 for(const side of SIDES)for(const alias of ['9523','gw_FloweringThorn'])it(`real cast ${side}/${alias}: 4 living enemies -> 9 Bleed applications, <=4 stacks each, no enemy skipped twice per step`,()=>{
  const seen=new Set<number>();
  for(let s=1;s<=8;s++){const f=setup({...C,spell:alias,side,seed:s});const ev=f.cast();
   const ids=applied(ev,'bleed');expect(bleeds(ev)).toBe(9);expect(ids).toHaveLength(9);
   // step boundaries 2,2,2,2,1: no enemy twice inside one step
   for(const [a,b] of [[0,2],[2,4],[4,6],[6,8]])expect(new Set(ids.slice(a,b)).size).toBe(b-a);
   for(const id of ids)seen.add(id);
   for(const e of f.enemies)expect(ids.filter(x=>x===e.id).length).toBeLessThanOrEqual(5);
   expect(Math.max(...stacks(f))).toBeLessThanOrEqual(4);turnPassed(f);}
  expect([...seen].sort()).toEqual([10,11,12,13]);
 });
 it('fewer enemies: 2 living -> each 2-step hits both (distinct), 4 applications each; lone enemy -> 4 applications, capped at 4 stacks; dead never bleed',()=>{
  const two=setup({...C,enemies:[{},{hp:0,defeated:true},{},{hp:0,defeated:true}]});const i2=applied(two.cast(),'bleed');
  expect(i2).toHaveLength(8);expect(i2.filter(x=>x===10).length+i2.filter(x=>x===12).length).toBe(8);
  expect(Math.min(i2.filter(x=>x===10).length,i2.filter(x=>x===12).length)).toBe(4);
  const one=setup({...C,enemies:[{hp:0,defeated:true},{hp:0,defeated:true},{},{hp:0,defeated:true}]});const e1=one.cast();
  expect(applied(e1,'bleed')).toEqual([12,12,12,12]);
  const mags=(e1 as unknown as Array<{type:string;statusId:string;magnitude?:number}>).filter(e=>e.type==='status-apply'&&e.statusId==='bleed');expect(mags).toHaveLength(4);
 });
 it('Cleanse self removes negative statuses, keeps positive (R002); allies not cleansed; low mana / silence block',()=>{
  const f=setup({...C,allies:[{statuses:[{id:'poison',turns:3,magnitude:3}]}]});f.caster.statuses=[{id:'poison',turns:3,magnitude:3},{id:'barrier',turns:99}];f.cast();
  expect(f.caster.statuses.map(s=>s.id)).toEqual(['barrier']);expect(has(f.allies[0],'poison')).toBe(true);
  for(const m of ['low','sil']){const g=setup(C);if(m==='low')g.caster.mana=15;else g.caster.statuses=[{id:'silence',turns:3}];
   expect(g.cast()).toEqual([]);expect(g.enemies.some(e=>has(e,'bleed'))).toBe(false);expect(g.state.actionLog).toHaveLength(0);}
 });
});

// ---------------------------------------------------------------- troop:7698 / spell 9657
describe('L2B02 troop:7698 Azaleus spell 9657 Choose:ABC-DEF chosen colour -> Enchant Gems + Bless OR Entangle Gems + Curse',()=>{
 const C={spell:9657,cost:16,colors:[BaseColor.Green,BaseColor.Purple],color:BaseColor.Green,
  paint:diag([BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Brown])};
 it('English, native steps, binding, prototype and zh display',()=>{
  const {o,t,n,proto}=troopSource(7698,9657,16,C.colors);
  expect(o.stats.spell.desc).toBe('&& Choose a Mana Color. Convert 10 Gems of that Color to Enchant Gems, and Bless all Allies of that Color. && Choose a Mana Color. Convert 10 Gems of that Color to Entangle Gems, and Curse all Enemies of that Color.');
  expect(n).toMatchObject({Target:'ManaGemsOnly',Cost:16,Randomize:'Choose:ABC-DEF'});
  expect(n.SpellSteps).toEqual([
   {Color1:'FromTarget',Amount:10,Color2:'Enchant',Type:'ConvertGems'},{Target:'FromManaColor',Type:'CauseBlessed'},
   {PercentageChance:0,Type:'None'},
   {Color1:'FromTarget',Amount:10,Color2:'Entangle',Type:'ConvertGems'},{Target:'FromManaColorEnemy',Type:'CauseCursed'}]);
  const g=(k:string)=>({kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL',toSpecial:k,count:{base:10,mult:0}}});
  const st=(target:string,id:string)=>({kind:'status',target,statusId:id,turns:3,ifCond:{kind:'targetColor',color:'CHOSEN'}});
  expect(proto).toEqual({segments:[{kind:'choose',labels:['选定颜色转10颗附魔宝石，祝福该色盟友','选定颜色转10颗缠绕宝石，诅咒该色敌人'],
   options:[[g('enchantedGem'),st('allyAll','blessed')],[g('entangleGem'),st('enemyAll','curse')]]}]});
  expect(t.spell.description).toBe('选择一项：选择一种法力颜色，将 10 颗该色宝石转化为附魔宝石，祝福所有该色盟友；或选择一种法力颜色，将 10 颗该色宝石转化为缠绕宝石，诅咒所有该色敌人。');
 });
 const G=[BaseColor.Green],R=[BaseColor.Red],B=[BaseColor.Blue];
 for(const side of SIDES)it(`real cast ${side} branch 0: 10 Green -> Enchant Gems; Green allies (caster incl.) Blessed; enemies untouched`,()=>{
  const f=setup({...C,side,branch:0,allies:[{colors:R},{colors:[BaseColor.Blue,BaseColor.Green]}],enemies:[{colors:G},{},{},{}]});const ev=f.cast();
  expect(created(ev,'enchantedGem')).toBe(10);expect(created(ev,'entangleGem')).toBe(0);
  expect(applied(ev,'blessed')).toEqual([0,21]);expect(applied(ev,'curse')).toEqual([]);
  expect([f.caster,...f.allies].map(c=>has(c,'blessed'))).toEqual([true,false,true]);expect(f.state.actionLog).toHaveLength(1);
 });
 for(const side of SIDES)it(`real cast ${side} branch 1: 10 Green -> Entangle Gems; Green enemies Cursed; allies untouched`,()=>{
  const f=setup({...C,side,branch:1,allies:[{colors:G}],enemies:[{colors:B},{colors:[BaseColor.Red,BaseColor.Green]},{colors:G},{colors:R}]});const ev=f.cast();
  expect(created(ev,'entangleGem')).toBe(10);expect(created(ev,'enchantedGem')).toBe(0);
  expect(applied(ev,'curse')).toEqual([11,12]);expect(applied(ev,'blessed')).toEqual([]);
 });
 it('chosen colour drives both halves (Blue chosen -> Blue gems/Blue allies); fewer than 10 of the colour -> converts all; dead ally not Blessed',()=>{
  const f=setup({...C,color:BaseColor.Blue,branch:0,colors:[BaseColor.Blue],allies:[{colors:B,hp:0,defeated:true},{colors:G}]});f.caster.manaCost=16;
  const ev=f.cast();expect(created(ev,'enchantedGem')).toBe(10);expect(applied(ev,'blessed')).toEqual([0]);
  const few=setup({...C,branch:1,paint:(r,c)=>r===c&&r<4?BaseColor.Green:diag([BaseColor.Blue,BaseColor.Red,BaseColor.Yellow,BaseColor.Brown])(r,c)});
  expect(created(few.cast(),'entangleGem')).toBe(4);
 });
 it('low mana / silence / cancelled choice block the cast',()=>blocked({...C,allies:[{}]}));
});
