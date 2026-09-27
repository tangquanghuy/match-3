// @ts-expect-error node types are not installed
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error independent Node source parser
import {perAllyMixSpec} from '../../scripts/lib/gow-per-ally-oracle.mjs';
// @ts-expect-error node types are not installed
import {execFileSync} from 'node:child_process';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {PlayerSide} from '@engine/types';
import type {SkillDamageEvent} from '@engine/events';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import troops from '../../src/data/troops.json';
type RawTroop={id:number;TroopType:string;TroopType2:string;stats:{kingdom_name:string}};
type RawWeapon={id:number;stats:{spell:{id:number;desc:string}}};
const rawTroops:RawTroop[]=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const rawWeapons:RawWeapon[]=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const cases=rawWeapons.flatMap(w=>{const spec=perAllyMixSpec(w.stats.spell.desc);return spec?[{id:w.stats.spell.id,spec}]:[]});
const compiled:Map<number,string>=new Map(JSON.parse(execFileSync('node',['--input-type=module','-e',"import {compileAll} from './scripts/_weapon_pools.mjs';console.log(JSON.stringify(compileAll().map(r=>[r.spellId,r.build])))"],{encoding:'utf8'})));
function membership(category:string) {
 if(rawTroops.some(t=>t.TroopType===category||t.TroopType2===category))return {troopTypes:[category]};
 const kingdomName=category==='Glacial Peak'?'Glacial Peaks':category;
 const original=rawTroops.find(t=>t.stats.kingdom_name===kingdomName&&troops.some(local=>local.id===t.id&&local.kingdom));
 if(!original) throw new Error(`Unmapped source kingdom ${category}`);
 const local=troops.find(t=>t.id===original.id);
 if(!local?.kingdom)throw new Error(`Missing local kingdom for ${category}`);
 return {kingdom:local.kingdom};
}
describe('source-derived per-ally mixed-gem weapons, every family member',()=>{
 it('covers all 65 source weapons, and rejects flat-plus-boost wording',()=>{
  expect(cases).toHaveLength(65);
  expect(perAllyMixSpec('Create 6 Green and Yellow Gems, boosted by Beast Allies. [x6]')).toBeNull();
 });
 for(const {id,spec} of cases){
  it(`${id}: regeneration preserves a zero base, not a free six gems`,()=>{
   expect(compiled.get(id)).toMatch(/createMix\(\[BaseColor\.\w+, BaseColor\.\w+\], 0, 0,/);
  });
  for(const config of [{n:0,dead:false},{n:1,dead:false},{n:4,dead:false},{n:3,dead:true}]){
   it(`${id}: ${config.n} matching allies${config.dead?' including one defeated':''}`,()=>{
    const f=damageFixture();const entity=weapons.find(w=>w.spell.id===id)!;
    f.caster.skillId=`gw_${entity.referenceName}`;f.caster.mana=f.caster.manaCost=entity.manaCost;
    const allies=[f.caster,...[1,2,3].map(i=>damageCharacter(i))];
    allies.forEach((ally,i)=>{if(i<config.n)Object.assign(ally,membership(spec.category));});
    if(config.dead){allies[config.n-1].defeated=true;allies[config.n-1].hp=0;}
    f.state.teams[PlayerSide.Left].characters=allies;
    // Opposing matching units must never contribute to an ally counter.
    for(const enemy of f.enemies)Object.assign(enemy,membership(spec.category));
    const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    engine.setTargetChooser({choose:()=>12});
    const events=engine.castSkill(f.caster.id);expect(events.some(e=>e.type==='skill-cast')).toBe(true);
    const living=config.n-(config.dead?1:0);
    const hits=events.filter((e):e is SkillDamageEvent=>e.type==='skill-damage');
    expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[12,11+spec.damageBase+spec.damageBoost*living]]);
    const transforms=events.filter(e=>e.type==='gem-transform');
    const created=transforms.flatMap(e=>e.changes);
    expect(created).toHaveLength(spec.perAlly*living);
    for(const c of created){expect(c.to.kind).toBe('color');if(c.to.kind==='color')expect(spec.colors).toContain(c.to.color);}
   });
  }
 }
});
