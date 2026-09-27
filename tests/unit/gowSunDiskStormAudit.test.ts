// The local English snapshot and the native SpellSteps independently anchor
// the narrow StormRandom clause. Passing this suite is not whole-weapon acceptance.
// @ts-expect-error No @types/node in application build
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Independent stored native source parser
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { executePrototype } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';

const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const english = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json', 'utf8')).weapons;
const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);
const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
function fixture() {
 const f = damageFixture();
 const weapon = weapons.find(w => w.spell.id === 7492)!;
 f.caster.skillId = `gw_${weapon.referenceName}`;
 f.caster.mana = f.caster.manaCost = weapon.manaCost;
 f.enemies[1].colors = [BaseColor.Purple];
 f.enemies[3].colors = [BaseColor.Purple];
 f.enemies[1].armor = 5;
 f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1, { colors:[BaseColor.Yellow],attack:17 }));
 const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
 engine.skullChance = 0;
 return { ...f, engine, proto:registry.prototypes.get(f.caster.skillId)!, cast:()=>engine.castSkill(f.caster.id) };
}
describe('Sun Disk 7492: source-backed random Storm repair (scoped)', () => {
 it('separate English and original steps contain the three ordered clauses', () => {
  const src=english.find((w:{stats:{spell:{id:number}}}) => w.stats.spell.id === 7492)!;
  expect(src.stats.spell.desc).toContain('Then summon a random Storm.');
  expect(native.get(7492).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None')).toMatchObject([
   {Type:'IncreaseAttack',Target:'AllyColor',Amount:5},
   {Type:'Damage',Target:'EnemyColor',Amount:4,SpellPowerMultiplier:1},
   {Type:'StormRandom'},
  ]);
 });
 for (let selected=0; selected<6; selected++) it(`native random color ${selected}: full weapon cast preserves clause order and replaces other side's storm`, () => {
  const f=fixture();
  f.state.teams[PlayerSide.Right].storm={color:BaseColor.Green,turns:5,troopId:10};
  const draw=vi.spyOn(f.ctx.rng,'nextInt');
  draw.mockImplementation((n:number)=>n===6?selected:0);
  const ev=f.cast();
  const meaningful=ev.filter(e=>e.type==='buff'||e.type==='skill-damage'||e.type==='storm-change');
  expect(meaningful.filter(e=>e.type==='buff').map(e=>[e.targetId,e.stat,e.amount])).toEqual([[1,'attack',5]]);
  expect(meaningful.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,15],[13,15]]);
  expect(meaningful.map(e=>e.type)).toEqual(['buff','skill-damage','skill-damage','storm-change','storm-change']);
  expect(meaningful.filter(e=>e.type==='storm-change')).toEqual([
   expect.objectContaining({player:PlayerSide.Right,color:null,reason:'replaced'}),
   expect.objectContaining({player:PlayerSide.Left,color:colors[selected],reason:'replaced'}),
  ]);
  expect(f.state.teams[PlayerSide.Left].storm?.color).toBe(colors[selected]);
  expect(f.state.teams[PlayerSide.Right].storm).toBeUndefined();
  expect(f.caster.attack).toBe(17);
  expect(f.enemies[0].hp).toBe(1000);
  expect(f.enemies[1].hp).toBe(990);
  expect(f.state.actionLog).toHaveLength(1);
  expect(draw).toHaveBeenCalledWith(6);
 });
 it('random storm also applies with zero eligible yellow allies or purple enemies', () => {
  const f=fixture(); f.state.teams[PlayerSide.Left].characters.pop();
  f.enemies.forEach(e=>e.colors=[BaseColor.Red]);
  vi.spyOn(f.ctx.rng,'nextInt').mockImplementation((n:number)=>n===6?4:0);
  const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='buff'||e.type==='skill-damage')).toHaveLength(0);
  expect(ev.filter(e=>e.type==='storm-change')).toHaveLength(1);
  expect(f.state.teams[PlayerSide.Left].storm?.color).toBe(BaseColor.Purple);
 });
});
