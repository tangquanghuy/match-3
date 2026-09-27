// Brian the Lucky: stored English singular random Skill and native AllAlliesButNotSelf.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { randomStatEffect } from '@engine/skills/effects/buff';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import troops from '../../src/data/troops.json';
import { spellDescription } from '../../src/data/combatText';
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((t:{id:number})=>t.id===6092);
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7162).raw;
const officialGuide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html','utf8');
const officialStatuses=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html','utf8');
const troop = troops.find(t=>t.id===6092)!;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
describe('Brian the Lucky 6092 / Cheers 7162 scoped snapshot review',()=>{
 it('source requires other allies; one random Skill receives the entire Magic+1 amount',()=>{
  expect(en.stats.spell.desc).toBe('Give all other Allies [Magic + 1] points to a random Skill.');
  expect(native).toMatchObject({Cost:12,SpellSteps:[{Type:'IncreaseRandom',Target:'AllAlliesButNotSelf',Amount:1,SpellPowerMultiplier:1,Primarypower:true}]});
  expect(native.SpellSteps).toHaveLength(1);
  const brianSection=officialGuide.slice(officialGuide.indexOf('<h2>Brian the Lucky</h2>'),officialGuide.indexOf('<h2>Brian the Lucky</h2>')+12000);
  expect(brianSection).toContain('Increase a random skill on all other allies by [1+Magic].');
  expect(brianSection).toContain('Cheers!</big></b>  (Cost:12');
  expect(troop.manaCost).toBe(12); expect(troop.manaColors).toEqual(['Green','Brown']);
  expect(registry.prototypes.get('7162')?.segments).toEqual([{kind:'randomStat',target:'allyOthers',scaling:{base:1,mult:1},oneSkill:true}]);
  expect(spellDescription(7162,troop.spell.description)).toBe('使所有其他盟友的一项随机属性获得 [魔法 + 1] 点。');
 });
 it('each of four random Skills receives the complete amount; Life increases maximum too',()=>{
  const statKeys=['attack','armor','hp','magic'] as const;
  for(const [index,stat] of statKeys.entries()) {
   const seed=Array.from({length:100},(_,i)=>i+1).find(i=>new SeededRNG(i).nextInt(4)===index)!;
   const f=damageFixture(); f.caster.magic=11;
   const target=f.enemies[0];target.hp=19;target.maxHp=23;
   f.ctx.rng.setState(new SeededRNG(seed).getState());
   const previous={attack:target.attack,armor:target.armor,hp:target.hp,maxHp:target.maxHp,magic:target.magic};
   const events=randomStatEffect({targets:[target],scaling:{base:1,mult:1},oneSkill:true}).apply(f.ctx);
   expect(events).toEqual([{type:'buff',targetId:target.id,stat,amount:12,...(stat==='hp'?{maxHpGain:12}:{})}]);
   expect(target[stat]).toBe(previous[stat]+12);
   for(const other of statKeys.filter(k=>k!==stat)) expect(target[other]).toBe(previous[other]);
   expect(target.maxHp).toBe(previous.maxHp+(stat==='hp'?12:0));
  }
 });
 it('official Web rule blocks Magic buff on a webbed recipient, without rerolling its Skill',()=>{
  expect(officialStatuses).toContain('Magic boosting effects will not apply to the Webbed troop');
  const seed=Array.from({length:100},(_,i)=>i+1).find(i=>new SeededRNG(i).nextInt(4)===3)!;
  const f=damageFixture();f.caster.magic=11;
  const target=f.enemies[0];target.statuses=[{id:'web',turns:3}];
  f.ctx.rng.setState(new SeededRNG(seed).getState());
  const before={attack:target.attack,armor:target.armor,magic:target.magic,hp:target.hp,maxHp:target.maxHp};
  const events=randomStatEffect({targets:[target],scaling:{base:1,mult:1},oneSkill:true}).apply(f.ctx);
  expect(events).toEqual([]);expect(target).toMatchObject(before);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(side+' no other Allies: consumes Mana and turn without buffing caster',()=>{
  const f=damageFixture();f.caster.skillId='7162';f.caster.colors=[BaseColor.Green,BaseColor.Brown];f.caster.mana=f.caster.manaCost=12;
  if(side===PlayerSide.Left){f.state.teams.Left.characters=[f.caster];}
  else {f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  for(const [row,col,color] of [[0,0,BaseColor.Blue],[0,1,BaseColor.Blue],[0,2,BaseColor.Yellow],[1,2,BaseColor.Blue]] as const)
   f.board.set({row,col},{id:row*8+col+1,type:colorGem(color)});
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  const before={attack:f.caster.attack,armor:f.caster.armor,magic:f.caster.magic,hp:f.caster.hp,maxHp:f.caster.maxHp};
  const events=engine.castSkill(f.caster.id);
  expect(events.some(e=>e.type==='buff')).toBe(false);expect(f.caster).toMatchObject(before);
  expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).not.toBe(side);
 });
 it('a Webbed caster retains the +1 base but contributes no Magic scaling',()=>{
  const f=damageFixture();f.caster.magic=23;f.caster.statuses=[{id:'web',turns:3}];
  const target=f.enemies[0];
  const events=randomStatEffect({targets:[target],scaling:{base:1,mult:1},oneSkill:true}).apply(f.ctx);
  expect(events).toHaveLength(1);expect(events[0]).toMatchObject({type:'buff',targetId:target.id,amount:1});
 });
 it('defeated allies are not buffed; surviving other allies still receive the full increase',()=>{
  const f=damageFixture();f.caster.skillId='7162';f.caster.mana=f.caster.manaCost=12;f.caster.magic=11;
  const dead=f.enemies[0],alive=f.enemies[1];dead.defeated=true;
  f.state.teams.Left.characters=[f.caster,dead,alive];f.state.teams.Right.characters=[f.enemies[2]];
  for(const [row,col,color] of [[0,0,BaseColor.Blue],[0,1,BaseColor.Blue],[0,2,BaseColor.Yellow],[1,2,BaseColor.Blue]] as const)
   f.board.set({row,col},{id:row*8+col+1,type:colorGem(color)});
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  const events=engine.castSkill(f.caster.id);
  expect(events.filter(e=>e.type==='buff').map(e=>[e.targetId,e.amount])).toEqual([[alive.id,12]]);
 });
 for(const status of ['none','silence'])it('cast validation '+status+' preserves Mana and turn when blocked',()=>{
  const f=damageFixture();f.caster.skillId='7162';f.caster.manaCost=12;f.caster.mana=status==='none'?11:12;
  if(status==='silence')f.caster.statuses=[{id:'silence',turns:3}];
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);
  expect(engine.castSkill(f.caster.id)).toEqual([]);
  expect(f.caster.mana).toBe(status==='none'?11:12);expect(f.state.activePlayer).toBe(PlayerSide.Left);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,11,23])it(side+' Magic='+magic+' : real cast buffs each other ally on just one axis',()=>{
  const f=damageFixture();f.caster.skillId='7162';f.caster.colors=[BaseColor.Green,BaseColor.Brown];f.caster.mana=f.caster.manaCost=12;f.caster.magic=magic;
  const allies=f.enemies.slice(0,3);const foe=f.enemies[3];
  if(side===PlayerSide.Left){f.state.teams.Left.characters=[f.caster,...allies];f.state.teams.Right.characters=[foe];}
  else {f.state.teams.Left.characters=[foe];f.state.teams.Right.characters=[f.caster,...allies];f.state.activePlayer=side;}
  for(const [row,col,color] of [[0,0,BaseColor.Blue],[0,1,BaseColor.Blue],[0,2,BaseColor.Yellow],[1,2,BaseColor.Blue]] as const)
   f.board.set({row,col},{id:row*8+col+1,type:colorGem(color)});
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  const before=allies.map(a=>({attack:a.attack,armor:a.armor,magic:a.magic,hp:a.hp,maxHp:a.maxHp}));
  const events=engine.castSkill(f.caster.id);
  const buffs=events.filter((e): e is Extract<typeof e, {type:'buff'}> => e.type==='buff'&&allies.some(a=>a.id===e.targetId));
  expect(buffs).toHaveLength(3);
  expect(buffs.map(e=>e.amount)).toEqual([magic+1,magic+1,magic+1]);
  expect(buffs.map(e=>e.targetId)).toEqual(allies.map(a=>a.id));
  expect(buffs.every(e=>['attack','armor','hp','magic'].includes(e.stat))).toBe(true);
  for(const [i,ally] of allies.entries()) {
   const changed=(['attack','armor','magic','hp'] as const).filter(stat=>ally[stat]!==before[i][stat]);
   expect(changed).toHaveLength(1);
  }
  expect(events.some(e=>e.type==='buff'&&e.targetId===f.caster.id)).toBe(false);
  expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).not.toBe(side);
 });
});
