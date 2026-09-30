// Lane L5 B05 difference repro (sa-L5). NOT sign-off evidence; kept for fix verification.
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {PlayerSide} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);

describe('L5-016 troop:7439 spell 9131: native Target Enemy / FromTarget (prototype used enemyRandom)',()=>{
 it('the chosen enemy 11 is the one Stunned and knocked to the back on every seed',()=>{
  for(let seed=0;seed<12;seed++){
   const f=damageFixture();
   Object.assign(f.caster,{skillId:'9131',mana:24,manaCost:24,magic:3});
   f.state.teams.Left.characters=[damageCharacter(1,{mana:0}),f.caster];
   const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
   for(let i=0;i<seed;i++)f.ctx.rng.next();
   engine.setTargetChooser(new FixedTargetChooser(11));
   const ev=engine.castSkill(0);
   expect(ev.filter(e=>e.type==='status-apply').filter(e=>e.statusId==='stun').map(e=>e.type==='status-apply'&&e.targetId)).toEqual([11]);
   expect(f.state.teams.Right.characters.map(c=>c.id)).toEqual([10,12,13,11]);
   expect(f.state.teams.Left.characters.map(c=>c.id)).toEqual([0,1]);
   expect(f.state.activePlayer).toBe(PlayerSide.Right);
  }
 });
});
