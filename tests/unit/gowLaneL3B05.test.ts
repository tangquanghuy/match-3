// Lane L3 batch B05 (sa-L3): turn / mana lane, stored-snapshot scope. Per-entity source/native/prototype
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
import weapons from '../../src/data/weapons.json';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
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

const reds=(n:number)=>{const over:Record<string,BaseColor>={};let k=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((r+c)%4===0&&k++>=n)over[`${r},${c}`]=BaseColor.Green;
 return pattern([BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown],over);};

// ——— troop:6427 Queen Titania / spell 7600 ———
describe('L3 troop:6427/spell:7600 [Magic+2] to all enemies boosted x4 by Red enemies and allies; extra turn if 13+ Red',()=>{
 const base={skill:'7600',cost:16,colors:[BaseColor.Red,BaseColor.Purple]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6427,7600,16,base.colors,'Deal [Magic + 2] damage to all enemies, boosted by Red enemies and allies. If there are 13 or more Red Gems, gain an extra turn. [x4]',
   [{Target:'AllAllies',Amount:400,Type:'CountArmyColor',Data:'2'},{Target:'AllEnemies',UseCounterForAmount:true,Amount:400,Type:'CountArmyColor',Data:'2'},
    {SpellPowerMultiplier:1,Target:'AllEnemies',UseCounterForAmount:true,Amount:2,Primarypower:true,Type:'Damage'},
    {StatusAmount:100,StatusModifier:'AddFor10RedGems',Type:'ExtraTurnConditional'}],
   '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方的红色军队数量而增强。如果板面上有 13 颗或更多红色宝石，则获得一个额外回合。 [x4]','None');
  expect(registry.prototypes.get('7600')).toEqual({segments:[
   {kind:'damage',target:'enemyAll',scaling:{base:2,mult:1},range:'all',modifier:{mod:{kind:'multiplier',a:4},sources:[{kind:'alliesOfColor',color:'Red'},{kind:'enemiesOfColor',color:'Red'}]}},
   {kind:'extraTurn',ifCond:{kind:'boardAtLeast',color:'Red',n:13}}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: caster + 1 Red ally + 2 Red enemies -> each enemy takes ${magic+2}+16; 16 Red -> extra turn`,()=>{
  const f=setup({...base,side,magic,board:reds(16),allies:[{colors:[BaseColor.Red]},{colors:[BaseColor.Blue]}],enemies:[{colors:[BaseColor.Red]},{colors:[BaseColor.Green]},{colors:[BaseColor.Blue,BaseColor.Red]},{colors:[BaseColor.Blue]}]});
  const ev=f.cast();const d=magic+2+16;expect(f.loss()).toEqual([d,d,d,d]);turnAfter(f,ev,true);
 });
 it('R003 threshold 13 Red -> extra turn, 12 -> none; dead Red troops not counted; armor absorbs',()=>{
  const a=setup({...base,board:reds(13),colors:[BaseColor.Purple]});const ea=a.cast();turnAfter(a,ea,true);
  const b=setup({...base,board:reds(12),magic:0,colors:[BaseColor.Purple],allies:[{colors:[BaseColor.Red],hp:0,defeated:true}],enemies:[{colors:[BaseColor.Red],hp:0,defeated:true},{armor:1,colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]}]});
  const eb=b.cast();turnAfter(b,eb,false);expect(b.loss()).toEqual([0,1,2,2]);
 });
 it('frozen caster: damage lands, no spell extra turn',()=>{
  const f=setup({...base,board:reds(16),caster:{statuses:[{id:'frozen',turns:3}]},enemies:[{colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]},{colors:[BaseColor.Blue]}]});const ev=f.cast();expect(skillExtra(ev)).toBe(0);expect(f.loss()[0]).toBe(12+4);
 });
 refusal({...base,board:reds(16)});
});

// ——— troop:7198 Natureborn Hunter / spell 8785 (draft: L3-014) ———
describe('L3 troop:7198/spell:8785 1 Elemental Star + boosts [3:1]; extra turn if an enemy Beast',()=>{
 const base={skill:'8785',cost:12,colors:[BaseColor.Blue,BaseColor.Green]};
 const G=pattern([BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 it('source/native/prototype/display binding',()=>{
  troopBinding(7198,8785,12,base.colors,'Create 1 Elemental Star, +1 more for every 3 Green Allies and +1 more for every 3 Green Gems. If the Enemy has a Beast, gain an extra turn. [3:1]',
   [{Target:'AllAllies',Amount:34,Type:'CountArmyColor',Data:'1'},{Color1:'Green',Amount:34,Type:'CountGems'},
    {UseCounterForAmount:true,Color1:'ElementalStar',Amount:1,Type:'CreateGems'},{StatusAmount:100,StatusModifier:'AddIfEnemyHasBeast',Type:'ExtraTurnConditional'}],
   '创建 1 颗元素星，数量因绿色盟友数和绿色宝石数而增强。若敌人队伍中有野兽，则获得一个额外回合。 [3:1]','None');
 });
 for(const side of SIDES)it(`real cast side=${side}: 16 Green gems (floor(16x.34)=5) + caster Green (0) -> 6 Elemental Stars; enemy Beast -> extra turn`,()=>{
  const f=setup({...base,side,board:G,enemies:[{},{troopTypes:['Beast']},{},{}]});const ev=f.cast();
  expect(specials(ev,'elementalStar')).toHaveLength(6);turnAfter(f,ev,true);
 });
 it('no enemy Beast -> no extra turn; no Green anywhere -> exactly 1 star',()=>{
  const f=setup({...base,colors:[BaseColor.Blue],board:pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown])});f.caster.colors=[BaseColor.Blue];
  const ev=f.cast();expect(specials(ev,'elementalStar')).toHaveLength(1);expect(applied(ev)).toEqual([]);turnAfter(f,ev,false);
 });
 refusal({...base,board:G});
});

// ——— troop:6032 Satyr / spell 7032 (FIXED L3-017) ———
describe('L3 troop:6032/spell:7032 steal up to 2 Armor from the last enemy into Magic, then [Magic+4] to it; extra turn',()=>{
 const base={skill:'7032',cost:8,colors:[BaseColor.Green]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6032,7032,8,base.colors,'Steal 2 Armor from the last Enemy, and shift it to Magic, then deal [Magic + 4] damage. Gain an extra turn. [1:1]',
   [{Target:'LastEnemy',Amount:100,Type:'CountArmor'},{Amount:2,Type:'CountMax'},{Target:'LastEnemy',UseCounterForAmount:true,Type:'DecreaseArmor'},
    {Target:'Self',UseCounterForAmount:true,Type:'IncreaseSpellPower',Delay:1},{SpellPowerMultiplier:1,Target:'LastEnemy',Amount:4,Primarypower:true,Type:'Damage'},
    {Target:'Self',Type:'ExtraTurn'}],
   '对最后一名敌人造成 [魔法 + 4] 点伤害。窃取 2 点护甲值并将之转为魔力值。获得一个额外回合。 [1:1]','None');
  expect(registry.prototypes.get('7032')).toEqual({segments:[
   {kind:'reduce',target:'enemyLast',stat:'armor',scaling:{base:2,mult:0},gainStat:'magic'},
   {kind:'damage',target:'enemyLast',scaling:{base:4,mult:1}},{kind:'extraTurn'}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: last enemy armor 5 -> 3, caster Magic +2, then ${magic+6} hits armor 3 first; extra turn`,()=>{
  const f=setup({...base,side,magic,enemies:[{},{},{},{armor:5}]});const ev=f.cast();
  expect(f.caster.magic).toBe(magic+2);const dmg=magic+6;
  expect(f.enemies[3].armor).toBe(Math.max(0,3-dmg));expect(f.loss()).toEqual([0,0,0,Math.max(0,dmg-3)]);turnAfter(f,ev,true);
 });
 it('CountMax 2: armor 1 -> +1 Magic; armor 0 -> +0; dead last enemy -> next living last; Webbed caster gains no Magic',()=>{
  const a=setup({...base,magic:0,enemies:[{},{},{},{armor:1}]});a.cast();expect(a.caster.magic).toBe(1);expect(a.loss()[3]).toBe(5);
  const b=setup({...base,magic:0});b.cast();expect(b.caster.magic).toBe(0);expect(b.loss()[3]).toBe(4);
  const c=setup({...base,magic:0,enemies:[{},{},{armor:2},{hp:0,defeated:true}]});c.cast();expect(c.enemies[2].armor).toBe(0);expect(c.loss()[2]).toBe(6);
  const d=setup({...base,magic:0,enemies:[{},{},{},{armor:2}],caster:{statuses:[{id:'web',turns:3}]}});d.cast();expect(d.enemies[3].armor).toBe(0);
 });
 refusal(base);
});

// ——— troop:6035 Blade Dancer / spell 7035 (FIXED L3-018) ———
describe('L3 troop:6035/spell:7035 [Magic+4] scatter boosted by all enemy Armor [2:1]; steal 4 Magic from a random enemy',()=>{
 const base={skill:'7035',cost:11,colors:[BaseColor.Green,BaseColor.Yellow]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(6035,7035,11,base.colors,'Deal [Magic + 4] scatter damage, boosted by all enemy Armor. Steal 4 Magic from a random Enemy. [2:1]',
   [{Target:'AllEnemies',Amount:50,Type:'CountArmor'},{SpellPowerMultiplier:1,Target:'AllEnemies',UseCounterForAmount:true,Amount:4,Primarypower:true,Type:'ScatterDamage'},
    {Type:'DelayUntilEffectsComplete'},{Type:'ResetTargets'},{Target:'RandomEnemy',Amount:4,Type:'StealMagic'}],
   '造成 [魔法 + 4] 点散射伤害，伤害值因所有敌人的护甲值而增强。窃取一名随机敌人 4 点魔力值。 [2:1]','None');
  const p=registry.prototypes.get('7035')!;
  expect(p.segments[1]).toEqual({kind:'reduce',target:'enemyRandom',stat:'magic',scaling:{base:4,mult:0},gainStat:'magic'});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: total removed = ${magic+4} + floor(armor 9 / 2) = ${magic+8}; one enemy Magic 11 -> 7, caster +4 Magic, no mana moved`,()=>{
  const f=setup({...base,side,magic,enemies:[{armor:3,mana:5},{armor:6,mana:5},{mana:5},{mana:5}]});
  const start=f.enemies.map(e=>e.hp+e.armor);const ev=f.cast();
  expect(f.enemies.reduce((a,e,i)=>a+start[i]-e.hp-e.armor,0)).toBe(magic+8);
  expect(f.enemies.map(e=>e.magic).sort((a,b)=>a-b)).toEqual([7,11,11,11]);expect(f.caster.magic).toBe(magic+4);
  expect(f.enemies.every(e=>e.mana===5)).toBe(true);expect(f.caster.mana).toBe(0);turnAfter(f,ev,false);
 });
 it('steal clamps to the target Magic (2 -> +2); armor boost counts pre-damage armor only of living enemies',()=>{
  const f=setup({...base,magic:0,enemies:[{magic:2},{hp:0,defeated:true,magic:2,armor:40},{hp:0,defeated:true,magic:2},{hp:0,defeated:true,magic:2}]});
  const ev=f.cast();expect(f.enemies[0].magic).toBe(0);expect(f.caster.magic).toBe(2);expect(f.loss()[0]).toBe(4);turnAfter(f,ev,false);
 });
 refusal(base);
});

// ——— weapon:1226 Doomed Blade / spell 7952 (FIXED L3-015, L3-016) ———
describe('L3 weapon:1226/spell:7952 [Magic+3] to all (+1 per Tempering), Red -> Doomskulls, +5 Doomskulls if an enemy Doom, 3 Mana per Blue enemy',()=>{
 const base={skill:'7952',cost:18,colors:[BaseColor.Blue]};
 // No Red on the board unless stated: conversions / creation cannot trigger cascades that feed mana.
 const B=pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);
 const manaBuff=(ev:GameEvent[])=>ev.filter(e=>e.type==='buff'&&e.stat==='mana'&&e.targetId===0).reduce((a,e)=>a+(e.type==='buff'?e.amount:0),0);
 it('source/native/numeric + gw_ binding/prototype/display',()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===1226)!,w=weapons.find(v=>v.id===1226)!,n=native.get(7952).raw;
  expect(o).toMatchObject({SpellId:7952,ManaCost:18,ReferenceName:'DoomedBlade'});expect(Object.keys(o._ManaColors_parsed)).toEqual(['ColorBlue']);
  expect(o.stats.spell.desc).toBe('Deal [Magic + 3] damage to all Enemies, +1 per Tempering level. Transform Red Gems to Doomskulls, if the Enemy has a Doom, create 5 more. Gain 3 Mana for each Blue Enemy. [x3]');
  expect(n).toMatchObject({Cost:18,Target:'None'});
  expect(n.SpellSteps).toEqual([{Target:'AllEnemies',Amount:300,Type:'CountArmyColor',Data:'0'},
   {SpellPowerMultiplier:1,Target:'AllEnemies',StatusAmount:1,Amount:3,Primarypower:true,StatusModifier:'AddForTempering',Type:'Damage'},
   {Color1:'Red',Amount:100,Color2:'Doomskull',Type:'ConvertGems'},{Target:'AllEnemies',StatusAmount:5,Color1:'Doomskull',StatusModifier:'AddIfEnemyHasDoom',Type:'CreateGems'},
   {Target:'Self',UseCounterForAmount:true,Type:'GenerateMana'}]);
  expect(w).toMatchObject({id:1226,referenceName:'DoomedBlade',manaCost:18,manaColors:['Blue'],spell:{id:7952}});
  expect(w.spell.description).toBe('对所有敌人造成 [魔法 + 3] 点伤害，每锻炼 1 个武器段位则 +1 点伤害值。将红色宝石转换成末日骷髅头。如果敌方有劫数，则再创造 5 颗。每有一名蓝色敌人则获得 3 点法力值。 [x3]');
  // sa-R7 (R001): the counted self-mana runs first (native CountArmyColor is step 0, before the Damage)
  const proto={segments:[
   {kind:'buff',target:'allySelf',stat:'mana',scaling:{base:0,mult:0},modifier:{mod:{kind:'multiplier',a:3},source:{kind:'enemiesOfColor',color:'Blue'}}},
   {kind:'damage',target:'enemyAll',scaling:{base:3,mult:1},range:'all',modifier:{mod:{kind:'multiplier',a:1},source:{kind:'tempering'}}},
   {kind:'gem',params:{op:'transform',from:'Red',to:'SKULL',toSpecial:'doomSkull'}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'doomSkull'}},count:{base:5,mult:0}},ifCond:{kind:'targetHasDoom'}}]};
  expect(registry.prototypes.get('7952')).toEqual(proto);expect(registry.prototypes.get('gw_DoomedBlade')).toEqual(proto);
 });
 for(const side of SIDES)for(const alias of ['7952','gw_DoomedBlade'])for(const magic of [0,10])
 it(`real cast ${side}/${alias}/magic=${magic}: all enemies -${magic+3} (tempering 0); 2 Blue enemies -> +6 Mana; no Doom -> no extra gems`,()=>{
  const f=setup({...base,skill:alias,side,magic,board:B,caster:{mana:30,manaCost:30},enemies:[{colors:[BaseColor.Blue]},{colors:[BaseColor.Red]},{colors:[BaseColor.Blue,BaseColor.Green]},{}]});
  const ev=f.cast();const d=magic+3;expect(f.loss()).toEqual([d,d,d,d]);
  expect(manaBuff(ev)).toBe(6);expect(created(ev)).toEqual([]);turnAfter(f,ev,false);
 });
 it('Red gems -> Doomskulls; an enemy Doom adds exactly 5 Doomskulls (no plain Skulls); no Blue enemy -> no mana buff',()=>{
  const f=setup({...base,magic:0,board:pattern([BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]),caster:{mana:30,manaCost:30},enemies:[{troopTypes:['Doom']},{},{},{}]});
  const ev=f.cast();const made=created(ev);
  expect(made.filter(t=>t.kind==='special'&&t.spec.kind==='doomSkull').length).toBe(16+5);expect(made.filter(t=>t.kind==='skull')).toHaveLength(0);
  expect(manaBuff(ev)).toBe(0);
 });
 it('tempering level 2 adds +2 damage; dead Blue enemy not counted',()=>{
  const f=setup({...base,magic:0,board:B,caster:{mana:30,manaCost:30,temperingLevel:2} as Partial<Character>,enemies:[{colors:[BaseColor.Blue],hp:0,defeated:true},{},{},{}]});
  const ev=f.cast();expect(f.loss()).toEqual([0,5,5,5]);expect(manaBuff(ev)).toBe(0);
 });
 refusal({...base,board:B});
});
