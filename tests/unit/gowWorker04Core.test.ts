// Worker-04 entity-scoped stored English/native bindings and real spell-entry signoff.
// @ts-expect-error Stored source fixture is Node-readable in Vitest.
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Native step index is an MJS snapshot reader.
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageCharacter,damageFixture} from '../helpers/damageFixture';
import {setGoldForSide,goldForSide} from '@engine/battleGold';
import {TROOPS} from '../../src/data/troops';
const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:6619,spell:7946,cost:7,colors:[BaseColor.Red],desc:'Gain 20 Gold.',steps:[{Type:'GiveGold',Target:'Self',Amount:20}],segments:[{kind:'gainEconomy',currency:'gold',scaling:{base:20,mult:0}}]},
 {id:6107,spell:7175,cost:11,colors:[BaseColor.Purple,BaseColor.Brown],desc:'Eliminate all Armor from an Enemy, and deal [Magic + 4] damage.',steps:[{Type:'DecreaseArmor',Target:'FromTarget',Amount:10001},{Type:'Damage',Target:'FromTarget',Amount:4,SpellPowerMultiplier:1,Primarypower:true}],segments:[{kind:'reduce',target:'enemyChosen',stat:'armor',scaling:{base:0,mult:0},drainAll:true},{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1}}]},
 {id:6635,spell:7960,cost:10,colors:[BaseColor.Red,BaseColor.Yellow],desc:"Deal [Magic + 2] damage to an Enemy. If the Enemy's Attack is greater, deal double damage.",steps:[{Type:'Damage',Target:'FromTarget',Amount:2,SpellPowerMultiplier:1,Primarypower:true,StatusAmount:2,StatusModifier:'MultiplyForMoreAttackOnTarget'}],segments:[{kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1},condMult:{times:2,cond:{kind:'targetStatBeatsCaster',stat:'attack'}}}]},
 {id:6611,spell:7935,cost:12,colors:[BaseColor.Red,BaseColor.Purple],desc:'Deal [Magic + 1] true damage to an enemy. Deal double damage if the enemy has a status effect.',steps:[{Type:'TrueDamage',Target:'FromTarget',Amount:1,SpellPowerMultiplier:1,Primarypower:true,StatusAmount:2,StatusModifier:'MultiplyForAnyStatusEffect'}],segments:[{kind:'damage',target:'enemyChosen',scaling:{base:1,mult:1},trueDamage:true,condMult:{times:2,cond:{kind:'targetHasAnyStatus'}}}]},
 {id:7227,spell:8822,cost:12,colors:[BaseColor.Blue,BaseColor.Brown],desc:'Give [Magic + 1] Armor to an Ally. If they are Mech, triple the  effect.',steps:[{Type:'IncreaseArmor',Target:'FromTarget',Amount:1,SpellPowerMultiplier:1,Primarypower:true,StatusAmount:3,StatusModifier:'MultiplyForMech'}],segments:[{kind:'buff',target:'allyChosen',stat:'armor',scaling:{base:1,mult:1},raceDouble:'Mech',raceTimes:3}]},
] as const;
const other=(s:PlayerSide)=>s===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
function fixture(c:typeof cases[number],side:PlayerSide,magic=10){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),manaCost:c.cost,mana:c.cost,colors:[...c.colors],magic,attack:17});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(c.id===7227?1:12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id} / ${c.spell} worker-04`,()=>{
 it('English full text, native ordered steps and entity cost/color, Chinese and prototype',()=>{
  const en=original.find((t:{id:number})=>t.id===c.id)!;
  const troop=TROOPS.find(t=>t.id===c.id)!;
  const n=native.get(c.spell).raw;
  expect(en.stats.spell.id).toBe(c.spell);expect(en.stats.spell.desc).toBe(c.desc);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(color=>`Color${color}`).sort());
  expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(c.steps.length);
  c.steps.forEach((step,i)=>expect(n.SpellSteps[i]).toMatchObject(step));
  expect(troop).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(troop.spell.description).toEqual(expect.any(String));expect(troop.spell.description.trim().length).toBeGreaterThan(4);
  expect(registry.prototypes.get(String(c.spell))).toEqual({segments:c.segments});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`real entry ${side}: positive/negative branches`,()=>{
  if(c.id===6619){
   for(const magic of [0,11]){const f=fixture(c,side,magic);setGoldForSide(f.state,side,3);setGoldForSide(f.state,other(side),11);
    const ev=f.cast();expect(goldForSide(f.state,side)).toBe(23);expect(goldForSide(f.state,other(side))).toBe(11);
    expect(ev.some(e=>e.type==='skill-damage')).toBe(false);expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);expect(f.state.activePlayer).toBe(other(side));}
  }
  if(c.id===6107)for(const magic of [0,1,10])for(const armor of [0,10,25]){
   const f=fixture(c,side,magic),target=f.enemies[2];target.armor=armor;
   const ev=f.cast();expect(target.armor).toBe(0);expect(target.hp).toBe(1000-magic-4);
   expect(f.enemies.filter(x=>x.hp!==1000)).toEqual([target]);expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);
   expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(other(side));
  }
  if(c.id===6635)for(const magic of [0,1,10,11])for(const attack of [16,17,18])for(const armor of [0,10]){
   const f=fixture(c,side,magic),target=f.enemies[2];target.attack=attack;target.armor=armor;
   f.cast();const damage=(magic+2)*(attack>17?2:1),blocked=Math.min(armor,damage);
   expect(target.armor).toBe(armor-blocked);expect(target.hp).toBe(1000-(damage-blocked));
   expect(f.enemies.filter(x=>x.hp!==1000)).toEqual(target.hp===1000?[]:[target]);expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(other(side));
  }
  if(c.id===6611)for(const magic of [0,1,10,11])for(const affected of [false,true])for(const armor of [0,25]){
   const f=fixture(c,side,magic),target=f.enemies[2];target.armor=armor;
   if(affected)target.statuses=[{id:'silence',turns:3}];
   f.cast();expect(target.hp).toBe(1000-(magic+1)*(affected?2:1));expect(target.armor).toBe(armor);
   expect(f.enemies.filter(x=>x.hp!==1000)).toEqual([target]);expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(other(side));
  }
  if(c.id===7227)for(const magic of [0,1,10])for(const race of ['Human','Mech'] as const){
   const f=fixture(c,side,magic),ally=damageCharacter(1,{armor:4,troopTypes:[race]});
   f.state.teams[side].characters.push(ally);
   f.cast();expect(ally.armor).toBe(4+(magic+1)*(race==='Mech'?3:1));expect(f.caster.armor).toBe(0);
   expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(other(side));
  }
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: no real cast / no economy or board cost`,()=>{
  const f=fixture(c,PlayerSide.Left);if(c.id===7227)f.state.teams.Left.characters.push(damageCharacter(1,{troopTypes:['Mech']}));
  if(c.id===6619)setGoldForSide(f.state,PlayerSide.Left,3);
  if(mode==='low-mana')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?c.cost-1:c.cost);
  if(c.id===6619)expect(goldForSide(f.state,PlayerSide.Left)).toBe(3);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
 });
});
