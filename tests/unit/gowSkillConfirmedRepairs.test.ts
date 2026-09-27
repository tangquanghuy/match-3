// @ts-expect-error node types are not installed
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide } from '@engine/types';
import type { SkillDamageEvent } from '@engine/events';
import { TROOPS } from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
import { spellDescription } from '../../src/data/combatText';

const sourceTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const sourceWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const nativeSpells=JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells;
function setup(kind:'troop'|'weapon',id:number,magic=11,enemyAttack=100) {
 const f=damageFixture(0,0,Array.from({length:4},()=>({attack:enemyAttack})));
 const entity=kind==='troop'?TROOPS.find(t=>t.spell.id===id)!:weapons.find(w=>w.spell.id===id)!;
 f.caster.skillId=kind==='troop'?String(id):`gw_${entity.referenceName}`;
 f.caster.mana=f.caster.manaCost=entity.manaCost;f.caster.magic=magic;
 const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser({choose:()=>12});engine.setColorChooser({choose:()=>BaseColor.Green});
 return {...f,engine,entity,cast:()=>engine.castSkill(f.caster.id)};
}
describe('independent snapshot regressions: first confirmed discrepancies',()=>{
 it('source clauses justify chosen target, souls, skulls and conditional damage',()=>{
  const text=(list:typeof sourceTroops,id:number)=>list.find((x:{stats:{spell:{id:number}}})=>x.stats.spell.id===id).stats.spell.desc;
  expect(text(sourceTroops,7004)).toBe('Deal [Magic + 2] damage to an Enemy.');
  expect(text(sourceTroops,7062)).toContain('Gain [Magic + 1] Soul(s).');
  expect(text(sourceWeapons,7129)).toBe('Create 6 Skulls. Summon a Revenant.');
  expect(text(sourceWeapons,7192)).toContain("If the Enemy's Attack is greater, deal 12 more damage.");
 });
 it.each([0,1,11,20])('Musketeer magic %i hits the chosen third enemy, not first',magic=>{
  const f=setup('troop',7004,magic);const hits=f.cast().filter((e):e is SkillDamageEvent=>e.type==='skill-damage');
  expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[12,magic+2]]);
  expect(f.enemies[0].hp).toBe(1000);
 });
 it.each([0,1,11,20])('Valkyrie magic %i restores the missing soul gain',magic=>{
  const f=setup('troop',7062,magic);const events=f.cast();
  expect(events.filter(e=>e.type==='economy-gain')).toEqual([expect.objectContaining({currency:'souls',amount:magic+1})]);
  expect(f.state.economy.souls).toBe(magic+1);
 });
 it('Skull of Nysha creates six skulls even when summon resolver is absent',()=>{
  const f=setup('weapon',7129);const ev=f.cast();
  const skulls=ev.flatMap(e=>e.type==='gem-create'?e.spawns.map(s=>s.gemType):e.type==='gem-transform'?e.changes.map(c=>c.to):[]);
  expect(skulls.filter(g=>g.kind==='skull')).toHaveLength(6);
  expect(spellDescription(7129,f.entity.spell.description)).toContain('6');
  expect(spellDescription(7129,f.entity.spell.description)).not.toContain('{1}');
 });
 it.each([0,16,17,18,100])('Kingslayer enemy attack %i vs caster17: strict condition, same hit',enemyAttack=>{
  const f=setup('weapon',7192,11,enemyAttack);f.enemies[2].armor=8;
  const hits=f.cast().filter((e):e is SkillDamageEvent=>e.type==='skill-damage');
  expect(hits).toHaveLength(1);expect(hits[0].targetId).toBe(12);
  expect(hits[0].damage).toBe(15+(enemyAttack>17?12:0));
  expect(f.enemies[2].hp).toBe(1000-(15+(enemyAttack>17?12:0)-8));
 });
 it('Byblios original steps include magic and the cursed-enemy counter on both reductions',()=>{
  const raw=nativeSpells.find((s:{Id:number;RawData?:string})=>s.Id===9985&&s.RawData);
  const steps=JSON.parse(raw.RawData).SpellSteps;
  expect(steps).toContainEqual(expect.objectContaining({Type:'DecreaseAttack',SpellPowerMultiplier:1,Amount:1,UseCounterForAmount:true}));
  expect(steps).toContainEqual(expect.objectContaining({Type:'DecreaseSpellPower',Amount:4,UseCounterForAmount:true}));
  expect(steps).toContainEqual(expect.objectContaining({Type:'CountSpecificStatusEffect',Data:'cursed',Amount:300}));
 });
 it.each([0,1,2,4])('Byblios %i cursed enemies boost BOTH attack and magic reductions',count=>{
  const f=setup('weapon',9985);for(let i=0;i<count;i++)f.enemies[i].statuses.push({id:'curse',turns:5});
  f.enemies[2].magic=100;f.cast();
  expect(f.enemies[2].attack).toBe(100-(12+3*count));
  expect(f.enemies[2].magic).toBe(100-(4+3*count));
  expect(f.enemies[0].attack).toBe(100);
 });
 it('Byblios silences the chosen target with Immortal Byblios present, otherwise not',()=>{
  for(const present of [false,true]){
   const f=setup('weapon',9985);
   if(present)f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1,{name:'不朽的拜布利奥斯'}));
   f.cast();expect(f.enemies[2].statuses.some(s=>s.id==='silence')).toBe(present);
  }
 });
});
