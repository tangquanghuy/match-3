// Source-backed scoped formula/target/cast review, not complete skill acceptance.
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error Native snapshot index outside application tsconfig
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide, MatchState } from '@engine/types';
import type { Character } from '@engine/types';
import { TROOPS } from '../../src/data/troops';
import { spellDescription } from '../../src/data/combatText';
import weapons from '../../src/data/weapons.json';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const specs=[
 {id:9837,field:'targetRace',value:'Undead',nativeTarget:'AllyType',nativeData:'undead'},
 {id:9911,field:'targetKingdom',value:'黑石',nativeTarget:'AllyKingdom',nativeData:'3022'},
 {id:9914,field:'targetKingdom',value:'沃尔帕克',nativeTarget:'AllyKingdom',nativeData:'3084'},
 {id:9976,field:'targetRace',value:'Mystic',nativeTarget:'AllyType',nativeData:'mystic'},
 {id:10046,field:'targetRace',value:'Construct',nativeTarget:'AllyType',nativeData:'construct'},
 {id:10050,field:'targetKingdom',value:'聚沙之地',nativeTarget:'AllyKingdom',nativeData:'3024'},
];
function group(spec:typeof specs[number]): Partial<Character> { return spec.field==='targetRace'?{troopTypes:[spec.value]}:{kingdom:spec.value}; }
describe('lost magic scaling and leaked kingdom Bless targets (scoped)',()=>{
 for(const spec of specs)for(const magic of [0,1,11,20])it(`weapon ${spec.id}: M=${magic}, both native M+1 gains and Bless affect only matching living Allies`,()=>{
  const source=english.find((w:{SpellId:number})=>w.SpellId===spec.id).stats.spell.desc;
  expect(source).toMatch(/Give \[Magic \+ 1\] Attack and Life to all .* Allies. Then Bless them./);
  expect(native.get(spec.id).raw.SpellSteps).toMatchObject([
   {Type:'IncreaseAttack',Target:spec.nativeTarget,Data:spec.nativeData,Amount:1,SpellPowerMultiplier:1},
   {Type:'IncreaseHealth',Target:spec.nativeTarget,Data:spec.nativeData,Amount:1,SpellPowerMultiplier:1},
   {Type:'CauseBlessed',Target:spec.nativeTarget,Data:spec.nativeData}]);
  const f=damageFixture(),w=weapons.find(w=>w.spell.id===spec.id)!;
  f.caster.skillId=`gw_${w.referenceName}`;f.caster.magic=magic;f.caster.mana=f.caster.manaCost=w.manaCost;
  const matching=damageCharacter(1,{hp:100,maxHp:100,...group(spec)}),other=damageCharacter(2,{hp:40,maxHp:100,troopTypes:['Human'],kingdom:'OTHER'}),dead=damageCharacter(3,{hp:0,maxHp:100,defeated:true,...group(spec)});
  f.state.teams[PlayerSide.Left].characters.push(matching,other,dead);Object.assign(f.enemies[0],group(spec));
  const proto=registry.prototypes.get(f.caster.skillId)!;
  expect(proto.segments.map(s=>s.kind)).toEqual(['buff','buff','status']);
  expect(proto.segments.every(s=>spec.field in s && (s as unknown as Record<string,unknown>)[spec.field]===(spec.field==='targetKingdom'?Number(spec.nativeData):spec.value))).toBe(true); // P-E-faction-kingdom: kingdom filter = native raw id
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);const ev=engine.castSkill(f.caster.id);
  const amount=magic+1;
  expect([matching.attack,matching.hp,matching.maxHp]).toEqual([17+amount,100+amount,100+amount]);
  expect(matching.statuses.some(s=>s.id==='blessed')).toBe(true);
  expect([other.attack,other.hp,other.maxHp]).toEqual([17,40,100]);expect(other.statuses).toHaveLength(0);
  expect([dead.hp,dead.maxHp]).toEqual([0,100]);expect(f.enemies[0].statuses).toHaveLength(0);
  expect(ev.flatMap(e=>e.type==='buff'?[e.targetId]:[])).toEqual([1,1]);
  expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='blessed'?[e.targetId]:[])).toEqual([1]);
  expect(registry.prototypes.get(String(spec.id))).toBe(proto);
  expect(spellDescription(spec.id,w.spell.description)).toContain('[魔法 + 1]');
 });
 for(const magic of [0,1,11,20])it(`8498 actual selected Ally gains 3M+3 to three stats and full Mana, M=${magic}`,()=>{
  const source=native.get(8498).raw;
  expect(source.SpellSteps).toMatchObject([{Type:'IncreaseAttack',Target:'FromTarget',Amount:3,SpellPowerMultiplier:3},{Type:'IncreaseArmor',Target:'FromTarget',Amount:3,SpellPowerMultiplier:3},{Type:'IncreaseHealth',Target:'FromTarget',Amount:3,SpellPowerMultiplier:3},{Type:'GenerateFullMana',Target:'FromTarget'},{Type:'DisableMySpell',Target:'Self'}]);
  const f=damageFixture();f.caster.skillId='8498';f.caster.magic=magic;f.caster.mana=f.caster.manaCost=20;
  const target=damageCharacter(1,{hp:40,maxHp:100,armor:5,mana:1,manaCost:17}),other=damageCharacter(2,{hp:100,maxHp:100});f.state.teams[PlayerSide.Left].characters.push(target,other);
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.setTargetChooser({choose:()=>1});const ev=engine.castSkill(0);const amount=3*magic+3;
  expect([target.attack,target.armor,target.hp,target.maxHp,target.mana]).toEqual([17+amount,5+amount,40+amount,100+amount,17]);
  expect(ev.flatMap(e=>e.type==='buff'?[e.targetId]:[])).toEqual([1,1,1,1]);
  expect(ev.flatMap(e=>e.type==='buff'?[e.stat]:[])).toEqual(['attack','armor','hp','mana']);
  expect([other.hp,other.maxHp,other.attack]).toEqual([100,100,17]);
  f.state.activePlayer=PlayerSide.Left;f.state.state=MatchState.AwaitingInput;f.caster.mana=20;
  expect(engine.castSkill(0)).toEqual([]);expect(f.caster.mana).toBe(20);
  const troop=TROOPS.find(t=>t.spell.id===8498)!;
  expect(troop.spell.description).toContain('[(魔法 x 3) + 3]');expect(troop.spell.meta.scalings).toContainEqual({base:3,mult:3});
 });
});
