import { stoneColorKeyOf } from '../../src/meta/data/materials';
import { BaseColor } from '../../src/engine/types';
import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { isImmortal, immortalTraitBurningCost } from '../../src/data/immortals';
import { troopStatsAtLevel } from '../../src/data/leveling';
import { newSave } from '../../src/meta/state/schema';
import { freshRegionalState } from '../../src/meta/state/regional';
import { migrateSave } from '../../src/meta/state/save';
import { traitUnlockCost } from '../../src/meta/data/economy';
import { unlockTrait, troopStatsOf } from '../../src/meta/systems/troopProgress';
import { buildPlayerSnapshots } from '../../src/meta/systems/battleBridge';

function fixture(id = 7580, fuel = 198) {
  const save = newSave({ now: 0, starterTroopIds: [id, 6000, 6004, 6028] });
  save.regional = { ...freshRegionalState(), burningSouls: fuel };
  save.teams = [{ name: 'test', members: [id, 6000, 6004, 6028].map(troopId => ({ kind: 'troop', troopId })), bannerKingdomId: null }];
  save.activeTeamIndex = 0;
  for (const slot of [1, 2, 3]) for (const [key, n] of Object.entries(traitUnlockCost(slot, stoneColorKeyOf(getTroopById(id)!.manaColors[0] ?? BaseColor.Brown), id).stones))
    save.materials.traitstones[key] = (save.materials.traitstones[key] ?? 0) + n;
  return save;
}
describe('Immortal traits and existing owned stats', () => {
  it.each(TROOPS.filter(isImmortal).map(t => [t.id, t] as const))('%s charges 33/66/99 regardless of translated name', (id, troop) => {
    const save = fixture(id);
    for (const slot of [1, 2, 3]) {
      const before = save.regional!.burningSouls;
      expect(immortalTraitBurningCost(troop, slot)).toBe(33 * slot);
      expect(unlockTrait(save, id, slot)).toMatchObject({ ok: true, burningSpent: 33 * slot });
      expect(save.regional!.burningSouls).toBe(before - 33 * slot);
    }
    expect(save.regional!.burningSouls).toBe(0);
    expect(Object.values(save.materials.traitstones).every(n => n === 0)).toBe(true);
  });
  it.each([1, 2, 3])('slot %s insufficient fuel or stones changes nothing', slot => {
    const save = fixture(7580, 33 * slot - 1);
    save.collection['7580']!.traits = [slot > 1, slot > 2, false];
    let before = structuredClone(save);
    expect(unlockTrait(save, 7580, slot)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(save).toEqual(before);
    save.regional!.burningSouls = 999;
    save.materials.traitstones = {};
    before = structuredClone(save);
    expect(unlockTrait(save, 7580, slot)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(save).toEqual(before);
  });
  it('requires fuel even on legacy saves without regional state and preserves already unlocked traits', () => {
    const save = fixture(); delete save.regional;
    const before = structuredClone(save);
    expect(unlockTrait(save, 7580, 1)).toMatchObject({ ok: false });
    expect(save).toEqual(before);
    save.collection['7580']!.traits = [true, true, true];
    const restored = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(restored.collection['7580']!.traits).toEqual([true, true, true]);
    const existing = structuredClone(restored);
    expect(unlockTrait(restored, 7580, 3)).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
    expect(restored).toEqual(existing);
  });
  it('never charges ordinary troops or rejected duplicate/out-of-order requests', () => {
    const normal = fixture(6000, 0);
    expect(unlockTrait(normal, 6000, 1).ok).toBe(true);
    expect(normal.regional!.burningSouls).toBe(0);
    const save = fixture(); let before = structuredClone(save);
    expect(unlockTrait(save, 7580, 2)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' }); expect(save).toEqual(before);
    expect(unlockTrait(save, 7580, 1).ok).toBe(true); before = structuredClone(save);
    expect(unlockTrait(save, 7580, 1)).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' }); expect(save).toEqual(before);
  });
  it('legacy level-8 collection loads and enters combat with level-8 stats, not level-30 stats', () => {
    const save = fixture(); save.collection['7580']!.level = 8;
    const restored = migrateSave(JSON.parse(JSON.stringify(save))), troop = getTroopById(7580)!;
    const stats = troopStatsOf(troop, restored.collection['7580']!);
    expect(stats).toEqual({ attack: 26, armor: 36, health: 14, magic: 11 });
    expect(stats).not.toEqual(troopStatsAtLevel(troop, 30));
    const built = buildPlayerSnapshots(restored); if (!built.ok) throw new Error(built.message);
    expect(built.playerTeam[0]!.stats).toEqual({ attack: 26, armor: 36, hp: 14, magic: 11 });
    expect(restored.collection['7580']!.level).toBe(8);
  });
});
