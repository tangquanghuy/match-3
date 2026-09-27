// Entity-bound real-cast checks for two independent native spells (6078/6186).
// @ts-expect-error saved source JSON reader
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error native saved-source reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { TROOPS } from '../../src/data/troops';
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(id:6078|6186,side=PlayerSide.Left,magic=10){
 const f=damageFixture();const config=id===6078?{spell:7148,cost:15,colors:[BaseColor.Blue,BaseColor.Red]}:{spell:7327,cost:6,colors:[BaseColor.Blue]};
 Object.assign(f.caster,{skillId:String(config.spell),mana:config.cost,manaCost:config.cost,colors:config.colors,magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;if(id===6186)engine.setTargetChooser({choose:()=>11});
 return {...f,config,cast:()=>engine.castSkill(f.caster.id)};
}
for(const id of [6078,6186] as const)describe(`troop:${id} entity-specific full cast`,()=>{
 const spell=id===6078?7148:7327,cost=id===6078?15:6;
 it('saved English/native, localized catalog, exact binding, all native steps and registered implementation',()=>{
  const original=english.find((t:{id:number})=>t.id===id)!,steps=native.get(spell).raw.SpellSteps,unit=TROOPS.find(t=>t.id===id)!;
  expect(original.stats.spell.id).toBe(spell);expect(original.ManaCost).toBe(cost);
  expect(original.stats.spell.desc).toBe(id===6078?'Deal [Magic + 1] true damage to all Enemies. Gain 16 Life.':'Deal [Magic + 1] damage to an enemy and Freeze them.');
  expect(Object.keys(original._ManaColors_parsed).sort()).toEqual(id===6078?['ColorBlue','ColorRed']:['ColorBlue']);
  expect(unit).toMatchObject({id,manaCost:cost,manaColors:id===6078?[BaseColor.Blue,BaseColor.Red]:[BaseColor.Blue],spell:{id:spell}});
  expect(steps).toHaveLength(2);expect(steps.map((s:{Type:string})=>s.Type)).toEqual(id===6078?['TrueDamage','IncreaseHealth']:['Damage','CauseFrozen']);
  expect(steps[0]).toMatchObject({Target:id===6078?'AllEnemies':'FromTarget',Amount:1,SpellPowerMultiplier:1});
  expect(steps[1]).toMatchObject(id===6078?{Target:'Self',Amount:16}:{Target:'FromTarget',Amount:1});
  expect(registry.prototypes.get(String(spell))?.segments).toHaveLength(2);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])it(`real ${side}, magic ${magic}, all native steps in order`,()=>{
  const f=setup(id,side,magic),target=f.enemies[1];for(const enemy of f.enemies)enemy.armor=100;
  const events=f.cast();const hits=events.filter(e=>e.type==='skill-damage');
  if(id===6078){
   expect(hits.map(e=>[e.targetId,e.damage])).toEqual([10,11,12,13].map(targetId=>[targetId,magic+1]));
   expect(f.enemies.map(e=>e.hp)).toEqual(Array(4).fill(999-magic));expect(f.enemies.map(e=>e.armor)).toEqual(Array(4).fill(100));
   expect([f.caster.hp,f.caster.maxHp]).toEqual([1016,1016]);
   const heal=events.findIndex(e=>e.type==='buff'&&e.targetId===f.caster.id&&e.stat==='hp'&&e.maxHpGain===16);
   expect(heal).toBeGreaterThan(events.findIndex(e=>e.type==='skill-damage'));
  }else{
   expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[target.id,magic+1]]);
   expect(f.enemies.map(e=>e.armor)).toEqual([100,99-magic,100,100]);
   expect(events.flatMap(e=>e.type==='status-apply'&&e.statusId==='frozen'?[e.targetId]:[])).toEqual([target.id]);
   expect(events.findIndex(e=>e.type==='status-apply'&&e.statusId==='frozen')).toBeGreaterThan(events.findIndex(e=>e.type==='skill-damage'));
   expect(f.enemies.filter(e=>e.statuses.some(s=>s.id==='frozen')).map(e=>e.id)).toEqual(events.some(e=>e.type==='status-expire'&&e.targetId===target.id&&e.statusId==='frozen')?[]:[target.id]);
  }
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
 });
 it('dead targets, immunities/barrier and insufficient mana/silence do not invent effects',()=>{
  const f=setup(id);if(id===6078){f.enemies[3].hp=0;f.enemies[3].defeated=true;f.enemies[0].armor=200;
   const hits=f.cast().filter(e=>e.type==='skill-damage');expect(hits.map(e=>e.targetId)).toEqual([10,11,12]);
   expect(f.enemies[0].hp).toBe(989);expect(f.enemies[0].armor).toBe(200);expect([f.caster.hp,f.caster.maxHp]).toEqual([1016,1016]);
  }else{f.enemies[1].statuses=[{id:'barrier',turns:3}];f.enemies[1].traitIds=['immune-frozen'];
   const events=f.cast();expect(f.enemies[1].hp).toBe(1000);expect(events.some(e=>e.type==='skill-damage'&&e.targetId===11)).toBe(false);
  }
  for(const blocked of ['low','silence'] as const){const b=setup(id);if(blocked==='low')b.caster.mana=cost-1;else b.caster.statuses=[{id:'silence',turns:3}];
   expect(b.cast()).toEqual([]);expect(b.state.actionLog).toHaveLength(0);
  }
 });
});
