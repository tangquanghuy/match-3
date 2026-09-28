// sa-P review round 2: P-R1-dual-storm.
// Native StormRedPurple (Hellstorm) is a two-colour storm: Team.storm.color2, both colours weighted in refills.
// Curated 8560 (troop:7036), 8562 (troop:7038), 8454 (weapon:1391) switch from a Red storm to Red + Purple.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { conditionMet } from '@engine/skills/effects/secondary';
import { castSpell } from '../helpers/gowCast';

describe('P-R1-dual-storm', () => {
  for (const key of ['troop:7036', 'troop:7038', 'weapon:1391']) {
    it(`${key}: Hellstorm weights Red and Purple`, () => {
      const r = castSpell({ key });
      const storm = r.f.state.teams[r.f.side].storm;
      expect(storm?.color).toBe(BaseColor.Red);
      expect(storm?.color2).toBe(BaseColor.Purple);
      const weights = (r.f.engine as unknown as { stormDropWeights(): Map<BaseColor, number> | undefined }).stormDropWeights();
      expect(weights?.get(BaseColor.Red)).toBeGreaterThan(1);
      expect(weights?.get(BaseColor.Purple)).toBe(weights?.get(BaseColor.Red));
      expect(weights?.has(BaseColor.Blue)).toBe(false);
      const ctx = { state: r.f.state, casterId: r.f.caster.id } as Parameters<typeof conditionMet>[1];
      expect(conditionMet({ kind: 'stormPresent', color: BaseColor.Purple }, ctx)).toBe(true);
    });
  }
});
