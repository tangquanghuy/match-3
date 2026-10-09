import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { claimMail, chooseMailMythic } from '../../src/meta/systems/mailbox';
import { prepareTroopRetirement, prepareTroopRetirementWithMail, retirementCompensations } from '../../src/meta/systems/retiredTroops';

const stamp = Date.UTC(2026, 9, 9);

describe('troop retirement preparation (no live save writes)', () => {
  it('computes only the actually unlocked trait slots per owned troop', () => {
    const source = newSave({ now: stamp });
    source.collection['7622'] = { copies: 0, level: 1, ascension: 0, traits: [true, false, false], locked: false };
    source.gachaWishlist.troopIds = [7446];
    expect(retirementCompensations(source)).toEqual([{ troopId: 7622, mythicChoice: 1,
      traitstones: { 'minor:green': 22, 'major:green': 16, celestial: 4 }, unlockedTraits: 1 }]);
    source.collectionTruth = { '7446': { ...source.collection['7622']!, traits: [false, true, false] }, '7622': { ...source.collection['7622']! } };
    expect(retirementCompensations(source)).toEqual([
      { troopId: 7446, mythicChoice: 1,
        traitstones: { 'minor:yellow': 32, 'major:yellow': 24, celestial: 6 }, unlockedTraits: 1 },
      { troopId: 7622, mythicChoice: 1,
        traitstones: { 'minor:green': 22, 'major:green': 16, celestial: 4 }, unlockedTraits: 1 },
    ]);
    delete source.collectionTruth['7622'];
    expect(retirementCompensations(source).map(item => item.troopId)).toEqual([7446]);
  });

  it('drops owned cards, real collection, favorite, every affected preset and defense, without granting replacements', () => {
    const source = newSave({ now: stamp });
    source.collection['7446'] = { copies: 2, level: 20, ascension: 1, traits: [true, true, true], locked: true };
    source.collection['7622'] = { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
    source.collectionTruth = structuredClone(source.collection);
    source.favoriteTroopIds = [7446, 7622, 6000];
    source.teams = [{ name: 'test', members: [
      { kind: 'troop', troopId: 7446 }, { kind: 'troop', troopId: 7622 },
      { kind: 'troop', troopId: 6000 }, { kind: 'hero' },
    ], bannerKingdomId: null }];
    source.invasion.defenseTeam = structuredClone(source.teams[0]!);
    source.invasion.lastDefensePublish = { fingerprint: 'old', at: stamp };
    source.invasion.defensePublishPending = true;
    source.gachaWishlist.troopIds = [7446, 7622];
    source.gachaWishlist.pursuit.targetId = 7446;
    source.gachaWishlist.pursuit.progress = 5;
    const result = prepareTroopRetirement(source);
    expect(result.removedCollection).toEqual([7446, 7622]);
    expect(result.affectedTeams).toEqual([0]);
    expect(result.incompleteTeams).toEqual([0]);
    expect(result.save.collection['7446']).toBeUndefined();
    expect(result.save.collectionTruth?.['7622']).toBeUndefined();
    expect(result.save.collection['6000']).toEqual(source.collection['6000']);
    expect(result.save.favoriteTroopIds).toEqual([6000]);
    expect(result.save.teams[0]!.members).toEqual([{ kind: 'troop', troopId: 6000 }, { kind: 'hero' }]);
    expect(result.save.invasion.defenseTeam).toBeNull();
    expect(result.save.invasion.defensePublishPending).toBe(false);
    expect(result.save.invasion.lastDefensePublish).toBeNull();
    expect(result.save.gachaWishlist.troopIds).toEqual([]);
    expect(result.save.gachaWishlist.pursuit).toMatchObject({ targetId: null, progress: 5 });
    expect(source.collection['7446']).toBeDefined();
    expect(source.teams[0]!.members).toHaveLength(4);
    expect(prepareTroopRetirement(result.save).removedCollection).toEqual([]);
  });

  it('places each owned compensation in the same candidate save as the removal, with stable mail IDs', () => {
    const source = newSave({ now: stamp });
    source.collection['7446'] = { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
    source.collection['7622'] = { ...source.collection['7446'] };
    const first = prepareTroopRetirementWithMail(source, stamp);
    expect(first.save.collection['7446']).toBeUndefined();
    expect(first.save.collection['7622']).toBeUndefined();
    expect(first.save.mailbox.items.filter(m => m.id.startsWith('retirement-2026-10-09:'))).toEqual([
      expect.objectContaining({ id: 'retirement-2026-10-09:7446', mythicChoice: 1,
        currencies: { gems: 2000 }, materials: { traitstones: {} } }),
      expect.objectContaining({ id: 'retirement-2026-10-09:7622', mythicChoice: 1,
        currencies: { gems: 2000 }, materials: { traitstones: {} } }),
    ]);
    expect(first.save.mailbox.items[0]!.body).toContain('星星丽斯和菊药');
    expect(first.save.mailbox.items[0]!.body).not.toContain('星星丽思');
    expect(source.mailbox.items).toEqual([]);
    const retry = prepareTroopRetirementWithMail(first.save, stamp + 1);
    expect(retry.save.mailbox.items).toEqual(first.save.mailbox.items);
  });
  it('keeps the retirement mythic selection when its traitstones were claimed before interruption', () => {
    const original = newSave({ now: stamp });
    original.collection['7622'] = { copies: 0, level: 1, ascension: 0, traits: [true, false, false], locked: false };
    const candidate = prepareTroopRetirementWithMail(original, stamp).save;
    const mail = candidate.mailbox.items.find(item => item.id === 'retirement-2026-10-09:7622')!;
    const oldStones = candidate.materials.traitstones['minor:green'] ?? 0;
    expect(claimMail(candidate, mail.id, stamp + 1)).toEqual({ ok: true });
    expect(candidate.materials.traitstones['minor:green'] ?? 0).toBe(oldStones + 22);
    expect(candidate.currencies.gems).toBe(original.currencies.gems + 2000);
    const afterInterruption = structuredClone(candidate);
    expect(afterInterruption.mailbox.items.find(item => item.id === mail.id)?.mythicChoice).toBe(1);
    expect(claimMail(afterInterruption, mail.id, stamp + 2)).toMatchObject({ ok: false });
    expect(afterInterruption.materials.traitstones['minor:green'] ?? 0).toBe(oldStones + 22);
    expect(afterInterruption.currencies.gems).toBe(original.currencies.gems + 2000);
    expect(chooseMailMythic(afterInterruption, mail.id, 7440, stamp + 3)).toMatchObject({ ok: true, troopId: 7440 });
    expect(afterInterruption.collection['7440']).toBeDefined();
    expect(afterInterruption.mailbox.items.find(item => item.id === mail.id)?.mythicChoice).toBe(0);
  });

  it('defers any account with a pending battle before touching its save', () => {
    const source = newSave({ now: stamp });
    source.pendingBattle = { mode: 'invasion' } as typeof source.pendingBattle;
    expect(() => prepareTroopRetirement(source)).toThrow('Pending battle');
    expect(source.pendingBattle).not.toBeNull();
  });
});
