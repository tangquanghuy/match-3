import {describe, it, expect} from 'vitest';
import {TROOPS} from '../../src/data/troops';
import {PORTRAITS, colorKey, savePortrait, restorePortrait} from '../../src/sillytavern/portraits';
import {compileEnemyBlueprint, restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {compileEnemyDesign, restoreEnemyDesign, DEFAULT_ENEMY_DESIGN_INPUT} from '../../src/sillytavern/enemyDesign';
import oldGenerated from '../fixtures/st-enemy-design-colored-portrait-v1.json';

const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));
describe('artwork independent of mechanical mana', () => {
 it('keeps an existing generation save and its selected artwork exactly intact', () => {
  expect(oldGenerated).toHaveProperty('generation');
  expect(oldGenerated.blueprint.portrait.query).toHaveProperty('manaColors');
  expect(restoreEnemyDesign(clone(oldGenerated))).toEqual(oldGenerated);
  expect(restoreEnemyBlueprint(clone(oldGenerated.blueprint))).toEqual(oldGenerated.blueprint);
  const altered = clone(oldGenerated); altered.blueprint.portrait.query.manaColors = ['Blue'];
  expect(() => restoreEnemyDesign(altered)).toThrow();
 });
 it.each([null,false,0,'',[],['Blue','Blue'],{},'Blue'])('rejects explicit malformed legacy colors: %j', manaColors => {
  const saved=clone(oldGenerated.blueprint);
  const changed={...saved,portrait:{...saved.portrait,query:{...saved.portrait.query,manaColors}}};
  expect(() => restorePortrait(changed.portrait)).toThrow();
  expect(() => restoreEnemyBlueprint(changed)).toThrow();
 });
 it('changes the artwork source color without changing any mechanical field or ability identity', () => {
  const source = PORTRAITS.find(p => p.rank === '杂兵' && p.role === 'Striker')!;
  const other = PORTRAITS.find(p => p.rank === source.rank && p.role === source.role && colorKey(p.manaColors) !== colorKey(source.manaColors))!;
  const troop = TROOPS.find(t => t.id === source.troopId)!;
  const make = (p:typeof source) => compileEnemyBlueprint({portrait:savePortrait({rank:p.rank,form:p.form,role:p.role},p),recipeTroopId:troop.id,externalId:'cross-color',level:20});
  const baseline = make(source), changed = make(other);
  expect(changed.snapshot.manaColors).toEqual(troop.manaColors);
  expect(changed.snapshot.manaCost).toBe(troop.manaCost);
  expect(changed.abilityId).toBe(baseline.abilityId);
  const stripArt = (value:typeof changed) => {const {portrait,snapshot,...rest}=value; void portrait; const {portraitUrl,...mechanics}=snapshot; void portraitUrl; return {...rest,snapshot:mechanics};};
  expect(stripArt(changed)).toEqual(stripArt(baseline));
  expect(restoreEnemyBlueprint(clone(changed))).toEqual(changed);
 });
 it('selects artwork independently of requested mana and restores new generated saves', () => {
  const images = new Set<string>(); let crossColor = 0;
  for(const manaColors of [['Red'],['Blue'],['Green']]) for(const seed of [1,17,6817]) {
   const compiled = compileEnemyDesign({...DEFAULT_ENEMY_DESIGN_INPUT,manaColors},{seed,externalId:'enemy-1'});
   expect(compiled.blueprint.portrait.query).not.toHaveProperty('manaColors');
   expect(compiled.blueprint.snapshot.manaColors).toEqual(manaColors);
   const entry = PORTRAITS.find(p => p.assetId === compiled.blueprint.portrait.assetId)!;
   if(colorKey(entry.manaColors) !== colorKey(manaColors)) crossColor++;
   images.add(`${seed}:${entry.assetId}`);
   expect(restoreEnemyDesign(clone(compiled))).toEqual(compiled);
  }
  expect(images.size).toBe(3); expect(crossColor).toBeGreaterThan(0);
 });
});
