import {describe,expect,it} from 'vitest';
import {parseRuntimeEncounter} from '../../src/sillytavern/runtimeProtocol';
import {compileEnemyDesign,restoreEnemyDesign,parseEnemyDesignInput} from '../../src/sillytavern/enemyDesign';
import {restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {buildEnemyFormation,restoreEnemyFormation} from '../../src/sillytavern/enemyFormation';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import {applyTransformTemplate} from '../../src/engine/skills/effects/summon';
import {buildDetailViewModel} from '../../src/render/CharacterDetailPanel';

const input={name:'卡洛斯·灰刃',race:'半精灵',manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20};
const parsed=()=>parseRuntimeEncounter(`<match3>\n${JSON.stringify({enemyDesigns:[input]})}\n</match3>`).enemyDesigns[0]!;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;

describe('enemy narrative identity across the existing battle pipeline',()=>{
 it('keeps the supplied name and world race through assembly, save restore, formation rebinding and engine mapping',()=>{
  const result=compileEnemyDesign(parsed(),{seed:307,externalId:'original'});
  expect(result.blueprint.snapshot).toMatchObject({name:input.name,race:input.race});
  expect(restoreEnemyDesign(clone(result))).toEqual(result);
  expect(restoreEnemyBlueprint(clone(result.blueprint))).toEqual(result.blueprint);
  const formation=buildEnemyFormation([result.blueprint,result.blueprint]);
  expect(restoreEnemyFormation(clone(formation))).toEqual(formation);
  for(const [index,member] of formation.members.entries()){
   expect(member.snapshot).toMatchObject({externalId:`enemy-${index+1}`,name:input.name,race:input.race});
   const character=snapshotToCharacter(member.snapshot,index);
   expect(character).toMatchObject({name:input.name,race:input.race,levelLabel:member.snapshot.levelLabel});
   expect(buildDetailViewModel(character)).toMatchObject({name:input.name,race:input.race,levelLabel:member.snapshot.levelLabel,hp:member.snapshot.stats.hp,attack:member.snapshot.stats.attack});
  }
 });
 it('does not change recipes, traits, stats, artwork, mechanical affiliations or ability learning identity when renamed',()=>{
  const first=compileEnemyDesign(parsed(),{seed:307,externalId:'enemy-1',statVariationSeed:211});
  const second=compileEnemyDesign({...parsed(),name:'无名守卫',race:'人类'},{seed:307,externalId:'enemy-1',statVariationSeed:211});
  expect(second.selection).toEqual(first.selection);
  expect(second.generation).toEqual(first.generation);
  expect(second.blueprint.abilityId).toBe(first.blueprint.abilityId);
  const {name:_name,race:_race,...mechanics}=first.blueprint.snapshot;
  void _name;void _race;
  expect(second.blueprint.snapshot).toMatchObject(mechanics);
  expect(()=>restoreEnemyDesign({...clone(first),blueprint:second.blueprint})).toThrow();
 });
 it.each(['name','race'] as const)('rejects malformed %s without throwing away valid narrative text',field=>{
  for(const value of ['', '  ', 42, {}, '字'.repeat(81)])expect(()=>parseEnemyDesignInput({...parsed(),[field]:value})).toThrow();
  expect(parseEnemyDesignInput({...parsed(),[field]:'<守卫 & “灰刃”>'})[field]).toBe('<守卫 & “灰刃”>');
 });
 it('replaces the display level together with a transformed form',()=>{
  const result=compileEnemyDesign(parsed(),{seed:307,externalId:'enemy-1'});
  const actor=snapshotToCharacter(result.blueprint.snapshot,4);
  const template=snapshotToCharacter({...result.blueprint.snapshot,levelLabel:'Lv.9'},5);
  applyTransformTemplate(actor,template);
  expect(buildDetailViewModel(actor).levelLabel).toBe('Lv.9');
 });
 it('clears the old narrative race when a unit transforms to a template without one',()=>{
  const result=compileEnemyDesign(parsed(),{seed:307,externalId:'enemy-1'});
  const actor=snapshotToCharacter(result.blueprint.snapshot,4);
  const template=snapshotToCharacter(result.blueprint.snapshot,5);
  delete template.race;delete template.levelLabel;delete template.battleScaling;template.name='变形体';
  applyTransformTemplate(actor,template);
  expect(actor.name).toBe('变形体');expect(actor.race).toBeUndefined();expect(actor.levelLabel).toBeUndefined();
  expect(buildDetailViewModel(actor).levelLabel).toBeUndefined();
 });
});
