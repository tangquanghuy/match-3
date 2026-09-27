// Owlbear 6026 / Screech 7026: English and native snapshot crosschecked with saved official historical guide.
// @ts-expect-error Node fixture reader
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native source fixture
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { spellDescription } from '../../src/data/combatText';
import troops from '../../src/data/troops.json';

const troop = troops.find(t => t.id === 6026)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: { id: number }) => t.id === 6026);
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells).get(7026).raw;
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', 'utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function setup(side = PlayerSide.Left, chosen = 12) {
  const f = damageFixture();
  f.caster.skillId = '7026'; f.caster.manaCost = f.caster.mana = 10;
  f.caster.colors = [BaseColor.Green, BaseColor.Brown];
  if (side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies;
    f.state.teams.Right.characters = [f.caster];
    f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance = 0; engine.setTargetChooser({ choose: () => chosen });
  return { ...f, cast: () => engine.castSkill(f.caster.id) };
}
describe('Owlbear 6026 / Screech 7026 whole-spell source and battle review', () => {
  it('English, two native steps, registered prototype, binding and display match', () => {
    const section = guide.slice(guide.indexOf('<h2>Owlbear</h2>'), guide.indexOf('<h2>Owlbear</h2>') + 7000);
    expect(section).toContain('Screech</big></b>  (Cost:10');
    expect(section).toContain('Deal [3+Magic] damage to an enemy. Reduce the enemy&#8217;s Attack by 2.');
    expect(en.stats.spell.desc).toBe('Deal [Magic + 3] damage to an Enemy, and eliminate 2 Attack from them.');
    expect(en.SpellId).toBe(7026);
    expect(native).toMatchObject({ Id:7026, Cost:10, Target:'Enemy', SpellSteps:[
      {Type:'Damage',Target:'FromTarget',Amount:3,SpellPowerMultiplier:1,Primarypower:true},
      {Type:'DecreaseAttack',Target:'FromTarget',Amount:2},
    ] });
    expect(native.SpellSteps).toHaveLength(2);
    expect(troop.manaCost).toBe(10); expect(troop.manaColors).toEqual(['Green','Brown']);
    expect(registry.prototypes.get('7026')?.segments).toEqual([
      {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
      {kind:'reduce',target:'enemyChosen',stat:'attack',scaling:{base:2,mult:0}},
    ]);
    expect(spellDescription(7026,troop.spell.description)).toBe('对一名敌人造成 [魔法 + 3] 点伤害，并减除其 2 点攻击力');
  });
  for (const side of [PlayerSide.Left,PlayerSide.Right]) for (const chosen of [10,11,12,13])
    it(`${side}: selected enemy ${chosen} alone receives damage then two Attack reduction`, () => {
      const f=setup(side,chosen);f.caster.magic=11;f.enemies.find(e=>e.id===chosen)!.armor=5;
      const ev=f.cast(); const target=f.enemies.find(e=>e.id===chosen)!;
      expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[chosen,14]]);
      expect(ev.filter(e=>e.type==='buff'&&e.stat==='attack')).toEqual([{type:'buff',targetId:chosen,stat:'attack',amount:-2}]);
      expect(ev.findIndex(e=>e.type==='skill-damage')).toBeLessThan(ev.findIndex(e=>e.type==='buff'&&e.stat==='attack'));
      expect(target.armor).toBe(0);expect(target.hp).toBe(991);expect(target.attack).toBe(15);
      expect(f.enemies.filter(e=>e.id!==chosen).every(e=>e.hp===1000&&e.attack===17)).toBe(true);
      expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
    });
  for (const magic of [0,1,25]) for (const attack of [0,1,2,9])
    it(`Magic=${magic}, enemy Attack=${attack}: full scaling and reduction floors at zero`,()=>{
      const f=setup();f.caster.magic=magic;f.enemies[2].attack=attack;
      const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([magic+3]);
      expect(f.enemies[2].hp).toBe(1000-magic-3);expect(f.enemies[2].attack).toBe(Math.max(0,attack-2));
      expect(ev.filter((e):e is Extract<typeof e,{type:'buff'}>=>e.type==='buff'&&e.stat==='attack').map(e=>e.amount)).toEqual(attack?[ -Math.min(attack,2) ]:[]);
    });
  it('Web removes the [Magic] contribution but leaves fixed +3 damage and -2 Attack',()=>{
    const f=setup();f.caster.magic=21;f.caster.statuses=[{id:'web',turns:3}];
    const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([3]);
    expect(f.enemies[2].attack).toBe(15);
  });
  it('Barrier prevents the damage but not the later, independent Attack reduction',()=>{
    const f=setup();f.enemies[2].statuses=[{id:'barrier',turns:3}];
    const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage')).toEqual([]);
    expect(f.enemies[2].hp).toBe(1000);expect(f.enemies[2].attack).toBe(15);
    expect(f.enemies[2].statuses.some(s=>s.id==='barrier')).toBe(false);
  });  it('lethal first step defeats the selected enemy; no replacement target gets its two Attack reduction',()=>{
    const f=setup();f.enemies[2].hp=1;const ev=f.cast();
    expect(ev.filter(e=>e.type==='defeat')).toEqual([{type:'defeat',characterId:12}]);
    expect(ev.some(e=>e.type==='buff'&&e.stat==='attack')).toBe(false);
    expect(f.enemies.filter(e=>e.id!==12).every(e=>e.attack===17)).toBe(true);
  });
  for (const reason of ['low-mana','silence','cancel'] as const)
    it(reason+' leaves board and mana unchanged; no cast or turn',()=>{
      const f=setup(PlayerSide.Left,reason==='cancel'?999:12);
      if(reason==='low-mana')f.caster.mana=9;
      if(reason==='silence')f.caster.statuses=[{id:'silence',turns:3}];
      const before=JSON.stringify(f.board.get({row:0,col:0}));const rng=f.ctx.rng.getState();
      expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(reason==='low-mana'?9:10);
      expect(JSON.stringify(f.board.get({row:0,col:0}))).toBe(before);
      expect(f.ctx.rng.getState()).toBe(rng);expect(f.state.actionLog).toHaveLength(0);
    });
});
