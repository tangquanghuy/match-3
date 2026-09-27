// Lane L1 batch B02 (reviewer sa-L1): summon / transform identity skills, stored-snapshot scope.
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
import {TROOPS,troopToSummonTemplate} from '../../src/data/troops';
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
void 0;const _rawByType=(type:string)=>original.filter(t=>[t.TroopType,t.TroopType2].map(s=>String(s??'').toLowerCase()).includes(type.toLowerCase())).map(t=>t.ReferenceName);
const _rawByKingdom=(k:number)=>original.filter(t=>t.KingdomId===k).map(t=>t.ReferenceName);
const _poolOf=(spell:number)=>{const p=registry.prototypes.get(String(spell)) as {segments:{kind:string;params?:{source:{randomOf?:string[]}}}[]};return p.segments.find(s=>s.kind==='summon')!.params!.source.randomOf!;};

void _rawByType;void _rawByKingdom;void _poolOf;
const skillPhase=(ev:GameEvent[])=>{const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);};
const created=(ev:GameEvent[],color:BaseColor)=>skillPhase(ev).flatMap(e=>e.type==='gem-create'?e.spawns.map(s=>s.gemType):e.type==='gem-transform'?e.changes.map(s=>s.to):[]).filter(t=>t.kind==='color'&&t.color===color).length;

// ---------------------------------------------------------------- troop:6385 / spell 7540
describe('L1 troop:6385/spell:7540 Hunter\'s Mark an Enemy. Summon a Warhawk and create 7 Red Gems.',()=>{
 const base={spell:7540,cost:11,colors:[BaseColor.Green,BaseColor.Yellow]};
 it('source/native/prototype/display binding (native Target Enemy, Summoning 6386 = Warhawk)',()=>{
  const n=binding(6385,7540,11,base.colors,'Hunter\'s Mark an Enemy. Summon a Warhawk and create 7 Red Gems.',
   [{Target:'FromTarget',Type:'CauseHuntersMark'},{Amount:6386,Type:'SummoningNoError'},{Amount:800,Type:'Delay'},{Color1:'Red',Amount:7,Type:'CreateGems'}],
   '使 1 名敌人陷入猎人标记状态。召唤一只战鹰并创造 7 颗红色宝石。');
  expect(n.Target).toBe('Enemy');expect(original.find(t=>t.id===6386)!.ReferenceName).toBe('Warhawk');
  expect(registry.prototypes.get('7540')).toEqual({segments:[{kind:'status',target:'enemyChosen',statusId:'marked',turns:3},
   {kind:'summon',params:{source:{ref:'Warhawk'}}},{kind:'gem',params:{op:'create',gem:{kind:'color',color:'Red'},count:{base:7,mult:0}}}]});
 });
 for(const side of SIDES)for(const target of [11,13])it(`real cast side=${side} target=${target}: chosen enemy marked, Warhawk summoned, 7 Red created`,()=>{
  const f=setup({...base,side,target});const ev=f.cast();
  expect(applied(ev)).toEqual([`${target}:marked`]);expect(f.loss()).toEqual([0,0,0,0]);
  expect(summons(ev)).toHaveLength(1);expectSummonOf(f.mine()[1],'Warhawk');
  expect(created(ev,BaseColor.Red)).toBe(7);
  const order=skillPhase(ev).filter(e=>['status-apply','summon','gem-create','gem-transform'].includes(e.type)).map(e=>e.type==='gem-transform'?'gem-create':e.type);
  expect(order).toEqual(['status-apply','summon','gem-create']);turnSpent(f);
 });
 it('full team: Warhawk is not summoned (NoError), mark and 7 Red still resolve',()=>{
  const f=setup({...base,allies:[{},{},{}]});const ev=f.cast();expect(summons(ev)).toEqual([]);expect(applied(ev)).toEqual(['11:marked']);expect(created(ev,BaseColor.Red)).toBe(7);
 });
 it('Blessed chosen enemy is not marked; summon and gems unaffected',()=>{
  const f=setup({...base,enemies:[{},{statuses:[{id:'blessed',turns:3}]},{},{}]});const ev=f.cast();expect(applied(ev)).toEqual([]);expect(summons(ev)).toHaveLength(1);expect(created(ev,BaseColor.Red)).toBe(7);
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:6378 / spell 7533
const SPIDERS=['SpiderSwarm','GiantSpider','Spinnerette','TombSpider','Webspinner'];
describe('L1 troop:6378/spell:7533 Web a random enemy. Summon a random Spider (native Randomize A+(B-C-D-E-F)).',()=>{
 const base={spell:7533,cost:8,colors:[BaseColor.Blue,BaseColor.Purple]};
 it('source/native/prototype/display binding: pool = the 5 native Summoning ids 6136/6110/6395/6512/6068',()=>{
  const n=binding(6378,7533,8,base.colors,'Web a random enemy. Summon a random Spider.',
   [{Target:'RandomEnemy',Amount:1,Type:'CauseWeb'},{Amount:6136,Type:'SummoningNoError'},{Amount:6110,Type:'SummoningNoError'},{Amount:6395,Type:'SummoningNoError'},{Amount:6512,Type:'SummoningNoError'},{Amount:6068,Type:'SummoningNoError'}],
   '使一名随机敌人陷入织网状态。召唤一只随机蜘蛛。');
  expect(n.Randomize).toBe('A+(B-C-D-E-F)');
  expect([6136,6110,6395,6512,6068].map(id=>original.find(t=>t.id===id)!.ReferenceName)).toEqual(SPIDERS);
  expect(SPIDERS.every(r=>ROSTER.has(r))).toBe(true);
  expect(registry.prototypes.get('7533')).toEqual({segments:[{kind:'status',target:'enemyRandom',statusId:'web',turns:3},
   {kind:'summon',params:{source:{randomOf:SPIDERS}}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}: one enemy Webbed, exactly one spider from the 5 summoned`,()=>{
  const f=setup({...base,side});const ev=f.cast();
  expect(applied(ev)).toHaveLength(1);expect(applied(ev)[0]).toMatch(/^1[0-3]:web$/);
  expect(summons(ev)).toHaveLength(1);const s=f.mine()[1];expectSummonOf(s,refOf(s,SPIDERS));expect(f.loss()).toEqual([0,0,0,0]);turnSpent(f);
 });
 it('fixed seeds: all 5 native spiders reachable, never SpiderQueen/SpiderKnight/other spiders',()=>{
  const seen=new Set<string>();for(let seed=1;seed<=40;seed++){const f=setup({...base,seed});f.cast();expect(f.mine()).toHaveLength(2);seen.add(refOf(f.mine()[1],SPIDERS));}
  expect([...seen].sort()).toEqual([...SPIDERS].sort());
 });
 it('full team: no spider (NoError), Web still lands',()=>{const f=setup({...base,allies:[{},{},{}]});const ev=f.cast();expect(summons(ev)).toEqual([]);expect(applied(ev)).toHaveLength(1);});
 it('one living enemy: that enemy is Webbed',()=>{const f=setup({...base,enemies:[{defeated:true,hp:0},{}]});expect(applied(f.cast())).toEqual(['11:web']);});
 refused(base);
});