// Lane L7+L6 batch B03 difference repros (sa-L76). NOT signoff evidence.
// L7-6211: troop:6211 spell 7353 scatter pool must equal the chosen ally's Armor
// (native: CountArmor FromTarget(ally) before IncreaseArmor, ScatterDamage Amount 1 SPM 1 + counter).
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,type Character} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(side:PlayerSide,magic:number,allyArmor:number,enemies:Partial<Character>[]=[{},{},{},{}]){
 const f=damageFixture(0,0,enemies);
 Object.assign(f.caster,{skillId:'7353',mana:13,manaCost:13,colors:[BaseColor.Green,BaseColor.Brown],magic,armor:40});
 const ally=damageCharacter(20,{mana:0,armor:allyArmor});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster,ally];f.state.activePlayer=side;}
 else f.state.teams.Left.characters=[f.caster,ally];
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(20));
 const foes=[...f.enemies];const start=foes.map(e=>e.hp+e.armor);
 return {f,ally,cast:()=>engine.castSkill(0),removed:()=>foes.reduce((a,e,i)=>a+start[i]-e.hp-e.armor,0)};
}

describe('repro L7-6211 troop:6211 spell 7353 scatter equal to the Ally armor',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])
 it(`fixed: native expectation side=${side} magic=${magic}: scatter pool = ally armor after +[Magic+1] (5 + magic + 1)`,()=>{
  const s=setup(side,magic,5);s.cast();
  expect(s.ally.armor).toBe(5+magic+1);expect(s.removed()).toBe(5+magic+1);
 });
 // Pre-fix runtime (targetStat read the scatter segment's own first enemy -> pool 0) removed after the fix.
});
