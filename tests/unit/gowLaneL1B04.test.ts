// Lane L1 batch B04 (reviewer sa-L1): summon / transform identity skills, stored-snapshot scope.
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

// ---------------------------------------------------------------- weapon:1351 / spell 8357
const EYES=['OcularenLeech','Ocularen','BurningOcularen','GloomOcularen','Xerodar','WatchMother'];
describe('L1 weapon:1351/spell:8357 Cleanse and give [Magic+1] Life to all Allies. Summon an All-Seeing Eye Troop.',()=>{
 const base={spell:8357,cost:14,colors:[BaseColor.Red,BaseColor.Purple]};
 it('source/native/prototype/display binding; pool = raw KingdomId 3039 (6 troops, all in roster)',()=>{
  const o=rawWeapons.find(v=>v.id===1351)!,w=(weapons as {id:number;manaCost:number;manaColors:string[];spell:{id:number;description:string}}[]).find(v=>v.id===1351)!,n=native.get(8357).raw;
  expect(o).toMatchObject({SpellId:8357,ManaCost:14,ReferenceName:'ChaliceOfEyes'});
  expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(['ColorPurple','ColorRed']);
  expect(o.stats.spell).toMatchObject({id:8357,desc:'Cleanse and give [Magic + 1] Life to all Allies. Summon an All-Seeing Eye Troop.'});
  expect(n.Cost).toBe(14);
  expect(n.SpellSteps).toEqual([{Target:'AllAllies',Amount:1,Type:'Cleanse'},{SpellPowerMultiplier:1,Target:'AllAllies',Amount:1,Primarypower:true,Type:'IncreaseHealth'},{Type:'SummoningKingdomNoError',Data:'3039'}]);
  expect(w).toMatchObject({manaCost:14,manaColors:['Red','Purple'],spell:{id:8357,description:'净化所有盟友，并给予所有盟友 [魔法 + 1] 点生命值。召唤一名全视之眼军队。'}});
  expect([...rawByKingdom(3039)].sort()).toEqual([...EYES].sort());expect(EYES.every(r=>ROSTER.has(r))).toBe(true);
  const want={segments:[{kind:'cleanse',target:'allyAll'},{kind:'buff',target:'allyAll',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'},{kind:'summon',params:{source:{randomOf:EYES}}}]};
  expect(registry.prototypes.get('8357')).toEqual(want);expect(registry.prototypes.get('gw_ChaliceOfEyes')).toEqual(want);
 });
 for(const side of SIDES)for(const magic of [10,4])it(`real cast side=${side} magic=${magic}: negatives cleansed (Barrier kept), allies +${magic+1} Life, one Eye summoned after`,()=>{
  const f=setup({...base,side,magic,allies:[{statuses:[{id:'poison',turns:3},{id:'barrier',turns:3}]},{statuses:[{id:'burning',turns:3},{id:'frozen',turns:3}]}]});
  f.caster.statuses=[{id:'curse',turns:3}];const ev=f.cast();
  expect(f.allies[0].statuses.map(s=>s.id)).toEqual(['barrier']);expect(f.allies[1].statuses).toEqual([]);
  for(const a of [f.caster,...f.allies])expect(a.maxHp).toBe(1000+magic+1);
  expect(summons(ev)).toHaveLength(1);const s=f.mine()[3];expect(s.maxHp).toBe(s.hp);expectSummonOf(s,refOf(s,EYES));
  expect(f.loss()).toEqual([0,0,0,0]);turnSpent(f);
 });
 it('fixed seeds: all 6 kingdom-3039 troops are reachable, including Xerodar and WatchMother',()=>{
  const seen=new Set<string>();for(let seed=1;seed<=60;seed++){const f=setup({...base,seed});f.cast();seen.add(refOf(f.mine()[1],EYES));}
  expect([...seen].sort()).toEqual([...EYES].sort());
 });
 it('summoned troop arrives after the heal: it keeps template Life (not +Magic+1)',()=>{
  const f=setup(base);f.cast();const s=f.mine()[1];expect(s.hp).toBe(troopToSummonTemplate(refOf(s,EYES))!.maxHp);
 });
 it('full team: no summon (NoError), cleanse + heal still resolve',()=>{
  const f=setup({...base,allies:[{statuses:[{id:'stun',turns:3}]},{},{}]});const ev=f.cast();expect(summons(ev)).toEqual([]);expect(f.allies[0].statuses).toEqual([]);expect(f.allies[2].maxHp).toBe(1011);
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:6469 / spell 7647
describe('L1 troop:6469/spell:7647 [Magic+3] + Web an enemy, 20% chance to devour (native: Consume -> Web -> Damage)',()=>{
 const base={spell:7647,cost:11,colors:[BaseColor.Green,BaseColor.Purple]};
 it('source/native/prototype/display binding',()=>{
  binding(6469,7647,11,base.colors,'Deal [Magic + 3] damage to an enemy, and Web them, with a 20% chance to devour them.',
   [{Target:'FromTarget',PercentageChance:20,Type:'Consume'},{Target:'FromTarget',Type:'CauseWeb'},{SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage'}],
   TROOPS.find(t=>t.id===6469)!.spell.description);
  expect(native.get(7647).raw.Target).toBe('Enemy');
  expect(registry.prototypes.get('7647')).toEqual({segments:[{kind:'devour',target:'enemyChosen',chance:0.2},
   {kind:'status',target:'lastTarget',statusId:'web',turns:3},{kind:'damage',target:'lastTarget',scaling:{base:3,mult:1}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}, seeds 1..60: devoured => killed, caster gains Attack/Armor/Life, no Web/hit; else Webbed then hit Magic+3`,()=>{
  let dev=0;
  for(let seed=1;seed<=60;seed++){
   const f=setup({...base,side,seed,target:11,enemies:[{},{hp:300,armor:6,attack:9},{},{}]});const a0=f.caster.attack,r0=f.caster.armor,h0=f.caster.maxHp;const ev=f.cast();
   if(f.enemies[1].defeated){dev++;
    expect(applied(ev)).toEqual([]);expect(damaged(ev).filter(e=>e.type==='skill-damage'&&e.targetId===11)).toHaveLength(1);
    expect([f.caster.attack-a0,f.caster.armor-r0,f.caster.maxHp-h0]).toEqual([9,6,300]);
   }else{
    expect(applied(ev)).toEqual(['11:web']);expect(f.loss()).toEqual([0,7,0,0]);expect(f.enemies[1].armor).toBe(0);expect([f.caster.attack,f.caster.armor]).toEqual([a0,r0]);
    const i=ev.findIndex(e=>e.type==='status-apply'),j=ev.findIndex(e=>e.type==='skill-damage');expect(i).toBeLessThan(j);
   }
   expect([f.enemies[0],f.enemies[2],f.enemies[3]].every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);turnSpent(f);
  }
  expect(dev).toBeGreaterThanOrEqual(4);expect(dev).toBeLessThanOrEqual(24);
 });
 it('Blessed enemy: immune to Devour and Web (official), still takes the hit',()=>{
  for(let seed=1;seed<=20;seed++){const f=setup({...base,seed,enemies:[{},{statuses:[{id:'blessed',turns:3}]},{},{}]});const ev=f.cast();expect(f.enemies[1].defeated).toBe(false);expect(applied(ev)).toEqual([]);expect(f.loss()[1]).toBe(13);}
 });
 refused(base);
});

// ---------------------------------------------------------------- troop:6700 / spell 8056
describe('L1 troop:6700/spell:8056 Devour an Ally, summon a Daemon if devoured, [Magic+16] true scatter boosted by Life [3:1]=34%',()=>{
 const base={spell:8056,cost:24,colors:[BaseColor.Blue,BaseColor.Green,BaseColor.Brown]};
 const daemons=()=>poolOf(8056);
 it('source/native/prototype/display binding; Daemon pool = raw Daemon roster minus 3 raw-only troops',()=>{
  binding(6700,8056,24,base.colors,'Devour an Ally, then summon a Daemon if the Ally is devoured. Deal [Magic + 16] true scatter damage, boosted by my Life. [3:1]',
   [{Target:'FromTarget',Type:'Consume',Delay:1,ResetTargets:true},{Target:'Self',Amount:34,Type:'CountLife',Delay:1,ResetTargets:true},{SpellPowerMultiplier:1,Target:'AllEnemies',UseCounterForAmount:true,Amount:16,Primarypower:true,Type:'TrueScatterDamage',Delay:1},{StatusAmount:100,StatusModifier:'AddForAllyDeath',Type:'SummoningTypeConditional',Data:'daemon'}],
   TROOPS.find(t=>t.id===6700)!.spell.description);
  expect(native.get(8056).raw.Target).toBe('Ally');
  const p=registry.prototypes.get('8056') as unknown as {segments:Record<string,unknown>[]};
  expect(p.segments[0]).toEqual({kind:'devour',target:'allyChosen',chance:1});
  expect(p.segments[1]).toMatchObject({kind:'summon',ifTargetDied:true});
  expect(p.segments[2]).toEqual({kind:'damage',target:'enemyAll',scaling:{base:16,mult:1},range:'scatter',trueDamage:true,modifier:{mod:{kind:'ratio',a:3,b:1},source:{kind:'selfStat',stat:'hp'}}});
  const raw=rawByType('Daemon');expect([...daemons()].sort()).toEqual(raw.filter(r=>ROSTER.has(r)).sort());
  expect(raw.filter(r=>!ROSTER.has(r)).sort()).toEqual(['HellTroll','HellfireBallista','RubyImp']);
  expect([...daemons()].sort()).toEqual(troopsByType('Daemon').map(t=>t.referenceName).sort());
 });
 for(const side of SIDES)for(const magic of [10,0])it(`real cast side=${side} magic=${magic}: ally 1 devoured (+Atk/Armor/Life), Daemon summoned, scatter total = ${magic}+16+floor(Life*34/100)`,()=>{
  const f=setup({...base,side,magic,target:1,allies:[{hp:200,maxHp:200,armor:5,attack:7}],enemies:[{armor:9},{armor:9},{armor:9},{armor:9}]});
  const ev=f.cast();expect(f.allies[0].defeated).toBe(true);expect(summons(ev)).toHaveLength(1);
  expect(f.caster).toMatchObject({attack:24,armor:5,hp:1200});
  const s=f.mine().find(c=>c.id!==0)!;expect(s.troopTypes).toContain('Daemon');expectSummonOf(s,refOf(s,daemons()));
  const total=magic+16+Math.floor(1200*34/100);
  expect(f.loss().reduce((a,b)=>a+b,0)).toBe(total);expect(f.enemies.every(e=>e.armor===9)).toBe(true);
  turnSpent(f);
 });
 it('R003: Life 1000 without a devour -> floor(1000*0.34)=340 (not floor(1000/3)=333); no ally died -> no Daemon',()=>{
  const f=setup({...base,target:1,allies:[{statuses:[{id:'blessed',turns:3}]}]});const ev=f.cast();
  expect(f.allies[0].defeated).toBe(false);expect(summons(ev)).toEqual([]);expect(f.loss().reduce((a,b)=>a+b,0)).toBe(10+16+340);
 });
 it('R001 equivalence: native summons after the scatter; runtime summons before. The Daemon is not an enemy and does not change caster Life, so totals match native',()=>{
  const a=setup({...base,target:1,allies:[{hp:200,maxHp:200}]});a.cast();
  const b=setup({...base,target:1,allies:[{hp:200,maxHp:200}],seed:42});b.cast();
  expect(a.loss().reduce((x,y)=>x+y,0)).toBe(10+16+Math.floor(1200*34/100));expect(b.caster.hp).toBe(1200);
 });
 it('Barrier on the ally blocks the devour: ally survives, Barrier consumed, no Daemon',()=>{
  const f=setup({...base,target:1,allies:[{statuses:[{id:'barrier',turns:3}]}]});const ev=f.cast();
  expect(f.allies[0].defeated).toBe(false);expect(f.allies[0].statuses.some(s=>s.id==='barrier')).toBe(false);expect(summons(ev)).toEqual([]);
 });
 refused({...base,allies:[{}],target:1});
});