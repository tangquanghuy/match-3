import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { getTroopById } from '../../src/data/troops';
import { troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { replaceRetiredMirror } from '../../src/meta/systems/retiredMirror';
import { teamHash } from '../../src/meta/systems/invasionMirrors';

describe('graydove immutable mirror replacement candidate', () => {
  it('rebuilds a complete valid combat snapshot without unlocking a unit in the player save', () => {
    const save = newSave({ now: 100 });
    save.collection['7622'] = { copies: 0, level: 20, ascension: 0, traits: [true, false, false], locked: false };
    const old = troopToSnapshot(getTroopById(7622)!, save.collection['7622']!, 'p2-7622');
    old.stats.magic += 4;
    const source = { team: [old], defense: [{ troopId: 7622, level: 20, tier: 'minion' as const, traitCount: 1 }],
      heroLevel: 30, bannerKingdom: null, teamHash: teamHash([old]) };
    const { snapshot, power } = replaceRetiredMirror(save, source);
    expect(snapshot.team[0]).toMatchObject({ templateId: '7440', externalId: 'p2-7440',
      name: getTroopById(7440)!.name, skillId: String(getTroopById(7440)!.spell.id) });
    expect(snapshot.team[0]!.stats.magic).toBe(troopToSnapshot(getTroopById(7440)!, save.collection['7622']!, 'p2-7440').stats.magic + 4);
    expect(snapshot.defense[0]).toMatchObject({ troopId: 7440, level: 20, traitCount: 1 });
    expect(snapshot.teamHash).toBe(teamHash(snapshot.team));
    expect(power).toBeGreaterThan(0);
    expect(save.collection['7440']).toBeUndefined();
    expect(source.team[0]!.templateId).toBe('7622');
  });
  it('replaces both IDs, multiple copies, and preserves unrelated slots in their original order', () => {
    const save = newSave({ now: 100 });
    const ids = [7446, 7622, 7446, 7440];
    for (const id of ids) save.collection[String(id)] = {
      copies: 0, level: 19, ascension: 0, traits: [true, false, false], locked: false,
    };
    const team = ids.map((id, i) => troopToSnapshot(getTroopById(id)!, save.collection[String(id)]!, `p${i}-${id}`));
    const defense = ids.map(id => ({ troopId: id, level: 19, tier: 'minion' as const, traitCount: 1 }));
    const before = { team, defense, heroLevel: 1, bannerKingdom: null, teamHash: teamHash(team) };
    const { snapshot } = replaceRetiredMirror(save, before);
    expect(snapshot.team.map(unit => unit.externalId)).toEqual(['p0-7440', 'p1-7440', 'p2-7440', 'p3-7440']);
    expect(snapshot.defense.map(unit => unit.troopId)).toEqual([7440, 7440, 7440, 7440]);
    expect(snapshot.team[3]).toEqual(team[3]);
    expect(before.team[0]!.templateId).toBe('7446');
    expect(before.defense[1]!.troopId).toBe(7622);
  });
  it('rejects a stale mismatch between combat and display lineups', () => {
    const save = newSave({ now: 100 });
    const one = troopToSnapshot(getTroopById(7446)!, { copies: 0, level: 10, ascension: 0,
      traits: [false, false, false], locked: false }, 'p0-7446');
    expect(() => replaceRetiredMirror(save, { team: [one, one], defense: [{ troopId: 7446,
      level: 10, tier: 'minion', traitCount: 0 }], heroLevel: 1, bannerKingdom: null, teamHash: '' })).toThrow();
  });
  it('rejects an unexpected mirror shape', () => {
    const save = newSave({ now: 100 });
    save.collection['7622'] = { copies: 0, level: 20, ascension: 0, traits: [false, false, false], locked: false };
    expect(() => replaceRetiredMirror(save, { team: [], defense: [], heroLevel: 1, bannerKingdom: null, teamHash: '' })).toThrow();
  });
});
