// Lane L7+L6 batch B04 difference repros (sa-L76). NOT signoff evidence.
// L7-7517: troop:7517 spell 9281 RandomHighDamage FromTarget must hit only the pulled enemy;
// prototype carries split:2 and shares the roll across the first 2 living enemies.
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function cast(side:PlayerSide,magic:number,armor:number){
 const f=damageFixture(0,0,[{},{},{},{}]);
 Object.assign(f.caster,{skillId:'9281',mana:12,manaCost:12,colors:[BaseColor.Blue,BaseColor.Yellow],magic,armor});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 const foes=[...f.enemies];engine.castSkill(0);
 const enemySide=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 return {loss:foes.map(e=>1000-e.hp),order:f.state.teams[enemySide].characters.map(c=>c.id)};
}
describe('repro L7-7517 troop:7517 spell 9281 damage goes to the pulled enemy only',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])
 it(`fixed: native expectation side=${side} magic=${magic}: pulled enemy 12 takes the whole roll, others untouched`,()=>{
  const r=cast(side,magic,20);
  expect(r.order[0]).toBe(12);
  expect([r.loss[0],r.loss[1],r.loss[3]]).toEqual([0,0,0]);
  expect(r.loss[2]).toBeGreaterThanOrEqual(Math.floor(magic*0.625+2)+10);
  expect(r.loss[2]).toBeLessThanOrEqual(Math.floor(magic*1.25+4)+10);
 });
 // Pre-fix runtime (split:2 shared the roll with the next front enemy) removed after the fix.
});
