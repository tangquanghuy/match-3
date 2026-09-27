// Ancient Horror: English one random Skill, native AddForKill / IncreaseRandom.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import troops from '../../src/data/troops.json';
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((t:{id:number})=>t.id===6011);
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7011).raw;
const troop=troops.find(t=>t.id===6011)!;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
describe('Ancient Horror 6011 / 7011 source-scoped kill reward (NOT whole signoff)',()=>{
 it('stored English and native both say one random Skill, reward only for a kill',()=>{
  expect(en.stats.spell.desc).toBe('Deal [Magic + 3] damage to an Enemy. If the Enemy dies, gain 6 points to a random Skill.');
  expect(native).toMatchObject({Cost:10,Target:'Enemy',SpellSteps:[{Type:'Damage',Target:'FromTarget',Amount:3,SpellPowerMultiplier:1,Primarypower:true},{Type:'Delay'},{Type:'IncreaseRandom',Target:'Self',StatusAmount:6,StatusModifier:'AddForKill'}]});
  expect(native.SpellSteps).toHaveLength(3);
  expect(troop.manaCost).toBe(10);expect(troop.manaColors).toEqual(['Purple','Brown']);
  expect(registry.prototypes.get('7011')?.segments).toEqual([
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
   {kind:'randomStat',target:'allySelf',scaling:{base:6,mult:0},ifTargetDied:true,oneSkill:true},
  ]);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const dies of [false,true])
 it(side+' targetDies='+dies+' : real cast conditionally buffs one complete Skill',()=>{
  const f=damageFixture();f.caster.skillId='7011';f.caster.mana=f.caster.manaCost=10;f.caster.colors=troop.manaColors as BaseColor[];
  const target=f.enemies[0];target.hp=target.maxHp=dies?5:1000;
  if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  for(const [row,col,color] of [[0,0,BaseColor.Blue],[0,1,BaseColor.Blue],[0,2,BaseColor.Yellow],[1,2,BaseColor.Blue]] as const)
   f.board.set({row,col},{id:row*8+col+1,type:colorGem(color)});
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;engine.setTargetChooser({choose:()=>target.id});
  const before={attack:f.caster.attack,armor:f.caster.armor,magic:f.caster.magic,hp:f.caster.hp,maxHp:f.caster.maxHp};
  const events=engine.castSkill(f.caster.id);
  const hits=events.filter(e=>e.type==='skill-damage');expect(hits).toHaveLength(1);expect(hits[0].targetId).toBe(target.id);
  expect(target.defeated).toBe(dies);
  const buffs=events.filter((e): e is Extract<typeof e,{type:'buff'}>=>e.type==='buff'&&e.targetId===f.caster.id);
  expect(buffs).toHaveLength(dies?1:0);
  if(dies){
   expect(buffs[0].amount).toBe(6);
   const stat=buffs[0].stat as 'attack'|'armor'|'hp'|'magic';
   expect(f.caster[stat]).toBe(before[stat]+6);
   expect((['attack','armor','hp','magic'] as const).filter(key=>f.caster[key]!==before[key])).toEqual([stat]);
   expect(f.caster.maxHp).toBe(before.maxHp+(stat==='hp'?6:0));
  }else expect(f.caster).toMatchObject(before);
  expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).not.toBe(side);
 });
});
