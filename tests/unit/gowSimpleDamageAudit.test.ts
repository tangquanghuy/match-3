// @ts-expect-error node types are not installed
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {SeededRNG} from '@engine/rng';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
const sourceTroops=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const sourceWeapons=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const grammar=/^Deal \[Magic(?: \+ (\d+))?\] (true )?damage to (an? Enemy|the first Enemy|the last Enemy|a random Enemy|all Enemies)\.$/;
const cases=[...TROOPS.map(entity=>({kind:'troop',entity,original:sourceTroops.find((t:{id:number})=>t.id===entity.id)})),...weapons.map(entity=>({kind:'weapon',entity,original:sourceWeapons.find((w:{id:number})=>w.id===entity.id)}))].flatMap(x=>{
 const m=grammar.exec(x.original?.stats.spell.desc??'');return m?[{...x,base:Number(m[1]??0),trueDamage:!!m[2],target:m[3]}]:[];
});
function cast(c:typeof cases[number],magic:number,armor:number,seed=42){
 const f=damageFixture(0,0,Array.from({length:4},()=>({armor})));
 f.caster.magic=magic;f.caster.skillId=c.kind==='weapon'?`gw_${c.entity.referenceName}`:String(c.entity.spell.id);f.caster.mana=f.caster.manaCost=c.entity.manaCost;
 const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;engine.setTargetChooser({choose:()=>12});
 const events=engine.castSkill(f.caster.id);return {...f,events};
}
describe('every simple integer-scaled damage skill, independently recognized from complete English text',()=>{
 it('covers 26 complete source texts, without silently swallowing riders',()=>expect(cases).toHaveLength(26));
 for(const c of cases){
  for(const magic of [0,1,11,20])for(const armor of [0,10])it(`${c.kind}:${c.entity.id} spell ${c.entity.spell.id}, M=${magic}, armor=${armor}`,()=>{
   const f=cast(c,magic,armor);const hits=f.events.filter(e=>e.type==='skill-damage');
   expect(hits).toHaveLength(c.target==='all Enemies'?4:1);
   const expectedTargets=c.target==='all Enemies'?[10,11,12,13]:c.target==='the first Enemy'?[10]:c.target==='the last Enemy'?[13]:c.target==='a random Enemy'?null:[12];
   if(expectedTargets)expect(hits.map(e=>e.targetId)).toEqual(expectedTargets);
   for(const hit of hits){
    const amount=magic+c.base;expect(hit.damage).toBe(amount);
    const target=f.enemies.find(e=>e.id===hit.targetId)!;
    expect(target.hp).toBe(1000-(c.trueDamage?amount:Math.max(0,amount-armor)));
    expect(target.armor).toBe(c.trueDamage?armor:Math.max(0,armor-amount));
   }
  });
  if(c.target==='a random Enemy')it(`${c.kind}:${c.entity.id} random targeting must not collapse to first/chosen`,()=>{
   const targets=new Set(Array.from({length:20},(_,i)=>cast(c,11,0,i+1).events.filter(e=>e.type==='skill-damage').map(e=>e.targetId)[0]));
   expect(targets.size).toBeGreaterThan(1);
  });
 }
});
