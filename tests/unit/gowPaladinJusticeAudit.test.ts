// Paladin 6029 / Justice 7029: stored English/native plus historical official game guide.
// @ts-expect-error Node snapshot reader
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { spellDescription } from '../../src/data/combatText';
import troops from '../../src/data/troops.json';

const troop=troops.find(t=>t.id===6029)!;
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((t:{id:number})=>t.id===6029);
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7029).raw;
const guide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(side=PlayerSide.Left,chosen=12){
  const f=damageFixture();f.caster.skillId='7029';f.caster.manaCost=f.caster.mana=11;
  f.caster.colors=[BaseColor.Green,BaseColor.Yellow];
  if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);
  engine.skullChance=0;engine.setTargetChooser({choose:()=>chosen});
  return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Paladin 6029 / Justice 7029 full skill snapshot audit',()=>{
  it('English, two native steps, historical guide and display agree on cost, colors, self Armor and single enemy',()=>{
    const section=guide.slice(guide.indexOf('<h2>Paladin</h2>'),guide.indexOf('<h2>Paladin</h2>')+7000);
    expect(section).toContain('Justice</big></b>  (Cost:11');
    expect(section).toContain('Deal [0+Magic] damage to an enemy, Boosted by my Armor.    (Boost Ratio 1:1)');
    expect(en.stats.spell.desc).toBe('Deal [Magic] damage to an Enemy, boosted by my Armor. [1:1]');
    expect(en.SpellId).toBe(7029);
    expect(native).toMatchObject({Id:7029,Cost:11,Target:'Enemy',SpellSteps:[
      {Type:'CountArmor',Target:'Self',Amount:100},
      {Type:'Damage',Target:'FromTarget',SpellPowerMultiplier:1,UseCounterForAmount:true,Primarypower:true},
    ]});
    expect(native.SpellSteps).toHaveLength(2);
    expect(troop.manaColors).toEqual(['Green','Yellow']);expect(troop.manaCost).toBe(11);
    expect(registry.prototypes.get('7029')?.segments).toEqual([{
      kind:'damage',target:'enemyChosen',scaling:{base:0,mult:1},
      modifier:{mod:{kind:'ratio',a:1,b:1},source:{kind:'selfStat',stat:'armor'}},
    }]);
    expect(spellDescription(7029,troop.spell.description)).toContain('[魔法]');
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right])for(const chosen of [10,11,12,13])
    it(`${side}: target ${chosen}, caster Armor=7 adds exactly 7 to Magic; target Armor absorbs first`,()=>{
      const f=setup(side,chosen);f.caster.magic=11;f.caster.armor=7;
      const target=f.enemies.find(e=>e.id===chosen)!;target.armor=5;
      const events=f.cast();
      expect(events.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[chosen,18]]);
      expect(target.armor).toBe(0);expect(target.hp).toBe(987);
      expect(f.caster.armor).toBe(7);
      expect(f.enemies.filter(e=>e.id!==chosen).every(e=>e.hp===1000&&e.armor===0)).toBe(true);
      expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
    });
  for(const magic of [0,1,21])for(const armor of [0,1,23])
    it(`Magic=${magic}, Armor=${armor}: scaling and no rounding or accidental target-armor boost`,()=>{
      const f=setup();f.caster.magic=magic;f.caster.armor=armor;f.enemies[2].armor=9;
      const events=f.cast();
      expect(events.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual(magic+armor?[magic+armor]:[]);
      expect(f.enemies[2].armor).toBe(Math.max(0,9-magic-armor));
      expect(f.enemies[2].hp).toBe(1000-Math.max(0,magic+armor-9));
    });
  it('Web suppresses only Magic; self Armor is still counted',()=>{
    const f=setup();f.caster.magic=20;f.caster.armor=9;f.caster.statuses=[{id:'web',turns:3}];
    expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([9]);
  });
  it('Barrier negates the single hit and is consumed, without changing caster Armor',()=>{
    const f=setup();f.caster.armor=8;f.enemies[2].statuses=[{id:'barrier',turns:3}];
    expect(f.cast().filter(e=>e.type==='skill-damage')).toEqual([]);
    expect(f.enemies[2].hp).toBe(1000);expect(f.caster.armor).toBe(8);
    expect(f.enemies[2].statuses.some(s=>s.id==='barrier')).toBe(false);
  });
  it('lethal hit defeats only the chosen enemy',()=>{
    const f=setup();f.caster.armor=19;f.enemies[2].hp=2;
    expect(f.cast().filter(e=>e.type==='defeat')).toEqual([{type:'defeat',characterId:12}]);
    expect(f.enemies.filter(e=>e.id!==12).every(e=>e.hp===1000)).toBe(true);
  });
  for(const mode of ['low-mana','silence','cancel'] as const)
    it(`${mode} leaves mana and action intact`,()=>{
      const f=setup(PlayerSide.Left,mode==='cancel'?999:12);
      if(mode==='low-mana')f.caster.mana=10;
      if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
      expect(f.cast()).toEqual([]);
      expect(f.caster.mana).toBe(mode==='low-mana'?10:11);
      expect(f.state.actionLog).toHaveLength(0);
    });
});