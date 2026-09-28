// sa-P review round 4: P-R5-summon-id-reuse (troop:6428 / 7602, troop:6465 / 7643).
// teamRoster.allocateCharId is monotonic (GameState.charIdHighWater): a summon never reuses the id of a unit
// removed from the roster, so castTracking.lastTarget (the dead enemy) keeps failing to resolve and every
// later ifTargetDied segment of the same cast still fires.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { createGameState } from '@engine/GameState';
import { BoardModel } from '@engine/BoardModel';
import { PlayerSide } from '@engine/types';
import { allocateCharId, resolveDefeatEvents } from '@engine/teamRoster';

type Ev = { type: string; characterId?: number };
const summonIds = (events: readonly Ev[]) => events.filter(e => e.type === 'summon').map(e => e.characterId!);

describe('P-R5-summon-id-reuse', () => {
  it('allocateCharId never reuses a removed id', () => {
    const mk = (id: number) => ({ id, defeated: false } as never);
    const state = createGameState(new BoardModel(), { player: PlayerSide.Left, characters: [mk(1)] } as never,
      { player: PlayerSide.Right, characters: [mk(10), mk(11)] } as never);
    resolveDefeatEvents(state, [{ type: 'defeat', characterId: 11 } as never]);
    expect(allocateCharId(state)).toBe(12);
    expect(allocateCharId(state)).toBe(13);
  });

  it('troop:6428: killing the highest-id enemy -> 1 / 2 / 3 Undead summons (100% / 50% / 25%), ids never 11', () => {
    const hist = [0, 0, 0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      const r = castSpell({ key: 'troop:6428', seed, allies: [], enemies: [{}, { hp: 5, maxHp: 5, armor: 0 }], target: 11 });
      expect(r.events.some((e: Ev) => e.type === 'defeat' && e.characterId === 11)).toBe(true);
      const ids = summonIds(r.events);
      expect(ids).not.toContain(11);
      expect(new Set(ids).size).toBe(ids.length);
      hist[ids.length]++;
    }
    expect(hist[0]).toBe(0);
    expect(hist[1]).toBeGreaterThan(60); // native 50%
    expect(hist[2]).toBeGreaterThan(40); // native 37.5%
    expect(hist[3]).toBeGreaterThan(10); // native 12.5%
  });

  it('troop:6465: killing the highest-id enemy still summons 3 Hyenas', () => {
    const r = castSpell({ key: 'troop:6465', allies: [], enemies: [{}, {}, {}, { hp: 1, maxHp: 1, armor: 0 }], target: 13 });
    const ids = summonIds(r.events);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(13);
  });
});
