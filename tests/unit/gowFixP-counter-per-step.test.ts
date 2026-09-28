// sa-P fix round A: P-counter-per-step (rulings/R007 §1).
// Native has one Count* step per source; each is floored separately (floor(total x Amount / 100)) and the results summed.
// Community troops that describe one pooled count ("every 4 red or yellow gems") opt in with `pooled: true`.
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem } from '@engine/types';
import { modifierBonus, type ModifierSpec } from '@engine/skills/effects/secondary';
import { castSpell, setupCast, sixColourBoard, withCells } from '../helpers/gowCast';

const ratio3: ModifierSpec['mod'] = { kind: 'ratio', a: 3, b: 1 };

describe('P-counter-per-step: modifierBonus floors each source', () => {
  // ally armor 4 + 1 = 5 -> floor(5 x 34%) = 1; enemy armor 2 x 4 = 8 -> floor(8 x 34%) = 2; per-step 3, combined floor(13 x 34%) = 4
  const f = setupCast({ skill: '7470', cost: 15, allies: [{ armor: 1 }], caster: { armor: 4 }, enemies: [{ armor: 2 }, { armor: 2 }, { armor: 2 }, { armor: 2 }] });
  const ctx = { state: f.state, casterId: f.caster.id, rng: { next: () => 0, nextInt: () => 0 } } as unknown as Parameters<typeof modifierBonus>[1];
  const two: ModifierSpec = { mod: ratio3, sources: [{ kind: 'allyStatSum', stat: 'armor' }, { kind: 'enemyStatSum', stat: 'armor' }] };
  it('ratio: per-source floor then sum (1 + 2 = 3, not floor(13 x .34) = 4)', () => {
    expect(modifierBonus(two, ctx)).toBe(3);
  });
  it('pooled: true keeps the combined floor (community single-count wording)', () => {
    expect(modifierBonus({ ...two, pooled: true }, ctx)).toBe(4);
  });
  it('multiplier is linear: unchanged (2 x 13 = 26)', () => {
    expect(modifierBonus({ ...two, mod: { kind: 'multiplier', a: 2 } }, ctx)).toBe(26);
  });
  it('max caps the summed bonus', () => {
    expect(modifierBonus({ ...two, max: 2 }, ctx)).toBe(2);
  });
});

describe('P-counter-per-step: real casts', () => {
  it('troop:7198 spell 8785: 2 Green allies + 2 Green gems -> 1 Elemental Star (0 + 0 bonus)', () => {
    const board = withCells(
      (r, c) => colorGem([BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown][(r + c) % 4]),
      { '0,0': colorGem(BaseColor.Green), '4,4': colorGem(BaseColor.Green) });
    const r = castSpell({ skill: '8785', cost: 12, colors: [BaseColor.Green], allies: [{ colors: [BaseColor.Green] }], board });
    expect(r.summary.gems.created.elementalStar).toBe(1);
  });
  it('troop:6320 spell 7470: ally armor 5 + enemy armor 8 -> scatter pool 8 + 1 + 2 = 11 (combined floor would be 12)', () => {
    const r = castSpell({ skill: '7470', cost: 15, allies: [{ armor: 1 }], caster: { armor: 4 }, enemies: [{ armor: 2 }, { armor: 2 }, { armor: 2 }, { armor: 2 }], board: sixColourBoard });
    const loss = r.f.enemies.reduce((a, e) => a + (r.f.snap.get(e.id)!.hp - e.hp), 0);
    expect(loss).toBe(11);
  });
});
