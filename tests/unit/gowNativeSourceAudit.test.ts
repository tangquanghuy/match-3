// @ts-expect-error node types are not installed
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Node audit module
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import troops from '../../src/data/troops.json';
import weapons from '../../src/data/weapons.json';
const sources=JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells;
const native=indexNativeSpells(sources);
describe('complete native source recovery and identity checks: 2,518 original entities',()=>{
 it('recovers 3,207 native spells, including embedded data lost by RawData-only lookup',()=>{
  expect(native.size).toBe(3207);expect(native.get(7585).field).toBe('data');expect(native.get(7585).raw.Target).toBe('None');
 });
 it('uses the payload Id and rejects competing definitions',()=>{
  const payload={Id:42,SpellSteps:[{Type:'Damage'}]};
  expect(indexNativeSpells([{Id:999,data:JSON.stringify(payload)}]).get(42).wrapperId).toBe(999);
  expect(()=>indexNativeSpells([{RawData:JSON.stringify(payload)},{data:JSON.stringify({...payload,Cost:7})}])).toThrow('Conflicting native spell 42');
 });
 for(const [kind,entities] of [['troop',troops],['weapon',weapons]] as const){
  for(const entity of entities)it(`${kind}:${entity.id} / ${entity.spell.id}: native identity and cost`,()=>{
   const source=native.get(entity.spell.id)?.raw;
   expect(source).toBeDefined();expect(source.Id).toBe(entity.spell.id);expect(entity.manaCost).toBe(source.Cost);
  });
 }
});
