// Lane L3 batch B04 (sa-L3): turn / mana lane, stored-snapshot scope. Per-entity source/native/prototype
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
import {FixedColorChooser} from '@engine/skills/colorChooser';
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

const transforms=(ev:GameEvent[])=>{const out:{from:GemType;to:GemType}[]=[];for(const e of ev)if(e.type==='gem-transform')for(const c of e.changes)out.push({from:c.from,to:c.to});return out;};
const isC=(t:GemType,c:BaseColor)=>t.kind==='color'&&t.color===c;
const isS=(t:GemType,k:string)=>t.kind==='special'&&t.spec.kind===k;

// ——— troop:6518 Sister Superior / spell 7710 ———
describe('L3 troop:6518/spell:7710 Cleanse all allies; Dispel + Stun Daemon and Undead enemies; extra turn',()=>{
 const base={skill:'7710',cost:6,colors:[BaseColor.Green,BaseColor.Yellow],
  enemies:[{troopTypes:['Daemon'],statuses:[{id:'barrier',turns:3},{id:'enchanted',turns:3}]},{troopTypes:['Human'],statuses:[{id:'barrier',turns:3}]},
   {troopTypes:['Undead','Knight'],statuses:[{id:'reflect',turns:3}]},{troopTypes:['Beast']}]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6518,7710,6,base.colors,'Cleanse all Allies. Dispel and Stun Daemon and Undead Enemies. Gain an extra turn.',
   [{Target:'AllAllies',Amount:1,Type:'Cleanse'},{Target:'EnemyType',Amount:1,Type:'Dispel',Data:'daemon'},{Target:'EnemyType',Amount:1,Type:'Dispel',Data:'undead'},
    {Target:'EnemyType',Amount:1,Type:'CauseStun',Data:'daemon'},{Target:'EnemyType',Amount:1,Type:'CauseStun',Data:'undead'},{Target:'Self',Type:'ExtraTurn'}],
   '净化所有盟友。击晕所有恶魔与不死族，并消除其所有正面增益效果。获得一个额外回合。','None');
  const p=registry.prototypes.get('7710')!;const segs=p.segments as unknown as {kind:string;statusId?:string;target?:string}[];
  expect(segs[0]).toEqual({kind:'cleanse',target:'allyAll'});
  expect(segs.filter(s=>s.kind==='dispel').map(s=>s.statusId)).toEqual(['barrier','submerged','blessed','enchanted','reflect','enraged','rage']);
  expect(segs.slice(-2).map(s=>s.kind)).toEqual(['status','extraTurn']);
 });
 for(const side of SIDES)it(`real cast side=${side}: allies cleansed (negatives only), Daemon/Undead dispelled + Stunned, others untouched, extra turn`,()=>{
  const f=setup({...base,side,allies:[{statuses:[{id:'poison',turns:3},{id:'barrier',turns:3}]}],caster:{statuses:[{id:'burning',turns:3}]}});const ev=f.cast();
  expect(f.caster.statuses).toEqual([]);expect(f.allies[0].statuses.map(s=>s.id)).toEqual(['barrier']);
  expect(f.enemies[0].statuses.map(s=>s.id)).toEqual(['stun']);expect(f.enemies[2].statuses.map(s=>s.id)).toEqual(['stun']);
  expect(f.enemies[1].statuses.map(s=>s.id)).toEqual(['barrier']);expect(f.enemies[3].statuses).toEqual([]);
  expect(applied(ev).filter(a=>a[1]==='stun').map(a=>a[0])).toEqual([10,12]);turnAfter(f,ev,true);
 });
 it('Blessed Daemon: Bless is dispelled first, then Stun lands; troop that is both Daemon and Undead stunned once',()=>{
  const f=setup({...base,enemies:[{troopTypes:['Daemon','Undead'],statuses:[{id:'blessed',turns:3}]},{},{},{}]});const ev=f.cast();
  expect(f.enemies[0].statuses.map(s=>s.id)).toEqual(['stun']);expect(applied(ev).filter(a=>a[1]==='stun')).toHaveLength(1);
 });
 it('no Daemon/Undead: only the cleanse + extra turn; frozen caster is cleansed first so still gains the extra turn',()=>{
  const a=setup({...base,enemies:[{},{},{},{}]});const ea=a.cast();expect(applied(ea)).toEqual([]);turnAfter(a,ea,true);
  const b=setup({...base,caster:{statuses:[{id:'frozen',turns:3}]}});const eb=b.cast();
  // native order: Cleanse (step 0) removes the caster's Frozen before ExtraTurn (step 5) -> extra turn granted
  expect(b.caster.statuses).toEqual([]);expect(skillExtra(eb)).toBe(1);
 });
 refusal({...base,enemies:[{},{},{},{}]});
});

// ——— troop:6319 Sentry Bot / spell 7469 (draft: L3-013 GenerateRandomMana roll scope) ———
describe('L3 troop:6319/spell:7469 Cleanse other allies, give them 3-8 Mana, create 3 Bomb Gems',()=>{
 const base={skill:'7469',cost:10,colors:[BaseColor.Yellow]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6319,7469,10,base.colors,'Cleanse all other Allies, and give 3-8 Mana to them. Create 3 Bomb Gems.',
   [{SpellPowerMultiplier:0.5,Target:'AllAlliesButNotSelf',Amount:1,Primarypower:true,Type:'Cleanse'},
    {Target:'AllAlliesButNotSelf',Amount:8,Type:'GenerateRandomMana'},{Color1:'Bomb',Amount:3,Type:'CreateGems'}],
   '净化所有其他盟友，再给予他们 3-8 点法力值。创造 3 颗炸弹宝石。','None');
  expect(registry.prototypes.get('7469')).toEqual({segments:[{kind:'cleanse',target:'allyOthers'},
   {kind:'buff',target:'allyOthers',stat:'mana',scaling:{base:0,mult:0},rangeSpec:{min:{base:3,mult:0},max:{base:8,mult:0}}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'bomb'}},count:{base:3,mult:0}}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}: other allies cleansed and given 3..8 Mana, caster none, 3 Bomb Gems`,()=>{
  const f=setup({...base,side,allies:[{manaCost:30,statuses:[{id:'silence',turns:3}]},{manaCost:30}]});const ev=f.cast();
  for(const a of f.allies){expect(a.mana).toBeGreaterThanOrEqual(3);expect(a.mana).toBeLessThanOrEqual(8);expect(a.statuses).toEqual([]);}
  expect(f.caster.mana).toBe(0);expect(specials(ev,'bomb').length).toBe(3);
 });
 it('range covers 3..8 over seeds; capped at mana cost',()=>{
  const seen=new Set<number>();for(let seed=1;seed<=60;seed++){const f=setup({...base,seed,allies:[{manaCost:30}]});f.cast();seen.add(f.allies[0].mana);}
  expect(Math.min(...seen)).toBe(3);expect(Math.max(...seen)).toBe(8);
  const g=setup({...base,allies:[{manaCost:5,mana:4}]});g.cast();expect(g.allies[0].mana).toBe(5);
 });
 refusal(base);
});

// ——— troop:7361 Geryon / spell 9001 ———
describe('L3 troop:7361/spell:9001 Green->Blue, Purple->Doomskulls, drain 2 Mana from all enemies',()=>{
 const base={skill:'9001',cost:20,colors:[BaseColor.Yellow,BaseColor.Brown],board:pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]),
  enemies:[{mana:9,manaCost:20},{mana:1,manaCost:20},{mana:0},{mana:20,manaCost:20}]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7361,9001,20,base.colors,'Convert Green Gems to Blue, and convert Purple Gems to Doomskulls. Drain 2 Mana from all Enemies.',
   [{Target:'Self',Color1:'Green',Amount:100,Color2:'Blue',Type:'ConvertGems'},{Color1:'Purple',Amount:100,Color2:'Doomskull',Type:'ConvertGems'},
    {Target:'AllEnemies',Amount:2,Type:'DecreaseMana'}],
   '将绿色宝石转换成蓝色，将紫色宝石转换成末日骷髅头。耗掉所有敌人 2 点法力值。','None');
  expect(registry.prototypes.get('9001')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'Blue'}},
   {kind:'gem',params:{op:'transform',from:'Purple',to:'SKULL',toSpecial:'doomSkull'}},
   {kind:'reduce',target:'enemyAll',stat:'mana',scaling:{base:2,mult:0}}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 16 Green -> Blue, 16 Purple -> Doomskull, enemy mana 9/1/0/20 -> 7/0/0/18`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();const t=transforms(ev);
  expect(t.filter(x=>isC(x.from,BaseColor.Green)&&isC(x.to,BaseColor.Blue))).toHaveLength(16);
  expect(t.filter(x=>isC(x.from,BaseColor.Purple)&&isS(x.to,'doomSkull'))).toHaveLength(16);expect(t).toHaveLength(32);
  expect(f.enemies.map(e=>e.mana)).toEqual([7,0,0,18]);expect(f.caster.mana).toBe(0);turnAfter(f,ev,false);
 });
 it('Blessed / Mana Shield enemies keep their mana; no Green / Purple on board -> no conversions',()=>{
  const f=setup({...base,enemies:[{mana:9,statuses:[{id:'blessed',turns:3}]},{mana:9,traitIds:['manashield']},{mana:9},{}]});f.cast();
  expect(f.enemies.map(e=>e.mana)).toEqual([9,9,7,0]);
  const g=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Red,BaseColor.Brown])});expect(transforms(g.cast())).toHaveLength(0);
 });
 refusal(base);
});

// ——— troop:7486 Groevanga / spell 9219 ———
describe('L3 troop:7486/spell:9219 chosen colour -> Good Gargoyles; [(Magic x 1.5)+4] to enemies of that colour; extra turn',()=>{
 const base={skill:'9219',cost:24,colors:[BaseColor.Blue,BaseColor.Yellow,BaseColor.Brown],
  enemies:[{colors:[BaseColor.Purple]},{colors:[BaseColor.Red,BaseColor.Green]},{colors:[BaseColor.Purple,BaseColor.Blue]},{colors:[BaseColor.Brown]}]};
 const cast=(f:ReturnType<typeof setup>,c:BaseColor)=>{f.engine.setColorChooser(new FixedColorChooser(c));return f.cast();};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7486,9219,24,base.colors,'Convert all Gems of a chosen Color to Good Gargoyle Gems. Deal [(Magic x 1.5) + 4] damage to all Enemies of that Mana Color. Gain an extra turn.',
   [{Color1:'FromTarget',Amount:100,Color2:'GoodGargoyle',Type:'ConvertGems'},
    {SpellPowerMultiplier:1.5,Target:'FromManaColorEnemy',Amount:4,Primarypower:true,Type:'Damage'},{Target:'Self',Type:'ExtraTurn'}],
   '将所有选定颜色的宝石转换成善石像鬼宝石。对所有拥有其法力颜色的敌人造成 [(魔法 x 1.5) + 4] 点伤害。获得一个额外回合。','ManaGemsOnly');
  expect(registry.prototypes.get('9219')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL',toSpecial:'gargoyleGem'}},
   {kind:'damage',target:'enemyAll',scaling:{base:4,mult:1.5},range:'all',ifCond:{kind:'targetColor',color:'CHOSEN'}},{kind:'extraTurn'}]});
 });
 for(const side of SIDES)for(const [magic,dmg] of [[0,4],[3,9],[10,19]] as const)it(`real cast side=${side} magic=${magic}: Purple chosen -> 16 Good Gargoyles; enemies 10 and 12 take ${dmg} (round, convention:R006-C1); extra turn`,()=>{
  const f=setup({...base,side,magic});const ev=cast(f,BaseColor.Purple);const t=transforms(ev);
  expect(t).toHaveLength(16);expect(t.every(x=>isC(x.from,BaseColor.Purple)&&isS(x.to,'gargoyleGem')&&x.to.kind==='special'&&(x.to.spec.tier??1)===1)).toBe(true);
  expect(f.loss()).toEqual([dmg,0,dmg,0]);turnAfter(f,ev,true);
 });
 it('colour with no matching enemy: gems converted, nobody damaged, extra turn still; frozen caster -> no spell extra turn',()=>{
  const f=setup({...base});const ev=cast(f,BaseColor.Yellow);expect(transforms(ev)).toHaveLength(16);expect(f.loss()).toEqual([0,0,0,0]);turnAfter(f,ev,true);
  const g=setup({...base,caster:{statuses:[{id:'frozen',turns:3}]}});expect(skillExtra(cast(g,BaseColor.Purple))).toBe(0);
 });
 refusal(base);
});

// ——— troop:7400 Cinderhand Goblin / spell 9050 ———
describe('L3 troop:7400/spell:9050 convert 5 Green Gems to Burning Gems; extra turn',()=>{
 const base={skill:'9050',cost:10,colors:[BaseColor.Red,BaseColor.Yellow],board:pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7400,9050,10,base.colors,'Convert 5 Green Gems to Burning Gems. Gain an extra turn.',
   [{Color1:'Green',Amount:5,Color2:'Burning',Type:'ConvertGems'},{Target:'Self',Type:'ExtraTurn'}],
   '将 5 颗绿色宝石转换成燃烧宝石。获得一个额外回合。','None');
  expect(registry.prototypes.get('9050')).toEqual({segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL',toSpecial:'burningGem',count:{base:5,mult:0}}},{kind:'extraTurn'}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: exactly 5 Green -> Burning Gems, skill extra turn`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();const t=transforms(ev);
  expect(t).toHaveLength(5);expect(t.every(x=>isC(x.from,BaseColor.Green)&&isS(x.to,'burningGem'))).toBe(true);turnAfter(f,ev,true);
 });
 it('only 3 Green on board -> 3 converted; none -> 0, extra turn regardless; frozen caster -> no spell extra turn',()=>{
  const three:BoardFn=(r,c)=>colorGem((r+c)%4===0&&r*8+c<12?BaseColor.Green:[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown][(r+c)%4]);
  const a=setup({...base,board:three});expect(transforms(a.cast())).toHaveLength(3);
  const b=setup({...base,board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])});const eb=b.cast();expect(transforms(eb)).toHaveLength(0);turnAfter(b,eb,true);
  const c=setup({...base,caster:{statuses:[{id:'frozen',turns:3}]}});expect(skillExtra(c.cast())).toBe(0);
 });
 refusal(base);
});
