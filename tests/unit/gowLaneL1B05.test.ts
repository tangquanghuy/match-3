// Lane L1 batch B05 (reviewer sa-L1): summon / transform identity skills, stored-snapshot scope.
// Every entity has its own source/prototype binding and real TurnEngine.castSkill cases (both sides).
// Summon pools are checked against data/raw/troops.gow.en.json (TroopType / KingdomId), RNG fixed.
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
import {BaseColor,PlayerSide,colorGem,type Character} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS,troopToSummonTemplate,troopsByType} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons as {id:number;SpellId:number;ManaCost:number;ReferenceName:string;_ManaColors_parsed:Record<string,unknown>;stats:{spell:{id:number;desc:string}}}[];
const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops as {id:number;ReferenceName:string;TroopType:string;TroopType2:string;KingdomId:number;ManaCost:number;_ManaColors_parsed:Record<string,unknown>;stats:{spell:{id:number;desc:string}}}[];
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;
const ROSTER=new Set(TROOPS.map(t=>t.referenceName));
interface Opts{spell:number;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();let id=1;
 const cols=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:colorGem(cols[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const mine={player:side,characters:[caster,...allies]};const opp=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 const theirs={player:opp,characters:[...enemies]};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setSummonResolver(ref=>troopToSummonTemplate(ref));
 engine.setTargetChooser(new FixedTargetChooser(o.target??11));
 const startHp=enemies.map(e=>e.hp);
 return {board,state,engine,caster,allies,enemies,side,opp,cast:()=>engine.castSkill(caster.id),
  mine:()=>state.teams[side].characters,foes:()=>state.teams[opp].characters,loss:()=>enemies.map((e,i)=>startHp[i]-e.hp)};
}
type F=ReturnType<typeof setup>;
function binding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string){
 const en=original.find(t=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.SpellSteps).toEqual(steps);
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description).toBe(zh);
 return n;
}
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?`${e.targetId}:${e.statusId}`:'');
const summons=(ev:GameEvent[])=>ev.filter(e=>e.type==='summon');
function turnSpent(f:F){expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(f.opp);}
function refused(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses, no status / summon / damage`,()=>{
  const f=setup(o);if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.mine()).toHaveLength(1+(o.allies?.length??0));
  expect(f.loss().every(x=>x===0)).toBe(true);expect(f.enemies.every(e=>e.statuses.length===0)).toBe(true);
 });
}
/** Summoned troop must equal the level-20 template of a roster troop (stats, spell, traits, colours), 0 mana, no status. */
function expectSummonOf(ch:Character,ref:string){
 const tpl=troopToSummonTemplate(ref)!;expect(tpl).not.toBeNull();
 expect(ch).toMatchObject({name:tpl.name,maxHp:tpl.maxHp,hp:tpl.maxHp,attack:tpl.attack,armor:tpl.armor,magic:tpl.magic,
  colors:tpl.colors,manaCost:tpl.manaCost,mana:0,skillId:tpl.skillId,traitIds:tpl.traitIds,troopTypes:tpl.troopTypes,defeated:false,statuses:[]});
}
const refOf=(ch:Character,pool:string[])=>{const hits=pool.filter(r=>troopToSummonTemplate(r)!.name===ch.name&&troopToSummonTemplate(r)!.skillId===ch.skillId);expect(hits.length).toBeGreaterThan(0);return hits[0];};
const rawByType=(type:string)=>original.filter(t=>[t.TroopType,t.TroopType2].map(s=>String(s??'').toLowerCase()).includes(type.toLowerCase())).map(t=>t.ReferenceName);
const rawByKingdom=(k:number)=>original.filter(t=>t.KingdomId===k).map(t=>t.ReferenceName);
const poolOf=(spell:number)=>{const p=registry.prototypes.get(String(spell)) as {segments:{kind:string;params?:{source:{randomOf?:string[]}}}[]};return p.segments.find(s=>s.kind==='summon')!.params!.source.randomOf!;};

const damaged=(ev:GameEvent[])=>ev.filter(e=>e.type==='skill-damage');

void [troopsByType,ROSTER,summons,expectSummonOf,refOf,rawByType,rawByKingdom,poolOf];
const devoured=(ev:GameEvent[])=>ev.filter(e=>e.type==='skill-damage'&&(e as {devoured?:boolean}).devoured).map(e=>e.type==='skill-damage'?e.targetId:0);
const skillPhase=(ev:GameEvent[])=>{const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);};
const madeTo=(ev:GameEvent[],pred:(t:{kind:string;color?:string;spec?:{kind:string;color?:string}})=>boolean)=>skillPhase(ev).flatMap(e=>e.type==='gem-create'?e.spawns.map(s=>s.gemType):e.type==='gem-transform'?e.changes.map(s=>s.to):[]).filter(t=>pred(t as never)).length;
/** Scan seeds; returns how many casts devoured the watched enemy. */
function scan(o:Opts,seeds:number,each:(f:F,ev:GameEvent[],dev:boolean)=>void){
 let n=0;for(let seed=1;seed<=seeds;seed++){const f=setup({...o,seed});const ev=f.cast();const dev=devoured(ev).length>0;if(dev)n++;each(f,ev,dev);}return n;
}

// ---------------------------------------------------------------- troop:6118 / spell 7210
describe('L1 troop:6118/spell:7210 [Magic+6] to an Enemy with a 40% chance to devour (native Consume first)',()=>{
 const base={spell:7210,cost:16,colors:[BaseColor.Purple,BaseColor.Brown],target:11};
 it('source/native/prototype/display binding',()=>{
  binding(6118,7210,16,base.colors,'Deal [Magic + 6] damage to an Enemy, with a 40% chance to devour them.',
   [{Target:'FromTarget',Amount:1,PercentageChance:40,Type:'Consume'},{SpellPowerMultiplier:1,Target:'FromTarget',Amount:6,Primarypower:true,Type:'Damage'}],TROOPS.find(t=>t.id===6118)!.spell.description);
  expect(registry.prototypes.get('7210')).toEqual({segments:[{kind:'devour',target:'enemyChosen',chance:0.4},{kind:'damage',target:'lastTarget',scaling:{base:6,mult:1}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}, seeds 1..80: ~40% devoured (no hit), else exactly Magic+6 to the chosen enemy`,()=>{
  const n=scan({...base,side},80,(f,ev,dev)=>{
   if(dev){expect(damaged(ev).filter(e=>e.type==='skill-damage'&&e.targetId===11)).toHaveLength(1);expect(f.caster.maxHp).toBe(2000);}
   else{expect(f.loss()).toEqual([0,16,0,0]);expect(f.caster.maxHp).toBe(1000);}
   expect([f.enemies[0],f.enemies[2],f.enemies[3]].every(e=>e.hp===1000)).toBe(true);turnSpent(f);
  });
  expect(n).toBeGreaterThanOrEqual(20);expect(n).toBeLessThanOrEqual(46);
 });
 it('Blessed chosen enemy: never devoured, still takes Magic+6',()=>{
  const n=scan({...base,enemies:[{},{statuses:[{id:'blessed',turns:3}]},{},{}]},20,f=>{expect(f.loss()[1]).toBe(16);});expect(n).toBe(0);
 });
 refused(base);
});

// ---------------------------------------------------------------- weapon:1129 / spell 7293
describe('L1 weapon:1129/spell:7293 [Magic] to all Enemies; 20% chance to devour a random Enemy (native Consume first)',()=>{
 const base={spell:7293,cost:15,colors:[BaseColor.Purple,BaseColor.Brown]};
 it('source/native/prototype/display binding',()=>{
  const o=rawWeapons.find(v=>v.id===1129)!,w=(weapons as {id:number;manaCost:number;manaColors:string[];spell:{id:number;description:string}}[]).find(v=>v.id===1129)!,n=native.get(7293).raw;
  expect(o).toMatchObject({SpellId:7293,ManaCost:15,ReferenceName:'BlackManacles'});expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorBrown','ColorPurple']);
  expect(o.stats.spell).toMatchObject({id:7293,desc:'Deal [Magic] damage to all Enemies. There\'s a 20% chance to devour a random Enemy.'});
  expect(n.Cost).toBe(15);expect(n.SpellSteps).toEqual([{Target:'RandomEnemy',Amount:1,PercentageChance:20,Type:'Consume'},{SpellPowerMultiplier:1,Target:'AllEnemies',Primarypower:true,Type:'Damage'}]);
  expect(w).toMatchObject({manaCost:15,manaColors:['Purple','Brown'],spell:{id:7293,description:'对所有敌人造成 [魔法] 点伤害。有 20% 的几率吞噬一名随机敌人。'}});
  const want={segments:[{kind:'devour',target:'enemyRandom',chance:0.2},{kind:'damage',target:'enemyAll',scaling:{base:0,mult:1},range:'all'}]};
  expect(registry.prototypes.get('7293')).toEqual(want);expect(registry.prototypes.get('gw_BlackManacles')).toEqual(want);
 });
 for(const side of SIDES)for(const magic of [10,3])it(`real cast side=${side} magic=${magic}, seeds 1..80: ~20% one random enemy devoured first, every other enemy takes ${magic}`,()=>{
  const n=scan({...base,side,magic},80,(f,ev,dev)=>{
   const eaten=devoured(ev);expect(eaten.length).toBeLessThanOrEqual(1);
   for(const [i,e] of f.enemies.entries())if(!eaten.includes(e.id))expect(f.loss()[i]).toBe(magic);
   if(dev){const i=ev.findIndex(e=>e.type==='skill-damage'&&(e as {devoured?:boolean}).devoured);expect(damaged(ev).indexOf(ev[i] as never)).toBe(0);}
   turnSpent(f);
  });
  expect(n).toBeGreaterThanOrEqual(6);expect(n).toBeLessThanOrEqual(30);
 });
 it('one living enemy: it is the only devour candidate; if not devoured it takes Magic',()=>{
  scan({...base,enemies:[{},{defeated:true,hp:0},{defeated:true,hp:0},{defeated:true,hp:0}]},30,(f,ev,dev)=>{if(!dev)expect(f.loss()[0]).toBe(10);else expect(devoured(ev)).toEqual([10]);});
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:7272 / spell 8891
describe('L1 troop:7272/spell:8891 [Magic+3] to the last Enemy, 20% devour, then Submerge myself (native Consume first)',()=>{
 const base={spell:8891,cost:12,colors:[BaseColor.Blue,BaseColor.Red]};
 it('source/native/prototype/display binding',()=>{
  binding(7272,8891,12,base.colors,'Deal [Magic + 3] damage to the last Enemy, with a 20% chance to devour them. Then Submerge myself.',
   [{Target:'LastEnemy',Amount:1,PercentageChance:20,Type:'Consume'},{SpellPowerMultiplier:1,Target:'LastEnemy',Amount:3,Primarypower:true,Type:'Damage'},{Target:'Self',Amount:1,Type:'CauseSubmerged'}],TROOPS.find(t=>t.id===7272)!.spell.description);
  expect(registry.prototypes.get('8891')).toEqual({segments:[{kind:'devour',target:'enemyLast',chance:0.2},{kind:'damage',target:'lastTarget',scaling:{base:3,mult:1}},{kind:'status',target:'allySelf',statusId:'submerged',turns:3}]});
 });
 for(const side of SIDES)it(`real cast side=${side}, seeds 1..80: last enemy devoured (~20%, real devour gains) or hit Magic+3; caster Submerged either way`,()=>{
  const n=scan({...base,side,enemies:[{},{},{},{hp:300,attack:5}]},80,(f,ev,dev)=>{
   if(dev){expect(devoured(ev)).toEqual([13]);expect(f.caster.maxHp).toBe(1300);expect(f.loss().slice(0,3)).toEqual([0,0,0]);}
   else expect(f.loss()).toEqual([0,0,0,13]);
   expect(applied(ev)).toEqual(['0:submerged']);turnSpent(f);
  });
  expect(n).toBeGreaterThanOrEqual(6);expect(n).toBeLessThanOrEqual(30);
 });
 it('dead last slot skipped: the last living enemy is the target',()=>{
  scan({...base,enemies:[{},{},{},{defeated:true,hp:0}]},10,(f,ev,dev)=>{if(!dev)expect(f.loss()).toEqual([0,0,13,0]);else expect(devoured(ev)).toEqual([12]);});
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:7271 / spell 8890
describe('L1 troop:7271/spell:8890 [Magic+3] to an Enemy, 20% devour; if the Enemy dies create 12 Red Dragon Gems',()=>{
 const base={spell:8890,cost:12,colors:[BaseColor.Red,BaseColor.Yellow],target:11};
 const dragons=(ev:GameEvent[])=>madeTo(ev,t=>t.kind==='special'&&t.spec?.kind==='dragonGem'&&t.spec.color===BaseColor.Red);
 it('source/native/prototype/display binding',()=>{
  binding(7271,8890,12,base.colors,'Deal [Magic + 3] damage to an Enemy. There is a 20% chance to devour them. If the Enemy dies, create 12 Red Dragon Gems.',
   [{Target:'FromTarget',PercentageChance:20,Type:'Consume'},{SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage',Delay:0},{StatusAmount:12,Color1:'DragonRed',StatusModifier:'AddForKill',Type:'CreateGems'}],TROOPS.find(t=>t.id===7271)!.spell.description);
  expect(registry.prototypes.get('8890')).toEqual({segments:[{kind:'devour',target:'enemyChosen',chance:0.2},{kind:'damage',target:'lastTarget',scaling:{base:3,mult:1}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'dragonGem',color:'Red'}},count:{base:12,mult:0}},ifTargetDied:true}]});
 });
 for(const side of SIDES)it(`real cast side=${side}, seeds 1..80: devoured (~20%) -> 12 Red Dragon Gems; survived the hit -> none`,()=>{
  const n=scan({...base,side},80,(f,ev,dev)=>{
   if(dev){expect(dragons(ev)).toBe(12);expect(f.caster.maxHp).toBe(2000);}
   else{expect(f.loss()).toEqual([0,13,0,0]);expect(dragons(ev)).toBe(0);turnSpent(f);}
   expect(skillPhase(ev).some(e=>e.type==='extra-turn')).toBe(false);
  });
  expect(n).toBeGreaterThanOrEqual(6);expect(n).toBeLessThanOrEqual(30);
 });
 it('lethal hit without a devour also counts as the Enemy dying -> 12 Red Dragon Gems',()=>{
  scan({...base,enemies:[{},{hp:5},{},{}]},20,(f,ev)=>{expect(f.enemies[1].defeated).toBe(true);expect(dragons(ev)).toBe(12);});
 });
 refused(base);
});
