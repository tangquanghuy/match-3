// Troop:6306 full two-weakest conditional damage with two sides and both branches.
// @ts-expect-error Saved English data
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Native GoW step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const src=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const reg=new ExtensionRegistry();registerSkillLibrary(reg.prototypes);
function setup(side=PlayerSide.Left){
 const f=damageFixture();Object.assign(f.caster,{skillId:'7456',mana:15,manaCost:15,colors:[BaseColor.Red,BaseColor.Brown],magic:10});
 [1000,900,800,700].forEach((hp,i)=>f.enemies[i].hp=hp);
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,reg);engine.skullChance=0;
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('troop:6306 two weakest and wounded caster',()=>{
 it('independent stored English/native, exact cost/colors and compiled conditional',()=>{
  const en=src.find((v:{id:number})=>v.id===6306)!,n=native.get(7456).raw;
  expect(en.stats.spell.id).toBe(7456);
  expect(en.stats.spell.desc).toBe('Deal [Magic + 2] damage to the two weakest  enemies. Deal double damage if I am damaged.');
  expect(en.ManaCost).toBe(15);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(['ColorBrown','ColorRed']);
  expect(n.SpellSteps).toHaveLength(1);expect(n.SpellSteps[0]).toMatchObject({Type:'Damage',Target:'TwoWeakestEnemies',Amount:2,SpellPowerMultiplier:1,StatusModifier:'MultiplyForCasterDamaged',StatusAmount:2});
  expect(TROOPS.find(x=>x.id===6306)).toMatchObject({manaCost:15,manaColors:[BaseColor.Red,BaseColor.Brown],spell:{id:7456}});
  expect(reg.prototypes.get('7456')).toEqual({segments:[{kind:'damage',target:'enemyWeakestN',n:2,scaling:{base:2,mult:1},condMult:{times:2,cond:{kind:'selfHpDamaged'}}}]});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const injured of [false,true])it(`${side} caster injured=${injured} hits precisely two weakest`,()=>{
  const f=setup(side);if(injured)f.caster.hp=999;
  const hits=f.cast().filter(e=>e.type==='skill-damage');
  const d=injured?24:12;
  expect(hits.map(e=>[e.targetId,e.damage]).sort((a,b)=>a[0]-b[0])).toEqual([[12,d],[13,d]]);
  expect(f.enemies.map(e=>e.hp)).toEqual([1000,900,800-d,700-d]);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
 });
 it('pre-dead enemy skipped; Barrier absorbs only the one hit and still consumes turn',()=>{
  const f=setup();f.enemies[3].defeated=true;f.enemies[3].hp=0;f.enemies[2].statuses=[{id:'barrier',turns:3}];
  const hits=f.cast().filter(e=>e.type==='skill-damage');expect(hits.map(e=>e.targetId)).toEqual([11]);
  expect(f.enemies[2].hp).toBe(800);expect(f.enemies[1].hp).toBe(888);
  expect(f.caster.mana).toBe(0);
 });
 it('insufficient mana and Silence leave board, action and mana untouched',()=>{
  for(const mode of ['low','silence']){const f=setup();if(mode==='low')f.caster.mana=14;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);}
 });
});
