import { describe, expect, it } from 'vitest';
import { collectWeaponCurated, collectWeaponBatches } from '@engine/skills/curated';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import preserved from '../../src/data/gowWeaponReviewedOverrides.json';
import metadata from '../../src/data/weapon-skill-meta.json';
import weapons from '../../src/data/weapons.json';
import pool from '../../scripts/curated-pools/pool-w01.json';

// This guards the PREVIOUS runtime repairs across regeneration; it does not
// assert that the archived baseline is fully faithful to the original game.
describe('reviewed weapon rows survive generator and data rebuild', () => {
  const entries = preserved.entries as Record<string, {prototype?: unknown; description?: string;
    metadata?: {fidelity:string; missingFeatures:string[]; skippedClauses:string[]}}>;
  const byId = collectWeaponCurated().byId;
  const batchSpells = collectWeaponBatches().flatMap(b => b.spells);
  const ids = batchSpells.map(s => s.id);
  const poolById = new Map(pool.map(p => [p.spellId, p.desc] as const));
  const weaponById = new Map(weapons.map(w => [w.spell.id, w] as const));

  it('preserves every reviewed runtime prototype, localized spell and fidelity', () => {
    const reg = new ExtensionRegistry(); registerSkillLibrary(reg.prototypes);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [idString, saved] of Object.entries(entries)) {
      const id = Number(idString);
      const w = weaponById.get(id);
      expect(w, `missing weapon for ${id}`).toBeDefined();
      if (saved.prototype) {
        expect(byId.get(id), `curated ${id}`).toEqual(saved.prototype);
        expect(reg.prototypes.get(`gw_${w!.referenceName}`), `battle ${id}`).toEqual(saved.prototype);
      }
      if (saved.description) {
        expect(poolById.get(id), `pool ${id}`).toBe(saved.description);
        expect(w!.spell.description, `catalog ${id}`).toBe(saved.description);
      }
      if (saved.metadata) expect(metadata[idString as keyof typeof metadata]).toEqual(saved.metadata);
    }
  });

  it('keeps the hand-maintained W05 entries unique and the Dusty Tome fix live', () => {
    const w05 = [7071, 7188, 7189, 7190, 7199, 7217, 10045, 10063, 10065];
    for (const id of w05) expect(ids.filter(v => v === id), `W05 ${id}`).toHaveLength(1);
    const dust = byId.get(7079);
    expect(dust).toEqual({ segments: [
      {kind:'gem', params:{op:'clear', mode:'destroy', target:{kind:'cell', cell:'CELL'}}},
      {kind:'buff', target:'allyAll', stat:'magic', scaling:{base:1,mult:0}},
    ] });
  });
});
