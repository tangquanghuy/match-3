import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { COMMUNITY_KINGDOM } from '../../src/data/communityTroops';
import { ARENA } from '../../src/meta/data/economy';
import { newSave } from '../../src/meta/state/schema';
import { currentDraftChoices, draftArenaDefense } from '../../src/meta/systems/arena';

describe('arena full rarity pools', () => {
  it('draws every eligible catalog troop, including unowned troops, rather than a small curated pool', () => {
    const save = newSave({ now: 0, starterTroopIds: [] });
    save.collection = {};
    const seen = ARENA.roundBands.map(() => new Set<number>());
    for (let seed = 0; seed < 4096; seed++) {
      save.arena.activeDraft = { seed, picked: [], stage: 'picking', wins: 0, losses: 0, rulesVersion: 2 };
      for (let round = 0; round < ARENA.rounds; round++) {
        const choices = currentDraftChoices(save)!;
        expect(new Set(choices.options.map(t => t.troopId)).size).toBe(3);
        for (const option of choices.options) {
          expect(option.rarityIdx).toBe(ARENA.roundBands[round]!.min);
          seen[round]!.add(option.troopId);
        }
        save.arena.activeDraft.picked.push(choices.options[0]!.troopId);
      }
    }
    for (let round = 0; round < ARENA.rounds; round++) {
      const expected = TROOPS.filter(t => t.kingdom !== COMMUNITY_KINGDOM && t.rarityIdx === ARENA.roundBands[round]!.min);
      expect([...seen[round]!].sort((a, b) => a - b)).toEqual(expected.map(t => t.id).sort((a, b) => a - b));
    }
  });
  it('AI drafts use the same eligible bands at every win tier', () => {
    const eligible = new Set(TROOPS.filter(t => t.kingdom !== COMMUNITY_KINGDOM && t.rarityIdx < 4).map(t => t.id));
    for (let wins = 0; wins < 6; wins++) {
      for (let seed = 0; seed < 30; seed++) {
        const draft = draftArenaDefense(seed, wins);
        expect(draft.troops).toHaveLength(4);
        expect(draft.rounds.every(round => round.options.length === 3 && round.options.every(id => eligible.has(id)))).toBe(true);
      }
    }
  });
});
