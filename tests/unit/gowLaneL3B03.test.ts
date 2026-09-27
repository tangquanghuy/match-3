// Lane L3 batch B03 (sa-L3): turn / mana lane, stored-snapshot scope. Per-entity source/native/prototype
// binding + real TurnEngine.castSkill cases (both sides, boundaries, refusals). Evidence file (frozen on delivery).
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
import {BaseColor,PlayerSide,colorGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;
type BoardFn=(r:number,c:number)=>GemType|null;
/** (r+c)%4 diagonal pattern: no line of 3; each colour class is 16 isolated cells. */
const pattern=(cols:BaseColor[],over:Record<string,BaseColor>={}):BoardFn=>(r,c)=>colorGem(over[`${r},${c}`]??cols[(r+c)%4]);
interface Opts{skill:string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;board?:BoardFn;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number;caster?:Partial<Character>}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();
 const fn=o.board??pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const t=fn(r,c);board.set({row:r,col:c},t?{id:id++,type:t}:null);}
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,...o.caster});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const mine={player:side,characters:[caster,...allies]};
 const theirs={player:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,characters:[...enemies]};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const hp0=enemies.map(e=>e.hp);
 return {board,state,engine,caster,allies,enemies,side,opponent:theirs.player,cast:()=>engine.castSkill(caster.id),
  loss:()=>enemies.map((e,i)=>hp0[i]-e.hp)};
}
const created=(ev:GameEvent[])=>{const out:GemType[]=[];for(const e of ev){
 if(e.type==='gem-create')for(const s of e.spawns)out.push(s.gemType);
 if(e.type==='gem-transform')for(const s of e.changes)out.push(s.to);}return out;};
const specials=(ev:GameEvent[],kind:string)=>created(ev).filter(t=>t.kind==='special'&&t.spec.kind===kind);
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId]:[]);
const skillExtra=(ev:GameEvent[])=>ev.filter(e=>e.type==='extra-turn'&&e.source==='skill').length;
const matchExtra=(ev:GameEvent[])=>ev.some(e=>e.type==='extra-turn'&&e.source!=='skill');
/** Turn bookkeeping after a real cast: one log entry; turn kept iff an extra turn was granted. */
function turnAfter(f:ReturnType<typeof setup>,ev:GameEvent[],skillExtraTurn:boolean){
 expect(ev[0]).toMatchObject({type:'skill-cast',characterId:0});
 expect(skillExtra(ev)).toBe(skillExtraTurn?1:0);
 expect(f.state.actionLog).toHaveLength(1);
 const kept=skillExtraTurn||matchExtra(ev);
 expect(f.state.activePlayer).toBe(kept?f.side:f.opponent);
 expect(f.state.actionLog[0].outcome).toBe(kept?'extra-turn':'switched');
}
function troopBinding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string,target:string){
 const en=original.find((t:{id:number})=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.Target).toBe(target);expect(n.SpellSteps).toEqual(steps);
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description).toBe(zh);
}
function refusal(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses; no log, no turn change, mana kept`,()=>{
  const f=setup(o);
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(f.side);
  expect(f.enemies.every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
 });
}

// ——— troop:6252 DRACOS-1337 / spell 7395 (FIXED L3-011) ———
describe('L3 troop:6252/spell:7395 Stun, Silence, drain [Magic+1] Mana, 30% destroy',()=>{
 const base={skill:'7395',cost:15,colors:[BaseColor.Yellow,BaseColor.Purple],enemies:[{},{},{mana:20,manaCost:30},{}]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6252,7395,15,base.colors,'Silence, Stun, and drain [Magic + 1] Mana from an enemy, with a 30% chance to destroy them.',
   [{Target:'FromTarget',Type:'CauseStun'},{Target:'FromTarget',Type:'CauseSilence'},
    {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'DecreaseMana'},
    {Target:'FromTarget',PercentageChance:30,Type:'LethalDamage'}],
   '使一名敌人陷入沉默和击晕状态，并耗掉他 [魔法 + 1] 点法力值。有 30% 的几率摧毁他。','Enemy');
  expect(registry.prototypes.get('7395')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},{kind:'status',target:'enemyChosen',statusId:'silence',turns:3},
   {kind:'reduce',target:'enemyChosen',stat:'mana',scaling:{base:1,mult:1}},
   {kind:'damage',target:'enemyChosen',scaling:{base:0,mult:0},execute:true,chance:0.3}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: Stun then Silence on the chosen enemy, mana 20 -> ${19-magic}; caster not refilled; turn passes`,()=>{
  const f=setup({...base,side,magic,seed:7});const victim=f.enemies[2];const ev=f.cast();
  expect(applied(ev).slice(0,2)).toEqual([[12,'stun'],[12,'silence']]);
  expect(victim.mana).toBe(victim.defeated?victim.mana:19-magic);expect(f.caster.mana).toBe(0);
  expect(f.enemies.filter(e=>e!==victim).every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
  turnAfter(f,ev,false);
 });
 it('30% destroy: over 60 seeds the chosen enemy (full Life 1000) is destroyed in 8..30 casts, others never',()=>{
  let kills=0;
  for(let seed=1;seed<=60;seed++){const f=setup({...base,seed});const v=f.enemies[2];f.cast();if(v.defeated){kills++;expect(v.hp).toBe(0);}
   expect([f.enemies[0],f.enemies[1],f.enemies[3]].every(e=>!e.defeated)).toBe(true);}
  expect(kills).toBeGreaterThanOrEqual(8);expect(kills).toBeLessThanOrEqual(30);
 });
 it('drain clamps at 0 (mana 3, magic 10); Blessed target: no statuses, no drain',()=>{
  const a=setup({...base,enemies:[{},{},{mana:3},{}],seed:7});a.cast();expect(a.enemies[2].mana).toBe(0);
  const b=setup({...base,enemies:[{},{},{mana:20,manaCost:30,statuses:[{id:'blessed',turns:3}]},{}],seed:7});const eb=b.cast();
  expect(applied(eb)).toEqual([]);expect(b.enemies[2].mana).toBe(20);
 });
 refusal({...base,enemies:[{},{},{},{}]});
});

// ——— troop:7100 Stoneborn Lion / spell 8635 (FIXED L3-001) ———
describe('L3 troop:7100/spell:8635 Stun then [Magic+3]; on kill 2 Elemental Stars + extra turn',()=>{
 const base={skill:'8635',cost:11,colors:[BaseColor.Blue,BaseColor.Brown]};
 it('source/native/prototype/display binding (native CauseStun before Damage)',()=>{
  troopBinding(7100,8635,11,base.colors,'Deal [Magic + 3] damage to an Enemy, and Stun them. If the Enemy dies, create 2 Elemental Stars and gain an extra turn.',
   [{Target:'FromTarget',Amount:1,Type:'CauseStun'},
    {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage',Delay:1},
    {StatusAmount:2,Color1:'ElementalStar',StatusModifier:'AddForKill',Type:'CreateGems',Delay:1},
    {Target:'Self',StatusAmount:100,StatusModifier:'AddForKill',Type:'ExtraTurnConditional'}],
   '对一名敌人造成 [魔法 + 3] 点伤害，并击晕他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。','Enemy');
  expect(registry.prototypes.get('8635')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'elementalStar'}},count:{base:2,mult:0}},ifTargetDied:true},
   {kind:'extraTurn',ifTargetDied:true}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: survivor Stunned then -${magic+3}; no stars; turn passes`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'stun']]);expect(f.loss()).toEqual([0,0,magic+3,0]);
  expect(ev.findIndex(e=>e.type==='status-apply')).toBeLessThan(ev.findIndex(e=>e.type==='skill-damage'));
  expect(specials(ev,'elementalStar')).toHaveLength(0);turnAfter(f,ev,false);
 });
 for(const side of SIDES)it(`real cast side=${side}: kill -> Stun applied first, 2 Elemental Stars, skill extra turn`,()=>{
  const f=setup({...base,side,magic:0,enemies:[{},{},{hp:3},{}]});const victim=f.enemies[2];const ev=f.cast();
  expect(victim.defeated).toBe(true);expect(applied(ev)).toEqual([[12,'stun']]);
  expect(specials(ev,'elementalStar')).toHaveLength(2);turnAfter(f,ev,true);
 });
 it('Barrier absorbs the hit (Stun still lands, no extra turn); frozen caster kill -> no spell extra turn',()=>{
  const a=setup({...base,magic:0,enemies:[{},{},{hp:3,statuses:[{id:'barrier',turns:3}]},{}]});const ea=a.cast();
  expect(a.enemies[2].hp).toBe(3);expect(applied(ea)).toEqual([[12,'stun']]);expect(skillExtra(ea)).toBe(0);
  const b=setup({...base,magic:0,enemies:[{},{},{hp:3},{}],caster:{statuses:[{id:'frozen',turns:3}]}});const eb=b.cast();
  expect(specials(eb,'elementalStar')).toHaveLength(2);expect(skillExtra(eb)).toBe(0);
 });
 refusal(base);
});

// ——— troop:6225 Manticore / spell 7367 ———
describe('L3 troop:6225/spell:7367 Stun an enemy, drain 7 Mana, gain [Magic+1] Attack',()=>{
 const base={skill:'7367',cost:9,colors:[BaseColor.Green,BaseColor.Yellow],enemies:[{},{},{mana:20,manaCost:30},{}]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6225,7367,9,base.colors,'Stun an enemy and drain their Mana by 7. Gain [Magic + 1] Attack.',
   [{Target:'FromTarget',Type:'CauseStun'},{Target:'FromTarget',Amount:7,Type:'DecreaseMana'},
    {SpellPowerMultiplier:1,Target:'Self',Amount:1,Primarypower:true,Type:'IncreaseAttack'}],
   '击晕一名敌人并耗掉其 7 点法力值。获得 [魔法 + 1] 点攻击力。','Enemy');
  expect(registry.prototypes.get('7367')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},
   {kind:'reduce',target:'enemyChosen',stat:'mana',scaling:{base:7,mult:0}},
   {kind:'buff',target:'allySelf',stat:'attack',scaling:{base:1,mult:1}}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: chosen Stunned, mana 20 -> 13 (fixed 7), caster Attack 17 -> ${18+magic}; turn passes`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'stun']]);expect(f.enemies[2].mana).toBe(13);expect(f.caster.attack).toBe(18+magic);
  expect(f.caster.mana).toBe(0);expect(f.enemies.filter((_,i)=>i!==2).every(e=>e.statuses.length===0)).toBe(true);
  turnAfter(f,ev,false);
 });
 it('drain clamps at 0; Stun first disables Mana Shield (drained); Blessed blocks both; Entangled caster gains no Attack',()=>{
  const a=setup({...base,enemies:[{},{},{mana:5},{}]});a.cast();expect(a.enemies[2].mana).toBe(0);
  const b=setup({...base,enemies:[{},{},{mana:20,manaCost:30,traitIds:['manashield']},{}]});b.cast();expect(b.enemies[2].mana).toBe(13);
  const c=setup({...base,enemies:[{},{},{mana:20,manaCost:30,statuses:[{id:'blessed',turns:3}]},{}]});const ec=c.cast();
  expect(applied(ec)).toEqual([]);expect(c.enemies[2].mana).toBe(20);
  const d=setup({...base,caster:{statuses:[{id:'entangle',turns:3}]}});d.cast();expect(d.caster.attack).toBe(17);
 });
 refusal({...base,enemies:[{},{},{},{}]});
});

// ——— troop:7418 Void Manticore / spell 9067 (FIXED L3-008) ———
describe('L3 troop:7418/spell:9067 Terror an enemy, steal [Magic+1] Attack, drain 7 Mana',()=>{
 const base={skill:'9067',cost:12,colors:[BaseColor.Blue,BaseColor.Yellow],enemies:[{},{},{mana:20,manaCost:30},{}]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7418,9067,12,base.colors,'Inflict Terror on an Enemy. Then steal [Magic + 1] Attack, and drain their Mana by 7.',
   [{Target:'FromTarget',Amount:1,Type:'CauseTerror'},
    {SpellPowerMultiplier:1,Target:'FromTarget',Amount:1,Primarypower:true,Type:'StealAttack'},
    {Target:'FromTarget',Amount:7,Type:'DecreaseMana'}],
   '使一名敌人陷入恐怖状态。再窃取他 [魔法 + 1] 点攻击力并耗掉他 7 点法力值。','Enemy');
  expect(registry.prototypes.get('9067')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'terror',turns:3},
   {kind:'reduce',target:'enemyChosen',stat:'attack',scaling:{base:1,mult:1},gainStat:'attack'},
   {kind:'reduce',target:'enemyChosen',stat:'mana',scaling:{base:7,mult:0}}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: Terror; Attack 17 -> ${16-magic} (caster +${magic+1}); mana 20 -> 13; turn passes`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'terror']]);expect(f.enemies[2].attack).toBe(16-magic);expect(f.caster.attack).toBe(18+magic);
  expect(f.enemies[2].mana).toBe(13);expect(f.caster.mana).toBe(0);turnAfter(f,ev,false);
 });
 it('steal clamps to the target Attack (3 -> caster +3); mana 4 -> 0; other enemies untouched',()=>{
  const f=setup({...base,enemies:[{},{},{attack:3,mana:4},{}]});f.cast();
  expect(f.enemies[2].attack).toBe(0);expect(f.caster.attack).toBe(20);expect(f.enemies[2].mana).toBe(0);
  expect(f.enemies.filter((_,i)=>i!==2).every(e=>e.attack===17&&e.statuses.length===0)).toBe(true);
 });
 refusal({...base,enemies:[{},{},{},{}]});
});

// ——— troop:7796 Jellymaid / spell 9816 (FIXED L3-012; draft: L3-005 half-mana rounding) ———
describe('L3 troop:7796/spell:9816 Cleanse + Submerge + half mana to 2 random allies (prefer not previous)',()=>{
 const base={skill:'9816',cost:12,colors:[BaseColor.Purple,BaseColor.Brown]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7796,9816,12,base.colors,'Cleanse and Submerge 2 random Allies, and give them half their Mana.',
   [{Target:'RandomAlly',Type:'Cleanse'},{Target:'FromPrevious',Type:'CauseSubmerged',Delay:0},
    {Target:'FromPrevious',Type:'GenerateHalfMana',Delay:400,ResetTargets:true},
    {Target:'RandomPrefNotPrevAlly',Type:'Cleanse'},{Target:'FromPrevious',Type:'CauseSubmerged'},
    {Target:'FromPrevious',Type:'GenerateHalfMana'}],
   '净化并淹没 2 名随机盟友，并给予他们一半的法力值。','None');
  expect(registry.prototypes.get('9816')).toEqual({segments:[
   {kind:'cleanse',target:'allyRandom'},{kind:'status',target:'lastTarget',statusId:'submerged',turns:3},
   {kind:'buff',target:'lastTarget',stat:'mana',scaling:{base:0,mult:0},halve:true},
   {kind:'cleanse',target:'allyRandomPrefNotPrev'},{kind:'status',target:'lastTarget',statusId:'submerged',turns:3},
   {kind:'buff',target:'lastTarget',stat:'mana',scaling:{base:0,mult:0},halve:true}]});
 });
 for(const side of SIDES)for(const seed of [1,2,3])it(`real cast side=${side} seed=${seed}: two distinct allies cleansed + Submerged + half their (even) mana bar`,()=>{
  const f=setup({...base,side,seed,allies:[{manaCost:10,statuses:[{id:'poison',turns:3}]},{manaCost:14,statuses:[{id:'burning',turns:3}]},{manaCost:16}]});const ev=f.cast();
  const subs=applied(ev).filter(a=>a[1]==='submerged').map(a=>a[0] as number);
  expect(subs).toHaveLength(2);expect(new Set(subs).size).toBe(2);
  const team=[f.caster,...f.allies];
  for(const c of team){const hit=subs.includes(c.id);
   expect(c.mana).toBe(hit?c.manaCost/2:0);expect(c.statuses.some(s=>s.id==='submerged')).toBe(hit);
   if(hit)expect(c.statuses.some(s=>s.id==='poison'||s.id==='burning')).toBe(false);}
  turnAfter(f,ev,false);
 });
 it('lone caster: prefer-not-previous falls back to the caster, so it is cleansed/submerged twice and gets half its bar twice (6+6)',()=>{
  const f=setup({...base});const ev=f.cast();
  expect(applied(ev).filter(a=>a[1]==='submerged').map(a=>a[0])).toEqual([0,0]);expect(f.caster.mana).toBe(12);
 });
 it('Cleanse precedes the mana grant: a silenced ally is un-silenced first and then receives mana; positive Barrier kept (R002)',()=>{
  const f=setup({...base,allies:[{manaCost:10,statuses:[{id:'silence',turns:3},{id:'barrier',turns:3}]}],seed:1});f.cast();
  const a=f.allies[0];if(a.statuses.some(s=>s.id==='submerged')){expect(a.mana).toBe(5);expect(a.statuses.map(s=>s.id).sort()).toEqual(['barrier','submerged']);}
  expect([f.caster,a].every(c=>c.statuses.some(s=>s.id==='submerged'))).toBe(true);
 });
 refusal({...base,allies:[{},{}]});
});
