// Silver Sword 1010 / 7076: stored weapon/native spell and saved historical official weapon list.
// @ts-expect-error Node fixtures
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Independent native spell reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {spellDescription} from '../../src/data/combatText';
import weapons from '../../src/data/weapons.json';
const weapon=weapons.find(w=>w.id===1010)!;
const en=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons.find((w:{id:number})=>w.id===1010);
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7076).raw;
const guide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-weapon-list.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(alias='gw_SilverSword',side=PlayerSide.Left){
  const f=damageFixture();f.caster.skillId=alias;f.caster.manaCost=f.caster.mana=7;
  f.caster.colors=[BaseColor.Brown];
  if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Silver Sword weapon 1010 / native 7076 whole-spell snapshot review',()=>{
  it('saved snapshot, native, historic guide, bindings and both aliases are checked independently',()=>{
    const section=guide.slice(guide.indexOf('<h2>Silver Sword</h2>'),guide.indexOf('<h2>Silver Sword</h2>')+2400);
    expect(section).toContain('Silver Sword</big></b>  (Mana Cost:7');
    expect(section).toContain('Deal [3+Magic] damage to the first enemy.'); // Older guide differs from stored current snapshot base +6.
    expect(en.stats.spell.desc).toBe('Deal [Magic + 6] damage to the first Enemy.');
    expect(native).toMatchObject({Id:7076,Cost:7,Target:'None',SpellSteps:[
      {Type:'Damage',Target:'FrontEnemy',Amount:6,SpellPowerMultiplier:1,Primarypower:true},
    ]});expect(native.SpellSteps).toHaveLength(1);
    expect(weapon.manaCost).toBe(7);expect(weapon.manaColors).toEqual(['Brown']);
    expect(weapon.spell.id).toBe(7076);expect(weapon.referenceName).toBe('SilverSword');
    const expected={segments:[{kind:'damage',target:'enemyFront',scaling:{base:6,mult:1}}]};
    expect(registry.prototypes.get('7076')).toEqual(expected);
    expect(registry.prototypes.get('gw_SilverSword')).toEqual(expected);
    expect(spellDescription(7076,weapon.spell.description)).toContain('[魔法 + 6]');
  });
  for(const alias of ['7076','gw_SilverSword'])for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,11,24])for(const armor of [0,5])
    it(`${alias}/${side}: Magic=${magic}, front armor=${armor}`,()=>{
      const f=setup(alias,side);f.caster.magic=magic;f.enemies[0].armor=armor;
      const events=f.cast();expect(events.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[10,magic+6]]);
      expect(f.enemies[0].armor).toBe(Math.max(0,armor-magic-6));
      expect(f.enemies[0].hp).toBe(1000-Math.max(0,magic+6-armor));
      expect(f.enemies.slice(1).every(e=>e.hp===1000&&e.armor===0)).toBe(true);
      expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
      expect(events.some(e=>e.type==='gem-destroy'||e.type==='gem-transform'||e.type==='extra-turn')).toBe(false);
    });
  it('front dead: next living enemy becomes front, no retarget to the back',()=>{
    const f=setup();f.enemies[0].defeated=true;f.enemies[0].hp=0;
    expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11]);
    expect(f.enemies[2].hp).toBe(1000);
  });
  it('Web suppresses Magic but not fixed +6',()=>{
    const f=setup();f.caster.magic=21;f.caster.statuses=[{id:'web',turns:3}];
    expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([6]);
  });
  it('Barrier absorbs one hit; no hit is redirected',()=>{
    const f=setup();f.enemies[0].statuses=[{id:'barrier',turns:3}];
    expect(f.cast().filter(e=>e.type==='skill-damage')).toEqual([]);
    expect(f.enemies[0].hp).toBe(1000);expect(f.enemies[0].statuses.some(s=>s.id==='barrier')).toBe(false);
    expect(f.enemies[1].hp).toBe(1000);
  });
  it('lethal hit defeats only the current first enemy',()=>{
    const f=setup();f.enemies[0].hp=1;
    expect(f.cast().filter(e=>e.type==='defeat')).toEqual([{type:'defeat',characterId:10}]);
    expect(f.enemies.slice(1).every(e=>e.hp===1000)).toBe(true);
  });
  for(const mode of ['low-mana','silence'] as const)it(`${mode} does not consume Mana or action`,()=>{
    const f=setup();if(mode==='low-mana')f.caster.mana=6;
    if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
    expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?6:7);
    expect(f.state.actionLog).toHaveLength(0);
  });
});