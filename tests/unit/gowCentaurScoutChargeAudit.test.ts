// Centaur Scout 6016 / Charge 7016: original saved source, historical official guide, full battle pipeline.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedCellChooser } from '@engine/skills/cellChooser';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { spellDescription } from '../../src/data/combatText';
import troops from '../../src/data/troops.json';
const troop=troops.find(t=>t.id===6016)!;
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((t:{id:number})=>t.id===6016);
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7016).raw;
const guide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(side=PlayerSide.Left,row=2){
  const f=damageFixture();f.caster.skillId='7016';f.caster.manaCost=f.caster.mana=7;
  f.caster.colors=[BaseColor.Yellow];
  if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);
  engine.skullChance=0;engine.setCellChooser(new FixedCellChooser({row,col:5}));
  return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Centaur Scout 6016 / Charge 7016 per-entity original spell audit',()=>{
  it('English, native, historical official, registry and display agree',()=>{
    const section=guide.slice(guide.indexOf('<h2>Centaur Scout</h2>'),guide.indexOf('<h2>Centaur Scout</h2>')+7500);
    expect(section).toContain('Charge</big></b>  (Cost:7');
    expect(section).toContain('Destroy a row, and deal [1+Magic] damage to the first enemy.');
    expect(en.SpellId).toBe(7016);
    expect(en.stats.spell.desc).toBe('Destroy a row, and deal [Magic + 1] damage to the first Enemy.');
    expect(native).toMatchObject({Cost:7,Target:'Board',SpellSteps:[
      {Type:'DestroyGems',BoardTarget:'Row',Amount:1},
      {Type:'Damage',Target:'FrontEnemy',Amount:1,SpellPowerMultiplier:1,Primarypower:true},
    ]});expect(native.SpellSteps).toHaveLength(2);
    expect(troop.manaCost).toBe(7);expect(troop.manaColors).toEqual(['Yellow']);
    expect(registry.prototypes.get('7016')?.segments).toEqual([
      {kind:'gem',params:{op:'clear',mode:'destroy',target:{kind:'chosenLine',orientation:'row'}}},
      {kind:'damage',target:'enemyFront',scaling:{base:1,mult:1}},
    ]);
    expect(spellDescription(7016,troop.spell.description)).toContain('[魔法 + 1]');
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right])for(const row of [0,2,4,7])
    it(`${side}: destroys selected row ${row} then damages only front enemy`,()=>{
      const f=setup(side,row);f.caster.magic=11;f.enemies[0].armor=5;
      const ev=f.cast();const removed=ev.find(e=>e.type==='gem-destroy');
      expect(removed?.type).toBe('gem-destroy');
      if(removed?.type!=='gem-destroy')throw Error('gem-destroy event missing');
      expect(removed.cells).toHaveLength(8);expect(removed.cells.every(c=>c.pos.row===row)).toBe(true);
      expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[10,12]]);
      expect(ev.indexOf(removed)).toBeLessThan(ev.findIndex(e=>e.type==='skill-damage'));
      expect(f.enemies[0].armor).toBe(0);expect(f.enemies[0].hp).toBe(993);
      expect(f.enemies.slice(1).every(e=>e.hp===1000&&e.armor===0)).toBe(true);
      expect(f.caster.mana).toBe(2);expect(f.state.actionLog).toHaveLength(1); // 7 spent, then two Yellow gems from the chosen row refill mana
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
    });
  for(const magic of [0,1,11,25])
    it(`Magic=${magic}: exact 1+Magic damage, no row-derived boost`,()=>{
      const f=setup();f.caster.magic=magic;
      expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([magic+1]);
    });
  it('front defeated before cast: next living enemy is hit, later positions unaffected',()=>{
    const f=setup();f.enemies[0].defeated=true;f.enemies[0].hp=0;
    expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11]);
  });
  it('Web suppresses only Magic scaling; fixed +1 still hits',()=>{
    const f=setup();f.caster.magic=25;f.caster.statuses=[{id:'web',turns:3}];
    expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([1]);
  });
  it('Barrier absorbs fixed hit after row destroy',()=>{
    const f=setup();f.enemies[0].statuses=[{id:'barrier',turns:3}];
    const ev=f.cast();expect(ev.findIndex(e=>e.type==='gem-destroy')).toBeGreaterThanOrEqual(0);
    expect(ev.filter(e=>e.type==='skill-damage')).toEqual([]);
    expect(f.enemies[0].hp).toBe(1000);expect(f.enemies[0].statuses.some(s=>s.id==='barrier')).toBe(false);
  });
  it('lethal damage after row destroy hits and defeats only front enemy',()=>{
    const f=setup();f.enemies[0].hp=1;
    expect(f.cast().filter(e=>e.type==='defeat')).toEqual([{type:'defeat',characterId:10}]);
    expect(f.enemies.slice(1).every(e=>e.hp===1000)).toBe(true);
  });
  for(const mode of ['low-mana','silence'] as const)
    it(`${mode}: no row destroy, mana spent, or action`,()=>{
      const f=setup();if(mode==='low-mana')f.caster.mana=6;
      if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
      expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?6:7);
      expect(f.state.actionLog).toHaveLength(0);
    });
});