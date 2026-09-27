// Seven separately bound GoW troop spells: English/native source clauses and actual battle entry.
// @ts-expect-error Node-only original snapshots
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Node original spell index
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide,colorGem,specialGem} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:7328,spell:8940,cost:12,colors:[BaseColor.Green,BaseColor.Red],text:'Convert all Brown Gems to Web Gems.',steps:[{Type:'ConvertGems',Color1:'Brown',Color2:'Web',Amount:100}],segments:[{kind:'gem',params:{op:'transform',from:'Brown',to:'SKULL',toSpecial:'web'}}]},
 {id:6584,spell:7788,cost:16,colors:[BaseColor.Blue,BaseColor.Yellow],text:'Deal [Magic + 10] scatter damage. If there is a Storm, deal triple damage.',steps:[{Type:'ScatterDamage',Target:'AllEnemies',Amount:10,SpellPowerMultiplier:1,StatusModifier:'MultiplyForAnyStorm',StatusAmount:3}],segments:[{kind:'damage',target:'enemyAll',range:'scatter',scaling:{base:10,mult:1},condMult:{times:3,cond:{kind:'stormPresent'}}}]},
 {id:6220,spell:7362,cost:13,colors:[BaseColor.Red,BaseColor.Brown],text:'Deal [Magic + 2] damage to all Enemies, and then Burn them.',steps:[{Type:'Damage',Target:'AllEnemies',Amount:2,SpellPowerMultiplier:1},{Type:'CauseBurning',Target:'AllEnemies',Amount:1}],segments:[{kind:'damage',target:'enemyAll',range:'all',scaling:{base:2,mult:1}},{kind:'status',target:'enemyAll',statusId:'burning',turns:3,magnitude:3}]},
 {id:6420,spell:7593,cost:8,colors:[BaseColor.Green,BaseColor.Purple],text:'Faerie Fire an enemy. Gain an extra turn.',steps:[{Type:'CauseFaerieFire',Target:'FromTarget',Amount:1},{Type:'ExtraTurn',Target:'Self'}],segments:[{kind:'status',target:'enemyChosen',statusId:'faerie-fire',turns:3},{kind:'extraTurn'}]},
 {id:6612,spell:7936,cost:12,colors:[BaseColor.Red,BaseColor.Yellow],text:'Transform Green Gems to Purple. Enchant the strongest Ally.',steps:[{Type:'ConvertGems',Color1:'Green',Color2:'Purple',Amount:100},{Type:'CauseEnchanted',Target:'StrongestAlly',Amount:1}],segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'Purple'}},{kind:'status',target:'allyHealthiest',statusId:'enchanted',turns:3}]},
 {id:6820,spell:8224,cost:12,colors:[BaseColor.Green,BaseColor.Purple],text:'Convert Blue Gems to Red. Inflict Bleed on the strongest Enemy.',steps:[{Type:'ConvertGems',Color1:'Blue',Color2:'Red',Amount:100},{Type:'CauseBleed',Target:'StrongestEnemy'}],segments:[{kind:'gem',params:{op:'transform',from:'Blue',to:'Red'}},{kind:'status',target:'enemyHealthiest',statusId:'bleed',turns:3,magnitude:1}]},
 {id:6944,spell:8425,cost:9,colors:[BaseColor.Red,BaseColor.Yellow],text:'Deal [Magic + 6] damage to the last Enemy. Create 7 Yellow Gems.',steps:[{Type:'Damage',Target:'LastEnemy',Amount:6,SpellPowerMultiplier:1},{Type:'CreateGems',Color1:'Yellow',Amount:7}],segments:[{kind:'damage',target:'enemyLast',scaling:{base:6,mult:1}},{kind:'gem',params:{op:'create',gem:{kind:'color',color:'Yellow'},count:{base:7,mult:0}}}]},
] as const;
type Case=typeof cases[number];
function setup(c:Case,side:PlayerSide=PlayerSide.Left,magic=11,count=4){
 const f=damageFixture(0,0,Array.from({length:count},()=>({})));
 Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,new SeededRNG(42),f.ctx.nextGemId,registry);
 engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`worker01 troop:${c.id} spell:${c.spell} whole-cast`,()=>{
 it('independent English SpellId, cost, entity colours, full original SpellSteps, localized binding and all final segments',()=>{
  const en=english.find((v:{id:number})=>v.id===c.id)!,n=native.get(c.spell).raw,unit=TROOPS.find(v=>v.id===c.id)!;
  expect(en.SpellId).toBe(c.spell);expect(en.stats.spell.id).toBe(c.spell);expect(en.stats.spell.desc).toBe(c.text);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(x=>`Color${x}`).sort());
  expect(n.Id).toBe(c.spell);expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(c.steps.length);
  c.steps.forEach((step,i)=>expect(n.SpellSteps[i]).toMatchObject(step));
  expect(unit).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(unit.spell.description.length).toBeGreaterThan(6);
  expect(registry.prototypes.get(String(c.spell))).toEqual({segments:c.segments});
 });
 for(const reason of ['low-mana','silence'] as const)it(`${reason}: atomic no-cast across all steps`,()=>{
  const f=setup(c);if(reason==='low-mana')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  const gem=f.board.get({row:1,col:1})?.type;
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(reason==='low-mana'?c.cost-1:c.cost);
  expect(f.board.get({row:1,col:1})?.type).toEqual(gem);expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
 });
});
for(const c of cases.filter(x=>[7328,6612,6820].includes(x.id)))describe(`worker01 gem transform ${c.id}`,()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const n of [0,1,6])it(`${side} exactly ${n} source gems, unrelated gems untouched before board resolution`,()=>{
  const f=setup(c,side);for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
  const origin=c.id===7328?BaseColor.Brown:c.id===6612?BaseColor.Green:BaseColor.Blue;
  for(let i=0;i<n;i++)f.board.set({row:i,col:2},{id:200+i,type:colorGem(origin)});
  f.board.set({row:7,col:7},{id:300,type:colorGem(BaseColor.Red)});
  f.board.set({row:7,col:6},{id:301,type:specialGem('web')});
  if(c.id===6612){const ally=damageCharacter(1,{hp:1100,maxHp:1200});f.state.teams[side].characters.push(ally);}
  if(c.id===6820){f.enemies[3].hp=1200;f.enemies[3].maxHp=1200;}
  const ev=f.cast(),changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
  expect(changes.filter(v=>v.from.kind==='color'&&v.from.color===origin)).toHaveLength(n);
  expect(changes.filter(v=>v.from.kind==='color'&&v.from.color===origin).map(v=>v.pos)).toEqual(Array.from({length:n},(_,i)=>({row:i,col:2})));
  for(const x of changes.filter(v=>v.from.kind==='color'&&v.from.color===origin)){
   if(c.id===7328)expect(x.to).toEqual(specialGem('web'));
   else expect(x.to).toEqual(colorGem(c.id===6612?BaseColor.Purple:BaseColor.Red));
  }
  expect(changes.some(v=>v.gemId===300||v.gemId===301)).toBe(false);
  if(c.id===6612)expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='enchanted'?[e.targetId]:[])).toEqual([1]);
  if(c.id===6820)expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='bleed'?[e.targetId]:[])).toEqual([13]);
  expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);expect(f.caster.mana).toBeLessThanOrEqual(c.cost);expect(f.state.actionLog).toHaveLength(1);
 });
});
for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,11])it(`troop:6220 ${side} Magic=${magic}: one hit per living enemy then independently burn each`,()=>{
 const c=cases.find(x=>x.id===6220)!,f=setup(c,side,magic);
 const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual(f.enemies.map(e=>[e.id,magic+2]));
 expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='burning'?[e.targetId]:[])).toEqual(f.enemies.map(e=>e.id));
 expect(ev.findIndex(e=>e.type==='skill-damage')).toBeLessThan(ev.findIndex(e=>e.type==='status-apply'));
 expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).not.toBe(side);
});
it('troop:6220 barrier absorbs only its own hit; native burn rider can still apply',()=>{
 const c=cases.find(x=>x.id===6220)!,f=setup(c);f.enemies[1].statuses=[{id:'barrier',turns:3}];
 const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([10,12,13]);
 expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='burning'?[e.targetId]:[])).toEqual([10,11,12,13]);
});
for(const side of [PlayerSide.Left,PlayerSide.Right])it(`troop:6420 ${side}: Faerie Fire a chosen enemy and keep action by explicit ExtraTurn`,()=>{
 const c=cases.find(x=>x.id===6420)!,f=setup(c,side);const ev=f.cast();
 expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='faerie-fire'?[e.targetId]:[])).toEqual([12]);
 expect(ev.some(e=>e.type==='skill-damage')).toBe(false);expect(ev.some(e=>e.type==='extra-turn')).toBe(true);
 expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(side);expect(f.state.actionLog).toHaveLength(1);
});
it('troop:6420 faerie-fire immunity blocks status without removing native self extra turn',()=>{
 const c=cases.find(x=>x.id===6420)!,f=setup(c);f.enemies[2].statuses=[{id:'blessed',turns:3}];
 const ev=f.cast();expect(ev.filter(e=>e.type==='status-apply'&&e.statusId==='faerie-fire')).toEqual([]);
 expect(ev.some(e=>e.type==='extra-turn')).toBe(true);
});
for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,11])it(`troop:6944 ${side} Magic=${magic}: last enemy damage, then 7 yellow gems`,()=>{
 const c=cases.find(x=>x.id===6944)!,f=setup(c,side,magic);
 const ev=f.cast(),hits=ev.filter(e=>e.type==='skill-damage');
 expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[13,magic+6]]);
 const created=ev.filter(e=>e.type==='gem-create').flatMap(e=>e.type==='gem-create'?e.spawns:[]);
 const changed=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
 expect(created.length+changed.length).toBe(7);
 expect(created.every(v=>v.gemType.kind==='color'&&v.gemType.color===BaseColor.Yellow)).toBe(true);
 expect(changed.every(v=>v.to.kind==='color'&&v.to.color===BaseColor.Yellow)).toBe(true);
 expect(ev.indexOf(hits[0])).toBeLessThan(ev.findIndex(e=>e.type==='gem-create'||e.type==='gem-transform'));
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
});
it('troop:6944 pre-defeated last enemy makes next living last target',()=>{
 const c=cases.find(x=>x.id===6944)!,f=setup(c);f.enemies[3].hp=0;f.enemies[3].defeated=true;
 expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([12]);
});
for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,11])for(const hasStorm of [false,true])it(`troop:6584 ${side} M=${magic} storm=${hasStorm}: triple one scatter pool`,()=>{
 const c=cases.find(x=>x.id===6584)!,f=setup(c,side,magic);
 if(hasStorm)f.state.teams[side].storm={color:BaseColor.Blue,turns:3,troopId:f.caster.id};
 const ev=f.cast(),hits=ev.filter(e=>e.type==='skill-damage');
 expect(hits.length).toBeGreaterThan(0);expect(hits.every(e=>f.enemies.some(v=>v.id===e.targetId))).toBe(true);
 expect(hits.reduce((sum,e)=>sum+e.damage,0)).toBe((10+magic)*(hasStorm?3:1));
 expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
});
it('troop:6584 storm on opponent is also a Storm; only surviving enemy receives scatter',()=>{
 const c=cases.find(x=>x.id===6584)!,f=setup(c,PlayerSide.Left,11);
 f.state.teams.Right.storm={color:BaseColor.Red,turns:3,troopId:10};f.enemies.slice(1).forEach(v=>{v.defeated=true;v.hp=0;});
 const ev=f.cast(),hits=ev.filter(e=>e.type==='skill-damage');
 expect(hits.reduce((sum,e)=>sum+e.damage,0)).toBe(63);
 expect(hits.every(e=>e.targetId===10)).toBe(true);
});


