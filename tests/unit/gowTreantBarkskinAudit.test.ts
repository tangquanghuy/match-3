// Treant 6027 / Barkskin 7027: independently compare historical guide, stored English/native and real casts.
// @ts-expect-error Node snapshot reader
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { spellDescription } from '../../src/data/combatText';
import troops from '../../src/data/troops.json';

const troop = troops.find(t => t.id === 6027)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: {id:number}) => t.id === 6027);
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells).get(7027).raw;
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', 'utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const boost = { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } };

function setup(count: number, side = PlayerSide.Left) {
  const f = damageFixture();
  f.caster.skillId = '7027'; f.caster.manaCost = f.caster.mana = 12;
  f.caster.colors = [BaseColor.Blue, BaseColor.Green];
  // No Brown except chosen cells; alternating Blue/Yellow/Purple prevents long runs before cast.
  const colors = [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let row=0; row<8; row++) for (let col=0; col<8; col++) {
    const index=row*8+col;
    f.board.set({row,col}, {id:index+1,type:colorGem(index<count?BaseColor.Brown:colors[(row+col)%3])});
  }
  if (side===PlayerSide.Right) {
    f.state.teams.Left.characters=f.enemies;
    f.state.teams.Right.characters=[f.caster];
    f.state.activePlayer=side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance=0;
  return {...f, cast: () => engine.castSkill(f.caster.id)};
}

describe('Treant 6027 / Barkskin 7027 source and real-battle audit', () => {
  it('the historical guide, English snapshot and all four native steps agree on both boosted Skills', () => {
    const section=guide.slice(guide.indexOf('<h2>Treant</h2>'),guide.indexOf('<h2>Treant</h2>')+8500);
    expect(section).toContain('Barkskin</big></b>  (Cost:12');
    expect(section).toContain('Gain [0+Magic] Attack and Armor, and remove all Brown Gems to Boost the effect.   (Boost Ratio 4:1)');
    expect(en.stats.spell.desc).toBe('Remove all Brown Gems. Gain [Magic] Attack and Armor, boosted by Gems removed. [4:1]');
    expect(en.SpellId).toBe(7027);
    expect(native).toMatchObject({Cost:12,Target:'None', SpellSteps:[
      {Type:'CountGems',Color1:'Brown',Amount:25},
      {Type:'RemoveColor',Color1:'Brown',Amount:100},
      {Type:'IncreaseArmor',Target:'Self',UseCounterForAmount:true,SpellPowerMultiplier:1,Primarypower:true},
      {Type:'IncreaseAttack',Target:'Self',UseCounterForAmount:true,SpellPowerMultiplier:1},
    ]});
    expect(native.SpellSteps).toHaveLength(4);
    expect(troop.manaColors).toEqual(['Blue','Green']); expect(troop.manaCost).toBe(12);
    expect(registry.prototypes.get('7027')?.segments).toMatchObject([
      {kind:'gem'}, {kind:'buff',target:'allySelf',stat:'armor',modifier:boost},
      {kind:'buff',target:'allySelf',stat:'attack',modifier:boost},
    ]);
    expect(spellDescription(7027,troop.spell.description)).toContain('[魔法]');
  });
  for (const side of [PlayerSide.Left,PlayerSide.Right]) for(const brown of [0,3,4,7,8,16])
    it(`${side}: removes ${brown} Brown and gives BOTH Armor then Attack Magic+floor(Brown/4)`, () => {
      const f=setup(brown,side);f.caster.magic=11;
      const beforeArmor=f.caster.armor, beforeAttack=f.caster.attack;
      const events=f.cast();
      const cleared=events.filter((e):e is Extract<typeof e,{type:'gem-destroy'}>=>e.type==='gem-destroy');
      expect(cleared.flatMap(e=>e.cells)).toHaveLength(brown);
      const buffs=events.filter((e):e is Extract<typeof e,{type:'buff'}>=>e.type==='buff'&&e.targetId===f.caster.id);
      expect(buffs.map(e=>[e.stat,e.amount])).toEqual([
        ['armor',11+Math.floor(brown/4)], ['attack',11+Math.floor(brown/4)],
      ]);
      expect(f.caster.armor).toBe(beforeArmor+11+Math.floor(brown/4));
      expect(f.caster.attack).toBe(beforeAttack+11+Math.floor(brown/4));
      expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
      expect(f.enemies.every(e=>e.hp===1000&&e.attack===17)).toBe(true);
    });
  for (const mode of ['low-mana','silence'] as const)
    it(`${mode}: no spell or spent turn`,()=>{
      const f=setup(4);if(mode==='low-mana')f.caster.mana=11;
      else f.caster.statuses=[{id:'silence',turns:3}];
      expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?11:12);
      expect(f.state.actionLog).toHaveLength(0);
    });
  it('Web disables Magic scaling while retaining the Brown boost to both stats',()=>{
    const f=setup(8);f.caster.magic=20;f.caster.statuses=[{id:'web',turns:3}];
    expect(f.cast().filter(e=>e.type==='buff').map(e=>e.type==='buff'?[e.stat,e.amount]:null))
      .toEqual([['armor',2],['attack',2]]);
  });
});