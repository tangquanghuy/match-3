// Lane L2 B02 difference repro (NOT signoff evidence): L2-1620-random-bleed, L2-6958-order.
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {SeededRNG} from '@engine/rng';
import {skill,dmg} from '@engine/skills/builders';
import {PlayerSide,type Character} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageFixture} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function cast(spell:string,cost:number,enemies:Partial<Character>[],seed=42){
 const f=damageFixture(0,0,enemies);Object.assign(f.caster,{skillId:spell,mana:cost,manaCost:cost,magic:10});
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 const ev=engine.castSkill(0) as GameEvent[];
 return {f,ev,applies:(id:string)=>(ev as unknown as Array<{type:string;statusId?:string;status?:{id:string}}>)
  .filter(e=>e.type==='status-apply'&&(e.statusId??e.status?.id)===id).length};
}
describe('L2-1620-random-bleed: InflictEffectOnRandomTroops bleed 2,2,2,2,1 = 9 random applications',()=>{
 for(const seed of [1,2,3])it(`seed ${seed}: 4 living enemies -> 9 Bleed applications in total, not 9 stacks on every enemy`,()=>{
  const {f,applies}=cast('gw_FloweringThorn',16,[{},{},{},{}],seed);
  expect(applies('bleed')).toBe(9);
  const stacks=f.enemies.map(e=>e.statuses.find(s=>s.id==='bleed')?.magnitude??0);
  expect(stacks.reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(9);expect(Math.max(...stacks)).toBeLessThanOrEqual(4);
 });
 it('lone enemy: 4 applications reach the cap; the fifth step skips the full stack',()=>{
  const {f,applies}=cast('gw_FloweringThorn',16,[{},{hp:0,defeated:true},{hp:0,defeated:true},{hp:0,defeated:true}]);
  expect(applies('bleed')).toBe(4);expect(f.enemies[0].statuses.find(s=>s.id==='bleed')?.magnitude).toBe(4);
 });
});
describe('L2-6958-order: native CauseStun precedes Damage (stun suppresses traits before the hit)',()=>{
 it('front enemy with spellDamageTaken 0.5 takes full [Magic+2] = 12 because it is already Stunned',()=>{
  const {f}=cast('8458',13,[{traitIds:['spellblock']},{},{},{}]);
  expect(1000-f.enemies[0].hp).toBe(12);expect(1000-f.enemies[1].hp).toBe(12);
 });
 it('control: spellblock does halve an unstunned target (proves the trait is live)',()=>{
  registry.prototypes.set('l2-ctl',skill(dmg('enemyFirstN',2,1,{n:2})));
  const {f}=cast('l2-ctl',13,[{traitIds:['spellblock']},{},{},{}]);
  expect(1000-f.enemies[0].hp).toBe(6);expect(1000-f.enemies[1].hp).toBe(12);
 });
});
void PlayerSide;
