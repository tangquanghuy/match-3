// Lane L7+L6 batch B08 difference repros (sa-L76). NOT signoff evidence.
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function run(skill:string,cost:number,magic:number,enemy:Record<string,unknown>,greenAllies=0){
 const f=damageFixture(0,0,[enemy,{},enemy,{}]);
 Object.assign(f.caster,{skillId:skill,mana:cost,manaCost:cost,magic,colors:[BaseColor.Blue]});
 for(let i=0;i<greenAllies;i++)f.state.teams.Left.characters.push(damageCharacter(20+i,{colors:[BaseColor.Green],mana:0}));
 f.caster.hp=500;
 const e=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);e.skullChance=0;e.setTargetChooser(new FixedTargetChooser(12));
 e.castSkill(0);return f;
}
describe('repro L7-6550 troop:6550 spell 7744: native steals Attack->Magic BEFORE the damage step (R001)',()=>{
 it('native expectation: target Attack 17 -> 13, Magic 10 -> 14, damage uses new Magic: 14 + 4 = 18 (fixed sa-F3)',()=>{
  const f=run('7744',12,10,{attack:17});
  expect(f.enemies[2].attack).toBe(13);expect(f.caster.magic).toBe(14);expect(1000-f.enemies[2].hp).toBe(18);
 });
});
describe('repro L7-7755 troop:7755 spell 9740: counter = min(Attack, [(Magic/2)+1]) only; [100:1] is the CountAttack 100% label',()=>{
 it.fails('native expectation: target Attack 150, Magic 6 -> steal exactly 4 (no +floor(150/100) extra)',()=>{
  const f=run('9740',10,6,{attack:150});
  expect(f.enemies[2].attack).toBe(146);expect(f.caster.magic).toBe(10);
 });
});
describe('repro L7-7069 troop:7069 spell 8597: counter = min(front Attack, Magic+1) + 2 x Green allies; IncreaseHealth grows max Life',()=>{
 // Fixed by sa-P P-steal-to-life (modifierAfterCap + gainLifeMode 'gain').
 it('native expectation: front Attack 5, Magic 10, 1 Green ally -> counter 7: Life +7 and max Life +7',()=>{
  const f=run('8597',13,10,{attack:5},1);
  expect(f.caster.hp).toBe(507);expect(f.caster.maxHp).toBe(1007);
  expect(f.enemies[0].attack).toBe(0);
 });
});
