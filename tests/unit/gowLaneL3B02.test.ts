// Lane L3 batch B02 (sa-L3): turn / mana lane, stored-snapshot scope. Per-entity source/native/prototype
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
import {BaseColor,PlayerSide,colorGem,skullGem,type Character,type GemType} from '@engine/types';
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

// ——— troop:6113 Dire Wolf / spell 7205 ———
describe('L3 troop:6113/spell:7205 Entangle + Hunter\'s Mark first enemy, [Magic+2], extra turn if 13+ Green',()=>{
 const base={skill:'7205',cost:8,colors:[BaseColor.Green]};
 const G=[BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 /** 16 isolated Green cells; replace k of them with Blue (still isolated). */
 const greens=(n:number)=>{const cells:string[]=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((r+c)%4===0)cells.push(`${r},${c}`);
  const over:Record<string,BaseColor>={};cells.slice(n).forEach(k=>over[k]=BaseColor.Blue);return pattern(G,over);};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6113,7205,8,base.colors,"Entangle and Hunter's Mark the first Enemy. Deal [Magic + 2] damage to them. If there are 13 or more Green Gems, gain an extra turn.",
   [{Target:'FrontEnemy',Type:'CauseHuntersMark'},{Target:'FrontEnemy',Type:'CauseEntangle'},
    {SpellPowerMultiplier:1,Target:'FrontEnemy',Amount:2,Primarypower:true,Type:'Damage'},
    {StatusAmount:100,StatusModifier:'AddFor10GreenGems',Type:'ExtraTurnConditional'}],
   '使第一名敌人陷入缠绕和猎人标记状态。对其造成 [魔法 + 2] 点伤害。如果板面上有 13 颗或更多绿色宝石，则获得一个额外回合。','None');
  expect(registry.prototypes.get('7205')).toEqual({segments:[
   {kind:'status',target:'enemyFront',statusId:'entangle',turns:3},{kind:'status',target:'enemyFront',statusId:'marked',turns:3},
   {kind:'damage',target:'enemyFront',scaling:{base:2,mult:1}},
   {kind:'extraTurn',ifCond:{kind:'boardAtLeast',color:'Green',n:13}}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Green -> front enemy marked+entangled, -${magic+2}, extra turn (skill)`,()=>{
  const f=setup({...base,side,magic,board:greens(16)});const ev=f.cast();
  expect(f.loss()).toEqual([magic+2,0,0,0]);
  expect(f.enemies[0].statuses.map(s=>s.id).sort()).toEqual(['entangle','marked']);
  expect(f.enemies.slice(1).every(e=>e.statuses.length===0)).toBe(true);
  turnAfter(f,ev,true);expect(f.caster.mana).toBe(0);
 });
 it('R003 threshold: 13 Green -> extra turn; 12 Green -> turn passes (AddFor10 = 13)',()=>{
  const a=setup({...base,board:greens(13)});turnAfter(a,a.cast(),true);
  const b=setup({...base,board:greens(12)});const ev=b.cast();turnAfter(b,ev,false);expect(b.loss()[0]).toBe(12);
 });
 it('frozen caster: statuses/damage land, no spell extra turn (official Frozen)',()=>{
  const f=setup({...base,board:greens(16),caster:{statuses:[{id:'frozen',turns:3}]}});const ev=f.cast();
  expect(f.loss()[0]).toBe(12);expect(skillExtra(ev)).toBe(0);
 });
 it('first enemy dead -> next living enemy is the front; R001 equivalence: Mark/Entangle order unobservable (both land, attack 0 while entangled)',()=>{
  const f=setup({...base,board:greens(16),enemies:[{hp:0,defeated:true},{},{},{}]});f.cast();
  expect(f.loss()).toEqual([0,12,0,0]);expect(f.enemies[1].statuses.map(s=>s.id).sort()).toEqual(['entangle','marked']);
 });
 refusal({...base,board:greens(16)});
});

// ——— troop:6783 Stringfiddler / spell 8173 ———
describe('L3 troop:6783/spell:8173 Silence an enemy, explode [(Magic/4)+1] gems of its colour, extra turn',()=>{
 const base={skill:'8173',cost:14,colors:[BaseColor.Green,BaseColor.Purple],enemies:[{},{},{colors:[BaseColor.Red]},{}]};
 const REDS=['0,0','0,4','3,2','3,6','6,0','6,4'];
 const board=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown],Object.fromEntries(REDS.map(k=>[k,BaseColor.Red])));
 const redsExploded=(ev:GameEvent[])=>{const e=ev.find(x=>x.type==='gem-explode');
  return e&&e.type==='gem-explode'?e.cells.filter(c=>c.gemType.kind==='color'&&c.gemType.color===BaseColor.Red).length:0;};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6783,8173,14,base.colors,'Silence an Enemy. Explode [(Magic / 4) + 1] Gems of one of their Mana Colors. Gain an Extra Turn.',
   [{Target:'FromTarget',Amount:1,Type:'CauseSilence',Delay:1},
    {SpellPowerMultiplier:0.25,Color1:'FromTarget',Amount:1,Primarypower:true,Type:'ExplodeColor'},
    {Target:'Self',Amount:100,Type:'ExtraTurn'}],
   '使一名敌人陷入沉默状态。爆破其法力颜色 [(魔法 / 4) + 1] 颗宝石。获得一个额外回合。','Enemy');
  expect(registry.prototypes.get('8173')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'silence',turns:3},
   {kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'randomGems',count:{base:1,mult:0.25},include:'color',color:'LAST_TARGET'}}},
   {kind:'extraTurn'}]});
 });
 for(const side of SIDES)for(const [magic,n] of [[0,1],[2,2],[6,3],[10,4],[30,6]] as const)
 it(`real cast side=${side} magic=${magic}: chosen enemy silenced, ${n} Red centres exploded (round, convention:R006-C1; capped by 6 on board), extra turn`,()=>{
  const f=setup({...base,side,magic,board});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'silence']]);expect(f.enemies[2].statuses.map(s=>s.id)).toEqual(['silence']);
  expect(redsExploded(ev)).toBe(n);expect(f.loss()).toEqual([0,0,0,0]);
  turnAfter(f,ev,true);
 });
 it('colour follows the chosen enemy (Blue enemy -> Blue gems exploded), other enemies not silenced',()=>{
  const f=setup({...base,magic:0,board,enemies:[{colors:[BaseColor.Red]},{colors:[BaseColor.Blue]},{colors:[BaseColor.Red]},{}],target:11});const ev=f.cast();
  const e=ev.find(x=>x.type==='gem-explode');expect(e&&e.type==='gem-explode'&&e.cells.filter(c=>c.gemType.kind==='color'&&c.gemType.color===BaseColor.Blue).length).toBeGreaterThanOrEqual(1);
  expect(redsExploded(ev)).toBe(0);expect(applied(ev)).toEqual([[11,'silence']]);
 });
 it('frozen caster: silence + explosion still resolve, no spell extra turn',()=>{
  const f=setup({...base,board,caster:{statuses:[{id:'frozen',turns:3}]}});const ev=f.cast();
  expect(redsExploded(ev)).toBe(4);expect(skillExtra(ev)).toBe(0);
 });
 refusal({...base,board});
});

// ——— troop:7099 Waterborn Owl / spell 8634 (FIXED L3-001) ———
describe('L3 troop:7099/spell:8634 Freeze then [Magic+3]; on kill 2 Elemental Stars + extra turn',()=>{
 const base={skill:'8634',cost:11,colors:[BaseColor.Blue,BaseColor.Green]};
 it('source/native/prototype/display binding (native CauseFrozen before Damage)',()=>{
  troopBinding(7099,8634,11,base.colors,'Deal [Magic + 3] damage to an Enemy, and Freeze them. If the Enemy dies, create 2 Elemental Stars and gain an extra turn.',
   [{Target:'FromTarget',Amount:1,Type:'CauseFrozen'},
    {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage',Delay:1},
    {StatusAmount:2,Color1:'ElementalStar',StatusModifier:'AddForKill',Type:'CreateGems',Delay:1},
    {Target:'Self',StatusAmount:100,StatusModifier:'AddForKill',Type:'ExtraTurnConditional'}],
   '对一名敌人造成 [魔法 + 3] 点伤害，并冻结他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。','Enemy');
  expect(registry.prototypes.get('8634')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'frozen',turns:3},
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'elementalStar'}},count:{base:2,mult:0}},ifTargetDied:true},
   {kind:'extraTurn',ifTargetDied:true}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: survivor Frozen then -${magic+3}; no stars; turn passes`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,'frozen']]);expect(f.loss()).toEqual([0,0,magic+3,0]);
  expect(ev.findIndex(e=>e.type==='status-apply')).toBeLessThan(ev.findIndex(e=>e.type==='skill-damage'));
  expect(ev.filter(e=>e.type==='gem-create'||e.type==='gem-transform')).toHaveLength(0);turnAfter(f,ev,false);
 });
 for(const side of SIDES)it(`real cast side=${side}: kill -> Frozen applied first, stars created, skill extra turn`,()=>{
  const f=setup({...base,side,magic:0,enemies:[{},{},{hp:3},{}]});const victim=f.enemies[2];const ev=f.cast();
  expect(victim.defeated).toBe(true);expect(applied(ev)).toEqual([[12,'frozen']]);
  const made=ev.filter(e=>e.type==='gem-create'||e.type==='gem-transform');expect(made.length).toBeGreaterThan(0);
  turnAfter(f,ev,true);
 });
 it('Barrier absorbs the hit (no kill, no extra turn); frozen caster kill -> no spell extra turn',()=>{
  const a=setup({...base,magic:0,enemies:[{},{},{hp:3,statuses:[{id:'barrier',turns:3}]},{}]});const ea=a.cast();
  expect(a.enemies[2].hp).toBe(3);expect(skillExtra(ea)).toBe(0);
  const b=setup({...base,magic:0,enemies:[{},{},{hp:3},{}],caster:{statuses:[{id:'frozen',turns:3}]}});expect(skillExtra(b.cast())).toBe(0);
 });
 refusal(base);
});

// ——— troop:7070 Sky Scorpion / spell 8598 (FIXED L3-007, L3-008, L3-009) ———
describe('L3 troop:7070/spell:8598 Poison + drain 7 Mana from all enemies, remove all Skulls, once per battle',()=>{
 const base={skill:'8598',cost:10,colors:[BaseColor.Green,BaseColor.Yellow],enemies:[{mana:20,manaCost:30},{mana:5,manaCost:30},{mana:7,manaCost:30},{mana:0}]};
 const SK=['0,0','2,2','4,4','6,6','1,5'];
 const board:BoardFn=(r,c)=>SK.includes(`${r},${c}`)?skullGem():colorGem([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown][(r+c)%4]);
 const skullsLeft=(f:ReturnType<typeof setup>)=>{let n=0;f.board.forEach(g=>{if(g&&g.type.kind==='skull')n++;});return n;};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7070,8598,10,base.colors,'Poison and drain 7 Mana from all Enemies. Then remove all Skulls. Can only be cast once.',
   [{Target:'AllEnemies',Amount:1,Type:'CausePoison'},{Target:'AllEnemies',Amount:7,Type:'DecreaseMana'},
    {Color1:'Skull',Amount:100,Type:'RemoveColor'},{Target:'Self',Amount:1,Type:'DisableMySpell'}],
   '使所有敌人中毒并吸取 7 点法力值。然后移除所有头骨。此咒语只能使用一次。','None');
  expect(registry.prototypes.get('8598')).toEqual({segments:[
   {kind:'status',target:'enemyAll',statusId:'poison',turns:3,magnitude:3},
   {kind:'reduce',target:'enemyAll',stat:'mana',scaling:{base:7,mult:0}},
   {kind:'gem',params:{op:'clear',mode:'remove',target:{kind:'skulls'}}}],oncePerBattle:true});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: all Poisoned, mana 20/5/7/0 -> 13/0/0/0 (fixed 7), caster not refilled, 5 skulls removed`,()=>{
  const f=setup({...base,side,magic,board});expect(skullsLeft(f)).toBe(5);const ev=f.cast();
  expect(applied(ev).map(a=>a.join(':')).sort()).toEqual(['10:poison','11:poison','12:poison','13:poison']);
  expect(f.enemies.map(e=>e.mana)).toEqual([13,0,0,0]);expect(skullsLeft(f)).toBe(0);
  expect(ev.some(e=>e.type==='gem-destroy'&&e.cells.every(c=>c.gemType.kind==='skull'))).toBe(true);
  expect(f.caster.mana).toBe(0);turnAfter(f,ev,false);
 });
 it('Blessed and Mana Shield enemies are not drained (official Blessed blocks Mana Drain; manashield trait)',()=>{
  const f=setup({...base,board,enemies:[{mana:20,manaCost:30,statuses:[{id:'blessed',turns:3}]},{mana:20,manaCost:30,traitIds:['manashield']},{mana:20,manaCost:30},{}]});f.cast();
  expect(f.enemies.map(e=>e.mana)).toEqual([20,20,13,0]);
 });
 it('Can only be cast once: same troop refused after a full refill; FIXED L3-009 an enemy Sky Scorpion does not disable mine',()=>{
  const f=setup({...base,board});f.cast();f.state.activePlayer=f.side;f.caster.mana=10;
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(10);expect(f.state.actionLog).toHaveLength(1);
  const g=setup({...base,board,enemies:[{skillId:'8598',mana:10,manaCost:10},{},{},{}]});g.state.activePlayer=g.opponent;
  expect(g.engine.castSkill(10).length).toBeGreaterThan(0);expect(g.state.activePlayer).toBe(g.side);
  expect(g.caster.mana).toBe(3);g.caster.mana=10;// the enemy cast drained my caster 10 -> 3
  expect(g.cast().length).toBeGreaterThan(0);expect(g.state.actionLog).toHaveLength(2);
 });
 refusal({...base,board,enemies:[{},{},{},{}]});
});

// ——— troop:6481 Champion of Anu / spell 7668 (FIXED L3-010) ———
describe('L3 troop:6481/spell:7668 Stun, Silence, drain all Mana; [Magic+6] to the enemy and all below',()=>{
 const base={skill:'7668',cost:22,colors:[BaseColor.Blue,BaseColor.Red,BaseColor.Yellow],target:11,
  enemies:[{mana:9,manaCost:20},{mana:9,manaCost:20},{mana:9,manaCost:20},{mana:9,manaCost:20}]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6481,7668,22,base.colors,'Silence, Stun and drain all Mana from an enemy. Deal [Magic + 6] damage to them, and all enemies below them.',
   [{Target:'FromTarget',Amount:1,Type:'CauseStun'},{Target:'FromTarget',Amount:1,Type:'CauseSilence'},
    {Target:'FromTarget',Amount:100,Type:'DecreaseMana'},
    {SpellPowerMultiplier:1,Target:'FromTarget',Amount:6,Primarypower:true,Type:'Damage'},
    {SpellPowerMultiplier:1,Target:'BelowTarget',Amount:6,Type:'Damage'}],
   '耗尽一名敌人的法力值，并将其击晕和使其陷入沉默状态。对其和其下方的所有敌人造成 [魔法 + 6] 点伤害。','Enemy');
  expect(registry.prototypes.get('7668')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'stun',turns:3},{kind:'status',target:'enemyChosen',statusId:'silence',turns:3},
   {kind:'reduce',target:'enemyChosen',stat:'mana',scaling:{base:0,mult:0},drainAll:true},
   {kind:'damage',target:'enemyChosenAndBelow',scaling:{base:6,mult:1},range:'all'}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: chosen 11 Stunned+Silenced, drained 9 -> 0; 11/12/13 take ${magic+6}, 10 untouched`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual([[11,'stun'],[11,'silence']]);
  expect(f.enemies.map(e=>e.mana)).toEqual([9,0,9,9]);expect(f.loss()).toEqual([0,magic+6,magic+6,magic+6]);
  expect(f.caster.mana).toBe(0);turnAfter(f,ev,false);
 });
 it('native order: Stun first disables Mana Shield so the chosen shield-bearer is drained; Blessed target keeps its mana and statuses',()=>{
  const a=setup({...base,enemies:[{},{mana:9,traitIds:['manashield']},{},{}]});a.cast();expect(a.enemies[1].mana).toBe(0);
  const b=setup({...base,enemies:[{},{mana:9,statuses:[{id:'blessed',turns:3}]},{},{}]});const eb=b.cast();
  expect(b.enemies[1].mana).toBe(9);expect(applied(eb)).toEqual([]);
 });
 it('last enemy chosen -> only it is hit; armor absorbs first; dead enemies below skipped',()=>{
  const a=setup({...base,magic:0,target:13});a.cast();expect(a.loss()).toEqual([0,0,0,6]);
  const b=setup({...base,magic:0,enemies:[{},{armor:4},{hp:0,defeated:true},{}]});b.cast();
  expect(b.enemies[1].armor).toBe(0);expect(b.loss()).toEqual([0,2,0,6]);
 });
 refusal({...base,enemies:[{},{},{},{}]});
});
