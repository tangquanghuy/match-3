// Scoped snapshot and full-cast checks; not whole-weapon original-rule acceptance.
// @ts-expect-error Node types are not included in the app tsconfig
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Native source parser is a Node module outside the app bundle
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { RACE_SUMMON_REFS } from '@engine/skills/data/raceRoster';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide } from '@engine/types';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';
import { TROOPS, troopToSummonTemplate } from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
// @ts-expect-error Node child_process declarations are not in the app build
import { spawnSync } from 'node:child_process';

const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const weapon=weapons.find(w=>w.spell.id===9033)!;
const roster=[...RACE_SUMMON_REFS.Goblin];
function cast(allies=1, queued=false, dead=false, selected=0) {
  const f=damageFixture(0,18);
  f.caster.skillId=`gw_${weapon.referenceName}`;
  f.caster.manaCost=weapon.manaCost;
  f.caster.mana=weapon.manaCost;
  f.caster.troopTypes=['Goblin'];
  for(let i=1;i<allies;i++)f.state.teams[PlayerSide.Left].characters.push(damageCharacter(i,{troopTypes:['Goblin']}));
  if(queued) f.state.teams[PlayerSide.Left].summonQueue=[{character:damageCharacter(90,{name:'old queued'}),troopId:90}];
  if(dead)f.state.teams[PlayerSide.Left].characters.push(damageCharacter(98,{defeated:true,hp:0}));
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  engine.setSummonResolver(ref=>troopToSummonTemplate(ref));
  const originalDraw=f.ctx.rng.nextInt.bind(f.ctx.rng);
  const draw=vi.spyOn(f.ctx.rng,'nextInt');
  draw.mockImplementation((n:number)=>n===roster.length?selected:originalDraw(n));
  const events=engine.castSkill(f.caster.id);
  return {...f,events,draw};
}
describe('9033 Rockstabba original Goblin summon (scoped)',()=>{
  it('has independent English and raw machine steps in the correct order',()=>{
    expect(english.find((w:{stats:{spell:{id:number}}})=>w.stats.spell.id===9033).stats.spell.desc)
      .toContain('Then summon a Goblin Troop.');
    expect(native.get(9033).raw.SpellSteps).toMatchObject([
      {Type:'ExplodeColor',Color1:'Green',Amount:1,SpellPowerMultiplier:1},
      {Type:'RandomPositiveStatusEffect',Target:'AllyType',Data:'goblin'},
      {Type:'SummoningType',Data:'goblin'},
    ]);
    expect(weapon.spell.description).toContain('哥布林部队');
    expect(registry.prototypes.get(`gw_${weapon.referenceName}`)?.segments.map(s=>s.kind))
      .toEqual(['gem','randomStatus','summon']);
  });
  it('the source-derived generator rebuilds the corrected Goblin clause',()=>{
    const result=spawnSync('node',['scripts/_weapon_pools.mjs','debug','9033'],{encoding:'utf8'});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(weapon.spell.description);
    expect(result.stdout).toContain('summonRandom([');
    for(const ref of roster)expect(result.stdout).toContain(`'${ref}'`);
  });
  it('random pool is exactly all installed Goblins with usable summon templates',()=>{
    const expected=TROOPS.filter(t=>t.troopTypes.includes('Goblin')).map(t=>t.referenceName);
    expect(roster).toEqual(expected);
    expect(new Set(roster).size).toBe(roster.length);
    expect(roster).toHaveLength(45);
    for(const ref of roster)expect(troopToSummonTemplate(ref)).not.toBeNull();
    const segment=registry.prototypes.get(`gw_${weapon.referenceName}`)!.segments.at(-1)!;
    expect(segment).toMatchObject({kind:'summon',params:{source:{randomOf:roster}}});
  });
  for(const selected of [0,22,44])it(`cast selects pool index ${selected}: green explosion, positive Goblin status, then field summon`,()=>{
    const f=cast(2,false,false,selected);
    const meaningful=f.events.filter(e=>['gem-explode','status-apply','summon'].includes(e.type));
    expect(meaningful.some(e=>e.type==='gem-explode')).toBe(true);
    expect(meaningful.filter(e=>e.type==='status-apply')).toHaveLength(2);
    expect(meaningful.at(-1)).toMatchObject({type:'summon',player:PlayerSide.Left,destination:'field'});
    expect(f.state.teams[PlayerSide.Left].characters.at(-1)?.name).toBe(troopToSummonTemplate(roster[selected])?.name);
    expect(f.draw).toHaveBeenCalledWith(roster.length);
  });
  it('full team makes the summon clause a no-op',()=>{
    const f=cast(4,false);
    expect(f.events.filter(e=>e.type==='summon')).toEqual([]);
    expect(f.state.teams[PlayerSide.Left].characters).toHaveLength(4);
    expect(f.state.teams[PlayerSide.Left].summonQueue).toBeUndefined();
  });

  it('defeated active member frees the slot for the new Goblin',()=>{
    const f=cast(3,false,true);
    expect(f.events.filter(e=>e.type==='summon')).toMatchObject([{destination:'field'}]);
    expect(f.state.teams[PlayerSide.Left].characters).toHaveLength(4);
    expect(f.state.teams[PlayerSide.Left].characters.some(c=>c.id===98)).toBe(false);
  });
});
