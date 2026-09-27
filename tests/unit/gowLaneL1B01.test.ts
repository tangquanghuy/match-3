// Lane L1 batch B01 (reviewer sa-L1): summon / transform identity skills, stored-snapshot scope.
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

// ---------------------------------------------------------------- troop:7494 / spell 9239
describe('L1 troop:7494/spell:9239 Curse 2 random Enemies. Summon a random Mystic.',()=>{
 const base={spell:9239,cost:11,colors:[BaseColor.Red,BaseColor.Purple]};
 it('source/native/prototype/display binding',()=>{
  binding(7494,9239,11,base.colors,'Curse 2 random Enemies. Summon a random Mystic.',
   [{Target:'RandomEnemy',Type:'CauseCursed'},{Target:'RandomPrefNotPrevEnemy',Type:'CauseCursed'},{Type:'SummoningType',Data:'mystic'}],
   '诅咒 2 名随机敌人。召唤一名随机秘士。');
  const p=registry.prototypes.get('9239') as {segments:object[]};
  expect(p.segments[0]).toEqual({kind:'status',target:'enemyRandomN',statusId:'curse',turns:3,n:2});
  expect(p.segments).toHaveLength(2);expect(p.segments[1]).toMatchObject({kind:'summon'});
 });
 it('pool = every raw Mystic (TroopType/TroopType2) present in the project roster; only raw-only Cultist 7888 is absent',()=>{
  const pool=poolOf(9239);const raw=rawByType('Mystic');
  expect(new Set(pool).size).toBe(pool.length);
  expect([...pool].sort()).toEqual(raw.filter(r=>ROSTER.has(r)).sort());
  expect(raw.filter(r=>!pool.includes(r))).toEqual(['Cultist']);expect(ROSTER.has('Cultist')).toBe(false);
  expect([...pool].sort()).toEqual(troopsByType('Mystic').map(t=>t.referenceName).sort());
  expect(pool).toHaveLength(228);
 });
 for(const side of SIDES)it(`real cast side=${side}: 2 distinct enemies Cursed, one Mystic appended at the back with template stats`,()=>{
  const f=setup({...base,side});const ev=f.cast();
  const cursed=applied(ev);expect(cursed).toHaveLength(2);expect(new Set(cursed).size).toBe(2);
  expect(cursed.every(s=>/^1[0-3]:curse$/.test(s))).toBe(true);
  expect(f.enemies.filter(e=>e.statuses.some(s=>s.id==='curse'))).toHaveLength(2);
  expect(summons(ev)).toHaveLength(1);expect(summons(ev)[0]).toMatchObject({player:side,destination:'field',slot:1});
  const s=f.mine()[1];expect(s.troopTypes).toContain('Mystic');expectSummonOf(s,refOf(s,poolOf(9239)));
  expect(f.loss()).toEqual([0,0,0,0]);expect(f.caster.mana).toBe(0);turnSpent(f);
 });
 it('native Curse precedes the summon (status-apply events before summon event)',()=>{
  const ev=setup(base).cast();const i=ev.findIndex(e=>e.type==='summon');
  expect(ev.slice(0,i).filter(e=>e.type==='status-apply')).toHaveLength(2);
 });
 it('fixed seeds: 24 casts give >=8 distinct Mystics, all from the pool and all Mystic-typed',()=>{
  const seen=new Set<string>();
  for(let seed=1;seed<=24;seed++){const f=setup({...base,seed});f.cast();const s=f.mine()[1];expect(s.troopTypes).toContain('Mystic');seen.add(refOf(s,poolOf(9239)));}
  expect(seen.size).toBeGreaterThanOrEqual(8);
 });
 it('one living enemy: RandomEnemy + RandomPrefNotPrevEnemy both land on it; one Curse (equivalent to Cursing twice)',()=>{
  const f=setup({...base,enemies:[{},{defeated:true,hp:0},{defeated:true,hp:0}]});const ev=f.cast();
  expect(new Set(applied(ev))).toEqual(new Set(['10:curse']));
  expect(f.enemies[0].statuses.filter(s=>s.id==='curse')).toHaveLength(1);
 });
 it('full team (4 active): summon is a no-op, Curse still resolves',()=>{
  const f=setup({...base,allies:[{},{},{}]});const ev=f.cast();
  expect(summons(ev)).toEqual([]);expect(f.mine().map(c=>c.id)).toEqual([0,1,2,3]);expect(applied(ev)).toHaveLength(2);
 });
 it('three active: summon fills the fourth slot',()=>{
  const f=setup({...base,allies:[{},{}]});const ev=f.cast();expect(summons(ev)[0]).toMatchObject({slot:3});expect(f.mine()).toHaveLength(4);
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:7260 / spell 8894
describe('L1 troop:7260/spell:8894 Curse+Deathmark an Enemy, [(Magic x1.5)+3] to Enemies below, summon Abhorath',()=>{
 const base={spell:8894,cost:22,colors:[BaseColor.Green,BaseColor.Red,BaseColor.Purple]};
 it('source/native/prototype/display binding (native Target Enemy, FromTarget)',()=>{
  const n=binding(7260,8894,22,base.colors,'Curse and Deathmark an Enemy. Then deal [(Magic x 1.5) + 3] damage to all Enemies below them. Then summon Abhorath.',
   [{Target:'FromTarget',Amount:1,Type:'CauseCursed'},{Target:'FromTarget',Amount:1,Type:'CauseDeathMark'},{SpellPowerMultiplier:1.5,Target:'BelowTarget',Amount:3,Primarypower:true,Type:'Damage'},{Amount:6067,Type:'Summoning'}],
   '使一名敌人陷入诅咒和死亡标记状态。再对其下位所有敌人造成 [(魔法 x 1.5) + 3] 点伤害。再召唤阿伯拉瑟。');
  expect(n.Target).toBe('Enemy');expect(original.find(t=>t.id===6067)!.ReferenceName).toBe('Abhorath');
  expect(registry.prototypes.get('8894')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'curse',turns:3},{kind:'status',target:'enemyChosen',statusId:'death-mark',turns:3},
   {kind:'damage',target:'enemyBelowTarget',scaling:{base:3,mult:1.5},range:'all'},{kind:'summon',params:{source:{ref:'Abhorath'}}}]});
 });
 for(const side of SIDES)for(const magic of [10,7])it(`real cast side=${side} magic=${magic}: chosen enemy 11 Cursed+Deathmarked, 12/13 take ${Math.round(magic*1.5)+3}, Abhorath summoned`,()=>{
  const f=setup({...base,side,magic,target:11});const ev=f.cast();
  expect(applied(ev)).toEqual(['11:curse','11:death-mark']);
  const d=Math.round(magic*1.5)+3;expect(f.loss()).toEqual([0,0,d,d]);
  expect(f.allies).toEqual([]);expect(f.caster.statuses).toEqual([]);
  expect(summons(ev)).toHaveLength(1);expectSummonOf(f.mine()[1],'Abhorath');turnSpent(f);
 });
 it('chosen enemy last (13): nobody below, no damage; Curse/Deathmark + summon still resolve',()=>{
  const f=setup({...base,target:13});const ev=f.cast();expect(applied(ev)).toEqual(['13:curse','13:death-mark']);expect(f.loss()).toEqual([0,0,0,0]);expectSummonOf(f.mine()[1],'Abhorath');
 });
 it('chosen enemy first (10): 11-13 all below take damage, chosen takes none',()=>{
  const f=setup({...base,target:10});f.cast();expect(f.loss()).toEqual([0,18,18,18]);
 });
 it('full team: Abhorath not summoned',()=>{const f=setup({...base,allies:[{},{},{}]});expect(summons(f.cast())).toEqual([]);expect(f.mine()).toHaveLength(4);});
 refused(base);
});

// ---------------------------------------------------------------- troop:6453 / spell 7631
describe('L1 troop:6453/spell:7631 Deathmark+Hunter\'s Mark first 2, [Magic+4] to them, transform into Nosferatu',()=>{
 const base={spell:7631,cost:16,colors:[BaseColor.Red,BaseColor.Purple]};
 it('source/native/prototype/display binding (native: marks before damage, Transform Self 6451)',()=>{
  binding(6453,7631,16,base.colors,'Deal [Magic + 4] damage to the first 2 enemies. Place Hunter\'s Mark and Death Mark on them. Then transform into a Nosferatu.',
   [{Target:'FirstTwoEnemies',Type:'CauseDeathMark'},{Target:'FirstTwoEnemies',Type:'CauseHuntersMark'},{SpellPowerMultiplier:1,Target:'FirstTwoEnemies',Amount:4,Primarypower:true,Type:'Damage'},{Target:'Self',Type:'Transform',Data:'6451'}],
   '对前两名敌人造成 [魔法 + 4] 点伤害。使他们陷入猎人标记和死亡标记状态。再转化成诺斯费拉图。');
  expect(original.find(t=>t.id===6451)!.ReferenceName).toBe('Nosferatu');
  expect(registry.prototypes.get('7631')).toEqual({segments:[
   {kind:'status',target:'enemyFirstN',statusId:'death-mark',turns:3,n:2},{kind:'status',target:'enemyFirstN',statusId:'marked',turns:3,n:2},
   {kind:'damage',target:'enemyFirstN',scaling:{base:4,mult:1},n:2},{kind:'transformTroop',target:'allySelf',ref:'Nosferatu'}]});
 });
 for(const side of SIDES)for(const magic of [10,3])it(`real cast side=${side} magic=${magic}: 10/11 marked then hit ${magic+4}; caster becomes Nosferatu in place`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual(['10:death-mark','11:death-mark','10:marked','11:marked']);
  expect(f.loss()).toEqual([magic+4,magic+4,0,0]);
  const tpl=troopToSummonTemplate('Nosferatu')!;
  expect(f.mine()[0]).toBe(f.caster);expect(f.caster.id).toBe(0);
  expect(f.caster).toMatchObject({name:tpl.name,maxHp:tpl.maxHp,hp:tpl.maxHp,attack:tpl.attack,armor:tpl.armor,magic:tpl.magic,colors:tpl.colors,manaCost:tpl.manaCost,mana:0,skillId:tpl.skillId,traitIds:tpl.traitIds});
  expect(ev.filter(e=>e.type==='troop-transform')).toEqual([expect.objectContaining({targetId:0,name:tpl.name})]);
  expect(summons(ev)).toEqual([]);turnSpent(f);
 });
 it('native order observable: the hit kills enemy 10 -> marks were already on 10/11, enemy 12 stays unmarked',()=>{
  const f=setup({...base,enemies:[{hp:5},{},{},{}]});const ev=f.cast();
  expect(applied(ev)).toEqual(['10:death-mark','11:death-mark','10:marked','11:marked']);
  expect(f.enemies[2].statuses).toEqual([]);expect(f.enemies[0].defeated).toBe(true);
 });
 it('one living enemy: only it is marked and hit; transform still happens',()=>{
  const f=setup({...base,enemies:[{},{defeated:true,hp:0},{defeated:true,hp:0},{defeated:true,hp:0}]});const ev=f.cast();
  expect(applied(ev)).toEqual(['10:death-mark','10:marked']);expect(f.loss()[0]).toBe(14);expect(f.caster.name).toBe(troopToSummonTemplate('Nosferatu')!.name);
 });
 it('caster not first: transform keeps its slot (index 1)',()=>{
  const f=setup(base);const front=damageCharacter(5,{mana:0});f.state.teams[f.side].characters.unshift(front);f.cast();
  expect(f.mine().map(c=>c.id)).toEqual([5,0]);expect(front.name).toBe('C5');expect(f.caster.skillId).toBe(troopToSummonTemplate('Nosferatu')!.skillId);
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:6892 / spell 8318
describe('L1 troop:6892/spell:8318 Disease a random Enemy. Summon a Fell Roost Troop.',()=>{
 const base={spell:8318,cost:11,colors:[BaseColor.Red,BaseColor.Yellow]};
 it('source/native/prototype/display binding; pool = raw KingdomId 3061 (all 5, all in roster)',()=>{
  binding(6892,8318,11,base.colors,'Disease a random Enemy. Summon a Fell Roost Troop.',
   [{Target:'RandomEnemy',Amount:1,Type:'CauseDisease'},{Type:'SummoningKingdomNoError',Data:'3061'}],'使一名随机敌人陷入疾病状态。召唤一名随机恶龙巢军队。');
  expect(registry.prototypes.get('8318')).toEqual({segments:[{kind:'status',target:'enemyRandom',statusId:'disease',turns:3},
   {kind:'summon',params:{source:{randomOf:['FellHydra','Nocturnia','FellDragon','FellDragonEgg','UndeadDrake']}}}]});
  const raw=rawByKingdom(3061);expect([...poolOf(8318)].sort()).toEqual([...raw].sort());expect(raw.every(r=>ROSTER.has(r))).toBe(true);
 });
 for(const side of SIDES)it(`real cast side=${side}: exactly one enemy Diseased, one Fell Roost troop summoned`,()=>{
  const f=setup({...base,side});const ev=f.cast();
  const d=applied(ev);expect(d).toHaveLength(1);expect(d[0]).toMatch(/^1[0-3]:disease$/);
  const s=f.mine()[1];expectSummonOf(s,refOf(s,poolOf(8318)));expect(f.loss()).toEqual([0,0,0,0]);turnSpent(f);
 });
 it('fixed seeds: all 5 Fell Roost troops are reachable and nothing else is summoned',()=>{
  const seen=new Set<string>();for(let seed=1;seed<=40;seed++){const f=setup({...base,seed});f.cast();seen.add(refOf(f.mine()[1],poolOf(8318)));}
  expect([...seen].sort()).toEqual([...poolOf(8318)].sort());
 });
 it('SummoningKingdomNoError on a full team: no summon, no error, Disease still lands',()=>{
  const f=setup({...base,allies:[{},{},{}]});const ev=f.cast();expect(summons(ev)).toEqual([]);expect(applied(ev)).toHaveLength(1);turnSpent(f);
 });
 it('one living enemy: that enemy is Diseased',()=>{
  const f=setup({...base,enemies:[{defeated:true,hp:0},{defeated:true,hp:0},{},{defeated:true,hp:0}]});expect(applied(f.cast())).toEqual(['12:disease']);
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:6474 / spell 7652
describe('L1 troop:6474/spell:7652 Freeze+Mana Burn first 2, knock them to last, summon Queen Mab',()=>{
 const base={spell:7652,cost:20,colors:[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple]};
 it('source/native/prototype/display binding (native SecondEnemy back, then FrontEnemy back)',()=>{
  binding(6474,7652,20,base.colors,'Freeze and Mana Burn the first 2 Enemies. Knock them to last position. Summon Queen Mab.',
   [{Target:'FirstTwoEnemies',Amount:1,Type:'CauseFrozen'},{SpellPowerMultiplier:1,Target:'FirstTwoEnemies',Primarypower:true,Type:'ManaBurn'},{Target:'SecondEnemy',Type:'TroopOrderBack'},{Amount:800,Type:'Delay'},{Target:'FrontEnemy',Type:'TroopOrderBack'},{Amount:6191,Type:'SummoningNoError'}],
   '冻结前两名敌人，并对其施放法力灼烧，伤害值因自身魔力值而增强。再把这两名敌人推到后方。召唤梅冰女王。');
  expect(original.find(t=>t.id===6191)!.ReferenceName).toBe('QueenMab');
  expect(registry.prototypes.get('7652')).toEqual({segments:[
   {kind:'status',target:'enemyFirstN',statusId:'frozen',turns:3,n:2},{kind:'damage',target:'enemyFirstN',scaling:{base:0,mult:1},manaBurn:true,n:2},
   {kind:'reposition',target:'lastTargets',to:'back'},
   {kind:'summon',params:{source:{ref:'QueenMab',troopId:6191}}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}: 10/11 Frozen, Mana Burn = Magic + own mana (no drain), order -> [12,13,11,10], Queen Mab summoned`,()=>{
  const f=setup({...base,side,enemies:[{mana:5},{mana:0},{mana:9},{}]});const ev=f.cast();
  expect(applied(ev)).toEqual(['10:frozen','11:frozen']);
  expect(f.loss()).toEqual([15,10,0,0]);expect(f.enemies.map(e=>e.mana)).toEqual([5,0,9,0]);
  expect(f.foes().map(c=>c.id)).toEqual([12,13,11,10]);
  expect(ev.filter(e=>e.type==='troop-reposition').map(e=>e.type==='troop-reposition'?e.targetId:0)).toEqual([11,10]);
  expect(summons(ev)).toEqual([expect.objectContaining({troopId:6191,player:side})]);expectSummonOf(f.mine()[1],'QueenMab');turnSpent(f);
 });
 it('Mana Burn kills the front enemy: only the surviving original second (11) goes back, untouched 12/13 never move (as gowManaBurnTowerAudit)',()=>{
  const f=setup({...base,enemies:[{hp:5},{},{},{}]});const ev=f.cast();
  expect(f.enemies[0].defeated).toBe(true);expect(f.foes().filter(c=>!c.defeated).map(c=>c.id)).toEqual([12,13,11]);
  expect(ev.filter(e=>e.type==='troop-reposition').map(e=>e.type==='troop-reposition'?e.targetId:0)).toEqual([11]);
 });
 it('Blessed front enemy (official: immune to status effects and Mana Burn): neither Frozen nor burned, still knocked back',()=>{
  const f=setup({...base,enemies:[{statuses:[{id:'blessed',turns:3}],mana:5},{},{},{}]});const ev=f.cast();
  expect(f.loss()).toEqual([0,10,0,0]);expect(applied(ev)).toEqual(['11:frozen']);expect(f.foes().map(c=>c.id)).toEqual([12,13,11,10]);
 });
 it('two living enemies: second->back (no-op) then front->back gives [11,10]',()=>{
  const f=setup({...base,enemies:[{},{}]});f.cast();expect(f.foes().map(c=>c.id)).toEqual([11,10]);
 });
 it('one living enemy: no SecondEnemy, front stays; SummoningNoError on full team is silent',()=>{
  const f=setup({...base,enemies:[{}],allies:[{},{},{}]});const ev=f.cast();expect(f.foes().map(c=>c.id)).toEqual([10]);expect(summons(ev)).toEqual([]);expect(f.loss()).toEqual([10]);
 });
 refused(base);
});
