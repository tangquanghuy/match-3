// @ts-expect-error node types are not installed
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {SeededRNG} from '@engine/rng';
import {damageFixture} from '../helpers/damageFixture';
import {troopToSummonTemplate} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
const raw=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
function setup(id:number,seed=42){
 const f=damageFixture();const w=weapons.find(w=>w.spell.id===id)!;
 f.caster.skillId=`gw_${w.referenceName}`;f.caster.mana=f.caster.manaCost=w.manaCost;
 const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser({choose:()=>12});engine.setSummonResolver(troopToSummonTemplate);
 return {...f,engine,cast:()=>engine.castSkill(f.caster.id)};
}
describe('missing weapon clauses, actual equipment registry and cast pipeline',()=>{
 it('anchors expected missing clauses to the independent English snapshot',()=>{
  const desc=(id:number)=>raw.find((w:{SpellId:number})=>w.SpellId===id).stats.spell.desc;
  expect(desc(7285)).toContain('Burn a random Enemy and Disease another.');
  expect(desc(7753)).toMatch(/^Dispel all Enemies\./);
  expect(desc(7567)).toContain('Transform the last Enemy into an empowered Baby Dragon.');
 });
 it.each(Array.from({length:20},(_,i)=>i+1))('Burning Scythe seed %i: disease a DIFFERENT survivor',seed=>{
  const f=setup(7285,seed);const ev=f.cast();
  // Status application is followed by the opponent's turn-start recovery roll.
  const applied=ev.filter(e=>e.type==='status-apply');
  const burning=applied.filter(e=>e.statusId==='burning');
  const disease=applied.filter(e=>e.statusId==='disease');
  expect(burning).toHaveLength(1);expect(disease).toHaveLength(1);
  expect(disease[0].targetId).not.toBe(burning[0].targetId);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(4);
 });
 it('Burning Scythe: no second target means no disease on the sole remaining enemy',()=>{
  const f=setup(7285);const survivor=f.enemies[3];f.enemies.slice(0,3).forEach(e=>{e.hp=1;});f.cast();
  expect(survivor.statuses.some(s=>s.id==='burning')).toBe(true);
  expect(survivor.statuses.some(s=>s.id==='disease')).toBe(false);
 });
 it('Trickster’s Shot dispels positives BEFORE damage, retaining negative statuses',()=>{
  const f=setup(7753);const positives=['barrier','blessed','enchanted','rage','reflect','submerged'];
  for(const e of f.enemies){e.attack=20;e.statuses=[...positives,'poison','disease'].map(id=>({id,turns:10}));}
  const ev=f.cast();
  for(const e of f.enemies){expect(e.statuses.some(s=>positives.includes(s.id))).toBe(false);expect(e.statuses.map(s=>s.id)).toEqual(expect.arrayContaining(['poison','disease']));}
  expect(f.enemies[2].attack).toBe(10);expect(f.enemies[0].attack).toBe(20);
  expect(ev.filter(e=>e.type==='skill-damage')).toEqual([expect.objectContaining({targetId:12,damage:16})]);
  const firstHit=ev.findIndex(e=>e.type==='skill-damage');
  expect(ev.slice(0,firstHit).filter(e=>e.type==='status-expire')).toHaveLength(24);
 });
 it('Dragon’s Eye transforms the LAST enemy into a full-mana Baby Dragon, not the chosen enemy',()=>{
  const f=setup(7567);const ev=f.cast();const dragon=troopToSummonTemplate('BabyDragon')!;
  expect(dragon).toBeTruthy();expect(ev.filter(e=>e.type==='troop-transform')).toEqual([expect.objectContaining({targetId:13,name:dragon.name})]);
  expect(f.enemies[3].skillId).toBe(dragon.skillId);expect(f.enemies[3].mana).toBe(dragon.manaCost);
  expect(f.enemies[2].name).toBe('C12');expect(ev.some(e=>e.type==='defeat')).toBe(false);
 });
});
