// Worker-03 independent entity-bound English/native/binding and full-cast branch checks.
// @ts-expect-error saved independent English snapshot
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error native RawData index
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { BaseColor, PlayerSide } from '@engine/types';
import { SeededRNG } from '@engine/rng';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';
import { TROOPS } from '../../src/data/troops';
import { attachPassives } from '@engine/traits';
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const reg=new ExtensionRegistry();registerSkillLibrary(reg.prototypes);
const configs={
  6186:{spell:7327,cost:6,colors:[BaseColor.Blue],literal:'Deal [Magic + 1] damage to an enemy and Freeze them.',zh:'对 1 名敌人造成 [魔法 + 1] 点伤害并将其冻结。'},
  6082:{spell:7152,cost:12,colors:[BaseColor.Red,BaseColor.Yellow],literal:'Give [Magic + 3] Attack and Armor to an Ally. If the Ally is a Mech, give double the effect.',zh:'给予一名盟友 [魔法 + 3] 点攻击力和护甲值。如果盟友是一名机械军队，则效果翻倍。'},
  6162:{spell:7288,cost:12,colors:[BaseColor.Blue,BaseColor.Green],literal:'Give an Ally [Magic + 2] Attack and Life. If the Ally is a Beast, give double the effect.',zh:'给予一名盟友 [魔法 + 2] 点攻击力和生命值。如果盟友是一名野兽军队，则效果翻倍。'},
  6102:{spell:7167,cost:9,colors:[BaseColor.Blue,BaseColor.Brown],literal:'Deal [Magic + 4] damage to an Enemy. If the Enemy dies, give 8 Armor to all Allies.',zh:'对 1 名敌人造成 [魔法 + 4] 点伤害。如果该敌人死亡，所有盟友可获得 8 点护甲值。'},
} as const;
type Key=keyof typeof configs;
function setup(id:Key,side=PlayerSide.Left,magic=10,target=11){
 const c=configs[id],f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,new SeededRNG(42),f.ctx.nextGemId,reg);engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(target));
 return {...f,c,cast:()=>engine.castSkill(f.caster.id)};
}
const steps:Record<Key,object[]>={
 6186:[{Type:'Damage',Target:'FromTarget',Amount:1,SpellPowerMultiplier:1},{Type:'CauseFrozen',Target:'FromTarget',Amount:1}],
 6082:[{Type:'IncreaseAttack',Target:'FromTarget',Amount:3,SpellPowerMultiplier:1,StatusModifier:'MultiplyForMech',StatusAmount:2},{Type:'IncreaseArmor',Target:'FromTarget',Amount:3,SpellPowerMultiplier:1,StatusModifier:'MultiplyForMech',StatusAmount:2}],
 6162:[{Type:'IncreaseAttack',Target:'FromTarget',Amount:2,SpellPowerMultiplier:1,StatusModifier:'MultiplyForBeast',StatusAmount:2},{Type:'IncreaseHealth',Target:'FromTarget',Amount:2,SpellPowerMultiplier:1,StatusModifier:'MultiplyForBeast',StatusAmount:2}],
 6102:[{Type:'Damage',Target:'FromTarget',Amount:4,SpellPowerMultiplier:1},{Type:'Delay'},{Type:'IncreaseArmor',Target:'AllAllies',StatusModifier:'AddForKill',StatusAmount:8}],
};
for(const id of [6186,6082,6162,6102] as const)describe(`worker03 troop:${id} whole native spell`,()=>{
 const c=configs[id];
 it('independent saved English and native RawData, localized catalog, registered segments, cost and colors',()=>{
  const a=en.find((t:{id:number})=>t.id===id)!,n=native.get(c.spell).raw,t=TROOPS.find(t=>t.id===id)!;
  expect(a.stats.spell).toMatchObject({id:c.spell,desc:c.literal});expect(a.ManaCost).toBe(c.cost);
  expect(Object.keys(a._ManaColors_parsed).sort()).toEqual(c.colors.map(v=>`Color${v}`).sort());
  expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(steps[id].length);
  for(let i=0;i<steps[id].length;i++)expect(n.SpellSteps[i]).toMatchObject(steps[id][i]);
  expect(t).toMatchObject({id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell,description:c.zh}});
  expect(reg.prototypes.has(String(c.spell))).toBe(true);
 });
 it('insufficient mana and silence block all native steps without action on both sides',()=>{
  for(const side of [PlayerSide.Left,PlayerSide.Right])for(const reason of ['low','silence']){
   const f=setup(id,side);const prior=f.enemies.map(e=>[e.hp,e.armor]);if(reason==='low')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.enemies.map(e=>[e.hp,e.armor])).toEqual(prior);
  }
 });
});
describe('worker03 troop:6186 selected victim damage then freeze',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])it(`side=${side} magic=${magic} exact ordered damage/frozen`,()=>{
  const f=setup(6186,side,magic);for(const enemy of f.enemies)enemy.armor=20;
  const ev=f.cast(),hits=ev.filter(e=>e.type==='skill-damage'),status=ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='frozen'?[[e.targetId,e.turns]]:[]);
  expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[11,magic+1]]);expect(f.enemies.map(e=>e.armor)).toEqual([20,19-magic,20,20]);
  expect(status).toEqual([[11,3]]);
  expect(ev.findIndex(e=>e.type==='status-apply'&&e.statusId==='frozen')).toBeGreaterThan(ev.findIndex(e=>e.type==='skill-damage'));
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
 });
 it('invulnerable immunity separately suppresses freeze but not spell damage',()=>{
  const f=setup(6186);f.enemies[1].traitIds=['invulnerable'];attachPassives(f.enemies[1]);f.enemies[1].armor=20;
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,11]]);
  expect(f.enemies[1].armor).toBe(9);expect(ev.filter(e=>e.type==='status-apply'&&e.statusId==='frozen')).toEqual([]);
  expect(f.enemies[1].statuses.some(s=>s.id==='frozen')).toBe(false);
 });
 it('Barrier absorbs damage without being misreported as freeze immunity',()=>{
  const f=setup(6186);f.enemies[1].statuses=[{id:'barrier',turns:3}];const ev=f.cast();
  expect(ev.some(e=>e.type==='skill-damage'&&e.targetId===11)).toBe(false);expect(f.enemies[1].hp).toBe(1000);
  expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='frozen'?[[e.targetId,e.turns]]:[])).toEqual([[11,3]]);
 });
 it('death on first hit leaves no living target for second status step',()=>{
  const f=setup(6186);f.enemies[1].hp=1;f.enemies[1].armor=0;const ev=f.cast();
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,11]]);
  expect(ev.some(e=>e.type==='defeat'&&e.characterId===11)).toBe(true);expect(ev.some(e=>e.type==='skill-damage'&&e.targetId===11&&e.resultingHp===0)).toBe(true);expect(ev.some(e=>e.type==='status-apply'&&e.targetId===11&&e.statusId==='frozen')).toBe(false);
 });
});
for(const id of [6082,6162] as const)describe(`worker03 troop:${id} ally chosen two native step buffs`,()=>{
 const race=id===6082?'Mech':'Beast',base=id===6082?3:2;
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])for(const match of [false,true])it(`side=${side} magic=${magic} ${race}=${match} chosen only`,()=>{
  const f=setup(id,side,magic,1);const ally=damageCharacter(1,{troopTypes:match?[race]:['Human'],attack:10,armor:8,hp:50,maxHp:50});
  f.state.teams[side].characters.push(ally);
  const other=damageCharacter(2,{attack:8,armor:7,hp:55,maxHp:55});f.state.teams[side].characters.push(other);
  const delta=(magic+base)*(match?2:1),ev=f.cast();expect(ally.attack).toBe(10+delta);
  if(id===6082)expect(ally.armor).toBe(8+delta);else expect([ally.hp,ally.maxHp]).toEqual([50+delta,50+delta]);
  expect([other.attack,other.armor,other.hp]).toEqual([8,7,55]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  expect(ev.filter(e=>e.type==='buff').map(e=>[e.targetId,e.stat])).toEqual(id===6082?[[1,'attack'],[1,'armor']]:[[1,'attack'],[1,'hp']]);
 });
});
describe('worker03 troop:6102 damage -> native delay -> conditional team armor',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])for(const killed of [false,true])it(`side=${side} magic=${magic} killed=${killed}`,()=>{
  const f=setup(6102,side,magic,11),ally=damageCharacter(1,{armor:7});f.state.teams[side].characters.push(ally);
  f.enemies[1].armor=0;f.enemies[1].hp=killed?magic+4:magic+5;
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,magic+4]]);
  expect(ev.some(e=>e.type==='defeat'&&e.characterId===11)).toBe(killed);expect(ev.some(e=>e.type==='skill-damage'&&e.targetId===11&&e.resultingHp===0)).toBe(killed);expect(f.caster.armor).toBe(killed?8:0);expect(ally.armor).toBe(killed?15:7);
  expect(ev.flatMap(e=>e.type==='buff'&&e.stat==='armor'?[e.targetId]:[]).sort()).toEqual(killed?[0,1]:[]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
 });
 it('already defeated ally does not receive kill armor',()=>{
  const f=setup(6102);f.enemies[1].hp=1;f.enemies[1].armor=0;
  const dead=damageCharacter(1,{defeated:true,armor:5,hp:0});f.state.teams.Left.characters.push(dead);
  const ev=f.cast();expect(ev.some(e=>e.type==='defeat'&&e.characterId===11)).toBe(true);
  expect(dead.armor).toBe(5);expect(ev.some(e=>e.type==='buff'&&e.targetId===1)).toBe(false);
  expect(f.caster.armor).toBe(8);
 });
 it('Barrier prevents a kill and follow-up armor gain',()=>{
  const f=setup(6102);f.enemies[1].statuses=[{id:'barrier',turns:3}];const ev=f.cast();
  expect(f.enemies[1].defeated).toBe(false);expect(f.caster.armor).toBe(0);expect(ev.some(e=>e.type==='buff'&&e.stat==='armor')).toBe(false);
 });
});








