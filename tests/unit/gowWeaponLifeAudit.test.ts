// Narrow English/native/registered cast evidence; not whole-skill acceptance.
// @ts-expect-error Node source snapshots outside app tsconfig
import fs from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
// @ts-expect-error Native source parser outside app bundle
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {BaseColor,PlayerSide,colorGem} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function fixture(id:number){
 const f=damageFixture();const w=weapons.find(w=>w.spell.id===id)!;
 f.caster.skillId=`gw_${w.referenceName}`;f.caster.mana=f.caster.manaCost=w.manaCost;
 f.caster.hp=900;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser({choose:()=>11});
 return {...f,cast:()=>engine.castSkill(f.caster.id),proto:registry.prototypes.get(f.caster.skillId)!};
}
describe('native weapon Life gains previously absent/misdirected (scoped)',()=>{
 it('7756 source eliminates selected Armor then gains Life, not Armor',()=>{
  const text=english.find((w:{SpellId:number})=>w.SpellId===7756).stats.spell.desc;
  expect(text).toMatch(/Gain Life equal to Armor eliminated/);
  expect(native.get(7756).raw.SpellSteps.map((x:{Type:string})=>x.Type)).toEqual(['CountArmor','DecreaseArmor','IncreaseHealth','CauseSubmerged']);
  for(const armor of [0,19,150]){
   const f=fixture(7756);f.enemies[1].armor=armor;f.enemies[0].armor=80;
   expect(f.proto.segments.map(s=>s.kind)).toEqual(['reduce','buff','status']);
   const ev=f.cast();
   expect(f.enemies[1].armor).toBe(0);expect(f.enemies[0].armor).toBe(80);
   expect(f.caster.hp).toBe(900+armor);expect(f.caster.maxHp).toBe(1000+armor);expect(f.caster.armor).toBe(0);
   expect(ev.filter(e=>e.type==='buff' && e.stat==='armor' && e.targetId===f.caster.id)).toHaveLength(0);
   expect(f.state.teams[PlayerSide.Left].characters.every(c=>c.statuses.some(s=>s.id==='submerged'))).toBe(true);
  }
 });
 for(const allyPresent of [false,true]) it(`9386 converts Green to Faerie Fire, gains M+2 Life, Virago ally=${allyPresent}`,()=>{
  const text=english.find((w:{SpellId:number})=>w.SpellId===9386).stats.spell.desc;
  expect(text).toMatch(/gain \[Magic \+ 2\] Life/);
  expect(native.get(9386).raw.SpellSteps.map((x:{Type:string})=>x.Type)).toEqual(['CountArmyTroop','ConvertGems','ExtraTurnConditional','IncreaseHealth']);
  const f=fixture(9386);f.board.set({row:0,col:0},{id:1,type:colorGem(BaseColor.Green)});
  if(allyPresent)f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1,{name:'永生神维拉格'}));
  expect(f.proto.segments.map(s=>s.kind)).toEqual(['gem','buff','extraTurn']);
  const ev=f.cast();
  expect(f.caster.hp).toBe(913); // base Magic 11 + 2; current AND maximum Life increase
  expect(ev.filter(e=>e.type==='buff' && e.stat==='hp')).toHaveLength(1);
  expect(ev.some(e=>e.type==='extra-turn')).toBe(allyPresent);
  expect(ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[])
    .some(c=>c.to.kind==='special' && c.to.spec.kind==='faerieFireGem')).toBe(true);
 });
 for(const allyPresent of [false,true]) it(`9379 converts Skulls to Uber Doomskulls and gains M/2+1 Attack with even M; ally=${allyPresent}`,()=>{
  expect(english.find((w:{SpellId:number})=>w.SpellId===9379).stats.spell.desc).toMatch(/gain \[\(Magic \/ 2\) \+ 1\] Attack/);
  expect(native.get(9379).raw.SpellSteps.map((x:{Type:string})=>x.Type)).toEqual(['CountArmyTroop','ConvertGems','IncreaseAttack','ExtraTurnConditional']);
  const f=fixture(9379);f.caster.magic=10;const before=f.caster.attack;
  if(allyPresent)f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1,{name:'永生神奥西弗'}));
  expect(f.proto.segments.map(s=>s.kind)).toEqual(['gem','buff','extraTurn']);
  const ev=f.cast();expect(f.caster.attack).toBe(before+6);
  expect(ev.filter(e=>e.type==='buff'&&e.stat==='attack'&&e.targetId===f.caster.id)).toHaveLength(1);
  expect(ev.some(e=>e.type==='extra-turn')).toBe(allyPresent);
 });
 it('9032: full source order is true damage, three Booty gems, five random gem explosions',()=>{
  expect(english.find((w:{SpellId:number})=>w.SpellId===9032).stats.spell.desc).toMatch(/explode 5 Gems/);
  expect(native.get(9032).raw.SpellSteps.map((x:{Type:string})=>x.Type)).toEqual(['TrueDamage','CreateGems','ExplodeGems']);
  const f=fixture(9032);expect(f.proto.segments.map(s=>s.kind)).toEqual(['damage','gem','gem']);
  expect(f.proto.segments[2]).toMatchObject({kind:'gem',params:{mode:'explode',target:{kind:'randomGems',include:'all',count:{base:5,mult:0}}}});
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(4);
  expect(ev.findIndex(e=>e.type==='gem-explode')).toBeGreaterThan(ev.findIndex(e=>e.type==='gem-transform'));
  expect(ev.some(e=>e.type==='gem-explode')).toBe(true);
 }); for(const branch of [0,1])it(`8808 native random either/or executes only branch ${branch}`,()=>{
  expect(english.find((w:{SpellId:number})=>w.SpellId===8808).stats.spell.desc).toMatch(/Either:.*OR Explode/);
  expect(native.get(8808).raw.Randomize).toBe('A-B');
  expect(native.get(8808).raw.SpellSteps.map((x:{Type:string})=>x.Type)).toEqual(['CreateGems2Colors','ExplodeGems']);
  const f=fixture(8808);const choice=f.proto.segments[0];
  expect(choice.kind).toBe('oneOf');
  if(choice.kind==='oneOf')expect(choice.options.map(o=>o.map(s=>s.kind))).toEqual([['gem'],['gem']]);
  vi.spyOn(f.ctx.rng,'next').mockReturnValueOnce(branch?0.99:0);
  const ev=f.cast();
  const created=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
  if(branch===0){
   expect(created.filter(c=>c.to.kind==='special'&&c.to.spec.kind==='gargoyleGem')).toHaveLength(4);
   expect(ev.some(e=>e.type==='gem-explode')).toBe(false);
  }else{
   expect(created).toHaveLength(0);
   expect(ev.some(e=>e.type==='gem-explode')).toBe(true);
  }
 });});
