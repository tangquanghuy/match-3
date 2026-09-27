// @ts-expect-error node types are not installed
import fs from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
// @ts-expect-error Node source module
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {SeededRNG} from '@engine/rng';
import {damageFixture} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import troops from '../../src/data/troops.json';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
function setup(kind:'troop'|'weapon',id:number,rolls:number[]){
 const f=damageFixture();const e=(kind==='weapon'?weapons:troops).find(e=>e.spell.id===id)!;
 f.caster.skillId=kind==='weapon'?`gw_${e.referenceName}`:String(id);f.caster.mana=f.caster.manaCost=e.manaCost;
 const rng=new SeededRNG(42),boardRng=new SeededRNG(43);
 vi.spyOn(rng,'next').mockImplementation(()=>rolls.shift()??0.99);
 vi.spyOn(rng,'nextInt').mockImplementation(n=>boardRng.nextInt(n));
 const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
 const engine=new TurnEngine(f.state,rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser({choose:()=>12});
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('source-backed omitted execution and Break Free clauses',()=>{
 it('native 8450 defines 20% lethal conditional after direct damage',()=>{
  expect(native.get(8450).raw.SpellSteps).toEqual([
   expect.objectContaining({Type:'Damage',Amount:4,SpellPowerMultiplier:1}),
   expect.objectContaining({Type:'LethalDamageConditional',StatusAmount:20,StatusModifier:'AddForMoreAttackOnTarget'})]);
 });
 for(const attack of [16,17,18])for(const roll of [0,0.199999,0.2,0.99])it(`8450 attack=${attack}, roll=${roll}`,()=>{
  const f=setup('weapon',8450,[roll]);const chosen=f.enemies[2];chosen.attack=attack;
  const others=f.enemies.filter(e=>e!==chosen);const ev=f.cast();
  const shouldDie=attack>17&&roll<0.2;
  expect(chosen.defeated).toBe(shouldDie);expect(others.every(e=>!e.defeated)).toBe(true);
  const hits=ev.filter(e=>e.type==='skill-damage');expect(hits[0]).toEqual(expect.objectContaining({targetId:12,damage:15}));
  expect(hits.every(e=>e.targetId===12)).toBe(true);
 });
 it('9725 source has two independent chance stages AND final front-enemy damage',()=>{
  const s=native.get(9725).raw.SpellSteps;
  expect(s.map((s:{Type:string})=>s.Type)).toEqual(['ExplodeGems','ExplodeGems','ExplodeGems','Damage']);
  expect(s.map((s:{PercentageChance?:number})=>s.PercentageChance??100)).toEqual([100,50,25,100]);
  expect(s[3]).toEqual(expect.objectContaining({Target:'FrontEnemy',Amount:4,SpellPowerMultiplier:0.5}));
 });
 // Fractional rounding is not specified by these source steps; this scope tests exact integer results only.
 for(const [r1,r2,bursts] of [[0,0,3],[0,0.25,2],[0.5,0,2],[0.5,0.25,1]])for(const magic of [0,2,10,20])it(`9725 rolls ${r1}/${r2}, M=${magic}`,()=>{
  const f=setup('troop',9725,[r1,r2]);f.caster.magic=magic;
  const ev=f.cast();expect(ev.filter(e=>e.type==='gem-explode')).toHaveLength(bursts);
  expect(ev.filter(e=>e.type==='skill-damage')).toContainEqual(expect.objectContaining({targetId:10,damage:Math.floor(magic/2)+4}));
 });
});
